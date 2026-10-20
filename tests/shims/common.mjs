// Shared logic for the CLI stand-ins: their state lives in HQS_SHIM_STATE (sign-in status, a log of every call),
// and replies come from fixture files: the first line is a text the prompt must contain, the rest is the reply.
import {readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
export const STATE = process.env.HQS_SHIM_STATE || '/tmp/hqs-shim-state';
mkdirSync(STATE, {recursive: true});
export const signedIn = tool => (existsSync(join(STATE, 'auth-' + tool)) ? readFileSync(join(STATE, 'auth-' + tool), 'utf8').trim() : 'in') === 'in';
export const setSignedIn = (tool, v) => writeFileSync(join(STATE, 'auth-' + tool), v ? 'in' : 'out');
// Optional account details per tool (a test writes `account-<tool>.json` in the state folder; made-up values only).
export const account = (tool, defaults = {}) => { const f = join(STATE, 'account-' + tool + '.json'); try { return {...defaults, ...(existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {})} } catch { return defaults } };
// Reads stdin to the end (for `login --with-api-key`).
export const stdin = () => { try { return readFileSync(0, 'utf8') } catch { return '' } };
// Every call: the tool, its arguments, and the names of its environment variables (values only for HQS_SHIM_LOG_ENV).
export function log(tool, args) {
  const show = (process.env.HQS_SHIM_LOG_ENV || '').split(',').filter(Boolean);
  appendFileSync(join(STATE, 'calls.log'), JSON.stringify({tool, args, cwd: process.cwd(), env: Object.keys(process.env).sort(), values: Object.fromEntries(show.map(k => [k, process.env[k] ?? null])), at: Date.now()}) + '\n');
}
export function reply(prompt, fallback) {
  const dirs = [join(STATE, 'replies'), ...(process.env.HQS_SHIM_REPLIES || '').split(':').filter(Boolean)];
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) {
      const text = readFileSync(join(d, f), 'utf8'), nl = text.indexOf('\n');
      const key = text.slice(0, nl).trim(), body = text.slice(nl + 1).trim();
      if (key && prompt.includes(key)) return body;
    }
  }
  return fallback;
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const arg = (args, name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined };
