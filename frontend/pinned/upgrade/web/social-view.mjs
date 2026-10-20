// Social analytics (5 October 2026): an account comparison table instead of raw metric names, one clear
// sync banner, audience bars and a sortable post table. Instagram CDN links expire (their `oe` parameter),
// so expired thumbnails show a tile instead of a broken image. Pure rendering; data comes from Team Hub.
import {label} from './labels.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {sparkline} from './viz.mjs';
import {syncMessage} from './freshness.mjs';

const DAY=86400000;
export function cdnExpired(url,now=Date.now()){
 try{const oe=new URL(url).searchParams.get('oe');if(!oe)return false;const t=parseInt(oe,16)*1000;return !Number.isFinite(t)||t<=now}catch{return true}
}
const CDN=/(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
// The thumbnail URL when it is an https Instagram/Facebook CDN link that has not expired; otherwise ''
// (the caller shows a text tile). Payloads name it thumbnailUrl, thumbUrl or thumb.
export function thumbURL(p,now=Date.now()){
 // HQ's own copy first (kept after the Instagram link expires), then a live CDN link (9 Oct 2026).
 if(p?.thumbCached&&typeof p.id==='string'&&p.id)return '/api/hq/v1/workspace/social/media?id='+encodeURIComponent(p.id);
 try{const u=new URL(p?.thumbnailUrl||p?.thumbUrl||p?.thumb||'');if(u.protocol==='https:'&&CDN.test(u.hostname)&&!cdnExpired(u.href,now))return u.href}catch{}
 return '';
}
export function thumb(p,esc,now=Date.now()){
 const url=thumbURL(p,now);if(url)return '<img loading="lazy" referrerpolicy="no-referrer" src="'+esc(url)+'" alt="">';
 return '<span class="thumb-fallback" data-kind="'+esc(p.mediaType||'post')+'" aria-hidden="true"></span>';
}
// The first real sentence: skip link lines and "Check out X:" lead-ins that YouTube descriptions open with.
export const headline=(text,max=96)=>{
 const raw=String(text||'').split(/\n+/),clean=l=>l.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim(),letters=l=>l.replace(/[^\p{L}\p{N}]/gu,'').length;
 const line=raw.filter(l=>!/https?:\/\//.test(l)).map(clean).find(l=>!/:$/.test(l)&&l.split(' ').length>=4&&letters(l)>=12)||raw.map(clean).find(l=>letters(l)>=8)||'';
 return line.length>max?line.slice(0,max-1).trimEnd()+'…':line;
};
const latest=(rows,accountId,metric)=>rows.filter(m=>m.accountId===accountId&&m.metric===metric).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
const shortDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})};
export const periodText=p=>{const [a,b]=String(p||'').split(/\s+[—–-]\s+/);return a&&b?shortDate(a)+' – '+shortDate(b):''};
const healthy=a=>Boolean(a.health?.status==='healthy'||a.health?.canFetchAnalytics);

export function accountRows(d,selection={account:'all'}){
 const m=d.accountMetrics||[];
 return (d.accounts||[]).filter(a=>selection.account==='all'||a.id===selection.account).map(a=>{
  const v=k=>latest(m,a.id,k)?.value;
  const reach=v('reach'),interactions=v('total_interactions');
  return {id:a.id,handle:a.handle||'@'+a.id,name:a.name,ok:healthy(a),health:a.health?.message||'',
   followers:v('follower_count')??a.followers??null,views:v('views'),reach,interactions,saves:v('saves'),shares:v('shares'),gained:v('followers_gained'),
   engagement:reach&&interactions!=null?interactions/reach:null,period:latest(m,a.id,'reach')?.period||latest(m,a.id,'views')?.period||''};
 });
}

export function syncBanner(sync,{esc,now=Date.now()}){
 const at=Date.parse(sync?.lastSuccessAt||''),age=Number.isFinite(at)?now-at:Infinity,stale=age>2*DAY;
 const parts=String(sync?.message||'').split(/\s*·\s*/).map(syncMessage).filter(Boolean);
 return '<div class="sync-banner" data-tone="'+(stale||sync?.status!=='ok'?'attention':'calm')+'"><span class="today-dot" aria-hidden="true"></span><div><strong>'
  +(Number.isFinite(at)?(rel=>/ago$|just now/.test(rel)?'Last synced '+esc(rel)+' · '+esc(shortDate(at)):'Last synced on '+esc(rel))(relativeTime(at,now)):'Never synced')+'</strong><small>'+esc(parts.join(' · ')||sync?.status||'')
  +(stale?' · Newer numbers arrive after the next Team Hub sync.':'')+'</small></div></div>';
}

export function kpiStrip(rows,{esc,number,asOf=null}){
 const live=rows.filter(r=>r.ok),sum=k=>live.reduce((t,r)=>t+(Number(r[k])||0),0);
 // A metric no connected account reported in this period shows "—", never a measured-looking 0 (Phase 3.3).
 const measured=k=>live.some(r=>r[k]!=null&&r[k]!==''),value=k=>measured(k)?number(sum(k)):'—';
 const period=periodText(live.find(r=>r.period)?.period),none='Not measured in this period';
 const stat=(label,value,sub='')=>'<article class="metric"><small>'+esc(label)+'</small><strong data-count="'+esc(label)+'">'+esc(value)+'</strong><span>'+esc(sub)+'</span></article>';
 return '<div class="metrics">'+stat('Views',value('views'),measured('views')?period:none)+stat('Reach',value('reach'),measured('reach')?period:none)+stat('Interactions',value('interactions'),measured('interactions')?'Likes, comments, saves, shares':none)
  +stat('Followers',value('followers'),(measured('gained')?'+'+number(sum('gained'))+' new':'Latest count per account')+(Number.isFinite(Date.parse(asOf||''))?' · as of '+shortDate(Date.parse(asOf)):''))+'</div>';
}

export function accountsTable(rows,{esc,number}){
 const n=v=>v==null?'<span class="dt-muted">—</span>':esc(number(v));
 return dataTable({id:'social-accounts',esc,rows,pageSize:10,defaultSort:{key:'views',dir:'desc'},columns:[
  {key:'handle',label:'Account',value:r=>r.handle,className:'dt-primary',cell:r=>'<strong>'+esc(r.handle)+'</strong><small>'+esc(r.ok?(r.name||'')+(r.period?' · '+periodText(r.period):''):r.health)+'</small>'},
  {key:'state',label:'Status',value:r=>r.ok?1:0,cell:r=>stagePill(r.ok?'Connected':'Reconnect',esc)},
  {key:'followers',label:'Followers',value:r=>r.followers,cell:r=>n(r.followers)},
  {key:'views',label:'Views',value:r=>r.ok?r.views:null,cell:r=>n(r.ok?r.views:null)},
  {key:'reach',label:'Reach',value:r=>r.ok?r.reach:null,cell:r=>n(r.ok?r.reach:null)},
  {key:'interactions',label:'Interactions',value:r=>r.ok?r.interactions:null,cell:r=>n(r.ok?r.interactions:null)},
  {key:'engagement',label:'Per reach',value:r=>r.ok?r.engagement:null,cell:r=>r.ok&&r.engagement!=null?esc((r.engagement*100).toFixed(1)+'%'):'<span class="dt-muted">—</span>'},
 ]});
}

// Trends per account (6 Oct 2026): daily reach and follower count as measured by the source, oldest first.
export function metricSeries(d,accountId,metric){
 const by=new Map();for(const m of d.accountMetrics||[])if(m.accountId===accountId&&m.metric===metric&&/^\d{4}-\d{2}-\d{2}$/.test(m.date||''))by.set(m.date,Number(m.value)||0);
 return [...by].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}),value}));
}
export function accountTrends(d,rows,{esc,number}){
 const blocks=rows.filter(r=>r.ok).map(r=>{const reach=metricSeries(d,r.id,'reach'),followers=metricSeries(d,r.id,'follower_count');
  const cell=(title,series)=>{const spark=sparkline(series,{esc,label:r.handle+' '+title.toLowerCase()+' per day',format:number});return spark?'<div class="trend-cell"><small>'+esc(title)+' · '+series.length+' days</small><strong>'+esc(number(series.at(-1).value))+'</strong>'+spark+'</div>':''};
  const cells=cell('Daily reach',reach)+cell('Followers',followers);
  return cells?'<div class="trend-row"><div class="trend-who"><strong>'+esc(r.handle)+'</strong><small>'+esc(r.name||'')+'</small></div>'+cells+'</div>':''}).join('');
 return blocks?'<div class="trend-list">'+blocks+'</div>':'';
}

// Audience: counts per label ("age: 25-34", "city: Amsterdam, …"), summed over the selected accounts.
export function audience(d,rows,{esc,number}){
 const ids=new Set(rows.filter(r=>r.ok).map(r=>r.id)),groups=new Map();
 for(const m of d.accountMetrics||[]){
  if(m.metric!=='demographics'||!ids.has(m.accountId))continue;
  const at=String(m.label).indexOf(':');if(at<1)continue;
  const group=m.label.slice(0,at).trim(),key=m.label.slice(at+1).trim().replace(/,.*$/,'');
  if(!groups.has(group))groups.set(group,new Map());const g=groups.get(group);g.set(key,(g.get(key)||0)+(Number(m.value)||0));
 }
 if(!groups.size)return '';
 const order=['age','gender','country','city'],titles={age:'Age',gender:'Gender',country:'Countries',city:'Cities'};
 return '<div class="bar-groups">'+[...groups].sort((a,b)=>(order.indexOf(a[0])+99)%99-(order.indexOf(b[0])+99)%99).map(([group,map])=>{
  let items=[...map];items=group==='age'?items.sort((a,b)=>a[0].localeCompare(b[0],'en',{numeric:true})):items.sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max=Math.max(...items.map(i=>i[1]),1);
  return '<div class="bar-list"><h3>'+esc(titles[group]||group)+'</h3>'+items.map(([k,v])=>'<div class="bar-row"><span class="bar" style="--w:'+Math.round(v/max*100)+'%"></span><span>'+esc(k)+'</span><b>'+esc(number(v))+'</b></div>').join('')+'</div>';
 }).join('')+'</div>';
}

export function postsTable(d,selection,{esc,number,link,query='',now=Date.now()}){
 const accounts=d.accounts||[],handle=id=>accounts.find(a=>a.id===id)?.handle||'@'+id;
 const metric=(p,k)=>p[k]??p.metrics?.[k];
 const list=(d.posts||[]).filter(p=>selection.account==='all'||p.accountId===selection.account).filter(p=>!query||String(p.caption||p.title||'').toLowerCase().includes(query.toLowerCase()));
 const ids=[...new Set(list.map(p=>p.accountId))];
 const num=k=>({key:k,label:k[0].toUpperCase()+k.slice(1),value:p=>metric(p,k),cell:p=>esc(number(metric(p,k)))});
 return dataTable({id:'social-posts',esc,rows:list,pageSize:15,defaultSort:{key:'published',dir:'desc'},emptyText:'No posts in this view.',
  tabs:ids.length>1?ids.map(id=>({id,label:handle(id),filter:p=>p.accountId===id})):undefined,
  columns:[
   {key:'post',label:'Post',value:p=>headline(p.caption||p.title),className:'dt-post',cell:p=>'<span class="post-thumb">'+thumb(p,esc,now)+'</span><span class="dt-primary"><strong>'+(link(p.permalink||p.url,headline(p.caption||p.title)||'Post')||esc(headline(p.caption||p.title)||'Post'))+'</strong><small>'+esc(handle(p.accountId)+' · '+(label(p.mediaType)||'Post'))+'</small></span>'},
   {key:'published',label:'Published',value:p=>Date.parse(p.publishedAt)||0,cell:p=>'<span class="dt-muted">'+esc(relativeTime(p.publishedAt,now))+'</span>'},
   num('views'),num('reach'),num('likes'),num('comments'),num('saves'),num('shares'),
  ]});
}

// Team Hub's performance map is rendered by its own module (Dutch); the office shows it in English.
const MAP_LABELS=[['PRESTATIEKAART · JEV-LABELS','PERFORMANCE MAP · JEV LABELS'],['Welke hook en structuur winnen per account','Which hook and structure win per account'],
 ['Mediaan views','Median views'],['Nog geen labels op eigen posts','No labels on your own posts yet'],['kleine steekproef','small sample'],['Saves / 1.000','Saves / 1,000'],
 ['Hookmechanisme','Hook mechanism'],['Onderwerp','Topic'],['Structuur','Structure']];
export function englishMap(html){let out=String(html||'');for(const [nl,en] of MAP_LABELS)out=out.split(nl).join(en);return out}
