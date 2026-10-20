# 187N Agent HQ: student edition (owner guide) · version 1.3.0

**Windows:** the same app for Windows lives in `../agent-hq-student-windows` (installer `187N Agent HQ Setup <version>.exe`, the same licence keys). See its README.

This is a native macOS app that students download as a DMG and drag to Applications. There is no code to run and no source to change.
- **Who it's for:** each student gets their own office for AI agents.
- **What they connect:** their own AI tools (Claude Code, Codex, Hermes Agent), apps through Composio (Gmail, Google Calendar, Slack, Notion, GitHub and many more) and social accounts through Zernio. A setup wizard runs on first launch and does all of it without code.
- **What's fixed:** the 187N name and logo are part of the sealed app and cannot be changed.

This project is separate from the live Agent HQ. The build reads a **pinned copy** of the real dashboard (`frontend/pinned/`, made by `node frontend/pin.mjs` from `../agent-hq/upgrade/web` and recorded in `PIN.json`) and never writes to the live office. Work on your own Agent HQ therefore never changes a student build until you re-pin on purpose:

```sh
node frontend/check-patches.mjs --web ../agent-hq/upgrade/web   # read-only: do the student patches still fit the live source?
node frontend/pin.mjs                                            # take the live source into the pin (then build and test)
```
The pin of 12 Oct 2026 (1.3.0) is the live office of that day. The office's new **Video editor** section is left out on purpose (owner decision, 12 Oct 2026; the student engines have no editor API): `frontend/patches/no-editor.mjs` cuts it at export, and `tests/unit/export.test.mjs`, the updates e2e suite and the release check fail if any of it reaches a build.
 The student app uses its own name, bundle id (`ai.187n.agent-hq.student`), data folder and Keychain entries, so it can sit next to your own Agent HQ app.

## Build

```sh
sh build.sh          # release: dist/187N Agent HQ <version>.dmg (universal: Apple Silicon and Intel, macOS 13+)
sh build.sh --test   # test build: separate data folder and Keychain entry, accepts local stand-ins; no DMG
```

**One version for both editions:** the `VERSION` file. The build writes it into the app's Info.plist (the build number follows it: 1.3.0 → 10300) and into the engine (health, bootstrap, About); the Windows build reads the same file for its installer, `package.json` and engine. The release checks fail when any of them differ.

**Build tools:** esbuild, acorn and magic-string are pinned in this project (`package.json`, `package-lock.json`, `node_modules/`). `build-tools/tools.cjs` finds each tool: `HQ_ESBUILD` / `HQ_TOOLS_MODULES` / `HQ_PLAYWRIGHT` when set (a wrong path stops the build), else this project's `node_modules`, else the old Hermes Agent folder as a last resort, with a clear message when none is there. Playwright (DMG background and read-me PDF only) still comes from the Hermes Agent install.

The steps:
1. **Dashboard:** `frontend/export.mjs` builds the student dashboard from the pinned source. It applies the developer kit's cuts (none of your data, no creative engine), then the student changes:
   - **Removed:** only your creative engine (Brand Factory: ad factory, Higgsfield) and your own products (Setter, the course community).
   - **Kept:** every other section of the office.
   - **The student's own versions** (native, on their own data, in `frontend/overlay/web/` and `app/Engine/`):
     - Studio, Ideas & research (Signals, Competitors, Creator Lab), Production (Board, Library, Recording, Jobs, Review), Carousels & stories, Publish & results (Performance, Campaigns, Accounts);
     - Voice, the Second brain, Add tools, Social (Zernio), Proposals and Playbooks, Skills & tools;
     - Setup, and Add/Manage on Pipeline, Clients, Finance and Team.

   The build stops if any of your names, clients, private products, paths or keys would end up in the app.
2. **Seal:** `build-tools/pack.mjs` puts every page, style, font and image into one AES-256-GCM archive (`app.pak`). It writes the archive's SHA-256 and the key into the app.
3. **Compile:** `app/` is compiled for both architectures. The app is about 8.5 MB; the DMG is about 6.6 MB.
4. **Sign and package:** the app is signed and put in a DMG with an Applications shortcut.

To release a new version, raise `VERSION` and build both editions. Students replace the app; their data stays. With updates set up (`docs/UPDATES.md`), the apps tell students themselves.

## Licences

The app only opens with a licence key that you signed. Keys work offline.

```sh
node license/issue.mjs --name "Student Name" --email student@example.com --months 12   # prints HQ1-… ; send it to the student
node license/batch.mjs members.csv --months 12   # a whole member list (CSV with name and email columns, e.g. a Whop export) → members-licence-keys.csv
node license/issue.mjs --verify "HQ1-…"                                                  # check a key
node license/issue.mjs --public-key                                                      # the public key the builds embed
```

- **Where the signing key lives:** `~/Library/Application Support/187N License Signer/ed25519-private.pem`. Only you can read it, and it is outside the workspace and outside the app. Its public key sits next to it in `ed25519-public.txt` (written by `issue.mjs`); the builds embed it and both release checks compare the key in each app with that file, so they never read the private key.
- **A missing key is never replaced.** Up to 1.2.2, `issue.mjs` silently made a new key when the file was missing, which would have made every licence issued so far invalid in the next build. Now it stops and asks you to restore the key from your backup. Only for a brand-new setup: `node license/issue.mjs --init-new-key` (with a loud warning; it refuses when a key exists). A public key file that does not belong to the private key stops issuing and building too.
- **Back it up**, for example in your password manager. Without it you cannot issue keys that this build accepts.
- **Never put it in the project, the DMG or a chat.**
- **What the student sees:** the licence name appears in Setup and in About. Leave out `--months` for a key without an end date.

## Distribution: what students see when they install

The DMG opens as a laid-out window: the app, an arrow to Applications, and **Read Me First.pdf**, which walks students through the one-time macOS confirmation (Open Anyway). The DMG is signed ad hoc, so macOS asks students once to confirm an app from outside the App Store. A warning-free install needs your Apple Developer ID:

1. Join the Apple Developer Program (99 USD a year) and create a **Developer ID Application** certificate in Xcode → Settings → Accounts.
2. Store your notarisation login once in your Keychain (you run this yourself; the app-specific password comes from appleid.apple.com):
   `xcrun notarytool store-credentials 187n-notary --apple-id <your Apple ID> --team-id <TEAMID>`
3. Build signed and notarised:
   `HQ_SIGN_IDENTITY="Developer ID Application: <name> (<TEAMID>)" HQ_NOTARY_PROFILE=187n-notary sh build.sh`

After that, students double-click the DMG, drag the app to Applications and open it without warnings.

## What protects the app

- **No source:** the app has five files: the compiled program, the sealed dashboard, the icon, its settings and its signature. No readable code or editable pages ship.
- **Sealed and checked:** the dashboard archive is encrypted and checked against a SHA-256 built into the app. A changed archive is refused: "This copy of the app is damaged or was changed". The code signature also breaks on any change.
- **Closed to everything but its own window:**
  - The engine listens only on 127.0.0.1, on a random port.
  - It requires a new secret key per launch, held only by the app's window.
  - Opening it in a browser, or calling the API or the code from outside, gets 401.
  - Developer tools (Web Inspector) are off in release builds.
- **Licensed:** keys are signed with your private Ed25519 key, and the app holds only the public key.

**Limits:**
- Like any paid app, determined reverse engineering cannot be ruled out. This is the protection level of normal commercial software.
- Offline keys can be passed on. The licence name stays visible, though.
- Revoking a key needs an online licence check, which is a possible next step.

## Updates (1.3.0)

The apps check a signed update feed once a day, on the Updates page (Agents & Setup › Setup › Updates) and from the menu (**Check for Updates…**). A new version shows "Version X is available" with its notes, on the Updates page and as a notice on the other pages (**Later** hides it). **Download update** fetches the installer from the address in the signed feed and keeps it in Downloads only when its size and SHA-256 match; the student opens it and installs over the old version. Nothing replaces the app by itself.

The feed is signed with a **separate update key** (never the licence key). 1.3.0 is built **without** a feed or key, so its page says updates are not set up and it never checks. Setting it up (key, hosting, `update/config.json`), each release and the next step to self-installing updates: `docs/UPDATES.md`.

## What students get (1.2)

**Plug and play**
- **AI tools with their own subscription.** Install and Sign in open the official command in Terminal. The app checks every 3 s and turns the card green by itself, showing the account and login method. API-key mode is the fallback; the key is only given to runs in that mode, so it never overrides a subscription.
- **Give my agents my apps.** One Composio Tool Router session per student, registered as MCP server `187n-apps` in Claude Code, Codex and Hermes. Each config file is backed up once; Remove restores it byte for byte.
- **Add tools: how students connect anything new later.**
  - **Composio:** 1,000+ apps.
  - **Any MCP server:** by address + key, or by command, written into all three AI tools under a `187n-` name and refused if that name is already the student's own. Secrets for Hermes go to `.env` (0600).
  - **A key vault:** named keys become environment values for every run the app starts. Values are never shown; names like PATH or ANTHROPIC_API_KEY are refused.
  - **Skill folders:** copied into `~/.claude/skills`, `~/.agents/skills` and `~/.hermes/skills` with a marker, so Remove deletes only those copies.
- **Second brain in one click.**
  - Obsidian vaults are found automatically (from Obsidian's vault list, read only). Students can also create a new starter brain in `~/Documents`.
  - Several folders are supported. The index reads front matter, tags and aliases, and a file watcher shows new notes within seconds.
  - **Let my agents read my second brain** writes a marked, reversible block into `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` and `~/.hermes/SOUL.md`, and gives app runs `--add-dir`.
  - **Save to brain** writes notes into the Inbox.
- **Voice Mode.**
  - Uses the student's own ElevenLabs key: realtime speech to text (`scribe_v2_realtime`), the Chief answers on the student's own AI tool, and the answer is spoken (`eleven_flash_v2_5`).
  - Talk works from the dock and from the Voice page.
  - The microphone is only granted to the app's own page; macOS asks once.

**Marketing**
- **Studio:** next moves, where content waits, and what is working (rising competitor posts and the student's own top posts).
- **Signals:** a free news radar from GitHub, Hacker News, Hugging Face, OpenAI news and the student's own RSS feeds. The researcher agent turns signals into content angles.
- **Competitors:** the student's own watchlist (Instagram, TikTok, YouTube) through their own Apify key, with a video wall using the official embeds, charts and rising posts.
- **Creator Lab** (Reel analysis):
  - The pipeline: Apify reel scrape, then audio (AVFoundation), then transcription (Groq or ElevenLabs Scribe), then classification of 8 dimensions and segment roles.
  - **Classification with Jev (TypeSafe)**, when the student adds a TypeSafe key (Setup → Research or the Creator Lab page):
    - one request per Reel, three at a time, with only Choice questions;
    - the hook is picked from the opening sentences, never written;
    - the transcript and caption go in the state only, and every question says they are quoted material;
    - the confidences are kept, but no threshold filters anything;
    - the run shows the tokens used (TypeSafe bills them; no cost is guessed);
    - a busy answer (429, 529) is retried; a refused key stops the rest of the run with a plain message.
  - **Without a TypeSafe key**, or when the student picks one in the dialog, the student's own AI tool classifies, with a JSON schema, no tools, and the transcript fenced as data.
  - It shows findings, outliers and hooks that outperform, and turns a post into an idea.
  - Adapted from an MIT-licensed open-source project; the notice ships in the app and is shown under Credits.
- **Production:**
  - Board (drag and drop), Library and editor, and Recording with a teleprompter.
  - Jobs: script, hooks and caption, written by the student's writer agent.
  - Review: approve, reject or rehook.
- **Carousels & stories:**
  - A brand kit (colours, fonts, logo, style).
  - The writer agent drafts slides as JSON. The student edits them with a live preview.
  - The app renders exact PNGs (1080×1350, 1080×1920) on the Mac in an off-screen web view, into `<workspace>/Marketing/`. No AI images, no Chrome.
- **Campaigns:**
  - Story and carousel strips, with copy caption.
  - **Zernio drafts only, after a confirm: the app never publishes or schedules.**

**Spending safeguards (the student's own money)**
- Every Apify run has a hard limit (`maxTotalChargeUsd`).
- Only actors whose cost can be capped are used.
- Every paid run waits for a confirm that shows the maximum.
- A monthly limit (default $5) is enforced.
- Every run is in a ledger.
- Voice and transcription only run on the student's click.

**Records, documents, skills:** as in 1.1:
- Leads, projects, income and expenses, and team, with forms.
- Proposals and Playbooks from folders.
- Skills & tools found automatically.
- View steps on every run.

**Keychain and microphone prompts after updates.** Without a Developer ID, every new build has a new signature, so after an update macOS asks once for the Mac password (all keys sit in one Keychain item, read once at launch), and once for the microphone when Voice is used. A Developer ID removes both.

## What students need

- **A Mac:** macOS 13 or newer.
- **At least one AI tool:** Claude Code, Codex or Hermes Agent, on their own subscription (or an API key).
- **Optional, each with its own account and key:**

  | Service | What it enables |
  |---|---|
  | Composio | Apps |
  | Zernio | Social; results per post need its Analytics add-on |
  | ElevenLabs | Voice, and Creator Lab transcription |
  | Apify | Competitors and Creator Lab; the free plan includes a monthly credit |
  | Groq | Fast Creator Lab transcription |
  | TypeSafe | Jev classifies Creator Lab's Reels (one request per Reel, billed per token) |

## How the app works inside (`app/`)

| File | Role |
|---|---|
| `main.swift` | The window. It checks the seal, starts the engine, opens login pages in the browser, has native file and folder pickers, and grants the microphone only to the app's own page. |
| `Server/HTTPServer.swift` | HTTP, streaming (chunked) and WebSocket (text, binary, fragmented) on 127.0.0.1 |
| `Engine/Router.swift`, `RouterConnections.swift`, `Ext.swift` | The dashboard's API and Setup. Each area answers its own paths from its own file (`Ext.swift`). |
| `Engine/Agents.swift`, `AgentRun.swift`, `RouterRuntimes.swift` | Claude Code, Codex and Hermes: detect, sign in (self-finishing), API-key mode, and runs (extra folders, environment, JSON schema, no tools) |
| `Engine/Content*.swift`, `Zernio.swift` | Studio, Production, Jobs, Review, Campaigns, Accounts, files, Zernio drafts |
| `Engine/Research.swift`, `Signals.swift`, `Competitors.swift`, `Apify.swift` | Signals, Competitors, and Apify with hard cost limits |
| `Engine/ReelLab.swift`, `Transcribe.swift`, `Classify.swift`, `Jev.swift` | Creator Lab (classification by Jev or the student's AI tool) |
| `Engine/Makers.swift`, `BrandKit.swift`, `Renderer.swift` | Carousel and story maker and the native PNG renderer |
| `Engine/Voice.swift` | Voice Mode (ElevenLabs) |
| `Engine/Brain.swift`, `Knowledge.swift` | Second brain: vaults, folders, agent access, the index with watcher |
| `Engine/Tools.swift`, `AgentApps.swift`, `Skills.swift` | Add tools (MCP servers, key vault, skills) and Give my agents my apps |
| `Engine/Composio.swift`, `Records.swift`, `Documents.swift`, `Workflow.swift`, `Cron.swift` | Apps, records, documents, view steps, routines |
| `Engine/Updates.swift` | The update check: the signed feed, the daily check, Download with verification (`docs/UPDATES.md`) |
| `Engine/Store.swift`, `DocStore.swift`, `Keychain.swift`, `Paths.swift` | Data in `~/Library/Application Support/187N Agent HQ/` (one file per area under `data/`) and API keys in the Keychain |
| `Security/Pak.swift`, `License.swift` | The seal and the licence check |

## Tests (13 Oct 2026, version 1.3.0)

Everything runs against an isolated test build with local stand-ins for every service, test versions of the three AI tools and a fake home folder, so no real account, paid call or owner configuration is touched (`tests/README.md`).

```sh
sh build.sh --test && node tests/run-all.mjs     # 16 suites, three at a time
sh build.sh && node tests/release-check.mjs "dist/187N Agent HQ 1.3.0.dmg"
```

**Result:** 16/16 suites passed (796 e2e checks + 21 unit tests), 0 console errors, and the owner's Claude, Codex and Hermes configuration was unchanged after every suite. Release check: 23/23. The Windows edition passes the same 16 suites with the same counts against its engine.

| Suite | Checks | Covers |
|---|---|---|
| sweep | 36 | every page, clicked through the sidebar and tabs (now with Updates) |
| core | 164 | Setup, base pages, records, documents, routines, integrations, runs |
| content | 47 | Studio, Board, Library, Recording, Jobs, Review, Campaigns |
| research | 49 | Signals, Competitors |
| analysis | 61 | Creator Lab |
| makers | 52 | carousels and stories |
| voice | 43 | Voice Mode |
| runtimes | 28 | AI-tool sign-in |
| brain | 47 | second brain |
| tools | 81 | Add tools |
| tools-formats | 61 | config file formats |
| integration | 21 | Research → Studio → idea, Makers → Review/Jobs, brain + key vault in one run |
| schedule | 1 | a scheduled routine starts by itself |
| jev | 42 | Creator Lab with Jev: TypeSafe key, the request rules, answers, tokens, retry, refused key |
| updates | 42 | the version everywhere, the automatic and manual check, the notice, Download with verification, every refusal, a build without a feed, no Video editor |
| unit | 21 | the dashboard export for both editions (no editor; no macOS words in the Windows build), the licence issuer, the update tools, the build-tool paths |

**What 1.3.0 adds** (both editions; `CHANGELOG.md`):
- **Updates:** Check for updates, a daily check and a signed feed; Download with size and SHA-256 verification (`docs/UPDATES.md`).
- **One version:** `VERSION` feeds Info.plist, the engines and the Windows build.
- **Licence key guard:** no silent new key; the release checks compare each app's key with the signer's public key file.
- **Build tools in the project:** esbuild, acorn and magic-string pinned here, found through `build-tools/tools.cjs`.
- **Re-pinned dashboard** (live office of 12 Oct 2026), without the office's Video editor.
- **Windows parity** (in the Windows project): long Hermes prompts, Creator Lab sound extraction, Windows wording everywhere, the right version in its requests. See `../agent-hq-student-windows/docs/PARITY-1.3.0.md`.

**What 1.2.2 adds:** Jev (TypeSafe) in Creator Lab.
- Students add their own TypeSafe key in Setup → Research or on the Creator Lab page. It is checked for free (`GET /v1/models`) and kept with the other keys.
- With a key, Jev is the first choice in "Analyse a creator"; their own AI tool stays available in the same list.
- The leak scans allow the public name Jev and keep the owner's private Jev kit denied.

**What 1.2.1 fixes compared with 1.2.0:**
- **Scheduled routines never started by themselves.** The next-minute calculation skipped a minute. "Run now" did work, and that was all the tests checked. A new schedule check now covers it.
- **Client performance:** income without a client name now counts for its customer.
- **Pin:** rebuilt from the faster live dashboard (Track B), which includes the lighter page stylesheet.

Earlier DMGs are in `dist/superseded/`. Send only the newest one: 1.2.0 and older have the routine bug.

**Still to do with real accounts:** one acceptance run with real Composio, Zernio, ElevenLabs, Apify, Groq and TypeSafe keys and signed-in AI tools, by you or a test student. The stand-ins follow the public API docs; the first real run is the final proof.
