// Marketing & Content and Sales on the department page kit (Phase 3.3, 7 Oct 2026). Pure builders that turn
// Team Hub content, production jobs, the account register, the outreach queue and social posts into the
// benchmark patterns: tiles with captions, a two-chart band, media walls with a detail dialog, status rows.
// Every number is counted from the payload on screen; nothing is estimated. `esc` is always passed in.
// Loaded lazily (a chunk of its own) by the marketing and sales views and the production controls.
import * as kit from './page-kit.mjs';
import {funnel,columns,perDay,barList,stackBar} from './viz.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {label} from './labels.mjs';
import {headline,thumbURL} from './social-view.mjs';

const count=(list,test)=>(list||[]).filter(test).length;
const clean=t=>String(t||'').replace(/https?:\/\/\S+/g,'').replace(/\s{2,}/g,' ').trim();
const at=v=>{const t=kit.parseAt(v);return t==null?0:t};
const newest=(list,key)=>Math.max(0,...(list||[]).map(i=>at(i?.[key])));
const handleOf=id=>id?'@'+String(id).replace(/^@/,''):'Unassigned';
const euro=cents=>cents==null||!Number.isFinite(Number(cents))?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR'}).format(Number(cents)/100);
const button=(esc,text,action,id,primary=false)=>'<button type="button"'+(primary?' class="primary"':'')+' data-action="'+esc(action)+'" data-id="'+esc(id??'')+'">'+esc(text)+'</button>';
// "8 Sep 2026 · 29 days ago"; older dates already read as a date, so the relative part is left out.
const when=(v,now)=>{const t=kit.parseAt(v);if(t==null)return '';const rel=relativeTime(t,now);return /ago|just now/.test(rel)?kit.dayLabel(v)+' · '+rel:kit.dayLabel(v)};
const capital=v=>v?String(v)[0].toUpperCase()+String(v).slice(1):'';

// ── Production stages ────────────────────────────────────────────────────────────────────────────────────
export const PIPELINE=['Idea','Scripted','To Edit','Editing','To Review','Ready To Post','Posted'];
const FUNNEL_STAGES=['Idea','Scripted','To Review','Ready To Post','Posted'];
const active=items=>(items||[]).filter(i=>i&&i.status!=='Archived');

// Each stage counts the items at that stage or later (as the outreach funnel does); archived items aside.
export function stageFunnel(items,{esc}){
 const rank=s=>PIPELINE.indexOf(s),list=active(items).filter(i=>rank(i.status)>=0);
 const body=funnel(FUNNEL_STAGES.map(s=>({label:s,value:count(list,i=>rank(i.status)>=rank(s))})),{esc,format:String,label:'Content items at each production stage or later'});
 return {title:'Stage funnel',meta:list.length+' items',body,empty:'No content items in this view.',note:'Each stage counts the items at that stage or later; archived items are left out.'};
}
export function updatesPerDay(items,{esc,days=30,now=new Date()}={}){
 const series=perDay(items||[],{days,at:i=>i.updatedAt,now}),total=series.reduce((t,d)=>t+d.value,0),latest=newest(items,'updatedAt');
 return {title:'Items updated per day',meta:'Last '+days+' days',body:total?columns(series,{esc,label:'Content items updated per day, last '+days+' days',format:String}):'',
  empty:'No content item was updated in the last '+days+' days.',note:latest?'Newest change: '+kit.dayLabel(latest)+'. An item counts once, on the day of its latest change.':''};
}
export function accountMix(items,{esc}){
 const by=new Map();for(const i of active(items)){const k=handleOf(i.accountId);by.set(k,(by.get(k)||0)+1)}
 return {title:'Items per account',meta:'Archived left out',body:by.size?barList([...by].map(([label,value])=>({label,value})),{esc,format:String,label:'Content items per account'}):'',empty:'No content items in this view.'};
}

// Production overview tiles; each opens the page that holds those items.
export function productionTiles(items,{esc,number=String}){
 const list=items||[],n=s=>count(list,i=>i.status===s),latest=newest(list,'updatedAt'),f=latest?kit.freshness(latest):null;
 return kit.tileRow([
  {label:'Active content',value:count(list,i=>!['Posted','Archived'].includes(i.status)),caption:'Between idea and posting',action:{action:'section',id:'content'}},
  {label:'Ready to record',value:n('Scripted'),caption:'Finished scripts',action:{action:'section',id:'record'}},
  {label:'Awaiting review',value:n('To Review'),caption:'Need a decision',action:{action:'section',id:'reviews'}},
  {label:'Ready to post',value:n('Ready To Post'),caption:'Reviewed, not posted yet',action:{action:'section',id:'board'}},
  {label:'Last item change',value:latest?relativeTime(latest):'—',caption:latest?'Newest update to any item':'No item updates recorded',age:f?.age||''},
 ],{esc,number});
}
// Content library tiles: one per stage the owner moves items through.
export function stageTiles(items,{esc,number=String}){
 const list=items||[],n=s=>count(list,i=>i.status===s);
 return kit.tileRow([
  {label:'Content items',value:active(list).length,caption:'Every stage except archived, posted included'},
  {label:'Ideas',value:n('Idea'),caption:'Not scripted yet'},
  {label:'Scripted',value:n('Scripted'),caption:'Ready to record'},
  {label:'To review',value:n('To Review'),caption:'Waiting for a decision'},
  {label:'Ready to post',value:n('Ready To Post'),caption:'Reviewed content'},
  {label:'Posted',value:n('Posted'),caption:count(list,i=>i.status==='Archived')+' archived'},
 ],{esc,number});
}

// Recording queue: scripted items as document tiles; a tile opens the script.
export function recordingItems(items){
 // The card shows the hook, or the script's opening, under the title (9 Oct 2026).
 return (items||[]).filter(i=>i.status==='Scripted').map(i=>({id:i.id,title:i.title||'Untitled script',sub:i.accountId?'@'+i.accountId:'Unassigned account',preview:clean(i.hook)||clean(i.script).slice(0,320),
  badges:[i.format,i.deadline?'Due '+i.deadline:''].filter(Boolean),when:i.updatedAt?'Updated '+relativeTime(i.updatedAt):'',publishedAt:i.updatedAt||'',format:i.format||'',raw:i}));
}
export function scriptDetail(i,{esc,now=Date.now()}){
 const script=String(i.script||(i.blocks||[]).map(b=>b.text).join('\n\n')||'').trim();
 return {title:i.title||'Script',html:kit.detailDialog([
  {fields:[['Account',i.accountId?'@'+i.accountId:''],['Format',i.format],['Stage',i.status],['Deadline',i.deadline],['Comment keyword',i.keyword],['Updated',when(i.updatedAt,now)]]},
  clean(i.hook)?{title:'Hook',html:'<p>'+esc(clean(i.hook))+'</p>'}:null,
  {title:'Script',html:script?'<div class="script-reader">'+esc(script)+'</div>':'<p class="dt-empty">No script text yet.</p>',note:i.scriptTruncated?'This is the preview from the list. Open the full script to read all of it.':''},
 ],{esc})+'<div class="actions">'+(i.scriptTruncated?button(esc,'Read the full script','read-script',i.id,true):'')+button(esc,'Edit item','item',i.id)+'</div>'};
}
export function recordingWall(items,{esc,id='recording-queue',emptyText='No scripts are ready to record for these filters.'}){
 return kit.mediaWall({id,esc,kind:'doc',items:recordingItems(items),emptyText,detail:w=>scriptDetail(w.raw,{esc})});
}
export function formatChips(items){
 const by=new Map();for(const i of items||[]){const f=i.format||'No format';by.set(f,(by.get(f)||0)+1)}
 return [{id:'all',label:'All',count:(items||[]).length},...[...by].sort((a,b)=>b[1]-a[1]).map(([f,n])=>({id:f,label:f,count:n}))];
}
export function recordingTiles(items,{esc,number=String}){
 const list=(items||[]).filter(i=>i.status==='Scripted'),oldest=list.map(i=>at(i.updatedAt)).filter(Boolean).sort((a,b)=>a-b)[0];
 return kit.tileRow([
  {label:'Ready to record',value:list.length,caption:'Scripted items in this view'},
  {label:'Short-form',value:count(list,i=>i.format==='Short-form'),caption:'Video scripts'},
  {label:'Carousel',value:count(list,i=>i.format==='Carousel'),caption:'Slide scripts'},
  {label:'With a deadline',value:count(list,i=>i.deadline),caption:count(list,i=>!i.deadline)+' without one'},
  {label:'Oldest script',value:oldest?relativeTime(oldest):'—',caption:oldest?'Since its last change':'No scripts waiting'},
 ],{esc,number});
}

// ── Production jobs ──────────────────────────────────────────────────────────────────────────────────────
export const JOB_KIND={'hooks.generate':'Generate hooks','hooks.rank':'Rank hooks','lane.yap':'Talking head','lane.tutorial':'Tutorial','lane.splitscreen':'Split screen','lane.lifestyle':'Lifestyle','lane.remake':'Remake','lane.clips':'Clips','lane.motion':'Motion','lane.carousel':'Carousel','lane.stories':'Stories','publish.draft':'Publish draft','187n.preview':'187N preview render','operator.render':'Operator render'};
export const jobKind=k=>JOB_KIND[k]||label(k)||'Job';
const JOB_STATE={queued:'Queued',running:'Running',review:'In review',done:'Done',completed:'Done',published:'Published',failed:'Failed',cancelled:'Cancelled'};
const jobState=s=>JOB_STATE[s]||label(s)||'Unknown';
export function jobTiles(jobs,budget,{esc,number=String}){
 const list=jobs||[],failed=list.filter(j=>j.status==='failed'),lastFail=newest(failed,'finishedAt')||newest(failed,'createdAt');
 return kit.tileRow([
  {label:'Production jobs',value:list.length,caption:'Recorded in the Content Engine'},
  {label:'Waiting for review',value:count(list,j=>j.status==='review'),caption:'Results that need a decision'},
  {label:'Queued or running',value:count(list,j=>['queued','running'].includes(j.status)),caption:'Started and not finished'},
  {label:'Failed',value:failed.length,caption:failed.length?'Latest '+relativeTime(lastFail):'No failed jobs'},
  {label:'Daily budget',value:budget?.limitCents!=null?euro(budget.limitCents):'—',caption:budget?(budget.killSwitch?'Emergency stop is on':'Shared by all accounts · stop off'):'Budget not reported'},
 ],{esc,number});
}
export function jobBand(jobs,{esc}){
 const list=jobs||[],n=k=>count(list,j=>k.includes(j.status));
 const state=stackBar([{label:'Queued',value:n(['queued']),tone:'idle'},{label:'Running',value:n(['running']),tone:'info'},{label:'In review',value:n(['review']),tone:'pending'},{label:'Done',value:n(['done','completed','published']),tone:'live'},{label:'Failed',value:n(['failed']),tone:'error'}],{esc,format:String,label:'Production jobs by state'});
 const kinds=[...list.reduce((m,j)=>m.set(jobKind(j.kind),(m.get(jobKind(j.kind))||0)+1),new Map())].map(([label,value])=>({label,value}));
 return kit.chartBand({title:'Pipeline',meta:list.length+' jobs',body:state,empty:'No production jobs yet.'},{title:'Jobs by workflow',body:kinds.length?barList(kinds,{esc,format:String,max:8,label:'Production jobs by workflow'}):'',empty:'No production jobs yet.'},{esc});
}
export function jobsTable(jobs,items,{esc,now=Date.now()}){
 const titles=new Map((items||[]).map(i=>[i.id,i.title]));
 return dataTable({id:'production-jobs',esc,rows:jobs||[],pageSize:15,defaultSort:{key:'when',dir:'desc'},emptyText:'No production jobs yet. Start one with the button above.',
  tabs:[...new Set((jobs||[]).map(j=>j.status))].map(s=>({id:'s-'+s,label:jobState(s),filter:j=>j.status===s})),
  columns:[
   {key:'kind',label:'Job',value:j=>jobKind(j.kind),className:'dt-primary pk-cap',cell:j=>'<strong>'+esc(jobKind(j.kind))+'</strong><small>'+esc(titles.get(j.itemId)||'Content item not in this view')+'</small>'},
   {key:'account',label:'Account',value:j=>j.accountRegistryId||j.accountId||'',cell:j=>esc(handleOf(j.accountRegistryId||j.accountId))},
   {key:'status',label:'Status',value:j=>jobState(j.status),cell:j=>stagePill(jobState(j.status),esc)},
   {key:'when',label:'Finished',value:j=>at(j.finishedAt||j.createdAt)||null,cell:j=>'<span class="dt-muted pk-nowrap">'+esc(relativeTime(j.finishedAt||j.createdAt,now)||'—')+'</span>'},
   {key:'media',label:'Media',value:j=>(j.output?.media||[]).length,cell:j=>{const n=(j.output?.media||[]).length;return n?esc(n+(n===1?' file':' files')):'<span class="dt-muted">None</span>'}},
   {key:'open',label:'',className:'dt-action',cell:j=>'<button type="button" class="dt-action" data-action="engine-open" data-id="'+esc('job:'+j.id)+'">Open</button>'},
  ]});
}
const isImage=url=>{try{const u=new URL(url,'http://localhost');return /\.(png|jpe?g|webp|gif)$/i.test(u.searchParams.get('key')||u.pathname)}catch{return false}};
// Media first, then the business facts; the source's own error and summary text are shown as written.
export function jobDetail(job,{esc,item,mediaHTML,data,now=Date.now()}){
 const media=(job.output?.media||[]).filter(v=>typeof v==='string');
 const strip=media.length&&mediaHTML?'<div class="pk-media-strip">'+media.map((url,n)=>'<figure>'+mediaHTML(isImage(url)?'':url,isImage(url)?url:'',data)+'<figcaption>'+esc((n+1)+' / '+media.length)+'</figcaption></figure>').join('')+'</div>':'';
 const ms=at(job.finishedAt)&&at(job.createdAt)?at(job.finishedAt)-at(job.createdAt):null;
 return kit.detailDialog([
  strip?{title:'Media · '+media.length,html:strip,note:'Protected previews load from Team Hub when you press play.'}:{html:'<p class="dt-empty">This job has no media.</p>'},
  {title:'Job',fields:[['Workflow',jobKind(job.kind)],['Status',jobState(job.status)],['Content item',item?.title||''],['Account',job.accountRegistryId||job.accountId?handleOf(job.accountRegistryId||job.accountId):''],['Created',when(job.createdAt,now)],['Finished',when(job.finishedAt,now)],['Duration',ms!=null&&ms>=0?(ms<60000?Math.round(ms/1000)+' s':Math.round(ms/60000)+' min'):''],['Attempts',job.attempts],['Cost',job.actualCents!=null?euro(job.actualCents):'']]},
  job.output?.summary?{title:'Summary',html:'<p>'+esc(job.output.summary)+'</p>'}:null,
  job.error?{title:'Error from the source',html:'<p>'+esc(job.error)+'</p>'}:null,
 ],{esc});
}

// ── Account network (read view first) ───────────────────────────────────────────────────────────────────
// Same colours as the status legend: active green, warming up blue, planned grey, paused amber (7 Oct 2026).
const ACCOUNT_STATE={active:'current',warmup:'pending',planned:'idle',paused:'paused'};
const ACCOUNT_WORD={active:'Active',warmup:'Warming up',planned:'Planned',paused:'Paused'};
export function accountTiles(registry,budget,{esc,number=String}){
 const list=registry||[],n=s=>count(list,a=>a.status===s);
 return kit.tileRow([
  {label:'Accounts',value:list.length,caption:'In the account register'},
  {label:'Active',value:n('active'),caption:'Allowed to post today'},
  {label:'Planned or warming up',value:n('planned')+n('warmup'),caption:n('warmup')+' warming up'},
  {label:'Paused',value:n('paused'),caption:n('paused')?'See the reason per account':'No account is paused'},
  {label:'Daily budget',value:budget?.limitCents!=null?euro(budget.limitCents):'—',caption:budget?(budget.killSwitch?'Emergency stop is on':'All accounts · emergency stop off'):'Budget not reported'},
 ],{esc,number});
}
export function accountStatusRows(registry,{esc,editable=true}){
 return kit.statusRows((registry||[]).map(a=>{
  const cap=Number(a.effectiveCap)||0,used=Number(a.usedToday)||0,word=ACCOUNT_WORD[a.status]||label(a.status)||'Unknown';
  const platform=a.platform?String(a.platform)[0].toUpperCase()+String(a.platform).slice(1):'';
  const reason=[word+(platform?' · '+platform:''),a.status==='active'||cap?'used '+used+' of '+cap+' today':'no posting limit yet',a.pausedReason||a.pauseReason||'',a.health?.level?'health '+a.health.level:''].filter(Boolean).join(' · ');
  return {label:a.handle||a.name||a.id,state:ACCOUNT_STATE[a.status]||'unavailable',reason,action:{label:editable?'Edit':'View settings',action:'engine-open',id:'account:'+a.id}};
 }),{esc});
}
// Used today against the effective limit; accounts without a limit say so instead of an empty bar.
export function capMeters(registry,{esc}){
 const list=registry||[];if(!list.length)return '';
 return '<ol class="viz-bars pk-meters" aria-label="Posts used today against each account limit">'+list.map(a=>{const cap=Number(a.effectiveCap)||0,used=Number(a.usedToday)||0,name=a.handle||a.name||a.id;
  return '<li title="'+esc(name+': '+(cap?used+' of '+cap+' used today':'no posting limit set yet'))+'"><span class="viz-bar-label">'+esc(name)+'</span><span class="viz-bar-track">'+(cap&&used?'<span class="viz-bar" style="--w:'+Math.max(2,Math.min(100,Math.round(used/cap*100)))+'%"></span>':'')+'</span><b>'+esc(cap?used+' / '+cap:'Not set')+'</b></li>'}).join('')+'</ol>';
}
export function accountBand(registry,{esc}){
 const list=registry||[],n=s=>count(list,a=>a.status===s);
 const other=count(list,a=>!['active','warmup','planned','paused'].includes(a.status));
 const mix=stackBar([{label:'Active',value:n('active'),tone:'live'},{label:'Warming up',value:n('warmup'),tone:'pending'},{label:'Planned',value:n('planned'),tone:'idle'},{label:'Paused',value:n('paused'),tone:'warn'},...(other?[{label:'Status not reported',value:other,tone:'idle'}]:[])],{esc,format:String,label:'Accounts by status'});
 return kit.chartBand({title:'Used today vs limit',meta:'Posts per account',body:capMeters(list,{esc}),empty:'No accounts in the register.',note:'The limit is the effective feed cap the Content Engine reports for today.'},{title:'Accounts by status',meta:list.length+(list.length===1?' account':' accounts'),body:mix,empty:'No accounts in the register.'},{esc});
}

// ── Review ───────────────────────────────────────────────────────────────────────────────────────────────
export function mediaAccessRow(granted,{esc}){
 return kit.statusRows([{label:'Team media access',state:granted?'current':'paused',reason:granted?'Granted · previews load from Team Hub when you press play':'Not granted · titles, hooks and captions still work; previews appear once Team Hub grants access'}],{esc});
}
export function reviewTiles({candidates=[],waiting=[],results=0},{esc,number=String,now=Date.now()}){
 const all=[...candidates,...waiting],oldest=all.slice().sort((a,b)=>(at(a.updatedAt)||Infinity)-(at(b.updatedAt)||Infinity))[0],t=oldest?at(oldest.updatedAt):0;
 return kit.tileRow([
  {label:'Waiting for review',value:all.length,caption:'Content items at To Review'},
  {label:'Oldest waiting',value:t?relativeTime(t,now):'—',caption:oldest?'Since its last change · '+(oldest.title||'Untitled'):'Nothing is waiting'},
  {label:'Waiting for new hooks',value:waiting.length,caption:waiting.length?'Reviewable when the hook job ends':'No hook jobs running'},
  {label:'Results to review',value:results,caption:'Production jobs with output'},
 ],{esc,number});
}
// The review queue as a table with the age of each item; "Review" opens the decision form below it.
export function reviewQueue(items,{esc,jobs=[],action='review-pick',actionLabel='Review',id='review-queue',now=Date.now()}){
 const job=i=>jobs.filter(j=>j.itemId===i.id&&j.status==='review'&&j.kind!=='publish.draft').sort((a,b)=>at(b.finishedAt||b.createdAt)-at(a.finishedAt||a.createdAt))[0];
 return dataTable({id,esc,rows:items||[],pageSize:12,defaultSort:{key:'age',dir:'asc'},emptyText:'Nothing is waiting for review in this view.',
  columns:[
   {key:'title',label:'Content',value:i=>i.title,className:'dt-primary pk-cap',cell:i=>'<strong>'+esc(i.title||'Untitled')+'</strong><small>'+esc(handleOf(i.accountRegistryId||i.accountId)+(i.format?' · '+i.format:''))+'</small>'},
   {key:'age',label:'Waiting',value:i=>at(i.updatedAt)||null,cell:i=>'<span class="dt-muted pk-nowrap">'+esc(relativeTime(i.updatedAt,now)||'—')+'</span>'},
   {key:'media',label:'Media',className:'pk-hide-split',value:i=>(job(i)?.output?.media||[]).length||(i.editedVideo?1:0),cell:i=>{const j=job(i),n=(j?.output?.media||[]).length;return n?esc(n+' from '+jobKind(j.kind)):i.editedVideo?'Edited video':'<span class="dt-muted">Text only</span>'}},
   {key:'revision',label:'Revision',className:'pk-hide-split',value:i=>Number(i.revision)||0,cell:i=>esc(i.revision??'—')},
   action?{key:'open',label:'',className:'dt-action',cell:i=>'<button type="button" class="dt-action review-pick" data-action="'+esc(action)+'" data-id="'+esc(i.id)+'">'+esc(actionLabel)+'</button>'}:null,
  ].filter(Boolean)});
}

// ── Campaigns ────────────────────────────────────────────────────────────────────────────────────────────
// Team Hub writes the automation state in Dutch; the office shows it in English (unknown values pass through).
export const AUTOMATION_EN={'Nog niet gekoppeld':'Not linked yet','Niet geverifieerd':'Not verified','Voorbereid; accountkoppeling niet geactiveerd':'Prepared; account link not active'};
export function campaignTiles(campaigns,guides,{esc,number=String}){
 const list=campaigns||[],slides=f=>list.reduce((t,c)=>t+((c.formats||{})[f]||[]).length,0),keywords=new Set(list.map(c=>c.keyword).filter(Boolean));
 const by=new Map();for(const c of list)by.set(handleOf(c.accountId),(by.get(handleOf(c.accountId))||0)+1);
 return kit.tileRow([
  {label:'Campaigns',value:list.length,caption:[...by].map(([h,n])=>n+' '+h).join(' · ')||'None in this view'},
  {label:'Carousel slides',value:slides('carousel'),caption:'Across these campaigns'},
  {label:'Stories',value:slides('story'),caption:'Across these campaigns'},
  {label:'Lead magnets',value:(guides||[]).length,caption:'Guides for comment keywords'},
  {label:'Keywords',value:keywords.size,caption:count(list,c=>!c.keyword)+' campaigns without one'},
 ],{esc,number});
}
export function automationRows(campaigns,{esc}){
 const by=new Map();for(const c of campaigns||[]){const k=kit.englishMap(c.automationStatus||'Not reported',AUTOMATION_EN);by.set(k,(by.get(k)||0)+1)}
 return kit.statusRows([...by].sort((a,b)=>b[1]-a[1]).map(([k,n])=>({label:'Comment automation · '+k,state:/^(live|active|verified)$/i.test(k)?'current':'paused',reason:n+(n===1?' campaign':' campaigns')})),{esc});
}
export function keywordOptions(campaigns){
 const by=new Map();for(const c of campaigns||[]){const k=c.keyword||'';by.set(k,(by.get(k)||0)+1)}
 return [{id:'all',label:'All',count:(campaigns||[]).length},...[...by].filter(([k])=>k).sort((a,b)=>b[1]-a[1]).map(([k,n])=>({id:k,label:k,count:n})),...(by.get('')?[{id:'none',label:'No keyword',count:by.get('')}]:[])];
}
export const keywordMatch=(c,value)=>!value||value==='all'||(value==='none'?!c.keyword:c.keyword===value);

// ── Research ─────────────────────────────────────────────────────────────────────────────────────────────
export function researchTiles(research,{esc,number=String}){
 const posts=research?.posts||[],latest=newest(posts,'observedAt'),f=latest?kit.freshness(research.latestObservedAt||latest):null;
 return kit.tileRow([
  {label:'Posts observed',value:posts.length,caption:latest?'Newest collection '+kit.dayLabel(research.latestObservedAt||latest):'No collection yet'},
  {label:'Creators',value:new Set(posts.map(p=>p.handle).filter(Boolean)).size,caption:'Distinct accounts studied'},
  {label:'Research reports',value:new Set(posts.map(p=>p.provenance?.report).filter(Boolean)).size,caption:'Collections the posts come from'},
  {label:'Ideas prepared',value:Object.keys(research?.ideas||{}).length,caption:(research?.links||[]).length+' used in content'},
 ],{esc,number});
}
export function researchBand(posts,{esc}){
 const byHandle=new Map(),byDay=new Map();
 for(const p of posts||[]){if(p.handle)byHandle.set(p.handle,(byHandle.get(p.handle)||0)+1);const d=String(p.observedAt||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(d))byDay.set(d,(byDay.get(d)||0)+1)}
 const days=[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([d,value])=>({label:kit.dayLabel(d).replace(/ \d{4}$/,''),value}));
 return kit.chartBand(
  {title:'Source mix',meta:byHandle.size+' creators',body:byHandle.size?barList([...byHandle].map(([label,value])=>({label,value})),{esc,format:String,max:8,label:'Research posts per creator'}):'',empty:'No research posts yet.',note:byHandle.size>8?'The eight creators with the most observed posts.':''},
  {title:'Observed per day',meta:'Collection days only',body:days.length?columns(days,{esc,label:'Research posts observed per collection day',format:String}):'',empty:'No research posts yet.',note:days.length?'Days without a collection are left out. Newest: '+kit.dayLabel([...byDay.keys()].sort().at(-1))+'.':''},{esc});
}

// ── Social posts ─────────────────────────────────────────────────────────────────────────────────────────
const METRICS=[['views','Views'],['reach','Reach'],['likes','Likes'],['comments','Comments'],['saves','Saves'],['shares','Shares']];
const MEDIA_TYPE={video:'Reel',reel:'Reel',reels:'Reel',carousel:'Carousel',carousel_album:'Carousel',image:'Photo',photo:'Photo',story:'Story'};
const mediaType=t=>MEDIA_TYPE[String(t||'').toLowerCase()]||capital(label(t))||'Post';
export function socialWallItems(d,selection,{query='',now=Date.now()}={}){
 const accounts=d?.accounts||[],handle=id=>accounts.find(a=>a.id===id)?.handle||handleOf(id);
 return (d?.posts||[]).filter(p=>selection.account==='all'||p.accountId===selection.account).filter(p=>!query||String(p.caption||p.title||'').toLowerCase().includes(query.toLowerCase())).map(p=>{
  const v=p.metrics?.views;
  return {id:p.id,title:headline(p.caption||p.title)||'Post',sub:handle(p.accountId)+' · '+mediaType(p.mediaType),thumbUrl:thumbURL(p,now),badges:[mediaType(p.mediaType),v!=null?Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(v)+' views':''].filter(Boolean),
   publishedAt:p.publishedAt,when:relativeTime(p.publishedAt,now),metrics:p.metrics||{},accountId:p.accountId,raw:p,handle:handle(p.accountId)};
 });
}
// Metrics with the change since the previous measurement (history is oldest → newest as stored by Team Hub).
export function socialPostDetail(item,{esc,number=String,link,now=Date.now()}){
 const p=item.raw||item,history=(p.history||[]).filter(h=>h&&h.metrics).slice().sort((a,b)=>at(a.observedAt)-at(b.observedAt)),prev=history.length>1?history.at(-2):null,m=p.metrics||{};
 const fields=METRICS.filter(([k])=>m[k]!=null).map(([k,name])=>{const d=prev&&prev.metrics[k]!=null?Number(m[k])-Number(prev.metrics[k]):null;
  return [name,esc(number(m[k]))+(d?' <b class="'+(d>0?'vw-up':'pk-down')+'">'+(d>0?'+':'−')+esc(number(Math.abs(d)))+'</b>':''),{html:true}]});
 const thumb=item.thumbUrl?'<img class="pk-post-thumb" src="'+esc(item.thumbUrl)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'';
 const open=link?link(p.permalink||p.url,'Open on Instagram'):'';
 return {title:item.title||'Post',html:kit.detailDialog([
  thumb?{html:thumb}:null,
  {fields:[['Account',item.handle],['Type',mediaType(p.mediaType)],['Published',when(p.publishedAt,now)],['Last measured',when(p.observedAt||history.at(-1)?.observedAt,now)]]},
  {title:'Metrics',fields,note:prev?'Change since the measurement of '+kit.dayLabel(prev.observedAt)+'.':'Only one measurement is stored, so no change is shown.'},
  {title:'Caption',html:'<div class="vw-caption">'+esc(p.caption||p.title||'No caption.')+'</div>'},
 ],{esc})+(open?'<div class="actions">'+open+'</div>':'')};
}

// ── Leads & follow-up ────────────────────────────────────────────────────────────────────────────────────
// Source values and conditions arrive in Team Hub's words (partly Dutch); these tables show them in English.
export const LEAD_SOURCE_EN={leadinfo:'Leadinfo',form:'Website form',hermes:'Hermes research',manual:'Added by hand',import:'Import'};
export const BLOCKERS_EN={'Shadowmodus: geen externe uitvoering':'Shadow mode: nothing is sent','HQ-stop actief':'HQ stop is on','Contacthistorie en uitsluitingen nog niet gereconcilieerd':'Contact history and exclusions not reconciled yet','Campagne is draft_only':'Campaign is draft-only','Contact uitgesloten':'Contact excluded','Gedeelde contactblokkade':'Shared contact block'};
export const HISTORY_EN={'record.edit':'Record edited','manual_call':'Call logged by hand','call.log':'Call logged','send_confirmed':'Email sent (confirmed)','human_reply':'Reply from a person','record.create':'Record created','stage.change':'Stage changed'};
export const HERMON_STATUS_EN={terugbelverzoek:'Callback request'};
export const MARKETING_SOURCE_EN={Onbekend:'Unknown',onbekend:'Unknown'};
export const leadSource=r=>kit.englishMap(r?.source||'unknown',LEAD_SOURCE_EN);
export function leadStatusRows({outreach,content,now=Date.now()},{esc}){
 const o=outreach||{},records=o.records,sync=content?.sync?.hermon,tasks=content?.tasks;
 const outreachRow=Array.isArray(records)?{label:'Team outreach',at:o.source?.lastSuccessAt||o.worker?.lastSeenAt,state:o.source?.status==='confirmed'||o.source?.status==='ok'?undefined:'stale',
   reason:records.length+' leads'+(o.mode==='shadow'?' · shadow mode':'')+(o.stopped?' · HQ stop on, nothing is sent':'')}
  :{label:'Team outreach',state:'paused',reason:'Not active on Team yet'+(o.error?' · '+String(o.error).slice(0,80):'')};
 return kit.statusRows([outreachRow,
  {label:'Team tasks',state:Array.isArray(tasks)?undefined:'unavailable',at:content?.sync?.notion?.lastSuccessAt,reason:Array.isArray(tasks)?count(tasks,t=>t.area==='sales')+' sales follow-ups':'Not read'},
  sync?{label:'Hermon · 187N sync',at:sync.lastSuccessAt,state:sync.status==='connected'?undefined:'stale',reason:(sync.count??(content?.hermon?.leads||[]).length)+' CRM leads'}:{label:'Hermon · 187N sync',state:'unavailable',reason:'Not connected'},
 ],{esc,now});
}
export function leadTiles(records,hermon,{esc,number=String,syncAt}){
 const list=records||[],n=k=>count(list,r=>k.includes(r.stage)),f=syncAt?kit.freshness(syncAt):null;
 return kit.tileRow([
  {label:'Outreach leads',value:list.length,caption:n(['excluded'])+' excluded'},
  {label:'Contacted',value:n(['contacted','replied']),caption:'Reached contacted or later'},
  {label:'Replied',value:n(['replied']),caption:'A person answered'},
  {label:'Hermon leads',value:(hermon||[]).length,caption:'187N CRM'+(f?.historical?' · historical':''),age:f?.age||''},
 ],{esc,number});
}
export function leadsBySource(records,{esc}){
 const by=new Map();for(const r of records||[]){const k=leadSource(r);by.set(k,(by.get(k)||0)+1)}
 return {title:'Leads by source',meta:(records||[]).length+' outreach leads',body:by.size?barList([...by].map(([label,value])=>({label,value})),{esc,format:String,label:'Outreach leads by source'}):'',empty:'No outreach leads yet.'};
}
export function sourceOptions(records){
 const by=new Map();for(const r of records||[]){const k=r.source||'unknown';by.set(k,(by.get(k)||0)+1)}
 return [{id:'all',label:'All sources',count:(records||[]).length},...[...by].sort((a,b)=>b[1]-a[1]).map(([k,n])=>({id:k,label:kit.englishMap(k,LEAD_SOURCE_EN),count:n}))];
}
export function followUpsTable(tasks,{esc,now=Date.now()}){
 return dataTable({id:'sales-follow-ups',esc,rows:tasks||[],pageSize:15,defaultSort:{key:'due',dir:'asc'},emptyText:'No sales follow-ups yet. Add one with New follow-up.',
  columns:[
   {key:'title',label:'Follow-up',value:t=>t.title,className:'dt-primary pk-cap',cell:t=>'<strong>'+esc(t.title||'Untitled')+'</strong><small>'+esc(t.ownerName||t.ownerId||'Unassigned')+'</small>'},
   {key:'status',label:'Status',value:t=>t.status||'todo',cell:t=>stagePill(label(t.status||'todo')||'To do',esc)},
   {key:'due',label:'Due',value:t=>at(t.dueAt)||null,cell:t=>'<span class="dt-muted pk-nowrap">'+esc(t.dueAt?kit.dayLabel(t.dueAt):'No deadline')+'</span>'},
   {key:'updated',label:'Updated',value:t=>at(t.updatedAt)||null,cell:t=>'<span class="dt-muted pk-nowrap">'+esc(relativeTime(t.updatedAt,now)||'—')+'</span>'},
   {key:'open',label:'',className:'dt-action',cell:t=>'<button type="button" class="dt-action" data-action="follow-up" data-id="'+esc(t.id)+'">Open</button>'},
  ]});
}
// Lead dossier: business fields first, conditions in English, the record's history as a timeline.
export function dossierDialog(r,{esc,now=Date.now(),users=[]}){
 const sc=r.sourceData?.sourceCompany||{},visits=r.visits||r.sourceData?.visits||[],names=new Map((users||[]).map(u=>[u.id,u.name]));
 // Actors are Team user ids: shown by name when the user list has them, never as a raw id.
 const actor=a=>!a?'':names.get(a)||(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(a))?'A Team user':String(a));
 const history=(r.history||[]).map(h=>({at:h.at,title:kit.englishMap(h.type,HISTORY_EN)||'Event',detail:[actor(h.actor),h.verified===false?'not verified':h.verified?'verified':'',h.summary||''].filter(Boolean).join(' · '),tone:h.type==='human_reply'?'live':h.type==='send_confirmed'?'info':'idle'}));
 const visitEvents=visits.slice(0,12).map(v=>({at:v.sessionAt,title:'Website visit',detail:[v.trigger,(v.visitedPages||[]).length?(v.visitedPages.length+' pages'):''].filter(Boolean).join(' · '),tone:'idle'}));
 return kit.detailDialog([
  {fields:[['Company',r.company||r.name],['Email',r.email||r.sourceData?.email],['Phone',r.sourceData?.phone||sc.phone],['Website',r.sourceData?.domain||sc.domain],['Stage',capital(label(r.stage))],['Account',r.accountId?'@'+r.accountId:''],['Source',leadSource(r)],['Owner',actor(r.owner)],['Next step',r.nextAction],['Next step at',r.nextActionAt?kit.dayLabel(r.nextActionAt):'']]},
  {title:'Company',fields:[['City',sc.city],['Country',sc.country],['Industry',sc.industry],['First visit',when(sc.firstVisitAt,now)],['Last visit',when(sc.lastVisitAt,now)]],collapsed:!sc.city&&!sc.industry},
  (r.blockers||[]).length?{title:'Conditions',html:'<ul class="pk-list">'+r.blockers.map(b=>'<li>'+esc(kit.englishMap(b,BLOCKERS_EN))+'</li>').join('')+'</ul>'}:null,
  r.notes?{title:'Notes',html:'<p>'+esc(r.notes)+'</p>'}:null,
  (r.drafts||[]).length?{title:'Drafts · '+r.drafts.length,html:r.drafts.map(d=>'<p><strong>'+esc(d.subject||'Draft')+'</strong><br>'+esc(d.body||'')+'</p>').join(''),collapsed:true}:null,
  {title:'History',html:kit.timelineList(history,{esc,now,empty:'No history recorded for this lead.'})},
  visitEvents.length?{title:'Website visits · '+visits.length,html:kit.timelineList(visitEvents,{esc,now}),collapsed:true}:null,
  {title:'Sync',fields:[['Sync status',capital(label(r.syncStatus))],['Revision',r.revision],['Updated',when(r.updatedAt,now)],['Created',when(r.createdAt,now)]],collapsed:true},
 ],{esc});
}
export function hermonDialog(r,{esc,now=Date.now()}){
 const stage=kit.englishMap(r.statusName||r.status||r.stage,HERMON_STATUS_EN);
 return kit.detailDialog([
  {fields:[['Stage',stage],['Source',kit.englishMap(r.marketingSource||r.source,MARKETING_SOURCE_EN)],['Booked via',label(r.source)],['Next touch',r.nextTouchAt?when(r.nextTouchAt,now):'Not scheduled'],['Campaign',r.campaignId||r.sourceCampaign],['UTM source',r.utmSource]]},
  {title:'History',html:kit.timelineList([{at:r.createdAt,title:'Lead created',detail:label(r.source)||''},r.updatedAt&&r.updatedAt!==r.createdAt?{at:r.updatedAt,title:'Last change',detail:stage||''}:null].filter(Boolean),{esc,now}),note:'Hermon keeps the current snapshot only, not a full log of stage changes.'},
 ],{esc});
}
// How far the outreach queue got: each stage counts everyone who reached it; excluded leads aside.
export function outreachFunnel(records,{esc}){
 const n=k=>count(records,r=>k.includes(r.stage));
 const body=funnel([{label:'Researched',value:n(['research','contacted','replied'])},{label:'Contacted',value:n(['contacted','replied'])},{label:'Replied',value:n(['replied'])}],{esc,format:String,label:'Outreach leads that reached each stage'});
 return {title:'Outreach funnel',meta:(records||[]).length+' leads',body,empty:'No outreach leads yet.',note:n(['excluded'])?n(['excluded'])+' excluded leads are not counted.':''};
}
export const hermonStage=r=>kit.englishMap(r?.statusName||r?.status||r?.stage||'Recorded',HERMON_STATUS_EN);
export function hermonStages(leads,{esc}){
 const by=new Map();for(const r of leads||[]){const k=hermonStage(r);by.set(k,(by.get(k)||0)+1)}
 return by.size?barList([...by].map(([label,value])=>({label,value})),{esc,format:String,max:8,label:'Hermon leads by stage'}):'';
}
