// Every page with real clicks: sidebar department → page tab → view tab; checks the address, the title, that the
// page rendered without an error, and that the console stayed clean. Screenshots go to the run's shots folder.
//   node tests/e2e/sweep.cjs [port] [mockPort]
const path = require('path');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const nav = await import(path.join(__dirname, '../../frontend/overlay/web/workspace-navigation.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'sweep-' + (process.argv[2] || 4591), port: Number(process.argv[2] || 4591), mockPort: Number(process.argv[3] || 4590)});
  const browser = await chromium.launch({args: ['--use-gl=angle', '--enable-unsafe-swiftshader']});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = []; let where = 'start';
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => m.type() === 'error' && problems.push(where + ' · console ' + m.text().slice(0, 200)));
  page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  let failed = 0;
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    console.log('setup:', JSON.stringify(Object.fromEntries(Object.entries(await H.setupViaAPI(page, app)).map(([k, v]) => [k, v.status]))));
    await page.goto(app.url + '/'); await page.waitForTimeout(4000);
    const shadow = sel => page.locator('#cockpit-panel').locator(sel);
    const settle = async () => { await page.waitForFunction(() => { const v = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('#view'); return v && v.getAttribute('aria-busy') !== 'true' && !/Opening this page/.test(v.innerText) }, null, {timeout: 8000}).catch(() => {}); await page.waitForTimeout(250) };
    await page.evaluate(() => { location.hash = '#workspace/overview' }); await settle();
    let n = 0;
    for (const w of nav.WORKSPACES) {
      for (const p of w.pages) {
        // The office sidebar (#hq-nav): open the department when it is folded, then click the page.
        const item = page.locator(p.views[0][0] === 'overview' ? '#hq-nav .sb-item[data-route="overview"]' : '#hq-nav .sb-group-toggle[data-toggle="' + w.department + '"] ~ * .sb-item[data-section="' + p.views[0][0] + '"], #hq-nav .sb-item[data-section="' + p.views[0][0] + '"]').first();
        if (!(await item.isVisible())) { const t = page.locator('#hq-nav [data-toggle="' + w.department + '"]').first(); if (await t.count()) await t.click() }
        where = w.label + ' › ' + p.label; await item.click(); await settle();
        for (const [v, label] of p.views) {
          where = w.label + ' › ' + p.label + ' › ' + label;
          if (p.views.length > 1 && v !== p.views[0][0]) { await shadow('#view-switch button[data-section="' + v + '"]').click(); await settle() }
          const info = await page.evaluate(() => { const r = document.querySelector('#cockpit-panel')?.shadowRoot; const view = r?.querySelector('#view'); return {hash: location.hash, title: r?.querySelector('#title')?.textContent, len: view?.innerText.length || 0, error: view?.querySelector('.ui-state[data-kind=error]')?.innerText?.slice(0, 160) || ''} });
          const want = v === 'overview' ? 'Overview' : p.label, ok = info.hash === '#workspace/' + v && info.title === want && !info.error && info.len > 20;
          if (!ok) failed++;
          console.log((ok ? 'ok  ' : 'FAIL') + ' ' + where.padEnd(52) + ' ' + info.hash.padEnd(26) + ' ' + JSON.stringify(info.title) + (info.error ? ' · ' + info.error : '') + (info.len <= 20 ? ' · empty' : ''));
          await page.screenshot({path: app.dirs.shots + '/' + String(n++).padStart(2, '0') + '-' + v + '.png'});
        }
      }
    }
  } finally {
    await browser.close(); await app.stop();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    console.log('screenshots: ' + app.dirs.shots);
    process.exitCode = failed || problems.length || before !== after ? 1 : 0;
  }
})();
