// Proposals and Playbooks (student edition): the documents in a folder the student chose in Setup, searchable and
// readable in the app (PDF, Markdown, text, images); other files open in their Mac app.
import {stateView} from './ui.mjs';
import {panel, tileRow} from './page-kit.mjs';
import {dataTable} from './data-table.mjs';
import {markdown} from './message-view.mjs';

const KINDS = {proposals: {label: 'proposals', title: 'Proposals', setup: 'proposals', empty: 'Put your proposals (PDF, Word, Keynote…) in this folder and they appear here.'},
  handbook: {label: 'playbooks', title: 'Playbooks & SOPs', setup: 'handbook', empty: 'Put your playbooks, scripts and SOPs (Markdown, PDF…) in this folder and they appear here.'}};
const size = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

export async function documentsPage(kind, {api, esc, query, filters}) {
  const k = KINDS[kind];
  filters('<label class="search">Search<input id="search" type="search" value="' + esc(query) + '" placeholder="Find a ' + esc(k.label.slice(0, -1)) + '…"></label>');
  const d = await api('documents?kind=' + kind);
  if (!d.folder) return stateView({kind: 'setup', title: 'Choose your ' + k.label + ' folder', body: 'Pick the folder with your ' + k.label + ' in Setup. They appear here, searchable, and open right inside the app.', actions: [{label: 'Open Setup', href: '/setup#folders', primary: true, external: false}]});
  const q = (query || '').toLowerCase(), files = (d.files || []).filter(f => !q || f.name.toLowerCase().includes(q) || f.rel.toLowerCase().includes(q));
  const types = [...new Set((d.files || []).map(f => f.ext))];
  const table = dataTable({id: 'docs-' + kind, esc, rows: files, pageSize: 25, defaultSort: {key: 'modified', dir: 'desc'}, emptyText: k.empty,
    tabs: types.length > 1 ? types.map(t => ({id: t, label: t.toUpperCase(), filter: f => f.ext === t})) : undefined,
    columns: [
      {key: 'name', label: 'Document', value: f => f.name, className: 'dt-primary', cell: f => '<strong>' + esc(f.name) + '</strong><small>' + esc(f.folder || 'Top folder') + '</small>'},
      {key: 'type', label: 'Type', value: f => f.ext, cell: f => '<span class="dt-muted">' + esc(f.ext.toUpperCase()) + '</span>'},
      {key: 'size', label: 'Size', value: f => f.bytes, cell: f => '<span class="dt-muted">' + esc(size(f.bytes)) + '</span>'},
      {key: 'modified', label: 'Changed', value: f => Date.parse(f.modified) || 0, cell: f => '<span class="dt-muted">' + esc(new Date(f.modified).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})) + '</span>'},
      {key: 'open', label: '', className: 'dt-action', cell: f => '<button type="button" data-action="doc-open" data-id="' + esc(kind + '|' + f.rel) + '">Open</button>'}]});
  return tileRow([{label: k.title, value: (d.files || []).length, caption: 'In ' + d.folderName}, {label: 'Changed this month', value: (d.files || []).filter(f => Date.now() - Date.parse(f.modified) < 30 * 864e5).length, caption: 'Last 30 days'}], {esc})
    + panel(k.title, table, {esc, meta: files.length + ' of ' + (d.files || []).length});
}
// Opens a document: PDFs, images and text inside the app; anything else in its Mac app.
export async function openDocument(id, {api, preview, esc}) {
  const at = id.indexOf('|'), kind = id.slice(0, at), rel = id.slice(at + 1), name = rel.split('/').pop(), ext = (name.split('.').pop() || '').toLowerCase();
  const url = '/api/hq/v1/documents/file?' + new URLSearchParams({kind, path: rel});
  if (['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return preview(name, '<iframe src="' + esc(url) + '" title="' + esc(name) + '" style="width:100%;height:72vh;border:0;border-radius:10px;background:#fff"></iframe>');
  if (['md', 'markdown', 'txt'].includes(ext)) { const text = await (await fetch(url)).text(); return preview(name, '<div class="message-view">' + (ext === 'txt' ? '<pre style="white-space:pre-wrap">' + esc(text) + '</pre>' : markdown(text)) + '</div>') }
  await api('documents/open', {kind, path: rel});
  preview(name, '<p>Opened in its Mac app.</p>');
}
