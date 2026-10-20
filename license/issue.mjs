// 187N Agent HQ licence keys (owner only). The private signing key never leaves this Mac and is never part of the app,
// the installer or the DMG; the apps only hold the public key.
//   node license/issue.mjs --name "Student Name" --email student@example.com [--months 12] [--edition student]
//   node license/issue.mjs --public-key        prints the public key the builds embed (base64)
//   node license/issue.mjs --verify <key>      checks a key (needs only the public key)
//   node license/issue.mjs --init-new-key      first setup only: creates a NEW signing key (see the warning below)
// Files, in HQ_LICENSE_DIR or ~/Library/Application Support/187N License Signer/:
//   ed25519-private.pem   the signing key (0600). Back it up; without it no key can be issued that existing apps accept.
//   ed25519-public.txt    its public key (base64, 32 bytes). Written from the signing key; the release checks compare
//                         the key compiled into both apps with this file, so they never need the private key.
// A missing signing key is never replaced silently: an earlier version made a new one by itself, which would have made
// every licence issued so far invalid in the next build.
import {generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const DIR = process.env.HQ_LICENSE_DIR || join(homedir(), 'Library/Application Support/187N License Signer');
const PRIV = join(DIR, 'ed25519-private.pem'), PUB = join(DIR, 'ed25519-public.txt');
const arg = name => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined };
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const stop = (code, ...lines) => { console.error(lines.join('\n')); process.exit(code) };
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
// The raw 32-byte Ed25519 public key (what CryptoKit's Curve25519.Signing.PublicKey reads) of a private key.
const rawOf = priv => createPublicKey(priv).export({type: 'spki', format: 'der'}).subarray(-32);
const readPub = () => { const t = readFileSync(PUB, 'utf8').trim(), b = Buffer.from(t, 'base64'); if (b.length !== 32 || b.toString('base64') !== t) stop(4, 'The public key file is damaged: ' + PUB); return b };

function privateKey() {
  if (!existsSync(PRIV)) stop(3,
    'No licence signing key at ' + PRIV + '.',
    'Restore it from your backup (for example your password manager) to that path, with only you able to read it (chmod 600).',
    'Do NOT create a new key to get past this: every licence key you issued so far would stop working in apps built with it.',
    'Only for a brand-new setup with no students yet: node license/issue.mjs --init-new-key');
  const key = createPrivateKey(readFileSync(PRIV)), raw = rawOf(key);
  if (existsSync(PUB)) { if (!readPub().equals(raw)) stop(4, 'The public key file ' + PUB + ' does not belong to the signing key ' + PRIV + '.', 'One of the two was replaced. Restore the pair from your backup before issuing keys or building.') }
  else { writeFileSync(PUB, raw.toString('base64') + '\n', {mode: 0o644}); console.error('Wrote the public key file: ' + PUB) }
  return key;
}
// The public key: from the public key file (a build needs nothing else); checked against the signing key when that is here.
function publicKey() {
  if (existsSync(PRIV)) return rawOf(privateKey());
  if (existsSync(PUB)) return readPub();
  return rawOf(privateKey());  // stops with the restore message
}

if (process.argv.includes('--init-new-key')) {
  if (existsSync(PRIV)) stop(5, 'A signing key already exists at ' + PRIV + '. It was NOT replaced.', 'Keep using it. A new key would make every licence key issued so far invalid in new builds.');
  console.error([
    '',
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    '!!  CREATING A NEW LICENCE SIGNING KEY                                                    !!',
    '!!  Apps built from now on accept ONLY keys signed with this new key. Every licence key    !!',
    '!!  issued with an earlier key stops working once students install such a build.          !!',
    '!!  Back up the new key right away (password manager); it cannot be recovered.            !!',
    '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
    ''].join('\n'));
  mkdirSync(DIR, {recursive: true, mode: 0o700});
  const {privateKey: key} = generateKeyPairSync('ed25519');
  writeFileSync(PRIV, key.export({type: 'pkcs8', format: 'pem'}), {mode: 0o600, flag: 'wx'}); chmodSync(PRIV, 0o600);
  writeFileSync(PUB, rawOf(key).toString('base64') + '\n', {mode: 0o644});
  console.error('Created ' + PRIV + ' and ' + PUB);
  process.exit(0);
}
if (process.argv.includes('--public-key')) { console.log(publicKey().toString('base64')); process.exit(0) }
if (process.argv.includes('--verify')) {
  const key = arg('verify') || '', [p, s] = key.replace(/^HQ1-/, '').split('.');
  const pub = createPublicKey({key: Buffer.concat([SPKI, publicKey()]), format: 'der', type: 'spki'});
  let ok = false; try { ok = key.startsWith('HQ1-') && verify(null, fromB64url(p), pub, fromB64url(s || '')) } catch {}
  console.log(ok ? 'valid: ' + fromB64url(p).toString() : 'NOT valid'); process.exit(ok ? 0 : 1);
}
const name = arg('name'), email = arg('email') || '', months = Number(arg('months') || 0), edition = arg('edition') || 'student';
if (!name) stop(2, 'Usage: node license/issue.mjs --name "Student Name" --email student@example.com [--months 12]');
const iat = Math.floor(Date.now() / 1000), exp = months > 0 ? iat + Math.round(months * 30.44 * 86400) : 0;
const payload = Buffer.from(JSON.stringify({n: name, e: email, ed: edition, iat, exp}));
console.log('HQ1-' + b64url(payload) + '.' + b64url(sign(null, payload, privateKey())));
