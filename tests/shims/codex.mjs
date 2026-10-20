// Stand-in for Codex: login (ChatGPT or --with-api-key), login status and exec --json like the real CLI (honours
// --output-schema / -o). `login status` prints the real lines: "Logged in using ChatGPT", "Logged in using an API key -
// sk-…" or "Not logged in" (exit 1). CODEX_API_KEY / OPENAI_API_KEY in the environment count as an API-key sign-in.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {STATE, signedIn, setSignedIn, account, stdin, log, reply, sleep, arg} from './common.mjs';
const args = process.argv.slice(2); log('codex', args);
const out = o => process.stdout.write(JSON.stringify(o) + '\n');
const envKey = process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || '';
const masked = k => k.slice(0, 8) + '***' + k.slice(-4);
if (args[0] === '--version') { console.log('codex-cli 0.149.0'); process.exit(0) }
if (args[0] === 'login') {
  if (args[1] === 'status') {
    const a = account('codex', {method: 'chatgpt'});
    if (signedIn('codex')) console.log(a.method === 'apikey' ? 'Logged in using an API key - ' + masked(a.key || 'sk-proj-0000000000000000') : 'Logged in using ChatGPT');
    else if (envKey) console.log('Logged in using an API key - ' + masked(envKey));
    else { console.log('Not logged in'); process.exit(1) }
    process.exit(0);
  }
  if (args.includes('--with-api-key')) { const k = stdin().trim(); if (!k) { console.error('No API key provided via stdin.'); process.exit(1) } writeFileSync(join(STATE, 'account-codex.json'), JSON.stringify({method: 'apikey', key: k})); setSignedIn('codex', true); console.log('Successfully logged in'); process.exit(0) }
  setSignedIn('codex', true); console.log('Successfully logged in'); process.exit(0);
}
if (args[0] === 'logout') { setSignedIn('codex', false); console.log('Successfully logged out'); process.exit(0) }
if (args[0] === 'exec') {
  if (!signedIn('codex') && !envKey) { out({type: 'error', message: 'Not logged in. Run codex login.'}); process.exit(1) }
  const prompt = args[args.length - 1];
  const text = reply(prompt, 'Codex finished the automation script.');
  out({type: 'thread.started', thread_id: 'th-1'}); out({type: 'turn.started'});
  if (!args.includes('--output-schema')) out({type: 'item.started', item: {id: 'i1', type: 'command_execution', command: 'ls'}});
  await sleep(200);
  out({type: 'item.completed', item: {id: 'i2', type: 'agent_message', text}});
  const o = arg(args, '-o') || arg(args, '--output-last-message'); if (o) writeFileSync(o, text);
  out({type: 'turn.completed', usage: {input_tokens: 900, cached_input_tokens: 100, output_tokens: 150}});
  process.exit(0);
}
console.log('codex stand-in: unknown command'); process.exit(2);
