// Community & coaching (Phase 3.1, 7 Oct 2026): live counts from the agent's health snapshots, the support
// readiness ring and the open-question trend, per-source status rows, the questions and cases as tables,
// and the review flow in the detail dialog. Every safety listener is unchanged: save then read back,
// arm-then-confirm publishing (publish_once receipts on the server), dossier assessment and resolution.
import {tileRow,statusRows,chartBand,pageBanner,sourceDetails,panel,englishMap,dayLabel} from './page-kit.mjs';
import {dataTable,stagePill,relativeTime} from './data-table.mjs';
import {ring,sparkline} from './viz.mjs';
import {loadingView} from './ui.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageLabels={unreviewed:'To review',draft:'Draft',review:'Answer in review',coaching:'Coaching list',archived:'Review archived'};
const selectedSources=(item,ids)=>item.catalogue.filter(l=>ids.includes(l.id)).map(l=>`<details open><summary>${esc(l.id)} · ${esc(l.title)}</summary><p style="white-space:pre-wrap">${esc(l.excerpt)}</p></details>`).join('')||'<p>Select a lesson to read the source excerpt.</p>';
export function reviewReadbackMatches(receipt,detail){
 return !!receipt&&detail?.draft?.revision===receipt.revision&&detail.draft.fingerprint===receipt.fingerprint&&detail.id===receipt.id&&detail.questionRevision===receipt.questionRevision&&detail.receiptRevision===receipt.receiptRevision&&detail.courseRevision===receipt.courseRevision;
}
export async function saveCommunityReview(api,body,working){
 const submitted=working?.get(body.id);
 const receipt=await api('workspace/community/review',body);
 const detail=await api('workspace/community/review/'+encodeURIComponent(body.id));
 if(!reviewReadbackMatches(receipt,detail))throw Error('The source does not confirm this version. Reopen the draft before continuing.');
 // Input events replace the working object. A delayed receipt may only clear
 // the version submitted, never edits made while the write/readback was pending.
 if(working?.get(body.id)===submitted)working?.delete(body.id);
 return detail;
}

export function renderSupportCase(c){
 if(!c)return '';
 const o=c.observation||{},review=o.review||{},draft=o.draft||{};
 return `<section class="surface"><h2>Support dossier</h2><p>${esc(c.status)} · Owner: ${esc(c.owner)} · ${c.messages.length} member messages</p>
 ${(c.context||[]).map(m=>`<details><summary>${m.is_poster_admin?'Lio/team':'Member'} · ${esc(m.created_at)}</summary><p style="white-space:pre-wrap">${esc(m.content)}</p>${m.attachmentsPresent?'<p>Attachment supplied; see the original message when image details matter.</p>':''}</details>`).join('')}
 <h3>Questions and evidence review</h3>${(review.questions||c.questions||[]).map(q=>`<p>${esc(q.question||q.id)} · ${esc(q.status||'open')} ${esc(q.reason||'')}</p>`).join('')}
 <p>${esc((o.errors||[]).join(' · '))}</p><h3>Prepared answer · not sent</h3><p style="white-space:pre-wrap">${esc(draft.reply||'No supported answer prepared yet.')}</p>
 ${(o.sources||[]).map(d=>`<details><summary>${esc(d.course)} · ${esc(d.title)}</summary><p style="white-space:pre-wrap">${esc(d.excerpt)}</p><small>${esc(d.id)} · ${esc(d.revision)}</small></details>`).join('')}
 ${c.observationId?'<button type="button" data-support-assess="accept">Mark answer correct and relevant</button><button type="button" data-support-assess="reject">Reject answer</button><button type="button" data-support-assess="critical">Record critical failure</button>':''}
 <label>Evidence that the member’s problem is solved<textarea data-support-resolution rows="2"></textarea></label><button type="button" data-support-resolve>Mark dossier solved</button><p data-support-status role="status"></p></section>`;
}

export function renderCommunityDetail(item){
 const d=item.draft||{},question=item.question||{},parent=question.parent;
 return `${renderSupportCase(item.supportCase)}${parent?`<section class="surface"><h2>Direct parent message</h2><p>${esc(parent.title)}</p><p style="white-space:pre-wrap">${esc(parent.content)}</p><p>Whop ID: ${esc(parent.id)} · changed: ${esc(parent.updated_at||parent.created_at)}</p><p>This is message context, not a course source. ${parent.parent_id||parent.replying_to_message_id?'This message refers to an earlier message; the full discussion is not loaded here.':''}</p></section>`:''}<section class="surface"><h2>Original question</h2><p>${esc(question.title)}</p><p style="white-space:pre-wrap">${esc(question.content)}</p><p>Whop ID: ${esc(item.id)} · source status: ${esc(item.sourceStatus)} · changed: ${esc(question.updated_at||question.created_at)}</p></section>
 <section class="surface"><h2>Course and resource evidence</h2><p>Search results are source candidates. Check yourself whether they support the claim in your draft.</p>${item.suggestions.map(l=>`<details><summary>${esc(l.id)} · ${esc(l.title)}</summary><p style="white-space:pre-wrap">${esc(l.excerpt)}</p></details>`).join('')||'<p>No matching registered source found.</p>'}</section>
 <form data-community-form data-dirty="${item.unsaved?'true':'false'}" class="surface"><h2>Draft and coaching handover</h2><p>Version ${d.revision||0} · ${item.unsaved?'Unsaved input restored.':'Saved locally only.'} Saving keeps the draft local. Publishing is a separate action.</p><button type="button" data-community-open="${esc(item.id)}">Re-read source, keep text</button>
 <label>Answer type<select name="answerKind">${[['course','Course content'],['navigation','Navigation / access'],['coaching','Coaching question'],['general','General implementation advice']].map(([k,v])=>`<option value="${k}" ${k===(d.answerKind||'course')?'selected':''}>${v}</option>`).join('')}</select></label>
 <label>Suggested answer<textarea name="answer" maxlength="2800" rows="8">${esc(d.answer)}</textarea></label>
 <label>Consulted versioned sources (up to eight)<select name="lessonIds" multiple size="8">${item.catalogue.map(l=>`<option value="${esc(l.id)}" ${(d.lessonIds||[]).includes(l.id)?'selected':''}>${esc(l.id)} · ${esc(l.title)}</option>`).join('')}</select></label>
 <div data-community-selected-sources>${selectedSources(item,d.lessonIds||[])}</div>
 <label>Context for review or coaching<textarea name="note" maxlength="2000" rows="4">${esc(d.note)}</textarea></label>
 <label>Review status<select name="stage">${['draft','review','coaching','archived'].map(s=>`<option value="${s}" ${s===(d.stage||'draft')?'selected':''}>${stageLabels[s]}</option>`).join('')}</select></label>
 <button type="submit">Save locally and verify</button>${item.publishingAvailable&&d.stage==='review'&&d.publicationStatus!=='sent'&&!item.unsaved?'<button type="button" data-community-publish>Publish saved answer to Whop</button>':''}${d.publicationStatus==='sent'?'<p>Published to Whop and verified.</p>':''}<p data-community-status role="status"></p></form>`;
}

// Labels for the agent's own status words; unknown words pass through unchanged.
export const WHOP_STATUS={bootstrapped:'Imported',replied:'Replied',escalated:'Escalated','no-answer-needed':'No answer needed','clarification-needed':'Needs clarification','owner-review':'Owner review','partial-answer':'Partial answer','continued-in-followup':'Continued in follow-up','resolved-by-admin':'Resolved by admin','resolved-by-member':'Resolved by member','pending-reply':'Reply pending'};
export const DOSSIER_STATUS={'waiting-owner':'Waiting on owner',investigating:'Investigating','no-action-needed':'No action needed',solved:'Solved'};
const POLL_STALE_MINUTES=30;
const ok=r=>r?.status==='fulfilled'&&r.value&&typeof r.value==='object'?r.value:null;
const newest=values=>values.map(v=>[v,Date.parse(v)]).filter(([,t])=>Number.isFinite(t)).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;

export function communityTiles(health,receipts,{esc:e=esc}={}){
 const l=health?.latest,s=l?.statuses||receipts?.counts||{},d=l?.support?.dossiers;
 return tileRow([
  {label:'Waiting on a person',value:l?.openQuestions??receipts?.summary?.pendingHuman,caption:'Open questions the agent did not answer'},
  {label:'Overdue',value:l?.overdueQuestions,caption:'Past their reply window'},
  {label:'Replied',value:s.replied,caption:'Answered by the community agent'},
  {label:'Escalated',value:s.escalated,caption:'Handed to Lio or the team'},
  {label:'Open dossiers',value:d?.open,caption:d?'of '+(d.cases??'—')+' support dossiers'+(d.statuses?.['waiting-owner']?' · '+d.statuses['waiting-owner']+' waiting on the owner':''):'Support dossiers not reported'},
 ],{esc:e,number:String});
}

export function communityCharts(health,{esc:e=esc}={}){
 const r=health?.latest?.support?.readiness,series=(health?.series||[]).slice(-30);
 const label=p=>new Date(p.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 // A poll that did not report a count is left out, never drawn as 0 (7 Oct 2026).
 const open=sparkline(series.filter(p=>Number.isFinite(p.openQuestions)).map(p=>({label:label(p),value:p.openQuestions})),{esc:e,label:'Open questions per poll',format:String});
 const overdue=sparkline(series.filter(p=>Number.isFinite(p.overdueQuestions)).map(p=>({label:label(p),value:p.overdueQuestions})),{esc:e,label:'Overdue questions per poll',format:String});
 const readiness=r?'<div class="pk-ring-row">'+ring(r.accepted??0,r.reviewed??0,{esc:e,label:'Accepted of reviewed answers',tone:r.ready?'live':'warn',center:(r.accepted??0)+'/'+(r.reviewed??0)})+'<p><strong>'+e((r.accepted??0)+' of '+(r.reviewed??0)+' reviewed answers accepted')+'</strong><small>'+e([r.mode?r.mode[0].toUpperCase()+r.mode.slice(1)+' mode':'',r.observationHours!=null?Math.round(r.observationHours)+' h observed':'',r.samples!=null?r.samples+' samples':''].filter(Boolean).join(' · '))+'</small></p></div>'
  +statusRows((r.blockers||[]).map(b=>({label:b,state:'paused',reason:'blocks autonomous answers'})),{esc:e}):'';
 const last=series.at(-1);
 return chartBand({title:'Support readiness',meta:r?(r.ready?'ready':'not ready'):'',body:readiness,empty:'Readiness is not reported yet.'},
  {title:'Open questions',meta:'last '+series.length+' polls',body:open?'<p class="pk-spark-label">Open<b>'+e(last?.openQuestions??'—')+'</b></p>'+open+(overdue?'<p class="pk-spark-label">Overdue<b>'+e(last?.overdueQuestions??'—')+'</b></p>'+overdue:''):'',empty:'Not enough polls with open questions to draw a trend yet.'},{esc:e});
}

export function communitySources(health,queue,receipts,{esc:e=esc,now=Date.now()}={}){
 const l=health?.latest,poll=newest([l?.lastSuccessfulPollAt,receipts?.source?.lastSuccessfulPollAt,queue?.lastPollAt].filter(Boolean));
 const pollAge=poll?(now-Date.parse(poll))/60000:Infinity,u=l?.updates,j=l?.publisherJournals||{};
 const publisher=(label,x)=>x?{label,state:x.uncertainDeliveries?'stale':'current',reason:(x.delivered??0)+' delivered'+(x.uncertainDeliveries?' · '+x.uncertainDeliveries+' uncertain, check Whop':' · none uncertain'),at:l?.at,age:false}:{label,state:'unavailable',reason:'not reported'};
 return statusRows([
  {label:'Whop poll',state:poll?(pollAge>POLL_STALE_MINUTES?'stale':'current'):'unavailable',reason:poll?'last successful poll':'no successful poll recorded',at:poll},
  u?{label:'AI updates delivery',state:u.uncertain?'stale':u.overdue?'stale':u.status==='delivered'?'current':'paused',reason:(englishMap(u.status,{delivered:'delivered',pending:'pending',failed:'failed'})||'not reported')+(u.overdue?' · overdue':'')+(u.slot?' · slot '+dayLabel(u.slot):''),at:u.slot,age:false}:{label:'AI updates delivery',state:'unavailable',reason:'not reported'},
  publisher('Build-lab publisher',j.buildLab),
  publisher('Recurring-posts publisher',j.recurring),
 ],{esc:e,now});
}

const STAGES={unreviewed:'To review',draft:'Draft',review:'Answer in review',coaching:'Coaching list',archived:'Review archived'};
export function questionsTable(items,{esc:e=esc,now=Date.now()}={}){
 const stages=Object.keys(STAGES).filter(s=>items.some(i=>i.stage===s));
 return dataTable({id:'community-questions',esc:e,rows:items,pageSize:15,defaultSort:{key:'age',dir:'asc'},emptyText:'No questions to review.',
  tabs:stages.length>1?stages.map(s=>({id:s,label:STAGES[s],filter:i=>i.stage===s})):undefined,
  columns:[
   {key:'question',label:'Question',value:i=>i.reason||i.id,className:'dt-primary pk-cap',cell:i=>'<strong title="'+e(i.reason||'')+'">'+e(i.reason||'Question without a summary')+'</strong><small>'+e([i.space,STAGES[i.stage]||i.stage].filter(Boolean).join(' · '))+'</small>'},
   {key:'whop',label:'Whop status',value:i=>i.sourceStatus,cell:i=>stagePill(englishMap(i.sourceStatus,WHOP_STATUS)||'Not recorded',e)},
   {key:'dossier',label:'Dossier',className:'pk-hide-split',value:i=>i.caseStatus||'',cell:i=>i.caseStatus?stagePill(englishMap(i.caseStatus,DOSSIER_STATUS),e):'<span class="dt-muted">—</span>'},
   {key:'age',label:'Asked',value:i=>Date.parse(i.sourceAt)||null,cell:i=>'<span class="pk-stack"><span class="dt-muted pk-nowrap">'+e(relativeTime(i.sourceAt,now)||'—')+'</span>'+(i.overdue?'<span class="stage-pill" data-stage="overdue">Overdue</span>':i.dueAt?'<small class="dt-muted pk-nowrap">due '+e(relativeTime(i.dueAt,now))+'</small>':'')+'</span>'},
   {key:'open',label:'',className:'dt-action',cell:i=>'<button type="button" class="dt-action" data-community-open="'+e(i.id)+'">Open</button>'}]});
}
export function casesTable(items,{esc:e=esc,now=Date.now()}={}){
 const cases=items.filter(i=>i.caseStatus),statuses=[...new Set(cases.map(i=>i.caseStatus))];
 return dataTable({id:'community-cases',esc:e,rows:cases,pageSize:10,defaultSort:{key:'due',dir:'asc'},emptyText:'No support dossiers are linked to open questions.',
  tabs:statuses.length>1?statuses.map(s=>({id:s,label:englishMap(s,DOSSIER_STATUS),filter:i=>i.caseStatus===s})):undefined,
  columns:[
   {key:'case',label:'Dossier',value:i=>i.caseStatus,cell:i=>stagePill(englishMap(i.caseStatus,DOSSIER_STATUS),e)},
   {key:'question',label:'Question',value:i=>i.reason,className:'dt-primary pk-cap',cell:i=>'<strong title="'+e(i.reason||'')+'">'+e(i.reason||'Question without a summary')+'</strong><small>'+e(i.space||'')+'</small>'},
   {key:'owner',label:'Owner',value:i=>i.owner,cell:i=>e(i.owner||'—')},
   {key:'due',label:'Due',value:i=>Date.parse(i.dueAt)||null,cell:i=>'<span class="dt-muted pk-nowrap">'+e(i.dueAt?relativeTime(i.dueAt,now):'—')+'</span>'},
   {key:'blocked',label:'Support',value:i=>i.supportBlocked?0:1,cell:i=>i.supportBlocked?'<span class="dt-muted">Blocked: needs a person</span>':'<span class="dt-muted">Can be prepared</span>'},
   {key:'open',label:'',className:'dt-action',cell:i=>'<button type="button" class="dt-action" data-community-open="'+e(i.id)+'">Open</button>'}]});
}
export function receiptsTable(receipts,{esc:e=esc,now=Date.now()}={}){
 const records=receipts?.records||[],statuses=[...new Set(records.map(r=>r.status).filter(Boolean))].slice(0,6);
 return dataTable({id:'community-receipts',esc:e,rows:records,pageSize:20,defaultSort:{key:'at',dir:'desc'},emptyText:'No recorded results.',
  tabs:statuses.length>1?statuses.map(s=>({id:s,label:englishMap(s,WHOP_STATUS),filter:r=>r.status===s})):undefined,
  columns:[
   {key:'at',label:'Recorded',value:r=>Date.parse(r.at)||null,cell:r=>'<span class="dt-muted">'+e(relativeTime(r.at,now)||'—')+'</span>'},
   {key:'space',label:'Space',value:r=>r.space,cell:r=>e(r.space||'—')},
   {key:'status',label:'Status',value:r=>r.status,cell:r=>stagePill(englishMap(r.status,WHOP_STATUS)||'Not recorded',e)},
   {key:'owner',label:'Owner',value:r=>r.owner,cell:r=>e(r.owner||'—')},
   {key:'reply',label:'Reply ID',value:r=>r.replyId,cell:r=>r.replyId?'<span class="dt-muted">'+e(r.replyId)+'</span>':'<span class="dt-muted">—</span>'}]});
}

export function communityPage({queue,receipts,health},{esc:e=esc,now=Date.now()}={}){
 const q=ok(queue),rc=ok(receipts),h=ok(health),l=h?.latest;
 const poll=newest([l?.lastSuccessfulPollAt,rc?.source?.lastSuccessfulPollAt,q?.lastPollAt].filter(Boolean)),age=poll?(now-Date.parse(poll))/60000:Infinity;
 const when=poll?relativeTime(poll,now)+' ('+new Date(poll).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+')':'';
 const banner=!poll?pageBanner({title:'No successful Whop poll is recorded.',body:'Counts below come from the last health snapshot the community agent wrote.'},{esc:e})
  :age>POLL_STALE_MINUTES?pageBanner({title:'Whop was last polled successfully '+when+'.',body:'The numbers below may be behind until the next successful poll. Nothing is sent from this page without your confirmation.'},{esc:e})
  // A healthy poll is already a status row; only the working rule stays here (banners are for old or partial sources).
  :'<p class="pk-lead">Source questions stay in Whop and drafts in the community project. Save a draft, check the sources, then publish separately.</p>';
 const items=q?.items||[];
 return [banner,
  h||rc?communityTiles(h,rc,{esc:e}):'',
  h?communityCharts(h,{esc:e}):'<p class="notice">The community health history is not available. No substitute trend is shown.</p>',
  communitySources(h,q,rc,{esc:e,now}),
  '<p data-community-load-status role="status" class="pk-status"></p>',
  // Split view (7 Oct 2026, the 21st.dev list + detail pattern): a question opens beside the queue; j/k and Enter work in the table.
  q?'<div class="pk-split community-split">'+panel('Questions and coaching list',questionsTable(items,{esc:e,now}),{esc:e,meta:items.length+' open or saved reviews'+(q.publishingAvailable?'':' · publishing unavailable')})+'<section class="surface community-pane" aria-label="Question detail"><p class="pk-lead" data-community-pane-status role="status"></p><div data-community-pane><p class="dt-empty">Choose Open on a question to read it from Whop and draft the answer here. Nothing is sent from this pane without your confirmation.</p></div></section></div>':'<div class="ui-state" data-kind="offline" role="status"><span class="ui-state-icon" aria-hidden="true">!</span><h3>The review queue is not available</h3><p>'+e(queue?.reason?.message||'The community review source did not answer.')+' Counts above still come from the health snapshots.</p><div class="ui-state-actions"><button type="button" class="ui-btn" data-action="refresh">Try again</button></div></div>',
  q?panel('Support dossiers',casesTable(items,{esc:e,now}),{esc:e,meta:items.filter(i=>i.caseStatus).length+' linked to open questions'}):'',
  rc?'<details class="pk-source"><summary>Full handling history · '+(rc.records||[]).length+' recorded results</summary><p class="viz-note">Local Whop receipts. A reply ID was recorded when sent; this view does not re-check delivery. Member content and lesson material are not shown here.</p>'+receiptsTable(rc,{esc:e,now})+'</details>':'',
  sourceDetails([['Health snapshots',h?.source?h.source.reference+' · '+h.source.snapshots+' read':null],['Receipts',rc?.source?.reference],['Drafts',q?.draftSource],['Questions',q?.source],['Last run',rc?.source?.lastRunAt?dayLabel(rc.source.lastRunAt)+' · '+relativeTime(rc.source.lastRunAt,now):null]],{esc:e,title:'Source files'}),
  '<div class="actions pk-actions"><button type="button" data-action="section" data-id="routines">Community routines</button></div>',
 ].join('');
}

export function createCommunityReview({api,root,filters,getSerial,preview,refresh}){
 let item=null,busy=false,changed=false,queueItems=[],openedAt=0;const working=new Map();
 const render=()=>renderCommunityDetail({...item,unsaved:working.has(item.id),draft:{...item.draft,...working.get(item.id)}});
 // Messages go where the owner is looking: the open dialog (form line first), else the page status line.
 const pane=()=>root.querySelector('#view [data-community-pane]');
 const wide=()=>!globalThis.matchMedia?.('(max-width:1400px)').matches;
 const status=text=>{const dialog=root.querySelector('#preview'),inDialog=dialog?.open&&dialog.querySelector('[data-community-detail]');
  if(!inDialog&&pane()?.querySelector('[data-community-detail]')){const p=pane(),form=p.querySelector('[data-community-form] [data-community-status]'),top=root.querySelector('#view [data-community-pane-status]');if(form){form.textContent=text;if(top)top.textContent=''}else if(top)top.textContent=text;return}
  if(!inDialog){const node=root.querySelector('#view [data-community-load-status]');if(node)node.textContent=text;return}
  const form=dialog.querySelector('[data-community-form] [data-community-status]'),top=dialog.querySelector('[data-community-dialog-status]');
  if(form){form.textContent=text;if(top)top.textContent=''}else if(top)top.textContent=text};
 const detail=()=>{const d=root.querySelector('#preview');return (d?.open&&d.querySelector('[data-community-detail]'))||root.querySelector('#view [data-community-pane] [data-community-detail]')||root.querySelector('[data-community-detail]')};
 root.querySelector('#preview')?.addEventListener('close',()=>{if(changed&&openedAt===getSerial()){changed=false;refresh?.()}});
 root.addEventListener('click',async event=>{
  const assess=event.target.closest('[data-support-assess]'),resolve=event.target.closest('[data-support-resolve]');
  if((!assess&&!resolve)||busy||!item?.supportCase)return;
  const c=item.supportCase;busy=true;
  const message=root.querySelector('[data-support-status]');
  try{
   const body={id:item.id,caseRevision:c.revision,caseAction:assess?'assess':'resolve'};
   if(assess){body.observationId=c.observationId;body.accepted=assess.dataset.supportAssess==='accept';body.criticalFailure=assess.dataset.supportAssess==='critical'}
   else{body.reason=root.querySelector('[data-support-resolution]').value;if(!body.reason.trim())throw Error('Describe the verified solution first.')}
   await api('workspace/community/review',body);changed=true;
   const result=await api('workspace/community/review/'+encodeURIComponent(item.id));item=result;detail().innerHTML=render();
  }catch(e){if(message)message.textContent=e.message}finally{busy=false}
 });

 root.addEventListener('click',async event=>{
  if(!event.target.closest('[data-community-publish]')||busy||!item)return;
  if(working.has(item.id)){status('Save and verify your latest changes before publishing.');return}
  // Publishing posts publicly in Whop: the first click arms, a second click within 8 s confirms.
  const button=event.target.closest('[data-community-publish]');
  if(button.dataset.armed!=='1'){button.dataset.armed='1';button.dataset.label=button.textContent;button.textContent='Confirm: publish to Whop';status('This posts the reviewed answer publicly in Whop. Click again to confirm.');setTimeout(()=>{if(button.isConnected&&button.dataset.armed==='1'){button.dataset.armed='';button.textContent=button.dataset.label||'Publish'}},8000);return}
  button.dataset.armed='';button.textContent=button.dataset.label||'Publish';
  busy=true;const ticket=getSerial();status('Publishing the saved reviewed answer…');
  try{await api('workspace/community/review/publish',{id:item.id,revision:item.draft.revision,questionRevision:item.questionRevision,receiptRevision:item.receiptRevision,courseRevision:item.courseRevision,knowledgeRevision:item.knowledgeRevision});changed=true;
   const result=await api('workspace/community/review/'+encodeURIComponent(item.id));if(ticket!==getSerial())return;item=result;detail().innerHTML=render();status('Answer published to Whop and verified.');
  }catch(error){if(ticket===getSerial())status(error.message+' Reopen the question before retrying.')}finally{busy=false}
 });
 root.addEventListener('click',async event=>{
  const button=event.target.closest('[data-community-open]');if(!button||busy)return;
  const id=button.dataset.communityOpen,form=root.querySelector('[data-community-form]');
  if(form?.dataset.dirty==='true'&&item?.id!==id){status('Save your changes to the open question first; its text is kept. Open it again from the table to save it.');return}
  busy=true;button.disabled=true;const ticket=getSerial();
  // From the page: beside the queue on wide screens (split view), in the detail dialog on narrow ones; inside the
  // dialog or pane it re-reads in place. The open row's button says so.
  if(!button.closest('dialog')&&!button.closest('[data-community-pane]')){const row=queueItems.find(i=>i.id===id);openedAt=ticket;
   if(wide()&&pane()){item=null;pane().innerHTML='<div data-community-detail>'+loadingView('Reading the question from Whop…')+'</div>';root.querySelectorAll('#view [data-community-open]').forEach(b=>{const on=b.dataset.communityOpen===id;b.setAttribute('aria-pressed',String(on));b.textContent=on?'Open ›':'Open'})}
   else preview?.((row?.space?row.space+' · ':'')+'Community question','<div class="pk-detail pk-wide community-dialog"><p class="pk-lead" data-community-dialog-status role="status"></p><div data-community-detail>'+loadingView('Reading the question from Whop…')+'</div></div>')}
  status('Fetching the original question and course sources…');
  try{const result=await api('workspace/community/review/'+encodeURIComponent(id));if(ticket!==getSerial())return;item=result;detail().innerHTML=render();status('Question read from Whop. Check the source against your draft. Nothing has been sent.')}
  catch(e){if(ticket===getSerial()){status(e.message);const d=detail();if(d&&!item)d.innerHTML=''}}finally{busy=false;button.disabled=false}
 });
 const remember=e=>{const form=e.target.closest('[data-community-form]');if(form&&item){form.dataset.dirty='true';const f=new FormData(form);working.set(item.id,{answer:f.get('answer'),note:f.get('note'),answerKind:f.get('answerKind'),stage:f.get('stage'),lessonIds:f.getAll('lessonIds')});if(e.target.name==='lessonIds')form.querySelector('[data-community-selected-sources]').innerHTML=selectedSources(item,f.getAll('lessonIds'))}};
 root.addEventListener('input',remember);root.addEventListener('change',remember);
 root.addEventListener('submit',async e=>{
  const form=e.target;if(!form.matches?.('[data-community-form]'))return;e.preventDefault();if(busy||!item)return;
  const fields=new FormData(form),body={id:item.id,revision:item.draft?.revision||0,questionRevision:item.questionRevision,receiptRevision:item.receiptRevision,courseRevision:item.courseRevision,
   stage:fields.get('stage'),answerKind:fields.get('answerKind'),answer:fields.get('answer'),note:fields.get('note'),lessonIds:fields.getAll('lessonIds')};
  const ticket=getSerial();busy=true;form.querySelector('[type="submit"]').disabled=true;status('Saving draft…');
  try{const result=await saveCommunityReview(api,body,working);changed=true;if(ticket!==getSerial()){if(item?.id===body.id)item=result;return}item=result;detail().innerHTML=render();status(working.has(body.id)?'The submitted version is saved and read back. Your newer changes are not saved yet.':'Saved locally and read back. Nothing has been sent. '+(root.querySelector('#preview')?.open?'The list updates when you close this dialog.':'Press Refresh to see its new stage in the list.'))}
  catch(error){if(ticket===getSerial())status(error.message+' Your input is kept. Reopen the question if there is a version conflict.')}
  finally{busy=false;if(form.isConnected)form.querySelector('[type="submit"]').disabled=false}
 });
 return async()=>{
  const ticket=getSerial(),[queue,receipts,health]=await Promise.allSettled([api('workspace/community/review'),api('workspace/records/community'),api('workspace/community/health')]);if(ticket!==getSerial())return '';filters('');
  queueItems=queue.status==='fulfilled'?queue.value.items||[]:[];
  return communityPage({queue,receipts,health},{esc});
 };
}
