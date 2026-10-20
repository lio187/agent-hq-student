// 187N Voice call screen (7 October 2026). The page renders once from a voice snapshot; afterwards every
// voice emit becomes a small list of patch operations (text, attribute, property, region HTML, append),
// so the orb canvas, focus and scroll positions survive. voiceConsoleHTML and voiceConsolePatch are pure;
// mountVoiceConsole is the only part that touches the DOM. No sample data: every value comes from the
// running session, the voice status check or the event stream, and says so when it is not reported.
import {sparkline,avatar} from './viz.mjs';
import {stateView} from './ui.mjs';
import {icon} from './icons.mjs';
import {voicePhase,PHASE_LABEL} from './voice-activity.mjs';
import {mountOrb} from './voice-orb.mjs';
import {reduced as prefersReduced} from './motion.mjs';

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seconds=ms=>(Number(ms)/1000).toFixed(1)+' s';
const clock=at=>{const d=new Date(at);return Number.isFinite(d.getTime())?d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):''};
const list=v=>Array.isArray(v)?v:[];
const TASK_WORD={waiting:'Delegated',running:'Started',ok:'Completed',blocked:'Blocked',error:'Failed'};
const CONTROLS=[['start','[data-action="voice-start"]'],['mute','[data-action="voice-mute"]'],['interrupt','[data-action="voice-interrupt"]'],['stop','[data-action="voice-stop"]'],['open','[data-vc-open]']];
// Regions that may be rebuilt. The orb lives outside all of them, so no patch can replace it.
export const VOICE_REGIONS=['[data-vc-meta]','[data-vc-transcript]','[data-vc-activity]'];

function person(id,profiles){const p=list(profiles).find(x=>x.id===id);return {name:p?.name||id||'Agent',department:p?.department}}
function runtimeText(s){
 if(s.runtime?.model)return s.runtime.model+(s.runtime.provider?' · '+s.runtime.provider:'');
 if(s.requested?.model)return 'Requested '+s.requested.model+' · not reported yet';
 return 'Not reported';
}

// Everything the screen shows, derived from one snapshot.
function model(s={},ctx={}){
 s=s&&typeof s==='object'?s:{};
 const esc=ctx.esc||escape,phase=voicePhase(s),agent=s.agent||'Chief of Staff',lines=list(s.lines),last=lines.at(-1),busy=Boolean(s.active||s.starting);
 let caption,kind,note='';
 if(phase==='listening'&&s.partial){caption=s.partial;kind='partial';note='You · live transcript'}
 else if(phase==='speaking'&&s.speech){caption=s.speech;kind='speech';note=agent+' · speaking'}
 else if(phase==='thinking'){caption='Thinking…';kind='thinking';note='Runtime model: '+runtimeText(s)}
 else if(phase==='connecting'){caption='Connecting 187N Voice…';kind='status'}
 else if(last){caption=last.text;kind='line';note=last.who+(last.at?' · '+clock(last.at):'')}
 else{caption={idle:'Press Talk and speak your brief.',listening:'Listening. Speak your brief, then pause for a second.',muted:'Microphone muted. Unmute to speak.',paused:'Listening stopped.'}[phase]||'';kind='prompt'}
 const label=phase==='thinking'?agent+' is working':PHASE_LABEL[phase];
 const controls={
  // Talk keeps its name after an error: starting a call speaks a greeting (a paid request), so it is never
  // presented as a retry. The page-level unavailable state offers Check again, which only re-reads the status.
  start:{hidden:busy,label:'Talk to Chief'},
  mute:{hidden:!busy,disabled:!s.active,label:s.muted?'Unmute':'Mute',pressed:String(Boolean(s.muted))},
  interrupt:{hidden:!busy,disabled:!s.speaking},
  stop:{hidden:!busy},
  open:{hidden:!s.conversation,id:s.conversation||''}
 };
 return {phase,label,caption,kind,note,error:s.starting?'':String(s.error||''),controls,lines,activity:list(s.activity),meta:metaHTML(s,ctx,esc)};
}

// A readable name derived from the voice model id (the raw id stays in the tooltip):
// eleven_flash_v2_5 → "Eleven flash v2.5". Nothing is looked up or invented.
export const modelLabel=id=>String(id||'').replace(/^eleven_/,'Eleven ').replace(/_v(\d+)_(\d+)$/,' v$1.$2').replace(/_/g,' ').trim();
function metaHTML(s,ctx,esc){
 const st=ctx.status||{},model=s.model||st.model||'',lang=st.language||s.language;
 const lat=list(s.latencies).filter(l=>Number.isFinite(l?.ms)&&l.ms>0),lastLat=lat.at(-1);
 const spark=lat.length>=2?sparkline(lat.map((l,i)=>({label:'Turn '+(i+1),value:l.ms})),{esc,label:'First audio per turn',format:seconds,height:24}):'';
 const cell=(label,value,sub='',extra='',title='')=>'<div><dt>'+esc(label)+'</dt><dd'+(title?' title="'+esc(title)+'"':'')+'>'+esc(value)+'</dd>'+(sub?'<small>'+esc(sub)+'</small>':'')+extra+'</div>';
 const rt=s.runtime?.model?[s.runtime.model,s.runtime.provider||'Provider not reported']:s.requested?.model?['Not reported yet','Requested '+s.requested.model]:['Not reported',''];
 return cell('Voice',st.name||(model?'187N Voice':'Checked when you start'),modelLabel(model),'',model)
  +cell('Runtime model',rt[0],rt[1])
  +cell('Latency',lastLat?seconds(lastLat.ms):'Not measured',lastLat?'First audio, last turn':'From your first turn',spark)
  +cell('Transcription',lang?(lang==='en'?'English':lang):'Checked when you start',st.silence_seconds?'Sends after a '+st.silence_seconds+' s pause':'');
}

const lineKey=l=>(l?.at||0)+'|'+(l?.who||'')+'|'+(l?.text||'');
function lineHTML(l,esc){return '<p class="vc-line" data-role="'+esc(['you','system'].includes(l.role)?l.role:'agent')+'"><b><span>'+esc(l.who)+'</span><time>'+esc(clock(l.at))+'</time></b>'+esc(l.text)+'</p>'}
function transcriptHTML(lines,esc){return lines.length?lines.map(l=>lineHTML(l,esc)).join(''):'<p class="vc-empty">Your conversation appears here.</p>'}

function activityRow(e,ctx,esc){
 const time='<time>'+esc(clock(e.at))+'</time>';
 if(e.kind==='task'){
  const from=person(e.from,ctx.profiles),to=person(e.to,ctx.profiles);
  return '<li class="vc-act" data-kind="task" data-status="'+esc(e.status)+'"><span class="vc-act-mark">'+avatar({name:to.name,department:to.department,live:e.status==='running',size:'sm'},{esc})+'</span><div><strong>'+esc(from.name+' → '+to.name)+'</strong><small>'+esc(['task '+e.task,TASK_WORD[e.status]||'Updated',e.board].filter(Boolean).join(' · '))+'</small></div>'+time+'</li>';
 }
 if(e.kind==='tool'){
  const agent=e.profile?person(e.profile,ctx.profiles):null,who=agent?.name||'',state=e.status==='running'?'Running':e.status==='error'?'Failed'+(Number.isFinite(e.ms)?' after '+seconds(e.ms):''):'Done'+(Number.isFinite(e.ms)?' in '+seconds(e.ms):'');
  // The agent that ran the tool, by avatar; the bolt only when the event names no agent.
  return '<li class="vc-act" data-kind="tool" data-status="'+esc(e.status)+'"><span class="vc-act-mark" aria-hidden="true">'+(agent?avatar({name:agent.name,department:agent.department,live:e.status==='running',size:'sm'},{esc}):icon('bolt'))+'</span><div><strong><code>'+esc(e.tool)+'</code></strong><small>'+esc([who,state].filter(Boolean).join(' · '))+'</small></div>'+time+'</li>';
 }
 if(e.kind==='runtime')return '<li class="vc-act" data-kind="runtime" data-status="info"><span class="vc-act-mark" aria-hidden="true">'+icon('tech')+'</span><div><strong>Runtime model</strong><small>'+esc(e.model+(e.provider?' · '+e.provider:''))+'</small></div>'+time+'</li>';
 if(e.kind==='reasoning')return '<li class="vc-act" data-kind="reasoning" data-status="info"><span class="vc-act-mark" aria-hidden="true">'+icon('brain')+'</span><div><strong>'+esc(e.label||'Runtime reasoning summary')+'</strong><small>'+esc(e.text)+'</small></div>'+time+'</li>';
 return '';
}
function activityHTML(entries,ctx,esc){return entries.length?entries.map(e=>activityRow(e,ctx,esc)).join(''):'<li class="vc-empty">Tool calls and handoffs appear here during a turn.</li>'}

const hidden=v=>v?' hidden':'',disabled=v=>v?' disabled':'';
// Initial markup of the call screen (inside the [data-voice-console] element).
export function voiceConsoleHTML(s={},ctx={}){
 const esc=ctx.esc||escape,m=model(s,ctx),c=m.controls;
 return '<div class="vc-stage" data-vc-stage tabindex="-1">'
  +'<div class="vc-orb-wrap"><canvas class="vc-orb" data-voice-orb width="300" height="300" aria-hidden="true"></canvas></div>'
  +'<p class="vc-phase" data-vc-phase role="status">'+esc(m.label)+'</p>'
  +'<p class="vc-caption" data-vc-caption data-kind="'+esc(m.kind)+'" aria-live="polite">'+esc(m.caption)+'</p>'
  +'<p class="vc-note" data-vc-note>'+esc(m.note)+'</p>'
  +'<p class="vc-error" data-vc-error role="alert"'+hidden(!m.error)+'>'+esc(m.error)+'</p>'
  +'<div class="vc-controls">'
  +'<button type="button" class="primary" data-action="voice-start"'+hidden(c.start.hidden)+'>'+esc(c.start.label)+'</button>'
  +'<button type="button" data-action="voice-mute" data-on="'+c.mute.pressed+'"'+hidden(c.mute.hidden)+disabled(c.mute.disabled)+'>'+esc(c.mute.label)+'</button>'
  +'<button type="button" data-action="voice-interrupt" title="Interrupt speech (Space)"'+hidden(c.interrupt.hidden)+disabled(c.interrupt.disabled)+'>Interrupt <kbd>Space</kbd></button>'
  +'<button type="button" data-action="voice-stop"'+hidden(c.stop.hidden)+'>End call</button>'
  +'<button type="button" data-vc-open data-action="conversation" data-id="'+esc(c.open.id)+'"'+hidden(c.open.hidden)+'>Open conversation ↗</button>'
  +'</div>'
  +'<dl class="vc-meta" data-vc-meta>'+m.meta+'</dl>'
  +'</div>'
  +'<div class="vc-side">'
  +'<section class="vc-panel" aria-label="Transcript"><h3>Transcript</h3><div class="vc-transcript" data-vc-transcript>'+transcriptHTML(m.lines,esc)+'</div></section>'
  +'<section class="vc-panel" aria-label="Activity"><h3>Activity</h3><ol class="vc-activity" data-vc-activity>'+activityHTML(m.activity,ctx,esc)+'</ol></section>'
  +'</div>';
}

// Pure diff between two snapshots. sel '' is the console element itself.
export function voiceConsolePatch(prev,next,ctx={}){
 const esc=ctx.esc||escape,a=model(prev,ctx),b=model(next,ctx),ops=[];
 if(a.phase!==b.phase)ops.push({op:'attr',sel:'',name:'data-phase',value:b.phase});
 if(a.label!==b.label)ops.push({op:'text',sel:'[data-vc-phase]',value:b.label});
 if(a.caption!==b.caption)ops.push({op:'text',sel:'[data-vc-caption]',value:b.caption});
 if(a.kind!==b.kind)ops.push({op:'attr',sel:'[data-vc-caption]',name:'data-kind',value:b.kind});
 if(a.note!==b.note)ops.push({op:'text',sel:'[data-vc-note]',value:b.note});
 if(a.error!==b.error)ops.push({op:'text',sel:'[data-vc-error]',value:b.error},{op:'prop',sel:'[data-vc-error]',name:'hidden',value:!b.error});
 for(const [key,sel] of CONTROLS){
  const x=a.controls[key],y=b.controls[key];
  for(const name of ['hidden','disabled'])if(Boolean(x[name])!==Boolean(y[name]))ops.push({op:'prop',sel,name,value:Boolean(y[name])});
  if((key==='start'||key==='mute')&&x.label!==y.label)ops.push({op:'text',sel,value:y.label});
  if(key==='mute'&&x.pressed!==y.pressed)ops.push({op:'attr',sel,name:'data-on',value:y.pressed});
  if(key==='open'&&x.id!==y.id)ops.push({op:'attr',sel,name:'data-id',value:y.id});
 }
 if(a.meta!==b.meta)ops.push({op:'html',sel:'[data-vc-meta]',value:b.meta});
 const la=a.lines,lb=b.lines;
 if(la.length!==lb.length||la.some((l,i)=>lineKey(l)!==lineKey(lb[i]))){
  if(la.length&&lb.length>la.length&&la.every((l,i)=>lineKey(l)===lineKey(lb[i])))ops.push({op:'append',sel:'[data-vc-transcript]',value:lb.slice(la.length).map(l=>lineHTML(l,esc)).join('')});
  else ops.push({op:'html',sel:'[data-vc-transcript]',value:transcriptHTML(lb,esc)});
 }
 const xa=activityHTML(a.activity,ctx,esc),xb=activityHTML(b.activity,ctx,esc);
 if(xa!==xb)ops.push({op:'html',sel:'[data-vc-activity]',value:xb});
 return ops;
}

// Static facts from the voice status check travel on the console element, so patches render them too.
export function voiceConsoleAttrs(status,esc=escape){
 if(!status)return '';
 return [['name',status.name],['model',status.model],['language',status.language],['transcription',status.transcription],['silence',status.silence_seconds]].filter(([,v])=>v!=null&&v!=='').map(([k,v])=>' data-voice-'+k+'="'+esc(v)+'"').join('');
}
function readStatus(el){const d=el.dataset||{};return d.voiceName||d.voiceModel?{name:d.voiceName||'',model:d.voiceModel||'',language:d.voiceLanguage||'',transcription:d.voiceTranscription||'',silence_seconds:d.voiceSilence?Number(d.voiceSilence):null}:null}

// The whole Voice page for the workspace view: an honest unavailable state when the status check fails
// and no session is running, otherwise the call screen.
export function voicePageHTML(status,snap={},{esc=escape,profiles=[],project=''}={}){
 const failed=Boolean(status?.error),live=Boolean(snap?.active||snap?.starting),ok=failed?null:status;
 // One line of instructions under the page title (7 Oct 2026); the call screen below carries the rest.
 const intro='<div class="vc-intro"><p>Speak English. The Chief stops listening while it talks; press Space to cut in. Voice never approves anything.'+(project?' Turns are saved in '+esc(project)+'.':'')+'</p></div>';
 if(failed&&!live)return intro+stateView({kind:/not configured/i.test(status.error)?'setup':'offline',title:'187N Voice is unavailable',body:status.error+' Text conversation with the Chief stays available.',actions:[{label:'Check again',action:'section',id:'voice',primary:true},{label:'Message the Chief',action:'agent',id:'chief'}]});
 return intro+(failed?'<p class="notice" role="status">'+esc(status.error)+'</p>':'')+'<section class="voice-call" data-voice-console data-phase="'+voicePhase(snap)+'"'+voiceConsoleAttrs(ok,esc)+' aria-label="Live voice session">'+voiceConsoleHTML(snap,{esc,profiles,status:ok})+'</section>';
}

export function applyVoiceOps(root,ops){
 for(const o of ops){
  const el=o.sel?root.querySelector(o.sel):root;if(!el)continue;
  if(o.op==='text')el.textContent=o.value;
  else if(o.op==='attr'){if(o.value==null)el.removeAttribute(o.name);else el.setAttribute(o.name,o.value)}
  else if(o.op==='prop')el[o.name]=o.value;
  else if(o.op==='html')el.innerHTML=o.value;
  else if(o.op==='append')el.insertAdjacentHTML('beforeend',o.value);
 }
}

// Render once, mount the orb, then patch on every voice emit. dispose() stops both.
export function mountVoiceConsole(el,voice,{esc=escape,profiles=[],reduced=()=>prefersReduced()}={}){
 const ctx={esc,profiles,status:readStatus(el)};
 let prev=voice.snapshot();
 el.innerHTML=voiceConsoleHTML(prev,ctx);el.dataset.phase=voicePhase(prev);
 const canvas=el.querySelector('[data-voice-orb]');
 const orb=canvas?mountOrb(canvas,{levels:()=>voice.levels?.()||{mic:0,tts:0},phase:voicePhase(prev),reduced}):null;
 const follow=sel=>{const box=el.querySelector(sel);return box&&box.scrollHeight-box.scrollTop-box.clientHeight<48?box:null};
 const off=voice.subscribe(next=>{
  const ops=voiceConsolePatch(prev,next,ctx);prev=next;orb?.setPhase(voicePhase(next));if(!ops.length)return;
  const pinned=['[data-vc-transcript]','[data-vc-activity]'].map(follow).filter(Boolean),focused=el.getRootNode?.().activeElement;
  applyVoiceOps(el,ops);
  pinned.forEach(box=>{box.scrollTop=box.scrollHeight});
  // A control that disappears (Talk once the call starts, End once it stops) hands focus to the stage, not
  // to another button: Space must stay "interrupt", never press End call or Mute by accident.
  if(focused&&el.contains(focused)&&(focused.hidden||focused.disabled))el.querySelector('[data-vc-stage]')?.focus({preventScroll:true});
 });
 return {dispose(){off?.();orb?.dispose()},get orb(){return orb}};
}
