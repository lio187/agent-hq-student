/* Preserve the original Content OS UI while bounding writes to one source receipt. */
(()=>{
 const original=window.fetch.bind(window),pending=new Map();
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  const method=(init.method||input.method||'GET').toUpperCase();
  if(url.origin!==location.origin||!url.pathname.startsWith('/content-os/api/')||method==='GET'||/\/api\/(login|logout)$/.test(url.pathname))return original(input,init);
  // A multipart retry keeps the same key even if the browser changes its boundary.
  // After an uncertain result it cannot create a second ingestion job.
  const signature=method+' '+url.pathname+'\n'+(init.body instanceof FormData?'upload':String(init.body||''));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature))),b=>b.toString(16).padStart(2,'0')).join('');
  const storageKey='hq.content-os.request.'+digest;
  if(!pending.has(digest)){
   let saved;try{saved=sessionStorage.getItem(storageKey)}catch{}
   pending.set(digest,saved||crypto.randomUUID());
   try{sessionStorage.setItem(storageKey,pending.get(digest))}catch{}
  }
  const headers=new Headers(init.headers);headers.set('X-HQ-Request-Key',pending.get(digest));
  const response=await original(input,{...init,headers});
  if(response.status<500&&response.status!==409){pending.delete(digest);try{sessionStorage.removeItem(storageKey)}catch{}}
  return response;
 };
})();
