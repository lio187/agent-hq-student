(() => {
 try{if(typeof window!=='undefined'&&window.top!==window)document.documentElement.classList.add('embedded')}catch{}
 const $=id=>document.getElementById(id);let preview=null,busy=false;
 const status=text=>{$('status').textContent=text};
 async function read(path){const r=await fetch('/api/'+path,{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error?.message||d.error||'Source unavailable');return d}
 async function post(path,body){
  const health=await fetch('/api/health',{cache:'no-store'});if(!health.ok)throw Error('Source is disconnected');
  const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Operator-CSRF':health.headers.get('X-Operator-CSRF')||''},body:JSON.stringify(body)});
  const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error?.message||d.error||'Request has no confirmed receipt');return d;
 }
 function discard(){preview=null;$('review').hidden=true;$('confirm').disabled=true}
 for(const id of ['channel','recipient','message'])$(id).addEventListener('input',()=>{if(!busy)discard()});
 $('discard').onclick=()=>{discard();status('Preview discarded. Nothing sent.')};
 $('compose').onsubmit=async e=>{
  e.preventDefault();if(busy)return;discard();busy=true;$('prepare').disabled=true;
  const target=($('channel').value==='whatsapp-local'?'whatsapp-local:':'')+$('recipient').value.trim(),text=$('message').value.trim();
  try{const local=$('channel').value==='whatsapp-local',d=await post(local?'whatsapp/preview':'actions/preview',{domain:'messaging',operation:'send',target:local?target.replace('whatsapp-local:',''):target,payload:{text},idempotencyKey:crypto.randomUUID()});preview={id:d.action.id,target,text,local,expires:d.action.expiresAt};$('review-target').textContent=target;$('review-text').textContent=text;$('expiry').textContent='Expires '+preview.expires;$('review').hidden=false;$('confirm').disabled=false;status('Preview ready. Nothing sent.')}
  catch(e){status(e.message)}finally{busy=false;$('prepare').disabled=false}
 };
 $('confirm').onclick=async()=>{
  if(!preview||busy)return;
  const target=($('channel').value==='whatsapp-local'?'whatsapp-local:':'')+$('recipient').value.trim();
  if(target!==preview.target||$('message').value.trim()!==preview.text){discard();status('Message changed. Create a new preview.');return}
  if(Date.parse(preview.expires)<=Date.now()){discard();status('Preview expired. Create a new preview.');return}
  busy=true;for(const id of ['channel','recipient','message'])$(id).disabled=true;$('confirm').disabled=true;$('prepare').disabled=true;$('discard').disabled=true;
  try{const d=await post((preview.local?'whatsapp/':'actions/')+encodeURIComponent(preview.id)+'/confirm',{});if(d.action?.status!=='confirmed')throw Error('No confirmed send receipt');status('Sent. Provider receipt recorded.');$('message').value='';discard();await refresh()}
  catch(e){status(e.message+' — use Confirm send to check this same action again.');$('confirm').disabled=false}
  finally{busy=false;for(const id of ['channel','recipient','message'])$(id).disabled=false;$('prepare').disabled=false;$('discard').disabled=false}
 };
 function when(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?'':d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
 async function refresh(){
  $('refresh').disabled=true;const results=await Promise.allSettled([read('chats/records?limit=100'),read('whatsapp/history')]);$('records').replaceChildren();
  $('source-status').textContent=results.map(r=>r.status==='fulfilled'?(r.value.source||'Channel')+': '+(r.value.reason||r.value.syncState||'unknown'):r.reason.message).join(' · ');
  const rows=results.flatMap(result=>result.status==='fulfilled'?result.value.records||[]:[]).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  for(const r of rows){const item=document.createElement('article');item.className='record';const title=document.createElement('strong');title.textContent=r.data?.title||r.data?.name||r.externalId||'Record';const meta=document.createElement('small');meta.textContent=[r.source,when(r.updatedAt)].filter(Boolean).join(' · ');item.append(title,meta);const body=r.data?.content||r.data?.text||r.data?.last_message;if(body&&body!==title.textContent){const text=document.createElement('span');text.textContent=body;item.append(text)}$('records').append(item)}
  if(!rows.length){const none=document.createElement('p');none.className='empty-records';none.textContent='No channel records yet.';$('records').append(none)}
  $('refresh').disabled=false;
 }
 $('refresh').onclick=refresh;refresh();
})();
