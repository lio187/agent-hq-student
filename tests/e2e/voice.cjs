// Voice Mode end to end, with real clicks and a fake microphone (Chromium's test tone):
//   not set up → Setup (key, voice, sample, test) → Voice page → Start talking → realtime transcript ("Plan my day")
//   → the Chief's conversation turn (the claude stand-in answers) → voice/speak → audio plays → End call;
//   leaving the page ends the call; the dock's Talk button runs the same loop; a blocked microphone says how to fix it.
// Nothing is paid before a click on Start talking or Test my voice (the stand-in's /__paid counter).
//   node tests/e2e/voice.cjs [port] [mockPort]
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
// The same files ownerSnapshot() fingerprints, one by one (so a change can be named).
const ownerFiles = () => Object.fromEntries(['.claude.json', '.claude/CLAUDE.md', '.claude/settings.json', '.codex/config.toml', '.codex/AGENTS.md', '.hermes/config.yaml', '.hermes/.env', '.hermes/SOUL.md', '.claude/skills', '.codex/skills', '.agents/skills', '.hermes/skills'].map(f => {
  const p = path.join(os.homedir(), f); let v = '-';
  try { v = fs.statSync(p).isDirectory() ? fs.readdirSync(p).sort().join(',') : crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') } catch {}
  return [f, v];
}));
(async () => {
  const H = await import(path.join(__dirname, '../lib/harness.mjs'));
  const {chromium} = require(H.PLAYWRIGHT);
  const APP = Number(process.argv[2] || 4651), MOCK = Number(process.argv[3] || 4650);
  const before = H.ownerSnapshot(), files = ownerFiles();
  const app = await H.launch({name: 'a5-voice', port: APP, mockPort: MOCK, env: {HQS_SHIM_REPLIES: path.join(__dirname, '../fixtures/voice')}});
  const media = ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--enable-unsafe-swiftshader'];
  const browser = await chromium.launch({args: ['--use-fake-ui-for-media-stream', ...media]});
  const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  const problems = [], results = []; let where = 'start', expectRefusal = false, blocked = null;
  page.on('pageerror', e => problems.push(where + ' · pageerror ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error' && !(expectRefusal && /voice\/listen|403/.test(m.text()))) problems.push(where + ' · console ' + m.text().slice(0, 200)) });
  page.on('response', r => { if (r.status() >= 500) problems.push(where + ' · HTTP ' + r.status() + ' ' + new URL(r.url()).pathname) });
  const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')) };
  const mock = async p => (await fetch(app.mockURL + p)).json();
  const paid = async () => (await mock('/__paid')).calls.filter(c => c.service === 'elevenlabs');
  const sessions = async () => (await mock('/elevenlabs/__sessions')).sessions;
  const until = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v } catch {} if (Date.now() > end) return null; await page.waitForTimeout(150) } };
  const view = sel => page.locator('#cockpit-panel').locator(sel);
  const api = (p, body) => page.evaluate(async ({p, body}) => { const r = await fetch(p, body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); return {status: r.status, body: await r.json().catch(() => null)} }, {p, body});
  const direct = async (p, body) => { const r = await fetch(app.url + p, {method: body === undefined ? 'GET' : 'POST', headers: {cookie: 'hqs=' + app.token, origin: app.url, 'content-type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)}); return {status: r.status, body: await r.json().catch(() => null)} };
  const listen = () => page.evaluate(() => new Promise(done => { const w = new WebSocket(location.origin.replace('http', 'ws') + '/api/hq/v1/voice/listen'); w.onopen = () => done({open: true, socket: (window.__ws = w, 'kept')}); w.onerror = () => done({open: false}) }));
  // Sidebar → Operations → Voice (or another page), with real clicks.
  const openPage = async section => {
    const item = page.locator('#hq-nav .sb-item[data-section="' + section + '"]').first();
    if (!(await item.isVisible())) await page.locator('#hq-nav [data-toggle="operations"]').first().click();
    await item.click();
    await page.waitForFunction(s => location.hash === '#workspace/' + s, section, {timeout: 8000});
    await page.waitForTimeout(400);
  };
  const callState = () => page.evaluate(() => { const r = document.querySelector('#cockpit-panel')?.shadowRoot; const c = r?.querySelector('[data-mk-voice]'); return c ? {phase: c.dataset.phase, transcript: c.querySelector('[data-mk-transcript]').innerText, reply: c.querySelector('[data-mk-reply]').innerText, latency: c.querySelector('[data-mk-meta="latency"]').innerText, error: c.querySelector('[data-mk-error]').hidden ? '' : c.querySelector('[data-mk-error]').innerText, denied: !c.querySelector('[data-mk-denied]').hidden} : null });
  try {
    await fetch(app.mockURL + '/__reset', {method: 'POST'});
    await page.goto(app.launchURL); await page.waitForTimeout(400);
    const setup = await H.setupViaAPI(page, app);
    check('setup through the app API', Object.values(setup).every(r => r.status === 200), JSON.stringify(Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, v.status]))));

    where = 'not set up';
    const st0 = await api('/api/hq/v1/voice/status?profile=chief');
    check('status before setup: not ready, with a reason', st0.status === 200 && st0.body.ready === false && /ElevenLabs key/.test(st0.body.reason) && st0.body.profile === 'chief' && st0.body.transcription === 'scribe_v2_realtime', st0.body.reason);
    expectRefusal = true; const refused = await listen(); expectRefusal = false;
    check('microphone stream refused before setup', refused.open === false);
    await page.goto(app.url + '/#office'); await page.waitForTimeout(3000);
    await page.locator('#chief-dock [data-talk]').click();
    const talkNotReady = await until(async () => /Add your ElevenLabs key in Setup, then Voice/.test(await page.locator('#voice-session [data-state]').innerText()), 8000);
    check('Talk before setup says what to do (no microphone, no stream)', Boolean(talkNotReady) && (await paid()).length === 0, await page.locator('#voice-session [data-state]').innerText());
    await page.locator('#voice-session [data-close]').click();
    await openPage('voice');
    const notSet = await until(async () => (await view('.ui-state[data-kind="setup"]').innerText()).includes('Voice is not set up yet') && view('a[href="/setup#voice"]').isVisible());
    check('Voice page: not set up, with a link to Setup', Boolean(notSet));

    where = 'setup';
    const bad = await direct('/api/student/keys', {name: 'elevenlabs', key: 'wrong-key'});
    check('a wrong key is refused with a plain message', bad.status === 422 && /did not accept/.test(bad.body?.error?.message || ''), bad.body?.error?.message);
    const good = await api('/api/student/keys', {name: 'elevenlabs', key: 'test-elevenlabs-key'});
    check('the ElevenLabs key is checked and saved', good.status === 200 && good.body.connected === true);
    const voices = await api('/api/student/voice/voices');
    check('voices list (own voices first)', voices.status === 200 && voices.body.length === 4 && voices.body[0].own === true && voices.body.every(v => v.id && v.name && 'preview_url' in v), voices.body.map(v => v.name).join(', '));
    const saved = await api('/api/student/voice/settings', {voiceId: 'mockvoice02', voiceName: 'Atlas', language: 'en', enabled: true});
    check('voice settings saved; voice is ready', saved.status === 200 && saved.body.ready === true && saved.body.voiceId === 'mockvoice02');
    const badLang = await direct('/api/student/voice/settings', {language: 'fr'});
    check('an unknown language is refused', badLang.status === 422);
    const state = await api('/api/student/state');
    check('setup state carries the voice summary, never the key', state.body.voice?.ready === true && !JSON.stringify(state.body).includes('test-elevenlabs-key'));

    // The Setup step with real clicks: change the voice (free sample first), then Test my voice (paid, on click).
    await page.goto(app.url + '/setup#voice');
    await page.locator('#voice-list [data-voice-pick]').first().waitFor({timeout: 8000});
    check('Setup › Voice shows the key as connected and the voices', await page.locator('.pill.ok', {hasText: 'Connected'}).first().isVisible() && await page.locator('#voice-list [data-voice-pick]').count() === 4);
    await page.locator('#voice-list [data-voice-play]').nth(1).click(); await page.waitForTimeout(600);
    await page.locator('#voice-list [data-voice-pick][data-voice-pick="mockvoice01"]').click();
    await until(async () => (await page.locator('#voice-status').innerText()).includes('Juniper'));
    await page.selectOption('#voice-lang', 'en'); await page.waitForTimeout(300);
    const v1 = await api('/api/student/voice/settings');
    await page.screenshot({path: app.dirs.shots + '/setup-voice.png', fullPage: true});
    check('choosing a voice with a click saves it', v1.body.voiceId === 'mockvoice01' && v1.body.voiceName === 'Juniper' && v1.body.ready === true);
    const freeSoFar = await paid();
    check('no paid ElevenLabs calls before a click on Test or Start (key check, voices, samples, settings)', freeSoFar.length === 0, JSON.stringify(freeSoFar));
    await page.locator('#voice-test').click();
    const tested = await until(async () => /Done: that is how your Chief sounds/.test(await page.locator('#voice-test-status').innerText()), 10000);
    const afterTest = await paid();
    check('Test my voice speaks one sentence (one paid speech call)', Boolean(tested) && afterTest.length === 1 && afterTest[0].kind === 'tts' && afterTest[0].voice === 'mockvoice01' && /Hi Test\. I am your Chief of Staff/.test(afterTest[0].text), await page.locator('#voice-test-status').innerText());
    await direct('/api/student/voice/settings', {voiceId: 'gonevoice', voiceName: 'Gone'});
    const gone = await direct('/api/student/voice/test', {});
    check('a voice that no longer exists gets a plain message', gone.status === 422 && /cannot find this voice/.test(gone.body?.error?.message || ''), gone.body?.error?.message);
    await direct('/api/student/voice/settings', {voiceId: 'mockvoice01', voiceName: 'Juniper'});
    await fetch(app.mockURL + '/__reset', {method: 'POST'});

    where = 'voice page';
    await page.goto(app.url + '/'); await page.waitForTimeout(3000);
    await openPage('voice');
    await view('[data-mk-voice]').waitFor({timeout: 8000});
    const idle = await callState();
    check('Voice page shows the call screen', idle?.phase === 'idle' && await view('[data-action="mk-voice-start"]').isVisible());
    check('nothing paid by opening the Voice page', (await paid()).length === 0);
    await page.evaluate(() => { const c = document.querySelector('#cockpit-panel').shadowRoot.querySelector('[data-mk-voice]'); window.__phases = [c.dataset.phase]; new MutationObserver(() => window.__phases.push(c.dataset.phase)).observe(c, {attributes: true, attributeFilter: ['data-phase']}) });
    await view('[data-action="mk-voice-start"]').click();
    const heard = await until(async () => /Plan my day/.test((await callState()).transcript), 20000);
    check('committed transcript appears in the transcript', Boolean(heard), (await callState()).transcript.replace(/\s+/g, ' ').slice(0, 120));
    const turn = await until(async () => app.calls().find(c => c.tool === 'claude' && c.args.includes('-p') && c.args[c.args.indexOf('-p') + 1].includes('Plan my day')), 15000);
    check('the Chief gets the transcript as a conversation turn (Claude Code stand-in)', Boolean(turn));
    const replied = await until(async () => /Here is your plan for today/.test((await callState()).reply), 20000);
    check('the Chief’s reply text is shown', Boolean(replied), (await callState()).reply.slice(0, 80));
    const spoken = await until(async () => { const p = await paid(); return p.some(c => c.kind === 'tts' && /Here is your plan for today/.test(c.text)) && p }, 15000);
    check('the reply is spoken through voice/speak', Boolean(spoken), spoken ? spoken.filter(c => c.kind === 'tts').map(c => c.text.slice(0, 40)).join(' | ') : '');
    check('the greeting uses the student’s first name', Boolean(spoken) && spoken.some(c => c.kind === 'tts' && /^Hi Test\. Chief of Staff here/.test(c.text)));
    await page.screenshot({path: app.dirs.shots + '/call.png'});
    const played = await until(async () => { const s = await callState(); return /\d+\.\d s/.test(s.latency) && s }, 15000);
    check('audio played (first-audio latency measured)', Boolean(played), played?.latency);
    const phases = [...new Set(await page.evaluate(() => window.__phases))];
    check('the call screen follows the session (connecting, listening, working, speaking)', ['connecting', 'listening', 'thinking', 'speaking'].every(p => phases.includes(p)), phases.join(' → '));
    const s1 = (await sessions())[0];
    check('realtime transcription: one session, right model, format, language and audio chunks', s1 && s1.query.model_id === 'scribe_v2_realtime' && s1.query.audio_format === 'pcm_16000' && s1.query.commit_strategy === 'vad' && s1.query.language_code === 'en' && s1.chunks >= 12 && s1.bad.length === 0 && s1.sent.includes('session_started'),
      s1 && JSON.stringify({query: s1.query, chunks: s1.chunks, bad: s1.bad}));
    expectRefusal = true; const second = await listen(); expectRefusal = false;
    check('a second microphone stream is refused while a call is open', second.open === false);
    await view('[data-action="mk-voice-stop"]').click();
    const ended = await until(async () => (await sessions())[0]?.closed && (await callState()).phase === 'idle', 8000);
    check('End call closes the transcription session', Boolean(ended));
    const paidCall = await paid();
    check('paid calls during the call: 1 transcription session + speech', paidCall.filter(c => c.kind === 'stt').length === 1 && paidCall.filter(c => c.kind === 'tts').length >= 2, paidCall.map(c => c.kind).join(','));

    where = 'conversation';
    check('after the call, Open the conversation is offered', await view('[data-mk-open]').isVisible());
    await view('[data-mk-open]').click();
    const chat = await until(async () => { const t = await page.locator('#messages').innerText(); return /Plan my day/.test(t) && /Here is your plan for today/.test(t) }, 10000);
    check('the voice turn is saved as a normal conversation with the Chief', Boolean(chat));
    await openPage('voice'); await view('[data-mk-voice]').waitFor({timeout: 8000});

    where = 'transcription error';
    await fetch(app.mockURL + '/elevenlabs/__fail', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({kind: 'quota_exceeded'})});
    await view('[data-action="mk-voice-start"]').click();
    const quota = await until(async () => { const s = await callState(); return s.phase === 'idle' && /no credits left for speech to text/.test(s.error) && s }, 10000);
    check('an ElevenLabs error ends the call with a plain message', Boolean(quota) && (await sessions()).at(-1).closed, (await callState()).error);

    where = 'leave page';
    await view('[data-action="mk-voice-start"]').click();
    await until(async () => (await sessions()).length === 3 && (await callState()).phase === 'listening', 10000);
    await openPage('calendar');
    const left = await until(async () => (await sessions())[2]?.closed, 8000);
    check('leaving the Voice page ends the call', Boolean(left));

    where = 'talk button';
    await page.goto(app.url + '/?from=talk#office'); await page.waitForTimeout(3000);   // a fresh office (a new voice session)
    const talk = page.locator('#chief-dock [data-talk]'), turnsBefore = app.calls().filter(c => c.tool === 'claude' && c.args.includes('-p')).length;
    check('the dock’s Talk button is visible', await talk.isVisible());
    await talk.click();
    check('the floating panel starts empty', !(await page.locator('#voice-session [data-transcript]').innerText()).trim());
    const panelHeard = await until(async () => /You: Plan my day[\s\S]*Chief of Staff: Here is your plan/.test(await page.locator('#voice-session [data-transcript]').innerText()), 25000);
    await page.screenshot({path: app.dirs.shots + '/talk.png'});
    check('Talk runs the same loop in the floating panel', Boolean(panelHeard) && await page.locator('#voice-session').isVisible());
    const talkTurn = await until(async () => app.calls().filter(c => c.tool === 'claude' && c.args.includes('-p')).length > turnsBefore, 15000);
    check('Talk sends the turn to the Chief', Boolean(talkTurn));
    await page.locator('#voice-session [data-close]').click();
    check('closing the panel ends the call', Boolean(await until(async () => (await sessions()).every(s => s.closed), 8000)));

    where = 'microphone blocked';
    // A microphone the student turned off: (1) the system refuses it when the call starts (macOS privacy setting);
    // (2) the page already knows it is blocked (permission state "denied"), so the call does not even start.
    blocked = await chromium.launch({args: ['--use-fake-ui-for-media-stream=deny', ...media]});
    const ctx2 = await blocked.newContext({viewport: {width: 1440, height: 900}});
    await ctx2.addCookies([{name: 'hqs', value: app.token, domain: '127.0.0.1', path: '/'}]);
    const p2 = await ctx2.newPage(); const p2errors = []; p2.on('pageerror', e => p2errors.push(e.message));
    const p2state = () => p2.evaluate(() => { const c = document.querySelector('#cockpit-panel')?.shadowRoot?.querySelector('[data-mk-voice]'); return c ? {phase: c.dataset.phase, error: c.querySelector('[data-mk-error]').hidden ? '' : c.querySelector('[data-mk-error]').innerText, denied: !c.querySelector('[data-mk-denied]').hidden, help: c.querySelector('[data-mk-denied]').innerText} : {hash: location.hash} });
    const paidBefore = (await paid()).length, sessionsBefore = (await sessions()).length;
    for (const how of ['refused when the call starts', 'already blocked before the call']) {
      if (how.startsWith('already')) {
        const cdp = await ctx2.newCDPSession(p2), {targetInfo} = await cdp.send('Target.getTargetInfo');
        await cdp.send('Browser.setPermission', {permission: {name: 'microphone'}, setting: 'denied', origin: app.url, browserContextId: targetInfo.browserContextId});
      }
      await p2.goto(app.url + '/#workspace/voice'); await p2.waitForTimeout(3500);
      await p2.locator('#cockpit-panel').locator('[data-action="mk-voice-start"]').click();
      const shown = await until(async () => { const st = await p2state(); return st.denied && st.phase === 'idle' && st }, 10000);
      await p2.screenshot({path: app.dirs.shots + '/mic-' + how.split(' ')[0] + '.png'});
      check('microphone ' + how + ': the page says how to turn it on', Boolean(shown) && /System Settings › Privacy & Security › Microphone/.test(shown.help) && !shown.error && p2errors.length === 0, JSON.stringify(await p2state()) + ' ' + p2errors.join(' | '));
    }
    check('nothing paid and no transcription session when the microphone is blocked', (await paid()).length === paidBefore && (await sessions()).length === sessionsBefore);
    await blocked.close(); blocked = null;

    where = 'turn off';
    const offRes = await api('/api/student/voice/settings', {enabled: false});
    const st2 = await api('/api/hq/v1/voice/status');
    check('turning Voice Mode off makes it not ready', offRes.body.ready === false && st2.body.ready === false && /off/.test(st2.body.reason));
    const speakOff = await direct('/api/hq/v1/voice/speak', {text: 'Hello'});
    check('speech is refused while Voice Mode is off', speakOff.status === 409);
    await api('/api/student/voice/settings', {enabled: true});
  } catch (e) { check('test ran without an exception', false, e.stack?.split('\n').slice(0, 3).join(' ')) }
  finally {
    await blocked?.close().catch(() => {}); await browser.close().catch(() => {}); await app.stop();
    const after = H.ownerSnapshot();
    console.log('\nowner configuration unchanged: ' + (before === after));
    if (before !== after) { const now = ownerFiles(); console.log('  changed: ' + Object.keys(now).filter(k => now[k] !== files[k]).join(', ') + ' (this check never writes there: the app runs with a fake home)') }
    console.log('problems (' + problems.length + ')'); problems.forEach(p => console.log('  ' + p));
    const failed = results.filter(r => !r).length;
    console.log(results.length - failed + '/' + results.length + ' checks passed');
    console.log('screenshots: ' + app.dirs.shots);
    process.exitCode = failed || problems.length || before !== after ? 1 : 0;
  }
})();
