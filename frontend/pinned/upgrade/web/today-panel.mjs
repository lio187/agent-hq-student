// Overview "Today" panel (5 October 2026): what needs the owner now, in one glance. Read-only:
// every card reads an existing source and links to the page where the work happens.
import {todoistTasks} from './todoist-tasks.mjs';
import {routineHealth} from './routine-health.mjs';
import {serviceName} from './labels.mjs';

const settle=p=>p.then(v=>v,e=>({error:e?.message||'Unavailable'}));
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');

export async function todayPanel({api,esc,number}){
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+1),today=localDay(now);
 const [runs,calendar,tasks,work,routines,integrations,content]=await Promise.all([
  settle(api('runs')),
  settle(api('workspace/calendar?'+new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString()}))),
  settle(api('workspace/source/tasks/records')),
  settle(api('workspace/work?business=all')),
  settle(api('routines')),
  settle(api('integrations')),
  settle(api('workspace/team/content')),
 ]);
 const time=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})};
 const item=(title,meta='')=>'<li><span>'+esc(title)+'</span>'+(meta?'<small>'+esc(meta)+'</small>':'')+'</li>';
 const card=({title,count,unit='',tone='calm',items=[],empty,action,label,unavailable})=>'<article class="today-card" data-tone="'+(unavailable?'muted':tone)+'"><header><span class="today-dot" aria-hidden="true"></span><h3>'+esc(title)+'</h3>'+(count==null?'':'<b class="today-count">'+esc(number(count))+(unit?'<small> '+esc(unit)+'</small>':'')+'</b>')+'</header>'
  +(unavailable?'<p class="today-empty">'+esc(unavailable)+'</p>':items.length?'<ul>'+items.slice(0,3).join('')+'</ul>':'<p class="today-empty">'+esc(empty)+'</p>')
  +'<footer><button type="button" data-action="'+(action==='inbox'?'inbox':'section')+'" data-id="'+(action==='inbox'?'':esc(action))+'">'+esc(label)+' →</button></footer></article>';
 const cards=[];

 // 1. Approvals and questions waiting on the owner.
 if(runs.error)cards.push(card({title:'Needs you',action:'inbox',label:'Open inbox',unavailable:'Run status unavailable.'}));
 else{const waiting=(runs||[]).filter(r=>r.status==='waiting_for_approval'||r.pending_approvals?.length||(r.status==='waiting_for_input'&&r.clarification));
  cards.push(card({title:'Needs you',count:waiting.length,unit:'waiting',tone:waiting.length?'attention':'calm',items:waiting.map(r=>item(r.clarification?.question||r.title||r.prompt||'Agent run',r.status==='waiting_for_input'?'Question':'Approval')),empty:'No approvals or questions waiting.',action:'inbox',label:'Open inbox'}))}

 // 2. Today's agenda: timed events first, then all-day ones.
 if(calendar.error)cards.push(card({title:'Today',action:'calendar',label:'Calendar',unavailable:'Calendar unavailable.'}));
 else{const events=(calendar.events||[]).filter(e=>!/routine/i.test(e.source||'')).filter(e=>!e.allDay?String(e.start).slice(0,10)<=today:true).sort((a,b)=>Number(Boolean(a.allDay))-Number(Boolean(b.allDay))||String(a.start).localeCompare(String(b.start)));
  const upcoming=events.filter(e=>e.allDay||new Date(e.end||e.start)>=now);
  cards.push(card({title:'Today',count:upcoming.length,unit:'ahead',items:upcoming.map(e=>item(e.title||'Event',e.allDay?'All day':time(e.start)+(e.source?' · '+e.source:''))),empty:'No more meetings or events today.',action:'calendar',label:'Calendar'}))}

 // 3. Tasks that are overdue or due today.
 if(tasks.error)cards.push(card({title:'Overdue & due today',action:'calendar',label:'Calendar',unavailable:'Tasks unavailable: the task console is not answering.'}));
 else{const open=todoistTasks(tasks).filter(t=>!t.completed&&t.due),overdue=open.filter(t=>t.due.slice(0,10)<today),due=open.filter(t=>t.due.slice(0,10)===today),list=[...overdue,...due];
  cards.push(card({title:'Overdue & due today',count:list.length,tone:overdue.length?'attention':'calm',items:list.map(t=>item(t.title||t.content||'Task',t.due.slice(0,10)<today?'Overdue · '+t.due.slice(0,10):'Due today')),empty:'Nothing overdue or due today.',action:'calendar',label:'Calendar'}))}

 // 4. Agent work: blocked first, then running.
 if(work.error)cards.push(card({title:'Agent work',action:'tasks',label:'Agent work',unavailable:'Agent work unavailable.'}));
 else{const all=work.tasks||[],blocked=all.filter(t=>t.status==='blocked'),running=all.filter(t=>['running','in_progress','claimed'].includes(t.status));
  cards.push(card({title:'Agent work',count:blocked.length,unit:'blocked',tone:blocked.length?'attention':'calm',items:[...blocked.map(t=>item(t.title,'Blocked · '+(t.assignee||t.profile||'unassigned'))),...running.map(t=>item(t.title,'Running · '+(t.assignee||t.profile||'')))],empty:running.length?running.length+' running, nothing blocked.':'No blocked or running work.',action:'tasks',label:'Agent work'}))}

 // 5. Routines that failed, then what runs next.
 if(routines.error)cards.push(card({title:'Routines',action:'routines',label:'Routines',unavailable:'Routines unavailable.'}));
 else{const rows=(routines||[]).filter(r=>!r.unavailable),failing=rows.filter(r=>routineHealth(r).needsAttention),next=rows.filter(r=>!routineHealth(r).paused&&r.next_run_at).sort((a,b)=>String(a.next_run_at).localeCompare(String(b.next_run_at)));
  cards.push(card({title:'HQ routines',count:failing.length,unit:'failing',tone:failing.length?'attention':'calm',items:[...failing.map(r=>item(r.name||r.id,'Last run failed')),...next.map(r=>item(r.name||r.id,'Next · '+time(r.next_run_at)))],empty:'No scheduled routines.',action:'routines',label:'Routines'}))}

 // 6. Connections that need a reconnect or check.
 if(integrations.error)cards.push(card({title:'Connections',action:'connections',label:'Connections',unavailable:'Connections unavailable.'}));
 else{const attention=(integrations||[]).filter(c=>['expired','insufficient-scope','unknown'].includes(c.state));
  cards.push(card({title:'Connections',count:attention.length,unit:'to reconnect',tone:attention.length?'attention':'calm',items:attention.map(c=>item(serviceName(c.name),(c.state==='expired'?'Expired':c.state==='unknown'?'Status unknown':'Missing scope')+(c.account?' · '+c.account:''))),empty:(n=>n?'Nothing expired · '+n+' accounts not yet verified.':'All accounts verified.')((integrations||[]).filter(c=>c.adapter==='composio'&&!c.verified&&c.state==='configured').length),action:'connections',label:'Repair connections'}))}

 // 7. Content pipeline: what is ready for the owner.
 if(content.error)cards.push(card({title:'Content',action:'production',label:'Production',unavailable:'Content workspace unavailable.'}));
 else{const items=content.items||[],review=items.filter(i=>/review/i.test(i.status||'')),record=items.filter(i=>/script/i.test(i.status||''));
  cards.push(card({title:'Content',count:review.length,unit:'to review',tone:review.length?'attention':'calm',items:[...review.map(i=>item(i.title,'To review · @'+(i.accountId||'unassigned'))),...record.map(i=>item(i.title,'Ready to record'))],empty:'Nothing waiting for review or recording.',action:'production',label:'Production'}))}

 const date=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
 return '<div class="today-head"><div><p class="eyebrow">TODAY · '+esc(date.toUpperCase())+'</p><h2>What needs you</h2></div></div><div class="today-grid">'+cards.join('')+'</div>';
}
