import {escapeHTML as esc} from './message-view.mjs';
const ENGINES=[
 ['creative-engine','Creative Engine','content','Create a brand-aligned creative brief'],
 ['mission-control','Mission Control','command','Coordinate a mission across the team'],
 ['ai-agents-automations','Agents & Automations','build','Design an automation workflow'],
 ['customer-support','Customer Support','revenue','Review the customer support queue'],
 ['growth-media','Growth & Media','growth','Prepare a growth and media review'],
 ['creators','Creators & Talent','revenue','Prepare a creator campaign brief'],
 ['video-engine','Video Engine','content','Prepare a video production brief'],
];
const ATTENTION = new Set(['waiting', 'review', 'blocked', 'failed']);
const TERMINAL = new Set(['done', 'cancelled']);
const setText = (node, value) => { if (node.textContent !== String(value)) node.textContent = value; };
const statusLabel = task => ({waiting_for_input:'Needs response', waiting_for_approval:'Needs approval', running:'In progress'})[task.status] || task.status;

export function createEngineRail({openTeam, openTask, newBrief, showDetail}) {
 const root = document.querySelector('#engine-rail');
 let work = [], stale = false, panel = null, selected = null, expanded = false;
 root.innerHTML = `<div class="engine-brand"><img src="/static/logo-ui.png" alt="187N infinity"><span>187N / HEADQUARTERS</span><h2>One team.<br>Seven engines.</h2></div><div class="engine-list">${ENGINES.map(([id,name],i)=>`<button class="engine-tile" data-engine="${id}"><img src="/static/console-${id}.jpg" alt="${name} console preview"><span><small>0${i+1}</small> ${name} <b>↗</b></span></button>`).join('')}</div>`;

 function renderWork() {
  // A different detail view may have replaced this console in the shared dialog.
  if (!panel?.isConnected || !panel.closest('dialog')?.open) return;
  const tasks = work.filter(t => t.department === selected[2]);
  const queue = tasks.filter(t => !TERMINAL.has(t.stage));
  setText(panel.querySelector('[data-engine-running]'), tasks.filter(t => t.stage === 'running').length);
  setText(panel.querySelector('[data-engine-attention]'), tasks.filter(t => ATTENTION.has(t.stage)).length);
  setText(panel.querySelector('[data-engine-done]'), tasks.filter(t => t.stage === 'done').length);
  panel.querySelector('[data-engine-freshness]').textContent = `${stale || tasks.some(t => t.stale) ? 'Last known team work · data unavailable' : 'Live team work'} · ${selected[2]}. Counts cover this team across projects.`;
  const list = panel.querySelector('[data-engine-queue]');
  const scrollHost = panel.closest('dialog');
  const scrollTop = scrollHost.scrollTop;
  const focused = document.activeElement;
  const hadQueueFocus = list.contains(focused);
  const old = new Map([...list.children].map(n => [n.dataset.engineKey, n]));
  const visible = expanded ? queue : queue.slice(0, 8);
  const keep = new Set(visible.map(t => t.key));
  for (const [key, node] of old) if (!keep.has(key)) node.remove();
  visible.forEach((task, index) => {
   let button = old.get(task.key);
   if (!button) {
    button = document.createElement('button');
    button.className = 'engine-work';
    button.innerHTML = '<span></span><small></small>';
    button.dataset.engineKey = task.key;
    button.onclick = () => { document.querySelector('#detail').close(); openTask(button.dataset.engineTask); };
   }
   button.dataset.engineTask = task.id;
   button.dataset.state = task.stage;
   button.querySelector('span').textContent = task.title || 'Conversation';
   button.querySelector('small').textContent = statusLabel(task) + ' ↗';
   if (list.children[index] !== button) list.insertBefore(button, list.children[index] || null);
  });
  const more = panel.querySelector('[data-engine-more]');
  more.hidden = !expanded && queue.length <= 8;
  more.textContent = expanded ? 'Show fewer' : `Show all ${queue.length} items`;
  panel.querySelector('[data-engine-empty]').hidden = queue.length > 0;
  panel.querySelector('[data-engine-queue-count]').textContent = queue.length;
  if (hadQueueFocus) (focused.isConnected ? focused : panel.querySelector('#engine-team')).focus({preventScroll:true});
  scrollHost.scrollTop = scrollTop;
 }

 function open(id) {
  selected = ENGINES.find(e => e[0] === id);
  if (!selected) return;
  expanded = false;
  const [key, name, dept, brief] = selected;
  showDetail(name, `<div class="engine-console"><img src="/static/console-${key}.jpg" alt="${esc(name)} console preview from 187n.ai"><p class="muted">187n.ai console preview</p><div class="engine-metrics" aria-live="polite" aria-atomic="true"><div><strong data-engine-running>0</strong><span>Running</span></div><div><strong data-engine-attention>0</strong><span>Needs attention</span></div><div><strong data-engine-done>0</strong><span>Completed</span></div></div><p class="muted" data-engine-freshness></p><div class="actions"><button id="engine-team">Open team ↗</button><button id="engine-brief" class="primary">New brief ↗</button></div><h3>Team queue · <span data-engine-queue-count>0</span></h3><div data-engine-queue></div><p class="muted" data-engine-empty>No active tasks. Start with a brief.</p><button data-engine-more hidden>Show all</button></div>`, '187N / ' + name.toUpperCase());
  panel = document.querySelector('.engine-console');
  panel.querySelector('#engine-team').onclick = () => { document.querySelector('#detail').close(); openTeam(dept); };
  panel.querySelector('#engine-brief').onclick = () => { document.querySelector('#detail').close(); newBrief(dept, brief); };
  panel.querySelector('[data-engine-more]').onclick = () => { expanded = !expanded; renderWork(); };
  renderWork();
 }
 root.querySelectorAll('[data-engine]').forEach(b => b.onclick = () => open(b.dataset.engine));
 return {update(items, options = {}) { work = items; stale = !!options.stale; renderWork(); }, open};
}
