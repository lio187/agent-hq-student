// Local stand-ins for the services the app talks to (no real accounts, no costs). Every file in routes/ adds a
// service: export {prefix, handle(req, res, ctx) → true when handled, upgrade?(req, socket, head, ctx)}.
//   node tests/mock/index.mjs [port]      (default 4590; MOCK_PORT also works)
import {createServer} from 'node:http';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const port = Number(process.argv[2] || process.env.MOCK_PORT || 4590);
const base = 'http://127.0.0.1:' + port;
const routes = [];
for (const f of readdirSync(resolve(import.meta.dirname, 'routes')).filter(f => f.endsWith('.mjs')).sort()) routes.push(await import(pathToFileURL(resolve(import.meta.dirname, 'routes', f)).href));
// Paid calls (anything a real service would bill) are counted; tests read /__paid and reset with POST /__reset.
const ctx = {base, paid: [], send(res, status, data, headers = {}) { res.writeHead(status, {'Content-Type': 'application/json', ...headers}); res.end(typeof data === 'string' ? data : JSON.stringify(data)) }};
const server = createServer(async (req, res) => {
  const u = new URL(req.url, base); let raw = Buffer.alloc(0); for await (const c of req) raw = Buffer.concat([raw, c]);
  req.raw = raw; req.url_ = u; try { req.json = raw.length && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : {} } catch { req.json = {} }
  if (u.pathname === '/__paid') return ctx.send(res, 200, {count: ctx.paid.length, calls: ctx.paid});
  if (u.pathname === '/__reset' && req.method === 'POST') { ctx.paid.length = 0; for (const r of routes) r.reset?.(); return ctx.send(res, 200, {ok: true}) }
  for (const r of routes) if (u.pathname.startsWith(r.prefix) && await r.handle(req, res, ctx)) return;
  ctx.send(res, 404, {error: 'unknown ' + u.pathname});
});
server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, base); req.url_ = u;
  for (const r of routes) if (r.upgrade && u.pathname.startsWith(r.prefix) && r.upgrade(req, socket, head, ctx)) return;
  socket.destroy();
});
server.listen(port, '127.0.0.1', () => console.log('mock on ' + port + ': ' + routes.map(r => r.prefix).join(' ')));
