// A scheduled routine starts by itself: a routine due every minute must run within about 100 s without anyone
// pressing Run now (the scheduler ticks every 30 s while the app is open).
//   node tests/e2e/schedule.cjs [port] [mockPort]
const path = require('path');
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const before = H.ownerSnapshot();
  const app = await H.launch({name: 'schedule', port: Number(process.argv[2] || 4711), mockPort: Number(process.argv[3] || 4710)});
  const browser = await chromium.launch(); const page = await (await browser.newContext()).newPage();
  let ok = false, detail = '';
  try {
    await page.goto(app.launchURL); await page.waitForTimeout(300); await H.setupViaAPI(page, app, {composio: false, zernio: false});
    const call = (p, b) => page.evaluate(async ({p, b}) => { const r = await fetch('/api/hq/v1/' + p, b === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(b)}); return r.json() }, {p, b});
    const r = await call('routines/create', {name: 'Every minute', profile: 'chief', prompt: 'Say hi', schedule: '* * * * *'});
    const t0 = Date.now();
    while (Date.now() - t0 < 110000) {
      const x = (await call('routines')).find(y => y.id === r.id);
      if (x?.last_run_at || x?.latest_execution) { ok = true; detail = 'started by itself after ' + Math.round((Date.now() - t0) / 1000) + ' s'; break }
      await page.waitForTimeout(3000);
    }
    if (!ok) detail = 'did not start within 110 s';
  } finally { await browser.close(); await app.stop() }
  const same = before === H.ownerSnapshot();
  console.log((ok ? 'ok   ' : 'FAIL ') + 'a routine due every minute starts by itself · ' + detail);
  console.log('owner configuration unchanged: ' + same);
  console.log((ok && same ? 1 : 0) + '/1 schedule checks passed');
  process.exitCode = ok && same ? 0 : 1;
})();
