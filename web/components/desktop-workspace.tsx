'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {upload} from '@vercel/blob/client';
import type {PublicDesktop} from '@/lib/desktop';
import {DEFAULT_CONFIG,InputFile,PublicJob} from '@/lib/types';

type Inputs={edf?:File;log?:File;conditions?:File};
type FileDialog={id:string;folder:boolean;multiple:boolean;filters:string};
const PENDING='ddalab-preparation';
function errorText(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  return /Vercel Blob|store is blocked/i.test(message)?'Storage is unavailable.':message;
}
async function api<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(path,options);const body=await response.json();
  if(!response.ok)throw Error(body.error||'Cannot complete the operation.');
  return body;
}
export default function DesktopWorkspace(){
  const [desktop,setDesktop]=useState<PublicDesktop|null>(null);
  const [connected,setConnected]=useState(false);
  const [error,setError]=useState('');
  const [modal,setModal]=useState(false);
  const [fileDialog,setFileDialog]=useState<FileDialog|null>(null);
  const [sendingFile,setSendingFile]=useState(false);
  const [files,setFiles]=useState<Inputs>({});
  const [recordingId,setRecordingId]=useState('');
  const [electrodes,setElectrodes]=useState('E129');
  const [average,setAverage]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [progress,setProgress]=useState(0);
  const [job,setJob]=useState<PublicJob|null>(null);
  const [pendingId,setPendingId]=useState<string|null>(null);
  const [status,setStatus]=useState('Start DDALab.');
  const frame=useRef<HTMLIFrameElement>(null);
  const uploadDialogRef=useRef<HTMLElement>(null);
  const fileDialogRef=useRef<HTMLElement>(null);
  const prefix=useRef('');
  const opening=useRef(false);
  const importing=useRef(false);
  const lastActivity=useRef(Date.now());
  const disconnected=useRef(false);
  const initial=useRef<Promise<{desktop:PublicDesktop;pending:string|null}>|null>(null);
  const initialize=useCallback(async(restart=false)=>{
    const session=await api<{uploadPrefix:string}>('/api/session',{method:'POST'});
    prefix.current=session.uploadPrefix;
    const response=await api<{desktop:PublicDesktop}>('/api/desktop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({restart,width:window.innerWidth,height:window.innerHeight})});
    return{desktop:response.desktop,pending:window.localStorage.getItem(PENDING)};
  },[]);
  const reopen=useCallback(async()=>{
    if(opening.current)return;opening.current=true;setError('');setConnected(false);setStatus('Start DDALab.');
    try{const response=await initialize(true);setDesktop(response.desktop);setPendingId(response.pending);}
    catch(error){setError(errorText(error));}
    finally{opening.current=false;}
  },[initialize]);
  useEffect(()=>{
    let active=true;
    initial.current??=initialize();
    initial.current.then(response=>{if(active){setDesktop(response.desktop);setPendingId(response.pending);}}).catch(error=>{if(active)setError(errorText(error));});
    return()=>{active=false;};
  },[initialize]);
  useEffect(()=>{
    if(!desktop||desktop.status!=='starting')return;
    let active=true;
    const timer=setInterval(async()=>{
      if(document.visibilityState==='hidden')return;
      try{
        const response=await api<{desktop:PublicDesktop|null}>('/api/desktop');
        if(!active||!response.desktop)return;
        setDesktop(response.desktop);
        if(response.desktop.status==='stopped')await reopen();
      }catch(error){if(active){setError(errorText(error));clearInterval(timer);}}
    },10000);
    return()=>{active=false;clearInterval(timer);};
  },[desktop?.id,desktop?.status,reopen]);
  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{
      if(!desktop?.viewerUrl||event.origin!==new URL(desktop.viewerUrl).origin||event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='ddalab-viewer-ready')frame.current?.contentWindow?.postMessage({type:'ddalab-auth',token:desktop.viewerToken,holdActive:!!pendingId||submitting||sendingFile},event.origin);
      if(event.data?.type==='ddalab-ready'){setConnected(true);disconnected.current=false;setError('');}
      if(event.data?.type==='ddalab-state'&&typeof event.data.lastActivity==='number')lastActivity.current=event.data.lastActivity*1000;
      if(event.data?.type==='ddalab-upload-recording'){setModal(true);setError('');}
      if(event.data?.type==='ddalab-file-dialog'){setFileDialog(event.data.dialog);setSendingFile(false);setError('');}
      if(event.data?.type==='ddalab-files-complete'){setFileDialog(current=>current?.id===event.data.id?null:current);setSendingFile(false);}
      if(event.data?.type==='ddalab-files-error'){setSendingFile(false);setError(event.data.error||'Cannot upload the file.');}
      if(event.data?.type==='ddalab-disconnected'){
        setConnected(false);disconnected.current=true;
        if(document.visibilityState==='visible'&&Date.now()-lastActivity.current<10*60*1000){disconnected.current=false;void reopen();}
        else setError('Session stopped. Select Reconnect.');
      }
    };
    window.addEventListener('message',onMessage);return()=>window.removeEventListener('message',onMessage);
  },[desktop?.viewerUrl,desktop?.viewerToken,pendingId,submitting,sendingFile,reopen]);
  useEffect(()=>{
    if(desktop?.viewerUrl)frame.current?.contentWindow?.postMessage({type:'ddalab-hold',active:!!pendingId||submitting||sendingFile},new URL(desktop.viewerUrl).origin);
  },[desktop?.viewerUrl,pendingId,submitting,sendingFile]);
  useEffect(()=>{
    const resume=()=>{if(document.visibilityState==='visible'&&disconnected.current){disconnected.current=false;void reopen();}};
    document.addEventListener('visibilitychange',resume);return()=>document.removeEventListener('visibilitychange',resume);
  },[reopen]);
  useEffect(()=>{
    const dialog=fileDialog?fileDialogRef.current:modal?uploadDialogRef.current:null;
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
  },[modal,fileDialog?.id]);
  useEffect(()=>{
    if(!pendingId)return;
    let active=true;
    let failures=0;
    const poll=async()=>{
      if(document.visibilityState==='hidden')return;
      try{
        const response=await api<{job:PublicJob}>(`/api/jobs/${pendingId}`);
        if(!active)return;
        failures=0;
        setJob(response.job);
        if(response.job.status==='complete')clearInterval(timer);
        if(response.job.status==='failed'){setError(response.job.error||'Cannot prepare the data.');window.localStorage.removeItem(PENDING);setPendingId(null);}
      }catch(error){if(active){setError(errorText(error));if(++failures>=3){clearInterval(timer);setPendingId(null);}}}
    };
    const timer=setInterval(poll,15000);void poll();return()=>{active=false;clearInterval(timer);};
  },[pendingId]);
  useEffect(()=>{
    if(job?.status!=='complete'||desktop?.status!=='ready'||importing.current)return;
    importing.current=true;setStatus('Open prepared files.');
    api('/api/desktop/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:job.id})})
      .then(()=>{window.localStorage.removeItem(PENDING);setPendingId(null);setJob(null);setFiles({});setModal(false);setStatus('Ready.');})
      .catch(error=>setError(errorText(error))).finally(()=>{importing.current=false;});
  },[job?.status,desktop?.status]);
  async function choose(role:keyof Inputs,file?:File){
    if(!file)return;
    const extension=role==='edf'?'.edf':role==='log'?'.txt':'.csv';
    const limit=role==='edf'?512*1024**2:10*1024**2;
    setError('');
    if(!file.name.toLowerCase().endsWith(extension)||!file.size||file.size>limit){setError(`Select a valid ${extension.slice(1).toUpperCase()} file.`);return;}
    if(role==='conditions'){
      const columns=(await file.slice(0,65536).text()).replace(/^\uFEFF/,'').split(/\r?\n/,1)[0].split(',').map(value=>value.trim());
      if(!columns.includes('sec_time')||!columns.includes('label')){setError('The CSV file must have sec_time and label columns.');return;}
    }
    setFiles(current=>({...current,[role]:file}));
    if(role==='edf'&&!recordingId)setRecordingId(file.name.replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_]/g,'_').slice(0,64));
  }
  async function prepare(){
    setError('');setSubmitting(true);setProgress(0);setStatus('Upload files.');
    try{
      const selected=electrodes.toUpperCase().split(/[,\s]+/).filter(Boolean);
      if(!/^[A-Za-z0-9_]{1,64}$/.test(recordingId))throw Error('Use letters, numbers, and underscores for the recording ID.');
      if(!selected.length||selected.some(value=>!/^E([1-9]|[1-9]\d|1[01]\d|12\d)$/.test(value)))throw Error('Select electrodes from E1 to E129.');
      const roles=['edf','log','conditions'] as const;
      const total=roles.reduce((sum,role)=>sum+(files[role]?.size||0),0);let completed=0;
      const inputs:InputFile[]=[];
      for(const role of roles){
        const file=files[role];if(!file)throw Error('Select all three files.');
        const name=file.name.replace(/[^A-Za-z0-9_.-]/g,'_');
        const result=await upload(`${prefix.current}${crypto.randomUUID()}/${name}`,file,{access:'private',handleUploadUrl:'/api/uploads',multipart:file.size>5*1024**2,onUploadProgress:event=>setProgress(Math.round(100*(completed+file.size*event.percentage/100)/total))});
        inputs.push({role,name:file.name,pathname:result.pathname,size:file.size});completed+=file.size;
      }
      const response=await api<{job:PublicJob}>('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({inputs,preparationOnly:true,config:{...DEFAULT_CONFIG,recordingId,electrodes:[...new Set(selected)],averageElectrodes:average}})});
      setJob(response.job);setPendingId(response.job.id);window.localStorage.setItem(PENDING,response.job.id);
      setStatus('Prepare data.');
    }catch(error){setError(errorText(error));}
    finally{setSubmitting(false);}
  }
  const processing=!!pendingId;
  const viewer=desktop?.status==='ready'&&desktop.viewerUrl;
  async function sendFiles(selected:FileList|null){
    if(!fileDialog||!selected?.length||!desktop?.viewerUrl)return;
    setSendingFile(true);setError('');
    try{
      const files=[];
      if(selected.length>1000||Array.from(selected).reduce((total,file)=>total+file.size,0)>1024**3)throw Error('Select fewer files.');
      for(const file of Array.from(selected)){
        if(!file.size||file.size>512*1024**2)throw Error('The file is too large.');
        const name=file.name.replace(/[^A-Za-z0-9_.-]/g,'_');
        const result=await upload(`${prefix.current}native/${crypto.randomUUID()}/${name}`,file,{access:'private',handleUploadUrl:'/api/uploads',multipart:file.size>5*1024**2});
        files.push({name:file.webkitRelativePath||file.name,pathname:result.pathname,size:file.size});
      }
      await api('/api/desktop/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dialogId:fileDialog.id,files})});
      setFileDialog(null);
    }catch(error){setError(errorText(error));}
    finally{setSendingFile(false);}
  }
  function cancelFile(){
    if(fileDialog&&desktop?.viewerUrl)frame.current?.contentWindow?.postMessage({type:'ddalab-files',id:fileDialog.id,cancel:true},new URL(desktop.viewerUrl).origin);
    setFileDialog(null);setSendingFile(false);setError('');
  }
  return <main className="desktop-shell">
    {viewer?<iframe key={desktop.id} ref={frame} title="DDALAB Pooled" className="desktop-frame" src={desktop.viewerUrl} allow="clipboard-write; fullscreen" onLoad={()=>frame.current?.contentWindow?.postMessage({type:'ddalab-auth',token:desktop.viewerToken,holdActive:!!pendingId||submitting||sendingFile},new URL(desktop.viewerUrl!).origin)}/>:<section className="program-start"><header><strong>DDALAB Pooled</strong></header><div role="status"><span className="program-spinner"/>{desktop?.stage||status}</div></section>}
    {(error||desktop?.status==='failed')&&!modal&&!fileDialog&&<div className="connection-message" role="alert"><span>{error||desktop?.error||'Cannot open DDALab.'}</span><button onClick={reopen}>Reconnect</button></div>}
    {processing&&!modal&&<button className="preparation-status" onClick={()=>setModal(true)}>Prepare data · {Math.round(job?.progress||0)}%</button>}
    {modal&&<div className="modal-backdrop"><section ref={uploadDialogRef} className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title"><header><h1 id="upload-title">Upload recording</h1><button aria-label="Close" className="close-button" onClick={()=>setModal(false)}>×</button></header>
      {error&&<p className="error-text" role="alert">{error}</p>}
      {processing||submitting?<div className="preparation-progress"><p>{submitting?'Upload files.':job?.status==='complete'?'Open prepared files.':'Prepare data.'}</p><progress max="100" value={submitting?progress:job?.progress||0}/><output>{Math.round(submitting?progress:job?.progress||0)}%</output></div>:<>
      <div className="file-inputs">{([['edf','EDF file','.edf'],['log','TXT file','.txt'],['conditions','CSV file','.csv']] as const).map(([role,label,accept])=><label key={role}><span>{label}</span><input type="file" accept={accept} onChange={event=>void choose(role,event.target.files?.[0])}/></label>)}</div>
      <label className="field"><span>Recording ID</span><input value={recordingId} onChange={event=>setRecordingId(event.target.value)} maxLength={64}/></label>
      <label className="field"><span>Electrodes</span><input value={electrodes} onChange={event=>setElectrodes(event.target.value)}/></label>
      <label className="check-field"><input type="checkbox" checked={average} onChange={event=>setAverage(event.target.checked)}/>Average electrodes</label>
      <footer><button className="secondary" onClick={()=>setModal(false)}>Cancel</button><button disabled={!files.edf||!files.log||!files.conditions} onClick={()=>void prepare()}>Prepare data</button></footer></>}
    </section></div>}
    {fileDialog&&<div className="modal-backdrop"><section ref={fileDialogRef} className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="file-title"><header><h1 id="file-title">{fileDialog.folder?'Open folder':'Open file'}</h1><button aria-label="Close" className="close-button" onClick={cancelFile}>×</button></header>
      {error&&<p role="alert" className="error-text">{error}</p>}
      {sendingFile?<p role="status">Upload file.</p>:<label className="file-inputs"><span>{fileDialog.folder?'Select folder':'Select file'}</span><input key={fileDialog.id} type="file" aria-label={fileDialog.folder?'Select folder':'Select file'} multiple={fileDialog.multiple||fileDialog.folder} accept={fileDialog.folder?'':[...fileDialog.filters.matchAll(/\*\.([a-zA-Z0-9]+)/g)].map(match=>'.'+match[1]).join(',')} ref={node=>{if(node&&fileDialog.folder)node.setAttribute('webkitdirectory','');}} onChange={event=>sendFiles(event.target.files)}/></label>}
      <footer><button className="secondary" onClick={cancelFile}>Cancel</button></footer>
    </section></div>}
  </main>;
}
