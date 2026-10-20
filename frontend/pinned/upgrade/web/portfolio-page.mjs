// Client Delivery → Client performance page builders (lazy chunk, Departments batch 2, 7 Oct 2026). The factory in
// portfolio-view.mjs keeps the state object `st` ({data,tab,selection,client,managed,query,previews}) and the listeners;
// everything here renders from it. Currencies are never added together; SHA strings only in the Sources details.
import {tileRow,chartBand,panel,statusRows,freshness,dayLabel,detailDialog,sourceDetails,mediaWall,parseAt} from './page-kit.mjs';
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import {signedBars,barList,columns} from './viz.mjs';
import {comparisonBars,eventStreamRows,previewURL,performanceSelection} from './portfolio-view.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(v);
const int=v=>v==null?'—':new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(v);
const pct=v=>v==null?'—':`${v>=0?'+':''}${num(v)}%`;
const money=(v,currency)=>v==null||!Number.isFinite(Number(v))?'—':new Intl.NumberFormat('en-GB',{style:'currency',currency,maximumFractionDigits:0}).format(v);
const link=(url,label)=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:''}catch{return ''}};
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const numCell=(v,f=num)=>`<span class="dt-num">${esc(f(v))}</span>`;
const growthCell=v=>`<span class="dt-num"${finite(v)&&v<0?' data-sign="neg"':''}>${esc(pct(v))}</span>`;

// Tiles and charts for the whole snapshot (growth is a percentage per brand, in that brand's own currency).
export function portfolioTiles(data,{now=Date.now()}={}){
 const done=(data.performance||[]).filter(r=>r.complete&&finite(r.growth)),f=freshness(data.generated_at,{now});
 return tileRow([
  {label:'Brands measured',value:done.length,caption:'Complete current and previous aggregates',age:f.age},
  {label:'Growing',value:done.filter(r=>r.growth>0).length,caption:'Brands up on the previous period'},
  {label:'Declining',value:done.filter(r=>r.growth<0).length,caption:'Brands down on the previous period'},
  {label:'Client groups',value:(data.client_groups||[]).length,caption:'Direct clients and groups in the audit'},
  {label:'Managed accounts',value:(data.managed_details||[]).length,caption:'Agency-managed Klaviyo accounts'},
  {label:'Creatives',value:(data.creatives||[]).length,caption:'Meta ads with recorded spend (USD)'},
 ],{esc,number:String});
}
export function portfolioCharts(data,selection){
 const rows=(data.performance||[]).filter(r=>r.complete&&r.scope===selection.scope&&r.source===selection.source);
 const growth=signedBars(rows.filter(r=>finite(r.growth)).map(r=>({label:r.brand,value:r.growth,note:r.currency+' · '+num(r.previous)+' → '+num(r.current)})),{esc,format:pct,label:'Growth by brand',max:12});
 const volume=barList(rows.map(r=>({label:r.brand,value:Number(r.count)||0,note:'previous '+int(r.previous_count)})),{esc,format:int,max:12,label:'Events or orders by brand'});
 return chartBand({title:'Growth by brand',meta:selection.scope+' · '+selection.source,body:growth,note:'Current vs previous period, per brand in its own currency. Shopify order value is not net revenue; Klaviyo events are a proxy.',empty:'No brand has a comparable growth figure for this selection.'},
  {title:'Events or orders by brand',meta:'current period',body:volume,note:'Counts, not money; integrations can overlap.',empty:'No counts for this selection.'},{esc});
}

// Managed account report → dialog sections (no nested dumps: known fields first, the rest flattened as text).
export function reportDialog(account,report){
 const m=report?.metrics||{},flows=m.flows||{},deliver=m.deliverability||{},sub=m.subscriber_conversion||{},rate=v=>finite(v)?num(v<=1?v*100:v)+'%':v;
 const flowTable=(flows.top_flows||[]).length?'<table class="dt-table pk-mini"><thead><tr><th scope="col">Flow</th><th scope="col">Sends</th><th scope="col">Revenue</th></tr></thead><tbody>'+flows.top_flows.map(f=>'<tr><td>'+esc(f.name)+'</td><td class="dt-num">'+esc(int(f.volume))+'</td><td class="dt-num">'+esc(num(f.revenue))+'</td></tr>').join('')+'</tbody></table>':'';
 const campaigns=(m.campaigns||[]).length?'<table class="dt-table pk-mini"><thead><tr><th scope="col">Campaign</th><th scope="col">Date</th><th scope="col">Recipients</th><th scope="col">Open</th><th scope="col">Click</th><th scope="col">Revenue</th></tr></thead><tbody>'+m.campaigns.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.date||'—')+'</td><td class="dt-num">'+esc(int(c.recipients))+'</td><td class="dt-num">'+esc(rate(c.open_rate))+'</td><td class="dt-num">'+esc(rate(c.click_rate))+'</td><td class="dt-num">'+esc(num(c.revenue))+'</td></tr>').join('')+'</tbody></table>':'';
 return detailDialog([
  {title:'Report',fields:[['Account',account?.name],['Window',report?.window],['Period',report?.period],['Review status',report?.review_status],['Stored',report?.created_at?dayLabel(report.created_at):null],['Revenue ('+(account?.currency||'source currency')+')',finite(m.revenue)?num(m.revenue):null],['Orders',finite(m.orders)?int(m.orders):null],['Average order value',finite(m.aov)?num(m.aov):null]]},
  {title:'Deliverability',fields:[['Received',finite(deliver.received)?int(deliver.received):null],['Open rate',rate(deliver.open_rate)],['Click rate',rate(deliver.click_rate)],['Bounce rate',rate(deliver.bounce_rate)],['Spam rate',rate(deliver.spam_rate)],['Reputation',deliver.reputation],['List growth',deliver.list_growth]]},
  Object.keys(sub).length?{title:'Subscriber conversion',fields:Object.entries(sub).map(([k,v])=>[k.replaceAll('_',' ').replace(/^\w/,c=>c.toUpperCase()),v])}:null,
  flowTable||flows.note?{title:'Flows'+(flows.total_volume!=null?' · '+int(flows.total_volume)+' sends':''),html:flowTable,note:flows.note}:null,
  campaigns?{title:'Campaigns',html:campaigns}:null,
 ],{esc,lead:'Stored historical report; not a fresh campaign export. Units follow the source; rates are shown as percentages.'});
}

export const TABS=[['performance','Performance'],['clients','Clients'],['managed','Managed accounts'],['payments','Payments'],['ads','Ads'],['coverage','Coverage'],['assets','Creatives'],['sources','Sources']];
export function portfolioPage(st){
 const options=(values,selected)=>values.map(([v,label])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(label)}</option>`).join('');
 const select=(key,label,values,value)=>`<label>${esc(label)}<select data-portfolio="${key}">${options(values,value)}</select></label>`;
 const search=(key,label,value)=>`<label class="search">${esc(label)}<input type="search" data-portfolio="${key}" value="${esc(value)}"></label>`;
 const definitions='<p class="pk-note portfolio-definitions">Amounts stay separate per currency and source. Shopify order value is not net revenue or profit. Klaviyo events are a proxy; integrations can overlap. Ad attribution must not be added up. Missing data is not zero.</p>';
 const evidence=id=>st.data.evidence?.some(e=>e.id===id)?`<a href="/api/hq/v1/workspace/portfolio/evidence/${encodeURIComponent(id)}" download>Download source evidence (JSON)</a>`:'No released evidence download';
 const detailBtn=(kind,id,label='Details')=>`<button type="button" class="dt-action" data-portfolio-detail="${esc(kind+'|'+id)}">${esc(label)}</button>`;
 function performance(){
  const sources=[...new Set(st.data.performance.filter(r=>r.scope===st.selection.scope).map(r=>r.source))];
  if(!sources.includes(st.selection.source))st.selection.source=sources[0];
  const result=performanceSelection(st.data,st.selection);st.selection.currency=result.currency;
  const single=st.selection.currency!=='all';
  const controls=select('scope','Portfolio',[['Direct clients','Direct clients'],['Agency-managed brands','Agency-managed brands']],st.selection.scope)+select('source','Source',sources.map(v=>[v,v]),st.selection.source)+select('currency','Currency',[['all','All — growth comparison only'],...result.currencies.map(v=>[v,v])],st.selection.currency)+select('sort','Sort',[['growth','Growth'],['current','Current value (single currency)'],['name','Name']],st.selection.sort)+search('search','Search brand or owner',st.selection.search);
  return `<div class="inline-filters">${controls}</div>`+panel('Brands',`<p class="pk-lead">${result.visible.length} brands with complete current and previous aggregates. Grey = previous; light = current; each comparison bar has its own scale.${single?'':' Amounts are not sortable across currencies; choose one currency to sort by value.'}</p>`+dataTable({id:'portfolio-performance',esc,rows:result.visible,pageSize:20,emptyText:'No brands match this selection.',
   columns:[{key:'brand',label:'Brand',value:r=>r.brand,className:'dt-primary',cell:r=>`<strong>${esc(r.brand)}</strong><small>${esc(r.owner)}</small>`},
    {key:'currency',label:'Currency',value:r=>r.currency,cell:r=>esc(r.currency)},
    {key:'current',label:'Current',value:single?r=>r.current:undefined,cell:r=>numCell(r.current)},
    {key:'previous',label:'Previous',value:single?r=>r.previous:undefined,cell:r=>numCell(r.previous)},
    {key:'growth',label:'Growth',value:r=>finite(r.growth)?r.growth:null,cell:r=>growthCell(r.growth)},
    {key:'count',label:'Events/orders',value:r=>r.count??null,cell:r=>numCell(r.count,int)},
    {key:'comparison',label:'Comparison',cell:r=>comparisonBars(r)},
    {key:'open',label:'',className:'dt-action',cell:r=>detailBtn('perf',st.data.performance.indexOf(r))}]}),{esc,meta:st.selection.scope+' · '+st.selection.source});
 }
 function clients(){
  if(!st.data.client_groups.some(c=>c.client===st.client))st.client=st.data.client_groups[0]?.client||'';
  const group=st.data.client_groups.find(c=>c.client===st.client),rows=st.data.performance.filter(r=>r.scope==='Direct clients'&&r.owner===st.client);
  return `<div class="inline-filters">${select('client','Client',st.data.client_groups.map(c=>[c.client,c.client]),st.client)}</div>`+panel(st.client||'Client',statusRows([{label:'Source status on the audit date',state:/verified/i.test(group?.status||'')?'current':/proxy/i.test(group?.status||'')?'stale':'paused',age:false,reason:[group?.status,group?.finding].filter(Boolean).join(' · ')}],{esc})
   +'<p class="pk-lead">Value per event or order is a derived source measure; for Klaviyo it is not a Shopify-verified average order value.</p>'+dataTable({id:'portfolio-client',esc,rows,pageSize:20,emptyText:'No measured brands for this client.',
   columns:[{key:'brand',label:'Brand',value:r=>r.brand,className:'dt-primary',cell:r=>`<strong>${esc(r.brand)}</strong><small>${esc(r.source)}</small>`},{key:'currency',label:'Currency',value:r=>r.currency,cell:r=>esc(r.currency)},
    {key:'current',label:'Current',cell:r=>numCell(r.current)},{key:'previous',label:'Previous',cell:r=>numCell(r.previous)},{key:'growth',label:'Growth',value:r=>finite(r.growth)?r.growth:null,cell:r=>growthCell(r.growth)},
    {key:'count',label:'Events/orders',value:r=>r.count??null,cell:r=>numCell(r.count,int)},{key:'per',label:'Value per event/order',cell:r=>numCell(r.complete&&finite(r.current)&&finite(r.count)&&r.count>0?r.current/r.count:null)},
    {key:'open',label:'',className:'dt-action',cell:r=>detailBtn('perf',st.data.performance.indexOf(r))}]}),{esc,meta:(group?.repositories||[]).length+' repositories'});
 }
 function managedView(){
  const accounts=st.data.managed_details.map((a,i)=>({a,i:String(i)})).filter(({a})=>`${a.name} ${a.region||''}`.toLowerCase().includes(st.query.toLowerCase()));
  if(!accounts.some(({i})=>i===st.managed))st.managed=accounts[0]?.i||'';
  const account=accounts.find(({i})=>i===st.managed)?.a;
  let html=`<div class="inline-filters">${search('query','Search managed accounts',st.query)+select('managed','Account',accounts.map(({a,i})=>[i,`${a.name}${a.region?' · '+a.region:''} · ${a.currency}`]),st.managed)}</div>`;
  if(!account)return html+'<p class="dt-empty">No account for this selection.</p>';
  const reports=[...(account.reports||[])].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const health=(account.health||[]).filter(h=>h&&typeof h==='object');
  html+=panel(account.name,`<dl class="pk-fields"><div><dt>Currency</dt><dd>${esc(account.currency||'—')}</dd></div><div><dt>Time zone</dt><dd>${esc(account.timezone||'—')}</dd></div><div><dt>Region</dt><dd>${esc(account.region||'Not recorded')}</dd></div><div><dt>Source status on the audit date</dt><dd>${esc(account.account_status===200?'Reachable':account.account_status??'Not recorded')}</dd></div></dl><h3 class="pk-subhead">Separate event streams</h3><p class="pk-lead">Integrations can overlap. Value per event is a derived proxy, not a Shopify-verified average order value.</p>`
   +dataTable({id:'portfolio-streams',esc,rows:eventStreamRows(account.metrics),pageSize:10,emptyText:'No event streams recorded.',columns:[{key:'integration',label:'Integration',value:r=>r.integration,className:'dt-primary',cell:r=>`<strong>${esc(r.integration||'—')}</strong>`},
    {key:'current',label:'Value now',cell:r=>numCell(r.current)},{key:'previous',label:'Value previous',cell:r=>numCell(r.previous)},{key:'growth',label:'Value growth',value:r=>r.growth,cell:r=>growthCell(r.growth)},
    {key:'count',label:'Events now',value:r=>r.count??null,cell:r=>numCell(r.count,int)},{key:'pcount',label:'Events previous',cell:r=>numCell(r.previous_count,int)},{key:'egrowth',label:'Event growth',value:r=>r.event_growth,cell:r=>growthCell(r.event_growth)},
    {key:'per',label:'Value/event now',cell:r=>numCell(r.per_event)},{key:'pper',label:'Value/event previous',cell:r=>numCell(r.previous_per_event)}]})
   +`<p class="pk-note">${evidence('managed')}</p>`
   +(health.length?`<h3 class="pk-subhead">Historical account health</h3>`+dataTable({id:'portfolio-health',esc,rows:health,pageSize:10,defaultSort:{key:'date',dir:'desc'},emptyText:'No health scores recorded.',columns:[{key:'date',label:'Date',value:h=>h.date||null,cell:h=>esc(h.date?dayLabel(h.date):'—')},{key:'score',label:'Score',value:h=>finite(h.score)?h.score:null,cell:h=>numCell(h.score,int)},{key:'prev',label:'Previous score',cell:h=>numCell(h.prev_score,int)}]}):''),{esc,meta:account.currency});
  html+=panel('Marketing reports','<p class="pk-lead">Stored historical reports; not a fresh campaign export. Currency is only confirmed where stated.</p>'+dataTable({id:'portfolio-reports',esc,rows:reports,pageSize:10,emptyText:'No stored reports.',
   columns:[{key:'window',label:'Window',value:r=>r.window,className:'dt-primary',cell:r=>`<strong>${esc(r.window||'—')}</strong><small>${esc(r.period||'')}</small>`},{key:'status',label:'Review',value:r=>r.review_status,cell:r=>stagePill(r.review_status||'Not recorded',esc)},
    {key:'revenue',label:'Revenue',cell:r=>numCell(finite(r.metrics?.revenue)?r.metrics.revenue:null)},{key:'orders',label:'Orders',cell:r=>numCell(finite(r.metrics?.orders)?r.metrics.orders:null,int)},
    {key:'stored',label:'Stored',value:r=>parseAt(r.created_at),cell:r=>`<span class="dt-muted">${esc(r.created_at?dayLabel(r.created_at):'—')}</span>`},
    {key:'open',label:'',className:'dt-action',cell:r=>detailBtn('report',st.managed+':'+(account.reports||[]).indexOf(r),'Open report')}]}),{esc,meta:reports.length+' reports'});
  return html;
 }
 function creatives(){
  const items=st.data.creatives.map((c,i)=>({id:String(i),title:c.name||'Untitled ad',sub:'USD '+num(c.spend)+' spend',when:'',thumbUrl:st.previews?previewURL(c.image)||'':'',creative:c}));
  const wall=mediaWall({id:'portfolio-creatives',esc,kind:'image',items,emptyText:'No creatives in this snapshot.',
   // Creatives carry no publish date: the wall opens on its first sort, most spend.
   sorts:[['spend','Most spend',(a,b)=>(Number(b.creative.spend)||0)-(Number(a.creative.spend)||0)],['name','Name',(a,b)=>String(a.title).localeCompare(String(b.title))]],
   detail:item=>{const c=item.creative,src=st.previews?previewURL(c.image):null;return {title:c.name||'Creative',html:(src?`<img class="portfolio-preview pk-creative" src="${esc(src)}" alt="${esc('Ad: '+(c.name||''))}" loading="lazy" referrerpolicy="no-referrer"><p class="portfolio-preview-error" hidden>This historical preview is not available.</p>`:'')+detailDialog([{title:'Creative',fields:[['Ad name',c.name],['Spend (USD)',finite(c.spend)?num(c.spend):null],['Preview',st.previews?(src?'Loaded from the original image host':'No allowed image link'):'Not loaded; use “Load image previews” on the page']]},{title:'Ad text',html:`<p class="pk-prose">${esc(c.body||'No ad text recorded.')}</p>`},{html:`<div class="actions detail-links">${[link(c.image,'Open source image'),link(c.landing,'Open landing page')].filter(Boolean).join('')||'<span class="dt-muted">No secure link recorded.</span>'}</div>`}],{esc})}}})
   // Thumbnails come from the original image host: never send a referrer there.
   .replaceAll('<img src="','<img referrerpolicy="no-referrer" src="');
  return `<div class="pk-gate"><p class="pk-lead">Previews load only from the original image host, and only after you ask. Historical image links may have expired.</p><button type="button" data-portfolio-previews ${st.previews?'disabled':''}>${st.previews?'Previews on':'Load image previews'}</button></div>`+wall;
 }
 function body(){
  if(st.tab==='performance')return performance();
  if(st.tab==='clients')return clients();
  if(st.tab==='managed')return managedView();
  if(st.tab==='payments')return panel('Paid Stripe charges','<p class="pk-lead">Not store revenue. Refunds belong to this charge cohort; currencies stay separate.</p>'+dataTable({id:'portfolio-stripe',esc,rows:st.data.stripe,pageSize:20,emptyText:'No Stripe charges in this snapshot.',
   columns:[{key:'account',label:'Account',value:r=>r.account,className:'dt-primary',cell:r=>`<strong>${esc(r.account||'—')}</strong><small>${esc(r.label||'')}</small>`},{key:'currency',label:'Currency',value:r=>r.currency,cell:r=>esc(r.currency)},
    {key:'amount',label:'Amount paid',cell:r=>numCell(r.paid_charge_amount)},{key:'previous',label:'Previous',cell:r=>numCell(r.previous)},{key:'growth',label:'Growth',value:r=>finite(r.growth)?r.growth:null,cell:r=>growthCell(r.growth)},
    {key:'charges',label:'Charges',value:r=>r.paid_charges??null,cell:r=>numCell(r.paid_charges,int)},{key:'refunds',label:'Refunds (cohort)',cell:r=>numCell(r.refunds_for_these_charges)}]}),{esc,meta:st.data.stripe.length+' rows'});
  if(st.tab==='ads')return panel('Google Ads','<p class="pk-lead">Attributed value is the platform’s own attribution; it must not be added to other sources.</p>'+dataTable({id:'portfolio-google',esc,rows:st.data.google,pageSize:20,emptyText:'No Google Ads accounts.',columns:[{key:'brand',label:'Brand',value:r=>r.brand,className:'dt-primary',cell:r=>`<strong>${esc(r.brand)}</strong>`},{key:'currency',label:'Currency',cell:r=>esc(r.currency)},{key:'spend',label:'Spend',cell:r=>numCell(r.spend)},{key:'value',label:'Attributed value',cell:r=>numCell(r.attributed_conversion_value)},{key:'ratio',label:'Value / spend',value:r=>finite(r.value_spend_ratio)?r.value_spend_ratio:null,cell:r=>numCell(r.value_spend_ratio)},{key:'pratio',label:'Previous ratio',cell:r=>numCell(r.previous_ratio)}]}),{esc,meta:st.data.google.length+' accounts'})
   +panel('Meta','<p class="pk-lead">Status codes are Meta’s own account states on the audit date.</p>'+dataTable({id:'portfolio-meta',esc,rows:st.data.meta,pageSize:20,emptyText:'No Meta ad accounts.',columns:[{key:'account',label:'Account',value:r=>r.account,className:'dt-primary',cell:r=>`<strong>${esc(r.account)}</strong><small>${esc(r.business||'')}</small>`},{key:'currency',label:'Currency',cell:r=>esc(r.currency)},{key:'status',label:'Status',value:r=>r.status_code,cell:r=>esc(({1:'Active',2:'Disabled',3:'Unsettled',7:'Pending review',9:'In grace period',101:'Closed'})[r.status_code]||(r.status_code==null?'—':'Code '+r.status_code))},{key:'spend',label:'Spend',value:r=>finite(r.spend)?r.spend:null,cell:r=>numCell(r.spend)},{key:'pspend',label:'Previous spend',cell:r=>numCell(r.previous_spend)},{key:'roas',label:'Purchase ROAS',cell:r=>numCell(r.purchase_roas)}]}),{esc,meta:st.data.meta.length+' accounts'});
  if(st.tab==='coverage'){const rows=st.data.client_groups.filter(r=>`${r.client} ${r.status} ${r.finding}`.toLowerCase().includes(st.query.toLowerCase()));
   return `<div class="inline-filters">${search('query','Search coverage',st.query)}</div>`+panel('Source coverage per client',dataTable({id:'portfolio-coverage',esc,rows,pageSize:25,defaultSort:{key:'client',dir:'asc'},emptyText:'No clients match this search.',
    tabs:[...new Set(st.data.client_groups.map(r=>r.status).filter(Boolean))].map(s=>({id:s.toLowerCase().replace(/[^a-z0-9]+/g,'-'),label:s,filter:r=>r.status===s})),
    columns:[{key:'client',label:'Client',value:r=>r.client,className:'dt-primary',cell:r=>`<strong>${esc(r.client)}</strong><small>${esc((r.repositories||[]).length+' repositories')}</small>`},{key:'status',label:'Source status',value:r=>r.status,cell:r=>stagePill(r.status||'Not recorded',esc)},{key:'finding',label:'Finding',cell:r=>`<span class="dt-clip" title="${esc(r.finding||'')}">${esc(r.finding||'—')}</span>`}]}),{esc,meta:rows.length+' clients'});}
  if(st.tab==='assets')return creatives();
  return panel('Evidence files','<p class="pk-lead">Only seven verified aggregate files can be downloaded. The rest of the source folder stays closed. A changed evidence file is blocked until it is verified again.</p>'+dataTable({id:'portfolio-evidence',esc,rows:st.data.evidence||[],pageSize:10,emptyText:'No released evidence.',columns:[{key:'filename',label:'Evidence file',value:r=>r.filename,className:'dt-primary',cell:r=>`<strong>${esc(r.filename)}</strong>`},{key:'download',label:'Download',cell:r=>evidence(r.id)}]}),{esc})
   +panel('Brand register',dataTable({id:'portfolio-brands',esc,rows:st.data.brand_registry,pageSize:15,defaultSort:{key:'owner',dir:'asc'},emptyText:'No brands registered.',columns:[{key:'owner',label:'Owner',value:r=>r.owner,cell:r=>esc(r.owner)},{key:'brand',label:'Brand',value:r=>r.brand,className:'dt-primary',cell:r=>`<strong>${esc(r.brand)}</strong>`},{key:'source',label:'Source',value:r=>r.source,cell:r=>`<span class="dt-muted">${esc(r.source||'—')}</span>`},{key:'live',label:'Status during audit',value:r=>r.live_metrics,cell:r=>stagePill(r.live_metrics||'Not recorded',esc)}]}),{esc,meta:st.data.brand_registry.length+' brands'})
   +panel('Reviewed repositories',dataTable({id:'portfolio-repos',esc,rows:st.data.repositories,pageSize:15,defaultSort:{key:'repository',dir:'asc'},emptyText:'No repositories reviewed.',columns:[{key:'repository',label:'Repository',value:r=>r.repository,className:'dt-primary',cell:r=>`<strong>${link(r.url,r.repository)||esc(r.repository)}</strong><small>${esc(r.client_groups||'')}</small>`},{key:'status',label:'Status',value:r=>r.status,cell:r=>stagePill(r.status||'—',esc)},{key:'files',label:'Files',value:r=>r.file_count??null,cell:r=>numCell(r.file_count,int)}]}),{esc,meta:st.data.repositories.length+' repositories'})
   +sourceDetails([['Snapshot',st.data.source?.id],['Snapshot SHA-256',st.data.source?.sha256],...(st.data.evidence||[]).map(e=>[e.filename+' SHA-256',e.sha256]),...st.data.repositories.filter(r=>r.commit).map(r=>[r.repository+' reviewed commit',r.commit]),['Note',st.data.source?.note]],{esc,title:'Hashes and reviewed commits'});
 }
 function draw(){
  const f=freshness(st.data.generated_at),period=p=>Array.isArray(p)?p.map(dayLabel).join(' → '):'';
  // Tiles first, then the source row (as on every page); the charts belong to the Performance tab they describe (7 Oct 2026).
  return `<div class="portfolio">`+portfolioTiles(st.data)+statusRows([{label:'Client portfolio snapshot',state:f.historical?'stale':f.state==='current'?'current':'stale',age:false,reason:'Generated '+(f.date||'on an unknown date')+(f.at!=null?' ('+relativeTime(f.at)+')':'')+' · current period '+period(st.data.period_current)+' vs '+period(st.data.period_previous)+' · reloading only re-reads this local file'}],{esc})
   +`<nav class="inline-filters portfolio-tabs" aria-label="Client performance sections">${TABS.map(([id,label])=>`<button data-portfolio-tab="${id}" aria-current="${id===st.tab?'page':'false'}">${label}</button>`).join('')}</nav>${st.tab==='performance'?portfolioCharts(st.data,st.selection):''}${definitions}${body()}</div>`;
 }
 function detail(raw){
  const [kind,id]=String(raw).split('|');
  if(kind==='perf'){const r=st.data.performance[Number(id)];if(!r)return null;return {title:r.brand,html:detailDialog([{title:'Brand',fields:[['Owner',r.owner],['Scope',r.scope],['Source',r.source],['Currency',r.currency],['Current period',finite(r.current)?num(r.current):null],['Previous period',finite(r.previous)?num(r.previous):null],['Growth',finite(r.growth)?pct(r.growth):null],['Events/orders now',finite(r.count)?int(r.count):null],['Events/orders previous',finite(r.previous_count)?int(r.previous_count):null],['Time zone',r.timezone]]},{title:'Measurement',fields:[['Definition',r.definition],['Complete',r.complete]],html:comparisonBars(r)},{html:`<div class="actions detail-links">${evidence(r.evidence_id)}</div>`}],{esc,lead:'Historical snapshot ('+dayLabel(st.data.generated_at)+'); not live revenue, net sales or profit.'})}}
  if(kind==='report'){const [a,i]=String(id).split(':'),account=st.data.managed_details[Number(a)],report=account?.reports?.[Number(i)];if(!report)return null;return {title:account.name+' · '+(report.window||'report'),html:reportDialog(account,report)}}
  return null;
 }
 return {draw,detail};
}

export function crmSection(crm,monthly=[],{esc:e=esc,now=Date.now(),dataTableFn=dataTable}={}){
 const accounts=crm?.accounts||[];
 if(crm?.error||crm?.state==='unavailable')return '<div class="section-head pk-heading"><div><p class="eyebrow">CLIENT CRM</p><h2>Client CRM</h2></div></div>'+statusRows([{label:'Hermon CRM',state:'unavailable',reason:crm.error||crm.reason||'Not read'}],{esc:e,now});
 return accounts.map(c=>{
  const cur=c.currency||'EUR',series=key=>monthly.map(m=>{const a=m.accounts.find(x=>x.id===c.id);return {label:m.label,value:finite(a?.[key])?a[key]:0,missing:!a||!finite(a?.[key])}});
  const pay=series('paidBeforeRefunds'),signed=series('signedContractValue'),missing=pay.some(x=>x.missing)||signed.some(x=>x.missing);
  const f=freshness(c.observedAt,{now,staleHours:1}),state=c.state==='connected'?(f.state==='current'?'current':'stale'):c.state==='stale'?'stale':'unavailable';
  const leads=(c.leads||[]).length?dataTableFn({id:'crm-leads-'+c.id,esc:e,rows:c.leads,pageSize:10,defaultSort:{key:'updated',dir:'desc'},emptyText:'No leads in this preview.',columns:[{key:'name',label:'Lead',value:l=>l.name,className:'dt-primary',cell:l=>'<strong>'+e(l.name||'Unnamed lead')+'</strong>'},{key:'status',label:'Status',value:l=>l.status,cell:l=>stagePill(l.status||'Not recorded',e)},{key:'next',label:'Next touch',value:l=>parseAt(l.nextTouchAt),cell:l=>'<span class="dt-muted">'+e(l.nextTouchAt?dayLabel(l.nextTouchAt):'Not scheduled')+'</span>'},{key:'updated',label:'Updated',value:l=>parseAt(l.updatedAt),cell:l=>'<span class="dt-muted">'+e(relativeTime(l.updatedAt,now)||'—')+'</span>'}]}):'';
  return '<div class="section-head pk-heading"><div><p class="eyebrow">CLIENT CRM</p><h2>Client CRM · '+e(c.name)+'</h2></div><span class="pk-meta">'+e(cur+' · before refunds')+'</span></div>'
   +statusRows([{label:'Hermon CRM sync',state,at:c.observedAt,reason:c.error||(c.refreshing?'Showing the last verified snapshot while a refresh runs':state==='current'?'Organisation and reads verified':'Last verified snapshot')}],{esc:e,now})
   +(c.counts?tileRow([
    {label:'Leads',value:int(c.counts.leads),caption:'All leads in this CRM'},
    {label:'Appointments',value:int(c.counts.appointments),caption:'All appointments in this CRM'},
    {label:'Payments',value:int(c.counts.payments),caption:'Payment records synced'},
    {label:'Contracts',value:int(c.counts.contracts),caption:'Signed contract records'},
    {label:'Paid this month',value:money(c.paidBeforeRefunds,cur),caption:dayLabel(c.from)+' → '+dayLabel(c.to)+' · before refunds'},
    {label:'Signed this month',value:money(c.signedContractValue,cur),caption:'Signed value; subscriptions and commissions excluded'},
   ],{esc:e,number:String}):'')
   +chartBand({title:'Payments per month',meta:cur+' · before refunds',body:monthly.length?columns(pay,{esc:e,label:'Payments per month ('+cur+', before refunds)',format:v=>money(v,cur)}):'',note:(c.revenueNote||'Payments before refunds.')+(missing?' A month without a confirmed sum is drawn as an empty outline, not as 0.':''),empty:'Monthly payments could not be read.'},
    {title:'Signed contracts per month',meta:cur+' · signed value',body:monthly.length?columns(signed,{esc:e,label:'Signed contract value per month ('+cur+')',format:v=>money(v,cur)}):'',note:'Only amounts in '+cur+' are counted; other currencies are never added in.',empty:'Monthly contract values could not be read.'},{esc:e})
   +(leads?panel('Lead preview',(c.leadSample?'<p class="pk-lead">The '+(c.leads||[]).length+' most recently updated leads.</p>':'')+leads,{esc:e,meta:int(c.counts?.leads)+' leads in total'}):'');
 }).join('');
}
