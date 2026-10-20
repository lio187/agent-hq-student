// 187N Voice call state (7 October 2026). Pure helpers for the call screen: which phase the call is in,
// and what the agent did during a voice turn, read from the HQ event stream. Tool events carry only the
// tool name (HQ never forwards arguments), reasoning summaries are cut to 140 characters, and handoffs
// are matched to the voice run (run_id) or to its conversation (mission_id). The list keeps 30 rows.
export const ACTIVITY_CAP=30;
export const ACTIVITY_KINDS=new Set(['tool.started','tool.completed','run.runtime','reasoning.available','task.delegated','task.started','task.completed','task.blocked','task.failed']);
const TASK_STATUS={'task.delegated':'waiting','task.started':'running','task.completed':'ok','task.blocked':'blocked','task.failed':'error'};

const text=(value,limit=160)=>typeof value==='string'?value.trim().slice(0,limit):'';
export function clip(value,limit=140){
 const s=String(value??'').replace(/\s+/g,' ').trim();
 return s.length>limit?s.slice(0,limit-1).trimEnd()+'…':s;
}
const when=(item,now)=>{const at=Number(item?.at);return Number.isFinite(at)&&at>0?(at<1e12?at*1000:at):now};
const toolName=d=>text(typeof d.tool==='string'?d.tool:d.tool_name,80);
const failed=d=>d.error===true||d.success===false||/^(error|failed|failure)$/i.test(String(d.status||''));

// Entries in, entries out (the same array when the item does not belong to this voice run).
export function voiceActivity(entries,item,{runId,conversation,from='chief',now=Date.now()}={}){
 const list=Array.isArray(entries)?entries:[];
 const kind=item?.kind;if(!ACTIVITY_KINDS.has(kind))return list;
 const d=item.data&&typeof item.data==='object'?item.data:{};
 const ownRun=Boolean(runId)&&d.run_id===runId,ownMission=Boolean(conversation)&&d.mission_id===conversation;
 if(kind.startsWith('task.')?!(ownMission||ownRun):!ownRun)return list;
 const at=when(item,now);let next;
 if(kind==='tool.started'){
  const tool=toolName(d);if(!tool)return list;
  next=[...list,{id:'tool:'+(item.id??at)+':'+tool,kind:'tool',tool,profile:text(d.profile,80),status:'running',at}];
 }else if(kind==='tool.completed'){
  const tool=toolName(d);if(!tool)return list;
  // Calls of one tool finish in order (first started, first completed); HQ sends no call id.
  const i=list.findIndex(e=>e.kind==='tool'&&e.tool===tool&&e.status==='running'),status=failed(d)?'error':'ok';
  if(i<0)next=[...list,{id:'tool:'+(item.id??at)+':'+tool,kind:'tool',tool,profile:text(d.profile,80),status,at,ms:null}];
  else{next=list.slice();next[i]={...list[i],status,ms:Math.max(0,Math.round(at-list[i].at))}}
 }else if(kind==='run.runtime'){
  const r=d.runtime&&typeof d.runtime==='object'?d.runtime:d,model=text(r.model,160),provider=text(r.provider,80);
  if(!model)return list;
  let last=null;for(let i=list.length-1;i>=0&&!last;i--)if(list[i].kind==='runtime')last=list[i];
  if(last&&last.model===model&&last.provider===provider)return list;
  next=[...list,{id:'runtime:'+at+':'+model,kind:'runtime',model,provider,at}];
 }else if(kind==='reasoning.available'){
  const summary=clip(d.text);if(!summary)return list;
  next=[...list,{id:'reasoning:'+(item.id??at),kind:'reasoning',label:'Runtime reasoning summary',text:summary,at}];
 }else{
  const task=text(d.task_id,80);if(!task)return list;
  const row={id:'task:'+task,kind:'task',task,from:text(from,80)||'chief',to:text(d.profile,80),board:text(d.board,80),status:TASK_STATUS[kind],at};
  // One row per task: later transitions update it in place and keep its first time.
  const i=list.findIndex(e=>e.kind==='task'&&e.task===task);
  if(i<0)next=[...list,row];else{next=list.slice();next[i]={...list[i],...row,at:list[i].at,updatedAt:at}}
 }
 return next.length>ACTIVITY_CAP?next.slice(-ACTIVITY_CAP):next;
}

// The phase drives the orb, the label and the controls. Speaking wins over working (the Chief can say
// "On it." while a run is open); a muted microphone only shows when nothing else is happening.
export const PHASES=['idle','connecting','listening','thinking','speaking','muted','paused'];
export function voicePhase(s={}){
 if(!s||typeof s!=='object')return 'idle';
 if(s.starting)return 'connecting';
 if(!s.active)return 'idle';
 if(s.speaking)return 'speaking';
 if(s.runOpen)return 'thinking';
 if(s.muted)return 'muted';
 if(s.listening)return 'listening';
 return 'paused';
}
export const PHASE_LABEL={idle:'Not connected',connecting:'Connecting…',listening:'Listening',thinking:'Working',speaking:'Speaking',muted:'Microphone muted',paused:'Listening stopped'};
