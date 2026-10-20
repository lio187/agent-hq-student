// The student dashboard as it is built for each edition (node --test tests/unit/): exports it twice into a temporary
// folder (macOS wording and Windows wording) and checks what would be sealed into the app.
//  - No Video editor anywhere: the office's FilmCraft section (owner decision, 12 Oct 2026) has no API in the student
//    engines, so no view, host, route, module or navigation entry may reach either build.
//  - The Windows build names no macOS things in visible text: every string in every module and every shipped chunk,
//    plus the page shells, is scanned for ⌘, Finder, Keychain, macOS, System Settings, .command files, "Mac" and the
//    Terminal app. Shortcuts the office picks per platform at run time (⌘ or Ctrl from navigator.platform) are allowed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {strings, macHits, shellText} from '../lib/wording.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const out = mkdtempSync(join(tmpdir(), 'hqs-export-'));
const build = platform => { const dir = join(out, platform); execFileSync(process.execPath, [join(ROOT, 'frontend/export.mjs')], {env: {...process.env, HQ_BUILD_DIR: dir, HQ_PLATFORM: platform}, stdio: 'pipe'}); return dir };
const files = (dir, re) => readdirSync(dir, {recursive: true}).map(f => join(dir, f)).filter(f => re.test(f) && statSync(f).isFile());
const built = {mac: build('mac'), win: build('win')};
test.after(() => rmSync(out, {recursive: true, force: true}));

const EDITOR = [/editor-host/, /editor-view/, /\/api\/hq\/v1\/editor/, /editor\//, /filmcraft/i, /Video editor/, /data-section="editor"/, /hq-editor-/];
for (const platform of ['mac', 'win']) test('no Video editor in the ' + platform + ' build', () => {
  const hits = [];
  for (const f of files(built[platform], /\.(m?js|html|css)$/)) {
    const text = readFileSync(f, 'utf8');
    // "editor/" also matches the office's own content editor paths; only the Video editor's API and app count.
    for (const re of EDITOR) { const m = text.match(re); if (m && !(re.source === 'editor\\/' && !/\/(api\/hq\/v1|apps)\/[^'"]*editor\//.test(text.slice(Math.max(0, m.index - 40), m.index + 10)))) hits.push(f.slice(out.length) + ': ' + m[0]) }
  }
  assert.deepEqual(hits, []);
});
test('the student navigation has no editor section', async () => {
  const nav = await import(pathToFileURL(join(ROOT, 'frontend/overlay/web/workspace-navigation.mjs')).href);
  const views = nav.WORKSPACES.flatMap(w => w.pages.flatMap(p => p.views.map(([v]) => v)));
  assert.ok(views.length > 20 && !views.includes('editor'), views.join(','));
});
test('the engines have no editor API', () => {
  const engines = [...files(join(ROOT, 'app'), /\.swift$/), ...files(resolve(ROOT, '../agent-hq-student-windows/engine'), /\.mjs$/)];
  assert.ok(engines.length > 40);
  const hits = engines.filter(f => /filmcraft|v1\/editor|"editor\/|'editor\//i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('Windows build: no macOS words in the modules', () => {
  const hits = files(join(built.win, 'src'), /\.m?js$/).flatMap(f => macHits(strings(readFileSync(f, 'utf8'))).map(h => f.split('/src/')[1] + ': ' + h));
  assert.deepEqual(hits, []);
});
test('Windows build: no macOS words in the shipped bundle', () => {
  const chunks = files(join(built.win, 'web/static/dist'), /\.js$/);
  assert.ok(chunks.length > 10);
  const hits = chunks.flatMap(f => macHits(strings(readFileSync(f, 'utf8'))).map(h => f.split('/dist/')[1] + ': ' + h));
  assert.deepEqual(hits, []);
});
test('Windows build: no macOS words in the page shells', () => {
  const hits = ['index.html', 'setup.html'].flatMap(f => macHits([shellText(readFileSync(join(built.win, 'web', f), 'utf8'))]).map(h => f + ': ' + h));
  assert.deepEqual(hits, []);
});
test('the macOS build keeps its own words (the scan is not blind)', () => {
  const all = files(join(built.mac, 'src'), /\.m?js$/).flatMap(f => strings(readFileSync(f, 'utf8')));
  assert.ok(macHits(all).length > 5, 'expected macOS wording in the macOS build');
});
