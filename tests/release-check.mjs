// Checks a release build before it is shared: universal binary, valid signature with the microphone entitlement,
// the microphone text, the version, no owner data in the binary's strings, the dashboard sealed (not readable), and
// the licence signing key nowhere in the app or the DMG, the version from the shared VERSION file, and the licence public
// key compiled in equal to the signer's public key file. It reads only public material: never the private signing key
// (private keys are found by their format instead).
//   node tests/release-check.mjs [path/to.dmg]
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync, readdirSync, lstatSync, mkdtempSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir, homedir} from 'node:os';
import {pathToFileURL} from 'node:url';

const ROOT = resolve(import.meta.dirname, '..'), APP = join(ROOT, 'build/187N Agent HQ.app');
const {DENY} = await import(pathToFileURL(join(ROOT, 'frontend/pinned/devkit/lib/leaks.mjs')).href);
// Zernio, Creator Lab and Jev (TypeSafe's public model) are names students see; the owner's Jev kit stays denied.
const deny = DENY.filter(re => !/Zernio/i.test(re.source) && !/^Creator \?Lab$/i.test(re.source) && re.source !== '\\bJev\\b').concat([/jev[-_ ]?(kit|data)\b/i]);
const sh = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const results = []; const check = (name, ok, detail = '') => { results.push({name, ok, detail}); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')) };

const exe = join(APP, 'Contents/MacOS/AgentHQ');
check('app exists', existsSync(exe), APP);
const archs = sh('lipo', ['-archs', exe]).trim();
check('universal binary', archs.includes('arm64') && archs.includes('x86_64'), archs);
try { sh('codesign', ['--verify', '--strict', APP]); check('signature valid', true) } catch (e) { check('signature valid', false, e.stderr) }
const ent = (() => { try { return execFileSync('codesign', ['-d', '--entitlements', ':-', APP], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}) } catch { return '' } })();
check('microphone entitlement', ent.includes('com.apple.security.device.audio-input'));
const plist = readFileSync(join(APP, 'Contents/Info.plist'), 'utf8');
check('microphone usage text', /NSMicrophoneUsageDescription/.test(plist));
const version = sh('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(APP, 'Contents/Info.plist')]).trim();
const VERSION = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
check('version is the shared VERSION', version === VERSION, version + ' / VERSION ' + VERSION);
const build = sh('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleVersion', join(APP, 'Contents/Info.plist')]).trim();
check('build number follows the version', build === String(VERSION.split('.').reduce((n, x, i) => n + Number(x) * [10000, 100, 1][i], 0)), build);
check('bundle id is the release id', sh('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', join(APP, 'Contents/Info.plist')]).trim() === 'ai.187n.agent-hq.student');
// Owner data in the binary (the sealed dashboard is encrypted, so only the engine's own strings can leak).
const strings = sh('strings', ['-a', exe]);
// The engine itself must know where the student's own Hermes lives (~/.hermes), so that dashboard rule does not apply here.
const hits = deny.filter(re => !/hermes/.test(re.source)).flatMap(re => [...strings.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))].slice(0, 3).map(m => re.source + ' → ' + m[0]));
check('no owner data in the engine', hits.length === 0, hits.slice(0, 5).join(' | '));
check('test hooks compiled out', !/HQS_HOME_OVERRIDE|HQS_SUPPORT_DIR|HQS_KEYCHAIN_SERVICE/.test(strings));
check('engine reports the same version', strings.split('\n').includes('187N Agent HQ student edition ' + VERSION), VERSION);
// The licence public key compiled into the app equals the signer's public key file (written by license/issue.mjs).
const signer = process.env.HQ_LICENSE_DIR || join(homedir(), 'Library/Application Support/187N License Signer');
const pubFile = join(signer, 'ed25519-public.txt'), pub = existsSync(pubFile) ? readFileSync(pubFile, 'utf8').trim() : '';
const compiled = (strings.match(/^[A-Za-z0-9+/]{43}=$/gm) || []);
// The update check: the feed and keys compiled in are update/config.json's, and the update key is not the licence key.
const {updateConfig} = await import(pathToFileURL(join(ROOT, 'update/build-config.mjs')).href);
let upd = null; try { upd = updateConfig({licenceKey: pub, env: {}}) } catch (e) { check('update configuration valid', false, e.message) }
if (upd) {
  check('update keys compiled in = update/config.json', upd.keys.every(k => compiled.includes(k)) && compiled.filter(k => k !== pub).every(k => upd.keys.includes(k)), upd.keys.length + ' key(s)');
  check('update feed compiled in = update/config.json', !upd.feedURL || strings.includes(upd.feedURL), upd.feedURL || 'none');
  if (!upd.configured) console.log('note update checks are not set up in this build (update/config.json has no feed or key): the app says so and never checks');
}
// (Swift keeps a literal with a non-ASCII character as UTF-16, which `strings` does not show: search the bytes.)
const binary = readFileSync(exe), menuItem = 'Check for Updates…';
check('the menu has Check for Updates…', binary.includes(Buffer.from(menuItem, 'utf16le')) || binary.includes(Buffer.from(menuItem)));
check('licence public key = the signer\'s public key file', Boolean(pub) && compiled.includes(pub), pub ? (compiled.includes(pub) ? pub.slice(0, 12) + '…' : 'compiled: ' + compiled.slice(0, 3).join(', ')) : 'missing ' + pubFile + ' (run node license/issue.mjs --public-key once)');
// The dashboard is sealed: no readable HTML or JS next to the binary.
const res = readdirSync(join(APP, 'Contents/Resources'));
check('dashboard sealed', res.includes('app.pak') && !res.some(f => /\.(html|m?js|css)$/.test(f)), res.join(', '));
const pak = readFileSync(join(APP, 'Contents/Resources/app.pak'));
check('archive not readable', !pak.includes(Buffer.from('<!doctype html')) && !pak.includes(Buffer.from('function ')));
// No private key may ship. Recognised by its format, so this check never reads the real signing key: a PEM private
// key, or an Ed25519 PKCS#8 key in DER or base64 (any Ed25519 private key starts with these bytes).
const PRIVATE_MARKS = [Buffer.from('PRIVATE KEY'), Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from('MC4CAQAwBQYDK2VwBCIEI')];
// Links are not followed (the DMG's Applications link points at this Mac's own /Applications).
const scanKey = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f); const s = lstatSync(p); if (s.isSymbolicLink()) continue; if (s.isDirectory()) { if (scanKey(p)) return p } else if (s.size < 50e6) { const b = readFileSync(p); if (PRIVATE_MARKS.some(m => b.includes(m))) return p } } return null };
const leakIn = [scanKey(APP), scanKey(join(ROOT, 'app')), scanKey(join(ROOT, 'build/web'))].filter(Boolean);
// The office's Video editor is not part of the student app (owner decision, 12 Oct 2026): nothing of it in what was sealed.
const editorHits = []; const scanEditor = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f), st = lstatSync(p); if (st.isDirectory()) scanEditor(p); else if (/\.(m?js|html|css)$/.test(f) && /editor-host|editor-view|\/api\/hq\/v1\/editor|filmcraft|Video editor/i.test(readFileSync(p, 'utf8'))) editorHits.push(p.slice(ROOT.length + 1)) } };
scanEditor(join(ROOT, 'build/web'));
check('no Video editor in the sealed dashboard', editorHits.length === 0, editorHits.slice(0, 3).join(', '));
check('no signing key in the app or sources', leakIn.length === 0, leakIn.join(', '));
// The DMG: the app, Applications, Read Me First.
const dmg = process.argv[2];
if (dmg) {
  const mount = mkdtempSync(join(tmpdir(), 'hqs-dmg-'));
  sh('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
  try {
    const items = readdirSync(mount);
    check('DMG is this version', dmg.endsWith(' ' + VERSION + '.dmg'), dmg.split('/').pop());
    check('DMG contents', items.includes('187N Agent HQ.app') && items.includes('Applications') && items.includes('Read Me First.pdf'), items.join(', '));
    check('no signing key in the DMG', !scanKey(mount));
    try { sh('codesign', ['--verify', '--strict', join(mount, '187N Agent HQ.app')]); check('DMG app signature valid', true) } catch (e) { check('DMG app signature valid', false, e.stderr) }
  } finally { sh('hdiutil', ['detach', mount]) }
}
const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' release checks passed');
process.exitCode = failed ? 1 : 0;
