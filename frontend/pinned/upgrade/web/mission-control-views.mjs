import {label} from './labels.mjs';
import {routineHealth,scheduleText} from './routine-health.mjs';
import {stackBar,dayTimeline} from './viz.mjs';
import {registerDetail,bindSoulDialog,rememberRoster} from './detail-open.mjs';
import {kitValue,setKitValue} from './page-kit.mjs';
import {todoistTasks} from './todoist-tasks.mjs';
export {todoistTasks};
// Native projections of the existing Mission Control sources. No implicit writes.
export function sessionRows(payload){
 if(!payload.sessions?.ok)throw new Error(payload.sessions?.reason||'Runtime session history is unavailable.');
 return [...(payload.sessions.data||[])].sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
}
export function createMissionControlViews({api,getBoot,getSerial,getContext,filters,esc,number,date,btn,pill,row,rows,metric,card,safeLink,preview}){
 let section='',query='',filter='all',layout='board',project='all';
 // Departments batch 2: the SOUL dialog (shared with Team & People and Tech → Agents) and soft reads.
 bindSoulDialog({api,preview,esc});
 const soft=async path=>{try{return await api(path)}catch(e){return {error:e.message,code:e.code,status:e.status}}};
 const searchBox=(placeholder='Search this view…')=>'<label class="search">Search<input type="search" id="operation-search" data-mission-control="query" value="'+esc(query)+'" placeholder="'+esc(placeholder)+'"></label>';
 const names=id=>getBoot().profiles.find(p=>p.id===id)?.name||id||'Default';
 const matches=(...values)=>values.join(' ').toLowerCase().includes(query.toLowerCase());
 function controls(ticket,options,extra=''){
  if(ticket!==getSerial())return;
  filters('<label class="search">Search<input type="search" id="operation-search" data-mission-control="query" value="'+esc(query)+'" placeholder="Search this view…"></label><label>Show<select data-mission-control="filter">'+options.map(([id,label])=>'<option value="'+esc(id)+'" '+(filter===id?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>'+extra);
 }
 const metrics=html=>'<div class="metrics">'+html+'</div>';
 // Routine state at a glance, and where each active routine's next run falls in the next 24 hours (only the next run
 // is known per routine, so frequent routines show one dot, not every repeat).
 const routineVisuals=(all,paused)=>{
  const states=all.map(r=>paused(r)?'paused':routineHealth(r).result);
  const count=k=>states.filter(s=>k.includes(s)).length;
  const bar=stackBar([{label:'Last run completed',value:count(['succeeded']),tone:'live'},{label:'Running',value:count(['running']),tone:'info'},{label:'Last run failed',value:count(['failed']),tone:'error'},{label:'No verified result',value:count(['unknown','cancelled']),tone:'pending'},{label:'Paused',value:count(['paused']),tone:'idle'}],{esc,format:String,label:'Routines by state'});
  const next=all.filter(r=>!paused(r)&&r.next_run_at).map(r=>({label:r.name||r.id,at:r.next_run_at,tone:routineHealth(r).result==='failed'?'error':'info'}));
  return '<div class="viz-grid">'+card('Routine state',bar||'<p class="dt-empty">No routines yet.</p>')+card('Next 24 hours',dayTimeline(next,{esc,label:'Next scheduled run of each active routine'})+'<p class="viz-note">One dot per active routine at its next scheduled run'+(next.length?' ('+next.length+')':'')+'. Red: the last run failed.</p>')+'</div>';
 };
 const views={
  // Knowledge status (Departments batch 2): worker status rows, queue tiles, curation charts, open items, the
  // log feed and a door into the Brain. The course console serves the Librarian; when it is down the page
  // says so with the start command from workspace/services, and the Brain card (HQ's own index) still works.
  async librarian(){
   const ticket=getSerial(),[d,log,graph,communities,m]=await Promise.all([soft('workspace/source/brain/librarian'),soft('workspace/source/brain/log'),soft('brain/graph?scope=second&count=1'),soft('brain/communities'),import('./knowledge-view.mjs')]);
   if(ticket!==getSerial())return '';
   const services=d.error?await soft('workspace/services'):null;
   if(ticket===getSerial())filters(searchBox('Find a worker, item or log entry…')+btn('Open the Brain','brain'));
   return m.librarianPage({d,log,graph,communities,services,query},{esc,btn});
  },
  // Memory (Departments batch 2): a SOUL browser for every agent profile (dialog shared with Team & People)
  // plus the default runtime's documents rendered as Markdown. A document is only read once it is chosen.
  async memory(){
   const ticket=getSerial(),[listing,roster,m]=await Promise.all([soft('workspace/source/hermes/memory'),soft('workspace/agents/roster'),import('./knowledge-view.mjs')]);
   if(ticket!==getSerial())return '';
   rememberRoster(roster);
   const files=listing.files?.ok?listing.files.data||[]:[];
   let docName=kitValue('memory-doc','');
   if(docName&&(!listing.files?.ok||docName!=='__soul__'&&!files.some(f=>f.name===docName))){docName='';setKitValue('memory-doc','')}
   const picked=docName?await soft('workspace/source/hermes/'+(docName==='__soul__'?'soul':'memory?file='+encodeURIComponent(docName))):null;
   if(ticket!==getSerial())return '';
   const doc=!picked||picked.error?null:docName==='__soul__'?(picked.soul?.ok?picked.soul.data:null):(picked.file?.measured!==false?picked.file?.value:null);
   filters(searchBox('Find an agent or document…')+btn('Open the Brain','brain'));
   return m.memoryPage({listing,soul:docName==='__soul__'?picked:null,roster,doc,docName,query},{esc});
  },
  // Source status was folded into Tech → Connections (Data sources + Local services); #workspace/sources
  // still resolves there through normalizeSection().
  async todoist(){
   const ticket=getSerial(),d=await api('workspace/source/tasks/records'),all=todoistTasks(d),now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
   const overdue=t=>!t.completed&&t.due&&t.due.slice(0,10)<today;
   controls(ticket,[['all','All tasks'],['open','Open'],['overdue','Overdue'],['undated','Without a date'],['completed','Completed']],'<label>Project<select data-mission-control="project"><option value="all">All connected projects</option>'+Object.entries(d.projectNames||{}).map(([id,name])=>'<option value="'+esc(id)+'" '+(project===id?'selected':'')+'>'+esc(name)+'</option>').join('')+'</select></label><label>Layout<select data-mission-control="layout">'+['board','list'].map(k=>'<option '+(layout===k?'selected':'')+'>'+k+'</option>').join('')+'</select></label>');
   const history=await api('workspace/todoist/priority');
   const shown=all.filter(t=>(project==='all'||t.projectId===project)&&matches(t.title,t.description,t.project,...t.labels)&&(filter==='all'||filter==='open'&&!t.completed||filter==='overdue'&&overdue(t)||filter==='undated'&&!t.due||filter==='completed'&&t.completed));
   const details=t=>'<details class="operations-detail task-detail"><summary><span class="task-title">'+esc(t.title)+'</span><small class="task-due" data-due="'+(t.completed?'done':!t.due?'none':overdue(t)?'overdue':'set')+'">'+esc(t.completed?'Completed':t.due?(overdue(t)?'Overdue · ':'Due ')+date(t.due):'No deadline')+'</small></summary>'+row(t.project,'P'+(5-t.priority),safeLink(t.url,'Open in Todoist')+(!t.completed&&d.syncState==='synced'?btn('Change priority','todoist-priority',t.id):''))+(t.labels.length?row('Labels',t.labels.join(', ')):'')+'<p class="script-reader">'+esc(t.description||'No description')+'</p></details>';
   return (history.actions?.length?card('Priority action history',rows(history.actions,p=>row(p.title||p.id,p.actionId,btn('Check status','todoist-priority-status',p.actionId)))):'')+'<div class="source">'+pill(d.syncState||'Unavailable')+'<span>Read '+esc(date(d.observedAt))+'</span></div>'+(d.reason?'<p class="notice">'+esc(d.reason)+'</p>':'')+
    metrics(metric('Open',all.filter(t=>!t.completed).length)+metric('Overdue',all.filter(overdue).length)+metric('Without a date',all.filter(t=>!t.due).length)+metric('Showing',shown.length))+
    (layout==='list'?card('Todoist',rows(shown,details)):'<div class="work-board todoist-board">'+['triage','ready','running','review','blocked','done'].map(stage=>{const group=shown.filter(t=>t.stage===stage);return '<section class="work-column"><header><h2>'+esc(stage[0].toUpperCase()+stage.slice(1))+'</h2>'+pill(group.length)+'</header><div class="work-column-cards">'+(group.map(t=>'<article class="work-card">'+details(t)+'</article>').join('')||'<p class="board-empty">No tasks in this stage</p>')+'</div></section>'}).join('')+'</div>');
  },
  async routines(){
   const routineRow=(r,isPaused)=>{const health=routineHealth(r),state=isPaused?'paused':health.result==='failed'?'failing':health.result==='running'?'running':'active',label={paused:'Paused',failing:'Last run failed',running:'Running',active:'Active'}[state],key=esc(r.profile)+':'+esc(r.id),agent=getBoot().profiles.some(p=>p.id===r.profile);
    // Two primary actions stay visible; the rest sit in a native "More" menu (7 Oct 2026: six buttons per row was noise).
    const more=[r.managed?'<button type="button" data-action="routine-edit" data-id="'+key+'">Edit</button><button type="button" data-action="routine-results" data-id="'+key+'">Results</button>':'',health.at||r.last_run_at?btn('Last run steps','routine-workflow',r.profile+':'+r.id):'',agent?btn('Open agent','agent',r.profile):''].join('');
    return '<article class="routine-row" data-state="'+state+'"><div class="routine-main"><span class="routine-badge" data-state="'+state+'">'+label+'</span><strong>'+esc(r.name||r.id)+'</strong><small>'+esc(names(r.profile))+' · '+esc(scheduleText(r.schedule))+(r.model?' · '+esc(r.model):'')+(r.reasoning_effort?' · '+esc(r.reasoning_effort)+' effort':'')+(r.needs_ok?' · Needs OK':'')+'</small></div>'
     +'<dl class="routine-when"><div><dt>Next</dt><dd>'+(isPaused?'Paused':r.next_run_at?esc(date(r.next_run_at)):'Not scheduled')+'</dd></div><div><dt>Last</dt><dd>'+(health.at?esc(date(health.at)):'No run yet')+(r.repeat?.completed?' · '+esc(r.repeat.completed)+' runs':'')+'</dd></div></dl>'
     +'<div class="routine-actions">'+(r.managed?'<button type="button" data-action="routine-op" data-id="run:'+key+'"'+(isPaused?' disabled title="Resume the routine before running it"':'')+'>Run now</button><button type="button" data-action="routine-op" data-id="'+(isPaused?'resume':'pause')+':'+key+'">'+(isPaused?'Resume':'Pause')+'</button>':'<span class="source">Existing scheduler · metadata only</span>')+(more?'<details class="row-more"><summary aria-label="More actions for '+esc(r.name||r.id)+'">More</summary><div class="row-menu" role="group">'+more+'</div></details>':'')+'</div></article>'};

   const ticket=getSerial(),[result,inventory]=await Promise.all([api('routines'),api('team').catch(error=>({error:error.message}))]),managed=result.filter(r=>!r.unavailable),keys=new Set(managed.map(r=>r.profile+':'+r.id)),extra=[...(inventory.groups||[]).flatMap(g=>g.jobs||[]),...(inventory.other_routines||[])].filter(r=>!keys.has(r.profile+':'+r.id)),all=[...managed.map(r=>({...r,managed:true})),...extra.map(r=>({...r,managed:false}))],unavailable=result.filter(r=>r.unavailable),paused=r=>r.paused||r.enabled===false;
   controls(ticket,[['all','All schedules'],['project','Selected enrolled project'],['active','Active'],['paused','Paused']],btn('Manage routines','routines'));
   const shown=all.filter(r=>matches(r.name,r.profile,r.model)&&(filter==='all'||filter==='project'&&r.office_project===getContext().project||filter==='active'&&!paused(r)||filter==='paused'&&paused(r)));
   return (inventory.error?'<p class="notice">'+esc(inventory.error)+'</p>':'')+((inventory.read_errors||[]).length?'<p class="notice">Some scheduler inventories could not be read.</p>':'')+(unavailable.length?'<p class="notice">Could not read routines for '+esc(unavailable.map(r=>names(r.profile)).join(', '))+'.</p>':'')+metrics(metric('Routines',all.length,managed.length+' managed by HQ (as on Overview) · '+extra.length+' in other schedulers')+metric('Active',all.filter(r=>!paused(r)).length,'Scheduled and not paused')+metric('Paused',all.filter(paused).length,'Resume from the routine row')+metric('Showing',shown.length,'Match the search and filter'))+routineVisuals(all,paused)+
    '<section class="routine-list" aria-label="Scheduled work">'+(shown.length?shown.map(r=>routineRow(r,paused(r))).join(''):'<p class="notice">No routines match this view.</p>')+'</section>';
  },
  // Runtime sessions (Departments batch 2): tiles, sessions and tokens per day, a sortable table with a detail
  // dialog and a Workflow button per row. Served by Mission Control or, when it is down, the course console
  // (the answer names which); the offline state appears only when both are down.
  async sessions(){
   const ticket=getSerial(),m=await import('./tech-views.mjs');let d;
   try{d=await api('workspace/source/hermes/sessions')}
   catch(error){if(!m.isUnavailable(error))throw error;const services=await soft('workspace/services');if(ticket!==getSerial())return '';filters('');return m.sessionsOffline(services.error?null:services,{esc})}
   const all=sessionRows(d);if(ticket!==getSerial())return '';
   filters(searchBox('Find a session, model or provider…')+btn('Open the office','office'));
   registerDetail('session',id=>{const r=all.find(x=>x.id===id);if(r)preview?.(r.title||'Runtime session',m.sessionDialog(r,{esc,btn}))});
   return m.sessionsPage(d,{esc,btn,query});
  }
 };
 return {views,enter(next){if(next!==section){section=next;query='';filter='all';setKitValue('memory-doc','')}},change(key,value){if(key==='query')query=value;if(key==='filter')filter=value;if(key==='layout'&&['board','list'].includes(value))layout=value;if(key==='project')project=value;if(key==='memory')setKitValue('memory-doc',value)}};
}
