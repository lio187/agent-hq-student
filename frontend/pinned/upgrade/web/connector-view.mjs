import {connectorGroup,headerConnections,departmentLinks,DEPARTMENT_COLORS} from './connector-links.mjs';
import {CONNECTOR_LOGOS} from './connector-logos.js';
import {escapeHTML as esc} from './message-view.mjs';
import {connectorService} from './connector-service.mjs';
export {connectorService} from './connector-service.mjs';

export function connectorMark(name){if(name==='content-os')return '<img class="connector-logo" src="/static/logo-ui.png" alt="" width="28" height="28">';if(name==='time'||name==='notes')return `<svg class="connector-logo utility-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">${name==='time'?'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>':'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'}</svg>`;const key=name.replace(/-native$|-oauth$/g,''),logo=CONNECTOR_LOGOS[key];return logo?`<img class="connector-logo" src="${esc(logo.url||'/static/connector-'+logo.file)}" alt="" width="28" height="28">`:`<span class="connector-monogram" aria-hidden="true">${esc(name.slice(0,2).toUpperCase())}</span>`}

export function createConnectorDock(office,onOpen,profiles=[]){
 const holder=document.querySelector('#office'),strip=document.querySelector('#connector-strip');

 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='connector-wires';svg.setAttribute('aria-hidden','true');document.body.append(svg);
 let showLinks=true;
 const toggle=document.createElement('button');toggle.id='tool-links';toggle.textContent='Tool links · on';toggle.setAttribute('aria-pressed','true');toggle.title='Show tool connections. Moving dots trace connections; bright pulses show observed use.';document.querySelector('#camera').prepend(toggle);toggle.onclick=()=>{showLinks=!showLinks;toggle.setAttribute('aria-pressed',String(showLinks));toggle.textContent='Tool links · '+(showLinks?'on':'off');svg.toggleAttribute('hidden',!showLinks);wake()};
 let department=null,connections=[],rows=[],signature='',signals=[],hoveredAgent=null,last=0,buttons=[],hoveredService=null;
 let overrides={};try{overrides=JSON.parse(localStorage.getItem('hq-connector-layout')||'{}')}catch{}
 const groups=new Map(),paths=new Map(),dots=new Map();
 new MutationObserver(()=>{buttons=[...strip.querySelectorAll('[data-connection-name]')];syncHeader()}).observe(strip,{childList:true});
 strip.addEventListener('pointerover',e=>{hoveredService=e.target.closest('[data-connection-name]')?.dataset.connectionName||null});
 strip.addEventListener('pointerleave',()=>hoveredService=null);
 strip.addEventListener('focusin',e=>{hoveredService=e.target.closest('[data-connection-name]')?.dataset.connectionName||null});
 strip.addEventListener('focusout',()=>hoveredService=null);
 function links(c){return departmentLinks(c,profiles,overrides)}
 function syncHeader(){
  let label=strip.querySelector('#connector-context');if(!label){label=document.createElement('span');label.id='connector-context';strip.prepend(label)}
  label.hidden=!department;label.textContent=department?(profiles.find(p=>p.department===department)?.department_name||department)+' · CONNECTED TO':'';
  const allowed=new Set(headerConnections(rows).map(g=>g.name));
  for(const button of strip.querySelectorAll('[data-connection-name]'))button.hidden=!!department&&!allowed.has(button.dataset.connectionName);
  strip.classList.toggle('department-connections',!!department);const library=strip.querySelector('#connector-library');if(library)library.hidden=!!department;
 }
 function update(all,dept){
  connections=all;department=dept;groups.clear();for(const g of headerConnections(all))groups.set(g.name,g.accounts);
  rows=all.filter(c=>!['time','notes'].includes(c.name)&&dept&&links(c).some(l=>l.department===dept));syncHeader();
 }
 svg.addEventListener('click',e=>{const dept=e.target.dataset.department;if(dept)office.focus(dept)});
 function attr(node,key,value){const text=String(value);if(node.getAttribute(key)!==text)node.setAttribute(key,text)}
 // The wire loop only runs while the office is on screen (7 Oct 2026): behind a workspace page, a hidden tab,
 // a demo or a recording it stops completely instead of waking the main thread on every display frame.
 let running=false;
 const idle=()=>document.hidden||!showLinks||['workspace-open','hq-demo','hq-recording'].some(c=>document.body.classList.contains(c));
 function wake(){if(running||idle())return;running=true;requestAnimationFrame(layout)}
 new MutationObserver(wake).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',wake);
 function layout(now){
  if(idle()){running=false;return}
  if(now-last>48){last=now;const h=holder.getBoundingClientRect();signals=signals.filter(s=>s.until>now);
   const frame=[];const glow=new Set();
   if(hoveredAgent){const pt=office.agentSocket?.(hoveredAgent.profile),r=hoveredAgent.element.getBoundingClientRect();if(pt&&r.top<h.bottom&&r.bottom>h.top)frame.push({key:'work',cls:'work-link',d:`M${r.left},${r.top+r.height/2} C${r.left-80},${r.top+r.height/2} ${h.left+pt.x+80},${h.top+pt.y} ${h.left+pt.x},${h.top+pt.y}`})}
   for(const button of buttons){
    if(button.hidden)continue;const name=button.dataset.connectionName,group=groups.get(name)||[],relations=new Map();
    for(const c of group)for(const link of links(c))relations.set(link.department,link);
    const live=signals.filter(s=>connectorGroup(s.service)===name);
    const targets=[...relations.values()].filter(l=>!department||department===l.department).map(l=>({...l,point:office.socket?.(l.department)}));
    const observedProfiles=[...new Set(group.flatMap(c=>(c.agent_activity||[]).map(a=>a.profile)))];
    if(department||hoveredService===name)for(const profile of observedProfiles){const agent=profiles.find(p=>p.id===profile);if(agent&&(!department||agent.department===department))targets.push({point:office.agentSocket?.(profile),profile,department:agent.department,basis:'observed'})}
    for(const event of live)targets.push({point:office.agentSocket?.(event.profile),live:true,profile:event.profile,account:event.account});
    const r=button.getBoundingClientRect(),header=strip.getBoundingClientRect();if(r.right<header.left||r.left>header.right)continue;
    for(const target of targets){if(!target.point)continue;const x=r.left+r.width/2,y=r.bottom,tx=h.left+target.point.x,ty=h.top+target.point.y;if(tx<h.left||tx>h.right||ty<h.top||ty>h.bottom)continue;
     const hovered=hoveredService===name;if(hovered&&target.department)glow.add(target.department);
     frame.push({key:name+':'+(target.profile||target.department),service:name,department:target.department||'',basis:target.live?'live':target.basis,account:target.account||'',color:DEPARTMENT_COLORS[target.department]||'#e2561f',cls:(target.live?'connector-live':'connector-assigned')+(hovered?' connector-hover':''),d:`M${x},${y} C${x},${y+100} ${tx},${ty-110} ${tx},${ty}`});
    }
   }
   // Batch all layout reads above; only update changed SVG attributes below.
   const keep=new Set(frame.map(p=>p.key));for(const [key,node]of paths)if(!keep.has(key)){node.remove();paths.delete(key);dots.get(key)?.remove();dots.delete(key)}
   for(const p of frame){let node=paths.get(p.key);if(!node){node=document.createElementNS('http://www.w3.org/2000/svg','path');paths.set(p.key,node);svg.append(node)}for(const [k,v]of Object.entries({class:p.cls,d:p.d,'data-service':p.service||'','data-department':p.department||'','data-basis':p.basis||'','data-account':p.account||'',style:'stroke:'+(p.color||'#e2561f')}))attr(node,k,v)}
   // A slow moving dot traces each relationship; observed events retain their distinct live path.
   for(const p of frame){if(p.cls==='work-link')continue;let dot=dots.get(p.key);if(!dot){dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r','2.3');dots.set(p.key,dot);svg.append(dot)}const phase=[...p.key].reduce((a,c)=>a+c.charCodeAt(0),0)%70/10;attr(dot,'class','connector-trace'+(p.cls.includes('connector-hover')?' connector-trace-hover':'')+(p.cls.includes('connector-live')?' connector-trace-live':''));attr(dot,'style',`fill:${p.color};offset-path:path('${p.d}');animation-delay:-${phase}s`)}
   for(const badge of document.querySelectorAll('.dept-label'))badge.classList.toggle('connector-highlight',glow.has(badge.dataset.department));
   svg.classList.toggle('has-hover',!!hoveredService);svg.toggleAttribute('hidden',!showLinks||document.body.classList.contains('cinematic'));
  }
  requestAnimationFrame(layout);
 }
 wake();
 return {update,linkedDepartments(c){return links(c).map(l=>l.department)},saveLayout(id,departments){overrides[id]=departments;localStorage.setItem('hq-connector-layout',JSON.stringify(overrides));signature='';update(connections,department)},inspect(profile,element){hoveredAgent=profile?{profile,element}:null;document.querySelectorAll('.agent-label').forEach(el=>el.classList.toggle('work-inspected',el.dataset.agent===profile))},activity(profile,tool,accountId=null){const account=accountId?connections.find(c=>c.id===accountId):null;if(accountId&&!account)return;const service=account?.name||connectorService(tool,connections);if(!service)return;signals=signals.filter(s=>s.profile!==profile||s.service!==service);signals.push({profile,service,account:account?.id,until:performance.now()+12000})},pulse(id){const c=connections.find(c=>c.id===id);for(const el of document.querySelectorAll('[data-connection-name],[data-dock-name]'))if(el.dataset.connectionName===connectorGroup(c?.name)||el.dataset.dockName===connectorGroup(c?.name)){el.classList.add('runtime-pulse');setTimeout(()=>el.classList.remove('runtime-pulse'),1200)}}};
}

export function modelMark(profile){const text=[profile.model,profile.provider].filter(Boolean).join(' ').toLowerCase();return connectorMark(/claude|anthropic/.test(text)?'claude':/gpt|openai/.test(text)?'chatgpt':profile.provider||'model')}
