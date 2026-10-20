// Client Delivery → Project delivery on the shared page kit (Departments batch 2, 7 Oct 2026): freshness
// status rows, tiles, the health bar and board (or a sortable list), deadline and gate charts, and a detail
// dialog with business fields first and the verification rows collapsed. Pure builders; the delivery view
// in workspace-view.mjs fetches and opens the dialog. Lazy chunk.
import {tileRow,chartBand,panel,statusRows,freshness,dayLabel,detailDialog,parseAt} from './page-kit.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {stackBar,rangeTimeline} from './viz.mjs';
import {stateView} from './ui.mjs';
import {localBuildRows} from './delivery-build.mjs';
import {startCommand,ago} from './tech-views.mjs';

const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const STATUS_LABEL={red:'Needs attention',amber:'At risk',green:'On track',frozen:'On hold',unreported:'Not reported'};
export const statusLabel=k=>STATUS_LABEL[k]||k;
const statusOf=r=>r.status||'unreported';
export const GATES=[['technical_gate','Technical'],['acceptance_gate','Acceptance'],['handoff_gate','Handoff'],['collection_gate','Collection']];
export const gatePassed=v=>/^(yes|done|passed|true|ok|complete[d]?)$/i.test(String(v??'').trim());
// "none - client is paying again" is a note, not a blocker (7 Oct 2026); "no access to the repo" still is one.
const blank=v=>!v||/^(?:none|n\/a|nothing|no|todo|tbd|-)\s*(?:[-–—:,.;]|$)/i.test(String(v).trim());
const blocker=r=>[r.client_blocker,r.internal_blocker].map(v=>String(v??'').trim().replace(/^"(.*)"$/,'$1')).find(v=>!blank(v))||'';
const today=(now=Date.now())=>{const d=new Date(now);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const overdue=(r,now)=>Boolean(r.deadline)&&String(r.deadline).slice(0,10)<today(now);
export function gateStrip(r,{esc=escHTML}={}){
 if(!GATES.some(([k])=>r[k]!=null))return '';
 return '<span class="gate-strip" role="img" aria-label="'+esc('Gates: '+GATES.map(([k,l])=>l+' '+(gatePassed(r[k])?'passed':'open')).join(', '))+'">'+GATES.map(([k,l])=>'<i data-done="'+gatePassed(r[k])+'" title="'+esc(l+' gate: '+(gatePassed(r[k])?'passed':'open'))+'"></i>').join('')+'<small>'+GATES.filter(([k])=>gatePassed(r[k])).length+'/4 gates</small></span>';
}

export function deliveryStatus(d,list,{now=Date.now()}={}){
 const projects=d?.projects||[],saved=projects.map(r=>parseAt(r.updatedAt)).filter(Boolean).sort((a,b)=>b-a)[0],f=freshness(saved,{now});
 const refs=projects.filter(r=>r.repositoryReference?.reviewedAt),latestRef=refs.map(r=>parseAt(r.repositoryReference.reviewedAt)).sort((a,b)=>b-a)[0];
 const via=d?.via,rows=[
  {label:'Project register',state:saved?f.state:'unavailable',age:false,reason:saved?(f.historical?f.label:'saved '+f.date)+' · '+projects.length+' projects · source dates, not a fresh project check':'Source date not recorded'},
 ];
 if(via)rows.push(via==='local-file'?{label:'Delivery source',state:'stale',at:d.observedAt,reason:'Both consoles are down; read from the register file on this Mac'}
  :{label:'Delivery source',state:/^Mission/.test(via)?'current':'fallback',at:d.observedAt,reason:/^Mission/.test(via)?'Mission Control (:3340) is answering':'Mission Control (:3340) is down; the course console (:3339) serves the same register'});
 if(d?.proposed)rows.push(d.proposed.present?{label:'Proposed register (26 Sep)',state:'paused',at:d.proposed.modifiedAt,reason:'Present, not merged; merging it is an owner action'}:{label:'Proposed register (26 Sep)',state:'idle',reason:'Not found next to the register'});
 rows.push({label:'Repository references',state:refs.length?'current':'idle',at:latestRef||null,reason:refs.length?refs.length+' of '+projects.length+' projects have a reviewed reference; execution is not verified':'No reviewed repository references'});
 return {rows,saved,historical:f.historical,label:f.label};
}

export function deliveryTiles(list,{esc=escHTML,now=Date.now()}={}){
 const n=k=>list.filter(r=>statusOf(r)===k).length,passed=list.reduce((t,r)=>t+GATES.filter(([k])=>gatePassed(r[k])).length,0);
 return tileRow([
  {label:'Projects',value:list.length,caption:'In the 187N delivery register'},
  {label:'Needs attention',value:n('red'),caption:'Marked red in the register'},
  {label:'At risk',value:n('amber'),caption:'Marked amber in the register'},
  {label:'On hold',value:n('frozen'),caption:'Frozen by decision'},
  {label:'Deadline passed',value:list.filter(r=>overdue(r,now)).length,caption:'Recorded deadline is before today'},
  {label:'Gates passed',value:passed+' of '+list.length*4,caption:'Technical, acceptance, handoff and collection'},
 ],{esc,number:String});
}

// Bars per gate that keep zeros (barList drops them): passed out of all projects.
export function gateBars(list,{esc=escHTML}={}){
 if(!list.length)return '';
 return '<ol class="viz-bars" aria-label="Projects that passed each gate">'+GATES.map(([k,l])=>{const v=list.filter(r=>gatePassed(r[k])).length;return '<li title="'+esc(l+' gate: '+v+' of '+list.length+' projects')+'"><span class="viz-bar-label">'+esc(l)+'</span><span class="viz-bar-track"><span class="viz-bar" style="--w:'+Math.round(v/list.length*100)+'%"></span></span><b>'+v+'/'+list.length+'</b></li>'}).join('')+'</ol>';
}
export function deliveryCharts(list,{esc=escHTML,now=Date.now()}={}){
 const dated=list.filter(r=>r.deadline&&parseAt(r.deadline)!=null),allPast=dated.length&&dated.every(r=>overdue(r,now));
 const tone={red:'error',amber:'warn',green:'live',frozen:'idle'};
 const timeline=rangeTimeline(dated.map(r=>({label:r.project||r.externalId,start:r.deadline,tone:tone[statusOf(r)]||'info',note:statusLabel(statusOf(r))})),{esc,to:allPast?now:undefined,label:'Milestone deadlines',max:16,now});
 return chartBand({title:'Milestone deadlines',meta:dated.length+' of '+list.length+' dated',body:timeline,note:allPast?'All recorded deadlines are before today ('+dayLabel(now)+'); the register has not been updated since.':list.length-dated.length?(list.length-dated.length)+' projects have no recorded deadline.':'',empty:'No project in this view has a recorded deadline.'},
  {title:'Gates passed',meta:list.length+' projects',body:gateBars(list,{esc}),note:'A gate counts only when the register marks it passed; evidence is not verified here.',empty:'No projects in this view.'},{esc});
}

export function deliveryTable(list,{esc=escHTML,indexOf=r=>0,now=Date.now()}={}){
 const stages=[...new Set(list.map(statusOf))];
 return dataTable({id:'delivery-projects',esc,rows:list,pageSize:20,defaultSort:{key:'status',dir:'asc'},emptyText:'No projects match this view.',
  tabs:stages.length>1?stages.map(k=>({id:k,label:statusLabel(k),filter:r=>statusOf(r)===k})):undefined,
  columns:[
   {key:'project',label:'Project',value:r=>r.project||r.externalId,className:'dt-primary',cell:r=>'<strong>'+esc(r.project||r.externalId)+'</strong><small>'+esc(r.client&&r.client!==r.project?r.client:r.priority||'')+'</small>'},
   {key:'status',label:'Status',value:r=>({red:0,amber:1,green:2,frozen:3})[statusOf(r)]??4,cell:r=>stagePill(statusLabel(statusOf(r)),esc)},
   {key:'lead',label:'Lead',value:r=>r.accountable_lead||null,cell:r=>esc(r.accountable_lead||'Unassigned')},
   {key:'milestone',label:'Next milestone',value:r=>r.next_milestone||null,cell:r=>'<span class="dt-clip" title="'+esc(r.next_milestone||'')+'">'+esc(r.next_milestone||'—')+'</span>'},
   {key:'deadline',label:'Deadline',value:r=>parseAt(r.deadline),cell:r=>'<span class="dt-muted"'+(overdue(r,now)?' data-overdue="true"':'')+'>'+esc(r.deadline?dayLabel(r.deadline):'—')+'</span>'},
   {key:'gates',label:'Gates',value:r=>GATES.filter(([k])=>gatePassed(r[k])).length,cell:r=>'<span class="dt-num">'+GATES.filter(([k])=>gatePassed(r[k])).length+'/4</span>'},
   {key:'open',label:'',className:'dt-action',cell:r=>'<button type="button" class="dt-action" data-action="delivery-detail" data-id="'+esc(indexOf(r))+'">Open</button>'}]});
}

export function projectCard(r,index,{esc=escHTML}={}){
 const b=blocker(r);
 return '<button class="work-card delivery-card" data-action="delivery-detail" data-id="'+esc(index)+'"><span class="card-topline"><span class="pill'+(r.status==='red'?' attention':'')+'">'+esc(statusLabel(statusOf(r)))+'</span><small>'+esc(r.priority||'')+'</small></span><strong>'+esc(r.project||r.name||r.externalId)+'</strong><span class="card-milestone">'+esc(r.next_milestone||'No milestone recorded')+'</span>'+gateStrip(r,{esc})+'<span class="card-properties"><small>'+esc(r.accountable_lead||'Unassigned')+'</small><small>'+esc(r.deadline?dayLabel(r.deadline):'No deadline')+'</small></span>'+(b?'<span class="card-blocker">'+esc(b)+'</span>':'')+'</button>';
}

export function deliveryPage(d,list,{esc=escHTML,layout='board',filterStatus='all',indexOf=r=>0,now=Date.now()}={}){
 const s=deliveryStatus(d,list,{now}),stages=[...new Set(['red','amber','green','frozen',...(d?.projects||[]).map(statusOf)])];
 const health=list.length?'<div class="work-state">'+stackBar([['red','Needs attention','error'],['amber','At risk','warn'],['green','On track','live'],['frozen','On hold','idle'],['unreported','Not reported','pending']].map(([k,l,tone])=>({label:l,value:list.filter(r=>statusOf(r)===k).length,tone})),{esc,format:String,label:'Projects by delivery health'})+'</div>':'';
 const board='<div class="work-board delivery-board">'+stages.filter(k=>filterStatus==='all'||filterStatus===k).map(k=>{const group=list.filter(r=>statusOf(r)===k);return '<section class="work-column" data-stage="'+esc(k)+'"><header><h2>'+esc(statusLabel(k))+'</h2><span class="pill">'+group.length+'</span></header><div class="work-column-cards">'+(group.map(r=>projectCard(r,indexOf(r),{esc})).join('')||'<p class="board-empty">No projects in this stage</p>')+'</div></section>'}).join('')+'</div>';
 return deliveryTiles(list,{esc,now})
  +statusRows(s.rows,{esc,now})
  +'<div class="board-summary"><strong>'+list.length+' projects'+(s.historical?' · '+esc(s.label):'')+'</strong><span>Grouped by delivery health · Open a project for milestones, blockers and evidence</span></div>'+health
  +(layout==='list'?panel('Project delivery'+(s.historical?' · '+s.label:''),deliveryTable(list,{esc,indexOf,now}),{esc,meta:list.length+' projects'}):board)
  +deliveryCharts(list,{esc,now});
}
export function deliveryOffline(services,{esc=escHTML}={}){
 return stateView({kind:'offline',title:'The delivery register is not available',body:'Project delivery is read from Mission Control (:3340) or the course console (:3339), and from the register file when both are down; none of them answered. Start Mission Control: '+startCommand(services,'mission-control')+' — or the course console: '+startCommand(services,'course-console'),actions:[{label:'Check again',action:'refresh'}]});
}

// The detail dialog: what the project is and where it stands first; verification rows collapsed below.
export function deliveryDialog(r,{esc=escHTML,date=dayLabel,link=()=>'',btn,now=Date.now()}={}){
 const ref=r.repositoryReference,dep=ref?.deploymentObservation,avail=ref?.availabilityObservation;
 const verification=[['Execution connection','Not linked to a verified workspace'],...localBuildRows(ref),
  ['Repository reference',ref?.repository||(r.evidenceStatus?.repository==='not_recorded'?'Not recorded':r.repository)],
  ['Repository reviewed',ref?.reviewedAt?date(ref.reviewedAt):'Not verified'],['Reviewed commit',ref?.head||'Not verified'],
  ['Deployment build observation',dep?dep.state+' · '+date(dep.observedAt):'Not verified'],
  ['Application availability',avail?'HTTP '+avail.httpStatus+' · '+avail.platformError+' · '+date(avail.observedAt)+' — application checks not reached':'Not verified'],
  ['Deployed commit',dep?.commit||'Not verified'],['Local/deployed version',dep?(dep.matchesReviewedLocalCommit?'Same reviewed commit':'Different commits; local checks do not verify this deployment'):'Not compared'],
  ['Acceptance verification',r.evidenceStatus?.acceptance==='not_recorded'?'No evidence recorded':'Source reference only; not verified'],
  ['Acceptance evidence',blank(r.acceptance_evidence)?null:r.acceptance_evidence],['Source record date',r.updatedAt?date(r.updatedAt):null]];
 const deadline=r.deadline?dayLabel(r.deadline)+(overdue(r,now)?' · passed, '+ago(r.deadline,now):''):null;
 const actions=[link(r.providerUrl,'Open source'),link(ref?.repository,'Open reviewed repository'),ref?.localBuildObservation?.report&&btn?btn('Open local review','delivery-report',ref.localBuildObservation.report):''].filter(Boolean).join('');
 return detailDialog([
  {title:'Project',fields:[['Status',statusLabel(statusOf(r))],['Priority',r.priority],['Client',r.client],['Accountable lead',r.accountable_lead],['Builder',r.builder],['Next milestone',r.next_milestone],['Deadline',deadline],['Client blocker',blank(r.client_blocker)?null:r.client_blocker],['Internal blocker',blank(r.internal_blocker)?null:String(r.internal_blocker).trim().replace(/^"(.*)"$/,'$1')]]},
  {title:'Gates',fields:GATES.map(([k,l])=>[l,r[k]==null?null:gatePassed(r[k])?'Passed':'Open'])},
  r.notes?{title:'Notes',html:'<p class="pk-prose">'+esc(r.notes)+'</p>'}:null,
  {title:'Evidence and verification · '+verification.filter(([,v])=>!v||/^Not (verified|compared|recorded|linked)|^No evidence/.test(String(v))).length+' not verified',collapsed:true,fields:verification},
  actions?{html:'<div class="actions detail-links">'+actions+'</div>'}:null,
 ],{esc,lead:'From the 187N project register'+(r.updatedAt?' (source date '+dayLabel(r.updatedAt)+')':'')+'. Recorded dates are source metadata, not a fresh project verification.'});
}
