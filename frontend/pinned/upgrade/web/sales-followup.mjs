const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function followupAttempt(task,fields){
 if(!task||!Number.isInteger(task.revision))throw Error('Reopen the task; the source revision is missing.');
 const patch=Object.fromEntries(['title','status','dueAt','notes','ownerId','hermonUrl'].map(key=>[key,String(fields[key]??'')]));patch.title=patch.title.trim();
 if(!patch.title||patch.title.length>300||patch.notes.length>5000||!['todo','doing','done'].includes(patch.status))throw Error('Check the title, status and notes.');
 if(patch.dueAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueAt)||!Number.isFinite(Date.parse(patch.dueAt))||new Date(patch.dueAt).toISOString().slice(0,10)!==patch.dueAt))throw Error('Choose a valid follow-up date.');
 if(patch.hermonUrl){let url;try{url=new URL(patch.hermonUrl)}catch{}if(!url||url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS file link without login details.');patch.hermonUrl=url.href}
 if(!task.id){if(!['187n','liogpt','lio','unassigned'].includes(fields.accountId))throw Error('Explicitly choose the account for the follow-up.');patch.accountId=fields.accountId==='unassigned'?null:fields.accountId;patch.area='sales'}
 return {id:task.id,revision:task.revision+1,accountId:task.id?(task.accountId??null):patch.accountId,area:task.area,itemId:task.itemId||'',patch,body:{action:'task.save',id:task.id,revision:task.revision,patch}};
}
export function verifyFollowup(task,attempt){
 if(!task||task.id!==attempt.id||task.revision!==attempt.revision||(task.accountId??null)!==attempt.accountId||task.area!==attempt.area||(task.itemId||'')!==attempt.itemId||Object.entries(attempt.patch).some(([key,value])=>(key==='accountId'?(task[key]??null):(task[key]??''))!==value))throw Error('The source task does not confirm this input and revision. Your text is kept; compare the current task before saving again.');
 return task;
}
export async function readFollowup(api,attempt){
 return verifyFollowup(await readFollowupSource(api,attempt),attempt);
}
async function readFollowupSource(api,attempt){
 if(!attempt.id)throw Error('No confirmed source ID received. Check the task list before creating a task again.');
 const source=await api('workspace/team/content?account='+encodeURIComponent(attempt.accountId||'all'));
 const matches=source.tasks?.filter(task=>task.id===attempt.id)||[],task=matches[0];
 if(matches.length!==1||!Number.isInteger(task.revision)||(task.accountId??null)!==attempt.accountId||task.area!==attempt.area||(task.itemId||'')!==attempt.itemId)throw Error('The current source task has no confirmed identity, scope and revision. Reopen the original task.');
 return task;
}
export function recoverFollowup(current,attempt,latest){
 if(!current.id||attempt.body.id!==current.id||latest.id!==current.id||(latest.accountId??null)!==attempt.accountId||latest.area!==attempt.area||(latest.itemId||'')!==attempt.itemId||!Number.isInteger(latest.revision)||latest.revision<attempt.revision)throw Error('The earlier save is still uncertain. The source revision has not advanced; keep checking the original result.');
 const fields={};
 for(const key of ['title','status','dueAt','notes','ownerId','hermonUrl'])fields[key]=String(attempt.patch[key]??'')!==String(current[key]??'')?attempt.patch[key]:String(latest[key]??'');
 return fields;
}
export function mountSalesFollowup(container,{api,task,users=[],onConfirmed=()=>{}}){
 let current={...task},pending=null,busy=false,comparison=null;
 const owners=[...users];if(task.ownerId&&!owners.some(u=>u.id===task.ownerId))owners.push({id:task.ownerId,name:task.ownerId+' (current source value)'});
 container.innerHTML='<p class="source">Team task <span data-task-id>'+esc(task.id||'New')+'</span> · account <span data-task-account>'+esc(task.accountId||'Unassigned')+'</span> · revision <span data-revision>'+esc(task.revision)+'</span></p><form data-self-busy>'+(!task.id?'<label>Account<select name="accountId" required><option value="">Choose an account</option><option value="187n">187N</option><option value="liogpt">The AI Operator</option><option value="lio">Lio</option><option value="unassigned">Unassigned</option></select></label>':'')+'<label>Next action<input name="title" required maxlength="300" value="'+esc(task.title)+'"></label><label>Owner<select name="ownerId"><option value="">Unassigned</option>'+owners.map(u=>'<option value="'+esc(u.id)+'" '+(u.id===task.ownerId?'selected':'')+'>'+esc(u.name||u.id)+'</option>').join('')+'</select></label><label>Status<select name="status">'+['todo','doing','done'].map(s=>'<option '+(s===task.status?'selected':'')+'>'+s+'</option>').join('')+'</select></label><label>Opvolgdatum<input name="dueAt" type="date" value="'+esc(task.dueAt||'')+'"></label><label>Source dossier<input name="hermonUrl" type="url" maxlength="2000" value="'+esc(task.hermonUrl||'')+'"></label><label>Notes<textarea name="notes" maxlength="5000">'+esc(task.notes||'')+'</textarea></label><p>This saves the follow-up in Team. No message is sent.</p><p data-save-status role="status"></p><button type="submit">Save and verify</button><button type="button" data-recheck hidden>Check source result only</button></form>';
 const form=container.querySelector('form'),status=form.querySelector('[data-save-status]'),submit=form.querySelector('[type="submit"]'),recheck=form.querySelector('[data-recheck]');
 form.insertAdjacentHTML('beforeend','<button type="button" data-compare hidden>Compare current source</button><section data-comparison hidden></section>');
 const compare=form.querySelector('[data-compare]'),review=form.querySelector('[data-comparison]');
 const fields=[...form.querySelectorAll('input,textarea,select')];
 const clearComparison=()=>{comparison=null;review.hidden=true;review.replaceChildren()};
 const lock=value=>{busy=value;fields.forEach(field=>field.disabled=value||!!pending);submit.disabled=value||!!pending;recheck.disabled=value;compare.disabled=value;const resume=review.querySelector('button');if(resume)resume.disabled=value};
 const fill=record=>fields.forEach(field=>{if(field.name==='ownerId'&&record.ownerId&&![...field.options].some(o=>o.value===record.ownerId)){const option=container.ownerDocument.createElement('option');option.value=record.ownerId;option.textContent=record.ownerId+' (current source value)';field.append(option)}field.value=record[field.name]??''});
 const confirmed=record=>{current=record;pending=null;clearComparison();fill(record);fields.forEach(field=>{if(field.name==='accountId')field.closest('label')?.remove()});container.querySelector('[data-task-id]').textContent=record.id;container.querySelector('[data-task-account]').textContent=record.accountId||'Unassigned';container.querySelector('[data-revision]').textContent=record.revision;status.textContent='Confirmed in the original Team task · revision '+record.revision+'.';recheck.hidden=true;compare.hidden=true;onConfirmed(record)};
 const reconcile=async()=>{const record=await readFollowup(api,pending);if(!container.isConnected)return;confirmed(record)};
 form.onsubmit=async event=>{
  event.preventDefault();if(busy||pending)return;
  try{pending=followupAttempt(current,Object.fromEntries(fields.map(field=>[field.name,field.value])))}catch(error){status.textContent=error.message;return}
  clearComparison();lock(true);status.textContent='Saving and reading back from Team…';
  let acknowledged=false;
  try{const saved=await api('workspace/team/content',pending.body);acknowledged=true;if(!pending.id&&typeof saved?.id==='string'&&saved.id)pending.id=saved.id;verifyFollowup(saved,pending);await reconcile()}
  catch(error){if(container.isConnected){
   // Only a definitive rejection of this POST can unlock direct correction.
   // A rejected readback after an accepted POST must remain pending.
   const rejected=!acknowledged&&error.code==='team_rejected'&&[400,401,403,404,405,422].includes(error.status);
   if(rejected){pending=null;recheck.hidden=true;compare.hidden=true;status.textContent=error.message+' Team rejected this request. Your input is kept; fix the reported cause before saving again.'}
   else{status.textContent=error.message+' Your input is kept. Check the source result; nothing is saved again automatically.';recheck.hidden=false;compare.hidden=!current.id}
  }}
  finally{if(container.isConnected)lock(false)}
 };
 recheck.onclick=async()=>{if(busy||!pending)return;clearComparison();lock(true);status.textContent='Re-reading the existing source task…';try{await reconcile()}catch(error){if(container.isConnected)status.textContent=error.message}finally{if(container.isConnected)lock(false)}};
 compare.onclick=async()=>{
  if(busy||!pending||!current.id)return;clearComparison();lock(true);status.textContent='Reading the current source task for comparison…';
  try{
   const latest=await readFollowupSource(api,pending);if(!container.isConnected)return;
   let matches=false;try{verifyFollowup(latest,pending);matches=true}catch{}
   if(matches){confirmed(latest);return}
   const merged=recoverFollowup(current,pending,latest);comparison={latest,merged};
   const labels={title:'Next action',status:'Status',dueAt:'Opvolgdatum',notes:'Notes',ownerId:'Owner',hermonUrl:'Source dossier'};
   review.innerHTML='<h3>Compare with source revision '+esc(latest.revision)+'</h3><p>Your own changes are kept. Fields you did not change take the current source value. Check every difference before continuing; this saves nothing yet.</p><div style="overflow:auto"><table><thead><tr><th>Veld</th><th>Mijn invoer</th><th>Current source</th><th>Na hervatten</th></tr></thead><tbody>'+Object.entries(labels).map(([key,label])=>'<tr><th>'+esc(label)+'</th><td style="white-space:pre-wrap">'+esc(pending.patch[key])+'</td><td style="white-space:pre-wrap">'+esc(latest[key])+'</td><td style="white-space:pre-wrap">'+esc(merged[key])+'</td></tr>').join('')+'</tbody></table></div><button type="button">Continue with compared input</button>';review.hidden=false;
   review.querySelector('button').onclick=()=>{if(busy||!comparison)return;const {latest,merged}=comparison;current={...latest};pending=null;fill(merged);container.querySelector('[data-revision]').textContent=latest.revision;clearComparison();compare.hidden=true;recheck.hidden=true;lock(false);status.textContent='Input restored on source revision '+latest.revision+'. Check the fields, then choose Save and verify. Nothing has been saved again yet.'};
   status.textContent='The source has changed. Compare the fields below; your earlier input is kept.';
  }catch(error){if(container.isConnected)status.textContent=error.message}
  finally{if(container.isConnected)lock(false)}
 };
}
