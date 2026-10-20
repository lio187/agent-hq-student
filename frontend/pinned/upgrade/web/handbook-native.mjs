// Source content is read from the owner's local Team Hub copy (/hq-handbook/, no Team login). No fetched scripts,
// styles, event handlers or forms are executed in the owner's application. The handbook text stays Dutch
// (lang="nl"); the office chrome around it is English (Phase 3.3, 7 Oct 2026).
import * as kit from './page-kit.mjs';
import {embedURL} from './video-wall.mjs';
const BASE='/hq-handbook/';
const FILES=new Set(['SNEL.html','SNEL-PRINT.html','FAQ.csv','START.html','PRINT.html','SETTER-PRINT.html','CLOSER-PRINT.html','01-handboek.pdf','01-handboek.md','02-setterspiekkaart.pdf','02-setterspiekkaart.md','03-closerspiekkaart.pdf','03-closerspiekkaart.md','04-training-en-rollenspellen.md','05-bronnen-en-methode.md','YOUTUBE-REGISTER.csv','LEESMIJ.md','CONTROLE.json','SHA256SUMS.txt','OFL-space-grotesk.txt','187N-Sales-Team.zip','Tone-of-voice-framework.md','Tone-of-voice-framework.json','Kandidaten-intake.csv','Bestaand-overdrachtspakket.zip','Setter-framework-Team.zip']);
const TAGS=new Set('div aside nav main header footer section article h1 h2 h3 h4 p strong em b i small span a ul ol li blockquote br table thead tbody tr th td code button input select option label textarea'.split(' '));
const ATTRS=new Set('id class title aria-label aria-pressed aria-live role hidden data-group data-offer data-phase data-channel data-keywords value for placeholder autocomplete spellcheck'.split(' '));
export function handbookLink(value){
 if(/^#[A-Za-z0-9_-]+$/.test(value))return value;
 const LEGACY='/team/sales-handboek/',name=value.startsWith(BASE)?value.slice(BASE.length):value.startsWith(LEGACY)?value.slice(LEGACY.length):value;
 if(FILES.has(name))return BASE+name;
 try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href}catch{}
 return null;
}
export const normalizeHandbook=value=>String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function handbookMatches(card,{group='Alles',query='',offer='all',phase='all',channel='all'}={}){
 return (group==='Alles'||card.group===group)&&(offer==='all'||card.offer==='beide'||card.offer===offer)&&(phase==='all'||card.phase==='alle'||card.phase===phase)&&(channel==='all'||card.channel==='beide'||card.channel===channel)&&normalizeHandbook(query).trim().split(/\s+/).filter(Boolean).every(term=>normalizeHandbook(card.text+' '+(card.keywords||'')).includes(term));
}
export function copyHandbookTree(node,document){
 if(node.nodeType===3)return document.createTextNode(node.textContent);
 if(node.nodeType!==1||!TAGS.has(node.localName))return null;
 const clean=document.createElement(node.localName);
 for(const {name,value} of node.attributes)if(ATTRS.has(name))clean.setAttribute(name,value);
 if(node.localName==='button')clean.type='button';
 if(node.localName==='input')clean.type='search';
 if(node.localName==='a'){
  const href=handbookLink(node.getAttribute('href')||'');
  if(href){clean.setAttribute('href',href);if(!href.startsWith('#')){clean.target='_blank';clean.rel='noopener noreferrer'}}
 }
 for(const child of node.childNodes){const safe=copyHandbookTree(child,document);if(safe)clean.append(safe)}
 return clean;
}
const CSS=`
:host{display:block;color:var(--text-primary,#fff);font-family:var(--font-ui,system-ui,sans-serif);line-height:1.55;color-scheme:dark}
*{box-sizing:border-box}[hidden]{display:none!important}.shell{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px}.sidebar{min-width:0;padding:16px;border:1px solid var(--border-soft,#ffffff14);border-radius:18px;background:var(--bg-glass-1,#ffffff08)}main{min-width:0}.brand{font-size:22px}.nav{display:grid;gap:6px;margin:24px 0}.nav button{text-align:left}.nav button.active{background:var(--bg-active,rgba(255,255,255,.08));color:var(--text-primary,#fff);box-shadow:inset 0 0 0 1px var(--border-mid,#383b3f)}.eyebrow,.meta,.source,footer{font-size:12px;color:var(--text-secondary,#a1a1aa)}a{color:inherit;text-underline-offset:3px}button,input,select,textarea{font:inherit;color:inherit;background:var(--bg-panel,#0f1011);border:1px solid var(--border-mid,#ffffff24);border-radius:10px;padding:10px;max-width:100%}button{cursor:pointer}button:hover{border-color:#fff}input,select,textarea{width:100%}textarea{min-height:220px;resize:vertical}.toolbar,.card,.faq-actions{padding:22px;border:1px solid var(--border-soft,#ffffff14);border-radius:18px;background:var(--bg-glass-1,#ffffff08);margin-bottom:16px}.card{overflow:auto;scroll-margin-top:20px}.searchrow,.filters,.quick,.downloads,.faq-actions{display:flex;gap:10px;flex-wrap:wrap}.searchrow input{flex:1;min-width:140px}.filters{margin-top:14px}.filters label{flex:1;min-width:120px}.downloads{flex-direction:column}.quick{margin:18px 0}.quick a,.tag{padding:5px 9px;border:1px solid var(--border-soft,#ffffff14);border-radius:8px}.meta{display:flex;gap:8px;flex-wrap:wrap}.resulthead{display:flex;align-items:center;justify-content:space-between;gap:12px}.card h2{font-size:22px}h1{font-size:32px}h1 em{font-family:var(--font-ui,system-ui,sans-serif)}blockquote{margin:16px 0;padding:16px;border-left:2px solid var(--border-glow,#ffffff38);background:var(--bg-glass-2,#ffffff0d)}.copy{display:block;font-size:12px;margin-top:12px}table{border-collapse:collapse;min-width:100%}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid var(--border-soft,#ffffff14)}th{background:var(--bg-glass-2,#ffffff0d)}.faq-actions h2,.faq-actions textarea{flex-basis:100%}.hero-aside,.team-context{border-left:2px solid var(--border-mid,#ffffff24);padding-left:16px}.notice{padding:12px;border:1px solid var(--border-mid,#ffffff24);border-radius:10px}#native-handbook-status{position:sticky;bottom:0;background:var(--bg-panel,#0f1011);padding:12px;border:1px solid var(--border-mid,#ffffff24);z-index:2}:is(button,a,input,select,textarea):focus-visible{outline:2px solid #fff;outline-offset:3px}/* Office polish (6 Oct 2026): sidebar-style menu with counts, office radii and type, compact links. */
.shell{grid-template-columns:220px minmax(0,1fr);gap:28px}.sidebar{position:sticky;top:0;align-self:start;max-height:calc(100dvh - 220px);overflow:auto;padding:14px 10px;border-radius:12px;background:transparent;border-color:var(--border-soft,#ffffff14);scrollbar-width:thin}
.brand{font:590 15px/1.2 var(--font-ui,system-ui);padding:0 8px}.brand+*,.sidebar>p{padding:0 8px;font-size:12px;color:var(--text-tertiary,#7e838c)}
.nav{gap:2px;margin:14px 0}.nav button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:7px 10px;border:0;border-radius:6px;background:transparent;font:510 13px/1.3 var(--font-ui,system-ui);color:var(--text-secondary,#8a8f98)}
.nav button small{font:510 11.5px/1 var(--font-ui,system-ui);color:var(--text-tertiary,#7e838c);font-variant-numeric:tabular-nums}.nav button:hover{background:var(--bg-hover,rgba(255,255,255,.05));color:var(--text-primary,#fff);border:0}
.nav button.active{background:var(--bg-active,rgba(255,255,255,.08));color:var(--text-primary,#fff);box-shadow:none}.nav button.active small{color:var(--text-secondary,#8a8f98)}
.sidebar h2,.sidebar h3,.sidebar strong{display:block;margin:16px 8px 6px;font:590 11px/1.2 var(--font-ui,system-ui);letter-spacing:.04em;text-transform:uppercase;color:var(--text-tertiary,#7e838c)}
h1{font:590 28px/1.15 var(--font-ui,system-ui);letter-spacing:-.02em;margin:6px 0 14px}.card h2{font:590 18px/1.3 var(--font-ui,system-ui);letter-spacing:-.01em}
.eyebrow,.meta,.source,footer{color:var(--text-tertiary,#7e838c)}p,li,td{color:var(--text-body,var(--color-mist,#d0d6e0))}
button,input,select,textarea{border-radius:6px;border-color:var(--border-soft,#ffffff14);padding:8px 10px;font-size:13px}button:hover{border-color:var(--border-mid,#383b3f);background:var(--bg-hover,rgba(255,255,255,.05))}
.toolbar,.card,.faq-actions{padding:18px 20px;border-radius:12px;background:var(--bg-elevated,#161718)}
.downloads{flex-direction:row;flex-wrap:wrap;gap:8px;margin:12px 0}.downloads a,.quick a,.tag{display:inline-flex;align-items:center;height:28px;padding:0 10px;border:1px solid var(--border-soft,#ffffff14);border-radius:999px;font-size:12.5px;text-decoration:none;color:var(--text-secondary,#8a8f98)}
.downloads a:hover,.quick a:hover{color:var(--text-primary,#fff);border-color:var(--border-mid,#383b3f)}.hero-aside,.team-context{border-left-color:var(--border-soft,#ffffff14)}
:is(button,a,input,select,textarea):focus-visible{outline:2px solid var(--border-glow,#d0d6e0);outline-offset:2px}
@media(max-width:800px){.shell{display:block}.sidebar{margin-bottom:18px}.nav{display:flex;overflow:auto}.nav button{flex-shrink:0}.downloads{flex-direction:row}.card,.toolbar{padding:15px}}
`;
// Overview (Phase 3.3): one read of the handbook page and the video register. The mount below reuses that page
// once (within a minute) instead of reading it a second time.
let prefetched=null;
const takePrefetched=()=>{const p=prefetched;prefetched=null;return p&&Date.now()-p.at<60000?p.html:null};
export async function loadHandbookSummary(fetcher=globalThis.fetch){
 const read=(name,type)=>fetcher(BASE+name,{credentials:'same-origin',cache:'no-store',redirect:'manual'}).then(async r=>r.ok&&(r.headers.get('Content-Type')||'').startsWith(type)?r.text():null).catch(()=>null);
 const [page,register]=await Promise.all([read('START.html','text/html'),read('YOUTUBE-REGISTER.csv','text/csv')]);
 if(page)prefetched={html:page,at:Date.now()};
 return summarizeHandbook(page,register);
}
const decode=v=>String(v).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
// The register's statuses are written in Dutch; the office shows them in English (unknown values pass through).
export const VIDEO_STATUS_EN={'Volledig transcript gelezen':'Transcript read in full','Metadata gescreend':'Metadata screened','Gedownload, niet inhoudelijk gelezen':'Downloaded, not reviewed','Captions niet beschikbaar':'No captions available'};
export function summarizeHandbook(page,register){
 const html=String(page||''),groups=[...new Set([...html.matchAll(/<button[^>]*\bdata-group="([^"]+)"/g)].map(m=>decode(m[1])))].filter(g=>g!=='Alles');
 const links=[...((/class="downloads"([\s\S]*?)<\/div>/.exec(html)||[])[1]||'').matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
 const rows=register==null?[]:kit.parseCSV(register,{header:true}).filter(r=>r.id&&r.url);
 const videos=rows.map((r,n)=>({id:r.id,order:n,platform:'youtube',url:r.url,title:r.title||'Untitled video',creator:r.channel||'',channel:r.channel||'',minutes:Number(r.minutes)||null,status:kit.englishMap(r.status,VIDEO_STATUS_EN)||'Not recorded',selection:r.selection||''}));
 return {available:Boolean(page),sections:(html.match(/class="card"/g)||[]).length,groups,downloads:links.filter(h=>!/\.html?$/i.test(h)).length,videos,register:register!=null};
}
const hours=m=>m>=90?(m/60).toFixed(1).replace(/\.0$/,'')+' h':Math.round(m)+' min';
export function handbookTiles(s,{esc}){
 const minutes=s.videos.reduce((t,v)=>t+(v.minutes||0),0),full=s.videos.filter(v=>v.status===VIDEO_STATUS_EN['Volledig transcript gelezen']).length;
 return kit.tileRow([
  {label:'Sections',value:s.available?s.sections:'—',caption:s.available?'Cards in the handbook':'Handbook page not read'},
  {label:'Groups',value:s.available?s.groups.length:'—',caption:'Chapters in the side menu'},
  {label:'Training videos',value:s.register?s.videos.length:'—',caption:s.register?hours(minutes)+' · '+full+' transcripts read in full':'Video register not read'},
  {label:'Downloads',value:s.available?s.downloads:'—',caption:'PDF, text and team-pack files'},
 ],{esc});
}
// Training videos (YOUTUBE-REGISTER.csv): text tiles (YouTube thumbnails are not loaded); a tile opens the
// privacy-enhanced player beside the register entry.
export function trainingVideoDetail(v,{esc,link=()=>''}){
 const src=embedURL(v);
 return {title:v.title,html:'<div class="vw-player pk-video"><div class="vw-frame vw-frame--wide">'+(src?'<iframe src="'+esc(src)+'" title="'+esc(v.title+' · YouTube player')+'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>':'<p class="dt-empty">This video cannot be embedded.</p>')+'</div>'
  +'<div class="vw-info">'+kit.detailDialog([{fields:[['Channel',v.channel],['Length',v.minutes?hours(v.minutes):''],['Register status',v.status]]},v.selection?{title:'Why it is in the register',html:'<p lang="nl">'+esc(v.selection)+'</p>'}:null],{esc})+'<div class="actions">'+(link(v.url,'Open on YouTube')||'')+'</div></div></div>'};
}
export function trainingWall(s,{esc,link}){
 const statuses=[...new Set(s.videos.map(v=>v.status))];
 return kit.mediaWall({id:'handbook-videos',esc,kind:'doc',emptyText:s.register?'The video register is empty.':'The video register could not be read.',
  items:s.videos.map(v=>({...v,sub:[v.channel,v.minutes?hours(v.minutes):''].filter(Boolean).join(' · '),badges:[v.status],when:'Register entry '+(v.order+1)})),
  groups:statuses.length>1?statuses.map(st=>({id:st.toLowerCase().replace(/[^a-z0-9]+/g,'-'),label:st,filter:v=>v.status===st})):undefined,groupLabel:'Register status',
  sorts:[['newest','Register order',(a,b)=>a.order-b.order],['longest','Longest',(a,b)=>(b.minutes||0)-(a.minutes||0)]],detail:v=>trainingVideoDetail(v,{esc,link})});
}
export function mountHandbook(host,{fetcher=globalThis.fetch,DOMParser=globalThis.DOMParser,clipboard=globalThis.navigator?.clipboard}={}){
 host.lang='nl';const document=host.ownerDocument,shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),content=document.createElement('div'),controller=new AbortController();
 style.textContent=CSS;shadow.append(style,content);content.lang='en';content.textContent='Loading the sales handbook…';let disposed=false;
 const ready=(async()=>{
  try{
   const cached=takePrefetched();
   const response=cached!=null?new Response(cached,{headers:{'Content-Type':'text/html; charset=utf-8'}}):await fetcher(BASE+'START.html',{credentials:'same-origin',cache:'no-store',redirect:'manual',signal:controller.signal});
   if(disposed)return;
   if(response.status===401||response.status===302||response.status===307||response.type==='opaqueredirect'){content.textContent='Log in with your existing Team account and refresh this view.';return}
   if(response.status===403){content.textContent='This Team account has no access to the sales handbook.';return}
   if(!response.ok)throw Error('Sales handbook unavailable ('+response.status+').');
   if(!response.headers.get('Content-Type')?.startsWith('text/html'))throw Error('The source returned no handbook page.');
   const html=await response.text();if(disposed)return;
   const source=new DOMParser().parseFromString(html,'text/html'),shell=source.querySelector('.shell');
   if(!shell?.querySelector('.card')||!shell.querySelector('#crm-note'))throw Error('The handbook structure changed; open the original source.');
   const clean=copyHandbookTree(shell,document);
   const ids=['query','offer','phase','channel','clear','count','empty','section-title','group-message','faq-tools','crm-note','copy-note','escalation-note'];
   for(const id of ids)if(!clean.querySelector('#'+id))throw Error('A handbook control is missing; open the original source.');
   content.replaceChildren(clean);content.removeAttribute('lang');
   const status=document.createElement('div');status.id='native-handbook-status';status.setAttribute('role','status');status.hidden=true;content.append(status);
   const $=s=>content.querySelector(s),cards=[...content.querySelectorAll('.card')],nav=[...content.querySelectorAll('.nav button')];
   const models=new Map(cards.map(e=>[e,{...e.dataset,text:e.textContent}]));let group='Start';
   const message=text=>{status.textContent=text;status.hidden=false};
   const render=()=>{let count=0;for(const card of cards){const show=handbookMatches(models.get(card),{group,query:$('#query').value,offer:$('#offer').value,phase:$('#phase').value,channel:$('#channel').value});card.hidden=!show;count+=show}
    $('#count').textContent=count+' of '+cards.length+' sections';$('#count').lang='en';$('#empty').hidden=count>0;$('#section-title').textContent=$('#query').value?'Search results':group;$('#section-title').lang=$('#query').value?'en':'nl';
    $('#group-message').textContent=group==='FAQ & CRM'?'Choose DM or call for the right price route.':group==='Tone of voice'?'The voice notes extend the existing conversation technique. The examples are tone variants.':'';$('#faq-tools').hidden=group!=='FAQ & CRM';
    for(const button of nav){const active=button.dataset.group===group;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))}
   };
   const reset=()=>{$('#query').value='';for(const id of ['offer','phase','channel'])$('#'+id).value='all';group='Alles'};
   $('#clear').onclick=()=>{reset();render()};$('#query').oninput=()=>{group='Alles';render()};for(const id of ['offer','phase','channel'])$('#'+id).onchange=render;
   for(const button of nav)button.onclick=()=>{reset();group=button.dataset.group;render();$('.toolbar').scrollIntoView?.({block:'start'})};
   content.addEventListener('click',event=>{const link=event.target.closest?.('a[href^="#"]');if(!link)return;event.preventDefault();const id=link.getAttribute('href').slice(1),target=[...content.querySelectorAll('[id]')].find(e=>e.id===id);if(!target)return;const card=target.closest('.card');if(card){reset();group=card.dataset.group;render()}target.scrollIntoView?.({block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true})});
   const copy=async text=>{try{if(!clipboard?.writeText)throw Error();await clipboard.writeText(text);if(!disposed)message('Copied. Check the placeholders and the right case before use.')}catch{if(!disposed)message('Copying is not available. Select the text and copy it manually.')}};
   for(const quote of content.querySelectorAll('blockquote')){const text=(quote.innerText||quote.textContent).trim(),button=document.createElement('button');button.type='button';button.className='copy';button.textContent='Copy example';button.onclick=()=>copy(text);quote.append(button)}
   $('#copy-note').onclick=()=>copy($('#crm-note').value);
   $('#escalation-note').onclick=()=>{$('#crm-note').value='Exact question:\nRelevant context and route:\nWhat has been checked:\nWho confirms the answer:\nAgreed follow-up moment:\nConfirmed answer with date and version:';$('#crm-note').focus()};
   render();
  }catch(error){if(!disposed)content.textContent=error.message||'Sales handbook unreachable.'}
 })();
 const unmount=()=>{disposed=true;controller.abort();shadow.replaceChildren()};unmount.ready=ready;return unmount;
}
