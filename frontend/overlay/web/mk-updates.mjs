// Updates (Agents & Setup › Setup › Updates, 1.3.0): the installed version, a check against 187N's signed update feed
// (also daily, and from the menu: Check for Updates…), and for a new version its notes and a Download that fetches the
// installer, checks it against the signed feed (size and SHA-256) and keeps it in Downloads. The student opens it;
// nothing replaces the app by itself. The same page on both editions (the engines answer updates/…).
// banner(): the one-line "Version X is available" notice on every other page, until the student clicks Later.
import {tileRow, panel, pageBanner} from './page-kit.mjs';

let flash = '';
const mb = n => (Number(n) / 1048576).toFixed(Number(n) < 10 * 1048576 ? 1 : 0) + ' MB';
const when = at => { const d = new Date(at || ''); if (!Number.isFinite(d.getTime())) return 'Never'; const m = Math.round((Date.now() - d) / 60000); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}) };
const busy = s => s.checking || ['downloading', 'verifying'].includes(s.download?.state);
// How to install, per edition (the Windows build gets its own sentence at export).
const HOW = 'Open the installer, then drag 187N Agent HQ into Applications to replace this version. Your data, keys and settings stay.';

const STYLE = '<style>'
  + '.upd [hidden]{display:none!important}.upd .upd-notes{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px;line-height:1.6;color:var(--text-body,var(--hq-text))}'
  + '.upd .upd-bar{height:6px;border-radius:9999px;background:var(--bg-glass-2,rgba(255,255,255,.06));overflow:hidden;margin:10px 0 4px}'
  + '.upd .upd-bar span{display:block;height:100%;background:var(--status-live,#3fb950);transition:width .3s}'
  + '.upd .upd-help{margin:8px 0 0;font-size:12.5px;line-height:1.55;color:var(--text-secondary,var(--hq-muted))}'
  + '.upd .upd-err{margin:8px 0 0;font-size:12.5px;color:var(--status-error,#e5484d)}.upd .upd-ok{margin:8px 0 0;font-size:12.5px;color:var(--text-secondary,var(--hq-muted))}'
  + '.upd label.upd-auto{display:flex;align-items:center;gap:8px;font-size:13px}'
  + '</style>';

export async function page(view, {api, esc}) {
  const s = await api('updates');
  const notice = flash; flash = '';
  const a = s.available, d = s.download || {};
  const tiles = tileRow([
    {label: 'This version', value: s.current, caption: 'Installed on this Mac'},
    {label: 'Newest version', value: a ? a.version : s.latest || (s.configured ? s.current : '—'), caption: a ? 'Ready to download' : s.checkedAt ? 'You are up to date' : s.configured ? 'Not checked yet' : 'Updates not set up', tone: a ? 'attention' : undefined},
    {label: 'Last check', value: s.configured ? when(s.checkedAt) : '—', caption: s.checking ? 'Checking now…' : s.configured ? (s.auto ? 'Checks every day' : 'Daily check is off') : 'No update feed in this build'},
  ], {esc});
  if (!s.configured) return STYLE + '<div class="upd" data-mk-updates>' + tiles + panel('Updates', '<p class="upd-help">Automatic update checks are not set up in this build yet. New versions are announced in the 187N community; download them there and install them over this one. Your data, keys and settings stay.</p>', {esc, meta: 'Version ' + s.current}) + '</div>';
  const error = s.error ? pageBanner({title: 'The last check did not work', body: s.error}, {esc}) : '';
  let body;
  if (a) {
    const pct = d.total ? Math.min(100, Math.round((d.received || 0) / d.total * 100)) : 0;
    const progress = d.state === 'downloading' || d.state === 'verifying'
      ? '<div class="upd-bar" role="progressbar" aria-label="Download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div><p class="upd-help" data-mk-upd-progress>' + (d.state === 'verifying' ? 'Checking the download against the signed update…' : 'Downloading… ' + pct + '% of ' + esc(mb(d.total))) + '</p>' : '';
    const ready = d.state === 'ready' && d.version === a.version;
    const actions = ready
      ? '<div class="actions"><button type="button" class="primary" data-action="mk-updates-open" data-id="installer">Open the installer</button><button type="button" data-action="mk-updates-open" data-id="folder">Show in Finder</button></div>'
        + '<p class="upd-ok" data-mk-upd-verified>Downloaded and checked: its size and SHA-256 match the update 187N signed.</p><p class="upd-help">' + esc(HOW) + '</p>'
      : '<div class="actions"><button type="button" class="primary" data-action="mk-updates-download"' + (busy(s) ? ' disabled' : '') + '>Download update (' + esc(mb(a.size)) + ')</button></div>';
    body = panel('Version ' + a.version + ' is available', (a.notes ? '<p class="upd-notes" data-mk-upd-notes>' + esc(a.notes) + '</p>' : '<p class="upd-help">No release notes.</p>')
      + progress + actions + (d.state === 'failed' ? '<p class="upd-err" role="alert">' + esc(d.error || 'The download did not work.') + '</p>' : '')
      + '<p class="upd-help">From ' + esc(a.host) + (a.date ? ' · released ' + esc(a.date) : '') + '. The installer is only kept when it matches the signed update.</p>', {esc, meta: 'You have ' + s.current});
  } else body = panel('You are up to date', '<p class="upd-help">' + (s.checkedAt ? 'Version ' + esc(s.current) + ' is the newest version.' : 'Check now to see whether there is a newer version.') + '</p>', {esc, meta: 'Version ' + s.current});
  const controls = '<div class="actions"><button type="button" data-action="mk-updates-check"' + (s.checking ? ' disabled' : '') + '>' + (s.checking ? 'Checking…' : 'Check for updates') + '</button></div>'
    + '<label class="upd-auto"><input type="checkbox" data-mk-upd-auto' + (s.auto ? ' checked' : '') + '> Check automatically every day</label>'
    + (notice ? '<p class="upd-ok" role="status">' + esc(notice) + '</p>' : '')
    + '<p class="upd-help">Updates come from 187N only: the app checks each one against 187N\'s signature before it shows it, and never installs anything by itself.</p>';
  return STYLE + '<div class="upd" data-mk-updates data-busy="' + busy(s) + '">' + tiles + error + body + panel('Checks', controls, {esc}) + '</div>';
}

// While a check or a download runs, the page follows it; the daily-check box saves on change.
export function mount(view, el, ctx) {
  const box = el.querySelector('[data-mk-upd-auto]');
  box?.addEventListener('change', async () => { box.disabled = true; try { await ctx.api('updates/settings', {auto: box.checked}) } finally { box.disabled = false } });
  if (el.querySelector('[data-mk-updates]')?.dataset.busy !== 'true') return null;
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return;
    try { const s = await ctx.api('updates'); if (!busy(s)) { clearInterval(timer); if (!stopped && ctx.section === 'updates') ctx.refresh() } else if (!stopped && ctx.section === 'updates') ctx.refresh() } catch {}
  }, 800);
  return () => { stopped = true; clearInterval(timer) };
}

export async function act(action, id, ctx, el) {
  const {api} = ctx, hold = label => { if (el) { el.disabled = true; el.textContent = label } };
  try {
    if (action === 'mk-updates-check') { hold('Checking…'); const s = await api('updates/check', {}); flash = s.error ? '' : s.available ? '' : 'Checked just now: you are up to date.'; return ctx.refresh() }
    if (action === 'mk-updates-download') { hold('Starting…'); await api('updates/download', {}); return ctx.refresh() }
    if (action === 'mk-updates-open') { await api('updates/open', {what: id === 'folder' ? 'folder' : 'installer'}); return }
    if (action === 'mk-updates-dismiss') { await api('updates/dismiss', {}); cached = null; el?.closest('[data-mk-update-banner]')?.remove(); return }
  } catch (e) { flash = ''; if (el) { el.disabled = false; el.textContent = e.message } }
}

// The notice on the other pages: once a minute at most it asks the engine; Later hides it for this version.
let cached = null, cachedAt = 0;
export async function banner(el, ctx) {
  if (!el || ctx.section === 'updates') return;
  if (!cached || Date.now() - cachedAt > 60000) { try { cached = await ctx.api('updates'); cachedAt = Date.now() } catch { return } }
  const a = cached?.available;
  if (!a || cached.dismissed === a.version || el.querySelector('[data-mk-update-banner]')) return;
  const esc = ctx.esc, div = document.createElement('div');
  div.setAttribute('data-mk-update-banner', ''); div.setAttribute('role', 'status');
  div.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:10px 14px;border-radius:var(--radius-control,10px);border:1px solid var(--border-mid,rgba(255,255,255,.12));background:var(--bg-glass-2,rgba(255,255,255,.04));font-size:13px';
  div.innerHTML = '<span style="flex:1;min-width:200px">Version ' + esc(a.version) + ' of 187N Agent HQ is available.</span><button type="button" class="primary" data-section="updates">See what\'s new</button><button type="button" data-action="mk-updates-dismiss">Later</button>';
  el.prepend(div);
}
