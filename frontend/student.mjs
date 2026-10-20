// The student edition's changes on top of the developer kit's cuts. `patches` run after the kit's patches (so they
// match the kit-patched text); `after` runs after the kit's neutral wording.
import content from './patches/content.mjs';
import research from './patches/research.mjs';
import analysis from './patches/analysis.mjs';
import makers from './patches/makers.mjs';
import voice from './patches/voice.mjs';
import runtimes from './patches/runtimes.mjs';
import brain from './patches/brain.mjs';
import tools from './patches/tools.mjs';
import noEditor from './patches/no-editor.mjs';
import updates from './patches/updates.mjs';
// Each area of this edition keeps its own patches in frontend/patches/<area>.mjs; they are added after the base list.
const AREAS = [content, research, analysis, makers, voice, runtimes, brain, tools, noEditor, updates];

export const OVERLAY = ['workspace-navigation.mjs', 'social-zernio.mjs', 'setup.mjs', 'records.mjs', 'documents.mjs', 'skills-tools.mjs',
  'setup-kit.mjs', 'setup-steps.mjs', 'setup-agents.mjs', 'setup-tools.mjs', 'setup-brain.mjs', 'setup-voice.mjs', 'setup-research.mjs',
  'mk-host.mjs', 'mk-studio.mjs', 'mk-production.mjs', 'mk-campaigns.mjs', 'mk-makers.mjs', 'mk-research.mjs', 'mk-analysis.mjs', 'voice-page.mjs', 'brain-folders.mjs', 'tools-add.mjs',
  'mk-updates.mjs'];
// Beyond the kit's cuts (the owner's creative engine and products) this edition keeps every section, with its own
// Marketing, Voice, second-brain and tools pages; it drops the owner's task-manager actions.
export const EXTRA_VIEWS = [...noEditor.views];
export const EXTRA_ASSIGNS = [...noEditor.views];
// More structural cuts in workspace-view.mjs, and modules that must never be reachable (the export stops if one is).
export const EXTRA_STATEMENTS = [...noEditor.statements];
export const EXTRA_OBJECT_PROPS = {...noEditor.objectProps};
export const FORBIDDEN = [...noEditor.forbidden];
export const EXTRA_ACTIONS = ['delivery-report', 'todoist-priority', 'todoist-priority-status', ...AREAS.flatMap(a => a.removeActions || [])];
export const PRUNE_CALLS = [];

const TITLES = {inbox: 'Inbox', librarian: 'Knowledge status', memory: 'Instructions', notes: 'Second brain', sources: 'Source status', todoist: 'Tasks', routines: 'Routines', sessions: 'Runs', overview: 'Overview', usage: 'Tokens & models', revenue: 'Revenue',
  tasks: 'Work', calendar: 'Calendar', voice: 'Voice', agents: 'Agents', skills: 'Skills & tools', tools: 'Add tools', chats: 'Conversations',
  studio: 'Studio', research: 'Signals', competitors: 'Competitors', analysis: 'Creator Lab', team: 'Board', content: 'Library', record: 'Recording', production: 'Jobs', reviews: 'Review', makers: 'Carousels & stories',
  social: 'Performance', campaigns: 'Campaigns', accounts: 'Accounts', outreach: 'Leads & follow-up', proposals: 'Proposals', handbook: 'Playbooks', delivery: 'Projects', portfolio: 'Client performance',
  finance: 'Finance', people: 'Team', activity: 'Activity', connections: 'Connections', settings: 'Workspace settings', ...Object.assign({}, ...AREAS.map(a => a.titles || {}))};
const SECTIONS = JSON.stringify(TITLES);

const DESCRIPTIONS = {inbox: 'Everything that needs you: approvals, questions, reconnects and blocked work, with the recent activity below.', librarian: 'Your second brain as the Brain: how many notes and links, and when it was last read.',
  memory: "Every agent's instructions, plus the instruction files in your workspace folder.", notes: 'The folders of your second brain, and whether your agents may read them.', sources: 'Live connection status.', todoist: 'Your connected tasks.',
  routines: 'Scheduled agent work and its results.', sessions: 'Every agent run: tokens, duration and result.', overview: 'What needs you today, then model usage and operations.', usage: 'Tokens per AI tool and per day.',
  tasks: 'Give agents work, follow it live and read the results.', calendar: 'Your Google Calendar (through Composio), with your agents’ work beside it.', voice: 'Talk to your Chief of Staff. Your voice goes through your own ElevenLabs account.',
  agents: 'Your nine agents: what they do, which AI tool they run on, and their conversations.', chats: 'Pick up a conversation with an agent.',
  studio: 'Your content desk: what needs you, where content waits, and what is working right now.', research: 'Fresh signals from free public sources, turned into ideas by your agents.',
  competitors: 'The accounts you watch and their latest posts, collected with your own Apify key.', analysis: 'Analyse Reels: hooks, structure and what makes a post outperform, classified by your own AI tool.',
  team: 'Every content item by stage, from idea to posted.', content: 'All your ideas, scripts and captions in one library.', record: 'Scripts that are ready to record, with a teleprompter.',
  production: 'Work your agents do for content: scripts, hooks, captions, carousels and stories.', reviews: 'Approve, reject or rehook what your agents made.', makers: 'Carousels and stories in your brand, written by your agent and rendered on this Mac.',
  social: 'Your social accounts and posts through Zernio, with their results.', campaigns: 'Campaigns with their carousels, stories and captions.', accounts: 'Your social accounts and what each one is for.',
  outreach: 'Your leads from first contact to won: add them here, follow up, and see the funnel.', proposals: 'The proposals in your proposals folder, searchable and readable right here.', handbook: 'Your playbooks, scripts and SOPs from your playbooks folder.',
  delivery: 'Your client projects: status, next milestone and deadline.', portfolio: 'Paid income per client, this month against the month before.', finance: 'Your income and expenses: balance, what is still open, and money in and out per month.',
  people: 'Your team members, beside your agents.', skills: 'The skills and tools (MCP servers) your AI tools already have, found automatically.', tools: 'Connect any tool to your agents: an MCP server, a named API key or a skill folder.',
  activity: 'A chronological record of what happened in your office.', connections: 'Your AI tools, apps (Composio) and social accounts (Zernio), with a check and a reconnect for each.', settings: 'Shortcuts, agents, routines, knowledge and your setup.',
  ...Object.assign({}, ...AREAS.map(a => a.descriptions || {}))};

const BASE = {
  'workspace-view.mjs': {
    patches: [
      // The student pages' host (mk-host.mjs), and its mount hook after a page renders (a returned cleanup runs on leave).
      ["import {dataTable,rerenderTable,tableAction,stagePill,relativeTime,tableKeydown} from './data-table.mjs';", "import * as mkHost from './mk-host.mjs';\nimport {dataTable,rerenderTable,tableAction,stagePill,relativeTime,tableKeydown} from './data-table.mjs';"],
      ["document.body.classList.toggle('hq-voice-page',section==='voice');", "document.body.classList.toggle('hq-voice-page',section==='voice');{const u=mkHost.mounted(section,$('#view'),mkCtx);if(typeof u==='function')voiceUnsubscribe=u}"],
      // Pages this edition adds: Social (Zernio), Proposals and Playbooks (folders), Skills & tools; and the student's own
      // records (leads, projects, income and expenses, team) with Add and Manage on their pages.
      ["kit.bindKitControls(root,()=>navigate(section,{refresh:true}));",
       "const mkCtx=()=>({api,esc,number,date,btn,pill,row,rows,empty,card,preview,filters,period,root,$,voice,get days(){return days},get section(){return section},refresh:()=>navigate(section,{refresh:true}),go:v=>navigate(v)});\n Object.assign(views,{social:async()=>{filters(period());const m=await import('./social-zernio.mjs');return m.socialPage({api,esc,number,days})},proposals:async()=>(await import('./documents.mjs')).documentsPage('proposals',{api,esc,query,filters}),handbook:async()=>(await import('./documents.mjs')).documentsPage('handbook',{api,esc,query,filters}),skills:async()=>{filters('');return (await import('./skills-tools.mjs')).skillsPage({api,esc,number})}},mkHost.views(mkCtx));\n for(const [k,kind,label] of [['outreach','lead','Add lead'],['delivery','project','Add project'],['finance','entry','Add income or expense'],['people','person','Add team member']]){const v=views[k];if(v)views[k]=async(...x)=>{const m=await import('./records.mjs');const html=await v(...x);return m.bar(kind,label,{esc})+html+await m.manage(kind,{api,esc})}}\n kit.bindKitControls(root,()=>navigate(section,{refresh:true}));"],
      ["\n   await action(a,id,()=>actionSerial===serial);",
       "\n   if(a.startsWith('mk-'))return mkHost.act(a,id,mkCtx,b);\n   if(a.startsWith('record-')){const m=await import('./records.mjs');return m.act(a,id,{api,preview,esc,root,done:()=>{$('#preview').close();navigate(section,{refresh:true})}})}\n   if(a==='doc-open'){const m=await import('./documents.mjs');return m.openDocument(id,{api,preview,esc})}\n   await action(a,id,()=>actionSerial===serial);"],
      // The lead dossier: edit and delete the student's own lead; and a Won tab.
      ["+(r.notes?card('Notes','<p>'+esc(r.notes)+'</p>'):'');", "+(r.notes?card('Notes','<p>'+esc(r.notes)+'</p>'):'')+'<div class=\"actions\">'+btn('Edit lead','record-edit','lead:'+r.id,true)+btn('Delete','record-delete','lead:'+r.id)+'</div>';"],
      ["tabs:['research','contacted','replied','excluded']", "tabs:['research','contacted','replied','won','excluded']"],
    ],
    replaceInit: {SECTIONS},
  },
  'workspace-operations.mjs': {remove: {replaceInit: {SECTION_DESCRIPTIONS: JSON.stringify(DESCRIPTIONS)}}},
  'workspace-dock.mjs': {
    patches: [
      ['\'<div class="sb-label">Revenue</div><button data-meter="revenue" aria-label="Revenue snapshot: open revenue details"><span class="strip-label">Revenue<small>Reading…</small></span><b>—</b></button>', "'"],
      ["if(result[1].status==='fulfilled'){", 'if(false){'],
      ["if(result[1].status!=='fulfilled'){", 'if(false){'],
      ["ready+'/3 usage sources'", "ready+'/'+data.sources.length+' AI tools'"],
    ],
    after: [["['Codex','Claude Code','Agents']", "['Codex','Claude Code','Hermes']", 2]],
  },
  'settings-view.mjs': {
    patches: [["['people', 'Team administration', 'Members, roles and accounts come from your identity provider (see docs/CONNECT-YOUR-DATA.md).', '']",
               "['people', 'Setup and licence', 'Your licence, AI tools (Claude Code, Codex, Hermes), apps (Composio), social accounts (Zernio) and folders.', '<a class=\"ui-btn ui-btn--primary\" href=\"/setup\">Open Setup</a>']"]],
  },
  'business-records.mjs': {patches: [
    ["usd=v=>money(v,'USD')", "usd=v=>money(v,l.currency||'EUR')"],
    ["meta:'USD · settled'", "meta:(l.currency||'EUR')+' · settled'", 3],
    ["label:'Settled spend by category, USD'", "label:'Settled spend by category'"],
    ["note:'Client payments, Stripe payouts and course pass-through as labelled in the source.'", "note:'Paid income from your entries.'"],
    ["pageBanner({title:'Finance register and ledger are from '+date+(f.historical?' (historical)':'')+'.',body:'This is not a current bank balance, payment instruction or confirmation of employment. Refresh the exports to see current numbers.'},{esc}),",
     "pageBanner({title:'Your finance, up to '+date+'.',body:'These numbers come from the income and expenses you added here. Add an entry with the button above; open invoices count as receivables until you mark them paid.'},{esc}),"],
  ]},
  'brain-model.mjs': {patches: [["SECOND_PREFIX='knowledge/'", "SECOND_PREFIX=''"]]},
  // One business per student: no business switcher.
  'shell-sidebar.mjs': {patches: [['\'<label class="sb-business">', '\'<label class="sb-business" style="display:none">']]},
};

// The base patches plus every area's own (frontend/patches/*.mjs), per office module.
function merged() {
  const out = structuredClone(BASE);
  for (const area of AREAS) for (const [file, p] of Object.entries(area.files || {})) {
    const t = out[file] ??= {};
    for (const k of ['patches', 'after']) if (p[k]?.length) t[k] = [...(t[k] || []), ...p[k]];
  }
  return out;
}
export const STUDENT = merged();

// The page shell: the product name in the title.
export const INDEX_STUDENT = [['<title>187N · Agent HQ</title>', '<title>187N Agent HQ</title>']];
