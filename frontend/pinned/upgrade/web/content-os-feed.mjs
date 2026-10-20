// Leon Content OS folded into the workspace (owner, 5 October 2026): no separate page. Its live news
// radar and recon ideas appear in Research, its watch suggestions in Competitors, its clip studio status
// in Production jobs and real conversion metrics in Social analytics. Everything here is read-only; the
// clip studio itself stays reachable from Production jobs for runs, uploads and setup.
import {dataTable,relativeTime,stagePill} from './data-table.mjs';

const BASE='/content-os/api/';
export async function contentOS(path,fetcher=globalThis.fetch){
 const r=await fetcher(BASE+path,{credentials:'same-origin',headers:{Accept:'application/json'}});
 if(!r.ok)throw new Error('Content OS answered '+r.status);
 return r.json();
}
const settle=p=>p.then(v=>v,()=>null);
// A slow Content OS must not hold a whole page (11 Oct 2026: 9-16 s stalls were seen on Production). With `wait`, the
// reads still out after that many ms resolve as null and the result is marked `late`; the requests themselves finish.
export const loadContentOS=(paths,fetcher,{wait}={})=>{const all=Promise.all(paths.map(p=>settle(contentOS(p,fetcher))));if(!wait)return all;let timer;return Promise.race([all,new Promise(r=>{timer=setTimeout(()=>r(Object.assign(paths.map(()=>null),{late:true})),wait)})]).finally(()=>clearTimeout(timer))};

const SOURCES={github_new_popular:'GitHub',github_trending:'GitHub',huggingface:'Hugging Face',hackernews:'Hacker News',official_openai:'OpenAI',other_official_announcements:'Official',x:'X',youtube:'YouTube'};
export const sourceLabel=s=>SOURCES[s]||String(s||'Other').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const human=v=>String(v||'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const slug=v=>String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-');
const has=(query,...values)=>!query||values.some(v=>String(v||'').toLowerCase().includes(query.toLowerCase()));
// "20260720-083446" → a date the owner can read.
export function stampDate(stamp){const m=/^(\d{4})(\d{2})(\d{2})/.exec(String(stamp||''));return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):''}

const offline=(esc,what)=>'<p class="dt-empty">'+esc(what)+' unavailable: Leon Content OS is not answering on this Mac.</p>';
const slow=(esc,what)=>'<p class="dt-empty">'+esc(what)+' is slow to answer right now. Refresh in a moment to see it.</p>';

export function newsRadar(news,{esc,link,query='',now=Date.now()}){
 if(!news)return offline(esc,'News radar');
 const rows=Object.values(news.cards||{}).filter(c=>has(query,c.title)).map(c=>({...c,label:sourceLabel(c.sources?.[0]),seen:Date.parse(c.first_seen_at)||0}));
 const groups=[...new Set(rows.map(r=>r.label))].sort();
 const sources=Object.values(news.sources||{}),healthy=sources.filter(s=>s.state==='ok').length;
 const note='<p class="source">Checked '+esc(relativeTime(news.last_check_at,now)||'not yet')+' · every '+esc(news.interval_minutes||15)+' min · '+healthy+' of '+sources.length+' sources healthy</p>';
 return note+dataTable({id:'news-radar',esc,rows,pageSize:12,defaultSort:{key:'seen',dir:'desc'},emptyText:'Nothing new on the radar.',
  tabs:groups.map(g=>({id:slug(g),label:g,filter:r=>r.label===g})),
  columns:[
   {key:'title',label:'Item',value:r=>r.title,className:'dt-primary',cell:r=>'<strong>'+(link(r.url,r.title)||esc(r.title))+'</strong><small>'+esc(r.sources?.map(sourceLabel).join(' · ')||'')+'</small>'},
   {key:'label',label:'Source',value:r=>r.label,cell:r=>stagePill(r.label,esc)},
   {key:'seen',label:'Seen',value:r=>r.seen,cell:r=>'<span class="dt-muted">'+esc(relativeTime(r.first_seen_at,now))+'</span>'},
  ]});
}

export function reconIdeas(recon,{esc,query=''}){
 if(!recon)return offline(esc,'Topic ideas');
 const rows=(recon.ideas||[]).filter(i=>has(query,i.hook,i.topic,i.hook_archetype));
 const c=recon.counts||{};
 const note='<p class="source">From the recon of '+esc(stampDate(recon.stamp)||'an earlier run')+' · '+esc(c.posts??'?')+' posts scanned · '+esc(c.prime??'?')+' prime</p>';
 return note+dataTable({id:'recon-ideas',esc,rows,pageSize:10,emptyText:'No ideas in the latest recon.',
  tabs:[...new Set(rows.map(r=>r.hook_archetype).filter(Boolean))].map(a=>({id:slug(a),label:human(a),filter:r=>r.hook_archetype===a})),
  columns:[
   {key:'hook',label:'Hook',value:r=>r.hook,className:'dt-primary',cell:r=>'<strong>'+esc(r.hook||r.topic)+'</strong><small>'+esc(r.topic||'')+'</small>'},
   {key:'angle',label:'Angle',value:r=>r.hook_archetype,cell:r=>stagePill(human(r.hook_archetype||'—'),esc)},
   {key:'proof',label:'Proof',value:r=>r.proof_device,cell:r=>'<span class="dt-muted">'+esc(human(r.proof_device||''))+'</span>'},
  ]});
}

const PROFILE={instagram:h=>'https://www.instagram.com/'+h+'/',tiktok:h=>'https://www.tiktok.com/@'+h,youtube:h=>'https://www.youtube.com/@'+h};
export function watchSuggestions(data,{esc,link,query=''}){
 if(!data)return offline(esc,'Suggestions');
 const rows=(data.suggestions||[]).filter(s=>has(query,s.handle,s.label,s.why,s.platform));
 return dataTable({id:'watch-suggestions',esc,rows,pageSize:10,emptyText:'No suggestions right now.',
  tabs:[...new Set(rows.map(r=>r.platform))].map(p=>({id:slug(p),label:human(p),filter:r=>r.platform===p})),
  columns:[
   {key:'handle',label:'Account',value:r=>r.label||r.handle,className:'dt-primary',cell:r=>{const h=String(r.handle||'').replace(/^@/,''),url=PROFILE[r.platform]?.(encodeURIComponent(h));return '<strong>'+esc(r.label||r.handle)+'</strong><small>'+(url?link(url,r.handle):esc(r.handle||''))+'</small>'}},
   {key:'why',label:'Why watch',value:r=>r.why,cell:r=>'<span class="dt-clip">'+esc(r.why||'')+'</span>'},
   {key:'state',label:'Status',value:r=>r.already_added?1:0,cell:r=>stagePill(r.already_added?'Watching':'Suggested',esc)},
  ]});
}

// Setup steps the clip studio needs before it can pull and cut on its own.
export function clipStudioSetup(connect,services){
 return [
  {label:'Instagram',done:Boolean(connect?.instagram_connected)},
  {label:'YouTube',done:Boolean(connect?.youtube_connected)},
  {label:'Apify',done:Boolean(services?.apify_set)},
  {label:'GitHub',done:Boolean(services?.github_set)},
 ];
}
export function clipStudio(results,{esc,number=String}){
 const [runs,today,board,connect,services]=results;
 if(!runs&&!connect)return results.late?slow(esc,'Clip studio'):offline(esc,'Clip studio');
 const steps=clipStudioSetup(connect,services),done=steps.filter(s=>s.done).length,list=runs?.runs||[];
 const stat=(label,value,sub)=>'<article class="metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(sub)+'</span></article>';
 return '<div class="metrics">'
  +stat('Studio runs',number(list.length),list.length?'Latest '+(relativeTime(list[0]?.created_at||list[0]?.started_at)||'run'):'No runs yet')
  +stat('Spend today','€'+(runs?.spend_today??'0.00'),'Alert at €'+(runs?.spend_alert??'—')+' · stops at €'+(runs?.spend_kill??'—'))
  +stat('Daily brief',today?.generated?number(today.day?.scripts?.length||0)+' scripts':'Not generated',today?.schedule?.auto_enabled?'Runs automatically':'Manual')
  +stat('Board',number(board?.counts?.active??0)+' active',number(board?.counts?.posted??0)+' posted')
  +'</div><div class="setup-list" role="list" aria-label="Clip studio setup">'
  +steps.map(s=>'<span role="listitem" class="setup-step" data-done="'+s.done+'"><i aria-hidden="true">'+(s.done?'✓':'')+'</i>'+esc(s.label)+'</span>').join('')
  +'<small>'+done+' of '+steps.length+' connected</small></div>'
  +'<div class="actions"><button type="button" data-action="section" data-id="leoncontent">Open clip studio →</button></div>';
}

// Conversion metrics only when they are measured: the source falls back to sample data otherwise.
export function conversionWinners(metrics,{esc,number=String}){
 if(!metrics||metrics.source==='sample'||!metrics.summary?.winners?.length)return '';
 const rows=metrics.summary.winners;
 return dataTable({id:'conversion-winners',esc,rows,pageSize:10,defaultSort:{key:'signups',dir:'desc'},columns:[
  {key:'topic',label:'Topic',value:r=>r.topic_tag,className:'dt-primary',cell:r=>'<strong>'+esc(human(r.topic_tag))+'</strong><small>'+esc(human(String(r.hook_id||'').replace(/^h_/,'')))+'</small>'},
  {key:'signups',label:'Sign-ups',value:r=>r.signups,cell:r=>esc(number(r.signups))},
  {key:'reach',label:'Reach',value:r=>r.reach,cell:r=>esc(number(r.reach))},
  {key:'saves',label:'Saves',value:r=>r.saves,cell:r=>esc(number(r.saves))},
  {key:'posts',label:'Posts',value:r=>r.posts,cell:r=>esc(number(r.posts))},
 ]})+(metrics.summary.notes?'<p class="source">'+esc(metrics.summary.notes)+'</p>':'');
}
