const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function runtimeSummary(boot){
 const observed=boot?.observed_at?new Date(boot.observed_at*1000).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Not observed';
 return '<section class="card"><h2>Execution access</h2><p class="source">Last HQ capability check: '+esc(observed)+'</p><div class="list">'+
 '<article class="row"><div><strong>Hermes</strong><small>'+esc(boot?.connected?'Runtime capability endpoint responded. Individual task, model and tool checks still apply.':'No confirmed runtime connection at the last check.')+'</small></div></article>'+
 '<article class="row"><div><strong>Grok Bot</strong><small>Manual handoff. Local Council configuration is not proof of live bot access or execution. No dispatch connector is available here.</small></div></article>'+
 '<article class="row"><div><strong>Codex / Motor</strong><small>Codex project work and Motor app access are separate. Motor configuration is unverified; manual handoff only. No Motor dispatch connector is available here.</small></div></article></div></section>';
}
export function createRuntimePanel({root,api,getBoot}){
 let prepared=null;
 root.addEventListener('input',event=>{const form=event.target.closest('#runtime-handoff-form');if(!form)return;prepared=null;form.querySelector('[data-handoff-download]').hidden=true;form.querySelector('[data-handoff-output]').textContent='';form.querySelector('[data-handoff-status]').textContent='Inputs changed. Prepare a new package before downloading.'});
 root.addEventListener('submit',async event=>{
  if(event.target.id!=='runtime-handoff-form')return;
  event.preventDefault();const form=event.target,button=form.querySelector('button[type="submit"]'),status=form.querySelector('[data-handoff-status]'),output=form.querySelector('[data-handoff-output]'),download=form.querySelector('[data-handoff-download]');
  if(button.disabled)return;const body=Object.fromEntries(new FormData(form));button.disabled=true;form.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=true);prepared=null;download.hidden=true;output.textContent='';status.textContent='Checking the original task…';
  try{prepared=await api('workspace/runtime/handoff',body);output.textContent=JSON.stringify(prepared,null,2);download.hidden=false;status.textContent='Package prepared. Not sent; no external task has been created.'}
  catch(error){status.textContent=error.message}
  finally{button.disabled=false;form.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=false)}
 });
 root.addEventListener('click',event=>{
  if(!event.target.closest('[data-handoff-download]')||!prepared)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(prepared,null,2)+'\n'],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='manual-handoff-'+prepared.package_sha256.slice(0,12)+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 return ()=>runtimeSummary(getBoot())+'<section class="card"><h2>Prepare a manual handoff</h2><p>Use an existing idle task from Work. Recheck both the original task and the receiving app before submitting it manually. This creates a package, not a second task queue.</p><form id="runtime-handoff-form"><label>Board<select name="board"><option>leon-os</option><option>187n-delivery</option><option>agent-hq</option></select></label><label>Original task ID<input name="task_id" required maxlength="160"></label><label>Receiving runtime<select name="runtime"><option value="grokbot">Grok Bot</option><option value="motor">Motor</option></select></label><label>Brief and approved input<textarea name="brief" required maxlength="6000"></textarea></label><label>Acceptance criteria<textarea name="acceptance" required maxlength="3000"></textarea></label><button type="submit">Prepare package</button><p data-handoff-status role="status"></p><pre class="script-reader" data-handoff-output></pre><button type="button" data-handoff-download hidden>Download unsent package</button></form></section>';
}
