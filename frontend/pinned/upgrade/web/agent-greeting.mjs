// Local welcome UI. Never inserted into the agent's conversation or sent as a prompt.
export function createGreeting({onBrief,onWorkflow,onReplayView,speak:providerSpeak,interrupt}){
 const card=document.createElement('section');card.id='agent-greeting';card.hidden=true;card.setAttribute('aria-label','Agent welcome');
 card.innerHTML='<div class="greeting-top"><span class="greeting-avatar" aria-hidden="true"></span><div><span class="eyebrow">YOUR AGENT</span><strong class="greeting-name"></strong></div><button class="greeting-dismiss" aria-label="Dismiss welcome">×</button></div><div class="greeting-copy" aria-live="polite"><h2>Hi Lio<span>.</span></h2><p>What can we do?</p></div><p class="greeting-role"></p><div class="greeting-actions"><button class="greeting-brief primary">Give me a task ↗</button><button class="greeting-workflow" aria-controls="workflow-drawer" title="Open this agent’s latest recorded steps beside the office">Workflow</button><button class="greeting-voice" aria-pressed="false" title="Speak greetings with 187N Voice">Voice off</button><button class="greeting-again" aria-label="Replay greeting" title="Replay greeting">↻</button></div>';
 document.querySelector('#office').append(card);
 let current,voiceEnabled=false;
 const voiceButton=card.querySelector('.greeting-voice');
 function speak(){if(voiceEnabled&&current)providerSpeak('Hi Lio. I am '+current.name+'. What can we do?')}
 voiceButton.title='Speak with 187N Voice';voiceButton.onclick=()=>{voiceEnabled=!voiceEnabled;voiceButton.setAttribute('aria-pressed',String(voiceEnabled));voiceButton.textContent=voiceEnabled?'Voice on':'Voice off';if(voiceEnabled)speak();else interrupt()};
 card.querySelector('.greeting-dismiss').onclick=()=>{card.hidden=true;interrupt()};
 card.querySelector('.greeting-brief').onclick=()=>onBrief(current);
 // Workflow (7 Oct 2026): this agent's real recorded steps in the drawer beside the office.
 card.querySelector('.greeting-workflow').onclick=e=>onWorkflow?.(current,e.currentTarget);
 function animate(){card.getAnimations({subtree:true}).forEach(a=>a.cancel());if(!matchMedia('(prefers-reduced-motion: reduce)').matches){card.animate([{opacity:0,transform:'translateY(12px) scale(.97)'},{opacity:1,transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'});card.querySelector('.greeting-copy').animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:400,delay:100,fill:'backwards'})}}
 card.querySelector('.greeting-again').onclick=()=>{animate();speak()};
 const reel=document.createElement('button');reel.id='reel-view';reel.type='button';reel.textContent='Reel view';reel.setAttribute('aria-pressed','false');reel.title='Clean recording view · R';document.querySelector('#company-open').before(reel);
 function toggle(){if(document.body.classList.contains('cockpit-ready')){document.querySelector('#chief-dock [data-record]')?.click();return}const enabled=document.body.classList.toggle('reel-view');if(enabled)document.body.classList.remove('cinematic');reel.setAttribute('aria-pressed',String(enabled));reel.textContent=enabled?'Exit Reel view':'Reel view';if(enabled)onReplayView();}
 reel.onclick=toggle;
 window.addEventListener('keydown',e=>{if(!e.defaultPrevented&&!e.composedPath().some(t=>['INPUT','TEXTAREA','SELECT'].includes(t.tagName))&&e.key.toLowerCase()==='r'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog:modal')){e.preventDefault();toggle()}});
 return {exitReel(){if(document.body.classList.contains('reel-view'))toggle()},show(p){current=p;card.querySelector('.greeting-name').textContent=p.name;card.querySelector('.greeting-avatar').textContent=p.name.split(/\s+/).map(n=>n[0]).slice(0,2).join('');card.querySelector('.greeting-role').textContent=p.role||p.department_name;card.hidden=false;animate();speak()},hide(){card.hidden=true;interrupt()}};
}
