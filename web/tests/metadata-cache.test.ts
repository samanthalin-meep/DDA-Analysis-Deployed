import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMetadataStore} from '../lib/metadata-cache';

function fixture(){
  let now=0;
  const entries=new Map<string,{value:unknown;expires:number}>();
  const cache={
    async get(key:string){const row=entries.get(key);return row&&row.expires>now?row.value:null;},
    async set(key:string,value:unknown,options?:{ttl?:number}){entries.set(key,{value,expires:now+(options?.ttl||3600)*1000});},
    async delete(key:string){entries.delete(key);},
  };
  return{store:createMetadataStore(cache),cache,entries,advance:(ms:number)=>{now+=ms;}};
}

test('900 status requests share one Blob read across function instances',async()=>{
  const {store,cache}=fixture();let reads=0;
  const load=async()=>{reads++;return{status:'preparing',progress:10};};
  await Promise.all(Array.from({length:100},()=>store.read('owner/job',load)));
  const anotherInstance=createMetadataStore(cache);
  for(let i=0;i<800;i++)assert.equal((await anotherInstance.read('owner/job',load)).progress,10);
  assert.equal(reads,1);
});

test('successful writes update status and failed writes retain the durable value',async()=>{
  const {store}=fixture();let durable={status:'queued'};
  await store.read('job',async()=>durable);
  await store.write('job',{status:'complete'},async()=>{durable={status:'complete'};});
  assert.deepEqual(await store.read('job',async()=>{throw Error('Unexpected Blob read.');}),durable);
  await assert.rejects(store.write('job',{status:'failed'},async()=>{throw Error('Write failed.');}));
  assert.deepEqual(await store.read('job',async()=>durable),{status:'complete'});
});

test('callers cannot change cached state by editing a returned object',async()=>{
  const {store}=fixture();
  const first=await store.read('job',async()=>({inputs:[{name:'a.csv'}]}));
  first.inputs[0].name='changed.csv';
  assert.equal((await store.read('job',async()=>first)).inputs[0].name,'a.csv');
});

test('session keys keep owners separate',async()=>{
  const {store}=fixture();
  await store.write('sessions/a/job',{owner:'a'},async()=>{});
  await store.write('sessions/b/job',{owner:'b'},async()=>{});
  assert.deepEqual(await store.read('sessions/a/job',async()=>null),{owner:'a'});
  assert.deepEqual(await store.read('sessions/b/job',async()=>null),{owner:'b'});
});

test('an evicted entry reloads from durable storage',async()=>{
  const {store,entries}=fixture();let reads=0;
  const load=async()=>{reads++;return{status:'ready'};};
  await store.read('desktop',load);entries.clear();
  assert.deepEqual(await store.read('desktop',load),{status:'ready'});
  assert.equal(reads,2);
});

test('a blocked store is attempted once per minute, with no endless retry loop',async()=>{
  const {store,advance}=fixture();let reads=0;
  const load=async()=>{reads++;throw Error('Store blocked.');};
  await assert.rejects(store.read('job',load));
  for(let i=0;i<20;i++)await assert.rejects(store.read('job',load),/Storage is unavailable/);
  assert.equal(reads,1);
  advance(60001);await assert.rejects(store.read('job',load));assert.equal(reads,2);
});

test('an older in-flight read does not overwrite a completed write',async()=>{
  const {store}=fixture();let release!:(value:{status:string})=>void;
  const old=new Promise<{status:string}>(resolve=>{release=resolve;});
  const read=store.read('job',()=>old);
  await new Promise(resolve=>setTimeout(resolve,0));
  await store.write('job',{status:'complete'},async()=>{});
  release({status:'queued'});
  assert.deepEqual(await read,{status:'complete'});
  assert.deepEqual(await store.read('job',async()=>({status:'queued'})),{status:'complete'});
});
