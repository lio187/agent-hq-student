// Hacker News (Algolia) stand-in: GET /api/v1/search. Stories come from tests/fixtures/research/hn.json; "hoursAgo"
// becomes created_at / created_at_i relative to now. The numericFilters the app sends are checked.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const prefix = '/hn';
export const calls = [];
export function reset() { calls.length = 0 }
const FIX = join(import.meta.dirname, '../../fixtures/research/hn.json');
export async function handle(req, res, {send}) {
  const u = req.url_, p = u.pathname.slice(prefix.length);
  if (p === '/__calls') return send(res, 200, {calls}), true;
  if (p !== '/api/v1/search' && p !== '/api/v1/search_by_date') return send(res, 404, {message: 'Not Found', status: 404}), true;
  const query = u.searchParams.get('query') || '', filters = u.searchParams.get('numericFilters') || '';
  calls.push({query, tags: u.searchParams.get('tags'), filters, at: Date.now()});
  const since = Number(/created_at_i>(\d+)/.exec(filters)?.[1] || 0);
  if (!since) return send(res, 400, {message: 'TEST: the search must be limited to recent stories (created_at_i)', status: 400}), true;
  const hits = JSON.parse(readFileSync(FIX, 'utf8')).map(({hoursAgo, ...h}) => {
    const t = Date.now() - hoursAgo * 3600e3;
    return {created_at: new Date(t).toISOString().replace(/\.\d+Z$/, 'Z'), created_at_i: Math.floor(t / 1000), _tags: ['story', 'author_' + h.author, 'story_' + h.objectID], story_text: null, ...h};
  }).filter(h => h.created_at_i > since);
  return send(res, 200, {hits, nbHits: hits.length, page: 0, nbPages: 1, hitsPerPage: Number(u.searchParams.get('hitsPerPage') || 20), exhaustiveNbHits: true, query, params: u.search.slice(1), processingTimeMS: 1}), true;
}
