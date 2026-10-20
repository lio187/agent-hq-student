// Team & People (Phase 3.1, 7 Oct 2026): every Hermes agent profile on this Mac (read from the profiles
// folder, so agents outside the office's department map still appear), with skills, routines and a
// readable SOUL per agent, above the dated human roster from Crisis Control. Pure rendering plus a small
// factory that loads the two sources and opens the SOUL dialog.
import {tileRow,chartBand,detailDialog,filterBar,sourceDetails,panel,dayLabel,freshness,kitValue} from './page-kit.mjs';
import {dataTable,stagePill,relativeTime} from './data-table.mjs';
import {barList,avatar} from './viz.mjs';
import {markdown} from './message-view.mjs';

const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const SPECIALIST_LIMIT=10;
const NO_DEPT='No department';
const deptName=p=>p.department_name||NO_DEPT;
const routineCount=p=>Number(p.routines?.total)||0;
export const PEOPLE_CHIPS=[
 {id:'all',label:'All',filter:()=>true},
 {id:'routines',label:'Has routines',filter:p=>routineCount(p)>0},
 {id:'specialist',label:'Specialist (< 10 skills)',filter:p=>p.installed&&p.skills<SPECIALIST_LIMIT},
 {id:'generalist',label:'Generalist (10+ skills)',filter:p=>p.installed&&p.skills>=SPECIALIST_LIMIT},
 // Profiles without an installed runtime fit neither group; their own chip makes the groups add up to All (7 Oct 2026).
 {id:'not-installed',label:'Not installed',filter:p=>!p.installed},
];
const median=values=>{const v=values.slice().sort((a,b)=>a-b);return v.length?v[Math.floor((v.length-1)/2)]:0};

export function filterProfiles(profiles,{query='',department='all',chip='all'}={}){
 const q=String(query||'').toLowerCase(),c=PEOPLE_CHIPS.find(x=>x.id===chip)||PEOPLE_CHIPS[0];
 return profiles.filter(p=>(department==='all'||(p.department||'none')===department)&&c.filter(p)&&(!q||[p.name,p.id,deptName(p),p.model,p.provider].some(v=>String(v||'').toLowerCase().includes(q))));
}

export function peopleTiles(roster,people,{esc=escHTML,now=Date.now()}={}){
 const list=roster?.profiles||[],configured=list.filter(p=>p.installed).length,enrolled=list.filter(p=>p.enrolled).length;
 const own=list.reduce((t,p)=>t+routineCount(p),0),shared=Number(roster?.defaultRoutines?.total)||0,enabled=list.reduce((t,p)=>t+(Number(p.routines?.enabled)||0),0)+(Number(roster?.defaultRoutines?.enabled)||0);
 const date=people?.source?.modifiedAt,f=freshness(date,{now});
 return tileRow([
  roster&&{label:'Agent profiles',value:list.length,caption:configured+' configured · '+enrolled+' in the office’s departments'},
  roster&&{label:'With a SOUL',value:list.filter(p=>p.hasSoul).length,caption:'Readable instructions; open any agent’s SOUL below'},
  roster&&{label:'Scheduled routines',value:shared+own,caption:shared+' shared · '+own+' in agent profiles · '+enabled+' enabled'},
  roster&&{label:'Skills installed',value:roster.distinctSkills??0,caption:'Unique skills · median '+median(list.filter(p=>p.installed).map(p=>p.skills))+' per agent'},
  people&&{label:'Humans on the roster',value:(people.records||[]).length,caption:f.age?'From the dated roster file'+(f.historical?' · historical':''):'Roster file saved '+(f.date||'on an unknown date')+(f.historical?' · historical':''),age:f.age},
 ],{esc,number:String});
}

export function peopleCharts(roster,{esc=escHTML}={}){
 const list=roster?.profiles||[],tally=new Map();
 for(const p of list)tally.set(deptName(p),(tally.get(deptName(p))||0)+1);
 const shared=Number(roster?.defaultRoutines?.total)||0;
 return chartBand({title:'Agents by department',meta:list.length+' profiles',body:barList([...tally].map(([label,value])=>({label,value})),{esc,format:String,max:12,label:'Agents by department'})},
  {title:'Routines per agent',meta:'scheduled jobs',body:barList(list.filter(p=>routineCount(p)>0).map(p=>({label:p.name,value:routineCount(p),note:(p.routines.enabled||0)+' enabled'})),{esc,format:String,max:10,label:'Routines per agent'}),note:shared?shared+' shared routines run under the default Hermes profile and are not counted per agent.':'',empty:'No agent has its own routines yet.'},{esc});
}

export function agentCards(profiles,{esc=escHTML,enrolledIds=new Set()}={}){
 if(!profiles.length)return '<div class="ui-state" data-kind="empty" role="status"><span class="ui-state-icon" aria-hidden="true">○</span><h3>No agents match these filters</h3></div>';
 return '<div class="agent-grid">'+profiles.map(p=>{
  const r=p.routines||{},state=!p.installed?'Not configured':p.enrolled?'Enrolled':'Outside the office';
  const routines=r.total==null?'Not readable':r.total?r.total+' · '+r.enabled+' enabled'+(r.failing?' · '+r.failing+' failing':''):'None';
  return '<article class="surface agent-profile" data-dept="'+esc(p.department||'')+'"><div class="section-head">'+avatar({name:p.name,department:p.department,size:'lg'},{esc})+'<span class="pill '+(!p.installed?'paused':p.enrolled?'ready':'info')+'">'+esc(state)+'</span></div><h2>'+esc(p.name)+'</h2><p class="eyebrow">'+esc(deptName(p))+'</p>'
   +'<dl><dt>Model</dt><dd>'+esc(p.model||'Profile default')+'</dd><dt>Provider</dt><dd>'+esc(p.provider||'Profile default')+'</dd><dt>Reasoning</dt><dd>'+esc(p.effort||'Default')+'</dd><dt>Skills</dt><dd>'+esc(p.skills)+'</dd><dt>Routines</dt><dd>'+esc(routines)+'</dd></dl>'
   +'<div class="actions">'+(p.hasSoul?'<button type="button" data-people-soul="'+esc(p.id)+'">Open SOUL</button>':'<span class="dt-muted">No SOUL.md</span>')+(enrolledIds.has(p.id)?'<button type="button" data-action="agent" data-id="'+esc(p.id)+'">Open conversation</button><button type="button" data-action="agent-workflow" data-id="'+esc(p.id)+'">Latest work</button>':'')+'</div></article>';
 }).join('')+'</div>';
}

const layoutSwitch=(layout,{esc})=>'<div class="segmented" role="group" aria-label="Layout">'+[['list','List'],['cards','Cards']].map(([id,label])=>'<button type="button" data-pk-chip="people-layout" data-value="'+id+'" aria-pressed="'+(layout===id)+'">'+esc(label)+'</button>').join('')+'</div>';
export function agentList(profiles,{esc=escHTML,enrolledIds=new Set()}={}){
 const state=p=>!p.installed?'Not configured':p.enrolled?'Enrolled':'Outside the office';
 return dataTable({id:'people-agents',esc,rows:profiles,pageSize:20,defaultSort:{key:'name',dir:'asc'},emptyText:'No agents match these filters.',
  columns:[{key:'name',label:'Agent',value:p=>p.name,className:'dt-primary',cell:p=>'<span class="pk-agent">'+avatar({name:p.name,department:p.department},{esc})+'<span><strong>'+esc(p.name)+'</strong><small>'+esc(p.model||'Profile default model')+'</small></span></span>'},
   {key:'dept',label:'Department',value:deptName,cell:p=>esc(deptName(p))},
   {key:'state',label:'State',value:state,cell:p=>stagePill(state(p),esc)},
   {key:'skills',label:'Skills',value:p=>Number(p.skills)||0,cell:p=>'<span class="dt-num">'+esc(p.skills??'—')+'</span>'},
   {key:'routines',label:'Routines',value:routineCount,cell:p=>'<span class="dt-num">'+esc(p.routines?.total==null?'—':p.routines.total)+'</span>'},
   {key:'open',label:'',className:'dt-action',cell:p=>(p.hasSoul?'<button type="button" class="dt-action" data-people-soul="'+esc(p.id)+'">SOUL</button>':'<span class="dt-muted">No SOUL</span>')+(enrolledIds.has(p.id)?'<button type="button" class="dt-action" data-action="agent" data-id="'+esc(p.id)+'">Chat</button><button type="button" class="dt-action" data-action="agent-workflow" data-id="'+esc(p.id)+'">Work</button>':'')}]});
}
export function humanRoster(people,{esc=escHTML,now=Date.now()}={}){
 const records=people?.records||[],f=freshness(people?.source?.modifiedAt,{now});
 return panel('Human roster'+(f.historical?' · '+f.label:''),'<p class="viz-note pk-lead">Register, not proof of employment. Roles, rates and conditions are as recorded in the source on '+esc(f.date||'an unknown date')+'.</p>'+dataTable({id:'people-roster',esc,rows:records,pageSize:20,defaultSort:{key:'status',dir:'asc'},emptyText:'No people on the roster.',
  tabs:[...new Set(records.map(r=>r.temporary_status).filter(Boolean))].map(s=>({id:s,label:s[0].toUpperCase()+s.slice(1),filter:r=>r.temporary_status===s})),
  columns:[
   {key:'person',label:'Person',value:r=>r.person,className:'dt-primary pk-cap',cell:r=>'<strong>'+esc(r.person||'Not recorded')+'</strong><small>'+esc(r.role||'')+'</small>'},
   {key:'status',label:'Status',value:r=>({core:0,transition:1,frozen:2})[r.temporary_status]??3,cell:r=>stagePill(r.temporary_status||'Not recorded',esc)},
   {key:'manager',label:'Manager',value:r=>r.manager,cell:r=>esc(r.manager||'—')},
   {key:'assignment',label:'Assignment',value:r=>r.approved_assignment,cell:r=>'<span class="dt-clip" title="'+esc(r.approved_assignment||'')+'">'+esc(r.approved_assignment||'—')+'</span>'},
   {key:'cost',label:'Cost basis',value:r=>r.cost_basis,cell:r=>'<span class="dt-muted">'+esc(r.cost_basis||'—')+'</span>'},
   {key:'review',label:'Review',value:r=>r.review_date||null,cell:r=>'<span class="dt-muted">'+esc(dayLabel(r.review_date)||'—')+'</span>'},
   {key:'condition',label:'Condition',value:r=>r.continuation_condition,cell:r=>'<span class="dt-clip" title="'+esc(r.continuation_condition||'')+'">'+esc(r.continuation_condition||'—')+'</span>'}]}),{esc,meta:records.length+' people'});
}

export function soulDialog(profile,soul,{esc=escHTML,now=Date.now()}={}){
 const r=profile?.routines||{};
 const routines=(r.names||[]).length?'<ul class="pk-list">'+r.names.map(n=>'<li><strong>'+esc(n.name)+'</strong> · '+esc(n.schedule||'no schedule')+' · '+(n.enabled?'enabled':'paused')+(n.lastRunAt?' · last run '+esc(relativeTime(n.lastRunAt,now)):'')+'</li>').join('')+'</ul>':null;
 return detailDialog([
  {title:'At a glance',fields:[['Department',deptName(profile||{})],['Model',profile?.model],['Provider',profile?.provider],['Reasoning',profile?.effort],['Skills',profile?.skills],['Routines',routines,{html:true}],['SOUL updated',soul?.modified?dayLabel(soul.modified)+' · '+relativeTime(soul.modified,now):null],['Size',soul?.bytes!=null?Math.max(1,Math.round(soul.bytes/1024))+' KB':null]]},
  // The renderer has no blockquotes; quote markers are dropped so the text reads cleanly (content unchanged).
  {title:'SOUL.md',html:'<div class="pk-markdown">'+markdown(String(soul?.text||'').replace(/^> ?/gm,''))+'</div>'},
 ],{esc,lead:'Read from ~/.hermes/profiles/'+(profile?.id||'')+'/SOUL.md. Read-only here; edit the file in Hermes.'});
}

export function peoplePage({roster,people,boot,query='',department='all',chip='all'},{esc=escHTML,now=Date.now()}={}){
 const r=roster?.status==='fulfilled'?roster.value:null,h=people?.status==='fulfilled'?people.value:null;
 const list=r?.profiles||[],shown=filterProfiles(list,{query,department,chip}),enrolledIds=new Set((boot?.profiles||[]).map(p=>p.id)),layout=kitValue('people-layout','list');
 return [
  peopleTiles(r,h,{esc,now}),
  r?peopleCharts(r,{esc}):'<p class="notice">The agent roster is not available'+(roster?.reason?.message?': '+esc(roster.reason.message):'')+'. No substitute agents are shown.</p>',
  // Cards or a compact list (7 Oct 2026, the 21st.dev view switcher): the list keeps the human roster within reach and
  // brings the shared table's filters, saved views and keyboard rows.
  r?panel('Agents','<div class="pk-head-row"><p class="viz-note pk-lead">'+shown.length+' of '+list.length+' profiles shown. Skills and routines are counted from each profile’s folder.</p>'+layoutSwitch(layout,{esc})+'</div>'+(layout==='cards'?agentCards(shown,{esc,enrolledIds}):agentList(shown,{esc,enrolledIds})),{esc,meta:'read '+relativeTime(r.generatedAt,now)}):'',
  h?humanRoster(h,{esc,now}):'<p class="notice">The human roster file is not available. No substitute people are shown.</p>',
  sourceDetails([['Agent profiles',r?.source?.path],['Agent roster read',r?.generatedAt?dayLabel(r.generatedAt)+' · '+relativeTime(r.generatedAt,now):null],['Human roster file',h?.source?.reference],['Human roster saved',h?.source?.modifiedAt?dayLabel(h.source.modifiedAt):null],['Human roster SHA-256',h?.source?.sha256],['Note',r?.source?.note]],{esc,title:'Source files'}),
 ].join('');
}

export function peopleFilters(roster,{esc=escHTML,query='',department='all',chip='all'}={}){
 const list=roster?.profiles||[],depts=new Map();
 for(const p of list)depts.set(p.department||'none',deptName(p));
 const base=filterProfiles(list,{query,department});
 return filterBar({esc,search:{value:query,placeholder:'Find an agent, department or model…'},
  selects:[{name:'people-dept',label:'Department',value:department,options:[['all','All departments'],...[...depts].sort((a,b)=>a[1].localeCompare(b[1]))]}],
  chips:{name:'people-chip',label:'Show',value:chip,options:PEOPLE_CHIPS.map(c=>({id:c.id,label:c.label,count:base.filter(c.filter).length}))}});
}

export function createPeopleView({api,root,filters,preview,getQuery=()=> '',getBoot=()=>({}),getSerial=()=>0,esc=escHTML}){
 let roster=null,request=0;
 root?.addEventListener('click',async e=>{
  const button=e.target.closest?.('[data-people-soul]');if(!button)return;
  const id=button.dataset.peopleSoul,profile=roster?.profiles?.find(p=>p.id===id),ticket=++request,serial=getSerial();
  preview?.((profile?.name||id)+' · SOUL','<p role="status">Reading SOUL.md…</p>');
  try{const soul=await api('workspace/agents/soul?'+new URLSearchParams({profile:id}));if(ticket!==request||serial!==getSerial())return;preview?.((profile?.name||id)+' · SOUL',soulDialog(profile||{id},soul,{esc}))}
  catch(error){if(ticket===request&&serial===getSerial())preview?.((profile?.name||id)+' · SOUL','<p role="alert">'+esc(error.message)+'</p>')}
 });
 return async()=>{
  const ticket=getSerial(),[r,people]=await Promise.allSettled([api('workspace/agents/roster'),api('workspace/records/people')]);
  if(ticket!==getSerial())return '';
  roster=r.status==='fulfilled'?r.value:null;
  const department=kitValue('people-dept','all'),chip=kitValue('people-chip','all'),query=getQuery();
  filters(roster?peopleFilters(roster,{esc,query,department,chip}):'');
  return peoplePage({roster:r,people,boot:getBoot(),query,department,chip},{esc});
 };
}
