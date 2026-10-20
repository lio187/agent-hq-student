// 187N Voice orb (7 October 2026): a 2D canvas dial of 64 ticks around a ring, driven by real audio
// levels (microphone while listening, the agent's voice while speaking). orbFrame is pure maths; mountOrb
// paints it. The frame loop runs only while there is something to show (connecting, listening, thinking,
// speaking), the page is visible, the orb is on screen and motion is allowed. Idle, muted, paused and
// reduced motion are one static frame that does not depend on time. Colours are read from the tokens.
export const ORB_BARS=64;
export const ANIMATED=new Set(['connecting','listening','thinking','speaking']);
export const ORB_TONE={idle:'--status-idle',connecting:'--text-secondary',listening:'--accent',thinking:'--text-body',speaking:'--status-info',muted:'--status-warn',paused:'--status-warn'};
const clamp=v=>Number.isFinite(v)?Math.min(1,Math.max(0,v)):0;
// Speech RMS sits around 0.02–0.2; a square-root curve keeps quiet voices visible without clipping loud ones.
export const levelCurve=v=>clamp(Math.sqrt(clamp(v))*2.2);

export function orbFrame({phase='idle',mic=0,tts=0,t=0,reduced=false,bars=ORB_BARS}={}){
 const p=Object.hasOwn(ORB_TONE,phase)?phase:'idle',voiced=p==='listening'||p==='speaking';
 const n=Math.max(1,Math.min(256,Math.floor(Number(bars))||ORB_BARS)),time=reduced?0:(Number.isFinite(t)?t:0);
 // Reduced motion: a fixed amplitude per phase, so the frame depends on neither time nor level.
 const amp=voiced?(reduced?.3:levelCurve(p==='speaking'?Number(tts):Number(mic))):0;
 const breathe=p==='thinking'||p==='connecting'?(reduced?.5:.5+.5*Math.sin(time/(p==='connecting'?260:640))):0;
 const speed=p==='speaking'?.0042:.0031,out=new Array(n);
 for(let i=0;i<n;i++){
  if(!voiced){out[i]=0;continue}
  const shape=.5+.5*Math.sin(i*2.39996+time*speed)*Math.cos(i*.61+time*speed*.7);
  out[i]=clamp(amp*(.28+.72*shape));
 }
 return {
  phase:p,tone:ORB_TONE[p],bars:out,animated:!reduced&&ANIMATED.has(p),
  radius:.52+(voiced?.06*amp:p==='thinking'?.035*breathe:0),
  glow:clamp(voiced?amp:p==='thinking'?.45*breathe:p==='connecting'?.25*breathe:0),
  ringAlpha:clamp(p==='idle'?.5:p==='connecting'?.3+.45*breathe:p==='thinking'?.35+.55*breathe:voiced?.55+.45*amp:.85)
 };
}

export function mountOrb(canvas,{levels=()=>({mic:0,tts:0}),phase='idle',reduced=()=>false,win=globalThis.window,doc=globalThis.document}={}){
 const ctx=canvas?.getContext?.('2d');
 let current=Object.hasOwn(ORB_TONE,phase)?phase:'idle',raf=0,disposed=false,inView=true,size=0,dpr=1;
 const smooth={mic:0,tts:0},colors={};
 const isReduced=()=>Boolean(typeof reduced==='function'?reduced():reduced);
 function readColors(){
  const style=win.getComputedStyle(canvas),fallback=style.color||'gray';
  for(const name of [...new Set(Object.values(ORB_TONE)),'--border-mid','--bg-elevated'])colors[name]=style.getPropertyValue(name).trim()||fallback;
 }
 function resize(){
  dpr=Math.min(2,win.devicePixelRatio||1);size=Math.round(canvas.clientWidth||canvas.width/dpr||0);
  const px=Math.max(1,Math.round(size*dpr));if(canvas.width!==px||canvas.height!==px){canvas.width=px;canvas.height=px}
 }
 function paint(t){
  if(!ctx||!size)return;
  const f=orbFrame({phase:current,mic:smooth.mic,tts:smooth.tts,t,reduced:isReduced()});
  const w=canvas.width,c=w/2,R=w/2,r=R*f.radius*.86,tone=colors[f.tone],inner=r+6*dpr,reach=Math.max(0,R-inner-3*dpr);
  ctx.clearRect(0,0,w,w);ctx.globalAlpha=1;
  // Soft glow: two translucent discs instead of a blur, so a frame stays well under a millisecond.
  if(f.glow>.01){ctx.fillStyle=tone;for(const [k,a] of [[1.32,.07],[1.14,.1]]){ctx.globalAlpha=f.glow*a;ctx.beginPath();ctx.arc(c,c,r*k,0,Math.PI*2);ctx.fill()}}
  ctx.globalAlpha=1;ctx.fillStyle=colors['--bg-elevated'];ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=f.ringAlpha;ctx.strokeStyle=f.phase==='idle'?colors['--border-mid']:tone;ctx.lineWidth=1.5*dpr;ctx.beginPath();ctx.arc(c,c,r,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=f.phase==='idle'?.6:.95;ctx.strokeStyle=f.phase==='idle'?colors['--border-mid']:tone;ctx.lineWidth=Math.max(1.5,2*dpr);ctx.lineCap='round';ctx.beginPath();
  for(let i=0;i<f.bars.length;i++){
   const a=i/f.bars.length*Math.PI*2-Math.PI/2,x=Math.cos(a),y=Math.sin(a),len=1.5*dpr+f.bars[i]*reach;
   ctx.moveTo(c+x*inner,c+y*inner);ctx.lineTo(c+x*(inner+len),c+y*(inner+len));
  }
  ctx.stroke();ctx.globalAlpha=1;
 }
 const wanted=()=>!disposed&&ANIMATED.has(current)&&!isReduced()&&doc?.visibilityState!=='hidden'&&inView&&canvas.isConnected!==false;
 function tick(t){
  raf=0;if(!wanted()){sync();return}
  const l=levels()||{};
  for(const k of ['mic','tts']){const target=clamp(Number(l[k]));smooth[k]+=(target-smooth[k])*(target>smooth[k]?.55:.18)}
  paint(t);raf=win.requestAnimationFrame(tick);
 }
 function sync(){
  if(wanted()){if(!raf)raf=win.requestAnimationFrame(tick)}
  else{if(raf){win.cancelAnimationFrame(raf);raf=0}smooth.mic=smooth.tts=0;paint(0)}
  canvas.dataset.loop=raf?'running':'stopped';canvas.dataset.phase=current;
 }
 const onVisibility=()=>sync();
 const motion=win.matchMedia?.('(prefers-reduced-motion: reduce)');
 const resizer=win.ResizeObserver?new win.ResizeObserver(()=>{resize();paint(win.performance?.now?.()||0)}):null;
 const viewer=win.IntersectionObserver?new win.IntersectionObserver(entries=>{inView=entries.some(e=>e.isIntersecting);sync()}):null;
 readColors();resize();
 doc?.addEventListener?.('visibilitychange',onVisibility);motion?.addEventListener?.('change',onVisibility);resizer?.observe(canvas);viewer?.observe(canvas);
 sync();
 return {
  setPhase(next){const p=Object.hasOwn(ORB_TONE,next)?next:'idle';if(p===current)return;current=p;sync()},
  get phase(){return current},
  get running(){return Boolean(raf)},
  dispose(){disposed=true;if(raf)win.cancelAnimationFrame(raf);raf=0;doc?.removeEventListener?.('visibilitychange',onVisibility);motion?.removeEventListener?.('change',onVisibility);resizer?.disconnect();viewer?.disconnect();canvas.dataset.loop='stopped'}
 };
}
