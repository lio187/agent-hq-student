// Studio (student edition): the content desk. One screen answers "what needs me, where does content wait, what is
// working" from the student's own items and jobs, the fastest-rising competitor posts (Research) and their own posts
// (Zernio, when connected). It never posts or spends anything; every button opens the page to act in.
import {tileRow, panel, mediaWall, detailDialog} from './page-kit.mjs';
import {videoWall, playerHTML, wallAction, wallItem, wallDetail} from './video-wall.mjs';
import {stateView} from './ui.mjs';
import {newIdea, button, safeLink, clip, fileURL} from './mk-production.mjs';

// The office no longer routes the walls' own clicks (video-play, video-wall), so Studio takes them over.
const ownWall = html => html.replaceAll('data-action="video-play"', 'data-action="mk-studio-wallplay"').replaceAll('data-action="video-wall"', 'data-action="mk-studio-wallnav"');
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const compact = n => Intl.NumberFormat('en-GB', {notation: 'compact', maximumFractionDigits: 1}).format(Number(n) || 0);
const firstLine = t => String(t || '').split(/\n+/).map(l => l.replace(/https?:\/\/\S+/g, '').trim()).find(l => l.length > 3) || '';
// A thumbnail: an https address, or a file in the app's media folders (served by marketing/file).
const thumb = v => /^https:\/\//.test(v || '') ? v : /^\/(?!api\/)/.test(v || '') ? fileURL(v) : String(v || '').startsWith('/api/hq/v1/') ? v : '';
// Stage → the page where the work on it happens.
const STAGE_VIEW = {Idea: 'content', Scripted: 'record', 'To Edit': 'team', Editing: 'team', 'To Review': 'reviews', 'Ready To Post': 'team', Posted: 'social'};
const GUIDE = [
  ['Start with your next moves', 'Everything waiting on you, most urgent first. Each button opens the page to act in.'],
  ['Find an angle', 'Open a rising post below, or a signal in Ideas & research, and press Turn into an idea. It lands on your board.'],
  ['Let your agent write', 'Production › Jobs: your Content Writer writes the script, five hooks or the caption. Results wait in Review when you ask for that.'],
  ['Make it', 'Read scripts to camera with the teleprompter in Recording. Carousels and stories come from the maker.'],
  ['Decide and publish', 'Approve in Review. A campaign turns slides and a caption into a Zernio draft; you schedule it in Zernio.'],
];
const GUIDE_KEY = 'hq-mk-studio-guide';
let data = null;

function nextMoves(d) {
  const n = s => d.stages.find(x => x.stage === s) || {count: 0, oldestDays: null}, moves = [];
  const review = n('To Review');
  if (review.count) moves.push({tone: 'attention', count: review.count, text: plural(review.count, 'piece') + ' waiting for your decision' + (review.oldestDays ? ' · oldest ' + plural(review.oldestDays, 'day') : ''), action: 'Review now', view: 'reviews'});
  if (d.jobs.failed) moves.push({tone: 'error', count: d.jobs.failed, text: plural(d.jobs.failed, 'agent job') + ' failed', action: 'See why', view: 'production'});
  if (n('Scripted').count) moves.push({tone: 'calm', count: n('Scripted').count, text: plural(n('Scripted').count, 'finished script') + ' ready to record', action: 'Record', view: 'record'});
  if (n('Ready To Post').count) moves.push({tone: 'calm', count: n('Ready To Post').count, text: plural(n('Ready To Post').count, 'piece') + ' approved and ready to post', action: 'Open board', view: 'team'});
  if (d.jobs.running) moves.push({tone: 'calm', count: d.jobs.running, text: plural(d.jobs.running, 'job') + ' being written by your agent', action: 'Follow', view: 'production'});
  const ideas = n('Idea').count;
  if (ideas < 5) moves.push({tone: 'calm', count: ideas, text: (ideas ? 'Only ' + plural(ideas, 'idea') : 'No ideas') + ' in the pipeline' + (d.rising.length ? ' · ' + plural(d.rising.length, 'rising post') + ' to borrow an angle from' : ''), action: 'Find angles', view: 'research'});
  return moves;
}

export async function page(view, ctx) {
  const {esc} = ctx, d = data = await ctx.api('marketing/studio'), now = Date.now();
  const n = s => d.stages.find(x => x.stage === s)?.count || 0, own = d.own || {};
  let open = true; try { open = localStorage.getItem(GUIDE_KEY) !== 'closed' } catch {}
  const guide = '<details class="studio-guide"' + (open ? ' open' : '') + '><summary>How Studio works · ' + GUIDE.length + ' steps</summary><ol>' + GUIDE.map(([t, p], i) => '<li><b>' + (i + 1) + '</b><div><strong>' + esc(t) + '</strong><p>' + esc(p) + '</p></div></li>').join('') + '</ol></details>';
  const actions = '<div class="studio-actions">' + button(esc, 'New idea', 'mk-studio-new', '', {primary: true}) + button(esc, 'Make a carousel', 'mk-studio-go', 'makers') + button(esc, 'Make stories', 'mk-studio-go', 'makers')
    + button(esc, 'Analyse a creator', 'mk-studio-go', 'analysis') + button(esc, 'All jobs', 'section', 'production') + '</div>';
  const tiles = tileRow([
    {label: 'Ideas', value: n('Idea'), caption: 'Not scripted yet', action: {action: 'section', id: 'content'}},
    {label: 'Ready to record', value: n('Scripted'), caption: 'Finished scripts', action: {action: 'section', id: 'record'}},
    {label: 'In the edit', value: n('To Edit') + n('Editing'), caption: 'To edit or being edited', action: {action: 'section', id: 'team'}},
    {label: 'Your review', value: n('To Review'), caption: d.jobs.review ? plural(d.jobs.review, 'agent result') + ' among them' : 'Pieces waiting for a decision', action: {action: 'section', id: 'reviews'}},
    {label: 'Ready to post', value: n('Ready To Post'), caption: 'Approved, not posted yet', action: {action: 'section', id: 'team'}},
    {label: 'Posted · 30 days', value: own.connected ? own.posted30 : null, caption: own.connected ? 'Posts on your accounts (Zernio)' : 'Connect Zernio to count them', action: {action: 'section', id: 'social'}},
  ], {esc, number: ctx.number});
  const moves = nextMoves(d);
  const movesHTML = moves.length ? '<ol class="studio-moves">' + moves.map(m => '<li data-tone="' + esc(m.tone) + '"><b>' + esc(compact(m.count)) + '</b><span>' + esc(m.text) + '</span>' + button(esc, m.action + ' →', 'section', m.view) + '</li>').join('') + '</ol>'
    : '<p class="dt-empty">Nothing is waiting on you. Start from a rising post or a new idea.</p>';
  const top = Math.max(1, ...d.stages.map(s => s.count));
  const flow = '<ol class="studio-flow" aria-label="Content items per stage">' + d.stages.map(s => '<li><button type="button" data-action="section" data-id="' + esc(STAGE_VIEW[s.stage] || 'team') + '" aria-label="' + esc(s.stage + ': ' + s.count + (s.oldestDays != null ? ', oldest ' + s.oldestDays + ' days' : '')) + '"><span class="studio-flow-stage">' + esc(s.stage) + '</span><span class="viz-bar-track"><span class="viz-bar" style="--w:' + (s.count ? Math.max(3, Math.round(s.count / top * 100)) : 0) + '%"></span></span><b>' + esc(s.count) + '</b><small>' + esc(s.oldestDays == null ? '—' : s.oldestDays === 0 ? 'today' : s.oldestDays + ' d oldest') + '</small></button></li>').join('') + '</ol>';
  const stuck = d.stages.filter(s => s.count && s.stage !== 'Posted').sort((a, b) => (b.oldestDays ?? 0) - (a.oldestDays ?? 0))[0];
  const ideaButton = (kind, id) => button(esc, 'Turn into an idea', 'mk-studio-idea', kind + '|' + id, {primary: true});

  const rising = (d.rising || []).map(p => ({id: String(p.id), platform: p.platform || 'instagram', url: p.url, text: p.caption || '', creator: p.account || '', metrics: {views: p.views}, changes: {views: p.growth}, publishedAt: p.publishedAt, kind: 'video', thumbUrl: thumb(p.thumb)}));
  const risingWall = rising.length ? ownWall(videoWall({id: 'mk-rising', esc, now, items: rising, sorts: [['rising', 'Rising'], ['views', 'Most viewed'], ['newest', 'Newest']], emptyText: 'No rising posts yet.',
    detail: item => ({title: item.creator || 'Post', html: playerHTML(item, {esc, now, link: (u, l) => safeLink(esc, u, l), actions: ideaButton('rising', item.id)}) + '<p class="mk-status" data-mk-status role="status"></p>'})}))
    : stateView({kind: 'empty', title: 'No rising posts yet', body: 'Add the accounts you watch in Competitors. Their fastest-rising posts show up here as angles for your next idea.', actions: [{label: 'Open Competitors', action: 'section', id: 'competitors'}]});
  const views = p => Number(p.metrics?.views) || 0;
  const best = (own.posts || []).map(p => ({id: String(p.id), title: firstLine(p.text) || 'Post', sub: cap(p.platform || '') + (own.analytics ? ' · ' + compact(views(p)) + ' views' : ''), preview: p.text, publishedAt: p.publishedAt, thumbUrl: thumb(p.thumbnail), badges: own.analytics ? [compact(views(p)) + ' views'] : [], raw: p}));
  const bestWall = !own.connected ? stateView({kind: 'setup', title: 'Connect your social accounts', body: 'With Zernio connected, your best posts of the last 90 days show here.', actions: [{label: 'Open Setup', href: '/setup#social', external: false}]})
    : best.length ? ownWall(mediaWall({id: 'mk-own', esc, kind: 'post', items: best, sorts: own.analytics ? [['views', 'Most viewed', (a, b) => views(b.raw) - views(a.raw)]] : [['newest', 'Newest']], emptyText: 'No posts in the last 90 days.', detail: w => ({title: w.title, html: detailDialog([{fields: [['Platform', cap(w.raw.platform)], ['Published', w.raw.publishedAt ? new Date(w.raw.publishedAt).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : ''], ...(own.analytics ? [['Views', compact(views(w.raw))], ['Likes', compact(w.raw.metrics?.likes)], ['Comments', compact(w.raw.metrics?.comments)]] : [])]}, {title: 'Caption', html: '<p style="white-space:pre-wrap">' + esc(w.raw.text || 'No caption.') + '</p>'}], {esc}) + '<div class="actions">' + ideaButton('own', w.id) + safeLink(esc, w.raw.url, 'Open the post') + '</div><p class="mk-status" data-mk-status role="status"></p>'})}))
    : '<p class="dt-empty">No posts in the last 90 days.</p>';

  return guide + actions + tiles
    + '<div class="viz-grid studio-grid">' + panel('Your next moves', movesHTML, {esc, meta: moves.length ? plural(moves.length, 'item') : 'clear'})
    + panel('Where content waits', flow + (stuck ? '<p class="viz-note">Longest wait: <b>' + esc(stuck.stage) + '</b> · ' + esc(plural(stuck.count, 'item')) + (stuck.oldestDays ? ', the oldest for ' + esc(plural(stuck.oldestDays, 'day')) : '') + '. Archived items are left out.</p>' : ''), {esc, meta: plural(d.total, 'active item')}) + '</div>'
    + panel('What is working · rising posts', '<p class="pk-lead">The fastest-rising posts from the accounts you watch. Open one to watch it and turn it into an idea.</p>' + risingWall, {esc, meta: rising.length ? 'top ' + rising.length : '', cls: 'wall-card'})
    + panel('What is working · your posts', '<p class="pk-lead">' + (own.analytics ? 'Your most-viewed posts of the last 90 days.' : own.connected ? 'Your latest posts. Views need Zernio’s Analytics add-on.' : 'Your own posts, once Zernio is connected.') + '</p>' + (own.note ? '<p class="notice">' + esc(own.note) + '</p>' : '') + bestWall, {esc, meta: best.length ? 'top ' + best.length : '', cls: 'wall-card'});
}

export function mount(view, el) {
  const g = el.querySelector('details.studio-guide'); if (!g) return null;
  const keep = () => { try { localStorage.setItem(GUIDE_KEY, g.open ? 'open' : 'closed') } catch {} };
  g.addEventListener('toggle', keep);
  return () => g.removeEventListener('toggle', keep);
}

export async function act(action, id, ctx, el) {
  const {esc} = ctx;
  if (action === 'mk-studio-new') return newIdea(ctx);
  if (action === 'mk-studio-go') return ctx.go(id);
  // The walls: chips, sorting and "Show more" redraw the wall in place; a tile opens its dialog (player or post).
  if (action === 'mk-studio-wallnav') {
    const wall = el?.closest('.vw'), html = wallAction(id);
    if (wall && html) wall.outerHTML = ownWall(html);
    return;
  }
  if (action === 'mk-studio-wallplay') {
    const at = id.indexOf('|'), wid = id.slice(0, at), itemId = id.slice(at + 1), d = wallDetail(wid, itemId);
    if (d) return ctx.preview(d.title, d.html);
    const item = wallItem(wid, itemId); if (!item) return;
    return ctx.preview(item.creator || 'Video', playerHTML(item, {esc, link: (u, l) => safeLink(esc, u, l)}));
  }
  if (action === 'mk-studio-idea') {
    // A post becomes an idea: its first line as the title and hook, the caption as notes, the post as the source.
    const [kind, pid] = [id.slice(0, id.indexOf('|')), id.slice(id.indexOf('|') + 1)], body = ctx.$('#preview-body');
    const p = kind === 'rising' ? data?.rising?.find(x => String(x.id) === pid) : data?.own?.posts?.find(x => String(x.id) === pid);
    if (!p) throw new Error('This post is no longer in the list. Refresh Studio.');
    const text = kind === 'rising' ? p.caption : p.text, line = firstLine(text);
    const item = await ctx.api('marketing/content', {action: 'add', title: clip(line || 'Idea from a post', 120), hook: clip(line, 300), notes: String(text || '').slice(0, 4000),
      sourceRef: {kind: kind === 'rising' ? 'competitor' : 'own post', url: p.url || '', title: (kind === 'rising' ? (p.account || 'Competitor') : 'Your post') + ' · ' + clip(line, 80)}});
    if (body) body.innerHTML = stateView({kind: 'empty', title: 'Added to your ideas', body: '“' + item.title + '” is on your board as an idea. Your agent can write its script now.',
      actions: [{label: 'Write the script', action: 'mk-production-start', id: 'script.write|' + item.id, primary: true}, {label: 'Open the board', action: 'section', id: 'team'}]});
    return;
  }
  throw new Error('This action is not available.');
}
