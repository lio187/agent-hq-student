export async function readDeliveryReview(path,read=fetch){
 if(typeof path!=='string'||path.length>500||!path.startsWith('projects/')||!path.endsWith('/REVIEW.md')||path.split('/').some(p=>!p||p.startsWith('.')||/[\\\x00-\x1f]/.test(p)))throw Error('Choose a reviewed project document.');
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(path));
 const id='vault-'+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const response=await read('/api/hq/v1/brain/vault/file/'+id);
 if(!response.ok)throw Error('The local review is unavailable ('+response.status+'). Open the Brain to refresh its source index if the file was recently added.');
 if(!response.headers.get('content-type')?.startsWith('text/plain'))throw Error('The source did not return a plain-text review.');
 const text=await response.text();
 return {path,id,text};
}
