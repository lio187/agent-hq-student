// Production (student edition): Board, Library, Recording, Jobs and Review on the student's own content items, stored
// on this Mac (/api/hq/v1/marketing/…). Every change is a POST; deleting and cancelling ask first. Studio and
// Campaigns reuse the helpers exported here (the idea and item dialogs, the confirm box, labels).
import {tileRow, panel, chartBand, statusRows} from './page-kit.mjs';
import {dataTable, relativeTime} from './data-table.mjs';
import {stackBar, barList} from './viz.mjs';
import {stateView} from './ui.mjs';

export const STAGES = ['Idea', 'Scripted', 'To Edit', 'Editing', 'To Review', 'Ready To Post', 'Posted'];
export const ALL_STAGES = [...STAGES, 'Archived'];
export const FORMATS = {reel: 'Reel', carousel: 'Carousel', story: 'Story', post: 'Post', video: 'Video', newsletter: 'Newsletter'};
const JOB_KINDS = [['script.write', 'Write the script'], ['hooks.generate', 'Write five hooks'], ['caption.write', 'Write the caption']];
const JOB_STATE = {queued: ['Queued', 'plain'], running: ['Running', 'info'], review: ['In review', 'warn'], failed: ['Failed', 'error'], done: ['Done', 'ok']};
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
export const jobLabel = k => ({'script.write': 'Script', 'hooks.generate': 'Hooks', 'caption.write': 'Caption', carousel: 'Carousel', stories: 'Stories', story: 'Stories'})[k] || cap(String(k || 'Job').replace(/[._-]+/g, ' '));
export const fileURL = p => '/api/hq/v1/marketing/file?path=' + encodeURIComponent(p);
export const isVideo = p => /\.mp4$/i.test(p || '');
export const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t };
const at = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null };
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
export const button = (esc, label, action, id = '', {primary = false, cls = '', aria = '', disabled = false} = {}) => '<button type="button"' + (primary || cls ? ' class="' + esc([primary ? 'primary' : '', cls].filter(Boolean).join(' ')) + '"' : '') + ' data-action="' + esc(action) + '" data-id="' + esc(id) + '"' + (aria ? ' aria-label="' + esc(aria) + '"' : '') + (disabled ? ' disabled' : '') + '>' + esc(label) + '</button>';
export const safeLink = (esc, url, label) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? '<a href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ↗</a>' : '' } catch { return '' } };
export const handleOf = (accounts, id) => { const a = (accounts || []).find(x => x.id === id); return a ? (a.handle || a.name || a.platform) : id ? 'Account removed' : 'No account' };
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const options = (list, current) => list.map(([v, l]) => '<option value="' + h(v) + '"' + (String(v) === String(current ?? '') ? ' selected' : '') + '>' + h(l) + '</option>').join('');

// Small styles for what the office has no class for (kanban move buttons, the teleprompter, hooks, script cards).
const STYLE = '<style>.mk-kanban .mk-drop{display:grid;gap:9px;min-height:64px;border-radius:8px;transition:background .15s}.mk-kanban .mk-drop[data-over]{background:var(--bg-glass-2);outline:1px dashed var(--border-mid)}'
  + '.mk-card{position:relative}.mk-card[draggable=true]{cursor:grab}.mk-card.mk-dragging{opacity:.45}.mk-kanban .mk-card>button.mk-open{margin:0}'
  + '.mk-kanban .mk-move{display:flex;gap:4px;justify-content:flex-end;margin-top:4px}.mk-kanban .mk-move button{display:inline-grid;place-items:center;width:28px;min-height:24px;height:24px;padding:0;margin:0;font-size:12px;box-shadow:none}'
  + '.mk-col-empty{font-size:11.5px;color:var(--text-tertiary);padding:10px 4px}.mk-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}'
  + '.mk-hooks{display:grid;gap:6px;margin:0;padding:0;list-style:none}.mk-hooks li{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:13px;color:var(--text-body)}.mk-hooks button{flex:none}'
  + '.mk-files{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}.mk-files figure{flex:0 0 120px;margin:0}.mk-files img,.mk-files video{width:120px;aspect-ratio:4/5;object-fit:cover;border-radius:8px;border:1px solid var(--border-soft);background:var(--bg-panel)}.mk-files figcaption{font-size:11px;color:var(--text-tertiary)}'
  + '.mk-scripts{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}.mk-script{display:flex;flex-direction:column;gap:8px;margin:0}.mk-script h3{margin:0;font-size:15px;color:var(--text-primary)}.mk-script p{margin:0;font-size:12.5px;line-height:1.5;color:var(--text-secondary)}.mk-script .mk-excerpt{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.mk-script .actions{margin:auto 0 0}'
  + '.mk-read{white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--text-body);max-height:320px;overflow:auto;padding:12px;border:1px solid var(--border-soft);border-radius:8px;background:var(--bg-glass-1)}'
  + '.mk-danger{color:var(--status-error)}.mk-status{min-height:1em;font-size:12.5px;color:var(--text-secondary);margin:0}.mk-status[data-tone=error]{color:var(--status-error)}'
  + 'dialog.mk-prompter{width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:#050506;color:#f4f4f5;display:none;flex-direction:column}dialog.mk-prompter[open]{display:flex}'
  + '.mk-pbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 18px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08)}.mk-pbar strong{margin-right:auto;font-size:14px}.mk-pbar label{display:flex;align-items:center;gap:8px;font-size:12px;color:#c9cbd1}.mk-pbar input[type=range]{width:110px;padding:0}'
  + '.mk-pstage{flex:1;overflow:hidden;position:relative}.mk-pstage::before{content:"";position:absolute;left:0;right:0;top:38%;height:2px;background:rgba(255,99,1,.5);pointer-events:none;z-index:1}.mk-ptext{padding:38vh 8vw 60vh;white-space:pre-wrap;line-height:1.45;font-weight:600;text-align:center}.mk-ptext[data-mirror]{transform:scaleX(-1)}'
  + '.mk-pkeys{margin:0;padding:8px 18px;font-size:11.5px;color:#8a8f98;border-top:1px solid rgba(255,255,255,.08)}</style>';

// ── shared pieces (also used by Studio and Campaigns) ──────────────────────────────────────────────────────────────
let last = null;  // the last content payload, so filters re-render without asking the engine again
const state = {search: '', stage: '', format: '', pick: ''};
async function content(ctx) { last = await ctx.api('marketing/content'); return last }

// An in-page confirm (a native dialog over the page); resolves with the form's values, or null on Cancel or Escape.
export function confirmBox(ctx, {title, body = '', html = '', ok = 'Confirm', danger = false}) {
  const {esc} = ctx;
  return new Promise(resolve => {
    let d = ctx.root.querySelector('dialog.mk-confirm');
    if (!d) { d = document.createElement('dialog'); d.className = 'mk-confirm'; d.setAttribute('aria-labelledby', 'mk-confirm-title'); ctx.root.append(d) }
    d.innerHTML = '<form method="dialog" class="pk-form"><h2 id="mk-confirm-title">' + esc(title) + '</h2>' + (body ? '<p class="pk-lead" style="margin:0">' + esc(body) + '</p>' : '') + html
      + '<div class="actions" style="justify-content:flex-end;margin:4px 0 0"><button type="submit" value="cancel">Cancel</button><button type="submit" value="ok" class="' + (danger ? 'mk-danger' : 'primary') + '" data-mk-confirm>' + esc(ok) + '</button></div></form>';
    const form = d.querySelector('form');
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? new FormData(form) : null), {once: true});
    d.showModal(); d.querySelector('[data-mk-confirm]').focus();
  });
}
const dialogBody = ctx => ctx.$('#preview-body');
const closePreview = ctx => { const p = ctx.$('#preview'); if (p?.open) p.close() };
export function say(scope, text, tone = '') { const s = scope?.querySelector('[data-mk-status]'); if (s) { s.textContent = text; s.dataset.tone = tone } }
// A dialog form: Enter or the submit button runs `save`; errors stay in the dialog.
export function bindForm(form, save) {
  form.addEventListener('submit', async e => {
    e.preventDefault(); e.stopPropagation();
    const b = form.querySelector('button[type=submit]'); if (b?.disabled) return;
    if (b) b.disabled = true; say(form, '');
    try { await save(Object.fromEntries(new FormData(form)), form) } catch (error) { say(form, error.message, 'error') } finally { if (b) b.disabled = false }
  });
}

const accountOptions = (accounts, current) => options([['', 'No account'], ...(accounts || []).map(a => [a.id, (a.handle || a.name || a.id) + ' · ' + cap(a.platform)])], current);
const formatOptions = current => options(Object.entries(FORMATS), current || 'reel');

// New idea: title, format, account, hook, notes and a due date. `after` runs once it is saved.
export async function newIdea(ctx, {after} = {}) {
  const {esc} = ctx, d = last || await content(ctx);
  ctx.preview('New idea', '<form class="pk-form" data-mk-new><label>Title *<input name="title" required maxlength="200" placeholder="What is this piece about?"></label>'
    + '<div class="mk-grid2"><label>Format<select name="format">' + formatOptions('reel') + '</select></label><label>Account<select name="accountId">' + accountOptions(d.accounts, d.accounts?.[0]?.id || '') + '</select></label>'
    + '<label>Due date<input type="date" name="dueDate"></label>' + (d.campaigns?.length ? '<label>Campaign<select name="campaignId">' + options([['', 'None'], ...d.campaigns.map(c => [c.id, c.name])], '') + '</select></label>' : '') + '</div>'
    + '<label>Hook<input name="hook" maxlength="500" placeholder="The first line that makes someone stop scrolling (optional)"></label><label>Notes<textarea name="notes" rows="3" maxlength="5000" placeholder="Angle, points to make, links (optional)"></textarea></label>'
    + '<p class="mk-status" data-mk-status role="status"></p><div class="actions"><button type="submit" class="primary">Add idea</button></div></form>');
  const form = dialogBody(ctx).querySelector('[data-mk-new]'); form.querySelector('[name=title]').focus();
  bindForm(form, async v => { const item = await ctx.api('marketing/content', {action: 'add', ...v}); closePreview(ctx); last = null; after ? after(item) : ctx.refresh() });
}

// The item editor: every field, the hooks to pick from, slides, reviews; save, agent jobs, teleprompter, delete.
export async function openEditor(ctx, id) {
  const {esc} = ctx, d = await content(ctx), i = d.items.find(x => x.id === id);
  if (!i) throw new Error('This item no longer exists. Refresh the page.');
  const files = i.files || [], reviews = (i.reviews || []).slice().reverse(), busy = k => (d.jobs || []).some(j => j.itemId === id && j.kind === k && ['queued', 'running'].includes(j.status));
  const src = i.sourceRef || {};
  ctx.preview(i.title || 'Item', '<form class="pk-form pk-wide" data-mk-editor="' + esc(id) + '"><div class="mk-grid2"><label>Title *<input name="title" required maxlength="200" value="' + esc(i.title) + '"></label>'
    + '<label>Stage<select name="status">' + options(ALL_STAGES.map(s => [s, s]), i.status) + '</select></label><label>Format<select name="format">' + formatOptions(i.format) + '</select></label>'
    + '<label>Account<select name="accountId">' + accountOptions(d.accounts, i.accountId) + '</select></label><label>Due date<input type="date" name="dueDate" value="' + esc(i.dueDate) + '"></label>'
    + '<label>Campaign<select name="campaignId">' + options([['', 'None'], ...(d.campaigns || []).map(c => [c.id, c.name])], i.campaignId) + '</select></label></div>'
    + '<label>Hook<input name="hook" maxlength="500" value="' + esc(i.hook) + '"></label>'
    + ((i.hooks || []).length ? '<div><p class="pk-note" style="margin:0 0 6px">Hooks from your agent · pick one to use it</p><ol class="mk-hooks">' + i.hooks.map(h => '<li><span>' + esc(h) + '</span><button type="button" data-mk-hook="' + esc(h) + '">Use</button></li>').join('') + '</ol></div>' : '')
    + '<label>Script<textarea name="script" rows="8" maxlength="20000">' + esc(i.script) + '</textarea></label><label>Caption<textarea name="caption" rows="4" maxlength="5000">' + esc(i.caption) + '</textarea></label>'
    + '<label>Notes<textarea name="notes" rows="3" maxlength="5000">' + esc(i.notes) + '</textarea></label>'
    + (src.title || src.url ? '<p class="pk-note" style="margin:0">Source: ' + esc(src.title || src.kind || 'link') + ' ' + safeLink(esc, src.url, 'Open') + '</p>' : '')
    + (files.length ? '<div><p class="pk-note" style="margin:0 0 6px">' + plural(files.length, 'file') + '</p><div class="mk-files">' + files.map(f => '<figure>' + (isVideo(f.path) ? '<video src="' + esc(fileURL(f.path)) + '" preload="metadata" muted></video>' : '<img loading="lazy" src="' + esc(fileURL(f.path)) + '" alt="">') + '<figcaption>' + esc(cap(f.kind) + ' ' + (f.slide || '')) + '</figcaption></figure>').join('') + '</div></div>' : '')
    + (reviews.length ? '<details><summary>Review history · ' + reviews.length + '</summary><ul class="pk-list">' + reviews.map(r => '<li>' + esc(cap(r.decision) + (r.note ? ': ' + r.note : '') + ' · ' + (relativeTime(r.at) || '')) + '</li>').join('') + '</ul></details>' : '')
    + '<p class="mk-status" data-mk-status role="status"></p><div class="actions"><button type="submit" class="primary">Save changes</button>'
    + JOB_KINDS.map(([k, l]) => button(esc, busy(k) ? l + ' · running' : l, 'mk-production-job', k + '|' + id, {disabled: busy(k)})).join('')
    + (i.script ? button(esc, 'Teleprompter', 'mk-production-prompter', id) : '') + button(esc, 'Delete', 'mk-production-delete', id, {cls: 'mk-danger'}) + '</div></form>');
  const form = dialogBody(ctx).querySelector('[data-mk-editor]');
  form.addEventListener('click', e => { const h = e.target.closest('[data-mk-hook]'); if (h) { form.querySelector('[name=hook]').value = h.dataset.mkHook; say(form, 'Hook picked. Save to keep it.') } });
  bindForm(form, async v => { await save(ctx, id, v, i); say(form, 'Saved.'); last = null; ctx.refresh() });
}
// Saves the editable fields, then the stage when it changed (a stage move has its own rules on the engine).
async function save(ctx, id, v, before) {
  const {status, ...fields} = v;
  await ctx.api('marketing/content', {action: 'update', id, ...fields});
  if (status && status !== before.status) await ctx.api('marketing/content', {action: 'move', id, status});
}

// Start a job: the item, what to write, and whether the result waits in Review first.
export async function startDialog(ctx, preset = '') {
  const {esc} = ctx, d = last || await content(ctx), [kind, itemId] = String(preset).includes('|') ? preset.split('|') : ['', preset];
  const items = d.items.filter(i => i.status !== 'Archived');
  if (!items.length) return ctx.preview('Start a job', stateView({kind: 'empty', title: 'No content items yet', body: 'Add an idea first. Your agent writes its script, hooks or caption.', actions: [{label: 'New idea', action: 'mk-production-new', primary: true}]}));
  ctx.preview('Start a job', '<form class="pk-form" data-mk-start><label>Content item<select name="itemId">' + options(items.map(i => [i.id, i.title + ' · ' + i.status]), itemId || items[0].id) + '</select></label>'
    + '<label>What your agent writes<select name="kind">' + options(JOB_KINDS, kind || 'script.write') + '</select></label>'
    + '<label><input type="checkbox" name="review" checked> Send the result to Review first</label>'
    + '<p class="pk-note" style="margin:0">Your Content Writer agent writes it with your own AI tool. The run shows in Agent work; the text lands on the item' + ' when it is done.</p>'
    + '<p class="mk-status" data-mk-status role="status"></p><div class="actions"><button type="submit" class="primary">Start job</button></div></form>');
  bindForm(dialogBody(ctx).querySelector('[data-mk-start]'), async v => {
    await ctx.api('marketing/jobs/start', {kind: v.kind, itemId: v.itemId, review: v.review === 'on'}); closePreview(ctx); last = null;
    if (ctx.section === 'production') ctx.refresh(); else ctx.go('production');
  });
}

async function move(ctx, id, status) { await ctx.api('marketing/content', {action: 'move', id, status}); last = null; ctx.refresh() }

// ── pages ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const toolbar = (ctx, {stage = false} = {}) => {
  const {esc} = ctx;
  return '<label class="search">Search<input id="mk-search" type="search" value="' + esc(state.search) + '" placeholder="Title, hook, notes…"></label>'
    + (stage ? '<label>Stage<select id="mk-stage">' + options([['', 'All stages'], ...ALL_STAGES.map(s => [s, s])], state.stage) + '</select></label>' : '')
    + '<label>Format<select id="mk-format">' + options([['', 'All formats'], ...Object.entries(FORMATS)], state.format) + '</select></label>'
    + button(esc, 'New idea', 'mk-production-new', '', {primary: true});
};
// Search and format apply on Board, Library and Recording; the stage filter only in the Library.
const matches = (i, stage = false) => (!state.format || i.format === state.format) && (!stage || !state.stage || i.status === state.stage)
  && (!state.search || [i.title, i.hook, i.notes, i.script, i.caption].some(v => String(v || '').toLowerCase().includes(state.search.toLowerCase())));

function stageTiles(items, ctx) {
  const n = s => (items || []).filter(i => i.status === s).length;
  return tileRow([
    {label: 'Ideas', value: n('Idea'), caption: 'Not scripted yet', action: {action: 'section', id: 'content'}},
    {label: 'Ready to record', value: n('Scripted'), caption: 'Finished scripts', action: {action: 'section', id: 'record'}},
    {label: 'In the edit', value: n('To Edit') + n('Editing'), caption: 'To edit or being edited'},
    {label: 'To review', value: n('To Review'), caption: 'Waiting for your decision', action: {action: 'section', id: 'reviews'}},
    {label: 'Ready to post', value: n('Ready To Post'), caption: 'Approved, not posted yet'},
    {label: 'Posted', value: n('Posted'), caption: n('Archived') + ' archived'},
  ], {esc: ctx.esc, number: ctx.number});
}

function boardBody(ctx) {
  const {esc} = ctx, all = last.items.filter(i => i.status !== 'Archived'), shown = all.filter(i => matches(i));
  if (!all.length) return stageTiles(last.items, ctx) + stateView({kind: 'empty', title: 'Your board is empty', body: 'Add your first idea. It moves from Idea to Posted as you script, record, edit and review it.', actions: [{label: 'New idea', action: 'mk-production-new', primary: true}]});
  const card = i => {
    const k = STAGES.indexOf(i.status), job = (last.jobs || []).find(j => j.itemId === i.id && ['queued', 'running'].includes(j.status));
    const move = (dir, to) => to ? '<button type="button" data-action="mk-production-move" data-id="' + esc(i.id + '|' + dir) + '" aria-label="' + esc('Move ' + i.title + ' to ' + to) + '" title="' + esc('Move to ' + to) + '">' + (dir === 'prev' ? '←' : '→') + '</button>' : '';
    return '<div class="mk-card" draggable="true" data-item="' + esc(i.id) + '"><button type="button" class="mk-open" data-action="mk-production-open" data-id="' + esc(i.id) + '"><small>' + esc((FORMATS[i.format] || 'Item') + ' · ' + handleOf(last.accounts, i.accountId)) + '</small><strong>' + esc(i.title) + '</strong><span>'
      + esc(job ? jobLabel(job.kind) + ' being written…' : i.dueDate ? 'Due ' + i.dueDate : 'Updated ' + (relativeTime(i.updatedAt) || '—')) + '</span></button>'
      + '<div class="mk-move">' + move('prev', STAGES[k - 1]) + move('next', STAGES[k + 1]) + '</div></div>';
  };
  return stageTiles(last.items, ctx) + '<p class="pk-lead">Drag a card to another stage, or use the arrows (they work with the keyboard too). Open a card to edit it.' + (shown.length < all.length ? ' Showing ' + shown.length + ' of ' + all.length + '.' : '') + '</p>'
    + '<div class="kanban mk-kanban">' + STAGES.map(s => { const here = shown.filter(i => i.status === s); return '<section aria-label="' + esc(s + ', ' + plural(here.length, 'item')) + '" data-stage="' + esc(s) + '"><header><h2>' + esc(s) + '</h2><span class="pill">' + here.length + '</span></header><div class="mk-drop" data-stage="' + esc(s) + '">'
      + (here.length ? here.map(card).join('') : '<p class="mk-col-empty">Drop here</p>') + '</div></section>' }).join('') + '</div>';
}

function libraryBody(ctx) {
  const {esc} = ctx, all = last.items, shown = all.filter(i => matches(i, true));
  if (!all.length) return stateView({kind: 'empty', title: 'No content yet', body: 'Ideas from Signals, Competitors and Creator Lab land here, and so does everything you add yourself.', actions: [{label: 'New idea', action: 'mk-production-new', primary: true}]});
  return stageTiles(all, ctx) + panel('Content library', dataTable({id: 'mk-library', esc, rows: shown, pageSize: 20, defaultSort: {key: 'updated', dir: 'desc'}, emptyText: 'Nothing matches these filters.', filters: false,
    columns: [
      {key: 'title', label: 'Content', value: i => i.title, className: 'dt-primary', cell: i => '<strong>' + esc(i.title) + '</strong><small>' + esc(clip(i.hook || i.notes || i.script, 90) || 'No hook yet') + '</small>'},
      {key: 'stage', label: 'Stage', value: i => ALL_STAGES.indexOf(i.status), cell: i => '<span class="stage-pill" data-stage="' + esc(String(i.status).toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '">' + esc(i.status) + '</span>'},
      {key: 'format', label: 'Format', value: i => FORMATS[i.format] || i.format, cell: i => esc(FORMATS[i.format] || i.format)},
      {key: 'account', label: 'Account', value: i => handleOf(last.accounts, i.accountId), cell: i => '<span class="dt-muted">' + esc(handleOf(last.accounts, i.accountId)) + '</span>'},
      {key: 'due', label: 'Due', value: i => i.dueDate || null, cell: i => '<span class="dt-muted pk-nowrap">' + esc(i.dueDate || '—') + '</span>'},
      {key: 'updated', label: 'Updated', value: i => at(i.updatedAt), cell: i => '<span class="dt-muted pk-nowrap">' + esc(relativeTime(i.updatedAt) || '—') + '</span>'},
      {key: 'open', label: '', className: 'dt-action', cell: i => '<button type="button" class="dt-action" data-action="mk-production-open" data-id="' + esc(i.id) + '" aria-label="' + esc('Edit ' + i.title) + '">Edit</button>'},
    ]}), {esc, meta: shown.length + ' of ' + all.length});
}

function recordPage(ctx) {
  const {esc} = ctx, scripted = last.items.filter(i => i.status === 'Scripted' && matches(i));
  const oldest = scripted.map(i => at(i.updatedAt)).filter(Boolean).sort((a, b) => a - b)[0];
  const tiles = tileRow([
    {label: 'Ready to record', value: scripted.length, caption: 'Scripts at Scripted'},
    {label: 'Reels and videos', value: scripted.filter(i => ['reel', 'video', 'story'].includes(i.format)).length, caption: 'Spoken to camera'},
    {label: 'With a due date', value: scripted.filter(i => i.dueDate).length, caption: scripted.filter(i => !i.dueDate).length + ' without one'},
    {label: 'Oldest script', value: oldest ? relativeTime(oldest) : '—', caption: oldest ? 'Waiting since its last change' : 'Nothing waiting'},
  ], {esc, number: ctx.number});
  if (!scripted.length) return tiles + stateView({kind: 'empty', title: 'No scripts ready to record', body: 'When your agent writes a script, or you move an item to Scripted, it waits here with a teleprompter.', actions: [{label: 'Start a script job', action: 'mk-production-start', primary: true}, {label: 'Open the board', action: 'section', id: 'team'}]});
  return tiles + '<p class="pk-lead">Open the teleprompter to read a script to camera. Press Recorded when it is in the can; the item moves to To Edit.</p><div class="mk-scripts">' + scripted.map(i => '<article class="surface mk-script"><small class="pk-meta">' + esc((FORMATS[i.format] || 'Item') + ' · ' + handleOf(last.accounts, i.accountId) + (i.dueDate ? ' · due ' + i.dueDate : '')) + '</small><h3>' + esc(i.title) + '</h3>'
    + (i.hook ? '<p><b>Hook:</b> ' + esc(i.hook) + '</p>' : '') + '<p class="mk-excerpt">' + esc(i.script || 'No script text yet. Open the item to write one, or start a script job.') + '</p>'
    + '<div class="actions">' + button(esc, 'Teleprompter', 'mk-production-prompter', i.id, {primary: true, aria: 'Open the teleprompter for ' + i.title}) + button(esc, 'Edit', 'mk-production-open', i.id) + button(esc, 'Recorded', 'mk-production-recorded', i.id, {aria: 'Mark ' + i.title + ' as recorded'}) + '</div></article>').join('') + '</div>'
    + '<dialog class="mk-prompter" aria-label="Teleprompter"><div class="mk-pbar"><strong data-mk-ptitle></strong><button type="button" class="primary" data-mk-p="play">Start</button>'
    + '<label>Speed<input type="range" min="1" max="10" value="4" data-mk-p="speed"></label><label>Size<input type="range" min="24" max="96" step="4" value="48" data-mk-p="size"></label>'
    + '<label><input type="checkbox" data-mk-p="mirror"> Mirror</label><button type="button" data-mk-p="top">From the top</button><button type="button" data-mk-p="recorded">Recorded</button><button type="button" data-mk-p="close">Close</button></div>'
    + '<div class="mk-pstage"><div class="mk-ptext" data-mk-ptext></div></div><p class="mk-pkeys">Space start or pause · ↑ ↓ speed · + − size · Esc close</p></dialog>';
}

let shownJobs = [];
async function jobsPage(ctx) {
  const {esc} = ctx, d = await ctx.api('marketing/jobs'), jobs = shownJobs = d.jobs || [], titles = new Map((d.items || []).map(i => [i.id, i.title]));
  const n = s => jobs.filter(j => j.status === s).length;
  const tiles = tileRow([
    {label: 'Jobs', value: jobs.length, caption: 'Scripts, hooks, captions, carousels and stories'},
    {label: 'Running', value: n('running') + n('queued'), caption: 'Your agents are on it'},
    {label: 'Waiting for review', value: n('review'), caption: 'Results that need a decision', action: n('review') ? {action: 'section', id: 'reviews'} : null},
    {label: 'Failed', value: n('failed'), caption: n('failed') ? 'Open a job to see why' : 'Nothing failed'},
  ], {esc, number: ctx.number});
  const band = chartBand({title: 'Jobs by state', meta: plural(jobs.length, 'job'), body: jobs.length ? stackBar([{label: 'Queued', value: n('queued'), tone: 'idle'}, {label: 'Running', value: n('running'), tone: 'info'}, {label: 'In review', value: n('review'), tone: 'pending'}, {label: 'Done', value: n('done'), tone: 'live'}, {label: 'Failed', value: n('failed'), tone: 'error'}], {esc, format: String, label: 'Jobs by state'}) : '', empty: 'No jobs yet.'},
    {title: 'Jobs by kind', body: jobs.length ? barList([...jobs.reduce((m, j) => m.set(jobLabel(j.kind), (m.get(jobLabel(j.kind)) || 0) + 1), new Map())].map(([label, value]) => ({label, value})), {esc, format: String, label: 'Jobs by kind'}) : '', empty: 'No jobs yet.'}, {esc});
  const result = j => j.detail?.cancelled ? 'Cancelled' : j.detail?.error || clip(j.detail?.preview, 110) || (['queued', 'running'].includes(j.status) ? 'Writing…' : '—');
  const table = dataTable({id: 'mk-jobs', esc, rows: jobs, pageSize: 15, defaultSort: {key: 'when', dir: 'desc'}, filters: false, emptyText: 'No jobs yet. Start one with the button above.',
    tabs: Object.keys(JOB_STATE).filter(s => n(s)).map(s => ({id: s, label: JOB_STATE[s][0], filter: j => j.status === s})),
    columns: [
      {key: 'kind', label: 'Job', value: j => jobLabel(j.kind), className: 'dt-primary', cell: j => '<strong>' + esc(jobLabel(j.kind)) + '</strong><small>' + esc(titles.get(j.itemId) || j.title || 'Item removed') + '</small>'},
      {key: 'status', label: 'Status', value: j => j.status, cell: j => { const [l, t] = j.detail?.cancelled ? ['Cancelled', 'plain'] : JOB_STATE[j.status] || [cap(j.status), 'plain']; return '<span class="ui-badge ui-badge--' + t + '">' + esc(l) + '</span>' }},
      {key: 'when', label: 'Started', value: j => at(j.createdAt), cell: j => '<span class="dt-muted pk-nowrap">' + esc(relativeTime(j.createdAt) || '—') + '</span>'},
      {key: 'result', label: 'Result', cell: j => '<span class="dt-clip' + (j.status === 'failed' && !j.detail?.cancelled ? ' mk-danger' : ' dt-muted') + '">' + esc(result(j)) + '</span>'},
      {key: 'open', label: '', className: 'dt-action', cell: j => ['queued', 'running'].includes(j.status) ? button(esc, 'Cancel', 'mk-production-cancel', j.id, {cls: 'dt-action', aria: 'Cancel ' + jobLabel(j.kind) + ' job'})
        : j.status === 'review' ? button(esc, 'Review', 'mk-production-pick', j.itemId, {cls: 'dt-action'}) : titles.has(j.itemId) ? button(esc, 'Open item', 'mk-production-open', j.itemId, {cls: 'dt-action'}) : ''},
    ]});
  return tiles + band + panel('Jobs', '<div class="actions" style="margin-top:0">' + button(esc, 'Start a job', 'mk-production-start', '', {primary: true}) + '</div>' + table, {esc, meta: plural(jobs.length, 'job')});
}

const REVIEW_KIND = {'script.write': 'Script', 'hooks.generate': 'Hooks', 'caption.write': 'Caption', piece: 'Finished piece'};
function reviewPage(ctx) {
  const {esc} = ctx, jobs = last.jobs || [], waiting = last.items.filter(i => i.status === 'To Review');
  const hooking = id => jobs.some(j => j.itemId === id && j.kind === 'hooks.generate' && ['queued', 'running'].includes(j.status));
  const ready = waiting.filter(i => !hooking(i.id)), held = waiting.filter(i => hooking(i.id));
  const oldest = ready.slice().sort((a, b) => (at(a.updatedAt) || 0) - (at(b.updatedAt) || 0))[0];
  const tiles = tileRow([
    {label: 'Waiting for review', value: ready.length, caption: 'Items at To Review'},
    {label: 'Oldest waiting', value: oldest ? relativeTime(oldest.updatedAt) : '—', caption: oldest ? oldest.title : 'Nothing is waiting'},
    {label: 'Waiting for new hooks', value: held.length, caption: held.length ? 'Reviewable when the writer is done' : 'No hook jobs running'},
    {label: 'Results to check', value: jobs.filter(j => j.status === 'review').length, caption: 'Agent jobs waiting on you'},
  ], {esc, number: ctx.number});
  const heldHTML = held.length ? panel('Waiting for new hooks', '<ul class="pk-list">' + held.map(i => '<li>' + esc(i.title) + '</li>').join('') + '</ul><p class="pk-note">These come back here once your agent has written the new hooks.</p>', {esc, meta: String(held.length)}) : '';
  if (!ready.length) return tiles + heldHTML + stateView({kind: 'empty', title: 'Nothing waits for your review', body: 'Agent results you send to Review, and finished pieces, wait here for approve, reject or new hooks.', actions: [{label: 'Start a job', action: 'mk-production-start', primary: true}]});
  const pick = ready.find(i => i.id === state.pick) || ready[0];
  const queue = dataTable({id: 'mk-review-queue', esc, rows: ready, pageSize: 12, defaultSort: {key: 'age', dir: 'asc'}, filters: false,
    columns: [
      {key: 'title', label: 'Content', value: i => i.title, className: 'dt-primary', cell: i => '<strong>' + esc(i.title) + '</strong><small>' + esc((REVIEW_KIND[i.reviewKind] || 'Piece') + ' · ' + (FORMATS[i.format] || i.format)) + '</small>'},
      {key: 'age', label: 'Waiting', value: i => at(i.updatedAt), cell: i => '<span class="dt-muted pk-nowrap">' + esc(relativeTime(i.updatedAt) || '—') + '</span>'},
      {key: 'open', label: '', className: 'dt-action', cell: i => '<button type="button" class="dt-action" data-action="mk-production-pick" data-id="' + esc(i.id) + '"' + (i.id === pick.id ? ' aria-pressed="true"' : '') + '>Review</button>'},
    ]});
  const files = pick.files || [], script = pick.reviewKind === 'script.write';
  const detail = '<section class="surface mk-review" data-mk-review="' + esc(pick.id) + '"><div class="section-head"><h2>' + esc(pick.title) + '</h2><span class="ui-badge ui-badge--warn">' + esc(REVIEW_KIND[pick.reviewKind] || 'Piece') + '</span></div>'
    + '<p class="source">' + esc((FORMATS[pick.format] || pick.format) + ' · ' + handleOf(last.accounts, pick.accountId) + ' · waiting ' + (relativeTime(pick.updatedAt) || '')) + '</p>'
    + (files.length ? '<div class="pk-media-strip">' + files.map(f => '<figure>' + (isVideo(f.path) ? '<video controls preload="metadata" src="' + esc(fileURL(f.path)) + '"></video>' : '<img loading="lazy" src="' + esc(fileURL(f.path)) + '" alt="">') + '<figcaption>' + esc(cap(f.kind) + ' ' + (f.slide || '')) + '</figcaption></figure>').join('') + '</div>' : '')
    + (pick.hook ? '<p><strong>Hook</strong><br>' + esc(pick.hook) + '</p>' : '')
    + ((pick.hooks || []).length ? '<p class="pk-note" style="margin:0 0 6px">Hooks from your agent</p><ol class="mk-hooks">' + pick.hooks.map(h => '<li><span>' + esc(h) + '</span></li>').join('') + '</ol>' : '')
    + (pick.script ? '<p class="pk-note" style="margin:12px 0 6px">Script</p><div class="mk-read">' + esc(pick.script) + '</div>' : '')
    + (pick.caption ? '<p class="pk-note" style="margin:12px 0 6px">Caption</p><div class="mk-read">' + esc(pick.caption) + '</div>' : '')
    + ((pick.reviews || []).length ? '<details style="margin-top:12px"><summary>Earlier decisions · ' + pick.reviews.length + '</summary><ul class="pk-list">' + pick.reviews.slice().reverse().map(r => '<li>' + esc(cap(r.decision) + (r.note ? ': ' + r.note : '') + ' · ' + (relativeTime(r.at) || '')) + '</li>').join('') + '</ul></details>' : '')
    + '<label style="margin-top:14px">Feedback<textarea id="mk-review-note" rows="3" maxlength="4000" placeholder="What should change? Needed when you reject."></textarea></label>'
    + '<div class="actions">' + button(esc, script ? 'Approve · ready to record' : 'Approve · ready to post', 'mk-production-decide', pick.id + '|approve', {primary: true}) + button(esc, 'Reject', 'mk-production-decide', pick.id + '|reject') + button(esc, 'New hooks', 'mk-production-decide', pick.id + '|rehook') + button(esc, 'Edit', 'mk-production-open', pick.id) + '</div>'
    + '<p class="mk-status" data-mk-status role="status"></p><p class="pk-note">Approve sends ' + (script ? 'the script to Recording' : 'it to Ready To Post') + '. Reject sends it back to ' + esc(pick.reviewFrom && pick.reviewFrom !== 'To Review' ? pick.reviewFrom : files.length ? 'Editing' : 'Idea') + ' with your note. New hooks asks your agent for five fresh hooks. Nothing is posted from here.</p></section>';
  return tiles + heldHTML + '<div class="pk-split review-split">' + panel('Review queue', queue, {esc, meta: ready.length + ' to review'}) + '<div class="review-detail">' + detail + '</div></div>';
}

export async function page(view, ctx) {
  if (view === 'production') { ctx.filters(''); return STYLE + await jobsPage(ctx) }
  await content(ctx);
  if (view === 'reviews') { ctx.filters(''); return STYLE + reviewPage(ctx) }
  ctx.filters(toolbar(ctx, {stage: view === 'content'}));
  if (view === 'record') return STYLE + recordPage(ctx);
  return STYLE + '<div data-mk-body>' + (view === 'content' ? libraryBody(ctx) : boardBody(ctx)) + '</div>';
}

// ── mount: filters, drag and drop, the teleprompter, and a light poll while agents write ─────────────────────────────
export function mount(view, el, ctx) {
  const off = [], on = (target, type, fn, opts) => { if (!target) return; target.addEventListener(type, fn, opts); off.push(() => target.removeEventListener(type, fn, opts)) };
  const rerender = () => { const body = el.querySelector('[data-mk-body]'); if (body && last) body.innerHTML = view === 'content' ? libraryBody(ctx) : boardBody(ctx); else ctx.refresh() };
  let typing;
  on(ctx.$('#mk-search'), 'input', e => { state.search = e.target.value; clearTimeout(typing); typing = setTimeout(view === 'record' ? () => ctx.refresh() : rerender, 200) });
  for (const [sel, key] of [['#mk-stage', 'stage'], ['#mk-format', 'format']]) on(ctx.$(sel), 'change', e => { state[key] = e.target.value; view === 'record' ? ctx.refresh() : rerender() });
  if (view === 'team') {
    // Drag a card onto a column; the drop is one POST, then the board renders again.
    let dragged = null;
    on(el, 'dragstart', e => { const c = e.target.closest?.('.mk-card'); if (!c) return; dragged = c.dataset.item; c.classList.add('mk-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragged) });
    on(el, 'dragend', e => { e.target.closest?.('.mk-card')?.classList.remove('mk-dragging'); el.querySelectorAll('.mk-drop[data-over]').forEach(d => delete d.dataset.over) });
    on(el, 'dragover', e => { const d = e.target.closest?.('.kanban section')?.querySelector('.mk-drop'); if (!d || !dragged) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.querySelectorAll('.mk-drop[data-over]').forEach(x => x !== d && delete x.dataset.over); d.dataset.over = '' });
    on(el, 'drop', async e => {
      const d = e.target.closest?.('.kanban section')?.querySelector('.mk-drop'), id = dragged || e.dataTransfer.getData('text/plain'); dragged = null;
      if (!d || !id) return; e.preventDefault(); delete d.dataset.over;
      const item = last?.items.find(i => i.id === id); if (!item || item.status === d.dataset.stage) return;
      try { await move(ctx, id, d.dataset.stage) } catch (error) { ctx.$('#status').textContent = error.message }
    });
  }
  if (view === 'record') off.push(bindPrompter(el, ctx));
  // While an agent writes, check every 2.5 s and show the result as soon as it lands.
  const running = j => ['queued', 'running'].includes(j.status), open = j => running(j) || j.status === 'review';
  const sig = list => list.filter(open).map(j => j.id + ':' + j.status).sort().join(',');
  const shown = view === 'production' ? shownJobs : ['reviews', 'team', 'content'].includes(view) ? last?.jobs || [] : [];
  if (shown.some(running)) {
    const before = sig(shown), timer = setInterval(async () => {
      try { if (sig((await ctx.api('marketing/jobs')).jobs || []) !== before) { clearInterval(timer); last = null; ctx.refresh() } } catch {}
    }, 2500);
    off.push(() => clearInterval(timer));
  }
  return () => { clearTimeout(typing); off.forEach(f => f()) };
}

// The teleprompter: a full-screen dialog in the page. Escape closes it (a native modal dialog, so the office's own
// Escape handling leaves the page alone); Space starts or pauses; arrows change the speed, + and − the size.
const PREFS = 'hq-mk-prompter';
function bindPrompter(el, ctx) {
  const d = el.querySelector('dialog.mk-prompter'); if (!d) return () => {};
  const stage = d.querySelector('.mk-pstage'), text = d.querySelector('[data-mk-ptext]'), play = d.querySelector('[data-mk-p=play]');
  const speed = d.querySelector('[data-mk-p=speed]'), size = d.querySelector('[data-mk-p=size]'), mirror = d.querySelector('[data-mk-p=mirror]');
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PREFS) || '{}') || {} } catch {}
  if (prefs.speed) speed.value = prefs.speed; if (prefs.size) size.value = prefs.size; mirror.checked = Boolean(prefs.mirror);
  const keep = () => { try { localStorage.setItem(PREFS, JSON.stringify({speed: speed.value, size: size.value, mirror: mirror.checked})) } catch {} };
  const apply = () => { text.style.fontSize = size.value + 'px'; if (mirror.checked) text.dataset.mirror = ''; else delete text.dataset.mirror };
  let raf = 0, lastT = 0, pos = 0;
  const frame = t => { if (lastT) { pos += (t - lastT) / 1000 * Number(speed.value) * 14; stage.scrollTop = pos; if (stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 1) return stop() } lastT = t; raf = requestAnimationFrame(frame) };
  const start = () => { if (raf) return; pos = stage.scrollTop; lastT = 0; raf = requestAnimationFrame(frame); play.textContent = 'Pause'; d.dataset.playing = '' };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; play.textContent = 'Start'; delete d.dataset.playing };
  const handlers = {
    play: () => raf ? stop() : start(), top: () => { stop(); stage.scrollTop = pos = 0 }, close: () => d.close(),
    recorded: async () => { const id = d.dataset.item; d.close(); if (id) await move(ctx, id, 'To Edit') },
  };
  const click = e => { const b = e.target.closest('[data-mk-p]'); if (b && handlers[b.dataset.mkP]) { e.preventDefault(); handlers[b.dataset.mkP]() } };
  const input = () => { apply(); keep() };
  const key = e => {
    if (e.target.matches?.('input[type=range]') && /^Arrow/.test(e.key)) return;
    if (e.key === ' ') { e.preventDefault(); handlers.play() }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); speed.value = Math.max(1, Math.min(10, Number(speed.value) + (e.key === 'ArrowUp' ? 1 : -1))); keep() }
    else if (e.key === '+' || e.key === '=' || e.key === '-') { e.preventDefault(); size.value = Math.max(24, Math.min(96, Number(size.value) + (e.key === '-' ? -4 : 4))); input() }
  };
  d.addEventListener('click', click); d.addEventListener('input', input); d.addEventListener('keydown', key); d.addEventListener('close', stop);
  apply();
  return () => { stop(); d.removeEventListener('click', click); d.removeEventListener('input', input); d.removeEventListener('keydown', key); d.removeEventListener('close', stop); if (d.open) d.close() };
}
function openPrompter(ctx, id) {
  const i = last?.items.find(x => x.id === id);
  if (!i) throw new Error('This item no longer exists. Refresh the page.');
  if (!String(i.script || '').trim()) throw new Error('This item has no script yet. Open it to write one, or start a script job.');
  let d = ctx.$('#view dialog.mk-prompter');
  if (!d) { ctx.go('record'); throw new Error('Open the teleprompter from Recording.') }
  closePreview(ctx);
  d.querySelector('[data-mk-ptitle]').textContent = i.title; d.querySelector('[data-mk-ptext]').textContent = i.script; d.dataset.item = id;
  d.showModal(); d.querySelector('.mk-pstage').scrollTop = 0; d.querySelector('[data-mk-p=play]').focus();
}

// ── actions ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function act(action, id, ctx, el) {
  const verb = action.slice('mk-production-'.length);
  switch (verb) {
    case 'new': return newIdea(ctx);
    case 'open': return openEditor(ctx, id);
    case 'start': return startDialog(ctx, id);
    case 'job': {
      // From the editor: save what is typed first, so the agent works from the latest notes.
      const [kind, itemId] = id.split('|'), form = dialogBody(ctx)?.querySelector('[data-mk-editor]');
      try {
        if (form) await save(ctx, itemId, Object.fromEntries(new FormData(form)), last?.items.find(i => i.id === itemId) || {});
        await ctx.api('marketing/jobs/start', {kind, itemId, review: true});
        if (el) { el.disabled = true; el.textContent = jobLabel(kind) + ' · running' }
        say(form, 'Your agent is writing it. The result waits for you in Review.'); last = null; ctx.refresh();
      } catch (error) { if (form) say(form, error.message, 'error'); else throw error }
      return;
    }
    case 'move': {
      const [itemId, dir] = id.split('|'), i = (last || await content(ctx)).items.find(x => x.id === itemId);
      if (!i) throw new Error('This item no longer exists. Refresh the page.');
      const to = STAGES[STAGES.indexOf(i.status) + (dir === 'prev' ? -1 : 1)];
      return to ? move(ctx, itemId, to) : undefined;
    }
    case 'recorded': return move(ctx, id, 'To Edit');
    case 'prompter': return openPrompter(ctx, id);
    case 'delete': {
      const i = last?.items.find(x => x.id === id), form = dialogBody(ctx)?.querySelector('[data-mk-editor]');
      if (!await confirmBox(ctx, {title: 'Delete this item?', body: '“' + (i?.title || 'This item') + '” and its script, hooks and caption are removed from this Mac. Rendered files stay in their folder.', ok: 'Delete item', danger: true})) return;
      try { await ctx.api('marketing/content', {action: 'delete', id}); closePreview(ctx); last = null; ctx.refresh() } catch (error) { if (form) say(form, error.message, 'error'); else throw error }
      return;
    }
    case 'cancel': {
      if (!await confirmBox(ctx, {title: 'Cancel this job?', body: 'Your agent stops writing. Nothing is changed on the item.', ok: 'Cancel job', danger: true})) return;
      await ctx.api('marketing/jobs/' + encodeURIComponent(id) + '/cancel', {}); return ctx.refresh();
    }
    case 'pick': state.pick = id; return ctx.section === 'reviews' ? ctx.refresh() : ctx.go('reviews');
    case 'decide': {
      const [itemId, decision] = id.split('|'), box = ctx.$('[data-mk-review]'), note = ctx.$('#mk-review-note')?.value.trim() || '';
      if (decision === 'reject' && !note) { say(box, 'Write a short note first, so the next version can be better.', 'error'); ctx.$('#mk-review-note')?.focus(); return }
      try { await ctx.api('marketing/content', {action: 'review', id: itemId, decision, note}) } catch (error) { say(box, error.message, 'error'); return }
      state.pick = ''; last = null; return ctx.refresh();
    }
    default: throw new Error('This action is not available.');
  }
}
