// A8 · Add tools: MCP servers (a web address with a key, and a command) written into Claude Code, Codex and Hermes
// Agent at once; Remove brings every file back byte for byte; the key vault reaches agent runs; skill folders are
// copied with a marker and only marked copies are removed; "Give my agents my apps" still works; the pages work with
// real clicks. Everything happens in the test's fake home; the owner's configuration is fingerprinted before and after.
//   node tests/e2e/tools.cjs [appPort] [mockPort]      (defaults 4681 / 4680)
const path = require('path'), fs = require('fs'), http = require('http');
const {execFileSync} = require('child_process');
const AGENTS = ['claude', 'codex', 'hermes'];

(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const YAML = (() => { try { return require(path.join(path.dirname(H.PLAYWRIGHT), 'yaml')) } catch { return null } })();
  const PY = ['/opt/homebrew/bin/python3', '/usr/local/bin/python3', 'python3'].find(p => { try { execFileSync(p, ['-c', 'import tomllib'], {stdio: 'ignore'}); return true } catch { return false } });
  const parseToml = f => JSON.parse(execFileSync(PY, ['-c', 'import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb"))))', f]).toString());
  const parseYaml = f => YAML ? YAML.parse(fs.readFileSync(f, 'utf8')) : JSON.parse(execFileSync('/usr/bin/python3', ['-c', 'import yaml,json,sys;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))', f]).toString());
  const before = H.ownerSnapshot();
  const rnd = () => Math.random().toString(36).slice(2, 10);
  const SECRET = {http: 'a8-http-' + rnd(), env: 'a8-env-' + rnd(), vault: 'a8-vault-' + rnd(), ui: 'a8-ui-' + rnd(), uiVault: 'a8-uivault-' + rnd(), setup: 'a8-setup-' + rnd()};

  // A small MCP server stand-in: answers "initialize" when the right key arrives.
  const seen = [];
  const mcp = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      seen.push({auth: req.headers.authorization || '', body: b});
      let j = {}; try { j = JSON.parse(b) } catch {}
      if (!Object.values(SECRET).some(s => req.headers.authorization === 'Bearer ' + s)) { res.writeHead(401, {'Content-Type': 'application/json'}); return res.end('{"error":"unauthorized"}') }
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({jsonrpc: '2.0', id: j.id ?? 1, result: {protocolVersion: '2025-06-18', capabilities: {}, serverInfo: {name: 'a8-stand-in', version: '1'}}}));
    });
  });
  await new Promise(r => mcp.listen(0, '127.0.0.1', r));
  const mcpURL = 'http://127.0.0.1:' + mcp.address().port + '/mcp';

  const app = await H.launch({name: 'a8-tools', port: Number(process.argv[2] || 4681), mockPort: Number(process.argv[3] || 4680), env: {HQS_SHIM_LOG_ENV: 'A8_TEST_KEY'}});
  const home = app.dirs.home;
  const F = {claude: path.join(home, '.claude.json'), codex: path.join(home, '.codex/config.toml'), hermes: path.join(home, '.hermes/config.yaml'), env: path.join(home, '.hermes/.env')};
  const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  const original = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, read(f)]));
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = [], bodies = []; let where = 'start', answer = '', apiChecks = true;
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  // The API checks ask for refusals on purpose (4xx); the browser logs those, so they only count on the pages.
  page.on('console', m => m.type() === 'error' && !(apiChecks && /status of 4\d\d/.test(m.text())) && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  page.on('response', async r => { const p = new URL(r.url()).pathname; if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + p); if (p.startsWith('/api/')) { try { bodies.push(await r.text()) } catch {} } });
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(answer) : d.accept());
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok || !detail ? '' : ' · ' + String(detail).slice(0, 400))) };
  const call = (p, b) => page.evaluate(async ([p, b]) => {
    const r = await fetch('/api/hq/v1/' + p, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)});
    const text = await r.text(); let body = null; try { body = JSON.parse(text) } catch {} return {status: r.status, body};
  }, [p, b]);
  const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { try { if (await fn()) return true } catch {} await new Promise(r => setTimeout(r, 200)) } return false };
  const claudeServers = () => JSON.parse(read(F.claude)).mcpServers || {};

  try {
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    const s = await H.setupViaAPI(page, app);
    check('setup through the API', s.licence.status === 200 && s.finish.status === 200, JSON.stringify(s));

    // 1 · MCP servers ------------------------------------------------------------------------------------------------
    where = 'mcp';
    const a = await call('tools/mcp', {action: 'add', kind: 'http', name: 'Docs Search', url: mcpURL, key: SECRET.http, header: 'Authorization', bearer: true});
    check('add a web-address server with a key', a.status === 200 && AGENTS.every(t => a.body.results[t]?.ok), JSON.stringify(a.body));
    const b = await call('tools/mcp', {action: 'add', kind: 'stdio', name: 'Git Helper', command: 'npx -y @example/git-helper --verbose', env: 'GIT_HELPER_TOKEN=' + SECRET.env});
    check('add a command server with a key', b.status === 200 && AGENTS.every(t => b.body.results[t]?.ok), JSON.stringify(b.body));

    const cj = claudeServers();
    check('Claude Code: http entry in .claude.json', cj['187n-docs-search']?.type === 'http' && cj['187n-docs-search'].url === mcpURL && cj['187n-docs-search'].headers?.Authorization === 'Bearer ' + SECRET.http, JSON.stringify(cj['187n-docs-search']));
    check('Claude Code: stdio entry in .claude.json', cj['187n-git-helper']?.type === 'stdio' && cj['187n-git-helper'].command === 'npx' && JSON.stringify(cj['187n-git-helper'].args) === '["-y","@example/git-helper","--verbose"]' && cj['187n-git-helper'].env?.GIT_HELPER_TOKEN === SECRET.env, JSON.stringify(cj['187n-git-helper']));

    let toml = null; try { toml = PY ? parseToml(F.codex) : null } catch (e) { toml = null }
    check('Codex: config.toml parses with tomllib', Boolean(toml), PY ? read(F.codex) : 'no python3 with tomllib on this Mac');
    const cs = toml?.mcp_servers || {};
    check('Codex: existing entry and settings kept', cs.existing?.url === 'https://example.com/mcp' && toml?.model === 'test');
    check('Codex: http block (url + http_headers)', cs['187n-docs-search']?.url === mcpURL && cs['187n-docs-search'].http_headers?.Authorization === 'Bearer ' + SECRET.http, JSON.stringify(cs['187n-docs-search']));
    check('Codex: stdio block (command, args, env)', cs['187n-git-helper']?.command === 'npx' && (cs['187n-git-helper'].args || []).join(' ') === '-y @example/git-helper --verbose' && cs['187n-git-helper'].env?.GIT_HELPER_TOKEN === SECRET.env, JSON.stringify(cs['187n-git-helper']));

    const yamlText = read(F.hermes); let y = null; try { y = parseYaml(F.hermes) } catch (e) { y = null }
    check('Hermes: config.yaml parses', y && typeof y === 'object', yamlText);
    check('Hermes: existing entry and settings kept', y?.mcp_servers?.existing?.url === 'https://example.com/mcp' && y?.model?.default === 'test');
    check('Hermes: http block refers to ${VAR}', y?.mcp_servers?.['187n-docs-search']?.url === mcpURL && y.mcp_servers['187n-docs-search'].headers?.Authorization === 'Bearer ${MCP_DOCS_SEARCH_KEY}', JSON.stringify(y?.mcp_servers?.['187n-docs-search']));
    check('Hermes: stdio block refers to ${VAR}', y?.mcp_servers?.['187n-git-helper']?.command === 'npx' && y.mcp_servers['187n-git-helper'].env?.GIT_HELPER_TOKEN === '${GIT_HELPER_TOKEN}', JSON.stringify(y?.mcp_servers?.['187n-git-helper']));
    check('Hermes: no secret in config.yaml', !yamlText.includes(SECRET.http) && !yamlText.includes(SECRET.env));
    const envText = read(F.env) || '', mode = fs.existsSync(F.env) ? (fs.statSync(F.env).mode & 0o777).toString(8) : '-';
    check('Hermes: secrets only in .env, mode 0600', envText.includes('MCP_DOCS_SEARCH_KEY=' + SECRET.http) && envText.includes('GIT_HELPER_TOKEN=' + SECRET.env) && mode === '600', mode + ' ' + envText.replace(/=.*/g, '=…'));
    check('backups made once, before the first change', read(F.codex + '.187n-backup') === original.codex && read(F.hermes + '.187n-backup') === original.hermes);

    const g = await call('tools');
    check('GET tools: both servers on in every AI tool', g.body?.servers?.length === 2 && g.body.servers.every(x => AGENTS.every(t => x.status[t] === 'on')), JSON.stringify(g.body?.servers?.map(x => x.status)));
    check('GET tools: found list marks them managed', (g.body?.found || []).every(t => (t.mcp || []).filter(m => m.name.startsWith('187n-')).every(m => m.managed)) && (g.body?.found || []).some(t => (t.mcp || []).some(m => m.name === 'existing' && !m.managed)));

    const t1 = await call('tools/mcp/test', {id: '187n-docs-search'});
    check('Test: MCP initialize works', t1.body?.ok === true && /a8-stand-in/.test(t1.body.message), JSON.stringify(t1.body));
    check('Test: the key went to the address entered, as a Bearer header', seen.some(x => x.auth === 'Bearer ' + SECRET.http && /"initialize"/.test(x.body)));
    const t2 = await call('tools/mcp/test', {id: '187n-git-helper'});
    check('Test: a command server gets a plain answer', t2.status === 200 && typeof t2.body?.message === 'string', JSON.stringify(t2.body));

    const off = await call('tools/mcp', {action: 'disable', id: '187n-docs-search', tool: 'codex'});
    check('turn off for Codex only', off.body?.server?.status?.codex === 'off' && !read(F.codex).includes('187n-docs-search') && Boolean(claudeServers()['187n-docs-search']) && read(F.hermes).includes('187n-docs-search'), JSON.stringify(off.body?.server?.status));
    const on = await call('tools/mcp', {action: 'enable', id: '187n-docs-search', tool: 'codex'});
    check('turn on for Codex again', on.body?.server?.status?.codex === 'on', JSON.stringify(on.body?.server?.status));
    const dup = await call('tools/mcp', {action: 'add', kind: 'http', name: 'Docs Search', url: mcpURL});
    check('the same name twice is refused', dup.status === 409, JSON.stringify(dup.body));
    const badURL = await call('tools/mcp', {action: 'add', kind: 'http', name: 'Bad', url: 'not an address'});
    check('an address that is not http(s) is refused', badURL.status === 422);

    for (const id of ['187n-docs-search', '187n-git-helper']) { const r = await call('tools/mcp', {action: 'remove', id}); check('Remove ' + id, r.status === 200 && r.body.removed === true, JSON.stringify(r.body)) }
    check('Claude Code: entries gone', !Object.keys(claudeServers()).some(k => k.startsWith('187n-')), JSON.stringify(claudeServers()));
    check('Codex: config.toml byte-identical after Remove', read(F.codex) === original.codex, JSON.stringify(read(F.codex)));
    check('Hermes: config.yaml byte-identical after Remove', read(F.hermes) === original.hermes, JSON.stringify(read(F.hermes)));
    check('Hermes: .env as before (it did not exist)', read(F.env) === original.env, JSON.stringify(read(F.env)));
    check('keys that came with the servers left the vault', !(await call('tools')).body.vault.some(k => ['MCP_DOCS_SEARCH_KEY', 'GIT_HELPER_TOKEN'].includes(k.name)));

    fs.appendFileSync(F.codex, '\n[mcp_servers.187n-mine]\nurl = "https://example.com/other"\n');
    const foreign = await call('tools/mcp', {action: 'add', kind: 'http', name: 'Mine', url: mcpURL});
    check('a name that exists unmanaged in Codex is refused', foreign.status === 409 && /Codex already has/.test(foreign.body?.error?.message || ''), JSON.stringify(foreign.body));
    fs.writeFileSync(F.codex, original.codex);

    // 2 · Key vault --------------------------------------------------------------------------------------------------
    where = 'vault';
    const v1 = await call('tools/vault', {action: 'add', name: 'A8_TEST_KEY', value: SECRET.vault});
    check('vault: key saved, its name listed', v1.status === 200 && v1.body.vault.some(k => k.name === 'A8_TEST_KEY'), JSON.stringify(v1.body));
    for (const bad of ['PATH', 'HOME', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DYLD_INSERT_LIBRARIES', 'lower_case', 'X']) {
      const r = await call('tools/vault', {action: 'add', name: bad, value: 'x'}); check('vault refuses ' + bad, r.status === 422, JSON.stringify(r.body));
    }
    const nCalls = app.calls().length;
    const task = await call('tasks', {title: 'Vault check', prompt: 'Say hello', profile: 'chief'});
    const isRun = c => c.args.includes('-p') || c.args[0] === 'exec' || c.args.includes('-z');
    await until(() => app.calls().slice(nCalls).some(isRun));
    const run = app.calls().slice(nCalls).find(isRun);
    check('an agent run gets the vault key as an environment variable', task.status === 200 && run?.values?.A8_TEST_KEY === SECRET.vault && run.env.includes('A8_TEST_KEY'), JSON.stringify({tool: run?.tool, values: run?.values}));
    const v2 = await call('tools/vault', {action: 'remove', name: 'A8_TEST_KEY'});
    check('vault: key removed', v2.status === 200 && !v2.body.vault.some(k => k.name === 'A8_TEST_KEY'));

    // 3 · Skill folders ------------------------------------------------------------------------------------------------
    where = 'skills';
    const src = path.join(app.dirs.dir, 'skill-src', 'hello-helper');
    fs.cpSync(path.join(H.ROOT, 'tests/fixtures/tools/skills/hello-helper'), src, {recursive: true});
    fs.symlinkSync(path.join(H.ROOT, 'tests/README.md'), path.join(src, 'linked.md'));   // never copied
    const DIRS = {claude: path.join(home, '.claude/skills'), codex: path.join(home, '.agents/skills'), hermes: path.join(home, '.hermes/skills')};
    for (const d of Object.values(DIRS)) { fs.mkdirSync(path.join(d, 'keep-me'), {recursive: true}); fs.writeFileSync(path.join(d, 'keep-me/SKILL.md'), '---\nname: keep-me\ndescription: The student\'s own skill.\n---\nMine.\n') }
    const sk = await call('tools/skill', {action: 'add', path: src});
    check('skill: copied into all three AI tools', sk.status === 200 && AGENTS.every(t => sk.body.results[t]?.state === 'on'), JSON.stringify(sk.body));
    for (const [t, d] of Object.entries(DIRS)) {
      const dest = path.join(d, 'hello-helper');
      check('skill: ' + t + ' copy has SKILL.md, sub-folder and marker, no symlink', fs.existsSync(path.join(dest, 'SKILL.md')) && fs.existsSync(path.join(dest, 'reference/checklist.md')) && fs.existsSync(path.join(dest, '.187n-installed')) && !fs.existsSync(path.join(dest, 'linked.md')));
    }
    const inst = await call('skills/installed');
    check('Skills & tools: added skill managed, own skill found', inst.body.tools.every(t => t.skills.some(x => x.name === 'hello-helper' && x.managed) && t.skills.some(x => x.name === 'keep-me' && !x.managed)), JSON.stringify(inst.body.tools.map(t => t.skills)));
    const skr = await call('tools/skill', {action: 'remove', name: 'hello-helper'});
    check('skill: Remove deletes only the marked copies', skr.status === 200 && Object.values(DIRS).every(d => !fs.existsSync(path.join(d, 'hello-helper')) && fs.existsSync(path.join(d, 'keep-me/SKILL.md'))));
    fs.mkdirSync(path.join(DIRS.hermes, 'hello-helper'), {recursive: true}); fs.writeFileSync(path.join(DIRS.hermes, 'hello-helper/SKILL.md'), '---\nname: hello-helper\n---\nTheirs.\n');
    const sk2 = await call('tools/skill', {action: 'add', path: src});
    check('skill: a same-named unmarked skill in Hermes is left alone', sk2.body?.results?.hermes?.ok === false && sk2.body.results.claude?.state === 'on' && sk2.body.results.codex?.state === 'on', JSON.stringify(sk2.body?.results));
    await call('tools/skill', {action: 'remove', name: 'hello-helper'});
    check('skill: the student\'s own copy survives Remove', read(path.join(DIRS.hermes, 'hello-helper/SKILL.md'))?.includes('Theirs.') && !fs.existsSync(path.join(DIRS.claude, 'hello-helper')));
    fs.rmSync(path.join(DIRS.hermes, 'hello-helper'), {recursive: true});
    const nos = await call('tools/skill', {action: 'add', path: path.dirname(src)});
    check('skill: a folder without SKILL.md is refused', nos.status === 422, JSON.stringify(nos.body));

    // 4 · Composio: the existing Setup › Apps button ------------------------------------------------------------------
    where = 'setup › apps';
    apiChecks = false;
    const open = async url => { await page.goto('about:blank'); await page.goto(url) };   // a fresh load, not a hash change
    await open(app.url + '/setup#apps'); await page.waitForSelector('#agentapps', {timeout: 15000});
    await page.click('#agentapps');
    await until(async () => /done/.test(await page.textContent('#aastatus')), 25000);
    const aaText = await page.textContent('#aastatus');
    check('Give my agents my apps: done in all three', /Claude Code: done/.test(aaText) && /Codex: done/.test(aaText) && /Hermes: done/.test(aaText), aaText);
    const capps = claudeServers()['187n-apps'];
    check('Composio: Claude Code entry with x-api-key', capps?.headers?.['x-api-key'] === 'test-composio-key' && /\/composio-mcp\/trs_test1$/.test(capps.url), JSON.stringify(capps));
    let toml2 = null; try { toml2 = PY ? parseToml(F.codex) : null } catch {}
    check('Composio: Codex block (TOML parses)', toml2?.mcp_servers?.['187n-apps']?.http_headers?.['x-api-key'] === 'test-composio-key' && toml2.mcp_servers.existing?.url === 'https://example.com/mcp');
    let y2 = null; try { y2 = parseYaml(F.hermes) } catch {}
    check('Composio: Hermes block + key in .env', y2?.mcp_servers?.['187n-apps']?.headers?.['x-api-key'] === '${COMPOSIO_MCP_API_KEY}' && /^COMPOSIO_MCP_API_KEY=test-composio-key$/m.test(read(F.env) || ''));
    const st = await page.evaluate(() => fetch('/api/student/state').then(r => r.json()));
    check('Composio: Setup status on for all three', st.composio.agentApps.claude === true && st.composio.agentApps.codex === true && st.composio.agentApps.hermes === true, JSON.stringify(st.composio));
    await page.click('#agentapps-off');
    await until(async () => /Removed/.test(await page.textContent('#aastatus')), 15000);
    check('Composio: Remove brings every file back', read(F.codex) === original.codex && read(F.hermes) === original.hermes && read(F.env) === original.env && !claudeServers()['187n-apps']);

    // 5 · The pages, with real clicks ---------------------------------------------------------------------------------
    where = 'setup › more tools';
    await open(app.url + '/setup#tools'); await page.waitForSelector('#st-mcp-add', {timeout: 15000});
    await page.fill('#st-mcp-name', 'Setup Check'); await page.fill('#st-mcp-url', mcpURL); await page.fill('#st-mcp-key', SECRET.setup);
    await page.click('#st-mcp-add');
    await until(async () => /Claude Code: added/.test(await page.textContent('#st-mcp-status')), 20000);
    await page.screenshot({path: path.join(app.dirs.shots, 'setup-more-tools.png'), fullPage: true});
    check('Setup › More tools: adds an MCP server', /Claude Code: added/.test(await page.textContent('#st-mcp-status')) && /Setup Check/.test(await page.textContent('#tools-added')), await page.textContent('#st-mcp-status'));
    await call('tools/mcp', {action: 'remove', id: '187n-setup-check'});

    where = 'office › add tools';
    await open(app.url + '/'); await page.waitForTimeout(3000);
    const shadow = sel => page.locator('#cockpit-panel').locator(sel);
    const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 8000}).catch(() => {}); await page.waitForTimeout(250) };
    await page.evaluate(() => { location.hash = '#workspace/tools' }); await settle();
    const opened = async () => ({title: await shadow('#title').textContent(), hash: await page.evaluate(() => location.hash), tab: await shadow('#view-switch button[data-section="tools"]').getAttribute('aria-pressed').catch(() => null) || await shadow('#view-switch button[data-section="tools"]').getAttribute('aria-current').catch(() => null)});
    const o1 = await opened();
    check('Add tools: opens under Agents & Setup › Setup', o1.title === 'Setup' && o1.hash === '#workspace/tools', JSON.stringify(o1));
    check('Add tools: four ways', await shadow('.tools-way').count() === 4);
    await shadow('#tools-mcp-name').fill('UI Check'); await shadow('#tools-mcp-url').fill(mcpURL); await shadow('#tools-mcp-key').fill(SECRET.ui);
    await shadow('[data-action="mk-tools-mcp-add"]').click();
    const row = shadow('[data-tools-server="187n-ui-check"]');
    await row.waitFor({timeout: 20000}).catch(() => {});
    check('Add tools: added from the form, on in all three', await row.count() === 1 && await row.locator('.tools-chip[data-state="on"]').count() === 3);
    await page.screenshot({path: path.join(app.dirs.shots, 'add-tools-top.png')});
    await row.scrollIntoViewIfNeeded().catch(() => {}); await page.screenshot({path: path.join(app.dirs.shots, 'add-tools-added.png')});
    await row.locator('[data-action="mk-tools-mcp-test"]').click();
    await until(async () => /Works/.test(await shadow('[data-tools-server="187n-ui-check"]').textContent()), 15000);
    check('Add tools: Test shows that it works', /Works: a8-stand-in answered/.test(await shadow('[data-tools-server="187n-ui-check"]').textContent()));
    await shadow('[data-tools-server="187n-ui-check"] [data-id="187n-ui-check|codex|off"]').click();
    await until(async () => await shadow('[data-tools-server="187n-ui-check"] .tools-chip[data-state="off"]').count() === 1, 15000);
    check('Add tools: a click turns it off for Codex', !read(F.codex).includes('187n-ui-check') && read(F.hermes).includes('187n-ui-check'));
    await shadow('[data-tools-server="187n-ui-check"] [data-action="mk-tools-mcp-remove"]').click();
    await until(async () => await shadow('[data-tools-server="187n-ui-check"]').count() === 0, 15000);
    check('Add tools: Remove takes it out everywhere', await shadow('[data-tools-server="187n-ui-check"]').count() === 0 && read(F.codex) === original.codex && read(F.hermes) === original.hermes && !claudeServers()['187n-ui-check']);
    await shadow('[data-tools-kind="stdio"]').click();
    check('Add tools: the command form shows', await shadow('#tools-mcp-command').isVisible() && !(await shadow('#tools-mcp-url').isVisible()));
    await shadow('#tools-vault-name').fill('ui check key'); await shadow('#tools-vault-value').fill(SECRET.uiVault);
    check('Add tools: key names become capitals', (await shadow('#tools-vault-name').inputValue()) === 'UI_CHECK_KEY');
    await shadow('[data-action="mk-tools-vault-add"]').click();
    await until(async () => await shadow('[data-action="mk-tools-vault-remove"][data-id="UI_CHECK_KEY"]').count() === 1, 15000);
    check('Add tools: key saved from the form', await shadow('[data-action="mk-tools-vault-remove"][data-id="UI_CHECK_KEY"]').count() === 1);
    await shadow('[data-action="mk-tools-vault-remove"][data-id="UI_CHECK_KEY"]').click();
    await until(async () => await shadow('[data-action="mk-tools-vault-remove"][data-id="UI_CHECK_KEY"]').count() === 0, 15000);
    check('Add tools: key removed from the page', await shadow('[data-action="mk-tools-vault-remove"][data-id="UI_CHECK_KEY"]').count() === 0);
    answer = src;   // the folder picker (outside the app window it asks with a prompt)
    await shadow('[data-action="mk-tools-skill-add"]').click();
    await until(async () => await shadow('[data-tools-skill="hello-helper"]').count() === 1, 15000);
    check('Add tools: skill added through the folder picker', await shadow('[data-tools-skill="hello-helper"]').count() === 1 && fs.existsSync(path.join(DIRS.claude, 'hello-helper/.187n-installed')));
    await shadow('[data-tools-skill="hello-helper"] [data-action="mk-tools-skill-remove"]').click();
    await until(async () => await shadow('[data-tools-skill="hello-helper"]').count() === 0, 15000);
    check('Add tools: skill removed', !fs.existsSync(path.join(DIRS.claude, 'hello-helper')));

    where = 'office › skills & tools';
    await page.evaluate(() => { location.hash = '#workspace/skills' }); await settle();
    check('Skills & tools: origin column', /Found/.test(await shadow('#view').textContent()));
    await page.screenshot({path: path.join(app.dirs.shots, 'skills-tools.png')});
    await shadow('button[data-section="tools"]').first().click(); await settle();
    const o2 = await opened();
    check('Skills & tools: the Add tools button opens Add tools', o2.title === 'Setup' && o2.hash === '#workspace/tools' && await shadow('.tools-way').count() === 4, JSON.stringify(o2));

    // 6 · Nothing left behind, nothing leaked ----------------------------------------------------------------------------
    where = 'end';
    check('every config file as it was at the start', read(F.codex) === original.codex && read(F.hermes) === original.hermes && read(F.env) === original.env && !Object.keys(claudeServers()).some(k => k.startsWith('187n-')));
    const all = bodies.join('\n');
    for (const [k, v] of Object.entries(SECRET)) check('no ' + k + ' secret in any API response', !all.includes(v));
    check('no Composio key in any API response', !all.includes('test-composio-key'));
  } catch (e) { failed++; console.log('FAIL ' + where + ' · ' + e.stack) } finally {
    await browser.close(); await app.stop(); mcp.close();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    console.log('screenshots: ' + app.dirs.shots);
    process.exitCode = failed || problems.length || before !== after ? 1 : 0;
    console.log(process.exitCode ? '\nA8 tools: FAILED (' + failed + ')' : '\nA8 tools: all checks passed');
  }
})();
