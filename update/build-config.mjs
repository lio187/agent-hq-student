// What a build compiles in for the update check (both editions): the feed address and the trusted update public keys,
// from update/config.json, or HQ_UPDATE_FEED_URL / HQ_UPDATE_KEYS (comma-separated base64) for one build. An empty
// feed or no key means "updates not set up": the app says so and never checks.
//   node update/build-config.mjs <licence public key (base64)>   prints the checked configuration as JSON
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {safeURL} from './lib.mjs';

export function updateConfig({licenceKey = '', env = process.env} = {}) {
  const file = JSON.parse(readFileSync(join(import.meta.dirname, 'config.json'), 'utf8'));
  const feedURL = (env.HQ_UPDATE_FEED_URL ?? file.feedURL ?? '').trim();
  const keys = env.HQ_UPDATE_KEYS != null ? env.HQ_UPDATE_KEYS.split(',').map(s => s.trim()).filter(Boolean) : (file.keys || []).map(k => k.public);
  if (feedURL && !safeURL(feedURL)) throw new Error('update feed must be an https address: ' + feedURL);
  for (const k of keys) {
    const raw = Buffer.from(k, 'base64');
    if (raw.length !== 32 || raw.toString('base64') !== k) throw new Error('not an Ed25519 public key (32 bytes, base64): ' + k);
    if (licenceKey && k === licenceKey) throw new Error('the update key must not be the licence key (update/keygen.mjs makes a separate one)');
  }
  return {feedURL, keys, configured: Boolean(feedURL && keys.length)};
}
if (process.argv[1] && import.meta.filename === process.argv[1]) console.log(JSON.stringify(updateConfig({licenceKey: process.argv[2] || ''})));
