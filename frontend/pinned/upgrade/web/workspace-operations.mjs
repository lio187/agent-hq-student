import {label} from './labels.mjs';
import {dataTable,stagePill,relativeTime} from './data-table.mjs';
import {routineOverview,routineStatusText} from './routine-health.mjs';
import {avatar,stackBar,barList,columns,perHour,initials} from './viz.mjs';
import {agendaDays,weekDays,nowIndex,lanes,layersFilter,accountLegend,calendarRange,instant,endInstant,isAllDay,sortByInstant,clock,dayKey,parseDay,weekStart} from './calendar-agenda.mjs';
// Operational views use the existing read APIs and route actions through HQ controls.
export const SECTION_DESCRIPTIONS={editor:'A full video editor: open a footage folder, let the agent cut a reel, clips or a rough cut, change anything on the timeline, export.',studio:'Your creative home: what needs you, where content waits and what is working, with one click to act.',inbox:'Everything that needs you: approvals, questions, reviews, reconnects and blocked work, with the recent activity below.',production:'Start and follow production jobs in the Content Engine, plus the clip studio status.',accounts:'The accounts each content lane posts to, and how they are connected.',setter:'Practise DM conversations with your own setter agent, with its playbook and tone guide.',handbook:'The 187N sales handbook: techniques, objections, scripts and training, searchable.',proposals:'Every client proposal on this Mac, newest first. Open a PDF right here.',portfolio:'Client performance from verified exports and reports.',community:'Whop questions, support dossiers and reviewed answers. Nothing is published without your confirmation.',finance:'The latest revenue snapshot on top; cash, receivables, payables and the transaction ledger from the dated exports below. Read-only.',people:'Every Hermes agent with its skills, routines and SOUL, and the dated human roster.',leoncontent:'The clip studio: runs, sources, references and the daily brief.',messages:'Telegram and WhatsApp records, plus a reviewed composer. Nothing is sent without a separate confirmation.',creatorlab:'Creator research: analyse a profile, read the wall, record and send ideas to the Content Engine.',reels:'Original local reels, production stages and measured results.',librarian:'Librarian worker health, the items waiting for curation, and the curation log by day and type.',memory:"Every agent's SOUL, plus the default runtime's memory documents. A document is read only when you open it.",brands:'Your original creative library and production desk, connected inside HQ.',sources:'Live connection status and source availability.',todoist:'Your connected tasks, with and without deadlines.',routines:'Scheduled agent work and recorded results.',sessions:'Execution access, manual handoff packages and original runtime session history.',overview:'What needs you today, then revenue, model usage and operations.',usage:'Compare engine usage, daily tokens and the models doing the work.',revenue:'Revenue, spend and returns, with the source and period kept in view.',tasks:'Track agent work, review blockers and follow Chief delegations.',calendar:'Your Google calendars, every connected account in one agenda, with optional task and content deadlines.',agents:'Find the right agent, inspect its model and continue the conversation.',chats:'Pick up a conversation in the selected project.',voice:'Speak to your Chief of Staff and follow the work from here.',team:'Plan content, track production and review what is ready next.',content:'Your ideas and scripts, searchable by account and production stage.',board:'Follow each piece of content from idea to publication.',record:'Open a finished script and prepare your next recording.',reviews:'Review content and production results before the next step.',campaigns:'Campaign briefs, formats and protected media previews.',research:'Explore observed posts and save useful angles for your content.',outreach:'Keep lead context, next actions and follow-ups together.',social:'Account performance and measured results for your posts.',competitors:'Track coverage, inspect source posts and find research angles.',delivery:'Follow project delivery and the latest recorded status.',activity:'A chronological record of activity in your office.',connections:'Check account availability and open the controls for each service.',settings:'Shortcuts, agents, routines, knowledge and connected accounts.'};
export const localDay=value=>{if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const d=new Date(typeof value==='number'?value*1000:value);return Number.isNaN(+d)?'':[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export const workStage=t=>['blocked','failed','waiting_for_input','waiting_for_approval'].includes(t.status)?'attention':['running','in_progress','doing','working'].includes(t.status)?'running':['done','completed','archived','cancelled'].includes(t.status)?'done':'queued';
export function calendarWindow(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid calendar month');
 const [year,m]=month.split('-').map(Number),first=new Date(year,m-1,1),start=new Date(year,m-1,1-(first.getDay()+6)%7),end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+42);
 return new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString()}).toString();
}
export function calendarEntries(d,t){
 const entries=[...(d.events||[]).map(e=>({...e,day:/^\d{4}-\d{2}-\d{2}$/.test(e.start)?e.start:localDay(e.start)})),...(t.items||[]).filter(i=>i.deadline||i.scheduledFor).map(i=>({id:i.id,title:i.title,source:'Content deadlines',start:i.scheduledFor||i.deadline,day:localDay(i.scheduledFor||i.deadline),item:i.id,status:i.status})),...(t.calendar||[]).map((e,i)=>({id:'plan-'+i,title:e.topic||e.title,source:'Content calendar',start:e.date+(e.time?'T'+e.time:''),day:e.date,status:e.status,account:e.accountId}))];
 return entries.filter(e=>e.day).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
}
export function calendarSpan(event){
 const first=event.day||localDay(event.start);if(!first)return null;
 let last=first;
 if(event.end){
  if(/^\d{4}-\d{2}-\d{2}$/.test(event.start)&&/^\d{4}-\d{2}-\d{2}$/.test(event.end)){
   const end=new Date(event.end+'T00:00:00Z');
   if(Number.isFinite(+end)&&end.toISOString().slice(0,10)===event.end&&event.end>first)last=new Date(+end-86400000).toISOString().slice(0,10);
  }else{
   const start=new Date(event.start),end=new Date(event.end);
   if(Number.isFinite(+start)&&Number.isFinite(+end)&&end>start)last=localDay((+end-1)/1000);
  }
 }
 return {first,last};
}
export function calendarOccursOn(event,day){const span=calendarSpan(event);return !!span&&span.first<=day&&span.last>=day;}
export function calendarTouchesMonth(event,month){
 const span=calendarSpan(event);if(!span)return false;
 const [year,m]=month.split('-').map(Number),last=localDay(new Date(year,m,0).getTime()/1000);
 return span.first<=last&&span.last>=month+'-01';
}
// Plain words for raw codes on the Work board and in Activity (10 Oct 2026, canvas audit).
const TASK_STATUS={todo:'To do',ready:'Ready',running:'Running',in_progress:'In progress',blocked:'Blocked',needs_input:'Needs input',waiting:'Waiting',triage:'Triage',done:'Done',failed:'Failed'};
export const taskStatus=s=>TASK_STATUS[s]||String(s||'').replace(/[_-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
const BOARD_NAMES={'187n-delivery':'187N delivery','agent-hq':'Agent HQ','leon-os':'Leon OS'};
export const boardName=b=>BOARD_NAMES[b]||b||'Hermes';
const EVENT_KIND={'run-ok':'Run finished','run-failed':'Run failed','run':'Run','session':'Session','cron':'Routine','task.completed':'Task done','task.failed':'Task failed','task.started':'Task started','task.blocked':'Task blocked','task.delegated':'Delegated','run.completed':'Run finished','run.status':'Run update','team.write':'Team change'};
export const eventKind=k=>EVENT_KIND[k]||String(k||'').replace(/[._-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
// Raw script output (JSON, stdout dumps) is summarised; the full text stays in the source log.
export function plainDetail(d){const s=String(d??'');if(!s)return '';const cut=s.replace(/stdout:[\s\S]*$/i,'').replace(/[\[{][\s\S]*$/,'').replace(/\s+/g,' ').trim();return (cut||'Output recorded in the source log').slice(0,140)}
export function activityEntries(office,legacy){
 return [...(office.events||[]).map(e=>({title:e.data?.title||eventKind(e.kind),kind:e.kind,source:'HQ',profile:e.data?.profile,at:e.at,detail:'Office event',precision:'second',run:e.data?.run_id,task:e.data?.task_id,board:e.data?.board})),
  ...(legacy.events?.ok?legacy.events.data||[]:[]).map(e=>({title:e.title,kind:e.kind,source:e.source,at:e.ts,day:e.day,detail:plainDetail(e.detail),precision:e.precision}))]
  .sort((a,b)=>new Date(typeof b.at==='number'?b.at*1000:b.at)-new Date(typeof a.at==='number'?a.at*1000:a.at));
}
function readLayers(){try{const v=JSON.parse(localStorage.getItem('hq-calendar-layers')||'{}');return {deadlines:v.deadlines!==false,content:v.content!==false}}catch{return {deadlines:true,content:true}}}
export function createOperationalViews({api,voice,getBoot,getSerial,getContext,getBusiness=()=> 'all',filters:applyFilters,esc,number,date,btn,pill,row,rows,empty,metric,card,safeLink,engineCard,scheduleRefresh,connectorMark=n=>'<span class="connector-monogram" aria-hidden="true">'+esc(String(n||'?').slice(0,2).toUpperCase())+'</span>'}){
 const state={activityAll:'',chatScope:'real',search:'',stage:'all',department:'all',scope:'all',layout:'board',source:'all',month:localDay(Date.now()/1000).slice(0,7),day:localDay(Date.now()/1000),calendarMode:'agenda',anchor:Date.now(),layers:readLayers()};
 let current='';
 const name=id=>getBoot().profiles.find(p=>p.id===id)?.name||id||'Unassigned';
 const who=(id,live=false)=>id?avatar({name:name(id),department:getBoot().profiles.find(p=>p.id===id)?.department,live,size:'sm'},{esc}):'';
 const vizCard=(title,body)=>body?card(title,body):'';
 const search=(hint='Search…')=>'<label class="search">Search<input id="operation-search" type="search" data-control="search" placeholder="'+hint+'" value="'+esc(state.search)+'"></label>';
 const select=(key,label,options)=>'<label>'+label+'<select data-control="'+key+'">'+options.map(([value,title])=>'<option value="'+esc(value)+'" '+(state[key]===value?'selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label>';
 const match=(...v)=>!state.search||v.join(' ').toLowerCase().includes(state.search.toLowerCase());
 const safe=async(path,fallback={})=>{try{return await api(path)}catch(error){return {...fallback,error:error.message}}};
 const warning=d=>d.error?'<p class="notice">'+esc(d.error)+'</p>':'';
 const workMetric=(label,value,sub,stage)=>metric(label,value,sub,stage).replace('data-action="section"','data-action="work-filter"');
 const metrics=html=>'<div class="metrics">'+html+'</div>';
 const taskRow=t=>row(t.title,name(t.assignee||t.profile)+' · '+(t.board||'Hermes')+' · '+label(t.status),btn('Open task','task',t.id));
 // List layout (8 Oct 2026): the board's kanban stays; the list is the shared table, so it sorts, filters by stage
 // and agent with tokens, saves views and works with j/k and Enter.
 const STAGE_WORD={queued:'Queued',running:'In progress',attention:'Needs attention',done:'Done'};
 const at=t=>{const v=t.updated_at??t.started_at??t.created_at;const ms=typeof v==='number'?(v<1e12?v*1000:v):Date.parse(v||'');return Number.isFinite(ms)?ms:null};
 const workTable=list=>dataTable({id:'agent-work',esc,rows:list,pageSize:25,defaultSort:{key:'updated',dir:'desc'},emptyText:'No work matches this view.',
  tabs:['attention','running','queued'].filter(k=>list.some(t=>workStage(t)===k)).map(k=>({id:k,label:STAGE_WORD[k],filter:t=>workStage(t)===k})),
  columns:[{key:'title',label:'Task',value:t=>t.title,className:'dt-primary',cell:t=>'<strong>'+esc(t.title)+'</strong><small>'+esc(t.board||'Hermes')+'</small>'},
   {key:'agent',label:'Agent',value:t=>name(t.assignee||t.profile),cell:t=>esc(name(t.assignee||t.profile))},
   {key:'stage',label:'Stage',value:t=>STAGE_WORD[workStage(t)]||'Queued',cell:t=>stagePill(STAGE_WORD[workStage(t)]||'Queued',esc)},
   {key:'status',label:'Status',value:t=>label(t.status),cell:t=>'<span class="dt-muted">'+esc(label(t.status))+'</span>'},
   {key:'updated',label:'Updated',value:at,cell:t=>'<span class="dt-muted">'+esc(at(t)?relativeTime(at(t)):'—')+'</span>'},
   {key:'open',label:'',className:'dt-action',cell:t=>btn('Open task','task',t.id)}]});
 const scheduleRow=r=>row(r.name||r.id,name(r.profile)+' · '+routineStatusText(r,date),btn('Manage','routines'));
 // Calendar sources keep one colour each (fixed by source, never by rank); an unknown source shares slot 4.
 const SOURCE_SLOTS={'Google Calendar':1,Todoist:2,'Content calendar':3,'Content deadlines':3,'Hermes routines':4};
 const sourceSlot=source=>SOURCE_SLOTS[source]||4;
 const sourceLegend=list=>{const counts=new Map();for(const e of list)counts.set(e.source,(counts.get(e.source)||0)+1);return counts.size?'<div class="viz-legend calendar-legend" aria-label="Calendar sources">'+[...counts].sort((a,b)=>sourceSlot(a[0])-sourceSlot(b[0])).map(([s,n])=>'<span><i data-cat="'+sourceSlot(s)+'" aria-hidden="true"></i>'+esc(s)+' <b>'+n+'</b></span>').join('')+'</div>':''};
 const segment=(key,value,label)=>'<button data-operation="'+key+'" data-value="'+esc(value)+'" aria-pressed="'+(state[key]===value)+'">'+label+'</button>';
 const views={
  async overview(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   const [d,r,e]=await Promise.all([api('workspace/dashboard'),safe('routines',{rows:[]}),safe('events?latest=1')]);
   const tasks=d.tasks||[],attention=tasks.filter(t=>workStage(t)==='attention'),running=tasks.filter(t=>workStage(t)==='running'),health=routineOverview(r),routines=health.rows,next=(d.calendar?.events||[]).filter(x=>Date.parse(x.start)>=Date.now()).slice(0,4);
   return '<section data-dashboard-widget="ops"><div class="command-band"><div><p class="eyebrow">187N / OPERATIONS TODAY</p><h2>Today’s operation</h2><p>'+getBoot().profiles.length+' agents · '+routines.length+' routines · '+esc(new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}))+'</p></div><div class="command-actions">'+btn('Talk to Chief','voice','',true)+btn('Create a task','new-task')+btn('Open 187N Team','section','team')+'<small>Read '+esc(date(d.observed_at))+'</small></div></div>'+
    (d.stale?'<p class="notice">Some work sources could not be refreshed. Counts may be incomplete.</p>':'')+
    metrics(workMetric('Needs attention',attention.length,'Blocked, failed or waiting','attention')+workMetric('In progress',running.length,'Reported by Hermes','running')+metric('Approval requests',(d.approvals||[]).length,'Waiting for your decision','tasks')+metric('Open work',tasks.length,'All enrolled boards','tasks'))+
    '<div class="dashboard-grid">'+card('Needs your attention',rows(attention.slice(0,4),taskRow)+'<div class="actions">'+btn('View all work','section','tasks')+btn('Review approvals','approvals')+'</div>')+card('Up next',rows(next,e=>row(e.title,e.source+' · '+date(e.start),e.profile?btn('Agent','agent',e.profile):pill('Scheduled')))+'<div class="actions">'+btn('Open calendar','section','calendar')+'</div>')+'</div></section>'+
    '<section data-dashboard-widget="routines">'+card('Routines',warning(r)+'<p class="source">'+health.activeFailures+' enabled routines with a failed last run · '+health.pausedFailures+' paused routines with historical failures</p>'+(health.unavailableProfiles?'<p class="notice">'+health.unavailableProfiles+' profile schedules could not be read. Counts are incomplete.</p>':'')+rows(routines.slice(0,4),scheduleRow)+'<div class="actions">'+btn('All routines','section','routines')+'</div>')+'</section>'+
    '<section data-dashboard-widget="agents">'+card('Agents & departments',rows(getBoot().departments,x=>row(x.name,getBoot().profiles.filter(p=>p.department===x.id).length+' enrolled agents',btn('Browse','section','agents'))))+'</section><section data-dashboard-widget="activity">'+card('Recent activity',warning(e)+rows((e.events||[]).slice().reverse().slice(0,5),x=>row(label(x.kind),name(x.data?.profile)+' · '+date(x.at)))+'<div class="actions">'+btn('All activity','section','activity')+'</div>')+'</section>';
  },
  async tasks(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   const scopeQuery=new URLSearchParams({business:getBusiness()});if(state.scope==='project')scopeQuery.set('project',getContext().project);
   const d=await api('workspace/work?'+scopeQuery),m={tasks:d.missions||[]};
   filters(search('Find a task or agent…')+select('scope','Project scope',[['all','All enrolled boards'],['project','Selected project']])+select('department','Agent',[['all','All agents'],...getBoot().profiles.map(p=>[p.id,p.name])])+select('stage','Status',[['all','All active work'],['attention','Needs attention'],['running','In progress'],['queued','Queued']])+'<div class="segmented">'+segment('layout','board','Board')+segment('layout','list','List')+'</div>'+btn('New task','new-task','',true));
   const scoped=d.tasks||[],list=scoped.filter(t=>(state.stage==='all'||workStage(t)===state.stage)&&(state.department==='all'||(t.assignee||t.profile)===state.department)&&match(t.title,name(t.assignee||t.profile),t.board));
   const work=state.layout==='list'?card('Work · '+list.length,workTable(list)):'<div class="work-board">'+[['queued','Queued'],['running','In progress'],['attention','Needs attention']].map(([key,title])=>'<section class="work-column" data-stage="'+key+'"><header><h2>'+title+'</h2>'+pill(list.filter(t=>workStage(t)===key).length)+'</header><div class="work-column-cards">'+ (list.filter(t=>workStage(t)===key).map(t=>'<div class="work-card-wrap"><button class="work-card" data-action="task" data-id="'+esc(t.id)+'">'+'<span class="card-topline">'+pill(taskStatus(t.status),key)+'</span><strong>'+esc(t.title)+'</strong><span class="card-properties"><small class="card-agent">'+who(t.assignee||t.profile,key==='running')+esc(name(t.assignee||t.profile))+'</small><small>'+esc(boardName(t.board))+(t.business_membership==='shared'?' · Shared infrastructure':'')+'</small></span></button><button type="button" class="work-steps" data-action="task-workflow" data-id="'+esc((t.board?t.board+':':'')+t.id)+'" aria-label="'+esc('View the steps of '+t.title)+'">Steps</button></div>').join('')||'<p class="board-empty">No work in this stage</p>')+'</div></section>').join('')+'</div>';
   return (d.stale?'<p class="notice">Work source is stale or incomplete.</p>':'')+(d.scope?.omitted_active_tasks?'<p class="source">'+number(d.scope.omitted_active_tasks)+' tasks outside this selection are hidden.</p>':'')+'<div class="board-summary"><strong>'+list.length+' tasks</strong><span>Grouped by status · Open a card to review the task</span></div>'+(list.length?'<div class="work-state">'+stackBar([['queued','Queued','idle'],['running','In progress','live'],['attention','Needs attention','warn']].map(([k,l,tone])=>({label:l,value:list.filter(t=>workStage(t)===k).length,tone})),{esc,label:'Agent work by state'})+'</div>':'')+work+'<div class="actions">'+btn('Review approvals','approvals')+btn('Manage routines','routines')+'</div>'+'<details class="operations-detail"><summary>Chief delegations · selected project</summary>'+card('Delegations',warning(m)+rows(m.tasks.filter(t=>t.project===getContext().project),t=>row('Chief → '+name(t.profile),t.status+' · '+t.task_id,btn('Open task','task',t.task_id))))+'</details>';
  },
  async calendar(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   const [d,t]=await Promise.all([api('workspace/calendar?'+calendarRange(state.month,state.anchor)),safe('workspace/team/calendar')]);
   const all=calendarEntries(d,t).filter(e=>match(e.title,e.account,e.location)),shown=layersFilter(all,state.layers),google=all.filter(e=>e.source==='Google Calendar');
   const legend=accountLegend(d.sources),todo=(d.sources||[]).find(s=>s.source==='Todoist'),today=localDay(Date.now()/1000),now=Date.now();
   const weekFrom=weekStart(now),weekTo=weekFrom+7*86400000,inWeek=e=>instant(e)<weekTo&&endInstant(e)>=weekFrom;
   const layerBtn=(key,label)=>'<button data-operation="layer" data-value="'+key+'" aria-pressed="'+(state.layers[key]!==false)+'">'+label+'</button>';
   filters(search('Find an event, person or place…')+'<div class="segmented" role="group" aria-label="View">'+segment('calendarMode','agenda','Agenda')+segment('calendarMode','week','Week')+segment('calendarMode','month','Month')+'</div><div class="segmented" role="group" aria-label="Layers">'+layerBtn('deadlines','Deadlines')+layerBtn('content','Content')+'</div>');
   // Source strip: one chip per Google account (colour = account), the task feed and the time zone.
   const when=at=>{const ms=typeof at==='number'?(at<1e12?at*1000:at):Date.parse(at||'');return Number.isFinite(ms)?clock(ms):''};
   const chip=s=>'<span class="cal-source" data-state="'+esc(s.state||'')+'"><i data-cat="'+esc(s.slot)+'" aria-hidden="true"></i><b>'+esc(s.label)+'</b><small>'+esc(s.state==='loading'?'reading…':s.state==='unavailable'?(s.reason||'unavailable'):(s.via?'via '+s.via+(when(s.at)?' · ':''):'')+(when(s.at)?'synced '+(s.at&&new Date(typeof s.at==='number'?(s.at<1e12?s.at*1000:s.at):s.at).toDateString()!==new Date().toDateString()?new Date(typeof s.at==='number'?(s.at<1e12?s.at*1000:s.at):s.at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' ':'')+when(s.at):label(s.state)))+'</small></span>';
   const pending=legend.some(s=>s.state==='loading');
   if(pending)scheduleRefresh?.(ticket,6000);
   const strip='<div class="cal-sources" aria-label="Calendar sources">'+legend.map(chip).join('')+(todo?'<span class="cal-source" data-state="'+esc(todo.state)+'"><i class="layer-swatch" aria-hidden="true"></i><b>Todoist</b><small>'+esc(todo.state==='unavailable'?(todo.reason||'unavailable'):(todo.via?'via '+todo.via:label(todo.state)))+'</small></span>':'')+'<span class="cal-source"><b>'+esc(Intl.DateTimeFormat().resolvedOptions().timeZone)+'</b><small>your time zone</small></span></div>';
   const noGoogle=!legend.some(s=>s.state!=='unavailable');
   const offline=noGoogle?'<div class="ui-state" data-kind="offline" role="status"><span class="ui-state-icon" aria-hidden="true">!</span><h3>Google Calendar is unavailable</h3><p>'+esc((legend.find(s=>s.reason)||{}).reason||'No calendar source answered.')+'</p><div class="ui-state-actions"><button type="button" class="ui-btn" data-action="refresh">Check again</button></div></div>':'';
   const tiles=metrics(metric('Today',google.filter(e=>calendarOccursOn(e,today)).length,'meetings and events')+metric('This week',google.filter(inWeek).length,'Google events')+metric('With a video link',google.filter(e=>inWeek(e)&&e.conference).length,'this week')+(state.layers.deadlines!==false?(todo?.state==='unavailable'?metric('Deadlines','—','Todoist is unavailable'):metric('Deadlines',all.filter(e=>e.source==='Todoist'&&inWeek(e)).length,'Todoist, this week')):metric('Accounts',legend.length,'Google calendars')));
   // Shared pieces.
   const rsvp={accepted:'accepted',tentative:'maybe',declined:'declined',needsAction:'no reply'};
   const people=e=>{const list=(e.attendees||[]).filter(a=>!a.self),more=Math.max(0,list.length-5);return list.length?'<span class="ae-people">'+list.slice(0,5).map(a=>'<span class="rsvp" data-rsvp="'+esc(a.responseStatus)+'" title="'+esc((a.name||a.email||'Guest')+' · '+(rsvp[a.responseStatus]||a.responseStatus))+'">'+esc(initials(a.name||a.email))+'</span>').join('')+(more?'<span class="rsvp rsvp--more">+'+more+'</span>':'')+'</span>':''};
   const range=e=>isAllDay(e)?'All day':clock(instant(e))+(e.end?'–'+clock(endInstant(e)):'');
   const tzNote=e=>e.sourceTimezone&&e.sourceTimezone!==Intl.DateTimeFormat().resolvedOptions().timeZone?' · '+e.sourceTimezone:'';
   const details=e=>{const guests=(e.attendees||[]);return '<details class="ae-more"><summary>Details</summary>'+(e.description?'<p>'+esc(e.description)+'</p>':'')+(guests.length?'<ul class="ae-guests">'+guests.map(a=>'<li><span class="rsvp" data-rsvp="'+esc(a.responseStatus)+'" aria-hidden="true">'+esc(initials(a.name||a.email))+'</span>'+esc(a.name||a.email||'Guest')+(a.self?' (you)':'')+(a.organizer?' · organiser':'')+' <small>'+esc(rsvp[a.responseStatus]||a.responseStatus)+'</small></li>').join('')+'</ul>':'')+'<p class="ae-meta">'+esc([e.account,e.alsoOn?.length?'also on '+e.alsoOn.join(', '):'',e.recurring?'repeats':'',e.sourceTimezone?'set in '+e.sourceTimezone:''].filter(Boolean).join(' · '))+'</p></details>'};
   const eventCard=e=>'<article class="agenda-event" data-cat="'+esc(e.slot||4)+'"><div class="ae-time"><b>'+esc(isAllDay(e)?'All day':clock(instant(e)))+'</b>'+(!isAllDay(e)&&e.end?'<small>'+esc(clock(endInstant(e)))+'</small>':'')+'</div><div class="ae-main"><strong>'+esc(e.title)+'</strong><small>'+esc([e.location,e.organizer&&!e.organizer.self?'by '+(e.organizer.name||e.organizer.email):'',tzNote(e).slice(3)].filter(Boolean).join(' · ')||e.account||'')+'</small>'+people(e)+details(e)+'</div><div class="ae-actions">'+(e.conference?'<a class="ae-join" href="'+esc(e.conference.uri)+'" target="_blank" rel="noopener noreferrer">Join</a>':'')+safeLink(e.url,'Open')+'</div></article>';
   const layerChip=e=>'<span class="ae-layer" data-layer="'+(e.source==='Todoist'?'deadlines':'content')+'" title="'+esc(e.source)+'">'+esc(e.title)+(e.source==='Todoist'&&Number.isInteger(e.priority)&&e.priority>1?' <b>P'+(5-e.priority)+'</b>':'')+(e.item?' '+btn('Open','item',e.item):'')+'</span>';
   // Toolbar: period title and navigation.
   const anchorDay=parseDay(dayKey(state.anchor));
   const title=state.calendarMode==='month'?new Date(state.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}):state.calendarMode==='week'?'Week of '+new Date(weekStart(state.anchor)).toLocaleDateString('en-GB',{day:'numeric',month:'long'}):anchorDay.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})+' · next 8 days';
   const toolbar='<div class="calendar-toolbar"><div class="actions"><button data-operation="period" data-value="-1" aria-label="Previous">←</button><h2>'+esc(title)+'</h2><button data-operation="period" data-value="1" aria-label="Next">→</button></div><button data-operation="today" aria-keyshortcuts="t">Today</button></div>';
   let body='';
   if(state.calendarMode==='agenda'){
    body=agendaDays(shown,{anchor:state.anchor,days:8,occursOn:calendarOccursOn}).map(day=>{
     const cut=day.isToday?nowIndex(day.timed,now):-1,timed=day.timed.map((e,i)=>(i===cut?'<hr class="now-line" aria-label="Now">':'')+eventCard(e)).join('')+(day.isToday&&cut===day.timed.length&&day.timed.length?'<hr class="now-line" aria-label="Now">':'');
     const empty=!day.timed.length&&!day.allDay.length&&!day.layer.length;
     return '<section class="agenda-day'+(day.isToday?' is-today':'')+'"><header><h3>'+esc(day.label)+'</h3><small>'+esc(day.date)+'</small></header>'+(day.allDay.length?'<div class="ae-allday">'+day.allDay.map(eventCard).join('')+'</div>':'')+timed+(day.layer.length?'<div class="ae-layers">'+day.layer.map(layerChip).join('')+'</div>':'')+(empty?'<p class="ae-empty">Nothing scheduled</p>':'')+'</section>'}).join('');
    body='<div class="agenda">'+body+'</div>';
   }else if(state.calendarMode==='week'){
    const days=weekDays(shown,{anchor:state.anchor,occursOn:calendarOccursOn}),hours=[7,22];
    for(const day of days)for(const e of day.timed){const h=new Date(instant(e)).getHours(),he=new Date(endInstant(e)).getHours()+1;hours[0]=Math.min(hours[0],h);hours[1]=Math.max(hours[1],Math.min(24,he))}
    const span=(hours[1]-hours[0])*60,top=ms=>{const d=new Date(ms);return Math.max(0,((d.getHours()-hours[0])*60+d.getMinutes())/span*100)};
    const cols=days.map(day=>'<div class="week-col'+(day.isToday?' is-today':'')+'"><header><b>'+esc(day.label==='Today'||day.label==='Tomorrow'?day.label:day.label.slice(0,3))+'</b><small>'+esc(day.date)+'</small></header><div class="week-allday">'+[...day.allDay,...day.layer].slice(0,3).map(e=>e.source==='Google Calendar'?'<span class="wk-chip" data-cat="'+esc(e.slot||4)+'" title="'+esc(e.title)+'">'+esc(e.title)+'</span>':layerChip(e)).join('')+([...day.allDay,...day.layer].length>3?'<small>+'+([...day.allDay,...day.layer].length-3)+'</small>':'')+'</div><div class="week-body">'+lanes(day.timed).map(({event:e,lane,of})=>{const t=top(instant(e)),h=Math.max(3.2,top(endInstant(e))-t);return '<button class="wk-event" data-cat="'+esc(e.slot||4)+'" data-operation="focus-day" data-value="'+day.key+'" style="top:'+t.toFixed(2)+'%;height:'+h.toFixed(2)+'%;left:'+(lane/of*100).toFixed(2)+'%;width:'+(100/of).toFixed(2)+'%" title="'+esc(range(e)+' · '+e.title+(e.location?' · '+e.location:''))+'"><b>'+esc(clock(instant(e)))+'</b> '+esc(e.title)+'</button>'}).join('')+(day.isToday?'<span class="now-mark" style="top:'+top(now).toFixed(2)+'%" aria-hidden="true"></span>':'')+'</div></div>').join('');
    const ticks=Array.from({length:hours[1]-hours[0]+1},(_,i)=>'<span style="top:'+(i*60/span*100).toFixed(2)+'%">'+String(hours[0]+i).padStart(2,'0')+':00</span>').join('');
    body='<div class="week-grid" style="--rows:'+(hours[1]-hours[0])+'"><div class="week-hours"><header></header><div class="week-allday"></div><div class="week-body">'+ticks+'</div></div>'+cols+'</div>';
   }else{
    const month=state.month,[y,m]=month.split('-').map(Number),offset=(new Date(y,m-1,1).getDay()+6)%7,total=new Date(y,m,0).getDate(),cells=Math.ceil((offset+total)/7)*7;
    body='<div class="month-grid" aria-label="Calendar month">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<span class="weekday">'+d+'</span>').join('')+Array.from({length:cells},(_,i)=>{const n=i-offset+1;if(n<1||n>total)return '<div class="day-blank"></div>';const day=month+'-'+String(n).padStart(2,'0'),events=sortByInstant(shown.filter(e=>calendarOccursOn(e,day)));return '<button class="calendar-day '+(day===today?'today':'')+'" data-operation="focus-day" data-value="'+day+'" aria-label="'+day+', '+events.length+' events"><b>'+n+'</b>'+events.slice(0,3).map(e=>'<span '+(e.source==='Google Calendar'?'data-cat="'+esc(e.slot||4)+'"':'data-layer="'+(e.source==='Todoist'?'deadlines':'content')+'"')+' title="'+esc(range(e)+' · '+e.title)+'">'+(isAllDay(e)?'':'<em>'+esc(clock(instant(e)))+'</em> ')+esc(e.title)+'</span>').join('')+(events.length>3?'<small>+'+(events.length-3)+' more</small>':'')+'</button>'}).join('')+'</div>';
   }
   return strip+warning(t)+offline+tiles+card('Schedule',toolbar+body,'calendar-schedule');
  },
  async agents(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   // Skills, routines and the SOUL come from the agent roster (shared with Team & People, Departments batch 2).
   const [d,roster,{rememberRoster}]=await Promise.all([safe('workspace/dashboard'),safe('workspace/agents/roster'),import('./detail-open.mjs')]),boot=getBoot();rememberRoster(roster);
   const byId=new Map((roster.profiles||[]).map(p=>[p.id,p])),routineText=r=>!r||r.total==null?'Not readable':r.total?r.total+' · '+r.enabled+' enabled'+(r.failing?' · '+r.failing+' failing':''):'None';
   filters(search('Find an agent, role or model…')+select('department','Department',[['all','All departments'],...boot.departments.map(d=>[d.id,d.name])]));
   const list=boot.profiles.filter(p=>(state.department==='all'||p.department===state.department)&&match(p.name,p.department_name,p.model,p.provider));
   const tally=key=>[...list.reduce((m,p)=>m.set(key(p),(m.get(key(p))||0)+1),new Map())].map(([label,value])=>({label,value}));
   return warning(d)+metrics(metric('Enrolled agents',boot.profiles.length)+metric('Departments',boot.departments.length)+metric('Active runs',d.runs?.length??'—','Running or waiting right now')+metric('Skills installed',roster.distinctSkills??'—','Unique skills across all agent profiles')+metric('Own routines',roster.profiles?roster.profiles.reduce((t,p)=>t+(Number(p.routines?.total)||0),0):'—',roster.defaultRoutines?roster.defaultRoutines.total+' more run under the default profile':'Scheduled in agent profiles')+metric('Showing',list.length))+(list.length>1?'<div class="viz-grid">'+card('Agents by department',barList(tally(p=>p.department_name||'Unassigned'),{esc,format:String,max:9,label:'Agents by department'}))+card('Models in use',barList(tally(p=>p.model||'Profile default'),{esc,format:String,max:9,label:'Agents per model'}))+'</div>':'')+(list.length?'<div class="agent-grid">'+list.map(p=>{const active=(d.runs||[]).filter(r=>r.profile===p.id);return '<article class="surface agent-profile" data-dept="'+esc(p.department||'')+'"><div class="section-head">'+avatar({name:p.name,department:p.department,live:active.length>0,size:'lg'},{esc})+pill(active.length?active.length+' active runs':p.installed?'Enrolled':'Unavailable',active.length?'running':'')+'</div><h2>'+esc(p.name)+'</h2><p class="eyebrow">'+esc(p.department_name)+'</p><dl><dt>Model</dt><dd>'+esc(p.model||'Profile default')+'</dd><dt>Provider</dt><dd>'+esc(p.provider||'Profile default')+'</dd><dt>Reasoning</dt><dd>'+esc(p.effort||'Default')+'</dd>'+(byId.has(p.id)?'<dt>Skills</dt><dd>'+esc(byId.get(p.id).skills??'—')+'</dd><dt>Routines</dt><dd>'+esc(routineText(byId.get(p.id).routines))+'</dd>':'')+'</dl>'+'<div class="actions">'+btn('Open conversation','agent',p.id)+btn('Latest work','agent-workflow',p.id)+btn('Profile & skills','agent-settings',p.id)+(byId.get(p.id)?.hasSoul?'<button type="button" data-hq-detail="soul|'+esc(p.id)+'">Open SOUL</button>':'')+'</div></article>'}).join('')+'</div>':empty('No agents match these filters.'));
  },
  async chats(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   const [all,runs]=await Promise.all([api('conversations'),api('runs').catch(()=>[])]);
   // Automated acceptance and smoke-test threads stay out of the way unless asked for.
   const test=c=>/^(HQ scoped check|Acceptance[:\s]|Cockpit (real )?voice|Cockpit acceptance|187N voice transport|187N Demo)/i.test(c.title||'');
   const when=c=>c.updated_at||c.created_at||0,list=all.filter(c=>c.project===getContext().project).sort((a,b)=>when(b)-when(a)),tests=list.filter(test).length;
   const latest=new Map();for(const r of runs||[]){const c=r.conversation||r.conversation_id;if(!c)continue;const prev=latest.get(c);if(!prev||(r.created_at||0)>(prev.created_at||0))latest.set(c,r)}
   filters(search('Find a conversation or agent…')+select('department','Agent',[['all','All agents'],...getBoot().profiles.map(p=>[p.id,p.name])])+select('chatScope','Show',[['real','Your conversations'],['all','Include test conversations ('+tests+')']])+btn('Talk to Chief','voice','',true));
   const shown=list.filter(c=>(state.chatScope==='all'||!test(c))&&(state.department==='all'||c.profile===state.department)&&match(c.title,name(c.profile)));
   const ago=s=>{const m=Math.round((Date.now()/1000-s)/60);return !s?'—':m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':new Date(s*1000).toLocaleDateString('en-GB',{day:'numeric',month:'short'})};
   const status={running:'Working',queued:'Queued',waiting_for_approval:'Needs approval',waiting_for_input:'Needs your answer',completed:'Done',failed:'Failed',cancelled:'Cancelled',interrupted:'Interrupted'};
   const initials=n=>String(n||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
   const n=(count,word)=>count+' '+word+(count===1?'':'s'),agents=new Set(list.filter(c=>!test(c)).map(c=>c.profile)).size;
   return '<p class="chat-stats">'+shown.length+' shown · '+n(list.length-tests,'conversation')+(tests&&state.chatScope!=='all'?' · '+n(tests,'test thread')+' hidden':'')+' · '+n(agents,'agent')+'</p>'
    +(shown.length?'<section class="chat-list">'+shown.map(c=>{const r=latest.get(c.id),s=r?.status;return '<article class="chat-row"><span class="chat-avatar" aria-hidden="true">'+esc(initials(name(c.profile)))+'</span><div class="chat-main"><strong>'+esc(c.title||'Conversation')+'</strong><small>'+esc(name(c.profile))+' · '+esc(ago(when(c)))+'</small></div>'+(s?'<span class="chat-status" data-state="'+esc(s)+'">'+esc(status[s]||s)+'</span>':'<span class="chat-status">No run yet</span>')+btn('Continue','conversation',c.id)+'</article>'}).join('')+'</section>':'<p class="notice">No conversations match this view.</p>');
  },
  async voice(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   // The call screen (7 Oct 2026): audio-driven orb, live caption, transcript and the turn's activity, in
   // its own lazy chunk. An honest unavailable state when the status check fails and no session runs;
   // Check again only re-reads the status.
   const [v,{voicePageHTML}]=await Promise.all([safe('voice/status?profile=chief'),import('./voice-console.mjs')]),snap=voice?.snapshot?.()||{};
   return voicePageHTML(v,snap,{esc,profiles:getBoot().profiles,project:getBoot().projects?.find(p=>p.id===getContext().project)?.name||''})
    +(v.error&&!(snap.active||snap.starting)?'':'<div class="actions">'+btn('Open agent work','section','tasks')+btn('Open the office','office')+'</div>');
  },
  // Connections (Departments batch 2): accounts as status rows with logos, plus the former Source status
  // (Data sources) and the six Local services with their start commands from workspace/services.
  async connections(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   const [integrations,services,overview,hex,calendar,t]=await Promise.all([api('integrations'),safe('workspace/services'),safe('workspace/source/revenue/overview'),safe('cockpit/revenue'),safe('workspace/calendar'),import('./tech-views.mjs')]);
   filters(search('Find a service, account or source…')+select('stage','Connection state',[['all','All accounts'],['verified','Verified'],['attention','Needs attention']]));
   return t.connectionsPage({integrations,services,overview,hex,calendar,stage:state.stage,query:state.search},{esc,btn,connectorMark})
    +'<div class="actions">'+btn('Model settings','models')+btn('System health','health')+btn('Revenue & usage','section','overview')+'</div>';
  },
  async activity(){
   const ticket=getSerial(),filters=html=>{if(ticket===getSerial())applyFilters(html)};
   const [d,legacy,t]=await Promise.all([safe('events?latest=1'),safe('workspace/source/activity?limit=200'),import('./tech-views.mjs')]),all=activityEntries(d,legacy);
   filters(search('Find an event or agent…')+select('source','Source',[['all','All sources'],...[...new Set(all.map(e=>e.source))].map(s=>[s,s])])+select('department','HQ agent',[['all','All agents'],...getBoot().profiles.map(p=>[p.id,p.name])]));
   const shown=all.filter(e=>(state.source==='all'||e.source===state.source)&&(state.department==='all'||e.profile===state.department)&&match(e.kind,e.profile?name(e.profile):'',e.title,e.detail));
   // Day-grouped feed: time on the left, what happened, who or which source; newest first.
   const sources=legacy.sources||[],down=sources.filter(s=>!s.ok),limit=state.activityAll?shown.length:80;
   const dayKey=e=>e.precision==='day'?e.day:localDay(e.at),today=localDay(Date.now()/1000),yesterday=localDay(Date.now()/1000-86400);
   const dayLabel=k=>k===today?'Today':k===yesterday?'Yesterday':new Date(k+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'});
   const dayTotals=shown.reduce((m,e)=>{const k=dayKey(e)||'Undated';return m.set(k,(m.get(k)||0)+1)},new Map()),hqCount=shown.filter(e=>e.source==='HQ').length;
   const groups=[];for(const e of shown.slice(0,limit)){const k=dayKey(e)||'Undated';const g=groups.at(-1);if(g&&g.key===k)g.items.push(e);else groups.push({key:k,items:[e]})}
   const clock=e=>{if(e.precision==='day'||!e.at)return '—';const ms=typeof e.at==='number'?(e.at<1e12?e.at*1000:e.at):Date.parse(e.at);return Number.isFinite(ms)?new Date(ms).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—'};
   // Timeline (7 Oct 2026, the 21st.dev "activity timeline" pattern): a rail through the day with the agent's avatar,
   // or a source dot, on each event.
   const node=e=>'<span class="feed-node">'+(e.profile?who(e.profile):'<i class="feed-dot" aria-hidden="true"></i>')+'</span>';
   const feedRow=e=>'<article class="feed-row"><time>'+esc(clock(e))+'</time>'+node(e)+'<div><strong>'+esc(e.title)+'</strong><small>'+esc([e.profile?name(e.profile):'',e.source,e.detail].filter(Boolean).join(' · '))+'</small></div>'+(e.run?btn('Steps','run-workflow',e.run):e.task?btn('Steps','task-workflow',(e.board?e.board+':':'')+e.task):'')+(e.profile?btn('Agent','agent',e.profile):pill(eventKind(e.kind)))+'</article>';
   // One status row per Mission Control source (Departments batch 2), naming the console that served it.
   return warning(d)+t.activitySourceRows(legacy,{esc})
    +(shown.length?'<div class="viz-grid">'+card('Events per hour · last 24 hours',columns(perHour(shown,{at:e=>e.at}),{esc,label:legacy.truncated?'The newest '+number(Math.max(0,shown.length-hqCount))+' source events and '+number(hqCount)+' Agent HQ events':'Events'}))+card('Where activity came from',barList([...shown.reduce((m,e)=>m.set(e.source||'Other',(m.get(e.source||'Other')||0)+1),new Map())].map(([source,value])=>({label:sources.find(x=>x.key===source)?.label||(source==='HQ'?'Agent HQ':label(source)),value})),{esc,format:String,label:'Events by source'}))+'</div>':'')
     +'<p class="feed-meta">'+esc(number(shown.length))+' events'+(sources.length?' · '+(down.length?down.length+' of '+sources.length+' sources unavailable':'all '+sources.length+' Mission Control sources connected'):'')+'</p>'
    +(groups.length?groups.map(g=>'<section class="feed-day"><h3>'+esc(g.key==='Undated'?'Undated':dayLabel(g.key))+' <small>'+esc((t=>t>g.items.length?g.items.length+' of '+number(t)+' shown':number(t))(dayTotals.get(g.key)||g.items.length))+'</small></h3><div class="feed">'+g.items.map(feedRow).join('')+'</div></section>').join('')+(shown.length>limit?'<button type="button" class="show-more" data-operation="activityAll" data-value="1">Show all '+esc(number(shown.length))+' events</button>':''):empty('No activity matches this view.'));
  }
 };
 return {views,enter(next){if(next!==current){state.search='';state.stage='all';state.department='all';state.source='all';state.activityAll='';current=next}},change(key,value){if(key in state)state[key]=value},operate(key,value){if(key==='month'){const [y,m]=state.month.split('-').map(Number);state.month=localDay(new Date(y,m-1+Number(value),1).getTime()/1000).slice(0,7);state.day=''}
  else if(key==='period'){const step=Number(value)||0;if(state.calendarMode==='month'){const [y,m]=state.month.split('-').map(Number),first=new Date(y,m-1+step,1);state.month=localDay(first.getTime()/1000).slice(0,7);const nowMonth=localDay(Date.now()/1000).slice(0,7);state.anchor=state.month===nowMonth?Date.now():first.getTime()}else{const d=parseDay(dayKey(state.anchor));d.setDate(d.getDate()+7*step);state.anchor=d.getTime();state.month=dayKey(state.anchor).slice(0,7)}}
  else if(key==='today'){state.anchor=Date.now();state.month=localDay(Date.now()/1000).slice(0,7);state.day=localDay(Date.now()/1000)}
  else if(key==='focus-day'){state.anchor=parseDay(value).getTime();state.month=String(value).slice(0,7);state.calendarMode='agenda'}
  else if(key==='layer'&&value in state.layers){state.layers={...state.layers,[value]:state.layers[value]===false};try{localStorage.setItem('hq-calendar-layers',JSON.stringify(state.layers))}catch{}}
  else if(key in state)state[key]=value}};
}
