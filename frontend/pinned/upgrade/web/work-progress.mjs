// Workflow stages are observed states, never an estimate of runtime completion.
const labels={backlog:'Queued',running:'In progress',review:'In review',waiting:'Needs your response',blocked:'Blocked',failed:'Failed',done:'Complete',cancelled:'Stopped',scheduled:'Scheduled',paused:'Paused'};
export function workProgress(item,{stale=false}={}){
 const stage=item.stage||'unknown',unavailable=stale||item.stale;
 return {stage,label:unavailable?'Last known · '+(labels[stage]||'Unknown'):labels[stage]||'Status unavailable',
  step:({backlog:0,running:1,review:2,done:3})[stage]??-1,
  active:stage==='running'&&!unavailable,stale:!!unavailable,
  description:unavailable?'Connection unavailable. Waiting for a fresh work signal.':({backlog:'Accepted into the queue. Waiting for an agent.',running:'The agent is working. Exact completion is not reported.',review:'Work is ready for review.',waiting:'The agent needs your answer or approval to continue.',blocked:'This task needs attention before work can continue.',failed:'The last attempt failed. Open activity for the recorded error.',done:'Hermes reports this work as complete. Open the result to inspect it.',cancelled:'Work is stopped or archived. Open activity for the stop receipt.',scheduled:'The scheduler will start the next run at its scheduled time.',paused:'Automatic runs are paused.'})[stage]||'No recognized work state has been reported.'};
}
export function completionSummary(items){
 const work=items.filter(t=>t.kind!=='routine'&&t.kind!=='routine-result'&&t.stage!=='cancelled');
 const done=work.filter(t=>t.stage==='done').length;
 return {done,total:work.length,percent:work.length?Math.round(done/work.length*100):0};
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function progressHTML(item,options={}){
 const p=workProgress(item,options),routine=item.kind==='routine';
 return `<div class="work-progress" data-progress-state="${escape(p.stage)}" data-stale="${p.stale}"><div class="progress-caption"><span>${escape(p.label)}</span><b>${p.stage==='done'?'100%':p.active?'Working…':routine?'◷':p.stage==='waiting'?'Your turn':'—'}</b></div><div class="progress-segments ${p.active?'is-working':''}" role="progressbar" aria-label="${escape(item.title||'Task')} · ${escape(p.label)}" aria-valuetext="${escape(p.description)}"${p.stage==='done'?' aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"':''}>${[0,1,2,3].map(i=>`<i class="${i<=p.step?'reached':''} ${i===p.step?'current':''}"></i>`).join('')}</div></div>`;
}
