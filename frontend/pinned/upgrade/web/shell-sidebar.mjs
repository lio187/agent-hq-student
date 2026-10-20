// One Linear-style sidebar for the whole office: business switcher, search, primary routes and
// every department module. It keeps the #hq-nav id and data-route/data-section hooks.
import {BUSINESSES,workspacesForBusiness,normalizeSection,workspaceFor,pageOf} from './workspace-navigation.mjs';
import {icon} from './icons.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(key,fallback){try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v)}catch{return fallback}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}};
const PRIMARY=[['office','Office','office','O'],['overview','Overview','overview',''],['brain','Brain','brain','G'],['inbox','Inbox','inbox','']];

export function createSidebar({onRoute,onSection,onBusiness,onPalette,onNotifications}){
 const nav=document.createElement('nav');nav.id='hq-nav';nav.className='hq-sidebar';nav.setAttribute('aria-label','HQ navigation');
 let business=store.get('hq-business','all'),active='office',autoOpen=null;
 // First visit: every department starts collapsed; the current one opens as you navigate.
 const collapsed=new Set(store.get('hq-sidebar-collapsed',workspacesForBusiness('all').map(w=>w.department)));
 const isMac=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);
 function groups(){
  return workspacesForBusiness(business).filter(w=>w.department!=='today').map(w=>'<section class="sb-group" data-department="'+esc(w.department)+'"'+(collapsed.has(w.department)&&w.department!==autoOpen?' data-collapsed':'')+'>'
   +'<button type="button" class="sb-group-toggle" data-toggle="'+esc(w.department)+'" aria-expanded="'+(!collapsed.has(w.department)||w.department===autoOpen)+'">'+icon(w.department)+'<span>'+esc(w.label)+'</span>'+icon('chevron')+'</button>'
   +'<div class="sb-group-items">'+w.pages.map(p=>'<button type="button" class="sb-item" data-section="'+esc(p.views[0][0])+'"'+(p.views.length>1?' data-views="'+esc(p.views.map(([v])=>v).join(' '))+'"':'')+'>'+esc(p.label)+'</button>').join('')+'</div></section>').join('');
 }
 function render(){
  nav.innerHTML='<div class="sb-head"><a class="sb-brand" href="#office" data-route="office" aria-label="187N Agent HQ office"><img src="/static/logo-ui.png" alt="187N infinity" width="46" height="24"><span class="sb-wordmark"><b>187N</b><small>Agent HQ</small></span></a></div>'
   +'<label class="sb-business"><span class="sr-only">Business</span><select data-business aria-label="Business">'+BUSINESSES.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===business?' selected':'')+'>'+esc(b.label)+'</option>').join('')+'</select></label>'
   +'<button type="button" class="sb-search" data-palette>'+icon('search')+'<span>Search or jump to…</span><kbd>'+(isMac?'⌘':'Ctrl ')+'K</kbd></button>'
   +'<div class="sb-primary">'+PRIMARY.map(([id,label,ic])=>'<button type="button" class="sb-item sb-route" data-route="'+id+'"'+(id==='overview'?' id="mission-control-dock"':'')+' aria-label="'+label+'">'+icon(ic)+'<span>'+label+'</span>'+(id==='inbox'?'<b class="sb-count" data-inbox-count hidden>0</b>':'')+'</button>').join('')+'</div>'
   +'<div class="sb-label">Workspace</div><div class="sb-groups">'+groups()+'</div>'
   +'<div class="sb-foot"><button type="button" class="sb-item" data-section="connections" data-health>'+icon('plug')+'<span>Connections</span><i class="sb-health" data-health-dot></i></button><button type="button" class="sb-item" data-section="settings">'+icon('settings')+'<span>Settings</span></button><button type="button" class="sb-item" data-notifications aria-haspopup="dialog" aria-controls="notif-center">'+icon('bell')+'<span>Notifications</span><b class="sb-count" data-notif-count hidden></b></button><button type="button" class="sb-item" data-shortcuts>'+icon('keyboard')+'<span>Shortcuts</span><kbd>?</kbd></button></div>';
  highlight();
 }
 function highlight(){
  const section=active==='board'?'content':active;
  nav.querySelectorAll('[data-route]').forEach(b=>b.setAttribute('aria-current',b.dataset.route===active||(b.dataset.route==='overview'&&section==='overview')?'page':'false'));
  // A page item is current for every view on that page (9 Oct 2026); footer items match their own section.
  const page=pageOf(normalizeSection(section),business);
  nav.querySelectorAll('.sb-item[data-section]').forEach(b=>b.setAttribute('aria-current',(b.closest('.sb-foot')?b.dataset.section===section:page?b.dataset.section===page.views[0][0]:b.dataset.section===section)?'page':'false'));
  const department=['office','brain','inbox'].includes(active)?null:workspaceFor(normalizeSection(section))?.department;
  nav.querySelectorAll('.sb-group').forEach(g=>g.classList.toggle('has-current',g.dataset.department===department));
  if(department!==autoOpen){autoOpen=department;nav.querySelectorAll('.sb-group').forEach(g=>{const open=!collapsed.has(g.dataset.department)||g.dataset.department===autoOpen;g.toggleAttribute('data-collapsed',!open);g.querySelector('[data-toggle]')?.setAttribute('aria-expanded',String(open))})}
  requestAnimationFrame(()=>nav.querySelector('.sb-group-items .sb-item[aria-current=page]')?.scrollIntoView({block:'nearest'}));
 }
 nav.addEventListener('click',e=>{
  const toggle=e.target.closest('[data-toggle]');
  if(toggle){const id=toggle.dataset.toggle,group=toggle.closest('.sb-group');const open=!group.hasAttribute('data-collapsed');if(id===autoOpen)autoOpen=null;if(open)collapsed.add(id);else collapsed.delete(id);group.toggleAttribute('data-collapsed',open);toggle.setAttribute('aria-expanded',String(!open));store.set('hq-sidebar-collapsed',[...collapsed]);return}
  if(e.target.closest('[data-palette]')){onPalette?.();return}
  if(e.target.closest('[data-shortcuts]')){onPalette?.('?');return}
  if(e.target.closest('[data-notifications]')){onNotifications?.(e.target.closest('[data-notifications]'));return}
  // Only match controls inside the sidebar: ancestors outside it (e.g. <body>) never route.
  const route=e.target.closest('[data-route]');if(route&&nav.contains(route)){e.preventDefault();document.body.classList.remove('sidebar-open');onRoute(route.dataset.route);return}
  const section=e.target.closest('.sb-item[data-section]');if(section&&nav.contains(section)){document.body.classList.remove('sidebar-open');onSection(section.dataset.section)}
 });
 nav.addEventListener('change',e=>{if(e.target.matches('[data-business]')){business=e.target.value;store.set('hq-business',business);nav.querySelector('.sb-groups').innerHTML=groups();highlight();onBusiness?.(business)}});
 render();
 return {
  element:nav,
  get business(){return business},
  setActive(next){active=next||'office';highlight()},
  setNotifications(count){const b=nav.querySelector('[data-notif-count]');if(!b)return;b.hidden=!count;b.textContent=count>99?'99+':String(count);b.closest('button').setAttribute('aria-label','Notifications'+(count?', '+count+' unread':''))},
  setInbox(count){const b=nav.querySelector('[data-inbox-count]');if(!b)return;b.hidden=!count;b.textContent=count>99?'99+':String(count)},
  setHealth(state,label){const dot=nav.querySelector('[data-health-dot]');if(!dot)return;dot.dataset.state=state;dot.closest('button').title=label||''}
 };
}
