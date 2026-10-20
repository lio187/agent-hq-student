// ElevenLabs speech-to-text stand-in, the batch API only (Creator Lab). The rest of /elevenlabs is the voice
// stand-in's (elevenlabs.mjs); this file sorts first, so it answers its own path before that one.
//   POST /elevenlabs/v1/speech-to-text   billable: multipart (file, model_id) with xi-api-key: test-elevenlabs-key
// The words come from tests/fixtures/analysis/transcripts.json, by the uploaded file name (<shortCode>.m4a).
import {multipart, transcript, isM4A} from './groq.mjs';
export const prefix = '/elevenlabs/v1/speech-to-text';
export const KEY = 'test-elevenlabs-key';

// Segments → Scribe's word list: words spread evenly over each segment, with "spacing" entries in between.
function words(segments) {
  const out = [];
  for (const s of segments) {
    const list = s.text.split(/\s+/).filter(Boolean), step = (s.end - s.start) / Math.max(1, list.length);
    list.forEach((w, i) => {
      if (out.length) out.push({text: ' ', type: 'spacing', start: s.start + i * step, end: s.start + i * step, logprob: 0, speaker_id: 'speaker_0'});
      out.push({text: w, type: 'word', start: +(s.start + i * step).toFixed(3), end: +(s.start + (i + 1) * step).toFixed(3), logprob: -0.1, speaker_id: 'speaker_0'});
    });
  }
  return out;
}

export async function handle(req, res, {send, paid}) {
  if (req.url_.pathname !== prefix) return false;
  if (req.method !== 'POST') return send(res, 405, {detail: {status: 'method_not_allowed', message: 'Use POST.'}}), true;
  if (req.headers['xi-api-key'] !== KEY) return send(res, 401, {detail: {status: 'invalid_api_key', message: 'Invalid API key.'}}), true;
  const form = multipart(req), file = form?.files.file;
  if (!file || !file.data.length) return send(res, 422, {detail: {status: 'invalid_request', message: 'TEST: file is required'}}), true;
  if (!/^scribe_v\d/.test(form.fields.model_id || '')) return send(res, 422, {detail: {status: 'invalid_request', message: 'TEST: unexpected model_id ' + form.fields.model_id}}), true;
  if (!isM4A(file.data)) return send(res, 422, {detail: {status: 'invalid_request', message: 'TEST: the upload is not an m4a file'}}), true;
  const code = file.filename.replace(/\.[^.]+$/, ''), t = transcript(code) || {segments: [{start: 0, end: 3, text: 'A short test transcript with enough words to analyse.'}]};
  paid.push({service: 'elevenlabs', kind: 'transcription', file: file.filename, bytes: file.data.length, at: Date.now()});
  return send(res, 200, {language_code: 'eng', language_probability: 0.99, text: t.segments.map(s => s.text).join(' '), words: words(t.segments), transcription_id: 'tr_' + code}), true;
}
