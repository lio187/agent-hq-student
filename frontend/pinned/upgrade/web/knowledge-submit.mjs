const fields=['title','source_path','summary'];
export async function knowledgeReceiptId(key){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}
export function verifyKnowledgeReceipt(receipt,attempt,records){
 if(!receipt||receipt.id!==attempt.id||receipt.project!==attempt.body.project||receipt.task_id!==attempt.body.task_id||receipt.status!=='submitted'||receipt.curation!=='pending'||receipt.writer!=='Workspace Librarian'||!Number.isFinite(receipt.created_at))throw Error('The receipt does not confirm this knowledge submission.');
 const matches=Array.isArray(records)?records.filter(r=>r.id===attempt.id):[];
 if(matches.length!==1||Object.keys(receipt).some(k=>matches[0][k]!==receipt[k]))throw Error('The stored knowledge receipt has not been confirmed.');
 return receipt;
}
export function mountKnowledgeSubmission({form,project,taskId,api,onConfirmed,storage=sessionStorage}){
 const button=form.querySelector('button[type="submit"]'),status=form.querySelector('[role="alert"]');
 const inputs=fields.map(name=>form.elements.namedItem(name));
 const storageKey='hq-knowledge-submit:'+JSON.stringify([project,taskId]);
 const current=()=>form.isConnected&&form.ownerDocument.querySelector('#knowledge-form')===form;
 let pending=null,busy=false,blocked=false;
 const show=message=>{if(current())status.textContent=message};
 const controls=()=>{button.disabled=busy||blocked;button.textContent=pending?'Check submission receipt':'Submit to Librarian';inputs.forEach(input=>input.disabled=busy||Boolean(pending)||blocked)};
 try{
  pending=JSON.parse(storage.getItem(storageKey)||'null');
  if(pending){
   if(typeof pending.key!=='string'||!pending.key||pending.body?.project!==project||pending.body?.task_id!==taskId||fields.some(f=>typeof pending.body[f]!=='string'))throw Error('Invalid saved request');
   inputs.forEach((input,i)=>input.value=pending.body[fields[i]]);
   show('A previous submission is awaiting confirmation. Check its receipt before starting another.');
  }
 }catch{blocked=true;show('The saved request cannot be read. Nothing has been sent.');}
 controls();
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||blocked)return;busy=true;controls();let acknowledged=Boolean(pending?.receipt),rejected=false;
  try{
   if(!pending){
    const body={project,task_id:taskId,...Object.fromEntries(inputs.map((input,i)=>[fields[i],input.value.trim()]))};
    if(fields.some(f=>!body[f]))throw Error('Complete the title, source path and summary.');
    const key=crypto.randomUUID(),attempt={key,id:await knowledgeReceiptId(key),body};
    try{storage.setItem(storageKey,JSON.stringify(attempt))}catch{throw Error('The request cannot be saved locally. Nothing has been sent.');}
    pending=attempt;
   }
   if(pending.id!==await knowledgeReceiptId(pending.key))throw Error('The saved request identity is invalid. Nothing new has been sent.');
   // Look for the original receipt first, including after a lost POST response.
   let records=await api('brain/submissions');
   const recorded=Array.isArray(records)?records.filter(r=>r.id===pending.id):[];
   if(!pending.receipt&&recorded.length===1){pending.receipt=recorded[0];acknowledged=true;storage.setItem(storageKey,JSON.stringify(pending));}
   if(!pending.receipt){
    if(!Array.isArray(records)||recorded.length>1)throw Error('Knowledge receipts are unavailable or ambiguous.');
    try{pending.receipt=await api('brain/submit',pending.body,{key:pending.key})}catch(error){rejected=[400,403,404,422].includes(error.status)||error.code==='librarian_unconfigured';throw error}acknowledged=true;
    storage.setItem(storageKey,JSON.stringify(pending));records=await api('brain/submissions');
   }
   const receipt=verifyKnowledgeReceipt(pending.receipt,pending,records);
   storage.removeItem(storageKey);pending=null;
   if(current()){inputs.forEach(input=>input.value='');show('Submission confirmed. Librarian curation is pending.');onConfirmed(receipt);}
  }catch(error){
   if(!acknowledged&&rejected){
    storage.removeItem(storageKey);pending=null;show(error.message);
   }else show(error.message+(pending?' The outcome is unconfirmed. Check the same request; do not create a second submission.':''));
  }finally{busy=false;controls();}
 };
}
