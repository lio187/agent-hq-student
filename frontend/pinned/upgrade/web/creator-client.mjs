// Native Creator Lab writes use the same source token and durable HQ receipts.
export async function creatorWrite(path,body,token,{fetcher=fetch,storage=sessionStorage,cryptoAPI=crypto}={}){
 if(!token)throw Error('Refresh Creator Lab before changing a run.');
 if(!/^(?:runs(?:\/[A-Za-z0-9_-]+\/(?:run|pause|attach))?|watchlists(?:\/[a-z0-9-]{1,41})?|connections(?:\/check)?|radar\/batches(?:\/[a-f0-9-]{36}\/(?:cancel|reconcile))?)$/.test(path))throw Error('Unsupported Creator Lab action.');
 const data=JSON.stringify(body),signature=path+'\n'+data;
 const digest=Array.from(new Uint8Array(await cryptoAPI.subtle.digest('SHA-256',new TextEncoder().encode(signature))),byte=>byte.toString(16).padStart(2,'0')).join('');
 const entry='hq.creator.native.'+digest;
 let key;try{key=storage.getItem(entry)||cryptoAPI.randomUUID();storage.setItem(entry,key)}catch{throw Error('Retry storage is unavailable. No action was submitted.')}
 let response;
 try{response=await fetcher('/creator-lab/api/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Lab-Token':token,'X-HQ-Request-Key':key},body:data})}
 catch{throw Error('The result is uncertain. Check the source before retrying; this request keeps its original key.')}
 let result;try{result=await response.json()}catch{throw Error('The source result could not be read. Check the source before retrying.')}
 const knownRejection=response.status===409&&['watchlist_busy','watchlist_revision_conflict','radar_busy','radar_state','radar_conflict','radar_uncertain','radar_evidence'].includes(result.code);
 if(response.status<500&&(response.status!==409||knownRejection))storage.removeItem(entry);
 if(!response.ok)throw Error(typeof result.error==='string'?result.error:result.error?.message||'Creator Lab rejected the action.');
 return result;
}
