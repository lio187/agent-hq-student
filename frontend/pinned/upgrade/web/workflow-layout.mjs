// Workflow canvas layout (7 October 2026). Pure functions, no DOM. Top-down, like a readable n8n run:
// a node's row is one more than its furthest predecessor, so steps flow downward and the calls of one
// model turn sit side by side in one row, centred under their turn (wrapping after `perRow`). Delegated
// work (sub-agents, a task's worker session) runs in lanes to the right of the main column. Long runs of
// successful tool calls collapse into one "+N more" card, and only a window of cards near the vertical
// viewport is put in the DOM.
export const ROW=112,NODE_W=184,NODE_H=64,GAP_X=16,COLW=NODE_W+GAP_X,LANE_GAP=48;
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Collapse ≥ min consecutive error-free tool cards of one turn and lane into a group card, keeping the
// first `keep` visible (10 Oct 2026: from 4 calls, so a finished turn reads as one step plus "+N more"). Edges are remapped to the group and de-duplicated; nothing is dropped from the
// count: visible cards + hidden members always equal the input.
export function groupRuns(graph,{min=4,keep=1,expanded=new Set()}={}){
 const nodes=graph.nodes||[],out=[],members=new Map();let run=[];
 const same=(a,b)=>a.kind==='tool'&&b.kind==='tool'&&(a.turn??null)===(b.turn??null)&&(a.lane||0)===(b.lane||0);
 const flush=()=>{
  if(run.length>=min&&!expanded.has('g:'+run[0].id)){
   const shown=run.slice(0,keep),hidden=run.slice(keep),id='g:'+run[0].id;
   out.push(...shown);
   const starts=hidden.map(n=>n.startedAt).filter(Number.isFinite),ends=hidden.map(n=>n.endedAt).filter(Number.isFinite);
   out.push({id,kind:'group',label:'+'+hidden.length+' more',sub:hidden.length+' successful tool calls',status:'ok',turn:run[0].turn,lane:run[0].lane,
    startedAt:starts.length?Math.min(...starts):null,endedAt:ends.length?Math.max(...ends):null,ms:null,meta:{},members:hidden.map(n=>n.id)});
   for(const n of hidden)members.set(n.id,id);
  }else out.push(...run);
  run=[];
 };
 for(const n of nodes){if(n.kind==='tool'&&n.status==='ok'&&(!run.length||same(run[run.length-1],n)))run.push(n);else{flush();if(n.kind==='tool'&&n.status==='ok')run.push(n);else out.push(n)}}
 flush();
 const seen=new Set(),edges=[];
 for(const e of graph.edges||[]){
  const from=members.get(e.from)||e.from,to=members.get(e.to)||e.to;if(from===to)continue;
  const key=from+'>'+to;if(seen.has(key))continue;seen.add(key);edges.push(from===e.from&&to===e.to?e:{...e,from,to});
 }
 return {...graph,nodes:out,edges,hidden:members.size};
}

// Layer = 1 + max(layer of predecessors) (Kahn order; list order breaks ties and cycles). A layer takes
// as many rows as its widest lane needs; rows are `row` px apart, so y only ever grows along an edge.
// Main-column cards of one row are centred on the main axis; lane l sits to the right of lane l-1.
export function layoutGraph(graph,{row=ROW,perRow=3,lanePerRow=2}={}){
 const nodes=graph.nodes||[],index=new Map(nodes.map((n,i)=>[n.id,i]));
 const edges=(graph.edges||[]).filter(e=>index.has(e.from)&&index.has(e.to)&&e.from!==e.to);
 const preds=new Map(nodes.map(n=>[n.id,[]])),succ=new Map(nodes.map(n=>[n.id,[]])),left=new Map(nodes.map(n=>[n.id,0]));
 for(const e of edges){preds.get(e.to).push(e.from);succ.get(e.from).push(e.to);left.set(e.to,left.get(e.to)+1)}
 const layer=new Map(),done=new Set(),ready=nodes.filter(n=>!left.get(n.id)).map(n=>n.id);
 while(done.size<nodes.length){
  if(!ready.length)ready.push(nodes.find(n=>!done.has(n.id)).id); // a cycle: take the earliest remaining node
  ready.sort((a,b)=>index.get(a)-index.get(b));
  const id=ready.shift();if(done.has(id))continue;done.add(id);
  const ps=preds.get(id).filter(p=>layer.has(p));
  layer.set(id,ps.length?1+Math.max(...ps.map(p=>layer.get(p))):0);
  for(const s of succ.get(id)){left.set(s,left.get(s)-1);if(left.get(s)<=0&&!done.has(s))ready.push(s)}
 }
 const per=lane=>Math.max(1,lane?lanePerRow:perRow),at=v=>Number.isFinite(v)?v:Infinity;
 const buckets=new Map();let lanesUsed=0;
 for(const n of nodes){const L=layer.get(n.id),lane=n.lane||0;lanesUsed=Math.max(lanesUsed,lane);if(!buckets.has(L))buckets.set(L,new Map());const b=buckets.get(L);if(!b.has(lane))b.set(lane,[]);b.get(lane).push(n)}
 const layers=[...buckets.keys()].sort((a,b)=>a-b),top=new Map();let y=0;
 for(const L of layers){top.set(L,y);y+=Math.max(...[...buckets.get(L)].map(([lane,list])=>Math.ceil(list.length/per(lane))))*row}
 const mainHalf=(per(0)*COLW-GAP_X)/2,laneLeft=lane=>mainHalf+LANE_GAP+(lane-1)*(per(1)*COLW-GAP_X+LANE_GAP);
 const pos=new Map();
 for(const L of layers)for(const [lane,list] of buckets.get(L)){
  list.sort((a,b)=>at(a.startedAt)-at(b.startedAt)||index.get(a.id)-index.get(b.id));
  const p=per(lane);
  list.forEach((n,i)=>{const r=Math.floor(i/p),slot=i%p,inRow=Math.min(p,list.length-r*p);
   const x=lane?laneLeft(lane)+slot*COLW:-(inRow*COLW-GAP_X)/2+slot*COLW;
   pos.set(n.id,{x,y:top.get(L)+r*row,layer:L,lane});});
 }
 const minX=Math.min(-NODE_W/2,...[...pos.values()].map(p=>p.x));
 for(const p of pos.values())p.x=Math.round(p.x-minX);
 const placed=nodes.map(n=>({...n,...pos.get(n.id)})),byId=new Map(placed.map(n=>[n.id,n]));
 const paths=edges.map(e=>{const a=byId.get(e.from),b=byId.get(e.to);return {...e,d:edgePath(a,b),x1:a.x,y1:a.y,x2:b.x,y2:b.y}});
 const width=Math.max(NODE_W,...placed.map(n=>n.x+NODE_W)),height=Math.max(NODE_H,...placed.map(n=>n.y+NODE_H));
 return {nodes:placed,edges:paths,byId,width,height,mainX:Math.round(-minX),lanes:lanesUsed};
}

// Bottom centre of the source card to the top centre of the target (M x1,y1 C x1,y1+d x2,y2-d x2,y2).
// d is 50 px, and half the gap for neighbouring rows so short edges bend as an S instead of looping.
export function edgePath(a,b){
 const x1=a.x+NODE_W/2,y1=a.y+NODE_H,x2=b.x+NODE_W/2,y2=b.y,d=Math.round(Math.min(50,Math.max(16,(y2-y1)/2)));
 return 'M'+x1+','+y1+' C'+x1+','+(y1+d)+' '+x2+','+(y2-d)+' '+x2+','+y2;
}

// The cards worth rendering for a viewport (world coordinates): everything inside it plus a margin,
// nearest to its vertical middle first, at most `max`; edges between rendered cards first, at most 2×.
export function visibleWindow(layout,max=60,view=null){
 let list=layout.nodes;
 if(view){
  const mx=240,my=200,x0=view.x-mx,x1=view.x+view.w+mx,y0=view.y-my,y1=view.y+view.h+my,cx=view.x+view.w/2,cy=view.y+view.h/2;
  list=list.filter(n=>n.y+NODE_H>=y0&&n.y<=y1&&n.x+NODE_W>=x0&&n.x<=x1)
   .map(n=>[Math.abs(n.y+NODE_H/2-cy)*4+Math.abs(n.x+NODE_W/2-cx),n]).sort((a,b)=>a[0]-b[0]).map(p=>p[1]);
 }
 const nodes=list.slice(0,max),ids=new Set(nodes.map(n=>n.id));
 const both=layout.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),one=layout.edges.filter(e=>ids.has(e.from)!==ids.has(e.to));
 return {nodes,edges:[...both,...one].slice(0,max*2)};
}

// Keyboard walk: down follows an outgoing edge (the main column first), up the incoming one, left and
// right move to the neighbouring card in the same row.
export function neighbour(layout,id,key){
 const n=layout.byId.get(id);if(!n)return layout.nodes[0]?.id||null;
 const near=list=>list.sort((a,b)=>(a.lane||0)-(b.lane||0)||Math.abs(a.x-n.x)-Math.abs(b.x-n.x))[0];
 if(key==='ArrowDown'){const t=near(layout.edges.filter(e=>e.from===id).map(e=>layout.byId.get(e.to)));return t?t.id:id}
 if(key==='ArrowUp'){const s=near(layout.edges.filter(e=>e.to===id).map(e=>layout.byId.get(e.from)));return s?s.id:id}
 const row=layout.nodes.filter(m=>m.y===n.y).sort((a,b)=>a.x-b.x),i=row.findIndex(m=>m.id===id);
 if(key==='ArrowRight')return (row[i+1]||n).id;
 if(key==='ArrowLeft')return (row[i-1]||n).id;
 return id;
}

// Rounds the total first, then splits it, so a value never reads "1 min 60 s" (10 Oct 2026).
export function duration(ms){
 if(!Number.isFinite(ms))return '';
 if(ms<1000)return Math.round(ms)+' ms';
 const s=ms/1000;if(s<9.95)return s.toFixed(1)+' s';
 const total=Math.round(s);if(total<60)return total+' s';
 if(total<3600){const m=Math.floor(total/60),sec=total%60;return m+' min'+(sec?' '+sec+' s':'')}
 const mins=Math.round(total/60),h=Math.floor(mins/60),min=mins%60;if(h<48)return h+' h'+(min?' '+min+' min':'');
 return Math.round(h/24)+' days';
}
// Reading order (top to bottom, then left to right) and each card's position in it, for screen readers.
export function readingOrder(layout){
 const list=[...(layout?.nodes||[])].sort((a,b)=>a.y-b.y||a.x-b.x);
 return new Map(list.map((n,i)=>[n.id,i+1]));
}
