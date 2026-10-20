// The student update feed's stand-in: a static host on 127.0.0.1 that serves whatever the test puts there.
//   POST /updates/__set {files: {"<name>": "<base64>"}}   add or replace files; POST /updates/__clear
//   GET  /updates/<name>                                 the file (404 when absent); GET /updates/__hits → the requests
//   GET  /updates/__redirect?to=<url>                     a 302 to that address
export const prefix = '/updates';
const files = new Map(); let hits = [];
export function reset() { hits = [] }
const TYPES = {json: 'application/json', sig: 'application/json', dmg: 'application/x-apple-diskimage', exe: 'application/vnd.microsoft.portable-executable'};
export async function handle(req, res, {send}) {
  const u = req.url_, name = decodeURIComponent(u.pathname.slice(prefix.length + 1));
  if (name === '__set' && req.method === 'POST') { for (const [k, v] of Object.entries(req.json.files || {})) files.set(k, Buffer.from(v, 'base64')); return send(res, 200, {ok: true, files: [...files.keys()]}), true }
  if (name === '__clear' && req.method === 'POST') { files.clear(); return send(res, 200, {ok: true}), true }
  if (name === '__hits') return send(res, 200, {hits}), true;
  if (name === '__redirect') { res.writeHead(302, {Location: u.searchParams.get('to') || '/'}); res.end(); return true }
  hits.push({name, ua: req.headers['user-agent'] || '', at: Date.now()});
  const f = files.get(name);
  if (!f) return send(res, 404, {error: 'not found'}), true;
  res.writeHead(200, {'Content-Type': TYPES[name.split('.').pop()] || 'application/octet-stream', 'Content-Length': f.length}); res.end(f);
  return true;
}
