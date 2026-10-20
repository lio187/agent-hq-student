// Thumbnail stand-in for the competitor posts (the Apify fixtures point at {{MOCK}}/research-media/<name>.png): a small
// solid-colour PNG per name. /research-media/big.png is over 5 MB (the app must refuse it); /research-media/redirect.png
// redirects to a host the app does not allow.
import {deflateSync, crc32} from 'node:zlib';
export const prefix = '/research-media';
export const served = [];
export function reset() { served.length = 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([len, body, crc]) };
function png(name, w = 60, h = 75) {
  let seed = 0; for (const c of name) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rgb = [60 + seed % 160, 60 + (seed >> 8) % 160, 60 + (seed >> 16) % 160];
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
export async function handle(req, res) {
  const name = req.url_.pathname.slice(prefix.length + 1);
  served.push(name);
  if (name === 'redirect.png') { res.writeHead(302, {Location: 'https://images.example.com/elsewhere.png'}); res.end(); return true }
  if (name === 'big.png') { res.writeHead(200, {'Content-Type': 'image/png'}); res.end(Buffer.alloc(5_200_000, 1)); return true }
  if (!/^[\w-]+\.png$/.test(name)) { res.writeHead(404, {'Content-Type': 'text/plain'}); res.end('not found'); return true }
  const body = png(name); res.writeHead(200, {'Content-Type': 'image/png', 'Content-Length': body.length}); res.end(body); return true;
}
