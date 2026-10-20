import {escapeHTML as esc,messageHTML} from './message-view.mjs';
export async function routineResultsView(root,{routine,api,onFollowup,onChange,profiles=[]}){
 root.innerHTML='<div class="routine-results"><p class="muted">Reading local routine outputs…</p></div>';
 const panel=root.firstElementChild,query=new URLSearchParams({profile:routine.profile,id:routine.routine_id||routine.id});
 const alive=()=>panel.isConnected;
 async function list(){
  const data=await api('routines/results?'+query);if(!alive())return;
  panel.innerHTML='<p class="muted">'+esc(data.name)+' · '+esc(data.profile)+' · '+esc(data.project)+'</p><p>Open the exact saved result before choosing a follow-up. The execution ledger and output filenames are separate records.</p><div class="routine-output-list">'+data.outputs.map(o=>'<article class="card"><h3>'+esc(o.file)+'</h3><small>'+esc(o.unavailable?o.reason:(o.bytes+' bytes · '+(o.review?.state||'Not reviewed')))+'</small>'+(o.unavailable?'':'<button data-output="'+esc(o.file)+'">Open result ↗</button>')+'</article>').join('')+'</div>'+(!data.outputs.length?'<p class="muted">Hermes has not saved a local output for this routine.</p>':'')+(data.more?'<p class="muted">Showing the latest 20 saved outputs.</p>':'');
  panel.querySelectorAll('[data-output]').forEach(b=>b.onclick=()=>open(b.dataset.output).catch(error));
 }
 function error(e){if(!alive())return;const status=panel.querySelector('[role=status]');if(status)status.textContent=e.message;else{const p=document.createElement('p');p.setAttribute('role','status');p.textContent=e.message;panel.append(p)}}
 async function open(file){
  const data=await api('routines/result?'+query+'&file='+encodeURIComponent(file));if(!alive())return;
  const output=data.output,decision=output.review;
  panel.innerHTML='<button id="routine-results-back">← All results</button><h3>'+esc(data.name)+'</h3><p class="muted">'+esc(data.profile)+' · '+esc(data.project)+'<br>'+esc(output.file)+'</p><details><summary>Content identity</summary><code>'+esc(output.sha256)+'</code><p>'+output.bytes+' bytes. Decisions apply to this exact content.</p></details><article class="message markdown routine-output">'+messageHTML(output.text)+'</article>'+
   (decision&&decision.state!=='submitting'?'<section class="card"><h3>'+esc(decision.state.replaceAll('_',' '))+'</h3><p>'+esc(decision.request.instruction||'No follow-up action started.')+'</p>'+(decision.run?'<p class="muted">Follow-up run: '+esc(decision.run)+' · open it for current status.</p><button id="routine-followup">Open follow-up ↗</button>':'')+'</section>':
   '<form id="routine-review-form"><h3>Review this result</h3><label>Exact action or revision feedback<textarea name="instruction" rows="4" maxlength="4000" placeholder="State the exact action, recipient or destination and account; or describe the changes needed.">'+esc(decision?.request?.instruction||'')+'</textarea></label>'+(data.profile==='default'?'<label>Agent for the follow-up<select name="followup_profile"><option value="">Choose an agent</option>'+profiles.filter(p=>p.installed).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label>':'')+'<p class="muted">Approve starts a separate run for the stated action. Revise prepares another local draft. Existing tool approvals still apply.</p>'+(!output.can_continue?'<p class="muted">This output exceeds the 20,000-character follow-up limit. Prepare a smaller reviewable result before continuing.</p>':'')+'<div class="actions"><button name="choice" value="reject">Reject result</button><button name="choice" value="revise" '+(!output.can_continue?'disabled':'')+'>Request revision</button><button name="choice" value="approve" class="primary" '+(!output.can_continue?'disabled':'')+'>Approve & run action</button></div></form>')+'<p role="status"></p>';
  panel.querySelector('#routine-results-back').onclick=()=>list().catch(error);
  const followup=panel.querySelector('#routine-followup');if(followup)followup.onclick=()=>onFollowup(decision);
  const form=panel.querySelector('form');if(!form)return;
  form.onsubmit=async e=>{
   e.preventDefault();const choice=e.submitter?.value;if(!choice)return;
   const instruction=form.elements.instruction.value.trim(),followup_profile=form.elements.followup_profile?.value;
   if(choice!=='reject'&&!instruction){error(new Error('Describe the exact action or revision first.'));return}
   if(choice!=='reject'&&data.profile==='default'&&!followup_profile){error(new Error('Choose an agent for this follow-up.'));return}
   const body={profile:data.profile,id:data.id,file:output.file,sha256:output.sha256,choice,instruction,...(followup_profile?{followup_profile}:{})};
   form.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{await api('routines/review',body,{key:output.review_id});await onChange();await open(file)}catch(e){error(e);form.querySelectorAll('button').forEach(b=>b.disabled=!output.can_continue&&b.value!=='reject')}
  };
 }
 try{if(routine.output_file)await open(routine.output_file);else await list()}catch(e){error(e)}
}
