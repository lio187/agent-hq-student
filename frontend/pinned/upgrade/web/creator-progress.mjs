// Events only trigger authenticated reads. Reconnecting always reconciles the source.
export function createCreatorProgress({read,onRun,onState,EventSourceClass=globalThis.EventSource}){
 let source=null,generation=0;
 function stop(){generation++;source?.close();source=null}
 function start(id){
  stop();if(!id)return;
  if(!EventSourceClass){onState('Live updates unavailable. Use Refresh to read the source.');return}
  const ticket=generation;let reading=false,pending=false;
  async function reconcile(){
   if(ticket!==generation)return;
   if(reading){pending=true;return}
   reading=true;
   try{const run=await read('runs/'+encodeURIComponent(id));if(ticket!==generation)return;if(run.id!==id)throw Error('Unexpected source run');onRun(run);onState('Source checked '+new Date().toLocaleTimeString('en-GB'));}
   catch{if(ticket===generation)onState('Source read failed. Displayed data may be stale; use Refresh.');}
   finally{reading=false;if(pending&&ticket===generation){pending=false;void reconcile()}}
  }
  try{source=new EventSourceClass('/creator-lab/api/events',{withCredentials:true});}
  catch{onState('Live updates unavailable. Use Refresh to read the source.');return}
  source.onopen=()=>{void reconcile()};
  source.onmessage=event=>{let data;try{data=JSON.parse(event.data)}catch{return}if(data.id===id)void reconcile()};
  source.onerror=()=>{if(ticket===generation)onState('Live connection interrupted. Reconnecting; displayed data may be stale.')};
 }
 return {start,stop};
}
