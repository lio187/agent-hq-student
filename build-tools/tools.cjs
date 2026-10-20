// Where the build finds its JavaScript tools (esbuild, acorn and magic-string for the dashboard export, Playwright for
// the DMG background and the read-me PDFs). One rule for both editions:
//   1. an explicit environment value: HQ_ESBUILD (or the older HQ_ESBUILD_MODULE), HQ_TOOLS_MODULES (a node_modules
//      folder holding acorn and magic-string), HQ_PLAYWRIGHT;
//   2. this project's own node_modules (package.json + package-lock.json pin the versions);
//   3. the Hermes Agent install on the owner's Mac, the old default, as a last resort.
// A missing tool stops the build with a message that says how to fix it, instead of a bare "Cannot find module".
const {existsSync} = require('node:fs');
const {join, resolve} = require('node:path');
const {homedir} = require('node:os');

const PROJECT = resolve(__dirname, '..');
const LOCAL = join(PROJECT, 'node_modules');
const HERMES = join(homedir(), '.hermes/hermes-agent/node_modules');
const ENV = {esbuild: ['HQ_ESBUILD', 'HQ_ESBUILD_MODULE'], acorn: ['HQ_TOOLS_MODULES'], 'magic-string': ['HQ_TOOLS_MODULES'], playwright: ['HQ_PLAYWRIGHT']};
// HQ_TOOLS_MODULES names a node_modules folder; the others name the package folder itself.
const fromEnv = (name, env) => (ENV[name] || []).map(k => env[k] && (k === 'HQ_TOOLS_MODULES' ? join(env[k], name) : env[k])).filter(Boolean);

// The candidate folders for a package, in order (exported for the tests).
function candidates(name, env = process.env) { return [...fromEnv(name, env), join(LOCAL, name), join(HERMES, name)] }
// The package folder, or a clear error.
function locate(name, env = process.env) {
  const list = candidates(name, env), given = fromEnv(name, env);
  // An explicit setting is never silently skipped: a wrong path is an error, not a fallback.
  if (given.length) { if (existsSync(join(given[0], 'package.json'))) return given[0]; list.splice(1) }
  const hit = given.length ? null : list.find(p => existsSync(join(p, 'package.json')));
  if (hit) return hit;
  const e = new Error(name + ' was not found. Looked in:\n  ' + list.join('\n  ') + '\nFix: set ' + (ENV[name] || ['HQ_TOOLS_MODULES'])[0] +
    ' to the package folder, or install the pinned build tools in ' + PROJECT + ' (`npm ci`, needs a download).');
  e.code = 'HQ_TOOL_MISSING'; throw e;
}
const load = (name, env) => require(locate(name, env));
module.exports = {PROJECT, LOCAL, HERMES, candidates, locate, load};
