// Add tools (Agents & Setup › Setup › Add tools): four ways to give the student's agents a new tool. Apps from
// Composio's catalog (Setup › Apps), any MCP server (a web address or a command), a vault of named API keys, and
// skill folders. What is added here goes into Claude Code, Codex and Hermes Agent at once; Remove takes it out again.
import {tileRow, panel} from './page-kit.mjs';
import {pick} from './setup-kit.mjs';

export const AGENTS = [['claude', 'Claude Code'], ['codex', 'Codex'], ['hermes', 'Hermes Agent']];
const WORD = {on: 'On', off: 'Off', 'not installed': 'Not installed', error: 'Problem'};

const STYLE = '<style>'
  + '.tools-add [hidden]{display:none!important}'
  + '.tools-ways{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0;align-items:start}'
  + '.tools-col{display:flex;flex-direction:column;gap:14px;min-width:0}'
  + '@media (max-width:1100px){.tools-ways{display:flex;flex-direction:column}.tools-col{display:contents}#tools-way-apps{order:1}#tools-way-mcp{order:2}#tools-way-vault{order:3}#tools-way-skill{order:4}}'
  + '.tools-way{margin:0!important;display:flex;flex-direction:column;gap:10px}'
  + '.tools-way h2{display:flex;align-items:center;gap:10px}'
  + '.tools-num{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid var(--border-mid,var(--hq-border));font-size:11px;flex:none}'
  + '.tools-way p{margin:0;font-size:13px;line-height:1.55;color:var(--text-secondary,var(--hq-muted))}'
  + '.tools-form{display:grid;gap:10px}'
  + '.tools-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}'
  + '.tools-for{display:flex;flex-wrap:wrap;gap:14px;border:0;padding:0;margin:0}'
  + '.tools-for legend{font-size:12px;color:var(--text-tertiary,var(--hq-muted));margin-bottom:6px;padding:0}'
  + '.tools-err{margin:0;font-size:12.5px;color:var(--status-error,#e5484d);white-space:pre-line}'
  + '.tools-err:empty,.tools-ok:empty{display:none}'
  + '.tools-ok{margin:0;font-size:12.5px;color:var(--text-secondary,var(--hq-muted))}'
  + '.tools-help{font-size:12px;color:var(--text-tertiary,var(--hq-muted))}'
  + '.tools-help code{font-size:11.5px}'
  + '.tools-chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}'
  + '.tools-chip{height:26px!important;padding:0 10px!important;border-radius:9999px!important;font-size:11.5px!important}'
  + '.tools-chip[data-state=on]{border-color:var(--status-live,#3fb950)!important}'
  + '.tools-chip[data-state=off]{opacity:.75}'
  + '.tools-item{display:grid!important;grid-template-columns:minmax(0,1fr) auto auto;align-items:center}'
  + '@media (max-width:900px){.tools-item{grid-template-columns:minmax(0,1fr)}.tools-chips{justify-content:flex-start}}'
  + '.tools-item .actions{margin:0}'
  + '.tools-vault{display:flex;flex-wrap:wrap;gap:6px}'
  + '.tools-key{display:inline-flex;align-items:center;gap:6px;font:500 12px/1 var(--font-mono,monospace);border:1px solid var(--border-soft,var(--hq-border));border-radius:9999px;padding:4px 4px 4px 10px}'
  + '.tools-key small{font:11px var(--font-ui,inherit);color:var(--text-tertiary,var(--hq-muted))}'
  + '.tools-key button{height:22px!important;padding:0 8px!important;font-size:11px!important;border-radius:9999px!important}'
  + '</style>';

const statusOf = (x, t) => (x.status || {})[t] || 'off';
function chips(x, esc, {toggle = '', id = x.id} = {}) {
  return '<div class="tools-chips">' + AGENTS.map(([t, n]) => {
    const st = statusOf(x, t), text = n + ' · ' + (WORD[st] || st);
    if (!toggle || st === 'not installed') return '<span class="pill ' + (st === 'on' ? 'ok' : st === 'not installed' ? 'unavailable' : 'paused') + '">' + esc(text) + '</span>';
    return '<button type="button" class="tools-chip" data-state="' + esc(st) + '" data-action="' + toggle + '" data-id="' + esc(id + '|' + t + '|' + (st === 'on' ? 'off' : 'on')) + '" title="' + esc((st === 'on' ? 'Turn off for ' : 'Turn on for ') + n) + '">' + esc(text) + '</button>';
  }).join('') + '</div>';
}
const forBoxes = (agents, esc, key) => '<fieldset class="tools-for"><legend>Add it to</legend>' + AGENTS.map(([t, n]) => {
  const a = agents.find(x => x.id === t), ok = a?.installed;
  return '<label><input type="checkbox" data-tools-for="' + key + '" value="' + t + '"' + (ok ? ' checked' : ' disabled') + '> ' + esc(n) + (ok ? '' : ' (not installed)') + '</label>';
}).join('') + '</fieldset>';

function mcpForm(d, esc) {
  return '<div class="tools-form" data-tools-mcp>'
    + '<div class="dt-tabs" role="group" aria-label="How the tool connects"><button type="button" data-tools-kind="http" aria-pressed="true">Web address</button><button type="button" data-tools-kind="stdio" aria-pressed="false">Command on this Mac</button></div>'
    + '<label>Name<input id="tools-mcp-name" maxlength="60" autocomplete="off" placeholder="For example: Linear"></label>'
    + '<div class="tools-form" data-kind="http">'
    + '<label>MCP address<input id="tools-mcp-url" type="text" inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://mcp.example.com/mcp"></label>'
    + '<div class="tools-two"><label>Key (optional)<input id="tools-mcp-key" type="password" spellcheck="false" autocomplete="off" placeholder="Paste the key from the tool"></label>'
    + '<label>Send the key as<select id="tools-mcp-header"><option value="bearer">Authorization: Bearer (most tools)</option><option value="x-api-key">x-api-key</option><option value="custom">Another header…</option></select></label></div>'
    + '<label data-tools-custom hidden>Header name<input id="tools-mcp-custom" spellcheck="false" autocomplete="off" placeholder="For example: X-Api-Token"></label>'
    + '<p class="tools-help">No key in the docs? Leave it empty: if the tool uses a browser login, your AI tool asks you to log in the first time you use it.</p></div>'
    + '<div class="tools-form" data-kind="stdio" hidden>'
    + '<label>Command<input id="tools-mcp-command" spellcheck="false" autocomplete="off" placeholder="npx -y @modelcontextprotocol/server-github"></label>'
    + '<label>Keys the command needs (optional, one per line)<textarea id="tools-mcp-env" rows="3" spellcheck="false" placeholder="GITHUB_PERSONAL_ACCESS_TOKEN=paste-your-token"></textarea></label>'
    + '<p class="tools-help">Write each key as NAME=value. Leave the value empty (NAME=) to use the key with that name from your vault.</p></div>'
    + forBoxes(d.agents || [], esc, 'mcp')
    + '<p class="tools-err" role="alert" data-tools-error="mcp"></p>'
    + '<div class="actions" style="margin:0"><button type="button" class="primary" data-action="mk-tools-mcp-add">Add to my agents</button></div></div>';
}
function vaultBlock(d, esc) {
  const keys = d.vault || [];
  return '<div class="tools-form" data-tools-vault>'
    + '<div class="tools-two"><label>Name<input id="tools-vault-name" spellcheck="false" autocomplete="off" placeholder="ELEVENLABS_API_KEY"></label>'
    + '<label>Value<input id="tools-vault-value" type="password" spellcheck="false" autocomplete="off" placeholder="Paste the key"></label></div>'
    + '<p class="tools-err" role="alert" data-tools-error="vault"></p>'
    + '<div class="actions" style="margin:0"><button type="button" class="primary" data-action="mk-tools-vault-add">Save key</button></div>'
    + (keys.length ? '<div class="tools-vault" aria-label="Keys in your vault">' + keys.map(k => '<span class="tools-key">' + esc(k.name) + (k.usedBy?.length ? '<small>used by ' + esc(k.usedBy.join(', ')) + '</small>' : '')
      + '<button type="button" data-action="mk-tools-vault-remove" data-id="' + esc(k.name) + '" title="Remove ' + esc(k.name) + '">Remove</button></span>').join('') + '</div>'
      : '<p class="tools-help">No keys yet. Only the names show here; the values stay in your Mac’s Keychain.</p>')
    + '</div>';
}

export async function page(view, {api, esc}) {
  const d = await api('tools');
  const servers = d.servers || [], skills = d.skills || [], keys = d.vault || [];
  const aa = d.composio?.agentApps || {}, appsOn = AGENTS.filter(([t]) => aa[t]).map(([, n]) => n);
  const tiles = tileRow([
    {label: 'MCP servers', value: servers.length, caption: servers.length ? 'Added here' : 'None added yet'},
    {label: 'Keys in your vault', value: keys.length, caption: 'Given to every agent run'},
    {label: 'Skills', value: skills.length, caption: 'Copied into your AI tools'},
    {label: 'Composio apps', value: appsOn.length ? 'On' : 'Off', caption: appsOn.length ? 'For ' + appsOn.join(', ') : d.composio?.connected ? 'Turn on in Setup › Apps' : 'Connect in Setup › Apps'},
  ], {esc});
  const way = (n, id, title, intro, body) => '<section class="surface tools-way" id="tools-way-' + id + '"><h2><span class="tools-num" aria-hidden="true">' + n + '</span>' + esc(title) + '</h2><p>' + intro + '</p>' + body + '</section>';
  const ways = '<div class="tools-ways"><div class="tools-col">'
    + way(1, 'apps', 'Apps from Composio', 'Gmail, Google Calendar, Slack, Notion, HubSpot and 1,000+ more apps, each with one login and no code. Connect them in Setup, then click “Give my agents my apps”.',
      '<div class="actions" style="margin:0"><a class="ui-btn ui-btn--primary" href="/setup#apps">Open Apps in Setup</a></div>' + (appsOn.length ? chips({status: Object.fromEntries(AGENTS.map(([t]) => [t, aa[t] ? 'on' : 'off']))}, esc) : ''))
    + way(3, 'vault', 'Key vault', 'Named API keys, for example <code>ELEVENLABS_API_KEY</code>. Every agent run started from this app gets them as environment variables, so scripts and tools your agents use can find them.', vaultBlock(d, esc))
    + way(4, 'skill', 'A skill folder', 'A skill is a folder with a <code>SKILL.md</code> file: written steps your agents follow for one job. It is copied into the skills folder of each AI tool.',
      '<div class="actions" style="margin:0"><button type="button" class="primary" data-action="mk-tools-skill-add">Choose a skill folder…</button></div><p class="tools-err" role="alert" data-tools-error="skill"></p><p class="tools-ok" role="status" data-tools-ok="skill"></p>')
    + '</div><div class="tools-col">'
    + way(2, 'mcp', 'Any MCP server', 'MCP is the plug most new AI tools ship with. Paste the MCP address from the tool’s docs (it often ends in <code>/mcp</code>), or the command it gives you. It is added to your AI tools in one go.', mcpForm(d, esc))
    + '</div></div>';

  const serverRow = s => {
    const where = s.kind === 'stdio' ? 'Command · ' + [s.command, ...(s.args || [])].join(' ') : 'Web address · ' + s.url + (s.header ? ' · key sent as ' + (s.bearer ? s.header + ': Bearer' : s.header) : '');
    const test = s.lastTest ? '<small>' + esc((s.lastTest.ok ? 'Test: ' : 'Test failed: ') + s.lastTest.message) + '</small>' : '';
    return '<article class="row tools-item" data-tools-server="' + esc(s.id) + '"><div><strong>' + esc(s.name) + '</strong><small>' + esc(where) + '</small>' + test + '<small class="tools-err" role="alert" data-tools-row="' + esc(s.id) + '"></small></div>'
      + chips(s, esc, {toggle: 'mk-tools-mcp-toggle'})
      + '<div class="actions"><button type="button" data-action="mk-tools-mcp-test" data-id="' + esc(s.id) + '">Test</button><button type="button" data-action="mk-tools-mcp-remove" data-id="' + esc(s.id) + '">Remove</button></div></article>';
  };
  const skillRow = s => '<article class="row tools-item" data-tools-skill="' + esc(s.id) + '"><div><strong>' + esc(s.name) + '</strong><small>Skill · ' + esc(s.description || 'No description') + '</small><small class="tools-err" role="alert" data-tools-row="skill:' + esc(s.id) + '"></small></div>'
    + chips(s, esc) + '<div class="actions"><button type="button" data-action="mk-tools-skill-remove" data-id="' + esc(s.id) + '">Remove</button></div></article>';
  const added = servers.length || skills.length
    ? '<div class="list">' + servers.map(serverRow).join('') + skills.map(skillRow).join('') + '</div>'
    : '<p class="dt-empty">Nothing added yet. Start with one of the four ways above.</p>';
  const foot = '<div class="actions"><button type="button" data-section="skills">See everything your AI tools already have (Skills &amp; tools)</button></div>';
  return STYLE + '<div class="tools-add" data-tools-add>' + tiles + ways
    + panel('Added here', added + '<p class="tools-help">Click an AI tool to turn a server on or off for it. Remove takes it out of every AI tool, with its keys.</p>', {esc, meta: (servers.length + skills.length) + ' added'}) + foot + '</div>';
}

// Small things on the page itself: the address/command switch, the custom header field, capital letters for key names.
export function mount(view, el) {
  const root = el.querySelector('[data-tools-add]'); if (!root) return null;
  const onClick = e => {
    const b = e.target.closest?.('[data-tools-kind]'); if (!b || !root.contains(b)) return;
    root.querySelectorAll('[data-tools-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    root.querySelectorAll('[data-tools-mcp] [data-kind]').forEach(x => { x.hidden = x.dataset.kind !== b.dataset.toolsKind });
  };
  const onChange = e => { if (e.target.id === 'tools-mcp-header') root.querySelector('[data-tools-custom]').hidden = e.target.value !== 'custom' };
  const onInput = e => { if (e.target.id === 'tools-vault-name') { const v = e.target.value, up = v.toUpperCase().replace(/[\s-]+/g, '_'); if (up !== v) e.target.value = up } };
  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput);
  return () => { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput) };
}

const val = ($, sel) => ($(sel)?.value || '').trim();
const show = ($, sel, text) => { const n = $(sel); if (n) n.textContent = text || '' };
async function busy(el, label, work) {
  const text = el?.textContent; if (el) { el.disabled = true; if (label) el.textContent = label }
  try { return await work() } finally { if (el?.isConnected) { el.disabled = false; el.textContent = text } }
}

export async function act(action, id, ctx, el) {
  const {api, $, refresh} = ctx;
  if (action === 'mk-tools-mcp-add') {
    show($, '[data-tools-error="mcp"]');
    const kind = $('[data-tools-kind][aria-pressed="true"]')?.dataset.toolsKind || 'http';
    const tools = Object.fromEntries(AGENTS.map(([t]) => [t, Boolean($('[data-tools-for="mcp"][value="' + t + '"]')?.checked)]));
    const body = {action: 'add', kind, name: val($, '#tools-mcp-name'), for: tools};
    if (kind === 'http') {
      const how = $('#tools-mcp-header')?.value || 'bearer';
      Object.assign(body, {url: val($, '#tools-mcp-url'), key: val($, '#tools-mcp-key'), header: how === 'bearer' ? 'Authorization' : how === 'custom' ? val($, '#tools-mcp-custom') : 'x-api-key', bearer: how === 'bearer'});
    } else Object.assign(body, {command: val($, '#tools-mcp-command'), env: $('#tools-mcp-env')?.value || ''});
    try {
      const r = await busy(el, 'Adding…', () => api('tools/mcp', body));
      const failed = Object.entries(r.results || {}).filter(([, v]) => !v.ok && v.state !== 'not installed');
      if (failed.length) alert('Added, with a problem: ' + failed.map(([t, v]) => AGENTS.find(a => a[0] === t)[1] + ': ' + v.error).join(' · '));
      return refresh();
    } catch (e) { return show($, '[data-tools-error="mcp"]', e.message) }
  }
  if (action === 'mk-tools-mcp-toggle') {
    const [sid, tool, to] = String(id).split('|');
    try { await busy(el, '…', () => api('tools/mcp', {action: to === 'on' ? 'enable' : 'disable', id: sid, tool})); return refresh() }
    catch (e) { return show($, '[data-tools-row="' + sid + '"]', e.message) }
  }
  if (action === 'mk-tools-mcp-test') {
    try { await busy(el, 'Testing…', () => api('tools/mcp/test', {id})); return refresh() }
    catch (e) { return show($, '[data-tools-row="' + id + '"]', e.message) }
  }
  if (action === 'mk-tools-mcp-remove') {
    const name = $('[data-tools-server="' + id + '"] strong')?.textContent || 'this tool';
    if (!confirm('Remove ' + name + ' from Claude Code, Codex and Hermes Agent? Keys that only this tool used are removed too.')) return;
    try { await busy(el, 'Removing…', () => api('tools/mcp', {action: 'remove', id})); return refresh() }
    catch (e) { return show($, '[data-tools-row="' + id + '"]', e.message) }
  }
  if (action === 'mk-tools-vault-add') {
    show($, '[data-tools-error="vault"]');
    try { await busy(el, 'Saving…', () => api('tools/vault', {action: 'add', name: val($, '#tools-vault-name'), value: $('#tools-vault-value')?.value || ''})); return refresh() }
    catch (e) { return show($, '[data-tools-error="vault"]', e.message) }
  }
  if (action === 'mk-tools-vault-remove') {
    show($, '[data-tools-error="vault"]');
    if (!confirm('Remove ' + id + ' from your vault? Agent runs no longer get it.')) return;
    try { await busy(el, '…', () => api('tools/vault', {action: 'remove', name: id})); return refresh() }
    catch (e) { return show($, '[data-tools-error="vault"]', e.message) }
  }
  if (action === 'mk-tools-skill-add') {
    show($, '[data-tools-error="skill"]'); show($, '[data-tools-ok="skill"]');
    return pick('skill', {message: 'Choose a skill folder: the folder that holds its SKILL.md file.'}, async path => {
      if (!path) return;
      show($, '[data-tools-ok="skill"]', 'Copying the skill into your AI tools…');
      try {
        const r = await api('tools/skill', {action: 'add', path});
        const failed = Object.entries(r.results || {}).filter(([, v]) => !v.ok && v.state !== 'not installed');
        if (!Object.values(r.results || {}).some(v => v.state === 'on')) { show($, '[data-tools-ok="skill"]'); return show($, '[data-tools-error="skill"]', failed.map(([, v]) => v.error).join(' · ') || 'The skill was not added.') }
        if (failed.length) alert('Added, with a problem: ' + failed.map(([t, v]) => AGENTS.find(a => a[0] === t)[1] + ': ' + v.error).join(' · '));
        refresh();
      } catch (e) { show($, '[data-tools-ok="skill"]'); show($, '[data-tools-error="skill"]', e.message) }
    });
  }
  if (action === 'mk-tools-skill-remove') {
    if (!confirm('Remove the skill ' + id + ' from your AI tools? Only the copies added here are removed.')) return;
    try { await busy(el, 'Removing…', () => api('tools/skill', {action: 'remove', name: id})); return refresh() }
    catch (e) { return show($, '[data-tools-row="skill:' + id + '"]', e.message) }
  }
}
