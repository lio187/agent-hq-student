// Setter playbook and client proposals without a Team login (owner, 5–6 October 2026). Both read files
// that already live on this Mac through /hq-setter/ and /hq-proposals/ (office session only). Practice
// chats, scoring, exams and drafting new proposals still run in Team Hub, which keeps its own login.
import {dataTable,relativeTime,stagePill} from './data-table.mjs';
import * as kit from './page-kit.mjs';
import {stateView} from './ui.mjs';

const get=async(path,as,fetcher)=>{const r=await fetcher(path,{credentials:'same-origin'});if(!r.ok)throw new Error(path+' answered '+r.status);return as==='json'?r.json():r.text()};
export async function loadSetter(fetcher=globalThis.fetch){
 const [soul,tone,config]=await Promise.all([get('/hq-setter/SOUL.md','text',fetcher),get('/hq-setter/tone.json','json',fetcher),get('/hq-setter/setter.config.json','json',fetcher)]);
 return {soul,tone,config};
}
export const loadProposals=(fetcher=globalThis.fetch)=>get('/hq-proposals/index.json','json',fetcher);
export const proposalURL=(client,file)=>'/hq-proposals/'+encodeURIComponent(client)+'/'+String(file).split('/').map(encodeURIComponent).join('/');

// SOUL.md → intro + one section per "## " heading.
export function playbookSections(text){
 const parts=String(text||'').split(/^## /m);
 return {intro:parts[0].replace(/^# .*\n/,'').trim(),sections:parts.slice(1).map(p=>{const at=p.indexOf('\n');return {title:(at<0?p:p.slice(0,at)).trim(),body:at<0?'':p.slice(at+1).trim()}})};
}
const TONE={altijd:'Always',starter:'Starter',student:'Student',werknemer:'Employee',zzp:'Freelancer',winkel:'Shop owner',groeibedrijf:'Growing business',bureau:'Agency',creator:'Creator',bouwer:'Builder',corporate:'Corporate',klant:'Existing client',samenwerking:'Partnership',driver:'Driver',analytisch:'Analytical',expressief:'Expressive',amiabel:'Amiable'};
export function toneRows(tone){
 return Object.entries(tone||{}).map(([key,text])=>{const [group,name]=key.includes(':')?key.split(':'):['always',key];return {key,group:group==='segment'?'Lead type':group==='style'?'Style':'Always',label:TONE[name]||name[0].toUpperCase()+name.slice(1),text:typeof text==='string'?text:JSON.stringify(text)}});
}

export function setterPage({soul,tone,config},{esc,markdown,link}){
 const g=config?.guardrails||{},ch=config?.channel||{},d=config?.disclosure||{};
 const {intro,sections}=playbookSections(soul);
 const playbook=(intro?'<div class="md" lang="nl">'+markdown(intro)+'</div>':'')+'<div class="accordion">'+sections.map((s,i)=>'<details'+(i===0?' open':'')+'><summary>'+esc(s.title)+'</summary><div class="md" lang="nl">'+markdown(s.body)+'</div></details>').join('')+'</div>';
 const rows=toneRows(tone);
 const toneTable=dataTable({id:'setter-tone',esc,rows,pageSize:30,emptyText:'No tone guidance found.',
  tabs:[...new Set(rows.map(r=>r.group))].map(gr=>({id:gr.toLowerCase().replace(/\W+/g,'-'),label:gr,filter:r=>r.group===gr})),
  columns:[{key:'label',label:'Who',value:r=>r.label,className:'dt-primary',cell:r=>'<strong>'+esc(r.label)+'</strong><small>'+esc(r.group)+'</small>'},
   {key:'text',label:'How to talk to them',cell:r=>'<span class="dt-wrap" lang="nl">'+esc(r.text)+'</span>'}]});
 const links=[...Object.entries(config?.links||{}).map(([k,v])=>({kind:'Booking link',key:k,title:k.replace(/_/g,' '),url:v.url,meta:[v.route,v.lang].filter(Boolean).join(' · '),confirm:v.confirm_with_leon})),
  ...Object.entries(config?.resources||{}).map(([k,v])=>({kind:'Resource',key:k,title:v.title||k,url:v.url,meta:k})),
  ...Object.entries(config?.closers||{}).map(([route,v])=>({kind:'Closer',key:route,title:v.name,meta:'Route '+route,confirm:v.confirm_with_leon}))];
 const linkTable=dataTable({id:'setter-links',esc,rows:links,pageSize:30,emptyText:'No links configured.',
  tabs:[...new Set(links.map(l=>l.kind))].map(k=>({id:k.toLowerCase().replace(/\W+/g,'-'),label:k+'s',filter:l=>l.kind===k})),
  columns:[{key:'title',label:'Item',value:l=>l.title,className:'dt-primary',cell:l=>'<strong>'+esc(l.title)+'</strong><small>'+(l.url?link(l.url,l.url.replace(/^https?:\/\//,'').slice(0,60)):esc(l.meta||''))+'</small>'},
   {key:'meta',label:'Use',value:l=>l.meta,cell:l=>'<span class="dt-muted">'+esc(l.meta||'')+'</span>'},
   {key:'confirm',label:'Status',value:l=>l.confirm?0:1,cell:l=>stagePill(l.confirm?'To confirm':'Ready',esc)}]});
 // Phase 3.3: the kit's tiles (a caption under every number) and an honest empty history.
 return {stats:kit.tileRow([
   {label:'Per reply',value:(g.max_bubbles??'—')+' messages',caption:'At most '+(g.max_words_per_bubble??'—')+' words each'},
   {label:'Prices in DM',value:g.allow_prices_in_dm?'Allowed':'Never',caption:'Investment is discussed on the call'},
   {label:'Auto-send window',value:(ch.auto_send_window_hours??'—')+' h',caption:'Later follow-ups are drafts for a person'},
   {label:'AI disclosure',value:d.mode==='on_ask'?'When asked':d.mode||'—',caption:'Set in the setter config'},
   {label:'Playbook sections',value:sections.length,caption:rows.length+' tone notes · '+links.length+' links and closers'},
  ],{esc}),
  history:practiceHistory(esc),playbook,toneTable,linkTable};
}
// No practice or exam history is stored anywhere this page can read; it says so instead of showing zeros.
export function practiceHistory(esc){
 return kit.panel('Practice and exam history',stateView({kind:'empty',title:'No history is stored',body:'Practice chats stay in this browser tab only and are never saved. Exams and scores live in Setter Studio on Team Hub, which this page does not read.'}),{esc});
}

const size=b=>b>=1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
export function proposalRows(index){
 return (index?.clients||[]).flatMap(c=>c.files.length?c.files.map((f,i)=>({client:c.client,name:c.name,file:f.file,size:f.size,modified:f.modified*1000,latest:i===0})):[{client:c.client,name:c.name,file:'',size:0,modified:c.modified*1000,latest:true}]);
}
export const proposalThumbURL=(client,file)=>'/hq-proposals/thumb/'+encodeURIComponent(client)+'/'+String(file).split('/').map(encodeURIComponent).join('/');
// Proposals (Phase 3.3): every PDF as a thumbnail tile (first page rendered on this Mac; a text tile when it
// cannot be rendered), grouped by client; a tile opens the PDF inline. Status and value are not recorded.
// File names read as titles ("Cheat-Daze-x-187N-Proposal" → "Cheat Daze x 187N Proposal"); folders as words (7 Oct 2026).
const folderLabel=f=>({deploy:'Deployed copy'})[f]||String(f).replace(/[-_]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
export function proposalItems(index,{query='',now=Date.now()}={}){
 return proposalRows(index).filter(r=>r.file).filter(r=>!query||(r.name+' '+r.file).toLowerCase().includes(query.toLowerCase())).map(r=>({id:r.client+'|'+r.file,client:r.client,name:r.name,file:r.file,size:r.size,modified:r.modified,latest:r.latest,
  title:r.file.split('/').pop().replace(/\.pdf$/i,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim(),sub:r.name,thumbUrl:proposalThumbURL(r.client,r.file),badges:[r.latest?'Latest':'',r.file.includes('/')?folderLabel(r.file.split('/')[0]):''].filter(Boolean),publishedAt:new Date(r.modified).toISOString(),when:'Updated '+relativeTime(r.modified,now)}));
}
export function proposalDetail(item,{esc,now=Date.now()}){
 const url=proposalURL(item.client,item.file);
 return {title:item.name+' · '+item.title,html:kit.detailDialog([
  {fields:[['Client',item.name],['File',item.file],['Updated',kit.dayLabel(item.modified)+' · '+relativeTime(item.modified,now)],['Size',size(item.size)],['Status and value','']],note:'Proposal status and value are not recorded on this Mac, so neither is shown.'},
  {html:'<iframe class="pdf-frame" src="'+esc(url)+'" title="'+esc(item.name+' proposal')+'"></iframe>'},
 ],{esc})+'<div class="actions"><a class="ui-btn" href="'+esc(url)+'" target="_blank" rel="noopener">Open in new tab ↗</a></div>'};
}
export function proposalsPage(index,{esc,now=Date.now(),query=''}){
 const all=proposalRows(index),rows=all.filter(r=>!query||(r.name+' '+r.file).toLowerCase().includes(query.toLowerCase()));
 const clients=index?.clients||[],pdfs=all.filter(r=>r.file).length,latest=Math.max(0,...all.map(r=>r.modified)),empty=clients.filter(c=>!c.files.length);
 const items=proposalItems(index,{query,now}),withFiles=clients.filter(c=>c.files.length&&items.some(i=>i.client===c.client));
 const wall=kit.mediaWall({id:'proposals',esc,kind:'pdf',items,sorts:[['newest','Newest']],emptyText:query?'No proposals match.':'No proposal PDFs yet.',groupLabel:'Client',
  groups:[{id:'latest',label:'Latest per client',filter:i=>i.latest},...withFiles.map(c=>({id:'c-'+c.client,label:c.name,filter:i=>i.client===c.client}))],detail:item=>proposalDetail(item,{esc,now})});
 const table=dataTable({id:'local-proposals',esc,rows,pageSize:25,defaultSort:{key:'modified',dir:'desc'},emptyText:'No proposals match.',
  tabs:[{id:'latest',label:'Latest per client',filter:r=>r.latest}],
  columns:[{key:'name',label:'Client',value:r=>r.name,className:'dt-primary',cell:r=>'<strong>'+esc(r.name)+'</strong><small>'+esc(r.file||'No PDF yet')+'</small>'},
   {key:'modified',label:'Updated',value:r=>r.modified,cell:r=>'<span class="dt-muted">'+esc(relativeTime(r.modified,now))+'</span>'},
   {key:'size',label:'Size',value:r=>r.size,cell:r=>r.file?'<span class="dt-muted">'+esc(size(r.size))+'</span>':''},
   {key:'open',label:'',cell:r=>r.file?'<button type="button" class="dt-action" data-action="video-play" data-id="'+esc('proposals|'+r.client+'|'+r.file)+'">Open</button>':''}]});
 return kit.tileRow([
   {label:'Clients',value:clients.length,caption:'Folders in clients/'},
   {label:'Proposal PDFs',value:pdfs,caption:'Versions and drafts excluded'},
   {label:'Last updated',value:latest?relativeTime(latest,now):'—',caption:'Newest file on disk'},
   {label:'Clients without a PDF',value:empty.length,caption:empty.length?empty.map(c=>c.name).slice(0,3).join(', ')+(empty.length>3?' …':''):'Every client has one'},
  ],{esc})
  +kit.panel('Proposals by client',wall+'<p class="viz-note">Status and value are not recorded for proposals, so there is no pipeline chart.</p>',{esc,meta:items.length+' PDFs',cls:'wall-card'})
  +kit.panel('All files',table,{esc});
}

// Practice (6 October 2026): Setter Studio's practice chat inside the office. The owner plays the lead;
// the owner's local setter agent answers through /hq-setter/chat. Nothing reaches Instagram or a lead.
export const PERSONAS=[
 {key:'vrij',title:'Free lead',who:'Play whoever you like',opener:''},
 {key:'student',title:'Student',who:'19, no budget, wants to earn with AI',opener:'yo bro ik ben 19 studeer nog en wil geld verdienen met ai hoe begin ik'},
 {key:'winkel',title:'Busy webshop',who:'Small team, little time, curt',opener:'Webshop, 3 man. Support kost ons 20 uur per week. Kort graag, wat kunnen jullie?'},
 {key:'kortaf',title:'Curt hairdresser',who:'One-word answers, irritated by questions',opener:'wat doen jullie'},
 {key:'groei',title:'25-person company',who:'Businesslike, partner decides too',opener:'Wij zijn een installatiebedrijf met 25 man. Offertes kosten onze planner elke dag uren. Kan dat slimmer?'},
 {key:'creator',title:'Enthusiastic coach',who:'Lots of energy and emoji, jumps around',opener:'OMG ik volg je al maanden 🔥🔥 ik ben coach en wil ALLES automatiseren!!'},
 {key:'analytisch',title:'Analytical bookkeeper',who:'Wants to know exactly how it works',opener:'Hoe werkt zo’n agent precies? Draait dat lokaal of in de cloud en wat gebeurt er met mijn klantdata?'},
 {key:'bouwer',title:'Sceptical developer',who:'Already builds with n8n and Claude Code',opener:'heb al agents in n8n en claude code draaien, wat kan jij me nog leren eigenlijk'},
 {key:'werknemer',title:'Doubting employee',who:'Works at a bank, wants to go solo',opener:'ik werk bij een bank en wil eigenlijk voor mezelf beginnen met ai, maar weet niet of dat realistisch is'},
 {key:'corporate',title:'Formal director',who:'60 employees, writes formally',opener:'Goedemiddag, wij onderzoeken de inzet van AI binnen onze klantenservice. Kunt u mij meer vertellen?'},
 {key:'vlaams',title:'Flemish shop owner',who:'Bicycle shop in Ghent',opener:'Dag, ik heb een fietsenwinkel in Gent en ge moogt mij eens uitleggen wat da AI voor mij kan doen'},
 {key:'klaar',title:'Ready to start',who:'No more questions, wants to begin',opener:'Ik heb je video’s gezien en ik wil gewoon starten met het traject. Hoe gaat dat?'},
];
const practice={persona:'winkel',account:'lio',booking:false,history:[],turns:[],last:null,busy:false,error:'',draft:PERSONAS[2].opener};
// The conversation survives a refresh in this tab (session only; never sent anywhere else).
const SAVED='hq-setter-practice';
try{const saved=JSON.parse(globalThis.sessionStorage?.getItem(SAVED)||'null');if(saved&&Array.isArray(saved.history))Object.assign(practice,saved,{busy:false,error:''})}catch{}
const save=()=>{try{const {busy,error,...keep}=practice;globalThis.sessionStorage?.setItem(SAVED,JSON.stringify(keep))}catch{}};
export const practiceState=()=>practice;
let conversation=0,inflight=null;
export function resetPractice(key=practice.persona){const p=PERSONAS.find(x=>x.key===key)||PERSONAS[0];conversation++;inflight?.abort();inflight=null;Object.assign(practice,{persona:p.key,history:[],turns:[],last:null,error:'',busy:false,draft:p.opener});save()}
const human=v=>String(v??'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());

export function practiceRead(result,esc){
 if(!result)return '<p class="sp-empty">Send a message as the lead. The setter’s read appears here: route, stage, objection, next step and anything it noted for the closer.</p>';
 const lp=result.lead_profile||{},row=(k,v)=>v==null||v===''?'':'<div class="sp-kv"><dt>'+esc(k)+'</dt><dd>'+v+'</dd></div>';
 const pill=v=>'<span class="stage-pill" data-stage="'+esc(String(v).toLowerCase())+'">'+esc(human(v))+'</span>';
 const lead=['segment','style','stage','ai_level','decision','budget','objection'].filter(k=>lp[k]&&lp[k]!=='geen'&&lp[k]!=='onbekend').map(k=>'<span class="sp-tag"><small>'+esc(human(k))+'</small>'+esc(human(lp[k]))+'</span>').join('');
 const facts=Object.entries(result.facts||{}).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>'<li><b>'+esc(human(k))+'</b> '+esc(typeof v==='string'?v:JSON.stringify(v))+'</li>').join('');
 return '<dl class="sp-kvs">'+row('Action',pill(result.action||'reply'))+row('Route',result.route?pill(result.route):'')+row('Stage',result.stage?esc(human(result.stage)):'')
  +row('Link',result.link?esc(result.link):'')+row('Resource',result.resource?esc(result.resource):'')+row('Handoff',result.handoff_reason?esc(result.handoff_reason):'')+row('Answered in',result.latency_s!=null?esc(Number(result.latency_s).toFixed(1)+' s'):'')+'</dl>'
  +(lead?'<h4>How it reads the lead</h4><div class="sp-tags">'+lead+'</div>':'')
  +(result.note?'<h4>Note for the closer</h4><p class="sp-note">'+esc(result.note)+'</p>':'')
  +(facts?'<h4>Facts collected</h4><ul class="sp-facts">'+facts+'</ul>':'')
  +((result.violations||[]).length?'<h4>Guardrails</h4><ul class="sp-violations">'+result.violations.map(v=>'<li>'+esc(human(v.code))+' · '+esc(v.severity||'')+'</li>').join('')+'</ul>':'');
}

export function practiceHTML(esc){
 const s=practice,p=PERSONAS.find(x=>x.key===s.persona)||PERSONAS[0];
 const bubbles=s.turns.map(t=>t.role==='lead'?'<div class="sp-msg" data-role="lead"><span>'+esc(t.text)+'</span></div>'
  :t.role==='setter'?'<div class="sp-msg" data-role="setter"><span>'+esc(t.text)+'</span></div>'
  :'<p class="sp-sys">'+esc(t.text)+'</p>').join('');
 return '<div class="sp-personas" role="group" aria-label="Practice lead">'+PERSONAS.map(x=>'<button type="button" data-sp-persona="'+x.key+'" aria-pressed="'+(x.key===s.persona)+'" title="'+esc(x.who)+'">'+esc(x.title)+'</button>').join('')+'</div>'
  +'<div class="sp-grid"><section class="sp-chat" aria-label="Practice conversation"><header class="sp-head"><div><strong>'+esc(p.title)+'</strong><small>'+esc(p.who)+'</small></div>'
  +'<div class="sp-controls"><label>Account <select data-sp="account"><option value="lio"'+(s.account==='lio'?' selected':'')+'>@lio</option><option value="liogpt"'+(s.account==='liogpt'?' selected':'')+'>@liogpt</option></select></label>'
  +'<label class="sp-check"><input type="checkbox" data-sp="booking"'+(s.booking?' checked':'')+'> Booking confirmed</label><button type="button" data-sp-reset>New conversation</button></div></header>'
  +'<div class="sp-log" aria-live="polite">'+(bubbles||'<p class="sp-empty">You play the lead. Edit the opener or write your own, then send.</p>')+(s.busy?'<div class="sp-msg" data-role="setter" data-typing><span>Setter is typing…</span></div>':'')+'</div>'
  +(s.error?'<p class="sp-error" role="alert">'+esc(s.error)+'</p>':'')
  +'<form class="sp-form"><textarea id="sp-input" rows="2" aria-label="Message as the lead" placeholder="Write as the lead…"'+(s.busy?' disabled':'')+'>'+esc(s.draft)+'</textarea><button type="submit" class="ui-btn ui-btn--primary"'+(s.busy?' disabled':'')+'>Send</button></form>'
  +'<p class="sp-hint">Answers come from your own setter agent on this Mac (Hermes dm-setter). Nothing is sent to Instagram or to a lead. Enter sends, Shift+Enter adds a line.</p></section>'
  +'<aside class="sp-read" aria-label="Setter’s read"><h3>Setter’s read</h3>'+practiceRead(s.last,esc)+'</aside></div>';
}

export function mountSetterPractice(host,{esc,fetcher=globalThis.fetch}){
 const paint=()=>{save();host.innerHTML=practiceHTML(esc);const log=host.querySelector('.sp-log');if(log)log.scrollTop=log.scrollHeight};
 const send=async()=>{
  const text=practice.draft.trim();if(!text||practice.busy)return;
  practice.history.push({role:'lead',text});practice.turns.push({role:'lead',text});practice.draft='';practice.busy=true;practice.error='';paint();
  // A reply only lands in the conversation it was asked in (persona switch, reset or leaving the page cancel it).
  const mine=conversation,abort=inflight=new AbortController();
  try{
   const r=await fetcher('/hq-setter/chat',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:abort.signal,body:JSON.stringify({history:practice.history,account:practice.account,booking_status:practice.booking?'confirmed':'none'})});
   const data=await r.json().catch(()=>({}));
   if(mine!==conversation)return;
   if(!r.ok)throw new Error(data?.error?.message||'The setter could not answer ('+r.status+').');
   for(const m of data.send||[]){practice.history.push({role:'setter',text:m});practice.turns.push({role:'setter',text:m})}
   if(data.action&&data.action!=='reply')practice.turns.push({role:'sys',text:data.action==='handoff'?'Handed to the team: '+(data.handoff_reason||'no reason given'):data.action==='send_link'?'Sends booking link: '+(data.link||''):data.action==='send_resource'?'Sends resource: '+(data.resource||''):data.action==='no_reply'?'Chooses not to reply':human(data.action)});
   practice.last=data;
  }catch(e){if(mine!==conversation||e.name==='AbortError')return;practice.error=e.message;const last=practice.history.pop();practice.turns.pop();practice.draft=last?.text||''}
  finally{if(inflight===abort)inflight=null;if(mine===conversation){practice.busy=false;paint();host.querySelector('#sp-input')?.focus()}}
 };
 const onClick=e=>{const persona=e.target.closest('[data-sp-persona]');
  if(persona){if(persona.dataset.spPersona===practice.persona&&!practice.turns.length)return;if(practice.turns.length&&!confirm('Start a new practice conversation as "'+persona.textContent+'"? The current one is cleared.'))return;resetPractice(persona.dataset.spPersona);paint();host.querySelector('#sp-input')?.focus();return}
  if(e.target.closest('[data-sp-reset]')){resetPractice();paint()}};
 const onInput=e=>{if(e.target.id==='sp-input'){practice.draft=e.target.value;save()}};
 const onChange=e=>{if(e.target.dataset.sp==='account')practice.account=e.target.value;if(e.target.dataset.sp==='booking')practice.booking=e.target.checked;save()};
 const onKey=e=>{if(e.target.id==='sp-input'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send()}};
 const onSubmit=e=>{if(!e.target.closest('.sp-form'))return;e.preventDefault();e.stopPropagation();send()};
 host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('change',onChange);host.addEventListener('keydown',onKey);host.addEventListener('submit',onSubmit);
 paint();
 return ()=>{if(practice.busy&&practice.history.at(-1)?.role==='lead'){const last=practice.history.pop();practice.turns.pop();practice.draft=last.text}inflight?.abort();inflight=null;conversation++;practice.busy=false;save();host.removeEventListener('click',onClick);host.removeEventListener('input',onInput);host.removeEventListener('change',onChange);host.removeEventListener('keydown',onKey);host.removeEventListener('submit',onSubmit)};
}
