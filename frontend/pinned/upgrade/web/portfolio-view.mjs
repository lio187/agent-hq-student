// Client Delivery → Client performance (Departments batch 2, 7 Oct 2026): the approved 22 Sep 2026 owner snapshot
// on the shared page kit (age badge, tiles, growth and volume charts, one sortable table per tab, a creatives wall
// behind the preview gate, detail dialogs) plus the Wealth Kings CRM block (moved here from Overview and Leads).
// Snapshot-only: no provider calls or mutations; currencies are never added together. This module stays small (main
// bundle): state, listeners and the tested helpers; the page builders are a lazy chunk (portfolio-page.mjs).

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function comparisonBars(row){
 if(!finite(row.current)||!finite(row.previous)||row.current<0||row.previous<0)return '<span>No comparable bars</span>';
 const max=Math.max(row.current,row.previous,1);
 return `<div class="portfolio-bars" role="img" aria-label="${esc(`${row.currency}: previous ${num(row.previous)}, current ${num(row.current)}. Scale applies to this brand only.`)}"><span class="previous" style="width:${row.previous/max*100}%"></span><span class="current" style="width:${row.current/max*100}%"></span></div>`;
}
export function eventStreamRows(metrics){
 return (metrics||[]).map(m=>{
  const c=m.current||{},p=m.previous||{},complete=c.complete===true&&p.complete===true;
  const growth=(a,b)=>complete&&finite(a)&&finite(b)&&b>0?(a/b-1)*100:null;
  const perEvent=x=>x.complete===true&&finite(x.event_value)&&finite(x.event_count)&&x.event_count>0?x.event_value/x.event_count:null;
  return {integration:m.integration,current:complete?c.event_value:null,previous:complete?p.event_value:null,
   growth:growth(c.event_value,p.event_value),count:c.event_count,previous_count:p.event_count,
   event_growth:growth(c.event_count,p.event_count),per_event:perEvent(c),previous_per_event:perEvent(p)};
 });
}
export function previewURL(value){
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='scontent.fdps8-1.fna.fbcdn.net'&&!url.username&&!url.password&&!url.port?url.href:null}catch{return null}
}
// Kept for callers and tests: an escaped definition list of any nested value (no longer used on the page).
export function metricTree(value){
 if(value==null||typeof value!=='object')return esc(value??'—');
 if(Array.isArray(value))return value.map((row,i)=>`<details><summary>Record ${i+1}</summary>${metricTree(row)}</details>`).join('')||'<p>No records.</p>';
 return `<dl>${Object.entries(value).map(([k,v])=>`<dt>${esc(k.replaceAll('_',' '))}</dt><dd>${metricTree(v)}</dd>`).join('')}</dl>`;
}
export function performanceSelection(data,selection){
 const rows=data.performance.filter(r=>r.scope===selection.scope&&r.source===selection.source&&r.complete);
 const currencies=[...new Set(rows.map(r=>r.currency))].sort();
 // Absolute monetary ranking is never performed across currencies.
 const currency=selection.sort==='current'&&selection.currency==='all'?(currencies.includes('USD')?'USD':currencies[0]):selection.currency;
 const visible=rows.filter(r=>(currency==='all'||r.currency===currency)&&`${r.brand} ${r.owner}`.toLowerCase().includes(selection.search.toLowerCase()));
 visible.sort((a,b)=>selection.sort==='name'?a.brand.localeCompare(b.brand):(b[selection.sort]??-Infinity)-(a[selection.sort]??-Infinity));
 return {visible,currency,currencies};
}

// --- Client CRM · Wealth Kings (moved from Overview and Leads, Phase 3.1; built out in batch 2) --------------
// Payments and signed contracts per month come from the same read-only route with a month as the period
// (the server sums the cached snapshot; nothing new is fetched from Hermon in the request path).
export function crmMonths(now=Date.now(),count=6){
 const out=[],d=new Date(now);
 for(let k=count-1;k>=0;k--){const first=new Date(d.getFullYear(),d.getMonth()-k,1),last=k?new Date(d.getFullYear(),d.getMonth()-k+1,0):d;
  const iso=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
  out.push({from:iso(first),to:iso(last),label:first.toLocaleDateString('en-GB',{month:'short'})+(k?'':' (to date)'),partial:!k})}
 return out;
}
export async function crmMonthly(api,{now=Date.now(),count=6,currency='EUR'}={}){
 const months=crmMonths(now,count);
 const answers=await Promise.all(months.map(m=>api('workspace/crm?'+new URLSearchParams({from:m.from,to:m.to,currency})).catch(error=>({error:error.message}))));
 return months.map((m,i)=>({...m,accounts:answers[i]?.accounts||[],error:answers[i]?.error||null}));
}
export function createPortfolioView({api,root,filters,refresh,getSerial,preview=null}){
 const st={data:null,tab:'performance',selection:{scope:'Direct clients',source:'Shopify orders',currency:'all',sort:'growth',search:''},client:'',managed:'',query:'',previews:false};
 let page=null;const load=async()=>page??=await import('./portfolio-page.mjs');
 root.addEventListener('change',e=>{const key=e.target.dataset?.portfolio;if(!key)return;if(key in st.selection){st.selection[key]=e.target.value;if(key==='scope'){st.selection.currency='all';st.selection.sort='growth'}}else if(key==='client')st.client=e.target.value;else if(key==='managed')st.managed=e.target.value;else if(key==='query')st.query=e.target.value;refresh()});
 root.addEventListener('click',e=>{
  const button=e.target.closest('[data-portfolio-tab]');if(button){st.tab=button.dataset.portfolioTab;st.query='';refresh();return}
  if(e.target.closest('[data-portfolio-previews]')){st.previews=true;refresh();return}
  const open=e.target.closest('[data-portfolio-detail]');if(open&&st.data&&page&&preview){const d=page.portfolioPage(st).detail(open.dataset.portfolioDetail);if(d)preview(d.title,d.html)}
 });
 root.addEventListener('error',e=>{if(e.target.matches?.('.portfolio-preview')){e.target.hidden=true;if(e.target.nextElementSibling)e.target.nextElementSibling.hidden=false}},true);
 // The Wealth Kings CRM block (wired by the page): current-period answer + six monthly reads of the same route.
 return {async view(){const ticket=getSerial();const [result,p]=await Promise.all([api('workspace/portfolio'),load()]);if(ticket!==getSerial())return '';st.data=result;filters('');return p.portfolioPage(st).draw()},
  detail:raw=>page&&st.data?page.portfolioPage(st).detail(raw):null,
  crm:(answer,monthly)=>page?page.crmSection(answer,monthly):'',crmMonthly:()=>crmMonthly(api)};
}
