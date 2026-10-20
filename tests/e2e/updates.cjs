// Updates (1.3.0), end to end against a local feed only: the version everywhere is the shared VERSION file; the daily
// check runs by itself after start; a feed signed with the (test) update key shows "Version X is available" on the
// Updates page and as a notice on other pages ("Later" hides it); Download fetches the installer from the signed
// address, checks size and SHA-256 and keeps it in Downloads (the fake home's); every tampered or wrong feed is refused
// with a plain reason and nothing is downloaded (another key, changed bytes, an expired feed, a bad signature file, a
// download address that is not https, a redirect away from the host); a wrong installer is deleted; an older or equal
// version means "up to date". And the Video editor of the office is not part of the student app.
// The test key pair is made in a temporary folder by this script; no real key is used or read.
//   node tests/e2e/updates.cjs [appPort=4731] [mockPort=4730]
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const L = await import(path.join(__dirname, '../../update/lib.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const appPort = Number(process.argv[2] || 4731), mockPort = Number(process.argv[3] || 4730);
  const VERSION = fs.readFileSync(path.join(__dirname, '../../VERSION'), 'utf8').trim();
  const before = H.ownerSnapshot();
  // A throwaway update key, and a second one the app does not trust.
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hqs-update-key-'));
  const runKeygen = dir => JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, '../../update/keygen.mjs'), '--dir', dir]).toString());
  const good = runKeygen(path.join(keyDir, 'good')), other = runKeygen(path.join(keyDir, 'other'));
  const goodKey = L.loadPrivate(good.private), otherKey = L.loadPrivate(other.private);
  const base = 'http://127.0.0.1:' + mockPort + '/updates/';
  const app = await H.launch({name: 'updates', port: appPort, mockPort, env: {HQS_UPDATE_FEED_URL: base + 'stable.json', HQS_UPDATE_KEYS: good.public, HQS_UPDATE_FIRST_CHECK: '2'}});
  // Both engines run on this Mac in tests, so both fetch the Mac installer here (the Windows engine fetches .exe on Windows).
  const platform = process.platform === 'win32' ? 'win' : 'mac';
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = []; let refusing = false;
  page.on('pageerror', e => problems.push('pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && !(refusing && /status of 4\d\d/.test(m.text())) && problems.push('console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push('HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== '' ? ' · ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')) };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mock = (p, body) => fetch(app.mockURL + p, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).then(r => r.json());
  const call = (p, body) => page.evaluate(async ({url, body}) => {
    const r = await fetch(url, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    return {status: r.status, body: await r.json().catch(() => null)};
  }, {url: '/api/hq/v1/' + p, body});
  const viewText = () => page.evaluate(() => document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view')?.innerText || '');
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {}); await sleep(400) };
  const waitFor = async (fn, ms = 20000, every = 300) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(every) } return v };
  const go = async section => { await page.evaluate(s => { location.hash = '#workspace/' + s }, section); await settle() };

  // The installers and the feed. `installer` is what the feed promises; `served` is what the host sends.
  const installer = crypto.randomBytes(300 * 1024), name = {mac: 'agent-hq-9.9.9.dmg', win: 'agent-hq-setup-9.9.9.exe'};
  const iso = ms => new Date(Date.now() + ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const feed = ({version = '9.9.9', expires = 30 * 864e5, url, size = installer.length, sha = L.sha256(installer), extra = {}} = {}) => ({
    schema: L.SCHEMA, product: L.PRODUCT, channel: 'stable', updated_at: iso(0), expires_at: iso(expires), latest: version,
    releases: [{version, date: '2026-10-20', notes: '- Faster Creator Lab\n- A new Updates page', downloads: {mac: {url: url || base + name.mac, sha256: sha, size}, win: {url: url || base + name.win, sha256: sha, size}}}, {version: '1.0.0', date: '2026-01-01', notes: 'old', downloads: {mac: {url: base + 'old.dmg', sha256: L.sha256(installer), size: installer.length}, win: {url: base + 'old.exe', sha256: L.sha256(installer), size: installer.length}}}], ...extra});
  const publish = async (doc, {key = goodKey, sig, bytes, served = installer} = {}) => {
    const b = bytes || Buffer.from(JSON.stringify(doc, null, 1) + '\n');
    await mock('/updates/__clear', {});
    await mock('/updates/__set', {files: {'stable.json': b.toString('base64'), 'stable.json.sig': (sig || L.signFeed(key, b)).toString('base64'), [name.mac]: served.toString('base64'), [name.win]: served.toString('base64')}});
  };
  const downloads = () => path.join(app.dirs.home, 'Downloads');
  const listDownloads = () => fs.existsSync(downloads()) ? fs.readdirSync(downloads()) : [];

  try {
    await publish(feed());
    await page.goto(app.launchURL); await sleep(400);
    const setup = await H.setupViaAPI(page, app);
    check('setup through the app', Object.values(setup).every(r => r.status === 200), Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status])));

    // One version everywhere: health, bootstrap and the Updates state carry the shared VERSION file.
    const health = await call('health'), boot = await call('bootstrap');
    check('health reports the shared VERSION', health.body?.release === VERSION, health.body?.release + ' / ' + VERSION);
    check('bootstrap reports the shared VERSION', boot.body?.version === VERSION && boot.body?.release === VERSION, boot.body?.version);

    // The daily check runs by itself shortly after start (2 s in this test build).
    const auto = await waitFor(async () => { const s = (await call('updates')).body; return s?.checkedAt ? s : null });
    check('the automatic check ran after start', Boolean(auto?.checkedAt) && auto.auto === true && auto.configured === true, auto && {checkedAt: auto.checkedAt, error: auto.error});
    check('it found the signed newer version', auto?.available?.version === '9.9.9' && auto.available.size === installer.length && auto.available.sha256 === L.sha256(installer) && auto.latest === '9.9.9', auto?.available);
    check('the notes come from the feed', auto?.available?.notes === '- Faster Creator Lab\n- A new Updates page');
    const hits = (await mock('/updates/__hits')).hits;
    check('the feed request names this version', hits.some(h => h.name === 'stable.json' && h.ua.includes('187N-Agent-HQ/' + VERSION)), hits.map(h => h.ua)[0]);
    check('nothing was downloaded by the check itself', !hits.some(h => h.name === name.mac || h.name === name.win) && listDownloads().length === 0);
    const act = await call('workspace/source/activity?limit=20');
    const acts = JSON.stringify(act.body || {});
    check('the activity says a new version is available', /Version 9\.9\.9 is available/.test(acts));

    // The page and the notice.
    await page.goto(app.url + '/'); await sleep(3000);
    await go('overview');
    const bannerText = await waitFor(async () => { const t = await viewText(); return /Version 9\.9\.9 of 187N Agent HQ is available/.test(t) ? t : null }, 8000);
    check('other pages show the notice', Boolean(bannerText));
    await shadow('[data-mk-update-banner] [data-section="updates"]').click(); await settle();
    let text = await viewText();
    const hash = await page.evaluate(() => location.hash);
    check('"See what\'s new" opens the Updates page', hash === '#workspace/updates' && /Version 9\.9\.9 is available/.test(text), hash);
    check('the page shows the notes, the size and the current version', /Faster Creator Lab/.test(text) && /A new Updates page/.test(text) && text.includes(VERSION) && /Download update \(0\.3 MB\)/.test(text), text.slice(0, 400));
    check('the page has a Check button and the daily switch', /Check for updates/.test(text) && /Check automatically every day/.test(text));
    await shadow('[data-action="mk-updates-download"]').click();
    const ready = await waitFor(async () => { const s = (await call('updates')).body; return s?.download?.state === 'ready' ? s : s?.download?.state === 'failed' ? s : null });
    check('Download fetched and verified the installer', ready?.download?.state === 'ready' && ready.download.received === installer.length, ready?.download);
    const saved = ready?.download?.file || '';
    check('it is in Downloads, with the name from the feed', path.dirname(saved) === downloads() && path.basename(saved) === name[platform] && fs.existsSync(saved), saved);
    check('its bytes are the signed installer', fs.existsSync(saved) && L.sha256(fs.readFileSync(saved)) === L.sha256(installer));
    check('no partial file is left', !listDownloads().some(f => f.endsWith('.part')), listDownloads());
    await settle(); await go('updates');
    text = await viewText();
    check('the page offers to open it', /Open the installer/.test(text) && /Show in (Finder|Explorer)/.test(text) && /SHA-256 match/.test(text), text.slice(0, 500));
    const opened = await call('updates/open', {what: 'installer'});
    check('Open answers (the test build opens nothing)', opened.status === 200 && opened.body?.opened === false);
    const again = await call('updates/download', {});
    check('a second Download keeps the verified file', again.body?.download?.state === 'ready' && listDownloads().filter(f => f.startsWith('agent-hq')).length === 1, listDownloads());

    // Later: no notice for this version on other pages.
    await go('overview');
    await waitFor(async () => (await viewText()).includes('Version 9.9.9 of 187N'), 6000);
    await shadow('[data-mk-update-banner] [data-action="mk-updates-dismiss"]').click(); await sleep(500);
    const dismissed = (await call('updates')).body;
    await go('tasks'); await sleep(800);
    check('Later hides the notice for this version', dismissed?.dismissed === '9.9.9' && !(await viewText()).includes('Version 9.9.9 of 187N'));

    // The daily switch.
    const off = await call('updates/settings', {auto: false}), on = await call('updates/settings', {auto: true});
    check('the daily check can be turned off and on', off.body?.auto === false && on.body?.auto === true);

    // Up to date first, so each refusal below shows that a refused feed changes nothing (a version verified earlier
    // would stay: only a feed that passes every check changes what is offered).
    await publish(feed({version: VERSION}));
    const same = (await call('updates/check', {})).body;
    check('the same version means up to date', same?.available === null && !same?.error && same?.latest === VERSION, {latest: same?.latest, error: same?.error});
    await go('updates');
    check('the page says up to date', /You are up to date/.test(await viewText()));

    // Refusals: each leaves nothing available and downloads nothing.
    refusing = true;
    const refused = async (label, doc, opts, reason) => {
      await publish(doc, opts);
      const s = (await call('updates/check', {})).body;
      check(label, s?.available === null && new RegExp(reason).test(s?.error || ''), {error: s?.error, available: s?.available?.version});
    };
    const bytes = Buffer.from(JSON.stringify(feed(), null, 1) + '\n');
    await refused('a feed signed with another key is refused', feed(), {key: otherKey}, 'not signed by 187N');
    await refused('a feed changed after signing is refused', null, {bytes: Buffer.from(bytes.toString().replace('9.9.9', '9.9.8')), sig: L.signFeed(goodKey, bytes)}, 'signature does not match');
    await refused('an expired feed is refused', feed({expires: -60000}), {}, 'expired');
    await refused('an unreadable signature file is refused', feed(), {sig: Buffer.from('not json')}, 'signature could not be read');
    await refused('a feed for another product is refused', {...feed(), product: 'something-else'}, {}, 'not a 187N Agent HQ update');
    const httpFeed = await (async () => { await publish(feed({url: 'http://example.invalid/agent-hq.dmg'})); return (await call('updates/check', {})).body })();
    check('a release whose download is not https is ignored', httpFeed?.available === null && !httpFeed?.error && httpFeed?.latest === '1.0.0', {latest: httpFeed?.latest, error: httpFeed?.error});
    const hits2 = (await mock('/updates/__hits')).hits;
    check('no refused feed led to a download', hits2.filter(h => h.name === name.mac || h.name === name.win).length === 1, hits2.filter(h => /\.(dmg|exe)$/.test(h.name)).length);

    // A wrong installer: right feed, other bytes on the host → deleted, nothing kept.
    const before2 = listDownloads().length;
    await publish(feed({version: '9.9.10'}), {served: crypto.randomBytes(installer.length)});
    const s2 = (await call('updates/check', {})).body;
    check('a newer version replaces the old notice', s2?.available?.version === '9.9.10' && s2.download?.state !== 'ready', s2?.download);
    await call('updates/download', {});
    const bad = await waitFor(async () => { const s = (await call('updates')).body; return ['failed', 'ready'].includes(s?.download?.state) ? s : null });
    check('an installer that does not match is deleted', bad?.download?.state === 'failed' && /did not match the signed update/.test(bad.download.error || '') && listDownloads().length === before2, {state: bad?.download?.state, files: listDownloads()});
    await publish(feed({version: '9.9.11', size: installer.length - 1}));
    await call('updates/check', {}); await call('updates/download', {});
    const big = await waitFor(async () => { const s = (await call('updates')).body; return ['failed', 'ready'].includes(s?.download?.state) ? s : null });
    check('an installer larger than signed is stopped', big?.download?.state === 'failed' && /larger than the signed update|did not match/.test(big.download.error || '') && listDownloads().length === before2, big?.download?.error);
    // A redirect away from the update host to an address that is not allowed.
    await publish(feed({version: '9.9.12', url: base + '__redirect?to=' + encodeURIComponent('http://localhost:' + mockPort + '/updates/' + name.mac)}));
    const r1 = (await call('updates/check', {})).body;
    await call('updates/download', {});
    const red = await waitFor(async () => { const s = (await call('updates')).body; return ['failed', 'ready'].includes(s?.download?.state) ? s : null });
    check('a download redirected away from https is stopped', r1?.available?.version === '9.9.12' && red?.download?.state === 'failed' && /not https/.test(red.download.error || ''), red?.download?.error);
    const nothing = await call('updates/open', {what: 'installer'});
    check('Open needs a verified download', nothing.status === 409);
    refusing = false;

    // No Video editor: the office's editor API, app and page are not part of the student app.
    refusing = true;
    const ed = await call('editor/projects'), app2 = await page.evaluate(() => fetch('/apps/filmcraft/').then(r => r.status));
    check('no editor API or app in the engine', ed.status === 404 && app2 === 404, {api: ed.status, app: app2});
    await go('editor'); await sleep(500);
    const edHost = await page.evaluate(() => { const r = document.querySelector('#cockpit-panel')?.shadowRoot; return {host: Boolean(r?.querySelector('#editor-host')), nav: [...(r?.querySelectorAll('[data-section]') || [])].some(b => b.dataset.section === 'editor'), frame: Boolean(r?.querySelector('iframe[src*="filmcraft"]'))} });
    check('no editor host, frame or navigation in the page', !edHost.host && !edHost.nav && !edHost.frame, edHost);
    refusing = false;
  } catch (e) {
    failed++; console.log('FAIL exception · ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
    console.log('app log (last lines):\n' + app.log().split('\n').slice(-25).join('\n'));
  } finally {
    await page.close().catch(() => {}); await app.stop();
    // A build without an update feed (the release configuration until the owner sets one up) says so and never checks.
    try {
      const off = await H.launch({name: 'updates-off', port: appPort + 2, mockPort});
      const p2 = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
      await p2.goto(off.launchURL); await sleep(400); await H.setupViaAPI(p2, off);
      const s = await p2.evaluate(() => fetch('/api/hq/v1/updates/check', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}).then(r => r.json()));
      check('without a feed the app says updates are not set up', s.configured === false && s.available === null && !s.checkedAt && !s.error && s.current === VERSION, s);
      await p2.goto(off.url + '/'); await sleep(2500);
      await p2.evaluate(() => { location.hash = '#workspace/updates' }); await sleep(1500);
      const t = await p2.evaluate(() => document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view')?.innerText || '');
      check('the page explains where new versions come from', /not set up in this build yet/.test(t) && /187N community/.test(t), t.slice(0, 200));
      await off.stop();
    } catch (e) { check('a build without a feed', false, e.message) }
    await browser.close();
    fs.rmSync(keyDir, {recursive: true, force: true});
    check('no console errors', problems.length === 0, problems);
    check('owner configuration unchanged', before === H.ownerSnapshot());
    console.log('\n' + (failed ? failed + ' check(s) failed' : 'all checks passed') + ' · screenshots: ' + app.dirs.shots);
    process.exitCode = failed ? 1 : 0;
  }
})();
