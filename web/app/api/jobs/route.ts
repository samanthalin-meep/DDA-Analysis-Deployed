import { randomUUID } from 'node:crypto';
import { start } from 'workflow/api';
import { head } from '@vercel/blob';
import { getSession, requireSameOrigin } from '@/lib/session';
import { listJobs, loadJob, publicJob, saveJob } from '@/lib/storage';
import { validateConfig, validateInputs } from '@/lib/validation';
import { analysisWorkflow } from '@/lib/workflow';
import { InputFile, Job } from '@/lib/types';
export const maxDuration = 300;
export async function GET() {
  try {return Response.json({jobs: (await listJobs(await getSession())).map(publicJob).map(({result: _result, ...summary}) => summary)}, {headers: {'Cache-Control': 'no-store'}});}
  catch (e) {return Response.json({error: (e as Error).message}, {status: 400});}
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getSession();
    const body = await request.json();
    const config = validateConfig(body.config);
    const previous = await listJobs(session);
    if (previous.filter(j => !['complete', 'failed'].includes(j.status)).length >= 2) throw new Error('Two recordings are already processing. Wait for one to finish.');
    let inputs: InputFile[];
    if (body.sourceJobId) {
      const source = await loadJob(session, body.sourceJobId);
      if (source.status !== 'complete') throw new Error('Wait for preparation to finish before running another analysis.');
      inputs = source.artifacts.filter(a => a.kind === 'prepared').map(a => ({name: a.name, pathname: a.pathname, size: a.size, role: 'prepared'}));
      if (!inputs.length) throw new Error('Prepared trials are unavailable. Upload the recording again.');
      if (JSON.stringify(config.electrodes) !== JSON.stringify(source.config.electrodes) || config.averageElectrodes !== source.config.averageElectrodes) throw new Error('Upload the recording again to change the prepared electrodes.');
    } else {
      inputs = body.inputs;
      validateInputs(inputs, session, inputs?.length === 1 && inputs[0]?.role === 'prepared');
    }
    for (const input of inputs) {
      const stored = await head(input.pathname);
      if (stored.size !== input.size) throw new Error(`${input.name}: upload has not finished. Try again.`);
    }
    const now = new Date().toISOString();
    if(body.preparationOnly!==undefined&&typeof body.preparationOnly!=='boolean')throw Error('Invalid preparation mode.');
    const job: Job = {id: randomUUID(), session, config, inputs, sourceJobId: body.sourceJobId, preparationOnly:body.preparationOnly===true, status: 'queued', stage: 'Recording queued', progress: 0, createdAt: now, updatedAt: now, artifacts: []};
    await saveJob(job);
    try {await start(analysisWorkflow, [session, job.id]);}
    catch (error) {job.status = 'failed'; job.error = 'Could not start the background job. Please retry.'; await saveJob(job); throw error;}
    return Response.json({job: publicJob(job)}, {status: 202});
  } catch (e) {return Response.json({error: (e as Error).message}, {status: 400});}
}
