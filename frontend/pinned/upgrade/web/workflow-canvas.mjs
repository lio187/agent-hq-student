// Workflow canvas (7 October 2026), loaded on demand by workflow-drawer.mjs. Draws one recorded run
// from `GET workflow` as a top-down, n8n-style graph: cards for the trigger, model turns, tools, skills,
// sub-agents, tasks, artifacts and the result, joined by bezier edges. The wheel or trackpad scrolls
// (Shift for sideways), dragging pans, Ctrl/⌘ + wheel or a pinch zooms, + − 0 and Fit too; arrows walk
// the edges (down = next, up = previous, left/right = the same row), Enter opens a step, Esc clears.
// Only allowlisted metadata is shown (file name, host, command or skill name); never arguments.
import {layoutGraph,groupRuns,visibleWindow,neighbour,duration,readingOrder,escapeHTML,NODE_W,NODE_H,COLW,GAP_X} from './workflow-layout.mjs';
import {enter,canAnimate,reduced} from './motion.mjs';
import {loadingView,errorState,stateView} from './ui.mjs';
import {workflowQuery as qs} from './workflow-drawer.mjs';

const KIND={trigger:'Trigger',model:'Model turn',tool:'Tool',skill:'Skill',subagent:'Delegation',agent:'Agent',task:'Task',artifact:'Artifact',approval:'Owner input',result:'Result',group:'Grouped calls'};
const STATUS={ok:'Succeeded',error:'Failed',running:'Running',waiting:'Waiting'};
const META={reason:'Why it failed',file:'File',host:'Host',command:'Command',skill:'Skill',count:'Tasks',agents:'Agents',service:'Service',connector:'Account',tools:'Tool calls'};
const G={trigger:'<path d="M9 2 4 9h4l-1 5 5-7H8l1-5Z"/>',model:'<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2"/>',
 tool:'<path d="M10 2a3 3 0 0 0-3 4L2.5 10.5a1.4 1.4 0 0 0 2 2L9 8a3 3 0 0 0 4-3l-2 1-1.5-1.5L11 3Z"/>',skill:'<path d="M3 3h4a2 2 0 0 1 2 2v8a2 2 0 0 0-2-2H3ZM13 3H9v10a2 2 0 0 1 2-2h2Z"/>',
 subagent:'<path d="M4 3v4a3 3 0 0 0 3 3h5M12 10l-2-2M12 10l-2 2M4 3a1 1 0 1 0 0 .1"/>',task:'<path d="M3 3h10v10H3ZM5.5 8l2 2 3-4"/>',
 artifact:'<path d="M4 2h5l3 3v9H4ZM9 2v3h3"/>',approval:'<path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.5 6.2a1.6 1.6 0 1 1 2 1.6c-.5.2-.5.6-.5 1.2M8 11v.1"/>',
 result:'<path d="M4 14V2M4 3h8l-2 3 2 3H4"/>',group:'<path d="M3 5h10M3 8h10M3 11h10"/>',agent:'<path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 14a5 5 0 0 1 10 0"/>'};
const glyph=k=>'<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(G[k]||G.tool)+'</svg>';
const DEPTS=new Set(['ecom','outreach','growth','content','revenue','operations','build','finance','command']);
const clock=t=>Number.isFinite(t)?new Date(t*1000).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Not recorded';
const compact=n=>Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(n);
// One card's inner markup (pure, so it can be tested without a DOM). Every text value is escaped.
export function cardHTML(n,{esc=escapeHTML,connectorMark=()=>'',avatar=null,people=new Map()}={}){
 const person=n.profile&&people.get(n.profile);let ico;
 if(person&&avatar&&(n.kind==='agent'||n.kind==='task')){const d=DEPTS.has(person.department)?person.department:'none';ico='<span class="wf-ico wf-ico--avatar" style="--wf-dept:var(--dept-'+d+')">'+avatar({name:person.name,department:person.department,live:n.status==='running',size:'sm'},{esc})+'</span>'}
 else{const mark=n.service?connectorMark(n.service):'';ico=mark?'<span class="wf-ico">'+mark+'</span>':'<span class="wf-ico" data-kind="'+esc(n.kind)+'">'+glyph(n.kind)+'</span>'}
 const ms=duration(n.ms);
 return ico+'<span class="wf-txt"><b>'+esc(n.label)+'</b><small>'+esc([KIND[n.kind],n.sub].filter((v,i,a)=>v&&(i===0||String(v).toLowerCase()!==String(a[0]||'').toLowerCase())).join(' · '))+'</small></span><span class="wf-end"><i class="wf-tick" aria-hidden="true"></i><small>'+esc(ms||(n.status==='running'?'…':''))+'</small>'+(n.tokens?'<small>'+esc(compact(n.tokens))+' tok</small>':'')+'</span>';
}
// Live tool names in words: "mcp__composio__GMAIL_SEND_EMAIL" reads "Gmail send email" (10 Oct 2026).
export const toolName=n=>{const t=String(n||'').replace(/^mcp_+[a-z0-9-]+_+/i,'').replace(/[_-]+/g,' ').trim().toLowerCase();return t?t[0].toUpperCase()+t.slice(1):'Tool'};
const TOOL_LABELS={read_file:'Read file',write_file:'Write file',patch:'Patch file',search_files:'Search files',terminal:'Terminal',skill_view:'Skill',delegate_task:'Delegate',web_extract:'Web page',web_search:'Web search'};

export function mountWorkflow(host,{api,target,connectorMark=()=> '',avatar=null,profiles=[],onTitle=()=>{},onAction=async()=>{},esc=escapeHTML}){
 const people=new Map(profiles.map(p=>[p.id,p]));
 host.innerHTML='<div class="wf-bar"><button type="button" class="wf-back" hidden>← Back</button><select class="wf-runs" aria-label="Choose a recorded run" hidden></select><span class="wf-live" hidden>Live</span><label class="wf-find"><span class="sr-only">Find a step</span><input type="search" placeholder="Find a step…" aria-describedby="wf-find-count"><output id="wf-find-count" class="wf-find-count"></output></label><button type="button" class="wf-fail" hidden title="Next failure (E · Shift+E for the previous one)"></button><div class="wf-mode" role="group" aria-label="View"><button type="button" data-mode="graph" aria-pressed="true">Graph</button><button type="button" data-mode="timeline" aria-pressed="false">Timeline</button></div><span class="wf-sum" role="status"></span></div><p class="wf-note" hidden></p>'
  +'<div class="wf-stage"><div class="wf-viewport" role="group" aria-label="Workflow steps. Arrow keys move between steps; Enter opens a step."><div class="wf-world"><svg class="wf-edges" aria-hidden="true"></svg><div class="wf-cards"></div></div><div class="wf-state"></div></div><div class="wf-timeline" hidden role="list" aria-label="Steps on a timeline"></div>'
  +'<div class="wf-ctl" role="toolbar" aria-label="Canvas view"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><output class="wf-pct" aria-label="Zoom level">100%</output><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="reset" aria-label="Actual size (100 %)">1:1</button><button type="button" data-zoom="fit" aria-label="Fit the whole run (F)">Fit</button></div>'
  +'<canvas class="wf-mini" width="176" height="132" hidden aria-label="Overview of the run: click to move there" role="img"></canvas><aside class="wf-detail" hidden aria-label="Step details"></aside></div>';
 const $=s=>host.querySelector(s),viewport=$('.wf-viewport'),world=$('.wf-world'),svg=$('.wf-edges'),cards=$('.wf-cards'),stateEl=$('.wf-state'),detail=$('.wf-detail'),picker=$('.wf-runs'),back=$('.wf-back'),stage=$('.wf-stage');
 let payload=null,layout=null,view={tx:24,ty:24,k:1},active=null,expanded=new Set(),disposed=false,frame=0,serial=0,current=null,stack=[],items=[];
 let liveSeq=0,relayoutTimer=0,refetchTimer=0,pollTimer=0,moved=false,perRow=3,order=new Map(),mode='graph',query='',matches=[];const els=new Map(),paths=new Map();
 const MIN_K=.03,FAR=.45;  // Fit reaches the whole run; below FAR cards read as status blocks (10 Oct 2026)

 const state=html=>{stateEl.innerHTML=html;stateEl.hidden=!html};
 function summary(p){
  const s=p.summary||{},parts=[];
  parts.push(s.tools+' tool'+(s.tools===1?'':'s'));if(s.skills)parts.push(s.skills+' skill'+(s.skills===1?'':'s'));if(s.subagents)parts.push(s.subagents+' sub-agent'+(s.subagents===1?'':'s'));
  if(Number.isFinite(s.durationMs))parts.push(duration(s.durationMs));if(s.tokens)parts.push(compact(s.tokens)+' tokens');if(Number.isFinite(s.cost))parts.push('$'+s.cost.toFixed(2));
  if(s.errors)parts.push(s.errors+' failed');return parts.join(' · ');
 }
 const label=n=>n.label;
 const sig=n=>[n.kind,n.status,n.label,n.sub,n.ms,n.tokens].join('|');
 function card(n){
  const el=document.createElement('button');el.type='button';el.className='wf-node';el.tabIndex=-1;
  fill(el,n);return el;
 }
 function fill(el,n){
  el.dataset.id=n.id;el.dataset.kind=n.kind;el.dataset.status=n.status;if(n.lane)el.dataset.lane=n.lane;else delete el.dataset.lane;
  const ms=duration(n.ms);
  const pos=order.get(n.id);
  el.setAttribute('aria-label',(pos?'Step '+pos+' of '+order.size+'. ':'')+(KIND[n.kind]||'Step')+': '+label(n)+(n.sub?', '+n.sub:'')+', '+(STATUS[n.status]||n.status)+(ms?', '+ms:''));
  el.title=label(n)+(n.sub?' · '+n.sub:'');
  el.toggleAttribute('data-match',!!query&&matches.includes(n.id));
  el.innerHTML=cardHTML(n,{esc,connectorMark,avatar,people});
  el.dataset.sig=sig(n);
 }

 // ---------------------------------------------------------------- view
 // Readable by default: 100 % zoom, the main column centred, the trigger at the top. A live run follows
 // its newest step until the viewer scrolls, drags or zooms (`moved`).
 function rect(){const r=viewport.getBoundingClientRect();return {w:r.width||600,h:r.height||400}}
 const columns=()=>Math.max(1,Math.min(3,Math.floor(((stage.getBoundingClientRect().width||600)-32+GAP_X)/COLW)));
 // The graph never leaves the viewport entirely; the dot grid moves and scales with it.
 function clampView(){if(!layout)return;const r=rect(),w=layout.width*view.k,h=layout.height*view.k,m=80;view.tx=Math.min(r.w-m,Math.max(m-w,view.tx));view.ty=Math.min(r.h-m,Math.max(m-h,view.ty))}
 function apply(){clampView();world.style.transform='translate('+view.tx+'px,'+view.ty+'px) scale('+view.k+')';const g=Math.max(6,20*view.k);viewport.style.backgroundPosition=view.tx+'px '+view.ty+'px, 0 0';viewport.style.backgroundSize=g+'px '+g+'px, auto';$('.wf-pct').textContent=Math.round(view.k*100)+'%';stage.toggleAttribute('data-far',view.k<FAR);schedule()}
 function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;paint()})}
 function zoom(to,cx,cy){const r=rect();cx??=r.w/2;cy??=r.h/2;const k=Math.min(1.6,Math.max(MIN_K,to)),wx=(cx-view.tx)/view.k,wy=(cy-view.ty)/view.k;view={k,tx:cx-wx*k,ty:cy-wy*k};apply()}
 const userZoom=(to,cx,cy)=>{moved=true;zoom(to,cx,cy)};
 // Horizontal placement: the main column centred, unless the whole width fits, then all of it is shown.
 function across(k){const r=rect(),main=r.w/2-layout.mainX*k,w=layout.width*k;return w+48<=r.w?Math.min(Math.max(main,24),r.w-24-w):main}
 function fit(){
  if(!layout)return;const r=rect(),k=Math.min(1,Math.max(MIN_K,Math.min((r.w-48)/layout.width,(r.h-48)/layout.height)));
  view={k,tx:across(k),ty:layout.height*k+48>r.h?24:(r.h-layout.height*k)/2};apply();
 }
 function initial(){if(!layout)return;view={k:1,tx:across(1),ty:24};apply();if(payload?.live)follow(true)}
 function newest(){let best=null;for(const n of layout.nodes)if(!best||(n.startedAt??-1)>=(best.startedAt??-1))best=n;return best}
 function follow(force=false){if(!layout||(moved&&!force))return;const n=newest();if(n&&!visible(n.id)){const r=rect();view.ty=Math.min(24,r.h*.66-(n.y+NODE_H/2)*view.k);apply()}}
 function centre(id,k=view.k){
  const n=layout?.byId.get(id);if(!n)return;const r=rect(),x=n.x*k+view.tx;
  view={k,tx:x>=0&&x+NODE_W*k<=r.w?view.tx:r.w/2-(n.x+NODE_W/2)*k,ty:r.h/2-(n.y+NODE_H/2)*k};apply();
 }
 function visible(id){const n=layout?.byId.get(id);if(!n)return false;const r=rect(),x=n.x*view.k+view.tx,y=n.y*view.k+view.ty;return x>=0&&y>=0&&x+NODE_W*view.k<=r.w&&y+NODE_H*view.k<=r.h}

 // Minimap (10 Oct 2026): every step as a block coloured by status, the visible area outlined; click or drag to move.
 const mini=$('.wf-mini');
 function drawMini(){
  const big=layout&&mode==='graph'&&(layout.height*view.k>rect().h*1.4||layout.width*view.k>rect().w*1.2);mini.hidden=!big;if(!big)return;
  const ctx=mini.getContext&&mini.getContext('2d');if(!ctx)return;const W=mini.width,H=mini.height,pad=6,sc=Math.min((W-pad*2)/layout.width,(H-pad*2)/layout.height),ox=(W-layout.width*sc)/2,oy=(H-layout.height*sc)/2;
  const css=getComputedStyle(stage),c=v=>css.getPropertyValue(v).trim()||'gray';
  ctx.clearRect(0,0,W,H);
  const tone={error:c('--status-error'),running:c('--status-info'),waiting:c('--status-warn')},calm=c('--text-tertiary');
  for(const n of layout.nodes){ctx.fillStyle=tone[n.status]||calm;ctx.globalAlpha=tone[n.status]?1:.55;ctx.fillRect(ox+n.x*sc,oy+n.y*sc,Math.max(2,NODE_W*sc),Math.max(2,NODE_H*sc))}
  ctx.globalAlpha=1;const r=rect();ctx.strokeStyle=c('--text-primary');ctx.lineWidth=1;
  ctx.strokeRect(ox+(-view.tx/view.k)*sc,oy+(-view.ty/view.k)*sc,(r.w/view.k)*sc,(r.h/view.k)*sc);
  mini.dataset.sc=sc;mini.dataset.ox=ox;mini.dataset.oy=oy;
 }
 let miniDrag=false;
 const miniMove=e=>{if(!layout)return;const b=mini.getBoundingClientRect(),sc=+mini.dataset.sc,wx=((e.clientX-b.left)*(mini.width/b.width)-+mini.dataset.ox)/sc,wy=((e.clientY-b.top)*(mini.height/b.height)-+mini.dataset.oy)/sc,r=rect();moved=true;view.tx=r.w/2-wx*view.k;view.ty=r.h/2-wy*view.k;apply()};
 mini.addEventListener('pointerdown',e=>{miniDrag=true;mini.setPointerCapture(e.pointerId);miniMove(e)});
 mini.addEventListener('pointermove',e=>{if(miniDrag)miniMove(e)});
 mini.addEventListener('pointerup',()=>{miniDrag=false;if(active)els.get(active)?.focus({preventScroll:true})});  // keys keep workingmini.addEventListener('pointercancel',()=>{miniDrag=false});
 function paint(){
  if(disposed||!layout)return;drawMini();
  const r=rect(),win=visibleWindow(layout,view.k<FAR?800:60,{x:-view.tx/view.k,y:-view.ty/view.k,w:r.w/view.k,h:r.h/view.k});
  const keep=new Set(win.nodes.map(n=>n.id)),fresh=[];
  for(const [id,el] of els)if(!keep.has(id)){el.remove();els.delete(id)}
  for(const n of win.nodes){let el=els.get(n.id);if(!el){el=card(n);els.set(n.id,el);cards.append(el);fresh.push(el)}else if(el.dataset.sig!==sig(n))fill(el,n);el.style.transform='translate('+n.x+'px,'+n.y+'px)';el.tabIndex=n.id===active?0:-1;el.toggleAttribute('data-active',n.id===active)}
  if(active&&!keep.has(active)&&cards.querySelector('[tabindex="0"]')==null&&win.nodes[0])els.get(win.nodes[0].id).tabIndex=0;
  const dots=canAnimate()&&!reduced(),want=new Set();
  for(const e of win.edges){
   const key=e.from+'>'+e.to;want.add(key);let p=paths.get(key);
   const to=layout.byId.get(e.to),from=layout.byId.get(e.from),hot=to?.status==='running'||from?.status==='running';
   if(!p){p={line:document.createElementNS('http://www.w3.org/2000/svg','path'),dot:null};p.line.setAttribute('class','wf-edge');svg.append(p.line);paths.set(key,p)}
   p.line.setAttribute('d',e.d);p.line.dataset.kind=e.kind;p.line.classList.toggle('is-live',!!hot);p.line.classList.toggle('is-gap',!!e.skipped);
   if(hot&&dots&&payload.live){if(!p.dot){p.dot=document.createElementNS('http://www.w3.org/2000/svg','circle');p.dot.setAttribute('r','3');p.dot.setAttribute('class','wf-dot');svg.append(p.dot)}p.dot.style.offsetPath="path('"+e.d+"')"}
   else if(p.dot){p.dot.remove();p.dot=null}
  }
  for(const [key,p] of paths)if(!want.has(key)){p.line.remove();p.dot?.remove();paths.delete(key)}
  stage.classList.toggle('wf-animate',dots&&!!payload?.live);
  // Screen readers meet the cards top to bottom, left to right, whatever order they were drawn in.
  if(fresh.length){const focused=cards.contains(document.activeElement)?document.activeElement:null;for(const el of [...els.values()].sort((a,b)=>(order.get(a.dataset.id)||0)-(order.get(b.dataset.id)||0)))cards.append(el);focused?.focus({preventScroll:true})}
  return fresh;
 }

 // ---------------------------------------------------------------- data
 const failed=error=>error?.status===404?stateView({kind:'empty',title:'This run is no longer recorded',body:'Hermes no longer has the steps for this run. Choose another run above, or close this panel.'}):errorState(error,{retry:'workflow-reload'});
 function note(text){const el=$('.wf-note');el.textContent=text||'';el.hidden=!text}
 function render(p,{keepView=false,animate=true}={}){
  payload=p;onTitle(p.title||'Workflow');
  $('.wf-live').hidden=!p.live;$('.wf-sum').textContent=p.nodes.length?summary(p):'';
  note(p.partial&&p.source==='hq-events'?'Transcript unavailable; showing office events only (steps paired by order).':p.notice||(p.summary?.truncated?'This run is long; the first and last 200 steps are drawn.':''));
  if(!p.nodes.length){layout=null;clear();state(stateView({kind:'empty',title:'No recorded steps',body:p.notice||'Nothing was recorded for this run yet.'}));return}
  state('');
  perRow=columns();const grouped=groupRuns(p,{expanded});layout=layoutGraph(grouped,{perRow,lanePerRow:Math.min(2,perRow)});order=readingOrder(layout);failures();if(query)find(query,{jump:false});if(mode==='timeline')timeline();
  svg.setAttribute('width',layout.width+40);svg.setAttribute('height',layout.height+40);
  if(!active||!layout.byId.has(active))active=layout.nodes[0].id;
  if(keepView){apply();if(p.live)follow();if(!detail.hidden){const id=detail.dataset.id;if(layout.byId.has(id))openDetail(id,{focus:false});else closeDetail(false)}}else{clear();moved=false;initial();if(document.activeElement?.classList?.contains('wf-title'))requestAnimationFrame(()=>focusCard(active))}
  const at=el=>layout.byId.get(el.dataset.id),fresh=(paint()||[]).sort((a,b)=>at(a).y-at(b).y||at(a).x-at(b).x);if(animate&&!keepView)enter(fresh,{max:8});
  live();
 }
 function clear(){for(const el of els.values())el.remove();els.clear();for(const p of paths.values()){p.line.remove();p.dot?.remove()}paths.clear()}
 async function fetchGraph(t,{quiet=false}={}){
  const ticket=++serial;current=t;
  if(!quiet){closeDetail(false);state(loadingView('Reading workflow…'))}
  try{const p=await api('workflow?'+qs(t));if(ticket!==serial||disposed)return;render(p,{keepView:quiet,animate:!quiet})}
  catch(error){if(ticket!==serial||disposed)return;if(!quiet){layout=null;clear();state(failed(error))}}
 }
 function options(list,selected){
  const runs=list.filter(i=>i.kind==='run'),sessions=list.filter(i=>i.kind==='session');
  const opt=i=>'<option value="'+esc(i.kind+'|'+i.id)+'"'+(i.kind+'|'+i.id===selected?' selected':'')+'>'+esc((i.status==='running'?'● ':'')+i.label+' · '+clock(i.startedAt))+'</option>';
  picker.innerHTML=(runs.length?'<optgroup label="Office runs">'+runs.map(opt).join('')+'</optgroup>':'')+(sessions.length?'<optgroup label="Hermes sessions">'+sessions.map(opt).join('')+'</optgroup>':'');
  picker.hidden=!list.length;
 }
 async function load(t,{push=false}={}){
  if(push&&current)stack.push(current);back.hidden=!stack.length;
  const ticket=++serial;closeDetail(false);state(loadingView('Reading workflow…'));if(t.kind!=='routine')delete picker.dataset.routine;
  try{
   if(t.kind==='agent'||t.kind==='session'||t.kind==='run'||t.kind==='routine'){
    const profile=t.kind==='routine'?String(t.id).split(':')[0]:t.profile;
    const index=profile?await api('workflow?'+qs({kind:'index',profile,routine:t.kind==='routine'?String(t.id).split(':').slice(1).join(':'):''})):{items:[]};
    if(ticket!==serial||disposed)return;items=index.items||[];
    if(t.kind==='agent'){
     if(!items.length){picker.hidden=true;layout=null;clear();state(stateView({kind:'empty',title:'No recorded steps',body:'This agent has no recorded Hermes sessions or office runs yet.'}));$('.wf-sum').textContent='';return}
     const first=items[0];options(items,first.kind+'|'+first.id);return fetchGraph(first.kind==='run'?{kind:'run',id:first.id}:{kind:'session',profile,id:first.id});
    }
    if(t.kind==='routine'){options(items.map(i=>({...i,kind:'session'})),'session|'+(t.run||items[0]?.id));picker.dataset.routine=t.id}
    else{const key=t.kind+'|'+t.id;if(!items.some(i=>i.kind+'|'+i.id===key))items=[{kind:t.kind,id:t.id,label:t.kind==='run'?'Office run':'Session',startedAt:null},...items];options(items,key)}
   }else picker.hidden=true;
   return fetchGraph(t);
  }catch(error){if(ticket!==serial||disposed)return;layout=null;clear();state(failed(error))}
 }
 picker.onchange=()=>{const [kind,...rest]=picker.value.split('|'),id=rest.join('|');
  if(picker.dataset.routine&&current?.kind==='routine'){fetchGraph({kind:'routine',id:picker.dataset.routine,run:id===items[0]?.id?'':id});return}
  const profile=current?.profile||items.find(i=>i.id===id)?.profile;fetchGraph(kind==='run'?{kind:'run',id}:{kind:'session',profile,id})};
 back.onclick=()=>{const prev=stack.pop();back.hidden=!stack.length;if(prev){picker.hidden=prev.kind==='task';fetchGraph(prev)}};

 // ---------------------------------------------------------------- live
 function live(){
  clearTimeout(pollTimer);
  if(payload?.live&&payload.kind!=='run')pollTimer=setTimeout(()=>{if(!document.hidden&&!disposed&&current)fetchGraph(current,{quiet:true});else live()},10000);
 }
 function relevant(item){
  const d=item.data||{};if(!payload)return false;
  if(payload.run?.id&&d.run_id===payload.run.id)return true;
  if(payload.session?.id&&d.conversation&&d.conversation===payload.session.id)return true;
  if(payload.kind==='task'&&String(item.kind||'').startsWith('task.')&&(d.task_id===payload.task?.id||d.parent_task_id===payload.task?.id))return true;
  return false;
 }
 function event(item){
  if(disposed||!relevant(item))return;
  const d=item.data||{},kind=item.kind||'',name=typeof d.tool==='string'?d.tool:d.tool_name;
  const main=payload.nodes.filter(n=>!n.lane);
  if(kind==='tool.started'&&name){
   const anchor=[...main].reverse().find(n=>n.kind==='model')||main[main.length-1];
   const node={id:'live'+(++liveSeq),kind:name==='skill_view'?'skill':name==='delegate_task'?'subagent':'tool',label:TOOL_LABELS[name]||toolName(name),sub:'',status:'running',startedAt:d.timestamp||item.at,endedAt:null,ms:null,meta:{},tool:name,turn:anchor?.turn};
   payload.nodes.push(node);if(anchor)payload.edges.push({from:anchor.id,to:node.id,kind:'flow'});payload.live=true;
  }else if(kind==='tool.completed'&&name){
   const node=payload.nodes.find(n=>n.tool===name&&n.status==='running');
   if(node){node.status='ok';node.endedAt=d.timestamp||item.at;node.ms=Number.isFinite(node.startedAt)?Math.round((node.endedAt-node.startedAt)*1000):null}
  }else if(!kind.startsWith('run.')&&!kind.startsWith('task.'))return;
  clearTimeout(relayoutTimer);relayoutTimer=setTimeout(()=>{if(disposed||!payload)return;const known=new Set(els.keys());render(payload,{keepView:true,animate:false});enter([...els.entries()].filter(([id])=>!known.has(id)).map(([,el])=>el),{max:6})},150);
  clearTimeout(refetchTimer);refetchTimer=setTimeout(()=>{if(!disposed&&current)fetchGraph(current,{quiet:true})},1500);
 }

 // ---------------------------------------------------------------- detail
 function openDetail(id,{focus=true}={}){
  const n=layout?.byId.get(id);if(!n)return;
  if(n.kind==='group'){expanded.add(n.id);active=n.members?.[0]||active;render(payload,{keepView:true,animate:false});focusCard(active);return}
  const meta=Object.entries(n.meta||{}).filter(([k,v])=>META[k]&&v!==''&&v!=null&&!(Array.isArray(v)&&!v.length));
  const links=[];
  if(n.link?.kind==='session'&&n.link.id)links.push('<button type="button" data-link="session" data-profile="'+esc(n.link.profile)+'" data-id="'+esc(n.link.id)+'">'+esc(n.link.label||'Open steps')+'</button>');
  if(n.link?.kind==='task'&&n.link.id)links.push('<button type="button" data-link="task" data-board="'+esc(n.link.board||'')+'" data-id="'+esc(n.link.id)+'">'+esc(n.link.label||'Open task steps')+'</button>');
  if(n.link?.kind==='routine-results')links.push('<button type="button" data-link="routine-results" data-id="'+esc(n.link.id)+'">'+esc(n.link.label||'Open result')+' ↗</button>');
  if(payload.run?.id)links.push('<button type="button" data-link="run" data-id="'+esc(payload.run.id)+'">Open conversation ↗</button>');
  if(payload.kind==='task'&&payload.task?.id&&n.id===layout.nodes.find(m=>m.kind==='task'&&!m.link)?.id)links.push('<button type="button" data-link="task-detail" data-id="'+esc(payload.task.id)+'">Open task ↗</button>');
  if(payload.kind==='routine'&&n.kind==='trigger')links.push('<button type="button" data-link="routine-results" data-id="'+esc(payload.id)+'">Open routine results ↗</button>');
  const row=(k,v)=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>';
  detail.innerHTML='<div class="wf-detail-head"><div><span class="eyebrow">'+esc(KIND[n.kind]||'Step')+'</span><h3>'+esc(label(n))+'</h3></div><button type="button" class="wf-detail-close" aria-label="Close step details">×</button></div><dl>'
   +row('Status',STATUS[n.status]||n.status)+(n.sub?row('Detail',n.sub):'')+row('Started',clock(n.startedAt))+(n.kind==='trigger'?'':row('Duration',duration(n.ms)||(n.status==='running'?'Still running':'Not recorded')))
   +(n.tokens?row('Tokens',compact(n.tokens)):'')+(n.tool?row('Tool',n.tool):'')+meta.map(([k,v])=>row(META[k],Array.isArray(v)?v.join(', '):String(v))).join('')+'</dl>'
   +(links.length?'<div class="wf-links">'+links.join('')+'</div>':'')+'<p class="wf-fine">Tool arguments are never shown; only a file name, host, command or skill name is kept.</p>';
  detail.hidden=false;detail.dataset.id=id;if(focus)detail.querySelector('.wf-detail-close').focus({preventScroll:true});
 }
 function closeDetail(refocus=true){if(detail.hidden)return false;const id=detail.dataset.id;detail.hidden=true;detail.innerHTML='';if(refocus&&id)focusCard(id);return true}
 detail.addEventListener('click',async e=>{
  if(e.target.closest('.wf-detail-close')){closeDetail();return}
  const b=e.target.closest('[data-link]');if(!b)return;const kind=b.dataset.link;
  try{
   if(kind==='session'){picker.hidden=false;await load({kind:'session',profile:b.dataset.profile,id:b.dataset.id},{push:true});return}
   if(kind==='task'){picker.hidden=true;if(current)stack.push(current);back.hidden=false;await fetchGraph({kind:'task',id:b.dataset.id,board:b.dataset.board});return}
   await onAction(kind==='task-detail'?'task':kind,b.dataset.id);
  }catch(error){note(error.message)}
 });

 // ---------------------------------------------------------------- input
 function focusCard(id){
  if(!layout?.byId.has(id))return;active=id;if(!visible(id))centre(id);paint();
  for(const el of els.values())el.tabIndex=el.dataset.id===id?0:-1;
  els.get(id)?.focus({preventScroll:true});
 }
 cards.addEventListener('click',e=>{const el=e.target.closest('.wf-node');if(!el)return;active=el.dataset.id;openDetail(el.dataset.id)});
 // Keys work anywhere in the drawer, including right after it opens with focus on its title (10 Oct 2026).
 const keyHost=host.closest('#workflow-drawer')||host;
 keyHost.addEventListener('keydown',keys);
 function keys(e){
  if(e.target.closest('select,input,textarea'))return;if(e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key.toLowerCase()==='e'&&layout){e.preventDefault();jumpFailure(e.shiftKey?-1:1);return}
  const el=e.target.closest('.wf-node');
  if(el&&/^Arrow(Left|Right|Up|Down)$/.test(e.key)){e.preventDefault();moved=true;focusCard(neighbour(layout,el.dataset.id,e.key));return}
  if(e.key==='+'||e.key==='='){e.preventDefault();userZoom(view.k*1.2)}else if(e.key==='-'){e.preventDefault();userZoom(view.k/1.2)}else if(e.key==='0'){e.preventDefault();userZoom(1)}else if(e.key.toLowerCase()==='f'){e.preventDefault();moved=true;fit()}
 }
 host.querySelector('.wf-ctl').addEventListener('click',e=>{const z=e.target.closest('[data-zoom]')?.dataset.zoom;if(z==='in')userZoom(view.k*1.2);if(z==='out')userZoom(view.k/1.2);if(z==='reset')userZoom(1);if(z==='fit'){moved=true;fit()}});
 host.addEventListener('click',e=>{if(e.target.closest('[data-action="workflow-reload"]')&&current)fetchGraph(current)});
 // Drag pans; two pointers pinch-zoom around their midpoint.
 let drag=null,pinch=null;const touches=new Map();
 const spread=()=>{const [a,b]=[...touches.values()];return {d:Math.hypot(a.x-b.x,a.y-b.y)||1,x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
 viewport.addEventListener('pointerdown',e=>{
  if(e.target.closest('.wf-state button'))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touches.size===2){const s=spread(),r=viewport.getBoundingClientRect();pinch={d:s.d,k:view.k,x:s.x-r.left,y:s.y-r.top};drag=null;return}
  if(e.button!==0||e.target.closest('.wf-node'))return;drag={x:e.clientX,y:e.clientY,tx:view.tx,ty:view.ty};viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-dragging');
 });
 viewport.addEventListener('pointermove',e=>{
  if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&touches.size===2){userZoom(pinch.k*spread().d/pinch.d,pinch.x,pinch.y);return}
  if(!drag)return;moved=true;view.tx=drag.tx+e.clientX-drag.x;view.ty=drag.ty+e.clientY-drag.y;apply();
 });
 const stop=e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;drag=null;viewport.classList.remove('is-dragging')};
 viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);
 // Wheel and trackpad scroll the run (Shift scrolls sideways); Ctrl/⌘ + wheel and trackpad pinch zoom.
 viewport.addEventListener('wheel',e=>{
  if(!layout)return;e.preventDefault();const unit=e.deltaMode===1?16:e.deltaMode===2?rect().h:1,dx=e.deltaX*unit,dy=e.deltaY*unit;
  if(e.ctrlKey||e.metaKey){const r=viewport.getBoundingClientRect();userZoom(view.k*Math.exp(-dy*.002),e.clientX-r.left,e.clientY-r.top);return}
  moved=true;if(e.shiftKey&&!dx)view.tx-=dy;else{view.tx-=dx;view.ty-=dy}apply();
 },{passive:false});
 // A narrower drawer gets fewer side-by-side calls per row; re-lay out only when that number changes.
 const resize=new ResizeObserver(()=>{if(payload?.nodes?.length&&columns()!==perRow){render(payload,{keepView:true,animate:false});if(!moved)initial()}else schedule()});resize.observe(viewport);
 const onVisibility=()=>{stage.classList.toggle('wf-animate',!document.hidden&&canAnimate()&&!!payload?.live);if(!document.hidden)live()};document.addEventListener('visibilitychange',onVisibility);

 // ---------------------------------------------------------------- failures, find, timeline (10 Oct 2026)
 function failures(){const list=[...order.keys()].filter(id=>layout.byId.get(id)?.status==='error');const b=$('.wf-fail');b.hidden=!list.length;b.textContent='Next failure · '+list.length;b.dataset.count=list.length;return list}
 function jumpFailure(dir){
  const list=failures().sort((a,b)=>order.get(a)-order.get(b));if(!list.length)return;
  const at=order.get(active)||0,next=dir>0?list.find(id=>order.get(id)>at)||list[0]:[...list].reverse().find(id=>order.get(id)<at)||list[list.length-1];
  setMode('graph');moved=true;focusCard(next);openDetail(next,{focus:false});
 }
 $('.wf-fail').onclick=()=>jumpFailure(1);
 function find(text,{jump=true}={}){
  query=String(text||'').trim().toLowerCase();const out=$('.wf-find-count');
  if(!query||!payload){matches=[];out.textContent='';schedule();for(const el of els.values())el.removeAttribute('data-match');return}
  const hit=n=>[n.label,n.sub,n.tool,KIND[n.kind]].some(v=>String(v||'').toLowerCase().includes(query));
  const groupOf=id=>layout.nodes.find(g=>g.kind==='group'&&g.members?.includes(id));
  const hidden=payload.nodes.filter(n=>hit(n)&&!layout.byId.has(n.id)).map(n=>groupOf(n.id)?.id).filter(Boolean);
  if(hidden.length&&jump){for(const g of hidden)expanded.add(g);render(payload,{keepView:true,animate:false})}
  matches=[...order.keys()].filter(id=>hit(layout.byId.get(id)));out.textContent=matches.length?matches.length+' found':'None';
  for(const el of els.values())el.toggleAttribute('data-match',matches.includes(el.dataset.id));
  if(jump&&matches.length){const at=order.get(active)||0,next=matches.find(id=>order.get(id)>at)||matches[0];setMode('graph');moved=true;focusCard(next)}
 }
 const findInput=$('.wf-find input');
 findInput.addEventListener('input',()=>find(findInput.value,{jump:false}));
 findInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find(findInput.value)}else if(e.key==='Escape'&&findInput.value){e.preventDefault();e.stopPropagation();findInput.value='';find('')}});
 // Timeline: every timed step as a bar on one time axis, like a trace waterfall; a row opens its step.
 function timeline(){
  const list=$('.wf-timeline');if(!payload){list.innerHTML='';return}
  const timed=payload.nodes.filter(n=>Number.isFinite(n.startedAt)).sort((a,b)=>a.startedAt-b.startedAt).slice(0,500);
  if(!timed.length){list.innerHTML='<p class="dt-empty">No step in this run has a recorded start time.</p>';return}
  const t0=timed[0].startedAt,t1=Math.max(...timed.map(n=>Number.isFinite(n.endedAt)?n.endedAt:n.startedAt+(n.ms||0)/1000)),span=Math.max(.001,t1-t0);
  list.innerHTML='<div class="wf-tl-axis"><span>0 s</span><span>'+esc(duration(span*1000))+'</span></div>'+timed.map(n=>{const left=(n.startedAt-t0)/span*100,width=Math.max(.4,((n.ms||0)/1000)/span*100);
   return '<button type="button" role="listitem" class="wf-tl-row" data-id="'+esc(n.id)+'" data-status="'+esc(n.status)+'" title="'+esc(label(n)+(n.sub?' · '+n.sub:''))+'"><span class="wf-tl-name"><small>'+esc(KIND[n.kind]||'Step')+'</small>'+esc(label(n))+'</span><span class="wf-tl-track"><i style="left:'+left.toFixed(2)+'%;width:'+Math.min(100-left,width).toFixed(2)+'%"></i></span><span class="wf-tl-ms">'+esc(duration(n.ms)||(n.status==='running'?'…':''))+'</span></button>'}).join('');
 }
 $('.wf-timeline').addEventListener('click',e=>{const row=e.target.closest('.wf-tl-row');if(!row)return;const id=row.dataset.id;
  if(!layout.byId.has(id)){const g=layout.nodes.find(x=>x.kind==='group'&&x.members?.includes(id));if(g){expanded.add(g.id);render(payload,{keepView:true,animate:false})}}
  setMode('graph');moved=true;focusCard(id);openDetail(id,{focus:false})});
 function setMode(next){if(mode===next)return;mode=next;host.querySelectorAll('.wf-mode [data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));$('.wf-timeline').hidden=mode!=='timeline';viewport.hidden=mode==='timeline';$('.wf-ctl').hidden=mode==='timeline';if(mode==='timeline')mini.hidden=true;if(mode==='timeline')timeline();else schedule()}
 host.querySelector('.wf-mode').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b)setMode(b.dataset.mode)});

 load(target);
 return {
  event,
  escape(){if(closeDetail())return true;return false},
  reload(){if(current)fetchGraph(current)},
  dispose(){keyHost.removeEventListener('keydown',keys);disposed=true;cancelAnimationFrame(frame);clearTimeout(relayoutTimer);clearTimeout(refetchTimer);clearTimeout(pollTimer);resize.disconnect();document.removeEventListener('visibilitychange',onVisibility);host.innerHTML=''}
 };
}
