import {dataTable,rerenderTable,tableAction,stagePill,relativeTime,tableKeydown} from './data-table.mjs';
import {todayPanel} from './today-panel.mjs';
import {CONTENT_BUSINESS_ACCOUNTS,CONTENT_BUSINESS_VIEWS,contentSelection,createContentReader} from './content-selection.mjs';
import {freshnessBanner} from './freshness.mjs';
import {videoWall,wallAction,wallItem,wallDetail,playerHTML} from './video-wall.mjs';
import {barList,columns,perDay,stackBar,funnel,sparkline} from './viz.mjs';
import {label} from './labels.mjs';
// Sales pages load their own modules on first open (7 Oct 2026): about 40 KB less in the entry bundle.
let localSalesM=null,handbookM=null,followupM=null;
const localSalesMod=async()=>localSalesM??=await import('./local-sales.mjs');
const handbookMod=async()=>handbookM??=await import('./handbook-native.mjs');
const followupMod=async()=>followupM??=await import('./sales-followup.mjs');
import {markdown as renderMarkdown} from './message-view.mjs';
import {applyTriage,mark,prune,loadTriage,saveTriage,TRIAGE_GROUPS} from './inbox-triage.mjs';
// Social, competitor and Content OS feed builders load with the pages that use them (11 Oct 2026, entry budget B2).
const socialViewMod=()=>import('./social-view.mjs'),competitorViewMod=()=>import('./competitor-view.mjs'),contentOSMod=()=>import('./content-os-feed.mjs');
const loadContentOS=async(...a)=>(await contentOSMod()).loadContentOS(...a);
import {WORKSPACES,BUSINESSES,workspaceFor,normalizeSection,workspacesForBusiness,pageOf} from './workspace-navigation.mjs';
import {createOperationalViews, SECTION_DESCRIPTIONS} from './workspace-operations.mjs';
import {engineLogo} from './engine-logos.mjs';
import {bindSoulDialog} from './detail-open.mjs';
import {DASHBOARD_WIDGETS,normalizeLayout,applyDashboardLayout} from './dashboard-layout.mjs';
import * as kit from './page-kit.mjs';
// Creator research (with its radar, watchlists and analysis) loads on first use: about 30 KB less up front.
let creatorM=null;const creatorModule=async()=>creatorM??=await import('./creator-research.mjs');
import {stateView,errorState,brandTrace,loadingView} from './ui.mjs';
import {play,canAnimate} from './motion.mjs';
import {icon} from './icons.mjs';
import {pulseHTML} from './overview-pulse.mjs';
// Inbox model and view load with the Inbox page (11 Oct 2026, entry budget B2). The helpers below only run once that
// page has rendered (its rows, buttons and keys need it), so the module is there by then.
let inboxM=null;const inboxMod=async()=>inboxM??=await Promise.all([import('./inbox-model.mjs'),import('./inbox-view.mjs')]).then(([model,view])=>({...model,...view}));
const buildInbox=(...a)=>inboxM.buildInbox(...a),inboxKeys=(...a)=>inboxM.inboxKeys(...a),inboxHTML=(...a)=>inboxM.inboxHTML(...a),confirmStrip=(...a)=>inboxM.confirmStrip(...a),toggleGroup=(...a)=>inboxM.toggleGroup(...a);
import {renderQuestion} from './question-view.mjs';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number=(v,currency)=>v===null||v===undefined?'—':new Intl.NumberFormat('en-GB',currency?{style:'currency',currency,maximumFractionDigits:0}:{notation:Number(v)>=1000000?'compact':'standard',maximumFractionDigits:1}).format(v);
export const date=v=>{if(!v)return 'Not reported';const d=new Date(typeof v==='number'?v*1000:v);return Number.isNaN(+d)?'Not reported':d.toLocaleString('en-GB',/^\d{4}-\d{2}-\d{2}$/.test(String(v))?{dateStyle:'medium',timeZone:'UTC'}:{dateStyle:'medium',timeStyle:'short'})};
export const SECTIONS={inbox:'Inbox',messages:'External messages',reels:'Content OS',librarian:'Brain status',memory:'Memory & SOUL',brands:'Brand Factory',sources:'Source status',todoist:'Todoist',routines:'Routines',sessions:'Runtime sessions',overview:'Mission Control',usage:'Tokens & models',revenue:'Revenue',tasks:'Work',calendar:'Calendar',agents:'Agents',chats:'Conversations',voice:'187N Voice',team:'187N Team',content:'Content workspace',board:'Production board',record:'Recording desk',reviews:'Reviews',campaigns:'Campaigns & previews',research:'Research',outreach:'Sales & follow-up',social:'Social analytics',competitors:'Competitor intelligence',delivery:'Delivery',activity:'Activity',connections:'Connections',settings:'Workspace settings'};
const groups=[...new Set(WORKSPACES.map(w=>w.group))].map(group=>[group,WORKSPACES.filter(w=>w.group===group)]);
const btn=(name,action,id='',primary=false)=>'<button '+(primary?'class="primary" ':'')+'data-action="'+action+'" data-id="'+esc(id)+'">'+esc(name)+'</button>';
const empty=t=>'<div class="empty"><span class="orb" aria-hidden="true">○</span><p>'+esc(t)+'</p></div>';
const pill=(v,state='')=>'<span class="pill '+esc(state)+'">'+esc(v??'Unavailable')+'</span>';
const source=s=>'<div class="source">'+pill(s?.status||s?.state||s?.syncState||'Unavailable')+' <span>Source updated '+esc(date(s?.lastSuccessAt||s?.observedAt||s?.updated_at))+'</span></div>';
const cleanMeta=s=>String(s??'').split(' · ').map(x=>x.trim()).filter(x=>x&&x!=='@'&&!/^—(\s|$)/.test(x)&&!/^undefined\b/.test(x)).join(' · ')
const row=(title,sub,control='')=>'<article class="row"><div><strong>'+esc(title)+'</strong><small>'+esc(cleanMeta(sub))+'</small></div>'+control+'</article>';
const PAGE=25
const rows=(list,fn)=>list?.length?'<div class="list"'+(list.length>PAGE?' data-paged':'')+'>'+list.map(fn).join('')+'</div>'+(list.length>PAGE?'<button type="button" class="show-more" data-action="show-more">Show all '+number(list.length)+'</button>':''):empty('No records in this view.');
const metric=(label,value,sub='',action='')=>label==='Showing'?'':'<'+(action?'button data-action="section" data-id="'+action+'"':'article')+' class="metric"><small>'+esc(label)+'</small><strong data-count="'+esc(label)+'">'+esc(value)+'</strong><span>'+esc(sub)+'</span></'+(action?'button':'article')+'>';
const safeLink=(url,label)=>{try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';return '<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>'}catch{return ''}};
function chart(series,key='tokens'){
 const values=series.map(r=>Number(r[key]||0)),max=Math.max(...values,1);
 return '<div class="chart" role="img" aria-label="Daily '+key+' over the selected period">'+(series.length?series.map((r,i)=>'<div title="'+esc(r.date)+' · '+number(values[i])+'"><i style="height:'+Math.max(0,values[i]/max*100)+'%"></i><small>'+esc(String(r.date||'').slice(5))+'</small></div>').join(''):'<p>No daily measurements.</p>')+'</div>';
}
export function createWorkspaceViews({host,api,getContext,setContext,action,onNavigate,getBoot,voice,connectorMark,workflow=null,allowed=null}){
 // Team shell (9 Oct 2026): `allowed` limits every tab, view switch and navigation to the member's sections.
 const scoped=b=>!allowed?workspacesForBusiness(b):workspacesForBusiness(b).map(w=>({...w,pages:w.pages.map(p=>({...p,views:p.views.filter(([v])=>allowed.has(v))})).filter(p=>p.views.length)})).filter(w=>w.pages.length).map(w=>({...w,tabs:w.pages.map(p=>[p.views[0][0],p.label])}));
 const root=host.attachShadow({mode:'open'});
 root.innerHTML='<link rel="stylesheet" href="/static/cockpit.css?v=l20261012160923"><link rel="stylesheet" href="/static/components.css?v=l20261012160923"><div class="workspace"><aside class="sidebar"><p class="eyebrow">187N / WORKSPACE</p>'+groups.map(([name,sections])=>'<nav aria-label="'+name+'"><small>'+name+'</small>'+sections.map(w=>'<button data-section="'+w.id+'">'+w.label+'</button>').join('')+'</nav>').join('')+'</aside><main class="workspace-main"><header class="view-header"><div><button type="button" class="ws-menu" aria-label="Open navigation"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></svg></button><p class="eyebrow" id="section-group">All businesses  /  Today</p><h1 id="title">Overview</h1><p class="view-description" id="description"></p></div><div class="context"><span id="busy-trace" class="busy-trace" hidden>'+brandTrace({mode:'loop',size:'sm',label:'Loading'})+'</span><span id="view-updated" class="view-updated"></span><label id="project-field">Project<select id="project"></select></label><button data-action="refresh" aria-label="Refresh current view">↻ Refresh</button><button data-action="office">← Office</button></div></header><nav id="section-tabs" aria-label="Department pages"></nav><nav id="view-switch" class="view-switch" aria-label="Views on this page" hidden></nav><span id="view-scope" hidden></span><div id="filters"></div><p id="status" role="status"></p><section id="view" tabindex="-1"></section><section id="brand-host" hidden></section><section id="reel-host" hidden></section><section id="leoncontent-host" hidden></section><section id="creatorlab-host" hidden></section><section id="message-host" hidden></section><section id="editor-host" hidden></section></main></div><dialog id="editor" aria-labelledby="editor-title"><form id="edit-form"><header><h2 id="editor-title">Content production</h2><button type="button" data-close>Close</button></header><div id="edit-body"></div><p id="edit-error" role="alert"></p><button class="primary" type="submit">Save changes</button></form></dialog><dialog id="preview" aria-labelledby="preview-title"><header><h2 id="preview-title"></h2><button data-action="close-preview">Close</button></header><div id="preview-body"></div></dialog>';
 if(allowed)root.querySelector('button[data-action="office"]')?.remove();  // the team shell has no office behind it
 const $=s=>root.querySelector(s);
 // Focus survives a re-render of the same page (8 Oct 2026): the control that had focus (a select, segmented
 // button, chip, tab or action) is found again by its identifying attributes and focused, instead of dropping to <body>.
 const FOCUS_ATTRS=['id','name','data-control','data-operation','data-pk-chip','data-pk-select','data-action','data-portfolio-tab','data-value','data-id'];
 const focusKey=el=>{if(!el||!el.getAttribute)return null;const k=FOCUS_ATTRS.map(a=>[a,el.getAttribute(a)]).filter(([,v])=>v!=null&&v!=='');return k.length?{tag:el.tagName.toLowerCase(),k}:null};
 const restoreFocus=key=>{if(!key)return;try{const el=root.querySelector(key.tag+key.k.map(([a,v])=>'['+a+'="'+CSS.escape(v)+'"]').join(''));if(el&&root.activeElement!==el)el.focus({preventScroll:true})}catch{}};let contentAt=0;let section='overview',serial=0,days=30,periodChosen=false,navStarted=0,account='all',category='all',boot=getBoot?.(),content,lastUsage,query='',revenueFilter='',draftTimer,outreach,contentStage='all',deliveryRecords=[],deliveryLayout='board',deliveryStatus='all',financeRequest=0,researchRequest=0;
 let business='all',nativeSalesUnmount=null;
 // Delivery details and the local build review load on first use (11 Oct 2026, entry budget B2).
 let deliveryDetailP=null;const deliveryDetail=async(...a)=>(await (deliveryDetailP??=import('./delivery-details.mjs').then(m=>m.createDeliveryDetails({api,current:()=>({business,serial})}),e=>{deliveryDetailP=null;throw e})))(...a);
 root.querySelector('.sidebar').insertAdjacentHTML('afterbegin','<label>Business · navigation and agent work<select id="business">'+BUSINESSES.map(b=>'<option value="'+b.id+'">'+esc(b.label)+'</option>').join('')+'</select></label>');
 function setBusiness(value,{navigate:go=true}={}){if(!BUSINESSES.some(b=>b.id===value))return;$('#preview').close();business=value;$('#business').value=value;const available=scoped(business);root.querySelectorAll('.sidebar button[data-section]').forEach(b=>{b.hidden=!available.some(w=>w.id===b.dataset.section)});if(!go)return;const here=available.find(w=>w.tabs.some(([id])=>id===section));if(!here)navigate(available[0]?.tabs[0]?.[0]||'overview');else navigate(section,{refresh:true})}
 $('#business').onchange=e=>setBusiness(e.target.value);
 try{const saved=JSON.parse(localStorage.getItem('hq-business')||'"all"');if(saved!=='all')setBusiness(saved,{navigate:false})}catch{}
 // The content editor is a lazy chunk (11 Oct 2026, entry budget B2): created on the first Open, which binds its form then.
 let editorP=null;const editor={open:async(...a)=>(await (editorP??=import('./content-editor.mjs').then(m=>m.createContentEditor({root,api,esc,navigate:s=>{contentAt=0;return navigate(s)}}),e=>{editorP=null;throw e}))).open(...a)};
 const filters=html=>$('#filters').innerHTML=html;
 const mediaURL=value=>{try{const u=new URL(value,'https://187n.ai');if(!['/api/hq-media','/team/api/hq-media'].includes(u.pathname)||u.hostname!=='187n.ai')return '';return '/api/hq/v1/workspace/team/media?key='+encodeURIComponent(u.searchParams.get('key')||'')}catch{return ''}};
 const postThumb=p=>{try{const u=new URL(p.thumbnailUrl||'');if(u.protocol!=='https:'||!/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname))return '<span class="thumb-fallback" aria-hidden="true"></span>';return '<img loading="lazy" referrerpolicy="no-referrer" src="'+esc(u.href)+'" alt="">'}catch{return '<span class="thumb-fallback" aria-hidden="true"></span>'}};
 const CONTENT_STAGES=['To Review','Scripted','Ready To Post','Posted','Idea','Archived'];
 const contentTable=list=>dataTable({id:'content',esc,rows:list,defaultSort:{key:'updated',dir:'desc'},tabs:CONTENT_STAGES.filter(s=>list.some(i=>i.status===s)).map(s=>({id:s,label:s,filter:i=>i.status===s})),columns:[
  {key:'title',label:'Title',value:i=>i.title,className:'dt-primary',cell:i=>'<strong>'+esc(i.title||'Untitled')+'</strong><small>'+esc(String(i.hook||i.topic||'').replace(/https?:\/\/\S+/g,'').slice(0,140))+'</small>'},
  {key:'account',label:'Account',value:i=>i.accountId||'',cell:i=>i.accountId?'@'+esc(i.accountId):'<span class="dt-muted">Unassigned</span>'},
  {key:'stage',label:'Stage',value:i=>i.status,cell:i=>stagePill(i.status,esc)},
  {key:'deadline',label:'Deadline',value:i=>i.deadline||null,cell:i=>i.deadline?esc(i.deadline):'<span class="dt-muted">—</span>'},
  {key:'updated',label:'Updated',value:i=>Date.parse(i.updatedAt)||null,cell:i=>'<span class="dt-muted">'+esc(relativeTime(i.updatedAt)||'—')+'</span>'},
  {key:'open',label:'',className:'dt-action',cell:i=>btn('Open','item',i.id)}]});
 // Hermon CRM leads as a table (audit M3): stage tabs, sortable columns, details per lead.
 const hermonLeadsTable=list=>{const stage=r=>mv?mv.hermonStage(r):r.statusName||r.status||r.stage||'Recorded';const stages=[...new Set(list.map(stage))].slice(0,6);
  return dataTable({id:'hermon-leads',esc,rows:list,pageSize:20,defaultSort:{key:'updated',dir:'desc'},emptyText:'No Hermon leads in this view.',
   tabs:stages.length>1?stages.map(s=>({id:s.toLowerCase().replace(/[^a-z0-9]+/g,'-'),label:s,filter:r=>stage(r)===s})):undefined,
   columns:[{key:'name',label:'Lead',value:r=>r.name||r.fullName,className:'dt-primary',cell:r=>'<strong>'+esc(r.name||r.fullName||r.externalId||'Lead · '+(kit.dayLabel(r.createdAt)||'date not recorded'))+'</strong><small>'+esc(r.email||r.phone||'ID '+String(r.id||'').slice(0,8))+'</small>'},
    {key:'stage',label:'Stage',value:stage,cell:r=>stagePill(stage(r),esc)},
    {key:'source',label:'Source',value:r=>r.marketingSource||r.source||r.lastSource,cell:r=>'<span class="dt-muted">'+esc(kit.englishMap(label(r.marketingSource||r.source||r.lastSource||'—'),mv?.MARKETING_SOURCE_EN||{}))+'</span>'},
    {key:'next',label:'Next touch',value:r=>Date.parse(r.nextTouchAt)||0,cell:r=>'<span class="dt-muted">'+esc(r.nextTouchAt?date(r.nextTouchAt):'—')+'</span>'},
    {key:'updated',label:'Updated',value:r=>Date.parse(r.updatedAt||r.createdAt)||0,cell:r=>'<span class="dt-muted">'+esc(relativeTime(r.updatedAt||r.createdAt))+'</span>'},
    {key:'open',label:'',cell:r=>'<button type="button" class="dt-action" data-action="sales-record" data-id="'+esc(r.externalId||r.id)+'">Details</button>'}]})};
 // Competitor visuals (6 Oct 2026): what was scraped, as videos and charts instead of text rows.
 const competitorVideos=d=>(d.videos||[]).filter(v=>!query||[v.creator,v.text,v.platform].some(x=>String(x||'').toLowerCase().includes(query.toLowerCase())))
  .map(v=>({...v,thumbUrl:v.thumb?'/api/hq/v1/workspace/competitors/media?id='+encodeURIComponent(v.id):''}));
 const competitorVisuals=d=>{const vids=d.videos||[],cut=Date.now()-14*86400000,recent=vids.filter(v=>Date.parse(v.publishedAt)>=cut);
  const byCreator=new Map();for(const v of recent){const n=Number(v.metrics?.views??v.metrics?.plays??0)||0;const e=byCreator.get(v.creator)||{label:v.creator,value:0,posts:0};e.value+=n;e.posts++;byCreator.set(v.creator,e)}
  const rows=[...byCreator.values()].map(e=>({...e,note:e.posts+' videos'}));
  const all=[...new Map([...(d.posts||[]).map(p=>[p.id,{platform:p.platform,publishedAt:p.published_at}]),...vids.map(v=>[v.id,{platform:v.platform,publishedAt:v.publishedAt}])]).values()];
  const names={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube',x:'X',linkedin:'LinkedIn'};
  const rhythm=Object.keys(names).filter(p=>all.some(i=>i.platform===p)).map(p=>columns(perDay(all.filter(i=>i.platform===p)),{esc,label:names[p]})).join('');
  return '<div class="viz-grid">'+card('Views by creator · last 14 days',barList(rows,{esc,label:'Views by creator, last 14 days'}))+card('Posting rhythm · posts per day',rhythm?'<div class="viz-multiples">'+rhythm+'</div>':'<p class="dt-empty">No posts yet.</p>')+'</div>'};
 const leadsTable=list=>dataTable({id:'leads',esc,rows:list,defaultSort:{key:'updated',dir:'desc'},tabs:['research','contacted','replied','excluded'].filter(s=>list.some(r=>r.stage===s)).map(s=>({id:s,label:s[0].toUpperCase()+s.slice(1),filter:r=>r.stage===s})),columns:[
  {key:'company',label:'Company',value:r=>r.name||r.company,className:'dt-primary',cell:r=>'<strong>'+esc(r.name||r.company||r.id)+'</strong><small>'+esc(r.email||r.source||'')+'</small>'},
  {key:'stage',label:'Stage',value:r=>r.stage,cell:r=>stagePill(r.stage,esc)},
  {key:'source',label:'Source',value:r=>mv?mv.leadSource(r):(r.source||'unknown'),cell:r=>'<span class="dt-muted">'+esc(mv?mv.leadSource(r):(r.source||'Unknown'))+'</span>'},
  {key:'account',label:'Account',value:r=>r.accountId,cell:r=>'@'+esc(r.accountId||'')},
  {key:'next',label:'Next step',cell:r=>{const next=r.nextAction||(Array.isArray(r.blockers)?kit.englishMap(r.blockers[0],mv?.BLOCKERS_EN||{}):'');return next?'<span class="dt-clip">'+esc(next)+'</span>':'<span class="dt-muted">—</span>'}},
  {key:'updated',label:'Updated',value:r=>Date.parse(r.updatedAt)||null,cell:r=>'<span class="dt-muted">'+esc(relativeTime(r.updatedAt)||'—')+'</span>'},
  {key:'open',label:'',className:'dt-action',cell:r=>btn('Open dossier','outreach-record',r.id)}]});
 // Marketing & Sales builders (Phase 3.3): a lazy chunk, loaded by the first marketing or sales page.
 let mv=null;const marketing=async()=>mv??=await import('./marketing-visuals.mjs');
 const mediaPending='<p class="dt-muted campaign-media-note">Team media access: not granted. Slide and story previews appear once Team Hub grants it; titles, captions and guides work now.</p>';
 const campaignCard=(c,media)=>{const formats=c.formats||{},carousel=formats.carousel||[],story=formats.story||[],first=carousel[0]||story[0],poster=media&&first?.poster?mediaURL(first.poster):'';return '<button type="button" class="campaign-card" data-action="campaign" data-id="'+esc(c.accountId+':'+c.slug)+'">'+(poster?'<img loading="lazy" src="'+esc(poster)+'" alt="">':'<span class="campaign-fallback" aria-hidden="true">'+esc(first?.title||c.keyword||c.title||c.slug)+'</span>')+'<span class="campaign-body"><small>@'+esc(c.accountId)+'</small><strong>'+esc(c.title||c.slug)+'</strong><span class="campaign-meta">'+carousel.length+' carousel slides · '+story.length+' stories</span>'+(c.keyword?'<span class="ui-badge">'+esc(c.keyword)+'</span>':'')+'</span></button>'};
 const slideStrip=(format,slides,media)=>'<section class="campaign-format"><h3>'+(format==='story'?'Stories':'Carousel')+' <small>'+slides.length+'</small></h3><div class="slide-strip">'+slides.map((s,i)=>{const video=media?mediaURL(s.video):'',poster=media?mediaURL(s.poster):'';return '<figure class="slide slide--'+format+'">'+(video?'<video controls playsinline preload="none" src="'+esc(video)+'"'+(poster?' poster="'+esc(poster)+'"':'')+' aria-label="'+(format==='story'?'Story':'Carousel slide')+' '+(i+1)+'"></video>':'<div class="slide-fallback"><b>'+(i+1)+'</b><span>'+esc(s.title||'')+'</span></div>')+'<figcaption><span>'+(i+1)+' / '+slides.length+(video&&s.title?' · '+esc(s.title):'')+'</span>'+(video?'<a href="'+esc(video)+'" download>Download</a>':'')+'</figcaption>'+(s.body?'<p>'+esc(s.body)+'</p>':'')+'</figure>'}).join('')+'</div></section>';
 const mediaHTML=(video,poster,sourceData=content)=>{if(!sourceData?.integrationCapabilities?.media)return '<p class="dt-muted">Preview needs Team media access.</p>';const src=mediaURL(video),img=mediaURL(poster);return src?'<video controls playsinline preload="none" src="'+esc(src)+'" '+(img?'poster="'+esc(img)+'"':'')+'></video><p class="media-state" role="status">Protected preview · press play to load.</p>':img?'<img loading="lazy" src="'+esc(img)+'" alt="Campaign preview">':(l=>l?'<p class="notice">This file has no preview in the office. '+l+'</p>':'<p class="notice">No media preview available.</p>')(video?safeLink(video,'Open the edited video'):'')};
 root.addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.classList.add('is-broken');if(e.target.tagName==='VIDEO'){const status=e.target.nextElementSibling;if(status)status.textContent='Protected media is unavailable. Its Team connection may need activation.'}},true);
 root.addEventListener('loadeddata',e=>{if(e.target.tagName==='VIDEO'&&e.target.nextElementSibling)e.target.nextElementSibling.textContent='Ready to preview.'},true);
 const GATES=[['technical_gate','Technical'],['acceptance_gate','Acceptance'],['handoff_gate','Handoff'],['collection_gate','Collection']];
 const passed=v=>/^(yes|done|passed|true|ok|complete[d]?)$/i.test(String(v??'').trim());
 const gateStrip=r=>GATES.some(([k])=>r[k]!=null)?'<span class="gate-strip" role="img" aria-label="'+esc('Gates: '+GATES.map(([k,l])=>l+' '+(passed(r[k])?'passed':'open')).join(', '))+'">'+GATES.map(([k,l])=>'<i data-done="'+passed(r[k])+'" title="'+esc(l+' gate: '+(passed(r[k])?'passed':'open'))+'"></i>').join('')+'<small>'+GATES.filter(([k])=>passed(r[k])).length+'/4 gates</small></span>':'';
 const card=(title,body,cls='')=>'<section class="surface '+cls+'"><div class="section-head"><h2>'+esc(title)+'</h2></div>'+body+'</section>';
 const selectedAccountOptions=()=>CONTENT_BUSINESS_VIEWS.has(section)&&CONTENT_BUSINESS_ACCOUNTS[business]?[CONTENT_BUSINESS_ACCOUNTS[business]]:['all','liogpt','187n','lio'];
 const accountFilters=()=>'<label>Account<select id="account">'+selectedAccountOptions().map(a=>'<option value="'+a+'" '+(a===account?'selected':'')+'>'+esc(a==='all'?'All accounts':'@'+a)+'</option>').join('')+'</select></label><label class="search">Search<input id="search" type="search" value="'+esc(query)+'" placeholder="'+esc(({campaigns:'Find a campaign…',research:'Find a post or creator…',outreach:'Find a lead or follow-up…',social:'Find a post…',reviews:'Find content or a result…'})[section]||'Find a script, task or idea…')+'"></label>';
 const period=(label='Period')=>'<label>'+label+'<select id="period">'+[[1,'Today'],[7,'7 days'],[30,'30 days'],[90,'90 days']].map(([n,s])=>'<option value="'+n+'" '+(n===days?'selected':'')+'>'+s+'</option>').join('')+'</select></label>';
 let readContent=createContentReader(api);
 async function teamData(){
  const ticket=serial,selection=contentSelection(section,business,account);
  if(!contentAt)readContent=createContentReader(api);
  const result=await readContent(selection);
  if(ticket!==serial)throw Error('Content selection changed; outdated response discarded.');
  content=result;contentAt=Date.now();return result;
 }
 const matches=(...values)=>!query||values.join(' ').toLowerCase().includes(query.toLowerCase());
 const items=()=>content.items.filter(i=>(contentStage==='all'||i.status===contentStage)&&matches(i.title,i.hook,i.script,i.status,i.accountId));
 const stageFilter=()=>'<label>Stage<select id="content-stage">'+['all','Idea','Scripted','To Edit','Editing','To Review','Ready To Post','Posted','Archived'].map(s=>'<option value="'+s+'" '+(contentStage===s?'selected':'')+'>'+(s==='all'?'All stages':s)+'</option>').join('')+'</select></label>';
 const summary=(title,count,description='')=>'<div class="collection-summary"><strong>'+number(count)+' '+esc(title)+'</strong><span>'+esc(description)+'</span></div>';
 const contentRow=i=>row(i.title,'@'+(i.accountId||'unassigned')+' · '+i.status+' · '+(i.deadline||'No deadline'),btn('Open','item',i.id));
 const settled=async p=>{try{return await p}catch(e){return {state:'unavailable',error:e.message}}};
 function preview(title,html){$('#preview-title').textContent=title;$('#preview-body').innerHTML=html;$('#preview').showModal()}
 $('#preview').addEventListener('close',()=>{if(section==='outreach'&&!contentAt)navigate('outreach',{refresh:true})});
 const views={
  async messages(){filters('');if(!$('#message-host').firstElementChild)$('#message-host').innerHTML='<iframe class="brand-factory-frame" src="/brand-factory/messages.html" title="External messages" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>';return ''},
  async reels(){filters('');if(!$('#reel-host').firstElementChild)$('#reel-host').innerHTML='<iframe class="brand-factory-frame" src="/brand-factory/content-os.html" title="Original Content OS" sandbox="allow-scripts allow-same-origin allow-forms allow-modals"></iframe>';return ''},
  async brands(){filters('');if(!$('#brand-host').firstElementChild)$('#brand-host').innerHTML='<iframe class="brand-factory-frame" src="/brand-factory/brand-factory.html" title="187N Brand Factory" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"></iframe>';return ''},
  async usage({embedded=false}={}){
   if(!embedded)filters(period()+btn('Model settings','models'));const d=await api('cockpit/usage?days='+days);lastUsage=d;
   return '<p class="intro">Measured locally. Claude Code, Codex and Hermes each keep their own totals. Select a period to compare daily usage.</p><div class="engine-grid">'+d.sources.map(engineCard).join('')+'</div>'+d.sources.map(s=>'<details class="usage-detail"><summary>'+esc(s.name)+' · daily tokens & models</summary>'+card(s.name+' · daily tokens',s.totals?chart(s.series||[])+rows(s.models||[],m=>row(m.model||m.name||'Unknown model',number(m.calls??m.apiCalls)+' calls',pill(number(m.tokens)+' tokens')))+'<p class="source">'+esc(s.note||s.costLabel||'')+'</p>':empty(s.reason||'No data'))+'</details>').join('');
  },
  async revenue({embedded=false,controls:showControls=true}={}){
   const now=new Date(),from=now.toISOString().slice(0,7)+'-01',to=now.toISOString().slice(0,10),params=new URLSearchParams(revenueFilter);
   const controls='<label>Hermon from<input id="revenue-from" type="date" value="'+(params.get('from')||from)+'"></label><label>To<input id="revenue-to" type="date" value="'+(params.get('to')||to)+'"></label><label>Currency<select id="revenue-currency">'+['EUR','USD','GBP'].map(c=>'<option '+((params.get('currency')||'EUR')===c?'selected':'')+'>'+c+'</option>').join('')+'</select></label>'+btn('Apply period','revenue-period');if(!embedded)filters(controls);
   // Client CRMs (Wealth Kings) moved to Client performance (Phase 3.1); this band shows 187N's own sources.
   const [h,r]=await Promise.all([settled(api('cockpit/revenue')).then(x=>x?.state==='unavailable'&&x.error?{state:'unavailable',reason:x.error,metrics:{},currency:'EUR'}:x),settled(api('workspace/team/revenue'+(revenueFilter?'?'+revenueFilter:'')))]),m=h.metrics||{};
   return (embedded&&showControls?'<details class="revenue-controls"><summary>Change Hermon period & currency</summary><div class="inline-filters">'+controls+'</div></details>':'')+'<div class="section-head"><div><p class="eyebrow">HEX REVENUE SNAPSHOT</p><h2>'+esc(h.snapshotDate?'Revenue as of '+kit.dayLabel(h.snapshotDate):'Revenue snapshot')+'</h2></div>'+pill(h.state,h.state)+'</div><p class="source">Voltera · cumulative figures · snapshot '+esc(h.snapshotDate?kit.dayLabel(h.snapshotDate):'unavailable')+' · '+esc(h.currency||'')+(h.ageDays>2?' · '+h.ageDays+' days old':'')+'</p>'+(h.reason?'<p class="notice">'+esc(h.reason)+'</p>':'')+'<div class="metrics">'+metric('Total revenue',number(m.revenue,h.currency),'Cumulative at the snapshot')+metric('Ad spend',number(m.ad_spend,h.currency),'Cumulative at the snapshot')+metric('ROAS',number(m.roas)+'×','Revenue ÷ ad spend')+metric('Profit',number(m.profit,h.currency),'Cumulative at the snapshot')+'</div><div class="metrics secondary">'+metric('Deals closed',number(m.deals_closed))+metric('Average deal',number(m.avg_deal_value,h.currency))+metric('Leads',number(m.leads_total))+metric('POAS',number(m.poas)+'×')+'</div>'+card('Monthly values at snapshot date','<div class="metrics secondary">'+metric('Revenue MTD',number(m.revenue_mtd,h.currency),'At '+(h.snapshotDate?kit.dayLabel(h.snapshotDate):'an unknown date'))+metric('Ad spend MTD',number(m.ad_spend_mtd,h.currency),'At '+(h.snapshotDate?kit.dayLabel(h.snapshotDate):'an unknown date'))+metric('Appointments',number(m.appointments_set))+metric('Conversion',m.conversion_rate==null?'—':number(m.conversion_rate)+'%')+'</div>')+card('Hermon · 187N','<p class="source">'+esc(r.from?kit.dayLabel(r.from):'')+' → '+esc(r.to?kit.dayLabel(r.to):'')+' · '+esc(r.currency||'EUR')+'</p><div class="metrics">'+metric('Collected net',number(r.collectedNet,r.currency||'EUR'))+metric('Payments',number(r.paid,r.currency||'EUR'))+metric('Refunds',number(r.refunds,r.currency||'EUR'))+metric('Signed contracts',number(r.signedContractValue,r.currency||'EUR'))+'</div>'+(freshnessBanner(r.sync,{esc,what:'Revenue'})||source(r.sync))+'<p class="source">'+esc(r.contractNote||r.error||'')+'</p>')+'<p class="notice">Each business and source is shown separately for its own period.</p>';
  },
  async team(){
   // Production (Phase 3.3): tiles, the stage funnel beside daily updates, the recording queue as a wall.
   filters(accountFilters());const [,m]=await Promise.all([teamData(),marketing()]);const all=items(),review=all.filter(i=>i.status==='To Review'),record=all.filter(i=>i.status==='Scripted');
   return '<div class="team-command"><div><h2>Keep production moving</h2><p>'+review.length+' items await review · '+record.length+' scripts ready to record</p></div><div class="actions">'+btn('Review content','section','reviews',true)+btn('Start recording','section','record')+btn('New idea','new-content')+'</div></div>'+m.productionTiles(all,{esc,number})+kit.chartBand(m.stageFunnel(all,{esc}),m.updatesPerDay(all,{esc}),{esc})+kit.panel('Recording queue',m.recordingWall(all,{esc,id:'production-recording'}),{esc,meta:record.length+' scripts',cls:'wall-card'})+card('Review next',rows(review.slice(0,5),contentRow))+'<details class="operations-detail"><summary>Latest team changes</summary>'+rows(content.audit.filter(a=>matches(a.name,a.action)).slice(0,12),a=>row(a.name,label(a.action)+' · '+date(a.at)))+'</details>';
  },
  async content(){filters(accountFilters()+'<div class="segmented"><button data-action="section" data-id="content" aria-pressed="true">List</button><button data-action="section" data-id="board" aria-pressed="false">Board</button></div>'+btn('New idea','new-content','',true));const [,m]=await Promise.all([teamData(),marketing()]);const list=items();return m.stageTiles(list,{esc,number})+kit.chartBand(m.stageFunnel(list,{esc}),m.accountMix(list,{esc}),{esc})+card('Content library',contentTable(list))},
  async board(){filters(accountFilters()+'<div class="segmented"><button data-action="section" data-id="content" aria-pressed="false">List</button><button data-action="section" data-id="board" aria-pressed="true">Board</button></div>'+btn('New idea','new-content','',true));const [,m]=await Promise.all([teamData(),marketing()]);return m.stageTiles(items(),{esc,number})+kit.chartBand(m.stageFunnel(items(),{esc}),m.accountMix(items(),{esc}),{esc})+summary('items in production',items().filter(i=>i.status!=='Archived').length,'Open a card to update its production stage.')+'<div class="kanban">'+['Idea','Scripted','To Edit','Editing','To Review','Ready To Post','Posted'].map(stage=>'<section><header><h2>'+stage+'</h2>'+pill(items().filter(i=>i.status===stage).length)+'</header>'+items().filter(i=>i.status===stage).map(i=>'<button data-action="item" data-id="'+esc(i.id)+'"><small>@'+esc(i.accountId||'unassigned')+'</small><strong>'+esc(i.title)+'</strong><span>'+esc(i.deadline||'No deadline')+'</span></button>').join('')+'</section>').join('')+'</div>'},
  // Recording (Phase 3.3): tiles, format chips in the filter bar, the scripts as a wall; a tile opens the script.
  async record(){const [,m]=await Promise.all([teamData(),marketing()]);const scripted=items().filter(i=>i.status==='Scripted'),options=m.formatChips(scripted),format=options.some(o=>o.id===kit.kitValue('record-format','all'))?kit.kitValue('record-format','all'):'all';
   filters(accountFilters()+kit.filterBar({esc,chips:{name:'record-format',label:'Format',value:format,options}}));
   if(!scripted.length)return m.recordingTiles(scripted,{esc,number})+empty('No scripts ready to record for these filters.')+btn('Open content workspace','section','content');
   const shown=format==='all'?scripted:scripted.filter(i=>(i.format||'No format')===format);
   return m.recordingTiles(scripted,{esc,number})+kit.panel('Scripts ready to record',m.recordingWall(shown,{esc,id:'record-wall'}),{esc,meta:shown.length+' of '+scripted.length,cls:'wall-card'})},
  // Review without decision support in the source (fallback): the same tiles and queue table; items open in the editor.
  async reviews(){filters(accountFilters());const [,m]=await Promise.all([teamData(),marketing()]);const waiting=items().filter(i=>i.status==='To Review'),results=content.jobs.filter(j=>j.status==='review'&&matches(j.kind,j.status));
   return m.reviewTiles({candidates:waiting,results:results.length},{esc,number})+m.mediaAccessRow(Boolean(content?.integrationCapabilities?.media),{esc})+kit.panel('Content awaiting review',m.reviewQueue(waiting,{esc,jobs:content.jobs,action:'item',actionLabel:'Open',id:'review-fallback'}),{esc,meta:waiting.length+' waiting'})+card('Production results',rows(results,j=>row(m.jobKind(j.kind),label(j.status)+(j.finishedAt?' · '+date(j.finishedAt):''),btn('Review result','review',j.id))))},
  // Campaigns (Phase 3.3): tiles, comment-keyword chips, media access and automation as status rows. The payload
  // carries no per-campaign results, so none are shown.
  async campaigns(){const [,m]=await Promise.all([teamData(),marketing()]);const found=content.campaigns.filter(c=>matches(c.title,c.slug,c.summary,c.keyword)),options=m.keywordOptions(found),keyword=options.some(o=>o.id===kit.kitValue('campaign-keyword','all'))?kit.kitValue('campaign-keyword','all'):'all';
   filters(accountFilters()+kit.filterBar({esc,chips:{name:'campaign-keyword',label:'Comment keyword',value:keyword,options}}));
   const campaigns=found.filter(c=>m.keywordMatch(c,keyword));if(!campaigns.length)return empty('No campaigns match these filters.');const media=Boolean(content?.integrationCapabilities?.media),guides=(content.guides||[]).filter(g=>matches(g.title,g.keyword,g.slug)&&m.keywordMatch(g,keyword));return m.campaignTiles(campaigns,guides,{esc,number})+m.mediaAccessRow(media,{esc})+m.automationRows(campaigns,{esc})+summary('campaigns',campaigns.length,'Open a campaign for its stories, carousel and caption.')+'<div class="campaign-grid">'+campaigns.map(c=>campaignCard(c,media)).join('')+'</div>'+(guides.length?'<h2 class="campaign-section">Lead magnets</h2><div class="guide-grid">'+guides.map(g=>'<article class="guide-card"><small>@'+esc(g.accountId)+'</small><h3>'+esc(g.title)+'</h3>'+(g.keyword?'<span class="ui-badge">'+esc(g.keyword)+'</span>':'')+'<p>'+safeLink(g.url,'Guide NL')+safeLink(g.englishUrl,'Guide EN')+'</p></article>').join('')+'</div>':'')},
  // Research (Phase 3.3): tiles and the source mix beside posts observed per day above the wall; a tile shows
  // the post's thumbnail only when the payload carries an unexpired Instagram CDN link.
  async research(){filters(accountFilters());const [,[news,recon],m,{newsRadar,reconIdeas},{thumbURL}]=await Promise.all([teamData(),loadContentOS(['radar/news','recon/latest']),marketing(),contentOSMod(),socialViewMod()]);const research=content.research,posts=(research?.posts||[]).filter(i=>matches(i.title,i.caption,i.handle));return (Array.isArray(research)?'':m.researchTiles({...research,posts},{esc,number})+m.researchBand(posts,{esc}))+card('What is working · competitor posts',videoWall({id:'research-videos',esc,items:posts.map(i=>({id:i.id,platform:i.platform||'instagram',url:i.url,kind:/carousel/i.test(i.format||'')?'carousel':'video',text:[i.title,i.observation].filter(Boolean).join('\n\n'),creator:i.handle,metrics:i.metrics||{},changes:{},publishedAt:i.publishedAt,observedAt:i.observedAt,format:i.format,thumbUrl:thumbURL(i)})),emptyText:'No research posts yet.'}),'wall-card')+card('News radar',newsRadar(news,{esc,link:safeLink,query}))+card('Topic ideas',reconIdeas(recon,{esc,query}))+card('Saved research',Array.isArray(research)?rows(research.filter(r=>matches(r.title,r.name)),r=>row(r.title||r.name||r.id,r.status||'',r.id?btn('Open','research-detail',r.id):'')):rows((research?.items||research?.briefs||[]).filter(r=>matches(r.title,r.name)),r=>row(r.title||r.name,r.status||'')))},
  // Leads & follow-up (Phase 3.3): a status row per source, tiles, the funnel beside leads by source, source chips,
  // follow-ups as a table; a dossier opens as a detail dialog with the record's history as a timeline.
  async outreach(){const [,o,m]=await Promise.all([teamData(),settled(api('workspace/team/outreach?account='+account)),marketing()]);outreach=o;
   // Source is a filter token on the queue table itself (7 Oct 2026); the page keeps one filter row.
   const records=Array.isArray(o.records)?o.records:null,hermon=content.hermon?.leads||[];
   filters(accountFilters());
   const shown=(records||[]).filter(r=>matches(r.name,r.company,r.stage,r.nextAction,r.email)),hermonShown=hermon.filter(r=>matches(r.name,r.fullName,r.statusName,r.status));
   return m.leadStatusRows({outreach:o,content},{esc})+m.leadTiles(records||[],hermon,{esc,number,syncAt:content.sync?.hermon?.lastSuccessAt})+kit.chartBand(m.outreachFunnel(records||[],{esc}),m.leadsBySource(records||[],{esc}),{esc})
    +kit.panel('Outreach queue',records?leadsTable(shown):stateView({kind:'setup',title:'Outreach queue not active on Team yet',body:'The protected outreach endpoint has not been deployed on Team Hub. Your sales follow-ups and Hermon lead stages below still work.',actions:[{label:'Check again',action:'refresh'}]}),{esc,meta:records?shown.length+' of '+records.length:''})
    +kit.panel('Sales follow-up','<div class="actions">'+btn('New follow-up','new-follow-up','',true)+'</div>'+m.followUpsTable(content.tasks.filter(t=>t.area==='sales'&&matches(t.title,t.ownerName,t.ownerId,t.status)),{esc}),{esc})
    +kit.panel('Hermon lead stages',m.hermonStages(hermonShown,{esc})+hermonLeadsTable(hermonShown),{esc,meta:hermonShown.length+' leads'})},
  // Social (Phase 3.3): the posts as a wall (expired Instagram thumbnails become text tiles); a tile opens the
  // metrics with the change since the previous measurement and "Open on Instagram".
  async social(){const selection=contentSelection('social',business,account);let [d,[metrics],m,{englishMap,syncBanner,kpiStrip,accountRows,accountsTable,audience,postsTable,accountTrends},{conversionWinners},{performanceMap}]=await Promise.all([api('workspace/team/social?'+new URLSearchParams({...selection,days:days===1?7:days})),loadContentOS(['metrics']),marketing(),socialViewMod(),contentOSMod(),import('../../../../187n/team-hub/public/hq/engine.mjs')]);
   // An empty default period (the last sync is older than it) widens to 90 days once, and says so (9 Oct 2026).
   let widened='';if(!periodChosen&&days<90&&!(d.posts||[]).length){const wide=await api('workspace/team/social?'+new URLSearchParams({...selection,days:90})).catch(()=>null);if(wide&&(wide.posts||[]).length){widened=String(days===1?7:days);d=wide;days=90}}
   filters(period()+accountFilters());const winners=conversionWinners(metrics,{esc,number}),accounts=accountRows(d,selection),bars=audience(d,accounts,{esc,number}),posts=m.socialWallItems(d,selection,{query}),ids=[...new Set(posts.map(p=>p.accountId))],synced=Date.parse(d.sync?.lastSuccessAt||'');
   const wall=kit.mediaWall({id:'social-posts-wall',esc,kind:'post',items:posts,groups:ids.length>1?ids.map(id=>({id,label:posts.find(p=>p.accountId===id)?.handle||'@'+id,filter:p=>p.accountId===id})):undefined,groupLabel:'Account',sorts:[['newest','Newest'],['views','Most viewed']],emptyText:'No posts published in the selected period were synced.'+(Number.isFinite(synced)?' The last Team Hub sync was '+kit.dayLabel(synced)+'; choose 90 days to see older posts.':''),detail:item=>m.socialPostDetail(item,{esc,number,link:safeLink})});
   return syncBanner(d.sync,{esc})+(widened?'<p class="notice" role="status">No posts were synced for the last '+widened+' days, so this shows the last 90 days. Choose a period to change it.</p>':'')+kpiStrip(accounts,{esc,number,asOf:d.sync?.lastSuccessAt})+((t=>t?card('Account trends',t):'')(accountTrends(d,accounts,{esc,number})))+kit.panel('Posts',wall+(!posts.length&&days<90?'<div class="actions"><button type="button" data-action="period-days" data-id="90">Show the last 90 days</button></div>':''),{esc,meta:posts.length+' in this period',cls:'wall-card'})+card('Accounts',accountsTable(accounts,{esc,number}))+(winners?card('What converts',winners):'')+card('Post performance',postsTable(d,selection,{esc,number,link:safeLink,query}))+(bars?card('Audience',bars):'')+englishMap(performanceMap(d))},
  async competitors(){filters('<label class="search">Search<input id="search" type="search" value="'+esc(query)+'" placeholder="Find a profile or post…"></label><label>Category<select id="category">'+['all','creators','businesses'].map(c=>'<option '+(category===c?'selected':'')+'>'+c+'</option>').join('')+'</select></label>');const [d,[suggestions],{competitorPosts,collectionHealth,collectionHistory,competitorRoster},{watchSuggestions}]=await Promise.all([api('workspace/competitors?category='+category),loadContentOS(['recon/suggestions']),competitorViewMod(),contentOSMod()]);const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);return '<div class="metrics">'+metric('Tracked profiles',d.roster.length,(()=>{const cov=d.coverage||[],ok=cov.filter(c=>c.state==='current').length;return ok===cov.length?'All '+ok+' platforms current':ok+' of '+cov.length+' platforms current · '+(cov.length-ok)+' '+(cov.find(c=>c.state!=='current')?.state||'behind')})())+metric('Collection spend',money(d.budget?.spentCents||0),'US$30 monthly limit')+metric('Reserved',money(d.budget?.reservedCents||0),'Daily collection · 08:00 Makassar')+'</div>'+collectionHealth(d,{esc})+collectionHistory(d,{esc})+competitorVisuals(d)+card('Latest videos',videoWall({id:'competitor-videos',esc,items:competitorVideos(d),emptyText:'No videos collected yet. The next daily collection fills this wall.'}),'wall-card')+card('All observed posts',competitorPosts(d,{esc,number,link:safeLink,query}))+card('Accounts worth watching',watchSuggestions(suggestions,{esc,link:safeLink,query}))+card('Tracked profiles',competitorRoster(d,{esc,link:safeLink,query}))},
  async delivery(){
   // Project delivery (Departments batch 2): freshness rows, tiles, health bar + board or list, deadline and gate
   // charts (lazy chunk). The register comes through either console, or from the file when both are down.
   const ticket=serial;deliveryRecords=[];
   const [m,d]=await Promise.all([import('./delivery-view.mjs'),api('workspace/delivery?'+new URLSearchParams({business})).catch(error=>({error}))]);
   if(ticket!==serial)return '';
   if(d.error){if(d.error.code!=='source_unavailable'&&d.error.status!==503)throw d.error;const services=await api('workspace/services').catch(()=>null);if(ticket!==serial)return '';filters('');return m.deliveryOffline(services,{esc})}
   deliveryRecords=d.projects||[];
   const stages=[...new Set(['red','amber','green','frozen',...deliveryRecords.map(r=>r.status||'unreported')])];
   filters('<label class="search">Search<input id="search" type="search" value="'+esc(query)+'" placeholder="Find a project, owner or milestone…"></label><label>Status<select id="delivery-stage"><option value="all">All statuses</option>'+stages.map(k=>'<option value="'+esc(k)+'" '+(deliveryStatus===k?'selected':'')+'>'+esc(m.statusLabel(k))+'</option>').join('')+'</select></label><div class="segmented">'+['board','list'].map(k=>'<button data-action="delivery-layout" data-id="'+k+'" aria-pressed="'+(deliveryLayout===k)+'">'+(k==='board'?'Board':'List')+'</button>').join('')+'</div>');
   const list=deliveryRecords.filter(r=>(deliveryStatus==='all'||(r.status||'unreported')===deliveryStatus)&&matches(r.project,r.name,r.status,r.accountable_lead,r.next_milestone,r.client));
   return m.deliveryPage(d,list,{esc,layout:deliveryLayout,filterStatus:deliveryStatus,indexOf:r=>deliveryRecords.indexOf(r)});
  },
  async settings(){const [m,{SHORTCUTS}]=await Promise.all([import('./settings-view.mjs'),import('./command-palette.mjs')]);return m.settingsPage({esc,icon,workspaces:workspacesForBusiness(business),shortcuts:SHORTCUTS,link:safeLink,kit})},
 };
 // Client performance is a lazy chunk (11 Oct 2026, entry budget B2): created on the first visit, which registers its listeners then.
 let portfolioP=null;const portfolioReady=()=>portfolioP??=import('./portfolio-view.mjs').then(m=>m.createPortfolioView({api,root,filters,preview,getSerial:()=>serial,refresh:()=>navigate('portfolio',{refresh:true})}),e=>{portfolioP=null;throw e});
 // Client CRM · Wealth Kings moved here from Overview and Leads (Phase 3.1, 7 Oct 2026) and built out in batch 2:
 // sync status row, tiles from the CRM counts, payments and signed contracts per month (EUR, before refunds, never
 // summed across currencies) and the lead preview. The builders live in portfolio-view.mjs.
 views.portfolio=async(...args)=>{const ticket=serial,crmRead=settled(api('workspace/crm')),portfolio=await portfolioReady();if(ticket!==serial)return '';const [html,crm,monthly]=await Promise.all([portfolio.view(...args),crmRead,portfolio.crmMonthly().catch(()=>[])]);return html?html+portfolio.crm(crm,monthly):''};
 // Departments batch 1 (7 Oct 2026): Finance, Team & People and Community on the shared page kit. Each page is
 // a lazy chunk, created on first visit (its root listeners register then); the kit stays in the main bundle.
 const lazyView=(load,make)=>{let view=null;return async(...args)=>{view??=make(await load());return view(...args)}};
 views.finance=lazyView(()=>import('./business-records.mjs'),m=>m.createBusinessRecords({api,root,filters,getBoot:()=>boot,preview,esc,number,getSerial:()=>serial,liveRevenue:()=>views.revenue({embedded:true,controls:false})}).finance);
 views.people=lazyView(()=>import('./people-view.mjs'),m=>m.createPeopleView({api,root,filters,preview,esc,getQuery:()=>query,getBoot:()=>boot,getSerial:()=>serial}));
 views.community=lazyView(()=>import('./community-review.mjs'),m=>m.createCommunityReview({api,root,filters,getSerial:()=>serial,preview,refresh:()=>{if(section==='community')navigate('community',{refresh:true})}}));
 kit.bindKitControls(root,()=>navigate(section,{refresh:true}));
 let voiceUnsubscribe=null,reviewPick='',proposalOpen=null,setterTab='practice',busyTimer=0,rendered=false;
 // Embedded consoles are the page itself (owner, 5 Oct 2026): no box, edge to edge under the tabs,
 // sized to the remaining height so the workspace header never scrolls away.
 const EMBEDS={creatorlab:'#creatorlab-host',reels:'#reel-host',leoncontent:'#leoncontent-host',brands:'#brand-host',messages:'#message-host',editor:'#editor-host'};
 function fitEmbed(){
  const main=root.querySelector('.workspace-main');if(!main)return;
  const host=EMBEDS[section]?$(EMBEDS[section]):null,frame=host&&!host.hidden?host.querySelector('iframe'):null;
  // Creator Lab flows with the page (its frame sizes itself); the other consoles fill the remaining height.
  const flow=section==='creatorlab';
  main.classList.toggle('has-embed',Boolean(frame)&&!flow);main.classList.toggle('embed-flow',Boolean(frame)&&flow);if(!frame){if(host)host.style.margin='';return}
  // Embedded apps use the same centred content column as the header and tabs, on every screen width.
  host.style.margin='';
  if(flow){if(!frame.style.height)frame.style.height=Math.max(600,main.clientHeight)+'px';return}
  main.scrollTop=0;const top=frame.getBoundingClientRect().top-main.getBoundingClientRect().top;
  frame.style.height=Math.max(420,Math.floor(main.clientHeight-top-66))+'px';
 }
 window.addEventListener('resize',()=>requestAnimationFrame(fitEmbed));
 // Review queue: one item open at a time; after a decision the next one in the queue opens.
 function applyReviewPick(){const forms=[...root.querySelectorAll('[data-review-item]')];if(!forms.length)return;const pick=forms.some(f=>f.dataset.reviewItem===reviewPick)?reviewPick:forms[0].dataset.reviewItem;forms.forEach(f=>f.hidden=f.dataset.reviewItem!==pick);root.querySelectorAll('.review-pick').forEach(b=>b.setAttribute('aria-current',String(b.dataset.id===pick)))}
 const creatorOptions=({root,filters,refresh:()=>navigate('creatorlab',{refresh:true}),prepareResearch:async(run,post)=>{
  const ticket=serial,request=++researchRequest,selectedBusiness=business;
  preview('Prepare an original idea','<p role="status">Checking the content workspace…</p>');
  let data;try{data=await api('workspace/team/content')}catch(error){if(ticket===serial&&request===researchRequest&&$('#preview').open)$('#preview-body').innerHTML='<p role="alert">'+esc(error.message)+'</p>';return}
  if(ticket!==serial||request!==researchRequest||!$('#preview').open)return;
  if(!data.controlActions?.includes('research.capture')){$('#preview-body').innerHTML='<p>The connected Content Engine does not yet advertise research capture. This requires the prepared Team release before ideas can be saved here.</p>';return}
  const accounts=creatorM.researchAccounts(data,selectedBusiness);
  $('#preview-body').innerHTML='<p class="source">Source @'+esc(post.creator)+' · Reel '+esc(post.id)+' · Analysis '+esc(run.id)+'</p><form id="creator-idea-form" data-self-busy><label>Account<select name="accountId" required><option value="">Choose an account</option>'+accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name||a.label||a.id)+'</option>').join('')+'</select></label><label>Title<input name="title" required maxlength="140"></label><label>Your own angle<textarea name="idea" required maxlength="2500"></textarea></label><p role="status" data-capture-status></p><button type="submit">Save concept to Content Engine</button></form>';
  $('#creator-idea-form').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button'),status=form.querySelector('[data-capture-status]');if(button.disabled)return;let payload;try{payload=creatorM.researchCapture(run,post,Object.fromEntries(new FormData(form)))}catch(error){status.textContent=error.message;return}button.disabled=true;status.textContent='Saving and checking the original content item…';
   try{const item=await creatorM.captureAndVerify(api,payload);contentAt=0;status.textContent='Confirmed in Content Engine: '+item.title+' · '+item.id;button.textContent='Confirmed';form.querySelectorAll('input,textarea,select').forEach(input=>input.disabled=true)}catch(error){status.textContent=error.message+' Your text remains here. Check the content library before retrying.'}
  };
 }});
 let creatorNative=null;const creatorReady=async()=>creatorNative??=(await creatorModule()).createCreatorResearch(creatorOptions);
 // Creator Lab opens on the full original app (as on 3 Oct); "Send to Content Engine" keeps the
 // native saved-analyses view with its research capture.
 // Creator Lab: the original app, themed with office tokens; its sections are the workspace tabs here.
 const CREATOR_PANES=[['explorer','Archive & map'],['findings','Findings'],['run-log','Run activity'],['record','Recording studio'],['radar','Radar watchlists'],['research','Send to Content Engine']];
 let creatorPane=(()=>{try{const v=sessionStorage.getItem('hq-creator-pane');return CREATOR_PANES.some(([id])=>id===v)?v:'explorer'}catch{return 'explorer'}})();
 const creatorTabs=()=>'<div class="creator-mode" role="group" aria-label="Creator Lab sections">'+CREATOR_PANES.map(([id,label])=>'<button type="button" data-action="creator-pane" data-id="'+id+'" aria-pressed="'+(creatorPane===id)+'">'+label+'</button>').join('')+'</div>';
 function creatorFrameGo(frame,pane){
  if(!frame)return;
  if(pane==='record'){if(!/\/creator-lab\/record$/.test(frame.contentWindow?.location?.pathname||''))frame.src='/creator-lab/record';return}
  let doc;try{doc=frame.contentDocument}catch{}
  if(!doc||!/\/creator-lab\/$/.test(frame.contentWindow.location.pathname)){frame.src='/creator-lab/#'+pane;return}
  doc.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+pane));
  // The frame is part of the page: scroll the office page to the section (below the pinned Creator Lab tabs).
  const main=root.querySelector('.workspace-main'),align=()=>{if(pane==='explorer'){main.scrollTo({top:0});return Math.round(main.scrollTop)}const target=doc.getElementById(pane);if(!target)return null;const sticky=($('#view')?.offsetHeight||56)+12;main.scrollTo({top:Math.max(0,Math.round(frame.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop+target.getBoundingClientRect().top-sticky))});return Math.round(main.scrollTop)};
  // Creator Lab renders its data after load, which pushes sections down: re-align until the page settles,
  // but stop as soon as the owner scrolls.
  let placed=align();[250,700,1500,3000].forEach(ms=>setTimeout(()=>{if(placed==null||Math.abs(Math.round(main.scrollTop)-placed)>2||creatorPane!==pane)return;placed=align()},ms));
 }
 // Creator Lab (:5190) is its own local app. When it does not answer, the page says so (with the start command
 // from workspace/services when that route reports one) instead of the bridge's error page inside a frame.
 async function creatorLabState(){
  const services=await settled(api('workspace/services')),list=Array.isArray(services)?services:Array.isArray(services?.services)?services.services:[];
  const entry=list.find(s=>/:5190\b/.test(String(s.origin||s.url||''))||/creator/i.test(String(s.id||s.name||'')))||null;
  if(entry)return {up:/^(up|running|current|ok|online|live|ready|healthy)$/i.test(String(entry.state||entry.status||'')),entry};
  try{const r=await fetch('/creator-lab/api/bootstrap',{credentials:'same-origin',cache:'no-store'});return {up:r.ok,entry:null}}catch{return {up:false,entry:null}}
 }
 const creatorOffline=entry=>stateView({kind:'offline',title:'Creator Lab is not running',body:(entry?.detail?entry.detail+' on port '+(entry.port||5190)+'. ':'Port 5190 does not answer on this Mac. ')+(entry?.start?'Start it with the command below, then check again. Nothing here starts it for you.':'Start Creator Lab, then check again.'),actions:[{label:'Check again',action:'section',id:'creatorlab'}]}).replace('<div class="ui-state-actions">',entry?.start?'<pre class="pk-command"><code>'+esc(entry.start)+'</code></pre><div class="ui-state-actions">':'<div class="ui-state-actions">');
 let creatorUp=false;
 views.creatorlab=Object.assign(async()=>{
  const host=$('#creatorlab-host'),lab=await creatorLabState();creatorUp=lab.up;
  if(!lab.up){host.hidden=true;host.replaceChildren();filters('');return creatorOffline(lab.entry)}
  if(creatorPane==='research'){host.hidden=true;return creatorTabs()+await (await creatorReady())()}
  filters('');host.hidden=false;
  let frame=host.querySelector('iframe');
  if(!frame){host.innerHTML='<iframe class="brand-factory-frame creator-frame" src="/creator-lab/'+(creatorPane==='record'?'record':creatorPane==='explorer'?'':'#'+creatorPane)+'" title="Creator Lab" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"></iframe>';frame=host.querySelector('iframe');frame.addEventListener('load',()=>{if(creatorPane!=='record'&&creatorPane!=='explorer')creatorFrameGo(frame,creatorPane)},{once:true})}
  else creatorFrameGo(frame,creatorPane);
  return creatorTabs();
 },{mount(){if(creatorPane==='research'&&creatorUp)creatorNative?.mount()},stop(){creatorNative?.stop()}});
 // Sales: no Team login inside the office (owner, 5 Oct 2026). The handbook comes from the local Team
 // Hub copy; Setter Studio and Proposals keep their data behind Team Hub and open there.
 const teamHubCard=(title,path,body)=>'<section class="surface teamhub-card"><p class="eyebrow">TEAM HUB</p><h2>'+esc(title)+'</h2><p>'+esc(body)+'</p><div class="actions"><a class="ui-btn ui-btn--primary" href="https://187n.ai'+esc(path)+'" target="_blank" rel="noopener noreferrer">Open '+esc(title)+' ↗</a></div></section>';
 // Sales handbook (Phase 3.3): tiles and the training-video wall above the handbook itself (Dutch content).
 // The page's view switcher: a segmented group whose indicator slides between views of the same page and
 // appears in place when the page changes (9 Oct 2026). Motion follows the workspace rules (motion.mjs).
 function viewSwitch(page,current){
  const host=$('#view-switch'),multi=Boolean(page&&page.views.length>1);host.hidden=!multi;
  if(!multi){host.innerHTML='';delete host.dataset.page;return}
  const same=host.dataset.page===page.id&&host.querySelector('.view-seg');
  const buttons=page.views.map(([v,l])=>'<button type="button" data-section="'+v+'" aria-pressed="'+(v===current)+'">'+esc(l)+'</button>').join('');
  let seg=host.querySelector('.view-seg');
  if(!same){host.innerHTML='<div class="view-seg" role="group" aria-label="'+esc(page.label)+' views">'+buttons+'</div>';seg=host.firstChild;host.dataset.page=page.id;seg.dataset.instant=''}
  else seg.innerHTML=buttons;
  const on=seg.querySelector('[aria-pressed=true]');if(!on)return;
  seg.style.setProperty('--ind-x',on.offsetLeft+'px');seg.style.setProperty('--ind-w',on.offsetWidth+'px');
  // Commit the jump without a transition (style flush), then let later moves slide. No frame wait: the pane pauses frames.
  if(!same||!canAnimate()){seg.dataset.instant='';void getComputedStyle(seg,'::before').transform;delete seg.dataset.instant}
 }
 // New idea form, optionally pre-filled (Studio and the post player). Creating still needs its button. The form is a
 // lazy chunk (11 Oct 2026, entry budget B2).
 async function openIdea(title){const selected=contentSelection(section,business,account).account;const {mountContentCreate}=await import('./content-create.mjs');preview('New content idea','<div data-content-create-host></div>');mountContentCreate($('#preview-body').querySelector('[data-content-create-host]'),{api,account:selected==='all'?'':selected,title,onConfirmed:async item=>{contentAt=0;$('#preview').close();await navigate('content');await editor.open(item.id)}})}
 // Studio's guide remembers whether it was closed (non-bubbling toggle, so a capture listener).
 root.addEventListener('toggle',e=>{if(e.target.matches?.('details.studio-guide'))try{localStorage.setItem('hq-studio-guide',e.target.open?'open':'closed')}catch{}},true);
 // Video editor (11 Oct 2026): FilmCraft in its own host, so the editing session survives page switches.
 let editorM=null;const editorModule=async()=>editorM??=(await import('./editor-view.mjs')).createEditor({esc});
 views.editor=async()=>{filters('');const m=await editorModule();if(section==='editor')await m.show($('#editor-host'));return ''};
 // Studio (9 Oct 2026): the Creative Director's home: next moves, where content waits, what is working.
 let studioM=null;const studioModule=async()=>studioM??=await import('./studio-view.mjs');
 views.studio=async()=>{filters(accountFilters());const selection=contentSelection('studio',business,account);
  const [,m,s,comp,soc]=await Promise.all([teamData(),marketing(),studioModule(),settled(api('workspace/competitors?category=all')),settled(api('workspace/team/social?'+new URLSearchParams({...selection,days:90})))]);
  let guideOpen=true;try{guideOpen=localStorage.getItem('hq-studio-guide')!=='closed'}catch{}
  return s.studioPage({guideOpen,content,competitors:comp,competitorItems:comp&&!comp.error?competitorVideos(comp):[],social:soc,selection},{esc,kit,m,videoWall})};
 views.handbook=async()=>{filters('');const {loadHandbookSummary,handbookTiles,trainingWall}=await handbookMod(),s=await loadHandbookSummary();// The searchable handbook comes first; the training videos follow it (7 Oct 2026).
  return handbookTiles(s,{esc})+'<div data-handbook-native></div>'+kit.panel('Training videos',trainingWall(s,{esc,link:safeLink}),{esc,meta:s.register?s.videos.length+' in the register':'Register not read',cls:'wall-card'})};
 const teamHubNote=(title,path,body)=>'<div class="sync-banner teamhub-note" data-tone="calm"><span class="today-dot" aria-hidden="true"></span><div><strong>'+esc(body)+'</strong><small>Team Hub keeps its own login; everything on this page works without it.</small></div><a class="ui-btn" href="https://187n.ai'+esc(path)+'" target="_blank" rel="noopener noreferrer">Open '+esc(title)+' ↗</a></div>';
 views.setter=async()=>{filters('');const {loadSetter,setterPage}=await localSalesMod();let data;try{data=await loadSetter()}catch{return teamHubCard('Setter Studio','/team/setter','The local setter playbook was not found on this Mac. Setter Studio on 187n.ai still has it.')}
  const p=setterPage(data,{esc,markdown:renderMarkdown,link:safeLink}),tabs=[['practice','Practice'],['playbook','Playbook'],['tone','Tone by lead type'],['links','Links & closers']];
  const bar='<div class="creator-mode setter-mode" role="group" aria-label="Setter Studio">'+tabs.map(([id,label])=>'<button type="button" data-action="setter-tab" data-id="'+id+'" aria-pressed="'+(setterTab===id)+'">'+label+'</button>').join('')+'</div>';
  const body=setterTab==='practice'?'<section class="surface sp" data-setter-practice></section>'+p.history:setterTab==='playbook'?p.stats+card('Playbook',p.playbook):setterTab==='tone'?card('Tone by lead type',p.toneTable):card('Links, resources and closers',p.linkTable);
  return bar+body+teamHubNote('Setter Studio','/team/setter','Exams, scoring and publishing a new setter version stay in Setter Studio on Team Hub.')};
 views.proposals=async()=>{filters('<label class="search">Search<input id="search" type="search" value="'+esc(query)+'" placeholder="Find a client or file…"></label>');const {loadProposals,proposalsPage}=await localSalesMod(),index=await loadProposals();return proposalsPage(index,{esc,query})+teamHubNote('Proposal Studio','/team/proposal','Drafting and pricing new proposals runs in Proposal Studio.')};
 views.leoncontent=async()=>{filters('');if(!$('#leoncontent-host').firstElementChild)$('#leoncontent-host').innerHTML='<iframe class="brand-factory-frame" src="/content-os/" title="Leon Content OS" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"></iframe>';return ''};
 const oldReviews=views.reviews;
 // Production, review and the account network are a lazy chunk (11 Oct 2026, entry budget B2): created on the first of
 // those pages, which registers its form listener then. A page whose navigation moved on returns nothing; open() needs
 // a loaded page (its dialogs read that page's data).
 let engineInst=null,engineP=null;const engineReady=()=>engineP??=import('./content-engine-controls.mjs').then(m=>engineInst??=m.createEngineControls({api,root,filters,getSerial:()=>serial,getReviewSelection:()=>contentSelection('reviews',business,account),getProductionSelection:()=>contentSelection('production',business,account),getAccountSelection:()=>contentSelection('accounts',business,'all'),refresh:()=>{contentAt=0;return navigate(section,{refresh:true})},mediaHTML,preview}),e=>{engineP=null;throw e});
 const enginePage=async(k,a)=>{const ticket=serial,engine=await engineReady();return ticket===serial?engine[k](...a):''};
 const engineControls={accounts:(...a)=>enginePage('accounts',a),production:(...a)=>enginePage('production',a),review:(...a)=>enginePage('review',a),open:target=>engineInst?engineInst.open(target):false};
 views.accounts=engineControls.accounts;views.production=async(...args)=>{const [html,studio,{clipStudio}]=await Promise.all([engineControls.production(...args),loadContentOS(['runs','today','board','connect/status','services/status'],undefined,{wait:2500}),contentOSMod()]);return html+card('Clip studio',clipStudio(studio,{esc,number}))};views.reviews=()=>engineControls.review(oldReviews);
 // Calendar accounts are read in the background on first use; the page re-reads a few times until they arrive.
 let calendarRetries=0;const scheduleRefresh=(ticket,ms)=>{if(calendarRetries>=6)return;calendarRetries++;setTimeout(()=>{if(ticket===serial&&section==='calendar')navigate('calendar',{refresh:true})},ms)};
 const operations=createOperationalViews({api,voice,getBoot:()=>boot,getSerial:()=>serial,getContext,getBusiness:()=>business,filters,esc,number,date,btn,pill,row,rows,empty,metric,card,safeLink,engineCard,connectorMark,scheduleRefresh,kit,preview});
 Object.assign(views,operations.views);
 // Mission Control pages and the runtime panel are lazy chunks (11 Oct 2026, entry budget B2), created on the first visit.
 // Until then enter() only remembers the section (the new instance starts from it) and change() has no controls to
 // serve. The SOUL dialog that other pages open is registered now, as before.
 bindSoulDialog({api,preview,esc});
 let mcInst=null,mcP=null,mcSection='';const mcReady=()=>mcP??=import('./mission-control-views.mjs').then(m=>{mcInst??=m.createMissionControlViews({api,getBoot:()=>boot,getSerial:()=>serial,getContext,filters,esc,number,date,btn,pill,row,rows,metric,card,safeLink,kit,preview});mcInst.enter(mcSection);return mcInst},e=>{mcP=null;throw e});
 const mcPage=async(k,a)=>{const ticket=serial,mc=await mcReady();return ticket===serial?mc.views[k](...a):''};
 const missionControl={views:{librarian:(...a)=>mcPage('librarian',a),memory:(...a)=>mcPage('memory',a),todoist:(...a)=>mcPage('todoist',a),routines:(...a)=>mcPage('routines',a),sessions:(...a)=>mcPage('sessions',a)},enter(next){mcSection=next;mcInst?.enter(next)},change(key,value){mcInst?.change(key,value)}};
 Object.assign(views,missionControl.views);
 let runtimeP=null;const runtimePanel=()=>runtimeP??=import('./runtime-panel.mjs').then(m=>m.createRuntimePanel({root,api,getBoot}),e=>{runtimeP=null;throw e});
 const sessionHistory=views.sessions;
 // Runtime sessions (Departments batch 2): the session history (tiles, charts, table, offline state) first,
 // the execution-access summary and manual handoff form below it.
 views.sessions=async()=>{filters('');const [history,panel]=await Promise.all([sessionHistory().catch(error=>errorState(error)),runtimePanel()]);return history+panel()};
 // Inbox (7 Oct 2026): everything that needs the owner, grouped; phase two appends slower sources.
 // inboxLatestEvent = newest event id the rendered inbox already reflects; history replayed when the socket reconnects is older.
 let inboxSources=null,inboxRuns=[],inboxIndex=0,inboxRefreshTimer=0,inboxLatestEvent=0;
 const inboxSeen=()=>{try{return new Set(JSON.parse(localStorage.getItem('hq-inbox-seen')||'[]').map(String))}catch{return new Set()}};
 // Triage (10 Oct 2026): done and snoozed rows are kept in this browser and leave the list until they change.
 let inboxTriage=loadTriage(),inboxSelected=new Set(),inboxUndo=null,inboxUndoTimer=0;
 const rawInbox=()=>buildInbox(inboxSources,{profiles:boot?.profiles||[],seen:inboxSeen()});
 const inboxModel=()=>{const raw=rawInbox();if(!raw.pending){const live=new Set(raw.groups.flatMap(g=>g.items.map(i=>i.id)));const pruned=prune(inboxTriage,live);if(Object.keys(pruned).length!==Object.keys(inboxTriage).length){inboxTriage=pruned;saveTriage(inboxTriage)}}return applyTriage(raw,inboxTriage)};
 function triage(until,ids){const items=rawInbox().groups.flatMap(g=>g.items).filter(i=>ids.includes(i.id)&&TRIAGE_GROUPS.has(i.group));if(!items.length)return;const prev=inboxTriage;inboxTriage=mark(inboxTriage,items,until);saveTriage(inboxTriage);ids.forEach(id=>inboxSelected.delete(id));inboxUndo={text:items.length+(items.length===1?' row':' rows')+(until==='done'?' marked done':' snoozed until tomorrow'),prev};clearTimeout(inboxUndoTimer);inboxUndoTimer=setTimeout(()=>{inboxUndo=null;paintInbox()},10000);paintInbox()}
 function paintInbox(){const host=$('#view [data-inbox]');if(!host||section!=='inbox')return;host.outerHTML=inboxHTML(inboxModel(),{esc,connectorMark,profiles:boot?.profiles||[],selected:inboxSelected,undo:inboxUndo});focusInboxRow(inboxIndex,false)}
 function inboxRows(){return [...root.querySelectorAll('#view .inbox-row')]}
 function focusInboxRow(i,move=true){const rows=inboxRows();if(!rows.length)return;inboxIndex=Math.max(0,Math.min(rows.length-1,i));rows.forEach((r,n)=>r.tabIndex=n===inboxIndex?0:-1);if(move)rows[inboxIndex].focus()}
 views.inbox=async()=>{
  filters('');const ticket=serial;
  const [[runs,boards,routines,integrations,readiness,events]]=await Promise.all([Promise.all([api('runs'),api('boards'),api('routines'),api('integrations'),api('readiness'),api('events?latest=1')].map(settled)),inboxMod()]);
  inboxRuns=Array.isArray(runs)?runs:[];inboxSources={runs,boards,routines,integrations,readiness,events,pending:true};
  inboxLatestEvent=Math.max(inboxLatestEvent,...(Array.isArray(events?.events)?events.events:[]).map(e=>Number(e?.id)||0));
  Promise.all([api('workspace/team/content'),api('workspace/community/review'),api('workspace/source/brain/librarian'),api('brain/submissions'),api('workspace/todoist/priority'),api('workspace/source/tasks/records'),api('workspace/source/activity?limit=1')].map(settled))
   .then(([content,community,librarian,submissions,priority,tasks,activity])=>{if(ticket!==serial||section!=='inbox')return;Object.assign(inboxSources,{content,community,librarian,submissions,priority,tasks,activity,pending:false});paintInbox()});
  inboxIndex=0;return inboxHTML(inboxModel(),{esc,connectorMark,profiles:boot?.profiles||[]});
 };
 const operationalOverview=views.overview;
 let dashboardLayout=normalizeLayout(null);
 async function renderOverview(ticket,jump,fresh=false){
  const current=()=>ticket===serial;
  const loading=label=>'<p class="notice" role="status">Loading '+label+'…</p>';
  $('#view').innerHTML='<section id="dashboard-pulse" class="pulse-band" aria-label="Office pulse" aria-busy="true"><div class="ui-loading">'+brandTrace({mode:'loop'})+'</div></section><section id="dashboard-today" class="today" aria-busy="true">'+loading('today')+'</section><div class="dashboard-customize" id="dashboard-customize">'+btn('Customize dashboard','dashboard-customize')+'<span>Loading preferences…</span></div><section data-dashboard-widget="revenue" id="dashboard-revenue" class="dashboard-block dashboard-first"><div class="block-title"><p class="eyebrow">BUSINESS PERFORMANCE</p><h2>Revenue</h2></div><div data-dashboard-content="revenue" aria-busy="true">'+loading('revenue')+'</div></section><section data-dashboard-widget="usage" id="dashboard-usage" class="dashboard-block"><div class="dashboard-section-heading"><div class="block-title"><p class="eyebrow">ENGINE USAGE</p><h2>Tokens & models</h2></div><div class="dashboard-period">'+period('Token period')+btn('Model settings','models')+'</div></div><div data-dashboard-content="usage" aria-busy="true">'+loading('usage')+'</div></section><section id="dashboard-operations" class="dashboard-block" aria-busy="true">'+loading('operations')+'</section>';
  applyDashboardLayout(root,dashboardLayout,jump);bindFilters();
  let pending=5;
  const fill=async(selector,read)=>{
   let html;try{html=await read()}catch(e){html='<p class="notice">'+esc(e.message)+'</p>'+btn('Retry dashboard','refresh')}
   if(!current())return;
   const target=$(selector);target.innerHTML=html;target.setAttribute('aria-busy','false');play(target,{key:'overview'+selector,fresh});
   applyDashboardLayout(root,dashboardLayout,jump);
   $('#status').textContent=--pending?'Refreshing remaining sources…':'';
  };
  const layout=settled(api('workspace/dashboard-layout')).then(value=>{
   if(!current())return;
   if(!value.error)dashboardLayout=normalizeLayout(value);
   $('#dashboard-customize').innerHTML=btn('Customize dashboard','dashboard-customize')+'<span>'+(value.error?'Preferences unavailable':dashboardLayout.hidden.length+' widgets hidden')+'</span>';
   applyDashboardLayout(root,dashboardLayout,jump);
  });
  await Promise.all([layout,fill('#dashboard-pulse',async()=>{const [dashboard,usage,routines]=await Promise.all([api('workspace/dashboard'),settled(api('cockpit/usage?days=30')),settled(api('routines'))]);return pulseHTML({dashboard,usage,routines:Array.isArray(routines)?routines:{state:'unavailable'},agents:boot?.profiles||[]},{esc})}),fill('#dashboard-today',()=>todayPanel({api,esc,number})),fill('[data-dashboard-content="revenue"]',()=>views.revenue({embedded:true})),fill('[data-dashboard-content="usage"]',()=>views.usage({embedded:true})),fill('#dashboard-operations',operationalOverview)]);
 }
 function engineCard(s){const t=s.totals,cost=typeof s.cost==='object'?s.cost?.usd:s.cost,costText=cost==null?'Cost not reported':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(cost);return '<article class="engine"><div class="section-head"><span class="engine-icon '+s.id+'">'+engineLogo(s.id)+'</span>'+pill(s.state,s.state)+'</div><h3>'+esc(s.name)+'</h3><strong>'+number(t?.tokens)+'</strong><p>tokens · '+days+' '+(days===1?'day':'days')+'</p><div class="engine-details"><span>Input <b>'+number(t?.input)+'</b></span><span>Output <b>'+number(t?.output)+'</b></span><span>Cache <b>'+number(t?.cacheRead)+'</b></span><span>Sessions <b>'+number(t?.sessions)+'</b></span></div><small>'+esc(s.source||s.reason)+'</small>'+(s.cost!=null?'<details><summary>Cost information</summary><p>'+esc(costText)+' · '+esc(s.costLabel)+'</p></details>':'')+'</article>'}
 async function navigate(next,options={}){
  const jump=['usage','revenue'].includes(next)?next:options.jump;next=normalizeSection(next);if(!views[next])next='overview';if(allowed&&!allowed.has(next))next=[...allowed][0];
  views.creatorlab.stop();nativeSalesUnmount?.();nativeSalesUnmount=null;
  navStarted=Date.now();clearTimeout(draftTimer);const changed=section!==next,fresh=(changed||!rendered)&&!options.refresh;rendered=true;if(changed)calendarRetries=0;if(changed){query='';contentStage='all';root.querySelectorAll('dialog[open]').forEach(d=>d.close())}operations.enter(next);missionControl.enter(next);section=next;
  // Every path (Overview and errors too) leaves no voice subscription or page state behind (audit M3).
  voiceUnsubscribe?.();voiceUnsubscribe=null;document.body.classList.remove('hq-voice-page');const ticket=++serial,searchId=root.activeElement?.id,searchFocused=['search','operation-search'].includes(searchId),caret=root.activeElement?.selectionStart,keepFocus=!changed&&!searchFocused?focusKey(root.activeElement):null;const workspace=scoped(business).find(w=>w.department===workspaceFor(section).department)||scoped('all').find(w=>w.department===workspaceFor(section).department)||workspaceFor(section);$('#brand-host').hidden=section!=='brands';$('#editor-host').hidden=section!=='editor';if(section!=='editor')editorM?.hide();$('#reel-host').hidden=section!=='reels';$('#message-host').hidden=section!=='messages';if(section!=='messages')$('#message-host').replaceChildren();if(section!=='reels')$('#reel-host').replaceChildren();$('#creatorlab-host').hidden=section!=='creatorlab';$('#leoncontent-host').hidden=section!=='leoncontent';$('#view').hidden=['brands','reels','messages','leoncontent','editor'].includes(section);const current=section==='board'?'team':section,page=workspace.pages?.find(p=>p.views.some(([v])=>v===current));$('#title').textContent=(section==='overview'?'Overview':page?.label||({leoncontent:'Clip studio',inbox:'Inbox'})[section])||workspace.label;document.title=$('#title').textContent+' · Agent HQ';$('#section-tabs').innerHTML=(workspace.pages||[]).length>1?workspace.pages.map(p=>'<button data-section="'+p.views[0][0]+'" aria-current="'+(p===page?'page':'false')+'">'+esc(p.label)+(p.views.length>1?'<small>'+p.views.length+'</small>':'')+'</button>').join(''):'';
   // Views inside the page: one switcher under the title (pages group related sections, 9 Oct 2026).
   viewSwitch(page,current);
   // The project selector sets the Chief's working project: shown where agent work is, hidden on content, sales and finance pages.
   $('#project-field').hidden=Boolean(allowed)||section==='inbox'||!['today','operations','tech'].includes(workspace.department);$('#description').textContent=SECTION_DESCRIPTIONS[section]||'';$('#section-group').textContent=(BUSINESSES.find(b=>b.id===business)?.label||'All businesses')+'  /  '+(section==='inbox'?'Inbox':workspace.label);$('#view-scope').textContent=CONTENT_BUSINESS_VIEWS.has(section)?'Content filtered by business and source account':section==='tasks'?'Server-filtered business and project work':['overview','inbox','calendar','agents','activity','connections'].includes(section)?'Across your connected workspace':['chats','voice'].includes(section)?'Selected project':'Connected sources';$('#view').dataset.section=section;clearTimeout(busyTimer);busyTimer=setTimeout(()=>{if(ticket===serial){$('#view').setAttribute('aria-busy','true');$('#busy-trace').hidden=false}},150);$('#status').textContent='Reading your workspace…';filters('');if(CONTENT_BUSINESS_VIEWS.has(section)||section==='delivery')$('#view').innerHTML=loadingView('Loading selected records…');else if(changed)$('#view').innerHTML=loadingView('Opening this page…');
  root.querySelectorAll('.sidebar button[data-section]').forEach(b=>b.setAttribute('aria-current',b.dataset.section===workspace.id?'page':'false'));
  try{boot??=allowed?(getBoot?.()||{projects:[],profiles:[]}):await api('bootstrap');if(ticket!==serial)return;$('#project').innerHTML=boot.projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');$('#project').value=getContext().project;if(section==='overview'){if(!options.refresh)root.querySelector('.workspace-main').scrollTop=0;onNavigate?.(section,options);await renderOverview(ticket,jump,fresh)}else{const renderedAt=Date.now(),html=await views[section]();if(ticket!==serial)return;
   // Pages that read Team content say so when that content is old (audit: stale data looked current).
   $('#view').innerHTML=(contentAt>=renderedAt&&content?.sync&&section!=='outreach'?freshnessBanner(content.sync,{esc,what:'Team content'}):'')+html;play($('#view'),{key:section,fresh});if(section==='creatorlab')views.creatorlab.mount();fitEmbed();requestAnimationFrame(fitEmbed);if(section==='reviews')applyReviewPick();voiceUnsubscribe?.();voiceUnsubscribe=null;document.body.classList.toggle('hq-voice-page',section==='voice');if(section==='voice'&&voice?.subscribe&&$('[data-voice-console]'))import('./voice-console.mjs').then(m=>{const el=$('[data-voice-console]');if(ticket===serial&&section==='voice'&&el&&!voiceUnsubscribe)voiceUnsubscribe=m.mountVoiceConsole(el,voice,{esc,profiles:boot?.profiles||[]}).dispose});if(section==='handbook'&&$('#view').querySelector('[data-handbook-native]'))nativeSalesUnmount=handbookM.mountHandbook($('#view').querySelector('[data-handbook-native]'));if(section==='setter'&&$('#view').querySelector('[data-setter-practice]')){nativeSalesUnmount?.();nativeSalesUnmount=localSalesM.mountSetterPractice($('#view').querySelector('[data-setter-practice]'),{esc})}}if(ticket!==serial)return;$('#status').textContent='';{const fresh=api.freshness?.(navStarted),hm=t=>new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),from=fresh?Date.now()-fresh.age*1000:Date.now();$('#view-updated').textContent=fresh?.failing?'Source not answering · data from '+hm(from):fresh&&fresh.age>300?'Data from '+hm(from)+' · refreshing':'Loaded '+hm(Date.now());$('#view-updated').dataset.state=fresh?.failing?'failing':fresh&&fresh.age>300?'stale':'fresh'}$('#view-updated').title=$('#view-scope').textContent;if(!options.refresh&&section!=='overview')root.querySelector('.workspace-main').scrollTop=0;bindFilters();if(searchFocused&&$('#'+searchId)){$('#'+searchId).focus();$('#'+searchId).setSelectionRange(caret,caret)}else restoreFocus(keepFocus);if(jump)$('#dashboard-'+jump)?.scrollIntoView({block:'start'});if(section!=='overview')onNavigate?.(section,options)}
  catch(e){if(ticket===serial){$('#status').textContent='';$('#view').innerHTML=errorState(e)}}
  finally{if(ticket===serial){clearTimeout(busyTimer);$('#busy-trace').hidden=true;$('#view').setAttribute('aria-busy','false');fitEmbed();
   // Keyboard and screen-reader users land on the new page title (only after a navigation they started).
   if(changed&&!options.refresh&&root.activeElement&&root.activeElement!==$('#title')){const t=$('#title');if(t){t.tabIndex=-1;t.focus({preventScroll:true})}}}}
 }
 function bindFilters(){
  root.querySelectorAll('[data-mission-control]').forEach(el=>{const update=()=>{missionControl.change(el.dataset.missionControl,el.value);clearTimeout(draftTimer);if(el.type==='search')draftTimer=setTimeout(()=>navigate(section,{refresh:true}),250);else navigate(section,{refresh:true})};el[el.type==='search'?'oninput':'onchange']=update});
  if($('#delivery-stage'))$('#delivery-stage').onchange=e=>{deliveryStatus=e.target.value;navigate('delivery',{refresh:true})};
  root.querySelectorAll('[data-control]').forEach(el=>{const update=()=>{operations.change(el.dataset.control,el.value);clearTimeout(draftTimer);if(el.type==='search')draftTimer=setTimeout(()=>navigate(section,{refresh:true}),250);else navigate(section,{refresh:true})};el[el.type==='search'?'oninput':'onchange']=update});
  if($('#content-stage'))$('#content-stage').onchange=e=>{contentStage=e.target.value;navigate(section,{refresh:true})};
  if($('#period'))$('#period').onchange=e=>{days=Number(e.target.value);periodChosen=true;navigate(section,{refresh:true})};
  if($('#account'))$('#account').onchange=e=>{account=e.target.value;query='';navigate(section,{refresh:true})};
  if($('#search'))$('#search').oninput=e=>{query=e.target.value;clearTimeout(draftTimer);draftTimer=setTimeout(()=>navigate(section,{refresh:true}),450)};
  if($('#category'))$('#category').onchange=e=>{category=e.target.value;navigate(section,{refresh:true})};
 }
 $('#project').onchange=async e=>{await setContext({project:e.target.value,profile:'chief',conversation:null});navigate(section,{refresh:true})};
 // Bulk selection (Connections): "Select all" and the live count on "Verify selected".
 // Inbox row checkboxes (10 Oct 2026): selection drives the triage bar; focus stays on the box.
 root.addEventListener('change',e=>{const t=e.target;if(!t.matches?.('[data-inbox-check]'))return;const id=t.dataset.inboxCheck;t.checked?inboxSelected.add(id):inboxSelected.delete(id);paintInbox();root.querySelector('[data-inbox-check="'+CSS.escape(id)+'"]')?.focus()});
 root.addEventListener('change',e=>{const t=e.target;if(!t.matches?.('[data-bulk-check],[data-bulk-all]'))return;
  if(t.matches('[data-bulk-all]'))root.querySelectorAll('[data-bulk-check]').forEach(x=>{x.checked=t.checked});
  const n=root.querySelectorAll('[data-bulk-check]:checked').length,all=root.querySelectorAll('[data-bulk-check]').length,btn=root.querySelector('[data-action="connector-check-selected"]'),box=root.querySelector('[data-bulk-all]');
  if(box){box.checked=n===all&&all>0;box.indeterminate=n>0&&n<all}if(btn){btn.disabled=!n;btn.dataset.armed='';btn.textContent=n?'Verify selected ('+n+')':'Verify selected'}});
 // Tables: j/k or arrows move between rows, Enter opens one (data-table.mjs tableKeydown).
 root.addEventListener('keydown',e=>{if(tableKeydown(e)){e.preventDefault();e.stopPropagation()}});
 // Row "More" menus: one open at a time; a click elsewhere or Escape closes it (7 Oct 2026).
 root.addEventListener('toggle',e=>{if(e.target.matches?.('details.row-more[open]'))root.querySelectorAll('details.row-more[open]').forEach(d=>{if(d!==e.target)d.open=false})},true);
 root.addEventListener('pointerdown',e=>{root.querySelectorAll('details.row-more[open]').forEach(d=>{if(!d.contains(e.target))d.open=false})});
 root.addEventListener('keydown',e=>{const d=e.key==='Escape'&&e.target.closest?.('details.row-more[open]');if(d){d.open=false;d.querySelector('summary').focus();e.stopPropagation()}});
 root.addEventListener('click',async e=>{
  const op=e.target.closest('[data-operation]');if(op){operations.operate(op.dataset.operation,op.dataset.value);await navigate(section,{refresh:true});return}
  const nav=e.target.closest('button[data-section]');if(nav){await navigate(nav.dataset.section);return}
  const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action,id=b.dataset.id,actionSerial=serial;
  try{
   if(a==='section')return navigate(id);
   if(a==='account-all'){account='all';query='';return navigate(section,{refresh:true})}
   // Workflow drawer (7 Oct 2026): ids are profile:job, board:task, run id, profile:session.
   if(a==='agent-workflow'){workflow?.open({kind:'agent',profile:id},b);return}
   if(/^(routine|task|run|session)-workflow$/.test(a)){const kind=a.split('-')[0],[head,...rest]=String(id).split(':'),tail=rest.join(':');workflow?.open(kind==='routine'?{kind,id,profile:head}:kind==='run'?{kind,id}:kind==='task'?{kind,id:tail||head,board:tail?head:''}:{kind,profile:head,id:tail},b);return}
   if(a==='inbox')return navigate('inbox');
   if(a==='period-days'){days=Number(id)||days;periodChosen=true;navigate(section,{refresh:true});return}
   if(a==='inbox-more'){toggleGroup(id);paintInbox();return}
   if(a==='inbox-read'){const ids=(inboxModel().groups.find(g=>g.id==='fyi')?.items||[]).map(i=>String(i.event));try{localStorage.setItem('hq-inbox-seen',JSON.stringify([...inboxSeen(),...ids].slice(-500)))}catch{}paintInbox();return}
   if(a==='inbox-done'){triage('done',[...inboxSelected]);return}
   if(a==='inbox-snooze'){triage(Date.now()+86400000,[...inboxSelected]);return}
   if(a==='inbox-clear'){inboxSelected.clear();paintInbox();return}
   if(a==='inbox-undo'){if(inboxUndo){inboxTriage=inboxUndo.prev;saveTriage(inboxTriage);inboxUndo=null;clearTimeout(inboxUndoTimer)}paintInbox();return}
   if(a==='inbox-restore'){inboxTriage={};saveTriage(inboxTriage);paintInbox();return}
   if(a==='inbox-cancel'){const row=b.closest('.inbox-row');row?.querySelector('.ir-slot')?.replaceChildren();row?.focus();return}
   // Approve and reject never act on the first click: an inline strip names the request and asks to confirm.
   if(a==='inbox-approve'){const [run,request,choice]=String(id).split('|'),row=b.closest('.inbox-row'),item=inboxModel().groups.find(g=>g.id==='approve')?.items.find(i=>i.run===run&&i.request===request);if(!row)return;row.querySelector('.ir-slot').innerHTML=confirmStrip(choice,item?.title||'this request',esc).replace('__ID__',esc(id));row.querySelector('[data-action=inbox-approve-confirm]')?.focus();return}
   if(a==='inbox-approve-confirm'){const [run,request,choice]=String(id).split('|'),slot=b.closest('.ir-slot');b.disabled=true;b.textContent='Sending…';try{await api('runs/'+encodeURIComponent(run)+'/approval',{request_id:request,choice});slot.innerHTML='<p class="ir-done" role="status">'+(choice==='once'?'Approved once.':'Rejected.')+' The agent continues.</p>';setTimeout(()=>{if(section==='inbox')navigate('inbox',{refresh:true})},900)}catch(error){slot.innerHTML=errorState(error)}return}
   if(a==='inbox-answer'){const run=inboxRuns.find(r=>r.id===id),slot=b.closest('.inbox-row')?.querySelector('.ir-slot');if(!run||!slot)return;renderQuestion(slot,run,async(r,body)=>{await api('runs/'+encodeURIComponent(r.id)+'/clarification',body);setTimeout(()=>{if(section==='inbox')navigate('inbox',{refresh:true})},1200)});slot.querySelector('textarea,input')?.focus();return}
   if(a==='work-filter'){operations.enter('tasks');operations.change('stage',id);return navigate('tasks')}
   if(a==='refresh'){await api('cache/refresh',{}).catch(()=>{});contentAt=0;boot=null;const frame=$({brands:'#brand-host',reels:'#reel-host',messages:'#message-host',leoncontent:'#leoncontent-host',creatorlab:'#creatorlab-host'}[section]||'#none')?.querySelector('iframe');if(frame){try{frame.contentWindow.location.reload()}catch{frame.src=frame.src}}return navigate(section,{refresh:true})}
   // Verify selected: a first click asks, a second (within 8 s) runs the fixed read check per account, one at a time.
   if(a==='connector-check-selected'){const ids=[...root.querySelectorAll('[data-bulk-check]:checked')].map(x=>x.value),st=root.querySelector('[data-bulk-status]');if(!ids.length)return;
    if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='Confirm: check '+ids.length+(ids.length===1?' account':' accounts');if(st)st.textContent='Runs the fixed read check on each one. Nothing is sent or approved.';setTimeout(()=>{if(b.isConnected&&b.dataset.armed==='1'){b.dataset.armed='';b.textContent='Verify selected ('+ids.length+')';if(st)st.textContent=''}},8000);return}
    b.dataset.armed='';b.disabled=true;let ok=0,done=0;
    for(const cid of ids){if(actionSerial!==serial)return;b.textContent='Checking '+(++done)+' of '+ids.length+'…';try{const r=await api('integrations/'+encodeURIComponent(cid)+'/check',{});if(r?.state==='verified')ok++}catch{}}
    await navigate(section,{refresh:true});$('#status').textContent=ok+' of '+ids.length+' accounts verified. The rest stay listed with their reason.';return}
   if(a==='connector-check'){b.disabled=true;b.textContent='Checking…';let r;try{r=await api('integrations/'+encodeURIComponent(id)+'/check',{})}finally{await navigate(section,{refresh:true})}$('#status').textContent=r?.state==='verified'?'Verified: '+(r.reason||'read check passed'):'Check finished: '+(r?.reason||r?.state||'not verified');return}
   if(a==='connector-reconnect'){b.disabled=true;b.textContent='Creating login link…';try{const r=await api('integrations/'+encodeURIComponent(id)+'/reconnect',{});const link=safeLink(r.url,'Open Composio login');return preview('Reconnect account','<p>'+esc(r.reason||'Complete the login in the new tab.')+'</p><p class="source">Account: '+esc(r.account||'')+'</p><div class="actions">'+(link?link.replace('<a ','<a class="ui-btn ui-btn--primary" '):'<p role="alert">Composio returned no supported login link.</p>')+'</div><p class="source">When you are done, close this dialog and choose Verify on the account.</p>')}finally{b.disabled=false;b.textContent='Reconnect'}}
   if(a==='routine-op'){const [op,profile,...rest]=String(id).split(':'),rid=rest.join(':');if(!['run','pause','resume'].includes(op)||!profile||!rid)return;b.disabled=true;b.textContent={run:'Starting…',pause:'Pausing…',resume:'Resuming…'}[op];let note;try{await api('routines/'+op,{id:rid,profile});note={run:'Run requested',pause:'Paused',resume:'Resumed'}[op]+' · '+rid}catch(err){note=err.message}await navigate(section,{refresh:true});$('#status').textContent=note;return}
   if(a==='routine-edit'||a==='routine-results')return action(a,id);
   if(a==='voice-start'){voice?.open({start:true,profile:'chief'});return}
   if(a==='voice-stop'){voice?.stop();return}
   if(a==='voice-mute'){voice?.toggleMute();return}
   if(a==='voice-interrupt'){voice?.interrupt();return}
   if(a==='review-pick'){reviewPick=id;applyReviewPick();root.querySelector('.review-detail')?.scrollIntoView({block:'nearest'});return}
   // Production jobs and the account network open their forms and job details in the dialog (Phase 3.3).
   // Studio shortcuts open the production job form with the lane preselected (carousel, stories); nothing starts until Start.
   if(a==='studio-make'){await navigate('production');if(!engineControls.open('job:new:'+id))$('#status').textContent='Production jobs are not available from this source.';return}
   if(a==='engine-open'){if(!engineControls.open(id))$('#status').textContent='This record is no longer in the source. Refresh the page.';return}
   if(a==='video-wall'){const wid=id.slice(0,id.indexOf('|')),wall=b.closest('.vw'),html=wallAction(id);if(wall&&html){wall.outerHTML=html;root.querySelector('.vw[data-wall="'+CSS.escape(wid)+'"] [data-action="video-wall"][data-id="'+CSS.escape(id)+'"]')?.focus()}return}
   if(a==='video-play'){const [wid,itemId]=[id.slice(0,id.indexOf('|')),id.slice(id.indexOf('|')+1)],item=wallItem(wid,itemId);if(!item)return;
    const custom=wallDetail(wid,itemId);if(custom)return preview(custom.title,custom.html);
    const actions=btn('Turn into an idea','idea-from-post',wid+'|'+itemId,true)+(wid==='competitor-videos'?btn('Use in research','competitor-research',item.id):wid==='research-videos'?btn('Use as research','source',item.id):'');
    return preview(item.creator||'Video',playerHTML(item,{esc,link:safeLink,actions}))}
   if(a==='setter-tab'){setterTab=['practice','playbook','tone','links'].includes(id)?id:'practice';return navigate(section,{refresh:true})}
   if(a==='proposal-open'){const at=id.indexOf('|');proposalOpen={client:id.slice(0,at),file:id.slice(at+1)};await navigate(section,{refresh:true});$('#view .pdf-viewer')?.scrollIntoView({block:'start'});return}
   if(a==='proposal-close'){proposalOpen=null;return navigate(section,{refresh:true})}
   if(/^table-(sort|page|tab|filter|unfilter|clear|view-save|view|view-delete)$/.test(a)){tableAction(a.slice(6),id);
    // Re-render just this table from the data already on screen; keep focus on the control.
    const tid=id.slice(0,id.indexOf(':')),table=b.closest('.dt'),html=rerenderTable(tid);
    if(!table||!html)return navigate(section,{refresh:true});
    const label=b.textContent;table.outerHTML=html;const fresh=root.querySelector('.dt[data-table="'+CSS.escape(tid)+'"]'),same=[...(fresh?.querySelectorAll('[data-action="'+a+'"]')||[])];
    // Removing a filter, clearing, deleting a view or picking from the menu lands on "+ Filter": focusing another ×
    // there let a second Enter remove the next filter (8 Oct 2026).
    if(/^table-(unfilter|clear|view-delete|filter|view)$/.test(a)){(fresh?.querySelector('.dt-add>summary')||fresh?.querySelector('button'))?.focus();return}
    (same.find(x=>x.dataset.id===id)||same.find(x=>x.textContent===label&&!x.disabled)||same[0])?.focus();return}
   if(a==='show-more'){const list=b.previousElementSibling;if(list?.matches('[data-paged]'))list.classList.add('expanded');b.remove();return}
   if(a==='creator-pane'){const was=creatorPane;creatorPane=CREATOR_PANES.some(([p])=>p===id)?id:'explorer';try{sessionStorage.setItem('hq-creator-pane',creatorPane)}catch{}
    if(was!=='research'&&creatorPane!=='research'){root.querySelectorAll('[data-action=creator-pane]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===creatorPane)));creatorFrameGo($('#creatorlab-host iframe'),creatorPane);return}
    return navigate('creatorlab',{refresh:true})}
   if(a==='office')return action('office');
   if(a==='dashboard-customize'){
    const current=normalizeLayout(await api('workspace/dashboard-layout'));if(actionSerial!==serial)return;
    preview('Customize dashboard','<form id="dashboard-layout-form"><p>Choose which widgets appear in Mission Control.</p>'+DASHBOARD_WIDGETS.map(([key,label])=>'<label class="dashboard-widget-option"><input type="checkbox" name="widgets" value="'+key+'" '+(!current.hidden.includes(key)?'checked':'')+'>'+label+'</label>').join('')+'<div class="actions"><button type="button" id="dashboard-show-all">Show all</button><button class="primary" type="submit">Save layout</button></div></form>');
    $('#dashboard-show-all').onclick=()=>$('#dashboard-layout-form').querySelectorAll('input').forEach(el=>el.checked=true);
    $('#dashboard-layout-form').onsubmit=async e=>{e.preventDefault();const shown=new FormData(e.target).getAll('widgets');dashboardLayout=normalizeLayout(await api('workspace/dashboard-layout',{revision:current.revision,hidden:DASHBOARD_WIDGETS.map(([key])=>key).filter(key=>!shown.includes(key))}));$('#preview').close();if(actionSerial===serial)await navigate('overview',{refresh:true})};return;
   }
   if(a==='close-preview'){return $('#preview').close()}
   if(a==='item')return editor.open(id);
   if(a==='conversation'){const c=(await api('conversations')).find(c=>c.id===id);if(c)await setContext({project:c.project,profile:c.profile,conversation:c.id});if(actionSerial===serial)return action('office');return}
   if(a==='revenue-period'){revenueFilter=new URLSearchParams({from:$('#revenue-from').value,to:$('#revenue-to').value,currency:$('#revenue-currency').value}).toString();return navigate('overview',{refresh:true,jump:'revenue'})}
   // A post that works becomes an idea: the form opens pre-filled with its hook and creator (9 Oct 2026).
   if(a==='idea-from-post'){const [wid,itemId]=[id.slice(0,id.indexOf('|')),id.slice(id.indexOf('|')+1)],item=wallItem(wid,itemId);if(!item)return;const hook=String(item.title||item.text||'').split(/\n+/).map(l=>l.replace(/https?:\/\/\S+/g,'').trim()).find(l=>l.length>=6)||'';return openIdea(hook?(hook.length>140?hook.slice(0,139).trimEnd()+'…':hook)+(item.creator?' (angle from '+item.creator+')':''):'')}
   if(a==='new-content')return openIdea('');
   if(a==='delivery-layout'){deliveryLayout=id;return navigate('delivery',{refresh:true})}
   if(a==='todoist-priority-status'){const result=await api('workspace/todoist/priority/'+encodeURIComponent(id));return preview('Priority action status',row(result.title||result.id,result.verified?'Verified in Todoist: P'+(5-result.actualPriority):'Status: '+result.status+' · not verified'))}
   if(a==='todoist-priority'){
    const d=await api('workspace/source/tasks/records'),r=(d.records||[]).find(r=>String(r.externalId)===id);if(!r)throw new Error('Task is no longer available. Refresh Todoist.');
    const raw=r.data||r.raw||{};
    preview('Change priority', '<p>'+esc(raw.content||id)+'</p><form id="todoist-priority-form"><label>Priority<select name="priority">'+[4,3,2,1].map(p=>'<option value="'+p+'" '+(p===raw.priority?'selected':'')+'>P'+(5-p)+'</option>').join('')+'</select></label><button>Preview change</button><p role="status" id="todoist-priority-status"></p></form>');
    $('#todoist-priority-form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;
     try{const p=await api('workspace/todoist/priority/preview',{id,priority:Number(new FormData(form).get('priority')),version:r.version||''});
      preview('Confirm priority change', '<p>'+esc(p.title||id)+'</p>'+row('Priority','P'+(5-p.previousPriority)+' → P'+(5-p.priority))+row('Source task',p.id)+row('Expires',date(p.expiresAt))+'<button id="todoist-priority-confirm">Confirm change</button><button id="todoist-priority-check">Check status</button><p role="status" id="todoist-priority-result"></p>');
      const output=$('#todoist-priority-result'),confirm=$('#todoist-priority-confirm'),check=$('#todoist-priority-check');
      let attempted=false;const run=async execute=>{if(execute)attempted=true;confirm.disabled=true;check.disabled=true;try{const result=await api('workspace/todoist/priority/'+encodeURIComponent(p.actionId),execute?{}:undefined);output.textContent=result.verified?'Verified in Todoist: P'+(5-result.actualPriority):'Action status: '+result.status+'. Priority has not been verified.';}catch(error){output.textContent=error.message+' Use Check status to reconcile.';}finally{check.disabled=false;confirm.disabled=attempted;}};
      confirm.onclick=()=>run(true);check.onclick=()=>run(false);
     }catch(error){$('#todoist-priority-status').textContent=error.message;button.disabled=false;}
    };return
   }
   if(a==='finance-detail'){
    const request=++financeRequest;$('#preview').close();
    try{const d=await api('workspace/records/finance/item?'+new URLSearchParams({id,revision:b.dataset.revision||''}));if(request!==financeRequest||actionSerial!==serial)return;if(d.record?.recordId!==id||d.source?.sha256!==b.dataset.revision)throw new Error('Finance source identity did not match. Refresh the register.');const {renderFinanceDetail}=await import('./business-records.mjs');if(request!==financeRequest||actionSerial!==serial)return;return preview('Finance source record',renderFinanceDetail(d,{esc}));}
    catch(error){if(request===financeRequest&&actionSerial===serial)throw error;return}
   }
   if(a==='delivery-report'){
    preview('Local build review','<p role="status">Reading the original local review…</p>');
    const marker=$('#preview-body').firstElementChild,current=()=>actionSerial===serial&&$('#preview').open&&$('#preview-body').firstElementChild===marker;
    try{const report=await (await import('./delivery-review.mjs')).readDeliveryReview(id);if(!current())return;return preview('Local build review','<p class="source">'+esc(report.path)+'</p><p class="notice">Current source document. Local QA does not confirm production or client acceptance.</p><pre class="script-reader">'+esc(report.text)+'</pre>')}
    catch(error){if(current())preview('Local build review','<p role="alert">'+esc(error.message)+'</p>'+btn('Retry local review','delivery-report',id));return}
   }
   // Delivery detail (Departments batch 2): business fields first, gates, notes; the verification rows collapsed.
   if(a==='delivery-detail'){$('#preview').close();const selected=deliveryRecords[Number(id)];if(!selected)return;const [r,m]=await Promise.all([deliveryDetail(selected.externalId),import('./delivery-view.mjs')]);if(!r||actionSerial!==serial)return;return preview(r.project||r.name||'Delivery project',m.deliveryDialog(r,{esc,date,link:safeLink,btn}))}
   if(a==='read-script'){let i=content.items.find(i=>i.id===id);if(!i)return;
    // Lists carry a script preview only; the full text comes from the item itself.
    if(i.scriptTruncated){const d=await api('workspace/team/item?id='+encodeURIComponent(id));if(actionSerial!==serial)return;i=d?.item||i}
    return preview(i.title,'<div class="script-reader">'+esc(i.script||i.blocks?.map(b=>b.text).join('\n\n')||i.hook||'No script yet.')+'</div>')}
   if(a==='campaign'){const c=content.campaigns.find(c=>c.accountId+':'+c.slug===id);if(!c)return;const media=Boolean(content?.integrationCapabilities?.media),formats=c.formats||{};return preview(c.title||c.slug,'<div class="campaign-head">'+(c.keyword?'<span class="ui-badge">'+esc(c.keyword)+'</span>':'')+'<small>@'+esc(c.accountId)+' · DM automation: '+esc(kit.englishMap(c.automationStatus||'Not verified',mv?.AUTOMATION_EN||{}))+'</small></div><p>'+esc(c.summary||'')+'</p><p class="detail-links">'+safeLink(c.guideUrl,'Lead magnet NL')+safeLink(c.guideEn,'Lead magnet EN')+'</p>'+(media?'':mediaPending)+['story','carousel'].filter(f=>(formats[f]||[]).length).map(f=>slideStrip(f,formats[f],media)).join('')+'<h3>Caption</h3><pre class="caption-text">'+esc(c.caption||'')+'</pre><button type="button" class="primary" data-action="copy-caption" data-id="'+esc(id)+'">Copy caption</button>')}
   if(a==='copy-caption'){const c=content.campaigns.find(c=>c.accountId+':'+c.slug===id);try{await navigator.clipboard.writeText(c?.caption||'');b.textContent='Copied'}catch{b.textContent='Copy failed — select the text'}return}
   if(a==='outreach-record'){const r=outreach?.records?.find(r=>r.id===id);if(!r)throw Error('This lead is no longer in the outreach queue. Refresh the list.');const m=await marketing();return preview(r.name||r.company||'Lead',m.dossierDialog(r,{esc,users:content?.users||[]}))}
   if(a==='review'){const j=content.jobs.find(j=>j.id===id);if(!j)throw Error('This result is no longer in the source. Refresh the list.');const m=await marketing();return preview('Review · '+m.jobKind(j.kind),m.jobDetail(j,{esc,item:content.items.find(i=>i.id===j.itemId),mediaHTML,data:content})+'<div class="actions">'+btn('Approve','review-approve',id,true)+btn('Request changes','review-reject',id)+'</div><p>Review does not publish.</p>')}
   if(a.startsWith('review-')){const j=content.jobs.find(j=>j.id===id);await api('workspace/team/content',{action:'job.review',id,finishedAt:j.finishedAt,decision:a==='review-approve'?'approved':'rejected'});contentAt=0;$('#preview').close();return navigate('reviews')}
   if(a==='source'||a==='competitor-research'){
    const selectedBusiness=business,request=++researchRequest;preview('Use in content research','<p role="status">Checking available accounts…</p>');
    const data=await api('workspace/team/content');if(actionSerial!==serial||request!==researchRequest||!$('#preview').open)return;
    const {researchAccounts,captureAndVerify}=await creatorModule();
    const accounts=researchAccounts(a==='source'?{accounts:data.accounts}:data,selectedBusiness);
    $('#preview-body').innerHTML='<form id="research-form" data-self-busy><label>Account<select name="accountId" required><option value="">Choose an account</option>'+accounts.map(entry=>'<option value="'+esc(entry.id)+'">'+esc(entry.name||entry.label||entry.id)+'</option>').join('')+'</select></label><label>Title<input name="title" required maxlength="300"></label><label>Your angle<textarea name="idea" required maxlength="2500"></textarea></label><p data-research-status role="status"></p><button class="primary">Save and verify research</button></form>';
    $('#research-form').onsubmit=async e=>{
     e.preventDefault();const form=e.target,button=form.querySelector('button'),status=form.querySelector('[data-research-status]');if(button.disabled)return;
     const fields=Object.fromEntries(new FormData(form));if(!accounts.some(entry=>entry.id===fields.accountId)){status.textContent='Choose one of the available accounts.';return}
     const payload={action:'research.use',id,sourceId:id,...fields,account:fields.accountId};button.disabled=true;status.textContent='Saving and checking the original item…';
     try{const item=await captureAndVerify(api,payload,a==='source'?'workspace/team/content':'workspace/competitors/research');contentAt=0;status.textContent='Confirmed: '+item.title+' · '+item.id;button.textContent='Confirmed';form.querySelectorAll('input,textarea,select').forEach(input=>input.disabled=true)}
     catch(error){status.textContent=error.message+' Your text remains here. Check the content library before retrying.'}
    };return
   }
   if(a==='new-follow-up'){const {mountSalesFollowup}=await followupMod();preview('New follow-up','<div data-sales-followup></div>');mountSalesFollowup($('#preview-body').querySelector('[data-sales-followup]'),{api,task:{revision:0,area:'sales',status:'todo'},users:content.users,onConfirmed:()=>{contentAt=0}});return}
   if(a==='follow-up'){const t=content.tasks.find(t=>t.id===id);if(!t)throw Error('This task no longer exists. Refresh the list.');const {mountSalesFollowup}=await followupMod();preview(t.title,'<div data-sales-followup></div>');mountSalesFollowup($('#preview-body').querySelector('[data-sales-followup]'),{api,task:t,users:content.users,onConfirmed:()=>{contentAt=0}});return}
   if(a==='sales-record'){const r=content.hermon.leads.find(r=>(r.externalId||r.id)===id);if(!r)throw Error('This lead is no longer in the Hermon snapshot. Refresh the list.');const m=await marketing();return preview(r.name||r.fullName||'Hermon lead · '+(kit.dayLabel(r.createdAt)||'date not recorded'),m.hermonDialog(r,{esc}))}
   if(a==='research-detail'){const list=Array.isArray(content.research)?content.research:content.research?.items||content.research?.briefs||[];const record=list.find(r=>r.id===id);return preview(record?.title||'Research',rows([['Status',record?.status],['Summary',record?.summary||record?.observation],['Angle',record?.idea||record?.angle]],([label,value])=>row(label,value||'Not recorded'))+safeLink(record?.url,'Open source'))}
   await action(a,id,()=>actionSerial===serial);
  }catch(error){$('#status').textContent=error.message}
 });
 root.addEventListener('submit',e=>{if(e.target.id==='edit-form')return;const handler=e.target.onsubmit;if(!handler)return;e.preventDefault();e.stopImmediatePropagation();const button=e.target.querySelector('button[type=submit],button.primary');if(button?.disabled)return;
  // Forms that manage their own busy state (data-self-busy) keep control of their button (audit H1).
  const own=e.target.hasAttribute('data-self-busy');if(button&&!own)button.disabled=true;Promise.resolve(handler(e)).then(()=>{contentAt=0}).catch(error=>{let notice=e.target.querySelector('[role=alert]');if(!notice){notice=document.createElement('p');notice.setAttribute('role','alert');e.target.append(notice)}notice.textContent=error.message}).finally(()=>{if(button&&!own)button.disabled=false})},true);

 // Calendar shortcuts (7 Oct 2026): t = today, arrows = previous/next period; never while typing or in a dialog.
 window.addEventListener('keydown',e=>{
  if(host.hidden||section!=='calendar'||e.metaKey||e.ctrlKey||e.altKey||!['t','ArrowLeft','ArrowRight'].includes(e.key))return;
  if(e.composedPath().some(t=>t&&(['INPUT','TEXTAREA','SELECT','DIALOG'].includes(t.tagName)||t.isContentEditable)))return;
  e.preventDefault();operations.operate(e.key==='t'?'today':'period',e.key==='ArrowLeft'?-1:1);navigate('calendar',{refresh:true});
 });
 // Inbox keyboard (7 Oct 2026): j/k or arrows move between rows, Enter acts on the focused row, Escape cancels.
 window.addEventListener('keydown',e=>{
  if(host.hidden||section!=='inbox'||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.composedPath().some(t=>t&&(['INPUT','TEXTAREA','SELECT','DIALOG'].includes(t.tagName)||t.isContentEditable)))return;
  const rows=inboxRows();if(!rows.length)return;
  const row=rows[inboxIndex],confirming=Boolean(row?.querySelector('.ir-confirm')),onRow=e.composedPath()[0]?.classList?.contains('inbox-row');
  if(e.key==='Escape'&&confirming){e.preventDefault();row.querySelector('[data-action=inbox-cancel]')?.click();return}
  const next=inboxKeys(e.key,{index:inboxIndex,count:rows.length,confirming});
  if(['j','k'].includes(e.key)||(onRow&&['ArrowDown','ArrowUp'].includes(e.key))){e.preventDefault();focusInboxRow(next.index);return}
  if(next.act==='primary'&&onRow){e.preventDefault();(row.querySelector('.ir-actions .primary')||row.querySelector('.ir-actions button'))?.click()}
  // x selects the focused row, e marks it done (Gmail / Linear keys).
  if(onRow&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&(e.key==='x'||e.key==='e')){const id=row.dataset.inboxId,box=row.querySelector('[data-inbox-check]');if(!box)return;e.preventDefault();if(e.key==='x'){inboxSelected.has(id)?inboxSelected.delete(id):inboxSelected.add(id);paintInbox()}else triage('done',[id])}
 });
 function inboxLive(event){
  if(section!=='inbox'||host.hidden||!/^(run\.|task\.|approval\.|clarification\.|routine\.|connector\.|knowledge\.)/.test(event?.kind||''))return;
  const id=Number(event?.id);if(Number.isFinite(id)){if(id<=inboxLatestEvent)return;inboxLatestEvent=id}
  clearTimeout(inboxRefreshTimer);inboxRefreshTimer=setTimeout(()=>{if(section==='inbox'&&!root.querySelector('#view .ir-confirm,#view .question-form'))navigate('inbox',{refresh:true})},1500);
 }
 return {open:navigate,root,setBusiness,inboxLive,stopVoiceConsole(){voiceUnsubscribe?.();voiceUnsubscribe=null},get section(){return section},get usage(){return lastUsage},close(){voiceUnsubscribe?.();voiceUnsubscribe=null;document.body.classList.remove('hq-voice-page');views.creatorlab.stop();nativeSalesUnmount?.();nativeSalesUnmount=null;clearTimeout(draftTimer);serial++;}};
}
