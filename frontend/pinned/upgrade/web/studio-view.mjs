// Studio (9 Oct 2026): the Creative Director's home. One screen answers "what needs me, where is content stuck,
// what is working" and opens the exact view to act in. It reads the same Team Hub content, competitor collection
// and social sync as the other Marketing pages; it never publishes, posts or spends anything itself.
import {PIPELINE} from './marketing-visuals.mjs';

const DAY = 86400000;
const at = v => { const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v || ''); return Number.isFinite(t) ? t : null };
const compact = n => Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const plural = (n, one, many = one + 's') => n + ' ' + (n === 1 ? one : many);

// Stage → where the work on it happens (the view a click opens).
const STAGE_VIEW = { Idea: 'content', Scripted: 'record', 'To Edit': 'team', Editing: 'team', 'To Review': 'reviews', 'Ready To Post': 'team', Posted: 'social' };

// Items per stage with the oldest wait, so a bottleneck shows as an age, not just a count.
export function stageLoad(items, { now = Date.now() } = {}) {
  const active = (items || []).filter(i => i && i.status !== 'Archived');
  return PIPELINE.map(stage => {
    const here = active.filter(i => i.status === stage), oldest = Math.min(...here.map(i => at(i.updatedAt) ?? now));
    return { stage, count: here.length, oldestDays: here.length ? Math.max(0, Math.floor((now - oldest) / DAY)) : null, view: STAGE_VIEW[stage] };
  });
}

// The next moves, most urgent first; only rows that have something to do.
export function nextMoves({ items = [], jobs = [], researchCount = 0 }, { now = Date.now() } = {}) {
  const load = Object.fromEntries(stageLoad(items, { now }).map(s => [s.stage, s]));
  const results = jobs.filter(j => j.status === 'review').length, failed = jobs.filter(j => j.status === 'failed').length;
  const moves = [];
  if (load['To Review'].count) moves.push({ tone: 'attention', count: load['To Review'].count, text: plural(load['To Review'].count, 'piece') + ' waiting for your decision' + (load['To Review'].oldestDays ? ' · oldest ' + plural(load['To Review'].oldestDays, 'day') : ''), action: 'Review now', view: 'reviews' });
  if (results) moves.push({ tone: 'attention', count: results, text: plural(results, 'production result') + ' to check', action: 'Check results', view: 'production' });
  if (failed) moves.push({ tone: 'error', count: failed, text: plural(failed, 'production job') + ' failed', action: 'See why', view: 'production' });
  if (load.Scripted.count) moves.push({ tone: 'calm', count: load.Scripted.count, text: plural(load.Scripted.count, 'finished script') + ' ready to record', action: 'Record', view: 'record' });
  if (load['Ready To Post'].count) moves.push({ tone: 'calm', count: load['Ready To Post'].count, text: plural(load['Ready To Post'].count, 'piece') + ' reviewed and ready to post', action: 'Open board', view: 'team' });
  const ideas = load.Idea.count;
  if (ideas < 5) moves.push({ tone: 'calm', count: ideas, text: (ideas ? 'Only ' + plural(ideas, 'idea') : 'No ideas') + ' in the pipeline' + (researchCount ? ' · ' + researchCount + ' research signals to use' : ''), action: 'Find angles', view: 'research' });
  return moves;
}

// The workflow in five steps, open until the reader closes it (the choice is remembered in this browser).
export const STUDIO_GUIDE = [
  ['Start with your next moves', 'Everything waiting on you, most urgent first. Each button opens the exact view to act in.'],
  ['Find an angle', 'Open a post under What is working or in Ideas & research and press Turn into an idea. The form is filled in; choose the account and press Create idea.'],
  ['Make it', 'Make a carousel or Make stories opens a production job with that format chosen. Nothing starts until you press Start. Finished scripts wait in Production › Recording.'],
  ['Decide', 'Production › Review: approve a piece, reject it or ask for a new hook, with your feedback. Approved pieces wait on the Board as ready to post; HQ never posts, publishing stays in Team Hub.'],
  ['Learn', 'Publish & results › Performance shows views, reach and your best posts. Rising competitor posts on this page feed the next idea.'],
];
export function studioGuide(open, { esc }) {
  return '<details class="studio-guide"' + (open ? ' open' : '') + '><summary>How Studio works · ' + STUDIO_GUIDE.length + ' steps</summary><ol>' + STUDIO_GUIDE.map(([title, text], i) => '<li><b>' + (i + 1) + '</b><div><strong>' + esc(title) + '</strong><p>' + esc(text) + '</p></div></li>').join('') + '</ol></details>';
}

export function studioPage({ content, competitors, competitorItems = [], social, selection, guideOpen = true, now = Date.now() }, { esc, kit, m, videoWall }) {
  const items = content?.items || [], jobs = content?.jobs || [], load = stageLoad(items, { now });
  const n = stage => load.find(s => s.stage === stage)?.count || 0;
  const posts = social && !social.error ? m.socialWallItems(social, selection, { now }) : [];
  const recent = posts.filter(p => (at(p.publishedAt) ?? 0) > now - 30 * DAY), synced = at(social?.sync?.lastSuccessAt);
  const research = Array.isArray(content?.research?.posts) ? content.research.posts : [];

  const actions = '<div class="studio-actions">'
    + '<button type="button" class="primary" data-action="new-content">New idea</button>'
    + '<button type="button" data-action="studio-make" data-id="lane.carousel">Make a carousel</button>'
    + '<button type="button" data-action="studio-make" data-id="lane.stories">Make stories</button>'
    + '<button type="button" data-section="production">All production jobs</button>'
    + '<button type="button" data-section="creatorlab">Analyse a creator</button>'
    + '<button type="button" data-section="research">Research signals</button></div>';

  const tiles = kit.tileRow([
    { label: 'Ideas', value: n('Idea'), caption: 'Not scripted yet', action: { action: 'section', id: 'content' } },
    { label: 'Ready to record', value: n('Scripted'), caption: 'Finished scripts', action: { action: 'section', id: 'record' } },
    { label: 'In the edit', value: n('To Edit') + n('Editing'), caption: 'To edit or being edited', action: { action: 'section', id: 'team' } },
    { label: 'Your review', value: n('To Review') + jobs.filter(j => j.status === 'review').length, caption: 'Pieces and production results', action: { action: 'section', id: 'reviews' } },
    { label: 'Ready to post', value: n('Ready To Post'), caption: 'Reviewed, not posted yet', action: { action: 'section', id: 'team' } },
    { label: 'Posted · 30 days', value: social && !social.error ? recent.length : null, caption: social && !social.error ? (synced && synced < now - 2 * DAY ? 'Last social sync ' + kit.dayLabel(synced) : 'Measured posts on your accounts') : 'Social sync unavailable', action: { action: 'section', id: 'social' } },
  ], { esc, number: String });

  const moves = nextMoves({ items, jobs, researchCount: research.length }, { now });
  const movesHTML = moves.length ? '<ol class="studio-moves">' + moves.map(mv => '<li data-tone="' + esc(mv.tone) + '"><b>' + esc(compact(mv.count)) + '</b><span>' + esc(mv.text) + '</span><button type="button" data-section="' + esc(mv.view) + '">' + esc(mv.action) + ' →</button></li>').join('') + '</ol>' : '<p class="dt-empty">Nothing is waiting on you. Start from a research angle or a creator analysis.</p>';

  // Where content waits: one bar per stage, its length the count, with the oldest wait as the bottleneck signal.
  const top = Math.max(1, ...load.map(s => s.count));
  const flow = '<ol class="studio-flow" aria-label="Content items per production stage">' + load.map(s => '<li><button type="button" data-section="' + esc(s.view) + '" aria-label="' + esc(s.stage + ': ' + s.count + (s.oldestDays != null ? ', oldest ' + s.oldestDays + ' days' : '')) + '"><span class="studio-flow-stage">' + esc(s.stage) + '</span><span class="viz-bar-track"><span class="viz-bar" style="--w:' + (s.count ? Math.max(3, Math.round(s.count / top * 100)) : 0) + '%"></span></span><b>' + esc(s.count) + '</b><small>' + esc(s.oldestDays == null ? '—' : s.oldestDays === 0 ? 'today' : s.oldestDays + ' d oldest') + '</small></button></li>').join('') + '</ol>';
  const stuck = load.filter(s => s.count && s.stage !== 'Posted').sort((a, b) => (b.oldestDays ?? 0) - (a.oldestDays ?? 0))[0];

  const rising = competitorItems.slice().sort((a, b) => ((b.changes?.views ?? 0) - (a.changes?.views ?? 0)) || ((b.metrics?.views ?? 0) - (a.metrics?.views ?? 0))).slice(0, 8);
  const risingWall = rising.length ? videoWall({ id: 'studio-rising', esc, now, sorts: [], items: rising, emptyText: 'No competitor posts collected yet.' }) : '<p class="dt-empty">' + (competitors?.error ? 'The competitor collection could not be read.' : 'No competitor posts collected yet.') + '</p>';
  const best = posts.slice().sort((a, b) => (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0)).slice(0, 8);
  const bestWall = best.length ? kit.mediaWall({ id: 'studio-best', esc, kind: 'post', items: best, emptyText: 'No posts in the last 90 days.', detail: item => m.socialPostDetail(item, { esc, number: compact, link: () => '' }) }) : '<p class="dt-empty">' + (social?.error ? 'Social analytics could not be read.' : 'No measured posts in the last 90 days.') + '</p>';

  return studioGuide(guideOpen, { esc }) + actions + tiles
    + '<div class="viz-grid studio-grid">'
    + kit.panel('Your next moves', movesHTML, { esc, meta: moves.length ? plural(moves.length, 'item') : 'clear' })
    + kit.panel('Where content waits', flow + (stuck ? '<p class="viz-note">Longest wait: <b>' + esc(stuck.stage) + '</b> · ' + esc(plural(stuck.count, 'item')) + (stuck.oldestDays ? ', the oldest for ' + esc(plural(stuck.oldestDays, 'day')) : '') + '. Archived items are left out.</p>' : ''), { esc, meta: plural(items.filter(i => i.status !== 'Archived').length, 'active item') })
    + '</div>'
    + kit.panel('What is working · competitors', '<p class="pk-lead">The fastest-rising posts from the profiles you track. Open one to watch it; use it as an angle from Ideas &amp; research.</p>' + risingWall, { esc, meta: rising.length ? 'top ' + rising.length : '', cls: 'wall-card' })
    + kit.panel('What is working · your posts', '<p class="pk-lead">Your most-viewed posts of the last 90 days' + (synced ? ', as of the social sync on ' + esc(kit.dayLabel(synced)) : '') + '.</p>' + bestWall, { esc, meta: best.length ? 'top ' + best.length : '', cls: 'wall-card' });
}
