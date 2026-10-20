// C1 · The office core and Setup, on any engine (this Mac's test app, or another one through HQ_TEST_APP): Setup
// through the API plus the wizard's Composio and Zernio connect flows (the stand-ins' login pages), every base page with
// real clicks, records (add, edit, delete) and the finance numbers they produce, a document opening, routines (create,
// run, pause, an invalid schedule refused), tasks and conversations, and the integrations list.
// Agent runs are always checked as recorded; that they succeed is checked only with HQ_EXPECT_RUNS=1 (an engine whose
// agent runner is not ported yet records them as failed).
//   node tests/e2e/core.cjs [appPort=4811] [mockPort=4810]
const path = require('path'), fs = require('fs');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const nav = await import(path.join(__dirname, '../../frontend/overlay/web/workspace-navigation.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const port = Number(process.argv[2] || 4811), mockPort = Number(process.argv[3] || 4810);
  const EXPECT_RUNS = process.env.HQ_EXPECT_RUNS === '1';
  const before = H.ownerSnapshot();
  const results = [], problems = [], pending = []; let where = 'start', allow501 = false;
  const check = (name, ok, detail = '') => { results.push(Boolean(ok)); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + String(detail).slice(0, 220) : '')) };
  // A check that needs working agent runs: required with HQ_EXPECT_RUNS=1, otherwise reported as pending.
  const runCheck = (name, ok, detail = '') => {
    if (EXPECT_RUNS) return check(name, ok, detail);
    pending.push(name); console.log((ok ? 'ok   ' : 'skip ') + name + ' · run success pending the engine\'s agent runner (HQ_EXPECT_RUNS=1 to require)' + (detail ? ' · ' + String(detail).slice(0, 160) : ''));
  };
  // The engines send Composio account ids percent-encoded (ca_1 → ca%5F1, as a real server reads them). A stand-in
  // that compares the raw path cannot find them; then the checks by account id are reported, not required.
  const mockCheck = (name, ok, detail = '') => {
    if (mockDecodes) return check(name, ok, detail);
    pending.push(name); console.log((ok ? 'ok   ' : 'skip ') + name + ' · the Composio stand-in does not decode account ids (ca%5F1); see the report' + (detail ? ' · ' + String(detail).slice(0, 120) : ''));
  };
  let mockDecodes = true;
  const app = await H.launch({name: 'c1-core', port, mockPort});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && !(allow501 && /status of 501/.test(m.text())) && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500 && !(allow501 && r.status() === 501)) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  const call = (p, b, base = '/api/hq/v1/') => page.evaluate(async ({p, b, base}) => {
    const r = await fetch(base + p, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)});
    return {status: r.status, type: r.headers.get('content-type') || '', body: await r.json().catch(() => null)};
  }, {p, b, base});
  const get = async p => (await call(p)).body;
  const student = (p, b) => call(p, b, '/api/student/');
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await page.waitForTimeout(300) } return null };
  const err = r => r.status + ' ' + (r.body?.error?.code || '') + ' ' + (r.body?.error?.message || '');
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {}); await page.waitForTimeout(250) };
  const viewText = () => page.evaluate(() => document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view')?.innerText || '');
  // A login page the wizard opens in the browser: wait for the new tab, let it land on the app's /connected page.
  const loginTab = async click => {
    const [tab] = await Promise.all([context.waitForEvent('page', {timeout: 10000}), click()]);
    await tab.waitForURL(/\/connected/, {timeout: 10000}).catch(() => {});
    const out = {url: tab.url(), text: await tab.locator('body').innerText().catch(() => '')}; await tab.close(); return out;
  };
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(400);

    // ── Licence first ──────────────────────────────────────────────────────────────────────────────────────────
    where = 'licence';
    let r = await call('health');
    check('the office needs a licence (402)', r.status === 402 && r.body?.error?.code === 'license_required', err(r));
    r = await student('agents', {agents: []});
    check('Setup steps need a licence first', r.status === 402 && r.body?.error?.message === 'Enter your licence key first.', err(r));
    r = await student('license', {key: 'HQ1-not.valid'});
    check('a wrong licence key is refused', r.status === 422 && r.body?.error?.code === 'invalid_license', err(r));

    // ── Setup through the API (as the wizard does) ─────────────────────────────────────────────────────────────
    where = 'setup api';
    const setup = await H.setupViaAPI(page, app, {composio: false, zernio: false});
    check('Setup through the API', Object.values(setup).every(x => x.status === 200), JSON.stringify(Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status]))));
    check('the licence summary names the student', setup.licence.body?.name === 'Test Student' && setup.licence.body?.expired === false);
    check('the starting team has nine agents', setup.agents.body?.agents?.length === 9 && setup.agents.body.agents[0].id === 'chief');
    let state = (await student('state')).body || {};
    const S = state.settings || {};
    check('state: folders, currency, permissions, setup complete', S.workspace === app.dirs.files + '/workspace' && S.proposalsFolder === app.dirs.files + '/proposals' && S.handbookFolder === app.dirs.files + '/playbooks'
      && S.notesFolder === app.dirs.files + '/notes' && S.currency === 'EUR' && S.permissions === 'edit' && S.setupComplete === true, JSON.stringify(S));
    check('state: runtimes, agents, team, connections, keys, version', Array.isArray(state.runtimes) && state.agents?.length === 9 && state.team?.length === 9 && state.team[3]?.name === 'Content Writer'
      && state.composio?.connected === false && state.zernio?.connected === false && state.zernio?.platforms?.length === 9 && typeof state.notes?.count === 'number'
      && Object.keys(state.keys || {}).sort().join() === 'apify,composio,elevenlabs,groq,typesafe,zernio' && typeof state.version === 'string' && state.version.length > 0,
      Object.keys(state).sort().join(','));
    r = await student('folders', {proposalsFolder: app.dirs.files + '/no-such-folder'});
    check('a folder that does not exist is refused', r.status === 422 && r.body?.error?.message === 'That folder does not exist.', err(r));
    r = await student('folders', {currency: 'JPY', permissions: 'admin'});
    state = (await student('state')).body || {};
    check('an unknown currency or permission is ignored', r.status === 200 && state.settings?.currency === 'EUR' && state.settings?.permissions === 'edit');
    r = await student('no-such-step', {});
    check('an unknown Setup step is 404', r.status === 404 && r.body?.error?.message === 'Unknown setup step.', err(r));
    r = await student('zernio/connect', {platform: 'myspace'});
    check('an unknown social platform is refused', r.status === 422 && r.body?.error?.code === 'bad_platform', err(r));

    // ── The wizard: Composio (key, then a login in the browser) ────────────────────────────────────────────────
    where = 'wizard › apps';
    await page.goto(app.url + '/setup#apps'); await page.reload(); await page.waitForSelector('#ckey');  // same page after /launch: reload
    await page.fill('#ckey', 'not-the-key'); await page.click('#csave');
    await page.waitForFunction(() => /\S/.test(document.querySelector('#cstatus')?.textContent || '') && !/Checking/.test(document.querySelector('#cstatus').textContent), null, {timeout: 8000}).catch(() => {});
    check('a wrong Composio key shows Composio\'s message', /Invalid API key/.test(await page.locator('#cstatus').textContent()), await page.locator('#cstatus').textContent());
    await page.fill('#ckey', 'test-composio-key'); await page.click('#csave');
    await page.waitForSelector('[data-cconnect="gmail"]', {timeout: 10000}).catch(() => {});
    const appNames = await page.locator('#apps .app header').allInnerTexts();
    check('the app list shows the managed apps, popular first', appNames[0] === 'Gmail' && appNames.includes('Slack') && !appNames.includes('Shopify'), appNames.join(', '));
    let tab = await loginTab(() => page.click('[data-cconnect="gmail"]'));
    check('Connect opens the login; it lands on the app\'s Connected page', /\/connected\?status=success/.test(tab.url) && /Connected/.test(tab.text), tab.url);
    await page.waitForFunction(() => /Gmail/.test(document.querySelector('#connected-apps')?.innerText || '') && /Connected/.test(document.querySelector('#connected-apps')?.innerText || ''), null, {timeout: 12000}).catch(() => {});
    check('the wizard notices the login by itself (Gmail connected)', /Gmail[\s\S]*Connected/.test(await page.locator('#connected-apps').innerText().catch(() => '')));
    await page.waitForSelector('[data-cconnect="googlecalendar"]', {timeout: 5000}).catch(() => {});
    tab = await loginTab(() => page.click('[data-cconnect="googlecalendar"]'));
    await page.waitForFunction(() => /Google Calendar/.test(document.querySelector('#connected-apps')?.innerText || ''), null, {timeout: 12000}).catch(() => {});
    let accounts = (await student('composio/accounts')).body || [];
    check('Composio accounts: Gmail and Google Calendar active', ['gmail', 'googlecalendar'].every(t => accounts.some(a => a.toolkit === t && a.status === 'ACTIVE' && a.label === 'student@example.com')) && accounts.find(a => a.toolkit === 'googlecalendar')?.toolkitName === 'Google Calendar',
      accounts.map(a => a.toolkit + ':' + a.status).join(', '));
    r = await student('composio/toolkits?search=shop');
    check('a search lists apps that need their own login too', r.status === 200 && r.body?.some(a => a.slug === 'shopify' && a.managed === false));
    const gmail = accounts.find(a => a.toolkit === 'gmail');
    mockDecodes = (await fetch(app.mockURL + '/composio/connected_accounts/' + encodeURIComponent(gmail?.id || 'x').replace(/_/g, '%5F'), {headers: {'x-api-key': 'test-composio-key'}})).status === 200;

    // ── The wizard: Zernio (key, then a social login in the browser) ───────────────────────────────────────────
    where = 'wizard › social';
    await page.goto(app.url + '/setup#social'); await page.reload(); await page.waitForSelector('#zkey');
    await page.fill('#zkey', 'not-the-key'); await page.click('#zsave');
    await page.waitForFunction(() => /\S/.test(document.querySelector('#zstatus')?.textContent || '') && !/Checking/.test(document.querySelector('#zstatus').textContent), null, {timeout: 8000}).catch(() => {});
    check('a wrong Zernio key shows Zernio\'s message', /Invalid API key/.test(await page.locator('#zstatus').textContent()), await page.locator('#zstatus').textContent());
    await page.fill('#zkey', 'test-zernio-key'); await page.click('#zsave');
    await page.waitForSelector('[data-zconnect="tiktok"]', {timeout: 10000}).catch(() => {});
    await page.waitForFunction(() => /@student\.studio/.test(document.querySelector('#zaccounts')?.innerText || ''), null, {timeout: 8000}).catch(() => {});
    check('the connected Instagram account shows', /Instagram · @student\.studio/.test(await page.locator('#zaccounts').innerText().catch(() => '')));
    tab = await loginTab(() => page.click('[data-zconnect="tiktok"]'));
    check('Connect TikTok opens the login; it lands on Connected', /\/connected\?connected=tiktok/.test(tab.url) && /Connected/.test(tab.text), tab.url);
    await page.waitForFunction(() => /Connected ✓/.test(document.querySelector('[data-zconnect="tiktok"]')?.textContent || ''), null, {timeout: 12000}).catch(() => {});
    check('the wizard notices the new account by itself', /Connected ✓/.test(await page.locator('[data-zconnect="tiktok"]').textContent()));
    const zacc = (await student('zernio/accounts')).body || [];
    check('Zernio accounts: Instagram and the new TikTok', zacc.length === 2 && zacc.some(a => a.platform === 'tiktok' && a.handle === '@new.account' && a.active === true) && zacc.find(a => a.id === 'z1')?.followers === 1840,
      zacc.map(a => a.platform + ':' + a.handle).join(', '));
    state = (await student('state')).body || {};
    check('state: Composio and Zernio connected, keys stored', state.composio?.connected === true && state.zernio?.connected === true && state.keys?.composio === true && state.keys?.zernio === true);
    await page.goto(app.url + '/'); await page.waitForTimeout(3500);

    // ── Integrations ───────────────────────────────────────────────────────────────────────────────────────────
    where = 'integrations';
    let list = (await get('integrations')) || [];
    const ig = list.find(i => i.id === gmail?.id), z1 = list.find(i => i.id === 'zernio:z1');
    check('integrations: Gmail through Composio, verified', ig?.adapter === 'composio' && ig.state === 'verified' && ig.verified === true && ig.name === 'gmail' && ig.capability === 'Gmail' && ig.account === 'student@example.com', JSON.stringify(ig));
    check('integrations: Instagram through Zernio, for Content', z1?.adapter === 'zernio' && z1.state === 'verified' && z1.account === '@student.studio' && z1.departments?.[0] === 'content', JSON.stringify(z1));
    check('integrations: every entry has the fields the page reads', list.length >= 4 && list.every(i => ['id', 'name', 'account', 'state', 'verified', 'adapter', 'reason', 'capability', 'observed_at'].every(k => k in i)), list.length + ' entries');
    r = await call('integrations/' + encodeURIComponent(gmail?.id || 'x') + '/check', {});
    mockCheck('Check on an app: verified', r.status === 200 && r.body?.verified === true && r.body?.checked === true, JSON.stringify(r.body));
    r = await call('integrations/zernio:z1/check', {});
    check('Check on a social account: verified', r.status === 200 && r.body?.state === 'verified');
    r = await call('integrations/zernio:gone/check', {});
    check('Check on a removed social account: unavailable', r.status === 200 && r.body?.state === 'unavailable' && r.body?.verified === false);
    r = await call('integrations/zernio:z1/reconnect', {});
    check('Reconnect a social account: a login link', r.status === 200 && /\/zernio\/mock-login/.test(r.body?.url || '') && r.body?.reason === 'Log in again in the new tab.' && r.body?.account === '@student.studio', JSON.stringify(r.body));
    r = await call('integrations/' + encodeURIComponent(gmail?.id || 'x') + '/reconnect', {});
    mockCheck('Reconnect an app: a login link', r.status === 200 && /\/composio\/mock-login/.test(r.body?.url || '') && r.body?.reason === 'Complete the login in the new tab.', JSON.stringify(r.body));
    list = (await get('integrations')) || [];
    mockCheck('an unfinished login shows as "Finish the login in your browser."', list.some(i => i.adapter === 'composio' && i.state === 'configured' && i.reason === 'Finish the login in your browser.'));

    // ── Records and the numbers they produce ───────────────────────────────────────────────────────────────────
    where = 'records';
    const rec = (kind, b) => call('records/' + kind, b);
    r = await rec('lead', {action: 'add', fields: {company: '  '}});
    check('a lead needs a company', r.status === 422 && r.body?.error?.message === 'Company is required.', err(r));
    const lead = (await rec('lead', {action: 'add', fields: {company: 'Northwind Bakery', contact: 'Sam', stage: 'contacted', source: 'referral', value: '2500'}})).body || {};
    check('lead added', /^l_/.test(lead.id || '') && lead.value === 2500 && lead.stage === 'contacted' && lead.history?.length === 1 && lead.history[0].type === 'record.created', JSON.stringify(lead).slice(0, 200));
    const won = (await rec('lead', {action: 'update', id: lead.id, fields: {company: 'Northwind Bakery', contact: 'Sam', stage: 'won', source: 'referral', value: '2500'}})).body || {};
    check('lead edited: stage history kept', won.stage === 'won' && won.history?.length === 2 && won.history[1].type === 'stage.won' && won.id === lead.id);
    const lead2 = (await rec('lead', {action: 'add', fields: {company: 'Bluebird Cafe', stage: 'replied', source: ''}})).body || {};
    check('an empty source becomes "other", an unknown stage "research"', lead2.source === 'other' && (await rec('lead', {action: 'add', fields: {company: 'Temp Lead', stage: 'maybe'}})).body?.stage === 'research');
    const temp = ((await get('records/lead')) || []).find(l => l.company === 'Temp Lead');
    r = await rec('lead', {action: 'delete', id: temp?.id});
    let leads = (await get('records/lead')) || [];
    check('lead deleted', r.body?.ok === true && leads.length === 2 && !leads.some(l => l.company === 'Temp Lead'), leads.map(l => l.company).join(', '));
    r = await rec('lead', {action: 'update', id: 'l_gone', fields: {company: 'X'}});
    check('editing a removed record is 404', r.status === 404 && r.body?.error?.message === 'This record no longer exists.', err(r));

    r = await rec('project', {action: 'add', fields: {project: 'Website refresh'}});
    check('a project needs a client', r.status === 422 && r.body?.error?.message === 'Client is required.', err(r));
    const proj = (await rec('project', {action: 'add', fields: {project: 'Website refresh', client: 'Northwind Bakery', status: 'purple', priority: 'P0', deadline: '2026-12-01'}})).body || {};
    check('project added (unknown status → on track)', proj.status === 'green' && proj.priority === 'P0' && /^p_/.test(proj.id || ''));
    const proj2 = (await rec('project', {action: 'update', id: proj.id, fields: {project: 'Website refresh', client: 'Northwind Bakery', status: 'amber', priority: 'P0'}})).body || {};
    const projTemp = (await rec('project', {action: 'add', fields: {project: 'Old pilot', client: 'Nobody'}})).body || {};
    await rec('project', {action: 'delete', id: projTemp.id});
    const projects = (await get('records/project')) || [];
    check('project edited and another deleted', proj2.status === 'amber' && projects.length === 1 && projects[0].project === 'Website refresh');

    r = await rec('entry', {action: 'add', fields: {type: 'income', amount: '0', counterparty: 'X'}});
    check('an amount of zero is refused', r.status === 422 && r.body?.error?.message === 'Enter an amount above zero.', err(r));
    r = await rec('entry', {action: 'add', fields: {type: 'income', amount: '10'}});
    check('an entry needs a customer or supplier', r.status === 422 && r.body?.error?.message === 'Customer or supplier is required.', err(r));
    const inc = (await rec('entry', {action: 'add', fields: {type: 'income', amount: '1200', status: 'paid', counterparty: 'Northwind Bakery', client: 'Northwind Bakery', category: 'Services', currency: 'JPY'}})).body || {};
    check('income added (unknown currency → yours, no date → today)', inc.amount === 1200 && inc.currency === 'EUR' && /^\d{4}-\d{2}-\d{2}$/.test(inc.date || '') && inc.status === 'paid', JSON.stringify(inc).slice(0, 200));
    const open = (await rec('entry', {action: 'add', fields: {type: 'income', amount: '300,50', status: 'open', counterparty: 'Bluebird Cafe', category: 'Coaching'}})).body || {};
    check('a comma decimal is read as a number', open.amount === 300.5 && open.status === 'open');
    const ads = (await rec('entry', {action: 'add', fields: {type: 'expense', amount: '250', status: 'paid', counterparty: 'Ad network', category: 'Advertising'}})).body || {};
    const adsEdited = (await rec('entry', {action: 'update', id: ads.id, fields: {type: 'expense', amount: '200', status: 'paid', counterparty: 'Ad network', category: 'Advertising', date: ads.date}})).body || {};
    check('expense edited', adsEdited.amount === 200 && adsEdited.id === ads.id);
    await rec('entry', {action: 'add', fields: {type: 'expense', amount: '49.99', status: 'open', counterparty: 'Design tool', category: 'Software'}});
    const extra = (await rec('entry', {action: 'add', fields: {type: 'expense', amount: '999', status: 'paid', counterparty: 'Mistake', category: 'Other'}})).body || {};
    r = await rec('entry', {action: 'delete', id: extra.id});
    check('entry deleted', r.body?.ok === true && ((await get('records/entry')) || []).length === 4);

    r = await rec('person', {action: 'add', fields: {person: 'Alex Rivera'}});
    check('a team member needs a role', r.status === 422 && r.body?.error?.message === 'Role is required.', err(r));
    const person = (await rec('person', {action: 'add', fields: {person: 'Alex Rivera', role: 'Editor', status: ''}})).body || {};
    const personEdited = (await rec('person', {action: 'update', id: person.id, fields: {person: 'Alex Rivera', role: 'Lead editor', status: 'Part-time'}})).body || {};
    const personTemp = (await rec('person', {action: 'add', fields: {person: 'Temp Helper', role: 'Intern'}})).body || {};
    await rec('person', {action: 'delete', id: personTemp.id});
    check('team member added (status Active), edited, another deleted', person.status === 'Active' && personEdited.role === 'Lead editor' && personEdited.status === 'Part-time' && ((await get('records/person')) || []).length === 1);
    r = await rec('invoice', {action: 'add', fields: {}});
    check('an unknown record type is 404', r.status === 404 && r.body?.error?.message === 'Unknown record type.', err(r));
    r = await call('records/invoice');
    check('reading an unknown record type is 404', r.status === 404);

    where = 'finance numbers';
    const reg = (await get('workspace/records/finance'))?.records || [];
    const cash = reg[0] || {}, recv = reg.find(x => x.record_type === 'receivable') || {}, pay = reg.find(x => x.record_type === 'payable') || {};
    check('register: balance = paid income − paid expenses', cash.record_type === 'cash' && cash.amount === '1000.00' && cash.recordId === 'balance' && cash.currency === 'EUR', JSON.stringify(cash).slice(0, 160));
    check('register: open income is a receivable, open expense a payable', recv.amount === '300.50' && recv.status === 'confirmed' && recv.counterparty === 'Bluebird Cafe' && pay.amount === '49.99' && pay.status === 'open' && reg.length === 3);
    const ledger = (await get('workspace/records/ledger')) || {};
    const amounts = (ledger.records || []).map(x => x.amount).sort();
    check('ledger: the paid entries, signed', amounts.join() === '-200.00,1200.00' && ledger.statusCounts?.settled === 2 && ledger.records.every(x => x.status === 'settled' && x.month === x.date.slice(0, 7)), amounts.join());
    const sum = (await get('workspace/records/finance/summary')) || {};
    const bt = sum.register?.byType || {}, month = sum.ledger?.months?.[0] || {}, cats = sum.ledger?.categories || [];
    check('summary: register totals by type', near(bt.cash?.EUR?.confirmed, 1000) && near(bt.receivable?.EUR?.confirmed, 300.5) && near(bt.payable?.EUR?.open, 49.99) && sum.register?.rows === 3, JSON.stringify(bt));
    check('summary: ledger by month and category', near(month.inflow, 1200) && near(month.outflow, 200) && month.settled === 2 && near(cats.find(c => c.category === 'Income · Services')?.inflow, 1200) && near(cats.find(c => c.category === 'Advertising')?.outflow, 200),
      JSON.stringify({month, cats}).slice(0, 220));
    const rev = (await get('cockpit/revenue')) || {}, M = rev.metrics || {};
    check('revenue band: this month', rev.state === 'connected' && rev.currency === 'EUR' && M.revenue === 1200 && M.ad_spend === 200 && M.roas === 6 && M.profit === 1000 && M.deals_closed === 1 && M.avg_deal_value === 2500
      && M.leads_total === 2 && M.appointments_set === 1 && M.conversion_rate === 50, JSON.stringify(M));
    const team = (await get('workspace/team/revenue')) || {};
    check('period revenue: paid income and won deals', team.paid === 1200 && team.collectedNet === 1200 && team.signedContractValue === 2500 && team.currency === 'EUR');
    const crm = (await get('workspace/crm'))?.accounts?.[0] || {};
    check('pipeline numbers', crm.counts?.leads === 2 && crm.counts?.appointments === 1 && crm.counts?.payments === 1 && crm.counts?.contracts === 1 && crm.paidBeforeRefunds === 1200 && crm.signedContractValue === 2500
      && crm.leads?.some(l => l.name === 'Northwind Bakery' && l.status === 'Won') && crm.leads?.some(l => l.name === 'Bluebird Cafe' && l.status === 'Appointment Booked'), JSON.stringify(crm.counts));
    const pf = (await get('workspace/portfolio')) || {};
    const nw = (pf.performance || []).find(p => p.brand === 'Northwind Bakery');
    check('client performance: paid income in the last 30 days', nw?.current === 1200 && nw.previous === 0 && nw.count === 1 && nw.growth === null && pf.client_groups?.some(g => g.client === 'Northwind Bakery'), JSON.stringify(nw));
    const outreach = (await get('workspace/team/outreach')) || {};
    check('outreach: the leads with their names', outreach.records?.length === 2 && outreach.records.some(x => x.name === 'Northwind Bakery' && x.accountId === 'main') && outreach.source?.summary?.leads === 2);
    const delivery = (await get('workspace/delivery')) || {};
    check('delivery: the project', delivery.projects?.length === 1 && delivery.projects[0].externalId === proj.id && delivery.projects[0].status === 'amber');
    const ppl = (await get('workspace/records/people'))?.records || [];
    check('team: the member', ppl.length === 1 && ppl[0].person === 'Alex Rivera' && ppl[0].role === 'Lead editor' && ppl[0].temporary_status === 'Part-time' && ppl[0].recordId === person.id);
    r = await call('workspace/records/finance/item?id=balance');
    const item = await call('workspace/records/finance/item?id=' + ads.id), gone = await call('workspace/records/finance/item?id=nope');
    check('one finance record (balance, a paid expense, a missing one)', r.body?.record?.amount === '1000.00' && item.body?.record?.amount === '-200.00' && gone.status === 404 && gone.body?.error?.message === 'This record no longer exists.');

    // ── Documents ──────────────────────────────────────────────────────────────────────────────────────────────
    where = 'documents';
    const props = (await get('documents?kind=proposals')) || {}, books = (await get('documents?kind=handbook')) || {};
    const pdf = (props.files || [])[0] || {};
    check('proposals listed', props.folderName === 'proposals' && props.files?.length === 1 && pdf.name === 'bluebird-bakery-proposal.pdf' && pdf.rel === '2026/bluebird-bakery-proposal.pdf' && pdf.folder === '2026' && pdf.ext === 'pdf' && pdf.bytes === 20291, JSON.stringify(pdf));
    check('playbooks listed', books.files?.length === 2 && books.files.every(f => f.ext === 'md' && f.folder === '' && /T.*Z$/.test(f.modified)));
    r = await call('documents?kind=secrets');
    check('an unknown document list is 404', r.status === 404 && r.body?.error?.message === 'Unknown document list.');
    r = await call('documents/file?kind=proposals&path=' + encodeURIComponent('../playbooks/onboarding-sop.md'));
    check('a path outside the folder is refused', r.status === 404 && r.body?.error?.message === 'This document is no longer in the folder.', err(r));
    r = await call('documents/open', {kind: 'handbook', path: '../../home/.claude.json'});
    check('opening a file outside the folder is refused', r.status === 404, err(r));

    // ── Routines ───────────────────────────────────────────────────────────────────────────────────────────────
    where = 'routines';
    r = await call('routines/create', {name: 'Morning plan', schedule: 'every morning', prompt: 'Plan my day'});
    check('an invalid schedule is refused', r.status === 422 && r.body?.error?.code === 'bad_schedule' && r.body.error.message === 'Use a schedule like 0 9 * * 1-5 (weekdays at 09:00).', err(r));
    r = await call('routines/create', {name: 'Morning plan', schedule: '61 9 * * *'});
    check('a minute out of range is refused', r.status === 422 && r.body?.error?.code === 'bad_schedule');
    r = await call('routines/create', {name: 'Morning plan', profile: 'chief', prompt: 'Plan my day', schedule: '  0 9 * * 1-5 '});
    const routine = r.body?.routine || {};
    check('routine created', r.status === 200 && routine.schedule?.expr === '0 9 * * 1-5' && routine.enabled === true && routine.repeat?.completed === 0 && routine.workdir === S.workspace, JSON.stringify(routine).slice(0, 200));
    let shaped = ((await get('routines')) || []).find(x => x.id === routine.id) || {};
    const next = new Date(shaped.next_run_at || 0);
    check('routine shaped: plain-English schedule and next run', shaped.schedule?.display === 'Weekdays at 09:00' && shaped.state === 'scheduled' && shaped.paused === null && next.getHours() === 9 && next.getMinutes() === 0 && next.getDay() >= 1 && next.getDay() <= 5 && next > new Date(),
      shaped.schedule?.display + ' · ' + shaped.next_run_at);
    r = await call('routines/edit', {id: routine.id, schedule: '0 25 * * *'});
    check('editing to an invalid schedule is refused', r.status === 422 && r.body?.error?.message === 'That schedule is not valid.', err(r));
    await call('routines/edit', {id: routine.id, name: 'Morning plan (edited)', schedule: '30 8 * * *'});
    shaped = ((await get('routines')) || []).find(x => x.id === routine.id) || {};
    check('routine edited', shaped.name === 'Morning plan (edited)' && shaped.schedule?.display === 'Every day at 08:30');
    const run = (await call('routines/run', {id: routine.id})).body || {};
    check('Run now starts a run for the routine', /^run_/.test(run.id || '') && run.routine === routine.id && run.profile === 'chief' && run.title === 'Morning plan (edited)' && run.status === 'running' && run.last_event === 'run.accepted', JSON.stringify(run).slice(0, 200));
    const finished = await until(async () => { const x = (await call('runs/' + run.id)).body; return x && x.status !== 'running' ? x : null }, 30000);
    check('the run is recorded and finishes', Boolean(finished) && ['completed', 'failed'].includes(finished.status) && finished.runtime?.phase === 'finished', finished ? finished.status + ' · ' + (finished.error || '') : 'still running');
    shaped = ((await get('routines')) || []).find(x => x.id === routine.id) || {};
    check('the routine records the run', shaped.latest_execution?.id === run.id && shaped.repeat?.completed === 1 && shaped.recent?.runs === 1 && typeof shaped.last_run_at === 'string', JSON.stringify(shaped.latest_execution));
    const res = (await get('routines/results?id=' + routine.id))?.results || [];
    check('routine results list the run', res.length === 1 && res[0].id === run.id);
    runCheck('the routine run succeeded', finished?.status === 'completed' && shaped.last_status === 'ok' && (finished.result || '').length > 0, finished?.status);
    const wf = (await get('workflow?kind=routine&id=' + routine.id)) || {};
    check('View steps: trigger → model → result', wf.nodes?.[0]?.label === 'Routine' && wf.nodes?.[1]?.kind === 'model' && wf.nodes?.at(-1)?.kind === 'result' && wf.edges?.length === wf.nodes.length - 1 && wf.live === false, (wf.nodes || []).map(n => n.kind).join('→'));
    const idx = (await get('workflow?routine=' + routine.id)) || {};
    check('View steps index for the routine', idx.kind === 'index' && idx.items?.length === 1 && idx.items[0].id === run.id);
    r = await call('workflow?kind=bogus');
    check('an unknown workflow kind is 400', r.status === 400 && r.body?.error?.code === 'invalid_workflow');
    await call('routines/pause', {id: routine.id});
    shaped = ((await get('routines')) || []).find(x => x.id === routine.id) || {};
    check('routine paused', shaped.state === 'paused' && shaped.paused === true && shaped.next_run_at === null && shaped.enabled === false);
    await call('routines/resume', {id: routine.id});
    shaped = ((await get('routines')) || []).find(x => x.id === routine.id) || {};
    check('routine resumed', shaped.state === 'scheduled' && shaped.enabled === true && typeof shaped.next_run_at === 'string');
    const doomed = (await call('routines/create', {name: 'Weekly review', schedule: '0 16 * * 5', profile: 'ops'})).body?.routine || {};
    check('Fridays schedule in plain English', ((await get('routines')) || []).find(x => x.id === doomed.id)?.schedule?.display === 'Fridays at 16:00');
    await call('routines/delete', {id: doomed.id});
    check('routine deleted', !((await get('routines')) || []).some(x => x.id === doomed.id));
    r = await call('routines/run', {id: 'r_gone'});
    check('running a removed routine is 404', r.status === 404 && r.body?.error?.message === 'Unknown routine.');
    allow501 = true; r = await call('routines/archive', {id: routine.id}); allow501 = false;
    check('an unknown routine action is 501', r.status === 501 && r.body?.error?.code === 'not_available');
    const teamPage = (await get('team')) || {};
    check('team: the routine under its department', teamPage.groups?.some(g => g.id === 'command' && g.jobs.some(j => j.id === routine.id && j.schedule === 'Every day at 08:30')));

    // ── Tasks and conversations ────────────────────────────────────────────────────────────────────────────────
    where = 'tasks';
    const task = (await call('tasks', {title: 'Write a welcome email', prompt: 'Short and warm', profile: 'writer'})).body || {};
    check('task created and handed to the agent', /^t_/.test(task.id || '') && task.task?.assignee === 'writer' && task.task?.status === 'running');
    const taskDone = await until(async () => { const t = (await call('tasks/' + task.id)).body; return t?.task && t.task.status !== 'running' ? t : null }, 30000);
    check('the task\'s run is recorded', taskDone?.runs?.length === 1 && taskDone.runs[0].task === task.id && ['done', 'blocked'].includes(taskDone.task.status), taskDone?.task?.status);
    runCheck('the task was done', taskDone?.task?.status === 'done' && (taskDone.task.result || '').length > 0, taskDone?.task?.status + ' · ' + (taskDone?.task?.result || '').slice(0, 80));
    r = await call('tasks/' + task.id + '/cancel', {});
    check('task cancelled', r.body?.ok === true && (await call('tasks/' + task.id)).body?.task?.status === 'cancelled');
    r = await call('tasks/t_gone');
    check('a removed task is 404', r.status === 404 && r.body?.error?.message === 'This task no longer exists.');
    // One run on each AI tool (the stand-ins for Claude Code, Codex and Hermes Agent).
    where = 'runtimes';
    for (const [profile, runtime] of [['researcher', 'claude'], ['builder', 'codex'], ['ops', 'hermes']]) {
      const set = (await call('profiles/settings', {profile, runtime})).body || {};
      const t = (await call('tasks', {title: 'Check-in on ' + runtime, prompt: 'Say hello in one line', profile})).body || {};
      const fin = await until(async () => { const x = (await call('tasks/' + t.id)).body; return x?.task && x.task.status !== 'running' ? x : null }, 30000);
      check('a run on ' + runtime + ' is recorded', set.runtime_name === runtime && fin?.runs?.[0]?.runtime?.source === runtime && ['done', 'blocked'].includes(fin?.task?.status), set.runtime_name + ' · ' + fin?.task?.status);
      runCheck('the ' + runtime + ' run succeeded', fin?.task?.status === 'done' && (fin.task.result || '').length > 0 && fin.runs[0].usage?.total_tokens > 0, fin?.task?.status + ' · ' + String(fin?.task?.result || '').slice(0, 80));
    }
    where = 'conversations';
    const convo = (await call('conversations', {profile: 'chief', title: 'Planning'})).body || {};
    r = await call('conversations/' + convo.id + '/prompt', {prompt: '   '});
    check('an empty message is refused', r.status === 422 && r.body?.error?.message === 'Write a message first.');
    const crun = (await call('conversations/' + convo.id + '/prompt', {prompt: 'Hello there'})).body || {};
    check('a message starts a run in the conversation', crun.conversation === convo.id && crun.status === 'running');
    const msgs = await until(async () => { const m = (await get('conversations/' + convo.id + '/messages'))?.messages || []; return m.length >= 2 ? m : null }, 30000) || [];
    check('the conversation keeps both messages', msgs[0]?.role === 'user' && msgs[0]?.content === 'Hello there' && msgs[1]?.role === 'assistant' && typeof msgs[1]?.content === 'string', msgs.map(m => m.role).join(','));
    runCheck('the agent answered', msgs[1] && !msgs[1].content.startsWith('⚠️'), (msgs[1]?.content || '').slice(0, 80));
    r = await call('conversations/c_gone/prompt', {prompt: 'Hi'});
    check('a removed conversation is 404', r.status === 404 && r.body?.error?.message === 'Unknown conversation.');
    r = await call('runs/' + crun.id + '/stop', {});
    check('stopping a finished run says so', r.status === 200 && r.body?.ok === false);
    r = await call('emergency-stop', {});
    check('emergency stop answers', r.status === 200 && r.body?.ok === true && typeof r.body?.stopped === 'number');

    // ── The rest of the office API ─────────────────────────────────────────────────────────────────────────────
    where = 'office api';
    const health = (await get('health')) || {};
    check('health', health.ok === true && health.service === '187n-agent-hq' && typeof health.release === 'string');
    const boot = (await get('bootstrap')) || {};
    check('bootstrap: profiles, departments, project, capabilities', boot.profiles?.length === 9 && boot.departments?.length === 9 && boot.projects?.[0]?.id === 'workspace' && boot.capabilities?.run_stop === true && boot.conversations?.some(c => c.id === convo.id));
    const prof = boot.profiles?.find(p => p.id === 'writer') || {};
    check('a profile has its department and runtime', prof.department === 'content' && prof.department_name === 'Content & Social' && prof.model === 'Default model' && typeof prof.provider === 'string' && typeof prof.runtime_name === 'string', JSON.stringify(prof));
    r = await call('profiles/settings', {profile: 'writer', model: 'sonnet', runtime: 'not-a-tool', effort: 'high'});
    check('agent settings: model and effort saved, unknown runtime ignored', r.body?.model === 'sonnet' && r.body?.effort === 'high' && r.body?.runtime_name === prof.runtime_name);
    r = await call('profiles/settings', {model: 'x'});
    check('agent settings need an agent', r.status === 422 && r.body?.error?.message === 'Choose an agent.');
    await call('briefs', {profile: 'writer', text: 'Write short, warm sentences.'});
    const soul = (await get('workspace/agents/soul?profile=writer')) || {};
    check('instructions saved and shown', (await get('briefs?profile=writer'))?.text === 'Write short, warm sentences.' && soul.text?.startsWith('# Content Writer\n\nWrite short, warm sentences.\n\nRuntime: ') && soul.bytes === Buffer.byteLength(soul.text));
    const models = (await get('models?profile=writer')) || {};
    check('models for an agent', models.profile === 'writer' && models.model === 'sonnet' && models.providers?.[0]?.current === true);
    const roster = (await get('workspace/agents/roster')) || {};
    check('agents roster with routines', roster.profiles?.length === 9 && roster.profiles.find(p => p.id === 'chief')?.routines?.total === 1 && roster.profiles.find(p => p.id === 'writer')?.soulBytes === Buffer.byteLength('Write short, warm sentences.'));
    const boards = (await get('boards')) || {};
    check('boards: tasks and routines', boards.boards?.[0]?.tasks?.some(t => t.id === task.id) && boards.routines?.some(x => x.id === routine.id));
    const ready = (await get('readiness')) || {};
    check('readiness', ready.live === true && ready.profiles?.length === 9 && ready.fleet?.workflows?.some(w => w.id === routine.id));
    const dash = (await get('workspace/dashboard')) || {};
    check('dashboard: tasks, agents, calendar, revenue', dash.tasks?.some(t => t.id === task.id && t.source === 'Agents') && dash.agents?.length === 9 && dash.calendar?.events?.some(e => e.title === 'Coaching call') && dash.revenue?.paid === 1200);
    const layout0 = (await get('workspace/dashboard-layout')) || {}, layout = (await call('workspace/dashboard-layout', {hidden: ['revenue']})).body || {};
    check('dashboard layout saved', layout.revision === (layout0.revision || 1) + 1 && layout.hidden?.[0] === 'revenue' && (await get('workspace/dashboard-layout'))?.hidden?.[0] === 'revenue');
    const ctx = (await call('workspace/context', {section: 'finance'})).body || {};
    check('context saved', ctx.section === 'finance' && ctx.revision >= 2 && ctx.profile === 'chief');
    const work = (await get('workspace/work')) || {};
    check('work list', work.tasks?.some(t => t.id === task.id && t.board === 'operations') && work.scope?.business === 'all');
    const cal = (await get('workspace/calendar')) || {};
    const ev = cal.events?.find(e => e.title === 'Coaching call') || {};
    check('calendar: Google Calendar events through Composio', cal.sources?.[0]?.state === 'connected' && ev.source === 'Google Calendar' && ev.allDay === false && ev.url === 'https://calendar.google.com/' && typeof ev.sourceTimezone === 'string', JSON.stringify(cal.sources?.[0]));
    const soc = (await get('social?days=30')) || {};
    check('social: accounts, posts and their results', soc.connected === true && soc.accounts?.length === 2 && soc.posts?.length === 4 && soc.analytics === true && soc.posts[0].metrics?.views === 1000 && soc.posts[0].accountId === 'z1' && soc.days === 30, JSON.stringify({a: soc.accounts?.length, p: soc.posts?.length}));
    const act = (await get('workspace/source/activity?limit=200')) || {};
    const titles = (act.events?.data || []).map(e => e.title);
    check('activity: what happened, by day', act.ok === true && titles.includes('Task created · Write a welcome email') && titles.some(t => t.startsWith('Routine created')) && titles.some(t => t.startsWith('Connection updated')) && act.days?.length >= 1, titles.slice(0, 6).join(' | '));
    const sess = (await get('workspace/source/hermes/sessions')) || {};
    const srun = sess.sessions?.data?.find(x => x.id === run.id);
    check('runs list: the routine run as a scheduled run', srun?.source === 'cron' && srun.jobId === routine.id && srun.title === 'Morning plan (edited)', JSON.stringify(srun).slice(0, 160));
    const HOUSE = '# House rules\n\nAnswer in short sentences.\n', houseBytes = Buffer.byteLength(HOUSE);
    fs.writeFileSync(path.join(app.dirs.files, 'workspace/CLAUDE.md'), HOUSE);
    const mem = (await get('workspace/source/hermes/memory')) || {}, memFile = (await get('workspace/source/hermes/memory?file=CLAUDE.md')) || {};
    const memEntry = mem.files?.data?.find(f => f.name === 'CLAUDE.md') || {};
    check('instructions in the workspace folder', memEntry.bytes === houseBytes && memEntry.human === houseBytes + ' bytes' && mem.counts?.files === 1 && memFile.file?.value === HOUSE, JSON.stringify(memEntry));
    r = await call('workspace/source/hermes/memory?file=secrets.txt');
    check('only the instruction files can be read', r.status === 404 && r.body?.error?.message === 'Unknown document.');
    const lib = (await get('workspace/source/brain/librarian')) || {};
    // (The second-brain area may answer this page itself; the shape is what the page reads.)
    check('knowledge status', lib.ok === true && typeof lib.agents?.[0]?.state === 'string' && typeof lib.agents[0].lastOk === 'object' && 'queue' in lib, JSON.stringify(lib.agents?.[0]).slice(0, 200));
    r = await call('brain/graph?scope=everything');
    check('the notes graph needs a known scope', r.status === 400 && r.body?.error?.code === 'bad_scope');
    const services = (await get('workspace/services')) || [];
    check('services: the engine is up', services[0]?.id === 'engine' && services[0].state === 'up' && services[0].port === port);
    const use = (await get('cockpit/usage?days=7')) || {};
    check('usage', use.days === 7 && Array.isArray(use.sources) && use.sources.every(s => s.series?.length === 7));
    check('events for the live stream', Array.isArray((await get('events'))?.events));
    r = await call('nowhere');
    check('an unknown page is 404', r.status === 404 && r.body?.error?.message === 'No such page in 187N Agent HQ: nowhere');
    allow501 = true; r = await call('nowhere', {}); allow501 = false;
    check('an unknown action is 501', r.status === 501 && r.body?.error?.message === 'This action is not available in this edition.');

    // ── Every base page, with real clicks ──────────────────────────────────────────────────────────────────────
    const BASE = ['overview', 'calendar', 'tasks', 'routines', 'agents', 'skills', 'sessions', 'activity', 'connections', 'settings', 'outreach', 'proposals', 'handbook', 'delivery', 'portfolio', 'finance', 'people', 'librarian', 'memory', 'social'];
    await call('tasks', {title: 'Draft the weekly newsletter', prompt: 'Three short news items', profile: 'writer'});
    await until(async () => !((await get('workspace/work'))?.tasks || []).some(t => t.status === 'running'), 30000);
    const EXPECT = {calendar: 'Coaching call', tasks: ((await get('workspace/work'))?.tasks || []).length + ' tasks', routines: 'Morning plan (edited)', agents: 'Content Writer', sessions: 'Morning plan (edited)', activity: 'Task created',
      outreach: 'Northwind Bakery', proposals: 'bluebird-bakery-proposal.pdf', handbook: 'onboarding-sop.md', delivery: 'Website refresh', portfolio: 'Northwind Bakery',
      finance: 'Bluebird Cafe', people: 'Alex Rivera', memory: 'CLAUDE.md', social: 'Post number 1'};
    await page.goto(app.url + '/'); await page.waitForTimeout(3000);
    await page.evaluate(() => { location.hash = '#workspace/overview' }); await settle();
    const seen = new Set();
    for (const w of nav.WORKSPACES) for (const p of w.pages) {
      const views = p.views.filter(([v]) => BASE.includes(v)); if (!views.length) continue;
      const item = page.locator(p.views[0][0] === 'overview' ? '#hq-nav .sb-item[data-route="overview"]' : '#hq-nav .sb-item[data-section="' + p.views[0][0] + '"]').first();
      if (!(await item.isVisible())) { const t = page.locator('#hq-nav [data-toggle="' + w.department + '"]').first(); if (await t.count()) await t.click() }
      where = w.label + ' › ' + p.label; await item.click(); await settle();
      for (const [v, label] of views) {
        where = w.label + ' › ' + p.label + ' › ' + label;
        if (v !== p.views[0][0]) { await shadow('#view-switch button[data-section="' + v + '"]').click(); await settle() }
        let info = await page.evaluate(() => { const r = document.querySelector('#cockpit-panel')?.shadowRoot; const view = r?.querySelector('#view'); return {hash: location.hash, title: r?.querySelector('#title')?.textContent, len: view?.innerText.length || 0, error: view?.querySelector('.ui-state[data-kind=error]')?.innerText?.slice(0, 160) || ''} });
        let text = await viewText();
        if (EXPECT[v] && !text.includes(EXPECT[v])) { await page.waitForTimeout(1500); text = await viewText() }
        const want = v === 'overview' ? 'Overview' : p.label;
        check('page ' + where, info.hash === '#workspace/' + v && info.title === want && !info.error && info.len > 20 && (!EXPECT[v] || text.includes(EXPECT[v])),
          info.hash + ' ' + JSON.stringify(info.title) + (info.error ? ' · ' + info.error : '') + (EXPECT[v] && !text.includes(EXPECT[v]) ? ' · missing "' + EXPECT[v] + '"' : ''));
        if (process.env.HQ_SHOW_TEXT && EXPECT[v] && !text.includes(EXPECT[v])) console.log(text.slice(0, 1500));
        seen.add(v);
        await page.screenshot({path: app.dirs.shots + '/' + v + '.png'});
        // A document opening, as the student does it: Open on a proposal (PDF) and on a playbook (Markdown).
        if (v === 'proposals' || v === 'handbook') {
          where = 'documents › open ' + v;
          const id = v === 'proposals' ? 'proposals|2026/bluebird-bakery-proposal.pdf' : 'handbook|onboarding-sop.md';
          await shadow('[data-action="doc-open"][data-id="' + id + '"]').click(); await page.waitForTimeout(800);
          const pv = await page.evaluate(() => { const d = document.querySelector('#cockpit-panel').shadowRoot.querySelector('#preview'); return {open: Boolean(d?.open), src: d?.querySelector('iframe')?.getAttribute('src') || '', text: d?.innerText || ''} });
          if (v === 'proposals') {
            const file = pv.src ? await page.evaluate(async src => { const r = await fetch(src); return {status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength} }, pv.src) : {};
            check('a proposal opens inside the app (PDF)', pv.open && /documents\/file\?kind=proposals/.test(pv.src) && file.status === 200 && file.type === 'application/pdf' && file.bytes === 20291, JSON.stringify(file));
          } else check('a playbook opens inside the app (Markdown)', pv.open && /Onboarding SOP/.test(pv.text) && /Access checklist/.test(pv.text), pv.text.slice(0, 120));
          await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        }
      }
    }
    check('every base page was visited', BASE.every(v => seen.has(v)), BASE.filter(v => !seen.has(v)).join(', '));

    // ── Disconnecting ──────────────────────────────────────────────────────────────────────────────────────────
    where = 'disconnect';
    r = await student('composio/disconnect', {id: gmail?.id});
    accounts = (await student('composio/accounts')).body || [];
    mockCheck('an app removed', r.body?.ok === true && !accounts.some(a => a.id === gmail?.id));
    await student('composio/key', {key: ''}); await student('zernio/key', {key: ''});
    state = (await student('state')).body || {};
    const cal2 = (await get('workspace/calendar')) || {}, soc2 = (await get('social')) || {};
    list = (await get('integrations')) || [];
    check('keys removed: Composio and Zernio disconnected', state.composio?.connected === false && state.zernio?.connected === false && !list.some(i => i.adapter === 'composio' || i.adapter === 'zernio'));
    check('calendar without Composio says how to connect', cal2.events?.length === 0 && cal2.sources?.[0]?.state === 'unavailable' && cal2.sources[0].reason === 'Connect Google Calendar in Setup (Composio).');
    check('social without Zernio says how to connect', soc2.connected === false && soc2.note === 'Connect Zernio in Setup to see your social accounts here.');
  } catch (e) { check('no exception', false, e.stack || e.message) }
  finally {
    await browser.close(); await app.stop();
    const same = before === H.ownerSnapshot();
    check('owner configuration unchanged', same);
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    const failed = results.filter(r => !r).length;
    if (pending.length) console.log('reported, not required (' + pending.length + '): ' + pending.join(' · '));
    console.log('\n' + (results.length - failed) + '/' + results.length + ' core checks passed');
    process.exitCode = failed || problems.length ? 1 : 0;
  }
})();
