// build-tools/tools.cjs: where the builds find esbuild, acorn, magic-string and Playwright.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';

const require = createRequire(import.meta.url), tools = require('../../build-tools/tools.cjs');
const ROOT = resolve(import.meta.dirname, '../..');
test('the order: environment, this project, then the Hermes default', () => {
  assert.deepEqual(tools.candidates('esbuild', {}), [join(ROOT, 'node_modules/esbuild'), join(tools.HERMES, 'esbuild')]);
  assert.deepEqual(tools.candidates('esbuild', {HQ_ESBUILD: '/x/esbuild'})[0], '/x/esbuild');
  assert.deepEqual(tools.candidates('esbuild', {HQ_ESBUILD_MODULE: '/y/esbuild'})[0], '/y/esbuild');
  assert.deepEqual(tools.candidates('acorn', {HQ_TOOLS_MODULES: '/z/node_modules'})[0], '/z/node_modules/acorn');
});
test('the pinned build tools are in this project', () => {
  for (const [name, version] of [['esbuild', '0.25.10'], ['acorn', '8.17.0'], ['magic-string', '0.30.21']]) {
    const dir = tools.locate(name, {});
    assert.equal(dir, join(ROOT, 'node_modules', name));
    assert.equal(require(join(dir, 'package.json')).version, version);
  }
  assert.equal(require(tools.locate('esbuild', {})).transformSync('let a = 1', {minify: true}).code.trim(), 'let a=1;');
});
test('an explicit path that does not exist is an error, not a silent fallback', () => {
  assert.throws(() => tools.locate('esbuild', {HQ_ESBUILD: '/does/not/exist'}), e => e.code === 'HQ_TOOL_MISSING' && /HQ_ESBUILD/.test(e.message) && /\/does\/not\/exist/.test(e.message));
});
