// Research (workstream A2), end to end with real clicks against the stand-ins: Signals from every free source, an idea
// from a signal, a custom feed, angles from the researcher (no tools, fenced data), the Apify key and monthly limit
// through Setup, the watchlist, the cost check (nothing paid before the confirm click), a collection after the confirm
// (one paid run per platform, each with maxTotalChargeUsd), thumbnails (allow-list, 5 MB cap, no redirect out), the
// video wall with the official players, the charts, the fallback when an Apify tool cannot be capped, and the monthly
// limit blocking a run.
//   node tests/e2e/research.cjs [appPort=4621] [mockPort=4620]
const path = require('path'), fs = require('fs');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const port = Number(process.argv[2] || 4621), mockPort = Number(process.argv[3] || 4620);
  // A temporary price list (step "fallback") makes the first TikTok tool uncappable; it never outlives this check.
  // (The stand-in merges every pricing*.json in name order, so this file sorts last and wins.)
  const FALLBACK = path.join(__dirname, '../fixtures/apify/pricing-zz-a2-fallback-check.json');
  fs.rmSync(FALLBACK, {force: true});
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'a2-research', port, mockPort, env: {HQS_SHIM_REPLIES: path.join(__dirname, '../fixtures/research/replies')}});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  // The official embed players load from the platforms: answer them locally. Anything else that leaves this Mac fails.
  const embeds = [], outside = [];
  await context.route(u => !/^(http:\/\/127\.0\.0\.1[:/]|data:|blob:|about:)/.test(u.href), r => {
    const url = r.request().url();
    if (/^https:\/\/www\.(instagram\.com\/(p|reel)\/|tiktok\.com\/embed\/|youtube-nocookie\.com\/embed\/)/.test(url)) { embeds.push(url); return r.fulfill({contentType: 'text/html', body: '<!doctype html><title>Embed</title><p>Embed stand-in</p>'}) }
    outside.push(url); return r.abort();
  });
  const page = await context.newPage();
  const problems = []; let where = 'start';
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  // One refusal is triggered on purpose from the page (a bad handle); the browser logs that 4xx as a console error.
  let expected4xx = 0;
  page.on('console', m => { if (m.type() !== 'error') return; if (expected4xx > 0 && /status of 4\d\d/.test(m.text())) { expected4xx--; return } problems.push(where + ' · console ' + m.text().slice(0, 200)) });
  page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ' · ' + detail : '')) };
  const mock = async (p, post) => (await fetch(app.mockURL + p, post ? {method: 'POST'} : {})).json();
  const paid = async () => (await mock('/__paid')).count;
  // Direct API calls with the window's session (same cookie and Origin as the page), outside the page's console.
  const call = async (p, b, base = '/api/hq/v1/') => {
    const r = b === undefined ? await page.request.get(app.url + base + p) : await page.request.post(app.url + base + p, {headers: {Origin: app.url}, data: b});
    return {status: r.status(), body: await r.json().catch(() => null)};
  };
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const inView = async loc => { await loc.evaluate(e => e.scrollIntoView({block: 'center'})); await page.waitForTimeout(150) };
  const click = async loc => { await inView(loc); await loc.click() };
  const until = async (fn, ms = 20000, step = 400) => { const end = Date.now() + ms; for (;;) { const v = await fn().catch(() => null); if (v || Date.now() > end) return v; await page.waitForTimeout(step) } };
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {}); await page.waitForTimeout(300) };
  const go = async view => { await page.evaluate(v => { location.hash = '#workspace/' + v }, view); await settle() };
  const ideaResponse = () => page.waitForResponse(r => /\/idea$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', {timeout: 10000});
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    console.log('setup:', JSON.stringify(Object.fromEntries(Object.entries(await H.setupViaAPI(page, app)).map(([k, v]) => [k, v.status]))));
    await mock('/__reset', true);

    // 1. Setup → Research: the Apify key, the monthly limit and the topics.
    where = 'setup';
    // (Launch lands on /setup before the licence is in; a fresh load reads the finished setup.)
    await page.goto(app.url + '/'); await page.goto(app.url + '/setup#research'); await page.waitForSelector('#key-apify');
    check('setup step shows the Apify and Groq key cards and the limit', await page.locator('#key-groq').count() === 1 && await page.locator('#rs-cap').count() === 1);
    await page.fill('#key-apify', 'test-apify-key'); await page.click('[data-key-save="apify"]');
    await page.waitForSelector('[data-key-remove="apify"]', {timeout: 10000}).catch(() => {});
    const keys = (await call('state', undefined, '/api/student/')).body.keys;
    check('Apify key saved through Setup (checked with the stand-in)', keys.apify === true && keys.groq === false);
    await until(async () => (await page.inputValue('#rs-cap')) !== '');
    await page.fill('#rs-cap', '5'); await page.click('#rs-cap-save');
    check('monthly limit saved through Setup', Boolean(await until(async () => /Saved/.test(await page.textContent('#rs-cap-status')))));
    await page.fill('#rs-topics', 'AI agents, automation'); await page.click('#rs-topics-save');
    await until(async () => /Saved/.test(await page.textContent('#rs-topics-status')));
    check('topics saved through Setup', JSON.stringify((await call('research/setup', undefined, '/api/student/')).body.topics) === '["AI agents","automation"]');
    check('nothing paid during Setup', await paid() === 0);

    // 2. Signals from every free source.
    where = 'signals';
    await page.goto(app.url + '/'); await page.waitForTimeout(2500); await go('research');
    const allCurrent = await page.waitForFunction(() => { const r = document.querySelector('#cockpit-panel').shadowRoot; return r.querySelectorAll('.health-row[data-state="current"]').length >= 4 && r.querySelectorAll('.rs-signal').length > 0 }, null, {timeout: 25000}).then(() => true).catch(() => false);
    check('Signals page loads every source', allCurrent);
    let s = (await call('marketing/signals')).body;
    const bySource = id => s.signals.filter(x => x.source === id).length;
    check('signals from GitHub, Hacker News, Hugging Face and OpenAI news', ['github', 'hn', 'hf', 'openai'].every(id => bySource(id) > 0), ['github', 'hn', 'hf', 'openai'].map(id => id + ' ' + bySource(id)).join(', '));
    check('de-duplicated by address (a repository also on Hacker News shows once)', s.signals.filter(x => /agent-runner/.test(x.url)).length === 1 && s.signals.some(x => (x.also || []).includes('Hacker News')));
    check('old items are left out (7 days for search, 14 for feeds)', !s.signals.some(x => /too-old|example-old-post/.test(x.url)));
    check('sorted by score', s.signals.every((x, i, a) => !i || a[i - 1].score >= x.score));
    const gh = await mock('/github/__calls'), hn = await mock('/hn/__calls');
    check('GitHub searched per topic for repositories from the last 7 days, by stars', gh.calls.length >= 2 && gh.calls.every(c => /created:>=\d{4}-\d{2}-\d{2}/.test(c.q) && c.sort === 'stars'));
    check('Hacker News searched for recent stories', hn.calls.length >= 2 && hn.calls.every(c => /created_at_i>\d+/.test(c.filters) && c.tags === 'story'));
    await settle();
    const shown = await page.evaluate(() => [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('.rs-signal')].map(e => [e.dataset.signal, e.querySelector('.rs-score').textContent, e.querySelector('small').textContent]));
    check('the list shows the signals with score and source', shown.length > 0 && shown.every(([id, score, meta]) => s.signals.some(x => x.id === id) && Number(score) >= 0 && /GitHub|Hacker News|Hugging Face|OpenAI/.test(meta)), shown.length + ' shown, ' + s.signals.length + ' in the API');

    // An idea from a signal (Content.addIdea).
    const firstIdea = shadow('[data-action="mk-research-idea"]').first(), ideaFor = await firstIdea.getAttribute('data-id');
    const ideaWait = ideaResponse(); await click(firstIdea); const idea = await (await ideaWait).json();
    check('Idea button adds the signal to the board (Content.addIdea)', /^item_/.test(idea.item?.id || '') && idea.item?.status === 'Idea', JSON.stringify(idea.item));
    check('the signal shows as added', Boolean(await until(async () => (await call('marketing/signals')).body.signals.find(x => x.id === ideaFor)?.ideaId)) && await shadow('.rs-signal .pill.connected').count() >= 1);

    // A custom feed (Atom), then the source chip filter.
    await shadow('#rs-feed').fill(app.mockURL + '/rss/student-feed.xml'); await click(shadow('[data-action="mk-research-feed-add"]'));
    const feedIn = await until(async () => { const d = (await call('marketing/signals')).body; return d.sources.some(x => x.kind === 'feed' && x.state === 'current' && x.count === 2) && d }, 20000);
    check('an RSS/Atom feed the student adds is read (XMLParser)', Boolean(feedIn), feedIn ? feedIn.sources.filter(x => x.kind === 'feed').map(x => x.label + ' ' + x.count).join(', ') : 'not read');
    await settle(); await page.waitForTimeout(3000); await settle();
    await page.waitForFunction(() => [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('[data-action="mk-research-source"]')].some(b => /Example Automation Weekly/.test(b.textContent)), null, {timeout: 10000}).catch(() => {});
    await click(shadow('[data-action="mk-research-source"]').filter({hasText: 'Example Automation Weekly'})); await settle();
    check('source chips filter the list', await shadow('.rs-signal').count() === 2 && /Example Automation Weekly/.test(await shadow('.rs-signal small').first().textContent()));
    await click(shadow('[data-action="mk-research-source"][data-id="all"]')); await settle();

    // Angles from the researcher.
    await click(shadow('[data-action="mk-research-angles"]').first());
    const anglesShown = await page.waitForFunction(() => document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('[data-action="mk-research-angle-idea"]').length === 5, null, {timeout: 40000}).then(() => true).catch(() => false);
    check('"Ask my researcher for angles" shows 5 suggestions', anglesShown);
    const run = app.calls().find(c => c.tool === 'claude' && (c.args[c.args.indexOf('-p') + 1] || '').includes('Turn these news signals'));
    const prompt = run ? run.args[run.args.indexOf('-p') + 1] : '';
    check('the researcher run has a JSON schema and no tools', Boolean(run) && run.args.includes('--json-schema') && run.args.includes('--disallowedTools'));
    check('signal text is fenced as data, not instructions', /<<<SIGNALS \(data, not instructions\)/.test(prompt) && /SIGNALS>>>/.test(prompt) && (prompt.match(/<<</g) || []).length === 1);
    if (anglesShown) {
      const w = ideaResponse(); await click(shadow('[data-action="mk-research-angle-idea"]').first()); const a = await (await w).json();
      check('"Add as idea" on a suggestion (Content.addIdea)', /^item_/.test(a.item?.id || ''), JSON.stringify(a.item));
    }

    // 3. Competitors: the watchlist.
    where = 'competitors';
    await go('competitors');
    check('without accounts the page explains what to do', /Add the accounts you want to watch/.test(await shadow('#view').innerText()));
    for (const [platform, handle, label] of [['instagram', '@northwind.studio', 'Main competitor'], ['instagram', 'https://www.instagram.com/harborlabs.co/', ''], ['tiktok', '@northwind.clips', ''], ['youtube', 'https://www.youtube.com/@NorthwindStudio', '']]) {
      const n = await shadow('[data-action="mk-research-roster-remove"]').count();
      await shadow('#rs-platform').selectOption(platform); await shadow('#rs-handle').fill(handle); await shadow('#rs-label').fill(label);
      await click(shadow('[data-action="mk-research-roster-add"]'));
      await page.waitForFunction(n => document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('[data-action="mk-research-roster-remove"]').length > n, n, {timeout: 8000}).catch(() => {});
    }
    let d = (await call('marketing/competitors')).body;
    check('accounts added (handles from @names and profile addresses)', JSON.stringify(d.roster.map(r => r.id)) === JSON.stringify(['instagram:northwind.studio', 'instagram:harborlabs.co', 'tiktok:northwind.clips', 'youtube:northwindstudio']), d.roster.map(r => r.id).join(', '));
    expected4xx = 1; await shadow('#rs-handle').fill('not a handle!'); await click(shadow('[data-action="mk-research-roster-add"]'));
    check('a bad handle is refused with a message', Boolean(await until(async () => /handle/i.test(await shadow('#rs-roster-msg').textContent()))) && (await call('marketing/competitors')).body.roster.length === 4);

    // The cost check: nothing is paid before the confirm click.
    await mock('/__reset', true);
    await click(shadow('[data-action="mk-research-quote"]'));
    await shadow('#preview [data-quote-total]').waitFor({timeout: 15000});
    const total = Number((await shadow('#preview [data-quote-total]').textContent()).replace('$', ''));
    const quote = (await call('marketing/competitors/quote', {})).body;
    check('the dialog shows each platform, the maximum and the monthly limit', await shadow('#preview .rs-quote .row').count() === 3 && total === quote.maxUsd && total > 0 && /monthly limit/i.test(await shadow('#preview').innerText()), 'at most $' + total);
    check('quote picks cappable pay-per-result tools', quote.platforms.every(p => p.cappable && p.maxUsd >= 0.05) && quote.platforms.map(p => p.actor).join(',') === 'apify~instagram-scraper,clockworks~free-tiktok-scraper,streamers~youtube-scraper');
    check('/__paid is 0 before the confirm click', await paid() === 0);
    const collectRefused = [await call('marketing/competitors/collect', {maxUsd: total}), await call('marketing/competitors/collect', {confirm: true})];
    check('collect is refused without confirm or without a maximum', collectRefused.every(r => r.status === 422) && await paid() === 0, collectRefused.map(r => r.body?.error?.code).join(', '));

    // Confirm: one paid run per platform, each with a hard cost limit.
    await click(shadow('#preview [data-action="mk-research-collect"]'));
    d = await until(async () => { const x = (await call('marketing/competitors')).body; return x.collection?.status === 'done' && !x.thumbsPending && x }, 45000, 800);
    const p = await mock('/__paid');
    check('collection finished after the confirm', Boolean(d), d ? d.collection.runs.map(r => r.label + ' ' + r.items).join(', ') : 'still running');
    check('one paid run per platform, each with maxTotalChargeUsd', p.count === 3 && p.calls.every(c => c.cap > 0) && Math.abs(p.calls.reduce((t, c) => t + c.cap, 0) - total) < 0.001, p.calls.map(c => c.actor + ' cap ' + c.cap).join(', '));
    check('the ledger records every run within the monthly limit', d && d.ledger.runs.length === 3 && d.ledger.monthUsd <= d.ledger.capUsd);
    check('posts normalised with views, likes, comments and dates', d && d.posts.length === 13 && d.posts.every(x => x.url.startsWith('https://') && x.publishedAt && x.account) && d.posts.filter(x => x.views != null).length === 11);
    const noThumb = d ? d.posts.filter(x => !x.thumb).map(x => x.id).sort() : [];
    check('thumbnails cached; refused: over 5 MB, a host off the allow-list, a redirect out', JSON.stringify(noThumb) === JSON.stringify(['instagram:DHb2zA4bC5d', 'instagram:DNw3kL6mN7o', 'instagram:DNw4pQ8rS9t']), noThumb.join(', '));

    // The wall, what is working and the charts.
    await page.waitForFunction(() => document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('.vw[data-wall="research-competitors"] .vw-tile').length === 13, null, {timeout: 15000}).catch(() => {});
    await settle();
    check('the video wall renders every post', await shadow('.vw[data-wall="research-competitors"] .vw-tile').count() === 13);
    const imgs = await page.evaluate(async () => { const list = [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('.vw-tile img')]; await Promise.all(list.map(i => i.decode().catch(() => {}))); return list.map(i => i.naturalWidth) });
    check('thumbnails load from the app (marketing/media)', imgs.length === 10 && imgs.every(w => w > 0), imgs.length + ' images');
    await click(shadow('.vw[data-wall="research-competitors"] [data-action="mk-research-wallnav"]').filter({hasText: 'TikTok'}));
    check('the wall filters by platform', await shadow('.vw[data-wall="research-competitors"] .vw-tile').count() === 3);
    await click(shadow('.vw[data-wall="research-competitors"] [data-action="mk-research-wallnav"]').filter({hasText: 'All'}).first());
    await click(shadow('.vw[data-wall="research-competitors"] .vw-tile').first());
    const frame = await shadow('#preview iframe').getAttribute('src', {timeout: 8000}).catch(() => '');
    check('a tile opens the official player (embed)', /^https:\/\/www\.(instagram\.com\/(p|reel)\/[\w-]+\/embed|tiktok\.com\/embed\/v2\/\d+|youtube-nocookie\.com\/embed\/[\w-]+)/.test(frame || ''), frame);
    const pw = ideaResponse(); await shadow('#preview [data-action="mk-research-post-idea"]').click(); const pi = await (await pw).json();
    check('"Turn into an idea" from a competitor post (Content.addIdea)', /^item_/.test(pi.item?.id || ''));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    check('"What is working" shows the fastest-rising posts', await shadow('.rs-card').count() >= 4 && (d.rising || []).every((x, i, a) => !i || a[i - 1].growth >= x.growth) && d.rising.every(x => 'growth' in x && 'thumb' in x && 'views' in x));
    check('charts: views by creator and posting rhythm', await shadow('.viz-bars li').count() === 4 && await shadow('.viz-columns').count() === 3);
    const media = await page.evaluate(async u => { const r = await fetch(u); return {status: r.status, type: r.headers.get('content-type')} }, d.posts.find(x => x.thumb).thumb);
    check('marketing/media serves a cached thumbnail', media.status === 200 && media.type === 'image/png');
    check('marketing/media refuses an unknown post', (await call('marketing/media?id=nope')).status === 404);

    // Weekly collection: only on after a confirm with a maximum; switching it on starts nothing paid by itself.
    const paidNow = await paid();
    check('weekly collection is refused without a confirmed maximum', (await call('marketing/competitors/auto', {enabled: true})).status === 422);
    await click(shadow('[data-action="mk-research-auto-quote"]'));
    await shadow('#preview [data-action="mk-research-auto-on"]').waitFor({timeout: 15000});
    await shadow('#preview [data-action="mk-research-auto-on"]').click();
    const autoOn = await until(async () => /Weekly collection is on/.test(await shadow('#view').innerText()));
    const auto = (await call('marketing/competitors')).body.auto;
    check('weekly collection switched on with the confirmed maximum, nothing paid', Boolean(autoOn) && auto.enabled === true && auto.maxUsd === quote.maxUsd && await paid() === paidNow);
    await click(shadow('[data-action="mk-research-auto-off"]'));
    check('weekly collection switched off', Boolean(await until(async () => (await call('marketing/competitors')).body.auto.enabled === false)));

    // An Apify tool that cannot be capped is not used: the next one is offered, with the reason.
    fs.writeFileSync(FALLBACK, JSON.stringify({'clockworks~free-tiktok-scraper': {pricingModel: 'PAY_PER_EVENT', isPayPerEventWithPlatformUsage: true, pricingPerEvent: {actorChargeEvents: {result: {isPrimaryEvent: true, eventTieredPricingUsd: {FREE: {tieredEventPriceUsd: 0.003}}}}}}}));
    const fb = (await call('marketing/competitors/quote', {platform: 'tiktok'})).body.platforms?.[0] || {};
    fs.rmSync(FALLBACK, {force: true});
    check('an uncappable tool is skipped with the reason, the next one is used', fb.actor === 'clockworks~tiktok-scraper' && fb.cappable && fb.maxUsd >= 0.5 && /compute time/.test((fb.skipped || []).join(' ')), (fb.skipped || []).join(' '));

    // The monthly limit blocks a run over it.
    const month = d.ledger.monthUsd;
    await call('research/cap', {usd: Math.round((month + 0.05) * 100) / 100}, '/api/student/');
    await page.evaluate(() => { location.hash = '#workspace/competitors' }); await settle();
    const paidBefore = await paid();
    await click(shadow('[data-action="mk-research-quote"]'));
    await shadow('#preview [data-quote-total]').waitFor({timeout: 15000});
    check('over the limit: the confirm button is disabled and says why', await shadow('#preview [data-action="mk-research-collect"]').isDisabled() && /go over your monthly limit/.test(await shadow('#preview').innerText()));
    const over = await call('marketing/competitors/collect', {confirm: true, maxUsd: quote.maxUsd});
    check('over the limit: the engine refuses the run, nothing is paid', over.status === 422 && over.body?.error?.code === 'over_cap' && await paid() === paidBefore, over.body?.error?.message);
    await page.keyboard.press('Escape');
    await call('research/cap', {usd: 5}, '/api/student/');

    check('no request left this Mac (embeds answered locally)', outside.length === 0, outside.slice(0, 3).join(', '));
  } catch (e) { failed++; console.log('FAIL ' + where + ' · ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')) }
  finally {
    fs.rmSync(FALLBACK, {force: true});
    await browser.close(); await app.stop();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    process.exitCode = failed || problems.length || before !== after ? 1 : 0;
    console.log(process.exitCode ? 'RESEARCH E2E FAILED' : 'RESEARCH E2E PASSED');
  }
})();
