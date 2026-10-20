// Setup step: Research (workstream A2). Apify with the student's own key (Competitors and Creator Lab) and a monthly
// limit, an optional Groq key (fast transcription in Creator Lab), an optional TypeSafe key (Jev classifies the Reels
// in Creator Lab) and the topics Signals watches. All optional.
import {$, api, keyCard, bindKeyCards, status, footer} from './setup-kit.mjs';

const money = v => '$' + (Number(v) || 0).toFixed(2);

export default {
  id: 'research', label: 'Research', after: 'voice',
  view: kit => {
    const k = kit.state?.keys || {};
    return '<p class="eyebrow">Research</p><h1>Research</h1><p class="lead">Signals watches free public sources (GitHub, Hacker News, Hugging Face and OpenAI news) for your topics and needs no account. Competitors collects the latest posts of accounts you choose, with your own Apify account. Everything on this page is optional.</p>'
      + keyCard({name: 'apify', title: 'Apify', connected: k.apify, link: 'https://console.apify.com/settings/integrations', linkLabel: 'Open your Apify API key',
        text: 'Apify collects competitor posts for the Competitors page and Reels for Creator Lab. Create a free Apify account, copy your API token from Settings → API &amp; Integrations and paste it here. Apify’s free plan includes a monthly usage credit (currently $5). Every collection shows its maximum cost and asks you first.'})
      + '<section class="card"><div class="row"><h3>Monthly limit for Apify</h3><span class="pill" id="rs-month">…</span></div><p>The most Apify may cost you per month through this app. A collection that would go over it does not start.</p>'
      + '<label class="field">Monthly limit in US dollars<input type="text" id="rs-cap" inputmode="decimal" autocomplete="off" placeholder="5"></label>'
      + '<div class="actions"><button type="button" class="btn" id="rs-cap-save">Save limit</button></div><p class="status" id="rs-cap-status"></p></section>'
      + keyCard({name: 'groq', title: 'Groq', connected: k.groq, link: 'https://console.groq.com/keys', linkLabel: 'Get a Groq key',
        text: 'Optional. Creator Lab can use Groq to transcribe Reels quickly. Without a Groq key, Creator Lab transcribes with your ElevenLabs key from the Voice step.'})
      + keyCard({name: 'typesafe', title: 'TypeSafe (Jev)', connected: k.typesafe, link: 'https://console.typesafe.ai/keys', linkLabel: 'Get a TypeSafe key',
        text: 'Optional. Jev, TypeSafe’s classification model, labels the hook, structure and segments of every Reel in Creator Lab: fast, one request per Reel, on your own TypeSafe account. Without a TypeSafe key, your own AI tool does this.'})
      + '<section class="card"><h3>Signals topics</h3><p>GitHub and Hacker News are searched for these topics every hour while the app is open. You can change them later on the Signals page.</p>'
      + '<label class="field">Topics, separated by commas<input type="text" id="rs-topics" maxlength="320" autocomplete="off" placeholder="AI agents, automation"></label>'
      + '<div class="actions"><button type="button" class="btn" id="rs-topics-save">Save topics</button></div><p class="status" id="rs-topics-status"></p></section>'
      + footer('research');
  },
  async bind(kit) {
    bindKeyCards(async () => { await kit.refresh(); kit.show('research', {focus: false}) });
    const fill = s => {
      if ($('#rs-cap') && document.activeElement !== $('#rs-cap')) $('#rs-cap').value = Number(s.capUsd ?? 5);
      if ($('#rs-month')) $('#rs-month').textContent = money(s.monthUsd) + ' used this month';
      if ($('#rs-topics') && document.activeElement !== $('#rs-topics')) $('#rs-topics').value = (s.topics || []).join(', ');
    };
    try { fill(await api('research/setup')) } catch (e) { status($('#rs-cap-status'), e.message, 'err') }
    $('#rs-cap-save')?.addEventListener('click', async e => {
      const s = $('#rs-cap-status'), usd = Number($('#rs-cap').value.replace(',', '.').replace('$', '').trim());
      if (!Number.isFinite(usd) || usd < 0 || usd > 500 || $('#rs-cap').value.trim() === '') return status(s, 'Enter a monthly limit between $0 and $500.', 'err');
      e.target.disabled = true; status(s, 'Saving…');
      try { fill(await api('research/cap', {usd})); status(s, 'Saved. Collections stay within ' + money(usd) + ' a month.', 'ok') } catch (err) { status(s, err.message, 'err') }
      e.target.disabled = false;
    });
    $('#rs-topics-save')?.addEventListener('click', async e => {
      const s = $('#rs-topics-status'), topics = $('#rs-topics').value.split(',').map(t => t.trim()).filter(Boolean);
      e.target.disabled = true; status(s, 'Saving…');
      try { fill(await api('research/topics', {topics})); status(s, 'Saved. Signals checks these topics next.', 'ok') } catch (err) { status(s, err.message, 'err') }
      e.target.disabled = false;
    });
  },
  done: state => Boolean(state?.keys?.apify),
  summary: state => ['Research', state?.keys?.apify ? 'Apify connected' + (state.keys.groq ? ' · Groq connected' : '') + (state.keys.typesafe ? ' · TypeSafe connected' : '') : 'Apify not connected (Signals works without it)'],
};
