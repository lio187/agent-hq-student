// Setup step: the second brain in one click. Obsidian vaults found on this Mac are cards with Connect; any other
// folder can be chosen; or a new starter brain is made in Documents. Then "Give my agents my brain" lets Claude Code,
// Codex and Hermes Agent read it (reversible). The step can be skipped.
import {$, esc, api, status, pick} from './setup-kit.mjs';

const n = v => Number(v || 0).toLocaleString('en-GB');
const TOOL = {on: '<span class="pill ok">Reads your brain</span>', off: '<span class="pill off">Not yet</span>', missing: '<span class="pill off">Not set up</span>'};

function body(s, v) {
  const folders = s.folders || [], found = (v.vaults || []).filter(x => x.exists && !x.connected), agents = s.agents || {tools: []};
  const on = agents.tools.some(t => t.state === 'on');
  let html = '';
  if (folders.length) html += '<section class="card"><div class="row"><h3>Your second brain</h3><span class="pill ok">' + n(s.totals?.notes) + ' notes · ' + n(s.totals?.links) + ' links</span></div>'
    + folders.map(f => '<div class="row" style="margin-top:10px"><span><strong>' + esc(f.name) + '</strong>' + (f.main ? ' <span class="muted">· new notes go here</span>' : '') + '<br><span class="path">' + esc(f.display) + '</span> <span class="muted">· ' + n(f.notes) + ' notes</span></span>'
      + '<span class="row" style="gap:8px"><button type="button" class="btn" data-bopen="' + esc(f.path) + '">Open in Obsidian</button><button type="button" class="btn" data-bremove="' + esc(f.path) + '">Remove</button></span></div>').join('') + '</section>';
  html += '<section class="card"><div class="row"><h3>Found on this Mac</h3>' + (found.length ? '<span class="muted">' + found.length + ' Obsidian vault' + (found.length === 1 ? '' : 's') + '</span>' : '') + '</div>'
    + (found.length ? '<div class="grid">' + found.map(x => '<div class="app" data-vault="' + esc(x.path) + '"><header>' + esc(x.name) + '</header><span class="muted" style="font-size:12px;word-break:break-all">' + esc(x.display) + '</span>' + (x.notes == null ? '' : '<span class="muted" style="font-size:12px">' + n(x.notes) + (x.capped ? '+' : '') + ' notes</span>') + '<button type="button" class="btn primary" data-bconnect="' + esc(x.path) + '">Connect</button></div>').join('') + '</div>'
      : '<p>' + (v.found ? (folders.length ? 'Every Obsidian vault on this Mac is connected.' : 'Obsidian knows no vaults on this Mac yet.') : 'No Obsidian vaults found on this Mac.') + ' Choose a folder of notes, or start a new brain.</p>')
    + '<div class="actions" style="margin-top:14px"><button type="button" class="btn" id="bpick">Choose a folder…</button><button type="button" class="btn" id="bnew">Create a new second brain</button></div>'
    + '<div id="bcreate" hidden><label class="field">Name<input type="text" id="bname" value="Second Brain" autocomplete="off" spellcheck="false"></label>'
    + '<p class="muted" style="margin:0">Made in your Documents folder, with a Home page, a short guide and the folders Inbox, Projects, Areas, Resources and Archive.</p>'
    + '<div class="actions"><button type="button" class="btn primary" id="bcreate-go">Create</button></div></div></section>';
  html += '<section class="card"><div class="row"><h3>Give my agents my brain</h3>' + (on ? '<span class="pill ok">On</span>' : '<span class="pill off">Off</span>') + '</div>'
    + '<p>Claude Code, Codex and Hermes Agent read your brain while they work: where it is, to start at Home, to save new notes in the Inbox, and never to delete or rename a note without asking. A short, marked section goes into each tool\'s own instructions file (a backup is kept); switching this off takes it out again.</p>'
    + '<label class="check"><input type="checkbox" id="bagents"' + (on ? ' checked' : '') + (folders.length ? '' : ' disabled') + '> <span>Let my agents read my second brain' + (folders.length ? '' : ' (connect a folder first)') + '</span></label>'
    + agents.tools.map(t => '<div class="row" style="margin-top:8px"><span>' + esc(t.name) + ' <span class="muted" style="font-size:12px">' + esc(t.file) + '</span></span>' + (TOOL[t.state] || '') + '</div>').join('') + '</section>';
  return html;
}

export default {
  id: 'brain', label: 'Second brain', after: 'social',
  done: state => Boolean(state.settings?.notesFolder),
  summary: state => ['Second brain', state.settings?.notesFolder ? (state.notes?.count || 0) + ' notes indexed' : 'Not connected'],
  view(kit) {
    return '<p class="eyebrow">Second brain</p><h1>Connect your second brain</h1><p class="lead">Your notes become a living map in the Brain, and your agents can read them. Pick an Obsidian vault, choose any folder of Markdown notes, or start a new brain.</p>'
      + '<div id="bbody"><p class="muted">Looking for your notes…</p></div><p class="status" id="bstatus" role="status"></p>' + kit.footer('brain');
  },
  bind(kit) {
    const say = (t, k) => status($('#bstatus'), t, k);
    const render = async () => {
      const host = $('#bbody'); if (!host) return;
      try { const [s, v] = await Promise.all([api('brain/status'), api('brain/vaults').catch(() => ({vaults: [], found: false}))]); host.innerHTML = body(s, v); return s }
      catch (e) { host.innerHTML = ''; say(e.message, 'err') }
    };
    const current = async () => (await api('brain/status')).folders.map(f => f.path);
    const setFolders = async (list, message) => {
      say('Reading your notes…');
      try { const s = await api('brain/folders', {folders: list}); await kit.refresh(); await render(); say(typeof message === 'function' ? message(s) : message, 'ok') } catch (e) { say(e.message, 'err') }
    };
    const connect = async path => setFolders([...await current(), path], s => 'Connected. Your brain has ' + n(s.totals.notes) + ' notes and ' + n(s.totals.links) + ' links.');
    render();
    $('#bbody')?.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.bconnect) { b.disabled = true; b.textContent = 'Connecting…'; return connect(b.dataset.bconnect) }
      if (b.dataset.bremove) return setFolders((await current()).filter(p => p !== b.dataset.bremove), 'Removed. The notes stay in that folder.');
      if (b.dataset.bopen) { try { const r = await api('brain/open', {path: b.dataset.bopen}); say(r.opened ? 'Opening in Obsidian…' : 'Open this in Obsidian: ' + r.url, 'ok') } catch (err) { say(err.message, 'err') } return }
      if (b.id === 'bpick') return pick('brain', {message: 'Choose a folder of notes'}, p => p && connect(p));
      if (b.id === 'bnew') { const c = $('#bcreate'); c.hidden = !c.hidden; if (!c.hidden) $('#bname')?.select(); return }
      if (b.id === 'bcreate-go') {
        b.disabled = true; say('Creating your second brain…');
        try {
          const r = await api('brain/create', {name: $('#bname')?.value || ''});
          await kit.refresh(); await render();
          say('Created ' + r.display + ' and connected it. Use Open in Obsidian to see it there.', 'ok');
        } catch (err) { b.disabled = false; say(err.message, 'err') }
      }
    });
    $('#bbody')?.addEventListener('change', async e => {
      if (e.target.id !== 'bagents') return;
      const enable = e.target.checked; e.target.disabled = true; say(enable ? 'Giving your agents your brain…' : 'Removing…');
      try {
        const r = await api('brain/agents', {enable});
        const names = {claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes Agent'};
        await render();
        say(enable ? ['claude', 'codex', 'hermes'].filter(k => r.results?.[k]).map(k => names[k] + ': ' + (r.results[k].ok ? 'done' : r.results[k].error)).join(' · ') : 'Removed. Their instruction files are as they were.', 'ok');
      } catch (err) { e.target.checked = !enable; e.target.disabled = false; say(err.message, 'err') }
    });
  },
};
