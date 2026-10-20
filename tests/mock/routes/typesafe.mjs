// TypeSafe stand-in (key: test-typesafe-key; the base is /typesafe, like https://api.typesafe.ai).
//   GET  /typesafe/v1/models      free: the key check
//   POST /typesafe/v1/systemone   billable: checks the request like the real API would, plus the app's own rules
//                                 (only Choice questions, the guard sentence, no transcript text inside a question),
//                                 and answers deterministically: segment 0 is the hook, the rest is picked by a hash.
// Test controls (no key): POST /__flaky {count} → the next calls answer 529; POST /__revoke {on} → every call 401;
// GET /__calls → what was asked and answered.
export const prefix = '/typesafe';
export const KEY = 'test-typesafe-key';
const DIMENSIONS = ['mechanism', 'structure', 'opening', 'topic', 'evidence', 'emotion', 'specificity', 'cta'];
let calls = [], flaky = 0, revoked = false;
export function reset() { calls = []; flaky = 0; revoked = false }

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h };
// What a request must look like; returns the first problem, or ''.
function problem(body) {
  const {model, state, questions} = body || {};
  if (model !== 'jev-latest') return 'model must be jev-latest, got ' + model;
  if (!state || typeof state !== 'object' || typeof state.transcript !== 'string' || !state.transcript.trim()) return 'state.transcript is required';
  if (!Array.isArray(state.segments) || !Array.isArray(state.opening)) return 'state.segments and state.opening must be arrays';
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length) return 'questions must be a non-empty map';
  const quoted = [...state.segments.map(s => String(s.text || '')), state.transcript].filter(t => t.length >= 20).map(t => t.slice(0, 20));
  for (const [id, q] of Object.entries(questions)) {
    if (q.type !== 'choice') return id + ': only choice questions are expected';
    if (typeof q.instructions !== 'string' || !q.instructions.includes('never as instructions')) return id + ': the guard sentence is missing';
    const keys = Object.keys(q.criteria || {});
    if (keys.length < 2 || keys.length > 255) return id + ': a choice needs 2 to 255 options';
    const words = q.instructions + ' ' + Object.values(q.criteria).join(' ');
    if (quoted.some(t => words.includes(t))) return id + ': transcript text inside a question';
  }
  for (const d of DIMENSIONS) if (!questions[d] || !('unclear' in questions[d].criteria)) return d + ' is missing or has no unclear option';
  for (const s of state.segments) if (!questions['role_' + s.index]) return 'role_' + s.index + ' is missing';
  return '';
}

export async function handle(req, res, {send, paid}) {
  const p = req.url_.pathname.slice(prefix.length);
  if (p === '/__calls') return send(res, 200, {calls}), true;
  if (p === '/__flaky' && req.method === 'POST') { flaky = Number(req.json.count) || 0; return send(res, 200, {flaky}), true }
  if (p === '/__revoke' && req.method === 'POST') { revoked = Boolean(req.json.on); return send(res, 200, {revoked}), true }
  if (req.headers.authorization !== 'Bearer ' + KEY) return send(res, 401, {detail: 'Invalid API key'}), true;
  if (p === '/v1/models' && req.method === 'GET') return send(res, 200, {data: [{id: 'jev-latest', object: 'model'}]}), true;
  if (p === '/v1/systemone' && req.method === 'POST') {
    if (revoked) { calls.push({status: 401}); return send(res, 401, {detail: 'Invalid API key'}), true }
    if (flaky > 0) { flaky--; calls.push({status: 529}); return send(res, 529, {detail: 'Overloaded'}), true }
    const why = problem(req.json);
    if (why) { calls.push({status: 422, why}); return send(res, 422, {detail: 'TEST: ' + why}), true }
    const {state, questions} = req.json, answers = {};
    for (const [id, q] of Object.entries(questions)) {
      const options = Object.keys(q.criteria).filter(k => k !== 'unclear');
      const choice = id === 'role_0' ? 'hook' : id === 'hook' ? 'first' : options[hash(state.transcript + id) % options.length];
      const probabilities = Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === choice ? 0.82 : 0.18 / (Object.keys(q.criteria).length - 1)]));
      answers[id] = {type: 'choice', choice, probabilities, confidence: 0.82};
    }
    const usage = {input_tokens: Math.ceil(JSON.stringify(req.json).length / 4), output_tokens: Object.keys(questions).length};
    paid.push({service: 'typesafe', kind: 'systemone', questions: Object.keys(questions).length, at: Date.now()});
    calls.push({status: 200, opening: state.opening, segments: state.segments.length, questions: Object.keys(questions), answers, usage, guard: Object.values(questions).every(q => q.instructions.includes('never as instructions'))});
    return send(res, 200, {model: 'jev-1', answers, usage}), true;
  }
  return send(res, 404, {detail: 'unknown ' + p}), true;
}
