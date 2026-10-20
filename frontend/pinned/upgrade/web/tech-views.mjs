// Tech & AI pages on the shared page kit (Departments batch 2, 7 Oct 2026): Connections (with the former
// Source status folded in), Runtime sessions and the Activity source rows. Pure builders; the views in
// workspace-operations.mjs and mission-control-views.mjs fetch and pass the payloads in. Lazy chunk.
import {tileRow,chartBand,panel,freshness,dayLabel,detailDialog,parseAt,statusRows} from './page-kit.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {stackBar,barList,columns} from './viz.mjs';
import {stateView} from './ui.mjs';
import {detailButton} from './detail-open.mjs';
import {serviceName} from './labels.mjs';
export {serviceName};

const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>new Intl.NumberFormat('en-GB').format(Number(n)||0);
// relativeTime() switches to a date after 30 days; pages that already show the date say how long ago instead.
export const ago=(t,now=Date.now())=>{const v=parseAt(t);if(v==null)return '';const days=Math.round((now-v)/86400000);return days>30?days+' days ago':relativeTime(v,now)};
const compact=n=>n==null||!Number.isFinite(Number(n))?'—':new Intl.NumberFormat('en-GB',{notation:Number(n)>=10000?'compact':'standard',maximumFractionDigits:1}).format(Number(n));

// Full-width status rows with an optional logo, action buttons and a command line (`code`). Same states and dot
// as the kit's statusRows; used where rows need room (accounts, services, workers).
export function listRows(rows,{esc=escHTML,now=Date.now()}={}){
 const list=(rows||[]).filter(Boolean);if(!list.length)return '';
 const word={current:'Current',stale:'Stale',unavailable:'Unavailable',paused:'Paused',idle:'Idle'};
 return '<div class="health-rows status-list">'+list.map(r=>{
  const at=parseAt(r.at),when=at!=null&&r.age!==false?relativeTime(at,now):'',reason=[r.reason,when].filter(Boolean).join(' · ');
  return '<div class="health-row" data-state="'+esc(r.state||'idle')+'"><span class="today-dot" aria-hidden="true"></span>'+(r.logo||'')+'<span class="pk-sr">'+esc((word[r.state]||r.state||'')+': ')+'</span><div class="status-main"><strong>'+esc(r.label)+(r.badge?' <span class="status-badge">'+esc(r.badge)+'</span>':'')+'</strong>'+(reason?'<small>'+esc(reason)+'</small>':'')+(r.code?'<code class="status-code">'+esc(r.code)+'</code>':'')+'</div>'+(r.actions?'<span class="status-actions">'+r.actions+'</span>':'')+'</div>';
 }).join('')+'</div>';
}

// --- Local services (GET workspace/services) ---------------------------------------------------------
export const serviceById=(services,id)=>Array.isArray(services)?services.find(s=>s.id===id):null;
export const startCommand=(services,id)=>serviceById(services,id)?.start||'start command unknown';
export function serviceRows(services,{esc=escHTML,now=Date.now(),match=()=>true}={}){
 if(!Array.isArray(services))return listRows([{label:'Local services',state:'unavailable',reason:'The service check could not run: '+(services?.error||'no answer')}],{esc,now});
 return listRows(services.filter(s=>match(s.name,s.origin,s.role,s.state)).map(s=>({label:s.name,badge:':'+s.port,state:s.state==='up'?'current':'unavailable',at:s.checkedAt,
  reason:s.state==='up'?(s.id==='agent-hq'?'Answering this request':'Listening on '+s.origin.replace('http://',''))+' · '+s.role:'Not running ('+(s.detail||'no answer')+') · '+s.role+(s.launchd?' · launch agent '+s.launchd:' · no launch agent'),
  code:s.state==='up'?'':s.start})),{esc,now});
}

// --- Connections -------------------------------------------------------------------------------------
const ATTENTION=c=>['expired','insufficient-scope','unknown'].includes(c.state)||(c.adapter==='composio'&&!c.verified);
const ACCOUNT_LABEL={verified:'Verified',expired:'Expired','insufficient-scope':'Missing scope',unknown:'Status unknown',configured:'Needs check',unavailable:'Unavailable'};
const accountState=c=>c.verified?'current':['expired','insufficient-scope','unavailable'].includes(c.state)?'unavailable':c.state==='configured'?'stale':'paused';

export function dataSourceRows({overview,hex,calendar},{esc=escHTML,now=Date.now(),match=()=>true}={}){
 const rows=[];
 if(hex&&!hex.error){const f=freshness(hex.snapshotDate,{now});rows.push({label:'Hex · Voltera revenue',state:hex.state==='connected'?f.state:hex.state==='stale'?'stale':'unavailable',age:false,
  reason:hex.reason||(hex.snapshotDate?'Snapshot '+dayLabel(hex.snapshotDate)+(hex.ageDays!=null?' · '+hex.ageDays+' days old':''):'Snapshot date not reported')});}
 else rows.push({label:'Hex · Voltera revenue',state:'unavailable',reason:hex?.error||'Not read'});
 const NAMES={whop:'Whop payments',meta:'Meta Ads',stripe:'Stripe',salesdash:'SalesDash'};
 if(overview&&!overview.error){for(const [id,s] of Object.entries(overview.sources||{}).filter(([id])=>id!=='hex'))rows.push({label:NAMES[id]||serviceName(id),state:s.ok?'current':'unavailable',age:false,reason:(s.ok?'Responding':s.reason||'Not configured')+(overview.via?' · via '+overview.via:'')});}
 else rows.push({label:'Whop, Meta Ads, Stripe and SalesDash',state:'unavailable',reason:overview?.error||'Both local consoles are unavailable'});
 if(calendar&&!calendar.error)for(const s of calendar.sources||[]){const label=s.source==='Google Calendar'?'Google Calendar · '+(s.account||'calendar'):s.source;
  rows.push({label,state:['connected','synced'].includes(s.state)?'current':s.state==='stale'?'stale':'unavailable',at:typeof s.observedAt==='number'?s.observedAt*1000:s.observedAt,
   reason:[s.reason||(s.count!=null?count(s.count)+' events':''),s.via?'via '+s.via:''].filter(Boolean).join(' · ')||'Calendar and task source'});}
 else rows.push({label:'Calendar sources',state:'unavailable',reason:calendar?.error||'Not read'});
 return rows.filter(r=>match(r.label,r.reason,r.state));
}

export function connectionsPage({integrations,services,overview,hex,calendar,stage='all',query=''},{esc=escHTML,connectorMark=()=>'',btn,now=Date.now()}={}){
 const d=Array.isArray(integrations)?integrations:[],q=String(query||'').toLowerCase(),match=(...v)=>!q||v.join(' ').toLowerCase().includes(q);
 const unknownRow=d.find(c=>c.state==='unknown'&&/^Account status unknown/.test(c.reason||'')),cli=unknownRow?stateView({kind:'offline',title:'Composio account status unknown',body:unknownRow.reason.replace(/^Account status unknown: /,'')+' Account rows below are marked unknown rather than missing.'}):'';
 const visible=d.filter(c=>match(serviceName(c.name),c.name,c.account,c.state,c.reason));
 const needs=visible.filter(c=>ATTENTION(c)&&stage!=='verified'),good=visible.filter(c=>c.verified&&stage!=='attention'),other=visible.filter(c=>!c.verified&&!ATTENTION(c)&&stage==='all');
 // Bulk verify (7 Oct 2026, the 21st.dev bulk-actions pattern): a checkbox per account that can run the fixed read check.
 const pick=c=>c.check_available?'<label class="bulk-pick"><input type="checkbox" data-bulk-check value="'+esc(c.id)+'"><span class="pk-sr">'+esc('Select '+serviceName(c.name)+(c.account?' · '+c.account:''))+'</span></label>':'';
 const actions=c=>pick(c)+(c.reconnect_available||c.state==='expired'||c.state==='insufficient-scope'?btn('Reconnect','connector-reconnect',c.id):'')+(c.check_available?btn(c.verified?'Re-check':'Verify','connector-check',c.id):'');
 const account=c=>({label:serviceName(c.name)+(c.account?' · '+c.account:''),logo:connectorMark(c.name),state:accountState(c),badge:ACCOUNT_LABEL[c.state]||c.state,age:false,
  reason:c.verified?(c.capability||c.reason||'Read check passed'):(c.reason||ACCOUNT_LABEL[c.state]||c.state),at:c.observed_at?c.observed_at*1000:null,actions:actions(c)});
 const bulkBar=n=>n>1?'<div class="bulk-bar" data-bulk-bar><label><input type="checkbox" data-bulk-all> Select all '+n+' that can be checked</label><button type="button" data-action="connector-check-selected" disabled>Verify selected</button><span class="pk-status" data-bulk-status role="status"></span></div>':'';
 const sources=dataSourceRows({overview,hex,calendar},{esc,now,match}),up=Array.isArray(services)?services.filter(s=>s.state==='up').length:null;
 const ADAPTER={composio:'Composio','hermon-read-only':'Hermon (read-only)','hermes-mcp':'Hermes MCP','local-service':'Local service'};
 const byAdapter=[...d.reduce((m,c)=>{const k=ADAPTER[c.adapter]||(c.adapter?String(c.adapter):'Other');return m.set(k,(m.get(k)||0)+1)},new Map())].map(([label,value])=>({label,value}));
 const byService=[...d.reduce((m,c)=>m.set(serviceName(c.name),(m.get(serviceName(c.name))||0)+1),new Map())].map(([label,value])=>({label,value}));
 return cli+tileRow([
  {label:'Services',value:new Set(d.map(c=>c.name)).size,caption:'Apps, MCP servers and local tools'},
  {label:'Accounts',value:d.length,caption:'Composio, Hermon, MCP and local adapters'},
  {label:'Verified',value:d.filter(c=>c.verified).length,caption:'The last fixed read check passed',tone:'live'},
  {label:'Needs attention',value:d.filter(ATTENTION).length,caption:(n=>n+' to reconnect (as on Overview and Inbox) · '+(d.filter(ATTENTION).length-n)+' not yet verified')(d.filter(c=>['expired','insufficient-scope','unknown'].includes(c.state)).length)},
  {label:'Local services',value:up==null?null:up+' of '+services.length,caption:'Answering on this Mac right now'},
  {label:'Data sources',value:sources.filter(s=>s.state==='current').length+' of '+sources.length,caption:'Revenue, ad, payment and calendar feeds reporting'},
 ],{esc,number:String})
 +chartBand({title:'Account state',meta:d.length+' accounts',body:stackBar([{label:'Verified',value:d.filter(c=>c.verified).length,tone:'live'},{label:'Needs check',value:d.filter(c=>!c.verified&&c.state==='configured').length,tone:'warn'},{label:'Expired or missing scope',value:d.filter(c=>['expired','insufficient-scope'].includes(c.state)).length,tone:'error'},{label:'Other',value:d.filter(c=>!c.verified&&!['configured','expired','insufficient-scope'].includes(c.state)).length,tone:'idle'}],{esc,format:String,label:'Connected accounts by state'})+'<h3 class="pk-subhead">By adapter</h3>'+barList(byAdapter,{esc,format:String,max:6,label:'Accounts by adapter'}),note:'Verified means the last fixed read check passed; it does not prove every action works.'},
  {title:'Accounts per service',meta:byService.length+' services',body:barList(byService,{esc,format:String,max:8,label:'Accounts per service'}),note:'Several accounts can belong to one service (for example three Google calendars).'},{esc})
 +(needs.length?panel('Needs attention','<p class="pk-lead">Reconnect opens a Composio login link for you to complete. After logging in, choose Verify to run the fixed read check. Nothing is approved or sent on your behalf.</p>'+bulkBar(needs.filter(c=>c.check_available).length)+listRows(needs.map(account),{esc,now}),{esc,meta:needs.length+' accounts'}):'')
 +panel('Verified',good.length?listRows(good.map(account),{esc,now}):'<p class="dt-empty">No verified accounts in this view.</p>',{esc,meta:good.length+' accounts'})
 +(other.length?panel('Local adapters & MCP',listRows(other.map(account),{esc,now}),{esc,meta:other.length+' entries'}):'')
 +panel('Data sources','<p class="pk-lead">Feeds the dashboards read through Mission Control or HQ. An unavailable provider is not a zero balance.</p>'+(listRows(sources,{esc,now})||'<p class="dt-empty">No data sources match this search.</p>'),{esc,meta:sources.length+' sources'})
 +panel('Local services','<p class="pk-lead">Checked with one HEAD request per port. Nothing is started from here; run the command shown in a terminal.</p>'+serviceRows(services,{esc,now,match}),{esc,meta:up==null?'not checked':up+' of '+services.length+' running'});
}

// --- Runtime sessions --------------------------------------------------------------------------------
const KIND={cron:'Routine run',desktop:'Desktop app',kanban:'Kanban task',cli:'Terminal',api_server:'API',telegram:'Telegram',whatsapp:'WhatsApp',subagent:'Sub-agent'};
const END={cron_complete:'Completed',cron_incomplete_no_output:'Ended without output',cli_close:'Closed in the terminal',agent_close:'Closed by the agent',ws_orphan_reap:'Connection dropped',user_exit:'Closed by you',error:'Error'};
export const kindLabel=k=>KIND[k]||String(k||'Unknown').replace(/[_-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
export const endLabel=r=>r.endReason?(END[r.endReason]||String(r.endReason).replace(/[_-]+/g,' ').replace(/^\w/,c=>c.toUpperCase())):r.endedAt?'Ended':'No recorded end';
const tokens=r=>Number(r.tokens?.total)||0;
const duration=s=>!Number.isFinite(Number(s))||s==null?'—':s<60?Math.round(s)+' s':s<3600?Math.round(s/60)+' min':(s/3600).toFixed(1)+' h';
const localDay=t=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
// Per calendar day over a window ending today; value(item) adds up (count when omitted).
export function perDaySum(items,{days=28,at=i=>i.at,value=()=>1,now=Date.now()}={}){
 const out=[],today=new Date(now);for(let k=days-1;k>=0;k--){const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-k);out.push({key:localDay(d),label:d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}),value:0})}
 const index=new Map(out.map((d,i)=>[d.key,i]));
 for(const item of items){const t=parseAt(at(item));if(t==null)continue;const i=index.get(localDay(t));if(i!=null)out[i].value+=Number(value(item))||0}
 return out;
}
export const workflowId=r=>'default:'+r.id;
export function sessionDialog(r,{esc=escHTML,btn,now=Date.now()}={}){
 const t=r.tokens||{};
 return detailDialog([
  {title:'Session',fields:[['Title',r.title],['Source',kindLabel(r.kind||r.source)],['Started',r.startedAt?dayLabel(r.startedAt)+' · '+new Date(parseAt(r.startedAt)).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+' · '+relativeTime(r.startedAt,now):null],['Ended',r.endedAt?relativeTime(r.endedAt,now):'No recorded end'],['Outcome',endLabel(r)],['Duration',r.durationSec!=null?duration(r.durationSec):null]]},
  {title:'Model and usage',fields:[['Model',r.model],['Provider',r.provider],['Messages',r.messageCount!=null?count(r.messageCount):null],['Tool calls',r.toolCallCount!=null?count(r.toolCallCount):null],['API calls',r.apiCallCount!=null?count(r.apiCallCount):null],['Tokens (input + output)',t.total!=null?count(t.total):null],['Cache reads',t.cacheRead!=null?count(t.cacheRead):null],['Reasoning tokens',t.reasoning!=null?count(t.reasoning):null],['Cost',r.costStatus==='included'?'Included in the plan':r.costStatus]]},
  {title:'Identity',collapsed:true,fields:[['Session id',r.id],['Routine job',r.jobId],['Archived',r.archived]]},
  {html:'<div class="actions">'+btn('Workflow','session-workflow',workflowId(r))+'</div>'},
 ],{esc,lead:'Session metadata from the default Hermes runtime. Message content is never read into this view.'});
}
export function sessionsPage(d,{esc=escHTML,btn,now=Date.now(),kind='all',query=''}={}){
 const all=[...(d.sessions?.data||[])].sort((a,b)=>(parseAt(b.startedAt)||0)-(parseAt(a.startedAt)||0)),q=String(query||'').toLowerCase();
 const shown=all.filter(r=>(kind==='all'||(r.kind||r.source||'unknown')===kind)&&(!q||[r.title,r.id,r.model,r.provider,kindLabel(r.kind)].join(' ').toLowerCase().includes(q)));
 const total=Number(d.counts?.total)||all.length,oldest=all.at(-1)?.startedAt,f=freshness(d.generatedAt,{now});
 const days=Math.max(14,Math.min(42,Math.ceil((now-(parseAt(oldest)||now))/86400000)+1));
 const note='From the newest '+all.length+' of '+count(total)+' sessions'+(oldest?' (since '+dayLabel(oldest)+')':'')+'.';
 const kinds=[...new Set(all.map(r=>r.kind||r.source||'unknown'))];
 const table=dataTable({id:'runtime-sessions',esc,rows:shown,pageSize:15,defaultSort:{key:'started',dir:'desc'},emptyText:'No sessions match this view.',
  tabs:kinds.length>1?kinds.map(k=>({id:k,label:kindLabel(k),filter:r=>(r.kind||r.source||'unknown')===k})):undefined,
  columns:[
   {key:'title',label:'Session',value:r=>r.title||r.id,className:'dt-primary',cell:r=>'<strong>'+esc(r.title||'Untitled session')+'</strong><small>'+esc([r.model,r.provider].filter(Boolean).join(' · ')||'Model not reported')+'</small>'},
   {key:'kind',label:'Source',value:r=>kindLabel(r.kind||r.source),cell:r=>stagePill(kindLabel(r.kind||r.source),esc)},
   {key:'started',label:'Started',value:r=>parseAt(r.startedAt),cell:r=>'<span class="dt-muted">'+esc(relativeTime(r.startedAt,now)||'—')+'</span>'},
   {key:'duration',label:'Duration',value:r=>r.durationSec??null,cell:r=>'<span class="dt-num">'+esc(duration(r.durationSec))+'</span>'},
   {key:'tools',label:'Tool calls',value:r=>r.toolCallCount??null,cell:r=>'<span class="dt-num">'+esc(r.toolCallCount==null?'—':count(r.toolCallCount))+'</span>'},
   {key:'tokens',label:'Tokens',value:r=>r.tokens?.total??null,cell:r=>'<span class="dt-num">'+esc(r.tokens?.total==null?'—':compact(r.tokens.total))+'</span>'},
   {key:'outcome',label:'Outcome',value:r=>endLabel(r),cell:r=>'<span class="dt-muted">'+esc(endLabel(r))+'</span>'},
   {key:'open',label:'',className:'dt-action',cell:r=>'<span class="dt-actions">'+detailButton('session',r.id,'Details',{esc,title:'Details of '+(r.title||r.id)})+btn('Workflow','session-workflow',workflowId(r))+'</span>'}]});
 const via=d.via||'';
 return statusRows([{label:'Runtime session history',state:/course console/.test(via)?'fallback':'current',at:d.generatedAt,reason:(/course console/.test(via)?'Mission Control (:3340) is down; the course console (:3339) serves the same session store':/Mission/.test(via)?'Served by Mission Control (:3340)':'Served by the local console')+' · newest '+all.length+' of '+count(total)}],{esc,now})
 +tileRow([
  {label:'Sessions recorded',value:count(total),caption:'All sessions in the default Hermes runtime'},
  {label:'Loaded here',value:all.length,caption:oldest?'Newest sessions, since '+dayLabel(oldest):'Newest sessions'},
  {label:'Tool calls',value:count(all.reduce((t,r)=>t+(Number(r.toolCallCount)||0),0)),caption:'Across the loaded sessions'},
  {label:'Tokens',value:compact(all.reduce((t,r)=>t+tokens(r),0)),caption:'Input + output across the loaded sessions; cache reads not included'},
  {label:'Ended without output',value:all.filter(r=>r.endReason==='cron_incomplete_no_output').length,caption:'Routine runs that produced nothing'},
  {label:'No recorded end',value:all.filter(r=>!r.endedAt).length,caption:'Does not prove a session is still running'},
 ],{esc,number:String})
 +chartBand({title:'Sessions per day',meta:'last '+days+' days',body:columns(perDaySum(all,{days,at:r=>r.startedAt,now}),{esc,label:'Sessions started per day'}),note},
  {title:'Tokens per day',meta:'input + output',body:columns(perDaySum(all,{days,at:r=>r.startedAt,value:tokens,now}),{esc,label:'Tokens per day',format:compact}),note},{esc})
 +panel('Runtime sessions',table,{esc,meta:shown.length+' of '+all.length+' loaded'+(d.via?' · via '+d.via:'')+(f.at!=null?' · read '+relativeTime(f.at,now):'')});
}
export function sessionsOffline(services,{esc=escHTML}={}){
 return stateView({kind:'offline',title:'Mission Control is not running',
  body:'Runtime sessions are read from Mission Control (:3340), or from the course console (:3339) when Mission Control is down. Neither console is answering. Start Mission Control: '+startCommand(services,'mission-control')+' — or the course console: '+startCommand(services,'course-console'),
  actions:[{label:'Check again',action:'refresh'}]});
}
export const isUnavailable=error=>error?.code==='source_unavailable'||error?.status===503;

// --- Activity: one status row per Mission Control source ----------------------------------------------
export function activitySourceRows(legacy,{esc=escHTML,now=Date.now()}={}){
 if(!legacy||legacy.error)return statusRows([{label:'Mission Control activity',state:'unavailable',reason:legacy?.error||'Both local consoles are unavailable'}],{esc,now});
 const rows=(legacy.sources||[]).map(s=>({label:s.label||s.key,state:s.ok?'current':'unavailable',age:false,
  reason:s.ok?count(s.count)+(s.key==='cron'?' run files':s.key==='wiki'?' pages':s.key==='librarian'?' log entries'+(s.total?' (newest '+s.count+' of '+s.total+')':''):s.key==='memory'?' files':' sessions'):(s.reason||'Unavailable')}));
 rows.unshift({label:'Activity feed',state:legacy.events?.ok===false?'unavailable':'current',at:legacy.generatedAt,reason:(legacy.truncated?'Newest '+count(legacy.shown)+' of '+count(legacy.total)+' events':count(legacy.total??legacy.shown??0)+' events')+(legacy.via?' · via '+legacy.via:'')});
 return statusRows(rows,{esc,now});
}
