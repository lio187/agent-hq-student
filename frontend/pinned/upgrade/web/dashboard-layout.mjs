export const DASHBOARD_WIDGETS=[['revenue','Revenue'],['usage','Tokens & models'],['ops','Operations'],['routines','Upcoming routines'],['agents','Agents & departments'],['activity','Recent activity']];
export function normalizeLayout(value){
 return {hidden:DASHBOARD_WIDGETS.map(([id])=>id).filter(id=>Array.isArray(value?.hidden)&&value.hidden.includes(id)),revision:Number.isInteger(value?.revision)?value.revision:0};
}
export function applyDashboardLayout(root,value,jump){
 const layout=normalizeLayout(value);
 root.querySelectorAll('[data-dashboard-widget]').forEach(el=>{el.hidden=layout.hidden.includes(el.dataset.dashboardWidget)&&el.dataset.dashboardWidget!==jump});
}
