import {mountContentConflicts} from './content-conflict.mjs';
import {mountCaptionApproval} from './caption-approval.mjs';
import {mountContentComment} from './content-comment.mjs';
import {verifyContentSave,readContentSave} from './content-save.mjs';
export function createContentEditor({root,api,esc,navigate}){
const $=s=>root.querySelector(s);let editing,saving=false,pendingSave=null,opening=0,loading=false;
const draftKey=id=>'hq-content-draft:'+id;
function formPatch(){const patch=Object.fromEntries(new FormData($('#edit-form')));if(editing?.blocks?.length)patch.blocks=Array.from(root.querySelectorAll('[data-block]:not(:disabled)')).map(t=>({id:t.dataset.block,text:t.value}));return patch}
function storeDraft(){if(!editing)return;try{sessionStorage.setItem(draftKey(editing.id),JSON.stringify({revision:editing.revision,patch:formPatch()}))}catch{}}
function restoreDraft(){let draft;try{draft=JSON.parse(sessionStorage.getItem(draftKey(editing.id))||'null')}catch{}if(!draft)return;for(const [name,value]of Object.entries(draft.patch)){if(name==='blocks')continue;const field=$('#edit-form').elements.namedItem(name);if(field&&!field.disabled)field.value=value}for(const block of draft.patch.blocks||[]){const field=root.querySelector('[data-block="'+CSS.escape(block.id)+'"]');if(field&&!field.disabled)field.value=block.text}$('#edit-error').textContent=draft.revision===editing.revision?'Unsaved draft restored.':'The source changed while this draft was open. Review the latest version before saving.';editing.revision=draft.revision;const discard=document.createElement('button');discard.type='button';discard.textContent='Discard draft and reload';discard.onclick=()=>{sessionStorage.removeItem(draftKey(editing.id));openItem(editing.id)};$('#edit-error').append(' ',discard)}
$('#edit-form').addEventListener('input',storeDraft);

async function openItem(id,confirmedDetail=null){
 if(saving)return;
 const ticket=++opening;loading=true;$('#edit-body').inert=true;$('#edit-form').querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true);
 let d;
 try{d=confirmedDetail||await api('workspace/team/item?id='+encodeURIComponent(id));if(ticket!==opening)return;if(d?.item?.id!==id||!Array.isArray(d.comments)||!Array.isArray(d.conflicts))throw Error('The received source does not belong to the chosen content item.');}
 catch(error){if(ticket!==opening)return;$('#edit-error').textContent='Could not open. The previous item is kept. '+error.message;throw error}
 finally{if(ticket===opening){loading=false;$('#edit-body').inert=false;$('#edit-form').querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=Boolean(pendingSave)||!editing)}}
 editing=d.item;pendingSave=null;$('#edit-form').querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);$('#edit-error').textContent='';$('#edit-body').innerHTML=`<label>Title<input name="title" value="${esc(editing.title)}" required></label><label>Status<select name="status">${['Idea','Scripted','To Edit','Editing','To Review','Ready To Post','Posted','Archived'].map(s=>`<option ${editing.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Deadline<input name="deadline" type="date" value="${esc(editing.deadline||'')}"></label><label>Proposed publication<input name="scheduledFor" value="${esc(editing.scheduledFor||'')}" placeholder="ISO date and time"></label>${editing.blocks?.length?editing.blocks.map(b=>`<label>Script block<textarea data-block="${esc(b.id)}" ${b.editable?'':'disabled'}>${esc(b.text)}</textarea></label>`).join(''):`<label>Script<textarea name="script" ${editing.notion?'disabled':''}>${esc(editing.script||'')}</textarea></label>`}<label>Caption<textarea name="caption">${esc(editing.caption||'')}</textarea></label><label>Hook<textarea name="hook">${esc(editing.hook||'')}</textarea></label><label>Shots<textarea name="shots">${esc(editing.shots||'')}</textarea></label><label>CTA keyword<input name="keyword" value="${esc(editing.keyword||'')}"></label><button type="button" id="approve-caption">Approve saved caption</button><p class="muted" data-content-revision>Revision ${editing.revision}. Saving and review do not publish.</p><h3>Comments</h3><div id="comments">${d.comments.map(c=>'<p class="comment"><b>'+esc(c.name)+'</b><br>'+esc(c.message)+'</p>').join('')}</div><label>Add comment<textarea id="comment"></textarea></label><button type="button" id="add-comment">Add comment</button>${d.conflicts.map(c=>'<article class="card"><h3>Notion conflict · '+esc(c.field)+'</h3><b>Local</b><pre>'+esc(c.local)+'</pre><b>Notion</b><pre>'+esc(c.remote)+'</pre><button type="button" data-conflict="'+esc(c.id)+'" data-choice="local">Keep local version</button> <button type="button" data-conflict="'+esc(c.id)+'" data-choice="remote">Use Notion version</button></article>').join('')}`;restoreDraft();if(!$('#editor').open)$('#editor').showModal();mountCaptionApproval({root,item:editing,api,onConfirmed:detail=>{editing=detail.item;storeDraft();$('[data-content-revision]').textContent='Revision '+editing.revision+'. Saving and review do not publish.';}});mountContentConflicts({root,item:editing,conflicts:d.conflicts,api,onConfirmed:async detail=>{await openItem(id,detail);$('#edit-error').append(' Conflict resolved and confirmed in the source.');}});mountContentComment({root,item:editing,api,onConfirmed:detail=>{$('#comments').innerHTML=detail.comments.map(c=>'<p class="comment"><b>'+esc(c.name)+'</b><br>'+esc(c.message)+'</p>').join('')}})}
function saveConfirmed(item,checkChanges=false){
 if(checkChanges&&JSON.stringify(formPatch())!==JSON.stringify(pendingSave.patch)){
  editing=item;pendingSave=null;storeDraft();$('#edit-error').textContent='The earlier save is confirmed. Your newer input is still in the form and not saved.';$('#edit-form').querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=false);return;
 }
 sessionStorage.removeItem(draftKey(pendingSave.source.id));pendingSave=null;$('#editor').close();navigate('content');
}
function offerReadback(error){
 $('#edit-error').textContent=error.message+' Your draft is kept. Check the source before saving again.';
 const check=document.createElement('button');check.type='button';check.textContent='Re-check save';
 check.onclick=async()=>{if(saving||!pendingSave)return;saving=true;check.disabled=true;try{const item=await readContentSave(api,pendingSave);saveConfirmed(item,true)}catch(e){offerReadback(e)}finally{saving=false;check.disabled=false}};
 $('#edit-error').append(' ',check);
}
$('#edit-form').onsubmit=async e=>{
 e.preventDefault();if(saving||pendingSave||loading||!editing)return;
 const attempt={source:{id:editing.id,revision:editing.revision,accountId:editing.accountId,accountRegistryId:editing.accountRegistryId},patch:formPatch()};
 storeDraft();pendingSave=attempt;saving=true;
 const controls=Array.from($('#edit-form').querySelectorAll('input,textarea,select,button')).map(field=>[field,field.disabled]);controls.forEach(([field])=>field.disabled=true);
 let acknowledged=false;
 try{
  const receipt=await api('workspace/team/content',{action:'item.edit',id:attempt.source.id,revision:attempt.source.revision,patch:attempt.patch});acknowledged=true;
  verifyContentSave(receipt,attempt);await readContentSave(api,attempt);saveConfirmed();
 }catch(error){
  const rejected=!acknowledged&&error.code==='team_rejected'&&[400,401,403,404,405,409,422].includes(error.status);
  if(rejected){pendingSave=null;$('#edit-error').textContent=error.message+' Your draft is kept.'}else offerReadback(error);
 }finally{saving=false;controls.forEach(([field,disabled])=>field.disabled=disabled);if(pendingSave)$('#edit-form').querySelectorAll('button[type="submit"]').forEach(b=>b.disabled=true)}
};
function cancelOpening(){opening++;loading=false;$('#edit-body').inert=false}
$('[data-close]').onclick=()=>{cancelOpening();$('#editor').close()};
$('#editor').addEventListener('cancel',cancelOpening);

return {open:openItem};
}
