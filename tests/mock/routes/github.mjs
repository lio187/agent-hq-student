// GitHub REST stand-in: repository search (GET /search/repositories). Repositories come from
// tests/fixtures/research/github.json; "hoursAgo" becomes created_at relative to now, so the app's 7-day window holds.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const prefix = '/github';
export const calls = [];
export function reset() { calls.length = 0 }
const FIX = join(import.meta.dirname, '../../fixtures/research/github.json');
export async function handle(req, res, {send}) {
  const u = req.url_, p = u.pathname.slice(prefix.length);
  if (p === '/__calls') return send(res, 200, {calls}), true;
  if (p !== '/search/repositories') return send(res, 404, {message: 'Not Found', documentation_url: 'https://docs.github.com/rest'}), true;
  const q = u.searchParams.get('q') || '';
  calls.push({q, sort: u.searchParams.get('sort'), order: u.searchParams.get('order'), at: Date.now()});
  if (!/created:>=\d{4}-\d{2}-\d{2}/.test(q)) return send(res, 422, {message: 'TEST: the search must be limited to recently created repositories'}), true;
  const items = JSON.parse(readFileSync(FIX, 'utf8')).map(({hoursAgo, ...r}, i) => ({id: 900000 + i, node_id: 'R_test' + i, name: r.full_name.split('/')[1], private: false, fork: false,
    created_at: new Date(Date.now() - hoursAgo * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z'), updated_at: new Date().toISOString(), forks_count: Math.round(r.stargazers_count / 9), topics: [], ...r}));
  return send(res, 200, {total_count: items.length, incomplete_results: false, items}), true;
}
