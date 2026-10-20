// Stand-in for Claude Code: auth status/login/logout, mcp add-json/remove, and -p runs in stream-json like the real CLI.
// `auth status` prints the real JSON shape (--json is the default; --text prints the human form) and exits 1 when
// signed out. ANTHROPIC_API_KEY in the environment counts as signed in with an API key, as in the real CLI.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {signedIn, setSignedIn, account, log, reply, sleep, arg} from './common.mjs';
const args = process.argv.slice(2); log('claude', args);
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
const envKey = Boolean(process.env.ANTHROPIC_API_KEY);
if (args[0] === '--version') { console.log('2.1.0 (Claude Code)'); process.exit(0) }
if (args[0] === 'auth') {
  if (args[1] === 'status') {
    const a = account('claude', {email: 'student@example.com', orgName: "Test Student's Organization", subscriptionType: 'max'});
    const s = signedIn('claude') ? {loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: a.email, orgId: '00000000-0000-4000-8000-000000000000', orgName: a.orgName, subscriptionType: a.subscriptionType}
      : envKey ? {loggedIn: true, authMethod: 'api_key', apiProvider: 'firstParty', apiKeySource: 'ANTHROPIC_API_KEY'} : {loggedIn: false, authMethod: 'none', apiProvider: 'firstParty'};
    if (args.includes('--text')) console.log(s.loggedIn ? ['Login: ' + (s.authMethod === 'api_key' ? 'API key' : 'Claude ' + s.subscriptionType + ' account'), s.orgName && 'Organization: ' + s.orgName, s.email && 'Email: ' + s.email].filter(Boolean).join('\n') : 'Not logged in. Run claude auth login to authenticate.');
    else console.log(JSON.stringify({...s, analyticsDisabled: false, projectsDirectory: '/tmp/claude-shim/projects', configDirectory: '/tmp/claude-shim'}, null, 2));
    process.exit(s.loggedIn ? 0 : 1);
  }
  if (args[1] === 'login') { setSignedIn('claude', true); console.log('Login successful.'); process.exit(0) }
  if (args[1] === 'logout') { setSignedIn('claude', false); console.log('Successfully logged out from your Anthropic account.'); process.exit(0) }
}
if (args[0] === 'mcp') {
  const f = (process.env.HQS_HOME_OVERRIDE || '/nonexistent') + '/.claude.json';
  const j = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  j.mcpServers ??= {};
  if (args[1] === 'add-json') { j.mcpServers[args[args.length - 2]] = JSON.parse(args[args.length - 1]); writeFileSync(f, JSON.stringify(j, null, 2)); console.log('Added MCP server ' + args[args.length - 2]); process.exit(0) }
  if (args[1] === 'remove') { const name = args[args.length - 1]; delete j.mcpServers[name]; writeFileSync(f, JSON.stringify(j, null, 2)); process.exit(0) }
  if (args[1] === 'list') { console.log(Object.keys(j.mcpServers).join('\n')); process.exit(0) }
}
if (!signedIn('claude') && !envKey) { out({type: 'result', subtype: 'error', is_error: true, result: 'Not logged in · Please run /login'}); process.exit(1) }
const prompt = arg(args, '-p') || '', schema = arg(args, '--json-schema');
const text = reply(prompt, 'Done. I read the folder and wrote a plan for: ' + prompt.slice(0, 40));
out({type: 'system', subtype: 'init', session_id: 'sess-claude-1'});
if (!args.includes('--disallowedTools')) out({type: 'assistant', message: {content: [{type: 'tool_use', name: 'Read', input: {}}]}});
for (const w of text.match(/.{1,24}/gs) || []) { out({type: 'stream_event', event: {type: 'content_block_delta', delta: {type: 'text_delta', text: w}}}); await sleep(40) }
const result = {type: 'result', subtype: 'success', is_error: false, result: text, session_id: 'sess-claude-1', usage: {input_tokens: 1200, cache_read_input_tokens: 300, output_tokens: 240}};
if (schema) { try { result.structured_output = JSON.parse(text) } catch {} }
out(result);
