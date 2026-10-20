// license/issue.mjs in a throwaway signer folder (HQ_LICENSE_DIR): never the owner's real signing key.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, existsSync, readFileSync, writeFileSync, renameSync, rmSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

const ISSUE = resolve(import.meta.dirname, '../../license/issue.mjs');
const dir = mkdtempSync(join(tmpdir(), 'hqs-signer-'));
const run = (...args) => { const r = spawnSync(process.execPath, [ISSUE, ...args], {env: {...process.env, HQ_LICENSE_DIR: dir}, encoding: 'utf8'}); return {code: r.status, out: r.stdout.trim(), err: r.stderr} };
test.after(() => rmSync(dir, {recursive: true, force: true}));

test('a missing signing key is never replaced silently', () => {
  for (const args of [['--name', 'A', '--email', 'a@example.com'], ['--public-key']]) {
    const r = run(...args);
    assert.equal(r.code, 3); assert.match(r.err, /No licence signing key/); assert.match(r.err, /--init-new-key/);
  }
  assert.equal(existsSync(join(dir, 'ed25519-private.pem')), false);
});
test('--init-new-key creates the pair once, with a loud warning', () => {
  const r = run('--init-new-key');
  assert.equal(r.code, 0); assert.match(r.err, /CREATING A NEW LICENCE SIGNING KEY/);
  assert.equal(statSync(join(dir, 'ed25519-private.pem')).mode & 0o777, 0o600);
  assert.equal(Buffer.from(readFileSync(join(dir, 'ed25519-public.txt'), 'utf8').trim(), 'base64').length, 32);
  const again = run('--init-new-key');
  assert.equal(again.code, 5); assert.match(again.err, /NOT replaced/);
});
test('keys are signed and verified; the public key file is what builds embed', () => {
  const key = run('--name', 'Test Student', '--email', 'student@example.com', '--months', '12').out;
  assert.match(key, /^HQ1-[\w-]+\.[\w-]+$/);
  assert.equal(run('--verify', key).code, 0);
  assert.equal(run('--verify', key.slice(0, -4) + 'AAAA').code, 1);
  assert.equal(run('--public-key').out, readFileSync(join(dir, 'ed25519-public.txt'), 'utf8').trim());
});
test('a build needs only the public key file', () => {
  renameSync(join(dir, 'ed25519-private.pem'), join(dir, 'away.pem'));
  try {
    assert.equal(run('--public-key').code, 0);
    assert.equal(run('--name', 'B').code, 3);  // signing still needs the private key
  } finally { renameSync(join(dir, 'away.pem'), join(dir, 'ed25519-private.pem')) }
});
test('a public key file that does not match the signing key stops everything', () => {
  const good = readFileSync(join(dir, 'ed25519-public.txt'), 'utf8');
  writeFileSync(join(dir, 'ed25519-public.txt'), Buffer.alloc(32, 7).toString('base64') + '\n');
  try {
    for (const args of [['--public-key'], ['--name', 'C']]) { const r = run(...args); assert.equal(r.code, 4); assert.match(r.err, /does not belong/) }
  } finally { writeFileSync(join(dir, 'ed25519-public.txt'), good) }
});
