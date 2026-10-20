// Renders the DMG window background (660×420, @2x) and the Read Me First PDF from the HTML next to this file.
const {chromium} = require(require('../tools.cjs').locate('playwright'));
const fs = require('fs'), path = require('path');
const [logo, out] = process.argv.slice(2);
const logoURL = 'data:image/png;base64,' + fs.readFileSync(logo).toString('base64');
const html = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replaceAll('LOGO', logoURL);
(async () => {
  const b = await chromium.launch();
  for (const scale of [1, 2]) {
    const p = await b.newPage({viewport: {width: 660, height: 420}, deviceScaleFactor: scale});
    await p.setContent(html('background.html')); await p.screenshot({path: path.join(out, scale === 1 ? 'background.png' : 'background@2x.png')});
  }
  const r = await b.newPage(); await r.setContent(html('readme.html')); await r.pdf({path: path.join(out, 'Read Me First.pdf'), format: 'A4', printBackground: true});
  await b.close(); console.log('dmg assets rendered');
})();
