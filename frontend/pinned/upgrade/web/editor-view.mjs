// Video editor (11 Oct 2026): a whole NLE inside the office. The 187N Video Engine (a Premiere-class editor in
// WebAssembly, built on open-source FilmCraft) runs same-origin in a frame; this page is the host around it: footage folders on this Mac, the edit formats from the
// owner's video skills, edit jobs (transcribe → the agent picks the passages → FilmCraft builds the edit natively),
// saving every change back to Agent HQ and fast native export. Media never leaves the Mac: the frame reads the files
// over HTTP Range from Agent HQ, and edits and exports land next to the footage in "Agent HQ edits/".
// The frame lives in its own host outside #view, so the editing session survives page switches and refreshes.
// 12 Oct 2026: full screen (the whole app window), a prompt bar to talk to the editor (changes land straight in the
// open timeline, undoable), clips dropped into the editor join the edit by themselves, format groups.

const API = '/api/hq/v1/editor/';
const APP = '/apps/filmcraft/?norecover';
const KEYS = { folder: 'hq-editor-folder', side: 'hq-editor-side', route: 'hq-editor-route', options: 'hq-editor-options', full: 'hq-editor-full', chat: 'hq-editor-chat' };
const ASPECTS = [['source', 'Source'], ['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1']];
const LANGUAGES = [['auto', 'Detect'], ['nl', 'Nederlands'], ['en', 'English']];
const COUNTS = [['', 'Auto'], ['1', '1'], ['3', '3'], ['5', '5'], ['8', '8']];
// Spoken reels: keep every sentence, or let the agent tighten to a length the way the owner does (weakest whole sentences go).
const LENGTHS = [['', 'All content'], ['30', '30 s'], ['45', '45 s'], ['60', '60 s']];
const BUSY = new Set(['queued', 'running', 'rendering']);
const ROLE_LABELS = { talking_head: 'Talking head', b_roll: 'B-roll', music: 'Music', reference_video: 'Reference reel', screen_recording: 'Screen recording', generated_clips: 'Generated clip' };

// A first guess per clip (the same rules as the server); the owner changes it in the list.
export function guessRole(route, path, info = {}) {
  const spec = (route?.roles || []).map(r => r.id), has = r => spec.includes(r);
  const name = String(path).split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(), ext = String(path).split('.').pop().toLowerCase();
  const audio = ['wav', 'mp3', 'm4a', 'aac', 'flac', 'aif', 'aiff', 'ogg', 'opus'].includes(ext);
  if (audio && has('music')) return 'music';
  if (/(^|[^a-z])(ref|reference|referentie|remake|voorbeeld)([^a-z]|$)/.test(name) && has('reference_video')) return 'reference_video';
  if (/screen|scherm|recording|capture|demo/.test(name) && has('screen_recording')) return 'screen_recording';
  if (has('generated_clips')) return 'generated_clips';
  if (has('talking_head') && !audio && info.audio && (info.duration || 0) >= 8) return 'talking_head';
  if (has('b_roll')) return 'b_roll';
  return spec[0] || null;
}

const remember = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
};
export const clock = s => { s = Math.max(0, Math.round(Number(s) || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + x : m + ':' + x };
export const bytes = n => { n = Number(n) || 0; return n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB' };
export const mediaUrl = path => API + 'media?path=' + encodeURIComponent(path);
const base = p => String(p || '').split('/').filter(Boolean).pop() || p;
const hm = t => t ? new Date(t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

// Every string value equal to a key of `map` is replaced (media paths in a .fcproj, real ↔ virtual).
export function swapPaths(doc, map) {
  if (Array.isArray(doc)) return doc.map(v => swapPaths(v, map));
  if (doc && typeof doc === 'object') return Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, swapPaths(v, map)]));
  return typeof doc === 'string' && Object.prototype.hasOwnProperty.call(map, doc) ? map[doc] : doc;
}
// A file name for the browser editor's project (it becomes /projects/<name>).
export const projectName = label => (String(label || 'Edit').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Edit') + '.fcproj';

async function call(path, body, { method, raw } = {}) {
  let r;
  try {
    r = await fetch(API + path, body === undefined && !method ? {} : { method: method || 'POST', headers: raw ? {} : { 'Content-Type': 'application/json' }, body: raw ? body : JSON.stringify(body ?? {}) });
  } catch { throw new Error('Agent HQ is not answering. Try again in a moment.') }
  const text = await r.text(); let d = null; try { d = text ? JSON.parse(text) : {} } catch {}
  if (!r.ok || d === null) { const e = new Error(d?.error?.message || 'Request refused (HTTP ' + r.status + ').'); e.status = r.status; e.code = d?.error?.code; throw e }
  return d;
}

const STYLE = `
#editor-host{display:block}
#editor-host[hidden]{display:none!important}
.ved{--ved-side:360px;display:grid;grid-template-columns:var(--ved-side) minmax(0,1fr);height:100%;min-height:520px;border-top:1px solid var(--border-soft);background:var(--bg-panel)}
.ved.side-closed{grid-template-columns:minmax(0,1fr)}
.ved.side-closed .ved-side{display:none}
.ved-side{display:flex;flex-direction:column;min-height:0;overflow:auto;border-right:1px solid var(--border-soft);background:var(--bg-panel);scrollbar-width:thin}
.ved-block{padding:14px 16px;border-bottom:1px solid var(--border-soft)}
.ved-block>h3{margin:0 0 10px;font-size:var(--text-label);font-weight:590;letter-spacing:.02em;text-transform:uppercase;color:var(--text-tertiary);display:flex;align-items:center;gap:8px}
.ved-block>h3 .grow{flex:1}
.ved-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ved-row>select,.ved-row>input{flex:1;min-width:0}
.ved select,.ved input[type=text]{height:32px;padding:0 10px;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--bg-elevated);color:var(--text-primary);font:inherit;font-size:var(--text-caption)}
.ved button{height:32px;padding:0 12px;font-size:var(--text-caption);white-space:nowrap}
.ved button.small{height:26px;padding:0 9px;font-size:var(--text-label)}
.ved button.icon{width:32px;padding:0;display:inline-grid;place-items:center}
.ved-crumbs{margin:8px 0 0;font-size:var(--text-label);color:var(--text-tertiary);overflow-wrap:anywhere}
.ved-crumbs button{all:unset;cursor:pointer;color:var(--text-secondary)}
.ved-crumbs button:hover{color:var(--text-primary);text-decoration:underline}
.ved-folders{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;max-height:118px;overflow:auto}
.ved-folders button{height:26px;padding:0 10px;border-radius:var(--radius-pill);font-size:var(--text-label);max-width:100%;overflow:hidden;text-overflow:ellipsis}
.ved-files{display:flex;flex-direction:column;gap:2px;margin-top:10px;max-height:min(42vh,420px);overflow:auto;scrollbar-width:thin}
.ved-file{display:grid;grid-template-columns:18px 64px minmax(0,1fr) auto;gap:10px;align-items:center;padding:5px 6px;border-radius:var(--radius-control);cursor:pointer;user-select:none;border:1px solid transparent}
.ved-file:hover{background:var(--bg-hover)}
.ved-file[aria-checked=true]{background:var(--bg-active);border-color:var(--border-mid)}
.ved-file input{margin:0;accent-color:var(--accent)}
.ved-thumb{width:64px;height:36px;border-radius:4px;background:var(--bg-elevated);object-fit:cover;display:block}
.ved-thumb.audio{display:grid;place-items:center;font-size:16px;color:var(--text-tertiary)}
.ved-file strong{display:block;font-size:var(--text-caption);font-weight:510;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ved-file small{display:block;font-size:var(--text-label);color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ved-file .play{opacity:0;height:24px;width:24px;padding:0}
.ved-file:hover .play,.ved-file:focus-within .play{opacity:1}
.ved-selection{margin-top:8px;font-size:var(--text-label);color:var(--text-secondary);display:flex;gap:8px;align-items:center}
.ved-selection span{flex:1}
.ved-note{margin:8px 0 0;font-size:var(--text-label);line-height:1.45;color:var(--text-tertiary)}
.ved-note.warn{color:var(--status-warn,#f5a524)}
.ved-note.error{color:var(--status-error)}
.ved-field{display:grid;gap:6px;margin-top:12px}
.ved-field>span{font-size:var(--text-label);color:var(--text-secondary)}
.ved-seg{display:flex;border:1px solid var(--border-input);border-radius:var(--radius-control);overflow:hidden;background:var(--bg-elevated)}
.ved-seg button{flex:1;height:28px;border:0;border-radius:0;background:transparent;color:var(--text-secondary);box-shadow:none;padding:0 6px}
.ved-seg button+button{border-left:1px solid var(--border-input)}
.ved-seg button[aria-pressed=true]{background:var(--bg-active);color:var(--text-primary)}
.ved-roles{display:grid;gap:4px}
.ved-role{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:8px;align-items:center;font-size:var(--text-label);color:var(--text-secondary)}
.ved-role span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ved-role select{height:28px}
.ved textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--bg-elevated);color:var(--text-primary);font:inherit;font-size:var(--text-caption);resize:vertical}
.ved-qa{font-size:var(--text-micro);padding:1px 6px;border-radius:var(--radius-pill);border:1px solid var(--border-mid)}
.ved-qa.ok{color:var(--status-live);border-color:currentColor}
.ved-qa.bad{color:var(--status-error);border-color:currentColor}
.ved-qa-list{display:block!important}
.ved-qa-list details{font-size:var(--text-label);color:var(--text-tertiary)}
.ved-copy{margin-top:6px}
.ved-asset{display:inline-flex;gap:4px;align-items:center}
.ved-asset select{height:26px;max-width:150px;font-size:var(--text-label)}
.ved-copy pre{white-space:pre-wrap;font:inherit;font-size:var(--text-label);color:var(--text-secondary);background:var(--bg-panel);padding:6px 8px;border-radius:var(--radius-control);margin:4px 0}
.ved-checks{display:flex;gap:16px;margin-top:12px;font-size:var(--text-caption);color:var(--text-secondary)}
.ved-checks label{display:flex;gap:6px;align-items:center;cursor:pointer}
.ved-checks input{accent-color:var(--accent);margin:0}
.ved-go{display:flex;gap:8px;margin-top:14px}
.ved-go .primary{flex:1}
.ved-jobs{display:flex;flex-direction:column;gap:8px}
.ved-job{padding:10px;border:1px solid var(--border-soft);border-radius:var(--radius-control);background:var(--bg-elevated)}
.ved-job[aria-current=true]{border-color:var(--accent)}
.ved-job header{display:flex;gap:8px;align-items:baseline}
.ved-job header strong{flex:1;font-size:var(--text-caption);font-weight:560;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ved-job header small,.ved-job p{font-size:var(--text-label);color:var(--text-tertiary)}
.ved-job p{margin:4px 0 0;overflow-wrap:anywhere}
.ved-job p.error{color:var(--status-error)}
.ved-job .actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.ved-bar-progress{height:3px;margin-top:8px;border-radius:2px;background:var(--bg-hover);overflow:hidden}
.ved-bar-progress i{display:block;height:100%;background:var(--accent);transition:width .3s var(--ease,ease)}
.ved-exports{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px}
.ved-exports li{display:flex;gap:6px;align-items:center;font-size:var(--text-label);color:var(--text-secondary)}
.ved-exports li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ved-stage{display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-width:0;min-height:0}
.ved-top{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border-soft);background:var(--bg-panel);min-height:48px}
.ved-top .title{flex:1;min-width:0;display:flex;flex-direction:column}
.ved-top .title strong{font-size:var(--text-caption);font-weight:560;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ved-top .title small{font-size:var(--text-label);color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ved-top .title small.error{color:var(--status-error)}
.ved-top .meter{width:120px}
.ved-frame-wrap{position:relative;min-height:0;background:#1b1c1f}
.ved-frame-wrap iframe{position:absolute;inset:0;width:100%;height:100%!important;border:0;display:block;background:#1b1c1f}
.ved-cover{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,10,12,.72);backdrop-filter:blur(2px)}
.ved-cover[hidden]{display:none}
.ved-cover>div{max-width:440px;padding:22px 24px;border:1px solid var(--border-mid);border-radius:var(--radius-card);background:var(--bg-panel);box-shadow:var(--shadow-xl,0 20px 60px rgba(0,0,0,.5))}
.ved-cover h2{margin:0 0 8px;font-size:var(--text-title);font-weight:600}
.ved-cover p{margin:0 0 6px;color:var(--text-secondary);font-size:var(--text-caption);line-height:1.5}
.ved-cover ol{margin:8px 0 14px;padding-left:18px;color:var(--text-secondary);font-size:var(--text-caption);line-height:1.6}
.ved-player{padding:0;border:1px solid var(--border-mid);border-radius:var(--radius-card);background:#000;overflow:hidden;max-width:92vw;max-height:92vh}
.ved-player[open]{display:flex;flex-direction:column}
.ved-player::backdrop{background:rgba(0,0,0,.72)}
.ved-player header{display:flex;gap:8px;align-items:center;padding:8px 10px;background:var(--bg-panel);font-size:var(--text-label);color:var(--text-secondary);border-bottom:1px solid var(--border-soft)}
.ved-player header span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ved-player video{display:block;width:auto;height:auto;max-width:92vw;max-height:calc(92vh - 46px);min-width:320px;background:#000}
.ved-chat{border-top:1px solid var(--border-soft);background:var(--bg-panel);display:flex;flex-direction:column;min-height:0}
.ved-chat-log{max-height:min(38vh,360px);overflow:auto;padding:10px 14px 4px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;border-bottom:1px solid var(--border-soft)}
.ved-chat-log[hidden]{display:none}
.ved-msg{max-width:78%;padding:7px 10px;border-radius:10px;font-size:var(--text-caption);line-height:1.45;overflow-wrap:anywhere}
.ved-msg.user{align-self:flex-end;background:var(--bg-active);color:var(--text-primary)}
.ved-msg.editor{align-self:flex-start;background:var(--bg-elevated);border:1px solid var(--border-soft);color:var(--text-secondary)}
.ved-msg.editor b{color:var(--text-primary);font-weight:560}
.ved-msg small{display:block;margin-top:3px;font-size:var(--text-label);color:var(--text-tertiary)}
.ved-msg .actions{display:flex;gap:6px;margin-top:6px}
.ved-chat-form{display:flex;gap:8px;align-items:center;padding:8px 10px}
.ved-chat-form input{flex:1;min-width:0;height:34px!important;font-size:var(--text-caption)!important}
.ved-chat-last{flex:0 1 auto;max-width:36%;min-width:0;font-size:var(--text-label);color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ved-chat-busy{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid var(--border-mid);border-top-color:var(--accent);animation:ved-spin .8s linear infinite;vertical-align:-1px;margin-right:6px}
@keyframes ved-spin{to{transform:rotate(360deg)}}
.workspace-main.ved-full{padding:0!important;overflow:hidden!important}
.workspace-main.ved-full>:not(#editor-host){display:none!important}
.workspace-main.ved-full>#editor-host{max-width:none!important;margin:0!important}
.ved.is-full{border-top:0}
@media (max-width:900px){.ved{grid-template-columns:1fr;grid-template-rows:auto minmax(560px,1fr);height:auto}.ved-side{max-height:none;border-right:0;border-bottom:1px solid var(--border-soft)}.ved.side-closed .ved-side{display:none}}
`;

// Full screen: the office around the editor (sidebar, Chief bar, page header) steps aside; the editor fills the window.
const FULL_STYLE = 'body.hq-editor-full #hq-nav,body.hq-editor-full #chief-dock{display:none!important}'
  + 'body.hq-editor-full #cockpit-panel{inset:0!important;top:0!important;left:0!important;right:0!important;bottom:0!important;border-radius:0!important;border:0!important;z-index:150!important}';

export function createEditor({ esc }) {
  const S = {
    host: null, el: null, frame: null, status: null, routes: [], listing: null, folder: remember.get(KEYS.folder, null), info: new Map(),
    selected: new Set(), anchor: null, route: remember.get(KEYS.route, 'reel-talking-head'),
    options: { aspect: 'source', language: 'auto', count: '', captions: true, cleanup: true, ...remember.get(KEYS.options, {}) },
    roles: {}, brief: '',
    jobs: [], current: null, poll: null, watch: null, autoOpen: null, upload: null, dirty: false, savedAt: null, message: '', error: '', visible: false, fitObserver: null,
    full: remember.get(KEYS.full, false), reg: new Map(),
    chat: { messages: [], open: remember.get(KEYS.chat, false), busy: false, draft: '', lastApplied: -1, loadedFor: undefined },
  };
  const $ = s => S.el?.querySelector(s);
  const route = () => S.routes.find(r => r.id === S.route);

  // --- the FilmCraft frame -------------------------------------------------------------------------------------
  let ready = null;
  function app() {
    return ready ??= new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const w = S.frame?.contentWindow;
        try {
          if (w?.filmcraftLoad?.error) return reject(new Error('The editor did not start: ' + w.filmcraftLoad.error));
          if (w?.filmcraftLoad?.readyMs && w.filmcraft) return resolve(w.filmcraft);
        } catch {}
        if (Date.now() - started > 90000) return reject(new Error('The editor took too long to start. Reload the page.'));
        setTimeout(check, 120);
      };
      check();
    }).then(async fc => {
      // brand fonts (Satoshi…) so captions and graphics look the same here as in the native export
      try { const f = await call('fonts'); if (f.fonts?.length && typeof fc.addFonts === 'function') S.fontFaces = await fc.addFonts(f.fonts.map(x => x.url)) } catch {}
      return fc;
    }).catch(e => { ready = null; throw e });
  }
  // FilmCraft hands every file it writes to the host first (patch in editor/patches): project saves go back to Agent
  // HQ as a new version of the edit; an export made inside FilmCraft is stored next to the footage.
  function onWrite(path, data) {
    const job = S.current;
    if (!job) return false;
    const copy = new Uint8Array(data);
    if (/\.fcproj$/i.test(path)) {
      S.upload = (async () => {
        try {
          const doc = JSON.parse(new TextDecoder().decode(copy));
          const r = await call('jobs/' + job.id + '/project', { project: doc, mapping: job.mapping });
          S.dirty = false; S.savedAt = r.saved; S.error = ''; bar();
          // a clip dropped straight into the editor: it joins the edit (found in the footage folder, else copied next to
          // the footage), then the project is saved again with its real path
          if (r.unmapped?.length) adoptDropped().then(n => { if (n) saveNow().catch(() => {}) });
          return r;
        } catch (e) { S.error = 'Not saved: ' + e.message; bar(); throw e }
      })();
      return true;
    }
    if (/^\/exports\//.test(path)) {
      call('save?' + new URLSearchParams({ folder: job.folder, name: base(path) }), copy, { raw: true })
        .then(r => { S.message = 'Saved ' + r.name + ' in ' + base(r.folder); bar(); refreshJobs() })
        .catch(e => { S.error = 'Export not saved: ' + e.message; bar() });
      return true;
    }
    return false;
  }

  function registerOnce(fc, list) {
    if (typeof fc.registerRanged !== 'function') return null;
    const k = x => x.url + '|' + x.size, todo = list.filter(x => !S.reg.has(k(x)));
    if (todo.length) { const vp = fc.registerRanged(todo); if (!vp) return null; todo.forEach((x, i) => S.reg.set(k(x), vp[i])) }
    return list.map(x => S.reg.get(k(x)));
  }

  async function openJob(id, { quiet } = {}) {
    const job = S.jobs.find(j => j.id === id) || await call('jobs/' + id);
    if (S.current?.id && S.current.id !== id && S.dirty) await saveNow().catch(() => {});
    S.message = 'Opening ' + (job.label || 'the edit') + '…'; S.error = ''; S.lastExport = null; bar();
    try {
      const fc = await app(), W = S.frame.contentWindow;
      const page = await call('jobs/' + id + '/project');   // every edit is built on this Mac first
      const project = page.project, media = (page.media || job.media || []).map(m => ({ ...m, url: m.url || mediaUrl(m.path) }));
      if (!media.length) throw new Error('This edit has no footage.');
      let px = []; try { px = (await call('jobs/' + id + '/proxies')).proxies || [] } catch {}
      // The footage is registered (read in chunks over HTTP Range, never copied), not imported again.
      const register = list => registerOnce(fc, list);
      const paths = register(media.map(m => ({ url: m.url, name: m.name, size: m.size }))) || (await fc.importRanged(media.map(m => ({ url: m.url, name: m.name, size: m.size })))).paths;
      const toVirtual = {}, toReal = {};
      media.forEach((m, i) => { toVirtual[m.path] = paths[i]; toReal[paths[i]] = m.path });
      const ready = px.filter(p => p.ready);
      mapProxies(ready, register, toVirtual, toReal);
      // smooth playback from the first frame: proxies on before the project opens, so the preview never has to read a
      // multi-gigabyte original while it opens (the export always reads the originals)
      if (ready.length) { try { await fc.execute('media.toggleProxies', { enabled: true }) } catch {} }
      const r = await fc.openProject(new W.File([JSON.stringify(swapPaths(project, toVirtual))], projectName(job.label), { type: 'application/json' }));
      if (r.missingMedia) S.error = r.missingMedia + ' clip(s) are offline: the footage moved or was renamed.';
      S.current = { id, label: job.label, folder: job.folder, mapping: toReal, proxied: new Set(), adopted: new Set(), failed: new Map() };
      await attachProxies(fc, ready);
      if (px.some(p => p.needed && !p.ready)) waitForProxies(id);
      S.dirty = false; S.savedAt = job.saved || job.updated; S.message = S.message.startsWith('Opening') ? '' : S.message;
      if (S.frame.getBoundingClientRect().width < 1000 && !S.root.classList.contains('side-closed')) { S.root.classList.add('side-closed'); S.autoClosed = true }
      cover(false); bar(); jobsList(); watch(); loadChat(id);
      if (job.route === 'manual') attachTranscripts(id, media, await itemsByName(fc, media));
      S.frame.focus();
    } catch (e) { S.message = ''; S.error = e.message; bar(); if (!quiet) throw e }
  }

  // Playback proxies (light H.264 made on this Mac for 4K / 60 fps / HEVC footage): the preview reads them, the
  // export always reads the originals (FilmCraft's own proxy model).
  const proxyName = name => String(name).replace(/\.[^.]+$/, '') + '_Proxy.mp4';
  function mapProxies(list, register, toVirtual, toReal) {
    if (!list.length) return;
    const vp = register(list.map(p => ({ url: p.url, name: proxyName(p.name), size: p.size })));
    if (!vp) return;
    list.forEach((p, i) => { toVirtual[p.proxy] = vp[i]; toReal[vp[i]] = p.proxy; p.virtual = vp[i] });
  }
  async function itemsByName(fc, media) {
    const kids = ((await fc.execute('project.inspect', {})).root?.children || []);
    return media.map(m => kids.find(k => k.name === m.name)?.item);
  }
  async function attachProxies(fc, list) {
    if (!list.length || !S.current) return;
    const ids = await itemsByName(fc, list), items = [], paths = [];
    list.forEach((p, i) => { if (ids[i] != null && p.virtual && !S.current.proxied.has(p.path)) { items.push(ids[i]); paths.push(p.virtual) } });
    for (let i = 0; i < items.length; i++) {
      try { await fc.execute('media.attachProxies', { item: items[i], path: paths[i], force: true }); S.current.proxied.add(list.find(p => p.virtual === paths[i]).path) } catch {}
    }
    try { await fc.execute('media.toggleProxies', { enabled: true }) } catch {}
    if (items.length) { S.message = 'Smooth playback: ' + items.length + ' proxy clip' + (items.length === 1 ? '' : 's') + ' attached (export uses the originals)'; bar(); setTimeout(() => { if (/^Smooth playback/.test(S.message)) { S.message = ''; bar() } }, 5000) }
  }
  async function waitForProxies(id) {
    for (let n = 0; n < 300 && S.current?.id === id; n++) {
      let px = []; try { px = (await call('jobs/' + id + '/proxies')).proxies || [] } catch { return }
      const need = px.filter(p => p.needed), fresh = px.filter(p => p.ready && !S.current.proxied.has(p.path));
      if (fresh.length) {
        const fc = await app();
        mapProxies(fresh, list => registerOnce(fc, list), {}, S.current.mapping);
        await attachProxies(fc, fresh);
      }
      if (need.every(p => p.ready)) return;
      if (!/^Smooth playback/.test(S.message)) { S.message = 'Preparing smooth playback: ' + need.filter(p => p.ready).length + ' of ' + need.length + ' proxies ready'; bar() }
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  // Editing by hand: transcripts arrive in the background (cached ones at once), so text-based editing and FilmCraft's
  // own caption tools work there too.
  async function attachTranscripts(id, media, items) {
    const language = S.options.language || 'auto';
    for (const [i, m] of media.entries()) {
      for (let tries = 0; tries < 240 && S.current?.id === id; tries++) {
        let r;
        try { r = await call('transcript?' + new URLSearchParams({ path: m.path, language })) } catch { break }
        if (r.ready) {
          if (r.transcript?.words?.length && S.current?.id === id) {
            try { await (await app()).execute('transcript.set', { item: items[i], transcript: r.transcript }); S.message = 'Transcript ready: edit by text or add captions (Sequence menu)'; bar(); setTimeout(() => { if (/^Transcript ready/.test(S.message)) { S.message = ''; bar() } }, 6000) } catch {}
          }
          break;
        }
        if (!tries) { S.message = 'Transcribing ' + m.name + ' for text editing…'; bar() }
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  async function saveNow() {
    if (!S.current) return null;
    const fc = await app();
    S.upload = null;
    await fc.execute('file.save', {});
    if (!S.upload) throw new Error('The editor did not hand over the project.');
    return S.upload;
  }

  async function exportNow() {
    if (!S.current) return;
    const id = S.current.id;
    S.message = 'Saving…'; S.error = ''; S.lastExport = null; bar();
    try {
      await saveNow();
      await call('jobs/' + id + '/render', {});
      S.exporting = true; S.message = 'Exporting…'; bar(0);
      await refreshJobs(); follow();
    } catch (e) { S.message = ''; S.error = e.message; bar() }
  }

  // Changes in the frame are noticed (dirty flag) and saved to Agent HQ after a short pause, so work is never lost.
  function watch() {
    clearInterval(S.watch);
    let since = 0;
    S.watch = setInterval(async () => {
      if (!S.current || !S.visible) return;
      try {
        const fc = await app(), p = await fc.execute('project.inspect', {});
        if (p.dirty && !S.dirty) { S.dirty = true; since = Date.now(); bar() }
        if (!p.dirty && S.dirty && !S.upload) { S.dirty = false; bar() }
        if (p.dirty && Date.now() - since > 20000) { since = Date.now(); await saveNow() }
        await adoptDropped();
      } catch {}
    }, 2000);
  }

  // Clips dropped into the editor (from Finder or its own import) arrive as files without a path. They join the edit:
  // the same file in the footage folder (name and size) is linked, anything else is copied next to the footage in
  // "Agent HQ edits/Imported", so saves map it and the native export finds it.
  async function adoptDropped() {
    const job = S.current;
    if (!job || S.adopting) return 0;
    const fc = await app();
    if (typeof fc.files !== 'function') return 0;
    S.adopting = true; let added = 0;
    try {
      // everything this page registered itself (footage and proxies of any edit opened in this session) is not a drop
      const known = new Set([...Object.keys(job.mapping || {}), ...S.reg.values()]);
      const fresh = ((await fc.files()) || []).filter(f => f?.path && /^\/files\//.test(f.path) && !known.has(f.path) && !job.adopted.has(f.path) && !job.failed.has(f.path));
      for (const f of fresh) {
        const name = base(f.path);
        const match = (S.listing?.files || []).find(x => x.name === name && Number(x.size) === Number(f.size))
          || S.jobs.flatMap(j => j.media || []).find(m => m.name === name && Number(m.size) === Number(f.size));
        S.message = 'Adding ' + name + ' to this edit…'; bar();
        try {
          let r;
          if (match) r = await call('jobs/' + job.id + '/media', { files: [match.path] });
          else {
            if (typeof fc.readFile !== 'function') throw new Error('this editor build cannot hand over dropped files');
            if (Number(f.size) > 4e9) throw new Error('larger than 4 GB: put it in the footage folder and add it from the footage column');
            const data = await fc.readFile(f.path);
            r = await call('jobs/' + job.id + '/upload?' + new URLSearchParams({ name }), data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? data : new Uint8Array(data), { raw: true });
          }
          const real = r.media?.[0]?.path;
          if (!real) throw new Error('not added');
          job.mapping[f.path] = real; job.adopted.add(f.path); added++;
          S.message = 'Added ' + name + ' to this edit' + (match ? '' : ' (copied to Agent HQ edits/Imported)'); S.error = ''; S.dirty = true; bar();
          setTimeout(() => { if (/^Added /.test(S.message)) { S.message = ''; bar() } }, 6000);
        } catch (e) { const why = String(e?.message || e || 'unknown error'); job.failed.set(f.path, why); S.message = ''; S.error = name + ' could not join this edit: ' + why; bar() }
      }
    } finally { S.adopting = false }
    if (added) refreshJobs();
    return added;
  }

  // --- jobs ------------------------------------------------------------------------------------------------------
  async function refreshJobs() {
    try { S.jobs = (await call(S.jobsAll ? 'jobs?limit=500' : 'jobs')).jobs || [] } catch (e) { S.error = e.message }
    jobsList();
    if (S.autoOpen) {
      const j = S.jobs.find(x => x.id === S.autoOpen);
      if (j && j.state === 'ready') { S.autoOpen = null; if (j.project && S.visible) openJob(j.id, { quiet: true }) }
      else if (j && j.state === 'failed') S.autoOpen = null;
    }
    if (S.graphicsFor) {
      const g = S.jobs.find(j => j.id === S.graphicsFor);
      if (g && !BUSY.has(g.state)) { const id = S.graphicsFor; S.graphicsFor = null; if (S.current?.id === id && g.graphics?.items?.length) openJob(id, { quiet: true }) }
    }
    const mine = S.jobs.find(j => j.id === S.current?.id);
    if (mine?.state === 'rendering') { S.exporting = true; S.message = mine.step || 'Exporting…'; bar(mine.progress) }
    else if (S.exporting && mine) {
      S.exporting = false;
      const done = (mine.exports || []).filter(x => x.path && /\.(mp4|mov)$/i.test(x.path)).pop();
      if (mine.error) { S.message = ''; S.error = mine.error }
      else { S.message = ''; S.lastExport = done?.path || null }
      bar();
    }
    return S.jobs;
  }
  function follow() {
    clearTimeout(S.poll);
    if (!S.visible) return;
    if (S.jobs.some(j => BUSY.has(j.state))) S.poll = setTimeout(async () => { await refreshJobs(); follow() }, 1000);
  }

  async function start(manual) {
    const files = [...S.selected];
    if (!files.length) return;
    const btn = $(manual ? '[data-ved=manual]' : '[data-ved=make]'); if (btn) btn.disabled = true;
    S.error = '';
    try {
      const r = route();
      const options = { ...S.options, count: S.options.count ? Number(S.options.count) : undefined, aspect: manual ? S.options.aspect : aspectFor(r) };
      // which clip talks and which is b-roll the server hears for itself (a short speech check per clip)
      const job = await call('jobs', { route: manual ? 'manual' : S.route, files, options, brief: !manual && (r?.needs_brief || r?.brief) ? S.brief : undefined });
      await refreshJobs();
      S.autoOpen = job.id; follow();   // built on this Mac first (by hand too), then it opens by itself
    } catch (e) { S.error = e.message; side() }
    finally { if (btn) btn.disabled = false }
  }

  // --- footage -----------------------------------------------------------------------------------------------------
  async function browse(path) {
    S.error = '';
    try { S.listing = await call('browse?' + new URLSearchParams(path ? { path } : {})) }
    catch (e) {
      if (path) { S.error = e.message; S.listing = await call('browse').catch(() => S.listing) } else S.error = e.message;
    }
    if (S.listing?.path) { S.folder = S.listing.path; remember.set(KEYS.folder, S.folder) }
    // a selection is per folder: footage of one edit lives together
    if (S.listing?.path && [...S.selected].some(p => !p.startsWith(S.listing.path + '/'))) S.selected.clear();
    footage();
    const files = (S.listing?.files || []).filter(f => !S.info.has(f.path)).slice(0, 300).map(f => f.path);
    if (files.length) {
      try { for (const f of (await call('probe', { paths: files })).files) S.info.set(f.path, f) } catch {}
      footage();
    }
  }

  function fileMeta(f) {
    const i = S.info.get(f.path) || {};
    const parts = [];
    if (i.duration) parts.push(clock(i.duration));
    if (i.video?.width) parts.push(i.video.width + '×' + i.video.height + (i.video.fps ? ' · ' + Math.round(i.video.fps * 100) / 100 + ' fps' : ''));
    else if (f.kind === 'audio') parts.push('audio');
    parts.push(bytes(f.size));
    if (i.error) return 'Cannot be read';
    return parts.join(' · ');
  }

  // --- rendering -------------------------------------------------------------------------------------------------
  function shell() {
    S.el.innerHTML = '<style>' + STYLE + '</style><div class="ved' + (remember.get(KEYS.side, true) ? '' : ' side-closed') + '">'
      + '<aside class="ved-side" aria-label="Edit formats and footage"><section class="ved-block" data-part="make"></section><section class="ved-block" data-part="footage"></section><section class="ved-block ved-go-block" data-part="go"></section><section class="ved-block" data-part="jobs"></section></aside>'
      + '<div class="ved-stage"><header class="ved-top" data-part="bar"></header><div class="ved-frame-wrap">'
      + '<iframe title="187N Video Engine" src="' + APP + '" allow="fullscreen; clipboard-read; clipboard-write; autoplay"></iframe>'
      + '<div class="ved-cover" data-part="cover"></div></div><section class="ved-chat" data-part="chat" aria-label="Talk to the editor"></section></div>'
      + '</div>'
      + '<dialog class="ved-player" data-part="player"></dialog>';
    S.frame = S.el.querySelector('iframe');
    S.root = S.el.querySelector('.ved');
    chatBar();
  }

  function footage() {
    const el = $('[data-part=footage]'); if (!el) return;
    const L = S.listing, roots = L?.roots || [];
    const rootOf = L?.path ? roots.filter(r => L.path === r.path || L.path.startsWith(r.path.replace(/\/$/, '') + '/')).sort((a, b) => b.path.length - a.path.length)[0] : null;
    let crumbs = '';
    if (rootOf) {
      const rel = L.path.slice(rootOf.path.length).split('/').filter(Boolean);
      let acc = rootOf.path;
      crumbs = '<p class="ved-crumbs"><button data-ved="open" data-path="' + esc(rootOf.path) + '">' + esc(rootOf.name) + '</button>'
        + rel.map(part => { acc += '/' + part; return ' / <button data-ved="open" data-path="' + esc(acc) + '">' + esc(part) + '</button>' }).join('') + '</p>';
    }
    const files = L?.files || [];
    const total = [...S.selected].reduce((s, p) => s + (S.info.get(p)?.duration || 0), 0);
    el.innerHTML = '<h3>2 · Footage<span class="grow"></span><button class="small" data-ved="pick" title="Choose a folder in Finder">Choose folder…</button></h3>'
      + '<div class="ved-row"><select data-ved="root" aria-label="Footage place">' + (L?.path ? '' : '<option value="">Choose a place…</option>')
      + roots.map(r => '<option value="' + esc(r.path) + '"' + (rootOf?.path === r.path ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select>'
      + (L?.parent ? '<button class="icon" data-ved="open" data-path="' + esc(L.parent) + '" title="Up one folder" aria-label="Up one folder">↑</button>' : '')
      + (L?.path ? '<button class="icon" data-ved="refresh-folder" title="Read the folder again" aria-label="Read the folder again">↻</button>' : '') + '</div>'
      + crumbs
      + (L?.folders?.length ? '<div class="ved-folders">' + L.folders.slice(0, 200).map(f => '<button data-ved="open" data-path="' + esc(f.path) + '" title="' + esc(f.name) + '">' + esc(f.name) + '</button>').join('') + '</div>' : '')
      + (L?.path ? (files.length
        ? '<div class="ved-files" role="listbox" aria-multiselectable="true" aria-label="Clips in this folder">' + files.map(f => {
          const on = S.selected.has(f.path);
          const thumb = f.kind === 'audio' ? '<span class="ved-thumb audio" aria-hidden="true">♪</span>' : '<img class="ved-thumb" loading="lazy" decoding="async" alt="" src="' + API + 'thumb?path=' + encodeURIComponent(f.path) + '">';
          return '<div class="ved-file" role="option" tabindex="0" aria-checked="' + on + '" data-ved="file" data-path="' + esc(f.path) + '"><input type="checkbox" tabindex="-1" aria-hidden="true"' + (on ? ' checked' : '') + '>' + thumb
            + '<span><strong title="' + esc(f.name) + '">' + esc(f.name) + '</strong><small>' + esc(fileMeta(f)) + '</small></span>'
            + '<button class="play icon small" data-ved="preview" data-path="' + esc(f.path) + '" title="Play" aria-label="Play ' + esc(f.name) + '">▶</button></div>';
        }).join('') + '</div>'
          + '<div class="ved-selection"><span>' + (S.selected.size ? S.selected.size + ' selected' + (total ? ' · ' + clock(total) : '') : files.length + ' clips · click to select, shift-click for a range') + '</span>'
          + '<button class="small" data-ved="select-all">All</button>' + (S.selected.size ? '<button class="small" data-ved="select-none">None</button>' : '') + '</div>'
          + (S.current && S.selected.size ? '<div class="ved-row" style="margin-top:8px"><button class="small" data-ved="add-media" title="Put the selected clips in the bin of the edit that is open">Add to this edit</button></div>' : '')
        : '<p class="ved-note">No video, audio or images in this folder.</p>') : '<p class="ved-note">Pick a place, or choose any footage folder in Finder.</p>')
      + (S.error && !S.current ? '<p class="ved-note error" role="alert">' + esc(S.error) + '</p>' : '');
    make();
  }

  // A reel is vertical unless another frame is chosen: "Source" would follow landscape b-roll.
  const isReel = r => r?.group === 'Reels' && r?.mode !== 'remake' && !r?.canvas;
  function aspectFor(r) { return isReel(r) && (!S.options.aspect || S.options.aspect === 'source') ? '9:16' : S.options.aspect }
  function make() {
    const el = $('[data-part=make]'); if (!el) return;
    const ready = S.routes.filter(r => r.available), later = S.routes.filter(r => !r.available), r = route();
    const st = S.status, agentOk = st?.agent?.ready, speechOk = st?.speech?.model && st?.speech?.python;
    const needsAgent = r?.ai_selection || r?.agent, blocked = !r?.available ? r?.reason : needsAgent && !agentOk ? (st?.agent?.reason || 'The agent is not available.') : r?.speech && !speechOk ? 'The speech model is not installed on this Mac.'
      : r?.needs_brief && S.brief.trim().length < 20 ? 'Write the brief first.'
      : r?.requires && st?.[r.requires] && !st[r.requires].ready ? st[r.requires].reason : '';
    const cur = key => key === 'aspect' && r?.mode !== 'remake' && !r?.canvas ? aspectFor(r) : S.options[key];
    const seg = (key, list) => '<div class="ved-seg" role="group">' + list.map(([v, l]) => '<button type="button" data-ved="opt" data-key="' + key + '" data-value="' + esc(v) + '" aria-pressed="' + (String(cur(key) ?? '') === v) + '">' + esc(l) + '</button>').join('') + '</div>';
    const d = r?.duration;
    el.innerHTML = '<h3>1 · Format</h3>'
      + '<div class="ved-row"><select data-ved="route" aria-label="Edit format">'
      + [...new Set([...(S.groups || []), ...ready.map(x => x.group || 'Formats')])].filter(g => ready.some(x => (x.group || 'Formats') === g)).map(g => '<optgroup label="' + esc(g) + '">' + ready.filter(x => (x.group || 'Formats') === g).map(x => '<option value="' + esc(x.id) + '"' + (x.id === S.route ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</optgroup>').join('')
      + (later.length ? '<optgroup label="Not in the editor yet">' + later.map(x => '<option value="' + esc(x.id) + '" disabled>' + esc(x.label) + '</option>').join('') + '</optgroup>' : '') + '</select></div>'
      + (r ? '<p class="ved-note">' + esc(r.description || r.label) + (d ? ' · ' + d.min + '–' + d.max + ' s' : '') + '</p>' : '')
      + (r?.gaps?.length ? '<details class="ved-note"><summary>Done by hand for now (' + r.gaps.length + ')</summary>' + r.gaps.map(g => '<div>· ' + esc(g) + '</div>').join('') + '</details>' : '')
      + (r?.roles && S.selected.size ? '<p class="ved-note">The editor listens to each clip first: clips with speech become the talking part, the rest b-roll' + (r.roles.some(x => x.id === 'reference_video') ? ' (name the reference reel “ref…” or “reference…”)' : '') + '.</p>' : '')
      + (r?.needs_brief || r?.brief ? '<label class="ved-field"><span>' + esc(r.brief_label || 'Brief') + '</span><textarea data-ved="brief" rows="5" placeholder="' + esc(r.brief_hint || 'What should this video do?') + '">' + esc(S.brief) + '</textarea></label>' : '')
      + (r?.mode === 'postcopy' || r?.mode === 'transcript' ? '' : '<label class="ved-field"><span>Frame</span>' + seg('aspect', r?.canvas ? [['9:16', '9:16 (this format)']] : r?.mode === 'remake' ? [['source', 'Like the reference']] : isReel(r) ? ASPECTS.filter(([v]) => v !== 'source') : ASPECTS) + '</label>')
      + (Object.keys(S.brands || {}).length ? '<label class="ved-field"><span>Brand</span><select data-ved="brand">' + Object.entries(S.brands).map(([id, b]) => '<option value="' + esc(id) + '"' + ((S.options.brand || 'none') === id ? ' selected' : '') + '>' + esc(b.label) + '</option>').join('') + '</select></label>' : '')
      + (r?.speech ? '<label class="ved-field"><span>Spoken language</span>' + seg('language', LANGUAGES) + '</label>' : '')
      + (r?.mode === 'clips' ? '<label class="ved-field"><span>Number of clips</span>' + seg('count', COUNTS) + '</label>' : '')
      + (r?.speech && ['reel', 'split', 'ad'].includes(r?.mode) ? '<label class="ved-field" title="All content keeps every sentence; a length lets the agent drop the weakest whole sentences, never the hook or the point"><span>Length</span>' + seg('target_seconds', LENGTHS) + '</label>' : '')
      + (r?.speech && r?.mode !== 'transcript' ? '<div class="ved-checks">' + (r.captions ? '<label><input type="checkbox" data-ved="check" data-key="captions"' + (S.options.captions ? ' checked' : '') + '>Captions</label>' : '')
        + (r.cleanup ? '<label><input type="checkbox" data-ved="check" data-key="cleanup"' + (S.options.cleanup ? ' checked' : '') + '>Remove ums and pauses</label>' : '') + '</div>' : '')
      + (st && !st.editor?.ready ? '<p class="ved-note error">The 187N Video Engine is not installed on this Mac (projects/agent-hq/editor/build-web.sh).</p>' : '');
    const go = $('[data-part=go]');
    if (go) go.innerHTML = '<div class="ved-go" style="margin-top:0"><button class="primary" data-ved="make"' + (!S.selected.size || blocked ? ' disabled' : '') + '>' + (r?.mode === 'transcript' ? 'Transcribe' : r?.mode === 'postcopy' ? 'Write the post copy' : 'Make the edit') + '</button>'
      + '<button data-ved="manual"' + (S.selected.size ? '' : ' disabled') + ' title="Open the clips in the timeline without the agent">Edit by hand</button></div>'
      + (blocked ? '<p class="ved-note warn">' + esc(blocked) + '</p>' : !S.selected.size ? '<p class="ved-note">Select the clips in the footage list.</p>'
        : '<p class="ved-note">' + (r?.speech ? 'Clips with speech are transcribed first; the agent then makes the cut.' : 'The agent looks at the footage and picks the strongest shots.') + '</p>');
  }

  function qaBadge(qa) {
    if (!qa) return '';
    if (qa.error) return '<span class="ved-qa bad" title="' + esc(qa.error) + '">QA ?</span>';
    return '<span class="ved-qa ' + (qa.ok ? 'ok' : 'bad') + '" title="Delivery QA: ' + esc((qa.gates || []).map(g => (g.ok ? '✓ ' : g.advisory ? '• ' : '✗ ') + g.gate + ': ' + g.detail).join('\n')) + '">QA ' + qa.passed + '/' + qa.total + '</span>';
  }
  function qaDetail(qa) {
    if (!qa?.gates?.length) return '';
    return '<li class="ved-qa-list"><details><summary>Delivery QA</summary>' + qa.gates.map(g => '<div>' + (g.ok ? '✓' : g.advisory ? '•' : '✗') + ' <b>' + esc(g.gate) + '</b> ' + esc(g.detail) + '</div>').join('') + '<div>For a person: ' + esc((qa.for_a_person || []).join(', ')) + '</div></details></li>';
  }

  function missingRoles(r) {
    const have = new Set([...S.selected].map(f => S.roles[f] || guessRole(r, f, S.info.get(f))));
    return (r.roles || []).filter(x => x.required && !have.has(x.id)).map(x => ROLE_LABELS[x.id] || x.id);
  }

  function jobsList() {
    const el = $('[data-part=jobs]'); if (!el) return;
    const rows = S.jobsAll ? S.jobs : S.jobs.slice(0, 12);
    el.innerHTML = '<h3>Edits<span class="grow"></span><button class="small" data-ved="refresh-jobs" title="Refresh">↻</button></h3>'
      + (rows.length ? '<div class="ved-jobs">' + rows.map(j => {
        const busy = BUSY.has(j.state), exports = (j.exports || []).filter(x => x.path && /\.(mp4|mov)$/i.test(x.path));
        const transcripts = (j.exports || []).filter(x => x.path && /\.txt$/i.test(x.path));
        return '<article class="ved-job" aria-current="' + (S.current?.id === j.id) + '"><header><strong title="' + esc(j.label) + '">' + esc(j.label) + '</strong><small>' + esc(base(j.folder)) + '</small></header>'
          + '<p' + (j.state === 'failed' ? ' class="error"' : '') + '>' + esc(j.state === 'failed' ? j.error || 'Stopped' : j.error ? j.step + ': ' + j.error : j.step || j.state)
          + (j.clips ? ' · ' + j.clips + ' passage' + (j.clips === 1 ? '' : 's') : '') + '</p>'
          + (j.reels?.length && !busy ? '<details class="ved-note" open><summary>Reels (' + j.reels.length + ')</summary>' + j.reels.map(x => '<div>· ' + esc(x.name || x.sequence || '') + (x.hook ? ': “' + esc(x.hook) + '”' : '') + (x.start != null ? ' (' + Number(x.start).toFixed(1) + '–' + Number(x.end).toFixed(1) + ' s)' : '') + (x.qa && !x.qa.ok ? ' · ' + esc(x.qa.problem || 'check') : '') + '</div>').join('') + '</details>' : '')
          + (j.quarantined?.length && !busy ? '<details class="ved-note"><summary>Set aside (' + j.quarantined.length + ')</summary>' + j.quarantined.map(x => '<div>· ' + esc(x.name || base(x.path)) + ': ' + esc(x.reason || x.issue || '') + '</div>').join('') + '</details>' : '')
          + (j.role_notes?.length && !busy ? '<details class="ved-note"><summary>What the editor heard (' + j.role_notes.length + ')</summary>' + j.role_notes.slice(0, 20).map(n => '<div>· ' + esc(n) + '</div>').join('') + '</details>' : '')
          + (j.notes?.length && !busy ? '<details class="ved-note"><summary>Agent notes (' + j.notes.length + ')</summary>' + j.notes.slice(0, 8).map(n => '<div>· ' + esc(n) + '</div>').join('') + '</details>' : '')
          + (j.removed?.length && !busy ? '<details class="ved-note"><summary>Cut by the cleanup (' + j.removed.length + ')</summary>' + j.removed.slice(0, 30).map(x => '<div>· ' + esc(x.kind.replace('_', ' ')) + ': “' + esc(x.text) + '”</div>').join('') + '</details>' : '')
          + (j.tightened?.pauses && !busy ? '<p title="' + esc(j.tightened.method || '') + '">Pauses tightened on the waveform: ' + j.tightened.pauses + ' (' + j.tightened.seconds + ' s)</p>' : '')
          + (j.handoff && !busy ? '<p>In DaVinci Resolve: ' + esc(j.handoff.project) + ' (' + (j.handoff.timelines || []).map(t => esc(t.timeline) + ', ' + t.video_items + ' clips' + (t.subtitles ? ', ' + t.subtitles + ' subtitles' : '')).join('; ') + ')' + (j.handoff.drp ? ' <button class="small" data-ved="reveal" data-path="' + esc(j.handoff.drp) + '">.drp</button>' : '') + (j.handoff.notes?.length ? '<br><small>' + esc(j.handoff.notes.join('; ')) + '</small>' : '') + '</p>' : '')
          + (j.grade && !busy ? '<details class="ved-note"><summary>Colour grade (' + (j.grade.graded || 0) + ' of ' + (j.grade.shots || []).length + ' shots' + (j.grade.pending?.length ? ', ' + j.grade.pending.length + ' pending' : '') + ')</summary>'
            + '<div>Graded in the editor: ' + esc([j.grade.look?.lut ? j.grade.look.name : '', ...(j.grade.look?.fx || [])].filter(Boolean).join(', ')) + ' on the “CineKit look” layer (' + esc(j.grade.look?.track || 'V2') + ')</div>'
            + (j.grade.shots || []).map(s => '<div title="' + esc(s.evidence || '') + '">· ' + esc(s.name) + ': ' + esc(s.pending ? 'grade pending, ' + s.pending : (s.transform || '') + (s.exposure ? ', exposure ' + (s.exposure > 0 ? '+' : '') + s.exposure + ' stop' : '')) + '</div>').join('') + '</details>' : '')
          + (j.resolve ? '<p>Made before the in-editor grade; its grade is in DaVinci Resolve: ' + esc(j.resolve.project) + '</p>' : '')
          + (j.graphics?.items?.length ? '<details class="ved-note"><summary>Motion graphics (' + j.graphics.items.length + ')</summary>' + j.graphics.items.map(g => '<div>· ' + esc(g.type) + ': ' + esc(g.text) + ' (' + g.start + '–' + g.end + ' s)</div>').join('') + '<div>EffectCraft demo templates in the brand accent; not approved brand assets.</div></details>' : '')
          + (j.captions?.length ? '<details class="ved-note" open><summary>Post copy (' + j.captions.length + ')</summary>' + j.captions.map((c, i) => c.missing ? '' : '<div class="ved-copy"><b>' + esc(c.topic) + '</b> · ' + esc(c.status === 'ready' ? 'ready' : 'review') + (c.problems?.length ? ' · ' + esc(c.problems.join('; ')) : '') + '<pre>' + esc(c.caption_nl) + '</pre><button class="small" data-ved="copy" data-id="' + esc(j.id) + '" data-n="' + i + '">Copy</button></div>').join('') + '</details>' : '')
          + (busy ? '<div class="ved-bar-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round((j.progress || 0) * 100) + '"><i style="width:' + Math.round((j.progress || 0) * 100) + '%"></i></div>' : '')
          + (exports.length || transcripts.length ? '<ul class="ved-exports">' + exports.map(x => '<li><span title="' + esc(x.path) + '">' + esc(base(x.path)) + '</span>' + qaBadge(x.qa) + '<button class="small" data-ved="preview" data-path="' + esc(x.path) + '">Play</button><button class="small" data-ved="reveal" data-path="' + esc(x.path) + '">Finder</button></li>' + qaDetail(x.qa)).join('')
            + transcripts.map(x => '<li><span title="' + esc(x.path) + '">' + esc(base(x.path)) + '</span><button class="small" data-ved="reveal" data-path="' + esc(x.path) + '">Finder</button></li>').join('') + '</ul>' : '')
          + '<div class="actions">'
          + (!busy && (j.project || j.route === 'manual') ? '<button class="small' + (S.current?.id === j.id ? '' : ' primary') + '" data-ved="open-job" data-id="' + esc(j.id) + '">' + (S.current?.id === j.id ? 'Reopen' : 'Open in timeline') + '</button>' : '')
          + (!busy && j.project ? '<button class="small" data-ved="export-job" data-id="' + esc(j.id) + '">Export MP4</button>' : '')
          + (!busy && j.project && !j.resolve && S.status?.resolve?.ready ? '<button class="small" data-ved="resolve-job" data-id="' + esc(j.id) + '" title="Continue in DaVinci Resolve: a new project with this cut, its framing and the captions as subtitles">DaVinci Resolve</button>' : '')
          + (j.project_file ? '<button class="small" data-ved="reveal" data-path="' + esc(j.project_file) + '" title="The editable project next to the footage">Project</button>' : '')
          + (!busy && j.project ? '<button class="small" data-ved="graphics" data-id="' + esc(j.id) + '" title="EffectCraft lower thirds, chapters and callouts">Motion graphics</button>' : '')
          + (!busy && j.project && S.assetNotes?.[j.brand] ? '<p class="ved-note">' + esc(S.assetNotes[j.brand]) + '</p>' : '')
          + (!busy && j.project && S.assets?.[j.brand]?.length ? '<span class="ved-asset"><select data-asset-pick="' + esc(j.id) + '" aria-label="Brand asset">' + S.assets[j.brand].map(a => '<option value="' + esc(a.id) + '">' + esc(a.title ? a.title + ' (' + a.id + ')' : a.id) + '</option>').join('') + '</select><button class="small" data-ved="asset-add" data-id="' + esc(j.id) + '" title="Approved brand motion asset at the playhead">Add at playhead</button></span>' : '')
          + (!busy && exports.length ? '<button class="small" data-ved="postcopy" data-id="' + esc(j.id) + '" title="Dutch Instagram captions for the exported reels (drafts, never posted)">Post copy</button>' : '')
          + ((j.exports || []).some(x => /\.csv$/i.test(x.path || '')) ? (j.exports || []).filter(x => /\.csv$/i.test(x.path || '')).map(x => '<button class="small" data-ved="reveal" data-path="' + esc(x.path) + '">CSV</button>').join('') : '')
          + (busy && j.state !== 'rendering' && j.route !== 'manual' ? '<button class="small" data-ved="cancel" data-id="' + esc(j.id) + '">Cancel</button>' : '')
          + (j.state === 'failed' && j.route !== 'manual' ? '<button class="small" data-ved="retry" data-id="' + esc(j.id) + '">Try again</button>' : '')
          + '</div></article>';
      }).join('') + '</div>' : '<p class="ved-note">Your edits appear here. Each one keeps its project and exports in “Agent HQ edits” next to the footage.</p>')
      // older edits stay reachable (12 Oct 2026): the list shows the 12 most recent, "Show all edits" every one
      + (S.jobsAll || S.jobs.length > 12 ? '<button class="small" data-ved="more-jobs" style="margin-top:8px">' + (S.jobsAll ? 'Show recent edits only' : 'Show all edits') + '</button>' : '');
  }

  function bar(progress) {
    const el = $('[data-part=bar]'); if (!el) return;
    const c = S.current, sideOpen = !S.root?.classList.contains('side-closed');
    const sub = S.error ? '<small class="error" role="alert">' + esc(S.error) + '</small>'
      : S.message ? '<small>' + esc(S.message) + '</small>'
      : c ? '<small>' + (S.dirty ? 'Unsaved changes · saving shortly' : S.savedAt ? 'Saved ' + hm(S.savedAt) + ' · in ' + esc(base(c.folder)) + '/Agent HQ edits' : 'Opened') + '</small>'
      : '<small>Nothing open yet</small>';
    el.innerHTML = '<button class="icon" data-ved="side" title="' + (sideOpen ? 'Hide' : 'Show') + ' footage and formats" aria-label="' + (sideOpen ? 'Hide' : 'Show') + ' footage and formats" aria-expanded="' + sideOpen + '">' + (sideOpen ? '⟨' : '⟩') + '</button>'
      + '<div class="title"><strong>' + esc(c?.label || 'Video editor') + '</strong>' + sub + '</div>'
      + (progress !== undefined ? '<div class="ved-bar-progress meter" role="progressbar" aria-valuenow="' + Math.round(progress * 100) + '"><i style="width:' + Math.round(progress * 100) + '%"></i></div>' : '')
      + (S.lastExport && progress === undefined ? '<button class="small" data-ved="preview" data-path="' + esc(S.lastExport) + '" title="' + esc(base(S.lastExport)) + '">▶ Play export</button><button class="small" data-ved="reveal" data-path="' + esc(S.lastExport) + '">Finder</button>' : '')
      + (c ? '<button data-ved="save">Save</button><button class="primary" data-ved="export"' + (progress !== undefined ? ' disabled' : '') + '>Export MP4</button>' : '')
      + (S.full ? '<button data-ved="full" title="Back to the office (Esc)" aria-pressed="true">⤡ Exit full screen</button>'
        : '<button class="icon" data-ved="full" title="Full screen: the editor fills the window" aria-label="Full screen" aria-pressed="false">⤢</button>');
  }

  function cover(show) {
    const el = $('[data-part=cover]'); if (!el) return;
    el.hidden = !show;
    if (!show) { el.innerHTML = ''; return }
    el.innerHTML = '<div><h2>Edit a video</h2><p>The 187N Video Engine, a full timeline editor, runs right here. Your footage stays on this Mac.</p>'
      + '<ol><li>Pick a format on the left: a reel, clips, an ad, a rough cut.</li><li>Choose the footage folder and select the clips.</li><li>Press <b>Make the edit</b>. Spoken clips are transcribed, lifestyle shots are looked at, and the cut opens here. Change anything by hand or tell the editor in the bar below, then <b>Export MP4</b>.</li></ol>'
      + '<div class="ved-row"><button class="primary" data-ved="pick">Choose a folder…</button><button data-ved="dismiss">Use the editor empty</button></div></div>';
  }

  function side() { footage(); jobsList(); bar() }

  // --- full screen -------------------------------------------------------------------------------------------------
  function setFull(on) {
    S.full = !!on; remember.set(KEYS.full, S.full);
    if (!document.getElementById('ved-full-style')) { const st = document.createElement('style'); st.id = 'ved-full-style'; st.textContent = FULL_STYLE; document.head.append(st) }
    document.body.classList.toggle('hq-editor-full', S.full && S.visible);
    S.host?.closest?.('.workspace-main')?.classList.toggle('ved-full', S.full && S.visible);
    S.root?.classList.toggle('is-full', S.full && S.visible);
    bar(); fit(); requestAnimationFrame(fit);
  }

  // --- talking to the editor ------------------------------------------------------------------------------------------
  // The message goes with a snapshot of the open timeline; the reply's commands run here, in the open session, so the
  // change lands straight in the timeline (one Undo on the reply, or ⌘Z) and is saved like any other change.
  function msgHTML(m, i) {
    if (m.role === 'user') return '<div class="ved-msg user">' + esc(m.text) + '</div>';
    const undo = m.undo > 0 && !m.undone && i === S.chat.lastApplied;
    return '<div class="ved-msg editor' + (m.error ? ' error' : '') + '"><b>Editor</b> ' + esc(m.text)
      + (m.summary ? '<small>' + esc(m.summary) + (m.undone ? ' · undone' : '') + '</small>' : m.undone ? '<small>undone</small>' : '')
      + (undo || m.job ? '<div class="actions">' + (undo ? '<button class="small" data-ved="chat-undo" data-n="' + i + '">Undo</button>' : '') + (m.job ? '<button class="small" data-ved="open-job" data-id="' + esc(m.job) + '">Open the new edit</button>' : '') + '</div>' : '') + '</div>';
  }
  function chatBar() {
    const el = $('[data-part=chat]'); if (!el) return;
    const C = S.chat, open = C.open, last = [...C.messages].reverse().find(m => m.role === 'editor');
    const focused = el.contains(el.getRootNode().activeElement);
    el.innerHTML = '<div class="ved-chat-log" role="log" aria-live="polite"' + (open ? '' : ' hidden') + '>'
      + (C.messages.length ? C.messages.map(msgHTML).join('') : '<p class="ved-note">Tell the editor what to change: “make it 30 seconds”, “remove the sentence about the price”, “captions off”, “put the hook as text at the top”. Or give it a new task: “make a lifestyle montage from these clips”.</p>')
      + (C.busy ? '<div class="ved-msg editor"><span class="ved-chat-busy" aria-hidden="true"></span>Working on it…</div>' : '') + '</div>'
      + '<div class="ved-chat-form"><button type="button" class="icon small" data-ved="chat-toggle" aria-expanded="' + open + '" title="' + (open ? 'Hide' : 'Show') + ' the conversation">' + (open ? '▾' : '▴') + '</button>'
      + (!open && (C.busy || last) ? '<span class="ved-chat-last" title="' + esc(C.busy ? 'Working on it…' : last.text) + '">' + (C.busy ? '<span class="ved-chat-busy" aria-hidden="true"></span>Working on it…' : esc(last.text)) + '</span>' : '')
      + '<input type="text" data-ved="chat-input" placeholder="' + (S.current ? 'Tell the editor what to change…' : 'Ask the editor for an edit…') + '" aria-label="Message to the editor" maxlength="2000" autocomplete="off" value="' + esc(C.draft) + '"' + (C.busy ? ' disabled' : '') + '>'
      + '<button class="primary" data-ved="chat-send"' + (C.busy ? ' disabled' : '') + '>Send</button></div>';
    const log = el.querySelector('.ved-chat-log'); if (log) log.scrollTop = log.scrollHeight;
    if (focused && !C.busy) el.querySelector('[data-ved=chat-input]')?.focus();
  }
  async function loadChat(id) {
    if (S.chat.loadedFor === (id || null) || S.chat.busy) return;
    S.chat.loadedFor = id || null; S.chat.lastApplied = -1;
    try { S.chat.messages = ((await call('chat' + (id ? '?' + new URLSearchParams({ job: id }) : ''))).messages || []).map(m => ({ ...m, undo: 0 })) } catch { S.chat.messages = [] }
    chatBar();
  }
  async function snapshot() {
    const fc = await app(), seq = await fc.execute('sequence.inspect', {});
    const slim = t => ({ id: t.id, name: t.name, enabled: t.enabled, muted: t.muted, items: (t.items || []).map(i => ({ clip: i.clip, item: i.item, name: i.name, start: i.start, duration: i.duration, link: i.link, enabled: i.enabled })) });
    let transcript = null;
    try { const t = await fc.execute('transcript.inspect', {}); transcript = { words: (t.words || []).map(w => ({ i: w.i, text: w.text, start: w.start, end: w.end })), paragraphs: (t.paragraphs || []).map(p => ({ from: p.from, to: p.to })) } } catch {}
    return { sequence: { name: seq.name, duration: seq.duration, settings: { width: seq.settings?.width, height: seq.settings?.height, frame_rate: seq.settings?.frame_rate }, video: (seq.video || []).map(slim), audio: (seq.audio || []).map(slim), markers: (seq.markers || []).map(m => ({ name: m.name, start: m.start })) }, transcript };
  }
  async function undoCount() { try { return ((await (await app()).execute('history.list', {})).undo || []).length } catch { return 0 } }
  async function applyCommands(cmds) {
    const fc = await app(), before = await undoCount();
    let error = '';
    for (const c of cmds) { try { await fc.execute(c.id, c.params || {}) } catch (e) { error = c.id + ': ' + (e?.message || e); break } }
    return { steps: Math.max(0, (await undoCount()) - before), error };
  }
  async function undoChat(i) {
    const m = S.chat.messages[i]; if (!m?.undo || m.undone) return;
    const fc = await app();
    for (let n = 0; n < m.undo; n++) { try { await fc.execute('edit.undo', {}) } catch { break } }
    m.undone = true; S.chat.lastApplied = -1; chatBar();
    S.dirty = true; saveNow().catch(() => {});
  }
  async function sendChat() {
    const C = S.chat, input = $('[data-ved=chat-input]'), text = String(input?.value ?? C.draft).trim();
    if (!text || C.busy) return;
    C.messages.push({ role: 'user', text }); C.busy = true; C.open = true; C.draft = ''; remember.set(KEYS.chat, true); chatBar();
    try {
      if (S.current && S.dirty) await saveNow().catch(() => {});
      let timeline = null;
      if (S.current) { try { timeline = await snapshot() } catch {} }
      const r = await call('chat', { job: S.current?.id || null, text, timeline, footage: [...S.selected] });
      const m = { role: 'editor', text: r.reply, summary: r.summary, job: r.new_job?.id || null, undo: 0 };
      if (r.undo) { const i = S.chat.lastApplied; if (i >= 0) await undoChat(i) }
      if (r.commands?.length && S.current) {
        const done = await applyCommands(r.commands);
        m.undo = done.steps;
        if (done.error) m.summary = (m.summary ? m.summary + ' · ' : '') + 'stopped at ' + done.error;
        if (done.steps) { S.dirty = true; await saveNow().catch(() => {}) }
      }
      C.messages.push(m);
      if (m.undo) C.lastApplied = C.messages.length - 1;
      if (r.new_job) { S.autoOpen = r.new_job.id; await refreshJobs(); follow() }
      if (r.export) exportNow();
    } catch (e) { C.messages.push({ role: 'editor', text: e.message, error: true }) }
    finally { C.busy = false; chatBar(); $('[data-ved=chat-input]')?.focus() }
  }

  function player(path) {
    const d = $('[data-part=player]'); if (!d) return;
    d.innerHTML = '<header><span title="' + esc(path) + '">' + esc(base(path)) + '</span><button class="small" data-ved="reveal" data-path="' + esc(path) + '">Show in Finder</button><button class="small" data-ved="close-player" aria-label="Close the player">Close</button></header>'
      + '<video controls autoplay playsinline preload="metadata" src="' + esc(mediaUrl(path)) + '"></video>';
    if (!d.dataset.wired) {
      d.dataset.wired = '1';
      d.addEventListener('click', e => { if (e.target === d) d.close() });   // a click on the backdrop closes it
      d.addEventListener('close', () => { d.querySelector('video')?.pause(); d.innerHTML = '' });
    }
    d.showModal();
  }

  // --- events ----------------------------------------------------------------------------------------------------
  async function onClick(e) {
    const b = e.target.closest('[data-ved]'); if (!b || !S.el.contains(b)) return;
    const a = b.dataset.ved;
    if (a === 'chat-input' || a === 'brief') return;
    if (a === 'file') {
      if (e.target.closest('[data-ved=preview]')) return;
      const files = (S.listing?.files || []).map(f => f.path), p = b.dataset.path;
      if (e.shiftKey && S.anchor && files.includes(S.anchor)) {
        const [i, j] = [files.indexOf(S.anchor), files.indexOf(p)].sort((x, y) => x - y);
        files.slice(i, j + 1).forEach(f => S.selected.add(f));
      } else { S.selected.has(p) ? S.selected.delete(p) : S.selected.add(p); S.anchor = p }
      const keep = $('.ved-files')?.scrollTop; footage(); if (keep) $('.ved-files').scrollTop = keep;
      $('[data-path="' + CSS.escape(p) + '"][data-ved=file]')?.focus();
      return;
    }
    e.preventDefault();
    try {
      if (a === 'open') return browse(b.dataset.path);
      if (a === 'refresh-folder') { (S.listing?.files || []).forEach(f => S.info.delete(f.path)); return browse(S.folder) }
      if (a === 'pick') {
        b.disabled = true; const label = b.textContent; b.textContent = 'Waiting for Finder…';
        try { const r = await call('pick', {}); if (r.path) { cover(false); await browse(r.path) } }
        finally { b.disabled = false; b.textContent = label }
        return;
      }
      if (a === 'select-all') { (S.listing?.files || []).forEach(f => S.selected.add(f.path)); return footage() }
      if (a === 'select-none') { S.selected.clear(); return footage() }
      if (a === 'preview') return player(b.dataset.path);
      if (a === 'close-player') return $('[data-part=player]').close();
      if (a === 'reveal') return call('reveal', { path: b.dataset.path });
      if (a === 'opt') { S.options[b.dataset.key] = b.dataset.value; remember.set(KEYS.options, S.options); return make() }
      if (a === 'make') return start(false);
      if (a === 'asset-add') {
        const id = b.dataset.id, asset = S.el.querySelector('[data-asset-pick="' + CSS.escape(id) + '"]')?.value;
        let start = 0;
        if (S.current?.id === id) { await saveNow().catch(() => {}); try { start = ((await (await app()).execute('sequence.inspect', {})).playhead || 0) / 254016000000 } catch {} }
        await call('jobs/' + id + '/graphics', { items: [{ type: 'brand-asset', asset, start }] }); await refreshJobs(); S.graphicsFor = id; return follow();
      }
      if (a === 'graphics') { await call('jobs/' + b.dataset.id + '/graphics', {}); await refreshJobs(); S.graphicsFor = b.dataset.id; return follow() }
      if (a === 'postcopy') { const j = await call('jobs/' + b.dataset.id + '/postcopy', {}); await refreshJobs(); return follow() }
      if (a === 'copy') { const j = S.jobs.find(x => x.id === b.dataset.id), c = j?.captions?.[Number(b.dataset.n)]; if (c) { await navigator.clipboard.writeText(c.caption_nl).catch(() => {}); b.textContent = 'Copied' } return }
      if (a === 'add-media') {
        const job = S.current; if (!job) return;
        const r = await call('jobs/' + job.id + '/media', { files: [...S.selected] });
        const imp = await (await app()).importRanged(r.media.map(m => ({ url: m.url, name: m.name, size: m.size })));
        r.media.forEach((m, i) => { if (imp.paths[i]) job.mapping[imp.paths[i]] = m.path });
        S.message = imp.errors?.length ? '' : 'Added ' + r.media.length + ' clip' + (r.media.length === 1 ? '' : 's') + ' to the bin';
        S.error = imp.errors?.length ? 'FilmCraft could not read ' + imp.errors.join('; ') : ''; S.dirty = true; bar();
        waitForProxies(job.id);
        return;
      }
      if (a === 'manual') return start(true);
      if (a === 'refresh-jobs') { await refreshJobs(); return follow() }
      if (a === 'more-jobs') { S.jobsAll = !S.jobsAll; await refreshJobs(); return }
      if (a === 'open-job') return openJob(b.dataset.id);
      if (a === 'export-job') { if (S.current?.id !== b.dataset.id) await openJob(b.dataset.id); return exportNow() }
      if (a === 'resolve-job') {
        // the open timeline's latest changes go along: save first, then the worker rebuilds the saved cut in Resolve
        if (S.current?.id === b.dataset.id) { S.message = 'Saving…'; bar(); await saveNow(); S.message = ''; bar() }
        await call('jobs/' + b.dataset.id + '/resolve', {}); await refreshJobs(); return follow();
      }
      if (a === 'retry') {
        const j = S.jobs.find(x => x.id === b.dataset.id); if (!j) return;
        // the same request again: format, clips, options and brief as they were
        const job = await call('jobs', { route: j.route, files: j.files, options: j.options || {}, roles: j.roles || undefined, brief: j.brief || undefined });
        S.autoOpen = job.id; await refreshJobs(); return follow();
      }
      if (a === 'save') { S.message = 'Saving…'; bar(); await saveNow(); S.message = ''; return bar() }
      if (a === 'export') return exportNow();
      if (a === 'dismiss') return cover(false);
      if (a === 'full') return setFull(!S.full);
      if (a === 'chat-toggle') { S.chat.open = !S.chat.open; remember.set(KEYS.chat, S.chat.open); return chatBar() }
      if (a === 'chat-send') return sendChat();
      if (a === 'chat-undo') return undoChat(Number(b.dataset.n));
      if (a === 'chat-input') return;
      if (a === 'cancel') { await call('jobs/' + b.dataset.id + '/cancel', {}); await refreshJobs(); return follow() }
      if (a === 'side') { S.root.classList.toggle('side-closed'); S.autoClosed = false; remember.set(KEYS.side, !S.root.classList.contains('side-closed')); return bar() }
    } catch (err) { S.message = ''; S.error = err.message; bar(); if (!S.current) footage() }
  }
  function onChange(e) {
    const t = e.target.closest('[data-ved]'); if (!t) return;
    if (t.dataset.ved === 'root' && t.value) return browse(t.value);
    if (t.dataset.ved === 'route') { S.route = t.value; remember.set(KEYS.route, S.route); return make() }
    if (t.dataset.ved === 'check') { S.options[t.dataset.key] = t.checked; remember.set(KEYS.options, S.options) }
    if (t.dataset.ved === 'role') { S.roles[t.dataset.path] = t.value; return make() }
    if (t.dataset.ved === 'brand') { S.options.brand = t.value; remember.set(KEYS.options, S.options) }
  }
  function onInput(e) {
    const c = e.target.closest?.('[data-ved=chat-input]'); if (c) { S.chat.draft = c.value; return }
    const t = e.target.closest?.('[data-ved=brief]'); if (!t) return;
    S.brief = t.value;
    const go = $('[data-ved=make]'), r = route();
    if (go && r?.needs_brief) go.disabled = S.brief.trim().length < 20 || !S.selected.size;
  }
  function onKey(e) {
    const ci = e.target.closest?.('[data-ved=chat-input]');
    if (ci && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendChat(); return }
    if (ci && e.key === 'Escape') { ci.blur(); return }
    const row = e.target.closest?.('[data-ved=file]');
    if (row && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); row.click(); return }
    if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); (e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling)?.focus() }
  }

  // Fill the height below the page header down to the window's edge; the frame never scrolls with the page. The
  // header above can change size after the first paint (description, tabs, status), so its boxes are observed.
  function fit() {
    if (!S.visible || !S.host || S.host.hidden) return;
    // Same bottom as the other embedded consoles: the Chief of Staff bar sits over the last 66 px of the page.
    const main = S.host.parentElement, top = S.host.getBoundingClientRect().top;
    // full screen: the whole window (no Chief bar); else down to the Chief bar
    const limit = S.full ? innerHeight : Math.min(innerHeight, main ? main.getBoundingClientRect().top + main.clientHeight : innerHeight) - 58;
    const h = innerWidth <= 900 && !S.full ? 'auto' : Math.max(S.full ? 360 : 520, Math.floor(limit - Math.max(0, top) - (S.full ? 0 : 8))) + 'px';
    if (S.host.style.height !== h) S.host.style.height = h;
  }
  function observe() {
    S.fitObserver?.disconnect();
    if (typeof ResizeObserver !== 'function' || !S.host?.parentElement) return;
    S.fitObserver = new ResizeObserver(() => requestAnimationFrame(fit));
    S.fitObserver.observe(S.host.parentElement);
    for (let el = S.host.previousElementSibling; el; el = el.previousElementSibling) S.fitObserver.observe(el);
  }

  return {
    async show(host) {
      S.visible = true;
      if (S.host !== host) {
        S.host = host; S.el = host; host.hidden = false; shell();
        host.addEventListener('click', onClick); host.addEventListener('change', onChange); host.addEventListener('keydown', onKey); host.addEventListener('input', onInput);
        window.filmcraftHost = {
          onWrite,
          // a read the engine had to retry (patched engine): shown so a slow drive or a busy Mac is visible
          onReadError(path, message) { S.error = 'Reading ' + base(path) + ' failed (' + message + '). Retrying…'; bar(); clearTimeout(S.readErr); S.readErr = setTimeout(() => { if (/^Reading /.test(S.error)) { S.error = ''; bar() } }, 8000) },
        };
        addEventListener('resize', fit);
        // the engine's own full-screen button (patched engine) and Esc outside the editor
        addEventListener('message', e => { if (e.origin === location.origin && e.data?.source === '187n-video-engine' && e.data.type === 'fullscreen' && S.visible) setFull(!S.full) });
        addEventListener('keydown', e => { if (e.key === 'Escape' && S.full && S.visible && !e.defaultPrevented && !$('[data-part=player]')?.open && !e.composedPath().some(n => n?.dataset?.ved === 'chat-input')) setFull(false) });
        cover(true); bar();
        const [status, routes] = await Promise.all([call('status').catch(e => ({ error: e.message })), call('routes').catch(() => ({ routes: [] }))]);
        S.status = status; S.routes = routes.routes || []; S.brands = routes.brands || {}; S.groups = routes.groups || [];
        S.assets = {};
        S.assetNotes = {};
        for (const b of Object.keys(S.brands)) { try { const r = await call('brand-assets?brand=' + encodeURIComponent(b)); if (r.assets?.length) S.assets[b] = r.assets; if (r.note) S.assetNotes[b] = r.note } catch {} }
        if (!S.routes.some(r => r.id === S.route && r.available)) S.route = S.routes.find(r => r.available)?.id || S.route;
        await browse(S.folder);
        if (S.folder) cover(false);
      }
      host.hidden = false;
      setFull(S.full);
      if (!S.current) loadChat(null);
      observe(); fit(); requestAnimationFrame(fit);
      await refreshJobs(); follow();
      app().catch(e => { S.error = e.message; bar() });
    },
    hide() {
      S.visible = false; clearTimeout(S.poll); S.fitObserver?.disconnect(); if (S.current && S.dirty) saveNow().catch(() => {});
      // the office comes back when another page opens; the choice is remembered for the next visit
      document.body.classList.remove('hq-editor-full'); S.host?.closest?.('.workspace-main')?.classList.remove('ved-full'); S.root?.classList.remove('is-full');
    },
    state: () => S,
  };
}
