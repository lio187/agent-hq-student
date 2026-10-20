// Second brain (A7): Obsidian vaults found from a fake obsidian.json, one-click connect in Setup, several folders with
// front matter, aliases and links, the live watcher, a new starter brain, "Give my agents my brain" (fake home only,
// byte-identical removal, backups, --add-dir on runs), Save to brain, and the Brain map reading a note.
//   node tests/e2e/brain.cjs [appPort=4671] [mockPort=4670]
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const FIX = path.join(__dirname, '../fixtures/brain');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 8000, step = 200) { const end = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v } catch {} if (Date.now() > end) return null; await sleep(step) } }

(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'a7-brain', port: Number(process.argv[2] || 4671), mockPort: Number(process.argv[3] || 4670)});
  const home = app.dirs.home, results = [], problems = [];
  const check = (name, ok, detail = '') => { results.push(Boolean(ok)); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '  · ' + detail : '')) };

  // Fixtures in the fake home: two vaults, Obsidian's vault list (plus one vault that no longer exists), and the AI
  // tools' own instruction files (Codex without a final line break, Hermes with one, Claude Code without a file).
  const vaults = path.join(home, 'Vaults'); fs.cpSync(path.join(FIX, 'vaults'), vaults, {recursive: true});
  const work = path.join(vaults, 'Work Brain'), reading = path.join(vaults, 'Reading Notes'), notes = app.dirs.files + '/notes';
  fs.mkdirSync(path.join(home, 'Library/Application Support/obsidian'), {recursive: true});
  fs.writeFileSync(path.join(home, 'Library/Application Support/obsidian/obsidian.json'), JSON.stringify({vaults: {
    a1b2c3d4e5f60718: {path: work, ts: 1760000000000, open: true}, b2c3d4e5f6071829: {path: reading, ts: 1750000000000}, c3d4e5f60718293a: {path: path.join(home, 'Gone vault'), ts: 1700000000000}}, cli: true}));
  const agentFile = {claude: path.join(home, '.claude/CLAUDE.md'), codex: path.join(home, '.codex/AGENTS.md'), hermes: path.join(home, '.hermes/SOUL.md')};
  fs.writeFileSync(agentFile.codex, 'Codex house rules.\nKeep answers short.');
  fs.writeFileSync(agentFile.hermes, '# Soul\n\nYou are a careful assistant.\n');
  const original = {codex: fs.readFileSync(agentFile.codex), hermes: fs.readFileSync(agentFile.hermes)};

  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  let where = 'start';
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  // A refusal the test asks for on purpose (409, 422) is logged by the browser as a failed load; that one is expected.
  page.on('console', m => m.type() === 'error' && !(where.includes('expected refusal') && /Failed to load resource.*(409|422)/.test(m.text())) && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  const call = (base, p, body) => page.evaluate(async ({url, body}) => {
    const r = await fetch(url, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const t = await r.text(); let b = null; try { b = JSON.parse(t) } catch { b = t } return {status: r.status, body: b};
  }, {url: base + p, body});
  const hq = (p, b) => call('/api/hq/v1/', p, b), st = (p, b) => call('/api/student/', p, b);
  const status = async () => (await hq('brain/status')).body;
  const folder = (s, p) => s.folders.find(f => f.path === p);
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 10000}).catch(() => {}); await page.waitForTimeout(300) };

  try {
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    const setup = await H.setupViaAPI(page, app);
    check('setup through the API', Object.values(setup).every(r => r.status === 200), JSON.stringify(Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status]))));

    where = 'migration';
    let s = await status();
    check('the old notes folder becomes the first brain folder', s.folders.length === 1 && s.folders[0].path === notes && s.folders[0].main && s.folders[0].notes === 4, JSON.stringify(s.folders.map(f => [f.name, f.notes, f.links])));

    where = 'vaults';
    const v = (await st('brain/vaults')).body;
    const byName = Object.fromEntries(v.vaults.map(x => [x.name, x]));
    check('vaults detected from obsidian.json', v.found && v.vaults.length === 3 && byName['Work Brain']?.exists && byName['Reading Notes']?.exists && byName['Gone vault']?.exists === false,
      v.vaults.map(x => x.name + (x.exists ? '' : ' (missing)') + ' ' + x.notes).join(', '));
    check('quick note counts skip .obsidian, .trash and node_modules', byName['Work Brain']?.notes === 4 && byName['Reading Notes']?.notes === 2 && v.vaults[0].name === 'Work Brain');

    where = 'Setup › Second brain';
    await page.goto(app.url + '/setup#brain'); await page.reload();  // the wizard was already open on /setup: load it again after setup
    await page.waitForSelector('[data-bconnect]', {timeout: 8000});
    const cards = await page.locator('[data-bconnect]').count();
    check('Setup shows the detected vaults as cards', cards === 2, cards + ' cards');
    await page.locator('[data-bconnect="' + work + '"]').click();
    await page.waitForFunction(() => /Connected\./.test(document.querySelector('#bstatus')?.textContent || ''), null, {timeout: 10000}).catch(() => {});
    s = await status();
    check('one click connects a vault', Boolean(folder(s, work)) && folder(s, work).notes === 4, (await page.textContent('#bstatus')).trim());
    await page.locator('[data-bconnect="' + reading + '"]').click();
    await waitFor(async () => folder(await status(), reading));
    s = await status();
    const w = folder(s, work), r = folder(s, reading);
    check('note and link counts per folder (aliases included)', w?.notes === 4 && w?.links === 6 && r?.notes === 2 && r?.links === 2, 'Work Brain ' + w?.notes + '/' + w?.links + ' · Reading Notes ' + r?.notes + '/' + r?.links);
    check('unresolved links are counted', s.totals.unresolved >= 2, s.totals.unresolved + ' unresolved');
    check('settings keep notesFolder as the first folder', (await st('state')).body.settings.notesFolder === notes);

    where = 'graph';
    const g = (await hq('brain/graph?scope=second')).body;
    const paths = g.names.map((n, i) => g.folders[g.folder[i]] + '/' + n), idx = p => paths.indexOf(p);
    const edges = new Set(); for (let k = 0, src = 0; k < g.edges.length; k += 2) { src += g.edges[k]; edges.add(paths[src] + ' > ' + paths[g.edges[k + 1]]) }
    const has = (a, b) => edges.has('Work Brain/' + a + ' > Work Brain/' + b);
    check('links resolve through aliases, file names, paths and Markdown links', has('Projects/Launch plan.md', 'Home.md') && has('Areas/Reviews.md', 'Areas/Client list.md') && has('Home.md', 'Areas/Reviews.md')
      && has('Home.md', 'Projects/Launch plan.md') && has('Projects/Launch plan.md', 'Areas/Client list.md'), edges.size + ' links');
    const tagsOf = p => (g.tags[idx(p)] || []).map(t => g.tag_names[t]);
    check('front matter: title, tags (list, inline and #tags)', g.titles[idx('Work Brain/Home.md')] === 'Work home' && g.titles[idx('Work Brain/Areas/Reviews.md')] === 'Weekly reviews'
      && ['project', 'launch', 'priority'].every(t => tagsOf('Work Brain/Projects/Launch plan.md').includes(t)) && tagsOf('Work Brain/Areas/Client list.md').includes('clients') && tagsOf('Reading Notes/Focus.md').includes('habits'));
    check('paths are prefixed by folder name; hidden folders skipped', paths.includes('Reading Notes/Books/Deep Work.md') && paths.includes('notes/clients/pricing.md') && !paths.some(p => /\.trash|node_modules|\.obsidian/.test(p)));
    check('links stay inside their own folder', !edges.has('Reading Notes/Books/Deep Work.md > Work Brain/Home.md'));
    const c = (await hq('brain/communities')).body, labels = Object.values(c.labels);
    check('communities are top-level folders per vault', ['Work Brain › Projects', 'Work Brain › Areas', 'Reading Notes › Books', 'Reading Notes'].every(l => labels.includes(l)) && c.community['Work Brain/Areas/Reviews.md'] === labels.indexOf('Work Brain › Areas'), labels.join(', '));
    const id = 'vault-' + crypto.createHash('sha256').update('Work Brain/Home.md').digest('hex').slice(0, 24);
    const text = (await hq('brain/vault/file/' + id)).body;
    check('the Brain reader gets a note by its id', typeof text === 'string' && text.includes('[[Weekly review]]'));
    const lib = (await hq('workspace/source/brain/librarian')).body;
    check('Knowledge status shows the live watcher', lib.agents[0].state === 'ok' && /Watching 4 folders live|Watching 3 folders live/.test(lib.agents[0].lastTick.line), lib.agents[0].lastTick.line);

    where = 'watcher';
    const t0 = Date.now();
    fs.mkdirSync(path.join(work, 'Inbox'), {recursive: true});
    fs.writeFileSync(path.join(work, 'Inbox/Live note.md'), '# Live note\n\nWritten while the app runs. Back to [[Home]].\n');
    const seen = await waitFor(async () => { const x = folder(await status(), work); return x.notes === 5 && x.links === 7 ? Date.now() - t0 : 0 }, 10000, 150);
    check('the watcher picks up a new note within about 5 s', seen && seen < 5500, seen ? (seen / 1000).toFixed(1) + ' s' : 'not seen');
    fs.writeFileSync(path.join(work, '.obsidian/workspace.json'), '{"changed":true}');
    const quiet = (await status()).indexedAt; await sleep(3000);
    check('changes inside .obsidian do not re-read the brain', (await status()).indexedAt === quiet);

    where = 'create';
    const made = await st('brain/create', {name: 'Test Brain'}), brain = path.join(home, 'Documents/Test Brain');
    const starter = ['Home.md', 'How this brain works.md', 'Inbox/About the inbox.md', 'Projects/About projects.md', 'Areas/About areas.md', 'Resources/About resources.md', 'Archive/About the archive.md', '.obsidian/app.json'];
    check('create makes a starter brain in the fake home\'s Documents', made.status === 200 && starter.every(f => fs.existsSync(path.join(brain, f))), made.status + ' ' + (made.body.display || made.body?.error?.message));
    check('the new brain is connected and indexed', folder(made.body.status, brain)?.notes === 7 && folder(made.body.status, brain).links > 0, JSON.stringify(folder(made.body.status, brain)));
    check('Open in Obsidian uses obsidian://open?path=<encoded file>', made.body.url === 'obsidian://open?path=' + encodeURIComponent(brain + '/Home.md'), made.body.url);
    check('Obsidian\'s own vault list is not written', JSON.parse(fs.readFileSync(path.join(home, 'Library/Application Support/obsidian/obsidian.json'), 'utf8')).vaults.length === undefined
      && Object.keys(JSON.parse(fs.readFileSync(path.join(home, 'Library/Application Support/obsidian/obsidian.json'), 'utf8')).vaults).length === 3);
    where = 'create (expected refusal)';
    const again = await st('brain/create', {name: 'Test Brain'});
    check('create refuses an existing folder', again.status === 409, again.body?.error?.message);
    const opened = await st('brain/open', {path: brain});
    check('open answers with the link (test builds open nothing)', opened.status === 200 && opened.body.opened === false && opened.body.url === made.body.url);
    where = 'open (expected refusal)';
    const outside = await st('brain/open', {path: home});
    check('open refuses folders outside the brain', outside.status === 422);

    where = 'agents';
    const on = await st('brain/agents', {enable: true});
    const text1 = Object.fromEntries(Object.entries(agentFile).map(([k, f]) => [k, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '']));
    const marked = t => t.includes('<!-- 187N Agent HQ · second brain (start) -->') && t.includes('<!-- 187N Agent HQ · second brain (end) -->') && [notes, work, reading, brain].every(p => t.includes(p));
    check('the block goes into each tool\'s instructions file in the fake home', on.status === 200 && Object.values(on.body.results).every(x => x.ok) && Object.values(text1).every(marked), JSON.stringify(on.body.results));
    check('existing text is kept above the block', text1.codex.startsWith('Codex house rules.\nKeep answers short.\n\n<!--') && text1.hermes.startsWith('# Soul\n\nYou are a careful assistant.\n\n<!--'));
    check('backups exist with the original bytes', Buffer.compare(fs.readFileSync(agentFile.codex + '.187n-backup'), original.codex) === 0 && Buffer.compare(fs.readFileSync(agentFile.hermes + '.187n-backup'), original.hermes) === 0
      && !fs.existsSync(agentFile.claude + '.187n-backup'));
    check('status per tool', (await status()).agents.tools.every(t => t.state === 'on'), (await status()).agents.tools.map(t => t.id + ':' + t.state).join(' '));
    const again2 = await st('brain/agents', {enable: true});
    check('giving again does not add a second block', again2.status === 200 && fs.readFileSync(agentFile.codex, 'utf8').split('second brain (start)').length === 2);

    where = 'add-dir';
    const n0 = app.calls().length;
    const task = await hq('tasks', {title: 'Brain check', prompt: 'Look at my notes.', profile: 'chief'});
    const run = await waitFor(() => app.calls().slice(n0).find(c => c.tool === 'claude' && c.args.includes('-p')), 10000);
    const dirs = run ? run.args.flatMap((a, i) => a === '--add-dir' ? [run.args[i + 1]] : []) : [];
    check('--add-dir appears in the claude call for every brain folder', task.status === 200 && [notes, work, reading, brain].every(p => dirs.includes(p)), dirs.map(d => path.basename(d)).join(', '));

    where = 'remove';
    const off = await st('brain/agents', {enable: false});
    check('Remove restores the files byte-identically', off.status === 200 && Buffer.compare(fs.readFileSync(agentFile.codex), original.codex) === 0 && Buffer.compare(fs.readFileSync(agentFile.hermes), original.hermes) === 0);
    check('a file the app created is removed again (and its new folder)', !fs.existsSync(agentFile.claude) && !fs.existsSync(path.dirname(agentFile.claude)));
    check('backups stay after Remove', fs.existsSync(agentFile.codex + '.187n-backup') && fs.existsSync(agentFile.hermes + '.187n-backup'));
    const n1 = app.calls().length;
    await hq('tasks', {title: 'After remove', prompt: 'Hello.', profile: 'chief'});
    const run2 = await waitFor(() => app.calls().slice(n1).find(c => c.tool === 'claude' && c.args.includes('-p')), 10000);
    check('no --add-dir once removed', run2 && !run2.args.includes('--add-dir'));

    where = 'Knowledge › Second brain';
    await page.goto(app.url + '/'); await page.waitForTimeout(3000);
    await page.evaluate(() => { location.hash = '#workspace/notes' }); await settle();
    await shadow('[data-bf-live]').waitFor({timeout: 10000});
    const rows = await shadow('[data-bf-live] .bf-row').count();
    check('the page lists every folder', rows === 4, rows + ' rows');
    await shadow('[data-action="mk-brain-main"][data-id="' + work + '"]').click(); await settle();
    s = await status();
    check('"Use for new notes" makes a folder the main one', s.folders[0].path === work && (await st('state')).body.settings.notesFolder === work);
    await shadow('[data-action="mk-brain-remove"][data-id="' + reading + '"]').click(); await settle();
    check('Remove takes a folder out (notes stay)', !folder(await status(), reading) && fs.existsSync(path.join(reading, 'Focus.md')));
    page.once('dialog', d => d.accept(reading));
    await shadow('[data-action="mk-brain-pick"]').click(); await settle();
    check('Choose a folder… adds it back', Boolean(await waitFor(async () => folder(await status(), reading))));
    await shadow('#bf-cap-title').fill('Meeting with Sam');
    await shadow('#bf-cap-text').fill('We agreed on the launch plan.\nNext: send the proposal.');
    await shadow('[data-action="mk-brain-save"]').click();
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#cockpit-panel').shadowRoot.querySelector('#bf-cap-status')?.textContent || ''), null, {timeout: 8000}).catch(() => {});
    const saved = path.join(work, 'Inbox/Meeting with Sam.md'), body = fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : '';
    check('Save to brain writes a note into the Inbox', /^---\ntitle: "Meeting with Sam"\ncreated: \d{4}-\d\d-\d\dT[\d:]+([+-]\d\d:\d\d|Z)\nsource: 187N Agent HQ\n---\n\n# Meeting with Sam\n\nWe agreed on the launch plan\./.test(body), body.split('\n').slice(0, 4).join(' | '));
    const twice = await hq('knowledge/save', {title: 'Meeting with Sam', text: 'Second take.'});
    check('Save never overwrites a note', twice.body.name === 'Meeting with Sam 2.md' && fs.readFileSync(saved, 'utf8') === body);
    const unsafe = await hq('knowledge/save', {title: 'Q3: plan/ideas?', text: 'x'});
    check('note names are made safe', unsafe.status === 200 && unsafe.body.name === 'Q3 plan ideas.md', unsafe.body.name);
    await page.evaluate(() => { location.hash = '#workspace/librarian' }); await settle();
    await page.evaluate(() => { location.hash = '#workspace/notes' }); await settle();
    const keep = shadow('[data-action="mk-brain-saverun"]').first();
    await keep.waitFor({timeout: 8000}).catch(() => {});
    if (await keep.count()) { await keep.click(); await waitFor(async () => (await keep.textContent()) === 'Saved', 6000) }
    check('an agent result can be saved to the brain', fs.existsSync(path.join(work, 'Inbox/After remove.md')) || fs.existsSync(path.join(work, 'Inbox/Brain check.md')));
    const live = await waitFor(async () => /Meeting with Sam|notes/.test(await shadow('[data-bf-live]').innerText()) && (await shadow('[data-bf-live] .metric').nth(1).innerText()).includes(String((await status()).totals.notes)), 8000);
    check('the page numbers update live', Boolean(live));

    where = 'Brain map';
    await shadow('[data-action="brain"]').first().click();
    await page.waitForSelector('#brain-view[open] #graph-search', {timeout: 15000});
    await page.waitForTimeout(1500);
    await page.fill('#graph-search', 'Work home'); await page.press('#graph-search', 'Enter');
    const shown = await waitFor(async () => { const t = await page.textContent('#source-content').catch(() => ''); return t && !/Loading note/.test(t) ? t : '' }, 10000);
    check('the Brain map opens a note across folders', Boolean(shown) && shown.includes('Links:') && !shown.trim().startsWith('"'), (shown || '').slice(0, 80).replace(/\s+/g, ' '));
    const totals = (await page.textContent('#brain-totals').catch(() => '')).replace(/\s+/g, ' '), all = (await status()).totals;
    await page.keyboard.press('Escape');
    check('the Brain map shows every folder\'s notes', totals.includes(all.notes.toLocaleString('en-GB')), totals);
  } catch (e) {
    check('no exception', false, e.stack.split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close(); await app.stop();
    const after = H.ownerSnapshot();
    check('owner configuration unchanged', before === after);
    console.log('\nproblems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    const failed = results.filter(x => !x).length;
    console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
    process.exitCode = failed || problems.length ? 1 : 0;
  }
})();
