import {getSession,requireSameOrigin} from '@/lib/session';
import {loadJob,signedRead} from '@/lib/storage';
import {loadDesktop} from '@/lib/desktop';
export const maxDuration=300;
export async function POST(request:Request){
  try{
    requireSameOrigin(request);const session=await getSession();const body=await request.json();
    const job=await loadJob(session,body.jobId);const desktop=await loadDesktop(session);
    if(job.status!=='complete')throw Error('Wait for data preparation.');
    if(!desktop?.url||desktop.status!=='ready')throw Error('Wait for DDALab to open.');
    const files=await Promise.all(job.artifacts.filter(file=>file.kind==='prepared'||file.kind==='counts').map(async file=>({name:file.name,kind:file.kind,size:file.size,url:await signedRead(file.pathname)})));
    const response=await fetch(`${desktop.url}/api/import`,{method:'POST',headers:{Authorization:`Bearer ${desktop.token}`,'Content-Type':'application/json'},body:JSON.stringify({jobId:job.id,files}),signal:AbortSignal.timeout(240000)});
    if(!response.ok)throw Error('Cannot open the prepared files.');
    return Response.json({ok:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Cannot open the prepared files.'},{status:400});}
}
