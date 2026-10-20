// Video wall (6 October 2026): scraped Instagram, TikTok and YouTube posts as a visual grid. Thumbnails are
// local copies made by the collector; playback uses each platform's official embed player, so every post
// plays without storing video. Pure rendering plus a small state per wall (filter, sort, how many shown).
import {relativeTime} from './data-table.mjs';

const walls=new Map();
const PLATFORM={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube'};
const KIND={video:'Reel',carousel:'Carousel',image:'Photo'};
const compact=n=>n==null||!Number.isFinite(Number(n))?'':Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(Number(n));
// Text tiles (9 Oct 2026): without a thumbnail a tile reads like an editorial card: the hook large, then a short
// excerpt of the rest, tinted by platform or format.
const afterFirst=(t,first)=>{const s=String(t||'').replace(/https?:\/\/\S+/g,'').trim(),i=first?s.indexOf(first):-1;return (i<0?'':s.slice(i+first.length)).replace(/\s+/g,' ').trim().slice(0,320)};
const textCard=(esc,hook,preview)=>'<span class="vw-text"><span class="vw-hook">'+esc(hook)+'</span>'+(preview?'<span class="vw-preview">'+esc(preview)+'</span>':'')+'</span>';
const firstLine=t=>String(t||'').split(/\n+/).map(l=>l.replace(/https?:\/\/\S+/g,'').trim()).find(l=>l.replace(/[^\p{L}\p{N}]/gu,'').length>=6)||'';

export function postCode(item){
 if(item.platform==='instagram'){const m=/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/.exec(item.url||'');return m?.[1]||item.postId||''}
 if(item.platform==='tiktok'){const m=/\/video\/(\d+)/.exec(item.url||'');return m?.[1]||item.postId||''}
 if(item.platform==='youtube'){const m=/(?:v=|youtu\.be\/|shorts\/)([\w-]{6,20})/.exec(item.url||'');return m?.[1]||item.postId||''}
 return '';
}
export function embedURL(item){
 const code=postCode(item);if(!code)return '';
 if(item.platform==='instagram')return 'https://www.instagram.com/'+(item.kind==='video'||/\/reel\//.test(item.url||'')?'reel':'p')+'/'+encodeURIComponent(code)+'/embed/captioned/';
 if(item.platform==='tiktok')return 'https://www.tiktok.com/embed/v2/'+encodeURIComponent(code);
 if(item.platform==='youtube')return 'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(code)+'?rel=0&modestbranding=1';
 return '';
}

function state(id){if(!walls.has(id))walls.set(id,{platform:'all',group:'all',sort:'newest',shown:24,config:null});return walls.get(id)}
export function wallAction(raw){
 const [id,kind,value]=String(raw).split('|');const s=state(id);
 if(kind==='platform'){s.platform=value;s.shown=24}else if(kind==='group'){s.group=value;s.shown=24}else if(kind==='sort'){s.sort=value;s.shown=24}else if(kind==='more')s.shown+=24;
 return s.config?videoWall(s.config):null;
}
export function wallItem(id,itemId){return state(id).config?.items.find(i=>i.id===itemId)||null}
// A wall may open its own dialog (config.detail(item) → {title,html}); null means: use the embed player.
export function wallDetail(id,itemId){const config=state(id).config,item=wallItem(id,itemId);if(!item||typeof config?.detail!=='function')return null;const d=config.detail(item);return d&&typeof d.html==='string'?{title:String(d.title||item.title||item.creator||'Details'),html:d.html}:null}

const views=i=>Number(i.metrics?.views??i.metrics?.plays??0)||0;
const rising=i=>Number(i.changes?.views??0)||0;
const SORTS={newest:(a,b)=>String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')),views:(a,b)=>views(b)-views(a),rising:(a,b)=>rising(b)-rising(a)};
const VIDEO_SORTS=[['newest','Newest'],['views','Most viewed'],['rising','Rising']];
// Media tiles (Phase 3.0): images and posts 4/5, PDFs and documents 3/4, a text tile when there is no thumbnail.
const MEDIA_KINDS=new Set(['image','pdf','post','doc']);

function mediaTile(id,i,esc,now,kind){
 const title=i.title||firstLine(i.text)||'Untitled',sub=i.sub??i.creator??'';
 const media=i.thumbUrl?'<img src="'+esc(i.thumbUrl)+'" alt="" loading="lazy" decoding="async">':textCard(esc,title,String(i.preview||'').slice(0,320));
 const badges=(i.badges||[]).filter(Boolean).slice(0,2);
 return '<button type="button" class="vw-tile'+(i.thumbUrl?'':' vw-tile--text')+'" data-kind="'+esc(kind)+'"'+(i.format?' data-format="'+esc(i.format)+'"':'')+' data-action="video-play" data-id="'+esc(id+'|'+i.id)+'" aria-label="'+esc('Open '+title+(sub?' · '+sub:''))+'">'
  +media+(badges.length?'<span class="vw-top">'+badges.map(b=>'<span class="vw-badge">'+esc(b)+'</span>').join('')+'</span>':'')
  +'<span class="vw-meta"><strong>'+esc(i.thumbUrl?title:sub||title)+'</strong>'+(i.thumbUrl&&sub?'<span>'+esc(sub)+'</span>':'')+'<small>'+esc(i.when??relativeTime(i.publishedAt||i.observedAt,now))+'</small></span></button>';
}
function tile(id,i,esc,now,kind='video'){
 if(MEDIA_KINDS.has(kind))return mediaTile(id,i,esc,now,kind);
 const hook=firstLine(i.text)||'Untitled post',v=views(i),d=rising(i);
 const media=i.thumbUrl?'<img src="'+esc(i.thumbUrl)+'" alt="" loading="lazy" decoding="async">':textCard(esc,hook,afterFirst(i.text,hook));
 return '<button type="button" class="vw-tile'+(i.thumbUrl?'':' vw-tile--text')+'" data-platform="'+esc(i.platform||'')+'" data-action="video-play" data-id="'+esc(id+'|'+i.id)+'" aria-label="'+esc('Play '+(PLATFORM[i.platform]||'post')+' by '+(i.creator||'unknown')+': '+hook)+'">'
  +media+'<span class="vw-top"><span class="vw-badge">'+esc(PLATFORM[i.platform]||i.platform)+'</span>'+(i.kind&&i.kind!=='video'?'<span class="vw-badge">'+esc(KIND[i.kind]||i.kind)+'</span>':'')+'</span>'
  +'<span class="vw-play" aria-hidden="true"></span>'
  +'<span class="vw-meta"><strong>'+esc(i.creator||'')+'</strong><span>'+(v?esc(compact(v))+' views':i.metrics?.likes!=null?esc(compact(i.metrics.likes))+' likes':'')+(d>0?' <b class="vw-up">+'+esc(compact(d))+'</b>':'')+'</span><small>'+esc(relativeTime(i.publishedAt||i.observedAt,now))+'</small></span></button>';
}

/** items: [{id,platform,url,text,creator,metrics,changes,publishedAt,kind,thumbUrl}]
 * Optional (Phase 3.0): config.kind / item.tileKind ('video' default | 'image' | 'pdf' | 'post' | 'doc'),
 * config.groups [{id,label,filter}] (custom chips instead of platforms), config.sorts [[id,label,compare?]]
 * (one or none hides the sort chips), config.detail(item) → {title,html} (dialog instead of the embed player). */
export function videoWall(config){
 const {id,items,esc,now=Date.now(),emptyText='No videos collected yet.',kind='video',groups,sorts=VIDEO_SORTS}=config;const s=state(id);s.config=config;
 const chip=(type,value,label,count,active)=>'<button type="button" data-action="video-wall" data-id="'+esc(id+'|'+type+'|'+value)+'" aria-pressed="'+active+'">'+esc(label)+(count!=null?'<b>'+count+'</b>':'')+'</button>';
 let list,filterChips;
 if(groups?.length){
  const all=[{id:'all',label:'All',filter:()=>true},...groups],active=all.find(g=>g.id===s.group)||all[0];
  list=items.filter(active.filter);
  filterChips='<div class="dt-tabs" role="group" aria-label="'+esc(config.groupLabel||'Group')+'">'+all.map(g=>chip('group',g.id,g.label,items.filter(g.filter).length,g===active)).join('')+'</div>';
 }else{
  const counts={all:items.length};for(const i of items)counts[i.platform]=(counts[i.platform]||0)+1;
  list=items.filter(i=>s.platform==='all'||i.platform===s.platform);
  const platforms=['all',...Object.keys(PLATFORM).filter(p=>counts[p])];
  filterChips=platforms.length>1||kind==='video'?'<div class="dt-tabs" role="group" aria-label="Platform">'+platforms.map(p=>chip('platform',p,p==='all'?'All':PLATFORM[p],counts[p]||0,s.platform===p)).join('')+'</div>':'';
 }
 // A wall that offers its own sorts starts on the first one, so a key never has to pretend to be 'newest'.
 const sortList=(sorts||[]).filter(Boolean),sortKey=sortList.length&&!sortList.some(([key])=>key===s.sort)?sortList[0][0]:s.sort;
 const custom=sortList.find(([key])=>key===sortKey)?.[2];
 list=list.slice().sort(custom||SORTS[sortKey]||SORTS.newest);
 const sortChips=sortList.length>1?'<div class="dt-tabs" role="group" aria-label="Sort">'+sortList.map(([key,label])=>chip('sort',key,label,null,sortKey===key)).join('')+'</div>':'';
 return '<div class="vw" data-wall="'+esc(id)+'"'+(kind!=='video'?' data-kind="'+esc(kind)+'"':'')+'>'+(filterChips||sortChips?'<div class="vw-bar">'+filterChips+sortChips+'</div>':'')
  +(list.length?'<div class="vw-grid">'+list.slice(0,s.shown).map(i=>tile(id,i,esc,now,i.tileKind||kind)).join('')+'</div>':'<p class="dt-empty">'+esc(emptyText)+'</p>')
  +(list.length>s.shown?'<div class="vw-more"><button type="button" data-action="video-wall" data-id="'+esc(id+'|more|1')+'">Show more · '+(list.length-s.shown)+' left</button></div>':'')+'</div>';
}
// The same wall for images, PDFs, posts and documents (Phase 3.0): no play affordance, a dialog per item.
export function mediaWall(config){return videoWall({kind:'image',sorts:[],emptyText:'Nothing to show yet.',...config})}

// Player: the official embed beside the post's facts. Actions are passed in by the page (for example research).
export function playerHTML(item,{esc,link,actions='',now=Date.now()}){
 const src=embedURL(item),m=item.metrics||{},c=item.changes||{};
 const stat=(label,key)=>m[key]==null?'':'<div><dt>'+esc(label)+'</dt><dd>'+esc(compact(m[key]))+(c[key]>0?' <b class="vw-up">+'+esc(compact(c[key]))+'</b>':'')+'</dd></div>';
 return '<div class="vw-player"><div class="vw-frame'+(item.platform==='youtube'?' vw-frame--wide':'')+'">'+(src?'<iframe src="'+esc(src)+'" title="'+esc((PLATFORM[item.platform]||'Video')+' player')+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>':'<p class="dt-empty">This post cannot be embedded.</p>')+'</div>'
  +'<div class="vw-info"><p class="eyebrow">'+esc((PLATFORM[item.platform]||item.platform)+(item.kind?' · '+(KIND[item.kind]||item.kind):''))+'</p><h3>'+esc(item.creator||'')+'</h3>'
  +'<dl class="vw-stats">'+stat('Views','views')+stat('Likes','likes')+stat('Comments','comments')+stat('Shares','shares')+'</dl>'
  +'<p class="vw-when">Published '+esc(relativeTime(item.publishedAt,now)||'—')+(item.observedAt?' · checked '+esc(relativeTime(item.observedAt,now)):'')+'</p>'
  +(item.format?'<p class="vw-format">'+esc(item.format)+'</p>':'')
  +'<div class="vw-caption">'+esc(item.text||'No caption.')+'</div>'
  +'<div class="actions">'+(link(item.url,'Open on '+(PLATFORM[item.platform]||'source'))||'')+actions+'</div></div></div>';
}
