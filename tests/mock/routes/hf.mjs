// Hugging Face Hub stand-in: GET /api/models?sort=trendingScore&direction=-1&limit=N (a plain list of models, as the
// real API returns). Models come from tests/fixtures/research/hf.json.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const prefix = '/hf';
export const calls = [];
export function reset() { calls.length = 0 }
const FIX = join(import.meta.dirname, '../../fixtures/research/hf.json');
export async function handle(req, res, {send}) {
  const u = req.url_, p = u.pathname.slice(prefix.length);
  if (p === '/__calls') return send(res, 200, {calls}), true;
  if (p !== '/api/models') return send(res, 404, {error: 'Sorry, we can\'t find the page you are looking for.'}), true;
  calls.push({sort: u.searchParams.get('sort'), direction: u.searchParams.get('direction'), limit: u.searchParams.get('limit'), at: Date.now()});
  const limit = Math.min(1000, Number(u.searchParams.get('limit') || 1000));
  const models = JSON.parse(readFileSync(FIX, 'utf8')).map(({daysAgo, ...m}) => ({_id: m.id.replace(/\W/g, '').slice(0, 24), private: false, createdAt: new Date(Date.now() - daysAgo * 86400e3).toISOString(), modelId: m.id, ...m}));
  if (u.searchParams.get('sort') === 'trendingScore') models.sort((a, b) => (Number(u.searchParams.get('direction')) === -1 ? -1 : 1) * (a.trendingScore - b.trendingScore));
  return send(res, 200, models.slice(0, limit)), true;
}
