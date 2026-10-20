// The student update feed (both editions), owner side: the format, signing and checking. The apps check the same
// rules in their own engines (Swift: app/Engine/Updates.swift, JavaScript: ../agent-hq-student-windows/engine/updates.mjs).
// The format follows the office's update channel (projects/agent-hq/staging/docs/UPDATES.md): a JSON file signed with
// Ed25519 in a detached `.sig` next to it ({alg, key_id, sig}, key_id = the first 16 hex of the public key's SHA-256),
// with an expiry, so a mirror cannot keep students on an old "latest" forever.
//
//   <feed>.json      {schema: "agent-hq-student.feed/1", product: "agent-hq-student", channel: "stable",
//                     updated_at, expires_at, latest, releases: [{version, date, notes,
//                       downloads: {mac: {url, sha256, size}, win: {url, sha256, size}}}]}   newest first
//   <feed>.json.sig  {alg: "ed25519", key_id, sig: base64}  over the exact bytes of <feed>.json
//
// The update key is separate from the licence signing key (license/issue.mjs): a stolen licence key must not be able to
// push installers, and the reverse. Both builds refuse a configuration where the two are the same key.
import {createHash, createPrivateKey, createPublicKey, sign, verify} from 'node:crypto';
import {readFileSync} from 'node:fs';

export const SCHEMA = 'agent-hq-student.feed/1', PRODUCT = 'agent-hq-student';
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
export const keyId = raw => createHash('sha256').update(raw).digest('hex').slice(0, 16);
export const rawPublic = privateKey => createPublicKey(privateKey).export({type: 'spki', format: 'der'}).subarray(-32);
export const loadPrivate = file => createPrivateKey(readFileSync(file));
export const signFeed = (privateKey, bytes) => Buffer.from(JSON.stringify({alg: 'ed25519', key_id: keyId(rawPublic(privateKey)), sig: sign(null, bytes, privateKey).toString('base64')}) + '\n');
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const isVersion = v => /^\d+\.\d+\.\d+$/.test(String(v || ''));
export function compareVersions(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 }

// The same checks as the apps: returns {release, latest} (release: the newest one for `platform` newer than `current`,
// or null when up to date), or throws with the reason.
export function checkFeed(bytes, sigBytes, {keys, platform, current, now = Date.now(), allowLocal = false}) {
  let sig; try { sig = JSON.parse(sigBytes) } catch { throw new Error('signature file unreadable') }
  if (sig?.alg !== 'ed25519' || typeof sig.key_id !== 'string' || typeof sig.sig !== 'string') throw new Error('signature file unreadable');
  const raw = keys.map(k => Buffer.from(k, 'base64')).find(k => k.length === 32 && keyId(k) === sig.key_id);
  if (!raw) throw new Error('signed by an unknown key');
  const pub = createPublicKey({key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki'});
  if (!verify(null, bytes, pub, Buffer.from(sig.sig, 'base64'))) throw new Error('signature does not match');
  let feed; try { feed = JSON.parse(bytes) } catch { throw new Error('feed unreadable') }
  if (feed?.schema !== SCHEMA || feed.product !== PRODUCT || feed.channel !== 'stable') throw new Error('not a student update feed');
  const expires = Date.parse(feed.expires_at || '');
  if (!(expires > now)) throw new Error('feed expired');
  const ok = d => d && typeof d.url === 'string' && /^[0-9a-f]{64}$/.test(d.sha256 || '') && Number.isInteger(d.size) && d.size > 0 && d.size <= 1024 ** 3 && safeURL(d.url, allowLocal);
  const list = (Array.isArray(feed.releases) ? feed.releases : []).filter(r => isVersion(r?.version) && ok(r.downloads?.[platform])).sort((a, b) => compareVersions(b.version, a.version));
  const top = list[0] || null;
  return {release: top && compareVersions(top.version, current) > 0 ? top : null, latest: top?.version || null};
}
export function safeURL(raw, allowLocal = false) {
  let u; try { u = new URL(raw) } catch { return false }
  if (u.username || u.password) return false;
  return u.protocol === 'https:' || (allowLocal && u.protocol === 'http:' && u.hostname === '127.0.0.1');
}
