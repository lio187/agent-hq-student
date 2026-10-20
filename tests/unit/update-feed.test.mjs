// The update feed's owner tools (update/keygen.mjs, update/make-feed.mjs, update/build-config.mjs) and its rules
// (update/lib.mjs), all in a temporary folder with throwaway keys. The apps' own checks are in tests/e2e/updates.cjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import * as L from '../../update/lib.mjs';
import {updateConfig} from '../../update/build-config.mjs';

const U = resolve(import.meta.dirname, '../../update'), dir = mkdtempSync(join(tmpdir(), 'hqs-feed-'));
test.after(() => rmSync(dir, {recursive: true, force: true}));
const keygen = d => JSON.parse(execFileSync(process.execPath, [join(U, 'keygen.mjs'), '--dir', d]).toString());
const make = (...args) => spawnSync(process.execPath, [join(U, 'make-feed.mjs'), ...args], {encoding: 'utf8'});
const key = keygen(join(dir, 'k1')), stranger = keygen(join(dir, 'k2'));
const config = join(dir, 'config.json'); writeFileSync(config, JSON.stringify({feedURL: 'https://updates.example.com/student/stable.json', keys: [{public: key.public}]}));
const dmg = join(dir, 'a.dmg'), exe = join(dir, 'a.exe'); writeFileSync(dmg, Buffer.alloc(5000, 1)); writeFileSync(exe, Buffer.alloc(7000, 2));
const out = join(dir, 'site/stable.json'), notes = join(dir, 'notes.md'); writeFileSync(notes, '- One\n- Two\n');

test('keygen makes a separate key and never overwrites one', () => {
  assert.equal(statSync(key.private).mode & 0o777, 0o600);
  assert.equal(Buffer.from(key.public, 'base64').length, 32);
  assert.equal(key.key_id, L.keyId(Buffer.from(key.public, 'base64')));
  const again = spawnSync(process.execPath, [join(U, 'keygen.mjs'), '--dir', join(dir, 'k1')], {encoding: 'utf8'});
  assert.equal(again.status, 5);
});
test('make-feed writes a signed feed from the built files; the apps\' rules accept it', () => {
  const r = make('--key', key.private, '--out', out, '--config', config, '--version', '1.3.1', '--notes', notes, '--mac-file', dmg, '--mac-url', 'https://updates.example.com/a.dmg', '--win-file', exe, '--win-url', 'https://updates.example.com/a.exe');
  assert.equal(r.status, 0, r.stderr);
  const feed = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(feed.latest, '1.3.1'); assert.equal(feed.releases[0].notes, '- One\n- Two');
  assert.deepEqual(feed.releases[0].downloads.mac, {url: 'https://updates.example.com/a.dmg', sha256: L.sha256(readFileSync(dmg)), size: 5000});
  const mac = L.checkFeed(readFileSync(out), readFileSync(out + '.sig'), {keys: [key.public], platform: 'mac', current: '1.3.0'});
  assert.equal(mac.release.version, '1.3.1');
  assert.equal(L.checkFeed(readFileSync(out), readFileSync(out + '.sig'), {keys: [key.public], platform: 'win', current: '1.3.1'}).release, null);
});
test('make-feed extends a feed, never overwrites a version, and refuses keys the apps do not trust', () => {
  assert.equal(make('--key', key.private, '--out', out, '--config', config, '--version', '1.3.1', '--mac-file', dmg, '--mac-url', 'https://x.example/a.dmg').status, 1);
  assert.equal(make('--key', key.private, '--out', out, '--config', config, '--version', '1.3.2', '--mac-file', dmg, '--mac-url', 'http://x.example/a.dmg').status, 1);
  assert.equal(make('--key', stranger.private, '--out', out, '--config', config, '--resign').status, 1);
  const r = make('--key', key.private, '--out', out, '--config', config, '--version', '1.4.0', '--win-file', exe, '--win-url', 'https://updates.example.com/b.exe');
  assert.equal(r.status, 0, r.stderr);
  const feed = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(feed.releases.map(x => x.version), ['1.4.0', '1.3.1']);
  // The Mac gets 1.3.1 (1.4.0 has no Mac download); Windows gets 1.4.0.
  assert.equal(L.checkFeed(readFileSync(out), readFileSync(out + '.sig'), {keys: [key.public], platform: 'mac', current: '1.3.0'}).release.version, '1.3.1');
  assert.equal(L.checkFeed(readFileSync(out), readFileSync(out + '.sig'), {keys: [key.public], platform: 'win', current: '1.3.0'}).release.version, '1.4.0');
  assert.equal(make('--key', key.private, '--out', out, '--config', config, '--resign').status, 0);
});
test('the rules refuse another key, changed bytes, an expired feed and plain http', () => {
  const bytes = readFileSync(out), sig = readFileSync(out + '.sig');
  assert.throws(() => L.checkFeed(bytes, sig, {keys: [stranger.public], platform: 'mac', current: '1.0.0'}), /unknown key/);
  assert.throws(() => L.checkFeed(Buffer.from(bytes.toString().replace('1.4.0', '1.4.1')), sig, {keys: [key.public], platform: 'mac', current: '1.0.0'}), /does not match/);
  assert.throws(() => L.checkFeed(bytes, sig, {keys: [key.public], platform: 'mac', current: '1.0.0', now: Date.now() + 400 * 864e5}), /expired/);
  assert.equal(L.safeURL('http://updates.example.com/a.dmg'), false);
  assert.equal(L.safeURL('https://user:pw@updates.example.com/a.dmg'), false);
  assert.equal(L.safeURL('http://127.0.0.1:4730/a.dmg', true), true);
});
test('a build never uses the licence key as the update key, and needs https', () => {
  const env = {HQ_UPDATE_FEED_URL: 'https://u.example/stable.json', HQ_UPDATE_KEYS: key.public};
  assert.deepEqual(updateConfig({env}), {feedURL: 'https://u.example/stable.json', keys: [key.public], configured: true});
  assert.throws(() => updateConfig({env, licenceKey: key.public}), /must not be the licence key/);
  assert.throws(() => updateConfig({env: {...env, HQ_UPDATE_FEED_URL: 'http://u.example/stable.json'}}), /https/);
  assert.throws(() => updateConfig({env: {...env, HQ_UPDATE_KEYS: 'abc'}}), /32 bytes/);
  // The project's own configuration (empty until the owner sets it up) is valid.
  const own = updateConfig({env: {}});
  assert.equal(typeof own.feedURL, 'string'); assert.ok(Array.isArray(own.keys));
});
