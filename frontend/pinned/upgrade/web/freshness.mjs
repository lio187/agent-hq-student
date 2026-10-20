// Data freshness (6 October 2026): a source that still says "connected" can be weeks old. Pages backed by
// a synced source show one clear warning once the last successful sync is older than a day, so old numbers
// (for example €0 revenue for a month that was never synced) are never read as current.
import {relativeTime} from './data-table.mjs';

const HOUR=3600000;
const own=sync=>{const at=Date.parse(sync?.lastSuccessAt||sync?.observedAt||sync?.updated_at||'');return Number.isFinite(at)?at:null};
// A sync record is either one source or a map of sources ({hermon:{…},notion:{…}}); a map counts from its newest success.
const parts=sync=>own(sync)==null&&sync&&typeof sync==='object'?Object.entries(sync).filter(([,v])=>v&&typeof v==='object'):[];
export function lastGood(sync){const direct=own(sync);if(direct!=null)return direct;const times=parts(sync).map(([,v])=>own(v)).filter(v=>v!=null);return times.length?Math.max(...times):null}
export function isStale(sync,now=Date.now(),maxHours=24){const at=lastGood(sync);return at==null||now-at>maxHours*HOUR}
const day=at=>new Date(at).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
// Sync messages are written by the source (Hermon writes Dutch). Known ones are shown in English; an unknown
// Dutch message is left out rather than shown raw, and the status notes speak instead (7 Oct 2026).
const SYNC_EN={
 'Alle beschikbare CRM-lijsten ingelezen; opt-in-attributie en betaal-/refunddetails gecontroleerd. Historie is de huidige API-snapshot, geen volledig statuswijzigingslog.':
  'All available CRM lists read; opt-in attribution and payment and refund details checked. History is the current API snapshot, not a full log of status changes.',
};
const SOURCE_NAME={hermon:'Hermon',notion:'Notion',zernio:'Zernio',whop:'Whop',hex:'Hex',calendly:'Calendly'};
// "zernio:liogpt" → "Zernio @liogpt": one connection per account reads as the account, not as a key.
const sourceName=k=>{const [a,b]=String(k).split(':');const n=SOURCE_NAME[a]||a.replace(/^\w/,c=>c.toUpperCase());return b?n+' @'+b:n};
const DUTCH=/\b(?:niet|geen|wordt|worden|zijn|het|een|ingelezen|gecontroleerd|opnieuw|verbinden|beschikbare)\b/i;
export function syncMessage(message){
 const raw=String(message||'').trim(),text=(SYNC_EN[raw]??raw).replace(/Account opnieuw verbinden/gi,'needs reconnect');
 return DUTCH.test(text)?'':text;
}

// One line for the page head when the source is stale; nothing when it is current.
export function freshnessBanner(sync,{esc,now=Date.now(),maxHours=24,what='This data',fix='It updates after the next Team Hub sync.'}={}){
 if(!sync||!isStale(sync,now,maxHours))return '';
 const at=lastGood(sync);
 // relativeTime already returns a date past 30 days; never print that date twice.
 const rel=at==null?'':relativeTime(at,now),dated=at!=null&&!/ago$|just now/.test(rel);
 // A map of sources names them: the old date belongs to the integrations, not to every item on the page (7 Oct 2026).
 const sources=parts(sync),named=sources.length?' sources ('+sources.map(([k])=>sourceName(k)).join(', ')+')':'';
 const when=at==null?(named?'have never synced':'has never synced'):(named?'were':'was')+' last synced '+(dated?'on '+rel:rel+' ('+day(at)+')');
 const notes=sources.filter(([,v])=>v.status&&v.status!=='connected').map(([k,v])=>sourceName(k)+': '+(v.status==='partial'?'partly synced':v.status));
 const detail=syncMessage(sync.message)||notes.join(' · ');
 return '<div class="sync-banner" data-tone="attention" role="status"><span class="today-dot" aria-hidden="true"></span><div><strong>'+esc(what+named+' '+when+'.')+'</strong><small>'+esc((detail?detail+' · ':'')+fix)+'</small></div></div>';
}
