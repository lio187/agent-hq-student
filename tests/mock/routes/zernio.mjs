// Zernio v1 stand-in (key: test-zernio-key). Publishing is never allowed here: anything that is not a draft is
// refused and recorded in /zernio/__published, which a test asserts is empty. Media follows docs.zernio.com:
// POST /media/presign → PUT to uploadUrl (storage, without the API key) → the publicUrl goes into mediaItems.
export const prefix = '/zernio';
export const KEY = 'test-zernio-key';
const start = () => [{_id: 'z1', platform: 'instagram', username: 'student.studio', displayName: 'Student Studio', isActive: true, followersCount: 1840, profilePicture: null}];
const TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'application/pdf'];
let zaccounts = start(), n = 0;
export const published = [], drafts = [], uploads = new Map();
export function reset() { zaccounts = start(); n = 0; published.length = 0; drafts.length = 0; uploads.clear() }
export async function handle(req, res, {send, base}) {
  const u = req.url_, q = u.pathname.slice(prefix.length);
  if (q === '/mock-login') { zaccounts.push({_id: 'z' + (++n + 1), platform: u.searchParams.get('platform'), username: 'new.account', displayName: 'New Account', isActive: true, followersCount: 120}); res.writeHead(302, {Location: u.searchParams.get('cb') + '?connected=' + u.searchParams.get('platform')}); res.end(); return true }
  if (q === '/__published') return send(res, 200, {published}), true;
  if (q === '/__drafts') return send(res, 200, {drafts}), true;
  if (q === '/__uploads') return send(res, 200, {uploads: [...uploads.values()].map(({body, ...x}) => x)}), true;
  // Storage: the presigned PUT. Like real storage it takes no API key, and the type must match the presign.
  if (q.startsWith('/__storage/')) {
    const key = decodeURIComponent(q.slice(11)), up = uploads.get(key);
    if (req.method !== 'PUT' || !up) return send(res, 404, {error: 'no such upload'}), true;
    if (req.headers.authorization) return send(res, 400, {error: 'TEST: the storage upload must not carry the API key'}), true;
    if (req.headers['content-type'] !== up.contentType) return send(res, 400, {error: 'Content-Type does not match the presign'}), true;
    Object.assign(up, {uploaded: true, bytes: req.raw.length, body: req.raw}); res.writeHead(200, {ETag: '"' + key + '"'}); res.end(); return true;
  }
  if (req.headers.authorization !== 'Bearer ' + KEY) return send(res, 401, {error: 'Invalid API key', code: 'invalid_credentials'}), true;
  if (q === '/profiles') return send(res, 200, {profiles: [{_id: 'prof1', name: 'Default', isDefault: true}]}), true;
  if (q === '/accounts') return send(res, 200, {accounts: zaccounts}), true;
  if (q.startsWith('/connect/')) return send(res, 200, {authUrl: base + prefix + '/mock-login?platform=' + q.split('/')[2] + '&cb=' + encodeURIComponent(u.searchParams.get('redirect_url'))}), true;
  if (q === '/analytics') return send(res, 200, {posts: [0, 1, 2, 3].map(i => ({_id: 'post' + i, content: 'Post number ' + (i + 1) + ' about AI agents', platform: 'instagram', publishedAt: new Date(Date.now() - i * 86400e3).toISOString(), platformPostUrl: 'https://www.instagram.com/p/x' + i, analytics: {views: 1000 * (i + 1), likes: 80 + i, comments: 5 + i, shares: 2}, platforms: [{platform: 'instagram', accountId: 'z1'}]}))}), true;
  if (q === '/accounts/follower-stats') return send(res, 200, {accounts: [], stats: {}}), true;
  if (q === '/media/presign' && req.method === 'POST') {
    const {filename, contentType, size} = req.json;
    if (!filename || !TYPES.includes(contentType)) return send(res, 400, {error: 'Invalid request (missing filename or unsupported contentType)', code: 'INVALID_FIELD_VALUE'}), true;
    const key = 'temp/' + Date.now() + '_' + (++n) + '_' + filename;
    uploads.set(key, {key, filename, contentType, size, uploaded: false});
    return send(res, 200, {uploadUrl: base + prefix + '/__storage/' + encodeURIComponent(key), publicUrl: 'https://media.example.com/' + key, key, expiresIn: 3600}), true;
  }
  if (q === '/posts' && req.method === 'POST') {
    const j = req.json;
    if (j.isDraft !== true || j.publishNow || j.scheduledFor || j.queuedFromProfile) { published.push(j); return send(res, 400, {error: 'TEST: publishing is not allowed in tests'}), true }
    const missing = (j.mediaItems || []).filter(m => ![...uploads.values()].some(up => up.uploaded && m.url === 'https://media.example.com/' + up.key));
    if (missing.length) return send(res, 400, {error: 'Media was not uploaded: ' + missing.map(m => m.url).join(', ')}), true;
    const post = {_id: 'draft' + (++n), status: 'draft', ...j};
    drafts.push({...post, idempotencyKey: req.headers['idempotency-key'] || ''});
    return send(res, 201, {post, message: 'Post saved as draft'}), true;
  }
  return send(res, 404, {error: 'unknown ' + q}), true;
}
