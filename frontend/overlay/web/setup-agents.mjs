// Setup step: the AI tools (Claude Code, Codex, Hermes Agent). Install and Sign in open the official command in
// Terminal; the page notices by itself when that is done (it asks the app every 3 s while something is pending).
// Each tool can use an API key instead of the student's subscription. Below: which tool each of the nine agents runs on.
import {esc, api, status} from './setup-kit.mjs';

const PILL = {ready: ['ok', 'Ready'], 'signing in': ['warn', 'Signing in…'], installing: ['warn', 'Installing…'], 'sign in needed': ['warn', 'Sign in needed'], 'not installed': ['off', 'Not installed'], checking: ['off', 'Checking…']};
const sig = r => [r.state, r.ready, r.method, r.account, r.pending, r.mode, r.hasKey, r.installed, r.version, r.note].join('|');
const button = (label, act, {primary = false, disabled = false} = {}) => '<button type="button" class="btn' + (primary ? ' primary' : '') + '"' + (act ? ' data-rt-act="' + act + '"' : '') + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
const command = text => '<details class="muted" style="margin-top:10px"><summary>Command</summary><code class="cmd">' + esc(text) + '</code></details>';
let timer = 0;
// The same format check the app makes, before sending (the app checks again).
function keyProblem(r, k) {
  const info = r.key || {}; if (!info.pattern || new RegExp(info.pattern).test(k)) return '';
  const service = k.startsWith('sk-ant-') ? 'Anthropic' : k.startsWith('sk-or-') ? 'OpenRouter' : k.startsWith('sk-') ? 'OpenAI' : '';
  return service && service !== info.provider ? 'This is an ' + service + ' key. ' + r.name + ' needs an ' + info.label + ' (it starts with ' + info.prefix + ').'
    : 'This is not a complete ' + info.label + '. It starts with ' + info.prefix + ' and has no spaces. Copy it again from your ' + info.provider + ' account.';
}

// The "Use an API key instead" box: paste a key (kept in the Keychain), switch between key and subscription, remove it.
function keyBox(r, open) {
  const k = r.key || {}, on = r.mode === 'api-key' && r.hasKey;
  let html = '<p>Pay per use with your own ' + esc(k.label) + ' instead of a subscription. The key stays in your macOS Keychain; ' + esc(r.name) + ' only gets it while your agents work.</p>';
  if (r.hasKey) html += '<p class="muted" data-key-mode>' + (on ? 'Your agents use your API key.' : 'Your API key is saved. Your agents use your subscription.') + '</p><div class="actions" style="margin-top:12px">'
    + (on ? button('Use my subscription instead', 'mode-sub') : button('Use my API key', 'mode-key', {primary: true})) + button('Remove key', 'key-remove') + '</div>';
  else html += '<label class="field">' + esc(k.label) + '<input type="password" data-key-input autocomplete="off" spellcheck="false" placeholder="' + esc(k.prefix) + '…"></label>'
    + '<div class="actions" style="margin-top:0">' + button('Save key and use it', 'key-save', {primary: true}) + '<button type="button" class="btn" data-open="' + esc(k.link) + '">Get a key ↗</button></div>';
  return '<details class="rt-key" data-key' + (open ? ' open' : '') + '><summary>Use an API key instead</summary>' + html + '<p class="status" data-key-status></p></details>';
}

function card(r, {open} = {}) {
  const [cls, label] = PILL[r.state] || ['off', r.state];
  let body;
  if (!r.installed) body = '<p data-note>' + esc(r.note) + '</p><div class="actions">'
    + (r.pending === 'install' ? button('Waiting for the installer…', '', {disabled: true}) + button('Open Terminal again', 'install') : button('Install ' + r.name, 'install', {primary: true}) + '<button type="button" class="btn" data-open="' + esc(r.docs) + '">Install guide ↗</button>')
    + '</div>' + command(r.install);
  else if (r.state === 'checking') body = '<p class="muted" data-note>Checking ' + esc(r.name) + '…</p>';
  else if (!r.ready) body = '<p data-note>' + esc(r.note) + '</p><div class="actions">'
    + (r.pending === 'login' ? button('Waiting for sign-in…', '', {disabled: true}) + button('Open Terminal again', 'login') : button(r.id === 'hermes' ? 'Set up' : 'Sign in', 'login', {primary: true}))
    + '</div>' + command(r.login);
  else body = '<p class="rt-account" data-account><strong>' + esc(r.methodLabel) + '</strong>' + (r.account ? ' · ' + esc(r.account) : '') + '</p>'
    + '<p class="muted">' + esc(r.version || 'Installed') + '</p><div class="actions" style="margin-top:12px">' + button('Test', 'test') + '</div>';
  return '<section class="card rt-card" id="rt-' + esc(r.id) + '" data-rt="' + esc(r.id) + '" data-state="' + esc(r.state) + '"><div class="row"><h3>' + esc(r.name) + '</h3><span class="pill ' + cls + '" data-pill>' + esc(label) + '</span></div>'
    + body + '<p class="status" data-card-status></p>' + (r.installed && r.state !== 'checking' ? keyBox(r, open ?? r.mode === 'api-key') : '') + '</section>';
}

// New status from the app: only the cards that changed are redrawn (an open key box, a typed key and a test result stay).
function apply(kit, list) {
  const old = kit.state.runtimes || [];
  kit.state.runtimes = list;
  for (const r of list) {
    const prev = old.find(o => o.id === r.id), el = document.getElementById('rt-' + r.id);
    if (!el || (prev && sig(prev) === sig(r))) continue;
    const open = el.querySelector('details[data-key]')?.open, typed = el.querySelector('[data-key-input]')?.value || '', s = el.querySelector('[data-card-status]');
    const keep = s && (s.classList.contains('ok') || s.classList.contains('err')) ? [s.textContent, s.className] : null;
    el.outerHTML = card(r, {open});
    const now = document.getElementById('rt-' + r.id);
    if (typed && now.querySelector('[data-key-input]')) now.querySelector('[data-key-input]').value = typed;
    if (keep && r.ready === prev?.ready) { const n = now.querySelector('[data-card-status]'); n.textContent = keep[0]; n.className = keep[1] }
  }
  const ready = list.filter(r => r.ready);
  document.querySelectorAll('[data-agent] option').forEach(o => { const r = list.find(x => x.id === o.value); if (r) o.textContent = r.name + (r.ready ? '' : ' (not ready)') });
  const none = document.getElementById('rt-none'); if (none) none.hidden = ready.length > 0;
}
const replace = (kit, s) => (kit.state.runtimes || []).map(r => r.id === s.id ? s : r);
const needsPoll = list => list.some(r => r.pending || r.state === 'checking');
// While a sign-in or install is pending (or a check is running), ask the app every 3 s; stops by itself. The first ask
// comes 0.6 s after the app's own 3-s check, so a finished sign-in shows about 3 s after it happens, not 6.
function poll(kit) {
  if (timer || !needsPoll(kit.state.runtimes || [])) return;
  const stop = () => { clearInterval(timer); clearTimeout(timer); timer = 0 };
  const tick = async () => {
    if (!document.getElementById('rt-cards')) return stop();
    try { apply(kit, (await api('runtimes/status')).runtimes) } catch {}
    if (!needsPoll(kit.state.runtimes || [])) stop();
  };
  timer = setTimeout(() => { if (!timer) return; tick(); timer = setInterval(tick, 3000); kit.polls.push(timer) }, 3600);
  kit.polls.push(timer);
}

export default {
  id: 'agents', label: 'Agents', after: 'licence',
  done: state => (state.runtimes || []).some(r => r.ready),
  summary: state => { const rts = (state.runtimes || []).filter(r => r.ready).map(r => r.name + (r.method === 'api-key' ? ' (API key)' : '')); return ['Agents', rts.length ? rts.join(', ') : 'No AI tool ready yet'] },
  view(kit) {
    const state = kit.state, runtimes = state.runtimes || [];
    const ready = runtimes.filter(r => r.ready);
    const team = (state.team || []).map(t => {
      const cur = (state.agents || []).find(a => a.id === t.id)?.runtime || (t.id === 'builder' && ready.some(r => r.id === 'codex') ? 'codex' : ready[0]?.id || 'claude');
      return '<tr><td><strong>' + esc(t.name) + '</strong><div class="muted" style="font-size:12.5px">' + esc(t.role) + '</div></td><td style="width:180px"><select data-agent="' + esc(t.id) + '">' + runtimes.map(r => '<option value="' + esc(r.id) + '"' + (r.id === cur ? ' selected' : '') + '>' + esc(r.name) + (r.ready ? '' : ' (not ready)') + '</option>').join('') + '</select></td></tr>';
    }).join('');
    return '<style>.rt-account{margin-top:6px}.rt-key{margin-top:14px;border-top:1px solid #1c1d20;padding-top:12px}.rt-key summary{cursor:pointer;color:var(--text-tertiary,#8a8f98);font-size:13px}.rt-key .field{margin:10px 0}.rt-card .status:empty{min-height:0;margin:0}</style>'
      + '<p class="eyebrow">Agents</p><h1>Connect your AI agents</h1><p class="lead">Your agents run on the AI tools you already use: Claude Code, Codex or Hermes Agent. Install at least one and sign in once with your own subscription. This page notices by itself when you are done. No subscription? Use an API key instead.</p>'
      + '<div id="rt-cards">' + runtimes.map(r => card(r)).join('') + '</div>'
      + '<section class="card" style="margin-top:22px"><h3>Your team</h3><p>Nine agents, one per department. Choose which AI tool each one uses; you can change this later in Settings.</p><table class="team"><thead><tr><th>Agent</th><th>Runs on</th></tr></thead><tbody>' + team + '</tbody></table></section>'
      + '<p class="status err" id="rt-none"' + (ready.length ? ' hidden' : '') + '>No AI tool is ready yet. You can continue, but agents can only work once one is installed and signed in.</p>' + kit.footer('agents', {skip: false});
  },
  bind(kit) {
    timer = 0;
    const host = document.getElementById('rt-cards');
    host?.addEventListener('click', async e => {
      const b = e.target.closest('[data-rt-act]'); if (!b || b.disabled) return;
      const el = b.closest('[data-rt]'), id = el.dataset.rt, act = b.dataset.rtAct, r = (kit.state.runtimes || []).find(x => x.id === id) || {};
      const cardStatus = el.querySelector('[data-card-status]'), keyStatus = el.querySelector('[data-key-status]');
      b.disabled = true;
      try {
        if (act === 'install' || act === 'login') {
          status(cardStatus, act === 'install' ? 'Opening the installer in Terminal…' : 'Opening the sign-in in Terminal…');
          const d = await api('runtimes/' + act, {runtime: id});
          apply(kit, replace(kit, d.status)); poll(kit);
        } else if (act === 'test') {
          status(cardStatus, 'Asking ' + r.name + ' to reply… (uses your ' + (r.method === 'api-key' ? 'API key' : 'own subscription') + ')');
          const t = await api('runtimes/test', {runtime: id});
          status(cardStatus, t.ok ? 'Works: “' + t.text.trim().slice(0, 80) + '”' : t.error, t.ok ? 'ok' : 'err');
        } else {
          const body = act === 'key-save' ? {runtime: id, key: el.querySelector('[data-key-input]')?.value || ''} : act === 'key-remove' ? {runtime: id, key: ''} : {runtime: id, mode: act === 'mode-key' ? 'api-key' : 'subscription'};
          if (act === 'key-save' && !body.key.trim()) { status(keyStatus, 'Paste your ' + (r.key?.label || 'API key') + ' first.', 'err'); return }
          if (act === 'key-save' && keyProblem(r, body.key.trim())) { status(keyStatus, keyProblem(r, body.key.trim()), 'err'); return }
          status(keyStatus, act === 'key-save' ? 'Saving your key…' : 'Saving…');
          apply(kit, replace(kit, await api('runtimes/apikey', body)));
          const done = {['key-save']: 'Saved. Your agents now use your API key.', ['key-remove']: 'Key removed. Your agents use your subscription.', ['mode-key']: 'Your agents now use your API key.', ['mode-sub']: 'Your agents now use your subscription.'}[act];
          status(document.querySelector('#rt-' + id + ' [data-key-status]'), done, 'ok');
        }
      } catch (err) { status(act.startsWith('key') || act.startsWith('mode') ? keyStatus : cardStatus, err.message, 'err') }
      finally { if (document.contains(b)) b.disabled = false }
    });
    poll(kit);
  },
  async beforeNext(kit) {
    await api('agents', {agents: [...document.querySelectorAll('[data-agent]')].map(s => ({id: s.dataset.agent, runtime: s.value}))});
    await kit.refresh();
  },
};
