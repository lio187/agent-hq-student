// Media stand-in for Creator Lab: serves the tiny Reel videos and cover images in tests/fixtures/analysis/media
// (the Apify fixture points at {{MOCK}}/media/<file>). Downloads are free; GET /media/__log lists them.
import {readFileSync, existsSync} from 'node:fs';
import {join, basename, extname} from 'node:path';
export const prefix = '/media/';
const DIR = join(import.meta.dirname, '../../fixtures/analysis/media');
const TYPES = {'.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png'};
let log = [];
export function reset() { log = [] }
export async function handle(req, res, {send}) {
  const name = basename(req.url_.pathname.slice(prefix.length));
  if (name === '__log') return send(res, 200, {downloads: log}), true;
  const file = join(DIR, name);
  if (!name || !existsSync(file) || !TYPES[extname(name)]) return send(res, 404, {error: 'no such media ' + name}), true;
  const data = readFileSync(file); log.push({file: name, at: Date.now()});
  res.writeHead(200, {'Content-Type': TYPES[extname(name)], 'Content-Length': data.length}); res.end(data);
  return true;
}
