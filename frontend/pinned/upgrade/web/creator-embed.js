(()=>{
 // Inside the office (6 Oct 2026): Creator Lab is the page itself. The frame grows to its full content height and
 // the office page scrolls; window height and scroll calls inside the app refer to the visible office area.
 const frame=window.top!==window?window.frameElement:null,main=frame?.closest('.workspace-main');
 if(frame&&main){
  const sticky=()=>(main.querySelector('#view')?.offsetHeight||56)+12;
  const view=()=>{const f=frame.getBoundingClientRect(),m=main.getBoundingClientRect();return {top:Math.max(0,m.top-f.top),h:main.clientHeight}};
  Object.defineProperty(window,'innerHeight',{configurable:true,get:()=>main.clientHeight});
  const go=(y,behavior)=>main.scrollTo({top:Math.max(0,Math.round(frame.getBoundingClientRect().top-main.getBoundingClientRect().top+main.scrollTop+y-sticky())),behavior:behavior||'auto'});
  window.scrollTo=window.scroll=function(a,b){const o=typeof a==='object'&&a;go(o?(a.top??0):(b??0),o?a.behavior:undefined)};
  Element.prototype.scrollIntoView=function(o){const r=this.getBoundingClientRect(),opt=typeof o==='object'&&o?o:{},block=opt.block||'start',v=view(),s=sticky();
   if(block==='nearest'&&r.top>=v.top+s&&r.bottom<=v.top+v.h)return;
   go(block==='center'?r.top+r.height/2-(v.h-s)/2:r.top,opt.behavior)};
  const css=document.documentElement.style,mark=()=>{const v=view();css.setProperty('--hq-view-top',v.top+'px');css.setProperty('--hq-view-h',v.h+'px')};
  // The frame is as tall as its content: in-flow content sets the height (so it can shrink), and anything that
  // still overflows (positioned parts) grows it, so Creator Lab never scrolls inside the page.
  // A hidden frame (another HQ page is open) has nothing to measure: skip, so the backup poll costs nothing (8 Oct 2026).
  const fit=()=>{const b=document.body,se=document.scrollingElement||document.documentElement;if(!b||(frame&&!frame.offsetParent))return;
   let h=Math.max(b.scrollHeight,document.documentElement.getBoundingClientRect().height);
   for(const c of b.children){const p=getComputedStyle(c).position;if(p==='absolute'||p==='fixed'||c.tagName==='DIALOG')continue;h=Math.max(h,c.getBoundingClientRect().bottom+scrollY)}
   if(se.scrollHeight>se.clientHeight+1)h=Math.max(h,se.scrollHeight);
   h=Math.ceil(h);if(h&&Math.abs(frame.getBoundingClientRect().height-h)>1)frame.style.height=h+'px';mark()};
  main.addEventListener('scroll',mark,{passive:true});addEventListener('load',fit);
  // Observers can pause in a hidden or throttled window, so a light poll backs them up.
  let poll=0,observer=null,mutations=null,soon=0;
  document.addEventListener('DOMContentLoaded',()=>{fit();observer=new ResizeObserver(fit);observer.observe(document.body);
   mutations=new MutationObserver(()=>{clearTimeout(soon);soon=setTimeout(fit,60)});mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
   poll=setInterval(fit,700)});
  addEventListener('pagehide',()=>{main.removeEventListener('scroll',mark);clearInterval(poll);clearTimeout(soon);observer?.disconnect();mutations?.disconnect()});
  // Native dialogs open where the owner is looking, not in the middle of the tall frame.
  const show=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){const v=view();this.style.margin=(v.top+24)+'px auto auto';this.style.maxHeight=Math.max(240,v.h-48)+'px';return show.call(this)};
 }
 const original=window.fetch.bind(window),pending=new Map();
 window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/creator-lab/')||!init.method||init.method.toUpperCase()==='GET')return original(input,init);
  const signature=url.pathname+'\n'+String(init.body||'');
  if(!pending.has(signature))pending.set(signature,crypto.randomUUID());
  const headers=new Headers(init.headers);headers.set('X-HQ-Request-Key',pending.get(signature));
  const response=await original(input,{...init,headers});
  if(response.status<500&&response.status!==409)pending.delete(signature);
  return response;
 };
})();
