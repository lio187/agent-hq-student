// Competitors (5 October 2026): a sortable post table with the creator, a clean headline instead of the
// raw description, reach and the change since the previous collection; collection health per platform;
// the tracked roster with per-platform state. Pure rendering; data comes from the competitor collector.
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {headline} from './social-view.mjs';
import {statusBar} from './viz.mjs';

const PLATFORM={youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok',x:'X',linkedin:'LinkedIn'};
export const platformLabel=p=>PLATFORM[p]||String(p||'Other');
const delta=(v,number)=>!v?'':'<small class="delta" data-dir="'+(v>0?'up':'down')+'">'+(v>0?'+':'−')+number(Math.abs(v))+'</small>';

export function competitorPosts(d,{esc,number,link,query='',now=Date.now()}){
 const names=new Map((d.roster||[]).map(r=>[r.slug,r.name]));
 const rows=(d.posts||[]).map(p=>({...p,creator:names.get(p.slug)||p.slug,headline:headline(p.text)||'Untitled post'})).filter(p=>!query||[p.creator,p.text,p.platform].some(v=>String(v||'').toLowerCase().includes(query.toLowerCase())));
 const platforms=[...new Set(rows.map(r=>r.platform))];
 const num=(k,label)=>({key:k,label,value:p=>p.metrics?.[k],cell:p=>'<span class="dt-num">'+esc(number(p.metrics?.[k]))+delta(p.changes?.[k],number)+'</span>'});
 return dataTable({id:'competitor-posts',esc,rows,pageSize:15,defaultSort:{key:'views',dir:'desc'},emptyText:'No observed posts in this view.',
  tabs:platforms.length>1?platforms.map(p=>({id:p,label:platformLabel(p),filter:r=>r.platform===p})):undefined,
  columns:[
   {key:'creator',label:'Post',value:p=>p.creator,className:'dt-primary',cell:p=>'<strong>'+esc(p.creator)+'</strong><small>'+(link(p.url,p.headline)||esc(p.headline))+'</small>'},
   {key:'platform',label:'Platform',value:p=>p.platform,cell:p=>stagePill(platformLabel(p.platform),esc)},
   {key:'published',label:'Published',value:p=>Date.parse(p.published_at)||0,cell:p=>'<span class="dt-muted">'+esc(relativeTime(p.published_at,now))+'</span>'},
   num('views','Views'),num('likes','Likes'),num('comments','Comments'),
   {key:'use',label:'',cell:p=>'<button type="button" class="dt-action" data-action="competitor-research" data-id="'+esc(p.id)+'">Use in research</button>'},
  ]});
}

// Why the last collection did not complete, in plain words.
export function collectionProblem(reason){
 const r=String(reason||'');if(!r||/identified/.test(r))return '';
 if(/Cannot connect to host|nodename nor servname|getaddrinfo|timed? ?out/i.test(r))return 'Last run could not reach Apify (no network at run time)';
 if(/budget|limit|cap/i.test(r))return 'Paused by the spend limit';
 return r.length>90?r.slice(0,89)+'…':r;
}
// Collection health per platform (21st "health rows" pattern).
export function collectionHealth(d,{esc,now=Date.now()}){
 const rows=d.coverage||[];if(!rows.length)return '';
 const problems=[...new Set(rows.map(c=>collectionProblem(c.reason)).filter(Boolean))];
 return '<div class="health-rows">'+rows.map(c=>{const n=/(\d+) identified/.exec(c.reason||'')?.[1];return '<div class="health-row" data-state="'+esc(c.state)+'"><span class="today-dot" aria-hidden="true"></span><strong>'+esc(platformLabel(c.platform))+'</strong><small>'+esc((n?n+' found in the last run · ':c.state!=='current'?c.state+' · ':'')+(c.last_success?'last collected '+relativeTime(c.last_success,now):'never collected'))+'</small></div>'}).join('')+'</div>'
  +(problems.length?'<p class="source" data-tone="attention">'+esc(problems.join(' · '))+'. Posts below are from the last successful run; the next daily run retries automatically.</p>':'');
}

export function competitorRoster(d,{esc,link,query=''}){
 const rows=(d.roster||[]).filter(r=>!query||[r.name,r.category].some(v=>String(v||'').toLowerCase().includes(query.toLowerCase())));
 const current=r=>(r.profiles||[]).filter(p=>p.state==='current').length;
 return dataTable({id:'competitor-roster',esc,rows,pageSize:20,defaultSort:{key:'current',dir:'desc'},emptyText:'No tracked profiles match.',
  tabs:[...new Set(rows.map(r=>r.category).filter(Boolean))].map(c=>({id:c,label:c[0].toUpperCase()+c.slice(1),filter:r=>r.category===c})),
  columns:[
   {key:'name',label:'Profile',value:r=>r.name,className:'dt-primary',cell:r=>'<strong>'+esc(r.name)+'</strong><small>'+esc(r.category||'')+'</small>'},
   {key:'current',label:'Collected',value:current,cell:r=>esc(current(r)+' of '+(r.profiles||[]).length)},
   {key:'profiles',label:'Platforms',cell:r=>'<span class="platform-dots">'+(r.profiles||[]).map(p=>'<span data-state="'+esc(p.state)+'" title="'+esc(platformLabel(p.platform)+': '+p.state)+'">'+(link(p.url,platformLabel(p.platform))||esc(platformLabel(p.platform)))+'</span>').join('')+'</span>'},
  ]});
}

// Collection history (7 Oct 2026): the daily run per platform over the last 30 days, from collection_runs.
const RUN_TONE={collected:'live',incomplete:'warn',frozen:'error',none:'idle'};
const RUN_WORD={collected:'collected',incomplete:'started, no result recorded',frozen:'frozen by the spend bound',none:'no run'};
export function collectionHistory(d,{esc}){
 const h=d?.history;if(!h?.platforms)return '';
 const day=v=>new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
 const rows=Object.entries(h.platforms).map(([platform,days])=>{const ok=days.filter(x=>x.status==='collected').length;
  return {label:platformLabel(platform),summary:ok+' of '+days.length+' days collected',days:days.map(x=>({date:x.date,tone:RUN_TONE[x.status]||'idle',title:day(x.date)+' · '+(RUN_WORD[x.status]||x.status)+(x.posts!=null?' · '+x.posts+' posts':'')+(x.cents!=null?' · $'+(x.cents/100).toFixed(2):'')}))}});
 return '<section class="surface pk-chart"><div class="section-head"><h2>Collection history</h2><span class="pk-meta">'+esc(day(h.from)+' – '+day(h.to))+' · one bar per day</span></div>'
  +statusBar(rows,{esc,legend:[['live','Collected'],['warn','Started, no result'],['error','Frozen'],['idle','No run']]})+'<p class="viz-note">From the local collection log. Hover a day for posts found and cost.</p></section>';
}
