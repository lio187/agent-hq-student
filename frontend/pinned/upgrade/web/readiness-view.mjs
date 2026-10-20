const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readinessLabel(data){
 if(!data)return 'Health unverified';
 if(!data.gateway_reachable)return 'Gateway unavailable';
 const n=data.blockers?.length||0;
 return n?`${n} operational blockers`:'Preflight ready · acceptance pending';
}
export function readinessHTML(data){
 const observed=data.observed_at?new Date(data.observed_at*1000).toLocaleString():'Unavailable';
 const profiles=data.profiles||[],installed=profiles.filter(p=>p.installed).length;
 return `<p class="notice">${esc(readinessLabel(data))}</p><p class="muted">Observed ${esc(observed)} · ${installed}/${profiles.length} listed profiles installed. Business acceptance: ${esc(data.acceptance)}.</p>`+
 `<h3>Recovery queue</h3>${(data.blockers||[]).map(b=>`<article class="card"><strong>${esc(b.id)}</strong><p>${esc(b.reason)}</p></article>`).join('')||'<p>No current preflight blockers.</p>'}`+
 `<h3>Native runtime receipts</h3>${(data.native_runtimes||[]).map(r=>`<article class="card"><strong>${esc(r.runtime)} · ${esc(r.state)}</strong><p>${esc(r.board)} / ${esc(r.task_id)} · session ${esc(r.external_session_id||'No successful session verified')}</p></article>`).join('')||'<p>No native execution receipts.</p>'}`+
 `<h3>Agent readiness</h3>${profiles.map(p=>`<article class="row"><strong>${esc(p.name)}</strong><span>${esc(p.state)} · result ${esc(p.verification)}</span></article>`).join('')}`+
 `<p class="muted">${esc(data.scope)} ${esc(data.continuity)}</p>`;
}
