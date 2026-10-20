// Groq stand-in (key: test-groq-key; the base is /groq/openai/v1, like the real OpenAI-compatible API).
//   GET  /groq/openai/v1/models                 free: the key check
//   POST /groq/openai/v1/audio/transcriptions   billable: multipart (file, model, response_format) → verbose_json
// The transcript comes from tests/fixtures/analysis/transcripts.json, by the uploaded file name (<shortCode>.m4a).
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const prefix = '/groq';
export const KEY = 'test-groq-key';
const FIX = join(import.meta.dirname, '../../fixtures/analysis');
let calls = [];
export function reset() { calls = [] }

// Minimal multipart/form-data reader: {fields: {name: value}, files: {name: {filename, type, data}}}.
export function multipart(req) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(req.headers['content-type'] || ''); if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim()), raw = req.raw, out = {fields: {}, files: {}};
  let at = raw.indexOf(boundary);
  while (at >= 0) {
    const start = at + boundary.length; if (raw.slice(start, start + 2).toString() === '--') break;
    const headEnd = raw.indexOf('\r\n\r\n', start); if (headEnd < 0) break;
    const head = raw.slice(start, headEnd).toString(), next = raw.indexOf(boundary, headEnd);
    const body = raw.slice(headEnd + 4, next < 0 ? raw.length : next - 2);
    const name = /name="([^"]*)"/.exec(head)?.[1], filename = /filename="([^"]*)"/.exec(head)?.[1];
    if (name != null) { if (filename != null) out.files[name] = {filename, type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] || '', data: body}; else out.fields[name] = body.toString() }
    at = next;
  }
  return out;
}
export const transcript = code => { try { return JSON.parse(readFileSync(join(FIX, 'transcripts.json'), 'utf8'))[code] || null } catch { return null } };
// An .m4a/.mp4 file starts with a box whose type is "ftyp".
export const isM4A = data => data?.length > 12 && data.slice(4, 8).toString() === 'ftyp';

export async function handle(req, res, {send, paid}) {
  const p = req.url_.pathname.slice(prefix.length);
  if (req.headers.authorization !== 'Bearer ' + KEY) return send(res, 401, {error: {message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key'}}), true;
  if (p === '/openai/v1/models' && req.method === 'GET') return send(res, 200, {object: 'list', data: [{id: 'whisper-large-v3-turbo', object: 'model', owned_by: 'OpenAI'}, {id: 'whisper-large-v3', object: 'model', owned_by: 'OpenAI'}]}), true;
  if (p === '/openai/v1/audio/transcriptions' && req.method === 'POST') {
    const form = multipart(req), file = form?.files.file;
    if (!file || !file.data.length) return send(res, 400, {error: {message: 'TEST: file is required'}}), true;
    if (form.fields.model !== 'whisper-large-v3-turbo') return send(res, 400, {error: {message: 'TEST: unexpected model ' + form.fields.model}}), true;
    if (form.fields.response_format !== 'verbose_json') return send(res, 400, {error: {message: 'TEST: response_format must be verbose_json'}}), true;
    if (!isM4A(file.data)) return send(res, 400, {error: {message: 'TEST: the upload is not an m4a file'}}), true;
    const code = file.filename.replace(/\.[^.]+$/, ''), t = transcript(code) || {language: 'English', duration: 3, segments: [{start: 0, end: 3, text: 'A short test transcript with enough words to analyse.'}]};
    paid.push({service: 'groq', kind: 'transcription', file: file.filename, bytes: file.data.length, at: Date.now()}); calls.push(code);
    return send(res, 200, {task: 'transcribe', language: t.language, duration: t.duration, text: t.segments.map(s => s.text).join(' '),
      segments: t.segments.map((s, id) => ({id, seek: 0, start: s.start, end: s.end, text: ' ' + s.text, tokens: [], temperature: 0, avg_logprob: -0.2, compression_ratio: 1.2, no_speech_prob: 0.01})),
      x_groq: {id: 'req_test_' + calls.length}}), true;
  }
  return send(res, 404, {error: {message: 'unknown ' + p}}), true;
}
