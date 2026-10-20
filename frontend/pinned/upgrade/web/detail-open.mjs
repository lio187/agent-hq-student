// Detail dialogs for views that are not handed the workspace root (Departments batch 2, 7 Oct 2026).
// A button carries data-hq-detail="<kind>|<id>"; one delegated listener on the document (reading the
// composed path, so clicks inside the workspace's open shadow root are seen) calls the opener that the
// view registered for <kind>. Openers render through the page's own preview(); nothing here fetches,
// except the SOUL opener, which reads one SOUL.md through the existing read-only route.
const openers=new Map();
let bound=false;
const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function registerDetail(kind,open){openers.set(String(kind),open);bind()}
export function detailButton(kind,id,label,{esc=escHTML,cls='',title=''}={}){
 return '<button type="button"'+(cls?' class="'+esc(cls)+'"':'')+(title?' aria-label="'+esc(title)+'"':'')+' data-hq-detail="'+esc(kind+'|'+id)+'">'+esc(label)+'</button>';
}
export function openDetail(raw){
 const s=String(raw??''),at=s.indexOf('|');if(at<1)return false;
 const open=openers.get(s.slice(0,at));if(!open)return false;
 Promise.resolve().then(()=>open(s.slice(at+1))).catch(()=>{});return true;
}
function bind(){
 if(bound||typeof document==='undefined'||!document.addEventListener)return;bound=true;
 document.addEventListener('click',e=>{
  for(const node of e.composedPath?.()||[]){
   const raw=node?.dataset?.hqDetail;
   if(raw!=null){if(openDetail(raw))e.preventDefault();return}
  }
 });
}

// The SOUL dialog shared by Team & People, Tech → Agents and Knowledge → Memory: People's own soulDialog()
// (lazy chunk), fed by GET workspace/agents/soul. The latest click wins; a slow read never replaces a newer one.
let roster=null,soulRequest=0;
export function rememberRoster(value){if(value&&Array.isArray(value.profiles))roster=value}
export function bindSoulDialog({api,preview,esc=escHTML}){
 registerDetail('soul',async id=>{
  const ticket=++soulRequest,profile=roster?.profiles?.find(p=>p.id===id),title=(profile?.name||id)+' · SOUL';
  preview?.(title,'<p role="status">Reading SOUL.md…</p>');
  try{
   const [{soulDialog},soul]=await Promise.all([import('./people-view.mjs'),api('workspace/agents/soul?'+new URLSearchParams({profile:id}))]);
   if(ticket===soulRequest)preview?.(title,soulDialog(profile||{id},soul,{esc}));
  }catch(error){if(ticket===soulRequest)preview?.(title,'<p role="alert">'+esc(error?.message||'This SOUL.md could not be read.')+'</p>')}
 });
}
