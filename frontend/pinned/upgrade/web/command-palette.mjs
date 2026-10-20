// ⌘K command palette: jump to any page, agent or recent task, and open existing office actions.
// It only navigates or opens the existing flows; it never submits, approves or stops work itself.
import {WORKSPACES} from './workspace-navigation.mjs';
import {icon} from './icons.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// One shortcut list for ⌘K help, the office controls and Settings; ⌘ reads Ctrl off a Mac (10 Oct 2026).
const MOD=typeof navigator!=='undefined'&&!/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||'')?'Ctrl ':'⌘ ';
export const SHORTCUTS=[[MOD+'K','Search and jump anywhere'],[MOD+'J','Message the Chief of Staff'],['N','Create a task'],['B','Company board'],['G','Open the Brain'],['C','Chat with the department lead'],['1 – 6','Focus a department in the office'],['7','Chief command deck'],['0 / H','Reset the office camera'],['V','Cinematic view'],['+ / −','Zoom the office'],['X','Office meeting animation'],[MOD+'⇧ E','Expanded brief editor'],[MOD+'↵','Submit the current form'],['Esc','Close the open panel or menu']];

export function createCommandPalette({getState,getItems,isBlocked,go,action,focusChief}){
 const dialog=document.createElement('dialog');dialog.id='command-palette';dialog.setAttribute('aria-label','Command palette');
 dialog.innerHTML='<div class="cp-input">'+icon('search')+'<input type="text" role="combobox" aria-expanded="true" aria-controls="cp-results" aria-autocomplete="list" autocomplete="off" spellcheck="false" aria-label="Search pages, agents, tasks and actions" placeholder="Search pages, agents, tasks and actions…"><kbd>Esc</kbd></div><div class="cp-list" id="cp-results" role="listbox" aria-label="Results"></div><div class="cp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>?</kbd> shortcuts</span></div>';
 document.body.append(dialog);
 const input=dialog.querySelector('input'),list=dialog.querySelector('.cp-list');
 let entries=[],shown=[],index=0,mode='search';
 // Commands with arguments (7 Oct 2026, the 21st.dev "command palette with argument chips" pattern): choose a
 // command, then each argument becomes a chip; the last step is free text. It only opens an existing flow.
 let cmd=null,argValues=[];
 const chips=dialog.querySelector('.cp-input');
 function build(){
  const state=getState()||{},nav=[['office','Office','Living 3D office','office'],['overview','Overview','Revenue, usage and operations','overview'],['brain','Brain','Knowledge vault','brain'],['inbox','Inbox','Approvals and agent questions','inbox']].map(([id,title,hint,ic])=>({group:'Go to',title,hint,ic,run:()=>go(id)}));
  // Every view stays findable by name, shown with its page (9 Oct 2026): "Production · Review".
  const modules=WORKSPACES.flatMap(w=>(w.pages||[]).flatMap(p=>p.views.map(([id,label])=>({group:'Pages',title:p.views.length>1?p.label+' · '+label:p.label,hint:w.label,ic:w.department,run:()=>go(id)}))));
  const actions=[
   ['New task','Open the task composer','plus',()=>action('new-task')],
   ['Message the Chief of Staff','Write a mission brief','chat',()=>focusChief()],
   ['Talk to Chief','Start a voice session','mic',()=>action('chief-voice')],
   ['Company board','Every department on one board','board',()=>action('board')],
   ['Review approvals','Approve once or deny pending runtime requests','inbox',()=>action('approvals')],
   ['Answer agent questions','Open clarification requests','chat',()=>action('questions')],
   ['Repair connections','Expired or unverified accounts','plug',()=>go('connections')],
   ['Model activity','Models requested by active runs','bolt',()=>action('models')],
   ['Office usage','Reported token usage','overview',()=>action('usage')],
   ['Office health','Runtime status and emergency stop','settings',()=>action('health')],
   ['Keyboard shortcuts','Every office shortcut','keyboard',()=>open('?')]
  ].map(([title,hint,ic,run])=>({group:'Actions',title,hint,ic,run}));
  const agents=(state.profiles||[]).filter(p=>p.installed!==false).map(p=>({group:'Agents',title:p.name,hint:p.department_name||p.role||'',ic:'chat',run:()=>action('agent',p.id)}));
  const commands=[{group:'Commands',title:'Brief an agent',hint:'Pick the agent, write the brief, then review it in the task composer',ic:'plus',
   args:[{label:'Agent',options:()=>(state.profiles||[]).filter(p=>p.installed!==false&&p.enrolled!==false).map(p=>({id:p.id,title:p.name,hint:p.department_name||p.role||''}))}],
   placeholder:v=>'What should '+v[0].title+' do? Enter opens the composer; nothing is sent yet.',
   finish:(v,text)=>action('brief-agent',JSON.stringify({profile:v[0].id,prompt:text}))}];
  const tasks=(getItems?.()||[]).filter(t=>t.kind==='task'&&t.title).sort((a,b)=>(b.changed||0)-(a.changed||0)).slice(0,40).map(t=>({group:'Recent work',title:t.title,hint:[t.stage,t.profile].filter(Boolean).join(' · '),ic:'board',run:()=>action('task',t.id)}));
  entries=[...nav,...commands,...actions,...modules,...agents,...tasks];
 }
 function score(e,terms){const hay=(e.title+' '+e.hint+' '+e.group).toLowerCase();if(!terms.every(t=>hay.includes(t)))return -1;const title=e.title.toLowerCase();return (title.startsWith(terms[0])?3:0)+(title.includes(terms.join(' '))?2:0)}
 // Screen readers follow the highlighted result through aria-activedescendant (10 Oct 2026).
 function syncActive(){if(shown.length)input.setAttribute('aria-activedescendant','cp-opt-'+index);else input.removeAttribute('aria-activedescendant')}
 function render(){
  if(mode==='?'){list.innerHTML='<div class="cp-group">Keyboard shortcuts</div>'+SHORTCUTS.map(([k,v])=>'<div class="cp-shortcut"><span>'+esc(v)+'</span><kbd>'+esc(k)+'</kbd></div>').join('');shown=[];return}
  const q=input.value.trim().toLowerCase(),terms=q.split(/\s+/).filter(Boolean);
  chips.querySelectorAll('.cp-chip').forEach(c=>c.remove());
  if(cmd){
   const at=chips.querySelector('input');at.insertAdjacentHTML('beforebegin','<span class="cp-chip">'+esc(cmd.title)+'</span>'+argValues.map((v,i)=>'<span class="cp-chip">'+esc(cmd.args[i].label+': '+v.title)+'</span>').join(''));
   if(argValues.length<cmd.args.length){const arg=cmd.args[argValues.length];input.placeholder='Choose '+arg.label.toLowerCase()+'… (Backspace goes back)';
    shown=arg.options().filter(o=>!terms.length||terms.every(t=>(o.title+' '+o.hint).toLowerCase().includes(t))).slice(0,60).map(o=>({group:arg.label,title:o.title,hint:o.hint,ic:'chat',keepOpen:true,run:()=>{argValues.push(o);input.value='';index=0;render()}}))}
   else{input.placeholder=cmd.placeholder(argValues);shown=[{group:'Next',title:input.value.trim()?'Open the composer with this brief':'Type the brief, then press Enter',hint:'Nothing is sent until you press Create in the composer',ic:'plus',keepOpen:!input.value.trim(),run:()=>{if(!input.value.trim())return;const text=input.value.trim(),c=cmd,v=argValues;cmd=null;argValues=[];c.finish(v,text)}}]}
  }
  else{input.placeholder='Search pages, agents, tasks and actions…';
  shown=terms.length?entries.map(e=>[e,score(e,terms)]).filter(([,s])=>s>=0).sort((a,b)=>b[1]-a[1]).map(([e])=>e).slice(0,60):entries.filter(e=>e.group!=='Recent work'||entries.indexOf(e)<entries.findIndex(x=>x.group==='Recent work')+6).slice(0,60);}
  index=Math.min(index,Math.max(0,shown.length-1));
  let group='';
  list.innerHTML=shown.length?shown.map((e,i)=>{const head=e.group!==group?'<div class="cp-group">'+esc(group=e.group)+'</div>':'';return head+'<button type="button" class="cp-item" role="option" id="cp-opt-'+i+'" tabindex="-1" data-index="'+i+'" aria-selected="'+(i===index)+'">'+icon(e.ic)+'<span class="cp-title">'+esc(e.title)+'</span><span class="cp-hint">'+esc(e.hint)+'</span></button>'}).join(''):'<p class="cp-empty">No matches. Try a page, agent or task name.</p>';
  list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});syncActive();
 }
 function run(i){const e=shown[i];if(!e)return;if(e.args){cmd=e;argValues=[];input.value='';index=0;render();input.focus();return}if(e.keepOpen){e.run();input.focus();return}dialog.close();Promise.resolve().then(e.run).catch(err=>console.warn(err))}
 function open(initial=''){
  if(isBlocked?.())return;
  build();cmd=null;argValues=[];mode=initial==='?'?'?':'search';input.value=mode==='?'?'':initial;index=0;
  if(!dialog.open)dialog.showModal();render();input.focus();
 }
 input.addEventListener('input',()=>{if(input.value==='?'&&!cmd){mode='?';input.value='';render();return}mode='search';index=0;render()});
 dialog.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!shown.length)return;index=(index+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;list.querySelectorAll('.cp-item').forEach(b=>b.setAttribute('aria-selected',String(Number(b.dataset.index)===index)));list.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});syncActive()}
  else if(e.key==='Enter'){e.preventDefault();run(index)}
  else if(e.key==='Backspace'&&mode==='?'&&!input.value){mode='search';render()}
  else if(e.key==='Backspace'&&cmd&&!input.value){e.preventDefault();if(argValues.length)argValues.pop();else cmd=null;index=0;render()}
  e.stopPropagation();
 });
 list.addEventListener('click',e=>{const b=e.target.closest('.cp-item');if(b)run(Number(b.dataset.index))});
 list.addEventListener('mousemove',e=>{const b=e.target.closest('.cp-item');if(b&&Number(b.dataset.index)!==index){index=Number(b.dataset.index);list.querySelectorAll('.cp-item').forEach(x=>x.setAttribute('aria-selected',String(x===b)));syncActive()}});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 window.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();if(dialog.open)dialog.close();else open();return}
  if(e.key==='?'&&!e.metaKey&&!e.ctrlKey&&!dialog.open&&!e.composedPath().some(t=>/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable)&&!document.querySelector('dialog[open]')){e.preventDefault();open('?')}
 },true);
 return {open,close:()=>dialog.close(),get isOpen(){return dialog.open}};
}
