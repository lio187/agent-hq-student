// Page-level copy of a shadow-root stylesheet (11 Oct 2026, Track B2). cockpit.css serves two places: the workspace
// shadow root (all of it) and the page itself, where its :host rules can never match. Those were 156 of its 175 KB and
// render-blocking. pageCss() keeps every rule except selectors that contain :host (a selector list keeps its other
// selectors), recurses into @media/@supports/@container/@layer blocks and keeps every other at-rule unchanged.
const GROUPS = /^@(media|supports|container|layer|document)\b/i;

// Top-level items of a stylesheet body: [{prelude, block}] for rules and block at-rules, [{statement}] for `@x ...;`.
function items(css) {
  const out = []; let i = 0, start = 0;
  const skipString = q => { i++; while (i < css.length && css[i] !== q) { if (css[i] === '\\') i++; i++ } };
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); i = end < 0 ? css.length : end + 2; continue }
    if (c === '"' || c === "'") { skipString(c); i++; continue }
    if (c === ';') { const statement = css.slice(start, i + 1).trim(); if (statement) out.push({ statement }); start = ++i; continue }
    if (c === '{') {
      const prelude = css.slice(start, i).trim(); let depth = 1, j = i + 1;
      while (j < css.length && depth) {
        const d = css[j];
        if (d === '/' && css[j + 1] === '*') { const end = css.indexOf('*/', j + 2); j = end < 0 ? css.length : end + 2; continue }
        if (d === '"' || d === "'") { const q = d; j++; while (j < css.length && css[j] !== q) { if (css[j] === '\\') j++; j++ } j++; continue }
        if (d === '{') depth++; else if (d === '}') depth--;
        j++;
      }
      out.push({ prelude, block: css.slice(i + 1, j - 1) }); start = i = j; continue;
    }
    i++;
  }
  return out;
}

// Split a selector list on top-level commas (not inside :is(...), attribute values or strings).
function selectors(prelude) {
  const parts = []; let depth = 0, start = 0, quote = null;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && !depth) { parts.push(prelude.slice(start, i)); start = i + 1 }
  }
  parts.push(prelude.slice(start));
  return parts.map(s => s.trim()).filter(Boolean);
}

export function pageCss(css) {
  let out = '';
  for (const item of items(css)) {
    if (item.statement) { out += item.statement.replace(/\/\*[\s\S]*?\*\//g, '').trim(); continue }
    const { block } = item, prelude = item.prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (prelude.startsWith('@')) {
      if (GROUPS.test(prelude)) { const inner = pageCss(block); if (inner.trim()) out += prelude + '{' + inner + '}' }
      else out += prelude + '{' + block + '}';
      continue;
    }
    const kept = selectors(prelude).filter(s => !s.includes(':host'));
    if (kept.length) out += kept.join(',') + '{' + block + '}';
  }
  return out;
}
