type Cache = {
  get(key:string):Promise<unknown|null>;
  set(key:string,value:unknown,options?:{ttl?:number;name?:string}):Promise<void>;
  delete(key:string):Promise<void>;
};
type Entry = {value:unknown}|{error:string};

// Blob remains the durable source. Cache entries contain metadata only.
// In-flight reads share one origin request. Values are copied before callers edit them.
export function createMetadataStore(cache:Cache){
  const pending=new Map<string,Promise<unknown>>();
  async function peekEntry(key:string):Promise<Entry|null>{
    try{return await cache.get(key) as Entry|null;}catch{return null;}
  }
  async function remember(key:string,value:unknown,ttl=3600){
    try{await cache.set(key,{value:structuredClone(value)},{ttl,name:''});}
    catch{try{await cache.delete(key);}catch{}}
  }
  function value<T>(entry:Entry):T{
    if('error' in entry)throw Error(entry.error);
    return structuredClone(entry.value) as T;
  }
  async function read<T>(key:string,load:()=>Promise<T>,ttl=3600):Promise<T>{
    const cached=await peekEntry(key);
    if(cached)return value<T>(cached);
    let loading=pending.get(key);
    if(!loading){
      loading=(async()=>{
        try{
          const result=await load();
          // A successful concurrent write takes precedence over an older read.
          const newer=await peekEntry(key);
          if(newer&&'value' in newer)return value<T>(newer);
          await remember(key,result,result===null?10:ttl);
          return result;
        }catch(error){
          // Do not repeatedly hit a blocked store from each open browser tab.
          try{await cache.set(key,{error:'Storage is unavailable.'},{ttl:60,name:''});}catch{}
          throw error;
        }
      })();
      pending.set(key,loading);
      void loading.finally(()=>pending.delete(key)).catch(()=>{});
    }
    return structuredClone(await loading) as T;
  }
  async function write<T>(key:string,data:T,persist:()=>Promise<unknown>){
    await persist();
    await remember(key,data);
  }
  async function peek<T>(key:string):Promise<T|null>{
    const entry=await peekEntry(key);
    return entry&&'value' in entry?value<T>(entry):null;
  }
  return {read,write,peek,remember};
}
