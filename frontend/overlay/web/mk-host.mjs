// The student edition's own pages (Marketing, Voice, the second brain, Add tools). Each lives in its own module,
// loaded on first use. A page module exports:
//   page(view, ctx) → html        mount?(view, el, ctx) → cleanup?        act(action, id, ctx, el)
// Actions are named mk-<module>-<verb> (for example mk-content-move) and go to that module's act().
// ctx: {api, esc, number, date, btn, pill, row, rows, empty, card, preview, filters, period, root, $, voice, days, section, refresh(), go(view)}
const load = {
  studio: () => import('./mk-studio.mjs'), production: () => import('./mk-production.mjs'), campaigns: () => import('./mk-campaigns.mjs'),
  makers: () => import('./mk-makers.mjs'), research: () => import('./mk-research.mjs'), analysis: () => import('./mk-analysis.mjs'),
  voice: () => import('./voice-page.mjs'), brain: () => import('./brain-folders.mjs'), tools: () => import('./tools-add.mjs'),
  updates: () => import('./mk-updates.mjs'),
};
// Section → module.
export const PAGE = {studio: 'studio', team: 'production', content: 'production', record: 'production', production: 'production', reviews: 'production',
  makers: 'makers', social: null, campaigns: 'campaigns', accounts: 'campaigns', research: 'research', competitors: 'research', analysis: 'analysis',
  voice: 'voice', notes: 'brain', tools: 'tools', updates: 'updates'};
const mods = {};
const mod = async k => mods[k] ??= await load[k]();
export function views(ctx) {
  return Object.fromEntries(Object.entries(PAGE).filter(([, k]) => k).map(([view, k]) => [view, async () => (await mod(k)).page(view, ctx())]));
}
export function mounted(view, el, ctx) {
  const k = PAGE[view], m = k && mods[k];
  // A new version: a one-line notice on every other page (mk-updates.mjs), until the student clicks Later.
  if (view !== 'updates') mod('updates').then(u => u.banner(el, ctx())).catch(() => {});
  return m?.mount ? m.mount(view, el, ctx()) : null;
}
export async function act(action, id, ctx, el) {
  const k = action.slice(3).split('-')[0];
  if (!load[k]) throw new Error('This action is not available.');
  const m = await mod(k);
  if (!m.act) throw new Error('This action is not available.');
  return m.act(action, id, ctx(), el);
}
