// Creates the update signing key (owner, once, on the signing Mac). It signs the student update feed only; it is NOT
// the licence key (license/issue.mjs) and must never be the same key.
//   node update/keygen.mjs [--dir <folder>]     default: ~/Library/Application Support/187N Update Signer
// Writes update-ed25519-private.pem (0600; refuses to overwrite) and prints the public key for update/config.json.
// Then: back the private key up (password manager), and keep a second, offline key the same way (--dir elsewhere), so a
// lost key does not strand installed apps: put both public keys in update/config.json.
import {generateKeyPairSync} from 'node:crypto';
import {existsSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {keyId, rawPublic} from './lib.mjs';

const i = process.argv.indexOf('--dir'), dir = i > 0 ? process.argv[i + 1] : join(homedir(), 'Library/Application Support/187N Update Signer');
const file = join(dir, 'update-ed25519-private.pem');
if (existsSync(file)) { console.error('An update key already exists at ' + file + '; it was NOT replaced.'); process.exit(5) }
mkdirSync(dir, {recursive: true, mode: 0o700});
const {privateKey} = generateKeyPairSync('ed25519');
writeFileSync(file, privateKey.export({type: 'pkcs8', format: 'pem'}), {mode: 0o600, flag: 'wx'});
const pub = rawPublic(privateKey).toString('base64');
// The licence public key must differ (it always will for a fresh key; this guards a copied file).
const lic = join(homedir(), 'Library/Application Support/187N License Signer/ed25519-public.txt');
if (existsSync(lic) && readFileSync(lic, 'utf8').trim() === pub) { console.error('This key equals the licence key. Delete it and run again.'); process.exit(6) }
writeFileSync(join(dir, 'update-ed25519-public.txt'), pub + '\n', {mode: 0o644});
console.log(JSON.stringify({private: file, public: pub, key_id: keyId(Buffer.from(pub, 'base64')), next: 'add {"public": "' + pub + '", "note": "primary"} to update/config.json → keys, then build'}, null, 2));
