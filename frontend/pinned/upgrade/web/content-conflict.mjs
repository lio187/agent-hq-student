export function conflictAttempt(item,conflict,choice){
 if(conflict?.itemId!==item.id||!['local','remote'].includes(choice)||typeof conflict.field!=='string')throw Error('This conflict does not belong to this item.');
 return {key:crypto.randomUUID(),source:{id:item.id,revision:item.revision,accountId:item.accountId,accountRegistryId:item.accountRegistryId,blocks:(item.blocks||[]).map(b=>({id:b.id,text:b.text}))},conflict,choice};
}
export function verifyConflict(detail,attempt){
 const item=detail?.item,{source,conflict:c,choice}=attempt;
 const fail=()=>{throw Error('The source does not confirm the chosen conflict resolution.')};
 if(!item||item.id!==source.id||item.accountId!==source.accountId||item.accountRegistryId!==source.accountRegistryId||item.revision!==source.revision+1||item.notion?.pending!==true||!Array.isArray(detail.conflicts)||detail.conflicts.some(r=>r.id===c.id))fail();
 if(!c.field.startsWith('block:')){if(JSON.stringify(item[c.field])!==JSON.stringify(c[choice]))fail();return item}
 const blockId=c.field.slice(6),original=source.blocks.find(b=>b.id===blockId);if(!original||!Array.isArray(item.blocks))fail();
 const expected=source.blocks.filter(b=>!(b.id===blockId&&c.remoteDeleted&&choice==='remote'));
 if(item.blocks.length!==expected.length)fail();
 for(let n=0;n<expected.length;n++){
  const before=expected[n],after=item.blocks[n];
  if(before.id===blockId&&c.remoteDeleted){if(after.id===blockId||!after.id||after.notionOriginalId!==blockId||after.notionDetached!==true||after.text!==before.text)fail()}
  else if(after.id!==before.id||after.text!==(before.id===blockId?c[choice]:before.text))fail();
 }
 if(new Set(item.blocks.map(b=>b.id)).size!==item.blocks.length||item.script!==item.blocks.map(b=>b.text||'').filter(Boolean).join('\n\n'))fail();
 return item;
}
export function mountContentConflicts({root,item,conflicts,api,onConfirmed,storage=sessionStorage}){
 const buttons=[...root.querySelectorAll('[data-conflict]')],status=root.querySelector('#edit-error'),marker=root.ownerDocument?.createElement('span')||root.createElement('span');marker.hidden=true;root.querySelector('#edit-body').append(marker);
 const current=()=>marker.isConnected,key='hq-content-conflict:'+item.id;let pending=null,busy=false,blocked=false;
 try{pending=JSON.parse(storage.getItem(key)||'null');if(pending&&(pending.source?.id!==item.id||!pending.key))throw Error('Invalid request')}catch{blocked=true;status.textContent='The earlier conflict request cannot be read.'}
 function controls(){buttons.forEach(b=>b.disabled=busy||blocked||Boolean(pending))}
 function recovery(){if(!current())return;status.textContent='This conflict resolution is not confirmed yet.';const check=marker.ownerDocument.createElement('button');check.type='button';check.textContent='Conflictoplossing controleren';check.onclick=()=>run();status.append(' ',check)}
 async function run(){
  if(busy||blocked||!pending)return;busy=true;controls();let acknowledged=Boolean(pending.accepted);
  try{
   if(!pending.accepted){const receipt=await api('workspace/team/content',{action:'conflict.resolve',id:pending.conflict.id,revision:pending.source.revision,choice:pending.choice},{key:pending.key});acknowledged=true;if(receipt?.ok!==true)throw Error('Receipt missing.');pending.accepted=true;storage.setItem(key,JSON.stringify(pending))}
   const detail=await api('workspace/team/item?id='+encodeURIComponent(pending.source.id));verifyConflict(detail,pending);storage.removeItem(key);pending=null;
   if(current())await onConfirmed(detail);
  }catch(error){
   if(!acknowledged&&error.code==='team_rejected'&&[400,401,403,404,405,409,422].includes(error.status)){storage.removeItem(key);pending=null}
   if(current()){if(pending)recovery();else status.textContent=error.message}
  }finally{busy=false;controls()}
 }
 buttons.forEach(button=>button.onclick=async()=>{
  if(busy||blocked||pending)return;
  try{pending=conflictAttempt(item,conflicts.find(c=>c.id===button.dataset.conflict),button.dataset.choice);storage.setItem(key,JSON.stringify(pending))}catch(error){pending=null;status.textContent=error.message;return}
  await run();
 });
 controls();if(pending)recovery();
}
