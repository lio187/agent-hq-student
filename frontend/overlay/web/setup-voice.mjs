// Setup step: Voice Mode with the student's own ElevenLabs key (workstream A5): the key, a voice (with a free
// sample), the language, on or off, and a test that speaks one sentence (the only part here that uses credits).
import {$, esc, api, keyCard, bindKeyCards, status} from './setup-kit.mjs';

const LANGS = [['en', 'English'], ['nl', 'Dutch'], ['auto', 'Automatic (any language)']];
let cache = null, sample = null;
// The voice settings: from the app state when it carries them, otherwise what this step read last.
const voiceOf = state => state?.voice || cache || {};

export default {
  id: 'voice', label: 'Voice', after: 'brain',
  done: state => Boolean(voiceOf(state).ready),
  summary: state => { const v = voiceOf(state); return ['Voice', v.ready ? 'On · ' + (v.voiceName || 'your voice') : state.keys?.elevenlabs ? 'Key saved · no voice chosen' : 'Not set up'] },
  view(kit) {
    const st = kit.state, v = voiceOf(st), connected = Boolean(st.keys?.elevenlabs);
    let html = '<p class="eyebrow">Voice</p><h1>Talk to your Chief of Staff</h1><p class="lead">Voice Mode lets you speak to your Chief of Staff and hear the answer out loud. It runs on your own ElevenLabs account: speech to text while you talk, text to speech for each answer. ElevenLabs bills these to your account, and nothing is sent until you start a call.</p>'
      + keyCard({name: 'elevenlabs', title: 'ElevenLabs', connected, placeholder: 'Paste your ElevenLabs API key',
        text: connected ? 'Your key is stored in the macOS Keychain on this Mac.' : 'Create a free ElevenLabs account, open Developers › API keys and create a key. Give it access to <b>Text to Speech</b>, <b>Speech to Text</b> and <b>Voices (read)</b>. Checking the key is free.',
        link: 'https://elevenlabs.io/app/developers/api-keys', linkLabel: 'Open ElevenLabs API keys'});
    if (connected) {
      html += '<style>.voice-list{display:grid;gap:2px;max-height:330px;overflow:auto;margin-top:12px}.voice-row{padding:8px 0;border-bottom:1px solid #1c1d20}.voice-row:last-child{border-bottom:0}.voice-row .about{font-size:12.5px}.voice-group{margin:12px 0 2px;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase}</style>'
        + '<section class="card"><div class="row"><h3>Choose a voice</h3><span class="pill ' + (v.voiceId ? 'ok' : 'off') + '" id="voice-chosen">' + esc(v.voiceId ? v.voiceName || 'Chosen' : 'No voice yet') + '</span></div>'
        + '<p>Press Play to hear a free sample, then choose the voice your Chief speaks with.</p><div class="voice-list" id="voice-list"><p class="muted">Loading your voices…</p></div><p class="status" id="voice-status"></p></section>'
        + '<section class="card"><h3>Language you speak</h3><label class="field" style="margin-bottom:4px">Language<select id="voice-lang">' + LANGS.map(([k, l]) => '<option value="' + k + '"' + ((v.language || 'en') === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>'
        + '<p>Choose Dutch or English when you always speak that language: transcription is more accurate. The Chief answers in the language you speak.</p></section>'
        + '<section class="card"><div class="row"><h3>Test my voice</h3><button type="button" class="btn" id="voice-test">Test my voice</button></div><p>Speaks one short sentence with the chosen voice, so you hear how your Chief sounds. This uses a few ElevenLabs credits.</p><p class="status" id="voice-test-status"></p></section>'
        + '<label class="check"><input type="checkbox" id="voice-on"' + (v.enabled || !v.voiceId ? ' checked' : '') + '> <span>Voice Mode is on: the Voice page and the Talk button use your ElevenLabs account. Turn this off to stop them.</span></label>'
        + '<p class="muted">The first time you press Start talking, macOS asks to use the microphone: click OK. You can change this later in System Settings › Privacy &amp; Security › Microphone.</p>';
    }
    return html + kit.footer('voice');
  },
  bind(kit) {
    bindKeyCards(async () => { cache = null; await kit.refresh(); kit.show('voice', {focus: false}) });
    if (!kit.state.keys?.elevenlabs) return;
    const save = async (change, note) => {
      const s = $('#voice-status');
      try { cache = await api('voice/settings', change); kit.state.voice = cache; if (note) status(s, note, 'ok'); return cache }
      catch (e) { status(s, e.message, 'err'); return null }
    };
    loadVoices(save);
    $('#voice-lang')?.addEventListener('change', e => save({language: e.target.value}, 'Language saved.'));
    $('#voice-on')?.addEventListener('change', e => save({enabled: e.target.checked}, e.target.checked ? 'Voice Mode is on.' : 'Voice Mode is off.'));
    $('#voice-test')?.addEventListener('click', e => testVoice(e.target));
  },
};

async function loadVoices(save) {
  const host = $('#voice-list'); if (!host) return;
  let voices, current;
  try { [voices, current] = await Promise.all([api('voice/voices'), api('voice/settings')]); cache = current }
  catch (e) { host.innerHTML = '<p class="status err">' + esc(e.message) + '</p>'; return }
  if (!voices.length) { host.innerHTML = '<p class="muted">Your ElevenLabs account has no voices yet. Add one in ElevenLabs (Voices › Add a voice), then come back.</p>'; return }
  const row = v => '<div class="row voice-row"><span><b>' + esc(v.name) + '</b>' + (v.about ? ' <span class="muted about">' + esc(v.about) + '</span>' : '') + '</span><span class="row" style="gap:8px">'
    + (v.preview_url ? '<button type="button" class="btn" data-voice-play="' + esc(v.preview_url) + '">Play</button>' : '')
    + '<button type="button" class="btn' + (v.id === cache.voiceId ? ' primary' : '') + '" data-voice-pick="' + esc(v.id) + '" data-name="' + esc(v.name) + '">' + (v.id === cache.voiceId ? 'Chosen' : 'Choose') + '</button></span></div>';
  const own = voices.filter(v => v.own), library = voices.filter(v => !v.own);
  host.innerHTML = (own.length ? '<p class="voice-group muted">Your voices</p>' + own.map(row).join('') + '<p class="voice-group muted">ElevenLabs voices</p>' : '') + library.map(row).join('');
  host.querySelectorAll('[data-voice-play]').forEach(b => b.addEventListener('click', () => {
    // A free sample hosted by ElevenLabs; one plays at a time.
    sample?.pause(); host.querySelectorAll('[data-voice-play]').forEach(x => x.textContent = 'Play');
    sample = new Audio(b.dataset.voicePlay); b.textContent = 'Playing…';
    sample.onended = sample.onerror = () => { b.textContent = 'Play' };
    sample.play().catch(() => { b.textContent = 'Play'; status($('#voice-status'), 'This sample could not play. Check your internet connection.', 'err') });
  }));
  host.querySelectorAll('[data-voice-pick]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await save({voiceId: b.dataset.voicePick, voiceName: b.dataset.name, enabled: $('#voice-on')?.checked !== false}, b.dataset.name + ' is your Chief’s voice.');
    b.disabled = false; if (!r) return;
    host.querySelectorAll('[data-voice-pick]').forEach(x => { const on = x.dataset.voicePick === r.voiceId; x.classList.toggle('primary', on); x.textContent = on ? 'Chosen' : 'Choose' });
    const pill = $('#voice-chosen'); if (pill) { pill.textContent = r.voiceName || 'Chosen'; pill.className = 'pill ok' }
  }));
}

// Plays the test sentence as it streams in (24 kHz 16-bit PCM). Only a click starts it: it uses credits.
async function testVoice(button) {
  const s = $('#voice-test-status');
  if (!cache?.voiceId) { status(s, 'Choose a voice first.', 'err'); return }
  const ctx = new AudioContext(); button.disabled = true; status(s, 'Speaking…');
  try {
    await ctx.resume();
    const r = await fetch('/api/student/voice/test', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({voiceId: cache.voiceId, language: $('#voice-lang')?.value})});
    if (!r.ok) { const d = await r.json().catch(() => null); throw new Error(d?.error?.message || 'The test did not work (' + r.status + ').') }
    const reader = r.body.getReader(); let carry = new Uint8Array(), at = ctx.currentTime + 0.05, total = 0;
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      const bytes = new Uint8Array(carry.length + value.length); bytes.set(carry); bytes.set(value, carry.length);
      const size = bytes.length - bytes.length % 2; carry = bytes.slice(size); if (!size) continue;
      const buffer = ctx.createBuffer(1, size / 2, 24000), out = buffer.getChannelData(0), view = new DataView(bytes.buffer, 0, size);
      for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
      const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination);
      at = Math.max(at, ctx.currentTime + 0.02); node.start(at); at += buffer.duration; total += buffer.duration;
    }
    if (!total) throw new Error('ElevenLabs sent no audio. Try again.');
    await new Promise(done => setTimeout(done, Math.max(0, (at - ctx.currentTime) * 1000) + 100));
    status(s, 'Done: that is how your Chief sounds (' + total.toFixed(1) + ' s).', 'ok');
  } catch (e) { status(s, e.message, 'err') }
  finally { button.disabled = false; ctx.close().catch(() => {}) }
}
