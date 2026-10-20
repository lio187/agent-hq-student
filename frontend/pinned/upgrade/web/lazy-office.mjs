// The 3D office (three.js, ~590 KB) loads on its own (6 October 2026): workspace pages open without it.
// Until the scene is ready, state calls keep only their latest arguments and are replayed once it loads;
// animation-only calls are dropped; read calls answer "not available" (undefined), as optional calls expect.
const STATE=new Set(['update','focus','home','select','theme','brain']);
const ANIMATION=new Set(['pulse','zoom','rotate','meeting']);
export function lazyOffice(load){
 let real=null,loading=null;const pending=new Map();
 const ensure=()=>loading||(loading=Promise.resolve().then(load).then(office=>{real=office;for(const [method,args] of pending)office[method]?.(...args);pending.clear();return office}));
 return new Proxy({},{get(_,prop){
  if(prop==='ensure')return ensure;
  if(prop==='loaded')return Boolean(real);
  if(real){const value=real[prop];return typeof value==='function'?value.bind(real):value}
  if(STATE.has(prop))return (...args)=>{if(prop==='focus'||prop==='select'||prop==='home'){pending.delete('focus');pending.delete('select');pending.delete('home')}pending.set(prop,args)};
  if(ANIMATION.has(prop))return ()=>{};
  if(prop==='pixel'||prop==='life')return ()=>false;
  if(prop==='snapshot')return ()=>({loading:true});
  return undefined;
 }});
}
// Load now on the office route; otherwise when the route becomes the office, or quietly once idle.
export function scheduleOffice(office,{isOffice,observe,idle}){
 if(isOffice())return office.ensure();
 observe(()=>{if(isOffice())office.ensure()});
 idle(()=>office.ensure());
}
