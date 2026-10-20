import {relativeTime} from './data-table.mjs';
export const DEPT_ORDER = ['growth','content','revenue','operations','finance','build','command','ecom','outreach'];
export const STAGES = [
  ['scheduled','Scheduled'],['paused','Paused'],['backlog','Backlog'],['running','In progress'],
  ['review','Review'],['waiting','Needs response'],['blocked','Blocked'],
  ['failed','Failed'],['done','Done'],['cancelled','Cancelled']
];
export function stage(status) {
  return ({in_progress:'running',todo:'backlog',ready:'backlog',queued:'backlog',waiting_for_approval:'waiting',waiting_for_input:'waiting',
    completed:'done',interrupted:'cancelled',archived:'cancelled'})[status] || status || 'unknown';
}
export function timestamp(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (/^\d+(\.\d+)?$/.test(value)) return timestamp(Number(value));
  return Date.parse(value) || 0;
}
export function workItems(boards, runs, routines, profiles) {
  const people = new Map(profiles.map(p=>[p.id,p]));
  const map = new Map();
  for (const board of boards) for (const task of board.tasks || []) {
    const key = 'task:' + board.board + ':' + task.id;
    map.set(key,{...task,key,kind:'task',board:board.board,stale:!board.connected||!!task.stale});
  }
  for (const run of runs) {
    // A session can hold several runs; retain standalone conversations and merge only
    // an explicit task relation. Never infer ownership from a shared title/profile.
    const task = run.task_id && [...map.values()].find(t=>t.id===run.task_id&&(!run.board||t.board===run.board));
    if (task) {
      if (timestamp(run.updated_at||run.created_at)>=timestamp(task.updated_at||task.created_at))
        map.set(task.key,{...task,run_id:run.id,status:run.status,updated_at:run.updated_at,stale:!!run.stale});
    } else map.set('run:'+run.id,{...run,key:'run:'+run.id,kind:'run',title:run.title||(people.get(run.profile)?.name?people.get(run.profile).name+' conversation':'Conversation')});
  }
  for (const routine of routines) if (!routine.unavailable) map.set('routine:'+routine.profile+':'+routine.id,{
    ...routine,key:'routine:'+routine.profile+':'+routine.id,id:'routine:'+routine.profile+':'+routine.id,
    routine_id:routine.id,kind:'routine',title:routine.name,status:routine.paused||routine.enabled===false||routine.state==='paused'?'paused':'scheduled'
  });
  for(const routine of routines)for(const output of routine.pending_results||[]){
    const key='routine-result:'+routine.profile+':'+routine.id+':'+output.file+':'+output.sha256;
    map.set(key,{key,id:key,kind:'routine-result',routine_id:routine.id,output_file:output.file,profile:routine.profile,office_project:routine.office_project,title:'Review · '+routine.name,status:'waiting',updated_at:output.modified_at});
  }
  return [...map.values()].map(item=>{
    const profile=item.assignee||item.profile;
    return {...item,profile,department:people.get(profile)?.department||'unassigned',stage:stage(item.status),
      project:item.office_project||item.project||null,changed:timestamp(item.updated_at||item.observed_at||item.created_at)};
  }).sort((a,b)=>b.changed-a.changed||a.key.localeCompare(b.key));
}
export function scopeItems(items,{department=null,profile=null,project=null,filter='all',query=''}={}) {
  return items.filter(t=>(!department||t.department===department)&&(!profile||t.profile===profile)&&
    (!project||t.project===project)&&(filter==='all'||t.stage===filter)&&
    (!query||(t.title+' '+t.profile).toLowerCase().includes(query.toLowerCase())));
}
export function counts(items) {
  return items.reduce((a,t)=>{a[t.stage]=(a[t.stage]||0)+1;return a},{all:items.length});
}
export function agentWork(items,id,{stale=false}={}) {
  const candidates=items.filter(t=>t.profile===id&&t.kind!=='routine');
  const active=candidates.filter(t=>['running','waiting','review','blocked','backlog'].includes(t.stage));
  // Active runs beat historical board blockers. Recency determines the active task.
  active.sort((a,b)=>Number(b.kind==='run'&&['running','waiting'].includes(b.stage))-Number(a.kind==='run'&&['running','waiting'].includes(a.stage))||b.changed-a.changed);
  const task=active[0];
  return {status:stale||task?.stale?'stale':task?.stage||'available',task:task||null};
}
export function timeLabel(item,now=Date.now()) {
  if(item.kind==='routine') {
    if(item.stage==='paused')return 'Paused · no automatic run';
    if(item.stage==='scheduled')return countdownLabel(item.next_run_at,now);
  }
  // One time format everywhere (10 Oct 2026): "just now", "5 min ago", "3 h ago", "2 days ago", then a date.
  if(!item.changed)return 'Time unavailable';
  const age=relativeTime(item.changed,now)||'just now';
  return (({backlog:'Queued ',waiting:'Waiting ',running:'Updated ',done:'Finished ',failed:'Failed ',blocked:'Updated '})[item.stage]||'Updated ')+age;
}
export function countdownLabel(next,now=Date.now()) {
  const due=timestamp(next);
  if(!Number.isFinite(due)||!due)return 'Next run unavailable';
  const seconds=Math.ceil((due-now)/1000);
  if(seconds<=0)return 'Due · awaiting Hermes scheduler';
  const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600);
  return `In ${days?days+'d ':''}${hours}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s`;
}
export function schedulePreview(cadence,time='08:00') {
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Choose a valid time');
  const [h,m]=time.split(':').map(Number);
  const days={daily:'*',weekdays:'1-5',monday:'1',tuesday:'2',wednesday:'3',thursday:'4',friday:'5',saturday:'6',sunday:'0'};
  if(cadence==='hourly')return {expression:'0 9-17 * * 1-5',label:'Every hour, 09:00–17:00, weekdays'};
  if(!(cadence in days))throw new Error('Choose a supported cadence');
  return {expression:`${m} ${h} * * ${days[cadence]}`,label:(cadence==='daily'?'Every day':cadence==='weekdays'?'Every weekday':'Every '+cadence)+' at '+time};
}
export function parseSchedule(text) {
  const aliases={werkdag:'weekday',dag:'day',maandag:'monday',dinsdag:'tuesday',woensdag:'wednesday',donderdag:'thursday',vrijdag:'friday',zaterdag:'saturday',zondag:'sunday'};
  const normalized=text.replace(/^(elke|iedere)\s+(werkdag|dag|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+(?:om\s+)?/i,(_,prefix,day)=>'every '+aliases[day.toLowerCase()]+' at ').replace(/^(every .+? at \d{1,2}(?::\d{2})?)\s+uur\s+/i,'$1 ');
  const match=normalized.match(/^every\s+(weekday|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[,;:]?\s+(.+)$/i);
  if(!match)return null;
  let [,day,hour,minute='00',meridiem,task]=match;let h=Number(hour);
  if(meridiem){if(h<1||h>12)return null;h=h%12+(meridiem.toLowerCase()==='pm'?12:0)}
  if(h>23||Number(minute)>59)return null;
  const cadence=day.toLowerCase()==='day'?'daily':day.toLowerCase()==='weekday'?'weekdays':day.toLowerCase();
  return {...schedulePreview(cadence,String(h).padStart(2,'0')+':'+minute),cadence,time:String(h).padStart(2,'0')+':'+minute,task};
}

export function departmentLead(profiles,department){const id={'ecom':'scoopfolk-demo-orchestrator','outreach':'187n-demo-sales',command:'chief',growth:'growth-director',content:'content-director',revenue:'revenue-director',operations:'athena',finance:'finance-director',build:'orchestrator'}[department];return profiles.find(p=>p.id===id&&p.department===department)||profiles.find(p=>p.department===department);}
export function routingSuggestion(text){const rules=[['finance',/\b(invoice|invoic|factuur|facturen|reconcil|payment|betaling|boekhoud|accounting|finance)\w*/i],['build',/\b(bug|deploy|code|website|build|test|software|app)\w*/i],['content',/\b(content|video|course|cursus|lesson|copywriting|edit|script)\w*/i],['revenue',/\b(proposal|offerte|sales|outreach|lead|client|crm)\w*/i],['growth',/\b(research|market|growth|campaign|strategie|strategy)\w*/i],['operations',/\b(calendar|agenda|meeting|planning|operations|legal|compliance)\w*/i]];const match=rules.find(([,pattern])=>pattern.test(text));return match?{department:match[0],basis:'Keywords in this brief'}:null;}
export function schedulerTime(iso,timezone){try{return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(iso))}catch{return String(iso).replace('T',' ')}}
