// Team shell (9 Oct 2026, docs/TEAM-ACCESS-PLAN.md): what a team member opens through the tailnet. The server
// decides who they are (Tailscale sign-in) and refuses anything outside their role; this page only shows the
// pages that role allows, without the office, the Chief dock, revenue or usage.
import {createWorkspaceViews} from './workspace-view.mjs';
import {teamPages} from './team-pages.mjs';
import {connectorMark} from './connector-view.mjs';
import {icon} from './icons.mjs';

const API = '/api/hq/v1/';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);

export async function api(path, body, options = {}) {
  let r;
  try {
    r = await fetch(API + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': options.key || crypto.randomUUID() }, body: JSON.stringify(body) });
  } catch { const e = new Error('Agent HQ is not answering. Try again in a moment.'); e.status = 0; throw e }
  const text = await r.text(); let d = null; try { d = text ? JSON.parse(text) : {} } catch {}
  if (!r.ok || d === null) { const e = new Error(d?.error?.message || 'Request refused (HTTP ' + r.status + ').'); e.status = r.status; e.code = d?.error?.code; throw e }
  return d;
}

function sidebar(member, groups) {
  return '<div class="sb-head"><span class="sb-brand"><img src="/static/logo-ui.png" alt="187N infinity" width="46" height="24"><span class="sb-wordmark"><b>187N</b><small>Agent HQ</small></span></span></div>'
    + '<div class="team-who"><strong>' + esc(member.name) + '</strong><small>' + esc(member.label) + '</small></div>'
    + '<div class="sb-groups">' + groups.map(w => '<section class="sb-group" data-department="' + esc(w.department) + '"><div class="sb-group-toggle" role="presentation">' + icon(w.department) + '<span>' + esc(w.label) + '</span></div><div class="sb-group-items">'
      + w.pages.map(p => '<button type="button" class="sb-item" data-section="' + esc(p.views[0][0]) + '" data-views="' + esc(p.views.map(([v]) => v).join(' ')) + '">' + esc(p.label) + '</button>').join('') + '</div></section>').join('') + '</div>';
}

async function start() {
  const state = $('#team-state');
  let member;
  try { member = (await api('me')).member } catch (e) {
    state.innerHTML = '<div><h1>No access yet</h1><p>' + esc(e.code === 'not_a_member' ? 'This account is not on the Agent HQ team. Ask the owner to add you.' : e.message) + '</p></div>';
    return;
  }
  if (!member) { location.replace('/'); return }
  const groups = teamPages(member.sections), first = groups[0]?.pages[0]?.views[0]?.[0];
  if (!first) { state.innerHTML = '<div><h1>No pages for this role</h1><p>Ask the owner to check your role.</p></div>'; return }
  const nav = $('#hq-nav'); nav.innerHTML = sidebar(member, groups);
  const highlight = section => {
    const page = groups.flatMap(w => w.pages).find(p => p.views.some(([v]) => v === section));
    nav.querySelectorAll('.sb-item').forEach(b => b.setAttribute('aria-current', page && b.dataset.section === page.views[0][0] ? 'page' : 'false'));
  };
  const panel = $('#cockpit-panel');
  const views = createWorkspaceViews({
    host: panel, api, connectorMark, voice: null, getBoot: () => ({ projects: [], profiles: member.profiles || [] }), allowed: new Set(member.sections),
    getContext: () => ({ project: null, profile: null, conversation: null }), setContext: async () => {},
    onNavigate: (section, options = {}) => { highlight(section); const hash = '#workspace/' + section; if (location.hash !== hash) history[options.refresh ? 'replaceState' : 'pushState']({ section }, '', location.pathname + hash) },
    action: async () => { throw new Error('That opens the office, which is not part of the team view.') },
  });
  const open = section => views.open(member.sections.includes(section) ? section : first).catch(e => { state.hidden = false; state.textContent = e.message });
  nav.addEventListener('click', e => { const b = e.target.closest('[data-section]'); if (b) { document.body.classList.remove('sidebar-open'); open(b.dataset.section) } });
  $('#team-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
  window.addEventListener('popstate', () => open((location.hash.match(/^#workspace\/([\w-]+)/) || [])[1] || first));
  state.hidden = true; panel.hidden = false;
  document.title = 'Agent HQ · ' + member.label;
  await open((location.hash.match(/^#workspace\/([\w-]+)/) || [])[1] || first);
}

if (typeof document !== 'undefined' && document.body?.classList.contains('hq-team')) start();
