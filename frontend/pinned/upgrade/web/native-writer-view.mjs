const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function nativeWriterView(data){
 if(!data||data.status==='not_applicable')return '';
 const labels={held:'Edit project reserved',none_recorded:'No edit reservation recorded',scope_mismatch:'Edit ownership needs reconciliation',unavailable:'Edit ownership unavailable'};
 const stages={
  reserved:['Destination reserved · not attached','Check the reservation before creating the project. Reconcile the actual saved package, then attach it before editing.'],
  attached:['New project attached','Check ownership and reopen the package in the editor before continuing. Attachment does not verify its contents or save state.'],
  existing:['Existing project claimed','Check ownership and the current native project before continuing. The claim does not confirm that the package is still available.'],
  unknown:['Project stage unknown','Read the ownership registry before continuing; do not assume the destination has been attached.']
 };
 return '<section class="card"><h3>'+esc(labels[data.status]||labels.unavailable)+'</h3><p>'+esc(data.reason)+'</p>'+
 (data.reservations||[]).map(r=>{const stage=stages[r.creation_state]||stages.unknown;return '<dl><dt>Project</dt><dd>'+esc(r.project_file)+'</dd><dt>Stage</dt><dd>'+esc(stage[0])+'</dd><dt>Task</dt><dd>'+esc(r.task_id)+'</dd><dt>Session</dt><dd>'+esc(r.session)+'</dd><dt>Reserved at</dt><dd>'+esc(r.acquired_at)+'</dd></dl><p>'+esc(stage[1])+'</p>';}).join('')+
 '<p class="muted">Check the editor and its jobs before continuing. Archiving a task does not release its edit reservation.</p></section>';
}
