// The Brain (v3, 7 October 2026): loaded on demand from app.js. Opens on the Second Brain (a slim ~25 KB gzip
// graph from GET brain/graph), coloured by graphify communities when they exist (dated, marked stale when the
// wiki moved on), rendered on the GPU (brain-scene.mjs, lazy) with a 2D canvas as the "Simple view" and the
// no-WebGL fallback. The list, search and reader are the text equivalent of the graph and work in both.
// Layout runs in /static/brain-layout-worker.js; positions are kept per scope so a second open is instant.
import {markdown,escapeHTML as esc} from './message-view.mjs';
import {buildBrainModel,colourKey,searchNodes,neighbourhood,graphifyNote,resolveLink,nodeId,relatedNotes,folderOf,kindOf,tagsOf,layoutGroups,communityLabel,rowOf,GROUP_SLOTS} from './brain-model.mjs';
import {canAnimate,reduced} from './motion.mjs';
import {loadingView,stateView} from './ui.mjs';

const KEYS={scope:'hq-brain-scope',renderer:'hq-brain-renderer',colour:'hq-brain-colour'};
const store={get(k,d){try{return localStorage.getItem(k)??d}catch{return d}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
const count=v=>Number(v||0).toLocaleString('en-GB');
const SCOPE_TITLE={second:'SECOND BRAIN',workspace:'ENTIRE WORKSPACE'};
const PAGE=60;
// Per page lifetime: one request per scope, one model per payload, one finished layout per scope + colouring.
const slims=new Map(),models=new WeakMap(),layouts=new Map();
let communitiesRequest=null,dispose=()=>{};

export function loadSlim(api,scope,{refresh=false}={}){
 if(refresh||!slims.has(scope)){
  const request=api('brain/graph?scope='+scope+(refresh?'&refresh=1':'')).catch(e=>{if(slims.get(scope)===request)slims.delete(scope);throw e});
  slims.set(scope,request);if(refresh){layouts.clear();for(const other of [...slims.keys()])if(other!==scope)slims.delete(other)}
 }
 return slims.get(scope);
}
export function loadCommunities(api,{refresh=false}={}){
 if(refresh||!communitiesRequest)communitiesRequest=api('brain/communities').catch(e=>({available:false,reason:(e?.message||'The communities could not be read.'),failed:true}));
 return communitiesRequest;
}
function modelFor(slim,communities){
 let entry=models.get(slim);
 if(!entry||entry.communities!==communities){entry={communities,model:buildBrainModel(slim,communities)};models.set(slim,entry)}
 return entry.model;
}

// Colours come from the design tokens at mount: four categorical series, their lighter tints, neutrals.
function parseColour(value){
 const s=String(value||'').trim();let m=s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
 if(m){const h=m[1].length===3?[...m[1]].map(c=>c+c).join(''):m[1];return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)}
 m=s.match(/^rgba?\(([^)]+)\)/i);if(m){const p=m[1].split(/[\s,/]+/).filter(Boolean).map(Number);return [p[0]/255,p[1]/255,p[2]/255]}
 return null;
}
export function readPalette(root=globalThis.document?.documentElement){
 const css=root?getComputedStyle(root):null,get=(name,fallback)=>parseColour(css?.getPropertyValue(name))||fallback;
 const mist=get('--color-mist',[.82,.84,.88]),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 const cats=[1,2,3,4].map(i=>get('--cat-'+i,[.6,.6,.6]));
 return {slots:[...cats,...cats.map(c=>mix(c,mist,.45))],other:get('--color-fog',[.54,.56,.6]),none:get('--color-ash',[.38,.4,.43]),
  accent:get('--accent',[.89,.95,.13]),line:get('--color-ash',[.38,.4,.43]),text:get('--text-body',mist),muted:get('--text-tertiary',[.5,.51,.55])};
}
const css=c=>'rgb('+c.map(v=>Math.round(v*255)).join(' ')+')';
function slotColour(palette,slot){return slot<GROUP_SLOTS?palette.slots[slot]:slot===GROUP_SLOTS?palette.other:palette.none}

function workerURL(){
 const bundle=globalThis.document?.querySelector('script[src*="bundle.js"]')?.getAttribute('src')||'';
 const v=(bundle.match(/[?&]v=([\w-]+)/)||[])[1];return '/static/brain-layout-worker.js'+(v?'?v='+v:'');
}

export async function openBrain({api,read,refresh=false,onRefreshed=()=>{}}={}){
 dispose();
 performance.mark('hq:brain-open');
 const dialog=document.querySelector('#brain-view'),root=document.querySelector('#brain-workspace');
 let scope=store.get(KEYS.scope,'second');if(!SCOPE_TITLE[scope])scope='second';
 let rendererPref=store.get(KEYS.renderer,'3d')==='2d'?'2d':'3d',colourPref=store.get(KEYS.colour,'community')==='folder'?'folder':'community';
 let forceCommunity=false,model=null,communities=null,colours=null,palette=null,renderer=null,worker=null,layoutJob=0,positions=null,version=0,closed=false,webglFailed=false;
 let userMoved=false,selected=-1,hover=-1,query='',folder='',kind='',local=false,legendFocus=null,page=0,matches=[],readVersion=0,searchTimer=0,readyMarked=false;
 root.innerHTML=shellHTML();
 const $=s=>root.querySelector(s),stage=$('#brain-stage'),reader=$('#graph-reader'),labelLayer=$('.brain-label-layer');
 dialog.dataset.brainScope=scope;

 function stageState(html){const el=$('#brain-stage-state');el.hidden=!html;el.innerHTML=html||''}
 function setScopeButtons(){
  $('#vault-second').setAttribute('aria-pressed',String(scope==='second'));$('#vault-all').setAttribute('aria-pressed',String(scope==='workspace'));
  $('#vault-second').classList.toggle('active',scope==='second');$('#vault-all').classList.toggle('active',scope==='workspace');
  $('#brain-scope-eyebrow').textContent=SCOPE_TITLE[scope];dialog.dataset.brainScope=scope;
 }
 async function show(next,{refresh=false,confirmed=false}={}){
  // The entire workspace is only fetched after the owner confirms; asking does not change the scope.
  if(next==='workspace'&&!confirmed&&!slims.has('workspace')){await askWorkspace(++version);return}
  const v=++version;scope=next;setScopeButtons();
  store.set(KEYS.scope,scope);
  stageState(loadingView(refresh?'Re-indexing the vault. A full index takes about 15 seconds…':scope==='second'?'Reading the Second Brain…':'Reading the entire workspace…'));
  try{
   const [slim,c]=await Promise.all([loadSlim(api,scope,{refresh}),loadCommunities(api,{refresh})]);
   if(v!==version||closed)return;
   if(refresh)onRefreshed();
   communities=c;model=modelFor(slim,c);stageState('');selected=-1;hover=-1;local=false;legendFocus=null;page=0;
   await mount(v);
  }catch(error){
   if(v!==version||closed)return;
   stageState(stateView({kind:error?.status>=500||error?.status===0?'offline':'error',title:'The Brain could not be read',body:error?.message||'The request failed.',actions:[{label:'Try again',action:'brain-retry'}]}));
   $('#brain-stage-state [data-action="brain-retry"]').onclick=()=>show(scope,{refresh:false,confirmed:true});
  }
 }
 async function askWorkspace(v){
  stageState(loadingView('Counting the entire workspace…'));
  try{
   const c=await api('brain/graph?scope=workspace&count=1');if(v!==version||closed)return;
   const share=c.counts.nodes?Math.round(100*c.counts.isolated/c.counts.nodes):0,size=c.bytes_gzip/1048576;
   stageState('<div class="brain-confirm" role="group" aria-labelledby="brain-confirm-title"><span class="eyebrow">ENTIRE WORKSPACE</span><h3 id="brain-confirm-title">Load '+count(c.counts.nodes)+' notes?</h3><p>'+count(c.counts.nodes)+' notes and '+count(c.counts.edges)+' links, '+(c.estimate?'about ':'')+(size<1?Math.max(1,Math.round(size*1024))+' KB':size.toFixed(1)+' MB')+' compressed. '+share+'% of them link to nothing: they form the outer shell, and the view groups folders instead of running an exact force layout.</p><div class="brain-confirm-actions"><button type="button" class="primary" id="brain-load-workspace">Load entire workspace</button><button type="button" id="brain-stay-second">Stay on the Second Brain</button></div></div>');
   $('#brain-load-workspace').onclick=()=>show('workspace',{confirmed:true});
   $('#brain-stay-second').onclick=()=>{if(model&&scope==='second'){stageState('');$('#vault-all').focus()}else show('second')};$('#brain-load-workspace').focus();
  }catch(error){
   if(v!==version||closed)return;
   stageState(stateView({kind:'error',title:'The workspace size could not be read',body:error?.message||'',actions:[{label:'Back to the Second Brain',action:'brain-second'}]}));
   $('#brain-stage-state [data-action="brain-second"]').onclick=()=>{if(model&&scope==='second')stageState('');else show('second')};
  }
 }

 // Renderer: the GPU scene unless the owner chose the simple view or WebGL is missing.
 async function ensureRenderer(){
  const want=rendererPref==='2d'||webglFailed?'2d':'3d';
  if(renderer?.kind===want)return renderer;
  renderer?.dispose();renderer=null;
  const old=$('#brain-graph'),canvas=document.createElement('canvas');canvas.id='brain-graph';canvas.tabIndex=0;canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','Graph of '+(scope==='second'?'the Second Brain':'the entire workspace')+'. Drag to turn, scroll to zoom, click a note to read it. Every note is also in the list.');
  old.replaceWith(canvas);canvas.onkeydown=keyboard;
  if(want==='3d'){
   try{
    const {createBrainScene}=await import('./brain-scene.mjs');if(closed)return null;
    renderer=Object.assign(createBrainScene(canvas,{labelLayer,palette,isOpen:()=>dialog.open&&!closed,canAnimate,reduced}),{kind:'3d'});
   }catch(error){
    webglFailed=true;console.warn('Brain: 3D unavailable, using the simple view',error?.message||error);
    const fresh=canvas.cloneNode();canvas.replaceWith(fresh);fresh.onkeydown=keyboard;renderer=create2D(fresh,{palette,labelLayer});
   }
  }else renderer=create2D(canvas,{palette,labelLayer});
  renderer.onPick(i=>{if(i>=0)select(i)});renderer.onCamera(()=>{userMoved=true});
  renderer.onHover((i,p)=>{if(i===hover)return;hover=i;const tip=$('#vault-tooltip');tip.hidden=i<0;if(i>=0&&p){tip.textContent=model.titles[i];tip.style.left=Math.min(stage.clientWidth-200,Math.max(8,p.x+14))+'px';tip.style.top=Math.max(6,p.y-30)+'px'}paintFocus()});
  $('#brain-renderer').setAttribute('aria-pressed',String(renderer.kind==='2d'));$('#brain-renderer').textContent=renderer.kind==='2d'?(webglFailed?'3D unavailable':'3D view'):'Simple view';$('#brain-renderer').disabled=webglFailed;
  $('#brain-hint').textContent=renderer.kind==='3d'?'Drag to turn · Shift-drag to pan · Scroll to zoom · Click a note':'Drag to pan · Scroll to zoom · Click a note';
  return renderer;
 }

 async function mount(v){
  palette=palette||readPalette();
  // Communities only cover the graphify pages; below 5% coverage (the whole workspace) folders say more,
  // unless the owner picked Community in this session.
  colours=colourKey(model,colourPref==='community'&&(forceCommunity||model.mapped>=model.n*.05)?'community':'folder');
  await ensureRenderer();if(v!==version||closed||!renderer)return;
  renderer.setGraph({n:model.n,src:model.src,dst:model.dst,colours:colourArray(),sizes:sizeArray()});
  fillFilters();renderLegend();insets();renderTotals();apply({fit:false});layout(v);
  renderer.setAmbient?.(true);
 }
 function colourArray(){
  const out=new Float32Array(3*model.n);
  for(let i=0;i<model.n;i++){const c=slotColour(palette,colours.key[i]),k=model.degree[i]?1:.62;out[3*i]=c[0]*k;out[3*i+1]=c[1]*k;out[3*i+2]=c[2]*k}
  return out;
 }
 function sizeArray(){
  const big=model.n>20000,out=new Float32Array(model.n);
  for(let i=0;i<model.n;i++)out[i]=model.degree[i]?Math.min(big?8:13,(big?2.4:3.4)+1.7*Math.log2(1+model.degree[i])):(big?1.6:2.4);
  return out;
 }
 function layoutKey(){return scope+':'+colours.mode+':'+renderer.kind+':'+(model.vault?.indexed_at||0)}
 function layout(v){
  const key=layoutKey(),cached=layouts.get(key);
  if(cached){positions=cached;renderer.setPositions(cached);renderer.fit();markReady();renderLayoutNote('force',true);return}
  const id=++layoutJob,dims=renderer.kind==='2d'?2:3,groups=layoutGroups(model,colours);userMoved=false;
  try{worker=worker||new Worker(workerURL())}catch{worker=null}
  if(!worker){positions=fallbackLayout(model.n,dims);renderer.setPositions(positions);renderer.fit();markReady();renderLayoutNote('fallback',true);return}
  let first=true;
  worker.onmessage=e=>{
   const d=e.data;if(d?.id!==layoutJob||v!==version||closed)return;
   // Render the first (packed) layout at once; with reduced motion skip the intermediate frames.
   if(first||d.done||!reduced()){positions=d.positions;renderer.setPositions(positions)}
   if(first){renderer.fit();markReady();first=false}
   renderLayoutNote(d.mode,d.done);
   if(d.done){layouts.set(key,d.positions);paintLabels();if(!userMoved&&selected<0)renderer.fit({animate:true})}
  };
  worker.onerror=()=>{if(id!==layoutJob)return;worker=null;positions=fallbackLayout(model.n,dims);renderer.setPositions(positions);renderer.fit();markReady();renderLayoutNote('fallback',true)};
  worker.postMessage({type:'layout',id,n:model.n,src:model.src,dst:model.dst,groups,degree:model.degree,seed:1,dims});
 }
 function markReady(){
  paintLabels();
  requestAnimationFrame(()=>{if(closed)return;performance.mark('hq:brain-ready');if(!readyMarked){readyMarked=true;try{performance.measure('hq:brain-open-to-ready','hq:brain-open','hq:brain-ready')}catch{}}});
 }
 function renderLayoutNote(mode,done){
  const unlinked=model.counts.isolated,el=$('#brain-layout-note');
  el.textContent=mode==='pack'?'Cluster layout: '+count(unlinked)+' unlinked notes form the outer shell. Positions group folders and communities; they are not a force layout.'
   :mode==='fallback'?'Simple layout (the layout worker is unavailable).'
   :(done?'Force layout':'Settling the layout…')+(unlinked?' · '+count(unlinked)+' unlinked notes on the outer shell':'');
 }

 function fillFilters(){
  const folders=[...new Set(model.folders)].sort((a,b)=>a.localeCompare(b));
  $('#graph-folder').innerHTML='<option value="">All folders</option>'+folders.map(f=>'<option value="'+esc(f)+'">'+esc(f||'(top level)')+'</option>').join('');
  $('#graph-kind').innerHTML='<option value="">All types</option>'+model.kinds.map(k=>'<option value="'+esc(k)+'">'+esc(k)+'</option>').join('');
  folder='';kind='';$('#brain-colour').value=colours.mode;$('#brain-colour').querySelector('[value=community]').disabled=!model.mapped;
 }
 function renderTotals(){
  const v=model.vault||{};
  $('#brain-vault-name').textContent=scope==='second'?(model.prefix.replace(/\/$/,'')||'Second Brain'):(v.name||'Vault');
  $('#brain-totals').innerHTML='<b>'+count(model.counts.nodes)+'</b> notes <span>·</span> <b>'+count(model.counts.edges)+'</b> links <span>·</span> <b>'+count(model.counts.isolated)+'</b> unlinked'+(v.indexed_at?' <span>·</span> indexed '+esc(new Date(v.indexed_at*1000).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):'');
  if(!reader.classList.contains('has-note'))reader.innerHTML=introHTML();
 }
 function renderLegend(){
  const note=graphifyNote(communities),title=colours.mode==='community'?'Graphify communities':'Folders';
  const rows=colours.legend.map(l=>'<button type="button" class="brain-legend-row" data-slot="'+l.slot+'" aria-pressed="'+(legendFocus===l.slot)+'"><i style="background:'+css(slotColour(palette,l.slot))+'"></i><span>'+esc(l.label)+'</span><small>'+count(l.count)+'</small></button>').join('');
  $('#vault-legend').innerHTML='<details class="brain-legend-box" '+(globalThis.innerWidth>700?'open':'')+'><summary><span class="eyebrow">'+esc(title)+'</span></summary><div class="brain-legend-rows">'+rows+'</div>'+(model.mapped||!note.available?'<p class="brain-graphify-note" data-stale="'+note.stale+'">'+esc(note.text)+'</p>':'')+'</details>';
  $('#vault-legend').querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{const slot=Number(b.dataset.slot);legendFocus=legendFocus===slot?null:slot;renderLegend();apply()});
 }
 function insets(){
  const box=$('#vault-legend .brain-legend-box');
  renderer?.setInsets?.({right:box&&globalThis.innerWidth>1100&&stage.clientWidth>700?box.getBoundingClientRect().width+16:0});
 }
 function filterFn(){
  const neighbours=local&&selected>=0?neighbourhood(model,selected):null;
  return i=>(!folder||folderOf(model,i)===folder)&&(!kind||kindOf(model,i)===kind)&&(legendFocus===null||colours.key[i]===legendFocus)&&(!neighbours||neighbours.has(i));
 }
 function apply({fit=false}={}){
  if(!model)return;
  const filter=filterFn(),filtered=query||folder||kind||local||legendFocus!==null;
  matches=searchNodes(model,query,{filter:filtered?filter:null});
  page=0;list();paintStates();paintLabels();
  $('#vault-results-count').textContent=count(matches.length)+(filtered?' matching':'')+' files';
  $('#vault-view-title').textContent=local?'LOCAL GRAPH':SCOPE_TITLE[scope];
  $('#vault-view-count').textContent=(filtered?count(matches.length)+' of ':'')+count(model.n)+' files · '+count(model.counts.edges)+' links';
  if(fit&&renderer&&positions)renderer.fit({animate:true,indices:filtered&&matches.length?matches.slice(0,5000):null});
 }
 // Node states for the renderer: 0 normal, 1 dimmed, 2 highlighted, 3 selected.
 function paintStates(){
  if(!renderer||!model)return;
  const states=new Float32Array(model.n),filtered=query||folder||kind||local||legendFocus!==null;
  if(filtered){states.fill(1);for(const i of matches)states[i]=query?2:0}
  if(selected>=0){for(const j of rowOf(model.adj,selected))if(!filtered||states[j]!==1)states[j]=Math.max(states[j],2);states[selected]=3}
  renderer.setStates(states,{dimLinks:Boolean(filtered)});paintFocus();
 }
 function paintFocus(){
  if(!renderer)return;const f=hover>=0?hover:selected;
  renderer.setFocusPairs(f<0?[]:[...rowOf(model.adj,f)].map(j=>[f,j]));paintLabels();
 }
 function paintLabels(){
  if(!renderer||!model)return;
  const labels=[],seen=new Set(),add=(i,kind,rank=0)=>{if(i<0||seen.has(i))return;seen.add(i);labels.push({i,text:model.titles[i].slice(0,48),kind,rank})};
  add(hover,'focus');add(selected,'focus');
  if(query)matches.slice(0,8).forEach(i=>add(i,'search'));
  // Cluster names at their centroid while zoomed out and nothing is picked (cached per layout frame).
  if(!query&&selected<0)labels.push(...groupLabels());
  model.hubs.forEach((i,rank)=>add(i,'hub',rank));
  renderer.setLabels(labels);
 }
 let centroids={positions:null,colours:null,labels:[]};
 function groupLabels(){
  if(!positions||!colours)return [];
  if(centroids.positions===positions&&centroids.colours===colours)return centroids.labels;
  const sum=new Float64Array(4*(GROUP_SLOTS+2));
  for(let i=0;i<model.n;i++){if(!model.degree[i])continue;const k=4*colours.key[i];sum[k]+=positions[3*i];sum[k+1]+=positions[3*i+1];sum[k+2]+=positions[3*i+2];sum[k+3]++}
  const out=colours.legend.filter(l=>l.slot<GROUP_SLOTS&&sum[4*l.slot+3]).map(l=>{const k=4*l.slot,c=sum[k+3];return {i:-1,point:[sum[k]/c,sum[k+1]/c,sum[k+2]/c],text:l.label.slice(0,32),kind:'group'}});
  centroids={positions,colours,labels:out};return out;
 }
 function list(){
  const pages=Math.max(1,Math.ceil(matches.length/PAGE));page=Math.max(0,Math.min(page,pages-1));
  const rows=matches.slice(page*PAGE,(page+1)*PAGE);
  $('#graph-source-list').innerHTML=rows.map(i=>'<button type="button" class="vault-note '+(i===selected?'selected':'')+'" data-node="'+i+'"><span>'+esc(model.titles[i])+'</span><small>'+esc(scope==='second'?model.paths[i].slice(model.prefix.length):model.paths[i])+'</small></button>').join('')||'<p class="vault-empty">No notes match these filters.</p>';
  $('#vault-page').textContent=(page+1)+' / '+pages;$('#vault-prev').disabled=page===0;$('#vault-next').disabled=page>=pages-1;
  $('#graph-source-list').querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>select(Number(b.dataset.node),{fly:true}));
 }

 async function select(i,{fly=false}={}){
  if(!model||i<0||i>=model.n)return;
  selected=i;const version=++readVersion;
  if(local)apply({fit:true});else{list();paintStates()}
  if(fly&&renderer)renderer.focus(i,{neighbours:[...rowOf(model.adj,i)]});
  const path=model.paths[i],title=model.titles[i],k=kindOf(model,i),rel=relatedNotes(model,i),c=model.community[i];
  const chip=c>=0?'<span class="brain-chip"><i style="background:'+css(slotColour(palette,colours.mode==='community'?colours.key[i]:GROUP_SLOTS))+'"></i>'+esc(communityLabel(model,c))+'</span>':'';
  const vaultRoot=model.vault?.root;
  reader.classList.add('has-note');
  reader.innerHTML='<div class="vault-note-header"><span class="eyebrow">'+esc(k)+' · READ ONLY</span><button type="button" id="vault-close-note" aria-label="Close note">×</button></div><h3>'+esc(title)+'</h3><p class="source-path">'+esc(path)+'</p>'
   +'<div class="brain-note-meta">'+chip+'<span class="brain-degree">'+count(model.degree[i])+' links · '+count(rel.outgoing.length)+' out · '+count(rel.incoming.length)+' in</span></div>'
   +'<div class="vault-note-tags">'+tagsOf(model,i).map(t=>'<span>#'+esc(t)+'</span>').join('')+'</div>'
   +'<div class="vault-reader-actions">'+(renderer?.kind==='3d'?'<button type="button" id="brain-fly">Fly to</button>':'')+'<button type="button" id="vault-local-note">Explore connections</button>'+(vaultRoot?'<a href="obsidian://open?path='+encodeURIComponent(vaultRoot+'/'+path)+'">Open in Obsidian ↗</a>':'')+'</div>'
   +'<div id="source-content" class="vault-document" role="status">Loading note…</div><section class="vault-note-links">'+relatedHTML(rel)+'</section>';
  $('#vault-close-note').onclick=closeNote;
  $('#vault-local-note').onclick=()=>{local=true;$('#graph-local').setAttribute('aria-pressed','true');query='';$('#graph-search').value='';apply({fit:true})};
  if($('#brain-fly'))$('#brain-fly').onclick=()=>renderer?.focus(i,{neighbours:[...rowOf(model.adj,i)]});
  bindLinks();
  const content=$('#source-content'),id=await nodeId(path),url='/api/hq/v1/brain/vault/file/'+id;
  if(version!==readVersion||closed)return;
  if(k==='attachment'){
   const ext=path.split('.').pop().toLowerCase();
   content.innerHTML=['png','jpg','jpeg','gif','webp','avif'].includes(ext)?'<img class="vault-attachment" src="'+esc(url)+'" alt="'+esc(title)+'">':['mp3','wav','m4a','ogg'].includes(ext)?'<audio controls src="'+esc(url)+'"></audio>':['mp4','webm'].includes(ext)?'<video controls src="'+esc(url)+'"></video>':'<a href="'+esc(url)+'" download>Download '+esc(title)+' ↗</a>';
   return;
  }
  try{
   const text=await read({id,path,title,kind:k,source_url:url});if(version!==readVersion||closed||!dialog.open)return;
   if(k==='canvas'){const data=JSON.parse(text);content.innerHTML='<div class="vault-canvas-cards">'+(data.nodes||[]).map(node=>'<article>'+(node.text?markdown(node.text):esc(node.file||node.url||node.label||'Canvas group'))+'</article>').join('')+'</div>'}
   else{content.innerHTML=markdown(text.replace(/^---\s*\n[\s\S]*?\n---\s*\n/,''));linkify(content,i)}
  }catch(error){
   if(version!==readVersion)return;content.textContent='Could not open this note: '+(error?.message||'unknown error');
   const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.onclick=()=>select(i);content.append(retry);
  }
 }
 function closeNote(){
  reader.classList.remove('has-note');selected=-1;local=false;$('#graph-local').setAttribute('aria-pressed','false');reader.innerHTML=introHTML();apply();
 }
 function relatedHTML(rel){
  return [['LINKED NOTES',rel.outgoing],['BACKLINKS',rel.incoming]].map(([label,rows])=>'<details class="vault-backlinks" open><summary>'+label+' · '+count(rows.length)+'</summary>'+(rows.map(j=>'<button type="button" data-link="'+j+'">'+esc(model.titles[j])+'</button>').join('')||'<p class="muted">No links yet.</p>')+'</details>').join('');
 }
 function bindLinks(){reader.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>select(Number(b.dataset.link),{fly:true}))}
 // [[wikilinks]] become buttons; relative Markdown links open inside the reader; web links stay links.
 function linkify(content,source){
  const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),texts=[];
  while(walker.nextNode())if(!walker.currentNode.parentElement.closest('code,pre,a'))texts.push(walker.currentNode);
  for(const node of texts){
   if(!node.textContent.includes('[['))continue;const fragment=document.createDocumentFragment();let last=0;
   for(const m of node.textContent.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)){
    fragment.append(node.textContent.slice(last,m.index));const target=resolveLink(model,m[1],source),el=document.createElement(target>=0?'button':'span');
    el.textContent=m[2]||m[1];if(target>=0){el.type='button';el.dataset.link=String(target);el.className='vault-inline-link'}
    fragment.append(el);last=m.index+m[0].length;
   }
   fragment.append(node.textContent.slice(last));node.replaceWith(fragment);
  }
  content.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href')||'';if(/^(https?:|mailto:)/i.test(href))return;const target=resolveLink(model,href,source);a.removeAttribute('href');if(target>=0){a.dataset.link=String(target);a.tabIndex=0;a.setAttribute('role','button');a.onkeydown=e=>{if(e.key==='Enter')select(target,{fly:true})}}});
  bindLinks();
 }

 function keyboard(e){
  if(!renderer)return;const step=e.shiftKey;
  if(e.key==='+'||e.key==='='){e.preventDefault();renderer.zoom(1.25)}
  else if(e.key==='-'){e.preventDefault();renderer.zoom(0.8)}
  else if(e.key==='0'){e.preventDefault();renderer.fit({animate:true})}
  else if(/^Arrow/.test(e.key)){
   e.preventDefault();const dx=e.key==='ArrowLeft'?1:e.key==='ArrowRight'?-1:0,dy=e.key==='ArrowUp'?1:e.key==='ArrowDown'?-1:0;
   if(renderer.kind==='3d'&&!step)renderer.rotate(-dx*0.12,-dy*0.08);else renderer.pan(-dx*40,dy*40);
  }
 }

 // Controls.
 $('#graph-search').oninput=e=>{query=e.target.value.trim();clearTimeout(searchTimer);searchTimer=setTimeout(()=>apply(),120)};
 $('#graph-search').onkeydown=e=>{if(e.key!=='Enter'||!model)return;e.preventDefault();clearTimeout(searchTimer);query=e.target.value.trim();apply();if(query&&matches.length)select(matches[0],{fly:true})};
 $('#graph-folder').onchange=e=>{folder=e.target.value;apply({fit:true})};
 $('#graph-kind').onchange=e=>{kind=e.target.value;apply()};
 $('#brain-colour').onchange=async e=>{colourPref=e.target.value;forceCommunity=colourPref==='community';store.set(KEYS.colour,colourPref);if(!model)return;legendFocus=null;await mount(version)};
 $('#vault-second').onclick=()=>{if(scope!=='second'||!model)show('second')};
 $('#vault-all').onclick=()=>{if(scope!=='workspace'||!model)show('workspace')};
 $('#vault-prev').onclick=()=>{page--;list()};$('#vault-next').onclick=()=>{page++;list()};
 $('#graph-plus').onclick=()=>renderer?.zoom(1.25);$('#graph-minus').onclick=()=>renderer?.zoom(0.8);$('#graph-reset').onclick=()=>renderer?.fit({animate:true});
 $('#graph-local').onclick=()=>{if(selected<0){$('#vault-results-count').textContent='Select a note first.';return}local=!local;$('#graph-local').setAttribute('aria-pressed',String(local));apply({fit:true})};
 $('#brain-renderer').onclick=async()=>{if(webglFailed)return;rendererPref=renderer?.kind==='2d'?'3d':'2d';store.set(KEYS.renderer,rendererPref);if(model)await mount(version)};
 $('#vault-refresh').onclick=()=>show(scope,{refresh:true,confirmed:true});

 dispose=()=>{
  closed=true;version++;readVersion++;layoutJob++;clearTimeout(searchTimer);
  try{worker?.terminate()}catch{}worker=null;renderer?.dispose();renderer=null;removeEventListener('resize',onResize);
 };
 const onResize=()=>{clearTimeout(onResize.timer);onResize.timer=setTimeout(insets,150)};addEventListener('resize',onResize);
 dialog.addEventListener('close',()=>dispose(),{once:true});
 if(!dialog.open)dialog.showModal();
 setScopeButtons();
 await show(scope,{refresh,confirmed:refresh});
}

function shellHTML(){
 return '<div class="vault-toolbar"><div class="vault-identity"><span class="eyebrow" id="brain-scope-eyebrow">SECOND BRAIN</span><strong id="brain-vault-name">Second Brain</strong></div><div class="vault-totals" id="brain-totals" aria-live="polite"></div><div class="brain-toolbar-actions"><button type="button" id="brain-renderer" aria-pressed="false">Simple view</button><button type="button" id="vault-refresh">↻ Refresh</button></div></div>'
 +'<div class="vault-layout"><aside class="vault-browser"><label class="vault-search"><span class="sr-only">Search notes, paths and tags. Enter opens the first match.</span><input id="graph-search" type="search" placeholder="Search notes, paths, tags…" autocomplete="off" enterkeyhint="go"></label>'
 +'<div class="vault-scopes" role="group" aria-label="Brain scope"><button type="button" id="vault-second" aria-pressed="true">Second Brain</button><button type="button" id="vault-all" aria-pressed="false">Entire workspace</button></div>'
 +'<label class="vault-folder-label">Colour by<select id="brain-colour"><option value="community">Community</option><option value="folder">Folder</option></select></label>'
 +'<label class="vault-folder-label">Folder<select id="graph-folder"><option value="">All folders</option></select></label><select id="graph-kind" aria-label="File type"><option value="">All types</option></select>'
 +'<div id="vault-results-count" role="status"></div><div id="graph-source-list" class="vault-results"></div><div class="vault-pagination"><button type="button" id="vault-prev" aria-label="Previous notes">←</button><span id="vault-page"></span><button type="button" id="vault-next" aria-label="Next notes">→</button></div></aside>'
 +'<div class="vault-stage" id="brain-stage"><canvas id="brain-graph" tabindex="0" role="img" aria-label="Brain graph"></canvas><div class="brain-label-layer" aria-hidden="true"></div>'
 +'<div class="vault-graph-heading"><span class="eyebrow" id="vault-view-title"></span><strong id="vault-view-count"></strong><small id="brain-layout-note"></small></div><div id="vault-tooltip" hidden></div>'
 +'<div class="graph-controls"><button type="button" id="graph-minus" aria-label="Zoom graph out">−</button><button type="button" id="graph-reset">Fit</button><button type="button" id="graph-plus" aria-label="Zoom graph in">+</button><button type="button" id="graph-local" aria-pressed="false">Local graph</button></div>'
 +'<div class="brain-legend" id="vault-legend"></div><p class="vault-hint" id="brain-hint"></p><div class="brain-stage-state" id="brain-stage-state" hidden></div></div>'
 +'<aside id="graph-reader" class="vault-reader"></aside></div>';
}
function introHTML(){
 return '<span class="eyebrow">YOUR KNOWLEDGE, CONNECTED</span><h3>Follow a connection.</h3><p>Search, pick a note in the list or click one in the graph to read it with its linked notes and backlinks.</p><p class="muted">Local, read-only access. Your original files stay in Obsidian.</p>';
}

// Main-thread fallback when the worker cannot start: notes on a golden-angle sphere (or disc).
function fallbackLayout(n,dims){
 const out=new Float32Array(3*n),g=Math.PI*(3-Math.sqrt(5)),r=8*Math.cbrt(Math.max(1,n))*2;
 for(let i=0;i<n;i++){const y=1-2*(i+.5)/n,rr=Math.sqrt(1-y*y),a=i*g;if(dims===2){const d=Math.sqrt((i+.5)/n)*r;out[3*i]=Math.cos(a)*d;out[3*i+1]=Math.sin(a)*d}else{out[3*i]=Math.cos(a)*rr*r;out[3*i+1]=y*r;out[3*i+2]=Math.sin(a)*rr*r}}
 return out;
}

// The simple view: a 2D canvas with the same interface as the GPU scene (x/y of the flat layout).
function create2D(canvas,{palette,labelLayer}){
 const ctx=canvas.getContext('2d');let n=0,src=new Int32Array(0),dst=new Int32Array(0),colours=new Float32Array(0),sizes=new Float32Array(0),pos=new Float32Array(0),states=new Float32Array(0);
 let focusPairs=[],labels=[],dimLinks=false,width=1,height=1,scale=1,fitScale=1,cx=0,cy=0,tx=0,ty=0,frame=0,disposed=false,grid=null;
 const listeners={pick:()=>{},hover:()=>{},camera:()=>{}};labelLayer?.replaceChildren();
 const view=(x,y)=>({x:width/2+tx+(x-cx)*fitScale*scale,y:height/2+ty+(y-cy)*fitScale*scale});
 const draw=()=>{frame=0;if(disposed)return;ctx.clearRect(0,0,width,height);if(!n)return;
  ctx.lineWidth=.6;ctx.strokeStyle=css(palette.line);ctx.globalAlpha=dimLinks?.12:.32;ctx.beginPath();
  for(let k=0;k<src.length;k++){const a=view(pos[3*src[k]],pos[3*src[k]+1]),b=view(pos[3*dst[k]],pos[3*dst[k]+1]);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}ctx.stroke();
  if(focusPairs.length){ctx.globalAlpha=.9;ctx.strokeStyle=css(palette.accent);ctx.lineWidth=1.2;ctx.beginPath();for(const [a,b] of focusPairs){const p=view(pos[3*a],pos[3*a+1]),q=view(pos[3*b],pos[3*b+1]);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y)}ctx.stroke()}
  const r=i=>Math.max(.8,Math.min(6,sizes[i]*.42*Math.sqrt(scale)));
  for(const pass of [1,0,2,3])for(let i=0;i<n;i++){
   if(states[i]!==pass)continue;const p=view(pos[3*i],pos[3*i+1]);if(p.x<-8||p.y<-8||p.x>width+8||p.y>height+8)continue;
   ctx.globalAlpha=pass===1?.18:1;ctx.fillStyle=css(pass===3?palette.accent:[colours[3*i],colours[3*i+1],colours[3*i+2]]);
   ctx.beginPath();ctx.arc(p.x,p.y,r(i)*(pass>=2?1.6:1),0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.font='12px '+getComputedStyle(canvas).fontFamily;ctx.textAlign='center';const placed=[];
  for(const l of labels){
   if(l.kind==='group'&&scale>1.6)continue;if(l.kind==='hub'&&(l.rank>=(scale>1.6?24:6)))continue;
   const p=l.i>=0?view(pos[3*l.i],pos[3*l.i+1]):view(l.point[0],l.point[1]),w=Math.min(220,l.text.length*6.6+10),rect=[p.x-w/2,p.y-24,p.x+w/2,p.y-8];
   if(l.kind!=='focus'&&placed.some(q=>q[0]<rect[2]&&rect[0]<q[2]&&q[1]<rect[3]&&rect[1]<q[3]))continue;placed.push(rect);
   ctx.fillStyle=css(l.kind==='group'?palette.muted:palette.text);ctx.fillText(l.text,p.x,p.y-12);
  }
  canvas.dataset.scale=scale.toFixed(2);
 };
 const invalidate=()=>{grid=null;if(!frame&&!disposed)frame=requestAnimationFrame(draw)};
 const resize=()=>{const box=canvas.parentElement.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2);width=Math.max(1,box.width);height=Math.max(1,box.height);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);invalidate()};
 const observer=new ResizeObserver(resize);observer.observe(canvas.parentElement);resize();
 function pick(x,y){
  if(!grid){grid=new Map();for(let i=0;i<n;i++){if(states[i]===1)continue;const p=view(pos[3*i],pos[3*i+1]),key=Math.floor(p.x/16)+':'+Math.floor(p.y/16);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i)}}
  let best=-1,bestD=12;for(let gx=Math.floor((x-12)/16);gx<=Math.floor((x+12)/16);gx++)for(let gy=Math.floor((y-12)/16);gy<=Math.floor((y+12)/16);gy++)for(const i of grid.get(gx+':'+gy)||[]){const p=view(pos[3*i],pos[3*i+1]),d=Math.hypot(p.x-x,p.y-y);if(d<bestD){bestD=d;best=i}}
  return best;
 }
 let pointer=null,moved=false;const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
 canvas.onpointerdown=e=>{pointer=local(e);moved=false;canvas.setPointerCapture?.(e.pointerId)};
 canvas.onpointermove=e=>{const p=local(e);if(pointer){if(Math.hypot(p.x-pointer.x,p.y-pointer.y)>2)moved=true;tx+=p.x-pointer.x;ty+=p.y-pointer.y;pointer=p;invalidate();listeners.camera();return}const i=pick(p.x,p.y);listeners.hover(i,p);canvas.style.cursor=i>=0?'pointer':'grab'};
 canvas.onpointerup=e=>{if(pointer&&!moved){const p=local(e);listeners.pick(pick(p.x,p.y),p)}pointer=null};canvas.onpointercancel=()=>{pointer=null};canvas.onpointerleave=()=>listeners.hover(-1,null);
 const wheel=e=>{e.preventDefault();const p=local(e),next=Math.max(.2,Math.min(40,scale*Math.exp(-e.deltaY*.0015)));tx=p.x-width/2-(p.x-width/2-tx)*next/scale;ty=p.y-height/2-(p.y-height/2-ty)*next/scale;scale=next;invalidate();listeners.camera()};
 canvas.addEventListener('wheel',wheel,{passive:false});
 return {kind:'2d',
  setGraph(g){n=g.n;src=g.src;dst=g.dst;colours=g.colours;sizes=g.sizes;pos=new Float32Array(3*n);states=new Float32Array(n);canvas.dataset.nodes=String(n);canvas.dataset.edges=String(src.length);invalidate()},
  setColours(c){colours=c;invalidate()},setPositions(p){pos=p;invalidate()},setStates(s,{dimLinks:d=false}={}){states=s;dimLinks=d;invalidate()},setFocusPairs(p){focusPairs=p||[];invalidate()},setLabels(l){labels=l;invalidate()},
  fit({indices=null}={}){const list=indices||Array.from({length:n},(_,i)=>i);if(!list.length)return;let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const i of list){x0=Math.min(x0,pos[3*i]);x1=Math.max(x1,pos[3*i]);y0=Math.min(y0,pos[3*i+1]);y1=Math.max(y1,pos[3*i+1])}cx=(x0+x1)/2;cy=(y0+y1)/2;fitScale=Math.min((width-60)/Math.max(20,x1-x0),(height-120)/Math.max(20,y1-y0));scale=1;tx=0;ty=20;invalidate()},
  focus(i){if(i<0)return;scale=Math.max(scale,2.5);tx=-(pos[3*i]-cx)*fitScale*scale;ty=-(pos[3*i+1]-cy)*fitScale*scale;invalidate()},
  zoom(f){scale=Math.max(.2,Math.min(40,scale*f));invalidate()},rotate(){},pan(dx,dy){tx+=dx;ty+=dy;invalidate()},pick,invalidate,setAmbient(){},
  onPick(fn){listeners.pick=fn},onHover(fn){listeners.hover=fn},onCamera(fn){listeners.camera=fn},
  get scale(){return scale},stats:()=>({nodes:n,edges:src.length}),
  dispose(){disposed=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('wheel',wheel)}
 };
}
