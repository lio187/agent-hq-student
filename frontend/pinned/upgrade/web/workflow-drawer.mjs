// Workflow drawer (7 October 2026): a non-modal panel beside the office (the 3D floor stays visible).
// Small and static; the canvas itself loads on first open. Esc first clears the open step, then
// closes; focus returns to whatever opened the drawer.
import {loadingView,errorState} from './ui.mjs';
let current=null;
// Views that are built elsewhere (the workspace) reach the one drawer through this bridge.
export const workflowBridge={open:(target,opener)=>current?.open(target,opener)};
// One query string per target, shared with the canvas so a prefetch and the real open hit the same cache key.
export const workflowQuery=o=>Object.entries(o).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
const HEADINGS={agent:'Latest work',run:'Office run',session:'Hermes session',routine:'Routine run',task:'Task steps'};
export function createWorkflowDrawer({api,getState=()=>({}),connectorMark,avatar,onAction}){
 const el=document.querySelector('#workflow-drawer');if(!el)return null;
 el.setAttribute('role','complementary');
 el.innerHTML='<div class="wf-head"><div><span class="eyebrow">Workflow</span><h2 class="wf-title" tabindex="-1">Workflow</h2></div><button type="button" class="wf-close" aria-label="Close workflow (Esc)">×</button></div><div class="wf-body"></div>';
 const body=el.querySelector('.wf-body'),title=el.querySelector('.wf-title');
 let opener=null,controller=null,chunk=null,serial=0,last=null;const route={back:null,restoring:false,pushed:false};
 const w=globalThis.window,hasNav=!!(w&&globalThis.history&&globalThis.location);
 const fromHash=()=>{if(!hasNav||!location.hash.startsWith('#workflow?'))return null;const q=new URLSearchParams(location.hash.slice(10)),t=Object.fromEntries(q);return HEADINGS[t.kind]?t:null};
 if(hasNav)w.addEventListener('popstate',()=>{const t=fromHash();if(t){route.restoring=true;open(t).finally(()=>{route.restoring=false})}else if(!el.hidden)close({fromHistory:true})});
 async function open(target,from=document.activeElement){
  const ticket=++serial,people=getState()?.profiles||[];last=target;
  if(!el.contains(from))opener=from;controller?.dispose();controller=null;
  el.hidden=false;document.body.classList.add('has-workflow');
  const who=target.profile&&people.find(p=>p.id===target.profile)?.name;
  title.textContent=(who?who+' · ':'')+(HEADINGS[target.kind]||'Workflow');
  // Every open workflow has its own link (#workflow?…): Back closes it, a reload or a shared link reopens it.
  if(!route.restoring&&hasNav){const hash='#workflow?'+workflowQuery(target);if(location.hash!==hash){if(!location.hash.startsWith('#workflow?')){route.back=location.hash||'#office';route.pushed=true;history.pushState({workflow:target},'',location.pathname+hash)}else history.replaceState({workflow:target},'',location.pathname+hash)}}
  body.innerHTML=loadingView('Reading workflow…');title.focus({preventScroll:true});
  try{
   const m=await(chunk||=import('./workflow-canvas.mjs'));if(ticket!==serial)return;
   controller=m.mountWorkflow(body,{api,target,connectorMark,avatar,profiles:people,onTitle:t=>{title.textContent=t},onAction});
  }catch(error){chunk=null;if(ticket===serial)body.innerHTML=errorState(error,{retry:'workflow-open'})}
 }
 function close({fromHistory=false}={}){
  if(el.hidden)return;serial++;
  // Closing steps back over the entry the drawer added, so Back never lands on a duplicate page.
  if(hasNav&&!fromHistory&&location.hash.startsWith('#workflow?')){if(route.pushed&&history.state?.workflow){route.pushed=false;history.back()}else history.replaceState(null,'',location.pathname+(route.back||'#office'))}
  if(fromHistory)route.pushed=false;controller?.dispose();controller=null;el.hidden=true;body.innerHTML='';document.body.classList.remove('has-workflow');
  const back=opener;opener=null;if(back?.isConnected)back.focus({preventScroll:true});
 }
 el.querySelector('.wf-close').onclick=()=>close();
 // Office shortcuts (single keys) stay with the office while focus is in the drawer.
 el.addEventListener('keydown',e=>{if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey)e.stopPropagation();if(e.key!=='Escape'||e.defaultPrevented)return;e.preventDefault();e.stopPropagation();if(!controller?.escape())close()});
 // A workflow link opened fresh (or reloaded) opens its drawer once the office is ready.
 if(hasNav)setTimeout(()=>{const t=fromHash();if(t){route.restoring=true;route.back='#office';open(t).finally(()=>{route.restoring=false})}},0);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el.hidden&&!e.defaultPrevented&&e.target===document.body&&!document.querySelector('dialog:modal'))close()});
 body.addEventListener('click',e=>{if(e.target.closest('[data-action="workflow-open"]')&&last)open(last,opener)});
 // A task graph waits on the Hermes CLI (about 1.5 s). Resting on "View steps" starts that read early; the server
 // shares the one read with the click and keeps it warm. GET only, at most once a minute per task (7 Oct 2026).
 const warmed=new Map();
 function prefetch(target){
  if(target?.kind!=='task'||!target.id)return;const key=workflowQuery(target),at=warmed.get(key);
  if(at&&Date.now()-at<60000)return;warmed.set(key,Date.now());
  Promise.resolve().then(()=>api('workflow?'+key)).catch(()=>warmed.delete(key));
 }
 current={open,close,prefetch,event:item=>controller?.event(item),get isOpen(){return !el.hidden}};
 return current;
}
