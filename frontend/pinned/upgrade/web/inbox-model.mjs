// Inbox model (7 Oct 2026): everything that needs the owner, from sources the office already reads, grouped by
// what he has to do: Approve, Answer, Reconnect, Review, Fix, then a recent feed (FYI). Pure: the view renders it.
// A source that fails lands in `unavailable` with its reason; it never produces a zero.
import {routineHealth} from './routine-health.mjs';
import {serviceName} from './labels.mjs';

export const GROUPS=[['approve','Approve'],['answer','Answer'],['review','Review'],['reconnect','Reconnect'],['fix','Fix'],['fyi','Recent']];
// Event kinds that exist in the office store and are worth a line in the recent feed.
export const FEED_KINDS=new Set(['run.completed','run.failed','run.interrupted','task.created','task.delegated','task.started','task.completed','task.blocked','task.failed','routine.reviewed','knowledge.submitted','approval.responded','clarification.responded','task.revision.created']);
const FEED_TEXT={'run.completed':'Result ready','run.failed':'Run failed','run.interrupted':'Run interrupted','task.created':'Task created','task.delegated':'Chief delegated a task','task.started':'Task started','task.completed':'Task completed','task.blocked':'Task blocked','task.failed':'Task failed','routine.reviewed':'Routine result reviewed','knowledge.submitted':'Knowledge submitted','approval.responded':'Approval answered','clarification.responded':'Question answered','task.revision.created':'Revision requested'};
const ATTENTION=new Set(['expired','insufficient-scope']);
const clip=(s,n=120)=>{s=String(s??'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s};
// Raw script output in a reason ("Script exited with code 1 stdout: { … }") reads as its first sentence (10 Oct 2026).
const plain=s=>{const t=String(s??'').replace(/\s*stdout:[\s\S]*$/i,'').replace(/\s*[\[{][\s\S]*$/,'').trim();return t||(s?'The script reported an error; the full output is in its log':'')};
const seconds=v=>typeof v==='number'?(v<1e12?v*1000:v):Date.parse(v||'');

// One line that says what an approval request wants, without dumping its payload.
export function approvalSummary(a={}){
 const what=a.tool||a.tool_name||a.name||a.command||a.action||a.description||a.summary||'';
 return clip(typeof what==='string'?what:JSON.stringify(what),120)||'Run a protected action';
}
// Plain key/value lines for the details toggle (scalar fields only, never a JSON dump).
export function approvalFields(a={}){
 return Object.entries(a).filter(([k,v])=>!['id','request_id'].includes(k)&&v!=null&&typeof v!=='object').slice(0,8).map(([k,v])=>[k.replace(/_/g,' '),clip(v,240)]);
}

export function buildInbox(src,{now=Date.now(),profiles=[],seen=new Set()}={}){
 const name=id=>profiles.find(p=>p.id===id)?.name||id||'Agent',dept=id=>profiles.find(p=>p.id===id)?.department;
 const groups=Object.fromEntries(GROUPS.map(([id])=>[id,[]])),unavailable=[];
 const failed=(key,label,value)=>{if(value&&value.error!==undefined&&!Array.isArray(value)){unavailable.push({source:key,label,reason:value.error||'Unavailable'});return true}return false};
 // Approve + Answer: runs waiting on the owner.
 if(!failed('runs','Agent runs',src.runs))for(const r of Array.isArray(src.runs)?src.runs:[]){
  const approvals=Array.isArray(r.pending_approvals)?r.pending_approvals:r.approval?[r.approval]:[];
  if(r.status==='waiting_for_approval'||approvals.length)for(const a of approvals.length?approvals:[{}]){
   const request=a.id||a.request_id||'';
   groups.approve.push({id:'approval:'+r.id+':'+request,group:'approve',title:name(r.profile)+' asks to '+approvalSummary(a).replace(/^./,c=>c.toLowerCase()),detail:clip(r.title||r.prompt||'Agent run',90),profile:r.profile,department:dept(r.profile),agent:name(r.profile),at:seconds(r.updated_at||r.created_at),run:r.id,request,fields:approvalFields(a),conversation:r.conversation});
  }
  if(r.status==='waiting_for_input'&&r.clarification)groups.answer.push({id:'question:'+r.id+':'+r.clarification.request_id,group:'answer',title:clip(r.clarification.question,160),detail:name(r.profile)+' is waiting for your answer',profile:r.profile,department:dept(r.profile),agent:name(r.profile),at:seconds(r.updated_at||r.created_at),run:r.id,conversation:r.conversation});
 }
 // Review + Fix from boards: routine results waiting, failed routines, blocked or failed agent work.
 if(!failed('boards','Agent boards',src.boards)){
  for(const r of src.boards?.routines||[]){
   for(const res of r.pending_results||[])groups.review.push({id:'routine-result:'+r.profile+':'+r.id+':'+(res.file||res.sha256||''),group:'review',title:'Review the result of '+(r.name||r.id),detail:name(r.profile)+' · routine output waiting for your OK',profile:r.profile,department:dept(r.profile),agent:name(r.profile),at:seconds(res.modified_at),action:{action:'routine-results',id:r.profile+':'+r.id,label:'Review'}});
  }
  for(const b of src.boards?.boards||[])for(const t of b.tasks||[]){
   if(!['blocked','failed'].includes(t.status))continue;
   groups.fix.push({id:'task:'+t.id,group:'fix',title:clip(t.title||'Task',140),detail:name(t.assignee||t.profile)+' · '+(t.status==='failed'?'failed':'blocked')+' · '+(t.board||b.board||'Hermes'),profile:t.assignee||t.profile,department:dept(t.assignee||t.profile),agent:name(t.assignee||t.profile),at:seconds(t.updated_at||t.created_at),action:{action:'task',id:t.id,label:'Open task'},tone:t.status==='failed'?'error':'warn'});
  }
 }
 if(!failed('routines','Routines',src.routines))for(const r of Array.isArray(src.routines)?src.routines:[]){
  if(r.unavailable||!routineHealth(r).needsAttention)continue;
  const h=routineHealth(r),lastFailed=h.result==='failed';
  groups.fix.push({id:'routine:'+r.profile+':'+r.id,group:'fix',title:(lastFailed?'Routine failed: ':'Routine failing often: ')+(r.name||r.id),detail:name(r.profile)+(lastFailed?' · last run failed':'')+(h.recentText?' · '+h.recentText:'')+(lastFailed&&r.latest_execution?.error?' · '+clip(plain(r.latest_execution.error),80):''),profile:r.profile,department:dept(r.profile),agent:name(r.profile),at:seconds(r.last_run_at),action:{action:'section',id:'routines',label:'Open routines'},tone:'error'});
 }
 // Reconnect: accounts whose login expired or lost a scope. Named accounts first; stale duplicates last.
 if(!failed('integrations','Connections',src.integrations)){
  const list=(Array.isArray(src.integrations)?src.integrations:[]).filter(c=>ATTENTION.has(c.state)).sort((a,b)=>Number(a.account==='Default account')-Number(b.account==='Default account')||String(a.name).localeCompare(String(b.name)));
  // Unnamed duplicates of one service collapse into one row (10 Oct 2026); named accounts keep their own row.
  const dupes=new Map();for(const c of list)if(c.account==='Default account'){const k=serviceName(c.name)+'|'+c.state;dupes.set(k,[...(dupes.get(k)||[]),c])}
  const merged=new Set();
  for(const c of list){const k=serviceName(c.name)+'|'+c.state,same=c.account==='Default account'?dupes.get(k):null;
   if(same&&same.length>1){if(merged.has(k))continue;merged.add(k);groups.reconnect.push({id:'connector-group:'+k,group:'reconnect',title:'Reconnect '+serviceName(c.name)+' · '+same.length+' unnamed accounts',detail:(c.state==='expired'?'Login expired':'Missing permission')+' · possibly stale duplicates; check them in Connections',service:c.name,connector:c.id,fields:same.map((x,i)=>['Account '+(i+1),x.id]),actions:[...(c.reconnect_available||c.state==='expired'||c.state==='insufficient-scope'?[{action:'connector-reconnect',id:c.id,label:'Reconnect one',primary:true}]:[]),{action:'section',id:'connections',label:'Open Connections'}]});continue}
   groups.reconnect.push({id:'connector:'+c.id,group:'reconnect',title:'Reconnect '+serviceName(c.name)+(c.account&&c.account!=='Default account'?' · '+c.account:''),detail:(c.state==='expired'?'Login expired':'Missing permission')+(c.account==='Default account'?' · unnamed account (possibly a stale duplicate)':''),service:c.name,connector:c.id,actions:[...(c.reconnect_available||c.state==='expired'||c.state==='insufficient-scope'?[{action:'connector-reconnect',id:c.id,label:'Reconnect',primary:true}]:[]),...(c.check_available?[{action:'connector-check',id:c.id,label:'Verify'}]:[])]})}
 }
 // Fix: readiness blockers reported by the office itself.
 if(!failed('readiness','Office readiness',src.readiness))for(const b of src.readiness?.blockers||[])groups.fix.push({id:'readiness:'+b.id,group:'fix',title:clip(plain(b.reason)||b.id,140),detail:'Office readiness',action:{action:'health',id:'',label:'System health'},tone:'warn'});
 // Phase-two sources (aggregated rows that link to the page where the work happens).
 if(src.content!==undefined&&!failed('content','Team content',src.content)){
  const items=src.content?.items||[],review=items.filter(i=>/review/i.test(i.status||'')).length;
  if(review)groups.review.push({id:'content:review',group:'review',count:review,title:review+' content item'+(review===1?'':'s')+' waiting for review',detail:'Team Hub content',action:{action:'section',id:'reviews',label:'Open review'}});
 }
 if(src.community!==undefined&&!failed('community','Community review',src.community)){
  const queue=(src.community?.items||[]).filter(q=>['unreviewed','review'].includes(q.stage)).length;
  if(queue)groups.review.push({id:'community:review',group:'review',count:queue,title:queue+' community answer'+(queue===1?'':'s')+' to review',detail:'The AI Operator community',action:{action:'section',id:'community',label:'Open community'}});
 }
 if(src.librarian!==undefined&&!failed('librarian','Librarian',src.librarian)){
  const open=src.librarian?.open||{},held=open.held?.measured&&open.held.value>0?open.held.value:0,questions=open.questions?.measured&&open.questions.value>0?open.questions.value:0;
  if(held||questions)groups.review.push({id:'librarian:open',group:'review',count:held+questions,title:[held?held+' held note'+(held===1?'':'s'):'',questions?questions+' open question'+(questions===1?'':'s'):''].filter(Boolean).join(' · ')+' in the Librarian',detail:'Second Brain curation',action:{action:'section',id:'librarian',label:'Open Librarian'}});
 }
 if(src.submissions!==undefined&&!failed('submissions','Knowledge submissions',src.submissions)){
  const pending=(Array.isArray(src.submissions)?src.submissions:src.submissions?.items||[]).filter(s=>s.curation==='pending').length;
  if(pending)groups.review.push({id:'submissions:pending',group:'review',title:pending+' knowledge submission'+(pending===1?'':'s')+' waiting for curation',detail:'Second Brain',action:{action:'section',id:'librarian',label:'Open Librarian'}});
 }
 if(src.priority!==undefined&&!failed('priority','Task priority changes',src.priority))for(const a of src.priority?.actions||[]){
  if(a.state&&!['previewed','pending'].includes(a.state))continue;
  if(a.expiresAt&&seconds(a.expiresAt)<now)continue;
  groups.review.push({id:'priority:'+a.actionId,group:'review',title:'Confirm priority change: '+clip(a.title||a.id,100),detail:'Todoist · waiting for your confirmation',action:{action:'section',id:'todoist',label:'Open tasks'}});
 }
 if(src.tasks!==undefined&&!failed('tasks','Todoist',src.tasks)){
  const today=new Date(now),key=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  const open=(src.tasks?.records||[]).map(r=>r.data||r).filter(t=>!(t.checked||t.is_completed||t.completed_at)&&(t.due?.date||t.due?.datetime));
  const overdue=open.filter(t=>String(t.due.datetime||t.due.date).slice(0,10)<key).length,due=open.filter(t=>String(t.due.datetime||t.due.date).slice(0,10)===key).length;
  if(overdue||due)groups.review.push({id:'todoist:due',group:'review',title:[overdue?overdue+' task'+(overdue===1?'':'s')+' overdue':'',due?due+' due today':''].filter(Boolean).join(' · '),detail:'Todoist deadlines',action:{action:'section',id:'calendar',label:'Open calendar'},tone:overdue?'warn':undefined});
 }
 if(src.activity!==undefined&&!failed('activity','Activity sources',src.activity))for(const s of src.activity?.sources||[]){
  if(s.ok!==false)continue;
  groups.fix.push({id:'source:'+s.key,group:'fix',title:'Source unavailable: '+(s.label||s.key),detail:clip(s.reason||s.note||'The local source did not answer',120),action:{action:'section',id:'connections',label:'Connections'},tone:'warn'});
 }
 // Recent feed from persisted events: newest first, deduplicated, without what was marked as read.
 if(!failed('events','Recent events',src.events)){
  const ids=new Set();
  for(const e of [...(src.events?.events||[])].reverse()){
   if(!FEED_KINDS.has(e.kind)||ids.has(e.id)||seen.has(String(e.id)))continue;ids.add(e.id);
   const d=e.data||{},who=d.profile||d.assignee;
   groups.fyi.push({id:'event:'+e.id,group:'fyi',event:e.id,kind:e.kind,title:FEED_TEXT[e.kind]+(who?' · '+name(who):''),detail:clip(d.title||d.routine||d.task_id||d.run_id||'',90),profile:who,department:dept(who),agent:name(who),at:seconds(e.at),action:d.task_id?{action:'task',id:d.task_id,label:'Open task'}:who?{action:'agent',id:who,label:'Agent'}:null});
   if(groups.fyi.length>=30)break;
  }
 }
 for(const id of ['approve','answer','review','fix'])groups[id].sort((a,b)=>(b.at||0)-(a.at||0));
 // pending: the slower sources (content, community, Librarian…) are still being read; the page must not claim "nothing".
 return {groups:GROUPS.map(([id,label])=>({id,label,items:groups[id]})),unavailable,badge:inboxBadge(groups),pending:Boolean(src.pending)};
}

// The sidebar badge counts what waits on the owner's decision: approvals, questions and reviews.
// Reconnects and fixes are shown on the page but do not inflate the badge.
export function inboxBadge(groups){
 const g=Array.isArray(groups)?Object.fromEntries(groups.map(x=>[x.id,x.items])):groups;
 // Same sum as the Inbox headline: an aggregated row counts as the items it stands for.
 const n=list=>(list||[]).reduce((t,i)=>t+(Number(i.count)||1),0);
 return n(g.approve)+n(g.answer)+n(g.review);
}

// Keyboard: j/k (or arrows) move, Enter acts, Escape cancels a confirm strip. Never wraps.
export function inboxKeys(key,{index=0,count=0,confirming=false}={}){
 if(key==='Escape')return {index,confirming:false,act:null};
 if(key==='j'||key==='ArrowDown')return {index:Math.min(count-1,index+1),confirming,act:null};
 if(key==='k'||key==='ArrowUp')return {index:Math.max(0,index-1),confirming,act:null};
 if(key==='Enter')return {index,confirming,act:'primary'};
 return {index,confirming,act:null};
}
