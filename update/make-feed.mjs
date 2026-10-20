// Writes the signed student update feed for a release (owner). Nothing is uploaded: put the output folder on the https
// host that update/config.json → feedURL points at (an owner step).
//   node update/make-feed.mjs --key <update-ed25519-private.pem> --out <site>/stable.json --version 1.3.1 --notes <notes.md>
//        --mac-file "dist/187N Agent HQ 1.3.1.dmg" --mac-url https://…/187N%20Agent%20HQ%201.3.1.dmg
//        --win-file "../agent-hq-student-windows/release/187N Agent HQ Setup 1.3.1.exe" --win-url https://…
//        [--expires-days 30] [--keep 10] [--config <config.json>, default update/config.json]
//   node update/make-feed.mjs --key <pem> --out <site>/stable.json --resign      renew the expiry (at least monthly)
// The size and SHA-256 come from the local files, so the feed always describes exactly what was built. An existing feed
// is extended (it must carry a valid signature by a key in update/config.json); a version is never overwritten.
import {existsSync, readFileSync, writeFileSync, mkdirSync, createReadStream, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {SCHEMA, PRODUCT, loadPrivate, rawPublic, signFeed, checkFeed, isVersion, compareVersions, safeURL} from './lib.mjs';

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined };
const fail = m => { console.error('make-feed: ' + m); process.exit(1) };
const key = arg('key') ? loadPrivate(arg('key')) : fail('--key <update private key> is required');
const out = arg('out') ? resolve(arg('out')) : fail('--out <feed .json> is required');
const config = JSON.parse(readFileSync(arg('config') ? resolve(arg('config')) : join(import.meta.dirname, 'config.json'), 'utf8'));
const trusted = (config.keys || []).map(k => k.public);
const pub = rawPublic(key).toString('base64');
if (!trusted.includes(pub)) fail('this key is not in update/config.json → keys; installed apps would refuse the feed');
const days = Number(arg('expires-days') || 30);
if (!(days >= 1 && days <= 90)) fail('--expires-days must be 1–90');
const iso = d => d.toISOString().replace(/\.\d+Z$/, 'Z');
let doc = {schema: SCHEMA, product: PRODUCT, channel: 'stable', releases: []};
if (existsSync(out)) {
  try { checkFeed(readFileSync(out), readFileSync(out + '.sig'), {keys: trusted, platform: 'mac', current: '0.0.0', now: 0}) } catch (e) { fail('the existing feed is not validly signed (' + e.message + '); refusing to extend it') }
  doc = JSON.parse(readFileSync(out, 'utf8'));
}
if (!process.argv.includes('--resign')) {
  const version = arg('version'); if (!isVersion(version)) fail('--version x.y.z is required');
  if (doc.releases.some(r => r.version === version)) fail(version + ' is already in the feed; versions are never overwritten');
  const hash = f => new Promise((ok, no) => { const h = createHash('sha256'); createReadStream(f).on('data', c => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', no) });
  const downloads = {};
  for (const p of ['mac', 'win']) {
    const file = arg(p + '-file'), url = arg(p + '-url');
    if (!file && !url) continue;
    if (!file || !url) fail('--' + p + '-file and --' + p + '-url go together');
    if (!safeURL(url)) fail('--' + p + '-url must be https');
    downloads[p] = {url, sha256: await hash(file), size: statSync(file).size};
  }
  if (!Object.keys(downloads).length) fail('give at least one platform: --mac-file/--mac-url or --win-file/--win-url');
  const notes = arg('notes') ? readFileSync(arg('notes'), 'utf8').trim() : '';
  doc.releases.push({version, date: new Date().toISOString().slice(0, 10), notes: notes.slice(0, 4000), downloads});
}
const now = new Date();
doc.releases.sort((a, b) => compareVersions(b.version, a.version));
doc.releases = doc.releases.slice(0, Number(arg('keep') || 10));
Object.assign(doc, {updated_at: iso(now), expires_at: iso(new Date(now.getTime() + days * 864e5)), latest: doc.releases[0]?.version || null});
const bytes = Buffer.from(JSON.stringify(doc, null, 1) + '\n');
mkdirSync(dirname(out), {recursive: true});
writeFileSync(out, bytes); writeFileSync(out + '.sig', signFeed(key, bytes));
console.log(JSON.stringify({feed: out, latest: doc.latest, releases: doc.releases.map(r => r.version), expires_at: doc.expires_at}));
