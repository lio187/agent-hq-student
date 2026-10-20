const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numbers={reelsPerHandle:[20,1,1000,1],spendCapUsd:[3,0.05,100,0.01],minBreakout:[3,1,1000,'any'],minLikes:[300,0,1e9,1],minComments:[500,0,1e9,1],maxPerHandle:[3,1,50,1]};
const labels={reelsPerHandle:'Reels per handle',spendCapUsd:'Estimated total spend cap (USD)',minBreakout:'Minimum breakout',minLikes:'Minimum likes',minComments:'Minimum comments',maxPerHandle:'Maximum outliers per handle'};
const comparable=value=>{const {seenCount,error,...rest}=value;return Object.fromEntries(Object.entries(rest).sort(([a],[b])=>a.localeCompare(b)))};
export const sameWatchlist=(a,b)=>JSON.stringify(comparable(a))===JSON.stringify(comparable(b));
export function watchlistPayload(original,fields,topics){
 const result={...comparable(original),name:original.name||fields.name,accountId:fields.accountId,mode:fields.mode,postIdField:fields.postIdField,angle:fields.angle,notes:fields.notes,sources:fields.sources.split('\n').map(s=>s.trim()).filter(Boolean),handles:[...new Set(fields.handles.split(/[\s,]+/).map(h=>h.replace(/^@/,'')).filter(Boolean))],topics};
 for(const name of Object.keys(numbers))result[name]=Number(fields[name]);
 return result;
}
export async function saveWatchlist({read,write,original,payload}){
 if(original.name){if(!/^[a-f0-9]{64}$/.test(original.revision||''))throw Error('Reload this watchlist from the updated source before saving.');const current=await read('watchlists/'+encodeURIComponent(original.name));if(!sameWatchlist(original,current))throw Error('The source watchlist changed. Reload and compare before saving; your form has not been submitted.')}
 const request={...payload};delete request.revision;if(original.name)request.expectedRevision=original.revision;
 const receipt=await write('watchlists'+(original.name?'/'+encodeURIComponent(original.name):''),request);
 let current;try{current=await read('watchlists/'+encodeURIComponent(receipt.name))}catch{throw Error('Save received, but source readback failed. Check the original watchlist before retrying.')}
 if(!sameWatchlist(receipt,current))throw Error('The source changed after saving. Reload and reconcile before retrying.');
 return current;
}
export function createWatchlists({root,read,write}){
 let originals=new Map();
 root.addEventListener('submit',async event=>{
  const form=event.target;if(!form.matches('[data-creator-watchlist]'))return;
  event.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[data-watchlist-status]');if(button.disabled)return;
  const original=originals.get(form.dataset.creatorWatchlist);if(!original){status.textContent='Reload the source before editing.';return}
  const fields=Object.fromEntries(new FormData(form)),topics=[...form.querySelectorAll('[name="topic"]:checked')].map(input=>input.value),payload=watchlistPayload(original,fields,topics);
  const controls=[...form.querySelectorAll('input,select,textarea')];controls.forEach(input=>input.disabled=true);button.disabled=true;status.textContent='Checking the source and saving settings…';
  try{const saved=await saveWatchlist({read,write,original,payload});originals.set(form.dataset.creatorWatchlist,saved);form.querySelector('[name="name"]').readOnly=true;status.textContent='Settings confirmed in the original watchlist. No analysis was started.'}
  catch(error){status.textContent=error.message}
  finally{button.disabled=false;controls.forEach(input=>input.disabled=false)}
 });
 const select=(name,values,value)=>'<label>'+esc(name)+'<select name="'+name+'">'+values.map(option=>'<option '+(option===value?'selected ':'')+'value="'+option+'">'+option+'</option>').join('')+'</select></label>';
 function form(w,index,topics){
  return '<details class="card"><summary>'+esc(w.name||'Create a watchlist')+(w.name?' · '+esc(w.accountId)+' · '+(w.handles||[]).length+' handles':'')+'</summary><p>Settings only. This does not run Radar or push research to Content Engine.</p><form data-creator-watchlist="'+index+'"><label>Name<input name="name" value="'+esc(w.name)+'" '+(w.name?'readonly ':'')+'required pattern="[a-z0-9][a-z0-9-]{0,40}"></label><label>HQ account ID<input name="accountId" value="'+esc(w.accountId)+'" required pattern="[A-Za-z0-9_.-]{1,40}"></label>'+select('mode',['competitors','own'],w.mode||'competitors')+'<label>Handles<textarea name="handles">'+esc((w.handles||[]).join('\n'))+'</textarea></label>'+Object.entries(numbers).map(([name,[def,min,max,step]])=>'<label>'+labels[name]+'<input name="'+name+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+esc(w[name]??def)+'" required></label>').join('')+'<fieldset><legend>Jev topics (none means any)</legend>'+topics.map(topic=>'<label><input type="checkbox" name="topic" value="'+esc(topic)+'" '+((w.topics||[]).includes(topic)?'checked':'')+'>'+esc(topic)+'</label>').join('')+'</fieldset>'+select('postIdField',['map','id','shortCode'],w.postIdField||'map')+'<p class="source">For own posts, map uses the existing HQ post-ID mapping. Changing this does not synchronize it.</p><label>Own angle<textarea name="angle" maxlength="300">'+esc(w.angle)+'</textarea></label><label>Notes<textarea name="notes" maxlength="2000">'+esc(w.notes)+'</textarea></label><label>Source references (one per line)<textarea name="sources">'+esc((w.sources||[]).join('\n'))+'</textarea></label><button type="submit">Save settings</button><p role="status" data-watchlist-status></p></form></details>';
 }
 return async()=>{const data=await read('watchlists');originals=new Map();let html='<section><h2>Radar watchlists</h2>';for(const [index,w] of [...data.watchlists,{}].entries()){if(w.error){html+='<p class="notice">'+esc(w.name)+': '+esc(w.error)+'</p>';continue}originals.set(String(index),w);html+=form(w,index,data.topics||[])}return html+'</section>'};
}
