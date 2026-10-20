export function verifyComment(receipt,attempt,detail){
 const source=attempt.source,item=detail?.item;
 if(!receipt?.id||receipt.itemId!==source.id||receipt.message!==attempt.body.message||!receipt.author)throw Error('The receipt does not confirm this comment.');
 if(!item||item.id!==source.id||item.accountId!==source.accountId||item.accountRegistryId!==source.accountRegistryId)throw Error('The source item does not belong to this comment.');
 const rows=(detail.comments||[]).filter(c=>c.id===receipt.id);
 if(rows.length!==1||['itemId','message','author','createdAt'].some(k=>rows[0][k]!==receipt[k]))throw Error('The saved comment is not confirmed in the source yet.');
 return detail;
}

export function mountContentComment({root,item,api,onConfirmed,storage=sessionStorage}){
 const button=root.querySelector('#add-comment'),input=root.querySelector('#comment'),status=root.querySelector('#edit-error');
 const current=()=>root.querySelector('#add-comment')===button;
 const key='hq-content-comment:'+item.id;let busy=false,pending=null,storageFailed=false;
 try{pending=JSON.parse(storage.getItem(key)||'null');if(pending&&(pending.source?.id!==item.id||pending.body?.action!=='comment.add'||!pending.key))throw Error('Invalid saved request')}catch{storageFailed=true;status.textContent='The saved comment request cannot be read. Nothing was sent.'}
 const label=()=>button.textContent=pending?'Check receipt':'Add comment';label();
 if(pending){input.value=pending.body.message;status.textContent='An earlier comment is awaiting confirmation. Check the receipt with the same request.'}
 button.onclick=async()=>{
  if(busy||storageFailed)return;
  if(!pending){
   const message=input.value.trim();if(!message){status.textContent='Write a comment first.';return}if(message.length>4000){status.textContent='A comment can be at most 4000 characters.';return}
   pending={key:crypto.randomUUID(),source:{id:item.id,accountId:item.accountId,accountRegistryId:item.accountRegistryId},body:{action:'comment.add',itemId:item.id,revision:item.revision,message}};
   try{storage.setItem(key,JSON.stringify(pending))}catch{pending=null;status.textContent='The request could not be stored locally. Nothing was sent.';return}
  }
  busy=true;button.disabled=true;input.disabled=true;let acknowledged=Boolean(pending.receipt);
  try{
   if(!pending.receipt){const receipt=await api('workspace/team/content',pending.body,{key:pending.key});acknowledged=true;pending.receipt=receipt;storage.setItem(key,JSON.stringify(pending))}
   const detail=await api('workspace/team/item?id='+encodeURIComponent(pending.source.id));verifyComment(pending.receipt,pending,detail);
   storage.removeItem(key);if(input.value.trim()===pending.body.message)input.value='';pending=null;if(current()){onConfirmed(detail);status.textContent='Comment saved and confirmed in the source.';}
  }catch(error){
   if(!acknowledged&&error.code==='team_rejected'&&[400,401,403,404,405,409,422].includes(error.status)){storage.removeItem(key);pending=null;if(current())status.textContent=error.message}
   else if(current())status.textContent=error.message+' The outcome remains unconfirmed. Check the receipt; no new request is made.';
  }finally{busy=false;button.disabled=false;input.disabled=false;label()}
 };
}
