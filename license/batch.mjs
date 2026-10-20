// Licence keys for a whole member list at once (owner only), through issue.mjs, so its signing-key guard applies.
//   node license/batch.mjs <members.csv> [--months 12] [--out <codes.csv>]
// The CSV needs a header row with a name column and an email column (any order and spelling that contains "name" and
// "mail", as in a Whop member export). The output is a CSV of name, email and licence key, next to the input by default.
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join, dirname, basename} from 'node:path';

const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined };
const input = process.argv[2];
if (!input || input.startsWith('--')) { console.error('Usage: node license/batch.mjs <members.csv> [--months 12] [--out <codes.csv>]'); process.exit(2) }
const months = arg('months') || '12', out = arg('out') || join(dirname(input), basename(input, '.csv') + '-licence-keys.csv');

// A small CSV reader: quoted fields, doubled quotes, commas or semicolons.
function rows(text) {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const out = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') quoted = false; else cell += c; continue }
    if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) out.push(row); row = [] }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim())) out.push(row);
  return out;
}
const [head, ...members] = rows(readFileSync(input, 'utf8').replace(/^﻿/, ''));
const col = re => head.findIndex(h => re.test(h.trim()));
const ni = col(/name|naam/i), ei = col(/mail/i);
if (ni < 0 || ei < 0) { console.error('The first row needs a name column and an email column. Found: ' + head.join(', ')); process.exit(2) }

const issue = join(import.meta.dirname, 'issue.mjs'), csv = v => '"' + String(v).replace(/"/g, '""') + '"';
const lines = ['name,email,licence key'];
let made = 0;
for (const m of members) {
  const name = (m[ni] || '').trim(), email = (m[ei] || '').trim();
  if (!name && !email) continue;
  const key = execFileSync(process.execPath, [issue, '--name', name || email, '--email', email, '--months', months], {encoding: 'utf8'}).trim();
  lines.push([name, email, key].map(csv).join(',')); made++;
}
writeFileSync(out, lines.join('\n') + '\n', {mode: 0o600});
console.log(made + ' licence keys (' + months + ' months) → ' + out);
