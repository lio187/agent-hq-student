// Runs every check against the current test build (sh build.sh --test first), a few at a time, each on its own
// ports, and prints one summary. Exit code 1 when anything failed. `unit` needs no app: the shared build pieces
// (the dashboard export for both editions, the licence issuer, the tool paths), run with node --test.
//   node tests/run-all.mjs [--only name,name]
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const SUITES = [
  ['sweep', 'tests/e2e/sweep.cjs', 4591, 4590], ['core', 'tests/e2e/core.cjs', 4811, 4810], ['content', 'tests/e2e/content.cjs', 4611, 4610], ['research', 'tests/e2e/research.cjs', 4621, 4620],
  ['analysis', 'tests/e2e/analysis.cjs', 4631, 4630], ['makers', 'tests/e2e/makers.cjs', 4641, 4640], ['voice', 'tests/e2e/voice.cjs', 4651, 4650],
  ['runtimes', 'tests/e2e/runtimes.cjs', 4661, 4660], ['brain', 'tests/e2e/brain.cjs', 4671, 4670], ['tools', 'tests/e2e/tools.cjs', 4681, 4680], ['tools-formats', 'tests/e2e/tools-formats.cjs', 4681, 4680],
  ['integration', 'tests/e2e/integration.cjs', 4701, 4700], ['schedule', 'tests/e2e/schedule.cjs', 4711, 4710], ['jev', 'tests/e2e/jev.cjs', 4721, 4720],
  ['updates', 'tests/e2e/updates.cjs', 4731, 4730], ['unit', null, 0, 0],
];
const at = process.argv.indexOf('--only'), only = at > 0 ? (process.argv[at + 1] || '').split(',').filter(Boolean) : [];
const list = SUITES.filter(([n]) => !only.length || only.includes(n));
const logs = join(tmpdir(), 'hqs-runs', 'logs'); mkdirSync(logs, {recursive: true});
const run = ([name, file, app, mock]) => new Promise(done => {
  const t0 = Date.now(), p = spawn(process.execPath, file ? [join(ROOT, file), String(app), String(mock)] : ['--test', 'tests/unit/*.test.mjs'], {cwd: ROOT});
  let out = ''; p.stdout.on('data', b => out += b); p.stderr.on('data', b => out += b);
  p.on('close', code => { writeFileSync(join(logs, name + '.log'), out); done({name, code, s: Math.round((Date.now() - t0) / 1000), tail: out.trim().split('\n').slice(-3).join(' | ')}) });
});
const results = [];
// Suites that share ports run one after the other; the rest three at a time.
const groups = [], byPort = new Map();
for (const s of list) { const k = s[2]; if (!byPort.has(k)) { byPort.set(k, []); groups.push(byPort.get(k)) } byPort.get(k).push(s) }
const queue = [...groups];
await Promise.all([0, 1, 2].map(async () => { while (queue.length) { for (const s of queue.shift()) { const r = await run(s); results.push(r); console.log((r.code === 0 ? 'PASS ' : 'FAIL ') + r.name.padEnd(14) + String(r.s).padStart(4) + 's  ' + r.tail.slice(0, 160)) } } }));
const failed = results.filter(r => r.code !== 0);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' suites passed · logs: ' + logs);
process.exitCode = failed.length ? 1 : 0;
