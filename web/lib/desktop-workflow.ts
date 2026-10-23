import {sleep} from 'workflow';
import {Sandbox} from '@vercel/sandbox';
import {readJson,writeJson} from './storage';
import {DESKTOP_ENVIRONMENT,DESKTOP_ROOT,loadDesktop,saveDesktop,startDesktop,unpackDesktop,desktopSandbox,checkpointDesktop,closeDesktop} from './desktop';

export async function provisionDesktop(session:string,id:string) {
  'use step';
  const desktop=await loadDesktop(session);
  if(!desktop||desktop.id!==id||desktop.phase)return;
  const cached=await readJson<{snapshotId:string}>(DESKTOP_ENVIRONMENT);
  if(cached){
    const sandbox=await Sandbox.create({source:{type:'snapshot',snapshotId:cached.snapshotId},mounts:{},persistent:false,ports:[8080],timeout:40*60*1000,resources:{vcpus:2}});
    await startDesktop(desktop,sandbox);return;
  }
  const sandbox=await Sandbox.create({image:'dda-ubuntu:24.04',persistent:false,ports:[8080],timeout:40*60*1000,resources:{vcpus:4}});
  desktop.sandboxName=sandbox.name;await saveDesktop(desktop);
  await unpackDesktop(sandbox);
  const command=await sandbox.runCommand({cmd:'bash',args:[`${DESKTOP_ROOT}/setup.sh`],cwd:DESKTOP_ROOT,detached:true});
  desktop.phase='setup';desktop.commandId=command.cmdId;desktop.stage='Install DDALab.';await saveDesktop(desktop);
}
export async function advanceDesktop(session:string,id:string):Promise<'starting'|'ready'|'done'> {
  'use step';
  const desktop=await loadDesktop(session);
  if(!desktop||desktop.id!==id||desktop.status==='stopped'||desktop.status==='failed')return 'done';
  if(Date.now()>Date.parse(desktop.expiresAt)){
    await closeDesktop(desktop);desktop.status='stopped';desktop.stage='Session stopped.';await saveDesktop(desktop);return 'done';
  }
  if(desktop.phase==='setup'){
    const sandbox=await desktopSandbox(desktop);
    const file=await sandbox.readFileToBuffer({path:`${DESKTOP_ROOT}/setup-status.json`});
    const state=file?JSON.parse(file.toString()):{};
    if(state.error)throw Error(state.error);
    if(!state.ready)return 'starting';
    const snapshot=await sandbox.snapshot({expiration:0});
    await writeJson(DESKTOP_ENVIRONMENT,{snapshotId:snapshot.snapshotId});
    const ready=await Sandbox.create({source:{type:'snapshot',snapshotId:snapshot.snapshotId},mounts:{},persistent:false,ports:[8080],timeout:40*60*1000,resources:{vcpus:2}});
    await startDesktop(desktop,ready);return 'starting';
  }
  if(!desktop.url)return 'starting';
  let health:{ready:boolean;busy:boolean;lastActivity?:number};
  try{
    const response=await fetch(`${desktop.url}/api/health`,{headers:{Authorization:`Bearer ${desktop.token}`},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Cannot connect to DDALab.');
    health=await response.json();if(!health.ready)return 'starting';
  }catch{
    if(Date.now()-Date.parse(desktop.createdAt)>8*60*1000)throw Error('Cannot connect to DDALab.');
    return 'starting';
  }
  if(!health.busy&&health.lastActivity&&Date.now()/1000-health.lastActivity>10*60){
    await closeDesktop(desktop);desktop.status='stopped';desktop.stage='Session stopped.';await saveDesktop(desktop);return 'done';
  }
  const before=JSON.stringify(desktop);
  desktop.status='ready';desktop.stage='Ready.';
  // Keep the program available during a temporary storage failure.
  // The next workflow step retries the save. Closing also retries it.
  try{await checkpointDesktop(desktop);}catch(error){console.error('Desktop checkpoint failed',error instanceof Error?error.message:'Storage error');}
  if(JSON.stringify(desktop)!==before)await saveDesktop(desktop);
  return 'ready';
}
export async function failDesktop(session:string,id:string,message:string){
  'use step';
  const desktop=await loadDesktop(session);if(!desktop||desktop.id!==id)return;
  const wasReady=desktop.status==='ready';
  desktop.status='failed';desktop.error=message;desktop.stage='Cannot open DDALab.';await saveDesktop(desktop);
  if(!wasReady)await closeDesktop(desktop);
}
export async function desktopWorkflow(session:string,id:string){
  'use workflow';
  try{await provisionDesktop(session,id);for(;;){const state=await advanceDesktop(session,id);if(state==='done')break;await sleep(state==='starting'?'10s':'60s');}}
  catch(error){await failDesktop(session,id,error instanceof Error?error.message:'Cannot open DDALab.');}
}
