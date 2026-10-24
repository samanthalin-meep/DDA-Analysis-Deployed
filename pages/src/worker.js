// All file processing happens in this worker. No uploads, telemetry, or server API.
let runtime;
async function initialize() {
  if(runtime) return runtime;
  runtime=(async()=>{
    self.postMessage({type:'progress',label:'Load analysis tools',value:0});
    const [{loadPyodide},engine]=await Promise.all([import('./runtime/pyodide.mjs'),import('./engine/dda.js')]);
    const py=await loadPyodide({indexURL:new URL('./runtime/',self.location.href).href});
    await py.loadPackage(['numpy','scipy','scikit-learn']);
    py.FS.mkdirTree('/app');py.FS.mkdirTree('/input');
    for(const name of ['preparation.py','workspace.py']) {
      const response=await fetch(new URL('./python/'+name,self.location.href));
      if(!response.ok) throw Error('Cannot load the preparation tools. Reload the page.');
      py.FS.writeFile('/app/'+name,await response.text());
    }
    py.runPython('import sys\nsys.path.insert(0,"/app")\nimport workspace');
    const api=py.pyimport('workspace');
    const response=await fetch(new URL('./coordinates.json',self.location.href));
    const coordinates=await response.text();
    await engine.default();
    return {py,api,engine,coordinates};
  })();
  try{return await runtime;}catch(e){runtime=undefined;throw e;}
}

async function execute(action,payload) {
  const {py,api,engine,coordinates}=await initialize();
  if(action==='initialize')return true;
  if(action==='open')return JSON.parse(api.open_csv(payload.name,payload.text,payload.rate||250,JSON.stringify(payload.meta||{})));
  if(action==='prepare') {
    for(const [key,path] of [['edf','recording.edf'],['txt','log.txt'],['csv','conditions.csv']]) {
      py.FS.writeFile('/input/'+path,new Uint8Array(payload[key]));payload[key]=null;
    }
    try {
      return JSON.parse(api.prepare_files(JSON.stringify(payload.config),coordinates,(label,n,total)=>self.postMessage({type:'progress',label,value:total?n/total:0})));
    } finally {for(const path of ['recording.edf','log.txt','conditions.csv'])py.FS.unlink('/input/'+path);}
  }
  if(action==='close'){api.close_dataset(payload.id);return true;}
  if(action==='preview')return JSON.parse(api.preview(payload.id,JSON.stringify(payload.config)));
  if(action==='export')return api.export_dataset(payload.id);
  if(action==='electrodes')return JSON.parse(api.export_electrodes(payload.id));
  if(action==='ica')return JSON.parse(api.run_ica(payload.id,JSON.stringify(payload.config)));
  if(action==='run') {
    const cfg=payload.config;
    const spec=JSON.parse(api.analysis_spec(payload.id,JSON.stringify(cfg)));
    const variants=[];
    for(let gi=0;gi<spec.groups.length;gi++){
      const group=spec.groups[gi];
      const matrix=api.analysis_matrix(payload.id,JSON.stringify(group.indices),spec.start,spec.end);
      const buffer=matrix.getBuffer('f64');
      const pooled=cfg.variants.includes('CT')&&!cfg.pairs;
      const request={file_path:payload.name,channels:null,time_range:{start:0,end:spec.end-spec.start-1},
        preprocessing_options:{highpass:null,lowpass:null},algorithm_selection:{enabled_variants:cfg.variants},
        window_parameters:{window_length:cfg.window,window_step:cfg.step,
          ct_window_length:pooled?group.indices.length:2,ct_window_step:pooled?group.indices.length:1},
        delay_parameters:{delays:cfg.delays},model_parameters:{dm:cfg.dimension,order:cfg.order,nr_tau:cfg.nrTau},
        model_terms:cfg.terms,sampling_rate:spec.rate};
      if(cfg.pairs&&cfg.pairs.length){
        const pairs=cfg.pairs.map(pair=>pair.map(i=>group.indices.indexOf(i)));
        if(pairs.some(p=>p.includes(-1)))throw Error('Select every channel used by a pair.');
        if(cfg.variants.includes('CT'))request.ct_channel_pairs=pairs;
        if(cfg.variants.includes('CD'))request.cd_channel_pairs=pairs;
      }
      if(cfg.conditioningStrategy||cfg.variants.some(v=>v.includes('CCD'))){
        const advanced={selected_channels:group.indices.map((_,i)=>i),conditioning_strategy:cfg.conditioningStrategy||'all_selected',
          surrogate_shifts:cfg.surrogateShifts||[23,37,53],temporal_lambda:cfg.temporalLambda??1,max_active_sources:cfg.maxActiveSources||2};
        request.variant_configs=Object.fromEntries(['conditional_cross_dynamical','conditional_cross_dynamical_significance','temporally_regularized_conditional_cross_dynamical','multivariate_conditional_cross_dynamical','conditional_cross_dynamical_stability'].map(k=>[k,advanced]));
      }
      let result;
      try{
        result=JSON.parse(engine.run_dda(JSON.stringify(request),buffer.data,spec.end-spec.start,group.indices.length,
          JSON.stringify(group.indices.map(i=>payload.columns[i])),s=>{
            const p=JSON.parse(s);self.postMessage({type:'progress',label:group.condition?`Run CT: ${group.condition}`:p.stage_label,
               value:(gi+p.step_index/Math.max(1,p.total_steps))/spec.groups.length});
          }));
      }finally{buffer.release();matrix.destroy();}
      for(const v of result.variant_results){
        const previous=variants.find(x=>x.id===v.variant_id);
        const labels=group.condition?[group.condition]:v.channel_labels;
        if(previous){previous.matrix.push(...v.q_matrix);previous.row_labels.push(...labels);}
        else variants.push({id:v.variant_id,label:group.condition?`Pooled cross-trial CT - ${group.electrode} - a1`:v.variant_name,
            matrix:v.q_matrix,row_labels:labels});
      }
    }
    if(variants.some(v=>v.matrix.some(row=>row.some(x=>!Number.isFinite(x)))))throw Error('The fit returned a nonfinite coefficient. Check the selected channels and model.');
    return {id:crypto.randomUUID(),file_name:payload.name,created_at:new Date().toISOString(),variants,
      window_centers_seconds:spec.centers,trial_groups:spec.groups[0]?.condition?spec.groups:[],config:cfg,
      engine:'Original dda-rs 0.2.0 / WebAssembly',preparation:payload.preparation||null};
  }
  throw Error('Unknown operation.');
}

// Serialize operations so a file close cannot remove data during a calculation.
let queue=Promise.resolve();
self.onmessage=event=>{
  const {id,action,payload}=event.data;
  queue=queue.then(async()=>{
    try{self.postMessage({id,result:await execute(action,payload)});}
    catch(error){self.postMessage({id,error:String(error?.message||error).replace(/^PythonError: /,'')});}
  });
};
