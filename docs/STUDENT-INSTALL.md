# Install 187N Agent HQ

You need a Mac with macOS 13 or newer, the licence key you received from 187N, and about ten minutes.

## 1. Install the app

1. Open **187N Agent HQ.dmg**.
2. Drag **187N Agent HQ** onto the **Applications** folder.
3. Open the app from Applications or Spotlight (⌘ Space, then type "187N").

If macOS says it cannot check the app, open it anyway:
- **macOS 15 or newer:** open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to 187N Agent HQ, and confirm.
- **macOS 13 or 14:** right-click the app in Applications, choose **Open**, then confirm.

## 2. Setup (opens by itself the first time)

Every step after Agents is optional; skip what you don't need and come back later.

1. **Licence:** paste your licence key and click Activate.
2. **Agents:** your agents run on Claude Code, Codex or Hermes Agent, on your own subscription.
   - Not installed yet? Click **Install**: Terminal opens and runs the official installer.
   - Click **Sign in** and follow the steps in Terminal. The card turns **Ready** by itself when you're done, and shows which account is signed in.
   - Click **Test** to check it.
   - No subscription? Open **Use an API key instead** on the card.
3. **Apps:** create a free account at composio.dev and copy your API key (Settings → API keys).
   - Paste it here, then click **Connect** next to Gmail, Google Calendar or any other app. Log in in your browser and come back; the app turns green.
   - Click **Give my agents my apps** so Claude Code, Codex and Hermes can use those apps while they work.
4. **More tools:** connect anything else to your agents.
   - **An MCP server:** paste its address and key from the tool's docs, or the command it runs with.
   - **A named API key:** your agents get it when they work.
   - **A skill folder:** it's copied to all three AI tools.
5. **Social:** create an account at zernio.com and copy your API key. Paste it here, then click a platform (Instagram, TikTok, YouTube, LinkedIn…). Log in in your browser and come back.
6. **Second brain:**
   - Your Obsidian vaults are found automatically; click one to connect it. Or choose a folder, or click **Create a new second brain**.
   - Turn on **Let my agents read my second brain** so your agents use your notes. You can switch this off again at any time.
7. **Voice:** create an API key at elevenlabs.io with Text to Speech, Speech to Text and Voices (read) permissions.
   - Paste the key and pick a voice.
   - Choose English, Dutch or Automatic.
   - Click **Test my voice**.
   - macOS asks once for the microphone.
8. **Research:**
   - **Apify:** paste your Apify API key; the free plan includes a monthly credit. Set a monthly limit. Every paid run shows its maximum cost and waits for your click.
   - **Groq:** optional, for fast transcription in Creator Lab.
   - **TypeSafe (Jev):** optional. Create a key at console.typesafe.ai/keys. Jev then labels the hook, structure and segments of every Reel in Creator Lab. Without it, your own AI tool does this.
   - **Topics:** set the topics for Signals.
9. **Folders:**
   - **Workspace folder:** where your agents work.
   - **Proposals and playbooks folders:** optional.
   - **Currency:** choose yours.
10. **Finish:** click **Open 187N Agent HQ**.

You can change everything later from the menu **187N Agent HQ → Setup…** (⌘ ,) or from **Settings → Open Setup**.

## Using it

Your office has these pages:
- **Overview and Inbox.**
- **Operations:** Calendar, Agent work and Routines, and **Voice**: talk to your Chief of Staff; it answers out loud.
- **Marketing & Content:**
  - **Studio:** what needs you, where content waits, and what is working.
  - **Ideas & research:** Signals (a free news radar), Competitors (the accounts you watch) and **Creator Lab** (analyse a creator's Reels: hooks, structure and what outperforms).
  - **Production:** the Board, Library, Recording (with a teleprompter), Jobs and Review.
  - **Carousels & stories:** set your brand kit once; your agent writes the slides and the app makes the images.
  - **Publish & results:** performance, campaigns and accounts. The app only ever makes drafts in Zernio; you post them yourself.
- **Sales:** Pipeline (leads and proposals) and Playbooks.
- **Client delivery:** projects and performance.
- **Agents & Setup:** Agents, Skills & tools, Runs, Activity, Connections, **Add tools**, **Updates** and Settings.
- **Finance & Team.**
- **Knowledge:** Status, **Second brain** (your folders, agent access, and Save to brain) and Instructions.

Add your own leads, projects, income and expenses, and team with the **＋ Add** buttons; nothing to set up.

- **Give your Chief a mission:** use the bar at the bottom, or click **Talk**.
- **Watch your office:** follow the work live. Results appear in **Agent work** and in each agent's conversation.
- **Explore your notes:** the **Brain** shows your second brain as a living map. New notes appear by themselves.

## New versions

The app looks for a new version of 187N Agent HQ once a day. You can also check yourself: **Agents & Setup › Setup › Updates**, or the menu **187N Agent HQ › Check for Updates…**.

- When there is one, a notice says "Version … of 187N Agent HQ is available". **See what's new** shows what changed; **Later** hides the notice for that version.
- **Download update** saves the installer in your Downloads folder. The app checks it against 187N's signature first and only keeps it when it matches.
- **Open the installer**, then drag 187N Agent HQ into Applications to replace the old version. Your data, keys and settings stay.
- Nothing installs by itself. If your copy says "Automatic update checks are not set up in this build yet", new versions are announced in the 187N community.

## Costs

The app itself has no running costs.

| What | Who bills you | How the app keeps it in check |
|---|---|---|
| Your AI tools | Your own subscription | Uses the subscription you already have |
| Voice | Your own ElevenLabs account | Speaks only while Voice is on |
| Competitors and Creator Lab collection | Your own Apify account | Every run has a maximum cost, waits for your click, and stays within your monthly limit |
| Creator Lab transcription | Your own Groq or ElevenLabs account | Runs only as part of an analysis you start yourself |
| Creator Lab classification with Jev | Your own TypeSafe account, per token | One request per Reel, only in an analysis you start yourself; the analysis shows the tokens used |

Your data stays on your Mac. Your API keys are kept in your macOS Keychain. After an update, macOS may ask once for your Mac password so the new version can read them (choose **Always Allow**), and once for the microphone when you use Voice.
