// Across areas, on the merged build: competitors (Research) feed Studio's "What is working" wall, a tile opens its
// player and becomes an idea on the board (Content); a signal becomes an idea; a rendered carousel (Makers) lands in
// Review with its slides and a job; brain folders (Brain) and a vault key (Tools) both reach an agent run.
//   node tests/e2e/integration.cjs [port] [mockPort]
const path = require('path');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const FIX = path.join(__dirname, '../fixtures');
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'integration', port: Number(process.argv[2] || 4701), mockPort: Number(process.argv[3] || 4700),
    env: {HQS_SHIM_REPLIES: [path.join(FIX, 'makers/replies'), path.join(FIX, 'research/replies')].join(':'), HQS_SHIM_LOG_ENV: 'INTEG_KEY'}});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = [], results = []; let where = 'start';
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + String(detail).slice(0, 200) : '')) };
  const call = (p, b, base = '/api/hq/v1/') => page.evaluate(async ({p, b, base}) => { const r = await fetch(base + p, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}); return {status: r.status, body: await r.json().catch(() => null)} }, {p, b, base});
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await page.waitForTimeout(400) } return null };
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const settle = () => page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {});
  const items = async () => (await call('marketing/content')).body?.items || [];
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(300); await H.setupViaAPI(page, app);
    // Research → Studio
    where = 'research';
    check('Apify key saved', (await call('keys', {name: 'apify', key: 'test-apify-key'}, '/api/student/')).status === 200);
    check('competitor added', (await call('marketing/competitors/roster', {add: {platform: 'instagram', handle: '@northwind.studio'}})).status === 200);
    const quote = (await call('marketing/competitors/quote', {})).body || {};
    const paid0 = (await (await fetch(app.mockURL + '/__paid')).json()).count;
    const collect = await call('marketing/competitors/collect', {confirm: true, maxUsd: quote.maxUsd});
    check('collection started after confirm', collect.status === 200, JSON.stringify(collect.body).slice(0, 120));
    const done = await until(async () => { const d = (await call('marketing/competitors')).body; return d?.posts?.length && !d?.collecting && !d?.running ? d : null }, 30000);
    check('posts collected', Boolean(done), done ? done.posts.length + ' posts' : 'none');
    check('one paid run', (await (await fetch(app.mockURL + '/__paid')).json()).count === paid0 + 1);
    where = 'studio';
    await page.goto(app.url + '/'); await page.waitForTimeout(3500);
    if (!(await page.locator('#hq-nav .sb-item[data-section="studio"]').isVisible())) await page.locator('#hq-nav [data-toggle="marketing"]').click();
    await page.locator('#hq-nav .sb-item[data-section="studio"]').click(); await settle();
    const tiles = shadow('[data-action="mk-studio-wallplay"]');
    check('Studio shows the rising posts', (await tiles.count()) > 0, (await tiles.count()) + ' tiles');
    await tiles.first().click(); await page.waitForTimeout(600);
    const open = await page.evaluate(() => { const r = document.querySelector('#cockpit-panel').shadowRoot, d = r.querySelector('#preview'); return {open: d?.open, html: (d?.innerHTML || '').slice(0, 4000), hash: location.hash} });
    check('a tile opens its player in Studio (not the Office)', open.open && open.hash === '#workspace/studio' && /embed|iframe|Turn into an idea/.test(open.html), open.hash);
    await shadow('#preview [data-action="mk-studio-idea"]').first().click(); await page.waitForTimeout(800);
    check('the rising post became an idea on the board', (await items()).some(i => i.sourceRef?.kind === 'competitor'));
    // Signals → idea
    where = 'signals';
    const sig = await until(async () => (await call('marketing/signals')).body?.signals?.[0], 15000);
    const sigIdea = sig ? await call('marketing/signals/' + encodeURIComponent(sig.id) + '/idea', {}) : {status: 0};
    check('a signal became an idea', sigIdea.status === 200 && (await items()).some(i => (i.sourceRef?.kind || '') === 'signal'));
    // Makers → Review + Jobs + campaign
    where = 'makers';
    check('brand kit set', (await call('marketing/brand', {name: 'North Studio', handle: '@northstudio', style: 'clean', colours: {background: '#F6F1E9', text: '#1D1B18', accent: '#B4532A', muted: '#7A7167'}, fonts: {heading: 'Georgia', body: 'Helvetica Neue'}})).status === 200);
    const draft = (await call('marketing/make/draft', {format: 'carousel', source: {kind: 'topic', text: 'Plan a week in one hour'}, slides: 5})).body?.draft || {};
    const ready = await until(async () => (await call('marketing/make/drafts')).body?.drafts?.find(d => d.id === draft.id && d.status === 'ready'), 20000);
    check('the writer drafted the carousel', Boolean(ready), ready ? ready.slides?.length + ' slides' : JSON.stringify(draft).slice(0, 120));
    const render = ready ? await call('marketing/make/render', {draftId: draft.id}) : {status: 0};
    check('carousel rendered', render.status === 200);
    const withFiles = await until(async () => (await items()).find(i => (i.files || []).length >= 5));
    check('the rendered slides are on a content item', Boolean(withFiles), withFiles ? withFiles.status + ' · ' + withFiles.files.length + ' files' : '');
    const jobs = (await call('marketing/jobs')).body?.jobs || [];
    check('the carousel job shows on Jobs', jobs.some(j => j.kind === 'lane.carousel'), jobs.map(j => j.kind + ':' + j.status).join(', '));
    // Brain + Tools → one agent run gets both
    where = 'run hooks';
    const notes = path.join(app.dirs.files, 'notes');
    check('brain folder set', (await call('brain/folders', {folders: [notes]}, '/api/student/')).status === 200);
    check('agents may read the brain', (await call('brain/agents', {enable: true}, '/api/student/')).status === 200);
    check('vault key added', (await call('tools/vault', {action: 'add', name: 'INTEG_KEY', value: 'integration-secret'})).status === 200);
    const task = await call('tasks', {title: 'Integration check', prompt: 'Say hi', profile: 'chief'});
    await until(async () => (await call('tasks/' + task.body?.id)).body?.task?.status !== 'running', 15000);
    const last = app.calls().filter(c => c.tool === 'claude' && c.args.includes('-p')).pop() || {args: [], values: {}};
    check('the run can read the brain (--add-dir)', last.args.includes('--add-dir') && last.args.includes(notes));
    check('the run got the vault key', last.values?.INTEG_KEY === 'integration-secret');
    const anyLeak = JSON.stringify((await call('tools')).body || {}).includes('integration-secret');
    check('the vault value is never in a response', !anyLeak);
  } catch (e) { check('no exception', false, e.message) }
  finally {
    await browser.close(); await app.stop();
    const same = before === H.ownerSnapshot();
    check('owner configuration unchanged', same);
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    const failed = results.filter(r => !r).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' integration checks passed');
    process.exitCode = failed || problems.length ? 1 : 0;
  }
})();
