import manifest from './business-modules.json' with {type:'json'};
// The manifest is synchronised from Team Hub and stays canonical; the office presents English labels.
const BUSINESS_LABELS={all:'All businesses','187n':'187N',tao:'The AI Operator'};
const DEPARTMENT_LABELS={today:'Today',operations:'Operations',marketing:'Marketing & Content',sales:'Sales',delivery:'Client Delivery',course:'The AI Operator',tech:'Tech & AI',finance:'Finance',people:'Team & People',knowledge:'Knowledge & Assets'};
const MODULE_LABELS={today:'Overview',calendar:'Calendar',work:'Agent work',todoist:'My tasks',routines:'Routines',conversations:'Conversations',voice:'Voice',messages:'Messages',production:'Production','production-jobs':'Production jobs',content:'Content',record:'Recording',review:'Review','creator-lab':'Creator Lab',research:'Research',competitors:'Competitors',campaigns:'Campaigns',social:'Social analytics','brand-content-os':'Brand Content OS','content-os':'Leon Content OS',accounts:'Account network',outreach:'Leads & follow-up',setter:'Setter Studio',handbook:'Sales handbook',proposals:'Proposals',delivery:'Project delivery',portfolio:'Client performance',community:'Community & coaching',agents:'Agents',sessions:'Runtime sessions',activity:'Activity',connections:'Connections',sources:'Source status',finance:'Financial overview',people:'Team roster',librarian:'Knowledge status',memory:'Memory & instructions',brands:'Brand Factory',settings:'Settings'};
// Folded into other sections (owner, 5 Oct 2026): still routable, never listed as a page.
// 7 Oct 2026: My tasks live in the Calendar deadlines layer, conversations in the agent rail, messages in the composer.
// Departments batch 2: Source status lives in Connections (Data sources + Local services).
const FOLDED=new Set(['brand-content-os','content-os','todoist','conversations','messages','sources']);
export const moduleLabel=m=>MODULE_LABELS[m.id]||m.label;
export const departmentLabel=d=>DEPARTMENT_LABELS[d.id]||d.label;
export const BUSINESSES=manifest.businesses.map(b=>({...b,label:BUSINESS_LABELS[b.id]||b.label}));
// Pages (9 Oct 2026): a department shows a few pages, each one job; related sections are views inside the page
// (switched in place). 32 pages became 18. Every section keeps its route, so old links and bookmarks still work.
// Finance and Team & People share one department. Studio is the Creative Director's home in Marketing.
const LAYOUT=[
 {department:'today',pages:[['overview','Overview',[['overview','Overview']]]]},
 {department:'operations',pages:[['calendar','Calendar',[['calendar','Calendar']]],['tasks','Agent work',[['tasks','Tasks'],['routines','Routines']]],['voice','Voice',[['voice','Voice']]]]},
 {department:'marketing',pages:[['studio','Studio',[['studio','Studio']]],['research','Ideas & research',[['research','Signals'],['competitors','Competitors'],['creatorlab','Creator Lab']]],
  ['team','Production',[['team','Board'],['content','Library'],['record','Recording'],['production','Jobs'],['reviews','Review']]],['editor','Video editor',[['editor','Video editor']]],['social','Publish & results',[['social','Performance'],['campaigns','Campaigns'],['accounts','Accounts']]]]},
 {department:'sales',pages:[['outreach','Pipeline',[['outreach','Leads & follow-up'],['proposals','Proposals']]],['setter','Training',[['setter','Setter practice'],['handbook','Handbook']]]]},
 {department:'delivery',pages:[['delivery','Clients',[['delivery','Delivery'],['portfolio','Performance']]]]},
 {department:'course',pages:[['community','Community',[['community','Community & coaching']]]]},
 {department:'tech',pages:[['agents','Agents',[['agents','Agents'],['sessions','Runtime sessions']]],['activity','Activity',[['activity','Activity']]],['connections','Setup',[['connections','Connections'],['settings','Settings']]]]},
 {department:'finance',label:'Finance & Team',include:['finance','people'],pages:[['finance','Finance',[['finance','Financial overview']]],['people','Team',[['people','Team roster']]]]},
 {department:'knowledge',pages:[['librarian','Knowledge',[['librarian','Status'],['memory','Memory & instructions']]],['brands','Brand Factory',[['brands','Brand Factory']]]]},
];
const NEW_SECTIONS=new Set(['studio','editor']);  // sections that are not modules in the Team Hub manifest
const allModules=manifest.modules.filter(m=>m.local);
const available=(section,modules,business)=>NEW_SECTIONS.has(section)||modules.some(m=>m.local===section&&(business==='all'||m.businesses.includes(business)));
function build(business){
 return LAYOUT.map(l=>{
  const d=manifest.departments.find(x=>x.id===l.department)||{id:l.department,label:l.label};
  const modules=allModules.filter(m=>(l.include||[l.department]).includes(m.department)).map(m=>({...m,label:moduleLabel(m)}));
  const pages=l.pages.map(([id,label,views])=>({id,label,views:views.filter(([v])=>available(v,modules,business)).map(([v,vl])=>[v,vl])})).filter(p=>p.views.length);
  // A page's route is its first view the business can see.
  return {id:pages[0]?.views[0]?.[0]||d.id,department:d.id,label:l.label||departmentLabel(d),group:'Workspace',pages,tabs:pages.map(p=>[p.views[0][0],p.label]),modules};
 }).filter(w=>w.pages.length);
}
export const WORKSPACES=build('all');
// The page (and its views) that holds a section, for the given business.
export function pageOf(section,business='all'){
 const s=section==='board'?'team':section;
 for(const w of business==='all'?WORKSPACES:build(business))for(const p of w.pages)if(p.views.some(([v])=>v===s))return {...p,department:w.department};
 return null;
}
export const workspaceFor=section=>WORKSPACES.find(w=>w.pages.some(p=>p.views.some(([v])=>v===(section==='board'?'team':section))))||WORKSPACES.find(w=>w.modules.some(m=>m.local===(section==='board'?'content':section)))||WORKSPACES[0];
export const normalizeSection=section=>({reels:'production',dashboard:'overview',usage:'overview',revenue:'overview','brand-factory':'brands',more:'settings',integrations:'connections',sources:'connections'})[section]||section;
export const workspacesForBusiness=business=>business==='all'?WORKSPACES:build(business);
