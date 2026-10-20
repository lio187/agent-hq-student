// Per-module edits for the developer kit. `patches` are exact text replacements on the original source (each must
// match exactly once, or the export stops), then `remove` cuts parts on the syntax tree, then `prune` drops what
// nothing uses any more. Comments are stripped from every module afterwards.
import * as R from './rules.mjs';

// Leads (kit version): the pipeline from the CRM connector only.
const OUTREACH = `async outreach(){filters('<label class="search">Search<input id="search" type="search" value="'+esc(query)+'" placeholder="Find a lead or company…"></label>');const o=await api('workspace/team/outreach');outreach=o;
   const records=Array.isArray(o.records)?o.records:[],shown=records.filter(r=>matches(r.name,r.company,r.stage,r.nextAction,r.email,r.source)),count=s=>records.filter(r=>r.stage===s).length;
   const sources=[...records.reduce((m,r)=>m.set(r.source||'unknown',(m.get(r.source||'unknown')||0)+1),new Map())].map(([s,n])=>({label:label(s),value:n}));
   return kit.tileRow([{label:'Leads',value:records.length,caption:'In the pipeline'},{label:'To research',value:count('research'),caption:'Not contacted yet'},{label:'Contacted',value:count('contacted'),caption:'Waiting for a reply'},{label:'Replied',value:count('replied'),caption:'Conversation open'}],{esc,number})
    +kit.chartBand({title:'Lead funnel',meta:records.length+' leads',body:funnel([{label:'Researched',value:count('research')+count('contacted')+count('replied')},{label:'Contacted',value:count('contacted')+count('replied')},{label:'Replied',value:count('replied')}],{esc,format:String,label:'Leads that reached each stage'}),empty:'No leads yet.',note:count('excluded')?count('excluded')+' excluded leads are not counted.':''},{title:'Leads by source',meta:sources.length+' sources',body:barList(sources,{esc,format:String,label:'Leads by source'}),empty:'No leads yet.'},{esc})
    +kit.panel('Leads',records.length?leadsTable(shown):empty('No leads yet. Connect your CRM in server/connectors.'),{esc,meta:shown.length+' of '+records.length})}`;

// Revenue (kit version): one revenue source, whatever the connector reports.
const REVENUE = `async revenue(){const h=await settled(api('cockpit/revenue')),m=h.metrics||{},cur=h.currency||'EUR',as=h.snapshotDate?kit.dayLabel(h.snapshotDate):'';
   return '<div class="section-head"><div><p class="eyebrow">REVENUE</p><h2>'+esc(as?'Revenue as of '+as:'Revenue')+'</h2></div>'+pill(h.state||'unavailable',h.state)+'</div><p class="source">'+esc([h.source||'No revenue source connected',h.period,cur].filter(Boolean).join(' · '))+'</p>'+(h.reason||h.error?'<p class="notice">'+esc(h.reason||h.error)+'</p>':'')
    +kit.tileRow([{label:'Revenue',value:m.revenue,currency:cur,caption:h.period||'Selected period'},{label:'Profit',value:m.profit,currency:cur,caption:'After costs'},{label:'Ad spend',value:m.ad_spend,currency:cur,caption:'Paid media'},{label:'ROAS',value:m.roas==null?null:number(m.roas)+'×',caption:'Revenue ÷ ad spend'}],{esc,number})
    +kit.tileRow([{label:'Deals closed',value:m.deals_closed,caption:'Won this period'},{label:'Average deal',value:m.avg_deal_value,currency:cur,caption:'Per closed deal'},{label:'Leads',value:m.leads_total,caption:'New this period'},{label:'Conversion',value:m.conversion_rate==null?null:number(m.conversion_rate)+'%',caption:'Lead to deal'}],{esc,number})}`;

const SECTION_DESCRIPTIONS = `{inbox:'Everything that needs you: approvals, questions, reconnects and blocked work, with the recent activity below.',portfolio:'Client performance from your CRM and reports.',finance:'The latest revenue on top; cash, receivables, payables and the transaction ledger below. Read-only.',people:'Every agent with its skills, routines and instructions, and the human team roster.',librarian:'Knowledge worker health, the items waiting for curation, and the curation log.',memory:"Every agent's instructions, plus the runtime's memory documents. A document is read only when you open it.",sources:'Live connection status and source availability.',todoist:'Your connected tasks, with and without deadlines.',routines:'Scheduled agent work and recorded results.',sessions:'Execution access, manual handoff packages and runtime session history.',overview:'What needs you today, then revenue, model usage and operations.',usage:'Compare engine usage, daily tokens and the models doing the work.',revenue:'Revenue, spend and returns, with the source and period kept in view.',tasks:'Track agent work, review blockers and follow Chief delegations.',calendar:'Every connected calendar in one agenda, with optional task deadlines.',agents:'Find the right agent, inspect its model and continue the conversation.',chats:'Pick up a conversation in the selected project.',outreach:'Keep lead context, next actions and follow-ups together.',delivery:'Follow project delivery and the latest recorded status.',activity:'A chronological record of activity in your office.',connections:'Check account availability and open the controls for each service.',settings:'Shortcuts, agents, routines, knowledge and connected accounts.'}`;

const SECTIONS = `{inbox:'Inbox',librarian:'Knowledge status',memory:'Memory & instructions',sources:'Source status',todoist:'Tasks',routines:'Routines',sessions:'Runtime sessions',overview:'Overview',usage:'Tokens & models',revenue:'Revenue',tasks:'Work',calendar:'Calendar',agents:'Agents',chats:'Conversations',outreach:'Leads & follow-up',delivery:'Delivery',portfolio:'Client performance',finance:'Finance',people:'Team',activity:'Activity',connections:'Connections',settings:'Workspace settings'}`;

export const TRANSFORMS = {
  'workspace-view.mjs': {
    patches: [
      ['<p class="eyebrow">187N / WORKSPACE</p>', '<p class="eyebrow">WORKSPACE</p>'],
      ['CONTENT_BUSINESS_VIEWS.has(section)', 'false', 3],
      ["({leoncontent:'Clip studio',inbox:'Inbox'})[section]", "({inbox:'Inbox'})[section]"],
      ["(contentAt>=renderedAt&&content?.sync&&section!=='outreach'?freshnessBanner(content.sync,{esc,what:'Team content'}):'')+html", 'html'],
      ["Promise.all([api('workspace/team/content'),api('workspace/community/review'),", "Promise.all([Promise.resolve(undefined),Promise.resolve(undefined),"],
      ['<section id="brand-host" hidden></section><section id="reel-host" hidden></section><section id="leoncontent-host" hidden></section><section id="creatorlab-host" hidden></section><section id="message-host" hidden></section>', ''],
      ['<dialog id="editor" aria-labelledby="editor-title"><form id="edit-form"><header><h2 id="editor-title">Content production</h2><button type="button" data-close>Close</button></header><div id="edit-body"></div><p id="edit-error" role="alert"></p><button class="primary" type="submit">Save changes</button></form></dialog>', ''],
      [`const frame=$({brands:'#brand-host',reels:'#reel-host',messages:'#message-host',leoncontent:'#leoncontent-host',creatorlab:'#creatorlab-host'}[section]||'#none')?.querySelector('iframe');if(frame){try{frame.contentWindow.location.reload()}catch{frame.src=frame.src}}`, ''],
      [`{key:'source',label:'Source',value:r=>mv?mv.leadSource(r):(r.source||'unknown'),cell:r=>'<span class="dt-muted">'+esc(mv?mv.leadSource(r):(r.source||'Unknown'))+'</span>'},`,
       `{key:'source',label:'Source',value:r=>r.source||'unknown',cell:r=>'<span class="dt-muted">'+esc(label(r.source||'Unknown'))+'</span>'},`],
      [`{key:'account',label:'Account',value:r=>r.accountId,cell:r=>'@'+esc(r.accountId||'')},`, `{key:'owner',label:'Owner',value:r=>r.owner,cell:r=>esc(r.owner||'—')},`],
      [`Array.isArray(r.blockers)?kit.englishMap(r.blockers[0],mv?.BLOCKERS_EN||{}):''`, `Array.isArray(r.blockers)?r.blockers[0]:''`],
      [`const m=await marketing();return preview(r.name||r.company||'Lead',m.dossierDialog(r,{esc,users:content?.users||[]}))`, `return preview(r.company||r.name||'Lead',dossier(r))`],
      [`const leadsTable=list=>`, `const dossier=r=>card('Lead',rows([['Company',r.company],['Contact',r.contact],['Email',r.email],['Stage',r.stage],['Source',r.source&&label(r.source)],['Owner',r.owner],['Next step',r.nextAction||(r.blockers||[])[0]],['Updated',r.updatedAt&&date(r.updatedAt)]].filter(([,v])=>v),([k,v])=>row(v,k)))+(r.history?.length?card('History',rows(r.history.slice().reverse(),h=>row(label(h.type||'event'),[h.actor,h.at&&date(h.at)].filter(Boolean).join(' · ')))):'')+(r.notes?card('Notes','<p>'+esc(r.notes)+'</p>'):'');\n const leadsTable=list=>`],
    ],
    remove: {
      objectProps: {views: R.REMOVED_VIEWS}, memberAssigns: {views: R.REMOVED_VIEWS},
      ifTests: {a: {equals: R.REMOVED_ACTIONS, prefixes: R.REMOVED_ACTION_PREFIXES}, section: {equals: R.REMOVED_VIEWS}},
      statementsContaining: ['details.studio-guide', 'fitEmbed', 'views.creatorlab', "'#brand-host'", "'#reel-host'", "'#message-host'", "'#creatorlab-host'", "'#leoncontent-host'", "$('#view').hidden="],
      replaceProps: {views: {outreach: OUTREACH, revenue: REVENUE}},
      replaceInit: {SECTIONS},
    },
    prune: {calls: R.PRUNE_CALLS, drop: ['creatorPane']},
  },
  'app.js': {
    patches: [['<h3>Hi Lio, what can we do?</h3>', '<h3>Hi, what can we do?</h3>']],
    remove: {statementsContaining: ["$('#brand-panels')"]},
  },
  'workspace-operations.mjs': {
    remove: {objectProps: {views: ['voice']}, replaceInit: {SECTION_DESCRIPTIONS: SECTION_DESCRIPTIONS, BOARD_NAMES: "{'operations':'Operations','delivery':'Client delivery','agent-hq':'Agent HQ'}"}},
    prune: {},
  },
  'agent-greeting.mjs': {patches: [['<h2>Hi Lio<span>.</span></h2>', '<h2>Hi there<span>.</span></h2>'], ["providerSpeak('Hi Lio. I am '", "providerSpeak('Hi. I am '"]]},
  'voice-session.mjs': {patches: [["enqueue('Hi Lio. '+c.name", "enqueue('Hi. '+c.name"]]},
  'workspace-dock.mjs': {patches: [
    ["caption:'Hi Lio. I’ll have", "caption:'Hi. I’ll have"], ["'Your reel script is ready, Lio. Research", "'Your reel script is ready. Research"],
    ['<span class="strip-label">Hex snapshot<small>', '<span class="strip-label">Revenue<small>'], ["el.title='Hex revenue snapshot · Voltera · '+h.state", "el.title='Revenue snapshot · '+h.state"]]},
  'brain-model.mjs': {patches: [["SECOND_PREFIX='refs/leon-second-brain/'", "SECOND_PREFIX='knowledge/'"]]},
  'labels.mjs': {patches: [["hermon:'Hermon CRM',", ''], ["zernio_mcp:'Zernio MCP','content-os':'Content OS',", '']]},
  'connector-links.mjs': {patches: [["zernio_mcp:['growth','content'],", ''], ["'content-os':['content','growth'],", '']]},
  'tech-views.mjs': {patches: [["label:'Hex · Voltera revenue'", "label:'Revenue source'", 2], ["'hermon-read-only':'Hermon (read-only)',", ''], ["caption:'Composio, Hermon, MCP and local adapters'", "caption:'Composio, MCP and local adapters'"]]},
  'portfolio-page.mjs': {patches: [["label:'Hermon CRM", "label:'CRM", 2]]},
  'runtime-panel.mjs': {patches: [['<option>leon-os</option><option>187n-delivery</option><option>agent-hq</option>', '<option>operations</option><option>delivery</option><option>agent-hq</option>']]},
  'scene.js': {patches: [['content: "Content & The AI Operator"', 'content: "Content & Community"']]},
  'settings-view.mjs': {patches: [["'Members, roles and accounts are managed in Team Hub.', link('https://187n.ai/team', 'Open Team Hub')", "'Members, roles and accounts come from your identity provider (see docs/CONNECT-YOUR-DATA.md).', ''"]]},
  'ui.mjs': {patches: [["title:'Team Hub refused this request',body:'The dashboard reads Team Hub with its own server connection, not your login.", "title:'A data source refused this request',body:'The dashboard reads its sources with its own server connection, not your login."]]},
  'today-panel.mjs': {patches: [["\n  settle(api('workspace/team/content')),", ''],
    [" // 7. Content pipeline: what is ready for the owner.\n if(content.error)cards.push(card({title:'Content',action:'production',label:'Production',unavailable:'Content workspace unavailable.'}));\n else{const items=content.items||[],review=items.filter(i=>/review/i.test(i.status||'')),record=items.filter(i=>/script/i.test(i.status||''));\n  cards.push(card({title:'Content',count:review.length,unit:'to review',tone:review.length?'attention':'calm',items:[...review.map(i=>item(i.title,'To review · @'+(i.accountId||'unassigned'))),...record.map(i=>item(i.title,'Ready to record'))],empty:'Nothing waiting for review or recording.',action:'production',label:'Production'}))}\n", '']]},
  'inbox-model.mjs': {patches: [["detail:'Team Hub content'", "detail:'Content'"], ["detail:'The AI Operator community'", "detail:'Community'"]]},
};

// Modules the kit replaces with its own version (devkit/overlay/web/<name>).
export const OVERLAY_WEB = ['workspace-navigation.mjs', 'business-modules.json'];

// The page shell (web/index.html).
export const INDEX_PATCHES = [
  ['<aside id="engine-rail" aria-label="187N engines"></aside>', ''],
  ['<button id="brand-panels">187N consoles</button>', ''],
  ['<span id="scene-status">Work signals from Hermes</span>', '<span id="scene-status">Live work signals</span>'],
  ['<span class="eyebrow">REAL WORK · HERMES</span>', '<span class="eyebrow">REAL WORK · AGENTS</span>'],
  ['<p class="muted">Repeating work uses Hermes scheduler and is created paused for review.</p>', '<p class="muted">Repeating work uses the agent scheduler and is created paused for review.</p>'],
];

// UI wording: the kit talks about "the agent runtime", not one specific runtime. Applied to every module; each entry
// must match at least once (the export stops otherwise, so stale entries are noticed).
export const GLOBAL_TEXT = [
  [' is not configured in Hermes.', ' is not configured in the agent runtime.'],
  ['run under the default Hermes profile', 'run under the default runtime profile'],
  ['Configured in Hermes profiles', 'Configured in agent profiles'],
  ['Read-only here; edit the file in Hermes.', 'Read-only here; edit the file in your agent runtime.'],
  ['<strong>Hermes</strong>', '<strong>Agent runtime</strong>'],
  ['Reading Hermes scheduler…', 'Reading the scheduler…'],
  ['<optgroup label="Hermes sessions">', '<optgroup label="Runtime sessions">'],
  ['Hermes has not saved a local output', 'The runtime has not saved a local output'],
  ['Reported by the Hermes model catalog', 'Reported by the model catalog'],
  ['All sessions in the default Hermes runtime', 'All sessions in the default runtime'],
  ['Cancellation confirmed by Hermes', 'Cancellation confirmed by the runtime'],
  ['Checking with Hermes…', 'Checking with the runtime…'],
  ['Confirmed by Hermes · ', 'Confirmed · '],
  ['Connected to Hermes', 'Connected to the agent runtime'],
  ['Default Hermes memory, user profile and persona', 'Default runtime memory, user profile and persona'],
  ['awaiting Hermes scheduler', 'awaiting the scheduler'],
  ['Guidance delivered to the active Hermes run', 'Guidance delivered to the active run'],
  ['Hermes MCP', 'Runtime MCP'],
  ['Hermes session', 'Runtime session'],
  ['Interruption requests sent to Hermes', 'Interruption requests sent to the runtime'],
  ['Reported by Hermes', 'Reported by the runtime'],
  ['the default Hermes runtime.', 'the default runtime.'],
  ['no recorded Hermes sessions', 'no recorded runtime sessions'],
  ['Work recorded in Hermes', 'Work recorded'],
  ["['Codex','Claude Code','Hermes']", "['Codex','Claude Code','Agents']"],
  ['source: "Hermes"', 'source: "Agents"'], ["||'Hermes')", "||'Agents')"],
  ['Read-only here; Hermes maintains these files', 'Read-only here; the agent runtime maintains these files'],
  ["done:'Hermes reports this work as complete.", "done:'The runtime reports this work as complete."],
  ["body:'Hermes no longer has the steps for this run.", "body:'The runtime no longer has the steps for this run."],
  ['Claude Code, Codex and Hermes each keep their own totals', 'Claude Code, Codex and the agent runtime each keep their own totals'],
  ['Persisted Hermes history', 'Persisted run history'], ['apply to future Hermes runs', 'apply to future runs'],
  ['Hermes owns scheduling, missed runs', 'The runtime owns scheduling, missed runs'], ['>Save in Hermes<', '>Save<'],
  ['delegate scoped contributions in Hermes', 'delegate scoped contributions'], ['title="Hermes · all enrolled projects', 'title="All enrolled projects'],
];

// The Mac app (mac-app/AgentHQ.swift from the live app): the address comes from Info.plist (HQURL), and when the
// dashboard is down the app starts the kit server (node server/server.mjs in HQRoot) and stops it again on quit.
export const SWIFT_PATCHES = [
  [`// Agent HQ for macOS (10 Oct 2026): the dashboard as its own app, no browser.
// One native window around the local office (http://127.0.0.1:4520). On launch the app checks the office and, when it
// is not running, starts it with the office's own launcher (upgrade/scripts/service.py start), then shows it.`,
   `// Agent HQ for macOS: the dashboard as its own app, no browser.
// One native window around the dashboard (HQURL in Info.plist, http://127.0.0.1:4520 by default). On launch the app
// checks the dashboard and, when it is not running, starts the kit server (node server/server.mjs in HQRoot, set by
// build.sh), then shows it. A server the app started is stopped again when the app quits.`],
  ['let officeURL = URL(string: "http://127.0.0.1:4520/")!', 'let officeURL = URL(string: (Bundle.main.object(forInfoDictionaryKey: "HQURL") as? String) ?? "http://127.0.0.1:4520/")!'],
  ['func isOffice(_ url: URL?) -> Bool { url?.host == "127.0.0.1" && url?.port == 4520 }', `func isOffice(_ url: URL?) -> Bool { url?.host == officeURL.host && url?.port == officeURL.port }
let serverLog = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/Agent HQ server.log")`],
  ['  var shown = false\n', '  var shown = false\n  var server: Process?\n'],
  [`        let launcher = Process()
        launcher.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        launcher.arguments = [officeRoot + "/scripts/service.py", "start"]
        launcher.currentDirectoryURL = URL(fileURLWithPath: officeRoot)
        launcher.standardOutput = FileHandle.nullDevice; launcher.standardError = FileHandle.nullDevice
        do { try launcher.run(); launcher.waitUntilExit() } catch {}
        self.poll(attempts: 60)`,
   `        guard !officeRoot.isEmpty, FileManager.default.fileExists(atPath: officeRoot + "/server/server.mjs") else {
          DispatchQueue.main.async { self.start.failed("The dashboard is not running.", "Start it with npm start in the Agent HQ folder, then try again.") }; return
        }
        let server = Process()
        server.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        server.arguments = ["node", "server/server.mjs"]
        server.currentDirectoryURL = URL(fileURLWithPath: officeRoot)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + (env["PATH"] ?? "/usr/bin:/bin")
        env["PORT"] = String(officeURL.port ?? 4520)
        server.environment = env
        if !FileManager.default.fileExists(atPath: serverLog.path) { FileManager.default.createFile(atPath: serverLog.path, contents: nil) }
        if let log = try? FileHandle(forWritingTo: serverLog) { log.seekToEndOfFile(); server.standardOutput = log; server.standardError = log }
        do { try server.run(); DispatchQueue.main.async { self.server = server } } catch { note("could not start the server: " + error.localizedDescription) }
        self.poll(attempts: 60)`],
  ['@objc func showLog() { NSWorkspace.shared.open(URL(fileURLWithPath: officeRoot + "/.local/gateway.log")) }', '@objc func showLog() { NSWorkspace.shared.open(serverLog) }'],
  ['let log = NSButton(title: "Show the office log", target: nil, action: nil)', 'let log = NSButton(title: "Show the server log", target: nil, action: nil)'],
  ['Try again, or open the office log to see why.', 'Is Node.js installed? Try again, or open the server log to see why.'],
  ['decisionHandler(origin.host == "127.0.0.1" && origin.port == 4520 ? .grant : .deny)', 'decisionHandler(origin.host == officeURL.host && origin.port == (officeURL.port ?? 80) ? .grant : .deny)'],
  ['  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }', '  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }\n  func applicationWillTerminate(_ notification: Notification) { server?.terminate() }'],
  ['item("Show the Office Log", #selector(showLog), target: self)', 'item("Show the Server Log", #selector(showLog), target: self)'],
  ['// Frames (video embeds, Creator Lab, Brand Factory) load as the page asks;', '// Frames (video embeds, embedded pages) load as the page asks;'],
];
