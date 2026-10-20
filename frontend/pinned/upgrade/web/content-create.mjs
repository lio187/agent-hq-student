const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function verifyCreatedItem(item,attempt,id=null){
 if(!item||typeof item.id!=='string'||!item.id||id&&item.id!==id||item.accountId!==attempt.body.accountId||item.title!==attempt.body.title||item.revision!==1||item.status!=='Idea')throw Error('The source does not confirm this new content idea.');
 return item;
}
// `title` pre-fills a new idea (Studio: "Turn into an idea" from a post); creating still needs the button.
export function mountContentCreate(container,{api,account='',title:initial='',onConfirmed,storage=sessionStorage}){
 const key='hq-content-create';let pending=null,busy=false,blocked=false;
 try{pending=JSON.parse(storage.getItem(key)||'null');if(pending&&(!pending.key||pending.body?.action!=='item.create'||!['187n','liogpt','lio'].includes(pending.body.accountId)))throw Error('Invalid attempt')}catch{blocked=true}
 const selected=pending?.body.accountId||account;
 container.innerHTML=`<form data-self-busy data-content-create><label>Account<select name="accountId" required><option value="">Choose an account</option>${['187n','liogpt','lio'].map(a=>`<option value="${a}" ${a===selected?'selected':''}>@${a}</option>`).join('')}</select></label><label>Title<input name="title" required maxlength="180" value="${esc(pending?.body.title||String(initial).slice(0,180))}"></label><p role="status"></p><button type="submit">Create idea</button></form>`;
 const form=container.querySelector('form'),button=form.querySelector('button'),status=form.querySelector('[role=status]'),title=form.querySelector('[name=title]'),select=form.querySelector('select');
 const current=()=>container.isConnected&&container.querySelector('form')===form&&(!container.closest('dialog')||container.closest('dialog').open);
 function controls(){button.disabled=busy||blocked;title.disabled=select.disabled=busy||Boolean(pending)||blocked;button.textContent=pending?'Check creation':'Create idea'}
 controls();if(blocked)status.textContent='The earlier request cannot be read. Nothing is created.';else if(pending)status.textContent='First check the earlier creation for @'+pending.body.accountId+'.';
 form.onsubmit=async e=>{
  e.preventDefault();if(busy||blocked)return;
  if(!pending){
   const text=title.value.trim(),accountId=select.value;
   if(!text||text.length>180||!['187n','liogpt','lio'].includes(accountId)){status.textContent='Enter a title and explicitly choose an account.';return}
   pending={key:crypto.randomUUID(),body:{action:'item.create',title:text,accountId}};
   try{storage.setItem(key,JSON.stringify(pending))}catch{pending=null;status.textContent='The request could not be stored locally. Nothing was created.';return}
  }
  busy=true;controls();let acknowledged=Boolean(pending.receipt);
  try{
   if(!pending.receipt){const receipt=await api('workspace/team/content',pending.body,{key:pending.key});acknowledged=true;verifyCreatedItem(receipt,pending);pending.receipt=receipt;storage.setItem(key,JSON.stringify(pending))}
   const detail=await api('workspace/team/item?id='+encodeURIComponent(pending.receipt.id));verifyCreatedItem(detail.item,pending,pending.receipt.id);
   if(current()){status.textContent='Idea created and confirmed in the source.';await onConfirmed(detail.item)}
   storage.removeItem(key);pending=null;blocked=true;
  }catch(error){
   if(!acknowledged&&error.code==='team_rejected'&&[400,401,403,404,405,409,422].includes(error.status)){storage.removeItem(key);pending=null}
   if(current())status.textContent=error.message+(pending?' Check the same request before creating a new idea.':'');
  }finally{busy=false;controls()}
 };
}
