'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, CircleCheck, CircleHelp, FileChartColumn, FileText, FolderOpen, Code2, LoaderCircle, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, UploadCloud, Waves, X } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AnalysisConfig, COLORS, CONDITIONS, DEFAULT_CONFIG, InputFile, PublicJob } from '@/lib/types';
import { validateConfig } from '@/lib/validation';

type Files = {edf?: File; log?: File; conditions?: File; prepared?: File};
const fmtSize = (n: number) => n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const busyJob = (j?: PublicJob | null) => !!j && !['complete', 'failed'].includes(j.status);
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options); const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The request could not be completed.');
  return body as T;
}
function UploadCard({role, number, title, subtitle, accept, file, onFile, onRemove}: {role: keyof Files; number: string; title: string; subtitle: string; accept: string; file?: File; onFile: (file: File) => void; onRemove: () => void}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return <div className={`upload-card ${file ? 'has-file' : ''} ${over ? 'drag-over' : ''}`} onDragOver={e => {e.preventDefault(); setOver(true);}} onDragLeave={() => setOver(false)} onDrop={e => {e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if(f) onFile(f);}}>
    <div className="upload-card-top"><span className="file-number">{number}</span><span className="extension">{accept.toUpperCase()}</span></div>
    <button className="upload-select" onClick={() => input.current?.click()} aria-label={`Choose ${title}`}>
      <span className={`file-icon ${role}`} >{role === 'edf' || role === 'prepared' ? <FileChartColumn size={25}/> : <FileText size={25}/>}</span>
      <strong>{title}</strong><span className="upload-subtitle">{subtitle}</span>
      {file ? <span className="selected-file"><CircleCheck size={15}/><span>{file.name}</span><small>{fmtSize(file.size)}</small></span> : <span className="browse"><UploadCloud size={15}/> Choose file <span>or drop it here</span></span>}
    </button>
    {file && <button className="remove-file icon-button" aria-label={`Remove ${title}`} onClick={onRemove}><X size={15}/></button>}
    <input ref={input} type="file" accept={accept} hidden onChange={e => {if(e.target.files?.[0]) onFile(e.target.files[0]); e.target.value='';}}/>
  </div>;
}
function NumberField({label, value, onChange, hint, min = 1, step = 1}: {label: string; value: number; onChange: (n: number) => void; hint?: string; min?: number; step?: number}) {
  return <label className="field"><span>{label}</span><input type="number" value={value} min={min} step={step} onChange={e => onChange(Number(e.target.value))}/>{hint && <small>{hint}</small>}</label>;
}
export default function Workspace() {
  const [files, setFiles] = useState<Files>({});
  const [config, setConfig] = useState<AnalysisConfig>({...DEFAULT_CONFIG});
  const [mode, setMode] = useState<'raw' | 'prepared'>('raw');
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [stage, setStage] = useState<'upload' | 'settings' | 'results'>('upload');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');
  const [search, setSearch] = useState('');
  const [electrodePicker, setElectrodePicker] = useState(false);
  const [expert, setExpert] = useState(false);
  const [help, setHelp] = useState(false);
  const [inputInfo, setInputInfo] = useState('');
  const [signalIndex, setSignalIndex] = useState(0);
  const [activeConditions, setActiveConditions] = useState<string[]>([...CONDITIONS]);
  const [resultTab, setResultTab] = useState<'analysis' | 'waveform' | 'counts'>('analysis');
  const chartRef = useRef<HTMLDivElement>(null);
  const prefix = useRef('');
  const update = <K extends keyof AnalysisConfig>(key: K, value: AnalysisConfig[K]) => setConfig(c => ({...c, [key]:value}));
  const refreshJobs = useCallback(async () => {
    const body = await api<{jobs: PublicJob[]}>('/api/jobs'); setJobs(body.jobs); return body.jobs;
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const session = await api<{ready: boolean; uploadPrefix: string}>('/api/session', {method:'POST'});
        prefix.current = session.uploadPrefix;
        if(active) {setReady(true); const list = await refreshJobs(); const processing = list.find(busyJob); if(processing) {setJob(processing); setStage('results');}}
      } catch { /* Health checks expose setup status without replacing the workspace. */ }
    })();
    return () => {active=false;};
  }, [refreshJobs]);
  useEffect(() => {
    if(!job || !busyJob(job)) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const body = await api<{job: PublicJob}>(`/api/jobs/${job.id}`);
        if(!active) return;
        setJob(body.job); setJobs(list => [body.job, ...list.filter(j => j.id !== body.job.id)]);
        if(body.job.status === 'complete') {setSignalIndex(0); setActiveConditions(body.job.config.conditions);}
      } catch (e) {if(active) setError((e as Error).message);}
    }, 4000);
    return () => {active=false; clearInterval(timer);};
  }, [job?.id, job?.status]);
  async function selectFile(role: keyof Files, file: File) {
    setError('');
    const extension = role === 'edf' ? '.edf' : role === 'log' ? '.txt' : '.csv';
    const limit = role === 'edf' ? 512 * 1024 ** 2 : role === 'prepared' ? 64 * 1024 ** 2 : 10 * 1024 ** 2;
    if(!file.name.toLowerCase().endsWith(extension)) {setError(`${file.name}: choose a ${extension} file for this slot.`); return;}
    if(!file.size || file.size > limit) {setError(`${file.name}: choose a non-empty file smaller than ${fmtSize(limit)}.`); return;}
    setFiles(current => ({...current, [role]:file}));
    if((role === 'edf' || role === 'prepared') && !config.recordingId) update('recordingId', file.name.replace(/\.[^.]+$/, '').replace(/^DDA_/, '').replace(/[^A-Za-z0-9_]/g, '_').slice(0,64));
    try {
      if(role === 'conditions') {
        const text = (await file.text()).replace(/^\uFEFF/, '');
        const lines = text.trim().split(/\r?\n/);
        if(!lines[0].split(',').map(v => v.trim()).includes('sec_time') || !lines[0].split(',').map(v => v.trim()).includes('label')) throw new Error('The conditions CSV needs sec_time and label columns.');
        setInputInfo(`${lines.length - 1} labelled events found. File matching and event timing will be checked during preparation.`);
      }
      if(role === 'edf') {
        const bytes = await file.slice(0,256).arrayBuffer();
        const header = new TextDecoder('ascii').decode(bytes);
        if(header.length < 256 || !/^\s*0\s*$/.test(header.slice(0,8))) throw new Error('This file does not have a supported EDF header.');
        const channels = Number(header.slice(252,256).trim());
        if(channels !== 130) throw new Error(`This recipe expects 130 EDF channels (E1–E129 and Status); this file reports ${channels}.`);
      }
      if(role === 'prepared') {
        const header = (await file.slice(0,1024 ** 2).text()).replace(/^\uFEFF/,'').split(/\r?\n/,1)[0].split(',');
        const trials = header.slice(1).map(name => /^(E\d+|AVG_E\d+(?:_E\d+)*)__([A-Za-z][A-Za-z0-9_-]*)__trial_/.exec(name));
        if(header[0]?.trim().toLowerCase() !== 'time' || !trials.length || trials.some(t=>!t)) throw new Error('Choose a condition-labelled trial CSV exported by DDA_prep.');
        const signal = trials[0]![1];
        const conditions = CONDITIONS.filter(c => trials.some(t=>t?.[2]===c));
        setConfig(c => ({...c, electrodes:signal.replace(/^AVG_/,'').split('_'), averageElectrodes:signal.startsWith('AVG_'), conditions:[...conditions]}));
        setInputInfo(`${trials.length} prepared trials found. Preparation will be skipped.`);
      }
    } catch(e) {setError((e as Error).message); setFiles(current => ({...current,[role]:undefined}));}
  }
  const filesComplete = mode === 'prepared' ? !!files.prepared : !!(files.edf && files.log && files.conditions);
  function continueToSettings() {if(filesComplete) {setError(''); setStage('settings');}}
  async function submit(sourceJobId?: string) {
    setError('');
    try {validateConfig(config);} catch(e) {setError((e as Error).message); return;}
    if(!ready) {setError('The processing service is not connected yet. Please refresh in a moment.'); return;}
    setSubmitting(true); setUploadProgress(0);
    try {
      let inputs: InputFile[] = [];
      if(!sourceJobId) {
        const roles: (keyof Files)[] = mode === 'raw' ? ['edf','log','conditions'] : ['prepared'];
        const total = roles.reduce((n,r) => n + (files[r]?.size || 0), 0);
        let completed = 0;
        for(const role of roles) {
          const file = files[role]; if(!file) throw new Error('Choose all required files.');
          setUploadLabel(`Uploading ${file.name}`);
          const safeName = file.name.replace(/[^A-Za-z0-9_.-]/g, '_');
          const blob = await upload(`${prefix.current}${crypto.randomUUID()}/${safeName}`, file, {access:'private', handleUploadUrl:'/api/uploads', multipart: file.size > 5 * 1024 ** 2, onUploadProgress: e => setUploadProgress(Math.round(100 * (completed + file.size * e.percentage / 100) / total))});
          inputs.push({name:file.name, pathname:blob.pathname, size:file.size, role}); completed += file.size;
        }
      }
      setUploadLabel('Starting your recording');
      const body = await api<{job: PublicJob}>('/api/jobs', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({config, inputs, sourceJobId})});
      setJob(body.job); setJobs(list => [body.job,...list]); setStage('results'); setSignalIndex(0); setActiveConditions(config.conditions);
    } catch(e) {setError((e as Error).message);} finally {setSubmitting(false);}
  }
  function newRecording() {setFiles({}); setJob(null); setStage('upload'); setConfig({...DEFAULT_CONFIG}); setError(''); setInputInfo(''); setSignalIndex(0);}
  async function openJob(j: PublicJob) {setError('');try {const body=await api<{job: PublicJob}>(`/api/jobs/${j.id}`);setJob(body.job);setConfig(body.job.config);setStage('results');setSignalIndex(0);setActiveConditions(body.job.config.conditions);} catch(e) {setError((e as Error).message);}}
  function download(name: string) {if(job) window.open(`/api/download?job=${encodeURIComponent(job.id)}&file=${encodeURIComponent(name)}`, '_blank', 'noopener,noreferrer');}
  async function saveChart() {
    const svg = chartRef.current?.querySelector('svg'); if(!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const image = new Image(); const url = URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));
    image.onload = () => {const canvas=document.createElement('canvas');canvas.width=image.width*2;canvas.height=image.height*2;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(2,2);ctx.drawImage(image,0,0);const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`${job?.config.recordingId || 'DDA'}_pooled_CT.png`;a.click();} URL.revokeObjectURL(url);}; image.onerror=()=>{URL.revokeObjectURL(url);setError('Could not export the plot. The analysis CSV is available below.');}; image.src=url;
  }
  const signal = job?.result?.signals[signalIndex];
  const chartData = signal?.times.map((time,i) => Object.fromEntries([['time',time], ...signal.groups.map(g => [g.condition,g.a1[i]])])) || [];
  const processing = busyJob(job);
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="DDA Analysis home"><span className="brand-mark"><Activity size={25}/></span><span>DDA<span className="brand-light">Analysis</span></span></a>
      <div className="sidebar-rule"/>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <button className="nav-item active" onClick={() => stage === 'results' && !job ? setStage('upload') : undefined}><Waves size={18}/> EEG analysis <span className="nav-dot"/></button>
      <button className="new-recording" onClick={newRecording}><Plus size={17}/> New recording</button>
      <div className="recent-title">RECENT RECORDINGS <span>{jobs.length || ''}</span></div>
      <div className="recent-list">{jobs.length ? jobs.slice(0,12).map(j => <button key={j.id} className={`recent-job ${job?.id===j.id?'selected':''}`} onClick={()=>openJob(j)}><span className={`recent-status ${j.status}`}>{busyJob(j)?<LoaderCircle size={15} className="spin"/>:<FileChartColumn size={16}/>}</span><span><strong>{j.config.recordingId}</strong><small>{j.status==='complete'?'Analysis complete':j.status==='failed'?'Needs attention':'Processing recording'}</small></span></button>) : <div className="no-recordings"><FolderOpen size={23}/><span>Your recordings will<br/>appear here.</span></div>}</div>
      <div className="sidebar-bottom"><button onClick={()=>setHelp(true)}><CircleHelp size={17}/> Workflow guide <ChevronRight size={15}/></button><a href="https://github.com/samanthalin-meep/DDA-Analysis-Deployed" target="_blank" rel="noreferrer"><Code2 size={17}/> View project <span>↗</span></a><div className="sidebar-footer"><span className="status-dot"/> Pooled cross-trial analysis</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <ChevronRight size={14}/><span>EEG analysis</span></div><div className="topbar-right"><span className="private-badge"><ShieldCheck size={14}/> Private uploads</span><span className="avatar">DA</span></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow">DELAY DIFFERENTIAL ANALYSIS</div><h1>{stage==='results'&&job?job.config.recordingId:'From recording to insight.'}</h1><p>{stage==='results'&&job?'Your prepared trials and pooled analysis, together in one workspace.':'Prepare EEG recordings and explore pooled DDA in one continuous workflow.'}</p></div><span className="recipe-tag"><span/> HydroCel · 129 electrodes</span></div>
        <div className="stepper" aria-label="Analysis workflow">{[['upload','Upload recording','1'],['settings','Choose settings','2'],['results','Explore results','3']].map(([id,label,num],i)=><div key={id} className={`step ${stage===id?'current':(['upload','settings','results'].indexOf(stage)>i?'done':'')}`}><span className="step-circle">{['upload','settings','results'].indexOf(stage)>i?<Check size={14}/>:num}</span><span>{label}</span>{i<2&&<span className="step-line"/>}</div>)}</div>
        {error&&<div className="error-banner" role="alert"><CircleHelp size={18}/><span>{error}</span><button className="icon-button" onClick={()=>setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
        {stage==='upload'&&<div className="content-grid"><section className="panel upload-panel"><div className="section-heading"><div className="section-icon"><UploadCloud size={20}/></div><div><h2>Add your recording</h2><p>Choose the three matching files from your data folder.</p></div></div><div className="mode-tabs"><button className={mode==='raw'?'selected':''} onClick={()=>{setMode('raw');setError('');}}>Recording files <span>EDF + TXT + CSV</span></button><button className={mode==='prepared'?'selected':''} onClick={()=>{setMode('prepared');setError('');}}>Already prepared <span>DDA CSV</span></button></div>
          <div className={`upload-grid ${mode==='prepared'?'single':''}`}>{mode==='raw'?<><UploadCard role="edf" number="01" title="EEG recording" subtitle="The continuous voltage recording" accept=".edf" file={files.edf} onFile={f=>selectFile('edf',f)} onRemove={()=>setFiles(f=>({...f,edf:undefined}))}/><UploadCard role="log" number="02" title="Acquisition log" subtitle="The EEG event timing log" accept=".txt" file={files.log} onFile={f=>selectFile('log',f)} onRemove={()=>setFiles(f=>({...f,log:undefined}))}/><UploadCard role="conditions" number="03" title="Condition labels" subtitle="Event times and condition labels" accept=".csv" file={files.conditions} onFile={f=>selectFile('conditions',f)} onRemove={()=>setFiles(f=>({...f,conditions:undefined}))}/></>:<UploadCard role="prepared" number="01" title="Prepared trial data" subtitle="A condition-labelled CSV exported by DDA_prep" accept=".csv" file={files.prepared} onFile={f=>selectFile('prepared',f)} onRemove={()=>setFiles(f=>({...f,prepared:undefined}))}/>}</div>
          <div className="upload-note"><CircleCheck size={16}/><span>{inputInfo||'Filenames can vary. We’ll match the files and verify event timing before processing.'}</span></div><div className="panel-actions"><span className="selection-count">{mode==='raw'?`${Object.entries(files).filter(([k,v])=>k!=='prepared'&&v).length} of 3 files selected`:files.prepared?'1 file selected':'No file selected'}</span><button className="button primary" disabled={!filesComplete} onClick={continueToSettings}>Continue to settings <ArrowRight size={16}/></button></div></section>
          <aside className="right-column"><section className="panel recipe-panel"><div className="mini-label"><SlidersHorizontal size={15}/> YOUR PREPARATION RECIPE</div><h3>A consistent starting point.</h3><p>The same EEG preparation used by the desktop workflow.</p><dl><div><dt>Reference</dt><dd>E57 / E100</dd></div><div><dt>Band-pass</dt><dd>0.1–30 Hz</dd></div><div><dt>Line-noise stop</dt><dd>57–63 Hz</dd></div><div><dt>Output rate</dt><dd>250 Hz</dd></div><div><dt>Epoch</dt><dd>−200 to +800 ms</dd></div><div><dt>Baseline</dt><dd>−200 to 0 ms</dd></div></dl><div className="recipe-foot"><ShieldCheck size={16}/><span>1000 Hz HydroCel recordings<br/>E1–E129 + Status channel</span></div></section><div className="small-help"><Waves size={19}/><div><strong>Individual trials stay individual.</strong><p>Selected electrodes can be averaged within each trial. DDA then pools trials separately for each condition.</p></div></div></aside>
        </div>}
        {stage==='settings'&&<div className="content-grid"><section className="panel settings-panel"><div className="section-heading"><div className="section-icon"><Settings2 size={20}/></div><div><h2>Make it your analysis</h2><p>Choose the signals and conditions you want to explore.</p></div></div><label className="field recording-field"><span>Recording ID</span><input value={config.recordingId} maxLength={64} placeholder="e.g. I1_R3" onChange={e=>update('recordingId',e.target.value)}/><small>Used to label your recording and exported files.</small></label>
          {mode==='raw'&&<div className="settings-section"><div className="subheading"><h3>Electrodes</h3><span>{config.electrodes.length} selected</span></div><div className="electrode-selection">{config.electrodes.slice(0,12).map(e=><span className="electrode-chip" key={e}>{e}<button onClick={()=>update('electrodes',config.electrodes.filter(x=>x!==e))} aria-label={`Deselect ${e}`}><X size={12}/></button></span>)}{config.electrodes.length>12&&<span className="more-selected">+{config.electrodes.length-12} more</span>}<button className="button secondary small" onClick={()=>setElectrodePicker(!electrodePicker)}><Plus size={14}/> Choose electrodes</button></div>{electrodePicker&&<div className="electrode-picker"><div className="picker-tools"><label><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find an electrode"/></label><button onClick={()=>update('electrodes',Array.from({length:129},(_,i)=>`E${i+1}`))}>Select all</button><button onClick={()=>update('electrodes',[])}>Clear</button></div><div className="electrode-grid">{Array.from({length:129},(_,i)=>`E${i+1}`).filter(e=>e.toLowerCase().includes(search.toLowerCase())).map(e=><button key={e} className={config.electrodes.includes(e)?'selected':''} aria-pressed={config.electrodes.includes(e)} onClick={()=>update('electrodes',config.electrodes.includes(e)?config.electrodes.filter(x=>x!==e):[...config.electrodes,e])}>{e}</button>)}</div></div>}{config.electrodes.length>1&&<div className="radio-options"><label><input type="radio" name="average" checked={config.averageElectrodes} onChange={()=>update('averageElectrodes',true)}/><span><strong>Average selected electrodes</strong><small>One equal-weight signal within each trial</small></span></label><label><input type="radio" name="average" checked={!config.averageElectrodes} onChange={()=>update('averageElectrodes',false)}/><span><strong>Keep electrodes separate</strong><small>A separate analysis for each electrode</small></span></label></div>}</div>}
          <div className="settings-section"><div className="subheading"><h3>Conditions</h3><button onClick={()=>update('conditions',config.conditions.length===6?[]:[...CONDITIONS])}>{config.conditions.length===6?'Clear selection':'Select all'}</button></div><div className="condition-checks">{CONDITIONS.map((c,i)=><label key={c} className={config.conditions.includes(c)?'checked':''}><input type="checkbox" checked={config.conditions.includes(c)} onChange={()=>update('conditions',config.conditions.includes(c)?config.conditions.filter(x=>x!==c):CONDITIONS.filter(x=>config.conditions.includes(x)||x===c))}/><span className="condition-dot" style={{background:COLORS[i]}}/>{c}</label>)}</div><p className="field-note">Each condition needs at least two trials after artifact rejection.</p></div>
          <button className="advanced-toggle" onClick={()=>setExpert(!expert)}><SlidersHorizontal size={16}/><span>DDA analysis settings</span><span className="advanced-summary">50-sample windows · pooled CT</span><ChevronDown size={16} className={expert?'rotate':''}/></button>{expert&&<AnalysisSettings config={config} update={update}/>}
          <div className="panel-actions"><button className="button text" onClick={()=>setStage('upload')} disabled={submitting}><ArrowLeft size={16}/> Files</button><button className="button primary" disabled={submitting||!config.electrodes.length||!config.conditions.length} onClick={()=>submit()}>{submitting?<LoaderCircle className="spin" size={16}/>:<Activity size={17}/>} {submitting?'Starting recording':'Prepare & analyze'} {!submitting&&<ArrowRight size={16}/>}</button></div>{submitting&&<div className="upload-progress"><div><span>{uploadLabel}</span><strong>{uploadProgress}%</strong></div><progress max="100" value={uploadProgress}/></div>}
        </section><aside className="right-column"><section className="panel summary-panel"><div className="mini-label">READY FOR PREPARATION</div><h3>{config.recordingId||'Your recording'}</h3><div className="summary-files">{Object.entries(files).filter(([k,v])=>v&&(mode==='raw'?k!=='prepared':k==='prepared')).map(([k,f])=><div key={k}><FileText size={17}/><span>{f?.name}<small>{fmtSize(f?.size||0)}</small></span><CircleCheck size={15}/></div>)}</div><div className="summary-plan"><div><span>01</span><p>Validate files and event timing</p></div><div><span>02</span><p>Prepare and check EEG trials</p></div><div><span>03</span><p>Fit pooled DDA by condition</p></div><div><span>04</span><p>Open your analysis automatically</p></div></div></section><p className="quiet-note">The first recording also prepares the shared analysis environment. Future recordings reuse it.</p></aside></div>}
        {stage==='results'&&job&&<>
          {processing&&<section className="panel processing-panel"><div className="processing-orbit"><Activity size={31}/></div><div className="processing-label">{job.status==='initializing'?'PREPARING YOUR WORKSPACE':'YOUR RECORDING IS PROCESSING'}</div><h2>{job.stage}</h2><p>{job.status==='initializing'?'The first run installs the analysis tools. This environment is reused for future recordings.':'We’ll bring the prepared recording into your workspace automatically.'}</p><div className="processing-progress"><progress max="100" value={job.progress}/><span>{Math.round(job.progress)}%</span></div><div className="processing-stages">{['Upload','Preparation','Pooled DDA','Results'].map((s,i)=><span key={s} className={job.progress>=[0,12,65,100][i]?'reached':''}>{job.progress>[10,64,98,100][i]?<CircleCheck size={16}/>:<span className="tiny-circle"/>}{s}</span>)}</div><span className="quiet-note">You can leave this page. Your recording continues in the background.</span></section>}
          {job.status==='failed'&&<section className="panel failure-panel"><CircleHelp size={33}/><h2>This recording needs attention</h2><p>{job.error||'Processing could not be completed.'}</p><div><button className="button secondary" onClick={()=>{setStage('settings');setError('');}}>Review settings</button><button className="button primary" onClick={newRecording}>New recording <ArrowRight size={16}/></button></div></section>}
          {job.status==='complete'&&signal&&<><div className="result-summary"><div><CircleCheck size={17}/><strong>Analysis complete</strong><span>{signal.sampleRate} Hz · {signal.samples} samples / trial</span></div><button className="button secondary small" onClick={()=>setExpert(!expert)}><SlidersHorizontal size={15}/> Analysis settings</button></div>{expert&&<section className="panel rerun-settings"><AnalysisSettings config={config} update={update}/><button className="button primary" disabled={submitting} onClick={()=>submit(job.sourceJobId||job.id)}>{submitting?<LoaderCircle size={16} className="spin"/>:<Activity size={16}/>} Run analysis with these settings</button></section>}
          <div className="stats-grid"><div><span>Signal</span><strong>{signal.signal.startsWith('AVG_')?`${job.config.electrodes.length} electrodes averaged`:signal.signal}</strong></div><div><span>Retained trials</span><strong>{signal.trialCount}<small>across selected conditions</small></strong></div><div><span>Conditions</span><strong>{signal.groups.length}<small>separate pooled fits</small></strong></div><div><span>Analysis windows</span><strong>{signal.times.length}<small>{job.config.windowLength} samples · step {job.config.windowStep}</small></strong></div></div>
          <section className="panel result-panel"><div className="result-toolbar"><div className="result-tabs"><button className={resultTab==='analysis'?'selected':''} onClick={()=>setResultTab('analysis')}>Pooled DDA</button><button className={resultTab==='waveform'?'selected':''} onClick={()=>setResultTab('waveform')}>Prepared waveform</button><button className={resultTab==='counts'?'selected':''} onClick={()=>setResultTab('counts')}>Trial counts</button></div><div className="result-tools">{job.result!.signals.length>1&&<select aria-label="Select signal" value={signalIndex} onChange={e=>setSignalIndex(Number(e.target.value))}>{job.result!.signals.map((s,i)=><option key={s.signal} value={i}>{s.signal}</option>)}</select>}<button className="icon-button" title="Download plot PNG" aria-label="Download plot PNG" onClick={saveChart} disabled={resultTab==='counts'}><ArrowDownToLine size={17}/></button></div></div>
          {resultTab!=='counts'?<><div className="chart-heading"><div><h3>{resultTab==='analysis'?'Pooled cross-trial coefficient':'Mean retained waveform'}</h3><p>{resultTab==='analysis'?'One shared fit across the retained trials of each condition.':'Mean voltage across retained trials, after EEG preparation.'}</p></div><span className="chart-unit">{resultTab==='analysis'?'a₁':'µV'}</span></div><div className="chart" ref={chartRef}><ResponsiveContainer width="100%" height={350}><LineChart data={resultTab==='analysis'?chartData:signal.waveform} margin={{top:15,right:22,left:2,bottom:28}}><CartesianGrid stroke="#e9eef0" vertical={false}/><XAxis dataKey="time" type="number" domain={['dataMin','dataMax']} tickFormatter={x=>`${Math.round(x*1000)}`} tick={{fontSize:11,fill:'#81919b'}} axisLine={{stroke:'#dfe7e9'}} tickLine={false} label={{value:'Time relative to event (ms)',position:'bottom',offset:12,fill:'#71818b',fontSize:12}}/><YAxis tick={{fontSize:11,fill:'#81919b'}} tickLine={false} axisLine={false} width={55} tickFormatter={v=>Number(v).toPrecision(2)}/><Tooltip labelFormatter={v=>`${(Number(v)*1000).toFixed(0)} ms`} formatter={(v)=>Number(v).toPrecision(5)} contentStyle={{borderRadius:10,borderColor:'#e2e8eb',fontSize:12}}/><ReferenceLine x={0} stroke="#9aabb2" strokeDasharray="4 4" label={{value:'Event',position:'insideTopRight',fontSize:10,fill:'#81919b'}}/>{resultTab==='analysis'?signal.groups.filter(g=>activeConditions.includes(g.condition)).map(g=><Line key={g.condition} dataKey={g.condition} stroke={COLORS[CONDITIONS.indexOf(g.condition as typeof CONDITIONS[number])%6]||COLORS[0]} strokeWidth={2.25} dot={false} activeDot={{r:4}} isAnimationActive={false}/>):<Line dataKey="value" name="Mean voltage" stroke={COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer></div>{resultTab==='analysis'&&<div className="chart-legend">{signal.groups.map(g=><button key={g.condition} className={activeConditions.includes(g.condition)?'':'muted'} onClick={()=>setActiveConditions(list=>list.includes(g.condition)?list.filter(c=>c!==g.condition):[...list,g.condition])}><span style={{background:COLORS[CONDITIONS.indexOf(g.condition as typeof CONDITIONS[number])%6]||COLORS[0]}}/>{g.condition}<small>n={g.trials}</small></button>)}</div>}</>:<div className="counts-table"><table><thead><tr><th>Condition</th><th>All events</th><th>Artifact flagged</th><th>Retained trials</th></tr></thead><tbody>{job.result?.counts.length?job.result.counts.map(c=><tr key={c.condition}><td>{c.condition}</td><td>{c.all_events}</td><td>{c.artifact_flagged}</td><td><strong>{c.exported_trials}</strong></td></tr>):signal.groups.map(g=><tr key={g.condition}><td>{g.condition}</td><td>—</td><td>—</td><td><strong>{g.trials}</strong></td></tr>)}</tbody></table></div>}
          <div className="chart-foot"><span><ShieldCheck size={14}/> Individual trials preserved · conditions fitted separately</span><span>{job.config.windowLength} / {job.config.windowStep} samples · τ {job.config.delays.join(', ')}</span></div></section>
          <section className="panel exports-panel"><div><h3>Your analysis, ready to use.</h3><p>Download prepared trials, graph data, and a reproducible record of this run.</p></div><div className="export-buttons"><button className="button secondary" onClick={()=>download('analysis.csv')}><ArrowDownToLine size={15}/> Graph CSV</button><button className="button secondary" onClick={()=>download('result.json')}><ArrowDownToLine size={15}/> Results JSON</button><details><summary className="button secondary">All files <ChevronDown size={15}/></summary><div className="download-menu">{job.artifacts.map(a=><button key={a.name} onClick={()=>download(a.name)}><FileText size={14}/><span>{a.name}<small>{fmtSize(a.size)}</small></span><ArrowDownToLine size={14}/></button>)}</div></details></div></section></>}
        </>}
        <footer className="page-footer"><span><Activity size={13}/> DDA Analysis</span><span>EEG preparation → pooled analysis → exploration</span></footer>
      </main>
    </div>
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-label="Workflow guide" onClick={e=>e.stopPropagation()}><button className="icon-button close-modal" onClick={()=>setHelp(false)} aria-label="Close guide"><X size={20}/></button><div className="section-icon"><Waves size={23}/></div><h2>One recording. One continuous workflow.</h2><ol><li><strong>Add matching input files.</strong><p>Choose one EDF, its TXT acquisition log, and a conditions CSV with sec_time and label columns.</p></li><li><strong>Choose your analysis.</strong><p>Select electrodes and conditions. Multiple electrodes can be averaged within each trial or analyzed separately.</p></li><li><strong>Let preparation run.</strong><p>The existing MATLAB recipe validates timing, references and filters the EEG, interpolates channels, resamples, epochs, and flags artifacts.</p></li><li><strong>Explore and export.</strong><p>Pooled CT fits each condition separately. Adjust DDA settings and rerun using prepared trials, then download your results.</p></li></ol><p className="quiet-note">This preparation recipe supports continuous 1000 Hz HydroCel recordings with E1–E129 and Status. Other recording formats require a reviewed preparation recipe.</p><button className="button primary" onClick={()=>setHelp(false)}>Back to workspace <ArrowRight size={16}/></button></section></div>}
  </div>;
}
function AnalysisSettings({config,update}: {config:AnalysisConfig;update:<K extends keyof AnalysisConfig>(key:K,value:AnalysisConfig[K])=>void}) {
  return <div className="analysis-settings"><div className="fields-row"><NumberField label="Window length" value={config.windowLength} onChange={n=>update('windowLength',n)} hint="samples" min={8}/><NumberField label="Window step" value={config.windowStep} onChange={n=>update('windowStep',n)} hint="samples"/><NumberField label="Event offset" value={config.eventOffset} onChange={n=>update('eventOffset',n)} hint="seconds from trial start" min={-1000} step={0.004}/></div><div className="fields-row"><label className="field"><span>Delays</span><input defaultValue={config.delays.join(', ')} key={`delays-${config.delays.join(',')}`} onBlur={e=>{const values=e.target.value.split(/[,\s]+/).filter(Boolean).map(Number);update('delays',values);update('nrTau',values.length);}}/><small>sample delays, separated by commas</small></label><label className="field"><span>Model terms</span><input defaultValue={config.modelTerms.join(', ')} key={`terms-${config.modelTerms.join(',')}`} onBlur={e=>update('modelTerms',e.target.value.split(/[,\s]+/).filter(Boolean).map(Number))}/><small>term indices, separated by commas</small></label><NumberField label="Derivative dimension" value={config.dimension} onChange={n=>update('dimension',n)}/><NumberField label="Polynomial order" value={config.order} onChange={n=>update('order',n)}/></div><div className="settings-foot"><CircleCheck size={14}/> Pooled cross-trial CT · one shared fit per condition</div></div>;
}
