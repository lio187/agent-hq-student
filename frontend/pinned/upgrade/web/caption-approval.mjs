export function verifyCaptionApproval(saved,source){
 const approval=saved?.captionApproval;
 if(!saved||saved.id!==source.id||saved.revision!==source.revision+1||saved.accountId!==source.accountId||saved.accountRegistryId!==source.accountRegistryId||saved.caption!==source.caption||saved.keyword!==source.keyword||approval?.status!=='approved'||approval.caption!==source.caption||approval.keyword!==source.keyword||!approval.approvedBy||!approval.approvedAt)throw Error('The source does not confirm this caption approval.');
 return saved;
}
export function mountCaptionApproval({root,item,api,onConfirmed,storage=sessionStorage}){
 const button=root.querySelector('#approve-caption'),status=root.querySelector('#edit-error'),key='hq-caption-approval:'+item.id;
 const current=()=>root.querySelector('#approve-caption')===button;let pending=null,busy=false,blocked=false;
 try{pending=JSON.parse(storage.getItem(key)||'null');if(pending&&(pending.source?.id!==item.id||!pending.key))throw Error('Invalid receipt')}catch{blocked=true;status.textContent='The earlier approval request cannot be read.'}
 const label=()=>button.textContent=pending?'Goedkeuring controleren':'Approve saved caption';label();
 button.onclick=async()=>{
  if(busy||blocked)return;
  if(!pending){
   if(!item.caption?.trim()){status.textContent='Save a caption first.';return}
   pending={key:crypto.randomUUID(),source:{id:item.id,revision:item.revision,accountId:item.accountId,accountRegistryId:item.accountRegistryId,caption:item.caption,keyword:item.keyword}};
   try{storage.setItem(key,JSON.stringify(pending))}catch{pending=null;status.textContent='The request could not be stored. Nothing was changed.';return}
  }
  busy=true;button.disabled=true;let acknowledged=Boolean(pending.receipt);
  try{
   if(!pending.receipt){const receipt=await api('workspace/team/content',{action:'caption.approve',id:pending.source.id,revision:pending.source.revision},{key:pending.key});acknowledged=true;verifyCaptionApproval(receipt,pending.source);pending.receipt=receipt;storage.setItem(key,JSON.stringify(pending))}
   const detail=await api('workspace/team/item?id='+encodeURIComponent(pending.source.id));verifyCaptionApproval(detail.item,pending.source);
   for(const field of ['approvedBy','approvedAt'])if(detail.item.captionApproval[field]!==pending.receipt.captionApproval[field])throw Error('The approval receipt differs from the source.');
   storage.removeItem(key);pending=null;blocked=true;
   if(current()){await onConfirmed(detail);status.textContent='The saved caption and keyword are approved and read back. This publishes nothing.'}
  }catch(error){
   if(!acknowledged&&error.code==='team_rejected'&&[400,401,403,404,405,409,422].includes(error.status)){storage.removeItem(key);pending=null}
   if(current())status.textContent=error.message+(pending?' Check the earlier request; the outcome is not confirmed yet.':'');
  }finally{busy=false;button.disabled=blocked;label();if(blocked)button.textContent='Approval confirmed'}
 };
}
