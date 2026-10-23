import { getSession } from '@/lib/session';
import { loadJob, signedRead } from '@/lib/storage';
import { getDownloadUrl } from '@vercel/blob';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const job = await loadJob(await getSession(), url.searchParams.get('job') || '');
    const artifact = job.artifacts.find(a => a.name === url.searchParams.get('file'));
    if (!artifact) throw new Error('Output not found.');
    return Response.redirect(getDownloadUrl(await signedRead(artifact.pathname, 5 * 60 * 1000)));
  } catch (e) {return Response.json({error: (e as Error).message}, {status: 404});}
}
