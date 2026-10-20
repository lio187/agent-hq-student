// Inbox triage (10 Oct 2026): mark done or snooze review, reconnect, fix and FYI rows, with undo. Owner-local and
// kept in this browser; nothing here approves, sends or changes the source. A row comes back on its own when it
// changes (its title or detail differs) or when its snooze ends. Approvals and questions always need a decision.
export const TRIAGE_GROUPS=new Set(['review','reconnect','fix','fyi']);
export const signature=item=>String(item?.title||'')+'|'+String(item?.detail||'');
export function hidden(item,triage,now=Date.now()){
 const t=triage?.[item?.id];if(!t||!TRIAGE_GROUPS.has(item.group))return false;
 if(t.sig!==signature(item))return false;            // it changed: show it again
 return t.until==='done'||Number(t.until)>now;        // done, or still snoozed
}
// The model with triaged rows removed, plus how many are hidden.
export function applyTriage(model,triage,now=Date.now()){
 let count=0;
 const groups=model.groups.map(g=>{const items=g.items.filter(i=>{const h=hidden(i,triage,now);if(h)count++;return !h});return {...g,items}});
 return {...model,groups,hiddenCount:count};
}
export function mark(triage,items,until){
 const next={...triage};for(const i of items)if(TRIAGE_GROUPS.has(i.group))next[i.id]={sig:signature(i),until};return next;
}
export function unmark(triage,ids){const next={...triage};for(const id of ids)delete next[id];return next}
// Old entries (snoozes long over, done items whose row is gone) are dropped so the record stays small.
export function prune(triage,liveIds,now=Date.now()){
 const next={};for(const [id,t] of Object.entries(triage||{})){if(t.until==='done'?liveIds.has(id):Number(t.until)>now)next[id]=t}return next;
}
const KEY='hq-inbox-triage';
export const loadTriage=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}};
export const saveTriage=t=>{try{localStorage.setItem(KEY,JSON.stringify(t))}catch{}};
