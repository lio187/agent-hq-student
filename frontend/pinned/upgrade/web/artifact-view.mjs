const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function artifactView(artifact,api='/api/hq/v1'){
 const check=artifact.availability||{},state=check.state||'unknown';
 const label={available:'File verified',changed:'File changed since registration',missing:'File missing',unavailable:'File not accessible',unknown:'Availability not checked'}[state]||'Availability unknown';
 const hash=check.current_sha256,canOpen=['available','changed'].includes(state)&&/^[a-f0-9]{64}$/.test(hash||'');
 const url=canOpen?api+'/artifacts?'+new URLSearchParams({project:artifact.project,path:artifact.path,revision:hash}):null;
 const nativeNote=artifact.provenance==='reported_native_output'?'<p>Native result reported · content approval not established.</p><small>Editable project: '+esc(artifact.project_file)+'</small>':'';
 return '<article class="card"><strong>'+esc(artifact.title||artifact.path)+'</strong><p>'+esc(label)+(artifact.provenance==='declared_task_source'?' · source of the task':artifact.profile?' · '+esc(artifact.profile):'')+(artifact.provenance==='reported_runtime_output'?' · reported by runtime':'')+'</p><small>'+esc(artifact.project)+' · '+esc(artifact.path)+'</small>'+(canOpen?'<p><a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+(state==='changed'?'Open current version':'Open verified version')+'</a></p><small>SHA-256 '+esc(hash)+'</small>':'')+nativeNote+'</article>';
}
