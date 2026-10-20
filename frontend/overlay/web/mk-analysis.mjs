// Creator Lab (workstream A3): analyse a creator's Reels. The student picks an Instagram handle; the app collects
// the Reels with the student's own Apify key (after a confirm that shows the cost), transcribes them with their own
// Groq or ElevenLabs key, and their own AI tool classifies hook and structure. This page shows the runs, the live
// progress, a wall of posts, views against engagement, the findings per dimension and each post's transcript with
// its segment roles; any post can become a content idea. The maths runs in the app (ReelLab.swift).
import {tileRow, statusRows, chartBand, panel, pageBanner, mediaWall} from './page-kit.mjs';
import {barList} from './viz.mjs';
import {dataTable, relativeTime, stagePill} from './data-table.mjs';
import {stateView} from './ui.mjs';
import {wallAction} from './video-wall.mjs';

const ACTIVE = new Set(['queued', 'scraping', 'transcribing', 'classifying']);
const RUN_STATUS = {queued: 'Starting', scraping: 'Collecting', transcribing: 'Transcribing', classifying: 'Classifying', complete: 'Done', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted'};
const POST_STATUS = {queued: 'Waiting', transcribing: 'Transcribing', transcribed: 'Transcribed', classifying: 'Classifying', classified: 'Analysed', unclear: 'Unclear', no_audio: 'No sound', no_speech: 'Too little speech', failed: 'Not transcribed'};
const ROLE_COLOUR = {hook: 'var(--accent)', setup: 'var(--status-idle)', problem: 'var(--status-error)', example: 'var(--status-info)', advice: 'var(--status-live)', payoff: 'var(--color-iris-violet)', cta: 'var(--status-warn)', other: 'var(--text-tertiary)'};
const STYLE = '<style>'
  + '.an-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 16px}.an-top h2{margin:0 8px 0 4px;font-size:var(--text-heading)}.an-top .an-meta{color:var(--text-secondary);font-size:var(--text-caption)}.an-top .an-push{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}'
  + '.an-lead{color:var(--text-secondary);max-width:760px;margin:0 0 16px}.an-warn{color:var(--status-warn)}.an-muted{color:var(--text-tertiary)}'
  + '.an-live{display:grid;gap:10px;padding:14px 16px;margin:0 0 16px;border:1px solid var(--border-soft);border-radius:var(--radius-card);background:var(--bg-glass-1)}'
  + '.an-live-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.an-live-head span{color:var(--text-secondary)}.an-live-head button{margin-left:auto}'
  + '.an-bar{height:6px;border-radius:3px;background:var(--bg-glass-3);overflow:hidden}.an-bar i{display:block;height:100%;width:var(--p);background:var(--accent);transition:width .4s var(--ease-out-hard,ease)}'
  + '.an-stages{display:flex;gap:18px;flex-wrap:wrap;list-style:none;margin:0;padding:0;font-size:var(--text-caption);color:var(--text-tertiary)}.an-stages li[data-state=active]{color:var(--text-primary)}.an-stages li[data-state=done]{color:var(--status-live)}'
  + '.an-log{max-height:140px;overflow:auto;margin:6px 0 0;padding:0;list-style:none;font:12px/1.5 var(--font-mono);color:var(--text-secondary)}'
  + '.an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin:16px 0}'
  + '.an-scatter svg{display:block;width:100%;height:auto}.an-scatter text{font-size:11px;fill:var(--text-tertiary)}.an-scatter .an-axis{stroke:var(--border-mid)}.an-scatter .an-med{stroke:var(--text-tertiary);stroke-dasharray:4 4}'
  + '.an-dot{cursor:pointer;stroke:var(--bg-panel);stroke-width:1.5}.an-dot:hover{stroke:var(--text-primary)}'
  + '.an-form{display:grid;gap:12px}.an-form label{display:grid;gap:4px}.an-quote{padding:12px;border:1px solid var(--border-soft);border-radius:var(--radius-card);background:var(--bg-glass-1)}.an-quote p{margin:0}'
  + '.an-post{display:grid;gap:18px}.an-post-top{display:grid;grid-template-columns:110px 1fr;gap:16px;align-items:start}.an-post-top img{width:110px;aspect-ratio:9/16;object-fit:cover;border-radius:var(--radius-card);background:var(--bg-glass-2)}'
  + '.an-post h3{margin:0 0 8px;font-size:var(--text-label);text-transform:uppercase;letter-spacing:.04em;color:var(--text-tertiary)}'
  + '.an-hook{margin:0;padding:4px 0 4px 12px;border-left:3px solid var(--accent);font-size:var(--text-lead)}'
  + '.an-segs{list-style:none;margin:0;padding:0;display:grid;gap:6px}.an-segs li{padding:6px 10px;border-left:3px solid var(--role);border-radius:0 6px 6px 0;background:color-mix(in srgb,var(--role) 9%,transparent)}.an-segs small{display:block;color:var(--role);font-weight:600}.an-segs p{margin:2px 0 0}'
  + '.an-legend{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 10px;font-size:var(--text-caption);color:var(--text-secondary)}.an-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;background:var(--role)}'
  + '.an-credits{white-space:pre-wrap;font:12px/1.5 var(--font-mono);margin:0}.an-list{display:grid;gap:8px}'
  + '@media (max-width:640px){.an-post-top{grid-template-columns:1fr}.an-post-top img{width:140px}}'
  + '</style>';

let openRun = null, current = null, home = null, quote = null;
const enc = encodeURIComponent;
const compact = n => n == null || !Number.isFinite(Number(n)) ? '—' : Intl.NumberFormat('en-GB', {notation: 'compact', maximumFractionDigits: 1}).format(Number(n));
const pct = n => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(1) + '%';
const times = n => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(1) + '×';
const usd = n => n == null || !Number.isFinite(Number(n)) ? '—' : '$' + Number(n).toFixed(2);
const clock = s => s == null || !Number.isFinite(Number(s)) ? '' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const firstLine = t => String(t || '').split(/\n+/).map(l => l.trim()).find(Boolean) || '';
const hookOf = p => p.analysis?.hook || firstLine(p.transcript?.text) || firstLine(p.caption);
const dimsOf = d => d?.dimensions?.dimensions || [];
const valueLabel = (d, key, value) => dimsOf(d).find(x => x.key === key)?.values.find(v => v.id === value)?.label || value || '—';
const topText = t => t ? t.title + ': ' + t.label + ', ' + times(t.lift) + ' the median views (' + t.count + (t.count === 1 ? ' Reel)' : ' Reels)') : '';

// MARK: page
export async function page(view, ctx) {
  ctx.filters?.('');
  home = await ctx.api('marketing/analysis');
  if (openRun) {
    try { current = await ctx.api('marketing/analysis/' + enc(openRun)); return STYLE + runView(current, ctx) }
    catch { openRun = null; current = null }
  }
  return STYLE + listView(home, ctx);
}

function requirements(s, {esc}) {
  const tools = (s.runtimes || []).filter(r => r.ready), tool = tools.find(r => r.default) || tools[0];
  const rows = [
    {label: 'Apify', state: s.apify ? 'current' : 'unavailable', age: false,
     reason: s.apify ? 'Collects the Reels with your key. Monthly limit ' + usd(s.capUsd) + ', ' + usd(s.monthUsd) + ' used.' : 'Add your Apify key in Setup → Research. It collects the Reels.',
     action: s.apify ? null : {label: 'Open Setup', action: 'mk-analysis-setup', id: 'research'}},
    {label: 'Transcription', state: s.groq || s.elevenlabs ? 'current' : 'unavailable', age: false,
     reason: s.groq || s.elevenlabs ? [s.groq ? 'Groq' : '', s.elevenlabs ? 'ElevenLabs' : ''].filter(Boolean).join(' and ') + ' connected. The audio goes to your own account.' : 'Add a Groq key here, or an ElevenLabs key in Setup → Voice.',
     action: {label: s.groq ? 'Change Groq key' : 'Add Groq key', action: 'mk-analysis-key', id: 'groq'}},
    {label: 'Classification', state: s.typesafe || tool ? 'current' : 'unavailable', age: false,
     reason: s.typesafe ? 'Jev (TypeSafe) classifies the scripts with your own TypeSafe key.' + (tool ? ' You can choose ' + tool.name + ' instead when you start.' : '')
       : tool ? tool.name + ' (your ' + tool.agentName + ' agent) classifies the scripts with your own subscription. Add a TypeSafe key to use Jev instead.'
       : 'Add a TypeSafe key here to classify with Jev, or set up Claude Code, Codex or Hermes in Setup → AI tools.',
     action: {label: s.typesafe ? 'Change TypeSafe key' : 'Add TypeSafe key', action: 'mk-analysis-key', id: 'typesafe'}},
  ];
  return {ready: Boolean(s.apify && (s.groq || s.elevenlabs) && (s.typesafe || tool)), html: statusRows(rows, {esc})};
}

function listView(h, ctx) {
  const {esc} = ctx, runs = h.runs || [], need = requirements(h.setup || {}, ctx);
  const top = '<div class="an-top"><button type="button" class="primary" data-action="mk-analysis-new">Analyse a creator</button><div class="an-push"><button type="button" data-action="mk-analysis-credits">Credits</button></div></div>';
  const lead = '<p class="an-lead">Pick an Instagram creator. The app collects their latest Reels with your Apify key, transcribes them with your Groq or ElevenLabs key, and Jev (with your TypeSafe key) or your own AI tool classifies the hook and structure of each script. You then see which patterns get more views than the creator usually gets.</p>';
  const live = runs.filter(r => ACTIVE.has(r.status)).map(r => liveBlock(r, ctx)).join('');
  const list = runs.length ? panel('Analyses', runsTable(runs, ctx), {esc, meta: runs.length + (runs.length === 1 ? ' analysis' : ' analyses')})
    : stateView({kind: need.ready ? 'empty' : 'setup', title: 'No analyses yet', body: need.ready ? 'Analyse a creator to see which hooks and structures make their Reels outperform.' : 'Connect what is listed under "What this needs", then analyse a creator.',
      actions: need.ready ? [{label: 'Analyse a creator', action: 'mk-analysis-new', primary: true}] : [{label: 'Credits', action: 'mk-analysis-credits'}]});
  return '<div class="an-page">' + top + lead + live + list + '<div style="margin-top:16px">' + panel('What this needs', need.html, {esc, meta: need.ready ? 'Ready' : 'Not ready yet'}) + '</div></div>';
}

function runsTable(runs, {esc}) {
  return dataTable({id: 'analysis-runs', esc, rows: runs, pageSize: 10, filters: false, emptyText: 'No analyses yet.', columns: [
    {key: 'handle', label: 'Creator', value: r => r.handle, className: 'dt-primary', cell: r => '<strong>@' + esc(r.handle) + '</strong><small>' + esc(relativeTime(r.createdAt) + ' · ' + r.count + ' Reels requested') + '</small>'},
    {key: 'status', label: 'Status', value: r => RUN_STATUS[r.status] || r.status, cell: r => stagePill(RUN_STATUS[r.status] || r.status, esc)},
    {key: 'analysed', label: 'Analysed', value: r => r.summary?.classified ?? r.progress?.classified ?? 0, cell: r => esc((r.summary?.classified ?? r.progress?.classified ?? 0) + ' of ' + (r.progress?.total || r.count))},
    {key: 'top', label: 'Strongest pattern', cell: r => r.summary?.top ? esc(topText(r.summary.top)) : '<span class="dt-muted">' + esc(r.error ? String(r.error).slice(0, 90) : '—') + '</span>'},
    {key: 'cost', label: 'Apify', value: r => r.usd ?? null, cell: r => esc(r.usd == null ? 'up to ' + usd(r.maxUsd) : usd(r.usd))},
    {key: 'open', label: '', className: 'dt-action', cell: r => '<button type="button" class="dt-action" data-action="mk-analysis-open" data-id="' + esc(r.id) + '">Open</button>'},
  ]});
}

// Live progress: collect → transcribe → classify, the counts and the latest steps. mount() refreshes it.
function liveBlock(run, ctx) { return '<div class="an-live" data-an-live="' + ctx.esc(run.id) + '">' + liveInner(run, ctx) + '</div>' }
function liveInner(run, {esc}) {
  const p = run.progress || {}, total = p.total || 0, order = ['scraping', 'transcribing', 'classifying'], at = order.indexOf(run.status);
  const analysable = Math.max(1, total - (p.skipped || 0) - (p.failed || 0));
  const share = run.status === 'scraping' || run.status === 'queued' ? 4 : run.status === 'transcribing' ? 8 + 62 * (total ? ((p.transcribed || 0) + (p.skipped || 0) + (p.failed || 0)) / total : 0) : 70 + 30 * Math.min(1, (p.classified || 0) / analysable);
  const stage = (i, label) => '<li data-state="' + (i < at ? 'done' : i === at ? 'active' : 'todo') + '">' + esc(label) + '</li>';
  const events = (run.events || []).slice(-6).reverse().map(e => '<li>' + esc(new Date(e.at).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', second: '2-digit'}) + '  ' + e.message) + '</li>').join('');
  return '<div class="an-live-head"><strong>@' + esc(run.handle) + ' · ' + esc(RUN_STATUS[run.status] || run.status) + '</strong><span>' + esc(run.step || '') + '</span>'
    + '<button type="button" data-action="mk-analysis-cancel" data-id="' + esc(run.id) + '">Cancel</button></div>'
    + '<div class="an-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(share) + '"><i style="--p:' + share.toFixed(1) + '%"></i></div>'
    + '<ol class="an-stages">' + stage(0, '1 · Collect with Apify') + stage(1, '2 · Transcribe with ' + (run.transcriberName || 'your key')) + stage(2, '3 · Classify with ' + (run.runtimeName || 'your AI tool')) + '</ol>'
    + '<small class="an-muted">' + esc((total ? total + ' Reels · ' : '') + (p.transcribed || 0) + ' transcribed · ' + (p.classified || 0) + ' classified' + (p.skipped ? ' · ' + p.skipped + ' without speech' : '') + (p.failed ? ' · ' + p.failed + ' not transcribed' : '')) + '</small>'
    + (events ? '<ol class="an-log" aria-label="Latest steps">' + events + '</ol>' : '');
}

// MARK: one analysis
function runView(d, ctx) {
  const {esc} = ctx, run = d.run, posts = d.posts || [], active = ACTIVE.has(run.status);
  const head = '<div class="an-top"><button type="button" data-action="mk-analysis-back">← All analyses</button><h2>@' + esc(run.handle) + '</h2>'
    + '<span class="an-meta">' + esc([RUN_STATUS[run.status] || run.status, relativeTime(run.createdAt), run.transcriberName && 'transcribed with ' + run.transcriberName, run.runtimeName && 'classified with ' + run.runtimeName].filter(Boolean).join(' · ')) + '</span>'
    + '<div class="an-push">' + (posts.length ? '<button type="button" data-action="mk-analysis-export" data-id="' + esc(run.id) + '">Export JSON</button>' : '')
    + (active ? '' : '<button type="button" data-action="mk-analysis-delete" data-id="' + esc(run.id) + '">Delete</button>') + '<button type="button" data-action="mk-analysis-credits">Credits</button></div></div>';
  const notice = active ? liveBlock(run, ctx) : run.error ? pageBanner({title: run.status === 'failed' ? 'This analysis stopped' : 'Note', body: run.error}, {esc}) : run.status === 'cancelled' ? pageBanner({title: 'Cancelled', body: 'You cancelled this analysis. What was finished is shown below.', tone: 'info'}, {esc}) : '';
  if (!posts.length) return head + notice + stateView({kind: active ? 'loading' : 'empty', title: active ? 'Collecting Reels' : 'No Reels', body: active ? 'The Reels appear here once Apify has collected them.' : 'This analysis has no Reels.'});
  const classified = posts.filter(p => p.status === 'classified'), outliers = posts.filter(p => p.outlier >= 2);
  const engagement = median(posts.map(p => p.engagement));
  const tiles = tileRow([
    {label: 'Reels', value: String(posts.length), caption: 'collected for @' + run.handle},
    {label: 'Analysed', value: String(classified.length), caption: 'classified by ' + (run.runtimeName || 'your AI tool') + (run.tokens ? ' · ' + compact((run.tokens.input || 0) + (run.tokens.output || 0)) + ' tokens' : '')},
    {label: 'Median views', value: compact(d.medianViews), caption: 'what the creator usually gets'},
    {label: 'Median engagement', value: pct(engagement), caption: 'likes and comments per view'},
    {label: 'Outliers', value: String(outliers.length), caption: 'Reels with 2× the median views or more'},
    {label: 'Apify cost', value: run.usd == null ? '—' : usd(run.usd), caption: 'limit ' + usd(run.maxUsd)},
  ], {esc});
  const top = topFinding(d.findings);
  const banner = top ? pageBanner({title: 'Strongest pattern: ' + topText(top), body: 'Patterns in one sample of Reels show what goes together, not what causes it. A pattern needs at least two Reels; under three is marked as a small sample.', tone: 'info'}, {esc}) : '';
  const hooks = (d.findings || []).find(f => f.key === 'mechanism');
  const charts = chartBand(
    {title: 'Views and engagement', meta: 'one dot per Reel', body: scatter(posts, d.medianViews, esc), note: 'Views on a log scale. Dashed lines are the medians. Click a dot to open the Reel.', empty: 'No Reel has views and likes yet.'},
    {title: 'Hooks by median views', meta: hooks ? hooks.classified + ' classified Reels' : '', body: hooks && hooks.rows.length ? barList(hooks.rows.filter(r => r.medianViews).map(r => ({label: r.label, value: r.medianViews, note: r.count + (r.count === 1 ? ' Reel' : ' Reels') + ' · ' + times(r.lift) + ' the median'})), {esc, label: 'Median views per hook', format: compact}) : '', empty: 'Hooks appear once Reels are classified.'},
    {esc});
  const finding = key => { const f = (d.findings || []).find(x => x.key === key); return f ? panel(f.finding, findingTable(f, ctx), {esc, meta: f.classified + ' classified Reels'}) : '' };
  return '<div class="an-page">' + head + notice + tiles + banner + charts + '<div class="an-grid">' + finding('mechanism') + finding('structure') + '</div>'
    + panel('Every dimension', allFindings(d, ctx), {esc, meta: 'what the AI tool found, compared with the median'})
    + '<div style="margin-top:16px">' + panel('The Reels', wall(d, ctx), {esc, meta: 'click a Reel for its transcript'}) + '</div></div>';
}
const median = values => { const a = values.filter(v => v != null && Number.isFinite(Number(v))).map(Number).sort((x, y) => x - y); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : null };
function topFinding(findings) {
  const rows = (findings || []).flatMap(f => f.rows.filter(r => r.outperforms).map(r => ({...r, title: f.title})));
  return rows.sort((a, b) => (b.lift - a.lift) || (b.count - a.count))[0] || null;
}

function findingColumns(ctx, extra = [], {engagement = true} = {}) {
  const {esc} = ctx;
  return [...extra,
    {key: 'label', label: 'Pattern', value: r => r.label, className: 'dt-primary', cell: r => '<strong>' + esc(r.label) + '</strong>' + (r.outperforms ? ' ' + stagePill('Outperforms', esc) : '') + (r.smallSample ? '<small>' + (r.count === 1 ? 'one Reel: not a pattern yet' : 'small sample') + '</small>' : '')},
    {key: 'count', label: 'Reels', value: r => r.count, cell: r => '<span class="dt-num">' + esc(r.count) + '</span>'},
    {key: 'views', label: 'Median views', value: r => r.medianViews, cell: r => '<span class="dt-num">' + esc(compact(r.medianViews)) + '</span>'},
    {key: 'lift', label: 'Against median', value: r => r.lift, cell: r => '<span class="dt-num">' + esc(times(r.lift)) + '</span>'},
    engagement && {key: 'engagement', label: 'Engagement', value: r => r.medianEngagement, cell: r => '<span class="dt-num">' + esc(pct(r.medianEngagement)) + '</span>'},
    {key: 'see', label: '', className: 'dt-action', cell: r => '<button type="button" class="dt-action" data-action="mk-analysis-pattern" data-id="' + esc(r.dim + '|' + r.value) + '">See Reels</button>'}].filter(Boolean);
}
function findingTable(f, ctx) {
  return dataTable({id: 'analysis-find-' + f.key, esc: ctx.esc, rows: f.rows.map(r => ({...r, dim: f.key})), pageSize: 8, filters: false, defaultSort: {key: 'lift', dir: 'desc'},
    emptyText: 'Nothing classified yet.', columns: findingColumns(ctx, [], {engagement: false})});
}
function allFindings(d, ctx) {
  const rows = (d.findings || []).flatMap(f => f.rows.map(r => ({...r, dim: f.key, dimTitle: f.title})));
  return dataTable({id: 'analysis-find-all', esc: ctx.esc, rows, pageSize: 12, filters: false, defaultSort: {key: 'lift', dir: 'desc'}, emptyText: 'Nothing classified yet.',
    tabs: (d.findings || []).map(f => ({id: f.key, label: f.title, filter: r => r.dim === f.key})),
    columns: findingColumns(ctx, [{key: 'dim', label: 'Dimension', value: r => r.dimTitle, cell: r => ctx.esc(r.dimTitle)}])});
}

// Views (log scale) against engagement; a dot per Reel, outliers in the accent colour.
function scatter(posts, med, esc) {
  const pts = posts.filter(p => p.views > 0 && p.engagement != null);
  if (!pts.length) return '';
  const W = 600, H = 250, L = 48, R = 12, T = 12, B = 30;
  const lo = Math.floor(Math.log10(Math.min(...pts.map(p => p.views)))), hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(...pts.map(p => p.views)))));
  const ymax = Math.max(1, Math.ceil(Math.max(...pts.map(p => p.engagement)) / 2) * 2);
  const x = v => L + (Math.log10(v) - lo) / (hi - lo) * (W - L - R), y = v => T + (1 - v / ymax) * (H - T - B);
  let svg = '<line class="an-axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"></line><line class="an-axis" x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (H - B) + '"></line>';
  for (let k = lo; k <= hi; k++) svg += '<text x="' + x(10 ** k).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(compact(10 ** k)) + '</text>';
  for (const v of [0, ymax / 2, ymax]) svg += '<text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(v.toFixed(v % 1 ? 1 : 0) + '%') + '</text>';
  const medE = median(pts.map(p => p.engagement));
  if (med > 0) svg += '<line class="an-med" x1="' + x(med).toFixed(1) + '" x2="' + x(med).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"></line>';
  if (medE != null) svg += '<line class="an-med" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(medE).toFixed(1) + '" y2="' + y(medE).toFixed(1) + '"></line>';
  svg += pts.map(p => '<circle class="an-dot" data-action="mk-analysis-post" data-id="' + esc(p.id) + '" cx="' + x(p.views).toFixed(1) + '" cy="' + y(p.engagement).toFixed(1) + '" r="' + (p.outlier >= 2 ? 7 : 5.5) + '" style="fill:' + (p.outlier >= 2 ? 'var(--accent)' : 'var(--status-info)') + '"><title>'
    + esc(hookOf(p).slice(0, 80) + ' · ' + compact(p.views) + ' views · ' + pct(p.engagement) + ' engagement' + (p.outlier ? ' · ' + times(p.outlier) + ' the median' : '')) + '</title></circle>').join('');
  return '<figure class="an-scatter" style="margin:0"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Views against engagement for ' + pts.length + ' Reels') + '">' + svg + '</svg></figure>';
}

// The student build drops the office's own wall actions (video-play, video-wall), so this wall's clicks come here:
// mk-analysis-tile opens a post, mk-analysis-wall changes the group, the order or "show more" (the wall keeps its state).
const ownWall = html => String(html || '').replaceAll('data-action="video-play"', 'data-action="mk-analysis-tile"').replaceAll('data-action="video-wall"', 'data-action="mk-analysis-wall"');
function wall(d, ctx) {
  const {esc} = ctx;
  const items = d.posts.map(p => ({id: p.id, tileKind: 'post', title: hookOf(p) || 'Untitled Reel', sub: compact(p.views) + ' views' + (p.outlier ? ' · ' + times(p.outlier) + ' the median' : ''),
    thumbUrl: p.thumb || '', badges: [p.outlier >= 2 ? 'Outlier' : null, POST_STATUS[p.status] || p.status], when: p.publishedAt ? relativeTime(p.publishedAt) : '',
    publishedAt: p.publishedAt, outlier: p.outlier ?? -1, views: p.views ?? -1, status: p.status, text: p.caption}));
  return ownWall(mediaWall({id: 'analysis-wall', esc, items, kind: 'post', emptyText: 'No Reels in this group.', groupLabel: 'Show',
    groups: [{id: 'outperforming', label: 'Outperforming', filter: i => i.outlier >= 1.5}, {id: 'analysed', label: 'Analysed', filter: i => i.status === 'classified'}, {id: 'skipped', label: 'Not analysed', filter: i => i.status !== 'classified'}],
    sorts: [['outlier', 'Most outperforming', (a, b) => b.outlier - a.outlier], ['views', 'Most viewed', (a, b) => b.views - a.views], ['recent', 'Newest', (a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))]]}));
}

// One post: the numbers, the hook, what the AI tool found, the transcript with colour-coded segment roles.
function postDetail(p, d, {esc}) {
  const a = p.analysis || {}, dims = a.dimensions || {}, roles = d.dimensions?.roles || [];
  const stat = (label, value) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
  const link = /^https:\/\/(www\.)?instagram\.com\//.test(p.url || '') ? '<a class="ui-btn" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">Open on Instagram</a>' : '';
  const top = '<div class="an-post-top">' + (p.thumb ? '<img src="' + esc(p.thumb) + '" alt="">' : '<span></span>') + '<div><dl class="pk-fields">'
    + stat('Views', compact(p.views)) + stat('Likes', p.likes == null ? 'Hidden' : compact(p.likes)) + stat('Comments', compact(p.comments)) + stat('Engagement', pct(p.engagement))
    + stat('Against the median', times(p.outlier)) + stat('Published', p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '—') + stat('Status', POST_STATUS[p.status] || p.status)
    + '</dl>' + (p.error ? '<p class="an-warn">' + esc(p.error) + '</p>' : '') + '</div></div>';
  const hook = '<section><h3>' + (p.analysis ? 'Hook' : p.transcript ? 'Opening line' : 'Caption') + '</h3><blockquote class="an-hook">' + esc(hookOf(p) || '—') + '</blockquote></section>';
  const found = p.analysis ? '<section><h3>What ' + esc(d.run.runtimeName || 'the AI tool') + ' found</h3><dl class="pk-fields">' + dimsOf(d).map(x => stat(x.title, valueLabel(d, x.key, dims[x.key]) + (a.confidence?.[x.key] != null && dims[x.key] !== 'unclear' ? ' · ' + Math.round(a.confidence[x.key] * 100) + '% sure' : ''))).join('') + '</dl>'
    + (a.confidence ? '<p class="an-muted">Jev\'s confidence is how sure it was of each label, not whether the label matters for views.</p>' : '') + '</section>' : '';
  const segs = a.segments?.length ? a.segments : (p.transcript?.segments || []).map(s => ({...s, role: null}));
  const roleLabel = id => roles.find(r => r.id === id)?.label || id;
  const used = [...new Set(segs.map(s => s.role).filter(Boolean))];
  const transcript = segs.length ? '<section><h3>Transcript</h3>' + (used.length ? '<p class="an-legend">' + used.map(r => '<span style="--role:' + (ROLE_COLOUR[r] || ROLE_COLOUR.other) + '"><i></i>' + esc(roleLabel(r)) + '</span>').join('') + '</p>' : '')
    + '<ol class="an-segs">' + segs.map(s => '<li data-role="' + esc(s.role || 'none') + '" style="--role:' + (ROLE_COLOUR[s.role] || 'var(--border-mid)') + '"><small>' + esc([s.role ? roleLabel(s.role) : '', clock(s.start)].filter(Boolean).join(' · ')) + '</small><p>' + esc(s.text) + '</p></li>').join('') + '</ol></section>'
    : '<section><h3>Transcript</h3><p class="an-muted">' + esc(p.transcript?.text || 'No transcript for this Reel.') + '</p></section>';
  const caption = p.caption ? '<details class="pk-section"><summary>Caption</summary><p style="white-space:pre-wrap">' + esc(p.caption) + '</p></details>' : '';
  const idea = p.idea ? '<button type="button" disabled>Idea added to your board</button>' : '<button type="button" class="primary" data-action="mk-analysis-idea" data-id="' + esc(p.id) + '">Idea from this post</button>';
  return '<div class="an-post">' + top + hook + found + transcript + caption + '<div class="actions">' + idea + link + '</div></div>';
}

// MARK: actions
export async function act(action, id, ctx, el) {
  const {api, esc, preview, refresh} = ctx;
  switch (action.replace(/^mk-analysis-/, '')) {
    case 'new': return openDialog(ctx);
    case 'quote': return getQuote(ctx);
    case 'start': return startRun(ctx);
    case 'open': openRun = id; current = null; return refresh();
    case 'back': openRun = null; current = null; return refresh();
    case 'cancel': await api('marketing/analysis/' + enc(id) + '/cancel', {}); return refresh();
    case 'delete':
      if (!confirm('Delete this analysis? Its transcripts and results are removed from this Mac.')) return;
      await api('marketing/analysis/' + enc(id) + '/delete', {}); openRun = null; current = null; return refresh();
    case 'export': return exportRun(id, ctx);
    case 'tile': id = String(id).slice(String(id).indexOf('|') + 1); // falls through: a wall tile opens its post
    case 'post': { const p = current?.posts.find(x => x.id === id); if (p) preview('@' + current.run.handle + ' · Reel', postDetail(p, current, ctx)); return }
    case 'wall': {
      const html = wallAction(id), box = el?.closest('.vw');
      if (!html || !box) return refresh();
      box.outerHTML = ownWall(html);
      ctx.root.querySelector('.vw[data-wall="analysis-wall"] [data-action="mk-analysis-wall"][data-id="' + CSS.escape(id) + '"]')?.focus();
      return;
    }
    case 'pattern': return openPattern(id, ctx);
    case 'idea': return addIdea(id, ctx, el);
    case 'credits': { const c = await api('marketing/analysis/credits'); return preview('Credits', '<pre class="an-credits">' + esc(c.text) + '</pre>') }
    case 'key': return keyDialog(id, ctx);
    case 'setup': location.href = '/setup'; return;
  }
}

function openPattern(id, ctx) {
  const [dim, value] = String(id).split('|'), f = current?.findings.find(x => x.key === dim), r = f?.rows.find(x => x.value === value);
  if (!r) return;
  const posts = r.posts.map(pid => current.posts.find(p => p.id === pid)).filter(Boolean).sort((a, b) => (b.views || 0) - (a.views || 0));
  ctx.preview(f.title + ': ' + r.label, '<div class="an-list">' + posts.map(p => '<article class="row"><div><strong>' + ctx.esc(hookOf(p) || 'Untitled Reel') + '</strong><small>' + ctx.esc(compact(p.views) + ' views · ' + times(p.outlier) + ' the median') + '</small></div><div class="actions" style="margin:0"><button type="button" data-action="mk-analysis-post" data-id="' + ctx.esc(p.id) + '">Open</button></div></article>').join('') + '</div>');
}

async function addIdea(id, ctx, el) {
  if (el) { el.disabled = true; el.textContent = 'Adding…' }
  try {
    const r = await ctx.api('marketing/analysis/post/' + enc(id) + '/idea', {});
    const p = current?.posts.find(x => x.id === id); if (p) p.idea = {id: r.item?.id};
    if (el) el.textContent = 'Idea added to your board';
  } catch (e) { if (el) { el.disabled = false; el.textContent = 'Idea from this post' } throw e }
}

async function exportRun(id, ctx) {
  const data = await ctx.api('marketing/analysis/' + enc(id) + '/export');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  a.download = 'reel-analysis-' + (data.run?.handle || 'creator').replace(/[^\w.-]/g, '') + '-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// The "Analyse a creator" dialog: handle, count, transcriber (only connected ones), classifier (Jev first, then the
// AI tools); the quote, then Start.
async function openDialog(ctx) {
  const {api, esc, preview, root} = ctx;
  home = await api('marketing/analysis'); quote = null;
  const s = home.setup || {}, tools = (s.runtimes || []).filter(r => r.ready), transcribers = s.transcribers || [];
  const missing = [!s.apify && 'your Apify key (Setup → Research)', !transcribers.length && 'a Groq key (on this page) or an ElevenLabs key (Setup → Voice)', !tools.length && !s.typesafe && 'a TypeSafe key (on this page) or an AI tool that is signed in (Setup → AI tools)'].filter(Boolean);
  const classifiers = (s.typesafe ? [{id: 'jev', name: (s.jev?.name || 'Jev (TypeSafe)') + ', with your TypeSafe key'}] : []).concat(tools.map(r => ({id: r.id, name: r.name + ' (your ' + r.agentName + ' agent)', default: r.default && !s.typesafe})));
  const html = '<form id="an-form" class="an-form" data-self-busy>'
    + (missing.length ? '<p class="an-warn">To analyse a creator, first add ' + esc(missing.join(', ')) + '.</p>' : '')
    + '<label>Instagram handle<input name="handle" autocomplete="off" spellcheck="false" placeholder="for example natgeo" required></label>'
    + '<label>Reels to analyse (1 to ' + esc(s.maxCount || 50) + ')<input name="count" type="number" min="1" max="' + esc(s.maxCount || 50) + '" value="20" required></label>'
    + '<label>Transcribe with' + (transcribers.length ? '<select name="transcriber">' + transcribers.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select>' : '<span class="an-muted">No transcription key yet.</span>') + '</label>'
    + '<label>Classify with' + (classifiers.length ? '<select name="classifier">' + classifiers.map(c => '<option value="' + esc(c.id) + '"' + (c.default ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>' : '<span class="an-muted">No TypeSafe key and no AI tool yet.</span>') + '</label>'
    + '<div class="an-quote" data-an-quote><p>Check the cost first. Nothing is collected or paid until you click Start.</p></div>'
    + '<p role="alert" class="an-warn" data-an-error></p>'
    + '<div class="actions"><button type="button" data-action="mk-analysis-quote"' + (missing.length ? ' disabled' : '') + '>Check the cost</button><button type="button" class="primary" data-action="mk-analysis-start" disabled>Start analysis</button></div></form>';
  preview('Analyse a creator', html);
  const form = root.querySelector('#an-form'); if (!form) return;
  form.onsubmit = e => { e.preventDefault(); form.querySelector('[data-action="mk-analysis-quote"]')?.click() };
  form.oninput = () => { quote = null; form.querySelector('[data-action="mk-analysis-start"]').disabled = true; form.querySelector('[data-an-quote]').innerHTML = '<p>Check the cost for this choice. Nothing is collected or paid until you click Start.</p>' };
  form.querySelector('input[name=handle]')?.focus();
}

async function getQuote(ctx) {
  const {api, esc, root} = ctx, form = root.querySelector('#an-form'); if (!form) return;
  const f = Object.fromEntries(new FormData(form)), box = form.querySelector('[data-an-quote]'), err = form.querySelector('[data-an-error]'), start = form.querySelector('[data-action="mk-analysis-start"]');
  err.textContent = ''; start.disabled = true; box.innerHTML = '<p>Checking the cost…</p>';
  try {
    const q = await api('marketing/analysis/quote', {handle: f.handle, count: Number(f.count)});
    const jev = f.classifier === 'jev', tool = (home?.setup?.runtimes || []).find(r => r.id === f.classifier), transcriber = (home?.setup?.transcribers || []).find(t => t.id === f.transcriber);
    quote = q;
    if (!q.cappable || !(q.maxUsd > 0)) { box.innerHTML = '<p class="an-warn">' + esc(q.reason || 'This cost cannot be capped, so the analysis cannot start.') + '</p>'; return }
    const row = (label, value) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
    box.innerHTML = '<dl class="pk-fields">'
      + row('Apify, at most', usd(q.maxUsd) + ' for ' + q.count + ' Reels of @' + q.handle + '. This is a hard limit; you pay what is used.')
      + row('Your monthly Apify limit', usd(q.monthUsd) + ' used of ' + usd(q.capUsd) + '.')
      + row('Transcription', transcriber ? 'Your ' + transcriber.name + ' account, billed by ' + transcriber.name + ' for the minutes of audio.' : 'No transcription key yet.')
      + row('Classification', jev ? 'Your TypeSafe account: one Jev request per Reel (at most ' + q.count + '), billed by TypeSafe for the tokens. The analysis shows the tokens used.'
        : tool ? 'Your ' + tool.name + ' subscription, through your ' + tool.agentName + ' agent: about ' + Math.ceil(q.count / 5) + (q.count > 5 ? ' runs' : ' run') + '.' : 'No TypeSafe key and no AI tool yet.')
      + '</dl>' + (q.fitsCap ? '' : '<p class="an-warn">This would go over your monthly Apify limit. Raise it in Setup → Research.</p>');
    start.disabled = !(q.fitsCap && transcriber && (jev || tool));
  } catch (e) { box.innerHTML = ''; err.textContent = e.message }
}

async function startRun(ctx) {
  const {api, root, refresh} = ctx, form = root.querySelector('#an-form'); if (!form || !quote) return;
  const f = Object.fromEntries(new FormData(form)), err = form.querySelector('[data-an-error]'), button = form.querySelector('[data-action="mk-analysis-start"]');
  button.disabled = true; err.textContent = '';
  try {
    const run = await api('marketing/analysis/start', {handle: quote.handle, count: quote.count, confirm: true, maxUsd: quote.maxUsd, transcriber: f.transcriber, ...(f.classifier === 'jev' ? {classifier: 'jev'} : {classifier: 'agent', runtime: f.classifier})});
    quote = null; root.querySelector('#preview')?.close(); openRun = run.id; current = null; refresh();
  } catch (e) { err.textContent = e.message; button.disabled = false }
}

// The Groq and TypeSafe keys, stored in the Keychain through the app's key endpoint (each checked with its service
// first, for free).
const KEYS = {
  groq: {title: 'Groq', text: 'Groq transcribes the Reels\' audio with Whisper on your own account. Create a key at <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com/keys</a> and paste it here.'},
  typesafe: {title: 'TypeSafe', text: 'Jev, TypeSafe\'s classification model, labels each Reel\'s hook, structure and segments on your own TypeSafe account: one request per Reel, billed by TypeSafe for the tokens. Create a key at <a href="https://console.typesafe.ai/keys" target="_blank" rel="noopener noreferrer">console.typesafe.ai/keys</a> and paste it here.'},
};
function keyDialog(id, ctx) {
  const {preview, root, refresh} = ctx, name = KEYS[id] ? id : 'groq', k = KEYS[name], has = Boolean(home?.setup?.[name]);
  preview(k.title + ' key', '<form id="an-key" class="an-form" data-self-busy><p>' + k.text + ' It is kept in your Mac\'s Keychain.</p>'
    + '<label>' + k.title + ' API key<input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="' + (has ? 'A key is saved. Paste a new one to replace it.' : 'Paste your key') + '"></label>'
    + '<p role="alert" class="an-warn" data-an-error></p><div class="actions"><button type="submit" class="primary">Save key</button>' + (has ? '<button type="button" data-an-remove>Remove key</button>' : '') + '</div></form>');
  const form = root.querySelector('#an-key'); if (!form) return;
  const save = async key => {
    const err = form.querySelector('[data-an-error]'); err.textContent = '';
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    try {
      const r = await fetch('/api/student/keys', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, key})});
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error?.message || 'The key could not be saved.');
      root.querySelector('#preview')?.close(); refresh();
    } catch (e) { err.textContent = e.message; for (const b of form.querySelectorAll('button')) b.disabled = false }
  };
  form.onsubmit = e => { e.preventDefault(); const key = String(new FormData(form).get('key') || '').trim(); if (key) save(key); else form.querySelector('[data-an-error]').textContent = 'Paste your ' + k.title + ' key first.' };
  const remove = form.querySelector('[data-an-remove]'); if (remove) remove.onclick = () => save('');
  form.querySelector('input')?.focus();
}

// MARK: live progress (a running analysis polls its state; the page refreshes once it is done)
export function mount(view, el, ctx) {
  if (!el?.querySelector('[data-an-live]')) return null;
  let stopped = false, timer = 0;
  const tick = async () => {
    if (stopped) return;
    try {
      const h = await ctx.api('marketing/analysis');
      if (stopped) return;
      let finished = false;
      for (const box of el.querySelectorAll('[data-an-live]')) {
        const run = (h.runs || []).find(r => r.id === box.dataset.anLive);
        if (!run || !ACTIVE.has(run.status)) { finished = true; continue }
        box.innerHTML = liveInner(run, ctx);
      }
      const onRun = openRun && current && (h.runs || []).find(r => r.id === openRun);
      if (onRun && (onRun.progress?.total || 0) !== (current.posts?.length || 0)) finished = true;
      if (finished) { stopped = true; ctx.refresh(); return }
    } catch {}
    timer = setTimeout(tick, 1500);
  };
  timer = setTimeout(tick, 1500);
  return () => { stopped = true; clearTimeout(timer) };
}
