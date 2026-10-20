# Changelog: 187N Agent HQ student edition (macOS)

The Windows edition (`../agent-hq-student-windows/CHANGELOG.md`) has the same version numbers; both are built from the `VERSION` file.

## 1.3.0 · 13 Oct 2026

**For students**
- **Updates:** Agents & Setup › Setup › **Updates**, the menu **187N Agent HQ › Check for Updates…**, and a daily check. A new version shows "Version X is available" with its notes, also as a notice on the other pages (**Later** hides it). **Download update** keeps the installer in Downloads only when it matches 187N's signed update (size and SHA-256); you open it and install over the old version. Nothing installs by itself. This build has no update feed yet, so the page says updates are not set up (`docs/UPDATES.md`).
- The dashboard is re-pinned from the live office of 12 Oct 2026. The office's new Video editor is not part of the student app.

**For the owner**
- **One version:** `VERSION` → Info.plist (CFBundleShortVersionString, build number 10300), the engine (health, bootstrap, About, User-Agent) and the Windows build. Release checks verify all of them.
- **Licence key guard:** `license/issue.mjs` never makes a new signing key by itself any more; `--init-new-key` only for a new setup, with a loud warning. It writes `ed25519-public.txt` next to the key; the release checks compare the key in each app with that file and recognise private keys by format, so they never read the private key.
- **Build tools in the project:** esbuild 0.25.10, acorn 8.17.0 and magic-string 0.30.21 pinned (`package.json`, `package-lock.json`, `node_modules/`, copied from local installs, nothing downloaded). `build-tools/tools.cjs`: `HQ_ESBUILD`/`HQ_TOOLS_MODULES`/`HQ_PLAYWRIGHT`, then this project, then the Hermes Agent folder, with a clear error. Both editions' dashboards now come from the same esbuild.
- **Update tools:** `update/keygen.mjs` (a separate update key), `update/make-feed.mjs` (the signed feed), `update/config.json` (what builds trust; empty in 1.3.0).
- **Video editor cut at export** (`frontend/patches/no-editor.mjs`; the export stops if `editor-view` is reachable).
- **Windows wording:** the export now also rewrites the office's own macOS words for the Windows build (`this Mac`, the Terminal sign-in text, `⌘K`, `⌘⇧E`).
- **Tests:** 16 suites (new: `updates` with 42 checks, `unit` with 21), release check 23 checks (was 15).

## 1.2.2 · 11 Oct 2026
- Jev (TypeSafe) in Creator Lab.

## 1.2.1 · 11 Oct 2026
- Scheduled routines start by themselves again (next-minute bug since 1.0); client performance counts income without a client name; the pin rebuilt from the faster live office.

## 1.2.0 · 11 Oct 2026
- Studio, Production, Campaigns, Signals, Competitors, Creator Lab, carousels and stories, Voice, second brain, Add tools; spending safeguards; test suites.

## 1.1.0 · 11 Oct 2026
- Every office section except the creative engine and the owner's products; records without code; documents; skills and tools; Give my agents my apps.
