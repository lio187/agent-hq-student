import {takeSpeech,visibleMessages,messageText} from './chat-stream.mjs';
import {voiceActivity,voicePhase,ACTIVITY_KINDS} from './voice-activity.mjs';

// 187N Voice. Pinned to one agent per session (the Chief by default), half-duplex: the microphone
// pauses while the agent speaks and Space or Interrupt cuts in. Sentences are fetched one ahead of
// playback. Voice never approves anything; Cancel agent work stays available.
// Call screen (7 Oct 2026): analysers on the microphone and on a gain bus that carries all speech give
// the orb real levels; the snapshot carries the live partial transcript, structured lines, first-audio
// latency per turn, the runtime model and the turn's activity (tools, reasoning summary, handoffs).
export function createVoice({api,getContext,submit,onReceipt}){
 const panel=document.createElement('section');panel.id='voice-session';panel.hidden=true;
 panel.innerHTML='<header><strong>187N Voice</strong><span data-agent></span><button data-close aria-label="Close voice session">×</button></header><p data-state role="status">Voice starts when you choose.</p><div class="voice-controls"><button data-start>Start voice</button><button data-mute disabled>Mute</button><button data-listen disabled>Stop listening</button><button data-interrupt title="Space">Interrupt speech</button><button data-replay>Replay</button><button data-cancel>Cancel agent work</button></div><div data-transcript aria-live="polite"></div><p data-partial></p><button data-retry hidden>Retry voice</button>';
 document.body.append(panel);const el=s=>panel.querySelector(s);
 let context,mic,source,processor,socket,active=false,starting=false,startEpoch=0,muted=false,listening=false,playback=[],nextTime=0,lastText='',pending='',failedSpeech=false,generation=0,voiceRun=null,runOpen=false,spokenRun=null,spokenText='',suppressedRun=null,firstPiece=true,queued=[],session=null,pin='chief',ackTimer=null,stillTimer=null,stillCount=0,turnAt=0,firstAudioAt=0;
 let micAnalyser=null,ttsBus=null,ttsAnalyser=null,partial='',partialTimer=0,speech='',lastError='',lines=[],latencies=[],activity=[],runtime=null;
 const controllers=new Set(),speechQueue=[];let pumping=false;
 const listeners=new Set(),samples=new WeakMap();
 const state=t=>{el('[data-state]').textContent=t;emit()};
 function emit(){clearTimeout(partialTimer);partialTimer=0;listeners.forEach(f=>{try{f(voice.snapshot())}catch{}})}
 // Partial transcripts arrive several times a second; listeners hear about them at most every 33 ms.
 function emitSoon(){if(!partialTimer)partialTimer=setTimeout(emit,33)}
 function transcript(who,text,role='agent'){const p=document.createElement('p');p.textContent=who+': '+text;el('[data-transcript]').append(p);p.scrollIntoView({block:'nearest'});lines.push({who,text,role,at:Date.now()});if(lines.length>60)lines=lines.slice(-60);emit()}
 // Every spoken sentence goes through one gain bus, so a single analyser measures what the agent says.
 async function audio(){if(!context||context.state==='closed'){context=new AudioContext();ttsBus=ttsAnalyser=null}if(!ttsBus){ttsBus=context.createGain();ttsAnalyser=context.createAnalyser();ttsAnalyser.fftSize=512;ttsBus.connect(ttsAnalyser);ttsAnalyser.connect(context.destination)}await context.resume();return context}
 function rms(analyser){if(!analyser)return 0;let buffer=samples.get(analyser);if(!buffer){buffer=new Float32Array(analyser.fftSize);samples.set(analyser,buffer)}analyser.getFloatTimeDomainData(buffer);let sum=0;for(let i=0;i<buffer.length;i++)sum+=buffer[i]*buffer[i];return Math.sqrt(sum/buffer.length)}
 const speaking=()=>playback.length>0||Boolean(context&&nextTime>context.currentTime+.05);
 function interrupt(){suppressedRun=voiceRun?.id;generation++;controllers.forEach(c=>c.abort());controllers.clear();speechQueue.length=0;playback.forEach(n=>{try{n.stop()}catch{}});playback=[];nextTime=0;pending='';speech='';emit()}
 function failure(e,kind='session'){failedSpeech=kind==='speech';lastError=e.message||'Voice unavailable. Continue in text.';state(lastError);el('[data-retry]').hidden=false}
 function request(item){if(item.request)return;const controller=new AbortController();item.controller=controller;controllers.add(controller);item.request=fetch('/api/hq/v1/voice/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:item.text.slice(0,4000)}),signal:controller.signal});item.request.catch(()=>{})}
 async function play(item){
  await audio();const response=await item.request;
  if(!response.ok)throw new Error('187N Voice unavailable. Retry or continue in text.');
  const reader=response.body.getReader();let carry=new Uint8Array();
  while(true){const {done,value}=await reader.read();if(done||item.version!==generation)break;const bytes=new Uint8Array(carry.length+value.length);bytes.set(carry);bytes.set(value,carry.length);const size=bytes.length-bytes.length%2;carry=bytes.slice(size);if(!size)continue;const buffer=context.createBuffer(1,size/2,24000),out=buffer.getChannelData(0),view=new DataView(bytes.buffer);for(let i=0;i<out.length;i++)out[i]=view.getInt16(i*2,true)/32768;const node=context.createBufferSource();node.buffer=buffer;node.connect(ttsBus||context.destination);nextTime=Math.max(context.currentTime+.025,nextTime);node.start(nextTime);let changed=!playback.length;if(!firstAudioAt&&turnAt){firstAudioAt=performance.now();latencies.push({at:Date.now(),ms:Math.round(firstAudioAt-turnAt)});if(latencies.length>20)latencies=latencies.slice(-20);changed=true}nextTime+=buffer.duration;playback.push(node);node.onended=()=>{playback=playback.filter(n=>n!==node);if(!playback.length){if(!speaking())speech='';emit()}};if(changed)emit()}
 }
 // Keep one sentence downloading ahead of the one that is playing.
 async function pump(){
  if(pumping)return;pumping=true;
  try{while(speechQueue.length){const item=speechQueue[0];if(item.version!==generation){speechQueue.shift();continue}request(item);const next=speechQueue[1];if(next&&next.version===generation)request(next);try{lastText=item.text;speech=item.text;await play(item)}catch(e){if(e.name!=='AbortError')failure(e,'speech')}finally{controllers.delete(item.controller);speechQueue.shift()}}}
  finally{pumping=false}
 }
 function enqueue(text,{aside=false}={}){if(!text?.trim())return;if(voiceRun&&!aside)spokenText+=text;speechQueue.push({text,version:generation});pump()}
 function release(){startEpoch++;active=false;starting=false;listening=false;socket?.close();socket=null;processor?.disconnect();processor=null;micAnalyser?.disconnect();micAnalyser=null;source?.disconnect();source=null;mic?.getTracks().forEach(t=>t.stop());mic=null;partial='';el('[data-partial]').textContent='';el('[data-start]').disabled=false;el('[data-mute]').disabled=true;el('[data-listen]').disabled=true;emit()}
 let statusPromise=null,statusAt=0,statusFor='',statusInfo=null;
 function voiceStatus(profile){if(statusPromise&&statusFor===profile&&Date.now()-statusAt<60000)return statusPromise;statusFor=profile;statusAt=Date.now();statusPromise=api('voice/status?profile='+encodeURIComponent(profile)).then(s=>{statusInfo=s;return s}).catch(e=>{statusPromise=null;throw e});return statusPromise}
 function clearTimers(){clearTimeout(ackTimer);clearInterval(stillTimer);ackTimer=stillTimer=null}
 async function submitTurn(text){
  turnAt=performance.now();firstAudioAt=0;
  try{const result=await submit(text,session);voiceRun=result;runOpen=true;spokenRun=null;spokenText='';suppressedRun=null;firstPiece=true;stillCount=0;onReceipt?.(result);state(session.name+' is working…');
   const id=result.id;clearTimers();
   // Short acknowledgement when nothing is audible yet; tool runs can take minutes.
   ackTimer=setTimeout(()=>{if(voiceRun?.id===id&&runOpen&&!spokenText&&!speaking())enqueue('On it.',{aside:true})},2500);
   stillTimer=setInterval(()=>{if(voiceRun?.id!==id||!runOpen){clearTimers();return}if(!speaking()&&!pending&&stillCount<2){stillCount++;enqueue('Still working on it.',{aside:true})}},30000);
  }catch(error){runOpen=false;failure(error)}
 }
 async function start(){
  if(active||starting)return;const epoch=++startEpoch;starting=true;lastError='';el('[data-start]').disabled=true;panel.hidden=false;el('[data-retry]').hidden=true;state('Connecting 187N Voice…');
  try{const [c]=await Promise.all([getContext(pin),voiceStatus(pin),audio()]);if(epoch!==startEpoch)return;session=c;el('[data-agent]').textContent=c.name;
   const input=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});if(epoch!==startEpoch){input.getTracks().forEach(t=>t.stop());return}mic=input;
   socket=new WebSocket(location.origin.replace('http','ws')+'/api/hq/v1/voice/listen');socket.binaryType='arraybuffer';
   socket.onmessage=async e=>{const d=JSON.parse(e.data);
    if(d.type==='session_started'){state('Listening · '+c.name);enqueue('Hi Lio. '+c.name+' here. What can we do?',{aside:true})}
    if(d.type==='partial_transcript'){partial=String(d.text||'');el('[data-partial]').textContent=partial;emitSoon()}
    if(d.type==='committed_transcript'&&listening&&!muted&&d.text.trim()){partial='';el('[data-partial]').textContent='';transcript('You',d.text,'you');
     if(runOpen){queued.push(d.text.trim());state('Added to your next message when '+c.name+' finishes.');return}
     await submitTurn(d.text.trim())}
    if(d.type==='error'){release();failure(new Error(d.message))}};
   await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=()=>reject(new Error('Voice connection failed'))});
   if(epoch!==startEpoch){socket?.close();return}active=true;starting=false;listening=true;muted=false;source=context.createMediaStreamSource(mic);await context.audioWorklet.addModule('/static/voice-worklet.js');if(epoch!==startEpoch)return;processor=new AudioWorkletNode(context,'hq-microphone');
   // The analyser passes audio through unchanged: microphone → analyser (orb level) → worklet (16 kHz PCM).
   micAnalyser=context.createAnalyser();micAnalyser.fftSize=512;source.connect(micAnalyser);micAnalyser.connect(processor);processor.connect(context.destination);
   // Half-duplex: never stream the microphone while the agent is speaking (no self-transcription).
   processor.port.onmessage=e=>{if(listening&&!muted&&!speaking()&&socket?.readyState===1&&socket.bufferedAmount<64000)socket.send(e.data)};
   socket.onclose=()=>{if(active){release();failure(new Error('Voice session closed. Retry or continue in text.'))}};
   el('[data-start]').disabled=true;el('[data-mute]').disabled=false;el('[data-listen]').disabled=false;el('[data-mute]').textContent='Mute';el('[data-listen]').textContent='Stop listening';emit();
  }catch(e){release();failure(e)}
 }
 el('[data-start]').onclick=start;el('[data-retry]').onclick=()=>{if(failedSpeech){el('[data-retry]').hidden=true;lastError='';state('Retrying 187N Voice…');interrupt();enqueue(lastText,{aside:true})}else start()};
 el('[data-mute]').onclick=()=>{muted=!muted;mic?.getAudioTracks().forEach(t=>t.enabled=!muted&&listening);el('[data-mute]').textContent=muted?'Unmute':'Mute';state(muted?'Microphone muted':'Listening')};
 el('[data-listen]').onclick=()=>{listening=!listening;mic?.getAudioTracks().forEach(t=>t.enabled=listening&&!muted);el('[data-listen]').textContent=listening?'Stop listening':'Resume listening';state(listening?'Listening':'Listening stopped')};
 el('[data-interrupt]').onclick=()=>{interrupt();state('Speech interrupted. Agent work continues.')};
 el('[data-replay]').onclick=()=>{interrupt();enqueue(lastText,{aside:true})};
 el('[data-close]').onclick=()=>{release();interrupt();clearTimers();context?.close();context=null;ttsBus=ttsAnalyser=null;panel.hidden=true;emit()};
 el('[data-cancel]').onclick=async()=>{if(!voiceRun){state('No voice work to cancel');return}try{const receipt=await api('runs/'+voiceRun.id+'/stop',{});transcript('Office','Cancellation requested'+(typeof receipt?.status==='string'?' · '+receipt.status.replace(/_/g,' '):''),'system');voiceRun=null;runOpen=false;queued=[];clearTimers();interrupt()}catch(e){failure(e)}};
 // Space cuts in while the agent speaks (not while typing).
 window.addEventListener('keydown',e=>{if(e.code!=='Space'||panel.hidden||!speaking()||e.composedPath().some(t=>['INPUT','TEXTAREA','SELECT','BUTTON'].includes(t?.tagName)||t?.isContentEditable))return;e.preventDefault();interrupt();state('Speech interrupted. Listening.')});
 window.addEventListener('pagehide',()=>{release();interrupt();context?.close()});
 function finish(kind){runOpen=false;clearTimers();if(queued.length&&kind==='run.completed'){const text=queued.join(' ');queued=[];submitTurn(text)}else queued=[]}
 const voice={
  open(options={}){const next=options.profile||pin||'chief';if(active&&next!==session?.profile){release();interrupt()}pin=next;panel.hidden=false;if(options.start)start();emit()},
  stop(){release();interrupt();clearTimers();context?.close();context=null;ttsBus=ttsAnalyser=null;panel.hidden=true;emit()},
  speak(text){panel.hidden=false;interrupt();enqueue(text,{aside:true})},
  interrupt,
  busy(){return active||starting},
  toggleMute(){if(active)el('[data-mute]').click()},
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
  start(options={}){voice.open({...options,start:true})},
  // RMS of the last analyser window (0–1). The microphone reads as silent while muted or not listening.
  levels(){return {mic:active&&listening&&!muted?rms(micAnalyser):0,tts:rms(ttsAnalyser)}},
  snapshot(){
   const s={active,starting,listening,muted,speaking:speaking(),runOpen,agent:session?.name||'',profile:session?.profile||pin,conversation:session?.conversation||voiceRun?.conversation||null,model:statusInfo?.model||'',language:statusInfo?.language||'',state:el('[data-state]').textContent,error:lastError,partial,speech:speaking()?speech:'',lastLatencyMs:turnAt&&firstAudioAt?Math.round(firstAudioAt-turnAt):null,latencies:latencies.slice(),lines:lines.slice(),activity:activity.slice(),runtime:runtime?{...runtime}:null,requested:voiceRun?.requested_model?{model:voiceRun.requested_model,provider:voiceRun.requested_provider||''}:null,transcript:lines.slice(-12).map(l=>l.who+': '+l.text)};
   s.phase=voicePhase(s);return s;
  },
  event(item){const d=item.data||{};
   // Activity and the observed runtime belong to the voice run (tools, model) or its conversation (handoffs).
   if(voiceRun){let changed=false;
    if(d.run_id===voiceRun.id&&d.runtime&&typeof d.runtime==='object'&&typeof d.runtime.model==='string'&&d.runtime.model){const next={model:d.runtime.model.slice(0,160),provider:typeof d.runtime.provider==='string'?d.runtime.provider.slice(0,80):''};if(next.model!==runtime?.model||next.provider!==runtime?.provider){runtime=next;changed=true}}
    if(ACTIVITY_KINDS.has(item.kind)){const next=voiceActivity(activity,item,{runId:voiceRun.id,conversation:voiceRun.conversation,from:session?.profile||voiceRun.profile||'chief',now:Date.now()});if(next!==activity){activity=next;changed=true}}
    if(changed)emit()}
   if(!active||d.run_id!==voiceRun?.id)return;
   if(item.kind==='message.delta'&&typeof d.delta==='string'&&suppressedRun!==voiceRun.id){pending+=d.delta;let piece;while((piece=takeSpeech(pending,{first:firstPiece}))){enqueue(piece[0]);pending=piece[1];firstPiece=false}}
   if(['run.failed','run.interrupted'].includes(item.kind)){pending='';finish(item.kind);state('That turn did not finish. '+(listening?'Listening':'Listening stopped'));return}
   if(item.kind==='run.completed'){if(pending&&suppressedRun!==voiceRun.id)enqueue(pending);pending='';finish(item.kind);state(muted?'Microphone muted':listening?'Listening':'Listening stopped');const runId=voiceRun.id;
    api('conversations/'+d.conversation+'/messages').then(history=>{if(voiceRun?.id!==runId)return;const rows=visibleMessages(history.messages||history.data||[]),text=messageText(rows.filter(m=>m.role==='assistant').at(-1)?.content).trim();if(text&&spokenRun!==runId){lastText=text;spokenRun=runId;transcript(session?.name||'Agent',text);if(!spokenText&&suppressedRun!==runId)enqueue(text)}}).catch(failure)}
  },
  async completed(text){if(active&&text&&spokenRun!==voiceRun?.id){spokenRun=voiceRun?.id;transcript(session?.name||'Agent',text);if(!spokenText)enqueue(text)}}
 };
 return voice;
}
