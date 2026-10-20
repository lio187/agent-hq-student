// Social (student edition): the student's own accounts and posts through Zernio, with results when Zernio's
// Analytics add-on is active.
import {tileRow, panel, chartBand} from './page-kit.mjs';
import {barList, columns, perDay} from './viz.mjs';
import {dataTable} from './data-table.mjs';
import {stateView} from './ui.mjs';

const PLATFORM = {instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', twitter: 'X', facebook: 'Facebook', threads: 'Threads', pinterest: 'Pinterest', bluesky: 'Bluesky'};
const platformName = p => PLATFORM[p] || (p ? p[0].toUpperCase() + p.slice(1) : 'Social');
const safeURL = v => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : '' } catch { return '' } };

export async function socialPage({api, esc, number, days}) {
  const d = await api('social?days=' + days);
  if (!d.connected) return stateView({kind: 'setup', title: 'Connect your social accounts', body: 'Add your Zernio key and connect Instagram, TikTok, YouTube, LinkedIn and more in Setup. Your posts and their results appear here.', actions: [{label: 'Open Setup', href: '/setup#social', primary: true, external: false}]});
  const accounts = d.accounts || [], posts = d.posts || [], m = p => p.metrics || {};
  const sum = k => posts.reduce((s, p) => s + (Number(m(p)[k]) || 0), 0);
  const followers = accounts.reduce((s, a) => s + (Number(a.followers) || 0), 0);
  const byAccount = new Map(accounts.map(a => [a.id, a]));
  const tiles = tileRow([
    {label: 'Accounts', value: accounts.length, caption: accounts.filter(a => a.needsReconnect).length ? accounts.filter(a => a.needsReconnect).length + ' need a reconnect' : 'Connected through Zernio'},
    {label: 'Followers', value: followers || null, caption: followers ? 'Across all accounts' : 'Not reported'},
    {label: 'Posts', value: posts.length, caption: 'Last ' + days + ' days'},
    {label: d.analytics ? 'Views' : 'Likes', value: d.analytics ? sum('views') : null, caption: d.analytics ? number(sum('likes')) + ' likes · ' + number(sum('comments')) + ' comments' : 'Needs the Analytics add-on'},
  ], {esc, number});
  const rhythm = columns(perDay(posts, {days: Math.min(days, 30), at: p => p.publishedAt}), {esc, label: 'Posts per day'});
  const reach = barList(accounts.map(a => ({label: (a.handle || a.name || platformName(a.platform)) + ' · ' + platformName(a.platform), value: d.analytics ? posts.filter(p => p.accountId === a.id).reduce((s, p) => s + (Number(m(p).views) || 0), 0) : Number(a.followers) || 0})), {esc, label: d.analytics ? 'Views per account' : 'Followers per account'});
  const band = chartBand({title: 'Posting rhythm', meta: 'posts per day', body: rhythm, empty: 'No posts in this period.'}, {title: d.analytics ? 'Views per account' : 'Followers per account', body: reach, empty: 'Not enough data yet.'}, {esc});
  const accountRows = accounts.map(a => '<article class="row"><div style="display:flex;gap:12px;align-items:center">' + (safeURL(a.avatar) ? '<img src="' + esc(safeURL(a.avatar)) + '" alt="" width="36" height="36" style="border-radius:50%;object-fit:cover">' : '') + '<div><strong>' + esc(a.handle || a.name || a.id) + '</strong><small>' + esc(platformName(a.platform) + (a.followers != null ? ' · ' + number(a.followers) + ' followers' : '')) + '</small></div></div><span class="pill ' + (a.needsReconnect ? 'stale' : 'connected') + '">' + (a.needsReconnect ? 'Reconnect' : 'Connected') + '</span></article>').join('');
  const table = dataTable({id: 'social-posts', esc, rows: posts, pageSize: 20, defaultSort: {key: 'published', dir: 'desc'}, emptyText: 'No posts in this period.',
    tabs: [...new Set(posts.map(p => p.platform))].filter(Boolean).map(p => ({id: p, label: platformName(p), filter: x => x.platform === p})),
    columns: [
      {key: 'post', label: 'Post', value: p => p.text, className: 'dt-primary', cell: p => '<strong>' + esc(String(p.text || 'Untitled post').split('\n')[0].slice(0, 90)) + '</strong><small>' + esc((byAccount.get(p.accountId)?.handle || '') + ' · ' + platformName(p.platform)) + '</small>'},
      {key: 'published', label: 'Published', value: p => Date.parse(p.publishedAt) || 0, cell: p => '<span class="dt-muted">' + esc(p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) : '—') + '</span>'},
      ...(d.analytics ? [['views', 'Views'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares']].map(([k, l]) => ({key: k, label: l, value: p => Number(m(p)[k]) || 0, cell: p => esc(number(Number(m(p)[k]) || 0))})) : []),
      {key: 'open', label: '', className: 'dt-action', cell: p => safeURL(p.url) ? '<a class="ui-btn" href="' + esc(safeURL(p.url)) + '" target="_blank" rel="noopener noreferrer">Open ↗</a>' : ''},
    ]});
  return (d.note ? '<p class="notice">' + esc(d.note) + '</p>' : '') + tiles + band
    + panel('Accounts', (accountRows ? '<div class="list">' + accountRows + '</div>' : '<p class="dt-empty">No accounts connected yet.</p>') + '<div class="actions"><a class="ui-btn" href="/setup#social">Connect another account</a></div>', {esc, meta: accounts.length + ' connected'})
    + panel('Posts', table, {esc, meta: posts.length + ' in the last ' + days + ' days'});
}
