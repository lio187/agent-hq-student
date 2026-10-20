// Motion (6 October 2026): the workspace's one motion language — enter, count, draw — and nothing more.
// Every page is rendered in its final state first; motion is a short layer on top of it. A run only starts
// when it can finish (page visible, motion allowed), a timer finishes it even when the frame clock stops
// (the in-app pane pauses frames while hidden), and a page that becomes hidden snaps to its end state.
// Refreshes do not replay: entry and drawing play on a section change, a number counts only when it changed.
export const EASE='cubic-bezier(.16,1,.3,1)';
export const easeOutHard=p=>1-Math.pow(1-Math.min(1,Math.max(0,p)),3.2);
const win=()=>globalThis.window,doc=()=>globalThis.document;

export function reduced(w=win()){try{return Boolean(w?.matchMedia?.('(prefers-reduced-motion: reduce)').matches)}catch{return false}}
export function canAnimate({w=win(),d=doc()}={}){return Boolean(w&&d)&&d.visibilityState==='visible'&&!reduced(w)}

// Numbers: count the first numeric token of a label ("€19,587,992", "6.1bn", "95.4×") and keep the rest.
const TOKEN=/-?\d[\d,]*(?:\.\d+)?/;
export function numberToken(text){
 const m=TOKEN.exec(String(text??''));if(!m)return null;
 const value=Number(m[0].replace(/,/g,''));if(!Number.isFinite(value))return null;
 return {raw:m[0],value,index:m.index,decimals:(m[0].split('.')[1]||'').length,grouped:m[0].includes(',')};
}
export function formatLike(token,value){
 const [i,d]=Number(value).toFixed(token.decimals).split('.');
 return (token.grouped?i.replace(/\B(?=(\d{3})+(?!\d))/g,','):i)+(d?'.'+d:'');
}
export const frameText=(text,token,value)=>text.slice(0,token.index)+formatLike(token,value)+text.slice(token.index+token.raw.length);

// Replay guard: the last text shown per key. A first sighting counts from zero, a change counts from the
// previous value, an unchanged value does not move.
const seen=new Map();
export function countStart(key,text){
 const prev=seen.has(key)?seen.get(key):undefined;seen.set(key,text);
 if(seen.size>600)seen.delete(seen.keys().next().value);
 if(prev===text)return null;
 const to=numberToken(text);if(!to||to.value===0)return null;
 const from=prev===undefined?0:numberToken(prev)?.value;
 return from==null||from===to.value?null:from;
}
export function forgetCounts(){seen.clear()}

// Running work, finished together when the page hides.
const live=new Set();
const finishAll=()=>{for(const run of [...live])run.finish()};
let listening=false;
function watch(){if(listening||!doc())return;listening=true;doc().addEventListener('visibilitychange',()=>{if(doc().visibilityState!=='visible')finishAll()})}
function track(finish,ms){
 const run={finish:()=>{if(run.done)return;run.done=true;live.delete(run);clearTimeout(run.timer);finish()}};
 run.timer=setTimeout(run.finish,ms+400);live.add(run);watch();return run;
}
const animate=(el,frames,options)=>{try{return el.animate?.(frames,{easing:EASE,fill:'backwards',...options})||null}catch{return null}};
const group=(anims,ms)=>{const list=anims.filter(Boolean);if(list.length)track(()=>list.forEach(a=>{try{a.finish()}catch{}}),ms);return list};

export function countUp(el,key,{duration=600}={}){
 const text=el.textContent,from=countStart(key,text);
 if(from==null||!canAnimate())return false;
 const to=numberToken(text),start=performance.now();
 const run=track(()=>{el.textContent=text},duration);
 const step=t=>{if(run.done)return;const p=(t-start)/duration;if(p>=1)return run.finish();el.textContent=frameText(text,to,from+(to.value-from)*easeOutHard(p));requestAnimationFrame(step)};
 el.textContent=frameText(text,to,from);requestAnimationFrame(step);
 return true;
}

// Entry: an 8 px rise and fade, staggered across the first few blocks only.
export function enter(els,{step=35,max=8,duration=220}={}){
 if(!canAnimate())return [];
 const list=[...els].slice(0,max);
 return group(list.map((el,i)=>animate(el,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration,delay:i*step})),duration+list.length*step);
}

// Charts draw from their baseline: bars grow, lines trace, rings fill. Marks carry their own origin in CSS.
export function draw(root,{duration=500}={}){
 if(!canAnimate()||!root)return [];
 const anims=[];
 root.querySelectorAll('.viz-bar,.viz-seg').forEach((el,i)=>anims.push(animate(el,[{transform:'scaleX(0)'},{transform:'none'}],{duration,delay:Math.min(i,10)*25})));
 root.querySelectorAll('.viz-mark,.viz-cell').forEach((el,i)=>anims.push(animate(el,[{transform:'scaleY(0)',opacity:.4},{transform:'none',opacity:1}],{duration,delay:Math.min(i,30)*12})));
 root.querySelectorAll('.viz-spark svg').forEach(el=>anims.push(animate(el,[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:duration+300})));
 root.querySelectorAll('.viz-spark-dot,.viz-day-dot').forEach((el,i)=>anims.push(animate(el,[{opacity:0,transform:'scale(.4)'},{opacity:1,transform:'none'}],{duration:260,delay:duration+Math.min(i,20)*20})));
 root.querySelectorAll('.viz-ring-value').forEach(el=>anims.push(animate(el,[{strokeDashoffset:100},{strokeDashoffset:getComputedStyle(el).strokeDashoffset||0}],{duration:duration+200})));
 root.querySelectorAll('.brand-trace .trace-draw').forEach(el=>anims.push(animate(el,[{strokeDashoffset:1},{strokeDashoffset:0}],{duration:1100,easing:'cubic-bezier(.65,0,.35,1)'})));
 return group(anims,duration+700);
}

// One call per render: entry and drawing on a fresh section, numbers whenever they changed.
const ENTER=':scope > *, :scope > .metrics > *, :scope > .viz-grid > *, :scope .pulse-band > *';
export function play(root,{key,fresh}={}){
 if(!root)return;
 if(fresh){enter(root.querySelectorAll(ENTER));draw(root)}
 root.querySelectorAll('[data-count]').forEach(el=>countUp(el,(key||'')+'|'+el.dataset.count));
}
