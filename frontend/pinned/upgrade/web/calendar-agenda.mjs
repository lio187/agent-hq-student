// Calendar agenda helpers (7 Oct 2026). Google first: events sort by their real instant (never by string, so
// offsets like +04:00 and Z compare correctly), date-only items count as all-day, and every day is grouped in
// the viewer's local time. Pure functions; the view in workspace-operations.mjs renders the result.
const DAY=86400000;
const pad=n=>String(n).padStart(2,'0');
export const dayKey=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
export const parseDay=key=>{const [y,m,d]=String(key).split('-').map(Number);return new Date(y,m-1,d)};
export const isAllDay=e=>Boolean(e?.allDay)||/^\d{4}-\d{2}-\d{2}$/.test(String(e?.start||''));
export function instant(e){
 const v=String(e?.start||'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(v))return parseDay(v).getTime();
 const t=Date.parse(v);return Number.isFinite(t)?t:Infinity;
}
export function endInstant(e){
 const v=String(e?.end||'');if(!v)return instant(e);
 if(/^\d{4}-\d{2}-\d{2}$/.test(v))return parseDay(v).getTime();
 const t=Date.parse(v);return Number.isFinite(t)?t:instant(e);
}
// Within a day: timed events by start time first, then all-day items, then deadlines.
const rank=e=>e.layer==='deadlines'||e.source==='Todoist'||String(e.source||'').startsWith('Content')?2:isAllDay(e)?1:0;
export const sortByInstant=list=>list.slice().sort((a,b)=>rank(a)-rank(b)||instant(a)-instant(b)||String(a.title).localeCompare(String(b.title)));
export const isLayer=e=>e.source==='Todoist'?'deadlines':String(e.source||'').startsWith('Content')?'content':null;
export const layersFilter=(list,layers={deadlines:true,content:true})=>list.filter(e=>{const l=isLayer(e);return !l||layers[l]!==false});

// Days from an anchor (default today), each with its events split into timed / all-day / layer items.
export function agendaDays(events,{anchor=Date.now(),days=8,occursOn}={}){
 const start=parseDay(dayKey(anchor)).getTime(),today=dayKey(Date.now()),tomorrow=dayKey(Date.now()+DAY);
 return Array.from({length:days},(_,i)=>{
  const key=dayKey(start+i*DAY+3600000),list=sortByInstant(events.filter(e=>occursOn?occursOn(e,key):dayKey(instant(e))===key));
  const date=parseDay(key);
  return {key,label:key===today?'Today':key===tomorrow?'Tomorrow':date.toLocaleDateString('en-GB',{weekday:'long'}),date:date.toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
   timed:list.filter(e=>rank(e)===0),allDay:list.filter(e=>rank(e)===1),layer:list.filter(e=>rank(e)===2),isToday:key===today};
 });
}
// Monday-based week containing the anchor.
export function weekStart(anchor=Date.now()){const d=parseDay(dayKey(anchor));d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()}
export function weekDays(events,{anchor=Date.now(),occursOn}={}){return agendaDays(events,{anchor:weekStart(anchor),days:7,occursOn})}
// Index of the first timed event that has not ended yet (where the now-line goes); -1 when all are past.
export function nowIndex(timed,now=Date.now()){const i=timed.findIndex(e=>endInstant(e)>now);return i<0?timed.length:i}
// Greedy lanes so overlapping timed events sit side by side in the week grid.
export function lanes(timed){
 const ends=[];return timed.map(e=>{const s=instant(e);let lane=ends.findIndex(end=>end<=s);if(lane<0){lane=ends.length;ends.push(0)}ends[lane]=Math.max(endInstant(e),s+15*60000);return {event:e,lane,of:0}})
  .map((x,_,all)=>({...x,of:Math.max(1,...all.filter(y=>instant(y.event)<endInstant(x.event)&&endInstant(y.event)>instant(x.event)).map(y=>y.lane+1))}));
}
// One legend row per Google account (from the sources, so an account with no events still shows).
export function accountLegend(sources=[]){
 return sources.filter(s=>s.source==='Google Calendar').map(s=>({label:s.account||'Google Calendar',slot:s.slot||4,state:s.state,count:s.count??null,reason:s.reason||'',via:s.via||'',at:s.observedAt||s.syncedAt||null}));
}
// The range the page asks for: this month's grid, the anchor week and the next eight days (≤ 93 days).
export function calendarRange(month,anchor=Date.now()){
 const [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1),gridStart=new Date(y,m-1,1-(first.getDay()+6)%7).getTime(),gridEnd=gridStart+42*DAY;
 const start=Math.min(gridStart,weekStart(anchor),parseDay(dayKey(anchor)).getTime()),end=Math.max(gridEnd,weekStart(anchor)+7*DAY,parseDay(dayKey(anchor)).getTime()+9*DAY);
 return new URLSearchParams({timeMin:new Date(start).toISOString(),timeMax:new Date(Math.min(end,start+93*DAY)).toISOString()}).toString();
}
export const clock=ms=>new Date(ms).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
