import {head} from '@vercel/blob';
import {getSession,requireSameOrigin} from '@/lib/session';
import {signedRead} from '@/lib/storage';
import {loadDesktop} from '@/lib/desktop';
export const maxDuration=300;
export async function POST(request:Request){
  try{
    requireSameOrigin(request);const session=await getSession();const body=await request.json();
    if(!/^[a-f0-9]{32}$/.test(body.dialogId)||!Array.isArray(body.files)||!body.files.length||body.files.length>1000)throw Error('Invalid file selection.');
    const desktop=await loadDesktop(session);
    if(!desktop?.url||desktop.status!=='ready')throw Error('Wait for DDALab to open.');
    let total=0;
    const files=[];
    for(const file of body.files){
      if(typeof file.pathname!=='string'||!file.pathname.startsWith(`sessions/${session}/uploads/native/`)||file.pathname.includes('..'))throw Error('Invalid upload destination.');
      if(typeof file.name!=='string'||file.name.length>500||file.name.includes('\0')||file.name.startsWith('/')||file.name.replaceAll('\\','/').split('/').includes('..'))throw Error('Invalid file name.');
      if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>512*1024**2)throw Error('The file is too large.');
      total+=file.size;if(total>1024**3)throw Error('Select fewer files.');
      if((await head(file.pathname)).size!==file.size)throw Error('Wait for the upload to finish.');
      files.push({name:file.name,size:file.size,url:await signedRead(file.pathname)});
    }
    const response=await fetch(`${desktop.url}/api/open-files`,{method:'POST',headers:{Authorization:`Bearer ${desktop.token}`,'Content-Type':'application/json'},body:JSON.stringify({dialogId:body.dialogId,files}),signal:AbortSignal.timeout(240000)});
    if(!response.ok)throw Error('Cannot open the selected files.');
    return Response.json({ok:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Cannot open the selected files.'},{status:400});}
}
