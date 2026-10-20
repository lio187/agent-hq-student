const failed=new Set(['error','failed','timeout','timed_out']);
const succeeded=new Set(['ok','success','succeeded','completed']);
const active=new Set(['running','started','claimed']);
const time=value=>{const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:-Infinity};
export function routineHealth(row){
 const paused=row.paused===true||row.enabled===false||row.state==='paused',execution=row.latest_execution||{};
 const lastTime=time(row.last_run_at),finished=time(execution.finished_at),started=time(execution.started_at||execution.claimed_at);
 const running=!execution.finished_at&&active.has(execution.status)&&started>=lastTime&&started!==-Infinity;
 const useLedger=finished!==-Infinity&&finished>=lastTime;
 const raw=running?execution.status:useLedger?execution.status:row.last_status;
 const result=running?'running':failed.has(raw)?'failed':succeeded.has(raw)?'succeeded':['cancelled','canceled'].includes(raw)?'cancelled':'unknown';
 // Recent history (10 Oct 2026): a routine failing often needs attention even when its latest run succeeded.
 const recent=row.recent&&Number.isFinite(row.recent.runs)?row.recent:null,flaky=!paused&&!!recent&&recent.failed>=3&&recent.failed/Math.max(1,recent.runs)>=.2;
 const recentText=recent&&recent.failed?recent.failed+' of '+recent.runs+' runs failed in '+recent.hours+' h':'';
 return {paused,result,flaky,recentText,needsAttention:!paused&&(result==='failed'||flaky),at:running?(execution.started_at||execution.claimed_at):useLedger?execution.finished_at:row.last_run_at||null,label:({running:'Recorded running',failed:'Last run failed',succeeded:'Last run completed',cancelled:'Last run cancelled',unknown:'No verified run result'})[result]};
}
export function routineStatusText(row,format=value=>value){
 const health=routineHealth(row);
 return (health.paused?'Paused · ':'')+health.label+(health.at?' · '+format(health.at):'')+(health.recentText?' · '+health.recentText:'')+(!health.paused?' · Next: '+(row.next_run_at?format(row.next_run_at):'not reported'):'');
}
export function routineOverview(rows){
 const available=Array.isArray(rows)?rows.filter(row=>!row.unavailable):[];
 const rank=row=>{const health=routineHealth(row);return health.paused?4:health.needsAttention?0:health.result==='running'?1:health.result==='unknown'?2:3};
 return {rows:available.slice().sort((a,b)=>rank(a)-rank(b)||(time(a.next_run_at)===-Infinity?Infinity:time(a.next_run_at))-(time(b.next_run_at)===-Infinity?Infinity:time(b.next_run_at))),activeFailures:available.filter(row=>routineHealth(row).needsAttention).length,pausedFailures:available.filter(row=>{const h=routineHealth(row);return h.paused&&h.result==='failed'}).length,unavailableProfiles:Array.isArray(rows)?rows.filter(row=>row.unavailable).length:0};
}
// Plain-English schedule for the common cron shapes; anything else shows the original expression.
export function scheduleText(schedule){
 const expr=String(schedule?.expr||schedule?.value||schedule?.display||schedule||'').trim();
 if(schedule?.kind&&schedule.kind!=='cron'&&schedule.display)return String(schedule.display);
 const parts=expr.split(/\s+/);if(parts.length!==5)return expr||'Not scheduled';
 const [min,hour,dom,mon,dow]=parts,pad=v=>String(v).padStart(2,'0'),days=['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'];
 const every=min.match(/^\*\/(\d+)$/);if(every&&hour==='*'&&dom==='*'&&mon==='*'&&dow==='*')return 'Every '+every[1]+' minutes';
 const hourly=hour.match(/^\*\/(\d+)$/);if(/^\d+$/.test(min)&&hourly&&dom==='*'&&mon==='*'&&dow==='*')return 'Every '+hourly[1]+' hours at :'+pad(min);
 if(/^\d+$/.test(min)&&hour==='*'&&dom==='*'&&mon==='*'&&dow==='*')return 'Hourly at :'+pad(min);
 if(!/^\d+$/.test(min)||!/^[\d,]+$/.test(hour)||mon!=='*')return expr;
 const at=hour.split(',').map(h=>pad(h)+':'+pad(min)).join(', ');
 if(dom==='*'&&dow==='*')return 'Daily at '+at;
 if(dom==='*'&&dow==='1-5')return 'Weekdays at '+at;
 if(dom==='*'&&/^[0-6](,[0-6])*$/.test(dow))return dow.split(',').map(d=>days[+d]).join(', ')+' at '+at;
 if(/^\d+$/.test(dom)&&dow==='*')return 'Monthly on day '+dom+' at '+at;
 return expr;
}
