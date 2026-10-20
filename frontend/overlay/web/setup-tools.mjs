// Setup step "More tools" (after Apps): connect any other tool. A compact version of Agents & Setup › Setup › Add
// tools: an MCP server by its web address, a named key for the vault, and a skill folder. Optional and skippable.
import {$, esc, hq, status, pick} from './setup-kit.mjs';

let data = null;   // the last answer of GET tools (read when the step opens)
const count = d => (d?.servers?.length || 0) + (d?.vault?.length || 0) + (d?.skills?.length || 0);
const NAMES = {claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes'};

function added(d) {
  const rows = [
    ...(d.servers || []).map(s => [s.name, 'MCP server · ' + (Object.entries(s.status || {}).filter(([, v]) => v === 'on').map(([k]) => NAMES[k]).join(', ') || 'off')]),
    ...(d.vault || []).map(k => [k.name, 'Key in your vault']),
    ...(d.skills || []).map(s => [s.name, 'Skill · ' + (Object.entries(s.status || {}).filter(([, v]) => v === 'on').map(([k]) => NAMES[k]).join(', ') || 'off')]),
  ];
  if (!rows.length) return '';
  return '<section class="card"><h3>Added</h3>' + rows.map(([a, b]) => '<div class="row" style="margin-top:8px"><span>' + esc(a) + '</span><span class="muted">' + esc(b) + '</span></div>').join('')
    + '<p class="muted" style="margin-top:10px">Change or remove them later in Agents &amp; Setup › Setup › Add tools.</p></section>';
}

async function load() {
  try { data = await hq('tools'); const host = $('#tools-added'); if (host) host.innerHTML = added(data) } catch {}
}

export default {
  id: 'tools', label: 'More tools', after: 'apps',
  // Setup's state may carry {tools: {added}} (ToolsAPI.summary); otherwise the count from opening this step.
  done: state => (data ? count(data) : state?.tools?.added || 0) > 0,
  summary: state => { const n = data ? count(data) : state?.tools?.added || 0; return ['More tools', n ? n + ' added' : 'None yet (optional)'] },
  view: kit => '<p class="eyebrow">More tools</p><h1>Connect any other tool</h1>'
    + '<p class="lead">Most new AI tools come with an MCP server: paste its address and Claude Code, Codex and Hermes can use the tool. You can also save named API keys for your agents, and add skill folders. All optional; you can do this later in Agents &amp; Setup › Setup › Add tools.</p>'
    + '<section class="card"><div class="row"><h3>An MCP server</h3><span class="pill off">Optional</span></div><p>Paste the MCP address from the tool’s docs. Add its key if the docs give you one.</p>'
    + '<label class="field">Name<input type="text" id="st-mcp-name" maxlength="60" autocomplete="off" placeholder="For example: Linear"></label>'
    + '<label class="field">MCP address<input type="text" inputmode="url" id="st-mcp-url" spellcheck="false" autocomplete="off" placeholder="https://mcp.example.com/mcp"></label>'
    + '<label class="field">Key (optional)<input type="password" id="st-mcp-key" spellcheck="false" autocomplete="off" placeholder="Sent as Authorization: Bearer …"></label>'
    + '<div class="actions"><button type="button" class="btn primary" id="st-mcp-add">Add to my agents</button></div><p class="status" id="st-mcp-status"></p></section>'
    + '<section class="card"><div class="row"><h3>A named key</h3><span class="pill off">Optional</span></div><p>Every agent run gets the keys in your vault as environment variables, for example ELEVENLABS_API_KEY.</p>'
    + '<label class="field">Name<input type="text" id="st-vault-name" spellcheck="false" autocomplete="off" placeholder="ELEVENLABS_API_KEY"></label>'
    + '<label class="field">Value<input type="password" id="st-vault-value" spellcheck="false" autocomplete="off" placeholder="Paste the key"></label>'
    + '<div class="actions"><button type="button" class="btn primary" id="st-vault-add">Save key</button></div><p class="status" id="st-vault-status"></p></section>'
    + '<section class="card"><div class="row"><h3>A skill folder</h3><span class="pill off">Optional</span></div><p>A folder with a SKILL.md file: steps your agents follow for one job. It is copied into each AI tool’s skills folder.</p>'
    + '<div class="actions"><button type="button" class="btn" id="st-skill-add">Choose a skill folder…</button></div><p class="status" id="st-skill-status"></p></section>'
    + '<div id="tools-added"></div>' + kit.footer('tools'),
  bind(kit) {
    load();
    const after = async (s, text) => { await load(); status(s, text, 'ok') };
    $('#st-mcp-add')?.addEventListener('click', async e => {
      const s = $('#st-mcp-status'); e.target.disabled = true; status(s, 'Adding it to your AI tools…');
      try {
        const r = await hq('tools/mcp', {action: 'add', kind: 'http', name: $('#st-mcp-name').value.trim(), url: $('#st-mcp-url').value.trim(), key: $('#st-mcp-key').value.trim(), header: 'Authorization', bearer: true});
        ['#st-mcp-name', '#st-mcp-url', '#st-mcp-key'].forEach(id => $(id).value = '');
        const lines = Object.keys(NAMES).map(k => [k, (r.results || {})[k]]).filter(([, v]) => v && v.state !== 'not installed').map(([k, v]) => NAMES[k] + ': ' + (v.ok ? 'added' : v.error));
        await after(s, lines.join(' · ') || 'Saved. Install an AI tool to use it.');
      } catch (err) { status(s, err.message, 'err') } finally { e.target.disabled = false }
    });
    $('#st-vault-name')?.addEventListener('input', e => { const up = e.target.value.toUpperCase().replace(/[\s-]+/g, '_'); if (up !== e.target.value) e.target.value = up });
    $('#st-vault-add')?.addEventListener('click', async e => {
      const s = $('#st-vault-status'); e.target.disabled = true;
      try {
        await hq('tools/vault', {action: 'add', name: $('#st-vault-name').value.trim(), value: $('#st-vault-value').value});
        $('#st-vault-name').value = ''; $('#st-vault-value').value = ''; await after(s, 'Saved in your Keychain.');
      } catch (err) { status(s, err.message, 'err') } finally { e.target.disabled = false }
    });
    $('#st-skill-add')?.addEventListener('click', () => pick('skill', {message: 'Choose a skill folder: the folder that holds its SKILL.md file.'}, async path => {
      const s = $('#st-skill-status'); if (!path) return; status(s, 'Copying the skill into your AI tools…');
      try {
        const r = await hq('tools/skill', {action: 'add', path});
        const on = Object.keys(NAMES).filter(k => r.results?.[k]?.state === 'on').map(k => NAMES[k]);
        const bad = Object.values(r.results || {}).filter(v => !v.ok && v.state !== 'not installed').map(v => v.error);
        if (!on.length) return status(s, bad.join(' · ') || 'The skill was not added.', 'err');
        await after(s, 'Added ' + r.skill.name + ' to ' + on.join(', ') + '.' + (bad.length ? ' ' + bad.join(' · ') : ''));
      } catch (err) { status(s, err.message, 'err') }
    }));
  },
};
