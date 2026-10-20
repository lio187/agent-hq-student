// Creator Lab (A3) end to end, against the stand-ins only: keys (a wrong Groq key is refused, checks are free), the
// page, its Credits and its Groq key form, the dialog's quote (nothing paid), the confirm → exactly one Apify run with
// a cost cap, media from the allowed hosts only, transcripts (Groq stand-in), classification by the claude stand-in
// (schema, no tools, fenced data, one repair, "unclear" after a second wrong answer), metrics and findings on the
// page, the wall and a post's transcript with segment roles, "Idea from this post", export, refusals without confirm
// or cap, cancel (the Apify run is aborted) and a run transcribed with ElevenLabs Scribe. The owner's AI-tool
// configuration must stay unchanged.
//   node tests/e2e/analysis.cjs [appPort=4631] [mockPort=4630]
const path = require('path');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const appPort = Number(process.argv[2] || 4631), mockPort = Number(process.argv[3] || 4630);
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'a3-analysis', port: appPort, mockPort, env: {HQS_SHIM_REPLIES: path.join(H.ROOT, 'tests/fixtures/analysis/replies')}});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true})).newPage();
  // Deliberate refusals (a wrong key, a start without confirm) answer 4xx; the browser logs those as console errors.
  const problems = []; let refusing = false;
  page.on('pageerror', e => problems.push('pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && !(refusing && /status of 4\d\d/.test(m.text())) && problems.push('console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push('HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  page.on('dialog', d => d.accept());
  let failed = 0;
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== '' ? ' · ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')) };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mock = (p, init) => fetch(app.mockURL + p, init).then(r => r.json());
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

  try {
    await page.goto(app.launchURL); await sleep(400);
    const setup = await H.setupViaAPI(page, app);
    check('setup through the app', Object.values(setup).every(r => r.status === 200), Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status])));
    await mock('/__reset', {method: 'POST'});

    // Keys: a wrong Groq key is refused (free check), the right ones are stored; nothing billable happened.
    refusing = true; const wrong = await student('keys', {name: 'groq', key: 'wrong-key'}); await sleep(200); refusing = false;
    check('a wrong Groq key is refused', wrong.status === 422, wrong.body?.error?.message);
    const keys = [await student('keys', {name: 'apify', key: 'test-apify-key'}), await student('keys', {name: 'groq', key: 'test-groq-key'})];
    check('Apify and Groq keys stored', keys.every(k => k.status === 200 && k.body?.connected === true));
    check('key checks are free', (await paid()).length === 0);

    // The page: requirements, Credits.
    await page.goto(app.url + '/'); await sleep(3000);
    await page.evaluate(() => { location.hash = '#workspace/analysis' }); await settle();
    let text = await viewText();
    check('Creator Lab page renders with requirements', /what this needs/i.test(text) && /analyse a creator/i.test(text) && /apify/i.test(text), text.slice(0, 160).replace(/\s+/g, ' '));
    await shadow('[data-action="mk-analysis-credits"]').first().click(); await sleep(500);
    text = await previewText();
    check('Credits show the MIT notice', /MIT License/.test(text) && /Copyright \(c\) 2026 Artem Novitckii/.test(text));
    await closePreview();
    const notice = require('fs').readFileSync(path.join(H.ROOT, 'app/Resources/THIRD-PARTY-NOTICES.txt'), 'utf8');
    const credits = await hq('marketing/analysis/credits');
    check('Credits carry the full licence text', credits.status === 200 && credits.body.text.includes(notice.slice(notice.indexOf('MIT License\n')).trim()));

    // The Groq key form on the page: a wrong key is refused with a plain message.
    await shadow('[data-action="mk-analysis-key"]').first().click(); await sleep(400);
    refusing = true;
    await shadow('#an-key input[name=key]').fill('wrong-key'); await shadow('#an-key button[type=submit]').click();
    await waitFor(async () => /did not accept/i.test(await previewText()), 5000, 200);
    check('the page\'s Groq key form refuses a wrong key', /Groq did not accept this key/i.test(await previewText()));
    await sleep(200); refusing = false;
    await closePreview();

    // The dialog: transcriber choices (only connected keys), the quote, nothing paid before Start.
    await shadow('[data-action="mk-analysis-new"]').first().click(); await sleep(600);
    const options = await page.evaluate(() => [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('#an-form select[name=transcriber] option')].map(o => o.value));
    check('only connected transcribers are offered', JSON.stringify(options) === '["groq"]', options);
    const runtimes = await page.evaluate(() => [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('#an-form select[name=classifier] option')].map(o => o.textContent));
    check('the AI tool choice names the agent', runtimes.some(t => /Researcher/.test(t)), runtimes);
    check('Start is disabled before the quote', await shadow('#an-form [data-action="mk-analysis-start"]').isDisabled());
    await shadow('#an-form input[name=handle]').fill('@demo.creator');
    await shadow('#an-form input[name=count]').fill('8');
    await shadow('#an-form [data-action="mk-analysis-quote"]').click();
    await waitFor(async () => /at most/.test(await previewText()), 10000, 200);
    text = await previewText();
    check('the quote shows the cap and the monthly limit', /\$0\.05 for 8 Reels of @demo\.creator/.test(text) && /monthly Apify limit/.test(text), text.replace(/\s+/g, ' ').slice(0, 300));
    check('nothing paid before the confirm', (await paid()).length === 0);
    await page.screenshot({path: app.dirs.shots + '/a3-analysis-dialog.png'});

    // Confirm → one capped Apify run, the live progress on the page.
    await shadow('#an-form [data-action="mk-analysis-start"]').click();
    const runId = await waitFor(async () => (await hq('marketing/analysis')).body?.runs?.[0]?.id, 5000, 200);
    check('the run started', Boolean(runId), runId);
    const live = await waitFor(async () => (await shadow('[data-an-live]').count()) > 0, 5000, 200);
    check('live progress shows while it runs', Boolean(live));
    const done = await waitFor(async () => { const r = await hq('marketing/analysis/' + runId); return ['complete', 'failed', 'cancelled', 'interrupted'].includes(r.body?.run?.status) ? r.body : null }, 120000, 1000);
    check('the analysis finished', done?.run?.status === 'complete', done?.run && {status: done.run.status, error: done.run.error, step: done.run.step});
    const calls = await paid(), apify = calls.filter(c => c.service === 'apify'), groq = calls.filter(c => c.service === 'groq');
    check('exactly one Apify run, with maxTotalChargeUsd', apify.length === 1 && apify[0].cap > 0 && apify[0].cap <= 0.05 + 1e-9, apify);
    check('one Groq transcription per Reel with sound', groq.length === 6, groq.map(c => c.file));
    const media = (await mock('/media/__log')).downloads.map(d => d.file);
    check('media came from the allowed stand-in only', media.length >= 8 && media.every(f => /^(reel-|thumb-)/.test(f)), media.length + ' downloads');

    // Stored transcripts and classification.
    const posts = Object.fromEntries((done?.posts || []).map(p => [p.code, p]));
    check('8 Reels stored', Object.keys(posts).length === 8, Object.keys(posts));
    check('transcripts stored with timed segments', ['RLA001', 'RLA002', 'RLA003', 'RLA004', 'RLA005', 'RLA006'].every(c => posts[c]?.transcript?.text?.length > 20 && posts[c].transcript.segments?.length >= 2 && posts[c].transcript.source === 'groq'));
    check('a Reel without sound is skipped', posts.RLA007?.status === 'no_audio', posts.RLA007?.status + ' · ' + posts.RLA007?.error);
    check('a media link outside Instagram is not downloaded', posts.RLA008?.status === 'failed' && /not on Instagram/.test(posts.RLA008?.error || ''), posts.RLA008?.error);
    check('classified Reels have dimensions and segment roles', ['RLA001', 'RLA002', 'RLA003', 'RLA004'].every(c => posts[c]?.status === 'classified' && posts[c].analysis?.dimensions?.mechanism && posts[c].analysis.segments?.[0]?.role === 'hook'));
    check('a wrong answer is repaired once', posts.RLA005?.status === 'classified' && posts.RLA005.analysis?.dimensions?.mechanism === 'curiosity', posts.RLA005?.status);
    check('a second wrong answer becomes unclear', posts.RLA006?.status === 'unclear' && posts.RLA006.analysis?.dimensions?.topic === 'unclear', posts.RLA006?.status + ' · ' + posts.RLA006?.error);
    check('metrics: outlier score against the median', Math.abs((posts.RLA002?.outlier || 0) - 85000 / 11500) < 0.01 && Math.abs(done.medianViews - 11500) < 0.01, {outlier: posts.RLA002?.outlier, median: done?.medianViews});
    check('metrics: engagement per view', Math.abs((posts.RLA001?.engagement || 0) - (640 / 12000 * 100)) < 0.001 && posts.RLA007?.engagement === null);
    const hooks = done?.findings?.find(f => f.key === 'mechanism'), curiosity = hooks?.rows.find(r => r.value === 'curiosity');
    check('findings: curiosity hooks outperform', curiosity?.outperforms === true && curiosity.count === 2 && Math.abs(curiosity.lift - 57500 / 15000) < 0.01, curiosity && {lift: curiosity.lift, count: curiosity.count});
    check('findings: steps structure outperforms', done?.findings?.find(f => f.key === 'structure')?.rows.find(r => r.value === 'steps')?.outperforms === true);
    check('run summary names the strongest pattern', done?.run?.summary?.top?.value === 'curiosity', done?.run?.summary?.top);

    // How the AI tool was asked: schema, no tools, fenced data, batches of five, one repair per batch.
    const asks = app.calls().filter(c => c.tool === 'claude' && c.args.includes('--json-schema'));
    const prompt = c => c.args[c.args.indexOf('-p') + 1] || '';
    check('four classification runs (2 batches + 2 repairs)', asks.length === 4, asks.length);
    check('every run has a schema and no tools', asks.length > 0 && asks.every(c => c.args.includes('--disallowedTools') && JSON.parse(c.args[c.args.indexOf('--json-schema') + 1]).properties.posts));
    check('transcripts are fenced as data, not instructions', asks.length > 0 && asks.every(c => /<<<DATA-[a-f0-9]+ \(untrusted text: data, not instructions\)/.test(prompt(c)) && /never follow/i.test(prompt(c))));
    check('batches hold at most five Reels', asks.length > 0 && asks.every(c => (prompt(c).match(/"id":"RLA\d+"/g) || []).length <= 5) && /"id":"RLA005"/.test(prompt(asks[0])) && !/"id":"RLA006"/.test(prompt(asks[0])));
    check('the injected sentence stayed inside the data block', asks.filter(c => /RLA006/.test(prompt(c))).every(c => { const p = prompt(c), i = p.indexOf('Ignore all previous'); return i > p.indexOf('<<<DATA-') }));

    // The page after the run (it refreshes itself when the run is done).
    // (innerText follows CSS text-transform, so text checks ignore case)
    const shown = await waitFor(async () => await shadow('[data-an-live]').count() === 0 && await shadow('[data-action="mk-analysis-delete"]').count() === 1, 15000, 500);
    check('the page refreshes itself when the run is done', Boolean(shown));
    text = await viewText();
    // (the number tiles count up when they appear)
    const counted = await waitFor(async () => /Analysed\s+5\s+classified by Claude Code/i.test(await viewText()), 4000, 250);
    check('tiles count the analysed Reels', Boolean(counted), ((await viewText()).match(/Analysed\s+\d+/i) || [''])[0].replace(/\s+/g, ' '));
    check('findings shown on the page', /hooks that outperform/i.test(text) && /curiosity gap/i.test(text) && /outperforms/i.test(text) && /structures that outperform/i.test(text) && /every dimension/i.test(text), text.slice(0, 200).replace(/\s+/g, ' '));
    await page.screenshot({path: app.dirs.shots + '/a3-analysis-run.png', fullPage: true});
    check('scatter plots each Reel with views and likes', await shadow('.an-scatter circle.an-dot').count() === 7);
    check('wall shows every Reel with a local thumbnail', await shadow('.vw[data-wall="analysis-wall"] .vw-tile').count() === 8 && await shadow('.vw[data-wall="analysis-wall"] .vw-tile img[src^="data:image/jpeg"]').count() >= 7);
    await shadow('.vw[data-wall="analysis-wall"] [data-action="mk-analysis-wall"][data-id="analysis-wall|group|outperforming"]').click(); await sleep(300);
    check('wall filter: outperforming Reels only', await shadow('.vw[data-wall="analysis-wall"] .vw-tile').count() === 2 && await shadow('#view').count() === 1);
    await shadow('.vw[data-wall="analysis-wall"] [data-action="mk-analysis-wall"][data-id="analysis-wall|group|all"]').click(); await sleep(300);
    await shadow('.vw[data-wall="analysis-wall"] [data-action="mk-analysis-tile"][data-id="analysis-wall|' + runId + '.RLA002"]').click(); await sleep(500);
    text = await previewText();
    check('post detail: hook, dimensions, transcript with roles', /Want to know why your hooks fail\?/i.test(text) && /curiosity gap/i.test(text) && /step by step/i.test(text) && await shadow('#preview .an-segs li[data-role="hook"]').count() === 1 && await shadow('#preview .an-segs li[data-role="cta"]').count() === 1);
    await page.screenshot({path: app.dirs.shots + '/a3-analysis-post.png'});
    await shadow('#preview [data-action="mk-analysis-idea"]').click();
    await waitFor(async () => /idea added/i.test(await previewText()), 5000, 200);
    check('Idea from this post', /idea added to your board/i.test(await previewText()));
    const after = await hq('marketing/analysis/' + runId);
    check('the idea is linked to the post', Boolean(after.body?.posts?.find(p => p.code === 'RLA002')?.idea?.id));
    const direct = await hq('marketing/analysis/post/' + runId + '.RLA001/idea', {});
    check('idea endpoint returns the new board item', direct.status === 200 && direct.body?.item?.status === 'Idea' && /Stop posting every day/.test(direct.body?.item?.title || ''), direct.body?.item);
    await closePreview();

    // Export.
    const exp = await hq('marketing/analysis/' + runId + '/export');
    check('export: posts, findings, no media links or images', exp.status === 200 && exp.body?.posts?.length === 8 && exp.body.findings?.length === 8 && exp.body.posts.every(p => !('thumb' in p) && !('videoUrl' in p)));
    const [download] = await Promise.all([page.waitForEvent('download', {timeout: 5000}).catch(() => null), shadow('[data-action="mk-analysis-export"]').click()]);
    check('Export JSON downloads a file', Boolean(download) && /^reel-analysis-demo\.creator-\d{4}-\d{2}-\d{2}\.json$/.test(download?.suggestedFilename() || ''), download?.suggestedFilename());

    // Refusals: no confirm, no cap, bad input; nothing paid.
    await mock('/__reset', {method: 'POST'});
    refusing = true;
    const noConfirm = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 3, maxUsd: 0.05, transcriber: 'groq'});
    const noCap = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 3, confirm: true, transcriber: 'groq'});
    const badHandle = await hq('marketing/analysis/quote', {handle: 'not a handle!', count: 3});
    const badCount = await hq('marketing/analysis/quote', {handle: 'demo.creator', count: 80});
    check('start is refused without confirm', noConfirm.status === 422 && noConfirm.body?.error?.code === 'confirm_required');
    check('start is refused without a cost cap', noCap.status === 422 && noCap.body?.error?.code === 'no_cap');
    check('a bad handle or count is refused', badHandle.status === 422 && badCount.status === 422);
    await sleep(200); refusing = false;
    check('refusals paid nothing', (await paid()).length === 0);

    // Cancel: the Apify run is aborted and nothing else runs.
    const q = await hq('marketing/analysis/quote', {handle: 'demo.creator', count: 3});
    const started = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 3, confirm: true, maxUsd: q.body?.maxUsd, transcriber: 'groq'});
    const cancelled = await hq('marketing/analysis/' + started.body?.id + '/cancel', {});
    check('cancel stops the run', started.status === 200 && cancelled.status === 200 && cancelled.body?.status === 'cancelled', {start: started.status, cancel: cancelled.body?.status});
    const aborted = await waitFor(async () => { const r = await mock('/apify/v2/actor-runs/run1', {headers: {Authorization: 'Bearer test-apify-key'}}); return r?.data?.status === 'ABORTED' ? r.data : null }, 8000, 300);
    check('the Apify run is aborted', aborted?.status === 'ABORTED', aborted?.status);
    await sleep(4500);
    const later = await hq('marketing/analysis/' + started.body?.id);
    const after2 = await paid();
    check('a cancelled run stays cancelled and transcribes nothing', later.body?.run?.status === 'cancelled' && after2.filter(c => c.service === 'groq').length === 0 && after2.filter(c => c.service === 'apify').length === 1, {status: later.body?.run?.status, paid: after2.map(c => c.service)});
    const del = await hq('marketing/analysis/' + started.body?.id + '/delete', {});
    refusing = true; const gone = await hq('marketing/analysis/' + started.body?.id); await sleep(200); refusing = false;
    check('a finished run can be deleted', del.status === 200 && gone.status === 404);

    // ElevenLabs Scribe as the transcriber (word timestamps grouped into sentences).
    const eleven = await student('keys', {name: 'elevenlabs', key: 'test-elevenlabs-key'});
    if (eleven.status !== 200) console.log('skip ElevenLabs run · the key check refused the test key (' + eleven.status + ')');
    else {
      await mock('/__reset', {method: 'POST'});
      const q3 = await hq('marketing/analysis/quote', {handle: 'demo.creator', count: 3});
      const s3 = await hq('marketing/analysis/start', {handle: 'demo.creator', count: 3, confirm: true, maxUsd: q3.body?.maxUsd, transcriber: 'elevenlabs'});
      const d3 = await waitFor(async () => { const r = await hq('marketing/analysis/' + s3.body?.id); return ['complete', 'failed', 'cancelled'].includes(r.body?.run?.status) ? r.body : null }, 90000, 1000);
      const p3 = d3?.posts || [], paid3 = await paid();
      check('ElevenLabs run: transcribed with Scribe and classified', d3?.run?.status === 'complete' && p3.length === 3 && p3.every(p => p.transcript?.source === 'elevenlabs' && p.transcript.segments.length >= 2 && p.status === 'classified'),
        {status: d3?.run?.status, posts: p3.map(p => p.code + ':' + p.status + ':' + (p.transcript?.segments?.length ?? '-'))});
      check('ElevenLabs run: one Scribe call per Reel, no Groq', paid3.filter(c => c.service === 'elevenlabs').length === 3 && paid3.filter(c => c.service === 'groq').length === 0 && paid3.filter(c => c.service === 'apify').length === 1, paid3.map(c => c.service));
    }

    // The list page after all of it.
    await shadow('[data-action="mk-analysis-back"]').first().click(); await settle();
    text = await viewText();
    check('the runs list shows the analysis and its strongest pattern', /@demo\.creator/i.test(text) && /hook: curiosity gap/i.test(text), text.slice(0, 240).replace(/\s+/g, ' '));
    await page.screenshot({path: app.dirs.shots + '/a3-analysis-list.png'});
  } catch (e) {
    failed++; console.log('FAIL exception · ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | '));
    console.log('app log (last lines):\n' + app.log().split('\n').slice(-25).join('\n'));
  } finally {
    await browser.close(); await app.stop();
    const afterSnap = H.ownerSnapshot();
    check('no console errors', problems.length === 0, problems);
    check('owner configuration unchanged', before === afterSnap);
    console.log('\n' + (failed ? failed + ' check(s) failed' : 'all checks passed') + ' · screenshots: ' + app.dirs.shots);
    process.exitCode = failed ? 1 : 0;
  }
})();
