// Source-level pruning for the developer kit: removes named views, action branches and properties from a module,
// then removes every declaration nothing references any more, repeating until nothing changes. Works on the
// syntax tree (acorn) and edits the original text (magic-string), so kept code keeps its exact formatting.
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const TOOLS = process.env.HQ_TOOLS_MODULES || '/Users/ghatas/.hermes/hermes-agent/node_modules';
const acorn = require(TOOLS + '/acorn');
const MagicString = require(TOOLS + '/magic-string');

export const parse = (code, onComment) => acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'module', onComment});

// Visit every node with its parent and the parent's key.
export function walk(node, visit, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node, parent, key) === false) return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, visit, node, k));
    else if (v && typeof v.type === 'string') walk(v, visit, node, k);
  }
}

const nameOf = n => n?.type === 'Identifier' ? n.name : n?.type === 'Literal' ? String(n.value) : null;

// Remove a set of elements from a comma-separated list (object properties, declarators) without leaving commas.
function removeFromList(s, list, drop) {
  const keep = list.map(n => !drop.has(n));
  let i = 0;
  while (i < list.length) {
    if (keep[i]) { i++; continue }
    let j = i; while (j < list.length && !keep[j]) j++;
    if (j < list.length) s.remove(list[i].start, list[j].start);
    else if (i > 0) s.remove(list[i - 1].end, list[j - 1].end);
    else s.remove(list[i].start, list[j - 1].end);
    i = j;
  }
}

// Structural removals. ops: {objectProps:{views:[...]}, memberAssigns:{views:[...]}, ifTests:{a:{equals:[...],prefixes:[...]}},
// replaceProps:{views:{name:code}}, statementsContaining:[...]}
export function removeParts(code, ops) {
  const ast = parse(code), s = new MagicString(code), done = new Set();
  const want = (set, name) => (set || []).includes(name), gone = [];
  walk(ast, (node, parent, key) => {
    if (gone.some(([a, b]) => node.start >= a && node.end <= b)) return false;  // inside something already removed
    // const views={...}: drop and replace properties
    if (node.type === 'VariableDeclarator' && node.init?.type === 'ObjectExpression') {
      const v = node.id.name, props = node.init.properties.filter(p => p.type === 'Property');
      const drop = new Set(props.filter(p => want(ops.objectProps?.[v], nameOf(p.key))));
      drop.forEach(p => { done.add(v + '.' + nameOf(p.key)); gone.push([p.start, p.end]) });
      if (drop.size) removeFromList(s, node.init.properties, drop);
      for (const p of props) {
        const code2 = ops.replaceProps?.[v]?.[nameOf(p.key)];
        if (code2 != null && !drop.has(p)) { s.overwrite(p.start, p.end, code2); gone.push([p.start, p.end]); done.add('replace:' + v + '.' + nameOf(p.key)) }
      }
    }
    // const NAME=<init>: replace the initializer
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && ops.replaceInit?.[node.id.name] != null && node.init) {
      s.overwrite(node.init.start, node.init.end, ops.replaceInit[node.id.name]); done.add('init:' + node.id.name); return false;
    }
    // views.x=...;  (also `views.a=...;views.b=...` on one line: separate statements)
    if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' && node.expression.left.type === 'MemberExpression') {
      const left = node.expression.left, obj = left.object?.name, prop = nameOf(left.property);
      if (obj && want(ops.memberAssigns?.[obj], prop)) { s.remove(node.start, node.end); done.add(obj + '.' + prop); return false }
      const code2 = obj ? ops.replaceAssigns?.[obj]?.[prop] : null;
      if (code2 != null) { s.overwrite(node.start, node.end, code2); done.add('replace:' + obj + '.' + prop); return false }
    }
    // if(a==='x'){...}  /  if(a==='x'||a==='y')  /  if(a.startsWith('x'))
    if (node.type === 'IfStatement' && !node.alternate && ops.ifTests) {
      const hit = testHits(node.test, ops.ifTests);
      if (hit) { s.remove(node.start, node.end); done.add('if:' + hit); return false }
    }
    // A statement that touches a removed part: an expression statement, or an `if` whose condition or single-statement
    // body does (never an `if` with a block body: that block holds other code).
    if (Array.isArray(parent?.[key]) && (ops.statementsContaining || []).length) {
      const text = node.type === 'ExpressionStatement' ? code.slice(node.start, node.end)
        : node.type === 'IfStatement' && !node.alternate && node.consequent.type !== 'BlockStatement' ? code.slice(node.start, node.end)
        : node.type === 'IfStatement' && !node.alternate ? code.slice(node.test.start, node.test.end) : null;
      const marker = text && ops.statementsContaining.find(m => text.includes(m));
      if (marker) { s.remove(node.start, node.end); done.add('stmt:' + marker); return false }
    }
  });
  return {code: s.toString(), done};
}
function testHits(test, rules) {
  if (test.type === 'LogicalExpression' && test.operator === '||') { const a = testHits(test.left, rules), b = testHits(test.right, rules); return a && b ? a + '|' + b : null }
  // a && b is dead when either side can never be true (a removed section)
  if (test.type === 'LogicalExpression' && test.operator === '&&') return testHits(test.left, rules) || testHits(test.right, rules);
  if (test.type === 'BinaryExpression' && test.operator === '===' && test.left.type === 'Identifier' && test.right.type === 'Literal') {
    return (rules[test.left.name]?.equals || []).includes(test.right.value) ? test.right.value : null;
  }
  if (test.type === 'CallExpression' && test.callee.type === 'MemberExpression' && test.callee.object.type === 'Identifier' && nameOf(test.callee.property) === 'startsWith' && test.arguments[0]?.type === 'Literal') {
    return (rules[test.callee.object.name]?.prefixes || []).includes(test.arguments[0].value) ? test.arguments[0].value + '*' : null;
  }
  return null;
}

// Count identifier uses by name (declarations included; property keys and member names excluded).
function counts(ast) {
  const c = new Map(), add = n => c.set(n, (c.get(n) || 0) + 1);
  walk(ast, (node, parent, key) => {
    if (node.type !== 'Identifier') return;
    if (parent && (parent.type === 'MemberExpression' && key === 'property' && !parent.computed)) return;
    if (parent && (parent.type === 'Property' || parent.type === 'PropertyDefinition' || parent.type === 'MethodDefinition') && key === 'key' && !parent.computed && !parent.shorthand) return;
    if (parent && parent.type === 'Property' && parent.shorthand && key === 'key' && parent.value !== node) return;
    if (parent && (parent.type === 'ExportSpecifier' && key === 'exported')) return;
    if (parent && parent.type === 'ImportSpecifier' && key === 'imported') return;  // acorn reuses the node for `local` when not renamed
    add(node.name);
  });
  return c;
}
const PURE = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'Literal', 'Identifier', 'ClassExpression']);
function pure(init, calls) {
  if (!init) return true;
  if (PURE.has(init.type)) return true;
  if (init.type === 'MemberExpression' && !init.computed && (init.object.type === 'Identifier' || init.object.type === 'MemberExpression')) return true;
  if (init.type === 'TemplateLiteral') return init.expressions.every(e => pure(e, calls));
  if (init.type === 'ArrayExpression') return init.elements.every(e => !e || pure(e, calls));
  if (init.type === 'ObjectExpression') return init.properties.every(p => p.type === 'Property' && !p.computed && pure(p.value, calls));
  if (init.type === 'NewExpression' && ['Set', 'Map', 'WeakMap', 'WeakSet'].includes(init.callee.name)) return init.arguments.every(a => pure(a, calls));
  if (init.type === 'CallExpression') {
    const callee = init.callee.type === 'Identifier' ? init.callee.name : init.callee.type === 'MemberExpression' ? nameOf(init.callee.object) + '.' + nameOf(init.callee.property) : '';
    return calls.includes(callee) || /^Object\.(assign|freeze|fromEntries|entries)$/.test(callee) && init.arguments.every(a => pure(a, calls));
  }
  if (init.type === 'BinaryExpression' || init.type === 'LogicalExpression') return pure(init.left, calls) && pure(init.right, calls);
  if (init.type === 'UnaryExpression') return pure(init.argument, calls);
  if (init.type === 'ConditionalExpression') return pure(init.test, calls) && pure(init.consequent, calls) && pure(init.alternate, calls);
  return false;
}

// One pass: unused simple declarations (const/let/function, never exported), unused import specifiers.
function prunePass(code, {calls = [], keep = [], drop: force = []} = {}) {
  const ast = parse(code), c = counts(ast), s = new MagicString(code), removed = [];
  const unused = name => !keep.includes(name) && (c.get(name) || 0) <= 1;
  walk(ast, (node, parent) => {
    const exported = parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration';
    if (node.type === 'ImportDeclaration') {
      const drop = new Set(node.specifiers.filter(sp => unused(sp.local.name)));
      if (!drop.size) return false;
      drop.forEach(sp => removed.push(sp.local.name));
      if (drop.size === node.specifiers.length) s.remove(node.start, node.end);
      else {
        const named = node.specifiers.filter(sp => sp.type === 'ImportSpecifier'), other = node.specifiers.filter(sp => sp.type !== 'ImportSpecifier' && !drop.has(sp));
        const keptNamed = named.filter(sp => !drop.has(sp));
        const parts = [...other.map(sp => code.slice(sp.start, sp.end)), ...(keptNamed.length ? ['{' + keptNamed.map(sp => code.slice(sp.start, sp.end)).join(',') + '}'] : [])];
        s.overwrite(node.start, node.end, 'import ' + parts.join(',') + ' from ' + code.slice(node.source.start, node.source.end) + ';');
      }
      return false;
    }
    if (node.type === 'FunctionDeclaration' && node.id && !exported && unused(node.id.name)) {
      s.remove(node.start, node.end); removed.push(node.id.name); return false;
    }
    if (node.type === 'VariableDeclaration' && !exported && !/^For/.test(parent?.type || '')) {
      const drop = new Set(node.declarations.filter(d => d.id.type === 'Identifier' && unused(d.id.name) && (pure(d.init, calls) || force.includes(d.id.name))));
      if (!drop.size) return;
      drop.forEach(d => removed.push(d.id.name));
      if (drop.size === node.declarations.length) s.remove(node.start, node.end);
      else removeFromList(s, node.declarations, drop);
      return false;
    }
  });
  return {code: s.toString(), removed};
}
export function prune(code, options) {
  const all = [];
  for (let i = 0; i < 40; i++) { const r = prunePass(code, options); if (!r.removed.length) break; all.push(...r.removed); code = r.code }
  return {code, removed: all};
}

// Strip every comment (acorn knows strings, regexes and templates); whole-line comments take their line with them.
export function stripComments(code) {
  const comments = []; parse(code, comments);
  const s = new MagicString(code);
  for (const c of comments) {
    let start = c.start, end = c.end;
    const lineStart = code.lastIndexOf('\n', start - 1) + 1, nl = code.indexOf('\n', end);
    const before = code.slice(lineStart, start), after = code.slice(end, nl < 0 ? code.length : nl);
    if (!before.trim() && !after.trim()) { start = lineStart; end = nl < 0 ? code.length : nl + 1 }
    s.remove(start, end);
  }
  return s.toString().replace(/\n{3,}/g, '\n\n');
}

// Module specifiers a module imports (static, re-exports, literal dynamic imports).
export function importsOf(code) {
  const out = new Set(), ast = parse(code);
  walk(ast, node => {
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) out.add(node.source.value);
    if (node.type === 'ImportExpression' && node.source.type === 'Literal') out.add(node.source.value);
  });
  return [...out];
}
