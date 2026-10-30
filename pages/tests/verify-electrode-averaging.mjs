import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { transform } from 'esbuild';
import init, { run_dda } from '../public/engine/dda.js';
const {code} = await transform(await readFile(new URL('../src/electrode-averaging.ts',import.meta.url),'utf8'),
  {loader:'ts',format:'esm',target:'es2022'});
const {averageElectrodeVariants} = await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const make = (x, label='control') => ({electrode:'E1',variants:[{id:'CT',label:'CT',row_labels:[label],matrix:[[x,x+1]]}]});
assert.deepEqual(averageElectrodeVariants([make(1),make(3)])[0].matrix,[[2,3]]);
assert.throws(()=>averageElectrodeVariants([make(1),make(3,'exp1')]),/matching/);
assert.throws(()=>averageElectrodeVariants([]),/No electrode/);

const config={window:50,step:10,start:0,end:.996,eventOffset:.2,electrodeAveraging:'coefficients',
  delays:[7,10],terms:[1,2,10],dimension:4,order:4,nrTau:2,indices:[0,1,2,3],variants:['CT']};
const values = new Float32Array(2*250*4);
for(let e=0;e<2;e++)for(let t=0;t<250;t++)for(let trial=0;trial<4;trial++)
  values[(e*250+t)*4+trial] = Math.sin(t/(e?3.7:9.3)+trial*.3)+.4*Math.cos(t/(e?8.1:4.2)+trial*.1);
const columns=['control','control','exp1','exp1'].map((c,i)=>`AVG_E1_E2__${c}__trial_event${String(i+1).padStart(6,'0')}`);
const rows=Array.from({length:250},(_,t)=>[t/250,...Array.from({length:4},(_,i)=>(values[t*4+i]+values[(250+t)*4+i])/2)]);
const text='time,'+columns.join(',')+'\n'+rows.map(row=>row.join(',')).join('\n')+'\n';
const source={name:'DDA_Averaging.csv',text,meta:{electrode_data:{encoding:'f32le-base64',electrodes:['E1','E2'],values:Buffer.from(values.buffer).toString('base64')}}};
const index=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const revision=index.match(/app-([0-9a-f]+)\.js/)[1];
const worker=new Worker(new URL('./worker-harness.mjs',import.meta.url),
  {workerData:new URL(`../dist/worker-${revision}.js`,import.meta.url).href});
let sequence=0;
const pending=new Map();
worker.on('message',message=>{
  const p=pending.get(message.id);
  if(p){pending.delete(message.id);message.error?p.reject(Error(message.error)):p.resolve(message.result);}
});
worker.on('error',error=>{for(const p of pending.values())p.reject(error);pending.clear();});
const rpc=(action,payload)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
try {
  const dataset=await rpc('open',source);
  const result=await rpc('run',{id:dataset.id,name:dataset.name,columns:dataset.columns,config});
  assert.equal(result.electrode_results.length,2);
  assert.equal(result.config.electrodeAveraging,'coefficients');
  assert(Math.abs(result.epoch_time_bounds_seconds[0]+.2)<1e-12);
  assert(Math.abs(result.epoch_time_bounds_seconds[1]-.8)<1e-12);
  assert.equal(result.sampling_rate_hz,250);
  await init({module_or_path:await readFile(new URL('../public/engine/dda_bg.wasm',import.meta.url))});
  const direct=[];
  for(let e=0;e<2;e++) {
    const matrix=[];
    for(let c=0;c<2;c++) {
      const flat=Float64Array.from(Array.from({length:250},(_,t)=>[values[(e*250+t)*4+c*2],values[(e*250+t)*4+c*2+1]]).flat());
      const request={file_path:'direct.csv',channels:null,time_range:{start:0,end:249},preprocessing_options:{highpass:null,lowpass:null},
        algorithm_selection:{enabled_variants:['CT']},window_parameters:{window_length:50,window_step:10,ct_window_length:2,ct_window_step:2},
        delay_parameters:{delays:[7,10]},model_parameters:{dm:4,order:4,nr_tau:2},model_terms:[1,2,10],sampling_rate:250};
      matrix.push(JSON.parse(run_dda(JSON.stringify(request),flat,250,2,JSON.stringify(['trial1','trial2']),()=>{})).variant_results[0].q_matrix[0]);
    }
    direct.push(matrix);
  }
  for(let c=0;c<2;c++)for(let w=0;w<19;w++) {
    assert(Math.abs(result.variants[0].matrix[c][w]-(direct[0][c][w]+direct[1][c][w])/2)<1e-12);
    for(let e=0;e<2;e++)assert(Math.abs(result.electrode_results[e].variants[0].matrix[c][w]-direct[e][c][w])<1e-12);
  }
  const legacy=await rpc('run',{id:dataset.id,name:dataset.name,columns:dataset.columns,config:{...config,electrodeAveraging:'signal'}});
  assert(!legacy.electrode_results);
  assert(Math.max(...result.variants[0].matrix.flat().map((v,i)=>Math.abs(v-legacy.variants[0].matrix.flat()[i])))>.001,
    'DDA first must genuinely differ from fitting the pre-averaged EEG.');
  const snapshot=JSON.parse(JSON.stringify(result));
  assert.deepEqual(snapshot.electrode_results,result.electrode_results);
  const averagedOnly=await rpc('open',{name:source.name,text});
  await assert.rejects(rpc('run',{id:averagedOnly.id,name:averagedOnly.name,columns,config}),/EEG average only/);
  const subset=await rpc('run',{id:dataset.id,name:dataset.name,columns,config:{...config,indices:[0,1]}});
  assert.deepEqual(subset.variants[0].row_labels,['control']);
  assert.equal(subset.electrode_results.length,2);
  console.log('PASS: actual built worker fits every retained electrode and selected trial, averages only DDA results, preserves individual fits, and rejects average-only inputs.');
} finally {await worker.terminate();}
