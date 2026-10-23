import { get, put, list, issueSignedToken, presignUrl } from '@vercel/blob';
import { Job, PublicJob } from './types';
export const jobPath = (session: string, id: string) => `sessions/${session}/jobs/${id}/job.json`;
export async function readJson<T>(pathname: string): Promise<T | null> {
  const blob = await get(pathname, {access: 'private', useCache: false});
  if (!blob || blob.statusCode !== 200) return null;
  return await new Response(blob.stream).json() as T;
}
export async function writeJson(pathname: string, data: unknown) {
  await put(pathname, JSON.stringify(data), {access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60});
}
export async function saveJob(job: Job) {job.updatedAt = new Date().toISOString(); await writeJson(jobPath(job.session, job.id), job);}
export async function loadJob(session: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Recording not found.');
  const job = await readJson<Job>(jobPath(session, id));
  if (!job || job.session !== session) throw new Error('Recording not found.');
  return job;
}
export function publicJob(job: Job): PublicJob {
  const {session: _session, sandboxId: _sandbox, commandId: _command, phase: _phase, inputs: _inputs, ...rest} = job;
  return rest;
}
export async function listJobs(session: string) {
  const files = await list({prefix: `sessions/${session}/jobs/`, limit: 1000});
  const jobs = await Promise.all(files.blobs.filter(f => f.pathname.endsWith('/job.json')).map(f => readJson<Job>(f.pathname)));
  return jobs.filter((j): j is Job => !!j).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export async function signedRead(pathname: string, lifetimeMs = 60 * 60 * 1000) {
  const validUntil = Date.now() + lifetimeMs;
  const token = await issueSignedToken({pathname, operations: ['get'], validUntil});
  return (await presignUrl(token, {operation: 'get', pathname, access: 'private', validUntil, useCache: false})).presignedUrl;
}
