// Composio v3.1 stand-in (key: test-composio-key).
export const prefix = '/composio';
export const KEY = 'test-composio-key';
let accounts = [], n = 0;
export function reset() { accounts = []; n = 0 }
export async function handle(req, res, {send, base}) {
  const u = req.url_, q = decodeURIComponent(u.pathname.slice(prefix.length)), j = req.json;
  if (q === '/mock-login') { const a = accounts.find(x => x.id === u.searchParams.get('ca')); if (a) a.status = 'ACTIVE'; res.writeHead(302, {Location: u.searchParams.get('cb') + '?status=success'}); res.end(); return true }
  if (req.headers['x-api-key'] !== KEY) return send(res, 401, {error: {message: 'Invalid API key', status: 401}}), true;
  if (q === '/toolkits') return send(res, 200, {items: ['gmail', 'googlecalendar', 'slack', 'notion', 'github', 'shopify'].map(s => ({slug: s, name: s[0].toUpperCase() + s.slice(1), composio_managed_auth_schemes: s === 'shopify' ? [] : ['OAUTH2'], meta: {logo: '', description: ''}}))}), true;
  if (q === '/auth_configs' && req.method === 'GET') return send(res, 200, {items: []}), true;
  if (q === '/auth_configs') return send(res, 201, {auth_config: {id: 'ac_' + j.toolkit.slug}}), true;
  if (q === '/connected_accounts/link') { const id = 'ca_' + (++n); accounts.push({id, toolkit: {slug: j.auth_config_id.slice(3)}, status: 'INITIATED', state: {val: {displayName: 'student@example.com'}}, created_at: new Date().toISOString()}); return send(res, 201, {redirect_url: base + prefix + '/mock-login?ca=' + id + '&cb=' + encodeURIComponent(j.callback_url), connected_account_id: id}), true }
  if (q === '/connected_accounts' && req.method === 'GET') return send(res, 200, {items: accounts}), true;
  if (q.startsWith('/connected_accounts/') && req.method === 'GET') { const a = accounts.find(x => x.id === q.split('/')[2]); return a ? send(res, 200, a) : send(res, 404, {error: {message: 'Not found'}}), true }
  if (q.startsWith('/connected_accounts/') && req.method === 'DELETE') { const i = accounts.findIndex(x => x.id === q.split('/')[2]); if (i >= 0) accounts.splice(i, 1); return send(res, 200, {success: true}), true }
  if (q === '/tool_router/session' && req.method === 'POST') return send(res, 201, {session_id: 'trs_test1', mcp: {type: 'http', url: base + '/composio-mcp/trs_test1'}, config: j}), true;
  if (q === '/tool_router/session/trs_test1') return send(res, 200, {session_id: 'trs_test1', mcp: {type: 'http', url: base + '/composio-mcp/trs_test1'}}), true;
  if (q === '/tools/execute/GOOGLECALENDAR_EVENTS_LIST') { const d = new Date(); d.setHours(15, 0, 0, 0); const e = new Date(d.getTime() + 3600e3); return send(res, 200, {successful: true, error: null, data: {items: [{id: 'g1', summary: 'Coaching call', start: {dateTime: d.toISOString()}, end: {dateTime: e.toISOString()}, htmlLink: 'https://calendar.google.com/'}]}}), true }
  return send(res, 404, {error: {message: 'unknown ' + q}}), true;
}
