// Notification centre (8 Oct 2026, the 21st.dev "notification center" pattern). The toasts of this session are kept
// (newest first, at most 40) with an unread count, so a missed toast can be read later. Opening an entry only
// navigates (to the agent); nothing here approves, sends or changes work. 10 Oct 2026: the list is kept in this
// browser across reloads (last 40), office toasts are recorded too, and on a phone it opens as a full-width sheet.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {relativeTime} from './data-table.mjs';
const ago=(at,now=Date.now())=>relativeTime(at,now)||'just now';  // the one shared time format (10 Oct 2026)
const KEY='hq-notifications',load=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(n=>n&&typeof n.title==='string').slice(0,40):[]}catch{return []}},save=items=>{try{localStorage.setItem(KEY,JSON.stringify(items.slice(0,40)))}catch{}};

export function notificationList(items,{now=Date.now()}={}){
 if(!items.length)return '<p class="nc-empty">No notifications yet. Agent results, delegations, failures and office messages appear here as they happen.</p>';
 return '<ol class="nc-list">'+items.map((n,i)=>'<li><button type="button" class="nc-item" data-nc-index="'+i+'"'+(n.read?'':' data-unread')+'><span class="nc-dot" aria-hidden="true"></span><span class="nc-text"><strong>'+esc(n.title)+'</strong>'+(n.detail?'<small>'+esc(n.detail)+'</small>':'')+'</span><time>'+esc(ago(n.at,now))+'</time></button></li>').join('')+'</ol>';
}

export function createNotificationCenter({onOpen,onInbox,onCount}={}){
 const items=load();let opener=null;
 const el=document.createElement('div');el.id='notif-center';el.setAttribute('popover','auto');el.setAttribute('role','dialog');el.setAttribute('aria-label','Notifications');
 document.body.append(el);
 // Keyboard (8 Oct 2026): focus moves into the list when it opens and back to the bell when it closes.
 el.addEventListener('toggle',e=>{if(e.newState==='open'){(el.querySelector('.nc-item')||el.querySelector('button:not([disabled])'))?.focus()}else if(opener?.isConnected&&(el.contains(document.activeElement)||document.activeElement===document.body))opener.focus()});
 const unread=()=>items.filter(n=>!n.read).length;
 const paint=()=>{save(items);el.innerHTML='<header><h2>Notifications</h2><button type="button" data-nc-read'+(unread()?'':' disabled')+'>Mark all read</button></header>'+notificationList(items)+'<footer><button type="button" data-nc-inbox>Open inbox</button></footer>';onCount?.(unread())};
 el.addEventListener('click',e=>{
  const item=e.target.closest('[data-nc-index]');
  if(item){const n=items[Number(item.dataset.ncIndex)];if(n){n.read=true;el.hidePopover?.();onOpen?.(n)}paint();return}
  if(e.target.closest('[data-nc-read]')){items.forEach(n=>{n.read=true});paint();return}
  if(e.target.closest('[data-nc-inbox]')){el.hidePopover?.();onInbox?.()}
 });
 paint();
 return {
  add(n){items.unshift({title:String(n.title||'Update'),detail:String(n.detail||''),profile:n.profile||null,at:n.at||Date.now(),read:false});items.length=Math.min(items.length,40);paint()},
  toggle(anchor){
   if(el.matches(':popover-open')){el.hidePopover();return}
   paint();const r=anchor?.getBoundingClientRect?.();
   const sheet=innerWidth<700;el.classList.toggle('nc-sheet',sheet);
   if(sheet){el.style.left='';el.style.bottom=''}else if(r){el.style.left=Math.round(r.right+8)+'px';el.style.bottom=Math.max(8,Math.round(innerHeight-r.bottom))+'px'}
   opener=anchor||null;try{el.showPopover({source:anchor})}catch{el.showPopover?.()}
  },
  get isOpen(){return el.matches(':popover-open')},
  get unread(){return unread()},
  items,
 };
}
