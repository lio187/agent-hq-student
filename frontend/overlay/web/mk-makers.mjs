// Marketing › Carousels & stories (workstream A4). The student sets a brand kit once; their own agent writes the
// slides; the student edits them here with a live preview of the very same HTML templates the app renders; the app
// renders exact PNGs on this Mac into the workspace's Marketing folder. No AI images, no browser.
// API (engine Makers.swift): marketing/make (page data), marketing/make/kit (head + templates + brand), marketing/brand,
// marketing/brand/asset, marketing/make/draft, marketing/make/<id>/update|retry|reveal|delete, marketing/make/render,
// marketing/make/file?path=.
import {tileRow} from './page-kit.mjs';
import {stateView} from './ui.mjs';
import {enter} from './motion.mjs';

const FORMATS = {
  carousel: {label: 'Carousel', noun: 'carousel', size: [1080, 1350], templates: [['cover', 'Cover'], ['point', 'Point'], ['list', 'List'], ['quote', 'Quote'], ['cta', 'Call to action']], lines: 'list'},
  story: {label: 'Stories', noun: 'stories', size: [1080, 1920], templates: [['hook', 'Hook'], ['step', 'Step'], ['poll', 'Question'], ['cta', 'Call to action']], lines: 'poll'},
};
const STYLES = [['clean', 'Clean', 'Calm and spacious; the accent colour in the details.'], ['bold', 'Bold', 'Heavy type; the first and last slide in your accent colour.'], ['editorial', 'Editorial', 'Lighter headings, italics, fine lines, centred openers.']];
const COLOURS = [['background', 'Background'], ['text', 'Text'], ['accent', 'Accent'], ['muted', 'Muted text']];
const PRESETS = {
  clean: {style: 'clean', colours: {background: '#FFFFFF', text: '#111111', accent: '#2F5BFF', muted: '#6B7280'}, fonts: {heading: 'Helvetica Neue', body: 'Helvetica Neue'}},
  bold: {style: 'bold', colours: {background: '#0E0E10', text: '#FFFFFF', accent: '#F2D43D', muted: '#A1A1AA'}, fonts: {heading: 'Futura', body: 'Avenir Next'}},
  editorial: {style: 'editorial', colours: {background: '#F6F1E9', text: '#1D1B18', accent: '#B4532A', muted: '#7A7167'}, fonts: {heading: 'Baskerville', body: 'Gill Sans'}},
};
const SAMPLE = {carousel: [{template: 'cover', heading: 'Plan a week of posts in *one* hour', body: 'A simple system you can start today.', footer: 'Guide'}, {template: 'point', heading: 'Start with one idea, not seven', body: 'Pick the question your customers ask most. Every post this week answers a part of it.', footer: ''}]};
const STATUS = {writing: ['Writing…', 'pending'], ready: ['Ready to render', 'ready'], rendering: ['Rendering…', 'pending'], rendered: ['Rendered', 'connected'], failed: ['Needs attention', 'stale']};

// Page state survives a re-render (refresh) but not a reload.
const S = {data: null, kit: null, kitKey: '', open: null, draft: null, dirty: false, timer: 0, saving: null, brandForm: null, played: ''};

// ── The slide document, exactly as the engine builds it (Slides.document in Renderer.swift) ──
const escHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const clean = t => String(t ?? '').replace(/\r\n/g, '\n').replace(/^[ \t\n\r ]+|[ \t\n\r ]+$/g, '');
const rich = t => escHTML(clean(t)).replace(/\*\*([^*\n]+)\*\*/g, '<em>$1</em>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>').split('\n').join('<br>');
const plainLength = t => clean(t).replace(/\*/g, '').replace(/^[ \t\n\r ]+|[ \t\n\r ]+$/g, '').length;
const headingSize = t => { const n = plainLength(t); return n <= 16 ? 'xl' : n <= 32 ? 'l' : n <= 56 ? 'm' : n <= 90 ? 's' : 'xs' };
const bodySize = t => { const n = plainLength(t); return n <= 80 ? 'l' : n <= 160 ? 'm' : n <= 260 ? 's' : 'xs' };
const pad = n => String(n).padStart(2, '0');
export function compose(kit, format, slide, index, total) {
  const names = FORMATS[format]?.templates.map(t => t[0]) || [];
  const name = names.includes(slide.template) ? slide.template : format === 'story' ? 'step' : 'point';
  const tpl = kit.templates?.[format]?.[name] || '';
  const items = (slide.items || []).map(clean).filter(Boolean), handle = clean(kit.handle);
  const values = {logo: kit.logo ? '<img class="logo" src="' + kit.logo + '" alt="">' : '', name: escHTML(clean(kit.name)), handle: handle ? '@' + escHTML(handle) : '',
    number: pad(index + 1), total: pad(total), heading: rich(slide.heading), body: rich(slide.body), footer: escHTML(clean(slide.footer)),
    items: items.map(i => '<li>' + rich(i) + '</li>').join(''), itemCount: String(items.length), headingSize: headingSize(slide.heading || ''), bodySize: bodySize(slide.body || '')};
  const classes = ['fmt-' + format, 'style-' + (kit.style || 'clean'), 'tpl-' + name, index === 0 ? 'is-first' : '', index === total - 1 ? 'is-last' : '', kit.logo ? 'has-logo' : ''].filter(Boolean).join(' ');
  return '<!doctype html><html><head>' + (kit.head || '') + '</head><body class="' + classes + '">' + tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '') + '</body></html>';
}

// ── Brand values for the unsaved sample preview (the saved kit comes from the engine: BrandKit.css) ──
const rgb = c => { const v = parseInt(String(c).slice(1), 16) || 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255] };
const rgba = (c, a) => 'rgba(' + rgb(c).join(',') + ',' + a + ')';
function inkOn(c) {
  const lin = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) };
  const [r, g, b] = rgb(c), l = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#111111' : '#FFFFFF';
}
const FALLBACK = '-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif';
const familyCSS = name => { const safe = String(name || '').replace(/[^\p{L}\p{N} \-._'&]/gu, '').replace(/'/g, "\\'"); return !safe || safe === 'System' ? '-apple-system,system-ui,"Helvetica Neue",sans-serif' : "'" + safe + "'," + FALLBACK };
const colourCode = v => { let s = String(v || '').trim().toUpperCase(); if (!s.startsWith('#')) s = '#' + s; if (/^#[0-9A-F]{3}$/.test(s)) s = '#' + [...s.slice(1)].map(c => c + c).join(''); return /^#[0-9A-F]{6}$/.test(s) ? s : null };
function sampleKit(kit, form) {
  if (!form) return kit;
  const c = form.colours, ink = inkOn(c.accent);
  const vars = {'--brand-bg': c.background, '--brand-fg': c.text, '--brand-accent': c.accent, '--brand-muted': c.muted, '--on-accent': ink, '--on-accent-soft': rgba(ink, 0.72), '--on-accent-line': rgba(ink, 0.28), '--line': rgba(c.text, 0.14), '--soft': rgba(c.accent, 0.1)};
  for (const slot of ['heading', 'body']) if (form.fonts[slot] !== '@upload') vars['--font-' + slot] = familyCSS(form.fonts[slot]);
  return {...kit, name: form.name, handle: form.handle.replace(/^@+/, ''), style: form.style, head: kit.head + '<style>:root{' + Object.entries(vars).map(([k, v]) => k + ':' + v).join(';') + '}</style>'};
}

// ── Page ──
export async function page(view, ctx) {
  const {api, esc, number} = ctx;
  if (S.saving) await S.saving.catch(() => {});
  const data = await api('marketing/make');
  const key = JSON.stringify(data.brand || {});
  if (!S.kit || key !== S.kitKey) { S.kit = await api('marketing/make/kit'); S.kitKey = key }
  S.data = data;
  const drafts = data.drafts || [];
  if (S.open && !drafts.some(d => d.id === S.open)) S.open = null;
  if (!S.open && drafts[0]) S.open = drafts[0].id;
  const open = drafts.find(d => d.id === S.open) || null;
  S.draft = open ? structuredClone(open) : null; S.dirty = false;
  const rendered = drafts.filter(d => d.renders?.length);
  const tiles = tileRow([
    {label: 'Brand kit', value: data.set ? 'Ready' : 'Not set', caption: data.set ? (STYLES.find(s => s[0] === data.brand.style)?.[1] || 'Clean') + ' style' : 'Set it once, below', tone: data.set ? '' : 'attention'},
    {label: 'Drafts', value: drafts.length, caption: 'Written by your agent'},
    {label: 'Rendered sets', value: rendered.length, caption: 'In your Marketing folder'},
    {label: 'PNG slides', value: rendered.reduce((n, d) => n + d.renders.length, 0), caption: '1080 wide, ready to post'},
  ], {esc, number});
  const intro = data.set ? '' : stateView({kind: 'setup', title: 'Set your brand kit first', body: 'Choose your colours, fonts, logo and handle once. Every carousel and story you make uses them.'});
  return STYLE + tiles + intro + brandPanel(data, ctx) + makePanel(data, ctx) + draftsPanel(drafts, ctx) + editorPanel(S.draft, ctx) + resultsPanel(S.draft, ctx);
}

function brandPanel(data, {esc}) {
  const b = data.brand || {}, form = S.brandForm || formFromBrand(b);
  const fontSelect = slot => {
    const uploaded = b.fontFiles?.[slot], value = form.fonts[slot];
    const opt = (v, l) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>';
    const all = data.systemFonts || [], rec = data.recommendedFonts || [];
    return '<label>' + (slot === 'heading' ? 'Heading font' : 'Body font') + '<select data-b-font="' + slot + '">'
      + (uploaded ? '<optgroup label="Uploaded">' + opt('@upload', uploaded.family || uploaded.original) + '</optgroup>' : '')
      + '<optgroup label="Suggested">' + rec.map(f => opt(f, f === 'System' ? 'System (San Francisco)' : f)).join('') + '</optgroup>'
      + '<optgroup label="On this Mac">' + all.filter(f => !rec.includes(f)).map(f => opt(f, f)).join('') + '</optgroup></select></label>'
      + '<div class="mk-file"><button type="button" data-action="mk-makers-pick" data-id="font-' + slot + '">Upload a font file…</button>'
      + (uploaded ? '<small>' + esc(uploaded.original) + ' · ' + Math.round((uploaded.bytes || 0) / 1024) + ' KB</small><button type="button" class="mk-link" data-action="mk-makers-asset-remove" data-id="font-' + slot + '">Remove</button>' : '<small>TTF, OTF or WOFF2, up to 5 MB</small>') + '</div>';
  };
  const logo = S.kit?.logo;
  const body = '<div class="mk-brand-grid"><div class="mk-brand-form" data-mk-brand>'
    + '<div class="mk-two"><label>Brand name<input data-b="name" maxlength="60" value="' + esc(form.name) + '" placeholder="Your business"></label>'
    + '<label>Handle<input data-b="handle" maxlength="41" value="' + esc(form.handle) + '" placeholder="yourname" spellcheck="false" autocomplete="off"></label></div>'
    + '<fieldset class="mk-styles"><legend>Style</legend>' + STYLES.map(([id, label, note]) => '<label class="mk-style"><input type="radio" name="mk-style" value="' + id + '"' + (form.style === id ? ' checked' : '') + '><span><b>' + label + '</b><small>' + esc(note) + '</small></span></label>').join('') + '</fieldset>'
    + '<fieldset class="mk-colours"><legend>Colours</legend>' + COLOURS.map(([k, l]) => '<div class="mk-colour"><input type="color" data-c="' + k + '" value="' + esc(form.colours[k].toLowerCase()) + '" aria-label="' + l + ' colour"><label>' + l + '<input data-ct="' + k + '" value="' + esc(form.colours[k]) + '" maxlength="7" spellcheck="false" autocomplete="off" aria-label="' + l + ' colour code"></label></div>').join('') + '</fieldset>'
    + '<div class="mk-two"><div>' + fontSelect('heading') + '</div><div>' + fontSelect('body') + '</div></div>'
    + '<div class="mk-logo"><span class="mk-logo-box">' + (logo ? '<img src="' + logo + '" alt="Your logo">' : '<small>No logo</small>') + '</span><div><strong>Logo</strong><small>PNG, JPG or SVG, up to 5 MB. A transparent PNG or an SVG looks best.</small>'
    + '<div class="actions"><button type="button" data-action="mk-makers-pick" data-id="logo">' + (logo ? 'Change logo…' : 'Choose a logo…') + '</button>' + (logo ? '<button type="button" class="mk-link" data-action="mk-makers-asset-remove" data-id="logo">Remove</button>' : '') + '</div></div></div>'
    + '<div class="mk-presets"><small>Start from a preset:</small>' + Object.keys(PRESETS).map(k => '<button type="button" data-action="mk-makers-preset" data-id="' + k + '">' + STYLES.find(s => s[0] === k)[1] + '</button>').join('') + '</div>'
    + '<p role="alert" class="mk-alert" data-mk-brand-error></p>'
    + '<div class="actions"><button type="button" class="primary" data-action="mk-makers-brand-save">' + (data.set ? 'Save brand kit' : 'Save and continue') + '</button><small data-mk-brand-state>' + (S.brandForm ? 'Unsaved changes' : '') + '</small></div></div>'
    + '<div class="mk-brand-sample" aria-label="Sample slides in your brand"><div class="mk-thumb mk-thumb--carousel" data-mk-sample="0"><iframe sandbox="" tabindex="-1" title="Sample cover slide"></iframe></div><div class="mk-thumb mk-thumb--carousel" data-mk-sample="1"><iframe sandbox="" tabindex="-1" title="Sample point slide"></iframe></div><small>A sample in your brand. It updates as you change things.</small></div></div>';
  if (!data.set) return '<section class="surface mk-brand" id="mk-brand"><div class="section-head"><h2>Your brand kit</h2><span class="pk-meta">Used by every slide</span></div>' + body + '</section>';
  const c = b.colours || {};
  const summary = '<span class="mk-swatches">' + COLOURS.map(([k, l]) => '<i title="' + esc(l + ' ' + (c[k] || '')) + '" style="background:' + esc(c[k] || '#000') + '"></i>').join('') + '</span>'
    + '<span class="mk-brand-sum"><b>' + esc(b.name || 'Your brand') + '</b>' + (b.handle ? ' · @' + esc(b.handle) : '') + ' · ' + esc(b.fonts?.heading || '') + ' / ' + esc(b.fonts?.body || '') + ' · ' + esc((STYLES.find(s => s[0] === b.style) || STYLES[0])[1]) + '</span>';
  return '<details class="surface mk-brand" id="mk-brand"' + (S.brandForm ? ' open' : '') + '><summary><span class="mk-sum-title">Brand kit</span>' + summary + '<span class="mk-link">Edit</span></summary>' + body + '</details>';
}
const formFromBrand = b => ({name: b.name || '', handle: b.handle || '', style: b.style || 'clean', colours: {...PRESETS.clean.colours, ...(b.colours || {})},
  fonts: {heading: b.fontFiles?.heading ? '@upload' : b.fonts?.heading || 'Helvetica Neue', body: b.fontFiles?.body ? '@upload' : b.fonts?.body || 'Helvetica Neue'}});

function makePanel(data, {esc}) {
  const off = data.set ? '' : ' disabled title="Set your brand kit first"';
  return '<section class="surface mk-make"><div class="section-head"><h2>Make something new</h2><span class="pk-meta">Written by your agent · rendered on this Mac</span></div>'
    + '<p class="mk-lead">Start from a topic, a content item or a Creator Lab post. Your Content Writer writes the slides; you edit them here; the app renders PNGs in your brand. No AI images.</p>'
    + '<div class="actions"><button type="button" class="primary" data-action="mk-makers-new" data-id="carousel"' + off + '>Make a carousel</button><button type="button" data-action="mk-makers-new" data-id="story"' + off + '>Make stories</button></div></section>';
}

function draftsPanel(drafts, {esc, date}) {
  if (!drafts.length) return '<section class="surface"><div class="section-head"><h2>Drafts</h2></div><p class="dt-empty">No drafts yet. Make a carousel or stories above; the draft appears here while your agent writes it.</p></section>';
  return '<section class="surface"><div class="section-head"><h2>Drafts</h2><span class="pk-meta">' + drafts.length + ' on this Mac</span></div><div class="list mk-drafts">' + drafts.map(d => {
    const [label, tone] = STATUS[d.status] || [d.status, ''];
    const meta = [FORMATS[d.format]?.label, (d.slides?.length || d.slideCount) + ' slides', 'updated ' + date(d.updatedAt)].join(' · ');
    return '<article class="row' + (d.id === S.open ? ' is-open' : '') + '"><div><strong>' + esc(d.title || 'Untitled') + '</strong><small>' + esc(meta) + '</small></div><div class="mk-row-end"><span class="pill ' + tone + '">' + esc(d.stale && d.status === 'rendered' ? 'Changed since render' : label) + '</span>'
      + (d.id === S.open ? '<span class="mk-open-label">Open below</span>' : '<button type="button" data-action="mk-makers-open" data-id="' + esc(d.id) + '">Open</button>') + '</div></article>';
  }).join('') + '</div></section>';
}

function editorPanel(d, {esc}) {
  if (!d) return '';
  const f = FORMATS[d.format] || FORMATS.carousel;
  const head = '<div class="section-head"><h2>' + esc(d.title || 'Untitled') + '</h2><span class="pk-meta">' + f.label + ' · ' + f.size.join(' × ') + ' px</span></div>';
  if (d.status === 'writing') return '<section class="surface mk-editor" data-mk-draft="' + esc(d.id) + '">' + head
    + '<div class="mk-writing" role="status"><span class="mk-dots" aria-hidden="true"><i></i><i></i><i></i></span><div><strong>Your agent is writing ' + esc(d.slideCount) + ' slides…</strong><small>This usually takes under a minute. You can leave this page; the draft opens here when it is ready. You can follow the run in Agent work.</small></div></div></section>';
  if (d.status === 'failed' && !d.slides?.length) return '<section class="surface mk-editor" data-mk-draft="' + esc(d.id) + '">' + head
    + '<p class="notice mk-error">' + esc(d.error || 'Your agent could not write these slides.') + '</p><div class="actions"><button type="button" class="primary" data-action="mk-makers-retry" data-id="' + esc(d.id) + '">Try again</button><button type="button" data-action="mk-makers-delete" data-id="' + esc(d.id) + '">Delete draft</button></div></section>';
  const busy = d.status === 'rendering';
  return '<section class="surface mk-editor" data-mk-draft="' + esc(d.id) + '">' + head
    + (d.error ? '<p class="notice mk-error">' + esc(d.error) + '</p>' : '')
    + (d.stale ? '<p class="notice">You changed the slides after rendering. Render again to update the PNGs.</p>' : '')
    + '<label class="mk-title">Title<input data-mk="title" maxlength="80" value="' + esc(d.title || '') + '"></label>'
    + '<div class="mk-slides mk-slides--' + esc(d.format) + '">' + (d.slides || []).map((s, i) => slideCard(d, s, i, esc)).join('') + '</div>'
    + '<div class="actions"><button type="button" data-action="mk-makers-slide-add" data-id="' + esc(d.id) + '"' + ((d.slides || []).length >= 12 ? ' disabled' : '') + '>Add a slide</button></div>'
    + '<label class="mk-caption">Caption<textarea data-mk="caption" rows="6" maxlength="2200">' + esc(d.caption || '') + '</textarea></label>'
    + '<p role="alert" class="mk-alert" data-mk-alert></p>'
    + '<div class="actions mk-editor-actions"><button type="button" class="primary" data-action="mk-makers-render" data-id="' + esc(d.id) + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Rendering…' : d.renders?.length ? 'Render PNGs again' : 'Render PNGs') + '</button>'
    + '<button type="button" data-action="mk-makers-copy" data-id="' + esc(d.id) + '">Copy caption</button><small class="mk-save" data-mk-save aria-live="polite"></small><span class="mk-grow"></span>'
    + '<button type="button" data-action="mk-makers-retry" data-id="' + esc(d.id) + '">Write again</button><button type="button" data-action="mk-makers-delete" data-id="' + esc(d.id) + '">Delete draft</button></div></section>';
}
function slideCard(d, s, i, esc) {
  const f = FORMATS[d.format] || FORMATS.carousel, n = d.slides.length, label = 'slide ' + (i + 1);
  return '<article class="mk-slide" data-i="' + i + '"><button type="button" class="mk-thumb mk-thumb--' + esc(d.format) + '" data-action="mk-makers-zoom" data-id="' + i + '" aria-label="Show ' + label + ' larger"><iframe sandbox="" tabindex="-1" aria-hidden="true" title=""></iframe></button>'
    + '<div class="mk-fields"><div class="mk-slide-head"><strong>' + pad(i + 1) + '</strong><select data-mk-slide="template" aria-label="Template for ' + label + '">' + f.templates.map(([v, l]) => '<option value="' + v + '"' + (v === s.template ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>'
    + '<span class="mk-tools"><button type="button" data-action="mk-makers-slide-up" data-id="' + i + '" aria-label="Move ' + label + ' up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-action="mk-makers-slide-down" data-id="' + i + '" aria-label="Move ' + label + ' down"' + (i === n - 1 ? ' disabled' : '') + '>↓</button><button type="button" data-action="mk-makers-slide-remove" data-id="' + i + '" aria-label="Delete ' + label + '" title="Delete this slide"' + (n <= 1 ? ' disabled' : '') + '>×</button></span></div>'
    + '<label>Heading<input data-mk-slide="heading" maxlength="160" value="' + esc(s.heading || '') + '"></label>'
    + '<label>Text<textarea data-mk-slide="body" rows="3" maxlength="700">' + esc(s.body || '') + '</textarea></label>'
    + '<label class="mk-lines"' + (s.template === f.lines ? '' : ' hidden') + '>' + (d.format === 'story' ? 'Answers, one per line' : 'Lines, one per line') + '<textarea data-mk-slide="items" rows="4">' + esc((s.items || []).join('\n')) + '</textarea></label>'
    + '<label>Small line<input data-mk-slide="footer" maxlength="90" value="' + esc(s.footer || '') + '" placeholder="' + (s.template === 'cta' ? 'Button text, for example Save this post' : 'Optional') + '"></label></div></article>';
}

function resultsPanel(d, {esc}) {
  if (!d?.renders?.length) return '';
  const meta = 'Marketing/' + (d.folder || '') + ' · ' + d.renders.length + ' PNG' + (d.renders.length === 1 ? '' : 's');
  return '<section class="surface mk-results"><div class="section-head"><h2>Rendered PNGs</h2><span class="pk-meta">' + esc(meta) + '</span></div>'
    + (d.warnings?.length ? '<p class="notice">This font could not be loaded, so a standard font was used: ' + esc(d.warnings.join(', ')) + '. Upload the font file again.</p>' : '')
    + '<div class="mk-grid mk-grid--' + esc(d.format) + '">' + d.renders.map((f, i) => '<figure><img src="/api/hq/v1/' + esc(f.url) + '" alt="Slide ' + (i + 1) + '" width="' + esc(f.width) + '" height="' + esc(f.height) + '" loading="lazy" decoding="async"><figcaption>' + esc(f.name) + '</figcaption></figure>').join('') + '</div>'
    + '<div class="actions"><button type="button" class="primary" data-action="mk-makers-reveal" data-id="' + esc(d.id) + '">Show in Finder</button><button type="button" data-action="mk-makers-copy" data-id="' + esc(d.id) + '">Copy caption</button></div></section>';
}

// ── After the page is in place: previews, inline edits, autosave, live status ──
export function mount(view, el, ctx) {
  const timers = [];
  paintSamples(el);
  el.querySelectorAll('.mk-slide').forEach(card => paintSlide(card));
  // Entry motion once per draft (and again after a render), not on every refresh.
  const key = (S.draft?.id || '') + ':' + (S.draft?.renders?.length || 0) + ':' + (S.draft?.renderedAt || '');
  if (key !== S.played) { S.played = key; enter([...el.querySelectorAll('.mk-slide, .mk-grid figure')]) }
  const onInput = e => {
    const t = e.target;
    if (t.closest('[data-mk-brand]')) return brandInput(t, el);
    const card = t.closest('.mk-slide'), d = S.draft;
    if (!d) return;
    if (card && t.dataset.mkSlide) {
      const s = d.slides[Number(card.dataset.i)], k = t.dataset.mkSlide;
      s[k] = k === 'items' ? t.value.split('\n').map(x => x.trim()).filter(Boolean) : t.value;
      if (k === 'template') { const lines = card.querySelector('.mk-lines'); if (lines) lines.hidden = t.value !== FORMATS[d.format].lines }
      paintSlide(card);
    } else if (t.dataset.mk) { d[t.dataset.mk] = t.value }
    else return;
    S.dirty = true; status(el, 'Unsaved changes');
    clearTimeout(S.timer); S.timer = setTimeout(() => save(ctx, el), 900);
  };
  el.addEventListener('input', onInput); el.addEventListener('change', onInput);
  // While an agent writes or the app renders, the page follows along and refreshes when that changes.
  const busy = () => (S.data?.drafts || []).filter(d => d.status === 'writing' || d.status === 'rendering');
  if (busy().length) {
    const before = JSON.stringify(busy().map(d => d.id + d.status));
    const poll = setInterval(async () => {
      if (!el.isConnected) return clearInterval(poll);
      try {
        const {drafts} = await ctx.api('marketing/make/drafts');
        const now = JSON.stringify(drafts.filter(d => busy().some(b => b.id === d.id)).map(d => d.id + d.status));
        if (now !== before) { clearInterval(poll); await flush(ctx, el); ctx.refresh() }
      } catch {}
    }, 1500);
    timers.push(poll);
  }
  return () => { timers.forEach(clearInterval); el.removeEventListener('input', onInput); el.removeEventListener('change', onInput); flush(ctx, el) };
}

function paintSlide(card) {
  const d = S.draft, i = Number(card.dataset.i), frame = card.querySelector('iframe');
  if (!d || !frame || !S.kit) return;
  const html = compose(S.kit, d.format, d.slides[i], i, d.slides.length);
  if (frame.srcdoc !== html) frame.srcdoc = html;
}
function paintSamples(el) {
  if (!S.kit) return;
  const kit = sampleKit(S.kit, S.brandForm || readBrand(el));
  el.querySelectorAll('[data-mk-sample]').forEach(box => {
    const i = Number(box.dataset.mkSample), frame = box.querySelector('iframe'), html = compose(kit, 'carousel', SAMPLE.carousel[i], i, 7);
    if (frame.srcdoc !== html) frame.srcdoc = html;
  });
}
function readBrand(el) {
  const f = el.querySelector('[data-mk-brand]'); if (!f) return null;
  const val = s => f.querySelector(s)?.value ?? '';
  const colours = {};
  for (const [k] of COLOURS) colours[k] = colourCode(val('[data-ct="' + k + '"]')) || colourCode(val('[data-c="' + k + '"]')) || PRESETS.clean.colours[k];
  return {name: val('[data-b=name]').trim(), handle: val('[data-b=handle]').trim().replace(/^@+/, ''), style: f.querySelector('input[name=mk-style]:checked')?.value || 'clean', colours,
    fonts: {heading: val('[data-b-font=heading]'), body: val('[data-b-font=body]')}};
}
function brandInput(t, el) {
  // The colour picker and its colour code follow each other.
  if (t.dataset.c) { const code = el.querySelector('[data-ct="' + t.dataset.c + '"]'); if (code) code.value = t.value.toUpperCase() }
  if (t.dataset.ct) { const c = colourCode(t.value), pick = el.querySelector('[data-c="' + t.dataset.ct + '"]'); if (c && pick) pick.value = c.toLowerCase() }
  S.brandForm = readBrand(el);
  const state = el.querySelector('[data-mk-brand-state]'); if (state) state.textContent = 'Unsaved changes';
  clearTimeout(brandInput.t); brandInput.t = setTimeout(() => paintSamples(el), 120);
}
function status(el, text) { const s = el.querySelector('[data-mk-save]'); if (s) s.textContent = text }
async function save(ctx, el) {
  const d = S.draft; if (!d || !S.dirty) return;
  clearTimeout(S.timer); S.dirty = false; status(el, 'Saving…');
  const run = ctx.api('marketing/make/' + encodeURIComponent(d.id) + '/update', {title: d.title, caption: d.caption, slides: d.slides})
    .then(r => { const saved = r.draft; if (saved && S.draft?.id === saved.id) S.draft.stale = saved.stale; status(el, 'Saved'); return saved })
    .catch(e => { S.dirty = true; status(el, 'Not saved: ' + e.message); throw e });
  S.saving = run; try { return await run } finally { if (S.saving === run) S.saving = null }
}
async function flush(ctx, el) { if (S.dirty) await save(ctx, el).catch(() => {}); else if (S.saving) await S.saving.catch(() => {}) }

// ── Clicks ──
export async function act(action, id, ctx, el) {
  const verb = action.slice('mk-makers-'.length), view = ctx.$('#view');
  const alert = (sel, text) => { const a = ctx.root.querySelector(sel); if (a) a.textContent = text };
  try {
    switch (verb) {
      case 'brand-save': {
        const form = readBrand(view); if (!form) return;
        alert('[data-mk-brand-error]', '');
        for (const [k, l] of COLOURS) { const raw = view.querySelector('[data-ct="' + k + '"]')?.value || ''; if (!colourCode(raw)) throw new Error('The ' + l.toLowerCase() + ' colour code must look like #1A2B3C.') }
        busy(el, 'Saving…');
        await ctx.api('marketing/brand', form);
        S.brandForm = null; S.kitKey = '';
        return ctx.refresh();
      }
      case 'preset': {
        const p = PRESETS[id], f = view.querySelector('[data-mk-brand]'); if (!p || !f) return;
        f.querySelector('input[name=mk-style][value="' + p.style + '"]').checked = true;
        for (const [k] of COLOURS) { f.querySelector('[data-c="' + k + '"]').value = p.colours[k].toLowerCase(); f.querySelector('[data-ct="' + k + '"]').value = p.colours[k] }
        for (const slot of ['heading', 'body']) { const sel = f.querySelector('[data-b-font="' + slot + '"]'); if ([...sel.options].some(o => o.value === p.fonts[slot])) sel.value = p.fonts[slot] }
        return brandInput(f.querySelector('[data-b=name]'), view);
      }
      case 'pick': {
        const types = id === 'logo' ? ['png', 'jpg', 'jpeg', 'svg'] : ['ttf', 'otf', 'woff2'];
        const path = await pickFile(id, types, id === 'logo' ? 'Choose your logo (PNG, JPG or SVG).' : 'Choose a font file (TTF, OTF or WOFF2).');
        if (!path) return;
        S.brandForm = readBrand(view);
        busy(el, 'Copying…');
        await ctx.api('marketing/brand/asset', {purpose: id, path});
        if (S.brandForm && id !== 'logo') S.brandForm.fonts[id.slice(5)] = '@upload';
        S.kitKey = '';
        return ctx.refresh();
      }
      case 'asset-remove': {
        S.brandForm = readBrand(view);
        await ctx.api('marketing/brand/asset', {purpose: id, path: ''});
        if (S.brandForm && id !== 'logo' && S.brandForm.fonts[id.slice(5)] === '@upload') S.brandForm.fonts[id.slice(5)] = 'Helvetica Neue';
        S.kitKey = '';
        return ctx.refresh();
      }
      case 'new': return newDialog(id, ctx);
      case 'write': return write(id, ctx, el);
      case 'open': await flush(ctx, view); S.open = id; return ctx.refresh();
      case 'slide-up': case 'slide-down': case 'slide-remove': case 'slide-add': {
        const d = S.draft; if (!d) return;
        const i = Number(id), list = d.slides;
        if (verb === 'slide-up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        if (verb === 'slide-down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
        if (verb === 'slide-remove' && list.length > 1) list.splice(i, 1);
        if (verb === 'slide-add' && list.length < 12) list.splice(Math.max(list.length - 1, 0), 0, {template: d.format === 'story' ? 'step' : 'point', heading: 'New slide', body: '', items: [], footer: ''});
        S.dirty = true; await save(ctx, view);
        return ctx.refresh();
      }
      case 'render': {
        await flush(ctx, view);
        alert('[data-mk-alert]', '');
        busy(el, 'Rendering ' + (S.draft?.slides?.length || '') + ' slides…');
        await ctx.api('marketing/make/render', {draftId: id});
        return ctx.refresh();
      }
      case 'copy': {
        const text = S.draft?.id === id ? S.draft.caption : (S.data?.drafts || []).find(d => d.id === id)?.caption;
        await copyText(text || '');
        const t = el.textContent; el.textContent = 'Copied'; setTimeout(() => { el.textContent = t }, 1400);
        return;
      }
      case 'reveal': await ctx.api('marketing/make/' + encodeURIComponent(id) + '/reveal', {}); return;
      case 'retry':
        if (S.draft?.id === id && S.draft.slides?.length && !confirm('Write the slides again? Your agent replaces the slides and the caption of this draft.')) return;
        S.dirty = false; clearTimeout(S.timer);
        await ctx.api('marketing/make/' + encodeURIComponent(id) + '/retry', {}); S.open = id; return ctx.refresh();
      case 'delete':
        if (!confirm('Delete this draft? The PNGs already in your Marketing folder stay there.')) return;
        await ctx.api('marketing/make/' + encodeURIComponent(id) + '/delete', {}); S.open = null; S.draft = null; S.dirty = false;
        return ctx.refresh();
      case 'zoom': {
        const d = S.draft, i = Number(id); if (!d?.slides?.[i]) return;
        ctx.preview('Slide ' + (i + 1) + ' of ' + d.slides.length, '<div class="mk-zoom mk-zoom--' + d.format + '"><iframe sandbox="" title="Slide ' + (i + 1) + ' preview"></iframe></div>');
        ctx.root.querySelector('#preview-body .mk-zoom iframe').srcdoc = compose(S.kit, d.format, d.slides[i], i, d.slides.length);
        return;
      }
    }
  } catch (error) {
    idle(el);
    alert(verb.startsWith('brand') || verb === 'pick' || verb === 'asset-remove' ? '[data-mk-brand-error]' : verb === 'write' ? '[data-mk-new-error]' : '[data-mk-alert]', error.message);
    throw error;
  }
}
function busy(b, text) { if (!b || b.dataset.label) return; b.dataset.label = b.textContent; b.disabled = true; b.textContent = text }
function idle(b) { if (!b?.dataset.label) return; b.textContent = b.dataset.label; delete b.dataset.label; b.disabled = false }

// The app's native file picker (outside the app: a path prompt, for development).
function pickFile(purpose, types, message) {
  return new Promise(done => {
    const native = window.webkit?.messageHandlers?.hq;
    if (!native) { done((prompt('File path') || '').trim()); return }
    window.hqPicked = (p, path) => { if (p === purpose) done(path || '') };
    native.postMessage({type: 'pickFile', purpose, types, message});
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return } catch {}
  const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select();
  try { document.execCommand('copy') } finally { t.remove() }
}

// "Make a carousel" / "Make stories": the source, the number of slides and the AI tool.
async function newDialog(format, ctx) {
  const {esc} = ctx, f = FORMATS[format]; if (!f) return;
  const limits = S.data?.formats?.[format] || {min: 2, max: 10, standard: 5};
  const items = await ctx.api('workspace/team/content').then(d => (d.items || []).filter(i => i.id && i.title)).catch(() => []);
  const runtimes = S.data?.runtimes || [];
  const html = '<div class="mk-new" data-mk-new="' + format + '">'
    + '<fieldset class="mk-src"><legend>Start from</legend>' + [['topic', 'A topic'], ['item', 'A content item'], ['post', 'A Creator Lab post']].map(([v, l], i) => '<label><input type="radio" name="mk-src" value="' + v + '"' + (i ? '' : ' checked') + '> ' + l + '</label>').join('') + '</fieldset>'
    + '<label data-src="topic">What is it about?<textarea name="topic" rows="4" maxlength="4000" placeholder="For example: three pricing mistakes new coaches make, and what to do instead"></textarea></label>'
    + '<label data-src="item" hidden>Content item' + (items.length ? '<select name="item">' + items.slice(0, 300).map(i => '<option value="' + esc(i.id) + '">' + esc(i.title + (i.status ? ' · ' + i.status : '')) + '</option>').join('') + '</select>' : '<input name="item" placeholder="No items in your library yet" disabled>') + '</label>'
    + '<label data-src="post" hidden>Creator Lab post id<input name="post" placeholder="Copy it from the post in Creator Lab" spellcheck="false" autocomplete="off"><small>Your agent uses the post as inspiration and writes its own slides.</small></label>'
    + '<div class="mk-two"><label>Slides<input type="number" name="slides" min="' + limits.min + '" max="' + limits.max + '" value="' + limits.standard + '"></label>'
    + '<label>AI tool<select name="runtime">' + (runtimes.length ? runtimes.map(r => '<option value="' + esc(r.id) + '"' + (r.default ? ' selected' : '') + '>' + esc(r.name + ' · ' + r.agent + (r.ready || r.state === 'checking' ? '' : r.state === 'not installed' ? ' (not installed)' : ' (needs sign-in)')) + '</option>').join('') : '<option value="">Your Content Writer</option>') + '</select></label></div>'
    + '<p class="mk-note">' + esc(f.label === 'Stories' ? 'Stories are 1080 × 1920 and keep text clear of the profile bar and the reply field.' : 'Carousel slides are 1080 × 1350 (4:5).') + ' Writing takes about a minute; it shows in Agent work like any other run.</p>'
    + '<p role="alert" class="mk-alert" data-mk-new-error></p><div class="actions"><button type="button" class="primary" data-action="mk-makers-write" data-id="' + format + '">Write the slides</button></div></div>';
  ctx.preview(format === 'story' ? 'Make stories' : 'Make a carousel', html);
  const box = ctx.root.querySelector('#preview-body [data-mk-new]');
  box.querySelectorAll('input[name=mk-src]').forEach(r => r.addEventListener('change', () => {
    box.querySelectorAll('[data-src]').forEach(l => { l.hidden = l.dataset.src !== r.value || !r.checked });
  }));
  box.querySelector('textarea[name=topic]')?.focus();
}
async function write(format, ctx, el) {
  const box = ctx.root.querySelector('#preview-body [data-mk-new]'); if (!box) return;
  const kind = box.querySelector('input[name=mk-src]:checked')?.value || 'topic';
  const val = n => box.querySelector('[name=' + n + ']')?.value?.trim() || '';
  const source = kind === 'topic' ? {kind, text: val('topic')} : {kind, id: val(kind)};
  if (kind === 'topic' && source.text.length < 3) throw new Error('Write what the slides should be about.');
  if (kind !== 'topic' && !source.id) throw new Error(kind === 'item' ? 'Choose a content item.' : 'Paste the id of a Creator Lab post.');
  busy(el, 'Starting…');
  const {draft} = await ctx.api('marketing/make/draft', {format, source, slides: Number(val('slides')) || undefined, runtime: val('runtime') || undefined});
  ctx.$('#preview').close();
  S.open = draft.id;
  return ctx.refresh();
}

// Page styles (inside the office's shadow root; the office's own classes do the rest).
const STYLE = '<style>'
  + '.mk-brand>summary{display:flex;align-items:center;gap:14px;cursor:pointer;list-style:none}.mk-brand>summary::-webkit-details-marker{display:none}.mk-sum-title{font-weight:600}'
  + '.mk-brand[open]>summary{margin-bottom:18px}.mk-swatches{display:inline-flex;gap:4px}.mk-swatches i{width:18px;height:18px;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}'
  + '.mk-brand-sum{flex:1;min-width:0;color:var(--text-secondary);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mk-link{background:none;border:0;padding:0;color:var(--text-secondary);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-size:12px}'
  + '.mk-brand-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:start}.mk-brand-form{display:grid;gap:16px}.mk-brand-form label,.mk-new label,.mk-fields label,.mk-title,.mk-caption{display:grid;gap:6px;font-size:12px;color:var(--text-secondary)}'
  + '.mk-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.mk-brand fieldset,.mk-new fieldset{border:0;padding:0;margin:0;display:grid;gap:8px}.mk-brand legend,.mk-new legend{font-size:12px;color:var(--text-secondary);margin-bottom:6px}'
  + '.mk-styles{grid-template-columns:repeat(3,1fr)}.mk-style{display:flex!important;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--border-soft);border-radius:10px;cursor:pointer}.mk-style:has(input:checked){border-color:var(--text-body);background:var(--bg-glass-2)}'
  + '.mk-style b{display:block;color:var(--text-body);font-size:13px}.mk-style small{display:block;margin-top:3px;line-height:1.4}'
  + '.mk-colours{grid-template-columns:repeat(4,1fr)}.mk-colour{display:flex;gap:8px;align-items:flex-end}.mk-colour input[type=color]{width:38px;height:34px;padding:2px;flex:none;cursor:pointer}.mk-colour label{flex:1;min-width:0}'
  + '.mk-file{display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap}.mk-file small,.mk-logo small,.mk-brand-sample small,.mk-new small{color:var(--text-tertiary);font-size:11px}'
  + '.mk-logo{display:flex;gap:14px;align-items:center}.mk-logo>div{display:grid;gap:4px}.mk-logo .actions{margin:4px 0 0}.mk-logo-box{display:grid;place-items:center;width:84px;height:84px;flex:none;border-radius:12px;background:var(--bg-glass-2);border:1px dashed var(--border-mid);overflow:hidden}.mk-logo-box img{max-width:70px;max-height:70px;object-fit:contain}'
  + '.mk-presets{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mk-presets small{color:var(--text-tertiary)}.mk-alert{color:var(--status-error);font-size:12px;margin:0}.mk-alert:empty{display:none}'
  + '.mk-brand-sample{display:grid;grid-template-columns:1fr 1fr;gap:10px;position:sticky;top:12px}.mk-brand-sample small{grid-column:1/-1}'
  + '.mk-thumb{position:relative;display:block;padding:0;border:0;border-radius:8px;overflow:hidden;background:var(--bg-glass-2);box-shadow:0 0 0 1px var(--border-soft);cursor:zoom-in}.mk-brand-sample .mk-thumb{cursor:default}'
  + '.mk-thumb iframe{position:absolute;left:0;top:0;width:1080px;border:0;transform-origin:0 0;pointer-events:none}'
  + '.mk-thumb--carousel{width:100%;aspect-ratio:1080/1350}.mk-thumb--carousel iframe{height:1350px}.mk-thumb--story{width:100%;aspect-ratio:1080/1920}.mk-thumb--story iframe{height:1920px}'
  + '.mk-brand-sample .mk-thumb iframe{transform:scale(.1324)}.mk-slide .mk-thumb iframe{transform:scale(.2)}.mk-slides--story .mk-thumb iframe{transform:scale(.1407)}'
  + '.mk-lead,.mk-note{color:var(--text-secondary);font-size:13px;line-height:1.55;margin:0 0 14px;max-width:760px}'
  + '.mk-drafts .row.is-open strong{color:var(--text-primary)}.mk-row-end{display:flex;gap:10px;align-items:center}.mk-open-label{font-size:12px;color:var(--text-tertiary)}'
  + '.mk-title{max-width:520px;margin-bottom:18px}.mk-slides{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:14px;margin-bottom:12px}'
  + '.mk-slide{display:grid;grid-template-columns:216px minmax(0,1fr);gap:16px;padding:14px;border:1px solid var(--border-soft);border-radius:12px;background:var(--bg-glass-1)}.mk-slides--story .mk-slide{grid-template-columns:152px minmax(0,1fr)}'
  + '.mk-slide .mk-thumb{width:216px;height:270px;aspect-ratio:auto}.mk-slides--story .mk-thumb{width:152px;height:270px}.mk-fields{display:grid;gap:10px;align-content:start;min-width:0}'
  + '.mk-slide-head{display:flex;gap:10px;align-items:center}.mk-slide-head strong{font-variant-numeric:tabular-nums;color:var(--text-tertiary);font-size:12px}.mk-slide-head select{width:auto;flex:1;min-width:0}.mk-tools{display:flex;gap:4px}.mk-tools button{padding:4px 8px;font-size:12px}'
  + '.mk-fields textarea{min-height:64px}.mk-caption{margin-top:16px}.mk-caption textarea{min-height:130px}.mk-editor-actions{margin-top:14px}.mk-grow{flex:1}.mk-save{color:var(--text-tertiary);font-size:12px}'
  + '.mk-writing{display:flex;gap:16px;align-items:center;padding:22px;border:1px dashed var(--border-mid);border-radius:12px}.mk-writing div{display:grid;gap:4px}.mk-writing small{color:var(--text-secondary);font-size:12px}'
  + '.mk-dots{display:inline-flex;gap:5px}.mk-dots i{width:7px;height:7px;border-radius:50%;background:var(--text-secondary);animation:mk-dot 1.2s infinite ease-in-out}.mk-dots i:nth-child(2){animation-delay:.15s}.mk-dots i:nth-child(3){animation-delay:.3s}'
  + '@keyframes mk-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}@media (prefers-reduced-motion:reduce){.mk-dots i{animation:none;opacity:.6}}'
  + '.mk-error{border-left-color:var(--status-error)}.mk-grid{display:grid;gap:12px;margin-bottom:6px}.mk-grid--carousel{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}.mk-grid--story{grid-template-columns:repeat(auto-fill,minmax(120px,1fr))}'
  + '.mk-grid figure{margin:0;display:grid;gap:6px}.mk-grid img{width:100%;height:auto;border-radius:8px;box-shadow:0 0 0 1px var(--border-soft);background:var(--bg-glass-2)}.mk-grid figcaption{font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums}'
  + '.mk-new{display:grid;gap:14px;min-width:min(560px,80vw)}.mk-src{display:flex!important;flex-wrap:wrap;gap:16px!important}.mk-src legend{width:100%}.mk-src label{display:flex!important;gap:6px;align-items:center;color:var(--text-body)!important;font-size:13px!important}'
  + '.mk-zoom{position:relative;overflow:hidden;border-radius:10px;margin:auto}.mk-zoom iframe{position:absolute;left:0;top:0;width:1080px;border:0;transform-origin:0 0}'
  + '.mk-zoom--carousel{width:432px;height:540px}.mk-zoom--carousel iframe{height:1350px;transform:scale(.4)}.mk-zoom--story{width:338px;height:600px}.mk-zoom--story iframe{height:1920px;transform:scale(.3125)}'
  + '@media (max-width:1100px){.mk-brand-grid{grid-template-columns:1fr}.mk-brand-sample{position:static;max-width:320px}.mk-colours,.mk-styles{grid-template-columns:1fr 1fr}.mk-slides{grid-template-columns:1fr}}'
  + '</style>';
