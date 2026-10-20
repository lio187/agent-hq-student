// Setup wizard (student edition): licence, agent runtimes, apps (Composio), social accounts (Zernio) and folders.
// Everything is a click: login pages open in the browser and the wizard notices when they are done.
import {$, esc, api, native, openExternal, copy, status, footer} from './setup-kit.mjs';
import {MODULES} from './setup-steps.mjs';
// Base steps live here; the others (agents, more tools, second brain, voice, research) are modules, inserted after the
// step they follow.
const BASE = [['licence', 'Licence'], ['apps', 'Apps'], ['social', 'Social'], ['folders', 'Folders'], ['done', 'Finish']];
const STEPS = [];
for (const s of BASE) { STEPS.push(s); const add = id => MODULES.filter(m => m.after === id).forEach(m => { STEPS.push([m.id, m.label]); add(m.id) }); add(s[0]) }
const MOD = Object.fromEntries(MODULES.map(m => [m.id, m]));
const PLATFORM = {instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', twitter: 'X (Twitter)', facebook: 'Facebook', threads: 'Threads', pinterest: 'Pinterest', bluesky: 'Bluesky'};
let state = null, step = 'licence', polls = [];
const VIEWS_EXTRA = {}, BIND_EXTRA = {};
const stopPolls = () => { polls.forEach(clearInterval); polls = [] };
const licensed = () => Boolean(state?.license && !state.license.expired);

function rail() {
  const doneMap = {licence: licensed(), apps: state.composio?.connected, social: state.zernio?.connected, folders: Boolean(state.settings?.workspace), done: state.settings?.setupComplete};
  for (const m of MODULES) doneMap[m.id] = m.done(state);
  $('#steps').innerHTML = STEPS.map(([id, label]) => '<li><button type="button" data-step="' + id + '"' + (id === step ? ' aria-current="step"' : '') + ' data-done="' + Boolean(doneMap[id] && id !== step) + '"' + (id !== 'licence' && !licensed() ? ' disabled' : '') + '>' + esc(label) + '</button></li>').join('');
}
function show(next, {focus = true} = {}) {
  stopPolls(); step = next; if (location.hash !== '#' + next) history.replaceState(null, '', '#' + next);
  rail(); $('#step').innerHTML = '<div class="panel">' + (VIEWS[next] || VIEWS_EXTRA[next])() + '</div>'; (BIND[next] || BIND_EXTRA[next])?.();
  if (focus) $('#step').focus({preventScroll: true});
}
const nextOf = id => STEPS[STEPS.findIndex(([s]) => s === id) + 1]?.[0] || 'done';
const kit = {get state() { return state }, set state(v) { state = v }, refresh: () => refreshState(), show: (id, o) => show(id, o), footer, get polls() { return polls }};
for (const m of MODULES) { VIEWS_EXTRA[m.id] = () => m.view(kit); BIND_EXTRA[m.id] = () => m.bind?.(kit) }

const VIEWS = {
  licence() {
    if (licensed()) return '<p class="eyebrow">Licence</p><h1>Welcome, ' + esc(state.license.name.split(' ')[0]) + '</h1><p class="lead">187N Agent HQ is activated on this Mac' + (state.license.email ? ' for ' + esc(state.license.email) : '') + (state.license.expires ? ', valid until ' + esc(new Date(state.license.expires * 1000).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})) : '') + '. Next: connect your agents, apps and social accounts. It takes about five minutes.</p>' + footer('licence', {skip: false});
    return '<p class="eyebrow">Licence</p><h1>Welcome to 187N Agent HQ</h1><p class="lead">Your office for AI agents: give work to your agents, follow it live, and see your calendar, apps and social results in one place. Paste the licence key you received from 187N to begin.</p>'
      + '<label class="field">Licence key<textarea id="lic" spellcheck="false" placeholder="HQ1-…" autocomplete="off"></textarea></label><div class="actions"><button type="button" class="btn primary" id="activate">Activate</button></div><p class="status" id="lic-status"></p>';
  },
  apps() {
    if (!state.composio?.connected) return '<p class="eyebrow">Apps</p><h1>Connect your apps with Composio</h1><p class="lead">Composio connects Gmail, Google Calendar, Slack, Notion, GitHub and hundreds more, with one login per app and no code. Create a free Composio account, copy your API key and paste it here.</p>'
      + '<div class="actions" style="margin-top:0"><button type="button" class="btn" data-open="https://app.composio.dev">Open composio.dev ↗</button></div><label class="field">Composio API key<input type="password" id="ckey" autocomplete="off" spellcheck="false" placeholder="Paste your project API key"></label><div class="actions"><button type="button" class="btn primary" id="csave">Save key</button><button type="button" class="btn" data-skip="apps">Skip for now</button></div><p class="status" id="cstatus"></p>';
    const aa = state.composio.agentApps || {}, on = Object.values(aa).some(Boolean);
    return '<p class="eyebrow">Apps</p><h1>Choose the apps to connect</h1><p class="lead">Click Connect, log in in your browser, and come back: the app appears as connected here. Google Calendar fills your Calendar page.</p>'
      + '<section class="card"><div class="row"><h3>Give your agents your apps</h3>' + (on ? '<span class="pill ok">On for ' + esc(Object.entries(aa).filter(([, v]) => v).map(([k]) => ({claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes'})[k]).join(', ')) + '</span>' : '<span class="pill off">Off</span>') + '</div>'
      + '<p>One click and Claude Code, Codex and Hermes can use the apps you connect here while they work: read and draft email, plan in your calendar, update Notion, and more. Your Composio key is stored in their settings on this Mac.</p>'
      + '<div class="actions"><button type="button" class="btn primary" id="agentapps">' + (on ? 'Update for my agents' : 'Give my agents my apps') + '</button>' + (on ? '<button type="button" class="btn" id="agentapps-off">Remove from my agents</button>' : '') + '</div><p class="status" id="aastatus"></p></section>'
      + '<div id="connected-apps"></div><label class="field">Find an app<input type="text" id="csearch" placeholder="Search 1,000+ apps…" autocomplete="off"></label><div class="grid" id="apps"><p class="muted">Loading apps…</p></div>'
      + '<details style="margin-top:14px"><summary class="muted">Change or remove your Composio key</summary><div class="actions"><button type="button" class="btn" id="cremove">Remove key</button></div></details>' + footer('apps');
  },
  social() {
    if (!state.zernio?.connected) return '<p class="eyebrow">Social</p><h1>Connect your social accounts with Zernio</h1><p class="lead">Zernio connects Instagram, TikTok, YouTube, LinkedIn, X and more. Your posts and their results appear on the Social page. Create a Zernio account, copy your API key and paste it here.</p>'
      + '<div class="actions" style="margin-top:0"><button type="button" class="btn" data-open="https://zernio.com">Open zernio.com ↗</button></div><label class="field">Zernio API key<input type="password" id="zkey" autocomplete="off" spellcheck="false" placeholder="Paste your API key"></label><div class="actions"><button type="button" class="btn primary" id="zsave">Save key</button><button type="button" class="btn" data-skip="social">Skip for now</button></div><p class="status" id="zstatus"></p>';
    return '<p class="eyebrow">Social</p><h1>Connect your social accounts</h1><p class="lead">Click a platform, log in in your browser, and come back. Results per post need Zernio\'s Analytics add-on.</p><div id="zaccounts"></div>'
      + '<div class="grid">' + (state.zernio.platforms || Object.keys(PLATFORM)).map(p => '<div class="app"><header>' + esc(PLATFORM[p] || p) + '</header><button type="button" class="btn" data-zconnect="' + esc(p) + '">Connect</button></div>').join('') + '</div><p class="status" id="zstatus"></p>'
      + '<details style="margin-top:14px"><summary class="muted">Change or remove your Zernio key</summary><div class="actions"><button type="button" class="btn" id="zremove">Remove key</button></div></details>' + footer('social');
  },
  folders() {
    const s = state.settings || {};
    return '<p class="eyebrow">Folders</p><h1>Where your agents work</h1><p class="lead">Agents read and write in your workspace folder. Your proposals and playbooks folders fill the Sales pages.</p>'
      + '<section class="card"><div class="row"><h3>Workspace folder</h3><button type="button" class="btn" data-pick="workspace">Choose…</button></div><p class="path" id="p-workspace">' + esc(s.workspace) + '</p></section>'
      + '<section class="card"><div class="row"><h3>Proposals folder <span class="muted" style="font-weight:400">optional</span></h3><div class="actions" style="margin:0"><button type="button" class="btn" data-pick="proposals">Choose…</button></div></div><p class="path" id="p-proposals">' + esc(s.proposalsFolder || 'No proposals folder yet') + '</p></section>'
      + '<section class="card"><div class="row"><h3>Playbooks folder <span class="muted" style="font-weight:400">optional</span></h3><div class="actions" style="margin:0"><button type="button" class="btn" data-pick="handbook">Choose…</button></div></div><p class="path" id="p-handbook">' + esc(s.handbookFolder || 'No playbooks folder yet') + '</p></section>'
      + '<label class="field">Your currency<select id="currency">' + ['EUR', 'USD', 'GBP'].map(c => '<option' + ((s.currency || 'EUR') === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label>'
      + '<label class="check"><input type="checkbox" id="perm' + ((s.permissions || 'edit') === 'edit' ? ' checked' : '') + '> <span>Agents may create and edit files in the workspace folder. Turn this off to let them read only.</span></label>'
      + '<p class="status" id="fstatus"></p>' + footer('folders', {skip: false});
  },
  done() {
    const rows = [['Licence', licensed() ? 'Activated for ' + state.license.name : 'Not activated'], ['Apps', state.composio?.connected ? 'Composio connected' : 'Not connected'],
      ['Social', state.zernio?.connected ? 'Zernio connected' : 'Not connected'], ...MODULES.filter(m => m.summary).map(m => m.summary(state))];
    return '<p class="eyebrow">Finish</p><h1>Your office is ready</h1><p class="lead">You can change everything later: open Setup from the 187N Agent HQ menu (⌘,) or from Settings.</p><div class="done-list">' + rows.map(([k, v]) => '<div><span>' + esc(k) + '</span><span class="muted">' + esc(v) + '</span></div>').join('') + '</div><div class="actions"><button type="button" class="btn primary" id="finish">Open 187N Agent HQ</button></div><p class="status" id="dstatus"></p>';
  },
};

async function refreshState() { state = await api('state') }
async function loadApps(search = '') {
  const host = $('#apps'); if (!host) return;
  try {
    const [apps, accounts] = await Promise.all([api('composio/toolkits' + (search ? '?search=' + encodeURIComponent(search) : '')), api('composio/accounts')]);
    const active = new Set(accounts.filter(a => String(a.status).toUpperCase() === 'ACTIVE').map(a => a.toolkit));
    $('#connected-apps').innerHTML = accounts.length ? '<section class="card"><h3>Connected</h3>' + accounts.map(a => '<div class="row" style="margin-top:8px"><span>' + esc(a.toolkitName || a.toolkit) + (a.label ? ' · <span class="muted">' + esc(a.label) + '</span>' : '') + '</span><span class="row" style="gap:8px">' + (String(a.status).toUpperCase() === 'ACTIVE' ? '<span class="pill ok">Connected</span>' : '<span class="pill warn">' + esc(String(a.status || '').toLowerCase()) + '</span>') + '<button type="button" class="btn" data-cremove="' + esc(a.id) + '">Remove</button></span></div>').join('') + '</section>' : '';
    host.innerHTML = apps.slice(0, 60).map(a => '<div class="app"><header>' + (a.logo ? '<img src="' + esc(a.logo) + '" alt="">' : '') + '<span>' + esc(a.name) + '</span></header>' + (active.has(a.slug) ? '<span class="pill ok">Connected</span>' : a.managed ? '<button type="button" class="btn" data-cconnect="' + esc(a.slug) + '">Connect</button>' : '<span class="muted" style="font-size:12px">Needs its own login setup in Composio</span>') + '</div>').join('') || '<p class="muted">No apps match.</p>';
  } catch (e) { host.innerHTML = '<p class="status err">' + esc(e.message) + '</p>' }
}
async function loadZernio() {
  const host = $('#zaccounts'); if (!host) return;
  try {
    const accounts = await api('zernio/accounts');
    host.innerHTML = accounts.length ? '<section class="card"><h3>Connected accounts</h3>' + accounts.map(a => '<div class="row" style="margin-top:8px"><span>' + esc(PLATFORM[a.platform] || a.platform) + ' · ' + esc(a.handle || a.name) + '</span>' + (a.needsReconnect ? '<span class="pill warn">Reconnect</span>' : '<span class="pill ok">Connected</span>') + '</div>').join('') + '</section>' : '';
    return accounts;
  } catch (e) { host.innerHTML = '<p class="status err">' + esc(e.message) + '</p>'; return [] }
}
// After a login opens in the browser: check every 3 s (for up to 10 minutes) until the account shows up.
function waitFor(check, onDone, button) {
  const started = Date.now(); if (button) { button.disabled = true; button.textContent = 'Waiting for login…' }
  const t = setInterval(async () => {
    if (Date.now() - started > 600000) { clearInterval(t); if (button) { button.disabled = false; button.textContent = 'Try again' } return }
    try { if (await check()) { clearInterval(t); onDone() } } catch {}
  }, 3000);
  polls.push(t);
}

const BIND = {
  licence() {
    $('#activate')?.addEventListener('click', async e => {
      const s = $('#lic-status'); e.target.disabled = true; status(s, 'Checking…');
      try { await api('license', {key: $('#lic').value}); await refreshState(); show('licence') } catch (err) { status(s, err.message, 'err'); e.target.disabled = false }
    });
  },
  apps() {
    $('#csave')?.addEventListener('click', async e => {
      const s = $('#cstatus'); e.target.disabled = true; status(s, 'Checking your key with Composio…');
      try { await api('composio/key', {key: $('#ckey').value}); await refreshState(); show('apps') } catch (err) { status(s, err.message, 'err'); e.target.disabled = false }
    });
    if (!state.composio?.connected) return;
    loadApps();
    const aa = async enable => {
      const st = $('#aastatus'); status(st, enable ? 'Adding your apps to your AI tools…' : 'Removing…');
      try {
        const r = await api('agents-apps', {enable});
        const lines = Object.entries(r.results || {}).map(([k, v]) => ({claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes'})[k] + ': ' + (v.ok ? 'done' : v.error));
        await refreshState(); show('apps', {focus: false}); status($('#aastatus'), enable ? (lines.join(' · ') || 'No AI tool installed yet.') : 'Removed from your AI tools.', 'ok');
      } catch (e) { status(st, e.message, 'err') }
    };
    $('#agentapps')?.addEventListener('click', () => aa(true));
    $('#agentapps-off')?.addEventListener('click', () => aa(false));
    let timer = 0; $('#csearch')?.addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => loadApps(e.target.value.trim()), 350) });
    $('#cremove')?.addEventListener('click', async () => { await api('composio/key', {key: ''}); await refreshState(); show('apps') });
  },
  social() {
    $('#zsave')?.addEventListener('click', async e => {
      const s = $('#zstatus'); e.target.disabled = true; status(s, 'Checking your key with Zernio…');
      try { await api('zernio/key', {key: $('#zkey').value}); await refreshState(); show('social') } catch (err) { status(s, err.message, 'err'); e.target.disabled = false }
    });
    if (!state.zernio?.connected) return;
    loadZernio();
    $('#zremove')?.addEventListener('click', async () => { await api('zernio/key', {key: ''}); await refreshState(); show('social') });
  },
  folders() {
    const save = async values => { const s = $('#fstatus'); try { await api('folders', values); await refreshState(); status(s, 'Saved.', 'ok') } catch (e) { status(s, e.message, 'err') } };
    document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      if (window.webkit?.messageHandlers?.hq) native({type: 'pickFolder', purpose: b.dataset.pick});
      else { const p = prompt('Folder path'); if (p) window.hqPicked(b.dataset.pick, p) }
    }));
    const KEYS = {workspace: 'workspace', proposals: 'proposalsFolder', handbook: 'handbookFolder'};
    window.hqPicked = async (purpose, path) => { if (!path || !KEYS[purpose]) return; await save({[KEYS[purpose]]: path}); $('#p-' + purpose).textContent = path };
    $('#currency')?.addEventListener('change', e => save({currency: e.target.value}));
    $('#perm')?.addEventListener('change', e => save({permissions: e.target.checked ? 'edit' : 'read'}));
  },
  done() {
    $('#finish')?.addEventListener('click', async e => {
      e.target.disabled = true;
      try { await api('finish', {}); location.href = '/' } catch (err) { status($('#dstatus'), err.message, 'err'); e.target.disabled = false }
    });
  },
};

document.addEventListener('click', async e => {
  const b = e.target.closest('button,a'); if (!b) return;
  if (b.dataset.step && !b.disabled) return show(b.dataset.step);
  if (b.dataset.copy != null) return copy(b.dataset.copy, b);
  if (b.dataset.open) { e.preventDefault(); return openExternal(b.dataset.open) }
  if (b.hasAttribute('data-terminal')) return native({type: 'openTerminal'});
  if (b.dataset.next || b.dataset.skip) {
    const id = b.dataset.next || b.dataset.skip;
    if (b.dataset.next && MOD[id]?.beforeNext) {
      b.disabled = true;
      try { await MOD[id].beforeNext(kit) } catch (err) { b.disabled = false; return alert(err.message) }
    }
    return show(nextOf(id));
  }
  if (b.dataset.cconnect) {
    try {
      const r = await api('composio/connect', {toolkit: b.dataset.cconnect}); openExternal(r.url);
      waitFor(async () => (await api('composio/accounts')).some(a => a.toolkit === b.dataset.cconnect && String(a.status).toUpperCase() === 'ACTIVE'), () => loadApps($('#csearch')?.value.trim() || ''), b);
    } catch (err) { b.textContent = 'Try again'; alert(err.message) }
  }
  if (b.dataset.cremove) { b.disabled = true; try { await api('composio/disconnect', {id: b.dataset.cremove}) } catch (err) { alert(err.message) } loadApps($('#csearch')?.value.trim() || '') }
  if (b.dataset.zconnect) {
    const before = new Set((await loadZernio()).map(a => a.id));
    try {
      const r = await api('zernio/connect', {platform: b.dataset.zconnect}); openExternal(r.url);
      waitFor(async () => (await api('zernio/accounts')).some(a => !before.has(a.id)), () => { loadZernio(); b.disabled = false; b.textContent = 'Connected ✓' }, b);
    } catch (err) { status($('#zstatus'), err.message, 'err') }
  }
});

(async () => {
  try { await refreshState() } catch (e) { $('#step').innerHTML = '<div class="panel"><h1>Setup could not load</h1><p class="lead">' + esc(e.message) + '</p></div>'; return }
  const wanted = location.hash.slice(1);
  show(licensed() ? (STEPS.some(([s]) => s === wanted) ? wanted : state.settings?.setupComplete ? 'agents' : 'agents') : 'licence');
})();
