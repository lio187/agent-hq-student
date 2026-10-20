// Carousel and story maker (A4): the brand kit (a font and a logo through the asset endpoint, with the refusals), a
// carousel and stories written by the agent stand-in (one answer repaired), an inline edit in the page with a live
// preview identical to the render, and native PNG renders checked from the files themselves (size, not blank, brand
// colours), the file endpoint, and that the render window never shows on screen.
//   node tests/e2e/makers.cjs [appPort] [mockPort]          (HQS_MAKERS_SHOW=1: a normal, visible test app)
const path = require('path'), fs = require('fs'), zlib = require('zlib');
const {execFileSync} = require('child_process');
const FIX = path.join(__dirname, '../fixtures/makers');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// PNG: size from the header, pixels from the image data (8-bit grey, RGB or RGBA; the five row filters).
function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ' is not a PNG');
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12] }
    if (kind === 'IDAT') idat.push(data);
    if (kind === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = {0: 1, 2: 3, 4: 2, 6: 4}[type];
  if (depth !== 8 || !bpp || interlace) return {w, h, depth, type, pixels: null};
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      px[y * stride + x] = v & 255;
    }
  }
  const at = (x, y) => { const o = y * stride + x * bpp; return bpp >= 3 ? [px[o], px[o + 1], px[o + 2]] : [px[o], px[o], px[o]] };
  let lo = 255, hi = 0, sum = 0, sq = 0, n = 0;
  for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) { const [r, g, bl] = at(x, y), l = 0.2126 * r + 0.7152 * g + 0.0722 * bl; lo = Math.min(lo, l); hi = Math.max(hi, l); sum += l; sq += l * l; n++ }
  return {w, h, depth, type, at, range: hi - lo, sd: Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2))};
}
const near = (rgb, code, tol = 6) => { const v = parseInt(code.slice(1), 16), want = [(v >> 16) & 255, (v >> 8) & 255, v & 255]; return rgb.every((c, i) => Math.abs(c - want[i]) <= tol) };

// The app's windows that are ordered in, with their positions, and the screens (both in the window server's coordinates).
function windows(pid) {
  const js = 'ObjC.import("CoreGraphics");ObjC.import("AppKit");const l=ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly,0)),out=[];'
    + 'for(let i=0;i<l.count;i++){const w=l.objectAtIndex(i);if(ObjC.unwrap(w.objectForKey("kCGWindowOwnerPID"))!==' + Number(pid) + ')continue;const b=w.objectForKey("kCGWindowBounds");out.push(["X","Y","Width","Height"].map(k=>ObjC.unwrap(b.objectForKey(k))))}'
    + 'const s=$.NSScreen.screens,main=s.objectAtIndex(0).frame,screens=[];for(let i=0;i<s.count;i++){const f=s.objectAtIndex(i).frame;screens.push([f.origin.x,main.size.height-f.origin.y-f.size.height,f.size.width,f.size.height])}JSON.stringify({windows:out,screens})';
  return JSON.parse(execFileSync('osascript', ['-l', 'JavaScript', '-e', js]).toString());
}
const visible = ({windows: ws, screens}) => ws.filter(([x, y, w, h]) => screens.some(([sx, sy, sw, sh]) => x < sx + sw && x + w > sx && y < sy + sh && y + h > sy));

(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const before = H.ownerSnapshot();
  const port = Number(process.argv[2] || 4641), mockPort = Number(process.argv[3] || 4640);
  const app = await H.launch({name: 'a4-makers', port, mockPort, env: {HQS_SHIM_REPLIES: path.join(FIX, 'replies'), ...(process.env.HQS_MAKERS_SHOW ? {HQS_HEADLESS: ''} : {})}});
  const pid = Number(execFileSync('lsof', ['-ti', 'tcp:' + port, '-sTCP:LISTEN']).toString().trim().split('\n')[0]);
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: app.url});
  const page = await context.newPage();
  const problems = []; let failed = 0, where = 'start';
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  page.on('dialog', d => d.accept());
  const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')) };
  // The API from here (the app's cookie and origin), so deliberate refusals stay out of the page's console.
  const api = async (p, body) => {
    const r = await fetch(app.url + '/api/hq/v1/' + p, {method: body === undefined ? 'GET' : 'POST', headers: {cookie: 'hqs=' + app.token, ...(body === undefined ? {} : {'Content-Type': 'application/json', origin: app.url})}, body: body === undefined ? undefined : JSON.stringify(body)});
    const type = r.headers.get('content-type') || '';
    if (!type.includes('json')) { const b = new Uint8Array(await r.arrayBuffer()); return {status: r.status, type, bytes: b.length, head: Array.from(b.slice(0, 8))} }
    return {status: r.status, body: await r.json().catch(() => null)};
  };
  const waitDraft = async (id, ms = 90000) => {
    const end = Date.now() + ms;
    for (;;) { const d = (await api('marketing/make/drafts')).body.drafts.find(x => x.id === id); if (!d || !['writing', 'rendering'].includes(d.status) || Date.now() > end) return d; await sleep(400) }
  };
  const shadow = sel => page.locator('#cockpit-panel').locator(sel);
  const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 15000}).catch(() => {}); await page.waitForTimeout(300) };
  const openMakers = async () => { await page.evaluate(() => { location.hash = '#workspace/overview' }); await settle(); await page.evaluate(() => { location.hash = '#workspace/makers' }); await settle() };
  const workspace = path.join(app.dirs.files, 'workspace'), media = path.join(app.dirs.support, 'media/makers');
  try {
    where = 'setup';
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    const setup = await H.setupViaAPI(page, app);
    check('setup through the API', Object.values(setup).every(v => v.status === 200), JSON.stringify(Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status]))));
    await page.goto(app.url + '/'); await page.waitForTimeout(3000);

    // ── Empty state ──
    where = 'empty state';
    await openMakers();
    const empty = await page.evaluate(() => { const r = document.querySelector('#cockpit-panel').shadowRoot; return {title: r.querySelector('#title')?.textContent, text: r.querySelector('#view').innerText, error: !!r.querySelector('#view .ui-state[data-kind=error]'), disabled: r.querySelector('[data-action="mk-makers-new"]')?.disabled} });
    check('empty state asks for the brand kit first', empty.title === 'Carousels & stories' && /Set your brand kit first/.test(empty.text) && !empty.error && empty.disabled === true, JSON.stringify({title: empty.title, error: empty.error, disabled: empty.disabled}));
    const early = await api('marketing/make/draft', {format: 'carousel', source: {kind: 'topic', text: 'Anything at all'}});
    check('no draft before the brand kit is set', early.status === 409 && early.body?.error?.code === 'brand_missing', early.status + ' ' + early.body?.error?.code);

    // ── Brand kit ──
    where = 'brand kit';
    const brand = {name: 'North Studio', handle: '@northstudio', style: 'editorial', colours: {background: '#F6F1E9', text: '#1D1B18', accent: '#B4532A', muted: '#7A7167'}, fonts: {heading: 'Georgia', body: 'Helvetica Neue'}};
    const saved = await api('marketing/brand', brand);
    check('brand kit saved', saved.status === 200 && saved.body.set === true && saved.body.brand.handle === 'northstudio' && saved.body.brand.colours.accent === '#B4532A', saved.status + ' ' + JSON.stringify(saved.body?.brand?.colours));
    check('a wrong colour code is refused', (await api('marketing/brand', {colours: {accent: 'orange'}})).status === 422);
    check('a font that is not installed is refused', (await api('marketing/brand', {fonts: {heading: 'No Such Font 123'}})).status === 422);
    const asset = (purpose, p) => api('marketing/brand/asset', {purpose, path: p});
    const logo = await asset('logo', path.join(FIX, 'logo.png'));
    check('logo (PNG) copied', logo.status === 200 && logo.body.brand.logo?.type === 'png' && logo.body.brand.logo?.width === 240, logo.status + ' ' + JSON.stringify(logo.body?.brand?.logo || logo.body));
    const heading = await asset('font-heading', path.join(FIX, 'fonts/instrument-serif-400-normal.ttf'));
    check('heading font (TTF) copied', heading.status === 200 && heading.body.brand.fontFiles.heading?.format === 'truetype' && heading.body.brand.fonts.heading === heading.body.brand.fontFiles.heading?.family, JSON.stringify(heading.body?.brand?.fontFiles?.heading || heading.body));
    const body = await asset('font-body', path.join(FIX, 'fonts/InterVariable-ui.woff2'));
    check('body font (WOFF2) copied', body.status === 200 && body.body.brand.fontFiles.body?.format === 'woff2', JSON.stringify(body.body?.brand?.fontFiles?.body || body.body));
    const svg = await asset('logo', path.join(FIX, 'logo.svg'));
    check('logo (SVG) accepted', svg.status === 200 && svg.body.brand.logo?.type === 'svg');
    await asset('logo', path.join(FIX, 'logo.png'));
    fs.symlinkSync(path.join(FIX, 'logo.png'), path.join(app.dirs.files, 'link.png'));
    fs.writeFileSync(path.join(app.dirs.files, 'big.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(5.5 * 1024 * 1024)]));
    fs.writeFileSync(path.join(app.dirs.files, 'text.png'), 'just text');
    const refusals = {
      link: await asset('logo', path.join(app.dirs.files, 'link.png')), folder: await asset('logo', FIX), big: await asset('logo', path.join(app.dirs.files, 'big.png')),
      notImage: await asset('logo', path.join(app.dirs.files, 'text.png')), notFont: await asset('font-body', path.join(FIX, 'fonts/fake.ttf')),
      relative: await asset('logo', 'logo.png'), missing: await asset('logo', path.join(app.dirs.files, 'nothing.png')), purpose: await asset('banner', path.join(FIX, 'logo.png')),
    };
    const codes = Object.fromEntries(Object.entries(refusals).map(([k, v]) => [k, v.status + ':' + v.body?.error?.code]));
    check('links, folders, large, wrong and missing files are refused', refusals.link.status === 422 && refusals.folder.status === 422 && refusals.big.status === 413 && refusals.notImage.status === 422 && refusals.notFont.status === 422 && refusals.relative.status === 422 && refusals.missing.status === 404 && refusals.purpose.status === 422, JSON.stringify(codes));
    const copies = fs.readdirSync(media).filter(f => f !== 'fonts').sort(), fonts = fs.readdirSync(path.join(media, 'fonts')).sort();
    check('assets live in the app folder (one logo; two fonts in fonts/)', copies.length === 1 && /^logo-.*\.png$/.test(copies[0]) && fonts.length === 2 && /^body-.*\.woff2$/.test(fonts[0]) && /^heading-.*\.ttf$/.test(fonts[1]), copies.join(', ') + ' · fonts/' + fonts.join(', fonts/'));
    const kit = (await api('marketing/make/kit')).body;
    check('kit: policy, two uploaded fonts, nine templates, the logo', /default-src 'none'/.test(kit.head) && (kit.head.match(/@font-face/g) || []).length === 2 && Object.keys(kit.templates.carousel).length === 5 && Object.keys(kit.templates.story).length === 4 && /^data:image\/png;base64,/.test(kit.logo));

    // ── Drafts written by the agent ──
    where = 'drafts';
    const topic = 'Three ways to plan a week of content';
    const started = await api('marketing/make/draft', {format: 'carousel', source: {kind: 'topic', text: topic}, slides: 5});
    check('carousel draft started', started.status === 200 && started.body.draft.status === 'writing', started.status + ' ' + JSON.stringify(started.body?.error || ''));
    const carousel = await waitDraft(started.body.draft.id);
    check('carousel written: 5 slides, templates and caption', carousel.status === 'ready' && carousel.slides.length === 5 && carousel.slides.map(s => s.template).join() === 'cover,point,list,quote,cta' && carousel.title === 'Plan a week in one hour' && carousel.caption.length > 40, carousel.status + ' ' + (carousel.error || carousel.slides.map(s => s.template).join()));
    const call = app.calls().find(c => c.tool === 'claude' && c.args.includes('--json-schema') && (c.args[c.args.indexOf('-p') + 1] || '').includes(topic));
    const schema = call && JSON.parse(call.args[call.args.indexOf('--json-schema') + 1]);
    check('the writer got the JSON schema and the brand', !!call && schema?.properties?.slides?.items?.properties?.template?.enum?.join() === 'cover,point,list,quote,cta' && /Instagram carousel of 5 slides for North Studio @northstudio/.test(call.args[call.args.indexOf('-p') + 1]));

    const broken = await api('marketing/make/draft', {format: 'carousel', source: {kind: 'topic', text: 'BROKEN-TOPIC for the repair check'}, slides: 4});
    const repaired = await waitDraft(broken.body.draft.id);
    const repairCalls = app.calls().filter(c => c.tool === 'claude' && (c.args[c.args.indexOf('-p') + 1] || '').includes('BROKEN-TOPIC'));
    check('an unusable answer is repaired once', repaired.status === 'ready' && repaired.slides.length === 4 && repaired.title === 'Fixed after one more try' && repairCalls.length === 2 && repairCalls[1].args.includes('--disallowedTools'), repaired.status + ' ' + repairCalls.length + ' calls ' + (repaired.error || ''));

    const st = await api('marketing/make/draft', {format: 'story', source: {kind: 'topic', text: 'The first hour of the workday'}, slides: 4});
    const story = await waitDraft(st.body.draft.id);
    check('stories written: hook, step, poll, cta', story.status === 'ready' && story.slides.map(s => s.template).join() === 'hook,step,poll,cta' && story.slides[2].items.length === 3, story.status + ' ' + (story.error || ''));
    const noItem = await api('marketing/make/draft', {format: 'carousel', source: {kind: 'item', id: 'item_missing'}});
    const noPost = await api('marketing/make/draft', {format: 'story', source: {kind: 'post', id: 'post_missing'}});
    check('a missing content item or Creator Lab post is reported', noItem.status === 404 && noPost.status === 404, noItem.status + ' ' + noPost.status);
    const fromItem = await api('marketing/make/draft', {format: 'carousel', source: {kind: 'item', id: 'item_given', text: 'Instagram carousel source text given by the page'}, slides: 5});
    const itemDraft = await waitDraft(fromItem.body.draft.id);
    check('a content item (text from the page) becomes a draft', itemDraft.status === 'ready' && itemDraft.itemID === 'item_given' && itemDraft.source.kind === 'item', itemDraft.status);

    // ── Edit in the page ──
    where = 'editor';
    await openMakers();
    if (await shadow('button[data-action="mk-makers-open"][data-id="' + carousel.id + '"]').count()) { await shadow('button[data-action="mk-makers-open"][data-id="' + carousel.id + '"]').click(); await settle() }
    const editor = shadow('.mk-editor[data-mk-draft="' + carousel.id + '"]');
    check('the draft opens in the editor with a preview per slide', await editor.count() === 1 && await editor.locator('.mk-slide iframe').count() === 5);
    await editor.locator('.mk-slide[data-i="1"] input[data-mk-slide="heading"]').fill('Start with *one* question today');
    await editor.locator('.mk-slide[data-i="3"] select[data-mk-slide="template"]').selectOption('point');
    await page.waitForFunction(() => /Saved/.test(document.querySelector('#cockpit-panel').shadowRoot.querySelector('[data-mk-save]')?.textContent || ''), null, {timeout: 8000}).catch(() => {});
    const afterEdit = (await api('marketing/make/drafts')).body.drafts.find(d => d.id === carousel.id);
    check('inline edits are saved', afterEdit.slides[1].heading === 'Start with *one* question today' && afterEdit.slides[3].template === 'point', JSON.stringify([afterEdit.slides[1].heading, afterEdit.slides[3].template]));
    const srcdoc = await editor.locator('.mk-slide[data-i="1"] iframe').evaluate(f => f.srcdoc);
    const engine = (await api('marketing/make/html?draftId=' + carousel.id + '&slide=1')).body.html;
    check('the live preview is the exact document the app renders', srcdoc === engine && srcdoc.includes('Start with <em>one</em> question today'), srcdoc.length + ' vs ' + engine.length);
    await editor.locator('button[data-action="mk-makers-slide-up"][data-id="2"]').click(); await settle();
    const moved = (await api('marketing/make/drafts')).body.drafts.find(d => d.id === carousel.id);
    check('a slide moves up', moved.slides[1].template === 'list' && moved.slides[2].heading === 'Start with *one* question today', moved.slides.map(s => s.template).join());
    const longCta = (await api('marketing/make/' + carousel.id + '/update', {slides: moved.slides.map((s, i) => i === 4 ? {...s, footer: 'Save this post'} : s)})).body.draft;
    check('the update endpoint keeps the slides', longCta.slides.length === 5 && longCta.status === 'ready');

    // ── Render ──
    where = 'render';
    const samples = [], stop = {done: false};
    const sampling = (async () => { const end = Date.now() + 60000; while (Date.now() < end && !stop.done) { try { samples.push(windows(pid)) } catch {} await sleep(120) } })();
    const t0 = Date.now(), rc = await api('marketing/make/render', {draftId: carousel.id}), took = Date.now() - t0;
    stop.done = true; await sampling;
    check('carousel rendered', rc.status === 200 && rc.body.files.length === 5, rc.status + ' ' + JSON.stringify(rc.body?.error || '') + ' · ' + took + ' ms');
    const folder = path.join(workspace, 'Marketing', rc.body.rel || '');
    check('PNGs are in <workspace>/Marketing/Carousels/<slug>/', /^Carousels\/plan-a-week-in-one-hour$/.test(rc.body.rel) && fs.readdirSync(folder).sort().join() === '01.png,02.png,03.png,04.png,05.png', rc.body.rel + ' · ' + (fs.existsSync(folder) ? fs.readdirSync(folder).join() : 'missing'));
    for (const f of rc.body.files) {
      const png = readPNG(path.join(folder, f.name));
      check('  ' + f.name + ' is 1080 × 1350 and not blank', png.w === 1080 && png.h === 1350 && png.range > 60 && png.sd > 8, png.w + '×' + png.h + ' range ' + Math.round(png.range) + ' sd ' + png.sd.toFixed(1) + ' · ' + f.method + ' · ' + f.bytes + ' bytes');
    }
    const cover = readPNG(path.join(folder, '01.png'));
    check('brand background colour on the slide', near(cover.at(8, 8), '#F6F1E9') && near(cover.at(1071, 1341), '#F6F1E9'), JSON.stringify(cover.at(8, 8)));
    const ready = rc.body.files.map(f => f.ready || {});
    check('each slide waited for its fonts and logo (both uploaded fonts in use, nothing broken)', ready.every(r => r.status === 'loaded' && r.loaded === 2 && r.images === 1 && r.broken === 0 && !r.failed) && !(rc.body.warnings || []).length, JSON.stringify(ready[0]) + ' · ' + JSON.stringify(rc.body.warnings));
    // The window server lists the render window (ordered in, slide-shaped) while it works; it may never touch a screen,
    // and in a headless run no window of the app may.
    const slideShaped = ([, , w, h]) => Math.abs(w / h - 1080 / 1350) < 0.01 || Math.abs(w / h - 1080 / 1920) < 0.01;
    const seen = samples.filter(s => s.windows.some(slideShaped)), shown = samples.flatMap(visible);
    // The Windows edition (HQ_TEST_APP) renders off screen in Electron: its render window is never ordered in at all.
    const orderedIn = process.env.HQ_TEST_APP ? true : seen.length > 0;
    check('the render window is ordered in but never on a screen', orderedIn && !shown.some(slideShaped) && (process.env.HQS_MAKERS_SHOW || !shown.length),
      samples.length + ' samples · ' + seen.length + ' with the render window ' + JSON.stringify(seen[0]?.windows.filter(slideShaped)) + ' · on screen: ' + JSON.stringify(shown.slice(0, 2)));

    await api('marketing/brand', {style: 'bold'});
    const rs = await api('marketing/make/render', {draftId: story.id});
    check('stories rendered', rs.status === 200 && rs.body.files.length === 4 && /^Stories\//.test(rs.body.rel), rs.status + ' ' + JSON.stringify(rs.body?.error || rs.body?.rel));
    for (const f of rs.body.files || []) {
      const png = readPNG(path.join(workspace, 'Marketing', rs.body.rel, f.name));
      check('  ' + f.name + ' is 1080 × 1920 and not blank', png.w === 1080 && png.h === 1920 && png.range > 60 && png.sd > 8, png.w + '×' + png.h + ' range ' + Math.round(png.range) + ' sd ' + png.sd.toFixed(1) + ' · ' + f.method);
    }
    const hook = readPNG(path.join(workspace, 'Marketing', rs.body.rel, '01.png')), step = readPNG(path.join(workspace, 'Marketing', rs.body.rel, '02.png'));
    check('bold style: the hook in the accent colour, a step on the background', near(hook.at(8, 8), '#B4532A') && near(step.at(8, 8), '#F6F1E9'), JSON.stringify([hook.at(8, 8), step.at(8, 8)]));

    // The fallback: the page as PDF, rasterised to the same exact bitmap.
    const pdf = await api('marketing/make/render', {draftId: story.id, method: 'pdf'});
    const pdfPNG = pdf.status === 200 ? readPNG(path.join(workspace, 'Marketing', pdf.body.rel, '03.png')) : {};
    check('PDF fallback renders the same size, not blank', pdf.status === 200 && pdf.body.files.every(f => f.method === 'pdf') && pdfPNG.w === 1080 && pdfPNG.h === 1920 && pdfPNG.range > 60 && near(pdfPNG.at(8, 8), '#F6F1E9'), pdf.status + ' ' + JSON.stringify(pdf.body?.error || pdf.body.files.map(f => f.method)) + ' range ' + Math.round(pdfPNG.range || 0));
    fs.copyFileSync(path.join(workspace, 'Marketing', pdf.body.rel, '03.png'), path.join(app.dirs.shots, 'story-03-pdf.png'));

    // ── Files, Finder, re-render ──
    where = 'files';
    const one = await api('marketing/make/file?path=' + encodeURIComponent(rc.body.rel + '/01.png'));
    check('file endpoint serves the PNG', one.status === 200 && one.type === 'image/png' && one.bytes === fs.statSync(path.join(folder, '01.png')).size && one.head[1] === 0x50, one.status + ' ' + one.type + ' ' + one.bytes);
    fs.writeFileSync(path.join(folder, 'notes.txt'), 'not an image');
    fs.writeFileSync(path.join(app.dirs.files, 'outside.png'), fs.readFileSync(path.join(folder, '01.png')));
    fs.symlinkSync(path.join(app.dirs.files, 'outside.png'), path.join(folder, 'link.png'));
    const denied = await Promise.all(['../../outside.png', path.join(app.dirs.files, 'outside.png'), rc.body.rel + '/notes.txt', rc.body.rel + '/link.png', '/etc/hosts', ''].map(p => api('marketing/make/file?path=' + encodeURIComponent(p))));
    check('nothing outside Marketing (or not a PNG) is served', denied.every(r => r.status === 404), denied.map(r => r.status).join());
    fs.unlinkSync(path.join(folder, 'link.png')); fs.unlinkSync(path.join(folder, 'notes.txt'));
    const reveal = await api('marketing/make/' + carousel.id + '/reveal', {});
    check('Show in Finder answers (test builds never open Finder)', reveal.status === 200 && reveal.body.ok === true && reveal.body.opened === false && reveal.body.folder === folder, JSON.stringify(reveal.body));
    const shorter = (await api('marketing/make/' + carousel.id + '/update', {slides: longCta.slides.slice(0, 4)})).body.draft;
    check('an edit after rendering marks the PNGs as out of date', shorter.stale === true && shorter.status === 'rendered');
    const again = await api('marketing/make/render', {draftId: carousel.id});
    check('render again: same folder, the extra PNG removed', again.status === 200 && again.body.rel === rc.body.rel && fs.readdirSync(folder).filter(f => f.endsWith('.png')).sort().join() === '01.png,02.png,03.png,04.png' && again.body.draft.stale === false, fs.readdirSync(folder).join());

    // ── The page after rendering ──
    where = 'results';
    await openMakers();
    if (await shadow('button[data-action="mk-makers-open"][data-id="' + carousel.id + '"]').count()) { await shadow('button[data-action="mk-makers-open"][data-id="' + carousel.id + '"]').click(); await settle() }
    await page.waitForFunction(() => { const imgs = [...document.querySelector('#cockpit-panel').shadowRoot.querySelectorAll('.mk-grid img')]; return imgs.length && imgs.every(i => i.complete && i.naturalWidth) }, null, {timeout: 10000}).catch(() => {});
    const grid = await shadow('.mk-grid img').evaluateAll(list => list.map(i => i.naturalWidth + 'x' + i.naturalHeight));
    check('result grid shows the PNGs through the file endpoint', grid.length === 4 && grid.every(s => s === '1080x1350'), grid.join());
    await shadow('.mk-results button[data-action="mk-makers-copy"]').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(e => 'error: ' + e.message);
    check('Copy caption puts the caption on the clipboard', clip === shorter.caption, clip.slice(0, 60));
    await page.screenshot({path: path.join(app.dirs.shots, 'makers-page.png'), fullPage: true});
    // The page's own "Make a carousel" dialog.
    await shadow('button[data-action="mk-makers-new"][data-id="carousel"]').click();
    await shadow('#preview-body textarea[name=topic]').fill('A dialog check: Instagram carousel from the page');
    await shadow('#preview-body input[name=slides]').fill('5');
    await shadow('#preview-body button[data-action="mk-makers-write"]').click(); await settle();
    const fromPage = (await api('marketing/make/drafts')).body.drafts[0];
    const writtenFromPage = await waitDraft(fromPage.id);
    check('the Make a carousel dialog starts a draft that opens when written', writtenFromPage.status === 'ready' && writtenFromPage.source.text.startsWith('A dialog check'), writtenFromPage.status);
    await settle(); await page.waitForTimeout(2500);
    const follows = await shadow('.mk-editor[data-mk-draft="' + fromPage.id + '"] .mk-slide').count();
    check('the page follows the writing draft and opens it when ready', follows === 5 && writtenFromPage.slides.length === 5, follows + ' slides · ' + (await shadow('#view').innerText()).replace(/\s+/g, ' ').slice(0, 300));
    const del = await api('marketing/make/' + fromPage.id + '/delete', {});
    check('a draft can be deleted', del.status === 200 && !(await api('marketing/make/drafts')).body.drafts.some(d => d.id === fromPage.id));
    await page.screenshot({path: path.join(app.dirs.shots, 'makers-editor.png'), fullPage: true});
  } catch (e) { failed++; console.log('FAIL ' + where + ' threw: ' + (e.stack || e.message)) }
  finally {
    await browser.close(); await app.stop();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    console.log('renders: ' + path.join(app.dirs.files, 'workspace/Marketing') + '\nscreenshots: ' + app.dirs.shots);
    process.exitCode = failed || problems.length || before !== after ? 1 : 0;
  }
})();
