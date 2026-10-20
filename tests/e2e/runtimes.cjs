// A6 · Agent sign-in, with real clicks: Sign in opens the official command (no Terminal in tests) and the card turns
// Ready by itself once the student finishes; the account line shows; Codex switches to an API key (made-up) and a run
// gets it, while Claude runs never get ANTHROPIC_API_KEY in subscription mode (not even one inherited by the app); the
// Connections page's Reconnect starts the same sign-in; Install finishes by itself too.
//   node tests/e2e/runtimes.cjs [appPort=4661] [mockPort=4660]
const path = require('path'), fs = require('fs'), {execFileSync} = require('child_process');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const port = Number(process.argv[2] || 4661), mockPort = Number(process.argv[3] || 4660);
  const before = H.ownerSnapshot();
  // Made-up keys (test only). The "inherited" one stands for a key in the app's own environment.
  const FAKE = {codex: 'sk-proj-' + 'A1b2C3d4'.repeat(5), claude: 'sk-ant-api03-' + 'Zz9Yy8Xx'.repeat(5), inherited: 'sk-ant-api03-inherited-from-the-shell-' + '0'.repeat(12)};
  const results = [], problems = []; let where = 'start';
  const check = (name, ok, detail = '') => { results.push([name, Boolean(ok)]); console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ' · ' + detail : '')) };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const watch = page => {
    page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
    page.on('console', m => m.type() === 'error' && problems.push(where + ' · console ' + m.text().slice(0, 200)));
    page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  };
  const get = (page, p) => page.evaluate(async p => (await fetch(p)).json(), p);
  const post = (page, p, b) => page.evaluate(async ([p, b]) => { const r = await fetch(p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}); return {status: r.status, body: await r.json().catch(() => null)} }, [p, b]);
  const pill = (page, id) => page.locator('#rt-' + id + ' [data-pill]').textContent();
  const waitPill = async (page, id, text, timeout) => { const t0 = Date.now(); await page.waitForFunction(([id, text]) => document.querySelector('#rt-' + id + ' [data-pill]')?.textContent === text, [id, text], {timeout}); return Date.now() - t0 };
  let app;
  try {
    // ── Phase 1: sign in, account line, API-key mode, runs, Connections reconnect ──────────────────────────────────
    app = await H.launch({name: 'a6-runtimes', port, mockPort, signedIn: {claude: false, codex: false}, env: {HQS_SHIM_LOG_ENV: 'ANTHROPIC_API_KEY,CODEX_API_KEY,OPENROUTER_API_KEY', ANTHROPIC_API_KEY: FAKE.inherited}});
    const state = file => path.join(app.dirs.state, file);
    const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage(); watch(page);
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    console.log('setup:', JSON.stringify(Object.fromEntries(Object.entries(await H.setupViaAPI(page, app)).map(([k, v]) => [k, v.status]))));

    where = 'setup › agents';
    await page.goto(app.url + '/setup#agents'); await page.reload(); await page.waitForSelector('#rt-claude');  // same URL after /launch: reload
    await page.waitForFunction(() => !document.querySelector('#rt-cards [data-state="checking"]'), null, {timeout: 10000}).catch(() => {});
    check('Claude Code starts at Sign in needed (inherited ANTHROPIC_API_KEY ignored)', await pill(page, 'claude') === 'Sign in needed', await pill(page, 'claude'));
    check('Codex starts at Sign in needed', await pill(page, 'codex') === 'Sign in needed', await pill(page, 'codex'));
    check('no "Check again" button', await page.getByText('Check again').count() === 0);

    await page.click('#rt-claude [data-rt-act="login"]');
    await waitPill(page, 'claude', 'Signing in…', 4000).catch(() => {});
    check('Sign in → "Signing in…"', await pill(page, 'claude') === 'Signing in…', await pill(page, 'claude'));
    const script = path.join(app.dirs.support, 'scripts/claude-login.command'), text = fs.existsSync(script) ? fs.readFileSync(script, 'utf8') : '';
    check('Terminal script runs the official command and says the app notices', text.includes('claude auth login') && /notices by itself/.test(text) && !/Check again/.test(text), text.split('\n').filter(l => l.startsWith('echo "When')).join(' '));
    check('no login ran without the student (no Terminal in tests)', !app.calls().some(c => c.tool === 'claude' && c.args[0] === 'auth' && c.args[1] === 'login'));

    // The student finishes the sign-in in Terminal: the stand-in now answers "signed in".
    fs.writeFileSync(state('auth-claude'), 'in');
    let ms = await waitPill(page, 'claude', 'Ready', 9000).catch(() => -1);
    check('card turns Ready by itself (no click)', ms >= 0 && ms <= 7000, ms + ' ms');
    const line = await page.locator('#rt-claude [data-account]').textContent().catch(() => '');
    check('account line shows', /Your Claude subscription/.test(line) && line.includes('student@example.com') && /Claude Max/.test(line), JSON.stringify(line));

    // Hermes with a provider in its config: `hermes auth status <provider>`; Set up finishes by itself too.
    fs.writeFileSync(path.join(app.dirs.home, '.hermes/config.yaml'), 'model:\n  default: anthropic/claude-sonnet-4.6\n  provider: openrouter\n');
    fs.writeFileSync(state('auth-hermes'), 'out');
    await post(page, '/api/student/runtimes/check', {});
    await page.reload(); await page.waitForSelector('#rt-hermes');
    check('Hermes signed out at its provider → Sign in needed', await pill(page, 'hermes') === 'Sign in needed', await pill(page, 'hermes'));
    check('Hermes status asked `hermes auth status openrouter`', app.calls().some(c => c.tool === 'hermes' && c.args.join(' ') === 'auth status openrouter'));
    await page.click('#rt-hermes [data-rt-act="login"]');
    fs.writeFileSync(state('auth-hermes'), 'in');
    ms = await waitPill(page, 'hermes', 'Ready', 9000).catch(() => -1);
    const hline = await page.locator('#rt-hermes [data-account]').textContent().catch(() => '');
    check('Hermes turns Ready by itself with its provider', ms >= 0 && /OpenRouter · anthropic\/claude-sonnet-4\.6/.test(hline), ms + ' ms · ' + JSON.stringify(hline));

    // Codex: Use an API key instead (made-up key). A wrong key is refused first.
    where = 'setup › codex api key';
    await page.click('#rt-codex details[data-key] summary');
    await page.fill('#rt-codex [data-key-input]', FAKE.claude);
    await page.click('#rt-codex [data-rt-act="key-save"]');
    await page.waitForFunction(() => /key/.test(document.querySelector('#rt-codex [data-key-status]')?.textContent || '') && document.querySelector('#rt-codex [data-key-status]').classList.contains('err'), null, {timeout: 4000}).catch(() => {});
    const refused = await page.locator('#rt-codex [data-key-status]').textContent();
    check('an Anthropic key is refused for Codex', /Anthropic key/.test(refused), JSON.stringify(refused));
    await page.fill('#rt-codex [data-key-input]', FAKE.codex);
    await page.click('#rt-codex [data-rt-act="key-save"]');
    ms = await waitPill(page, 'codex', 'Ready', 4000).catch(() => -1);
    const cline = await page.locator('#rt-codex [data-account]').textContent().catch(() => '');
    check('Codex is Ready in API-key mode', ms >= 0 && /Your API key/.test(cline) && /OpenAI API key/.test(cline), JSON.stringify(cline));
    // The app checks the key itself too (from Node, so the expected 422 is not a browser console error).
    const direct = await fetch(app.url + '/api/student/runtimes/apikey', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: 'hqs=' + app.token, Origin: app.url}, body: JSON.stringify({runtime: 'hermes', key: FAKE.codex})});
    const directBody = await direct.json().catch(() => ({}));
    check('the app refuses a wrong key itself (422)', direct.status === 422 && /OpenAI key/.test(directBody?.error?.message || ''), direct.status + ' ' + JSON.stringify(directBody?.error?.message));
    const status = JSON.stringify(await get(page, '/api/student/runtimes/status'));
    const docFile = path.join(app.dirs.support, 'data/runtimes.json'); for (let i = 0; i < 20 && !fs.existsSync(docFile); i++) await sleep(100);  // saved shortly after
    const doc = fs.existsSync(docFile) ? fs.readFileSync(docFile, 'utf8') : '';
    check('the key is never in a response or file', !status.includes(FAKE.codex) && !doc.includes(FAKE.codex) && /"codex" : "api-key"/.test(doc), doc.replace(/\s+/g, ' '));

    // Claude: a saved key, switched back to the subscription (it must not be injected then).
    await page.click('#rt-claude details[data-key] summary');
    await page.fill('#rt-claude [data-key-input]', FAKE.claude);
    await page.click('#rt-claude [data-rt-act="key-save"]');
    await page.waitForSelector('#rt-claude [data-rt-act="mode-sub"]', {timeout: 4000});
    await page.click('#rt-claude [data-rt-act="mode-sub"]');
    await page.waitForSelector('#rt-claude [data-rt-act="mode-key"]', {timeout: 4000});
    const back = await page.locator('#rt-claude [data-account]').textContent();
    check('Claude back on the subscription with a key saved', /Your Claude subscription/.test(back), JSON.stringify(back));

    // Test buttons (runs through the app's run path), then real tasks for a Codex agent and a Claude agent.
    for (const id of ['codex', 'claude']) {
      await page.click('#rt-' + id + ' [data-rt-act="test"]');
      await page.waitForFunction(id => /^(Works|Not|The|Could)/.test(document.querySelector('#rt-' + id + ' [data-card-status]')?.textContent || ''), id, {timeout: 15000}).catch(() => {});
      const t = await page.locator('#rt-' + id + ' [data-card-status]').textContent();
      check(id + ' Test works', /^Works/.test(t), JSON.stringify(t));
    }
    await page.selectOption('select[data-agent="builder"]', 'codex'); await page.selectOption('select[data-agent="chief"]', 'claude');
    await page.click('[data-next="agents"]'); await page.waitForTimeout(600);
    for (const [profile, title] of [['builder', 'A6 codex task'], ['chief', 'A6 claude task']]) await post(page, '/api/hq/v1/tasks', {title, profile, prompt: 'Reply briefly.'});
    for (let i = 0; i < 40; i++) { const runs = await get(page, '/api/hq/v1/runs'); if (runs.filter(r => /^A6 /.test(r.title)).length === 2 && runs.filter(r => /^A6 /.test(r.title)).every(r => r.status !== 'running')) break; await sleep(500) }
    const runs = (await get(page, '/api/hq/v1/runs')).filter(r => /^A6 /.test(r.title));
    check('both tasks finished', runs.length === 2 && runs.every(r => r.status === 'completed' || r.status === 'done'), runs.map(r => r.title + ':' + r.status).join(', '));
    const calls = app.calls();
    const codexRuns = calls.filter(c => c.tool === 'codex' && c.args[0] === 'exec'), claudeRuns = calls.filter(c => c.tool === 'claude' && c.args.includes('-p'));
    check('Codex runs got CODEX_API_KEY (the made-up key)', codexRuns.length >= 2 && codexRuns.every(c => c.env.includes('CODEX_API_KEY') && c.values.CODEX_API_KEY === FAKE.codex), codexRuns.length + ' runs · env: ' + codexRuns.map(c => c.env.filter(k => /API_KEY/.test(k)).join('+')).join(', '));
    check('Claude runs did NOT get ANTHROPIC_API_KEY', claudeRuns.length >= 2 && claudeRuns.every(c => !c.env.includes('ANTHROPIC_API_KEY')), claudeRuns.length + ' runs · env: ' + claudeRuns.map(c => c.env.filter(k => /API_KEY/.test(k)).join('+') || '(no key)').join(', '));
    check('Claude status checks did NOT get ANTHROPIC_API_KEY', calls.filter(c => c.tool === 'claude' && c.args[0] === 'auth').every(c => !c.env.includes('ANTHROPIC_API_KEY')));

    // Connections › Reconnect on Claude Code starts the same sign-in, and it finishes by itself.
    where = 'office › connections';
    fs.writeFileSync(state('auth-claude'), 'out'); await post(page, '/api/student/runtimes/check', {});
    await page.goto(app.url + '/'); await page.waitForTimeout(2500);
    await page.evaluate(() => { location.hash = '#workspace/connections' });
    const shadow = sel => page.locator('#cockpit-panel').locator(sel);
    await shadow('[data-action="connector-reconnect"][data-id="runtime:claude"]').first().waitFor({timeout: 10000});
    const mtime = fs.existsSync(script) ? fs.statSync(script).mtimeMs : 0;
    await shadow('[data-action="connector-reconnect"][data-id="runtime:claude"]').first().click();
    await shadow('#preview[open]').waitFor({timeout: 5000}).catch(() => {});
    const dialog = await shadow('#preview').innerText().catch(() => '');
    const pending = (await get(page, '/api/hq/v1/runtimes/status')).runtimes.find(r => r.id === 'claude');
    check('Reconnect starts the sign-in (dialog, pending, script)', /Terminal opened with the Claude Code sign-in/.test(dialog) && pending.pending === 'login' && fs.statSync(script).mtimeMs >= mtime, JSON.stringify(dialog.slice(0, 120)) + ' · pending=' + pending.pending);
    fs.writeFileSync(state('auth-claude'), 'in');
    let readyAt = -1; const t0 = Date.now();
    for (let i = 0; i < 18; i++) { const s = (await get(page, '/api/hq/v1/runtimes/status')).runtimes.find(r => r.id === 'claude'); if (s.ready && !s.pending) { readyAt = Date.now() - t0; break } await sleep(500) }
    check('…and finishes by itself', readyAt >= 0 && readyAt <= 7000, readyAt + ' ms');
    const entry = (await get(page, '/api/hq/v1/integrations')).find(c => c.id === 'runtime:claude');
    check('Connections entry is verified with the account', entry?.verified === true && /student@example\.com/.test(entry.account), JSON.stringify({state: entry?.state, account: entry?.account}));
    await page.close(); await app.stop(); app = null;

    // ── Phase 2: Install finishes by itself (Hermes not installed; its stand-in appears while the app waits) ─────────
    where = 'setup › install';
    const home = require('os').homedir();
    const login = (() => { try { return execFileSync('/bin/zsh', ['-lic', 'printf "%s" "$PATH"'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000}) } catch { return '' } })();
    const dirs = [...login.split(':'), home + '/.local/bin', '/opt/homebrew/bin', '/usr/local/bin', home + '/.npm-global/bin', home + '/.bun/bin', home + '/.volta/bin', '/usr/bin', '/bin'].filter(d => d && !d.includes('/.local/bin') && !d.includes('/.hermes/'));
    const stray = dirs.find(d => fs.existsSync(path.join(d, 'hermes')));
    if (stray) console.log('skip install phase: another `hermes` is on this Mac\'s PATH (' + stray + '); the test never runs a real CLI');
    else {
      app = await H.launch({name: 'a6-runtimes-install', port, mockPort, runtimes: ['claude', 'codex']});
      const p2 = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage(); watch(p2);
      await p2.goto(app.launchURL); await p2.waitForTimeout(400); await H.setupViaAPI(p2, app);
      await p2.goto(app.url + '/setup#agents'); await p2.reload(); await p2.waitForSelector('#rt-hermes');
      check('Hermes starts at Not installed', await pill(p2, 'hermes') === 'Not installed', await pill(p2, 'hermes'));
      await p2.click('#rt-hermes [data-rt-act="install"]');
      await waitPill(p2, 'hermes', 'Installing…', 4000).catch(() => {});
      check('Install → "Installing…"', await pill(p2, 'hermes') === 'Installing…', await pill(p2, 'hermes'));
      const f = path.join(app.dirs.bin, 'hermes');
      fs.writeFileSync(f, '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(H.ROOT, 'tests/shims/hermes.mjs') + '" "$@"\n'); fs.chmodSync(f, 0o755);
      ms = await waitPill(p2, 'hermes', 'Ready', 9000).catch(() => -1);
      check('Install finishes by itself (the card turns Ready)', ms >= 0 && ms <= 7000, ms + ' ms');
      await p2.close(); await app.stop(); app = null;
    }
  } catch (e) { problems.push(where + ' · ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')) }
  finally {
    if (app) await app.stop();
    await browser.close();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    const failed = results.filter(r => !r[1]).length;
    console.log(results.length - failed + '/' + results.length + ' checks passed');
    process.exitCode = failed || problems.length || before !== after ? 1 : 0;
  }
})();
