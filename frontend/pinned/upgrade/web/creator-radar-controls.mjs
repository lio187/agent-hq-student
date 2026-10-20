const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function radarRequest(settings,{storage=globalThis.sessionStorage,cryptoAPI=globalThis.crypto,fresh=false}={}){
 const signature=JSON.stringify(settings);
 const hash=Array.from(new Uint8Array(await cryptoAPI.subtle.digest('SHA-256',new TextEncoder().encode(signature))),b=>b.toString(16).padStart(2,'0')).join('');
 const key='hq.creator.radar.'+hash;
 try{const id=fresh?cryptoAPI.randomUUID():storage.getItem(key)||cryptoAPI.randomUUID();storage.setItem(key,id);return {requestId:id,...settings}}
 catch{throw Error('Retry storage unavailable. No Radar request was submitted.')}
}
export function radarSettings(watchlist,fields){
 if(!watchlist||!/^[a-f0-9]{64}$/.test(watchlist.revision||''))throw Error('Reload the saved watchlist first.');
 const offline=fields.collection==='saved',push=fields.delivery==='push',reuseMaxAge=Number(fields.reuseMaxAge);
 if(!['saved','new'].includes(fields.collection)||!['local','push'].includes(fields.delivery)||!Number.isFinite(reuseMaxAge)||reuseMaxAge<0||reuseMaxAge>8760)throw Error('Choose collection, delivery and reuse settings.');
 if(!offline&&fields.spend!=='on')throw Error('Confirm provider spending before collecting new analyses.');
 if(push&&fields.send!=='on')throw Error('Confirm delivery to the configured Content HQ account.');
 return {watchlist:watchlist.name,expectedRevision:watchlist.revision,offline,push,reuseMaxAge,authorizeSpend:fields.spend==='on',authorizeDelivery:fields.send==='on'};
}
export function createRadarControls({root,read,write,refresh}){
 let watchlists=[];
 root.addEventListener('submit',async event=>{
  if(event.target.id!=='creator-radar-start')return;event.preventDefault();const form=event.target,button=event.submitter,status=form.querySelector('[data-radar-status]');if(!button||button.disabled)return;
  const fields=Object.fromEntries(new FormData(form));let settings;try{settings=radarSettings(watchlists.find(w=>w.name===fields.watchlist),fields)}catch(error){status.textContent=error.message;return}
  const controls=[...form.querySelectorAll('input,select,button')];controls.forEach(c=>c.disabled=true);
  try{
   const request=await radarRequest(settings,{fresh:button.value==='new'});
   if(button.value==='new'){status.textContent='New batch prepared. Review the settings and select Start / check batch.';return}
   status.textContent='Submitting the saved request once…';const receipt=await write('radar/batches',request);
   const state=await read('radar/batches');const actual=state.batches?.find(b=>b.id===request.requestId);
   if(!actual||actual.id!==receipt.id)throw Error('No matching source readback. Keep this request and check the batch list before retrying.');
   await refresh();
  }catch(error){status.textContent=error.message}finally{controls.forEach(c=>c.disabled=false)}
 });
 root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-radar-action]');if(!button||button.disabled)return;const status=button.parentElement.querySelector('[data-radar-status]');button.disabled=true;
  try{status.textContent='Checking the original batch…';await write('radar/batches/'+encodeURIComponent(button.dataset.radarId)+'/'+button.dataset.radarAction,{});await refresh()}catch(error){status.textContent=error.message;button.disabled=false}
 });
 return async()=>{
  let state,data;try{[state,data]=await Promise.all([read('radar/batches'),read('watchlists')])}catch{return '<section class="card"><h2>Run Radar</h2><p>The source does not currently provide batch controls. Refresh after checking Creator Lab.</p></section>'}
  watchlists=(data.watchlists||[]).filter(w=>!w.error);
  const batches=(state.batches||[]).map(batch=>'<article class="row"><div><strong>'+esc(batch.request?.watchlist)+' · '+esc(batch.status)+'</strong><small>'+esc(batch.id)+' · '+esc(batch.createdAt)+' · '+(batch.request?.offline?'Saved analyses only':'New analysis allowed')+' · '+(batch.request?.push?'Delivery enabled':'Local drafts')+'</small><p>'+esc(batch.note||'')+'</p>'+(batch.reportId?'<p class="source">Report ID '+esc(batch.reportId)+'</p>':'')+(['accepted','running'].includes(batch.status)?'<button data-radar-action="cancel" data-radar-id="'+esc(batch.id)+'">Request stop</button>':batch.status==='interrupted'?'<button data-radar-action="reconcile" data-radar-id="'+esc(batch.id)+'">Check final report for recovery</button>':'')+'<p data-radar-status role="status"></p></div></article>').join('');
  return '<section class="card"><h2>Run Radar</h2><p>Saved analyses mode makes no new provider calls. Local drafts mode prevents delivery, but permits provider spending when new analysis is selected. Reuse age determines which saved runs qualify.</p>'+(state.blocked?'<p class="notice">Source work is active or needs reconciliation. New batches are blocked.</p>':'')+'<form id="creator-radar-start"><label>Saved watchlist<select name="watchlist" required>'+watchlists.map(w=>'<option value="'+esc(w.name)+'">'+esc(w.name)+' · '+esc(w.accountId)+' · Estimated cap $'+esc(w.spendCapUsd)+'</option>').join('')+'</select></label><label>Collection<select name="collection"><option value="saved">Saved analyses only</option><option value="new">Allow new paid analyses</option></select></label><label>Delivery<select name="delivery"><option value="local">Local drafts only</option><option value="push">Deliver to configured Content HQ</option></select></label><label>Reuse analyses up to (hours)<input name="reuseMaxAge" type="number" min="0" max="8760" value="20" required></label><label><input name="spend" type="checkbox">I authorize provider spending under the saved watchlist settings. Total cost is an estimate, not a hard provider limit.</label><label><input name="send" type="checkbox">I authorize delivery to the configured Content HQ account.</label><button type="submit" value="start">Start / check batch</button><button type="submit" value="new">Prepare another batch</button><p data-radar-status role="status"></p></form><h3>Source batches</h3>'+batches+'<p>Use Refresh to read current status. Stop requests let in-flight calls finish. Recovery never reruns a batch.</p></section>';
 };
}
