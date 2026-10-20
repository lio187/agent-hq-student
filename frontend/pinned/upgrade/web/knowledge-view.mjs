// Knowledge & Assets pages on the shared page kit (Departments batch 2, 7 Oct 2026): Knowledge status (the
// Librarian's launch agents, queues, curation log and a door into the Brain) and Memory (a SOUL browser for
// every agent profile plus the default runtime's documents, rendered as Markdown). Pure builders; the views
// in mission-control-views.mjs fetch. Lazy chunk.
import {tileRow,chartBand,panel,statusRows,freshness,dayLabel,sourceDetails,parseAt} from './page-kit.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {barList,columns,avatar} from './viz.mjs';
import {stateView,brandTrace} from './ui.mjs';
import {markdown} from './message-view.mjs';
import {perDaySum,startCommand,ago} from './tech-views.mjs';

const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=n=>new Intl.NumberFormat('en-GB').format(Number(n)||0);
const kb=b=>b==null?'—':b<1024?b+' B':(b/1024).toFixed(b<10240?1:0)+' KB';

// --- Knowledge status --------------------------------------------------------------------------------
const WORKER={'brain-fathom':'Fathom ingest','brain-gmail':'Gmail ingest','brain-librarian':'Librarian (wiki compiler)','brain-sync':'Wiki sync','brain-whatsapp':'WhatsApp bridge','brain-whatsapp-summarise':'WhatsApp summaries'};
export const workerName=a=>WORKER[a.name]||String(a.name||a.label||'Worker').replace(/^brain-/,'').replace(/[-_]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
const val=x=>x&&x.measured!==false?x.value:null;
// A worker's time is its last check (the tick) when it has one; the last real success is named beside it, so a
// Librarian that checks every 15 minutes and finds nothing to do is not shown as 5 days old (7 Oct 2026).
// A worker that missed three of its scheduled runs is stale, whatever its last exit code says.
const intervalMs=schedule=>{const m=/every\s+(\d+)\s*(min|h|hour|day)/i.exec(String(schedule||''));if(!m)return null;const n=Number(m[1]),u=m[2].toLowerCase();return n*(u==='min'?60000:u.startsWith('h')?3600000:86400000)};
export function workerRow(a,{now=Date.now()}={}){
 const schedule=val(a.schedule),exit=val(a.lastExit),tick=a.lastTick?.measured?a.lastTick:null,lastOk=val(a.lastOk);
 const at=tick?.value||lastOk||null,every=intervalMs(schedule),t=parseAt(at),missed=every&&t!=null&&now-t>3*every;
 let state=a.state==='failing'?'unavailable':a.state==='not-enabled'?'paused':['ok','running'].includes(a.state)?'current':'stale';
 if(state==='current'&&missed)state='stale';
 const reason=a.state==='failing'?'Last run exited with code '+(exit??'unknown'):a.state==='not-enabled'?'Not enabled: the launch agent is present but not loaded':a.state==='running'?'Running now':missed?'Missed its last scheduled runs':tick?.line?'Last check: '+String(tick.line).replace(/^\S+\s+\S+\s+/,''):a.state==='ok'?(lastOk?'Last run succeeded':'Last exit code 0; no success time is recorded'):'State '+a.state;
 const compiled=tick&&lastOk&&lastOk!==tick.value?'last success '+relativeTime(lastOk,now):'';
 return {label:workerName(a),state,reason:[reason,compiled,schedule?'runs '+schedule:''].filter(Boolean).join(' · '),at,badge:a.state==='not-enabled'?'Not enabled':a.state==='failing'?'Failing':state==='stale'?'Stale':''};
}
const OPS={ingest:'Ingested a source',update:'Updated pages',query:'Answered a query',init:'Initialised the wiki',lint:'Repaired links',repair:'Repaired links'};
export const opLabel=op=>OPS[op]||String(op||'Other').replace(/^\w/,c=>c.toUpperCase());
// "2026-07-30-is-de-brand-factory-engine.md" → {date:'2026-07-30', title:'Is de brand factory engine'}
export function openItem(name,kind){
 const s=String(name||'').replace(/\.md$/i,''),m=/^(\d{4}-\d{2}-\d{2})(?:T[\d-]+)?\s*(?:—|-)?\s*(.*)$/.exec(s);
 const rest=(m?m[2]:s).replace(/-/g,' ').trim();
 return {kind,date:m?m[1]:null,title:rest?rest[0].toUpperCase()+rest.slice(1):s,file:String(name||'')};
}
export function librarianOffline(services,{esc=escHTML}={}){
 return stateView({kind:'offline',title:'The course console is not running',body:'Brain status, the Librarian log and runtime memory are read from the course console (:3339). Start it: '+startCommand(services,'course-console'),actions:[{label:'Check again',action:'refresh'}]});
}
export function brainCard(graph,communities,{esc=escHTML,btn,now=Date.now()}={}){
 const c=graph?.counts,built=communities?.available?parseAt(communities.built_at):null;
 const facts=c?'<dl class="brain-facts"><div><dt>Notes</dt><dd>'+esc(count(c.nodes))+'</dd></div><div><dt>Links</dt><dd>'+esc(count(c.edges))+'</dd></div><div><dt>Without links</dt><dd>'+esc(count(c.isolated))+'</dd></div>'+(communities?.available?'<div><dt>Communities</dt><dd>'+esc(count(Object.keys(communities.labels||{}).length||communities.labels?.length||0))+'</dd></div>':'')+'</dl>':'<p class="dt-empty">The Second Brain graph could not be read right now.</p>';
 const note=[graph?.vault?.indexed_at?'Indexed '+relativeTime(graph.vault.indexed_at*1000,now):'',built?'graphify communities built '+dayLabel(built)+(communities.stale?' (stale: '+(communities.wiki_newer!=null?communities.wiki_newer+' wiki pages changed since; ':'')+'re-running graphify is an owner action)':''):''].filter(Boolean).join(' · ');
 return '<section class="surface brain-door"><div class="brain-door-mark">'+brandTrace({mode:'intro',size:'lg'})+'</div><div class="brain-door-body"><p class="eyebrow">THE BRAIN</p><h2>Second Brain, as a graph</h2><p>Every wiki page the Librarian compiled, with its links and communities, in the 3D Brain. Search flies to a note; the reader shows backlinks.</p>'+facts+(note?'<p class="pk-note">'+esc(note)+'</p>':'')+'<div class="actions">'+btn('Open the Brain','brain','',true)+'</div></div></section>';
}
export function librarianPage({d,log,graph,communities,services,query=''},{esc=escHTML,btn,now=Date.now()}={}){
 const q=String(query||'').toLowerCase(),match=(...v)=>!q||v.join(' ').toLowerCase().includes(q);
 if(d?.error)return librarianOffline(services,{esc})+brainCard(graph,communities,{esc,btn,now});
 const agents=d.agents||[],rows=agents.map(a=>workerRow(a,{now})),healthy=rows.filter(r=>r.state==='current').length,failing=agents.filter(a=>a.state==='failing').length;
 const q0=d.queue||{},open=d.open||{},entries=log?.entries||[],newest=entries.map(e=>e.date).filter(Boolean).sort().at(-1);
 const measured=x=>x?.measured===true?x.value:null;
 const items=[...(open.held?.items||[]).map(n=>openItem(n,'Held note')),...(open.questions?.items||[]).map(n=>openItem(n,'Open question'))].filter(i=>match(i.title,i.kind,i.file));
 const oldest=entries.map(e=>e.date).filter(Boolean).sort()[0],days=Math.max(14,Math.min(60,oldest?Math.ceil((now-parseAt(oldest))/86400000)+1:30));
 const ops=Object.entries(log?.opCounts||{}).map(([op,value])=>({label:opLabel(op),value}));
 const feed=entries.filter(e=>match(e.title,e.op,e.body,opLabel(e.op)));
 const groups=[];for(const e of feed){const g=groups.at(-1);if(g&&g.key===e.date)g.items.push(e);else groups.push({key:e.date,items:[e]})}
 const feedRow=e=>'<article class="feed-row log-row"><div><strong>'+esc(e.title)+'</strong>'+(e.body?'<details class="log-excerpt"><summary>Read the log entry</summary><p>'+esc(String(e.body).replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,'$1'))+'</p>'+(e.bodyTruncated?'<p class="pk-note">Source excerpt is truncated.</p>':'')+'</details>':'')+'</div>'+stagePill(opLabel(e.op),esc)+'</article>';
 const privateQueue=q0.private&&q0.private.measured!==true?'Private inbox: Not measured ('+(q0.private.reason||'never read')+')':'Private inbox: '+count(measured(q0.private));
 return tileRow([
  {label:'Workers healthy',value:healthy+' of '+agents.length,caption:'Launch agents whose last run succeeded'},
  {label:'Workers failing',value:failing,caption:failing?'Last exit code was not 0; see the rows below':'No launch agent reports a failed run'},
  {label:'Shared inbox',value:measured(q0.shared)??'Not measured',caption:'Files waiting for the Librarian · the private inbox is never counted'},
  {label:'Held notes',value:measured(open.held)??'Not measured',caption:'Held back until you decide'},
  {label:'Open questions',value:measured(open.questions)??'Not measured',caption:'Waiting for your answer in the questions folder'},
  {label:'Log entries',value:log?.total??(log?.error?null:entries.length),caption:newest?(freshness(newest,{now}).age?'Newest curation log entry':'Latest '+dayLabel(newest)):'Curation log not read',age:newest&&freshness(newest,{now}).age?freshness(newest,{now}).age:''},
 ],{esc,number:String})
 +panel('Librarian workers',statusRows(rows.filter(r=>match(r.label,r.reason)).map(r=>({...r,label:r.label+(r.badge?' · '+r.badge:'')})),{esc,now})||'<p class="dt-empty">No workers match this search.</p>',{esc,meta:(d.via?'via '+d.via+' · ':'')+'read '+relativeTime(d.generatedAt,now)})
 +chartBand({title:'Activity by type',meta:log?.total!=null?'all '+count(log.total)+' entries':'',body:log?.error?'':barList(ops,{esc,format:count,max:6,label:'Curation log entries by type'}),empty:log?.error?'The curation log could not be read: '+log.error:'No curation entries yet.'},
  {title:'Entries per day',meta:'last '+days+' days'+(log?.total>entries.length?' · from the newest '+count(entries.length)+' of '+count(log.total)+' entries':''),body:entries.length?columns(perDaySum(entries,{days,at:e=>e.date,now}),{esc,label:'Curation log entries per day'}):'',note:log?.capped?(log.capNote||'Newest entries only')+' — the log read is capped.':'',empty:'No dated log entries.'},{esc})
 +panel('Open items',dataTable({id:'librarian-open',esc,rows:items,pageSize:10,defaultSort:{key:'since',dir:'desc'},emptyText:'Nothing is held or waiting for an answer.',
  tabs:[...new Set(items.map(i=>i.kind))].map(k=>({id:k.toLowerCase().replace(/\s+/g,'-'),label:k+'s',filter:i=>i.kind===k})),
  columns:[{key:'title',label:'Item',value:i=>i.title,className:'dt-primary',cell:i=>'<strong>'+esc(i.title)+'</strong><small>'+esc(i.file)+'</small>'},
   {key:'kind',label:'Kind',value:i=>i.kind,cell:i=>stagePill(i.kind,esc)},
   {key:'since',label:'Since',value:i=>i.date,cell:i=>'<span class="dt-muted">'+esc(i.date?dayLabel(i.date)+' · '+relativeTime(i.date,now):'—')+'</span>'}]})
  +'<p class="pk-note">Answer a question by editing its file in the Librarian’s questions folder; the next run picks it up. '+esc(privateQueue)+'.</p>',{esc,meta:items.length+' items'})
 +panel('Curation log',(log?.error?'<p class="notice">'+esc(log.error)+'</p>':'<p class="pk-lead">'+esc(log?.capped?log.capNote:(log?.total??entries.length)+' entries')+(log?.modified?' · log saved '+relativeTime(log.modified,now):'')+'</p>')
  +(groups.length?groups.map(g=>'<section class="feed-day"><h3>'+esc(g.key?dayLabel(g.key):'Undated')+' <small>'+g.items.length+'</small></h3><div class="feed">'+g.items.map(feedRow).join('')+'</div></section>').join(''):'<p class="dt-empty">No log entries match this search.</p>'),{esc})
 +brainCard(graph,communities,{esc,btn,now})
 +sourceDetails([...agents.map(a=>[workerName(a)+' · launch agent',[a.label,val(a.whyOff),val(a.plistNote)].filter(Boolean).join(' — ')]),['Curation log',log?.source],['Shared inbox',q0.shared?.source],['Batch size',measured(q0.batchSize)!=null?measured(q0.batchSize)+' notes per run':null],['Policy',d.policy?.notEnabledIsNotFailed]],{esc,title:'Source files'});
}

// --- Memory: SOUL browser + default runtime documents -------------------------------------------------
export function soulGrid(profiles,{esc=escHTML,now=Date.now(),query=''}={}){
 const q=String(query||'').toLowerCase(),list=(profiles||[]).filter(p=>p.hasSoul&&(!q||[p.name,p.id,p.department_name].join(' ').toLowerCase().includes(q)));
 if(!list.length)return '<p class="dt-empty">No agent SOUL matches this search.</p>';
 const groups=new Map();for(const p of list.slice().sort((a,b)=>(a.department_name?0:1)-(b.department_name?0:1)||String(a.department_name||'').localeCompare(String(b.department_name||''))||a.name.localeCompare(b.name))){const k=p.department_name||'No department';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
 return [...groups].map(([dept,items])=>'<section class="soul-group"><h3>'+esc(dept)+' <small>'+items.length+'</small></h3><div class="soul-grid">'+items.map(p=>'<button type="button" class="soul-card" data-hq-detail="'+esc('soul|'+p.id)+'" aria-label="'+esc('Open the SOUL of '+p.name)+'">'+avatar({name:p.name,department:p.department,size:'md'},{esc})+'<span><strong>'+esc(p.name)+'</strong><small>'+esc([kb(p.soulBytes),p.soulModified?'updated '+relativeTime(p.soulModified,now):''].filter(Boolean).join(' · '))+'</small></span></button>').join('')+'</div></section>').join('');
}
export function memoryDocuments(listing,soul){
 const files=listing?.files?.ok?listing.files.data||[]:[];
 const docs=files.map(f=>({id:f.name,name:f.name,path:'~/.hermes/memories/'+f.name,bytes:f.bytes,modified:f.modified,kind:'Memory'}));
 const s=soul?.soul?.ok&&soul.soul.data&&typeof soul.soul.data==='object'?soul.soul.data:null;
 docs.push({id:'__soul__',name:'SOUL.md',path:'~/.hermes/SOUL.md',bytes:s?.bytes??null,modified:s?.modified||null,kind:'Persona'});
 return docs;
}
export function memoryPage({listing,soul,roster,doc,docName='',query=''},{esc=escHTML,now=Date.now()}={}){
 const filesOk=Boolean(listing?.files?.ok),profiles=roster?.profiles||[],souls=profiles.filter(p=>p.hasSoul);
 const docs=filesOk?memoryDocuments(listing,soul):[],latest=docs.map(d=>parseAt(d.modified)).filter(Boolean).sort((a,b)=>b-a)[0];
 const selected=docs.find(d=>d.id===docName),q=String(query||'').toLowerCase();
 const table=dataTable({id:'memory-docs',esc,rows:docs.filter(d=>!q||[d.name,d.kind].join(' ').toLowerCase().includes(q)),pageSize:10,defaultSort:{key:'updated',dir:'desc'},emptyText:'No runtime documents.',
  columns:[{key:'name',label:'Document',value:d=>d.name,className:'dt-primary',cell:d=>'<strong>'+esc(d.name)+'</strong><small>'+esc(d.path)+'</small>'},
   {key:'kind',label:'Kind',className:'pk-hide-split',value:d=>d.kind,cell:d=>stagePill(d.kind,esc)},
   {key:'size',label:'Size',value:d=>d.bytes??null,cell:d=>d.bytes==null?'<span class="dt-muted">Read when opened</span>':'<span class="dt-num">'+esc(kb(d.bytes))+'</span>'},
   {key:'updated',label:'Updated',value:d=>parseAt(d.modified),cell:d=>'<span class="dt-muted">'+esc(d.modified?relativeTime(d.modified,now):'—')+'</span>'},
   {key:'open',label:'',className:'dt-action',cell:d=>'<button type="button" class="dt-action" data-pk-chip="memory-doc" data-value="'+esc(d.id)+'" aria-pressed="'+(d.id===docName)+'">'+(d.id===docName?'Reading':'Read')+'</button>'}]});
 const content=doc&&typeof doc.content==='string'?doc.content:null;
 // Split view (7 Oct 2026, the 21st.dev list + reader pattern): the chosen document opens beside the list, not below it.
 const reader=selected?panel(selected.name,content!=null?'<p class="pk-lead">'+esc(selected.path)+(doc.modified?' · updated '+dayLabel(doc.modified)+' ('+relativeTime(doc.modified,now)+')':'')+'</p><div class="pk-markdown memory-reader">'+markdown(content)+'</div>':'<p class="notice">This document could not be read.</p>',{esc,meta:'read-only'}):'';
 const status=statusRows([
  {label:'Default runtime memory',state:filesOk?'current':'unavailable',at:listing?.generatedAt,reason:filesOk?docs.length+' documents'+(listing.via?' · via '+listing.via:''):(listing?.error||listing?.files?.reason||'Runtime memory is unavailable')},
  {label:'Agent profiles',state:roster&&!roster.error?'current':'unavailable',at:roster?.generatedAt,reason:roster&&!roster.error?profiles.length+' profiles · '+souls.length+' with a SOUL':roster?.error||'The agent roster could not be read'},
 ],{esc,now});
 return tileRow([
  {label:'Agent SOULs',value:roster&&!roster.error?souls.length:null,caption:'Readable persona files; open any of them below'},
  {label:'Runtime documents',value:filesOk?docs.length:null,caption:'Default Hermes memory, user profile and persona'},
  {label:'Runtime memory size',value:filesOk?kb(listing.counts?.bytes??docs.reduce((t,d)=>t+(d.bytes||0),0)):null,caption:'MEMORY.md and USER.md together'},
  {label:'Last memory update',value:latest?ago(latest,now):null,caption:latest?'Saved '+dayLabel(latest):'Not reported'},
 ],{esc,number:String})
 +status
 +(filesOk?'<div class="pk-split">'+panel('Default runtime documents',table+'<p class="pk-note">Read-only here; Hermes maintains these files and the Librarian maintains the shared wiki. A document is only read when you open it.</p>',{esc,meta:docs.length+' documents'})+(reader||panel('Reader','<p class="dt-empty">Choose Read on a document to open it here.</p>',{esc,meta:'read-only'}))+'</div>':panel('Default runtime documents',stateView({kind:'offline',title:'Runtime memory is unavailable',body:(listing?.error||listing?.files?.reason||'The course console did not answer.')+' Agent SOULs below are read directly from the profiles and still work.'}),{esc}))
 +panel('Agent SOULs',roster&&!roster.error?'<p class="pk-lead">Each agent’s SOUL.md, grouped by department. Open one to read it rendered, with the agent’s model, skills and routines.</p>'+soulGrid(profiles,{esc,now,query}):'<p class="notice">The agent roster is not available. No substitute agents are shown.</p>',{esc,meta:souls.length+' of '+profiles.length+' profiles'});
}
