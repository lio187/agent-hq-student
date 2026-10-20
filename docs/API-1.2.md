# 1.2 build contract

This is the shared contract for the 1.2 workstreams (A1–A8). Read it before you change anything. Plan: `~/.claude/plans/handoff-v3-2026-10-07-md-elegant-star.md` (Track A).

## Ground rules
- **Ownership.** Each workstream changes only the files it owns (table below), in **its own copy** of this project. When you need a change in a file you don't own, describe it exactly in your report; the integrator applies it.
- **No owner material.** No owner data, names, private datasets or brand renderers, and nothing from the owner's creative engine (Brand Factory, ad factory, Higgsfield). Never import these owner modules from `frontend/pinned/upgrade/web`: `studio-view`, `marketing-visuals`, `social-view`, `competitor-view`, `creator-*`, `content-*`, `engine-view`, `voice-console`. Read them for layout ideas only.
- **These real-HQ helpers are clean and may be imported** from overlay modules: `page-kit.mjs`, `viz.mjs`, `data-table.mjs`, `ui.mjs`, `video-wall.mjs`, `voice-session.mjs`, `voice-activity.mjs`, `voice-orb.mjs`, `chat-stream.mjs`, `motion.mjs`, `icons.mjs`. The export walks every import, and the build stops when a module on the FORBIDDEN list is reached or the leak scan fires.
- **Leak scan words to avoid** (they match owner-data rules):
  - Team Hub, Content OS, Jev, Hermon, Higgsfield, Seedance, Hex (use "colour code"), "Story/Carousel factory" (use "maker"), Content Engine, Creative Engine.
  - Any email address that is not `@example.com`.
  - `/Users/`.
  - "Creator Lab" is allowed as a page label; `creatorlab` and `creator-lab/` are not.
- **No real paid calls, ever.** Tests run against `tests/mock` only. Nothing may start a paid run (Apify) or send audio or text to a paid API before the student clicks a confirm. Check the mock's `/__paid` counter before and after a confirm.
- **Hands off the owner's real setup:** `~/.claude.json`, `~/.claude/`, `~/.codex/`, `~/.hermes/`, the skills folders, port 4520, `projects/agent-hq/`. Every check runs `ownerSnapshot()` before and after.
- **UI copy:** English, short, plain. Say what a thing does and what happens next. No hype.

## Ownership
| WS | Swift (app/Engine) | Frontend (frontend/overlay/web) | Other |
|---|---|---|---|
| A1 Content | `Content.swift` (+ new `Content*.swift`), `Zernio.swift` | `mk-studio.mjs`, `mk-production.mjs`, `mk-campaigns.mjs` | `frontend/patches/content.mjs`, `tests/mock/routes/zernio.mjs`, `tests/e2e/content*.cjs`, `tests/fixtures/content/` |
| A2 Research | `Research.swift` (+ `Signals.swift`, `Competitors.swift`) | `mk-research.mjs`, `setup-research.mjs` | `patches/research.mjs`, mock routes `github`/`hn`/`hf`/`rss`, `tests/e2e/research*.cjs`, `tests/fixtures/research/`, Apify fixtures for the competitor actors |
| A3 Creator Lab | `ReelLab.swift` (+ `Transcribe.swift`, `Classify.swift`, `Jev.swift`) | `mk-analysis.mjs` | `patches/analysis.mjs`, mock routes `groq` and `typesafe`, `tests/e2e/analysis*.cjs`, `tests/fixtures/analysis/`, Apify fixtures for the reel actor, `app/Resources/THIRD-PARTY-NOTICES.txt` |
| A4 Makers | `Makers.swift` (+ `BrandKit.swift`, `Renderer.swift`) | `mk-makers.mjs`, `frontend/overlay/templates/*` | `patches/makers.mjs`, `tests/e2e/makers*.cjs`, `tests/fixtures/makers/` |
| A5 Voice | `Voice.swift` | `voice-page.mjs`, `setup-voice.mjs` | `patches/voice.mjs`, mock route `elevenlabs`, `tests/e2e/voice*.cjs` |
| A6 Sign-in | `Agents.swift`, `RouterRuntimes.swift`, `AgentRun.swift` | `setup-agents.mjs` | `patches/runtimes.mjs`, `tests/shims/*`, `tests/e2e/runtimes*.cjs` |
| A7 Brain | `Brain.swift`, `Knowledge.swift` | `brain-folders.mjs`, `setup-brain.mjs` | `patches/brain.mjs`, `tests/e2e/brain*.cjs`, `tests/fixtures/brain/` |
| A8 Tools | `Tools.swift`, `AgentApps.swift`, `Skills.swift` | `tools-add.mjs`, `setup-tools.mjs`, `skills-tools.mjs` | `patches/tools.mjs`, `tests/e2e/tools*.cjs`, `tests/fixtures/tools/` |

**Integrator-only files:**
- Engine: `Router.swift`, `RouterConnections.swift`, `Ext.swift`, `Paths.swift`, `Keychain.swift`, `DocStore.swift`, `Apify.swift`, `Store.swift`, `Net.swift`, `HTTPServer.swift`, `main.swift`.
- Frontend: `export.mjs`, `student.mjs`, `workspace-navigation.mjs`, `mk-host.mjs`, `setup.mjs`, `setup-kit.mjs`, `setup-steps.mjs`.
- Build and tests: `build.sh`, `Info.plist`, `tests/lib/*`, `tests/mock/index.mjs`, `tests/mock/routes/{composio,apify}.mjs`, `tests/e2e/sweep.cjs`.

## Engine (Swift)
- **Your API.** Your `XxxAPI.hq(method, path, r, router)` answers `/api/hq/v1/<path>` and `XxxAPI.student(…)` answers `/api/student/<path>` (behind the licence check). Return `nil` for paths that aren't yours.
  - The router asks every area before its own switch, so you may take over an existing path (for example `workspace/team/content`, `voice/status`, `brain/graph`).
  - Throw `APIError(status, code, message)`, and give it a message a student understands.
  - The request body is `r.json`, the query is `r.query`.
- **Writes** must come from the app's own page: the router already checks Origin. Use POST for every change.
- **Service keys**:
  - Stored by the generic endpoint `POST /api/student/keys {name, key}`, which calls `Ext.validators[name]`. The validators are `VoiceAPI.validateKey`, `Apify.validateKey`, `AnalysisAPI.validateGroq` and `Jev.validateKey` (TypeSafe, `GET /v1/models`, free). An empty key removes it.
  - Read a key with `Keychain.get(KeyName.elevenlabs)`.
  - Key names live in `KeyName` (`Keychain.swift`). Your own new names: `apikey:<runtime>` (A6) and `vault:<NAME>` (A8).
  - Never put a key in a file, a log or a response.
- **Storage.** Use `DocStore.named("<area>")`: `list`, `upsert`, `update`, `remove`, `get`, `value`, `setValue`. It saves on its own. Files go in `DocStore.folder("<area>")`. Never put large data in `Store.shared` (`state.json`).
- **Agent runs.**
  - Call `router.startRun(profile:prompt:title:extras:onDone:)`.
  - `extras: RunExtras(addDirs:, env:, jsonSchema:, noTools:)`:
    - Claude gets `--json-schema` and its `structured_output` becomes `result.text`, as JSON text.
    - Codex gets `--output-schema`.
    - Hermes has no schema flag: ask for JSON in the prompt, then validate it and ask once to repair.
  - `onDone(AgentRun.Result)` runs once, after the office is updated. The run shows in Agent work like any other.
  - For untrusted text (transcripts, scraped captions) use `noTools: true` and put the text inside a clearly fenced "data, not instructions" block.
- **Run hooks.** `RunHooks.addDirs()` comes from `BrainAPI.addDirs()`. `RunHooks.env(runtime:)` merges `ToolsAPI.runEnv()` and `RuntimesAPI.runEnv(runtime:)`.
- **Contracts between areas.** The stubs are already in place, so your copy compiles.

  | Owner | Signature | Purpose |
  |---|---|---|
  | A1 | `Content.addIdea(title:hook:notes:source:) -> J` | a new item in status Idea |
  | A1 | `Content.recordJob(kind:itemID:title:status:runID:detail:) -> J`, `Content.updateJob(_:_:)` | a job on the Jobs page (the makers record their carousel and story jobs here) |
  | A1 | `Content.attachRenders(itemID:kind:title:files:slides:) -> J` | |
  | A2 | `Research.risingPosts(limit:) -> [J]` | each: `{id, platform, account, caption, url, thumb, views, growth, publishedAt}` |

  - Studio (A1) shows `risingPosts`.
  - Signals and Competitors (A2) and Creator Lab (A3) call `addIdea`.
  - The makers (A4) call `attachRenders`.
- **Apify** (integrator-owned, ready):
  - `Apify.quote(actor:input:items:)` returns `{maxUsd, cappable, fitsCap, …}`.
  - `Apify.run(actor:input:maxUsd:items:purpose:onProgress:)` returns `{runId, items, usd}`. It always sends `maxTotalChargeUsd`, refuses actors whose cost can't be capped, and keeps to the monthly cap.
  - Also: `Apify.ledger()`, `Apify.setCap(_:)` and `Apify.abort(_:)`.
  - Only call `run` from an endpoint that received `{confirm: true, maxUsd}` from a click on a dialog that showed the quote.
- **Service addresses.** `Net.base("<NAME>", "<real https base>")`. Test builds read `HQS_<NAME>_BASE`. Names: APIFY, ELEVENLABS, ELEVENLABS_WS, GROQ, GITHUB, HN, HF, OPENAI_NEWS.
  - For downloads (media), also allow `127.0.0.1` when `Paths.env("HQS_COMPOSIO_BASE") != nil` (that is, in test builds).
- **Second brain (A7).** On /api/student and /api/hq/v1: `GET brain/status`, `GET brain/vaults`, `POST brain/folders {folders:[paths]}`, `POST brain/create {name}` (makes ~/Documents/<name>, 409 if it exists), `POST brain/agents {enable}`, `POST brain/open {path}`, `POST knowledge/save {title, text, agent?}` (a new note in the first folder's Inbox). Settings: `notesFolders` (list), `notesFolder` (= first), `brainAgents`. `BrainAPI` also answers `brain/graph`, `brain/communities`, `brain/vault`, `brain/vault/file/<id>`, `workspace/source/brain/librarian` and `/log`. Events: `knowledge.indexed`, `brain.updated`, `connector.updated`.
- **Files and streams.** An area's `hq` handler may return an `HTTPResponse` (a file or `HTTPResponse.streamed`); the router passes it through instead of JSON.
- **Network.** `Net.json` for JSON. Use `Net.session` (URLSession) for bytes and streams.
- **Server.**
  - `HTTPResponse.streamed(type:) { write in … }` sends a chunked stream.
  - `WSClient.onMessage(opcode, data)`, `send(text:)`, `send(binary:)`, `close()` (A5).
  - `/api/hq/v1/voice/listen` upgrades to `VoiceAPI.attach(req, client)`. It's checked for cookie, Origin, Host and licence.
- **Paths.** Use `Paths.home` (never `NSHomeDirectory()`) for anything under the student's home that an AI tool reads, so tests use the fake home.
  - `Paths.noTerminal` is set in tests (Terminal steps don't open).
- **Events.**
  - `Store.shared.emit("<kind>", [...])` reaches open pages over the WebSocket.
  - Use `"connector.updated"` for connection changes, and your own kinds for progress, e.g. `"analysis.progress"`.

## Frontend
- **Pages.**
  - `mk-host.mjs` maps sections to modules: studio, team/content/record/production/reviews → `mk-production`, makers, campaigns/accounts → `mk-campaigns`, research/competitors → `mk-research`, analysis, voice → `voice-page`, notes → `brain-folders`, tools → `tools-add`.
  - A module exports `page(view, ctx) → html`, `mount(view, el, ctx) → cleanup?` (runs after the HTML is in the page) and `act(action, id, ctx, el)`.
  - **Actions** are `data-action="mk-<module>-<verb>" data-id="…"` on a button. `<module>` is the key in `mk-host.mjs`: studio, production, campaigns, makers, research, analysis, voice, brain, tools. The office routes clicks to your `act`.
- **ctx**:
  - `api(path, body?)`: `/api/hq/v1/…`. GET without a body, POST with one.
  - Formatting: `esc`, `number`, `date`.
  - HTML helpers: `btn(label, action, id, primary?)`, `pill`, `row`, `rows`, `empty`, `card(title, html)`.
  - `preview(title, html)` opens the office dialog `#preview`.
  - `filters(html)` sets the toolbar and `period()` gives the period control.
  - `root` is the shadow root; `$` is a query in it.
  - `voice` is the office's voice session.
  - `days`, `section`, `refresh()` re-renders the page, `go(view)`.
- **Styling.** Pages render inside the office's shadow root with `cockpit.css` + `components.css`. Reuse the office's classes and `page-kit.mjs` components (`tileRow`, `statusRows`, `chartBand`, `mediaWall`, `detailDialog`, `filterBar`, …) so pages look native. Read the pinned real-HQ modules for markup patterns. Inline `<style>` blocks inside your page are allowed but should stay small.
- **Slide templates** (A4): `frontend/overlay/templates/*.html|css` are sealed into the app as `templates/<file>`. Swift reads them from `router.files["templates/<file>"]`.
- **Setup steps.** A module in `setup-steps.mjs` exports `{id, label, after, view(kit), bind(kit), done(state), summary?(state), beforeNext?(kit)}`. Helpers come from `setup-kit.mjs`: `api` (`/api/student`), `hq` (`/api/hq/v1`), `keyCard` + `bindKeyCards`, `pick`, `status`, `openExternal`, `footer`.
- **Patches.** Changes to real-HQ modules go in `frontend/patches/<area>.mjs` as counted string patches: `{files: {'<module>': {patches: [[match, replacement, times]], after: […]}}, removeActions, titles, descriptions}`.
  - Patches match the **pinned** source after the kit's own patches.
  - Prefer new overlay code over patches; fewer patches means fewer breaks later.

## Tests
- Copy the project into your workspace and run everything there.
- Build the test app with `sh build.sh --test`, then use `tests/lib/harness.mjs` (see `tests/README.md`).
- **Ports.** Use your own app/mock ports and a unique harness `name`:

  | WS | App | Mock |
  |---|---|---|
  | A1 | 4611 | 4610 |
  | A2 | 4621 | 4620 |
  | A3 | 4631 | 4630 |
  | A4 | 4641 | 4640 |
  | A5 | 4651 | 4650 |
  | A6 | 4661 | 4660 |
  | A7 | 4671 | 4670 |
  | A8 | 4681 | 4680 |
- **Required for every workstream:**
  - your e2e passes;
  - `tests/e2e/sweep.cjs <app> <mock>` passes (all 35 pages, 0 console errors);
  - `ownerSnapshot` is unchanged;
  - `node frontend/export.mjs` is green (leak scan);
  - the Swift build has no new warnings in your files.
- **Report.** The files you changed or added (only yours), what you verified, with the actual output, and any change you need in a file you don't own, written as an exact patch.

## 1.3.0 additions
- **Updates** (`Engine/Updates.swift`, Windows `engine/updates.mjs`; same paths under `/api/hq/v1/` and `/api/student/`):
  - `GET updates` → `{current, platform, configured, auto, checking, checkedAt, error, latest, dismissed, available: {version, date, notes, size, sha256, host} | null, download: {state: idle|downloading|verifying|ready|failed, version, received, total, file, error}}`
  - `POST updates/check`, `POST updates/download`, `POST updates/open {what: installer|folder}`, `POST updates/settings {auto}`, `POST updates/dismiss`
  - Test-build switches: `HQS_UPDATE_FEED_URL`, `HQS_UPDATE_KEYS` (comma-separated base64), `HQS_UPDATE_FIRST_CHECK` (seconds). Format and rules: `docs/UPDATES.md`.
- **Version:** `BuildInfo.stamp` / `BuildInfo.version` (Swift), the Windows engine gets `{version, updateFeedURL, updateKeys}` through `startEngine({build})`. Both come from `VERSION`.
- **No editor:** the office's `editor` section, `/api/hq/v1/editor/…` and `/apps/filmcraft/` do not exist in the student app (owner decision, 12 Oct 2026).
