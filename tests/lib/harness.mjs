// Test harness: one isolated test copy of the app (its own port, data folder, Keychain entry and fake home), the
// local service stand-ins, and the CLI stand-ins. Nothing touches the owner's real AI-tool configuration, the live
// office or a paid service.
//   const app = await launch({name: 'sweep', port: 4591, mockPort: 4590}); …; await app.stop()
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, chmodSync, statSync, readdirSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {tmpdir, homedir} from 'node:os';
import {createHash} from 'node:crypto';

export const ROOT = resolve(import.meta.dirname, '../..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Playwright: HQ_PLAYWRIGHT, this project's node_modules, or the Hermes default (build-tools/tools.cjs).
export const PLAYWRIGHT = (await import('../../build-tools/tools.cjs')).default.locate('playwright');

export async function startMock(port) {
  try { const r = await fetch('http://127.0.0.1:' + port + '/__paid'); if (r.ok) return {port, stop() {}} } catch {}
  const child = spawn(process.execPath, [join(ROOT, 'tests/mock/index.mjs'), String(port)], {stdio: ['ignore', 'pipe', 'inherit']});
  for (let i = 0; i < 50; i++) { await sleep(100); try { if ((await fetch('http://127.0.0.1:' + port + '/__paid')).ok) break } catch {} }
  return {port, stop() { child.kill() }};
}

// The owner's real AI-tool configuration, fingerprinted: a test fails if any of it changes.
const OWNER = ['.claude.json', '.claude/CLAUDE.md', '.claude/settings.json', '.codex/config.toml', '.codex/AGENTS.md', '.hermes/config.yaml', '.hermes/.env', '.hermes/SOUL.md'];
const SKILL_DIRS = ['.claude/skills', '.codex/skills', '.agents/skills', '.hermes/skills'];
export function ownerSnapshot() {
  const h = createHash('sha256');
  for (const f of OWNER) {
    const p = join(homedir(), f);
    // ~/.claude.json is rewritten all the time by running Claude Code sessions; only its MCP servers matter here.
    const body = !existsSync(p) ? '-' : f === '.claude.json' ? JSON.stringify((() => { try { return JSON.parse(readFileSync(p, 'utf8')).mcpServers || {} } catch { return 'unreadable' } })()) : readFileSync(p);
    h.update(f + ':' + createHash('sha256').update(body).digest('hex') + '\n');
  }
  for (const d of SKILL_DIRS) { const p = join(homedir(), d); h.update(d + ':' + (existsSync(p) ? readdirSync(p).sort().join(',') : '-') + '\n') }
  return h.digest('hex');
}

export function licence(name = 'Test Student') {
  return execFileSync(process.execPath, [join(ROOT, 'license/issue.mjs'), '--name', name, '--email', 'student@example.com', '--months', '12']).toString().trim().split('\n')[0];
}

// Writes executable wrappers for the Node stand-ins (the app runs them as `claude`, `codex`, `hermes`).
function shims(dir, only) {
  mkdirSync(dir, {recursive: true});
  for (const t of only) {
    const f = join(dir, t);
    writeFileSync(f, '#!/bin/sh\nexec "' + process.execPath + '" "' + join(ROOT, 'tests/shims', t + '.mjs') + '" "$@"\n'); chmodSync(f, 0o755);
  }
}

export async function launch({name = 'test', port = 4591, mockPort = 4590, runtimes = ['claude', 'codex', 'hermes'], signedIn = {}, env = {}, app} = {}) {
  const dir = join(tmpdir(), 'hqs-runs', name);
  rmSync(dir, {recursive: true, force: true});
  const d = {dir, support: join(dir, 'support'), home: join(dir, 'home'), bin: join(dir, 'bin'), state: join(dir, 'shim-state'), files: join(dir, 'files'), shots: join(dir, 'shots')};
  for (const p of Object.values(d)) mkdirSync(p, {recursive: true});
  // A fake home with set-up AI tools (Hermes counts as set up when its config exists).
  for (const [f, t] of [['.hermes/config.yaml', 'model:\n  default: test\nmcp_servers:\n  existing:\n    url: "https://example.com/mcp"\n'], ['.codex/config.toml', 'model = "test"\n\n[mcp_servers.existing]\nurl = "https://example.com/mcp"\n'], ['.claude.json', '{"mcpServers":{}}\n']]) {
    mkdirSync(join(d.home, f, '..'), {recursive: true}); writeFileSync(join(d.home, f), t);
  }
  cpSync(join(ROOT, 'tests/fixtures/base'), d.files, {recursive: true}); mkdirSync(join(d.files, 'workspace'), {recursive: true});
  shims(d.bin, runtimes);
  for (const [t, v] of Object.entries(signedIn)) writeFileSync(join(d.state, 'auth-' + t), v ? 'in' : 'out');
  const mock = await startMock(mockPort), base = 'http://127.0.0.1:' + mockPort;
  const service = 'ai.187n.agent-hq.student.test.' + name + '.keys';
  const dropKeychain = () => { try { execFileSync('security', ['delete-generic-password', '-s', service, '-a', 'keys'], {stdio: 'ignore'}) } catch {} };
  dropKeychain();
  // HQ_TEST_APP runs another engine with the same checks, e.g. the Windows edition's Electron test build:
  // HQ_TEST_APP='["<electron>", "<…/agent-hq-student-windows/dist-test/app>"]'
  const cmd = process.env.HQ_TEST_APP ? JSON.parse(process.env.HQ_TEST_APP) : [app || join(ROOT, 'build/187N Agent HQ Test.app/Contents/MacOS/AgentHQ')];
  const exe = cmd[0];
  if (!existsSync(exe)) throw new Error('Build the test app first: sh build.sh --test');
  const tokenFile = join(dir, 'token');
  // -ApplePersistenceIgnoreState: no "reopen windows?" prompt after an earlier test quit the app.
  const child = spawn(exe, [...cmd.slice(1), '-ApplePersistenceIgnoreState', 'YES'], {stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, HQS_TEST_PORT: String(port), HQS_TEST_TOKEN_FILE: tokenFile, HQS_SUPPORT_DIR: d.support, HQS_KEYCHAIN_SERVICE: service,
    HQS_HOME_OVERRIDE: d.home, HQS_EXTRA_PATH: d.bin, HQS_SHIM_STATE: d.state, HQS_NO_TERMINAL: '1', HQS_HEADLESS: process.env.HQS_SHOW ? '' : '1',
    // Every service the app can reach points at the stand-ins (Net.base("<NAME>") reads HQS_<NAME>_BASE in test builds).
    HQS_COMPOSIO_BASE: base + '/composio', HQS_ZERNIO_BASE: base + '/zernio', HQS_APIFY_BASE: base + '/apify/v2',
    HQS_ELEVENLABS_BASE: base + '/elevenlabs', HQS_ELEVENLABS_WS_BASE: base.replace('http:', 'ws:') + '/elevenlabs', HQS_GROQ_BASE: base + '/groq/openai/v1',
    HQS_GITHUB_BASE: base + '/github', HQS_HN_BASE: base + '/hn/api/v1', HQS_HF_BASE: base + '/hf/api', HQS_OPENAI_NEWS_BASE: base + '/rss/openai-news.xml', HQS_TYPESAFE_BASE: base + '/typesafe',
    HQS_SELFTEST_FILE: join(dir, 'selftest.json'), ...env}});
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  for (let i = 0; i < 100 && !existsSync(tokenFile); i++) await sleep(100);
  if (!existsSync(tokenFile)) { child.kill(); throw new Error('The test app did not start:\n' + log.slice(-2000)) }
  const token = readFileSync(tokenFile, 'utf8').trim(), url = 'http://127.0.0.1:' + port;
  return {name, url, token, launchURL: url + '/launch?t=' + token, mockURL: base, dirs: d, licence: licence(), log: () => log, keychainService: service,
    calls: () => existsSync(join(d.state, 'calls.log')) ? readFileSync(join(d.state, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [],
    async stop() { child.kill(); await sleep(300); dropKeychain(); mock.stop() }};
}

// Setup through the app's own API, as the wizard does (licence, agents, folders, Composio and Zernio stand-ins).
export async function setupViaAPI(page, app, {composio = true, zernio = true, notes = true} = {}) {
  return page.evaluate(async ({lic, files, composio, zernio, notes}) => {
    const post = (p, b) => fetch('/api/student/' + p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}).then(async r => ({status: r.status, body: await r.json().catch(() => null)}));
    const out = {licence: await post('license', {key: lic})};
    out.agents = await post('agents', {agents: []});
    out.folders = await post('folders', {workspace: files + '/workspace', ...(notes ? {notesFolder: files + '/notes'} : {}), proposalsFolder: files + '/proposals', handbookFolder: files + '/playbooks', currency: 'EUR'});
    if (composio) out.composio = await post('composio/key', {key: 'test-composio-key'});
    if (zernio) out.zernio = await post('zernio/key', {key: 'test-zernio-key'});
    out.finish = await post('finish', {});
    return out;
  }, {lic: app.licence, files: app.dirs.files, composio, zernio, notes});
}
