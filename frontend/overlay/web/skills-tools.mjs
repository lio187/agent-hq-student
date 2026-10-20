// Skills & tools: what the student's AI tools already have (skills and MCP tools), found automatically. Entries added
// on the Add tools page are marked "Added here"; everything else was found in the AI tools' own settings.
import {tileRow, panel} from './page-kit.mjs';
import {dataTable} from './data-table.mjs';

export async function skillsPage({api, esc}) {
  const d = await api('skills/installed');
  const tools = d.tools || [], skills = tools.flatMap(t => (t.skills || []).map(s => ({...s, tool: t.name}))), mcp = tools.flatMap(t => (t.mcp || []).map(m => ({...m, tool: t.name})));
  const mine = skills.filter(s => s.managed).length + mcp.filter(m => m.managed).length;
  const origin = x => x.managed ? '<span class="pill ok">Added here</span>' : '<span class="pill">Found</span>';
  const tiles = tileRow([
    {label: 'AI tools ready', value: tools.filter(t => t.ready).length, caption: tools.filter(t => t.installed).map(t => t.name).join(', ') || 'None installed yet'},
    {label: 'Skills', value: skills.length, caption: 'Found in your AI tools'},
    {label: 'Tools (MCP)', value: mcp.length, caption: 'Servers your AI tools can use'},
    {label: 'Added here', value: mine, caption: mine ? 'Through Add tools' : 'Nothing added through Add tools yet'},
  ], {esc});
  const skillTable = dataTable({id: 'skills', esc, rows: skills, pageSize: 25, defaultSort: {key: 'name', dir: 'asc'}, emptyText: 'No skills found yet. Skills you add to Claude Code, Codex or Hermes appear here automatically.',
    tabs: [{id: 'mine', label: 'Added here', filter: s => s.managed}, ...[...new Set(skills.map(s => s.tool))].map(t => ({id: t, label: t, filter: s => s.tool === t}))],
    columns: [
      {key: 'name', label: 'Skill', value: s => s.name, className: 'dt-primary', cell: s => '<strong>' + esc(s.name) + '</strong><small>' + esc(s.description || 'No description') + '</small>'},
      {key: 'tool', label: 'AI tool', value: s => s.tool, cell: s => '<span class="dt-muted">' + esc(s.tool) + '</span>'},
      {key: 'managed', label: 'Origin', value: s => s.managed ? 'Added here' : 'Found', cell: origin}]});
  const mcpRows = mcp.length ? '<div class="list">' + mcp.map(m => '<article class="row"><div><strong>' + esc(m.name) + '</strong><small>' + esc(m.tool + ' · ' + m.kind) + '</small></div>' + origin(m) + '</article>').join('') + '</div>'
    : '<p class="dt-empty">No MCP tools configured yet. Add one under Add tools, or give your agents your apps in Setup.</p>';
  return tiles + '<div class="actions" style="margin:0 0 16px"><button type="button" class="primary" data-section="tools">Add tools</button><a class="ui-btn" href="/setup#apps">Apps in Setup</a></div>'
    + panel('Skills', skillTable, {esc, meta: skills.length + ' skills'}) + panel('Tools your agents can use (MCP)', mcpRows, {esc, meta: mcp.length + ' servers'});
}
