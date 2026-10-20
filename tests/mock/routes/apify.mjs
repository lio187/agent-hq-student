// Apify v2 stand-in (key: test-apify-key). A run without maxTotalChargeUsd is refused (the app must always cap
// cost); each started run counts as a paid call. Dataset items come from tests/fixtures/apify/<actor>.json
// (actor id with ~, e.g. apify~instagram-reel-scraper.json); pricing from tests/fixtures/apify/pricing.json.
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
export const prefix = '/apify';
export const KEY = 'test-apify-key';
const FIX = join(import.meta.dirname, '../../fixtures/apify');
let runs = {}, n = 0;
export function reset() { runs = {}; n = 0 }
// Pricing per actor from every tests/fixtures/apify/pricing*.json (each area adds its own file).
const pricing = actor => {
  const all = Object.assign({}, ...readdirSync(FIX).filter(f => /^pricing.*\.json$/.test(f)).map(f => JSON.parse(readFileSync(join(FIX, f), 'utf8'))));
  return all[actor] || {pricingModel: 'PRICE_PER_DATASET_ITEM', pricePerUnitUsd: 0.0026};
};
// "{{MOCK}}" in a fixture becomes this stand-in's address (for media URLs the app downloads).
let mockBase = '';
const items = actor => { const f = join(FIX, actor + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8').replaceAll('{{MOCK}}', mockBase)) : [] };
export async function handle(req, res, {send, paid, base}) {
  mockBase = base;
  const p = req.url_.pathname.slice(prefix.length), sp = req.url_.searchParams;
  if (req.headers.authorization !== 'Bearer ' + KEY) return send(res, 401, {error: {type: 'token-not-valid', message: 'Authentication token is not valid.'}}), true;
  if (p === '/v2/users/me') return send(res, 200, {data: {id: 'user1', username: 'student'}}), true;
  let m;
  if ((m = p.match(/^\/v2\/acts\/([^/]+)$/))) return send(res, 200, {data: {id: m[1], name: m[1].split('~')[1], title: m[1].split('~')[1], pricingInfos: [pricing(m[1])]}}), true;
  if ((m = p.match(/^\/v2\/acts\/([^/]+)\/runs$/)) && req.method === 'POST') {
    const cap = Number(sp.get('maxTotalChargeUsd'));
    if (!cap) return send(res, 400, {error: {type: 'invalid-input', message: 'TEST: maxTotalChargeUsd is required'}}), true;
    const id = 'run' + (++n); runs[id] = {id, actor: m[1], polls: 0, cap, input: req.json, maxItems: Number(sp.get('maxItems') || 50), status: 'RUNNING', defaultDatasetId: 'ds_' + id};
    paid.push({service: 'apify', actor: m[1], cap, at: Date.now()});
    return send(res, 201, {data: runs[id]}), true;
  }
  if ((m = p.match(/^\/v2\/actor-runs\/([^/]+)$/))) {
    const r = runs[m[1]]; if (!r) return send(res, 404, {error: {message: 'not found'}}), true;
    if (r.status === 'RUNNING' && ++r.polls >= 1) { r.status = 'SUCCEEDED'; r.usageTotalUsd = Math.min(r.cap, 0.01 * Math.min(r.maxItems, items(r.actor).length || 1)) }
    return send(res, 200, {data: r}), true;
  }
  if ((m = p.match(/^\/v2\/actor-runs\/([^/]+)\/abort$/))) { const r = runs[m[1]]; if (r) r.status = 'ABORTED'; return send(res, 200, {data: r || {}}), true }
  if ((m = p.match(/^\/v2\/datasets\/ds_([^/]+)\/items$/))) { const r = runs[m[1]]; return send(res, 200, r ? items(r.actor).slice(0, Number(sp.get('limit') || 1000)) : []), true }
  return send(res, 404, {error: {message: 'unknown ' + p}}), true;
}
