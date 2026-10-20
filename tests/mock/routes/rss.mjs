// Feed stand-ins: the OpenAI news RSS feed (/rss/openai-news.xml) and a student's own Atom feed (/rss/student-feed.xml),
// from tests/fixtures/research/*.xml. "{{RFC822:-26}}" / "{{ISO:-5}}" become dates that many hours ago.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const prefix = '/rss';
export const calls = [];
export function reset() { calls.length = 0 }
const FIX = join(import.meta.dirname, '../../fixtures/research');
const FEEDS = {'/openai-news.xml': ['openai-news.xml', 'application/rss+xml; charset=utf-8'], '/student-feed.xml': ['student-feed.xml', 'application/atom+xml; charset=utf-8']};
const dated = text => text.replace(/\{\{(RFC822|ISO):(-?\d+(?:\.\d+)?)\}\}/g, (_, kind, h) => { const d = new Date(Date.now() + Number(h) * 3600e3); return kind === 'ISO' ? d.toISOString() : d.toUTCString() });
export async function handle(req, res, {send}) {
  const p = req.url_.pathname.slice(prefix.length);
  if (p === '/__calls') return send(res, 200, {calls}), true;
  const f = FEEDS[p];
  if (!f) return send(res, 404, '<html><body>Not found</body></html>', {'Content-Type': 'text/html'}), true;
  calls.push({path: p, at: Date.now()});
  return send(res, 200, dated(readFileSync(join(FIX, f[0]), 'utf8')), {'Content-Type': f[1]}), true;
}
