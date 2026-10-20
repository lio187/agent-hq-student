// The departments and pages a team member may open, in the workspace's own order (team shell, 9 Oct 2026).
import {workspacesForBusiness} from './workspace-navigation.mjs';
export function teamPages(sections) {
  const allowed = new Set(sections);
  return workspacesForBusiness('all').map(w => ({ ...w, pages: w.pages.map(p => ({ ...p, views: p.views.filter(([v]) => allowed.has(v)) })).filter(p => p.views.length) })).filter(w => w.pages.length);
}
