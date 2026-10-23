import { getSession } from '@/lib/session';
import { loadJob, publicJob } from '@/lib/storage';
export const maxDuration = 60;
export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  try {const {id} = await context.params; return Response.json({job: publicJob(await loadJob(await getSession(), id))}, {headers: {'Cache-Control': 'no-store'}});}
  catch (e) {return Response.json({error: (e as Error).message}, {status: 404});}
}
