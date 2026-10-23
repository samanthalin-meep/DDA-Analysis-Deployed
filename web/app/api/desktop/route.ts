import {start} from 'workflow/api';
import {getSession,requireSameOrigin,requestOrigin} from '@/lib/session';
import {closeDesktop,loadDesktop,newDesktop,publicDesktop,saveDesktop} from '@/lib/desktop';
import {desktopWorkflow} from '@/lib/desktop-workflow';
export const maxDuration=300;
export async function GET(){
  let session:string;
  try{session=await getSession();}catch{return Response.json({error:'Session expired.'},{status:401});}
  try{const desktop=await loadDesktop(session);return Response.json({desktop:desktop?publicDesktop(desktop):null},{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'Storage is unavailable.'},{status:503});}
}
export async function POST(request:Request){
  try{
    requireSameOrigin(request);const session=await getSession(true);const body=await request.json();
    const previous=await loadDesktop(session);
    if(previous&&!body.restart&&['starting','ready'].includes(previous.status)&&Date.parse(previous.expiresAt)>Date.now()+30000)return Response.json({desktop:publicDesktop(previous)});
    if(previous)await closeDesktop(previous);
    const desktop=newDesktop(session,requestOrigin(request),Number(body.width),Number(body.height));
    desktop.checkpointHash=previous?.checkpointHash;desktop.restoreState=!!previous;
    await saveDesktop(desktop);await start(desktopWorkflow,[session,desktop.id]);
    return Response.json({desktop:publicDesktop(desktop)},{status:202});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Cannot open DDALab.'},{status:400});}
}
