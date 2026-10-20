# Student updates (1.3.0, both editions)

From 1.3.0 the student app checks for new versions itself: once a day, with **Check for updates** on the Updates page (Agents & Setup › Setup › Updates), and from the menu (**Check for Updates…**: the 187N Agent HQ menu on the Mac, the File menu on Windows). Both editions behave the same; the shared e2e suite `tests/e2e/updates.cjs` checks both engines.

**Nothing replaces the app by itself.** The app shows "Version X is available" with its notes. **Download update** fetches this computer's installer, checks it against the signed feed and keeps it in Downloads; the student opens it and installs over the old version (data, keys and settings stay). Self-replacing updates need code signing first (see *Next step*).

## How it fits together

```
owner's Mac                                          https host (owner's choice)          student's app
───────────                                          ───────────────────────────          ─────────────
VERSION (one number for both editions)               student/stable.json                  daily check / Check for updates
sh build.sh  → dist/187N Agent HQ <v>.dmg      ┐     student/stable.json.sig              → verify signature, product,
node build.mjs --package (Windows project)     ├──▶  installers (.dmg, .exe)               expiry, version, https
  → release/187N Agent HQ Setup <v>.exe        │                                          → "Version X is available"
node update/make-feed.mjs (signs with the      ┘                                          → Download: size + SHA-256
  update key)  → <site>/stable.json + .sig                                                   must match → Downloads
```

| Piece | Where |
|---|---|
| Feed format, signing, the checks (owner side) | `update/lib.mjs` |
| What a build trusts | `update/config.json` (`feedURL`, `keys`), compiled in by `build-tools/pack.mjs` (and the Windows `build-tools/pack.mjs`) through `update/build-config.mjs`. `HQ_UPDATE_FEED_URL` / `HQ_UPDATE_KEYS` override it for one build. |
| The app (macOS) | `app/Engine/Updates.swift`, menu item in `app/main.swift` |
| The app (Windows) | `../agent-hq-student-windows/engine/updates.mjs`, menu item in `shell/main.mjs` |
| The page and the notice | `frontend/overlay/web/mk-updates.mjs` (Updates page; the "Version X is available" notice on the other pages, with **Later**) |
| Tools | `update/keygen.mjs` (the update key), `update/make-feed.mjs` (the signed feed) |

The format follows the office's update channel (`projects/agent-hq/staging/docs/UPDATES.md`): a JSON file with a detached Ed25519 signature `{alg, key_id, sig}` (key_id = the first 16 hex characters of the public key's SHA-256) and an expiry, so a mirror cannot keep students on an old "latest".

```json
{"schema": "agent-hq-student.feed/1", "product": "agent-hq-student", "channel": "stable",
 "updated_at": "2026-10-20T10:00:00Z", "expires_at": "2026-11-19T10:00:00Z", "latest": "1.3.1",
 "releases": [{"version": "1.3.1", "date": "2026-10-20", "notes": "- …",
   "downloads": {"mac": {"url": "https://…/187N Agent HQ 1.3.1.dmg", "sha256": "…", "size": 7068075},
                 "win": {"url": "https://…/187N Agent HQ Setup 1.3.1.exe", "sha256": "…", "size": 106305956}}}]}
```

**What the app checks, in order** (the same rules in Swift and JavaScript):
1. The signature file is readable, made with a key whose key_id is one of the compiled-in keys, and matches the exact bytes of the feed.
2. The schema, product and channel are the student app's (`stable`).
3. The feed has not expired (`expires_at`, strict ISO 8601 UTC).
4. The newest release with a download for this platform: an `https` address (the test build also allows `http://127.0.0.1`), a whole size up to 1 GB and a SHA-256. It is offered only when its version is newer than the installed one.
5. Download: https only, also after redirects; the bytes may not exceed the signed size; size and SHA-256 must match exactly, else the file is deleted. Only then is it kept in Downloads.

A refused feed changes nothing: the page shows the reason ("…not signed by 187N…", "…has expired…") and nothing is downloaded. The check sends a plain GET with `User-Agent: 187N-Agent-HQ/<version>`; the host sees the student's IP address.

## Owner: one-time setup (before shipping a build with updates)

1.3.0 as built on 12 Oct 2026 has **no feed and no key** (`update/config.json` is empty), so its Updates page says "Automatic update checks are not set up in this build yet" and never checks. To switch updates on, before handing out a build:

1. **Create the update key** on the signing Mac (once). It is a separate key: never the licence key (the builds refuse that combination).
   ```sh
   node update/keygen.mjs                     # ~/Library/Application Support/187N Update Signer/update-ed25519-private.pem (0600)
   node update/keygen.mjs --dir "/Volumes/<USB>/187N Update Signer backup"   # a second, offline key
   ```
   Back up both private keys (password manager / encrypted USB). Without a trusted key, installed apps can only be fixed by a manual download.
2. **Choose the host** (any https static host; examples in the office's UPDATES.md: a Vercel static project such as `updates.187n.ai`, Cloudflare R2/S3, GitHub Releases + Pages on an account you control). Cache headers: the feed `no-cache`, installers immutable.
3. **Put both public keys and the feed address in `update/config.json`**:
   ```json
   {"feedURL": "https://updates.187n.ai/student/stable.json",
    "keys": [{"public": "<primary public key>", "note": "primary 2026"}, {"public": "<backup public key>", "note": "offline backup"}]}
   ```
4. Build both editions (`sh build.sh`, `node build.mjs --package`) and run both release checks: they confirm the compiled-in feed and keys equal this file.

## Owner: each release

1. Raise `VERSION` (x.y.z), build both editions, run `node tests/run-all.mjs` (both engines) and both release checks.
2. Write the notes (`notes.md`, plain lines; students see them as written).
3. Make the feed (nothing is uploaded):
   ```sh
   node update/make-feed.mjs --key ~/"Library/Application Support/187N Update Signer/update-ed25519-private.pem" \
     --out "<site>/student/stable.json" --version 1.3.1 --notes notes.md \
     --mac-file "dist/187N Agent HQ 1.3.1.dmg" --mac-url "https://updates.187n.ai/student/187N%20Agent%20HQ%201.3.1.dmg" \
     --win-file "../agent-hq-student-windows/release/187N Agent HQ Setup 1.3.1.exe" --win-url "https://updates.187n.ai/student/187N%20Agent%20HQ%20Setup%201.3.1.exe"
   ```
   It takes size and SHA-256 from the local files, extends an existing feed (only when it is validly signed), never overwrites a version, and refuses a key the apps do not trust.
4. Upload the installers and the two feed files (an owner step). Students see the update within a day, or at once with Check for updates.
5. **Re-sign at least monthly**, even without a release, or installed apps refuse the expired feed: `node update/make-feed.mjs --key … --out … --resign`, then upload.

## Next step: updates that install themselves

That needs signed apps first, otherwise an app that replaces itself cannot be trusted and macOS/Windows warn on every update:
- **macOS:** a Developer ID certificate and notarisation (see README), then [Sparkle](https://sparkle-project.org) with its EdDSA appcast. The feed's Ed25519 signature model carries over; Sparkle would replace the download-and-open step.
- **Windows:** a code-signing certificate (for example Azure Trusted Signing), then `electron-updater` with the same release files (NSIS supports it), or a small updater that runs the verified Setup with `/S`.

## Tests

- `tests/e2e/updates.cjs` (both engines, 42 checks): a throwaway update key made in a temp folder, a local feed on the mock server (`tests/mock/routes/updates.mjs`), the automatic check after start, the page and the notice, Download with verification, Later, the daily switch, every refusal (other key, changed bytes, expired, unreadable signature, other product, http download, wrong installer, too large, redirect away from https), "up to date", a build without a feed, and no Video editor.
- `tests/unit/update-feed.test.mjs`: keygen, make-feed, the rules, and the build refusing the licence key as update key.
- `../agent-hq-student-windows/test/unit/updates.test.mjs`: the JavaScript engine's rules and the Windows installer name.
