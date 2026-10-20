// Builds the student edition's dashboard from the live Agent HQ source (read-only): the developer kit's cuts (no
// owner data, no creative engine), then the student edition's own changes (Social through Zernio, Setup, no sales,
// clients or finance pages). Output: build/web — only built files (minified bundle, styles, fonts, images), no source.
//   node frontend/export.mjs
import {readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync} from 'node:fs';
import {resolve, dirname, basename} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {STUDENT, INDEX_STUDENT, EXTRA_VIEWS, EXTRA_ASSIGNS, EXTRA_ACTIONS, EXTRA_STATEMENTS, EXTRA_OBJECT_PROPS, FORBIDDEN, PRUNE_CALLS, OVERLAY} from './student.mjs';

// Source: the pinned copy (frontend/pin.mjs), never the live office, unless HQ_SOURCE / HQ_WEB say otherwise.
// HQ_CHECK_ONLY=1 replays every cut and patch without writing anything (used by check-patches.mjs).
const HERE = import.meta.dirname, ROOT = resolve(HERE, '..');
// HQ_BUILD_DIR: where the output goes (default build/); HQ_PLATFORM=win: the Windows edition's wording (see WINDOWS).
const BUILD = resolve(process.env.HQ_BUILD_DIR || resolve(ROOT, 'build')), PLATFORM = process.env.HQ_PLATFORM || 'mac';
const AGENT = resolve(process.env.HQ_SOURCE || resolve(HERE, 'pinned')), WEB = resolve(process.env.HQ_WEB || resolve(AGENT, 'upgrade/web'));
const CHECK = process.env.HQ_CHECK_ONLY === '1';
// Build tools (esbuild, and acorn + magic-string for the kit's pruning): HQ_ESBUILD / HQ_TOOLS_MODULES, else this
// project's node_modules, else the old Hermes default (build-tools/tools.cjs). The kit reads HQ_TOOLS_MODULES itself.
const require = createRequire(import.meta.url), tools = require('../build-tools/tools.cjs');
const tool = name => { try { return tools.locate(name) } catch (e) { console.error('\nBUILD STOPPED: ' + e.message); process.exit(1) } };
if (!process.env.HQ_TOOLS_MODULES) { const a = tool('acorn'), m = tool('magic-string'); if (dirname(a) !== dirname(m)) { console.error('\nBUILD STOPPED: acorn and magic-string must sit in one node_modules folder (' + a + ', ' + m + ')'); process.exit(1) } process.env.HQ_TOOLS_MODULES = dirname(a) }
const kit = p => import(pathToFileURL(resolve(AGENT, 'devkit', p)).href);
const {removeParts, prune, stripComments, importsOf} = await kit('lib/prune.mjs');
const {scan, DENY: PINNED_DENY} = await kit('lib/leaks.mjs');
const {TRANSFORMS: KIT, INDEX_PATCHES, GLOBAL_TEXT} = await kit('transforms.mjs');
const R = await kit('rules.mjs');
// The leak scan uses the pinned deny list plus the live one, so a stricter rule added to the office still applies.
const LIVE_LEAKS = resolve(ROOT, '../agent-hq/devkit/lib/leaks.mjs');
const DENY = [...PINNED_DENY, ...(existsSync(LIVE_LEAKS) ? (await import(pathToFileURL(LIVE_LEAKS).href)).DENY : [])].filter((re, i, all) => all.findIndex(x => x.source === re.source && x.flags === re.flags) === i);
const SRC = resolve(BUILD, 'src'), OUT = resolve(BUILD, 'web'), OVER = resolve(HERE, 'overlay/web');
// The student pages name macOS things in a few places; the Windows edition gets the Windows words.
const WINDOWS = [
  [/Open System Settings › Privacy &amp; Security › Microphone, turn on 187N Agent HQ, then press Start talking again\./g, 'Open Settings › Privacy &amp; security › Microphone, turn on <b>Let desktop apps access your microphone</b>, then press Start talking again.'],
  [/The first time you press Start talking, macOS asks to use the microphone: click OK\. You can change this later in System Settings › Privacy &amp; Security › Microphone\./g, 'The first time you press Start talking, Windows may ask to use the microphone: allow it. You can change this later in Settings › Privacy &amp; security › Microphone.'],
  // Keys are encrypted with the student's Windows account (DPAPI), on this PC.
  [/stored in the macOS Keychain on this Mac/g, 'stored encrypted on this PC'], [/stays in your macOS Keychain/g, 'stays encrypted on this PC'], [/kept in your macOS Keychain/g, 'kept encrypted on this PC'],
  [/stay in your Mac’s Keychain/g, 'stay encrypted on this PC'], [/Saved in your Keychain/g, 'Saved, encrypted on this PC'], [/\bthe Keychain\b/g, 'encrypted storage'], [/\bKeychain\b/g, 'encrypted storage'],
  [/Show in Finder/g, 'Show in Explorer'], [/System \(San Francisco\)/g, 'System (Segoe UI)'], [/\bTerminal\b/g, 'PowerShell'], [/the Mac's folder picker/g, 'the folder picker'],
  [/\(⌘,\)/g, '(Ctrl+,)'], [/⌘ ?,/g, 'Ctrl+,'], [/\bthis Mac\b/g, 'this PC'], [/\byour Mac\b/g, 'your PC'], [/\bOn this Mac\b/g, 'On this PC'], [/\bmacOS\b/g, 'Windows'],
  [/\bits Mac app\b/g, 'its default app'],
  // Updates (mk-updates.mjs): how to install.
  [/Open the installer, then drag 187N Agent HQ into Applications to replace this version\./g, 'Open the installer and follow its steps; it replaces this version.'],
];
const forPlatform = text => PLATFORM === 'win' ? WINDOWS.reduce((t, [a, b]) => t.replace(a, b), text) : text;
// The office's own modules and page shell name a few macOS things too (12 Oct 2026 scan). Narrower than WINDOWS on
// purpose: generic labels such as a run's "Terminal" source stay. Shortcuts that the office already shows per platform
// (⌘ or Ctrl, from navigator.platform) need nothing here. tests/unit/export.test.mjs scans every built string.
const WINDOWS_OFFICE = [
  [/\bthis Mac\b/g, 'this PC'], [/'Opening Terminal…'/g, "'Opening PowerShell…'"], [/once you are done in Terminal\b/g, 'once you are done in PowerShell'],
  [/⌘K finds them/g, 'Ctrl+K finds them'], [/⌘\/Ctrl \+ /g, 'Ctrl + '], [/\(⌘⇧E\)/g, '(Ctrl+Shift+E)'],
];
const forPlatformOffice = text => PLATFORM === 'win' ? WINDOWS_OFFICE.reduce((t, [a, b]) => t.replace(a, b), text) : text;
const esbuild = require(tool('esbuild'));
const fail = m => { console.error('\nBUILD STOPPED: ' + m); process.exit(1) };
const write = (p, t) => { mkdirSync(dirname(p), {recursive: true}); writeFileSync(p, t) };
const copy = (a, b) => { mkdirSync(dirname(b), {recursive: true}); cpSync(a, b, {recursive: true}) };
const patch = (name, code, list) => { for (const [a, b, times = 1] of list || []) { const n = code.split(a).length - 1; if (n !== times) fail(name + ': a patch matched ' + n + ' times instead of ' + times + ': ' + a.slice(0, 100)); code = code.replaceAll(a, () => b) } return code };

// The student edition removes more views than the kit, and adds Social back as its own (Zernio) page.
const kitView = KIT['workspace-view.mjs'];
const viewOps = {
  ...kitView.remove,
  objectProps: {views: [...R.REMOVED_VIEWS, ...EXTRA_VIEWS], ...EXTRA_OBJECT_PROPS},
  statementsContaining: [...(kitView.remove.statementsContaining || []), ...EXTRA_STATEMENTS],
  memberAssigns: {views: [...R.REMOVED_VIEWS.filter(v => v !== 'social'), ...EXTRA_ASSIGNS]},
  ifTests: {a: {equals: [...R.REMOVED_ACTIONS, ...EXTRA_ACTIONS], prefixes: R.REMOVED_ACTION_PREFIXES}, section: {equals: [...R.REMOVED_VIEWS.filter(v => v !== 'social'), ...EXTRA_VIEWS, ...EXTRA_ASSIGNS]}},
  replaceInit: {...kitView.remove.replaceInit, ...(STUDENT['workspace-view.mjs']?.replaceInit || {})},
};
function transformed(name) {
  if (OVERLAY.includes(name)) return forPlatform(readFileSync(resolve(OVER, name), 'utf8'));
  let code = readFileSync(resolve(WEB, name), 'utf8');
  const k = KIT[name], s = STUDENT[name];
  code = patch(name, code, k?.patches);
  code = patch(name, code, s?.patches);
  const ops = name === 'workspace-view.mjs' ? viewOps : (k?.remove || s?.remove) ? {...k?.remove, ...s?.remove, replaceInit: {...k?.remove?.replaceInit, ...s?.remove?.replaceInit}} : null;
  if (ops) code = removeParts(code, ops).code;
  if (k?.prune || s?.prune || name === 'workspace-view.mjs') code = prune(code, {calls: [...R.PRUNE_CALLS, ...PRUNE_CALLS], drop: ['creatorPane']}).code;
  return code;
}

if (!CHECK) { rmSync(SRC, {recursive: true, force: true}); rmSync(OUT, {recursive: true, force: true}) }
const modules = new Map(), from = new Map(), queue = ['app.js', 'setup.mjs', 'brain-layout-worker.js', 'voice-worklet.js'], outside = new Set();
while (queue.length) {
  const name = queue.shift(); if (modules.has(name)) continue;
  if (!OVERLAY.includes(name) && !existsSync(resolve(WEB, name))) fail('missing module ' + name + ' (imported by ' + from.get(name) + ')');
  if (!/\.m?js$/.test(name)) { modules.set(name, null); continue }
  const code = transformed(name); modules.set(name, code);
  for (const spec of importsOf(code)) {
    if (spec === 'three') continue;
    if (spec.startsWith('../../assets/')) { outside.add(spec.slice(6)); continue }
    if (spec.startsWith('../')) fail(name + ' imports a file outside the dashboard: ' + spec);
    const next = spec.replace(/^\.\//, ''); if (!from.has(next)) from.set(next, name); queue.push(next);
  }
}
const chain = f => { const c = []; for (let x = f; x; x = from.get(x)) c.push(x); return c.reverse().join(' > ') };
for (const n of modules.keys()) if ([...R.FORBIDDEN, ...FORBIDDEN].includes(basename(n).replace(/\.m?js$/, ''))) fail('a removed module is still reachable: ' + chain(n));
// Neutral runtime wording from the kit, where it still applies (this edition cuts more, so some entries have no match).
for (const [n, code] of modules) if (code != null && !OVERLAY.includes(n)) {
  let next = code; for (const [a, b] of [...GLOBAL_TEXT].sort((x, y) => y[0].length - x[0].length)) next = next.replaceAll(a, () => b);
  modules.set(n, forPlatformOffice(patch(n, next, STUDENT[n]?.after)));
}
if (CHECK) {
  patch('index.html', patch('index.html', readFileSync(resolve(WEB, 'index.html'), 'utf8'), INDEX_PATCHES), INDEX_STUDENT);
  console.log('patches ok: ' + modules.size + ' modules from ' + WEB);
  process.exit(0);
}
for (const [n, code] of modules) {
  if (code == null) { copy(resolve(WEB, n), resolve(SRC, n)); continue }
  write(resolve(SRC, n), (OVERLAY.includes(n) ? code : stripComments(code)).replaceAll("'../../assets/", "'../assets/").replaceAll('"../../assets/', '"../assets/'));
}
for (const rel of outside) {
  const dir = dirname(rel); if (existsSync(resolve(BUILD, dir))) continue;
  for (const f of readdirSync(resolve(AGENT, dir))) {
    if (/higgsfield|hyperframes/i.test(f) || f === 'SOURCES.md') continue;
    if (f.endsWith('.js')) write(resolve(BUILD, dir, f), readFileSync(resolve(AGENT, dir, f), 'utf8').split('\n').filter(l => !/higgsfield|hyperframes/i.test(l)).join('\n'));
    else copy(resolve(AGENT, dir, f), resolve(BUILD, dir, f));
  }
}

// Leak scan on the transformed sources (they end up inside the bundle). Zernio is a product the students use, and
// "Creator Lab" is the name of the students' own Reel-analysis page; the owner's Creator Lab wiring (its proxy path,
// section id and embed) stays denied. Jev is TypeSafe's public model, which students use with their own key; the
// owner's private Jev kit stays denied.
const deny = DENY.filter(re => !/Zernio/i.test(re.source) && !/^Creator \?Lab$/i.test(re.source) && re.source !== '\\bJev\\b')
  .concat([/creator-lab\//i, /\bcreatorlab\b/i, /Creator ?Lab ?(proxy|embed|theme|radar|token)/i, /jev[-_ ]?(kit|data)\b/i, /decisions\.jsonl/i]);
const leak = list => { if (!list.length) return; const by = new Map(); for (const h of list) by.set(h.file, [...(by.get(h.file) || []), h]); for (const [f, l] of by) { console.error('\n' + f); for (const h of l.slice(0, 8)) console.error('  ' + h.line + ': ' + h.match + '  …' + (h.context || '').replace(/\s+/g, ' ') + '…') } fail(list.length + ' possible owner-data hits') };
leak([...scan(SRC, {deny}), ...scan(resolve(BUILD, 'assets'), {deny})]);

// The page shells, styles, fonts and images (minified), then the bundle.
let shell = readFileSync(resolve(WEB, 'index.html'), 'utf8');
shell = patch('index.html', patch('index.html', shell, INDEX_PATCHES), INDEX_STUDENT);
write(resolve(OUT, 'index.html'), forPlatformOffice(shell));
write(resolve(OUT, 'setup.html'), forPlatform(readFileSync(resolve(OVER, 'setup.html'), 'utf8')));
// Slide templates for the carousel and story maker: sealed with the dashboard, read by the app's renderer.
if (existsSync(resolve(HERE, 'overlay/templates'))) for (const f of readdirSync(resolve(HERE, 'overlay/templates'))) if (/\.(html|css)$/.test(f)) copy(resolve(HERE, 'overlay/templates', f), resolve(OUT, 'templates', f));
const minify = (code, loader) => esbuild.transformSync(code, {loader, minify: true, legalComments: 'none'}).code;
for (const css of ['tokens.css', 'style.css', 'cockpit.css', 'components.css', 'shell.css']) write(resolve(OUT, 'static', css), minify(readFileSync(resolve(WEB, css), 'utf8').replace(/[^{}]*(creatorlab|teamhub|brand-factory|leoncontent)[^{}]*\{[^{}]*\}/gi, ''), 'css'));
write(resolve(OUT, 'static/setup.css'), minify(readFileSync(resolve(OVER, 'setup.css'), 'utf8'), 'css'));
// The page links /static/dist/cockpit-page.css: cockpit.css without its :host rules (they only apply in the workspace
// shadow root, which loads the whole file), made with the office's own scripts/page-css.mjs.
if (/cockpit-page\.css/.test(shell)) {
  const {pageCss} = await import(pathToFileURL(resolve(AGENT, 'upgrade/scripts/page-css.mjs')).href);
  write(resolve(OUT, 'static/dist/cockpit-page.css'), minify(pageCss(readFileSync(resolve(WEB, 'cockpit.css'), 'utf8').replace(/[^{}]*(creatorlab|teamhub|brand-factory|leoncontent)[^{}]*\{[^{}]*\}/gi, '')), 'css'));
}
for (const w of ['brain-layout-worker.js', 'voice-worklet.js']) write(resolve(OUT, 'static', w), minify(readFileSync(resolve(SRC, w), 'utf8'), 'js'));
const STATIC = {'logo.png': 'assets/187n-infinity.png', 'logo-ui.png': 'assets/187n-infinity-ui.png', 'inter-variable.woff2': 'assets/fonts/inter/InterVariable-ui.woff2', 'space.woff2': 'assets/fonts/space-grotesk-latin.woff2',
  'jetbrains-mono-400-normal-ui.woff2': 'assets/fonts/calendar/jetbrains-mono-400-normal-ui.woff2', 'jetbrains-mono-500-normal-ui.woff2': 'assets/fonts/calendar/jetbrains-mono-500-normal-ui.woff2',
  'jetbrains-mono-400-normal.ttf': 'assets/fonts/calendar/jetbrains-mono-400-normal.ttf', 'jetbrains-mono-500-normal.ttf': 'assets/fonts/calendar/jetbrains-mono-500-normal.ttf'};
for (const n of ['gmail', 'notion', 'slack', 'googlecalendar', 'googledrive', 'claude', 'chatgpt']) STATIC['connector-' + n + '.png'] = 'assets/connectors/' + n + '.png';
for (const [n, s] of Object.entries(STATIC)) copy(resolve(AGENT, s), resolve(OUT, 'static', n));
await esbuild.build({entryPoints: {bundle: resolve(SRC, 'app.js'), setup: resolve(SRC, 'setup.mjs')}, bundle: true, format: 'esm', target: 'es2020', outdir: resolve(OUT, 'static/dist'),
  splitting: true, chunkNames: 'chunk-[hash]', assetNames: 'asset-[hash]', publicPath: '/static/dist/', minify: true, legalComments: 'none', loader: {'.png': 'file', '.svg': 'dataurl'},
  alias: {three: resolve(AGENT, 'vendor/three.js')}, logLevel: 'warning'});
leak(scan(OUT, {deny}));
console.log('student dashboard built: ' + modules.size + ' modules → build/web');
