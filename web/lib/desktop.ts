import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Sandbox} from '@vercel/sandbox';
import {get, put} from '@vercel/blob';
import {readJson, signedRead, writeJson} from './storage';

export const DESKTOP_ENVIRONMENT = 'system/desktop/environment-v1.json';
export const DESKTOP_ROOT = '/vercel/sandbox/ddalab';
export type DesktopSession = {
  id: string; session: string; status: 'starting'|'ready'|'stopped'|'failed';
  stage: string; createdAt: string; expiresAt: string; parentOrigin: string;
  width: number; height: number; token: string; sandboxName?: string; url?: string;
  phase?: 'setup'|'program'; commandId?: string; checkpointHash?: string; restoreState?:boolean; error?: string;
};
export type PublicDesktop = Pick<DesktopSession,'id'|'status'|'stage'|'expiresAt'|'error'> & {viewerUrl?: string; viewerToken?: string};
const currentPath = (session:string) => `sessions/${session}/desktop/current.json`;
const checkpointPath = (session:string) => `sessions/${session}/desktop/state.tar.gz`;
export const loadDesktop = (session:string) => readJson<DesktopSession>(currentPath(session));
export const saveDesktop = (desktop:DesktopSession) => writeJson(currentPath(desktop.session),desktop);
export const publicDesktop = (desktop:DesktopSession):PublicDesktop => ({id:desktop.id,status:desktop.status,stage:desktop.stage,expiresAt:desktop.expiresAt,error:desktop.error,viewerUrl:desktop.status==='ready'?desktop.url:undefined,viewerToken:desktop.status==='ready'?desktop.token:undefined});
export async function desktopSandbox(desktop:DesktopSession) {
  if(!desktop.sandboxName)throw Error('DDALab did not start.');
  return Sandbox.get({name:desktop.sandboxName,resume:false});
}
export async function unpackDesktop(sandbox:Sandbox) {
  const directory = await sandbox.runCommand({cmd:'mkdir',args:['-p',DESKTOP_ROOT]});
  if(directory.exitCode!==0)throw Error('Cannot create the program folder.');
  await sandbox.writeFiles([{path:`${DESKTOP_ROOT}/source.tar.gz`,content:await readFile(join(process.cwd(),'public','desktop-source.tar.gz'))}]);
  const extract = await sandbox.runCommand({cmd:'tar',args:['-xzf',`${DESKTOP_ROOT}/source.tar.gz`,'-C',DESKTOP_ROOT]});
  if(extract.exitCode!==0)throw Error('Cannot open the program files.');
}
export async function startDesktop(desktop:DesktopSession,sandbox:Sandbox) {
  desktop.sandboxName=sandbox.name;
  await saveDesktop(desktop);
  await unpackDesktop(sandbox);
  const previous=desktop.restoreState&&!desktop.checkpointHash?await get(checkpointPath(desktop.session),{access:'private',useCache:false}):null;
  // Signed URLs grant access to this user's saved state only.
  const restoreUrl=desktop.checkpointHash||previous?.statusCode===200?await signedRead(checkpointPath(desktop.session),15*60*1000):undefined;
  const config={token:desktop.token,parentOrigin:desktop.parentOrigin,width:desktop.width,height:desktop.height,restoreUrl};
  await sandbox.writeFiles([{path:`${DESKTOP_ROOT}/session-config.json`,content:Buffer.from(JSON.stringify(config))}]);
  const restore=await sandbox.runCommand({cmd:`${DESKTOP_ROOT}/.venv/bin/python`,args:[`${DESKTOP_ROOT}/restore_state.py`]});
  if(restore.exitCode!==0)throw Error('Cannot open the saved files.');
  const command=await sandbox.runCommand({cmd:'bash',args:[`${DESKTOP_ROOT}/start.sh`],cwd:DESKTOP_ROOT,detached:true});
  desktop.commandId=command.cmdId;desktop.sandboxName=sandbox.name;desktop.url=sandbox.domain(8080);desktop.phase='program';
  desktop.stage='Open DDALab.';
  await saveDesktop(desktop);
}
export async function checkpointDesktop(desktop:DesktopSession) {
  if(!desktop.url)return;
  const response=await fetch(`${desktop.url}/api/checkpoint`,{headers:{Authorization:`Bearer ${desktop.token}`,...desktop.checkpointHash?{'If-None-Match':desktop.checkpointHash}:{}},signal:AbortSignal.timeout(120000)});
  if(response.status===304)return;
  if(!response.ok||!response.body)throw Error('Cannot save the program state.');
  await put(checkpointPath(desktop.session),response.body,{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/gzip',cacheControlMaxAge:60});
  desktop.checkpointHash=response.headers.get('X-DDA-State')||undefined;
}
export async function closeDesktop(desktop:DesktopSession) {
  if(!desktop.sandboxName)return;
  const sandbox=await desktopSandbox(desktop);
  // An expired environment restores from its last completed checkpoint.
  if(!['pending','running','snapshotting'].includes(sandbox.status))return;
  if(desktop.status==='ready')await checkpointDesktop(desktop);
  else{try{await checkpointDesktop(desktop);}catch{}}
  await sandbox.stop();
}
export function newDesktop(session:string,parentOrigin:string,width:number,height:number):DesktopSession {
  const now=Date.now();
  return {id:randomBytes(16).toString('hex'),session,parentOrigin,width:Math.max(1600,Math.min(2560,Math.round(width)||1600)),height:Math.max(1000,Math.min(1600,Math.round(height)||1000)),token:randomBytes(32).toString('hex'),status:'starting',stage:'Start DDALab.',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+39*60*1000).toISOString()};
}
