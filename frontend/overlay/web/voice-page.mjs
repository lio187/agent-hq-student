// Voice Mode (Operations › Voice, workstream A5): a call with the Chief of Staff. Speech goes to the student's own
// ElevenLabs account (realtime transcription), the Chief answers on the student's own AI tool, and the answer is
// spoken back. The page drives the office's voice session (ctx.voice) with its own controls (mk-voice-*); nothing is
// sent to ElevenLabs until the student presses Start talking. Leaving the page ends the call.
import {mountOrb} from './voice-orb.mjs';
import {voicePhase} from './voice-activity.mjs';
import {stateView} from './ui.mjs';
import {icon} from './icons.mjs';

const LANGUAGE = {nl: 'Dutch', en: 'English', auto: 'Automatic'};
const LABEL = {idle: 'Ready', connecting: 'Connecting…', listening: 'Listening', thinking: 'Working', speaking: 'Speaking', muted: 'Microphone muted', paused: 'Listening stopped'};
const PROMPT = {idle: 'Press Start talking, say what you need, then pause for a second.', listening: 'Listening. Speak, then pause for a second.', muted: 'Your microphone is muted. Unmute to speak.', paused: 'Listening stopped.'};
const seconds = ms => (Number(ms) / 1000).toFixed(1) + ' s';
const clock = at => { const d = new Date(at); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '' };
// eleven_flash_v2_5 → "Eleven Flash v2.5"
const modelName = id => String(id || '').replace(/^eleven_/, 'Eleven ').replace(/_v(\d+)_(\d+)$/, ' v$1.$2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bV(\d)/, 'v$1');
const MIC_DENIED = /not ?allowed|denied|dismissed/i, NO_MIC = /not ?found|no device|requested device/i;

let status = null, live = null;

export async function page(view, {api, esc}) {
  try { status = await api('voice/status?profile=chief') }
  catch (e) { status = null; return stateView({kind: 'offline', title: 'Voice could not load', body: e.message, actions: [{label: 'Try again', action: 'mk-voice-refresh', primary: true}]}) }
  const s = status, runtime = s.runtime || 'your AI tool';
  if (!s.ready) return stateView({kind: 'setup', title: 'Voice is not set up yet', body: (s.reason || 'Add your ElevenLabs key and choose a voice.') + ' Setup takes about two minutes.',
    actions: [{label: 'Open Setup: Voice', href: '/setup#voice', external: false, primary: true}, {label: 'Check again', action: 'mk-voice-refresh'}]});
  const intro = '<div class="vc-intro"><p>Press Start talking and speak; pause for a second and the Chief answers out loud, on '
    + esc(runtime) + '. It stops listening while it talks: press Space to cut in. Voice never approves anything, and leaving this page ends the call.</p></div>';
  const cell = (key, label, value, sub = '') => '<div><dt>' + esc(label) + '</dt><dd data-mk-meta="' + key + '">' + esc(value) + '</dd><small data-mk-meta-sub="' + key + '">' + esc(sub) + '</small></div>';
  return intro + '<style>:host .mk-voice-help{margin:0;padding:10px 14px;border-radius:var(--radius-control);background:var(--bg-glass-2);border:1px solid var(--border-soft);color:var(--text-body);font-size:13px;line-height:1.5;text-align:left;max-width:52ch}'
    + ':host .mk-voice-help[hidden],:host .mk-voice-reply [hidden]{display:none}:host .mk-voice-help b{color:var(--text-primary)}:host .mk-voice-reply p{margin:0;font-size:14px;line-height:1.55;color:var(--text-body);white-space:pre-wrap;overflow-wrap:anywhere}'
    + ':host .mk-voice-reply .vc-note{margin-top:8px}:host .mk-voice-reply [data-mk-saying]{color:var(--text-primary);margin-bottom:8px}</style>'
    + '<section class="voice-call" data-mk-voice data-phase="idle" aria-label="Voice call with your Chief of Staff">'
    + '<div class="vc-stage" data-mk-stage tabindex="-1">'
    + '<div class="vc-orb-wrap"><canvas class="vc-orb" data-mk-orb width="300" height="300" aria-hidden="true"></canvas></div>'
    + '<p class="vc-phase" data-mk-phase role="status">Ready</p>'
    + '<p class="vc-caption" data-mk-caption data-kind="prompt" aria-live="polite">' + esc(PROMPT.idle) + '</p>'
    + '<p class="vc-note" data-mk-note></p>'
    + '<p class="vc-error" data-mk-error role="alert" hidden></p>'
    + '<div class="mk-voice-help" data-mk-denied role="alert" hidden><b>The microphone is off for 187N Agent HQ.</b> Open System Settings › Privacy &amp; Security › Microphone, turn on 187N Agent HQ, then press Start talking again.</div>'
    + '<div class="mk-voice-help" data-mk-nomic role="alert" hidden><b>No microphone found.</b> Connect a microphone or headset, then press Start talking again.</div>'
    + '<div class="vc-controls">'
    + '<button type="button" class="primary" data-action="mk-voice-start" data-id="chief">' + icon('mic') + ' Start talking</button>'
    + '<button type="button" data-action="mk-voice-mute" data-id="chief" data-on="false" hidden>Mute</button>'
    + '<button type="button" data-action="mk-voice-interrupt" data-id="chief" title="Interrupt the Chief (Space)" hidden disabled>Interrupt <kbd>Space</kbd></button>'
    + '<button type="button" data-action="mk-voice-stop" data-id="chief" hidden>End call</button>'
    + '<button type="button" data-action="agent" data-id="chief" data-mk-open hidden>Open the conversation</button>'
    + '</div>'
    + '<dl class="vc-meta">'
    + cell('voice', 'Voice', s.name || 'Your voice', modelName(s.model))
    + cell('runtime', 'Answers on', runtime, 'Chief of Staff')
    + cell('latency', 'Latency', 'Not measured', 'From your first turn')
    + cell('language', 'Language', LANGUAGE[s.language] || s.language || 'English', s.silence_seconds ? 'Sends after a ' + s.silence_seconds + ' s pause' : '')
    + '</dl></div>'
    + '<div class="vc-side">'
    + '<section class="vc-panel" aria-label="Transcript"><h3>Transcript</h3><div class="vc-transcript" data-mk-transcript><p class="vc-empty">What you and the Chief say appears here.</p></div></section>'
    + '<section class="vc-panel mk-voice-reply" aria-label="The Chief’s reply"><h3>The Chief’s reply</h3><div class="vc-transcript"><p data-mk-saying hidden></p><p data-mk-reply class="vc-empty">The Chief’s latest answer appears here, in full.</p></div><p class="vc-note" data-mk-reply-note></p></section>'
    + '</div></section>';
}

// The call screen follows the voice session: every change in its snapshot updates only what changed.
export function mount(view, el, ctx) {
  const host = el.querySelector('[data-mk-voice]'), voice = ctx.voice;
  if (!host || !voice?.subscribe) return null;
  const $ = s => host.querySelector(s), esc = ctx.esc;
  let denied = false, lineKey = '';
  const orb = mountOrb($('[data-mk-orb]'), {levels: () => voice.levels?.() || {mic: 0, tts: 0}, phase: voicePhase(voice.snapshot())});
  const show = (sel, on) => { const n = $(sel); if (n && n.hidden === on) n.hidden = !on };
  const text = (sel, value) => { const n = $(sel); if (n && n.textContent !== value) n.textContent = value };

  function render(s) {
    const phase = voicePhase(s), busy = Boolean(s.active || s.starting), agent = s.agent || 'Chief of Staff';
    host.dataset.phase = phase; orb.setPhase(phase);
    text('[data-mk-phase]', phase === 'thinking' ? agent + ' is working' : LABEL[phase] || '');
    // The caption: what you are saying (live), what the Chief is saying, or what to do next.
    let caption, kind = 'prompt', note = '';
    const last = (s.lines || []).at(-1);
    if (phase === 'listening' && s.partial) { caption = s.partial; kind = 'partial'; note = 'You · live caption' }
    else if (phase === 'speaking' && s.speech) { caption = s.speech; kind = 'speech'; note = agent + ' · speaking' }
    else if (phase === 'thinking') { caption = 'Thinking…'; kind = 'thinking'; note = agent + ' is answering on ' + (s.runtime?.model ? s.runtime.model : status?.runtime || 'your AI tool') }
    else if (phase === 'connecting') { caption = 'Connecting to ElevenLabs…'; kind = 'status' }
    else if (last && busy) { caption = last.text; kind = 'line'; note = last.who + ' · ' + clock(last.at) }
    else caption = PROMPT[phase] || PROMPT.idle;
    text('[data-mk-caption]', caption); $('[data-mk-caption]').dataset.kind = kind; text('[data-mk-note]', note);
    // Errors: the microphone ones get their own help; the rest are shown as they are.
    const error = s.starting ? '' : String(s.error || ''), micOff = denied || (!busy && MIC_DENIED.test(error)), noMic = !busy && !micOff && NO_MIC.test(error);
    show('[data-mk-denied]', micOff); show('[data-mk-nomic]', noMic);
    text('[data-mk-error]', micOff || noMic ? '' : error); show('[data-mk-error]', Boolean(error) && !micOff && !noMic);
    // Controls.
    const start = $('[data-action="mk-voice-start"]'), mute = $('[data-action="mk-voice-mute"]'), cut = $('[data-action="mk-voice-interrupt"]'), stop = $('[data-action="mk-voice-stop"]');
    start.hidden = busy;
    mute.hidden = !busy; mute.disabled = !s.active; mute.textContent = s.muted ? 'Unmute' : 'Mute'; mute.dataset.on = String(Boolean(s.muted));
    cut.hidden = !busy; cut.disabled = !s.speaking;
    stop.hidden = !busy;
    show('[data-mk-open]', !busy && Boolean(s.conversation));
    const focused = host.getRootNode?.().activeElement;
    if (focused && host.contains(focused) && (focused.hidden || focused.disabled)) $('[data-mk-stage]').focus({preventScroll: true});
    // Latency: time from the end of your turn to the first audio of the answer.
    const lat = (s.latencies || []).filter(l => Number.isFinite(l?.ms) && l.ms > 0);
    text('[data-mk-meta="latency"]', s.lastLatencyMs ? seconds(s.lastLatencyMs) : lat.length ? seconds(lat.at(-1).ms) : 'Not measured');
    text('[data-mk-meta-sub="latency"]', lat.length ? 'First audio, last turn' + (lat.length > 1 ? ' · average ' + seconds(lat.reduce((a, l) => a + l.ms, 0) / lat.length) : '') : 'From your first turn');
    if (s.runtime?.model) text('[data-mk-meta-sub="runtime"]', s.runtime.model);
    // Transcript and the Chief's latest reply.
    const lines = s.lines || [], key = lines.length + '|' + (lines.at(-1)?.at || '') + '|' + (lines.at(-1)?.text || '');
    if (key !== lineKey) {
      lineKey = key;
      const box = $('[data-mk-transcript]'), follow = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      box.innerHTML = lines.length ? lines.map(l => '<p class="vc-line" data-role="' + esc(['you', 'system'].includes(l.role) ? l.role : 'agent') + '"><b><span>' + esc(l.who) + '</span><time>' + esc(clock(l.at)) + '</time></b>' + esc(l.text) + '</p>').join('') : '<p class="vc-empty">What you and the Chief say appears here.</p>';
      if (follow) box.scrollTop = box.scrollHeight;
      const reply = [...lines].reverse().find(l => l.role === 'agent'), r = $('[data-mk-reply]');
      r.className = reply ? '' : 'vc-empty'; r.textContent = reply ? reply.text : 'The Chief’s latest answer appears here, in full.';
      text('[data-mk-reply-note]', reply ? reply.who + ' · ' + clock(reply.at) : '');
    }
    const saying = $('[data-mk-saying]');
    if (phase === 'speaking' && s.speech) { saying.hidden = false; if (saying.textContent !== '“' + s.speech.trim() + '”') saying.textContent = '“' + s.speech.trim() + '”' } else saying.hidden = true;
  }

  live = {
    denied(on) { denied = on; render(voice.snapshot()) },
  };
  render(voice.snapshot());
  const off = voice.subscribe(render);
  return () => {
    off?.(); orb.dispose(); live = null;
    // Leaving the page (another page, or back to the office) ends the call; a fresh render of this page keeps it.
    setTimeout(() => { if ((ctx.section !== 'voice' || !document.body.classList.contains('workspace-open')) && voice.busy?.()) voice.stop() }, 0);
  };
}

export async function act(action, id, ctx) {
  const voice = ctx.voice;
  if (action === 'mk-voice-refresh') return ctx.refresh();
  if (!voice) throw new Error('Voice is not available in this window. Reload the office.');
  if (action === 'mk-voice-start') {
    if (voice.busy?.()) return;
    // A microphone that was turned off for this app: say how to turn it on instead of asking again.
    try { if ((await navigator.permissions?.query({name: 'microphone'}))?.state === 'denied') return live?.denied(true) } catch {}
    live?.denied(false);
    voice.start({profile: 'chief'});
    return;
  }
  if (action === 'mk-voice-stop') return voice.stop();
  if (action === 'mk-voice-mute') return voice.toggleMute();
  if (action === 'mk-voice-interrupt') return voice.interrupt();
}
