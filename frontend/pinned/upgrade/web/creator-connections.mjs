const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const providers=['apify','fireworks','groq','jev'];
export function connectionSummary(boot){return providers.map(name=>name+': '+(boot.connections?.[name]?.verified?'verified':boot.connections?.[name]?.configured?'configured; not verified':'not configured')).join(' · ')}
export function parseScrapeImport(text){
 const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length<1||rows.length>1000||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('Import must contain 1 to 1,000 Apify Reel objects in a JSON array.');return rows;
}
export function createConnections({root,read,write}){
 root.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='creator-connections')return;event.preventDefault();
  const button=event.submitter;if(!button||button.disabled)return;
  const check=button.value==='check',status=form.querySelector('[data-connection-status]');
  const data=Object.fromEntries([...new FormData(form)].filter(([key,value])=>providers.includes(key)&&String(value).trim()).map(([key,value])=>[key,String(value).trim()]));
  if(check&&Object.keys(data).length){status.textContent='Save the entered keys before checking provider access.';return}
  if(!check&&!Object.keys(data).length){status.textContent='Enter a replacement key to save.';return}
  const inputs=[...form.querySelectorAll('input,button')];inputs.forEach(input=>input.disabled=true);status.textContent=check?'Checking the configured provider accounts…':'Saving keys in the local Creator Lab server session…';
  try{await write(check?'connections/check':'connections',check?{}:data);form.reset();const boot=await read('bootstrap');status.textContent=connectionSummary(boot);form.querySelector('[data-connection-summary]').textContent=connectionSummary(boot)}
  catch{status.textContent='The connection action could not be confirmed. Check the original Connections screen before retrying.'}
  finally{for(const name of providers)form.elements.namedItem(name).value='';inputs.forEach(input=>input.disabled=false)}
 });
 return boot=>'<details class="card"><summary>Provider connections</summary><p data-connection-summary>'+esc(connectionSummary(boot))+'</p><p>Speech provider: '+esc(boot.transcriptionProvider||'Unknown')+'. Replacement keys stay in the original local server session. Checking access does not start an analysis.</p><form id="creator-connections">'+providers.map(name=>'<label>'+esc(name)+' replacement key<input type="password" name="'+name+'" autocomplete="new-password" spellcheck="false"></label>').join('')+'<button type="submit" value="save">Save replacement keys</button><button type="submit" value="check">Check configured provider access</button><p data-connection-status role="status"></p></form></details>';
}
