// Navigation (student edition): departments, their pages, and the views inside each page.
export const BUSINESSES = [{id: 'all', label: 'My business'}];
const DEPARTMENTS = {today: 'Today', operations: 'Operations', marketing: 'Marketing & Content', sales: 'Sales', delivery: 'Client Delivery', tech: 'Agents & Setup', finance: 'Finance & Team', knowledge: 'Knowledge'};
// The sections of the full Agent HQ that a student uses, plus their own Marketing, Voice, second-brain and tools pages.
const LAYOUT = [
  {department: 'today', pages: [['overview', 'Overview', [['overview', 'Overview']]]]},
  {department: 'operations', pages: [['calendar', 'Calendar', [['calendar', 'Calendar']]], ['tasks', 'Agent work', [['tasks', 'Tasks'], ['routines', 'Routines']]], ['voice', 'Voice', [['voice', 'Voice']]]]},
  {department: 'marketing', pages: [['studio', 'Studio', [['studio', 'Studio']]], ['research', 'Ideas & research', [['research', 'Signals'], ['competitors', 'Competitors'], ['analysis', 'Creator Lab']]],
    ['team', 'Production', [['team', 'Board'], ['content', 'Library'], ['record', 'Recording'], ['production', 'Jobs'], ['reviews', 'Review']]], ['makers', 'Carousels & stories', [['makers', 'Maker']]],
    ['social', 'Publish & results', [['social', 'Performance'], ['campaigns', 'Campaigns'], ['accounts', 'Accounts']]]]},
  {department: 'sales', pages: [['outreach', 'Pipeline', [['outreach', 'Leads & follow-up'], ['proposals', 'Proposals']]], ['handbook', 'Playbooks', [['handbook', 'Playbooks & SOPs']]]]},
  {department: 'delivery', pages: [['delivery', 'Clients', [['delivery', 'Projects'], ['portfolio', 'Performance']]]]},
  {department: 'tech', pages: [['agents', 'Agents', [['agents', 'Agents'], ['skills', 'Skills & tools'], ['sessions', 'Runs']]], ['activity', 'Activity', [['activity', 'Activity']]], ['connections', 'Setup', [['connections', 'Connections'], ['tools', 'Add tools'], ['updates', 'Updates'], ['settings', 'Settings']]]]},
  {department: 'finance', pages: [['finance', 'Finance', [['finance', 'Income & expenses']]], ['people', 'Team', [['people', 'Team']]]]},
  {department: 'knowledge', pages: [['librarian', 'Knowledge', [['librarian', 'Status'], ['notes', 'Second brain'], ['memory', 'Instructions']]]]},
];
function build() {
  return LAYOUT.map(l => {
    const pages = l.pages.map(([id, label, views]) => ({id, label, views}));
    return {id: pages[0].views[0][0], department: l.department, label: DEPARTMENTS[l.department], group: 'Workspace', pages, tabs: pages.map(p => [p.views[0][0], p.label]),
      modules: pages.flatMap(p => p.views.map(([v, label]) => ({id: v, local: v, label, department: l.department})))};
  });
}
export const WORKSPACES = build();
export const moduleLabel = m => m.label;
export const departmentLabel = d => DEPARTMENTS[d.id] || d.label;
export function pageOf(section) {
  for (const w of WORKSPACES) for (const p of w.pages) if (p.views.some(([v]) => v === section)) return {...p, department: w.department};
  return null;
}
export const workspaceFor = section => WORKSPACES.find(w => w.pages.some(p => p.views.some(([v]) => v === section))) || WORKSPACES[0];
export const normalizeSection = section => ({dashboard: 'overview', usage: 'overview', revenue: 'overview', more: 'settings', integrations: 'connections', sources: 'connections', board: 'team', reels: 'production'})[section] || section;
export const workspacesForBusiness = () => WORKSPACES;
