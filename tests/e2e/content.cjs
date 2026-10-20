// Content (A1), with real clicks in the test build: an idea on the Board (arrow, keyboard and drag), an edit in the
// Library, the account's purpose, agent jobs (script with review, hooks without, a caption cancelled), Review,
// the teleprompter (Escape closes it and leaves the page alone), a campaign with Marketing-folder slides saved as a
// Zernio draft after the confirm (nothing published), the file endpoint's folder rules, and Studio's counts.
//   node tests/e2e/content.cjs [appPort=4611] [mockPort=4610]
const path = require('path'), fs = require('fs');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const port = Number(process.argv[2] || 4611), mockPort = Number(process.argv[3] || 4610);
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'a1-content', port, mockPort, env: {HQS_SHIM_REPLIES: path.join(H.ROOT, 'tests/fixtures/content/replies')}});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = [], results = []; let where = 'start';
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  page.on('dialog', d => { problems.push(where + ' · unexpected native dialog: ' + d.message()); d.dismiss() });
  const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ' · ' + detail : '')) };
  const S = sel => page.locator('#cockpit-panel').locator(sel);
  const api = (p, body) => page.evaluate(async ([p, body]) => { const r = await fetch('/api/hq/v1/' + p, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {}); return {status: r.status, type: r.headers.get('content-type'), body: /json/.test(r.headers.get('content-type') || '') ? await r.json() : null} }, [p, body]);
  const mock = p => fetch(app.mockURL + p).then(r => r.json());
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page|Reading your workspace/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {}); await page.waitForTimeout(300) };
  const go = async view => { where = view; await page.evaluate(v => { location.hash = '#workspace/' + v }, view); await settle() };
  const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await page.waitForTimeout(250) } return null };
  let shots = 0; const shot = name => page.screenshot({path: app.dirs.shots + '/' + String(shots++).padStart(2, '0') + '-' + name + '.png'});
  const item = async title => (await api('marketing/content')).body.items.find(i => i.title === title);
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    const setup = await H.setupViaAPI(page, app);
    // The writer runs on the claude stand-in.
    await page.evaluate(() => fetch('/api/student/agents', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({agents: [{id: 'writer', runtime: 'claude'}]})}));
    console.log('setup:', JSON.stringify(Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status]))));
    // Slides in the workspace's Marketing folder, plus a link that points outside it (it must never be served).
    const marketing = path.join(app.dirs.files, 'workspace/Marketing');
    fs.cpSync(path.join(H.ROOT, 'tests/fixtures/content/marketing'), marketing, {recursive: true});
    fs.copyFileSync(path.join(marketing, 'launch/slide-1.png'), path.join(app.dirs.files, 'outside.png'));
    fs.symlinkSync(path.join(app.dirs.files, 'outside.png'), path.join(marketing, 'evil.png'));
    await page.goto(app.url + '/'); await page.waitForTimeout(3500);
    await fetch(app.mockURL + '/__reset', {method: 'POST'});

    // ── Board: add two ideas, move with the arrow, drag, and the keyboard ──
    await go('team');
    check('board empty state', await S('#view .ui-state').filter({hasText: 'Your board is empty'}).count() === 1);
    for (const [title, hook] of [['Five tools that save me an hour', 'I got an hour back every morning.'], ['Behind the scenes of my week', '']]) {
      await S('#filters [data-action="mk-production-new"]').click();
      await S('#preview [data-mk-new] [name=title]').fill(title);
      if (hook) await S('#preview [data-mk-new] [name=hook]').fill(hook);
      await S('#preview [data-mk-new] button[type=submit]').click(); await settle();
    }
    const one = await item('Five tools that save me an hour'), two = await item('Behind the scenes of my week');
    check('two ideas added', one?.status === 'Idea' && two?.status === 'Idea' && await S('.mk-drop[data-stage="Idea"] .mk-card').count() === 2, 'account ' + one?.accountId);
    await S('[data-action="mk-production-move"][data-id="' + one.id + '|next"]').click(); await settle();
    check('arrow click moves Idea → Scripted', (await item(one.title)).status === 'Scripted' && await S('.mk-drop[data-stage="Scripted"] [data-item="' + one.id + '"]').count() === 1);
    await S('[data-item="' + one.id + '"]').dragTo(S('.kanban section[data-stage="To Edit"]')); await settle();
    check('drag moves Scripted → To Edit', (await item(one.title)).status === 'To Edit');
    await S('[data-action="mk-production-move"][data-id="' + one.id + '|prev"]').click(); await settle();
    check('arrow back To Edit → Scripted', (await item(one.title)).status === 'Scripted');
    await S('[data-action="mk-production-move"][data-id="' + two.id + '|next"]').focus(); await page.keyboard.press('Enter'); await settle();
    const keyed = (await item(two.title)).status;
    await S('[data-action="mk-production-move"][data-id="' + two.id + '|prev"]').focus(); await page.keyboard.press('Enter'); await settle();
    await shot('board');
    check('keyboard Enter moves and back', keyed === 'Scripted' && (await item(two.title)).status === 'Idea');

    // ── Library: search, open the editor, change fields, save ──
    await go('content');
    await S('#mk-search').fill('Five'); await page.waitForTimeout(400);
    check('library search filters', await S('[data-table="mk-library"] tbody tr').count() === 1);
    await S('[data-table="mk-library"] [data-action="mk-production-open"]').click();
    const ed = S('#preview [data-mk-editor]');
    await ed.locator('[name=title]').fill('Five tools that save me an hour a day');
    await ed.locator('[name=notes]').fill('Show each tool on screen for two seconds.');
    await ed.locator('[name=dueDate]').fill('2026-10-20');
    await shot('editor'); await ed.locator('button[type=submit]').click();
    await until(async () => /Saved/.test(await ed.locator('[data-mk-status]').innerText().catch(() => '')), 5000);
    const edited = await item('Five tools that save me an hour a day');
    check('library edit saved', edited?.notes === 'Show each tool on screen for two seconds.' && edited?.dueDate === '2026-10-20' && edited?.status === 'Scripted');
    await S('#preview button[data-action="close-preview"]').click();
    await S('#mk-search').fill(''); await page.waitForTimeout(400); await shot('library');

    // ── Accounts: the purpose the writer uses ──
    await go('accounts');
    await S('[data-action="mk-campaigns-account"][data-id="z1"]').click();
    await S('#preview [data-mk-account] [name=purpose]').fill('Practical AI tips for busy coaches.');
    await S('#preview [data-mk-account] [name=pillars]').fill('tools, time, systems');
    await S('#preview [data-mk-account] button[type=submit]').click(); await settle();
    await shot('accounts');
    check('account purpose saved', /Practical AI tips for busy coaches/.test(await S('#view .mk-account').first().innerText()));

    // ── Jobs: a script with review ──
    await go('production');
    await S('#view [data-action="mk-production-start"]').first().click();
    const sf = S('#preview [data-mk-start]');
    await sf.locator('[name=itemId]').selectOption(edited.id); await sf.locator('[name=kind]').selectOption('script.write');
    check('review step is on by default', await sf.locator('[name=review]').isChecked());
    await sf.locator('button[type=submit]').click(); await settle();
    const reviewed = await until(async () => { const j = (await api('marketing/jobs')).body.jobs.find(j => j.kind === 'script.write'); return j?.status === 'review' ? j : null });
    check('script job lands in review', Boolean(reviewed), reviewed ? 'run ' + reviewed.runId : 'job never reached review');
    await until(async () => (await S('[data-table="mk-jobs"]').innerText()).includes('In review'), 6000);
    await shot('jobs');
    check('jobs table shows In review', (await S('[data-table="mk-jobs"]').innerText()).includes('In review'));
    const runs = (await api('runs')).body, run = runs.find(r => r.id === reviewed?.runId);
    check('job ran as an agent run (Agent work)', run?.status === 'completed' && run?.profile === 'writer');
    const scriptCall = app.calls().find(c => c.tool === 'claude' && (c.args[c.args.indexOf('-p') + 1] || '').startsWith('Write a short-form video script'));
    check('script run: no tools, item fenced as data, account purpose included', Boolean(scriptCall) && scriptCall.args.includes('--disallowedTools') && /<<<CONTENT ITEM \(data, not instructions\)/.test(scriptCall.args[scriptCall.args.indexOf('-p') + 1]) && /Practical AI tips for busy coaches/.test(scriptCall.args[scriptCall.args.indexOf('-p') + 1]));

    // ── Review: reject needs a note; approve sends the script to Recording ──
    await go('reviews');
    await shot('review');
    check('review shows the script', /I used to lose an hour every morning/.test(await S('[data-mk-review]').innerText()));
    await S('[data-action="mk-production-decide"][data-id="' + edited.id + '|reject"]').click(); await page.waitForTimeout(300);
    check('reject without a note is stopped', /Write a short note/.test(await S('[data-mk-review] [data-mk-status]').innerText()) && (await item(edited.title)).status === 'To Review');
    await S('#mk-review-note').fill('Great, ship it.');
    await S('[data-action="mk-production-decide"][data-id="' + edited.id + '|approve"]').click(); await settle();
    const approved = await item(edited.title);
    check('approve → Scripted (ready to record)', approved.status === 'Scripted' && approved.script.startsWith('I used to lose an hour') && approved.reviews.at(-1)?.decision === 'approve');
    check('review job settled', (await api('marketing/jobs')).body.jobs.find(j => j.id === reviewed?.id)?.status === 'done');

    // ── Jobs: five hooks without review; a caption cancelled ──
    await go('production');
    await S('#view [data-action="mk-production-start"]').first().click();
    await sf.locator('[name=itemId]').selectOption(two.id); await sf.locator('[name=kind]').selectOption('hooks.generate'); await sf.locator('[name=review]').uncheck();
    await sf.locator('button[type=submit]').click(); await settle();
    const hooked = await until(async () => { const i = await item(two.title); return i?.hooks?.length === 5 ? i : null });
    const hookCall = app.calls().find(c => c.tool === 'claude' && (c.args[c.args.indexOf('-p') + 1] || '').startsWith('Write five different opening hooks'));
    check('hooks job: five hooks as JSON, no review', Boolean(hooked) && hooked.status === 'Idea' && hookCall?.args.includes('--json-schema') && (await api('marketing/jobs')).body.jobs.find(j => j.kind === 'hooks.generate')?.status === 'done');
    await go('production');
    await S('#view [data-action="mk-production-start"]').first().click();
    await sf.locator('[name=itemId]').selectOption(two.id); await sf.locator('[name=kind]').selectOption('caption.write');
    await sf.locator('button[type=submit]').click(); await settle();
    const cap = (await api('marketing/jobs')).body.jobs.find(j => j.kind === 'caption.write');
    await S('[data-action="mk-production-cancel"][data-id="' + cap.id + '"]').click();
    check('cancel asks first', await S('dialog.mk-confirm[open]').count() === 1);
    await S('dialog.mk-confirm [data-mk-confirm]').click(); await settle();
    const cancelled = (await api('marketing/jobs')).body.jobs.find(j => j.id === cap.id);
    await page.waitForTimeout(1500);
    check('caption job cancelled, caption untouched', cancelled.status === 'failed' && cancelled.detail.cancelled === true && !(await item(two.title)).caption && (await S('[data-table="mk-jobs"]').innerText()).includes('Cancelled'));

    // ── Recording: the teleprompter ──
    await go('record');
    await S('[data-action="mk-production-prompter"][data-id="' + edited.id + '"]').click();
    const tp = S('dialog.mk-prompter');
    check('teleprompter opens with the script', await tp.evaluate(d => d.open) && /I used to lose an hour/.test(await tp.locator('[data-mk-ptext]').innerText()));
    await tp.locator('[data-mk-p=play]').click(); await page.waitForTimeout(900); await shot('prompter');
    const scrolled = await tp.locator('.mk-pstage').evaluate(s => s.scrollTop);
    await page.keyboard.press(' '); const paused = await tp.locator('[data-mk-p=play]').innerText();
    await tp.locator('[data-mk-p=size]').fill('64'); await tp.locator('[data-mk-p=mirror]').check();
    const style = await tp.locator('[data-mk-ptext]').evaluate(t => ({size: t.style.fontSize, mirror: t.hasAttribute('data-mirror')}));
    check('start scrolls, Space pauses, size and mirror apply', scrolled > 0 && paused === 'Start' && style.size === '64px' && style.mirror, 'scrollTop ' + scrolled);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({hash: location.hash, title: document.querySelector('#cockpit-panel').shadowRoot.querySelector('#title').textContent, open: document.querySelector('#cockpit-panel').shadowRoot.querySelector('dialog.mk-prompter').open, ws: document.querySelector('#cockpit-panel').hidden}));
    check('Escape closes the teleprompter and stays on Recording', !after.open && after.hash === '#workspace/record' && after.title === 'Production' && !after.ws, JSON.stringify(after));
    await S('[data-action="mk-production-recorded"][data-id="' + edited.id + '"]').click(); await settle();
    await shot('record');
    check('Recorded → To Edit', (await item(edited.title)).status === 'To Edit');

    // ── Files: only from the Marketing folder or the app's media folders ──
    // Through the page's own session (its cookie), outside the page, so the refusals do not log console errors.
    const file = (p, headers = {}) => page.request.get(app.url + '/api/hq/v1/marketing/file?path=' + encodeURIComponent(p), {headers});
    const good = await file(path.join(marketing, 'launch/slide-1.png')), part = await file(path.join(marketing, 'launch/slide-1.png'), {Range: 'bytes=0-9'});
    const range = [part.status(), (await part.body()).length, part.headers()['content-range']];
    const refused = await Promise.all(['/etc/hosts', path.join(marketing, 'evil.png'), path.join(app.dirs.files, 'outside.png'), '../outside.png', path.join(marketing, 'launch/../../../outside.png')].map(p => file(p).then(r => r.status())));
    check('file endpoint serves Marketing PNGs (with ranges) and refuses the rest', good.status() === 200 && good.headers()['content-type'] === 'image/png' && range[0] === 206 && range[1] === 10 && refused.every(s => s === 404), 'refused ' + refused.join(',') + ' range ' + range.join(' '));

    // ── Campaigns: create, add Marketing-folder slides, link a piece, caption, Zernio draft after the confirm ──
    await go('campaigns');
    check('campaigns empty state', await S('#view .ui-state').filter({hasText: 'No campaigns yet'}).count() === 1);
    await S('#filters [data-action="mk-campaigns-new"]').click();
    await S('#preview [data-mk-camp-new] [name=name]').fill('Launch week');
    await S('#preview [data-mk-camp-new] [name=keyword]').fill('GUIDE');
    await S('#preview [data-mk-camp-new] button[type=submit]').click();
    await until(async () => await S('#preview [data-mk-campaign]').count() === 1, 5000);
    const camp = (await api('marketing/campaigns')).body.campaigns[0];
    await S('#preview [data-action="mk-campaigns-files"][data-id="' + camp.id + '|carousel"]').click();
    const pick = S('dialog.mk-confirm[open]');
    await until(async () => await pick.locator('input[name=file]').count() > 0, 5000);
    await shot('picker');
    const listed = await pick.locator('input[name=file]').evaluateAll(l => l.map(i => i.value.split('/').pop()));
    check('Marketing folder listed without the outside link', listed.length === 4 && !listed.includes('evil.png') && !listed.includes('outside.png'), listed.join(','));
    for (const n of ['slide-1.png', 'slide-2.png', 'slide-3.png']) await pick.locator('input[name=file][value$="/' + n + '"]').check();
    await pick.locator('[data-mk-confirm]').click();
    await until(async () => await S('#preview .slide--carousel img').count() === 3, 5000);
    const loaded = await S('#preview .slide--carousel img').evaluateAll(l => Promise.all(l.map(i => i.complete && i.naturalWidth ? i.naturalWidth : new Promise(r => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0) }))));
    check('carousel strip shows 3 slides', loaded.length === 3 && loaded.every(w => w > 0), 'widths ' + loaded.join(','));
    await S('#preview #mk-camp-link').selectOption(edited.id); await S('#preview [data-action="mk-campaigns-link"]').click();
    await until(async () => (await S('#preview .mk-pieces').innerText().catch(() => '')).includes('Five tools'), 5000);
    await S('#mk-camp-caption').fill('Five tools that give you an hour back. Comment GUIDE for the setup.');
    await S('#preview [data-mk-camp-form] button[type=submit]').click();
    await until(async () => /Saved/.test(await S('#preview [data-mk-status]').innerText().catch(() => '')), 5000);
    const saved = (await api('marketing/campaigns')).body.campaigns[0];
    check('campaign saved with piece, slides and caption', saved.itemIds.includes(edited.id) && saved.formats.carousel.length === 3 && /Comment GUIDE/.test(saved.caption) && (await item(edited.title)).campaignId === camp.id);
    // Cancel in the confirm: nothing reaches Zernio.
    await S('#preview [data-action="mk-campaigns-draft"]').click();
    await until(async () => await S('dialog.mk-confirm[open]').count() === 1, 5000);
    const text = await S('dialog.mk-confirm[open]').innerText(); await shot('draft-confirm');
    await S('dialog.mk-confirm[open] button[value=cancel]').click(); await page.waitForTimeout(500);
    const none = await mock('/zernio/__drafts');
    check('draft confirm explains and Cancel sends nothing', /Nothing is published or scheduled/.test(text) && /3 slides in one draft/.test(text) && none.drafts.length === 0 && (await mock('/zernio/__uploads')).uploads.length === 0);
    const paidBefore = (await mock('/__paid')).count;
    await S('#preview [data-action="mk-campaigns-draft"]').click();
    await until(async () => await S('dialog.mk-confirm[open]').count() === 1, 5000);
    await S('dialog.mk-confirm[open] [data-mk-confirm]').click();
    await until(async () => /Draft saved in Zernio/.test(await S('#preview [data-mk-status]').innerText().catch(() => '')), 10000);
    const [drafts, uploads, published, paid] = await Promise.all([mock('/zernio/__drafts'), mock('/zernio/__uploads'), mock('/zernio/__published'), mock('/__paid')]);
    const dr = drafts.drafts[0] || {};
    check('Zernio draft: isDraft, 3 uploaded slides, the account, the caption', drafts.drafts.length === 1 && dr.isDraft === true && !dr.publishNow && !dr.scheduledFor && dr.mediaItems?.length === 3 && dr.mediaItems.every(m => m.type === 'image') && uploads.uploads.length === 3 && uploads.uploads.every(u => u.uploaded && u.contentType === 'image/png' && u.bytes > 0) && dr.platforms?.[0]?.accountId === 'z1' && /Comment GUIDE/.test(dr.content) && Boolean(dr.idempotencyKey));
    check('nothing published, nothing paid', published.published.length === 0 && paid.count === paidBefore, 'published ' + published.published.length + ' paid ' + paid.count);
    const drafted = (await api('marketing/campaigns')).body.campaigns[0];
    await shot('campaign');
    check('campaign marked Drafted with the draft id', drafted.status === 'Drafted' && drafted.drafts[0]?.postIds?.length === 1);
    const noConfirm = await page.request.post(app.url + '/api/hq/v1/marketing/campaigns/' + camp.id + '/draft', {data: {format: 'carousel', accountIds: ['z1']}, headers: {Origin: app.url}});
    check('the draft endpoint refuses without confirm', noConfirm.status() === 400 && (await mock('/zernio/__drafts')).drafts.length === 1);
    await S('#preview button[data-action="close-preview"]').click(); await settle(); await shot('campaigns');

    // ── Studio: a new idea from Studio, then the counts ──
    await go('studio');
    await S('#view [data-action="mk-studio-new"]').click();
    await S('#preview [data-mk-new] [name=title]').fill('A myth about AI agents');
    await S('#preview [data-mk-new] button[type=submit]').click(); await settle();
    const counts = await S('#view .metrics [data-count]').evaluateAll(l => Object.fromEntries(l.map(e => [e.dataset.count, e.textContent])));
    const want = {Ideas: '2', 'Ready to record': '0', 'In the edit': '1', 'Your review': '0', 'Ready to post': '0', 'Posted · 30 days': '4'};
    await shot('studio');
    check('Studio counts', Object.entries(want).every(([k, v]) => counts[k] === v), JSON.stringify(counts));
    await S('.vw[data-wall="mk-own"]').scrollIntoViewIfNeeded(); await shot('studio-walls');
    check('Studio shows your best posts', await S('.vw[data-wall="mk-own"] .vw-tile').count() === 4);
    check('Studio flow bars', await S('.studio-flow li').count() === 7 && /Idea/.test(await S('.studio-flow').innerText()));
    await S('#view [data-action="mk-studio-go"][data-id="makers"]').first().click(); await settle();
    check('Make a carousel opens the maker', await page.evaluate(() => location.hash) === '#workspace/makers');

    // ── The contracts other areas call (test-build hooks): an idea from research, story renders from the maker
    //    into the campaign, a maker job; then Review shows the renders and the campaign drafts them as stories ──
    const idea = (await api('marketing/test/idea', {title: 'Signal: agents in retail', hook: 'Shops now run on agents.', source: {kind: 'signal', url: 'https://example.com/news', title: 'Example news'}})).body;
    check('addIdea: an Idea with its source', idea.status === 'Idea' && idea.sourceRef.url === 'https://example.com/news' && idea.hook === 'Shops now run on agents.');
    const renders = path.join(app.dirs.support, 'media/makers'); fs.mkdirSync(renders, {recursive: true});
    const storyFiles = [1, 2].map(n => { const f = path.join(renders, 'story-' + n + '.png'); fs.copyFileSync(path.join(marketing, 'launch/story-1.png'), f); return f });
    const story = (await api('marketing/test/attach', {itemId: null, kind: 'stories', title: 'Launch stories', files: storyFiles, slides: [{title: 'One', campaignId: camp.id}, {title: 'Two'}]})).body;
    const withStories = (await api('marketing/campaigns')).body.campaigns[0];
    check('attachRenders: a new item in Review, files on it and in the campaign stories', story.status === 'To Review' && story.files?.length === 2 && story.campaignId === camp.id && withStories.formats.story.length === 2 && withStories.itemIds.includes(story.id));
    const again = (await api('marketing/test/attach', {itemId: story.id, kind: 'stories', title: '', files: storyFiles.slice(0, 1), slides: [{campaignId: camp.id}]})).body;
    check('attachRenders again replaces that kind', again.files.length === 1 && (await api('marketing/campaigns')).body.campaigns[0].formats.story.length === 1);
    await api('marketing/test/attach', {itemId: story.id, kind: 'stories', title: '', files: storyFiles, slides: [{campaignId: camp.id}]});
    const mjob = (await api('marketing/test/job', {kind: 'stories', itemId: story.id, title: 'Stories · Launch stories', status: 'running', update: {status: 'review', detail: {slides: 2}}})).body;
    check('recordJob and updateJob', mjob.status === 'review' && mjob.detail.slides === 2 && mjob.itemId === story.id);
    await go('reviews'); await S('[data-action="mk-production-pick"][data-id="' + story.id + '"]').click(); await settle();
    const shown = await S('[data-mk-review] .pk-media-strip img').evaluateAll(l => Promise.all(l.map(i => i.complete && i.naturalWidth ? i.naturalWidth : new Promise(r => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0) }))));
    await shot('review-renders');
    check('Review shows the rendered stories from the media folder', shown.length === 2 && shown.every(w => w > 0) && /Approve · ready to post/.test(await S('[data-mk-review]').innerText()));
    await go('campaigns'); await S('#view [data-action="mk-campaigns-open"]').first().click();
    await until(async () => await S('#preview .slide--story img').count() === 2, 5000);
    await S('#preview [data-action="mk-campaigns-draft"]').click();
    await until(async () => await S('dialog.mk-confirm[open]').count() === 1, 5000);
    await S('dialog.mk-confirm[open] input[name=format][value=story]').check();
    await S('dialog.mk-confirm[open] [data-mk-confirm]').click();
    await until(async () => /2 drafts saved in Zernio/.test(await S('#preview [data-mk-status]').innerText().catch(() => '')), 10000);
    const all = (await mock('/zernio/__drafts')).drafts, stories = all.slice(1);
    check('stories draft: one draft per story, marked as a Story', all.length === 3 && stories.every(d => d.isDraft === true && d.mediaItems.length === 1 && d.platforms[0].platformSpecificData?.contentType === 'story') && (await mock('/zernio/__published')).published.length === 0);
  } catch (e) {
    check('no exception', false, e.stack?.split('\n').slice(0, 4).join(' | '));
    await page.screenshot({path: app.dirs.shots + '/failure.png'}).catch(() => {});
  } finally {
    await browser.close(); await app.stop();
    const after = H.ownerSnapshot();
    check('owner configuration unchanged', before === after);
    check('no console errors', problems.length === 0, problems.slice(0, 5).join(' || '));
    const failed = results.filter(r => !r).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
    process.exitCode = failed ? 1 : 0;
  }
})();
