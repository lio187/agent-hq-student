// Creator Lab with Jev (TypeSafe), end to end against the stand-ins only: the TypeSafe key (a wrong one is refused,
// the check is free, the page's own key form), Jev as the first choice in the dialog, the quote (nothing paid), one
// Jev request per Reel with only Choice questions, the guard sentence and no transcript text inside a question
// (the stand-in refuses anything else), the answers stored in the same shape as the AI-tool route (dimensions,
// confidences, segment roles, the picked hook), the tokens on the run and the page, no agent run at all, a busy
// answer (529) retried, a refused key stopping the remaining Reels with a plain message, and the start refusals.
//   node tests/e2e/jev.cjs [appPort=4721] [mockPort=4720]
const path = require('path');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const appPort = Number(process.argv[2] || 4721), mockPort = Number(process.argv[3] || 4720);
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'jev', port: appPort, mockPort});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = []; let refusing = false;
  page.on('pageerror', e => problems.push('pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && !(refusing && /status of 4\d\d/.test(m.text())) && problems.push('console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push('HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  page.on('dialog', d => d.accept());
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== '' ? ' · ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')) };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mock = (p, body) => fetch(app.mockURL + p, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).then(r => r.json());
  const paid = async () => (await mock('/__paid')).calls;
  const call = (base, p, body) => page.evaluate(async ({url, body}) => {
    const r = await fetch(url, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    return {status: r.status, body: await r.json().catch(() => null)};
  }, {url: base + p, body});
  const hq = (p, body) => call('/api/hq/v1/', p, body), student = (p, body) => call('/api/student/', p, body);
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const viewText = () => page.evaluate(() => document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view')?.innerText || '');
  const previewText = () => page.evaluate(() => document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#preview-body')?.innerText || '');
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {}); await sleep(300) };
  const waitFor = async (fn, ms = 60000, every = 500) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(every) } return v };
  const closePreview = () => page.evaluate(() => document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#preview')?.close());
  const finished = id => waitFor(async () => { const r = await hq('marketing/analysis/' + id); return ['complete', 'failed', 'cancelled', 'interrupted'].includes(r.body?.run?.status) ? r.body : null }, 120000, 1000);
  const agentRuns = () => app.calls().filter(c => c.args.includes('--json-schema') || c.args.includes('--output-schema') || /classify the spoken scripts/i.test(c.args.join(' ')));
  const firstSentence = t => (String(t || '').match(/^[^.!?]*[.!?]/) || [String(t || '')])[0].trim();

  try {
    await page.goto(app.launchURL); await sleep(400);
    const setup = await H.setupViaAPI(page, app);
    check('setup through the app', Object.values(setup).every(r => r.status === 200), Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status])));
    await mock('/__reset', {});

    // Keys: a wrong TypeSafe key is refused, the right one is stored; the checks cost nothing.
    refusing = true; const wrong = await student('keys', {name: 'typesafe', key: 'wrong-key'}); await sleep(200); refusing = false;
    check('a wrong TypeSafe key is refused', wrong.status === 422 && /TypeSafe did not accept this key/.test(wrong.body?.error?.message || ''), wrong.body?.error?.message);
    const keys = [await student('keys', {name: 'apify', key: 'test-apify-key'}), await student('keys', {name: 'groq', key: 'test-groq-key'})];
    check('Apify and Groq keys stored', keys.every(k => k.status === 200 && k.body?.connected === true));
    check('key checks are free', (await paid()).length === 0);
    const state0 = await student('state');
    check('Setup reports TypeSafe as not connected yet', state0.body?.keys?.typesafe === false, state0.body?.keys);

    // The page: without a TypeSafe key the AI tool classifies; the page's own TypeSafe form stores the key.
    await page.goto(app.url + '/'); await sleep(3000);
    await page.evaluate(() => { location.hash = '#workspace/analysis' }); await settle();
    let text = await viewText();
    check('the page offers a TypeSafe key for Jev', /Jev \(with your TypeSafe key\)/.test(text) && /Add a TypeSafe key to use Jev/i.test(text), (text.match(/Classification[^\n]*\n[^\n]*/i) || [text.slice(0, 200)])[0].replace(/\s+/g, ' '));
    await shadow('[data-action="mk-analysis-key"][data-id="typesafe"]').click(); await sleep(400);
    check('the TypeSafe form links to the key page', /console\.typesafe\.ai\/keys/.test(await previewText()) && await shadow('#preview a[href="https://console.typesafe.ai/keys"]').count() === 1);
    refusing = true;
    await shadow('#an-key input[name=key]').fill('wrong-key'); await shadow('#an-key button[type=submit]').click();
    await waitFor(async () => /did not accept/i.test(await previewText()), 5000, 200);
    check('the page\'s TypeSafe form refuses a wrong key', /TypeSafe did not accept this key/i.test(await previewText()));
    await sleep(200); refusing = false;
    await shadow('#an-key input[name=key]').fill('test-typesafe-key'); await shadow('#an-key button[type=submit]').click();
    await waitFor(async () => (await student('state')).body?.keys?.typesafe === true, 5000, 200);
    await settle();
    text = await viewText();
    check('the key is stored and Jev classifies', (await student('state')).body?.keys?.typesafe === true && /Jev \(TypeSafe\) classifies the scripts with your own TypeSafe key/i.test(text), text.slice(0, 400).replace(/\s+/g, ' '));
    check('storing the key cost nothing', (await paid()).length === 0);

    // The dialog: Jev first, then the AI tools; the quote names TypeSafe; nothing paid before Start.
    await shadow('[data-action="mk-analysis-new"]').first().click(); await sleep(600);
    const options = await page.evaluate(() => [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('#an-form select[name=classifier] option')].map(o => ({value: o.value, text: o.textContent, selected: o.selected})));
    check('Jev is the first, selected choice; the AI tools stay available', options[0]?.value === 'jev' && options[0].selected && /Jev \(TypeSafe\)/.test(options[0].text) && options.some(o => /Researcher/.test(o.text)), options);
    await shadow('#an-form input[name=handle]').fill('@demo.creator');
    await shadow('#an-form input[name=count]').fill('6');
    await shadow('#an-form [data-action="mk-analysis-quote"]').click();
    await waitFor(async () => /at most/.test(await previewText()), 10000, 200);
    text = await previewText();
    check('the quote explains the Jev cost', /one Jev request per Reel \(at most 6\)/.test(text) && /billed by TypeSafe/.test(text), text.replace(/\s+/g, ' ').slice(0, 400));
    check('nothing paid before the confirm', (await paid()).length === 0);
    await page.screenshot({path: app.dirs.shots + '/jev-dialog.png'});
    await shadow('#an-form [data-action="mk-analysis-start"]').click();
    const runId = await waitFor(async () => (await hq('marketing/analysis')).body?.runs?.[0]?.id, 5000, 200);
    const done = await finished(runId);
    check('the Jev analysis finished', done?.run?.status === 'complete' && !done.run.error, done?.run && {status: done.run.status, error: done.run.error});
    check('the run is classified by Jev', done?.run?.classifier === 'jev' && done.run.runtimeName === 'Jev (TypeSafe)', {classifier: done?.run?.classifier, name: done?.run?.runtimeName});

    // How Jev was asked: one request per Reel with speech, all accepted by the stand-in's checks, no agent at all.
    const asked = (await mock('/typesafe/__calls')).calls, ok = asked.filter(c => c.status === 200);
    const posts = Object.fromEntries((done?.posts || []).map(p => [p.code, p]));
    const spoken = Object.values(posts).filter(p => p.transcript && p.status !== 'no_speech');
    check('one Jev request per Reel with speech', ok.length === spoken.length && asked.length === ok.length && ok.length === 6, asked.map(c => c.status + (c.why ? ' ' + c.why : '')));
    check('every request has the 8 dimensions, the hook pick and one role per segment', ok.every(c => ['mechanism', 'structure', 'opening', 'topic', 'evidence', 'emotion', 'specificity', 'cta'].every(d => c.questions.includes(d)) && c.questions.filter(q => q.startsWith('role_')).length === c.segments && (c.opening.length < 2 || c.questions.includes('hook'))));
    check('every question carries the guard sentence', ok.length > 0 && ok.every(c => c.guard));
    check('no agent run was used', agentRuns().length === 0, agentRuns().length);
    const billed = await paid();
    check('one paid Jev call per Reel, one Apify run, no other classification cost', billed.filter(c => c.service === 'typesafe').length === 6 && billed.filter(c => c.service === 'apify').length === 1, billed.map(c => c.service));

    // The answers, stored like the AI-tool route.
    const codes = ['RLA001', 'RLA002', 'RLA003', 'RLA004', 'RLA005', 'RLA006'];
    check('the six Reels with speech are classified', codes.every(c => posts[c]?.status === 'classified'), codes.map(c => c + ':' + posts[c]?.status + (posts[c]?.error ? ' ' + posts[c].error : '')));
    const byOpening = Object.fromEntries(ok.map(c => [c.opening[0], c]));
    const same = codes.every(c => { const p = posts[c], a = p?.analysis, q = byOpening[firstSentence(p?.transcript?.text)]; return a && q && ['mechanism', 'structure', 'opening', 'topic', 'evidence', 'emotion', 'specificity', 'cta'].every(d => a.dimensions[d] === q.answers[d].choice) });
    check('the stored dimensions are Jev\'s answers', same);
    check('confidences are kept, not used as a filter', codes.every(c => posts[c]?.analysis?.confidence?.mechanism === 0.82 && posts[c].analysis.classifier === 'jev'));
    check('segment roles come from Jev', codes.every(c => posts[c]?.analysis?.segments?.[0]?.role === 'hook' && posts[c].analysis.segments.every(s => typeof s.role === 'string' && s.text)));
    check('the hook is picked from the opening, never written', posts.RLA001?.analysis?.hook === 'Stop posting every day.' && posts.RLA002?.analysis?.hook === 'Want to know why your hooks fail?', [posts.RLA001?.analysis?.hook, posts.RLA002?.analysis?.hook]);
    check('the injected sentence was classified as data', posts.RLA006?.status === 'classified');
    const tokens = ok.reduce((n, c) => n + c.usage.input_tokens, 0);
    check('the run counts the tokens', done?.run?.tokens?.input === tokens && done.run.tokens.output === ok.reduce((n, c) => n + c.usage.output_tokens, 0), {run: done?.run?.tokens, expected: tokens});
    check('findings for every dimension', done?.findings?.length === 8 && done.findings.every(f => f.classified === 6), done?.findings?.map(f => f.key + ':' + f.classified));
    const exported = await hq('marketing/analysis/' + runId + '/export');
    check('the export says Jev classified it', /Classified by Jev \(TypeSafe\)/.test(exported.body?.note || ''), exported.body?.note);

    // The page after the run: the tile names Jev and the tokens; a post shows how sure Jev was.
    await waitFor(async () => await shadow('[data-an-live]').count() === 0 && await shadow('[data-action="mk-analysis-delete"]').count() === 1, 15000, 500);
    const counted = await waitFor(async () => /Analysed\s+6\s+classified by Jev \(TypeSafe\) · [\d.,]+K? tokens/i.test(await viewText()), 5000, 250);
    check('tiles name Jev and the tokens', Boolean(counted), ((await viewText()).match(/Analysed[^\n]*\n[^\n]*\n[^\n]*/i) || [''])[0].replace(/\s+/g, ' '));
    await page.screenshot({path: app.dirs.shots + '/jev-run.png', fullPage: true});
    await shadow('.vw[data-wall="analysis-wall"] [data-action="mk-analysis-tile"][data-id="analysis-wall|' + runId + '.RLA002"]').click(); await sleep(500);
    text = await previewText();
    check('post detail: what Jev found, with its confidence', /What Jev \(TypeSafe\) found/i.test(text) && /82% sure/.test(text) && await shadow('#preview .an-segs li[data-role="hook"]').count() >= 1, text.replace(/\s+/g, ' ').slice(0, 300));
    await page.screenshot({path: app.dirs.shots + '/jev-post.png'});
    await closePreview();

    // A busy answer (529) is retried; the Reel is still classified.
    await mock('/__reset', {}); await mock('/typesafe/__flaky', {count: 1});
    const q2 = await hq('marketing/analysis/quote', {handle: 'demo.creator', count: 3});
    const s2 = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 3, confirm: true, maxUsd: q2.body?.maxUsd, transcriber: 'groq'});
    check('without a choice, a stored TypeSafe key means Jev', s2.status === 200 && s2.body?.classifier === 'jev', s2.body?.classifier || s2.body?.error);
    const d2 = await finished(s2.body?.id), asked2 = (await mock('/typesafe/__calls')).calls;
    check('a 529 is retried and the Reels are classified', d2?.run?.status === 'complete' && !d2.run.error && d2.posts.every(p => p.status === 'classified') && asked2.filter(c => c.status === 529).length === 1 && asked2.filter(c => c.status === 200).length === 3,
      {status: d2?.run?.status, error: d2?.run?.error, calls: asked2.map(c => c.status)});

    // A refused key stops the remaining Reels with a plain message.
    await mock('/__reset', {}); await mock('/typesafe/__revoke', {on: true});
    const q3 = await hq('marketing/analysis/quote', {handle: 'demo.creator', count: 5});
    const s3 = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 5, confirm: true, maxUsd: q3.body?.maxUsd, transcriber: 'groq', classifier: 'jev'});
    const d3 = await finished(s3.body?.id), asked3 = (await mock('/typesafe/__calls')).calls;
    check('a refused key ends the run with a plain message', d3?.run?.status === 'complete' && /TypeSafe did not accept your key/.test(d3.run.error || ''), d3?.run && {status: d3.run.status, error: d3.run.error});
    check('the Reels become unclear, not wrong', d3?.posts?.length === 5 && d3.posts.every(p => p.status === 'unclear' && p.analysis?.dimensions?.topic === 'unclear' && /TypeSafe did not accept your key/.test(p.error || '')), d3?.posts?.map(p => p.status));
    check('the key was tried, then no more requests', asked3.length >= 1 && asked3.length <= 3 && asked3.every(c => c.status === 401), asked3.map(c => c.status));
    check('nothing was billed by TypeSafe', (await paid()).filter(c => c.service === 'typesafe').length === 0);
    await mock('/typesafe/__revoke', {on: false});

    // Start refusals: an unknown classifier, Jev without a key.
    refusing = true;
    const q4 = await hq('marketing/analysis/quote', {handle: 'demo.creator', count: 2});
    const bad = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 2, confirm: true, maxUsd: q4.body?.maxUsd, transcriber: 'groq', classifier: 'magic'});
    check('an unknown classifier is refused', bad.status === 422 && bad.body?.error?.code === 'bad_classifier', bad.body?.error);
    const removed = await student('keys', {name: 'typesafe', key: ''});
    const nokey = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 2, confirm: true, maxUsd: q4.body?.maxUsd, transcriber: 'groq', classifier: 'jev'});
    check('Jev without a key is refused', removed.status === 200 && nokey.status === 422 && /Add your TypeSafe key/.test(nokey.body?.error?.message || ''), nokey.body?.error);
    await sleep(200); refusing = false;
    const home = await hq('marketing/analysis');
    check('without the key the page falls back to the AI tool', home.body?.setup?.typesafe === false);
  } catch (e) {
    failed++; console.log('FAIL exception · ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
    console.log('app log (last lines):\n' + app.log().split('\n').slice(-25).join('\n'));
  } finally {
    await browser.close(); await app.stop();
    check('no console errors', problems.length === 0, problems);
    check('owner configuration unchanged', before === H.ownerSnapshot());
    console.log('\n' + (failed ? failed + ' check(s) failed' : 'all checks passed') + ' · screenshots: ' + app.dirs.shots);
    process.exitCode = failed ? 1 : 0;
  }
})();
