// Visible-text scan shared by tests/unit/export.test.mjs and the Windows edition's release check: every string a
// module can show (string literals and template text; never regular expressions or comments), and the words that name
// macOS things. `allow` lists exact strings that are fine: a shortcut glyph the office picks at run time from
// navigator.platform (⌘ on a Mac, Ctrl elsewhere), or a generic label such as a run's "Terminal" source.
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';

const require = createRequire(import.meta.url);
const acorn = require(require(join(resolve(import.meta.dirname, '../..'), 'build-tools/tools.cjs')).locate('acorn'));
export function strings(code) {
  const list = [];
  const walk = n => { if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Literal' && typeof n.value === 'string') list.push(n.value);
    if (n.type === 'TemplateElement') list.push(n.value.cooked ?? n.value.raw);
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v) } };
  walk(acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module'}));
  return list;
}
export const MAC_WORDS = [
  {re: /⌘/, allow: s => s === '⌘' || s === '⌘ '}, {re: /\bFinder\b/}, {re: /\bKeychain\b/}, {re: /\bmacOS\b/}, {re: /System Settings/},
  {re: /\.command\b/}, {re: /[⌥]/}, {re: /\bMac\b/}, {re: /\bTerminal\b/, allow: s => s === 'Terminal'},
];
export const macHits = list => list.flatMap(s => MAC_WORDS.filter(w => w.re.test(s) && !w.allow?.(s)).map(w => w.re.source + ' in ' + JSON.stringify(s.length > 90 ? s.slice(Math.max(0, s.search(w.re) - 40), s.search(w.re) + 40) : s)));
// A page shell's visible text and attributes (its scripts are bundles, scanned on their own).
export const shellText = html => html.replace(/<script[\s\S]*?<\/script>/g, '');
