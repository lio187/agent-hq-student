// Brain model (7 October 2026): pure functions over the slim columnar graph from GET brain/graph and the
// graphify communities from GET brain/communities. No DOM, no network: the view and the renderers read
// typed arrays from here, and node tests cover every rule.
export const SECOND_PREFIX='refs/leon-second-brain/';
export const GROUP_SLOTS=8;

// Columnar payload -> arrays. Paths are prefix + folder + '/' + name; edges arrive as [source delta, target].
export function decodeSlim(slim){
 const n=slim?.names?.length||0,prefix=slim?.prefix||'',folders=slim?.folders||[],names=slim?.names||[];
 const folder=Int32Array.from(slim?.folder||[]),kind=Uint8Array.from(slim?.kind||[]);
 const paths=new Array(n),titles=new Array(n);
 for(let i=0;i<n;i++){
  const f=folders[folder[i]]||'';paths[i]=prefix+(f?f+'/':'')+names[i];
  const t=slim.titles?.[i];titles[i]=t==null?stem(names[i]):String(t);
 }
 const flat=slim?.edges||[],e=flat.length>>1,src=new Int32Array(e),dst=new Int32Array(e);let s=0;
 for(let k=0;k<e;k++){s+=flat[2*k];src[k]=s;dst[k]=flat[2*k+1]}
 return {n,prefix,paths,names,titles,folders,folder,kinds:slim?.kinds||[],kind,tagNames:slim?.tag_names||[],tagIndex:slim?.tags||[],src,dst,hubs:slim?.hubs||[],counts:slim?.counts||{nodes:n,edges:e,isolated:0},vault:slim?.vault||null,scope:slim?.scope||'second'};
}
export const stem=name=>String(name||'').replace(/\.(md|canvas)$/i,'');

// Compressed sparse rows: offsets[i]..offsets[i+1] index into targets.
function csr(n,from,to){
 const offsets=new Int32Array(n+1);for(let k=0;k<from.length;k++)offsets[from[k]+1]++;
 for(let i=0;i<n;i++)offsets[i+1]+=offsets[i];
 const fill=offsets.slice(0,n),targets=new Int32Array(from.length);
 for(let k=0;k<from.length;k++)targets[fill[from[k]]++]=to[k];
 return {offsets,targets};
}
export const rowOf=(rows,i)=>rows.targets.subarray(rows.offsets[i],rows.offsets[i+1]);

export function buildBrainModel(slim,communities=null){
 const m=decodeSlim(slim),{n,src,dst}=m;
 m.out=csr(n,src,dst);m.inc=csr(n,dst,src);
 // Undirected adjacency without duplicates (a link both ways counts once).
 const both=csr(n,Int32Array.from([...src,...dst]),Int32Array.from([...dst,...src]));
 const offsets=new Int32Array(n+1),targets=[];
 for(let i=0;i<n;i++){const seen=new Set(rowOf(both,i));seen.delete(i);for(const j of seen)targets.push(j);offsets[i+1]=targets.length}
 m.adj={offsets,targets:Int32Array.from(targets)};
 m.degree=new Int32Array(n);for(let k=0;k<src.length;k++){m.degree[src[k]]++;m.degree[dst[k]]++}
 m.byPath=new Map();m.byName=new Map();
 for(let i=0;i<n;i++){
  m.byPath.set(m.paths[i].toLowerCase(),i);
  const key=stem(m.names[i]).toLowerCase();if(!m.byName.has(key))m.byName.set(key,[]);m.byName.get(key).push(i);
 }
 m.community=new Int32Array(n).fill(-1);m.communityLabels={};m.graphify=communities||null;
 if(communities?.available){
  m.communityLabels=communities.labels||{};
  for(const [path,id] of Object.entries(communities.community||{})){const i=m.byPath.get(path.toLowerCase());if(i!==undefined)m.community[i]=id}
 }
 m.mapped=m.community.reduce((a,c)=>a+(c>=0),0);
 return m;
}
export const tagsOf=(m,i)=>(m.tagIndex[i]||[]).map(t=>m.tagNames[t]).filter(Boolean);
export const folderOf=(m,i)=>m.folders[m.folder[i]]||'';
export const kindOf=(m,i)=>m.kinds[m.kind[i]]||'note';

// Folder group shown in the legend: wiki pages by their section (wiki/entities), everything else by its
// top-level folder; workspace scope always by top-level folder.
export function folderGroup(m,i){
 const parts=folderOf(m,i).split('/').filter(Boolean);
 if(m.scope==='second'&&parts[0]==='wiki')return parts.slice(0,2).join('/');
 return parts[0]||'Notes';
}
export const communityLabel=(m,id)=>m.communityLabels[String(id)]||('Community '+id);

// Group per node for colour: the largest GROUP_SLOTS groups get a slot, the rest share "Other", nodes
// without a community get "None". Slots are assigned by size, ties by label, so colours are stable.
export function colourKey(m,mode='community',{slots=GROUP_SLOTS}={}){
 const useCommunity=mode==='community'&&m.mapped>0,label=new Array(m.n);
 for(let i=0;i<m.n;i++)label[i]=useCommunity?(m.community[i]>=0?'c'+m.community[i]:null):folderGroup(m,i);
 const counts=new Map();for(const l of label)if(l!==null)counts.set(l,(counts.get(l)||0)+1);
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])));
 const slotOf=new Map(ranked.slice(0,slots).map(([l],i)=>[l,i])),OTHER=slots,NONE=slots+1,key=new Int32Array(m.n);
 // group: one dense id per real label for the layout; notes without a community cluster by folder.
 const groupOf=new Map(ranked.map(([l],i)=>[l,i])),group=new Int32Array(m.n);
 for(let i=0;i<m.n;i++){
  key[i]=label[i]===null?NONE:slotOf.has(label[i])?slotOf.get(label[i]):OTHER;
  if(label[i]!==null){group[i]=groupOf.get(label[i]);continue}
  const folder='f:'+folderGroup(m,i);if(!groupOf.has(folder))groupOf.set(folder,groupOf.size);group[i]=groupOf.get(folder);
 }
 const name=l=>useCommunity?communityLabel(m,Number(String(l).slice(1))):l;
 const legend=ranked.slice(0,slots).map(([l,count],slot)=>({slot,label:name(l),count,id:useCommunity?Number(String(l).slice(1)):l}));
 const other=ranked.slice(slots).reduce((a,[,c])=>a+c,0),none=label.reduce((a,l)=>a+(l===null),0);
 if(other)legend.push({slot:OTHER,label:useCommunity?'Other communities':'Other folders',count:other,id:'other',groups:ranked.length-slots});
 if(none)legend.push({slot:NONE,label:'No community',count:none,id:'none'});
 return {mode:useCommunity?'community':'folder',key,group,groupCount:groupOf.size,legend,slots};
}

// Search: every term must appear in the title, path or tags. Title hits rank above path hits; better linked
// notes first within a rank.
export function searchNodes(m,query,{limit=Infinity,filter=null}={}){
 const terms=String(query||'').toLowerCase().split(/\s+/).filter(Boolean),hits=[];
 for(let i=0;i<m.n;i++){
  if(filter&&!filter(i))continue;
  if(!terms.length){hits.push([0,i]);continue}
  const title=m.titles[i].toLowerCase(),path=m.paths[i].toLowerCase(),tags=tagsOf(m,i).join(' ').toLowerCase();
  if(!terms.every(t=>title.includes(t)||path.includes(t)||tags.includes(t)))continue;
  const q=terms.join(' ');
  hits.push([title===q?0:title.startsWith(q)?1:title.includes(q)?2:terms.every(t=>title.includes(t))?3:path.includes(q)?4:5,i]);
 }
 hits.sort((a,b)=>a[0]-b[0]||m.degree[b[1]]-m.degree[a[1]]||m.titles[a[1]].localeCompare(m.titles[b[1]]));
 return hits.slice(0,limit).map(h=>h[1]);
}

export function neighbourhood(m,i,depth=1){
 const seen=new Set([i]);let frontier=[i];
 for(let d=0;d<depth;d++){const next=[];for(const a of frontier)for(const b of rowOf(m.adj,a))if(!seen.has(b)){seen.add(b);next.push(b)}frontier=next}
 return seen;
}
export const relatedNotes=(m,i)=>({outgoing:[...rowOf(m.out,i)],incoming:[...rowOf(m.inc,i)]});

// Honest label for the graphify layer: its date, its coverage and whether the wiki moved on since.
export function graphifyNote(c,{locale='en-GB'}={}){
 if(!c)return {available:false,stale:false,text:'Communities not loaded.'};
 if(!c.available)return {available:false,stale:false,text:'No graphify communities: '+(c.reason||'not available')+' Colours follow folders.'};
 const date=c.built_at?new Date(c.built_at*1000).toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'}):'an unknown date';
 const pages=c.coverage?.wiki_pages,nodes=c.coverage?.graph_nodes;
 const text=c.stale
  ?'Graphify communities were built on '+date+'; the wiki has '+fmt(pages)+' pages now ('+fmt(nodes)+' in the graph). Re-running graphify is an owner action.'
  :'Graphify communities built on '+date+' · '+fmt(c.coverage?.mapped)+' pages mapped.';
 return {available:true,stale:Boolean(c.stale),date,text};
}
const fmt=v=>Number(v||0).toLocaleString('en-GB');

// Wikilink and Markdown link resolution, same rules as the index: relative path, vault path, then a unique
// file name (a linked note wins when the name is ambiguous).
export function resolveLink(m,raw,source){
 let target;try{target=decodeURIComponent(raw).split('#')[0]}catch{return -1}
 if(!target)return -1;
 const parts=[];for(const p of m.paths[source].split('/').slice(0,-1).concat(target.split('/'))){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}
 for(const p of [parts.join('/'),target.replace(/^\//,'')]){const i=m.byPath.get(p.toLowerCase())??m.byPath.get((p+'.md').toLowerCase());if(i!==undefined)return i}
 const matches=m.byName.get(stem(target.split('/').pop()).toLowerCase())||[];
 if(matches.length===1)return matches[0];
 const near=new Set(rowOf(m.adj,source)),linked=matches.filter(i=>near.has(i));
 return linked.length===1?linked[0]:-1;
}

// The vault file id is derived from the path, exactly like hq/vault.py node_id(): sha256 hex, 24 chars.
export async function nodeId(path){
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(path));
 return 'vault-'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}

// Group ids per node for the layout worker: one cluster per community or folder, isolated nodes -1 (outer shell).
export function layoutGroups(m,colours){
 const g=new Int32Array(m.n);for(let i=0;i<m.n;i++)g[i]=m.degree[i]===0?-1:colours.group[i];
 return g;
}
