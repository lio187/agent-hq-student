# Tests (student app)

Everything runs against an isolated **test build** with stand-ins, never against real services, the owner's real AI-tool configuration or the live office.

1. Build the test app: `sh build.sh --test`
2. Run a check, for example the click-through sweep of every page: `node tests/e2e/sweep.cjs [appPort] [mockPort]`

## Pieces
- `lib/harness.mjs`: `launch({name, port, mockPort, signedIn, env})` starts one test copy of the app. It gets:
  - its own data folder (`HQS_SUPPORT_DIR`), Keychain entry (`HQS_KEYCHAIN_SERVICE`) and fake home (`HQS_HOME_OVERRIDE`);
  - the CLI stand-ins (`HQS_EXTRA_PATH`), with no Terminal (`HQS_NO_TERMINAL`) and no window (`HQS_HEADLESS`; set `HQS_SHOW=1` to see it).
  
  Other helpers: `setupViaAPI(page, app)` does what the wizard does, and `ownerSnapshot()` fingerprints the owner's real `~/.claude*`, `~/.codex`, `~/.hermes` and skills folders. Every check compares that fingerprint before and after.
- `mock/index.mjs [port]`: the local service stand-ins. Each file in `mock/routes/` is one service: Composio, Zernio, Apify, and later ElevenLabs, Groq and the news sources.
  - `GET /__paid` lists the billable calls, so a check can prove that nothing was paid before a confirm click. `POST /__reset` clears it.
  - Zernio refuses anything that is not a draft.
- `shims/*.mjs`: stand-ins for `claude`, `codex` and `hermes`. They keep their state in `HQS_SHIM_STATE` (`auth-<tool>` = `in`/`out`, plus `calls.log` with every call's arguments and environment variable names). Replies come from fixture files: the first line is a text the prompt must contain, the rest is the reply. The files are looked up in `HQS_SHIM_REPLIES` (folders, separated by `:`).
- `fixtures/`: notes, playbooks, proposals, Apify datasets (`fixtures/apify/<actor>.json`, where `{{MOCK}}` becomes the stand-in address) and pricing (`fixtures/apify/pricing-<area>.json`, merged).
- Service addresses in test builds: `HQS_<NAME>_BASE`. The harness sets COMPOSIO, ZERNIO, APIFY (`/apify/v2`), ELEVENLABS (`/elevenlabs`, WebSocket `HQS_ELEVENLABS_WS_BASE`), GROQ (`/groq/openai/v1`), TYPESAFE (`/typesafe`), GITHUB (`/github`), HN (`/hn/api/v1`), HF (`/hf/api`) and OPENAI_NEWS (`/rss/openai-news.xml`). Each workstream adds its own `mock/routes/<area>.mjs` for these prefixes.

- `mock/routes/updates.mjs`: a static host for the update feed (`POST /updates/__set` puts files there). `e2e/updates.cjs` makes a throwaway update key in a temporary folder and starts the app with `HQS_UPDATE_FEED_URL`, `HQS_UPDATE_KEYS` and `HQS_UPDATE_FIRST_CHECK` (test builds only).
- `unit/*.test.mjs` (`node --test 'tests/unit/*.test.mjs'`, also the `unit` entry of `run-all.mjs`): no app needed. The dashboard export for both editions (no Video editor; no macOS words in the Windows build, through `lib/wording.mjs`, which the Windows release check uses too), `license/issue.mjs` in a throwaway signer folder, the update tools, and `build-tools/tools.cjs`.
- Every suite also runs against the Windows engine: `HQ_EXPECT_RUNS=1 HQ_TEST_APP='["<…>/Electron.app/Contents/MacOS/Electron", "<…>/agent-hq-student-windows/dist-test/app"]' node tests/run-all.mjs`.

## Rules
- Use your own app and mock ports and a unique `name` per check, so checks can run side by side.
- Never point a check at a real service, the owner's home folder or port 4520.
