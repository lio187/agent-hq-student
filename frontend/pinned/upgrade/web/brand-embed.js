// Integration glue for the existing, locally served Brand Factory application.
// User-triggered writes keep one request identity until a definite receipt.
(() => {
 const originalFetch=window.fetch.bind(window),pending=new Map();
 const storageKey='hq-brand-pending-v1';
 try{for(const [k,v] of JSON.parse(sessionStorage.getItem(storageKey)||'[]'))pending.set(k,v)}catch{}
 const save=()=>{try{sessionStorage.setItem(storageKey,JSON.stringify([...pending]))}catch{}};
 window.fetch=async(input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href),method=(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(url.origin!==location.origin||!url.pathname.startsWith('/brand-factory/api/')||method==='GET'||method==='HEAD')return originalFetch(input,options);
  const body=typeof options.body==='string'?options.body:'',fingerprint=url.pathname+'\n'+body;
  let key=pending.get(fingerprint);if(!key){key=crypto.randomUUID();pending.set(fingerprint,key);save()}
  const headers=new Headers(options.headers);headers.set('X-HQ-Request-Key',key);
  const response=await originalFetch(input,{...options,headers});
  let code;try{code=(await response.clone().json())?.error?.code}catch{}
  if(response.status<500&&code!=='brand_uncertain'&&response.status!==403){pending.delete(fingerprint);save()}
  if(response.status>=500||code==='brand_uncertain')notice('The request has no confirmed result. Check the existing job before submitting it again.');
  return response;
 };
 function notice(text){
  let el=document.getElementById('hq-brand-notice');if(!el){el=document.createElement('p');el.id='hq-brand-notice';el.setAttribute('role','status');document.querySelector('main')?.prepend(el)}
  if(el)el.textContent=text;
 }
 function theme(){
  try{document.documentElement.dataset.theme=parent.document.body.classList.contains('dark')?'dark':'operator'}catch{}
 }
 document.addEventListener('DOMContentLoaded',()=>{
  // The observer watches the office page; it is disconnected when this frame unloads.
  theme();try{const watch=new MutationObserver(theme);watch.observe(parent.document.body,{attributes:true,attributeFilter:['class']});addEventListener('pagehide',()=>watch.disconnect())}catch{}
  originalFetch('/brand-factory/api/health').then(r=>{if(!r.ok)throw Error();return r.json()}).catch(()=>notice('Brand Factory is disconnected. The original local service on port 3339 must be running.'));
 });
})();
