// ElevenLabs stand-in (key: test-elevenlabs-key): the voice list (free), voice previews (free), text to speech as a
// streamed 24 kHz PCM sine (paid) and realtime speech to text over a WebSocket (paid per session). The realtime
// socket is a minimal RFC 6455 server: after enough audio chunks it sends a partial, then a committed transcript.
// The batch transcription route (/elevenlabs/v1/speech-to-text) belongs to another stand-in, so unknown paths fall through.
import {createHash} from 'node:crypto';

export const prefix = '/elevenlabs';
export const KEY = 'test-elevenlabs-key';
export const TEXT = process.env.MOCK_STT_TEXT || 'Plan my day';
const PARTIAL_AT = 6, COMMIT_AT = 12;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const sessions = [];
// POST /elevenlabs/__fail {kind}: the next realtime session sends this error right after it starts (a test hook).
let failNext = null;
export function reset() { sessions.length = 0; failNext = null }

const VOICES = base => [
  {voice_id: 'mockvoice01', name: 'Juniper', category: 'premade', labels: {accent: 'american', gender: 'female', age: 'young'}},
  {voice_id: 'mockvoice02', name: 'Atlas', category: 'premade', labels: {accent: 'british', gender: 'male', age: 'middle aged'}},
  {voice_id: 'mockvoice03', name: 'Sage', category: 'premade', labels: {accent: 'dutch', gender: 'female'}},
  {voice_id: 'mockclone01', name: 'My studio voice', category: 'cloned', labels: {}},
].map(v => ({...v, preview_url: base + prefix + '/preview/' + v.voice_id + '.wav', settings: null}));

// 16-bit mono PCM: a soft sine.
function sine(seconds, rate, hz = 440) {
  const n = Math.round(seconds * rate), b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * i / rate) * 0.2 * 32767), i * 2);
  return b;
}
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const denied = (res, send) => send(res, 401, {detail: {status: 'invalid_api_key', message: 'Invalid API key'}});

export async function handle(req, res, {send, paid, base}) {
  const u = req.url_, q = u.pathname.slice(prefix.length);
  if (q === '/__sessions') return send(res, 200, {sessions}), true;
  if (q === '/__fail' && req.method === 'POST') { failNext = req.json.kind || 'error'; return send(res, 200, {ok: true}), true }
  if (q.startsWith('/preview/')) { res.writeHead(200, {'Content-Type': 'audio/wav'}); res.end(wav(sine(0.3, 22050, 523), 22050)); return true }
  if (q === '/v1/voices' && req.method === 'GET') {
    if (req.headers['xi-api-key'] !== KEY) return denied(res, send), true;
    return send(res, 200, {voices: VOICES(base)}), true;
  }
  const tts = q.match(/^\/v1\/text-to-speech\/([^/]+)\/stream$/);
  if (tts && req.method === 'POST') {
    if (req.headers['xi-api-key'] !== KEY) return denied(res, send), true;
    if (!VOICES(base).some(v => v.voice_id === tts[1])) return send(res, 404, {detail: {status: 'voice_not_found', message: 'Voice not found'}}), true;
    const j = req.json, text = String(j.text || '');
    if (u.searchParams.get('output_format') !== 'pcm_24000' || j.model_id !== 'eleven_flash_v2_5' || !text) return send(res, 422, {detail: [{msg: 'TEST: expected pcm_24000, eleven_flash_v2_5 and text'}]}), true;
    paid.push({service: 'elevenlabs', kind: 'tts', voice: tts[1], chars: text.length, text: text.slice(0, 200), at: Date.now()});
    // A short sine per request, sent in a few pieces like a real stream.
    const pcm = sine(Math.min(1.2, 0.25 + text.length * 0.004), 24000);
    res.writeHead(200, {'Content-Type': 'application/octet-stream'});
    const step = Math.ceil(pcm.length / 4 / 2) * 2;
    for (let i = 0; i < pcm.length; i += step) { res.write(pcm.subarray(i, i + step)); await sleep(30) }
    res.end();
    return true;
  }
  return false;
}

// Minimal WebSocket framing (server side: frames out are unmasked, frames in are masked).
function encode(op, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 0xff]) : Buffer.concat([Buffer.from([0x80 | op, 127]), (b => (b.writeBigUInt64BE(BigInt(n)), b))(Buffer.alloc(8))]);
  return Buffer.concat([head, payload]);
}
function decode(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4 }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10 }
  let mask = null;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.subarray(off, off + 4); off += 4 }
  if (buf.length < off + len) return null;
  const payload = Buffer.from(buf.subarray(off, off + len));
  if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
  return {fin, op, payload, size: off + len};
}

export function upgrade(req, socket, head, {paid}) {
  const u = req.url_;
  if (u.pathname !== prefix + '/v1/speech-to-text/realtime') return false;
  if (req.headers['xi-api-key'] !== KEY) {
    socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"detail":{"status":"invalid_api_key"}}');
    return true;
  }
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const s = {id: 'stt' + (sessions.length + 1), query: Object.fromEntries(u.searchParams), chunks: 0, bytes: 0, bad: [], commits: 0, committed: false, closed: false, sent: [], opened: Date.now()};
  sessions.push(s);
  paid.push({service: 'elevenlabs', kind: 'stt', session: s.id, model: s.query.model_id, at: Date.now()});
  const out = (j) => { if (s.closed) return; s.sent.push(j.message_type); socket.write(encode(0x1, Buffer.from(JSON.stringify(j)))) };
  out({message_type: 'session_started', session_id: s.id, config: {sample_rate: 16000, audio_format: s.query.audio_format, language_code: s.query.language_code || null, commit_strategy: s.query.commit_strategy, model_id: s.query.model_id}});
  if (failNext) { const kind = failNext; failNext = null; setTimeout(() => out({message_type: kind, error: 'TEST: ' + kind}), 600) }
  const commit = () => {
    if (s.committed) return;
    s.committed = true;
    out({message_type: 'partial_transcript', text: TEXT});
    out({message_type: 'committed_transcript', text: TEXT});
    out({message_type: 'committed_transcript_with_timestamps', text: TEXT, language_code: s.query.language_code || 'en', words: []});
  };
  const message = text => {
    let j; try { j = JSON.parse(text) } catch { s.bad.push('not json'); return }
    if (j.message_type !== 'input_audio_chunk') { s.bad.push('type ' + j.message_type); return }
    if (j.sample_rate !== 16000 || typeof j.commit !== 'boolean' || typeof j.audio_base_64 !== 'string') { s.bad.push('fields'); return }
    if (j.audio_base_64) {
      const pcm = Buffer.from(j.audio_base_64, 'base64');
      if (pcm.length % 2) s.bad.push('odd length');
      s.chunks++; s.bytes += pcm.length;
      if (s.chunks === PARTIAL_AT && !s.committed) out({message_type: 'partial_transcript', text: TEXT.split(' ').slice(0, -1).join(' ')});
      if (s.chunks === COMMIT_AT) commit();
    }
    if (j.commit) { s.commits++; if (s.chunks) commit() }
  };
  let buf = head?.length ? Buffer.from(head) : Buffer.alloc(0), parts = null;
  socket.on('data', d => {
    buf = Buffer.concat([buf, d]);
    for (let f; (f = decode(buf));) {
      buf = buf.subarray(f.size);
      if (f.op === 0x8) { if (!s.closed) socket.end(encode(0x8, f.payload.subarray(0, 2))); s.closed = true; return }
      if (f.op === 0x9) { socket.write(encode(0xA, f.payload)); continue }
      if (f.op === 0x1 || f.op === 0x2) { if (f.fin) { if (f.op === 0x1) message(f.payload.toString('utf8')); else s.bad.push('binary') } else parts = {op: f.op, data: [f.payload]} }
      if (f.op === 0x0 && parts) { parts.data.push(f.payload); if (f.fin) { if (parts.op === 0x1) message(Buffer.concat(parts.data).toString('utf8')); parts = null } }
    }
  });
  socket.on('close', () => { s.closed = true; s.closedAt = Date.now() });
  socket.on('error', () => { s.closed = true });
  return true;
}
