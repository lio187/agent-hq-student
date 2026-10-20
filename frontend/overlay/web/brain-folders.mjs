// Knowledge › Second brain: the folders of the student's second brain (with notes, links and the last read), adding
// one (an Obsidian vault found on this Mac, any folder, or a new starter brain), agent access per AI tool, a quick
// capture into the Inbox, "Save to brain" for recent agent results, and a door into the Brain map.
// Numbers update live: the page asks the app every few seconds while it is open (the app re-reads a folder 2 s
// after a note changes).
import {tileRow, panel} from './page-kit.mjs';

let flash = null;
const TOOL_STATE = {on: ['On', 'ok'], off: ['Off', ''], missing: ['Not set up', '']};
const n = v => Number(v || 0).toLocaleString('en-GB');
const ago = s => { if (!s) return 'not yet'; const m = Math.round((Date.now() / 1000 - s) / 60); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago' };
const STYLE = '<style>.bf-row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid var(--border-subtle,#1c1d20)}'
  + '.bf-row:last-child{border-bottom:0}.bf-row small{display:block;color:var(--text-tertiary,#8a8f98);margin-top:2px;word-break:break-all}.bf-actions{display:flex;gap:8px;flex-wrap:wrap}'
  + '.bf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin:10px 0 4px}.bf-card{border:1px solid var(--border-subtle,#1c1d20);border-radius:10px;padding:12px;display:grid;gap:6px;align-content:start}'
  + '.bf-card small{color:var(--text-tertiary,#8a8f98);word-break:break-all}.bf-form{display:grid;gap:10px;max-width:720px}.bf-form label{display:grid;gap:6px;font-size:13px;color:var(--text-secondary,#b4b8bf)}'
  + '.bf-form input,.bf-form textarea{width:100%;box-sizing:border-box;background:var(--color-void,#08090a);border:1px solid #2a2c30;border-radius:8px;color:inherit;padding:9px 11px;font:inherit}'
  + '.bf-flash{margin:0 0 14px}.bf-status{min-height:18px;margin:6px 0 0;font-size:13px}.bf-status[data-kind=err]{color:#ff7a7a}.bf-status[data-kind=ok]{color:var(--accent,#d4ff3f)}</style>';

function tiles(s, {esc}) {
  const t = s.totals || {};
  return tileRow([
    {label: 'Folders', value: n(t.folders), caption: t.folders ? (s.folders || []).map(f => f.name).join(', ') : 'Add a folder below', key: 'bf-folders'},
    {label: 'Notes', value: n(t.notes), caption: s.capped ? 'The first 6,000 notes are read' : 'Markdown notes in your brain', key: 'bf-notes'},
    {label: 'Links', value: n(t.links), caption: t.unresolved === 1 ? '1 link points to a note that does not exist yet' : t.unresolved ? n(t.unresolved) + ' links point to notes that do not exist yet' : 'Between your notes, aliases included', key: 'bf-links'},
    {label: 'Last read', value: ago(s.indexedAt), caption: s.watching ? 'Updates by itself when a note changes' : t.folders ? 'Checked every 2 minutes' : 'Nothing to read yet', key: 'bf-read'},
  ], {esc, number: String});
}
function folderRows(s, {esc}) {
  const list = s.folders || [];
  if (!list.length) return '<p class="dt-empty">No folders yet. Connect an Obsidian vault, choose any folder of notes, or create a new second brain below.</p>';
  return list.map(f => '<div class="bf-row" data-folder="' + esc(f.path) + '"><div><strong>' + esc(f.name) + '</strong> '
    + (f.main ? '<span class="pill ok">New notes go here</span>' : '') + (f.exists ? '' : ' <span class="pill warn">Not found</span>')
    + '<small>' + esc(f.display) + ' · ' + n(f.notes) + ' notes · ' + n(f.links) + ' links</small></div><div class="bf-actions">'
    + (f.main ? '' : '<button type="button" data-action="mk-brain-main" data-id="' + esc(f.path) + '">Use for new notes</button>')
    + (f.exists ? '<button type="button" data-action="mk-brain-open" data-id="' + esc(f.path) + '">Open in Obsidian</button>' : '')
    + '<button type="button" data-action="mk-brain-remove" data-id="' + esc(f.path) + '">Remove</button></div></div>').join('');
}
const live = (s, ctx) => tiles(s, ctx) + panel('Your second brain', folderRows(s, ctx), {esc: ctx.esc, meta: s.indexedAt ? 'read ' + ago(s.indexedAt) + (s.watching ? ' · live' : '') : ''});

function addPanel(v, {esc}) {
  const found = (v.vaults || []).filter(x => x.exists && !x.connected);
  const cards = found.length ? '<div class="bf-grid">' + found.map(x => '<div class="bf-card"><strong>' + esc(x.name) + '</strong><small>' + esc(x.display) + '</small>'
      + (x.notes == null ? '' : '<small>' + n(x.notes) + (x.capped ? '+' : '') + ' notes</small>') + '<div><button type="button" class="primary" data-action="mk-brain-add" data-id="' + esc(x.path) + '">Connect</button></div></div>').join('') + '</div>'
    : '<p class="dt-empty">' + (v.found ? 'Every Obsidian vault on this Mac is connected.' : 'No Obsidian vaults found on this Mac. Choose a folder of notes, or create a new second brain.') + '</p>';
  return panel('Add to your brain', '<p class="pk-lead">Obsidian vaults on this Mac</p>' + cards
    + '<div class="actions" style="margin-top:14px"><button type="button" data-action="mk-brain-pick">Choose a folder…</button></div>'
    + '<div class="bf-form" style="margin-top:18px"><label>Or start a new second brain in your Documents folder<input id="bf-new-name" type="text" value="Second Brain" autocomplete="off" spellcheck="false"></label>'
    + '<div class="actions" style="margin:0"><button type="button" data-action="mk-brain-create">Create a new second brain</button></div>'
    + '<p class="pk-note">It comes with a Home page, a short guide and the folders Inbox, Projects, Areas, Resources and Archive. Obsidian can open it as a vault.</p></div>', {esc, meta: found.length ? found.length + ' found' : ''});
}
function agentsPanel(s, {esc}) {
  const a = s.agents || {tools: []}, on = a.tools.some(t => t.state === 'on'), any = (s.folders || []).length > 0;
  const rows = a.tools.map(t => { const [label, kind] = TOOL_STATE[t.state] || ['', '']; return '<div class="bf-row"><div><strong>' + esc(t.name) + '</strong><small>' + esc(t.file) + (t.backup ? ' · backup kept' : '') + '</small></div><span class="pill ' + kind + '">' + esc(label) + '</span></div>' }).join('');
  return panel('Give my agents my brain', '<p class="pk-lead">Claude Code, Codex and Hermes Agent can read your brain. 187N Agent HQ adds a short, marked section to each tool\'s own instructions file (it keeps a backup first): where your brain is, to read Home first, to put new notes in the Inbox, and never to delete or rename a note without asking. Every run from this app can also open these folders. Remove takes the section out again.</p>'
    + rows + '<div class="actions" style="margin-top:14px">' + (any ? '<button type="button" class="primary" data-action="mk-brain-agents" data-id="on">' + (on ? 'Update for my agents' : 'Give my agents my brain') + '</button>' : '<span class="dt-muted">Connect a folder first.</span>')
    + (on ? '<button type="button" data-action="mk-brain-agents" data-id="off">Remove from my agents</button>' : '') + '</div>', {esc, meta: on ? 'On' : 'Off'});
}
function capturePanel(s, {esc}) {
  const main = (s.folders || []).find(f => f.main);
  const body = main ? '<div class="bf-form"><label>Title<input id="bf-cap-title" type="text" autocomplete="off" placeholder="What is this note about?"></label>'
      + '<label>Note<textarea id="bf-cap-text" rows="5" placeholder="Write or paste your note…"></textarea></label>'
      + '<div class="actions" style="margin:0"><button type="button" class="primary" data-action="mk-brain-save">Save to brain</button></div><p class="bf-status" id="bf-cap-status" role="status"></p>'
      + '<p class="pk-note">Saved as a new note in ' + esc(main.name) + ' › Inbox. An existing note is never overwritten.</p></div>'
    : '<p class="dt-empty">Connect a folder first; notes are saved in its Inbox.</p>';
  return panel('Quick capture', body, {esc});
}
function resultsPanel(runs, s, {esc}) {
  if (!(s.folders || []).length) return '';
  const done = (Array.isArray(runs) ? runs : []).filter(r => r.status === 'completed' && String(r.result || '').trim()).slice(0, 6);
  const rows = done.length ? done.map(r => '<div class="bf-row"><div><strong>' + esc(r.title || 'Agent result') + '</strong><small>' + esc(String(r.result).trim().slice(0, 140)) + '</small></div>'
      + '<button type="button" data-action="mk-brain-saverun" data-id="' + esc(r.id) + '">Save to brain</button></div>').join('')
    : '<p class="dt-empty">When an agent finishes a task, its result shows here so you can keep it in your brain.</p>';
  return panel('Keep an agent result', rows, {esc, meta: done.length ? 'latest ' + done.length : ''});
}
const door = (s, {esc}) => panel('The Brain map', '<p class="pk-lead">Every note and link of your brain as a living map: search flies to a note, the reader shows its links and backlinks.</p><div class="actions" style="margin:0"><button type="button" class="primary" data-action="brain">Open the Brain map</button></div>', {esc, meta: n(s.totals?.notes) + ' notes'});

export async function page(view, ctx) {
  const {api, esc} = ctx;
  ctx.filters?.('<button type="button" data-action="brain">Open the Brain map</button>');
  const [s, v, runs] = await Promise.all([api('brain/status'), api('brain/vaults').catch(() => ({vaults: [], found: false})), api('runs').catch(() => [])]);
  const note = flash; flash = null;
  return STYLE + (note ? '<p class="notice bf-flash" role="status">' + esc(note) + '</p>' : '')
    + '<div data-bf-live>' + live(s, ctx) + '</div>' + addPanel(v, ctx) + '<div data-bf-agents>' + agentsPanel(s, ctx) + '</div>' + capturePanel(s, ctx) + resultsPanel(runs, s, ctx) + door(s, ctx);
}

// Live numbers while the page is open.
export function mount(view, el, ctx) {
  let sig = '', stopped = false;
  const tick = async () => {
    if (stopped || !el.isConnected || !el.querySelector('[data-bf-live]')) { clearInterval(timer); return }
    try {
      const s = await ctx.api('brain/status'), next = JSON.stringify([s.indexedAt, s.totals, s.folders, s.agents]);
      if (sig && next !== sig) { const host = el.querySelector('[data-bf-live]'); if (host) host.innerHTML = live(s, ctx); const ag = el.querySelector('[data-bf-agents]'); if (ag) ag.innerHTML = agentsPanel(s, ctx) }
      sig = next;
    } catch {}
  };
  const timer = setInterval(tick, 3000);
  tick();
  return () => { stopped = true; clearInterval(timer) };
}

// Asks the app for a folder (the Mac's folder picker); outside the app a path can be typed.
function pickFolder() {
  return new Promise(resolve => {
    window.hqPicked = (purpose, path) => { if (purpose === 'brain') resolve(path || '') };
    if (window.webkit?.messageHandlers?.hq) window.webkit.messageHandlers.hq.postMessage({type: 'pickFolder', purpose: 'brain', message: 'Choose a folder of notes'});
    else resolve(prompt('Folder path') || '');
  });
}
const status = (ctx, text, kind) => { const el = ctx.$?.('#bf-cap-status') || ctx.root?.querySelector('#bf-cap-status'); if (el) { el.textContent = text; el.dataset.kind = kind || '' } };

export async function act(action, id, ctx, el) {
  const {api} = ctx, $ = s => ctx.root?.querySelector(s);
  const folders = async () => (await api('brain/status')).folders.map(f => f.path);
  const done = text => { flash = text; ctx.refresh() };
  const busy = (label) => { if (el) { el.disabled = true; el.dataset.label = el.textContent; el.textContent = label } };
  const idle = () => { if (el) { el.disabled = false; el.textContent = el.dataset.label || el.textContent } };
  try {
    if (action === 'mk-brain-add') { busy('Connecting…'); const s = await api('brain/folders', {folders: [...await folders(), id]}); return done('Connected. Your brain has ' + n(s.totals.notes) + ' notes and ' + n(s.totals.links) + ' links now.') }
    if (action === 'mk-brain-pick') { const p = await pickFolder(); if (!p) return; const s = await api('brain/folders', {folders: [...await folders(), p]}); return done('Connected. Your brain has ' + n(s.totals.notes) + ' notes now.') }
    if (action === 'mk-brain-remove') { busy('Removing…'); await api('brain/folders', {folders: (await folders()).filter(p => p !== id)}); return done('Removed from your brain. The notes stay in that folder.') }
    if (action === 'mk-brain-main') { const list = await folders(); await api('brain/folders', {folders: [id, ...list.filter(p => p !== id)]}); return done('New notes now go to this folder\'s Inbox.') }
    if (action === 'mk-brain-open') { const r = await api('brain/open', {path: id}); return void (r.opened ? null : ctx.preview?.('Open in Obsidian', '<p>Open this link to see your brain in Obsidian:</p><p><code>' + ctx.esc(r.url) + '</code></p>')) }
    if (action === 'mk-brain-create') {
      busy('Creating…');
      const r = await api('brain/create', {name: $('#bf-new-name')?.value || ''});
      return done('Created ' + r.display + ' and connected it. Open it in Obsidian with the button next to it.');
    }
    if (action === 'mk-brain-agents') {
      busy(id === 'off' ? 'Removing…' : 'Giving…');
      const r = await api('brain/agents', {enable: id !== 'off'});
      const names = {claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes Agent'};
      return done(id === 'off' ? 'Removed from your agents. Their instruction files are as they were.' : ['claude', 'codex', 'hermes'].filter(k => r.results?.[k]).map(k => names[k] + ': ' + (r.results[k].ok ? 'done' : r.results[k].error)).join(' · '));
    }
    if (action === 'mk-brain-save') {
      const title = $('#bf-cap-title')?.value || '', text = $('#bf-cap-text')?.value || '';
      busy('Saving…');
      const r = await api('knowledge/save', {title, text});
      if ($('#bf-cap-title')) $('#bf-cap-title').value = ''; if ($('#bf-cap-text')) $('#bf-cap-text').value = '';
      idle(); return status(ctx, 'Saved: ' + r.folder + ' › ' + r.rel, 'ok');
    }
    if (action === 'mk-brain-saverun') {
      busy('Saving…');
      const run = await api('runs/' + encodeURIComponent(id));
      const r = await api('knowledge/save', {title: run.title || 'Agent result', text: String(run.result || ''), agent: run.profile || ''});
      el.textContent = 'Saved'; el.title = r.folder + ' › ' + r.rel; return;
    }
  } catch (e) {
    idle();
    if (action === 'mk-brain-save') return status(ctx, e.message, 'err');
    flash = e.message; ctx.refresh();
  }
}
