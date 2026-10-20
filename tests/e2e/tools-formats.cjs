// A8 · Add tools, the settings files in every shape a student may have: no final newline, an empty or missing file,
// `mcp_servers: {}`, no mcp_servers at all, 4-space indents, comments, a .env of their own, and the unmarked blocks an
// earlier version wrote for Composio. For each: add two servers, check the files parse and keep what was there, remove
// them (in either order), and check every file is byte for byte as before. Fake home only.
//   node tests/e2e/tools-formats.cjs [appPort] [mockPort]      (defaults 4681 / 4680; not at the same time as tools.cjs)
const path = require('path'), fs = require('fs');
const {execFileSync} = require('child_process');

const SCENARIOS = [
  {name: 'no final newline anywhere', codex: 'model = "test"\n\n[mcp_servers.existing]\nurl = "https://example.com/mcp"', hermes: 'model:\n  default: test\nmcp_servers:\n  existing:\n    url: "https://example.com/mcp"', env: 'MY_OWN_KEY=abc'},
  {name: 'empty Codex file, Hermes with mcp_servers: {}', codex: '', hermes: 'mcp_servers: {}\nmodel:\n  default: test\n', env: null},
  {name: 'missing Codex file, Hermes without mcp_servers', codex: null, hermes: 'model:\n  default: test\n', env: null},
  {name: 'missing Hermes config (set up through .env only)', codex: 'model = "test"\n', hermes: null, env: 'OPENROUTER_API_KEY=or-test\n'},
  {name: '4-space indents, comments, another key after the servers', reverse: true,
   codex: '# my settings\nmodel = "test"\n\n[mcp_servers.existing]\nurl = "https://example.com/mcp"\n\n[mcp_servers.existing.env]\nA = "1"\n\n',
   hermes: '# my config\nmcp_servers:   # my servers\n    existing:\n        url: "https://example.com/mcp"\n\n# notes\nmodel:\n    default: test\n', env: '# keys\nexport MY_OWN_KEY="abc"\n'},
];

(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const YAML = (() => { try { return require(path.join(path.dirname(H.PLAYWRIGHT), 'yaml')) } catch { return null } })();
  const PY = ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', 'python3'].find(p => { try { execFileSync(p, ['-c', 'import tomllib'], {stdio: 'ignore'}); return true } catch { return false } });
  const parseToml = f => JSON.parse(execFileSync(PY, ['-c', 'import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))', f]).toString());
  const parseYaml = text => YAML ? YAML.parse(text) : null;
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'a8-tools-formats', port: Number(process.argv[2] || 4681), mockPort: Number(process.argv[3] || 4680)});
  const home = app.dirs.home;
  const F = {codex: path.join(home, '.codex/config.toml'), hermes: path.join(home, '.hermes/config.yaml'), env: path.join(home, '.hermes/.env')};
  const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  const put = (f, t) => { for (const b of [f, f + '.187n-backup']) fs.rmSync(b, {force: true}); if (t != null) { fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, t) } };
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok || !detail ? '' : ' · ' + String(detail).slice(0, 500))) };
  const call = (p, b, base = '/api/hq/v1/') => page.evaluate(async ([p, b, base]) => {
    const r = await fetch(base + p, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)});
    let body = null; try { body = await r.json() } catch {} return {status: r.status, body};
  }, [p, b, base]);
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(300);
    await H.setupViaAPI(page, app, {zernio: false, notes: false});
    for (const sc of SCENARIOS) {
      console.log('\n· ' + sc.name);
      put(F.codex, sc.codex); put(F.hermes, sc.hermes); put(F.env, sc.env);
      const a = await call('tools/mcp', {action: 'add', kind: 'http', name: 'Alpha', url: 'https://alpha.example.com/mcp', key: 'alpha-secret', header: 'x-api-key'});
      const b = await call('tools/mcp', {action: 'add', kind: 'stdio', name: 'Beta', command: 'uvx beta-mcp "two words"', env: [{name: 'BETA_TOKEN', value: 'beta secret with spaces $x'}]});
      check('both added everywhere', a.status === 200 && b.status === 200 && ['claude', 'codex', 'hermes'].every(t => a.body.results[t]?.ok && b.body.results[t]?.ok), JSON.stringify([a.body, b.body]));
      let toml = null; try { toml = parseToml(F.codex) } catch (e) { toml = e.message }
      check('Codex parses, both blocks there', toml?.mcp_servers?.['187n-alpha']?.http_headers?.['x-api-key'] === 'alpha-secret' && JSON.stringify(toml.mcp_servers['187n-beta']?.args) === '["beta-mcp","two words"]' && toml.mcp_servers['187n-beta'].env?.BETA_TOKEN === 'beta secret with spaces $x', JSON.stringify(toml) + '\n' + read(F.codex));
      if (sc.codex && sc.codex.includes('existing')) check('Codex keeps its own server', toml?.mcp_servers?.existing?.url === 'https://example.com/mcp' && (!sc.codex.includes('[mcp_servers.existing.env]') || toml.mcp_servers.existing.env?.A === '1'));
      let y = null; try { y = parseYaml(read(F.hermes)) } catch (e) { y = e.message }
      check('Hermes parses, both blocks there', y?.mcp_servers?.['187n-alpha']?.headers?.['x-api-key'] === '${MCP_ALPHA_KEY}' && y.mcp_servers['187n-beta']?.env?.BETA_TOKEN === '${BETA_TOKEN}', JSON.stringify(y) + '\n' + read(F.hermes));
      if (sc.hermes && sc.hermes.includes('existing')) check('Hermes keeps its own server and settings', y?.mcp_servers?.existing?.url === 'https://example.com/mcp' && y?.model?.default === 'test');
      if (sc.hermes && sc.hermes.includes('model')) check('Hermes keeps its model', y?.model?.default === 'test');
      const env = read(F.env) || '';
      check('.env has both keys (0600), and the student\'s lines', env.includes('MCP_ALPHA_KEY=alpha-secret') && /^BETA_TOKEN='beta secret with spaces \$x'$/m.test(env) && (fs.statSync(F.env).mode & 0o777) === 0o600 && (!sc.env || env.startsWith(sc.env.replace(/\n$/, ''))), env);
      for (const id of sc.reverse ? ['187n-beta', '187n-alpha'] : ['187n-alpha', '187n-beta']) { const r = await call('tools/mcp', {action: 'remove', id}); check('remove ' + id, r.status === 200, JSON.stringify(r.body)) }
      check('Codex byte-identical (or absent again)', read(F.codex) === sc.codex, JSON.stringify(read(F.codex)));
      check('Hermes config byte-identical (or absent again)', read(F.hermes) === sc.hermes, JSON.stringify(read(F.hermes)));
      check('.env byte-identical (or absent again)', read(F.env) === sc.env, JSON.stringify(read(F.env)));
    }

    console.log('\n· the student\'s own .env line under the same name');
    put(F.codex, 'model = "test"\n'); put(F.hermes, 'model:\n  default: test\n'); put(F.env, 'SHARED_TOKEN=theirs\n');
    const clash = await call('tools/mcp', {action: 'add', kind: 'stdio', name: 'Gamma', command: 'gamma-mcp', env: 'SHARED_TOKEN=mine'});
    check('another value is refused, nothing written', clash.status === 409 && read(F.codex) === 'model = "test"\n' && read(F.env) === 'SHARED_TOKEN=theirs\n', JSON.stringify(clash.body));
    const same = await call('tools/mcp', {action: 'add', kind: 'stdio', name: 'Gamma', command: 'gamma-mcp', env: 'SHARED_TOKEN=theirs'});
    check('the same value is used as it is', same.status === 200 && read(F.env) === 'SHARED_TOKEN=theirs\n', JSON.stringify(same.body));
    await call('tools/mcp', {action: 'remove', id: '187n-gamma'});
    check('their line stays after Remove', read(F.env) === 'SHARED_TOKEN=theirs\n' && read(F.hermes) === 'model:\n  default: test\n');
    await call('tools/vault', {action: 'remove', name: 'SHARED_TOKEN'});

    console.log('\n· vault key used by a server');
    const d = await call('tools/mcp', {action: 'add', kind: 'stdio', name: 'Delta', command: 'delta-mcp', env: 'DELTA_TOKEN=one'});
    const inUse = await call('tools/vault', {action: 'remove', name: 'DELTA_TOKEN'});
    check('a key a server uses cannot be removed', d.status === 200 && inUse.status === 409, JSON.stringify(inUse.body));
    const upd = await call('tools/vault', {action: 'add', name: 'DELTA_TOKEN', value: 'two'});
    let t2 = null; try { t2 = parseToml(F.codex) } catch {}
    check('a new value reaches the AI tools', upd.status === 200 && t2?.mcp_servers?.['187n-delta']?.env?.DELTA_TOKEN === 'two' && /^DELTA_TOKEN=two$/m.test(read(F.env) || ''), read(F.env));
    await call('tools/mcp', {action: 'remove', id: '187n-delta'});
    check('its key leaves the vault with it', !(await call('tools')).body.vault.some(k => k.name === 'DELTA_TOKEN'));

    console.log('\n· blocks an earlier version wrote for Composio (unmarked)');
    put(F.codex, 'model = "test"\n\n[mcp_servers.187n-apps]\nurl = "https://old.example.com/mcp"\nhttp_headers = { "x-api-key" = "old" }\nstartup_timeout_sec = 20\ntool_timeout_sec = 120\n');
    put(F.hermes, 'model:\n  default: test\nmcp_servers:\n  187n-apps:\n    url: "https://old.example.com/mcp"\n    headers:\n      x-api-key: "${COMPOSIO_MCP_API_KEY}"\n    enabled: true\n    timeout: 300\n  existing:\n    url: "https://example.com/mcp"\n');
    put(F.env, 'COMPOSIO_MCP_API_KEY=old\n');
    const on = await call('agents-apps', {enable: true}, '/api/student/');
    let t3 = null; try { t3 = parseToml(F.codex) } catch {}
    const y3 = parseYaml(read(F.hermes));
    check('enable replaces the old blocks', on.status === 200 && t3?.mcp_servers?.['187n-apps']?.http_headers?.['x-api-key'] === 'test-composio-key' && (read(F.codex).match(/\[mcp_servers\.187n-apps\]/g) || []).length === 1
      && y3?.mcp_servers?.existing?.url === 'https://example.com/mcp' && (read(F.hermes).match(/187n-apps:/g) || []).length === 1 && /^COMPOSIO_MCP_API_KEY=test-composio-key$/m.test(read(F.env)), JSON.stringify(on.body) + read(F.hermes));
    const off = await call('agents-apps', {enable: false}, '/api/student/');
    let t4 = null; try { t4 = parseToml(F.codex) } catch {}
    const y4 = parseYaml(read(F.hermes));
    check('disable takes them out, the rest stays', off.status === 200 && !read(F.codex).includes('187n-apps') && t4?.model === 'test' && !read(F.hermes).includes('187n-apps') && y4?.mcp_servers?.existing?.url === 'https://example.com/mcp' && !(read(F.env) || '').includes('COMPOSIO'), read(F.codex) + read(F.hermes) + read(F.env));
  } catch (e) { failed++; console.log('FAIL ' + e.stack) } finally {
    await browser.close(); await app.stop();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    if (!PY) console.log('note: no python3 with tomllib found; the Codex checks could not parse TOML');
    process.exitCode = failed || before !== after || !PY || !YAML ? 1 : 0;
    console.log(process.exitCode ? '\nA8 formats: FAILED (' + failed + ')' : '\nA8 formats: all checks passed');
  }
})();
