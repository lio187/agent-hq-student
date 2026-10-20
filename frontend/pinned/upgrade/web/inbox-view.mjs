// Inbox view (7 Oct 2026): one grouped list of what needs the owner, Linear/Plain style. Pure string rendering;
// the workspace binds the actions (approve and reject always pass an inline confirm strip first).
import {avatar} from './viz.mjs';
import {relativeTime} from './data-table.mjs';
import {TRIAGE_GROUPS} from './inbox-triage.mjs';

const expanded=new Set();
export const toggleGroup=id=>{expanded.has(id)?expanded.delete(id):expanded.add(id)};
const LIMIT=6;
// Which sources feed each group: a group whose source could not be read says so instead of "nothing" (8 Oct 2026).
const GROUP_SOURCES={approve:['runs'],answer:['runs'],review:['content','community','librarian','submissions'],reconnect:['integrations'],fix:['routines','readiness','boards','tasks','priority'],fyi:['events','activity']};
const EMPTY={approve:'Nothing to approve',answer:'No agent is waiting for an answer',review:'Nothing to review',reconnect:'Every account is connected',fix:'Nothing is blocked or failing',fyi:'No recent activity'};
const GLYPH={review:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',fix:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>',fyi:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/></svg>'};

function button({action,id='',label,primary=false},esc){return '<button type="button"'+(primary?' class="primary"':'')+' data-action="'+esc(action)+'" data-id="'+esc(id)+'">'+esc(label)+'</button>'}

function actionsFor(item,esc){
 if(item.group==='approve')return button({action:'inbox-approve',id:item.run+'|'+item.request+'|once',label:'Approve once',primary:true},esc)+button({action:'inbox-approve',id:item.run+'|'+item.request+'|deny',label:'Reject'},esc)+(item.profile?button({action:'agent',id:item.profile,label:'Conversation'},esc):'');
 if(item.group==='answer')return button({action:'inbox-answer',id:item.run,label:'Answer',primary:true},esc)+(item.profile?button({action:'agent',id:item.profile,label:'Conversation'},esc):'');
 if(item.actions)return item.actions.map(a=>button(a,esc)).join('');
 return item.action?button({...item.action,primary:item.group!=='fyi'},esc):'';
}

function icon(item,{esc,connectorMark}){
 if(item.group==='reconnect'&&connectorMark)return connectorMark(item.service);
 if(item.profile)return avatar({name:item.agent||item.profile,department:item.department,size:'sm'},{esc});
 return '<span class="ir-glyph" data-group="'+esc(item.group)+'" aria-hidden="true">'+(GLYPH[item.group]||GLYPH.fyi)+'</span>';
}

function row(item,i,ctx){
 const {esc,now}=ctx,when=item.at?relativeTime(item.at,now):'';
 const fields=item.fields?.length?'<details class="ir-fields"><summary>Details</summary><dl>'+item.fields.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl></details>':'';
 const pick=TRIAGE_GROUPS.has(item.group)?'<label class="ir-check"><input type="checkbox" data-inbox-check="'+esc(item.id)+'" aria-label="'+esc('Select '+item.title)+'"'+(ctx.selected?.has(item.id)?' checked':'')+'></label>':'<span class="ir-check" aria-hidden="true"></span>';
 return '<article class="inbox-row" data-inbox-id="'+esc(item.id)+'" data-group="'+esc(item.group)+'"'+(item.tone?' data-tone="'+esc(item.tone)+'"':'')+(ctx.selected?.has(item.id)?' data-selected':'')+' tabindex="'+(i===0?'0':'-1')+'">'
  +pick+'<span class="ir-icon">'+icon(item,ctx)+'</span>'
  +'<div class="ir-main"><strong>'+esc(item.title)+'</strong><small>'+esc([item.detail,when].filter(Boolean).join(' · '))+'</small>'+fields+'<div class="ir-slot" aria-live="polite"></div></div>'
  +'<div class="ir-actions">'+actionsFor(item,esc)+'</div></article>';
}

export function inboxHTML(model,{esc,connectorMark,now=Date.now(),profiles=[],selected=new Set(),undo=null}={}){
 const ctx={esc,connectorMark,now,profiles,selected};let index=0;
 // Triage bar (10 Oct 2026): selected rows can be marked done or snoozed; the last change can be undone.
 const bulk=selected.size?'<div class="inbox-bulk" role="toolbar" aria-label="Selected rows"><b>'+selected.size+' selected</b><button type="button" class="primary" data-action="inbox-done">Mark done</button><button type="button" data-action="inbox-snooze">Snooze 1 day</button><button type="button" data-action="inbox-clear">Clear selection</button></div>':'';
 const undoBar=undo?'<div class="inbox-undo" role="status">'+esc(undo.text)+' <button type="button" data-action="inbox-undo">Undo</button></div>':'';
 const hiddenBar=model.hiddenCount?'<button type="button" class="inbox-hidden" data-action="inbox-restore">Show '+model.hiddenCount+' done or snoozed</button>':'';
 // An aggregated row ("53 content items waiting for review") counts as its items, not as one (7 Oct 2026).
 const decide=model.groups.filter(g=>['approve','answer','review'].includes(g.id)).reduce((t,g)=>t+g.items.reduce((n,i)=>n+(Number(i.count)||1),0),0);
 const fix=model.groups.filter(g=>['reconnect','fix'].includes(g.id)).reduce((t,g)=>t+g.items.length,0);
 // Groups with nothing in them share one quiet line at the end instead of taking the first screen (10 Oct 2026).
 const clear=model.groups.filter(g=>!g.items.length&&!(model.unavailable||[]).some(u=>(GROUP_SOURCES[g.id]||[]).includes(u.source)));
 const groups=model.groups.filter(g=>!clear.includes(g)).map(g=>{
  const open=expanded.has(g.id)||g.items.length<=LIMIT,shown=open?g.items:g.items.slice(0,LIMIT);
  const missed=(model.unavailable||[]).filter(u=>(GROUP_SOURCES[g.id]||[]).includes(u.source));
  const none=missed.length?'<p class="inbox-none" role="status">Not read: '+esc(missed.map(u=>u.label).join(', '))+'. This group may be incomplete.</p>':'<p class="inbox-none">'+esc(EMPTY[g.id])+'</p>';
  const body=g.items.length?shown.map(item=>row(item,index++,ctx)).join('')+(g.items.length>LIMIT?'<button type="button" class="inbox-more" data-action="inbox-more" data-id="'+esc(g.id)+'">'+(open?'Show fewer':'Show all '+g.items.length)+'</button>':'')+(missed.length?'<p class="inbox-none">Some sources were not read: '+esc(missed.map(u=>u.label).join(', '))+'.</p>':''):none;
  return '<section class="inbox-group" data-group="'+esc(g.id)+'" aria-labelledby="ig-'+esc(g.id)+'"><h3 id="ig-'+esc(g.id)+'">'+esc(g.label)+' <b'+(g.items.length?'':' data-zero')+'>'+g.items.length+'</b></h3>'+body+'</section>';
 }).join('');
 const missing=model.unavailable.length?'<p class="inbox-missing" role="status">Not read: '+model.unavailable.map(u=>esc(u.label)+' ('+esc(u.reason)+')').join(' · ')+'</p>':'';
 return '<div class="inbox" data-inbox>'
  +'<header class="inbox-head"><div><h2>'+(decide?esc(decide)+' waiting on you':model.pending?'Checking reviews, community and the Librarian…':(model.unavailable||[]).some(u=>['runs','content','community','librarian','submissions'].includes(u.source))?'Some sources could not be read':'Nothing is waiting on your decision')+'</h2><p>'+esc(fix?fix+' to reconnect or fix':'')+'<span class="kbd-hint">'+(fix?' · ':'')+'j / k to move · x to select · e to mark done · Enter to act</span></p></div><div class="actions"><button type="button" data-action="inbox-read">Mark recent as read</button></div></header>'
  +bulk+undoBar+missing+groups+(clear.length?'<p class="inbox-clear"><b>All clear</b> '+clear.map(g=>esc(EMPTY[g.id])).join(' · ')+'</p>':'')+hiddenBar+'</div>';
}

export function confirmStrip(choice,summary,esc){
 return '<div class="ir-confirm" role="alertdialog" aria-label="Confirm">'+'<span>'+esc((choice==='once'?'Approve once: ':'Reject: ')+summary)+'</span><button type="button" class="'+(choice==='once'?'primary':'')+'" data-action="inbox-approve-confirm" data-id="__ID__">Confirm</button><button type="button" data-action="inbox-cancel">Cancel</button></div>';
}
