import { get, put, list, issueSignedToken, presignUrl } from '@vercel/blob';
import {getCache} from '@vercel/functions';
import {createHash} from 'node:crypto';
import {createMetadataStore} from './metadata-cache';
import { Job, PublicJob } from './types';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const metadata=createMetadataStore(getCache({
  namespace:`dda:${process.env.VERCEL_PROJECT_ID||'dda-analysis-deployed'}:${process.env.VERCEL_ENV||'development'}:${digest(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN||'local').slice(0,16)}:metadata-v1`,
  keyHashFunction:digest,
}));
export const jobPath = (session: string, id: string) => `sessions/${session}/jobs/${id}/job.json`;
export async function readJson<T>(pathname: string): Promise<T | null> {
  return metadata.read<T|null>(pathname,async()=>{
    const blob = await get(pathname, {access: 'private', useCache: false});
    if (!blob || blob.statusCode !== 200) return null;
    return await new Response(blob.stream).json() as T;
  });
}
export async function writeJson(pathname: string, data: unknown) {
  await metadata.write(pathname,data,()=>put(pathname, JSON.stringify(data), {access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60}));
}
const jobsKey=(session:string)=>`index:sessions/${session}/jobs`;
function jobSummary({result:_result,...summary}:Job):Job{return summary;}
export async function saveJob(job: Job) {
  job.updatedAt = new Date().toISOString();
  await writeJson(jobPath(job.session, job.id), job);
  const previous=await metadata.peek<Job[]>(jobsKey(job.session));
  if(previous)await metadata.remember(jobsKey(job.session),[jobSummary(job),...previous.filter(item=>item.id!==job.id)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),300);
}
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
  return metadata.read(jobsKey(session),async()=>{
    const files = await list({prefix: `sessions/${session}/jobs/`, limit: 1000});
    const jobs = await Promise.all(files.blobs.filter(f => f.pathname.endsWith('/job.json')).map(f => readJson<Job>(f.pathname)));
    return jobs.filter((j): j is Job => !!j&&j.session===session).map(jobSummary).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  },300);
}
export async function signedRead(pathname: string, lifetimeMs = 60 * 60 * 1000) {
  const validUntil = Date.now() + lifetimeMs;
  const token = await issueSignedToken({pathname, operations: ['get'], validUntil});
  // Uploaded inputs and completed outputs have unique, immutable paths.
  // Mutable session checkpoints must always use their latest contents.
  return (await presignUrl(token, {operation: 'get', pathname, access: 'private', validUntil, useCache: !pathname.endsWith('/desktop/state.tar.gz')})).presignedUrl;
}
