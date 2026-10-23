import RFB from '/novnc/rfb.js';
let token=null,rfb=null;
let holdActive=false;
const parentOrigin=document.querySelector('meta[name="parent-origin"]').content;
const handshake=setInterval(()=>{if(!token)parent.postMessage({type:'ddalab-viewer-ready'},parentOrigin);},500);
const target = document.querySelector('#program');
const message = document.querySelector('#message');
const api = (path, options={}) => fetch(path,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==parentOrigin||event.data?.type!=='ddalab-auth'||token)return;
  token=event.data.token;
  holdActive=!!event.data.holdActive;
  clearInterval(handshake);
  rfb = new RFB(target,`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/vnc?token=${encodeURIComponent(token)}`);
  rfb.scaleViewport=true;rfb.resizeSession=false;rfb.background='#11161d';rfb.qualityLevel=8;rfb.compressionLevel=2;
  rfb.addEventListener('connect',()=>{message.textContent='';parent.postMessage({type:'ddalab-ready'},parentOrigin);});
  rfb.addEventListener('disconnect',()=>{message.textContent='Session stopped.';parent.postMessage({type:'ddalab-disconnected'},parentOrigin);});
  rfb.addEventListener('clipboard',event=>navigator.clipboard?.writeText(event.detail.text).catch(()=>{}));
});
document.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text/plain');if(text&&rfb)rfb.clipboardPasteFrom(text);});
let activeDialog=null,handledDialog='',pending=false;
const downloaded = new Set();
window.addEventListener('message',async event=>{
  if(event.source===parent&&event.origin===parentOrigin&&event.data?.type==='ddalab-hold'){holdActive=!!event.data.active;return;}
  if(event.source!==parent||event.origin!==parentOrigin||event.data?.type!=='ddalab-files'||!activeDialog||event.data.id!==activeDialog.id||!event.data.cancel)return;
  await api('/api/dialog/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:activeDialog.id})});
  activeDialog=null;
});
async function poll(){
  if(pending||!token||document.visibilityState==='hidden')return;pending=true;
  try{
    const response=await api(`/api/events${holdActive?'?hold=1':''}`);if(!response.ok)return;
    const state=await response.json();
    mirrorControls(state.controls);
    parent.postMessage({type:'ddalab-state',dataset:state.dataset,busy:state.busy,lastActivity:state.lastActivity},parentOrigin);
    if(state.dialog&&state.dialog.id!==handledDialog){
      handledDialog=state.dialog.id;
      if(state.dialog.kind==='recording'){
        parent.postMessage({type:'ddalab-upload-recording'},parentOrigin);
        await api('/api/dialog/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.dialog.id})});
      }else{
        activeDialog=state.dialog;
        parent.postMessage({type:'ddalab-file-dialog',dialog:state.dialog},parentOrigin);
      }
    }
    if(activeDialog&&!state.dialog){parent.postMessage({type:'ddalab-files-complete',id:activeDialog.id},parentOrigin);activeDialog=null;}
    for(const file of state.downloads){
      if(downloaded.has(file.id))continue;downloaded.add(file.id);
      const link=document.createElement('a');link.href=`/api/download/${encodeURIComponent(file.name)}?token=${encodeURIComponent(token)}`;link.download=file.name;document.body.append(link);link.click();link.remove();
    }
  }catch{}finally{pending=false;}
}
setInterval(poll,250);
const controls=document.querySelector('#controls'), elements=new Map();
async function sendControl(id,operation,value){
  const node=elements.get(id);if(node)node.dataset.operation=operation;
  const response=await api('/api/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operation,value})});
  if(node)node.dataset.actionStatus=String(response.status);
  if(operation==='click'&&response.ok)rfb?.focus();
  return response;
}
function mirrorControls(rows){
  const canvas=target.querySelector('canvas');if(!canvas?.width)return;
  const box=canvas.getBoundingClientRect(),sx=box.width/canvas.width,sy=box.height/canvas.height;
  const alive=new Set();
  for(const row of rows||[]){
    alive.add(row.id);let node=elements.get(row.id);
    if(!node){
      node=document.createElement(row.kind==='select'?'select':row.kind==='number'||row.kind==='text'?'input':'button');
      if(row.kind==='number'){node.type='number';node.min=row.minimum;node.max=row.maximum;node.step=row.step;}
      if(row.kind==='text')node.type='text';
      if(row.kind==='tab')node.setAttribute('role','tab');
      node.onfocus=()=>sendControl(row.id,'focus');
      if(node.tagName==='BUTTON')node.onclick=()=>sendControl(row.id,'click');
      else if(row.kind==='select')node.onchange=()=>sendControl(row.id,'change',Number(node.value));
      else node.oninput=()=>{if(row.kind==='text'||node.value!==''&&Number.isFinite(Number(node.value)))sendControl(row.id,'change',row.kind==='number'?Number(node.value):node.value);};
      elements.set(row.id,node);controls.append(node);
    }
    node.setAttribute('aria-label',row.name);
    if(row.kind==='text'||row.kind==='number'||row.kind==='select'||row.kind==='tab')node.tabIndex=-1;
    if(row.kind==='number'){node.min=row.minimum;node.max=row.maximum;node.step=row.step;}
    if(row.kind==='select'&&node.dataset.options!==JSON.stringify(row.options)){
      node.replaceChildren(...row.options.map((text,index)=>new Option(text,String(index))));
      node.dataset.options=JSON.stringify(row.options);
    }
    if(row.kind==='tab')node.setAttribute('aria-selected',String(row.selected));
    if(row.checked!==null&&row.checked!==undefined)node.setAttribute('aria-pressed',String(row.checked));
    if('value'in row&&document.activeElement!==node)node.value=String(row.value);
    Object.assign(node.style,{left:`${box.left+row.x*sx}px`,top:`${box.top+row.y*sy}px`,width:`${row.width*sx}px`,height:`${row.height*sy}px`});
  }
  for(const[id,node]of elements)if(!alive.has(id)){node.remove();elements.delete(id);}
}
