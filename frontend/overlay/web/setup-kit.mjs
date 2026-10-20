// Shared helpers for the Setup steps (each step lives in its own module; see setup-steps.mjs).
export const $ = s => document.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
export async function api(path, body) {
  const r = await fetch('/api/student/' + path, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const text = await r.text(); let d = null; try { d = text ? JSON.parse(text) : {} } catch {}
  if (!r.ok) throw new Error(d?.error?.message || 'Something went wrong (' + r.status + ').');
  return d;
}
// The office API (/api/hq/v1/…), for steps that show office data.
export async function hq(path, body) {
  const r = await fetch('/api/hq/v1/' + path, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const text = await r.text(); let d = null; try { d = text ? JSON.parse(text) : {} } catch {}
  if (!r.ok) throw new Error(d?.error?.message || 'Something went wrong (' + r.status + ').');
  return d;
}
export const native = msg => window.webkit?.messageHandlers?.hq?.postMessage(msg);
export const openExternal = url => { if (window.webkit?.messageHandlers?.hq) native({type: 'open', url}); else window.open(url, '_blank', 'noopener') };
export const copy = async (text, btn) => { try { await navigator.clipboard.writeText(text); const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => btn.textContent = t, 1400) } catch { btn.textContent = 'Select and copy it' } };
export const status = (el, text, kind = '') => { if (!el) return; el.textContent = text; el.className = 'status ' + kind };
// Asks the app for a folder or file; calls back with the chosen path (or nothing when cancelled).
export function pick(purpose, {file = false, types = [], message} = {}, done) {
  window.hqPicked = (p, path) => { if (p === purpose) done(path || '') };
  if (window.webkit?.messageHandlers?.hq) native({type: file ? 'pickFile' : 'pickFolder', purpose, types, message});
  else { const p = prompt(file ? 'File path' : 'Folder path'); if (p) done(p) }
}
// A card to paste, check and remove a service key (stored in the Keychain by the app).
export function keyCard({name, title, text, link, linkLabel, placeholder = 'Paste your API key', connected}) {
  if (connected) return '<section class="card"><div class="row"><h3>' + esc(title) + '</h3><span class="pill ok">Connected</span></div>' + (text ? '<p>' + text + '</p>' : '')
    + '<details class="muted"><summary>Change or remove this key</summary><div class="actions"><button type="button" class="btn" data-key-remove="' + esc(name) + '">Remove key</button></div></details><p class="status" id="key-status-' + esc(name) + '"></p></section>';
  return '<section class="card"><div class="row"><h3>' + esc(title) + '</h3><span class="pill off">Not connected</span></div>' + (text ? '<p>' + text + '</p>' : '')
    + (link ? '<div class="actions" style="margin-top:0"><button type="button" class="btn" data-open="' + esc(link) + '">' + esc(linkLabel || 'Get a key') + ' ↗</button></div>' : '')
    + '<label class="field">' + esc(title) + ' key<input type="password" id="key-' + esc(name) + '" autocomplete="off" spellcheck="false" placeholder="' + esc(placeholder) + '"></label>'
    + '<div class="actions"><button type="button" class="btn primary" data-key-save="' + esc(name) + '">Save key</button></div><p class="status" id="key-status-' + esc(name) + '"></p></section>';
}
export function bindKeyCards(onChange) {
  document.querySelectorAll('[data-key-save]').forEach(b => b.addEventListener('click', async () => {
    const name = b.dataset.keySave, s = $('#key-status-' + name); b.disabled = true; status(s, 'Checking your key…');
    try { await api('keys', {name, key: $('#key-' + name).value}); await onChange?.(name, true) } catch (e) { status(s, e.message, 'err'); b.disabled = false }
  }));
  document.querySelectorAll('[data-key-remove]').forEach(b => b.addEventListener('click', async () => {
    const name = b.dataset.keyRemove; b.disabled = true;
    try { await api('keys', {name, key: ''}); await onChange?.(name, false) } catch (e) { status($('#key-status-' + name), e.message, 'err'); b.disabled = false }
  }));
}
export const footer = (id, {skip = true, label = 'Continue'} = {}) => '<div class="actions"><button type="button" class="btn primary" data-next="' + id + '">' + esc(label) + '</button>' + (skip ? '<button type="button" class="btn" data-skip="' + id + '">Skip for now</button>' : '') + '</div>';
