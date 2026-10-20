// Signals and Competitors (workstream A2). Signals: a free news radar (GitHub, Hacker News, Hugging Face, OpenAI news
// and the student's own feeds) turned into content ideas, with the researcher agent suggesting angles. Competitors:
// the accounts the student watches, collected with their own Apify key only after they saw the maximum cost and
// confirmed it; what is rising, a video wall with the platforms' official players, and simple charts.
import {tileRow, statusRows, chartBand, panel} from './page-kit.mjs';
import {barList, columns, perDay} from './viz.mjs';
import {videoWall, playerHTML, wallAction, wallItem, wallDetail} from './video-wall.mjs';
import {dataTable, relativeTime} from './data-table.mjs';
import {stateView} from './ui.mjs';

const PLATFORM = {instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube'};
const WALL = 'research-competitors';
const usd = v => '$' + (Number(v) || 0).toFixed(2);
const compact = n => n == null || !Number.isFinite(Number(n)) ? '—' : Intl.NumberFormat('en-GB', {notation: 'compact', maximumFractionDigits: 1}).format(Number(n));
const safeURL = v => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : '' } catch { return '' } };
const firstLine = t => String(t || '').split(/\n+/).map(l => l.trim()).find(Boolean) || '';
// The office no longer routes the wall's own clicks (video-play, video-wall), so this page takes them over.
const own = html => html.replaceAll('data-action="video-play"', 'data-action="mk-research-wallplay"').replaceAll('data-action="video-wall"', 'data-action="mk-research-wallnav"');
// The page's own state while the app is open: the Signals source filter and the last data (for dialogs).
const ui = {source: 'all', signals: null, competitors: null};

const STYLE = '<style>'
  + '.rs-signal{align-items:flex-start}.rs-signal .rs-main{flex:1;min-width:0}.rs-signal .rs-main a{font-weight:590;color:var(--text-primary);text-decoration:none;overflow-wrap:anywhere}.rs-signal .rs-main a:hover{text-decoration:underline}'
  + '.rs-signal p{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--text-secondary)}.rs-score{flex:0 0 46px;text-align:center;font:600 13px/1 var(--font-mono,monospace);padding:7px 0;border:1px solid var(--border-soft);border-radius:8px;color:var(--text-primary)}'
  + '.rs-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.rs-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border:1px solid var(--border-soft);border-radius:999px;font-size:12px}'
  + '.rs-chip button{border:0;background:transparent;padding:0 4px;height:auto;cursor:pointer;color:var(--text-tertiary)}.rs-inline{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin:8px 0}.rs-inline label{flex:1 1 220px}'
  + '.rs-inline select{width:auto}.rs-msg{min-height:1.2em;font-size:12px;color:var(--text-secondary);margin:6px 0 0}.rs-msg[data-tone=err]{color:var(--status-error)}'
  + '.rs-angle{align-items:flex-start}.rs-angle blockquote{margin:4px 0 2px;font-size:13px;line-height:1.45;color:var(--text-body)}.rs-angle small a{color:inherit}'
  + '.rs-rising{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}'
  + '.rs-card{display:grid;grid-template-columns:76px 1fr;gap:12px;align-items:start;padding:10px;border:1px solid var(--border-soft);border-radius:var(--radius-card,12px);background:var(--bg-glass-1)}'
  + '.rs-card>button.rs-thumb{all:unset;cursor:pointer;display:block;width:76px;aspect-ratio:4/5;border-radius:8px;background:var(--bg-glass-3) center/cover no-repeat;position:relative}.rs-card>button.rs-thumb:focus-visible{outline:2px solid var(--accent)}'
  + '.rs-card>button.rs-thumb:after{content:"▶";position:absolute;inset:auto 6px 6px auto;font-size:10px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)}.rs-card .rs-body{display:grid;gap:4px;font-size:12px;min-width:0}'
  + '.rs-card .rs-body strong{font-size:12px}.rs-card .rs-body small{color:var(--text-secondary)}.rs-card .rs-body>span{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}'
  + '.rs-up{color:var(--status-live)}.rs-quote dl{display:grid;grid-template-columns:auto auto;gap:6px 18px;margin:14px 0;font-size:13px}.rs-quote dt{color:var(--text-secondary)}.rs-quote dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}'
  + '.rs-quote .row small{white-space:normal}</style>';

export async function page(view, ctx) {
  return STYLE + (view === 'competitors' ? await competitorsPage(ctx) : await signalsPage(ctx));
}

// While sources are being read, angles are being written or a collection runs: check every 2.5 s and redraw the
// page once when that work is finished.
export function mount(view, el, ctx) {
  const busy = view === 'competitors'
    ? d => d?.collection?.status === 'running' || Boolean(d?.thumbsPending)
    : d => Boolean(d?.refreshing) || d?.angles?.status === 'running';
  const first = view === 'competitors' ? ui.competitors : ui.signals;
  if (!busy(first)) return null;
  let tries = 0, stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    if (++tries > 240) { clearInterval(timer); return }
    try {
      const d = await ctx.api(view === 'competitors' ? 'marketing/competitors' : 'marketing/signals');
      if (!busy(d) && !stopped) { clearInterval(timer); stopped = true; ctx.refresh() }
    } catch {}
  }, 2500);
  return () => { stopped = true; clearInterval(timer) };
}

// MARK: Signals
async function signalsPage({api, esc, filters}) {
  filters('');
  const d = ui.signals = await api('marketing/signals');
  const list = d.signals || [], sources = d.sources || [], topics = d.settings?.topics || [], feeds = d.settings?.feeds || [];
  const current = sources.filter(s => s.state === 'current').length;
  const tiles = tileRow([
    {label: 'Signals', value: list.length, caption: 'From the last 7 days, ' + sources.length + ' free sources'},
    {label: 'Turned into ideas', value: list.filter(s => s.ideaId).length, caption: 'Added to your content board'},
    {label: 'Sources up to date', value: current + ' of ' + sources.length, caption: d.refreshing ? 'Checking the sources now…' : 'Each source is checked once an hour'},
    {label: 'Topics', value: topics.length, caption: topics.join(', ') || 'None yet'},
  ], {esc});
  const health = statusRows(sources.map(s => ({label: s.label, state: s.state, at: s.at, reason: s.error || (s.state === 'pending' ? (d.refreshing ? 'Checking now' : 'Not checked yet') : s.count + (s.count === 1 ? ' item' : ' items'))})), {esc});
  const counts = Object.fromEntries(sources.map(s => [s.id, list.filter(i => i.source === s.id).length]));
  if (ui.source !== 'all' && !sources.some(s => s.id === ui.source)) ui.source = 'all';
  const chips = '<div class="dt-tabs" role="group" aria-label="Source">' + [{id: 'all', label: 'All'}, ...sources].map(s => '<button type="button" data-action="mk-research-source" data-id="' + esc(s.id) + '" aria-pressed="' + (ui.source === s.id) + '">' + esc(s.label) + '<b>' + (s.id === 'all' ? list.length : counts[s.id] || 0) + '</b></button>').join('') + '</div>';
  const shown = ui.source === 'all' ? list : list.filter(s => s.source === ui.source);
  const rows = shown.length ? '<div class="list" id="rs-signal-list">' + shown.slice(0, 80).map(s => signalRow(s, esc)).join('') + '</div>'
    : list.length ? '<p class="dt-empty">No signals from this source in the last 7 days.</p>'
    : stateView({kind: d.refreshing ? 'loading' : 'empty', title: d.refreshing ? 'Reading the sources…' : 'No signals yet', body: d.refreshing ? 'GitHub, Hacker News, Hugging Face and OpenAI news are being checked. This takes a few seconds.' : 'Click Refresh to check the sources now, or add a topic below. Sources are checked once an hour while the app is open.', actions: d.refreshing ? [] : [{label: 'Refresh now', action: 'mk-research-refresh'}]});
  const settings = panel('Topics and feeds', '<p class="dt-muted" style="margin:0 0 10px;font-size:12px">GitHub and Hacker News are searched for these topics. Hugging Face shows the models trending right now; feeds show their newest posts.</p>'
    + '<div class="rs-chips">' + topics.map(t => '<span class="rs-chip">' + esc(t) + '<button type="button" data-action="mk-research-topic-remove" data-id="' + esc(t) + '" aria-label="' + esc('Remove topic ' + t) + '">×</button></span>').join('') + '</div>'
    + '<div class="rs-inline"><label>Add a topic<input id="rs-topic" maxlength="60" autocomplete="off" placeholder="For example: AI automation"></label><button type="button" data-action="mk-research-topic-add">Add topic</button></div>'
    + (feeds.length ? '<div class="list">' + feeds.map(f => '<article class="row"><div><strong>' + esc(sources.find(s => s.url === f)?.label || f) + '</strong><small>' + esc(f) + '</small></div><button type="button" data-action="mk-research-feed-remove" data-id="' + esc(f) + '">Remove</button></article>').join('') + '</div>' : '')
    + '<div class="rs-inline"><label>Add an RSS or Atom feed<input id="rs-feed" type="url" autocomplete="off" placeholder="https://example.com/feed.xml"></label><button type="button" data-action="mk-research-feed-add">Add feed</button></div>'
    + '<p class="rs-msg" id="rs-settings-msg" role="status"></p>', {esc, meta: topics.length + ' topics · ' + feeds.length + ' feeds'});
  return tiles + angles(d.angles, esc, list.length)
    + panel('Latest signals', chips + rows, {esc, meta: 'score = recency × popularity'})
    + panel('Sources', health + '<div class="actions"><button type="button" data-action="mk-research-refresh"' + (d.refreshing ? ' disabled' : '') + '>' + (d.refreshing ? 'Checking…' : 'Refresh now') + '</button></div>', {esc, meta: 'free, no account needed'})
    + settings;
}
function signalRow(s, esc) {
  const url = safeURL(s.url), meta = [s.sourceLabel, s.popularityLabel, relativeTime(s.publishedAt || s.firstSeen), s.also?.length ? 'also on ' + s.also.join(', ') : ''].filter(Boolean).join(' · ');
  return '<article class="row rs-signal" data-signal="' + esc(s.id) + '"><span class="rs-score" title="Score: recency × popularity">' + esc(s.score) + '</span><div class="rs-main">'
    + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a>' : '<strong>' + esc(s.title) + '</strong>')
    + '<small>' + esc(meta) + '</small>' + (s.summary ? '<p>' + esc(s.summary) + '</p>' : '') + '</div>'
    + (s.ideaId ? '<span class="pill connected">Idea added</span>' : '<button type="button" data-action="mk-research-idea" data-id="' + esc(s.id) + '">Idea</button>') + '</article>';
}
function angles(a, esc, count) {
  const ask = (label, primary) => '<button type="button"' + (primary ? ' class="primary"' : '') + ' data-action="mk-research-angles"' + (count < 3 ? ' disabled' : '') + '>' + esc(label) + '</button>';
  const intro = '<p class="dt-muted" style="margin:0;font-size:12px">Your Researcher reads the top 12 signals and suggests 5 angles for posts. It runs on your own AI tool and shows in Agent work. Nothing is added until you click “Add as idea”.</p>';
  if (!a) return panel('Content angles', intro + '<div class="actions">' + ask('Ask my researcher for angles', true) + '</div>', {esc});
  if (a.status === 'running') return panel('Content angles', '<p class="notice" role="status">Your Researcher is reading the top signals… This usually takes under a minute.</p>', {esc, meta: 'working'});
  if (a.status === 'failed') return panel('Content angles', '<p class="notice" role="alert">' + esc(a.error || 'Your Researcher did not finish.') + '</p><div class="actions">' + ask('Try again', true) + '</div>', {esc});
  const list = (a.angles || []).map(x => '<article class="row rs-angle"><div><strong>' + esc(x.title) + '</strong><blockquote>“' + esc(x.hook) + '”</blockquote><small>' + esc(x.angle || '')
    + (x.signalTitle ? (x.angle ? ' · ' : '') + 'Based on: ' : '') + '</small>' + (x.signalTitle ? '<small>' + (safeURL(x.url) ? '<a href="' + esc(safeURL(x.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(x.signalTitle) + '</a>' : esc(x.signalTitle)) + '</small>' : '') + '</div>'
    + (x.ideaId ? '<span class="pill connected">Idea added</span>' : '<button type="button" class="primary" data-action="mk-research-angle-idea" data-id="' + esc(x.id) + '">Add as idea</button>') + '</article>').join('');
  return panel('Content angles', (list ? '<div class="list">' + list + '</div>' : '<p class="dt-empty">No angles came back.</p>') + '<div class="actions">' + ask('Ask again', false) + '</div>', {esc, meta: 'suggested ' + relativeTime(a.finishedAt || a.at)});
}

// MARK: Competitors
async function competitorsPage({api, esc, number, filters}) {
  filters('');
  const d = ui.competitors = await api('marketing/competitors');
  const roster = d.roster || [], posts = d.posts || [], rising = d.rising || [], ledger = d.ledger || {}, c = d.collection || {}, running = c.status === 'running';
  const tiles = tileRow([
    {label: 'Watched accounts', value: roster.length + ' of ' + (d.maxAccounts || 25), caption: [...new Set(roster.map(r => PLATFORM[r.platform]))].join(', ') || 'Add accounts below'},
    {label: 'Posts collected', value: posts.length, caption: 'The latest ' + (d.perAccount || 6) + ' per account, each collection'},
    {label: 'Apify this month', value: usd(ledger.monthUsd), caption: 'Your monthly limit: ' + usd(ledger.capUsd)},
    {label: 'Last collection', value: c.startedAt ? relativeTime(c.startedAt) : '—', caption: running ? 'Collecting now…' : c.status === 'failed' ? 'Did not finish' : c.status === 'done' ? 'Cost ' + usd(c.usd) : 'Not collected yet'},
  ], {esc, number});
  const setup = d.connected ? '' : stateView({kind: 'setup', title: 'Connect Apify to collect posts', body: 'Competitor posts are collected with your own Apify account. Add your Apify key in Setup → Research, then add the accounts you want to watch below. Nothing is collected until you see the maximum cost and confirm it.', actions: [{label: 'Open Setup → Research', href: '/setup#research', primary: true, external: false}]});
  const auto = d.auto || {};
  const runRows = running ? '<div class="list">' + (c.runs || []).map(r => '<article class="row"><div><strong>' + esc(r.label) + '</strong><small>' + esc(r.title || r.actor) + ' · at most ' + usd(r.maxUsd) + '</small></div><span class="pill ' + (r.status === 'done' ? 'connected' : r.status === 'failed' ? 'stale' : 'running') + '">' + esc(r.status === 'done' ? (r.items || 0) + ' posts' : r.status) + '</span></article>').join('') + '</div>' : '';
  const result = !running && c.status === 'failed' ? '<p class="notice" role="alert">' + esc(c.error || 'The last collection did not finish.') + '</p>'
    : !running && c.status === 'done' ? '<p class="dt-muted" style="font-size:12px">Last collection ' + esc(relativeTime(c.finishedAt || c.startedAt)) + ': ' + esc((c.runs || []).map(r => r.label + ' ' + (r.status === 'done' ? (r.items || 0) + ' posts' : 'failed')).join(' · ')) + ' · cost ' + esc(usd(c.usd)) + '.</p>' : '';
  const canCollect = d.connected && roster.length && !running;
  const collect = panel('Collection', (d.health?.length ? statusRows(d.health.map(h => ({label: h.label, state: h.state, at: h.at, reason: h.error || (h.state === 'pending' ? 'Not collected yet' : h.count + ' posts in the last run')})), {esc}) : '')
    + runRows + result
    + '<div class="actions"><button type="button" class="primary" data-action="mk-research-quote"' + (canCollect ? '' : ' disabled') + '>' + (running ? 'Collecting…' : 'Check cost and collect') + '</button>'
    + (auto.enabled ? '<button type="button" data-action="mk-research-auto-off">Switch off weekly collection</button>' : '<button type="button" data-action="mk-research-auto-quote"' + (canCollect ? '' : ' disabled') + '>Collect every week…</button>') + '</div>'
    + '<p class="dt-muted" style="font-size:12px;margin:0">' + esc(auto.enabled ? 'Weekly collection is on: at most ' + usd(auto.maxUsd) + ' each week, within your monthly limit.' + (auto.lastResult ? ' Last: ' + auto.lastResult : '') : 'Nothing is collected until you check the cost and confirm it. Every run has a hard cost limit.') + '</p>', {esc, meta: 'with your own Apify key'});
  const wallItems = (d.posts || []).map(p => ({id: p.id, platform: p.platform, url: p.url, text: p.caption, creator: '@' + p.account, kind: p.kind, metrics: {views: p.views, likes: p.likes, comments: p.comments},
    changes: {}, publishedAt: p.publishedAt, observedAt: p.observedAt, thumbUrl: p.thumb}));
  const link = (url, label) => safeURL(url) ? '<a href="' + esc(safeURL(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ↗</a>' : '';
  const wall = own(videoWall({id: WALL, esc, items: wallItems, emptyText: roster.length ? 'No posts yet. Check the cost and collect to fill this wall.' : 'Add the accounts you want to watch, then collect.',
    detail: item => ({title: item.creator + ' · ' + (PLATFORM[item.platform] || ''), html: playerHTML(item, {esc, link, actions: ideaButton(posts.find(p => p.id === item.id), esc)})})}));
  const rhythm = (d.charts?.rhythm || []).map(r => columns(perDay(r.dates.map(t => ({publishedAt: t}))), {esc, label: r.label})).join('');
  const byCreator = (d.charts?.viewsByCreator || []).filter(v => v.value > 0);
  const charts = chartBand({title: 'Views by creator', meta: 'latest collected posts', body: byCreator.length ? barList(byCreator.map(v => ({label: v.label, value: v.value, note: v.posts + ' posts'})), {esc, label: 'Views by creator, latest collected posts'}) : '', empty: 'No posts collected in the last 14 days.'},
    {title: 'Posting rhythm', meta: 'posts per day, last 14 days', body: rhythm ? '<div class="viz-multiples">' + rhythm + '</div>' : '', empty: 'No posts yet.'}, {esc});
  const working = rising.length ? '<div class="rs-rising">' + rising.slice(0, 8).map(p => risingCard(p, esc)).join('') + '</div>' : '<p class="dt-empty">After a collection, the posts gaining views fastest show here.</p>';
  return tiles + setup + collect
    + panel('What is working', working, {esc, meta: 'views per hour since the last check'})
    + panel('Latest videos', wall, {esc, meta: posts.length + ' posts', cls: 'wall-card'})
    + charts + rosterPanel(roster, esc, d) + postsTable(posts, esc)
    + panel('Apify spend', ledgerTable(ledger, esc), {esc, meta: usd(ledger.monthUsd) + ' of ' + usd(ledger.capUsd) + ' this month'});
}
const ideaButton = (p, esc) => !p ? '' : p.ideaId ? '<span class="pill connected">Idea added</span>' : '<button type="button" class="primary" data-action="mk-research-post-idea" data-id="' + esc(p.id) + '">Turn into an idea</button>';
function risingCard(p, esc) {
  const growth = p.growth >= 1 ? '+' + compact(Math.round(p.growth)) + ' ' + (p.growthUnit || 'views') + '/hour' : 'no new views since the last check';
  return '<article class="rs-card"><button type="button" class="rs-thumb" data-action="mk-research-play" data-id="' + esc(p.id) + '" aria-label="' + esc('Play the post by @' + p.account) + '"' + (p.thumb ? ' style="background-image:url(\'' + esc(p.thumb) + '\')"' : '') + '></button>'
    + '<div class="rs-body"><strong>@' + esc(p.account) + ' <span class="dt-muted" style="font-weight:400">· ' + esc(PLATFORM[p.platform] || p.platform) + '</span></strong><span>' + esc(firstLine(p.caption).slice(0, 140) || 'No caption') + '</span>'
    + '<small><b class="rs-up">' + esc(growth) + '</b>' + (p.vsMedian ? ' · ' + esc(p.vsMedian) + '× their usual' : '') + ' · ' + esc(compact(p.views ?? p.likes)) + ' ' + (p.views != null ? 'views' : 'likes') + '</small>'
    + '<div class="actions" style="margin:2px 0 0">' + ideaButton(p, esc) + '</div></div></article>';
}
function rosterPanel(roster, esc, d) {
  const list = roster.length ? '<div class="list">' + roster.map(r => '<article class="row"><div><strong>@' + esc(r.handle) + (r.label ? ' · ' + esc(r.label) : '') + '</strong><small>' + esc(PLATFORM[r.platform] + ' · ' + r.posts + ' posts' + (r.lastPostAt ? ' · last post ' + relativeTime(r.lastPostAt) : '')) + '</small></div>'
    + '<div class="actions" style="margin:0">' + (safeURL(r.url) ? '<a class="ui-btn" href="' + esc(safeURL(r.url)) + '" target="_blank" rel="noopener noreferrer">Profile ↗</a>' : '') + '<button type="button" data-action="mk-research-roster-remove" data-id="' + esc(r.id) + '">Remove</button></div></article>').join('') + '</div>'
    : '<p class="notice">Add the accounts you want to watch: their platform and handle. Adding an account costs nothing; posts are only collected when you click “Check cost and collect” and confirm.</p>';
  const full = roster.length >= (d.maxAccounts || 25);
  return panel('Accounts you watch', list + '<div class="rs-inline"><label>Platform<select id="rs-platform"><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option></select></label>'
    + '<label>Handle or profile address<input id="rs-handle" autocomplete="off" spellcheck="false" placeholder="@account"></label><label>Label (optional)<input id="rs-label" autocomplete="off" maxlength="60" placeholder="For example: main competitor"></label>'
    + '<button type="button" data-action="mk-research-roster-add"' + (full ? ' disabled' : '') + '>Add account</button></div><p class="rs-msg" id="rs-roster-msg" role="status">' + (full ? 'You watch the maximum of ' + (d.maxAccounts || 25) + ' accounts.' : '') + '</p>', {esc, meta: roster.length + ' of ' + (d.maxAccounts || 25)});
}
function postsTable(posts, esc) {
  if (!posts.length) return '';
  const num = (k, label) => ({key: k, label, value: p => p[k] ?? null, cell: p => '<span class="dt-num">' + esc(compact(p[k])) + '</span>'});
  return panel('All collected posts', dataTable({id: 'research-posts', esc, rows: posts, pageSize: 15, defaultSort: {key: 'growth', dir: 'desc'}, emptyText: 'No posts in this view.',
    tabs: [...new Set(posts.map(p => p.platform))].map(p => ({id: p, label: PLATFORM[p] || p, filter: r => r.platform === p})),
    columns: [
      {key: 'post', label: 'Post', value: p => p.account, className: 'dt-primary', cell: p => '<strong>@' + esc(p.account) + '</strong><small>' + (safeURL(p.url) ? '<a href="' + esc(safeURL(p.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(firstLine(p.caption).slice(0, 90) || 'Open post') + '</a>' : esc(firstLine(p.caption).slice(0, 90))) + '</small>'},
      {key: 'published', label: 'Published', value: p => Date.parse(p.publishedAt) || 0, cell: p => '<span class="dt-muted">' + esc(relativeTime(p.publishedAt) || '—') + '</span>'},
      num('views', 'Views'), num('likes', 'Likes'), num('comments', 'Comments'),
      {key: 'growth', label: 'Per hour', value: p => p.growth || 0, cell: p => '<span class="dt-num" title="' + esc((p.growthUnit || 'views') + ' per hour') + '">' + esc(p.growth >= 1 ? '+' + compact(Math.round(p.growth)) : '—') + '</span>'},
      {key: 'idea', label: '', className: 'dt-action', cell: p => p.ideaId ? '<span class="dt-muted">Idea added</span>' : '<button type="button" class="dt-action" data-action="mk-research-post-idea" data-id="' + esc(p.id) + '">Idea</button>'},
    ]}), {esc, meta: posts.length + ' posts'});
}
function ledgerTable(ledger, esc) {
  const runs = ledger.runs || [];
  if (!runs.length) return '<p class="dt-empty">No Apify runs yet. Each run shows here with its cost limit and what it cost.</p>';
  return '<div class="list">' + runs.slice(0, 12).map(r => '<article class="row"><div><strong>' + esc(r.purpose || r.actor) + '</strong><small>' + esc(relativeTime(r.at) + ' · limit ' + usd(r.maxUsd) + ' · ' + String(r.status || '').toLowerCase()) + '</small></div><span class="pill">' + esc(usd(r.usd)) + '</span></article>').join('') + '</div>';
}

// The cost check before any paid run: what each platform costs at most, the total, and the monthly limit. The
// confirm button carries that total; the engine refuses a run without it.
function quoteHTML(q, esc, mode) {
  const rows = (q.platforms || []).map(p => '<article class="row"><div><strong>' + esc(p.platformLabel) + ' · ' + p.accounts + (p.accounts === 1 ? ' account' : ' accounts') + '</strong><small>'
    + esc(p.cappable ? 'Up to ' + p.items + ' posts · ' + (p.title || p.actor) : p.reason) + '</small>' + (p.skipped?.length ? '<small>Not used: ' + esc(p.skipped.join(' ')) + '</small>' : '') + '</div>'
    + '<span class="pill' + (p.cappable ? '' : ' stale') + '">' + (p.cappable ? 'at most ' + usd(p.maxUsd) : 'skipped') + '</span></article>').join('');
  const after = (Number(q.monthUsd) || 0) + (Number(q.maxUsd) || 0);
  const blocked = !q.fitsCap || !q.ready;
  const label = mode === 'auto' ? 'Switch on weekly collection (at most ' + usd(q.maxUsd) + ' a week)' : 'Collect now (at most ' + usd(q.maxUsd) + ')';
  return '<div class="rs-quote"><p>' + esc(mode === 'auto' ? 'Every week the app collects the latest ' + q.perAccount + ' posts of each account you watch. Each weekly run stays within this maximum and your monthly limit; if the price rises above it, that week is skipped.' : 'Apify collects the latest ' + q.perAccount + ' posts of each account you watch. You pay Apify from your own account. Each run has a hard cost limit, so it can never cost more than shown.') + '</p>'
    + '<div class="list">' + rows + '</div>'
    + '<dl><dt>At most' + (mode === 'auto' ? ' per week' : ' for this collection') + '</dt><dd data-quote-total>' + usd(q.maxUsd) + '</dd><dt>Used this month</dt><dd>' + usd(q.monthUsd) + '</dd><dt>Your monthly limit</dt><dd>' + usd(q.capUsd) + '</dd><dt>At most after this collection</dt><dd>' + usd(after) + '</dd></dl>'
    + (!q.ready ? '<p class="notice" role="alert">None of your platforms can be collected with a capped cost right now.</p>' : !q.fitsCap ? '<p class="notice" role="alert">This would go over your monthly limit of ' + esc(usd(q.capUsd)) + '. Raise it in Setup → Research, or watch fewer accounts.</p>' : '')
    + '<div class="actions"><button type="button" class="primary" data-action="' + (mode === 'auto' ? 'mk-research-auto-on' : 'mk-research-collect') + '" data-id="' + esc(q.maxUsd) + '"' + (blocked ? ' disabled' : '') + '>' + esc(label) + '</button><button type="button" data-action="mk-research-close">Cancel</button>'
    + (!q.fitsCap ? '<a class="ui-btn" href="/setup#research">Raise the limit in Setup</a>' : '') + '</div><p class="rs-msg" id="rs-quote-msg" role="status"></p></div>';
}

// MARK: actions
export async function act(action, id, ctx, el) {
  const {api, esc, preview, root, refresh} = ctx;
  const $ = s => root.querySelector(s);
  const say = (sel, text, tone = '') => { const m = $(sel); if (m) { m.textContent = text; m.dataset.tone = tone } };
  const busy = async (fn, sel) => { if (el) el.disabled = true; try { await fn() } catch (e) { if (el) el.disabled = false; if (sel && $(sel)) say(sel, e.message, 'err'); else throw e } };
  const settings = ui.signals?.settings || {topics: [], feeds: []};
  const saveSettings = body => busy(async () => { await api('marketing/signals/settings', body); refresh() }, '#rs-settings-msg');
  switch (action) {
    // Signals
    case 'mk-research-source': ui.source = id || 'all'; return refresh();
    case 'mk-research-refresh': return busy(async () => { el && (el.textContent = 'Checking…'); await api('marketing/signals/refresh', {}); refresh() });
    case 'mk-research-idea': return busy(async () => { await api('marketing/signals/' + encodeURIComponent(id) + '/idea', {}); el?.replaceWith(Object.assign(document.createElement('span'), {className: 'pill connected', textContent: 'Idea added'})) });
    case 'mk-research-angles': return busy(async () => { await api('marketing/signals/ideas', {}); refresh() });
    case 'mk-research-angle-idea': return busy(async () => { await api('marketing/signals/angles/' + encodeURIComponent(id) + '/idea', {}); el?.replaceWith(Object.assign(document.createElement('span'), {className: 'pill connected', textContent: 'Idea added'})) });
    case 'mk-research-topic-add': { const t = $('#rs-topic')?.value.trim(); if (!t) return say('#rs-settings-msg', 'Type a topic first.', 'err'); return saveSettings({topics: [...settings.topics, t]}) }
    case 'mk-research-topic-remove': {
      const topics = settings.topics.filter(t => t !== id);
      if (!topics.length) return say('#rs-settings-msg', 'Keep at least one topic. Add the new one first, then remove this one.', 'err');
      return saveSettings({topics});
    }
    case 'mk-research-feed-add': { const f = $('#rs-feed')?.value.trim(); if (!f) return say('#rs-settings-msg', 'Paste the address of an RSS or Atom feed first.', 'err'); return saveSettings({feeds: [...settings.feeds, f]}) }
    case 'mk-research-feed-remove': return saveSettings({feeds: settings.feeds.filter(f => f !== id)});
    // Competitors
    case 'mk-research-roster-add': {
      const handle = $('#rs-handle')?.value.trim();
      if (!handle) return say('#rs-roster-msg', 'Type the account’s handle or paste its profile address.', 'err');
      return busy(async () => { await api('marketing/competitors/roster', {add: {platform: $('#rs-platform').value, handle, label: $('#rs-label')?.value.trim() || ''}}); refresh() }, '#rs-roster-msg');
    }
    case 'mk-research-roster-remove':
      if (!confirm('Stop watching this account? Its collected posts are removed too.')) return;
      return busy(async () => { await api('marketing/competitors/roster', {remove: id}); refresh() });
    case 'mk-research-quote': case 'mk-research-auto-quote': {
      const mode = action === 'mk-research-auto-quote' ? 'auto' : 'collect';
      preview(mode === 'auto' ? 'Collect every week' : 'Collect competitor posts', '<p class="notice" role="status">Checking the price with Apify… Nothing is collected yet.</p>');
      try { const q = await api('marketing/competitors/quote', {}); if ($('#preview')?.open) $('#preview-body').innerHTML = quoteHTML(q, esc, mode) }
      catch (e) { $('#preview-body').innerHTML = '<p class="notice" role="alert">' + esc(e.message) + '</p>' }
      return;
    }
    case 'mk-research-collect': case 'mk-research-auto-on': {
      const maxUsd = Number(id);
      return busy(async () => {
        say('#rs-quote-msg', action === 'mk-research-collect' ? 'Starting the collection…' : 'Saving…');
        await api(action === 'mk-research-collect' ? 'marketing/competitors/collect' : 'marketing/competitors/auto', action === 'mk-research-collect' ? {confirm: true, maxUsd} : {enabled: true, confirm: true, maxUsd});
        $('#preview')?.close(); refresh();
      }, '#rs-quote-msg');
    }
    case 'mk-research-auto-off': return busy(async () => { await api('marketing/competitors/auto', {enabled: false}); refresh() });
    case 'mk-research-close': return $('#preview')?.close();
    case 'mk-research-post-idea': return busy(async () => {
      await api('marketing/competitors/' + encodeURIComponent(id) + '/idea', {});
      const p = ui.competitors?.posts?.find(x => x.id === id); if (p) p.ideaId = 'added';
      root.querySelectorAll('[data-action="mk-research-post-idea"]').forEach(b => { if (b.dataset.id === id) b.replaceWith(Object.assign(document.createElement('span'), {className: 'pill connected', textContent: 'Idea added'})) });
    });
    // The video wall: platform chips, sorting and "Show more" redraw the wall; a tile opens the official player.
    case 'mk-research-wallnav': {
      const wid = id.slice(0, id.indexOf('|')), wall = el?.closest('.vw'), html = wallAction(id);
      if (wall && html) { wall.outerHTML = own(html); root.querySelector('.vw[data-wall="' + CSS.escape(wid) + '"] [data-action="mk-research-wallnav"][data-id="' + CSS.escape(id) + '"]')?.focus() }
      return;
    }
    case 'mk-research-wallplay': {
      const at = id.indexOf('|'), wid = id.slice(0, at), itemId = id.slice(at + 1), d = wallDetail(wid, itemId);
      if (d) return preview(d.title, d.html);
      const item = wallItem(wid, itemId); if (!item) return;
      return preview(item.creator || 'Video', playerHTML(item, {esc, link: (url, label) => safeURL(url) ? '<a href="' + esc(safeURL(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ↗</a>' : ''}));
    }
    case 'mk-research-play': {
      const p = ui.competitors?.posts?.find(x => x.id === id) || ui.competitors?.rising?.find(x => x.id === id); if (!p) return;
      const item = {id: p.id, platform: p.platform, url: p.url, text: p.caption, creator: '@' + p.account, kind: p.kind, metrics: {views: p.views, likes: p.likes, comments: p.comments}, changes: {}, publishedAt: p.publishedAt, observedAt: p.observedAt};
      const link = (url, label) => safeURL(url) ? '<a href="' + esc(safeURL(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ↗</a>' : '';
      return preview('@' + p.account + ' · ' + (PLATFORM[p.platform] || ''), playerHTML(item, {esc, link, actions: ideaButton(p, esc)}));
    }
    default: throw new Error('This action is not available.');
  }
}
