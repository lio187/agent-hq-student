// Campaigns and Accounts (student edition). A campaign gathers pieces, their carousel and story slides and one caption;
// it becomes a Zernio draft only after an explicit confirm, and nothing is ever published or scheduled from here.
// Accounts lists the student's Zernio accounts with what each one is for (the writer agent uses that note).
import {tileRow, panel, statusRows} from './page-kit.mjs';
import {stateView} from './ui.mjs';
import {confirmBox, bindForm, say, button, fileURL, isVideo, clip, handleOf} from './mk-production.mjs';

const STATES = ['Planning', 'Ready', 'Drafted', 'Done'];
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const safeImg = v => { try { return new URL(v).protocol === 'https:' ? v : '' } catch { return '' } };
const STYLE = '<style>.mk-slide img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:8px;border:1px solid var(--border-soft);background:var(--bg-panel)}.slide--story.mk-slide img{aspect-ratio:9/16}'
  + '.mk-slide figcaption button{height:22px;min-height:0;padding:0 8px;font-size:11px}.mk-pieces{display:grid;gap:6px;margin:0;padding:0;list-style:none}.mk-pieces li{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:8px 10px;border:1px solid var(--border-soft);border-radius:8px;font-size:13px}'
  + '.mk-pieces li>span{display:flex;gap:10px;align-items:center;min-width:0}.mk-pieces .actions{margin:0}.mk-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;max-height:50vh;overflow:auto;padding:2px}.mk-pick-item{display:grid;gap:6px;cursor:pointer}.mk-pick-row{display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--text-secondary);word-break:break-all}'
  + '.mk-pick img,.mk-pick video{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:8px;border:1px solid var(--border-soft)}.mk-pick-item:has(input:checked) img,.mk-pick-item:has(input:checked) video{outline:2px solid var(--accent);outline-offset:1px}.mk-accounts{display:grid;gap:10px}.mk-account{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px;border:1px solid var(--border-soft);border-radius:10px;background:var(--bg-glass-1)}'
  + '.mk-account img,.mk-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--bg-elevated);display:grid;place-items:center;font-weight:600;color:var(--text-secondary)}.mk-account p{margin:4px 0 0;font-size:12.5px;color:var(--text-secondary)}.mk-account .actions{margin:0}'
  + '.mk-danger{color:var(--status-error)}.mk-status{min-height:1em;font-size:12.5px;color:var(--text-secondary);margin:0}.mk-status[data-tone=error]{color:var(--status-error)}.mk-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}</style>';
let cache = {campaigns: [], items: [], zernio: false};
const find = id => cache.campaigns.find(c => c.id === id);
const slidesOf = (c, f) => c?.formats?.[f] || [];

// ── Campaigns ──────────────────────────────────────────────────────────────────────────────────────────────────────
function card(c, esc) {
  const first = [...slidesOf(c, 'carousel'), ...slidesOf(c, 'story')].find(s => !isVideo(s.file));
  return '<button type="button" class="campaign-card" data-action="mk-campaigns-open" data-id="' + esc(c.id) + '">'
    + (first ? '<img loading="lazy" src="' + esc(fileURL(first.file)) + '" alt="">' : '<span class="campaign-fallback" aria-hidden="true">' + esc(c.keyword || c.name) + '</span>')
    + '<span class="campaign-body"><small>' + esc(c.status) + ' · ' + plural((c.itemIds || []).length, 'piece') + '</small><strong>' + esc(c.name) + '</strong><span class="campaign-meta">' + plural(slidesOf(c, 'carousel').length, 'carousel slide') + ' · ' + plural(slidesOf(c, 'story').length, 'story', 'stories') + '</span>'
    + (c.keyword ? '<span class="ui-badge">' + esc(c.keyword) + '</span>' : '') + '</span></button>';
}
async function campaignsPage(ctx) {
  const {esc} = ctx;
  cache = await ctx.api('marketing/campaigns');
  ctx.filters(button(esc, 'New campaign', 'mk-campaigns-new', '', {primary: true}));
  const list = cache.campaigns, sum = f => list.reduce((t, c) => t + slidesOf(c, f).length, 0), drafts = list.reduce((t, c) => t + (c.drafts || []).reduce((n, d) => n + (d.postIds || []).length, 0), 0);
  const status = statusRows([cache.zernio ? {label: 'Zernio drafts', state: 'current', reason: 'Drafts go to your Zernio account. You check and schedule them there; nothing is published from here.', age: false}
    : {label: 'Zernio drafts', state: 'paused', reason: 'Connect Zernio in Setup to save campaigns as drafts.', action: {label: 'Accounts', action: 'section', id: 'accounts'}}], {esc});
  if (!list.length) return STYLE + status + stateView({kind: 'empty', title: 'No campaigns yet', body: 'A campaign gathers the pieces for one push: carousel slides, stories and one caption. When it is ready you save it as a Zernio draft.', actions: [{label: 'New campaign', action: 'mk-campaigns-new', primary: true}]});
  return STYLE + tileRow([
    {label: 'Campaigns', value: list.length, caption: STATES.map(s => list.filter(c => c.status === s).length + ' ' + s.toLowerCase()).filter(t => !t.startsWith('0 ')).join(' · ') || 'None yet'},
    {label: 'Carousel slides', value: sum('carousel'), caption: 'Across these campaigns'},
    {label: 'Stories', value: sum('story'), caption: 'Across these campaigns'},
    {label: 'Pieces', value: list.reduce((t, c) => t + (c.itemIds || []).length, 0), caption: 'Content items linked'},
    {label: 'Zernio drafts', value: drafts, caption: drafts ? 'Saved, not published' : 'None saved yet'},
  ], {esc, number: ctx.number}) + status + '<p class="pk-lead">Open a campaign for its slides, stories, caption and pieces.</p><div class="campaign-grid">' + list.map(c => card(c, esc)).join('') + '</div>';
}

function strip(c, format, esc) {
  const slides = slidesOf(c, format), word = format === 'story' ? 'Stories' : 'Carousel';
  return '<section class="campaign-format"><h3>' + word + ' <small>' + slides.length + '</small></h3>' + (slides.length ? '<div class="slide-strip">' + slides.map((s, i) => '<figure class="slide slide--' + format + ' mk-slide">'
    + (isVideo(s.file) ? '<video controls playsinline preload="metadata" src="' + esc(fileURL(s.file)) + '" aria-label="' + esc(word + ' ' + (i + 1)) + '"></video>' : '<img loading="lazy" src="' + esc(fileURL(s.file)) + '" alt="' + esc(word + ' ' + (i + 1)) + '">')
    + '<figcaption><span>' + (i + 1) + ' / ' + slides.length + (s.title ? ' · ' + esc(clip(s.title, 30)) : '') + '</span>' + button(esc, 'Remove', 'mk-campaigns-unfile', c.id + '|' + format + '|' + s.file, {aria: 'Remove ' + word.toLowerCase() + ' ' + (i + 1)}) + '</figcaption></figure>').join('') + '</div>'
    : '<p class="dt-empty">No ' + (format === 'story' ? 'stories' : 'carousel slides') + ' yet. Make them in Carousels & stories, link a piece that has them, or add files from your Marketing folder.</p>')
    + '<div class="actions" style="margin-top:6px">' + button(esc, format === 'story' ? 'Add stories from Marketing folder' : 'Add slides from Marketing folder', 'mk-campaigns-files', c.id + '|' + format) + '</div></section>';
}
function openCampaign(ctx, id, note = '') {
  const {esc} = ctx, c = find(id);
  if (!c) throw new Error('This campaign no longer exists. Refresh the page.');
  const items = cache.items, mine = (c.itemIds || []).map(i => items.find(x => x.id === i)).filter(Boolean), others = items.filter(i => !(c.itemIds || []).includes(i.id) && i.status !== 'Archived');
  const drafts = (c.drafts || []).slice().reverse();
  ctx.preview(c.name, STYLE + '<div class="pk-wide" data-mk-campaign="' + esc(id) + '"><div class="campaign-head"><span class="ui-badge">' + esc(c.status) + '</span>' + (c.keyword ? '<span class="ui-badge ui-badge--lavender">Keyword ' + esc(c.keyword) + '</span>' : '') + (c.goal ? '<span>' + esc(c.goal) + '</span>' : '') + '</div>'
    + strip(c, 'carousel', esc) + strip(c, 'story', esc)
    + '<form class="pk-form" data-mk-camp-form style="margin-top:12px"><label>Caption<textarea name="caption" id="mk-camp-caption" rows="5" maxlength="5000" placeholder="One caption for the carousel and the stories">' + esc(c.caption) + '</textarea></label>'
    + '<div class="mk-grid2"><label>Name *<input name="name" required maxlength="120" value="' + esc(c.name) + '"></label><label>Comment keyword<input name="keyword" maxlength="40" value="' + esc(c.keyword) + '" placeholder="For example GUIDE"></label>'
    + '<label>Status<select name="status">' + STATES.map(s => '<option' + (s === c.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label></div>'
    + '<label>Goal<input name="goal" maxlength="600" value="' + esc(c.goal) + '" placeholder="What this campaign should do"></label>'
    + '<div class="actions"><button type="submit">Save campaign</button>' + button(esc, 'Copy caption', 'mk-campaigns-copy', id) + button(esc, 'Create Zernio draft', 'mk-campaigns-draft', id, {primary: true}) + '</div>'
    + '<p class="mk-status" data-mk-status role="status">' + esc(note) + '</p></form>'
    + '<h3 style="margin:18px 0 8px;font-size:14px">Pieces <small class="dt-muted">' + mine.length + '</small></h3>' + (mine.length ? '<ul class="mk-pieces">' + mine.map(i => '<li><span><span class="stage-pill" data-stage="' + esc(String(i.status).toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '">' + esc(i.status) + '</span>' + esc(i.title) + '</span><span class="actions">' + button(esc, 'Open', 'mk-production-open', i.id) + button(esc, 'Remove', 'mk-campaigns-unlink', id + '|' + i.id, {aria: 'Remove ' + i.title + ' from this campaign'}) + '</span></li>').join('') + '</ul>' : '<p class="dt-empty">No pieces linked yet. A linked piece brings its carousel and story slides along.</p>')
    + (others.length ? '<div class="actions" style="align-items:end"><label style="flex:1">Link a piece<select id="mk-camp-link">' + others.map(i => '<option value="' + esc(i.id) + '">' + esc(i.title + ' · ' + i.status) + '</option>').join('') + '</select></label>' + button(esc, 'Link piece', 'mk-campaigns-link', id) + '</div>' : '')
    + (drafts.length ? '<details style="margin-top:12px"><summary>Zernio drafts · ' + drafts.length + '</summary><ul class="pk-list">' + drafts.map(d => '<li>' + esc((d.format === 'story' ? 'Stories' : 'Carousel') + ' · ' + plural(d.slides || 0, 'file') + ' · ' + plural((d.postIds || []).length, 'draft') + ' · ' + new Date(d.at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})) + '</li>').join('') + '</ul></details>' : '')
    + '<div class="actions" style="justify-content:flex-end;margin-top:18px">' + button(esc, 'Delete campaign', 'mk-campaigns-delete', id, {cls: 'mk-danger'}) + '</div></div>');
  const form = ctx.$('#preview-body [data-mk-camp-form]');
  bindForm(form, async v => { await ctx.api('marketing/campaigns', {action: 'update', id, ...v}); await reload(ctx, id, 'Saved.') });
}
// After a change: new data, the dialog drawn again with a note, and the page behind it refreshed.
async function reload(ctx, id, note) {
  cache = await ctx.api('marketing/campaigns');
  if (id && find(id)) openCampaign(ctx, id, note); else ctx.$('#preview')?.close();
  ctx.refresh();
}
// The campaign dialog's status line.
const note = (ctx, text, tone = '') => say(ctx.$('#preview-body [data-mk-campaign]'), text, tone);

async function newCampaign(ctx) {
  const {esc} = ctx;
  ctx.preview('New campaign', '<form class="pk-form" data-mk-camp-new><label>Name *<input name="name" required maxlength="120" placeholder="For example: Launch week"></label>'
    + '<div class="mk-grid2"><label>Comment keyword<input name="keyword" maxlength="40" placeholder="For example GUIDE"></label><label>Goal<input name="goal" maxlength="600" placeholder="What it should do"></label></div>'
    + '<label>Caption<textarea name="caption" rows="4" maxlength="5000" placeholder="You can write or paste it later"></textarea></label>'
    + '<p class="mk-status" data-mk-status role="status"></p><div class="actions"><button type="submit" class="primary">Create campaign</button></div></form>');
  const form = ctx.$('#preview-body [data-mk-camp-new]'); form.querySelector('[name=name]').focus();
  bindForm(form, async v => { const c = await ctx.api('marketing/campaigns', {action: 'add', ...v}); cache = await ctx.api('marketing/campaigns'); openCampaign(ctx, c.id, 'Campaign created. Add slides, stories and pieces.'); ctx.refresh() });
}

// Files from the workspace's Marketing folder, picked with checkboxes in a confirm dialog.
async function addFiles(ctx, id, format) {
  const {esc} = ctx, d = await ctx.api('marketing/files'), have = new Set(slidesOf(find(id), format).map(s => s.file));
  const files = d.files.filter(f => !have.has(f.path));
  const html = files.length ? '<p class="pk-note" style="margin:0">From ' + esc(d.folder) + '</p><div class="mk-pick">' + files.map(f => '<label class="mk-pick-item">'
      + (isVideo(f.path) ? '<video src="' + esc(fileURL(f.path)) + '" preload="metadata" muted></video>' : '<img loading="lazy" src="' + esc(fileURL(f.path)) + '" alt="">') + '<span class="mk-pick-row"><input type="checkbox" name="file" value="' + esc(f.path) + '">' + esc(f.rel) + '</span></label>').join('') + '</div>'
    : '<p class="notice">No new PNG, JPG or MP4 files in your Marketing folder. Put them in ' + esc(d.folder) + ' and open this again.</p>';
  const picked = await confirmBox(ctx, {title: format === 'story' ? 'Add stories' : 'Add carousel slides', html: STYLE + html, ok: files.length ? 'Add to campaign' : 'Close'});
  const list = picked ? picked.getAll('file') : [];
  if (!list.length) return;
  await ctx.api('marketing/campaigns', {action: 'addFiles', id, format, files: list});
  await reload(ctx, id, plural(list.length, 'file') + ' added.');
}

// The only way to Zernio: pick carousel or stories and the accounts, see what will happen, confirm.
async function draft(ctx, id) {
  const {esc} = ctx, c = find(id);
  if (!c) throw new Error('This campaign no longer exists.');
  if (!cache.zernio) { note(ctx, 'Connect Zernio in Setup first. Then your accounts show up here.', 'error'); return }
  const caption = ctx.$('#mk-camp-caption')?.value ?? c.caption, n = {carousel: slidesOf(c, 'carousel').length, story: slidesOf(c, 'story').length};
  if (!n.carousel && !n.story) { note(ctx, 'Add carousel slides or stories first.', 'error'); return }
  const accounts = (await ctx.api('marketing/accounts')).accounts || [];
  if (!accounts.length) { note(ctx, 'No social accounts are connected in Zernio yet.', 'error'); return }
  const first = n.carousel ? 'carousel' : 'story';
  const html = '<fieldset class="pk-form" style="border:0;padding:0;margin:0"><legend class="pk-note">What goes into the draft</legend>'
    + (n.carousel ? '<label><input type="radio" name="format" value="carousel"' + (first === 'carousel' ? ' checked' : '') + '> Carousel · ' + plural(Math.min(n.carousel, 10), 'slide') + ' in one draft' + (n.carousel > 10 ? ' (the first 10)' : '') + '</label>' : '')
    + (n.story ? '<label><input type="radio" name="format" value="story"' + (first === 'story' ? ' checked' : '') + '> Stories · ' + plural(Math.min(n.story, 10), 'draft') + ', one per story' + (n.story > 10 ? ' (the first 10)' : '') + '</label>' : '') + '</fieldset>'
    + '<fieldset class="pk-form" style="border:0;padding:0;margin:0"><legend class="pk-note">Accounts</legend>' + accounts.map((a, i) => '<label><input type="checkbox" name="account" value="' + esc(a.id) + '"' + (i === 0 ? ' checked' : '') + '> ' + esc((a.handle || a.name) + ' · ' + cap(a.platform)) + '</label>').join('') + '</fieldset>'
    + '<div><p class="pk-note" style="margin:0 0 4px">Caption</p><p style="white-space:pre-wrap;margin:0;font-size:13px">' + esc(clip(caption, 400) || 'No caption') + '</p></div>'
    + '<p class="notice" style="margin:0">This uploads the files to your Zernio account and saves a draft. Nothing is published or scheduled: you check the draft and schedule it in Zernio.</p>';
  const v = await confirmBox(ctx, {title: 'Create a Zernio draft?', html, ok: 'Create draft'});
  if (!v) return;
  const accountIds = v.getAll('account');
  if (!accountIds.length) { note(ctx, 'Choose at least one account.', 'error'); return }
  note(ctx, 'Uploading and saving the draft…');
  try {
    const r = await ctx.api('marketing/campaigns/' + encodeURIComponent(id) + '/draft', {confirm: true, format: v.get('format') || first, accountIds, caption});
    await reload(ctx, id, r.message);
  } catch (error) { note(ctx, error.message, 'error') }
}

// ── Accounts ───────────────────────────────────────────────────────────────────────────────────────────────────────
let accounts = [];
async function accountsPage(ctx) {
  const {esc} = ctx, d = await ctx.api('marketing/accounts');
  accounts = d.accounts || [];
  ctx.filters('<a class="ui-btn" href="/setup#social">Connect an account</a>');
  if (!d.connected) return STYLE + stateView({kind: 'setup', title: 'Connect your social accounts', body: 'Add your Zernio key in Setup and connect Instagram, TikTok, YouTube, LinkedIn and more. Then note here what each account is for; your agent writes with it.', actions: [{label: 'Open Setup', href: '/setup#social', primary: true, external: false}]});
  const tiles = tileRow([
    {label: 'Accounts', value: accounts.length, caption: accounts.filter(a => a.needsReconnect).length ? accounts.filter(a => a.needsReconnect).length + ' need a reconnect' : 'Connected through Zernio'},
    {label: 'With a purpose', value: accounts.filter(a => a.purpose).length, caption: 'Your agent writes with it'},
    {label: 'Items assigned', value: accounts.reduce((t, a) => t + (a.items || 0), 0), caption: 'Active content items'},
    {label: 'Unassigned items', value: d.unassigned, caption: 'Pick an account in the Library'},
  ], {esc, number: ctx.number});
  if (!accounts.length) return STYLE + tiles + stateView({kind: 'setup', title: 'No accounts yet', body: d.note || 'Connect an account in Setup.', actions: [{label: 'Open Setup', href: '/setup#social', primary: true, external: false}]});
  const row = a => '<article class="mk-account">' + (safeImg(a.avatar) ? '<img src="' + esc(safeImg(a.avatar)) + '" alt="">' : '<span class="mk-avatar" aria-hidden="true">' + esc((a.handle || a.name || '?').replace('@', '')[0]?.toUpperCase() || '?') + '</span>')
    + '<div><strong>' + esc(a.handle || a.name) + '</strong> <small class="dt-muted">' + esc(cap(a.platform) + (a.followers != null ? ' · ' + ctx.number(a.followers) + ' followers' : '') + ' · ' + plural(a.items || 0, 'item')) + '</small>'
    + (a.needsReconnect ? ' <span class="ui-badge ui-badge--warn">Reconnect in Setup</span>' : '')
    + '<p>' + (a.purpose ? esc(a.purpose) : '<span class="dt-muted">No purpose yet. Say who it is for and what it posts.</span>') + '</p>'
    + ((a.pillars || []).length ? '<p>' + a.pillars.map(p => '<span class="ui-badge ui-badge--plain">' + esc(p) + '</span>').join(' ') + '</p>' : '') + '</div>'
    + '<div class="actions">' + button(esc, a.purpose ? 'Edit purpose' : 'Add purpose', 'mk-campaigns-account', a.id, {aria: 'Edit the purpose of ' + (a.handle || a.name)}) + '</div></article>';
  return STYLE + tiles + panel('Your accounts', '<p class="pk-lead">Your agent reads an account’s purpose and pillars whenever it writes a script, hooks or a caption for a piece on that account.</p><div class="mk-accounts">' + accounts.map(row).join('') + '</div>', {esc, meta: plural(accounts.length, 'account')});
}
function editAccount(ctx, id) {
  const {esc} = ctx, a = accounts.find(x => x.id === id);
  if (!a) throw new Error('This account is no longer connected. Refresh the page.');
  ctx.preview('Purpose · ' + (a.handle || a.name), '<form class="pk-form" data-mk-account><label>What is this account for?<textarea name="purpose" rows="4" maxlength="600" placeholder="Who it is for, what it posts, the tone">' + esc(a.purpose) + '</textarea></label>'
    + '<label>Content pillars<input name="pillars" maxlength="400" value="' + esc((a.pillars || []).join(', ')) + '" placeholder="Up to 8 topics, separated by commas"></label>'
    + '<p class="mk-status" data-mk-status role="status"></p><div class="actions"><button type="submit" class="primary">Save</button></div></form>');
  bindForm(ctx.$('#preview-body [data-mk-account]'), async v => { await ctx.api('marketing/accounts', {accountId: id, purpose: v.purpose, pillars: v.pillars}); ctx.$('#preview').close(); ctx.refresh() });
}

export async function page(view, ctx) { return view === 'accounts' ? accountsPage(ctx) : campaignsPage(ctx) }
export function mount() { return null }

export async function act(action, id, ctx) {
  const verb = action.slice('mk-campaigns-'.length), [a, b, ...rest] = String(id).split('|');
  switch (verb) {
    case 'new': return newCampaign(ctx);
    case 'open': if (!find(id)) cache = await ctx.api('marketing/campaigns'); return openCampaign(ctx, id);
    case 'files': return addFiles(ctx, a, b);
    case 'draft': return draft(ctx, id);
    case 'account': return editAccount(ctx, id);
    case 'copy': {
      const text = ctx.$('#mk-camp-caption')?.value || '';
      if (!text) { note(ctx, 'Write a caption first.', 'error'); return }
      try { await navigator.clipboard.writeText(text) } catch { const t = ctx.$('#mk-camp-caption'); t.select(); document.execCommand('copy') }
      note(ctx, 'Caption copied.'); return;
    }
    case 'link': {
      const item = ctx.$('#mk-camp-link')?.value; if (!item) return;
      await ctx.api('marketing/campaigns', {action: 'link', id, itemId: item}); return reload(ctx, id, 'Piece linked.');
    }
    case 'unlink': {
      const i = cache.items.find(x => x.id === b);
      if (!await confirmBox(ctx, {title: 'Remove this piece?', body: '“' + (i?.title || 'This piece') + '” leaves the campaign, with its slides. The piece itself stays in your Library.', ok: 'Remove piece', danger: true})) return;
      await ctx.api('marketing/campaigns', {action: 'unlink', id: a, itemId: b}); return reload(ctx, a, 'Piece removed.');
    }
    case 'unfile': {
      const file = rest.join('|');
      if (!await confirmBox(ctx, {title: 'Remove this ' + (b === 'story' ? 'story' : 'slide') + '?', body: 'It leaves the campaign. The file stays on this Mac.', ok: 'Remove', danger: true})) return;
      await ctx.api('marketing/campaigns', {action: 'removeFile', id: a, format: b, file}); return reload(ctx, a, 'Removed.');
    }
    case 'delete': {
      const c = find(id);
      if (!await confirmBox(ctx, {title: 'Delete this campaign?', body: '“' + (c?.name || 'This campaign') + '” is removed from this Mac. Its pieces stay in your Library, and drafts already in Zernio stay there.', ok: 'Delete campaign', danger: true})) return;
      await ctx.api('marketing/campaigns', {action: 'delete', id}); ctx.$('#preview')?.close(); return ctx.refresh();
    }
    default: throw new Error('This action is not available.');
  }
}
