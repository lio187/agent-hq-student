// Pins the Agent HQ source this edition is built from: a read-only copy of the live dashboard source, its assets and
// the developer kit's cut rules, in frontend/pinned/ (same layout as projects/agent-hq). The export reads the pin, so
// work on the live office never changes a student build until the pin is refreshed on purpose.
//   node frontend/pin.mjs            copy the live source into the pin
//   node frontend/pin.mjs --verify   check the pin against its recorded hash
import {readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync} from 'node:fs';
import {resolve, join, relative} from 'node:path';
import {createHash} from 'node:crypto';

const HERE = import.meta.dirname, ROOT = resolve(HERE, '..'), LIVE = resolve(ROOT, '../agent-hq'), PIN = resolve(HERE, 'pinned');
const PARTS = ['upgrade/web', 'upgrade/scripts/page-css.mjs', 'assets', 'vendor/three.js', 'vendor/three.core.min.js', 'devkit/rules.mjs', 'devkit/transforms.mjs', 'devkit/lib'];
const SKIP = new Set(['dist', '.DS_Store', 'node_modules', '__pycache__']);

function files(dir, out = []) {
  for (const n of readdirSync(dir).sort()) {
    if (SKIP.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, out); else out.push(p);
  }
  return out;
}
function treeHash(root) {
  const h = createHash('sha256'); let count = 0;
  for (const part of PARTS) {
    const p = resolve(root, part);
    for (const f of statSync(p).isDirectory() ? files(p) : [p]) { h.update(relative(root, f) + '\0'); h.update(readFileSync(f)); h.update('\0'); count++ }
  }
  return {sha256: h.digest('hex'), files: count};
}

if (process.argv.includes('--verify')) {
  const pin = JSON.parse(readFileSync(resolve(PIN, 'PIN.json'), 'utf8')), now = treeHash(PIN);
  if (now.sha256 !== pin.sha256) { console.error('pin changed since ' + pin.pinnedAt + ' (' + now.files + ' files)'); process.exit(1) }
  console.log('pin ok: ' + pin.files + ' files, pinned ' + pin.pinnedAt);
  process.exit(0);
}
rmSync(PIN, {recursive: true, force: true});
for (const part of PARTS) {
  const from = resolve(LIVE, part);
  if (!existsSync(from)) { console.error('missing in the live source: ' + part); process.exit(1) }
  cpSync(from, resolve(PIN, part), {recursive: true, filter: s => !SKIP.has(s.split('/').pop())});
}
const {sha256, files: count} = treeHash(PIN);
writeFileSync(resolve(PIN, 'PIN.json'), JSON.stringify({pinnedAt: new Date().toISOString(), from: 'projects/agent-hq', parts: PARTS, files: count, sha256}, null, 2) + '\n');
console.log('pinned ' + count + ' files, sha256 ' + sha256.slice(0, 16));
