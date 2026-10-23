import { sleep } from 'workflow';
import { Sandbox } from '@vercel/sandbox';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { put } from '@vercel/blob';
import { loadJob, readJson, saveJob, signedRead, writeJson } from './storage';
import { AnalysisResult, Artifact, Job } from './types';
import version from './runner-version.json';

const ROOT = '/vercel/sandbox/dda';
const SNAPSHOT_KEY = `system/runtime/${version.fingerprint}.json`;
async function sandboxFor(job: Job) {
  if (!job.sandboxId) throw new Error('Processing environment was not created.');
  return Sandbox.get({name: job.sandboxId});
}
async function sandboxJson<T>(sandbox: Sandbox, path: string): Promise<T | null> {
  const data = await sandbox.readFileToBuffer({path});
  return data ? JSON.parse(data.toString('utf8')) as T : null;
}
async function startRun(job: Job, sandbox: Sandbox) {
  const inputs = await Promise.all(job.inputs.map(async f => ({...f, url: await signedRead(f.pathname)})));
  await sandbox.writeFiles([{path: `${ROOT}/job-config.json`, content: Buffer.from(JSON.stringify({id: job.id, config: job.config, inputs}))}]);
  const command = await sandbox.runCommand({cmd: 'bash', args: [`${ROOT}/run.sh`], cwd: ROOT, detached: true});
  job.commandId = command.cmdId;
  job.phase = 'run'; job.status = job.inputs.every(f => f.role === 'prepared') ? 'analyzing' : 'preparing';
  job.stage = job.status === 'analyzing' ? 'Loading prepared trials' : 'Checking your recording';
  job.progress = 10;
  await saveJob(job);
}
export async function provision(session: string, id: string) {
  'use step';
  const job = await loadJob(session, id);
  if ((job.sandboxId && job.phase) || job.status === 'complete' || job.status === 'failed') return;
  if (job.sandboxId) {try {await (await sandboxFor(job)).stop();} catch {} job.sandboxId = undefined;}
  job.status = 'initializing'; job.stage = 'Starting the analysis environment'; job.progress = 2;
  await saveJob(job);
  const cached = await readJson<{snapshotId: string}>(SNAPSHOT_KEY);
  let sandbox: Sandbox | undefined;
  if (cached) {
    try {sandbox = await Sandbox.create({source: {type: 'snapshot', snapshotId: cached.snapshotId}, persistent: false, timeout: 40 * 60 * 1000, resources: {vcpus: 4}});} catch { /* Expired snapshots are rebuilt. */ }
  }
  if (sandbox) {
    job.sandboxId = sandbox.name;
    await startRun(job, sandbox);
    return;
  }
  sandbox = await Sandbox.create({image: 'dda-ubuntu:24.04', persistent: false, timeout: 40 * 60 * 1000, resources: {vcpus: 4}});
  job.sandboxId = sandbox.name;
  await saveJob(job);
  // The official Ubuntu image starts as root and does not include sudo yet.
  const update = await sandbox.runCommand({cmd: 'apt-get', args: ['update', '-qq']});
  if (update.exitCode !== 0) throw new Error('Could not initialize the Ubuntu runtime package index.');
  const tools = await sandbox.runCommand({cmd: 'env', args: ['DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', '--no-install-recommends', 'sudo', 'python3', 'python3.12', 'python3.12-venv', 'curl', 'ca-certificates']});
  if (tools.exitCode !== 0) throw new Error('Could not install the initial analysis runtime tools.');
  const directory = await sandbox.runCommand({cmd: 'mkdir', args: ['-p', ROOT]});
  if (directory.exitCode !== 0) throw new Error('Could not create the analysis workspace.');
  const archive = await readFile(join(process.cwd(), 'public', 'runner-source.tar.gz'));
  await sandbox.writeFiles([{path: `${ROOT}/runner.tar.gz`, content: archive}]);
  const extract = await sandbox.runCommand({cmd: 'tar', args: ['-xzf', `${ROOT}/runner.tar.gz`, '-C', ROOT]});
  if (extract.exitCode !== 0) throw new Error('Could not unpack the analysis environment.');
  const command = await sandbox.runCommand({cmd: 'bash', args: [`${ROOT}/setup.sh`], cwd: ROOT, detached: true});
  job.commandId = command.cmdId; job.phase = 'setup';
  job.stage = 'Preparing MATLAB Runtime for the first recording';
  await saveJob(job);
}
type RunnerStatus = {state: 'running' | 'complete' | 'failed'; stage: string; progress: number; error?: string; artifacts?: {name: string; kind: Artifact['kind']}[]};
export async function advance(session: string, id: string): Promise<boolean> {
  'use step';
  const job = await loadJob(session, id);
  if (job.status === 'complete' || job.status === 'failed') return true;
  if (Date.now() - Date.parse(job.createdAt) > 80 * 60 * 1000) throw new Error('This recording exceeded the processing time limit. Try a shorter recording.');
  const sandbox = await sandboxFor(job);
  if (job.phase === 'setup') {
    const state = await sandboxJson<{ready?: boolean; error?: string; stage?: string}>(sandbox, `${ROOT}/runtime-status.json`);
    if (state?.error) throw new Error(state.error);
    if (!state?.ready) {
      job.stage = state?.stage || 'Preparing MATLAB Runtime for the first recording';
      if (job.commandId) {
        const command = await sandbox.getCommand(job.commandId);
        if (command.exitCode !== null && command.exitCode !== 0) throw new Error('Analysis environment setup failed. Please retry the recording.');
      }
      await saveJob(job); return false;
    }
    job.stage = 'Saving the reusable analysis environment'; job.progress = 7;
    await saveJob(job);
    const snapshot = await sandbox.snapshot();
    await writeJson(SNAPSHOT_KEY, {snapshotId: snapshot.snapshotId, createdAt: new Date().toISOString()});
    const ready = await Sandbox.create({source: {type: 'snapshot', snapshotId: snapshot.snapshotId}, persistent: false, timeout: 40 * 60 * 1000, resources: {vcpus: 4}});
    job.sandboxId = ready.name;
    await startRun(job, ready);
    return false;
  }
  const state = await sandboxJson<RunnerStatus>(sandbox, `${ROOT}/work/status.json`);
  if (!state) return false;
  if (state.state === 'failed') throw new Error(state.error || 'The recording could not be processed.');
  job.stage = state.stage; job.progress = Math.max(10, Math.min(99, state.progress));
  job.status = state.progress >= 65 ? 'analyzing' : 'preparing';
  if (state.state !== 'complete') {await saveJob(job); return false;}
  const artifacts: Artifact[] = [];
  for (const file of state.artifacts || []) {
    if (!/^[A-Za-z0-9_.-]{1,180}$/.test(file.name)) throw new Error('An output filename was invalid.');
    const bytes = await sandbox.readFileToBuffer({path: `${ROOT}/work/output/${file.name}`});
    if (!bytes) throw new Error(`A completed output is missing: ${file.name}`);
    const pathname = `sessions/${session}/jobs/${id}/outputs/${file.name}`;
    await put(pathname, bytes, {access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: file.name.endsWith('.json') ? 'application/json' : 'text/csv'});
    artifacts.push({...file, pathname, size: bytes.length});
  }
  const result = await sandboxJson<AnalysisResult>(sandbox, `${ROOT}/work/output/result.json`);
  if (!result) throw new Error('The completed analysis result is missing.');
  job.result = result; job.artifacts = artifacts; job.status = 'complete'; job.stage = 'Ready to explore'; job.progress = 100;
  await saveJob(job);
  try {await sandbox.stop();} catch { /* Results are already saved; expiration also stops the environment. */ }
  return true;
}
export async function recordFailure(session: string, id: string, message: string) {
  'use step';
  const job = await loadJob(session, id);
  if (job.status === 'complete') return;
  job.status = 'failed'; job.stage = 'Recording needs attention'; job.error = message.slice(0, 1600);
  await saveJob(job);
  if (job.sandboxId) {try {await (await sandboxFor(job)).stop();} catch {}}
}
export async function analysisWorkflow(session: string, id: string) {
  'use workflow';
  try {
    await provision(session, id);
    while (!(await advance(session, id))) await sleep('10s');
  } catch (error) {
    await recordFailure(session, id, error instanceof Error ? error.message : String(error));
  }
}
