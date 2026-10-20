// Settings (9 Oct 2026): what you can set and where everything lives. Four cards for the controls, a map of every
// department, page and view (the workspace is grouped into pages, so this is where a teammate finds a view by
// name), and the keyboard shortcuts. Nothing here changes data on its own; each button opens the control it names.
export function settingsPage({ esc, icon, workspaces, shortcuts, link, kit }) {
  const button = (label, action, id = '', primary = false) => '<button type="button"' + (primary ? ' class="primary"' : '') + ' data-action="' + esc(action) + '" data-id="' + esc(id) + '">' + esc(label) + '</button>';
  const cards = [
    ['tech', 'Agents & execution', 'Agent profiles, the models they run and their scheduled routines.', button('Agents', 'section', 'agents') + button('Models', 'models') + button('Routines', 'routines')],
    ['plug', 'Connections & health', 'Connected accounts, local services and data sources, with a health check.', button('Connections', 'section', 'connections') + button('System health', 'health')],
    ['brain', 'Knowledge', 'The Brain, the Librarian and every agent\'s instructions and memory.', button('The Brain', 'brain') + button('Memory', 'section', 'memory')],
    ['people', 'Team administration', 'Members, roles and accounts are managed in Team Hub.', link('https://187n.ai/team', 'Open Team Hub')],
  ];
  const head = '<div class="set-cards">' + cards.map(([ic, title, text, actions]) => '<section class="set-card"><span class="set-icon" aria-hidden="true">' + icon(ic) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="actions">' + actions + '</div></section>').join('') + '</div>';
  const map = '<div class="set-map">' + workspaces.map(w => '<section class="set-dept"><h3>' + icon(w.department) + '<span>' + esc(w.label) + '</span></h3><ul>' + w.pages.map(p => '<li><button type="button" data-section="' + esc(p.views[0][0]) + '">' + esc(p.label) + '</button>' + (p.views.length > 1 ? '<span>' + p.views.map(([v, l]) => '<button type="button" data-section="' + esc(v) + '">' + esc(l) + '</button>').join('') + '</span>' : '') + '</li>').join('') + '</ul></section>').join('') + '</div>';
  const keys = '<dl class="set-keys">' + shortcuts.map(([k, what]) => '<div><dt><kbd>' + esc(k) + '</kbd></dt><dd>' + esc(what) + '</dd></div>').join('') + '</dl>';
  return head
    + kit.panel('Workspace map', '<p class="pk-lead">Every department, its pages and the views inside each page. Click any name to open it; ⌘K finds them by name too.</p>' + map, { esc, meta: workspaces.reduce((n, w) => n + w.pages.length, 0) + ' pages · ' + workspaces.reduce((n, w) => n + w.pages.reduce((m, p) => m + p.views.length, 0), 0) + ' views' })
    + kit.panel('Keyboard shortcuts', keys, { esc, meta: 'Office and workspace' })
    + '<p class="viz-note">Agent HQ uses one dark theme. Single-letter shortcuts work in the office; inside a workspace page they are off so typing never triggers them.</p>';
}
