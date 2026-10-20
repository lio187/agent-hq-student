// Stand-in for Hermes Agent: auth status <provider>, setup/model (the sign-in) and one-shot -z runs with a usage file.
// `auth status <provider>` prints the real lines: "<provider>: logged in" (plus "  auth_type: oauth" for an account
// login) or "<provider>: logged out". A run with --provider openrouter works with OPENROUTER_API_KEY in the environment.
import {writeFileSync} from 'node:fs';
import {signedIn, setSignedIn, log, reply, sleep, arg} from './common.mjs';
const args = process.argv.slice(2); log('hermes', args);
if (args[0] === '--version') { console.log('Hermes Agent v0.21.5'); process.exit(0) }
if (args[0] === 'auth' && args[1] === 'status') {
  const p = args[2]; if (!p) { console.error('Provider is required. Example: `hermes auth status spotify`.'); process.exit(1) }
  if (signedIn('hermes')) { console.log(p + ': logged in'); if (['nous', 'openai-codex', 'anthropic'].includes(p)) console.log('  auth_type: oauth') } else console.log(p + ': logged out');
  process.exit(0);
}
if (args[0] === 'setup' || args[0] === 'model') { setSignedIn('hermes', true); console.log('Setup complete.'); process.exit(0) }
const prompt = arg(args, '-z') || '', usage = arg(args, '--usage-file');
const keyRun = arg(args, '--provider') === 'openrouter' && Boolean(process.env.OPENROUTER_API_KEY);
if (!signedIn('hermes') && !keyRun) { console.error('No provider configured. Run hermes setup.'); process.exit(1) }
await sleep(200);
console.log(reply(prompt, 'Hermes researched it and saved notes.'));
if (usage) writeFileSync(usage, JSON.stringify({input_tokens: 700, output_tokens: 120, model: 'test'}));
