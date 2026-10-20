import {engineLogo} from './engine-logos.mjs';
import {createSidebar} from './shell-sidebar.mjs';
import {icon} from './icons.mjs';
import {createWorkspaceViews,SECTIONS,number,esc,date} from './workspace-view.mjs';
import {connectorMark} from './connector-view.mjs';
import {workflowBridge} from './workflow-drawer.mjs';
import {createNotificationCenter} from './notification-center.mjs';
const STORY=[
 {agent:'chief',title:'Your mission, understood.',caption:'Hi Lio. I’ll have Research investigate the angle, Content build your reel script, and Review check the result.',detail:'Create a useful Instagram reel about an AI team that turns a brief into reviewed work.',audio:'chief',seconds:10},
 {agent:'researcher',title:'Research is on it.',caption:'I’m comparing the angles and gathering the supporting points.',detail:'Researcher receives the brief → investigates the topic → hands off a focused creative angle.',audio:'researcher',seconds:9},
 {agent:'content-director',title:'An idea becomes a script.',caption:'I’m turning the research into a hook, a clear demonstration, and a call to action.',detail:'Hook: “I gave my Chief one brief. Watch the team take it from here.”\nScene 1: speak the task. Scene 2: show delegation. Scene 3: open the result.',audio:'content',seconds:10},
 {agent:'reviewer',title:'A second pair of eyes.',caption:'I’m checking the claims, the structure, and whether the result answers your brief.',detail:'Reviewer checks the source evidence, the script and the handoff. The mission stays in review until the result is accepted.',audio:'reviewer',seconds:9},
 {agent:'chief',title:'Ready for your next take.',caption:'Your reel script is ready, Lio. Research, content, and review are complete. The result is waiting for you.',detail:'DELIVERABLE\nA 30-second reel script, shot list and caption draft.\nResearch → Content → Review → Ready to record.',audio:'complete',seconds:10}
];
export function createWorkspace({api,getContext,setContext,action,voice,getOffice,getState,getItems}){
 document.body.classList.add('cockpit-ready');
 const sidebar=createSidebar({onNotifications:anchor=>center.toggle(anchor),onRoute:id=>route_(id),onSection:id=>open(id).catch(e=>message('Workspace unavailable',e.message)),onBusiness:b=>views?.setBusiness(b,{navigate:!panel.hidden}),onPalette:mode=>palette.open(mode==='?'?'?':'')});const nav=sidebar.element;
 // Navigation comes first in the Tab order, right after the skip link (10 Oct 2026, keyboard audit).
 const skipLink=document.querySelector('.skip-link');if(skipLink)skipLink.after(nav);else document.body.prepend(nav);
 const strip=document.createElement('section');strip.id='cockpit-strip';strip.setAttribute('aria-label','Engine usage and revenue');
 strip.className='sb-usage';strip.innerHTML='<div class="sb-label">Usage · 30 days</div>'+['codex','claude','hermes'].map((id,i)=>'<button data-meter="'+id+'" aria-label="'+['Codex','Claude Code','Hermes'][i]+' token usage"><span class="engine-symbol">'+engineLogo(id)+'</span><span class="strip-label">'+['Codex','Claude Code','Hermes'][i]+'<small>30-day tokens</small></span><b>—</b></button>').join('')+'<div class="sb-label">Revenue</div><button data-meter="revenue" aria-label="Revenue snapshot: open revenue details"><span class="strip-label">Hex snapshot<small>Reading…</small></span><b>—</b></button><span class="strip-status"><i></i><span>Connecting sources</span></span>';nav.insertBefore(strip,nav.querySelector('.sb-foot'));
 const panel=document.createElement('section');panel.id='cockpit-panel';panel.hidden=true;panel.setAttribute('aria-label','Mission Control workspace');document.body.append(panel);
 const dock=document.createElement('form');dock.id='chief-dock';
 dock.innerHTML='<div class="chief-identity"><i class="chief-orb" aria-hidden="true">∞</i><span><strong>Chief of Staff</strong><small data-chief-state>Ready when you are.</small></span></div><label class="chief-field"><span class="sr-only">Message the Chief of Staff</span><input class="chief-input" name="brief" aria-label="Message the Chief of Staff" placeholder="Give your Chief a mission…" autocomplete="off"><kbd>'+(/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent)?'⌘':'Ctrl ')+'J</kbd></label><button type="submit" class="chief-send" aria-label="Send brief to Chief">Send</button><button type="button" class="chief-talk" data-talk aria-label="Talk to Chief">'+icon('mic')+'<span>Talk</span></button><details class="dock-more"><summary aria-label="Recording and demo tools">•••</summary><div class="dock-tools" role="group" aria-label="Recording and demo tools"><button type="button" data-record aria-pressed="false">Reel view</button><button type="button" data-hide-numbers aria-pressed="false" title="Hide revenue and usage numbers in recording view">Hide numbers</button><button type="button" data-demo aria-pressed="false">▷ Demo</button></div></details>';
 // Recording and demo tools live in one ••• menu, so the dock is about sending work (10 Oct 2026, shell audit).
 {const more=dock.querySelector('.dock-more');document.addEventListener('pointerdown',e=>{if(more.open&&!e.composedPath().includes(more))more.open=false});more.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){e.preventDefault();e.stopPropagation();more.open=false;more.querySelector('summary').focus()}})}document.body.append(dock);
 document.querySelector('#sidebar-toggle')?.addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
 document.addEventListener('pointerdown',e=>{if(document.body.classList.contains('sidebar-open')&&!e.composedPath().some(n=>n.id==='hq-nav'||n.id==='sidebar-toggle'||n.classList?.contains?.('ws-menu')))document.body.classList.remove('sidebar-open')});
 const notices=document.createElement('div');notices.id='hq-notifications';notices.setAttribute('aria-live','polite');document.body.append(notices);
 const banner=document.createElement('div');banner.id='demo-banner';banner.hidden=true;banner.innerHTML='<span class="demo-label">DEMO · EXAMPLE MISSION</span><h2>One brief. An entire team.</h2><p>Research → Instagram reel → Review</p>';
 const story=document.createElement('div');story.id='demo-story';story.hidden=true;
 const caption=document.createElement('div');caption.id='demo-caption';
 const guide=document.createElement('div');guide.id='recording-guide';guide.innerHTML='<span>9:16 / REEL SAFE AREA</span>';
 document.querySelector('#office').append(banner,story,caption,guide);
 let views,focus,route='office',recording=false,demo=false,demoEpoch=0,demoTimer,demoAudio,disposed=false,usageTimer,pollBusy=false,previousRoute='office';
 const seen=new Set();let lastLiveItems=null,tasksBaseline=null,readings={};const bootAt=Date.now();
 // Every toast is also kept in the notification centre, so a missed one can be read later (8 Oct 2026).
 const center=createNotificationCenter({onOpen:n=>{if(n.profile)action('agent',n.profile)},onInbox:()=>route_('inbox'),onCount:n=>sidebar?.setNotifications?.(n)});
 const message=(title,detail,profile)=>{center.add({title,detail,profile});const n=document.createElement('button');n.innerHTML='<strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small>';n.onclick=()=>{if(profile)action('agent',profile);n.remove()};notices.append(n);while(notices.children.length>3)notices.firstElementChild.remove();setTimeout(()=>n.remove(),6500)};
 function selectedNav(next){sidebar.setActive(next);document.body.dataset.hqRoute=['office','brain','inbox'].includes(next)?next:'workspace'}
 function route_(id){open(id).catch(e=>message('Workspace unavailable',e.message))}
 // The #office route doubles as the office's fragment, so the browser starts Tab inside the office. The first Tab
 // after load goes to the skip link instead, and the next one into the sidebar (10 Oct 2026, keyboard audit).
 let firstTab=true;
 window.addEventListener('keydown',e=>{if(e.key!=='Tab'||!firstTab)return;firstTab=false;const a=document.activeElement;if(!e.shiftKey&&(a===document.body||a?.id==='office')){const skip=document.querySelector('.skip-link');if(skip){e.preventDefault();skip.focus()}}},true);
 const hashSection=()=>location.hash==='#brain'?'brain':location.hash.startsWith('#workspace/')?decodeURIComponent(location.hash.slice(11)):'office';
 function writeRoute(next,replace=false){const hash=next==='office'?'#office':next==='brain'?'#brain':'#workspace/'+next;if(location.hash!==hash)history[replace?'replaceState':'pushState']({section:next},'',location.pathname+hash)}
 async function open(section='overview',options={}){
  if(demo)return;
  if(section==='office'){close(options);return}
  // Brain has its own route (#brain): Back closes it, a reload reopens it (10 Oct 2026).
  if(section==='brain'){close({history:true});if(!options.history)writeRoute('brain');route='brain';await action('brain');selectedNav('brain');return}
  focus=document.activeElement;route=section;panel.hidden=false;document.body.classList.add('workspace-open');officeInert(true);selectedNav(section);
  await views.open(section,{...options});
 }
 // The office behind an open workspace page leaves the Tab order (8 Oct 2026); the workflow drawer, which opens
 // beside workspace pages too, stays reachable.
 function officeInert(on){for(const el of document.querySelectorAll('body>main>*:not(#workflow-drawer)'))el.inert=on}
 function close(options={}){views?.close();panel.hidden=true;document.body.classList.remove('workspace-open');officeInert(false);document.title='Office · Agent HQ';route='office';selectedNav('office');if(!options.history)writeRoute('office');focus?.focus?.()}
 views=createWorkspaceViews({host:panel,api,getContext,setContext,voice,connectorMark,workflow:workflowBridge,getBoot:getState,onNavigate:(section,options)=>{route=section;selectedNav(section);if(!options.history)writeRoute(section,options.refresh)},action:async(a,id,isCurrent=()=>true)=>{
  if(a==='office')return close();
  if(a==='voice'){await action('chief-voice');return}
  await action(a,id);if(isCurrent()&&!['routine-edit','routine-results'].includes(a))close();
 }});
 strip.addEventListener('click',e=>{const b=e.target.closest('[data-meter]');if(b)open(b.dataset.meter==='revenue'?'revenue':'usage')});
 dock.querySelector('[data-talk]').onclick=()=>{if(!demo)action('chief-voice').catch(e=>message('Voice unavailable',e.message))};
 dock.onsubmit=async e=>{e.preventDefault();const input=dock.elements.brief,text=input.value.trim();if(!text||demo)return;input.disabled=true;try{close();await action('chief-message',text);input.value='';dock.querySelector('[data-chief-state]').textContent='Chief is working on your brief.'}catch(error){message('Brief not submitted',error.message)}finally{input.disabled=false}};
 dock.querySelector('[data-record]').onclick=()=>{recording=!recording;document.body.classList.toggle('hq-recording',recording);dock.querySelector('[data-record]').setAttribute('aria-pressed',String(recording));dock.querySelector('[data-record]').textContent=recording?'Exit reel view':'Reel view';if(recording)close()};
 dock.querySelector('[data-hide-numbers]').onclick=()=>{const hidden=document.body.classList.toggle('hide-cockpit-numbers');dock.querySelector('[data-hide-numbers]').setAttribute('aria-pressed',String(hidden))};
 async function readMeters(){
  if(disposed||demo||document.hidden||pollBusy)return;pollBusy=true;
  const result=await Promise.allSettled([api('cockpit/usage?days=30'),api('cockpit/revenue')]);
  if(!demo){if(result[0].status==='fulfilled'){const data=result[0].value;readings.usage=data;for(const s of data.sources){const el=strip.querySelector('[data-meter="'+s.id+'"]');el.querySelector('b').textContent=number(s.totals?.tokens);el.title=s.name+' · '+s.state+' · '+(s.source||s.reason||'');el.dataset.state=s.state}const ready=data.sources.filter(s=>s.state==='connected'||s.state==='partial').length;strip.querySelector('.strip-status span').textContent=ready+'/3 usage sources';strip.querySelector('.strip-status').dataset.state=''}
   if(result[1].status==='fulfilled'){const h=result[1].value;readings.revenue=h;const el=strip.querySelector('[data-meter=revenue]');el.querySelector('b').textContent=number(h.metrics?.revenue,h.currency);// The figure is a dated snapshot, never a live total: its date is on screen, and an old one says so (7 Oct 2026).
const snap=Date.parse(h.snapshotDate||''),old=Number.isFinite(snap)&&Date.now()-snap>2*86400000;el.querySelector('small').textContent=Number.isFinite(snap)?'As of '+new Date(snap).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+(old?' · stale':''):'Unavailable';el.dataset.state=old?'stale':h.state||'';el.title='Hex revenue snapshot · Voltera · '+h.state+' · snapshot '+(h.snapshotDate||'unavailable')}
   // A failed read says so, with the time it was tried, instead of "Reading…" / "Connecting" forever (8 Oct 2026).
   const tried=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
   if(result[0].status!=='fulfilled'){const st=strip.querySelector('.strip-status');st.querySelector('span').textContent='Usage unavailable · tried '+tried;st.dataset.state='unavailable'}
   if(result[1].status!=='fulfilled'){const el=strip.querySelector('[data-meter=revenue]');el.querySelector('small').textContent='Unavailable · tried '+tried;el.dataset.state='stale'}}
  pollBusy=false;clearTimeout(usageTimer);usageTimer=setTimeout(readMeters,readings.usage?.sources.some(s=>s.state==='indexing')?4000:45000);
 }
 function notification(event){
  views?.inboxLive?.(event);
  if(demo||!event.id||seen.has(event.id))return;seen.add(event.id);if(seen.size>800)seen.delete(seen.values().next().value);
  const fresh=Date.now()-(event.at||0)*1000;if(fresh<0||fresh>15000)return;
  const d=event.data||{},profile=d.profile||d.assignee,name=getState()?.profiles?.find(p=>p.id===profile)?.name||profile||'Agent';
  const mapping={'run.accepted':['Mission accepted','Your agent has received the brief.'],'run.completed':['Result ready','Open the conversation to review the result.'],'run.failed':['Work needs attention','Open the task to see what happened.'],'task.delegated':['Chief → '+name,'The task was assigned. Waiting for runtime start.'],'task.started':[name+' started','Your agent is now working on the task.'],'task.completed':[name+' finished','The result is ready to review.'],'task.blocked':[name+' needs help','Open the task for its blocking condition.'],'task.failed':[name+' could not finish','Open the task to review the failure.']};
  if(mapping[event.kind]){const [title,text]=mapping[event.kind];message(title,recording?'Task status updated.':text,profile);dock.querySelector('[data-chief-state]').textContent=title}
  if(event.kind==='task.delegated'&&profile)getOffice()?.delegate?.('chief',profile);
  if(['task.blocked','task.failed'].includes(event.kind)&&profile)getOffice()?.pulse(profile,'failed');
  if(event.kind==='task.started'&&profile)getOffice()?.pulse(profile,'work');
 }
 function observe(items){
  lastLiveItems=items;if(demo)return;const current=new Map(items.filter(t=>t.kind==='task').map(t=>[t.id,t]));
  if(tasksBaseline){for(const [id,t]of current){const old=tasksBaseline.get(id);if(!old&&t.changed>=bootAt&&!t.mission_id){message('Assigned to '+(t.profile||'agent'),recording?'New task':t.title,t.profile);getOffice()?.delegate?.('chief',t.profile)}else if(old&&!t.mission_id&&old.stage!==t.stage&&['running','done','failed','waiting'].includes(t.stage)){message((t.profile||'Agent')+' · '+t.stage,recording?'Task status updated':t.title,t.profile);if(t.stage==='running')getOffice()?.pulse(t.profile,'work')}}}
  tasksBaseline=current;
 }
 function demoStep(index,epoch){
  if(!demo||epoch!==demoEpoch)return;
  if(index>=STORY.length){dock.querySelector('[data-demo]').textContent='↻ Replay demo';story.innerHTML+='<button type="button" data-replay-story>Replay mission</button>';story.querySelector('[data-replay-story]').onclick=()=>startDemo(true);return}
  const step=STORY[index],office=getOffice(),profiles=getState().profiles,person=profiles.find(p=>p.id===step.agent);
  story.innerHTML='<small>DEMO / '+(index+1)+' OF '+STORY.length+'</small><h3>'+esc(step.title)+'</h3><p>'+esc(step.detail).replaceAll('\n','<br>')+'</p><div id="demo-progress">'+STORY.map((_,i)=>'<i class="'+(i<=index?'done':'')+'"></i>').join('')+'</div>';
  caption.textContent=step.caption;
  if(person){office?.focus(person.department,false);office?.delegate?.('chief',step.agent,{demo:true});office?.pulse(step.agent,index===4?'done':'work',{demo:true})}
  const demoItems=STORY.slice(0,index+1).map((s,i)=>({id:'demo-'+i,kind:'task',title:s.title,profile:s.agent,department:profiles.find(p=>p.id===s.agent)?.department,stage:i===index&&index<4?'running':'done',status:i===index&&index<4?'running':'completed',changed:Date.now()}));
  office?.update(demoItems,{demo:true});
  demoAudio?.pause();demoAudio=new Audio('/static/demo-'+step.audio+'.mp3');demoAudio.play().catch(()=>{if(demo&&epoch===demoEpoch)story.querySelector('small').textContent+=' · SUBTITLES ONLY'});
  demoTimer=setTimeout(()=>demoStep(index+1,epoch),step.seconds*1000);
 }
 function startDemo(replay=false){
  if(!replay){previousRoute=route;close();voice.stop?.();document.body.classList.remove('has-rail');demo=true;notices.replaceChildren();getOffice()?.setDemo?.(true);document.body.classList.add('hq-demo');banner.hidden=false;story.hidden=false;strip.hidden=true;dock.querySelector('[data-demo]').setAttribute('aria-pressed','true')}
  clearTimeout(demoTimer);demoAudio?.pause();demoEpoch++;dock.querySelector('[data-demo]').textContent='■ Exit demo';demoStep(0,demoEpoch);
 }
 function stopDemo(){
  demo=false;demoEpoch++;clearTimeout(demoTimer);demoAudio?.pause();demoAudio=null;getOffice()?.setDemo?.(false);document.body.classList.remove('hq-demo');banner.hidden=true;story.hidden=true;caption.textContent='';strip.hidden=false;dock.querySelector('[data-demo]').setAttribute('aria-pressed','false');dock.querySelector('[data-demo]').textContent='▷ Demo';getOffice()?.home();if(lastLiveItems)getOffice()?.update(lastLiveItems);readMeters();if(previousRoute!=='office')open(previousRoute)
 }
 dock.querySelector('[data-demo]').onclick=()=>demo?stopDemo():startDemo();
 window.addEventListener('popstate',()=>{if(location.hash.startsWith('#workflow?'))return;  // the workflow drawer owns these links
  if(demo)stopDemo();const section=hashSection();const brain=document.querySelector('#brain-view');if(section!=='brain'&&brain?.open)brain.close();open(section,{history:true})});
 // Closing the Brain returns to the page behind it and its route.
 document.querySelector('#brain-view')?.addEventListener('close',()=>{if(location.hash==='#brain')history.replaceState({section:'office'},'',location.pathname+'#office');if(route==='brain'){route='office';selectedNav(panel.hidden?'office':route)}});
 const editing=e=>e.composedPath().some(n=>n.nodeType===1&&(['INPUT','TEXTAREA','SELECT','IFRAME'].includes(n.tagName)||n.isContentEditable));
 window.addEventListener('keydown',e=>{if(e.key==='Escape'&&demo){e.preventDefault();stopDemo();return}/* Escape closes only the topmost layer (drawer, dialog, menu, mobile sidebar) and never leaves the page (10 Oct 2026). */if(e.key==='Escape'&&document.body.classList.contains('sidebar-open')){document.body.classList.remove('sidebar-open')}if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='j'&&!demo){e.preventDefault();focusChief()}},true);
 views.root.addEventListener('click',e=>{if(e.composedPath().some(n=>n.classList?.contains?.('ws-menu'))){e.stopImmediatePropagation();document.body.classList.toggle('sidebar-open')}},true);
 views.root.addEventListener('keydown',e=>{if(e.composedPath().some(t=>['INPUT','TEXTAREA','SELECT'].includes(t.tagName)))e.stopPropagation()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)readMeters()});
 window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(usageTimer);clearTimeout(demoTimer);demoAudio?.pause()});
 function focusChief(){if(document.querySelector('dialog[open]'))return;const input=dock.elements.brief;input.focus();input.select?.()}
 // The command palette is a lazy chunk (11 Oct 2026, entry budget B2): created when the browser is idle after start, or on
 // first use. Until then this listener answers ⌘K and ? as the palette's own does; that one registers later but still after
 // the two capture listeners above, so keys are handled in the same order.
 let paletteM=null,paletteP=null,paletteWant=null;const paletteReady=()=>paletteP??=import('./command-palette.mjs').then(m=>paletteM??=m.createCommandPalette({getState,getItems,isBlocked:()=>demo||recording,go:id=>route_(id),action:(a,id)=>action(a,id),focusChief}),e=>{paletteP=null;throw e});
 const paletteOpen=(mode='')=>{if(paletteM)return paletteM.open(mode);if(demo||recording)return;paletteWant=mode;paletteReady().then(p=>{const want=paletteWant;paletteWant=null;if(want!=null)p.open(want)}).catch(e=>{paletteWant=null;message('Search unavailable',e.message)})};
 const palette={open:paletteOpen,close:()=>{paletteWant=null;paletteM?.close()},get isOpen(){return Boolean(paletteM?.isOpen)}};
 window.addEventListener('keydown',e=>{if(paletteM)return;
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();if(paletteWant!=null)paletteWant=null;else paletteOpen();return}
  if(e.key==='?'&&!e.metaKey&&!e.ctrlKey&&paletteWant==null&&!e.composedPath().some(t=>/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable)&&!document.querySelector('dialog[open]')){e.preventDefault();paletteOpen('?')}
 },true);
 setTimeout(()=>(window.requestIdleCallback||(f=>setTimeout(f,0)))(()=>paletteReady().catch(()=>{}),{timeout:4000}),3000);
 const params=new URLSearchParams(location.search);const initial=location.hash.startsWith('#workspace/')||location.hash==='#brain'?hashSection():params.has('workspace')?(params.get('section')||'overview'):'office';
 open(initial,{history:true}).catch(e=>message('Workspace unavailable',e.message));readMeters();
 return {open,close,event:notification,observe,notify:(title,detail)=>center.add({title,detail}),setInbox:n=>sidebar.setInbox(n),setHealth:(s,l)=>sidebar.setHealth(s,l),palette,get demo(){return demo},get recording(){return recording},get modalActive(){return !!views.root.querySelector('dialog[open]')},snapshot:()=>({route,demo,recording,readings}),root:views.root};
}
