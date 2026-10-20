// Todoist records as tasks. Moved out of mission-control-views.mjs (11 Oct 2026, entry budget B2): Today on the
// Overview needs only this, and Mission Control is a lazy chunk now; mission-control-views.mjs re-exports it.
export function todoistTasks(payload){
 return (payload.records||[]).map(record=>{
  const data=record.data||record.raw||record;
  const due=data.due?.datetime||data.due?.date||data.deadline?.date||null;
  return {id:record.externalId||data.id,title:data.content||data.title||'Untitled task',description:data.description||'',due,
   completed:!!(data.checked||data.is_completed||data.completed_at),deleted:!!data.is_deleted,
   priority:Math.min(4,Math.max(1,Number(data.priority)||1)),labels:Array.isArray(data.labels)?data.labels:[],url:record.providerUrl||data.url,updated:record.updatedAt,
   project:payload.projectNames?.[data.project_id]||'Todoist',projectId:data.project_id,
   stage:data.checked||data.is_completed||data.completed_at?'done':payload.sectionStages?.[data.section_id]||payload.defaultStages?.[data.project_id]||'triage'};
 }).filter(t=>!t.deleted);
}
