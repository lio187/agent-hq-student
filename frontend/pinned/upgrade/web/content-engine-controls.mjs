import {label} from './labels.mjs';
import {reviewContext} from './content-review.mjs';
import * as kit from './page-kit.mjs';
import {freshnessBanner} from './freshness.mjs';
// Production, review and the account network on the page kit (Phase 3.3, 7 Oct 2026): every page reads first
// (tiles, charts, status rows, tables) and the forms open in the dialog behind a button. The forms keep their
// [data-engine-form] attribute, so the one submit listener on `root` still handles them, with the same
// read-back and conflict rules. The builders live in marketing-visuals.mjs (a lazy chunk).
const visuals=()=>import('./marketing-visuals.mjs');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actionAllowed=(data,action)=>Array.isArray(data.controlActions)&&data.controlActions.includes(action);
const waitingForHooks=(data,id)=>(data.jobs||[]).some(j=>j.itemId===id&&j.kind==='hooks.generate'&&['queued','running'].includes(j.status));
export function verifyEngineReadback(body,receipt,data){
 if(!receipt||!data)return false;
 if(['account.update','budget.set'].includes(body.action)&&!receipt.controlRevision)return false;
 if(body.action==='account.update')return receipt.id===body.id&&(!body.expectedAccount||body.id===body.expectedAccount)&&data.accountRegistry?.some(a=>a.id===body.id&&a.controlRevision===receipt.controlRevision);
 if(body.action==='budget.set')return data.budget?.controlRevision===receipt.controlRevision;
 if(body.action==='review.decide'){
  const accountOf=row=>row?.accountRegistryId||row?.accountId;
  const matchesAccount=row=>!body.expectedAccount||accountOf(row)===body.expectedAccount;
  if(receipt.item?.id!==body.id||!matchesAccount(receipt.item))return false;
  if(!data.items?.some(i=>i.id===body.id&&i.revision===receipt.item.revision&&i.status===receipt.item.status&&matchesAccount(i)))return false;
  for(const received of [receipt.job,receipt.queued].filter(Boolean)){
   if(received.itemId!==body.id||!matchesAccount(received)||!data.jobs?.some(j=>j.id===received.id&&j.itemId===body.id&&j.status===received.status&&matchesAccount(j)))return false;
  }
  return true;
 }
 if(body.action==='job.create'){
  const belongs=job=>job?.itemId===body.itemId&&(!body.expectedAccount||(job.accountRegistryId||job.accountId)===body.expectedAccount);
  return Boolean(receipt.id&&belongs(receipt)&&data.jobs?.some(j=>j.id===receipt.id&&belongs(j)));
 }
 return false;
}
export async function engineMutation(api,body,selection=null){
 const receipt=await api('workspace/team/content',body);
 let data;try{data=await api('workspace/team/content'+(selection?'?'+new URLSearchParams(selection):''))}catch{throw Error('Change received, but the source check failed. Do not resubmit; reload the source to verify.')}
 if(!verifyEngineReadback(body,receipt,data))throw Error('The source changed after the edit or is not confirmed. Reload and check the result before continuing.');
 return {receipt,data};
}
export function createEngineControls({api,root,filters,getSerial,refresh,mediaHTML,preview=null,getReviewSelection=()=>({business:'all',account:'all'}),getProductionSelection=()=>({business:'all',account:'all'}),getAccountSelection=()=>({business:'all',account:'all'})}){
 let data,busy=false,uncertain=false,loadedSelection=null,mv=null;
 const allowed=action=>actionAllowed(data||{},action)&&!uncertain;
 const disabled=action=>allowed(action)?'':'disabled';
 const number=v=>Number(v).toLocaleString('en-GB');
 // Values stay exactly what the source expects; only the visible text is in plain language.
 const option=(values,current)=>values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(label(v))}</option>`).join('');
 // Source date and account scope first; how the controls behave sits in a collapsed note (7 Oct 2026). These pages
 // have no Account select of their own, so a narrowed account is named on screen with a way back to all accounts.
 const summary=()=>(data?.sync?freshnessBanner(data.sync,{esc,what:'Team content'}):'')
  +(loadedSelection?.account&&loadedSelection.account!=='all'?'<p class="pk-scope" role="status">Showing @'+esc(loadedSelection.account)+' only, the account chosen on Content. <button type="button" data-action="account-all">Show all accounts</button></p>':'')
  +'<details class="pk-source"><summary>How these controls work</summary><p>They act on the existing Content HQ source. Every change is read back, and a conflict stops the action. Reviewing publishes nothing. New production or hooks only start on your instruction.</p></details><p data-engine-status role="status"></p>';
 const openButton=(text,target,primary=false)=>'<button type="button"'+(primary?' class="primary"':'')+' data-action="engine-open" data-id="'+esc(target)+'">'+esc(text)+'</button>';
 async function load(selection=null){loadedSelection=selection;const ticket=getSerial(),[result,module]=await Promise.all([api('workspace/team/content'+(selection?'?'+new URLSearchParams(selection):'')),visuals()]);if(ticket!==getSerial())return false;data=result;mv=module;uncertain=false;filters('');return true}

 // ── Forms (opened in the dialog) ──
 const JOB_KINDS=['hooks.generate','hooks.rank','lane.yap','lane.tutorial','lane.splitscreen','lane.lifestyle','lane.remake','lane.clips','lane.motion','lane.carousel','lane.stories','publish.draft'];
 // A preset lane (Studio shortcuts: carousel, stories) only preselects the workflow; the form still needs Start.
 const jobForm=(preset='lane.stories')=>`<form class="pk-form" data-engine-form="job.create">${loadedSelection&&loadedSelection.business!=='all'&&!allowed('job.create')?'<p class="notice">The connected source does not support account-checked production yet.</p>':''}<label>Content item<select name="itemId" required>${(data.items||[]).filter(i=>i.status!=='Archived').map(i=>`<option value="${esc(i.id)}">${esc(i.title)} · ${esc(i.status)}</option>`).join('')}</select></label><label>Workflow<select name="kind">${option(JOB_KINDS,JOB_KINDS.includes(preset)?preset:'lane.stories')}</select></label><label>Target account<select name="accountRegistryId">${(data.accountRegistry||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.handle||a.name)}</option>`).join('')}</select></label><label>Source recordings (one existing source reference per line)<textarea name="footage"></textarea></label><label>Reference URL<input name="referenceUrl" type="url"></label><label>Long-form source reference<input name="longformPath"></label><p>Hooks/ranking can use model budget. publish.draft only creates a draft; the existing review, account, budget and duplicate checks remain required.</p><p data-engine-status role="status"></p><button type="submit" ${disabled('job.create')}>Start job</button></form>`;
 const accountForm=a=>`<form class="pk-form" data-engine-form="account.update" data-id="${esc(a.id)}"><p class="source">${esc(a.platform||'Platform not reported')} · ${esc(a.health?.level||'Health not measured')}${a.pausedReason?' · '+esc(a.pausedReason):''} · Effective limit ${esc(a.effectiveCap??'—')} · Used today ${esc(a.usedToday??'—')}</p><label>Handle<input name="handle" value="${esc(a.handle)}"></label><label>Status<select name="status">${option(['planned','warmup','active','paused'],a.status)}</select></label><label>Feed limit<input name="capFeed" type="number" min="0" max="50" value="${esc(a.capFeed)}" required></label><label>Trial limit<input name="capTrial" type="number" min="0" max="50" value="${esc(a.capTrial)}" required></label><label>Provider account ID<input name="providerId" value="${esc(a.providerId)}"></label><label>Warm-up start<input name="warmupStartedAt" value="${esc(a.warmupStartedAt)}" placeholder="ISO date or empty"></label><label>Pause reason<textarea name="pauseReason">${esc(a.pauseReason)}</textarea></label>${allowed('account.update')?'':'<p class="notice">Account controls are not available through this connection or permissions. The source is read only.</p>'}<p data-engine-status role="status"></p><button type="submit" ${disabled('account.update')}>Save account</button></form>`;
 const budgetForm=()=>{const budget=data.budget||{};return `<form class="pk-form" data-engine-form="budget.set"><p>The daily limit and the emergency stop apply to every account.</p><label>Daily limit (euro cents)<input name="limitCents" type="number" min="50" max="10000" value="${esc(budget.limitCents)}" required></label><label><input type="checkbox" name="killSwitch" ${budget.killSwitch?'checked':''}>Emergency stop enabled</label><p data-engine-status role="status"></p><button type="submit" ${disabled('budget.set')}>Save settings</button></form>`};
 // What a dialog shows for a target: "job:new", "job:<id>", "account:<id>" or "budget". Null when it no longer exists.
 function dialog(target){
  if(!data||!mv)return null;
  const raw=String(target||''),at=raw.indexOf(':'),kind=at<0?raw:raw.slice(0,at),id=at<0?'':raw.slice(at+1);
  if(kind==='job'&&(id==='new'||id.startsWith('new:')))return {title:'Start a production job',html:jobForm(id.slice(4)||undefined)};
  if(kind==='job'){const job=(data.jobs||[]).find(j=>j.id===id);if(!job)return null;const item=(data.items||[]).find(i=>i.id===job.itemId);return {title:mv.jobKind(job.kind)+(item?' · '+item.title:''),html:mv.jobDetail(job,{esc,item,mediaHTML,data})}}
  if(kind==='account'){const a=(data.accountRegistry||[]).find(x=>x.id===id);return a?{title:'Account · '+(a.handle||a.name||a.id),html:accountForm(a)}:null}
  if(kind==='budget')return loadedSelection?.business==='all'||!loadedSelection?{title:'Budget & emergency stop',html:budgetForm()}:null;
  return null;
 }
 function open(target){
  const d=dialog(target);if(!d)return false;
  if(preview)preview(d.title,d.html);
  else{root.querySelector('#preview-title').textContent=d.title;root.querySelector('#preview-body').innerHTML=d.html;root.querySelector('#preview').showModal()}
  return true;
 }

 // ── Pages ──
 async function accounts(){
  const selection=getAccountSelection();
  if(!await load(selection))return '';
  if(!Array.isArray(data.accountRegistry)||!data.accountRegistry.length)return '<p class="notice">The connected Team Hub version does not provide the account register yet. Update to the tested release to connect this part.</p>';
  const editable=allowed('account.update'),shared=selection.business==='all';
  return summary()+(!editable?'<p class="notice">Account controls are not available through this connection or permissions. The source is read only.</p>':'')
   +mv.accountTiles(data.accountRegistry,data.budget,{esc,number})+mv.accountBand(data.accountRegistry,{esc})
   +kit.panel('Accounts',mv.accountStatusRows(data.accountRegistry,{esc,editable})
    +(shared?'<div class="actions">'+openButton('Change budget & emergency stop','budget')+'</div>':'<p class="notice">Budget and emergency stop apply to all accounts. Choose All businesses to manage these shared settings.</p>'),{esc,meta:data.accountRegistry.length+' in the register'});
 }
 async function review(fallback){
  const selection=getReviewSelection();
  if(!await load(selection))return '';
  const candidates=(data.items||[]).filter(i=>i.status==='To Review'),results=(data.jobs||[]).filter(j=>j.status==='review').length;
  if(!actionAllowed(data,'review.decide')){
   if(selection.business==='all')return fallback();
   return summary()+'<p class="notice">The connected source does not support account-scoped review decisions yet.</p>'+mv.reviewTiles({candidates,results},{esc,number})+kit.panel('Review queue',mv.reviewQueue(candidates,{esc,jobs:data.jobs||[],action:null}),{esc,meta:candidates.length+' waiting'});
  }
  const waiting=candidates.filter(i=>waitingForHooks(data,i.id)),items=candidates.filter(i=>!waitingForHooks(data,i.id));
  const granted=Boolean(data.integrationCapabilities?.media);
  return summary()+mv.reviewTiles({candidates:items,waiting,results},{esc,number})+mv.mediaAccessRow(granted,{esc})
   +(waiting.length?kit.panel('Waiting for new hooks · '+waiting.length,'<ul class="pk-list">'+waiting.map(i=>`<li>${esc(i.title)} · @${esc(i.accountId)} · revision ${esc(i.revision)}</li>`).join('')+'</ul><p class="pk-note">Reviewing becomes available once the running hook job finishes. Refresh to check the source again.</p>',{esc}):'')
   // Split view (7 Oct 2026): the queue on the left, the chosen item and its decision form beside it; j/k and Enter pick.
   +(items.length?'<div class="pk-split review-split">'+kit.panel('Review queue',mv.reviewQueue(items,{esc,jobs:data.jobs||[]}),{esc,meta:items.length+' to review'})+'<div class="review-detail">'+items.map((i,index)=>{
    const job=(data.jobs||[]).filter(j=>j.itemId===i.id&&j.status==='review'&&j.kind!=='publish.draft').sort((a,b)=>String(b.finishedAt||b.createdAt).localeCompare(String(a.finishedAt||a.createdAt)))[0];
    return `<form class="surface" data-engine-form="review.decide" data-id="${esc(i.id)}" data-review-item="${esc(i.id)}"${index===0?'':' hidden'}><h2>${esc(i.title)}</h2><p class="source">@${esc(i.accountId)} · revision ${esc(i.revision)} · ${esc(job?mv.jobKind(job.kind):'No review job')}</p>${reviewContext(i,job,data,mediaHTML)}<label>Feedback<textarea name="note" maxlength="4000"></textarea></label><label>Decision<select name="decision">${option(['approve','reject','rehook'],'approve')}</select></label><button type="submit" ${disabled('review.decide')}>Confirm decision</button></form>`;
   }).join('')+'</div></div>':'<p class="dt-empty">No items are waiting for review.</p>');
 }
 async function production(){
  const selection=getProductionSelection();
  if(!await load(selection))return '';
  const jobs=data.jobs||[];
  return summary()+mv.jobTiles(jobs,data.budget,{esc,number})+mv.jobBand(jobs,{esc})
   +(selection.business!=='all'&&!allowed('job.create')?'<p class="notice">The connected source does not support account-checked production yet. Existing jobs remain visible.</p>':'')
   +kit.panel('Production jobs','<div class="actions">'+openButton('Start a production job','job:new',true)+'</div>'+mv.jobsTable(jobs,data.items,{esc}),{esc,meta:jobs.length+' recorded'});
 }
 root.addEventListener('submit',async e=>{
  const form=e.target;if(!form.matches?.('[data-engine-form]'))return;e.preventDefault();
  const action=form.dataset.engineForm;if(busy||!allowed(action))return;
  const values=Object.fromEntries(new FormData(form));let body;
  if(action==='account.update'){
   const a=data.accountRegistry.find(a=>a.id===form.dataset.id);if(!a)return;
   body={action,id:a.id,controlRevision:a.controlRevision,...(loadedSelection&&loadedSelection.business!=='all'?{expectedAccount:loadedSelection.account}:{}),patch:{handle:values.handle,status:values.status,capFeed:Number(values.capFeed),capTrial:Number(values.capTrial),providerId:values.providerId||null,warmupStartedAt:values.warmupStartedAt||null,pauseReason:values.pauseReason}};
  }else if(action==='budget.set')body={action,controlRevision:data.budget.controlRevision,limitCents:Number(values.limitCents),killSwitch:values.killSwitch==='on'};
  else if(action==='review.decide'){const item=data.items.find(i=>i.id===form.dataset.id);if(!item||item.status!=='To Review'||waitingForHooks(data,item.id))return;body={action,id:item.id,revision:item.revision,decision:values.decision,note:values.note,...(loadedSelection?.business!=='all'&&loadedSelection?{expectedAccount:loadedSelection.account}:{})}}
  else{const item=data.items.find(i=>i.id===values.itemId);if(!item)return;body={action,itemId:item.id,revision:item.revision,kind:values.kind,accountRegistryId:values.accountRegistryId,estimateCents:100,...(loadedSelection&&loadedSelection.business!=='all'?{expectedAccount:loadedSelection.account}:{}),laneInput:{footage:String(values.footage).split('\n').map(s=>s.trim()).filter(Boolean),referenceUrl:values.referenceUrl,longformPath:values.longformPath}}}
  // A form in the dialog reports there; page forms report in the page's status line.
  const box=form.closest?.('dialog'),status=()=>form.querySelector('[data-engine-status]')||root.querySelector('[data-engine-status]');
  const ticket=getSerial();busy=true;root.querySelectorAll('[data-engine-form] button').forEach(b=>b.disabled=true);
  try{await engineMutation(api,body,['review.decide','job.create','account.update'].includes(action)?loadedSelection:null);if(ticket!==getSerial())return;if(box?.open)box.close();await refresh();const line=root.querySelector('[data-engine-status]');if(line)line.textContent='Saved and confirmed in the source.'}
  catch(error){if(ticket!==getSerial())return;uncertain=!error.status||error.status>=500||error.code==='team_action_uncertain';const line=status();if(line){line.setAttribute('role','alert');line.textContent=error.message}if(!uncertain)root.querySelectorAll('[data-engine-form]').forEach(f=>f.querySelectorAll('button').forEach(b=>b.disabled=!allowed(f.dataset.engineForm)))}
  finally{busy=false}
 });
 return {accounts,review,production,open,dialog};
}
