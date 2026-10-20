const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function reviewContext(item,job,data,mediaHTML){
 const output=job?.output||{},media=Array.isArray(output.media)?output.media.filter(v=>typeof v==='string'):[];
 const assets=Array.isArray(output.assets)?output.assets:[];
 const records=media.map((url,index)=>{
  const asset=assets.find(a=>a?.url===url),format=['carousel','story'].includes(asset?.format)?asset.format:'other';
  let image=false;
  try{const parsed=new URL(url,'http://localhost');image=/\.(png|jpe?g|webp|gif)$/i.test(parsed.searchParams.get('key')||parsed.pathname)}catch{}
  return {url,format,image,index:Number.isInteger(asset?.index)&&asset.index>0?asset.index:index+1};
 });
 let html=['carousel','story','other'].map(format=>{
  const rows=records.filter(r=>r.format===format);if(!rows.length)return '';
  const label={carousel:'Carousel',story:'Stories',other:'Media'}[format];
  return `<section aria-label="${label}"><h3>${label} · ${rows.length}</h3>${rows.map(r=>`<figure>${mediaHTML(r.image?'':r.url,r.image?r.url:'',data)}<figcaption>${label} ${r.index}</figcaption></figure>`).join('')}</section>`;
 }).join('');
 if(!records.length)html=item.editedVideo?mediaHTML(item.editedVideo,'',data):'<p class="notice">No media for this item yet. Check the available text before deciding.</p>';
 if(output.verify){const passed=output.verify.passed===true;html+=`<p class="${passed?'':'notice'}">Automatic check: ${passed?'passed':output.verify.passed===false?'did not pass':'unknown'}${output.verify.report?' · '+esc(String(output.verify.report)):''}</p>`}
 if(item.hook)html+=`<p><strong>Hook</strong><br>${esc(item.hook)}</p>`;
 if(item.caption)html+=`<details><summary>Caption</summary><pre class="document">${esc(item.caption)}</pre></details>`;
 else html+='<p class="notice">No caption in the source.</p>';
 if(output.summary)html+=`<p>${esc(output.summary)}</p>`;
 return html;
}
