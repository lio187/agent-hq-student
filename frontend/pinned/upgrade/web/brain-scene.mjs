// Brain scene (7 October 2026): the GPU renderer for the Brain, loaded on demand (shares the three.js chunk
// with the office). One Points draw (additive sprite: bright core + soft halo, no bloom pass) and one
// LineSegments draw, plus a tiny accent overlay for the focused note's links. Frames are drawn on demand:
// on input, layout ticks, camera flights and, only while the page is visible, motion is allowed and the
// dialog is open, a slow ambient turn (0.02 rad/s). Colours arrive from the design tokens (sRGB 0..1).
import * as THREE from 'three';

const VERTEX=`
attribute vec3 aColor;attribute float aSize;attribute float aState;
uniform float uScale;uniform float uPixelRatio;uniform vec3 uAccent;uniform float uGain;
varying vec3 vColor;varying float vAlpha;varying float vCore;
void main(){
 vec4 mv=modelViewMatrix*vec4(position,1.0);
 float size=aSize;vec3 color=aColor;float alpha=0.95*uGain;float core=0.18;
 if(aState>2.5){color=uAccent;size*=2.0;alpha=1.0;core=0.5;}
 else if(aState>1.5){size*=1.5;alpha=1.0;core=0.6;}
 else if(aState>0.5){alpha=0.14;core=0.0;}
 gl_PointSize=clamp(size*uScale/max(-mv.z,1.0),1.5,36.0)*uPixelRatio;
 gl_Position=projectionMatrix*mv;
 vColor=color;vAlpha=alpha;vCore=core;
}`;
const FRAGMENT=`
varying vec3 vColor;varying float vAlpha;varying float vCore;
void main(){
 vec2 p=gl_PointCoord*2.0-1.0;float d=dot(p,p);
 if(d>1.0)discard;
 float core=smoothstep(0.16,0.0,d);
 float halo=exp(-d*4.5)*0.6;
 float a=clamp((core+halo)*vAlpha,0.0,1.0);
 gl_FragColor=vec4(mix(vColor,vec3(1.0),core*vCore),a);
}`;

export function createBrainScene(canvas,{labelLayer=null,palette,isOpen=()=>true,canAnimate=()=>true,reduced=()=>false}={}){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setClearColor(0x000000,0);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,0.5,40000);
 const srgb=c=>new THREE.Color().setRGB(c[0],c[1],c[2],THREE.SRGBColorSpace);
 const pointMaterial=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:FRAGMENT,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
  uniforms:{uScale:{value:500},uPixelRatio:{value:1},uGain:{value:1},uAccent:{value:new THREE.Vector3(...palette.accent)}}});
 const lineMaterial=new THREE.LineBasicMaterial({color:srgb(palette.line),transparent:true,opacity:0.12,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending});
 const focusMaterial=new THREE.LineBasicMaterial({color:srgb(palette.accent),transparent:true,opacity:0.85,depthWrite:false,depthTest:false});
 let points=null,lines=null,focusLines=null,n=0,src=new Int32Array(0),dst=new Int32Array(0),positions=new Float32Array(0),sizes=new Float32Array(0),states=new Float32Array(0);
 let focusPairs=[],labels=[],whole=null;
 // Orbit camera around a target.
 const target=new THREE.Vector3();let radius=600,theta=0.6,phi=1.15,tween=null,width=1,height=1,shift=0;
 let raf=0,needs=true,disposed=false,ambient=true,hovering=false,dragging=false,last=0,frames=0,lastFrameAt=0,resting=null,grid=null;
 const listeners={pick:()=>{},hover:()=>{},camera:()=>{}};

 function place(){
  phi=Math.min(Math.PI-0.05,Math.max(0.05,phi));radius=Math.max(4,Math.min(30000,radius));
  camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(target);camera.updateMatrixWorld();
 }
 function invalidate(){needs=true;grid=null;schedule()}
 function animating(){return Boolean(tween)||(ambient&&!hovering&&!dragging&&n>0&&isOpen()&&canAnimate())}
 function schedule(){if(!raf&&!disposed&&!document.hidden)raf=requestAnimationFrame(frame)}
 function frame(t){
  raf=0;if(disposed)return;
  const dt=last?Math.min(0.1,(t-last)/1000):0;last=t;
  if(tween){
   const p=Math.min(1,(t-tween.start)/tween.duration),e=1-Math.pow(1-p,3);
   target.lerpVectors(tween.fromTarget,tween.toTarget,e);radius=tween.fromRadius+(tween.toRadius-tween.fromRadius)*e;
   if(p>=1)tween=null;needs=true;grid=null;
  }else if(animating()){theta+=0.02*dt;needs=true;grid=null}
  if(needs){place();renderer.render(scene,camera);drawLabels();frames++;lastFrameAt=t;needs=false;canvas.dataset.frames=String(frames);canvas.dataset.scale=(distanceFor(bounds().r)/radius).toFixed(2)}
  if(animating())schedule();else{last=0;clearTimeout(resting);resting=setTimeout(()=>{grid=null},120)}
 }
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0}else invalidate()};
 document.addEventListener('visibilitychange',visibility);

 function resize(){
  const box=canvas.parentElement?.getBoundingClientRect()||{width:canvas.clientWidth,height:canvas.clientHeight};
  width=Math.max(1,box.width);height=Math.max(1,box.height);const dpr=Math.min(globalThis.devicePixelRatio||1,2);
  renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);camera.aspect=width/height;
  // Keep the graph centred in the part of the stage that the legend does not cover.
  if(shift)camera.setViewOffset(width,height,shift,0,width,height);else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  pointMaterial.uniforms.uScale.value=height/2/Math.tan(THREE.MathUtils.degToRad(camera.fov/2));pointMaterial.uniforms.uPixelRatio.value=dpr;
  invalidate();
 }
 const observer=new ResizeObserver(resize);if(canvas.parentElement)observer.observe(canvas.parentElement);

 function disposeObject(o){if(!o)return;scene.remove(o);o.geometry.dispose()}
 function setGraph(graph){
  disposeObject(points);disposeObject(lines);disposeObject(focusLines);focusLines=null;
  n=graph.n;src=graph.src;dst=graph.dst;sizes=graph.sizes;positions=new Float32Array(3*n);states=new Float32Array(n);whole=null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor',new THREE.BufferAttribute(graph.colours,3));
  g.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));
  g.setAttribute('aState',new THREE.BufferAttribute(states,1).setUsage(THREE.DynamicDrawUsage));
  // Large graphs: lower per-point intensity so dense clusters do not saturate to white under additive blending.
  pointMaterial.uniforms.uGain.value=n>3000?Math.max(0.2,1-0.5*Math.log10(n/3000)):1;lineMaterial.userData.base=n>20000?0.018:src.length>8000?0.06:0.12;lineMaterial.opacity=lineMaterial.userData.base;
  points=new THREE.Points(g,pointMaterial);points.frustumCulled=false;
  const l=new THREE.BufferGeometry();l.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6*src.length),3).setUsage(THREE.DynamicDrawUsage));
  lines=new THREE.LineSegments(l,lineMaterial);lines.frustumCulled=false;
  scene.add(lines);scene.add(points);
  canvas.dataset.nodes=String(n);canvas.dataset.edges=String(src.length);invalidate();
 }
 function setColours(colours){if(!points)return;points.geometry.getAttribute('aColor').copyArray(colours);points.geometry.getAttribute('aColor').needsUpdate=true;invalidate()}
 function setPositions(next){
  if(!points||next.length!==positions.length)return;
  positions.set(next);whole=null;points.geometry.getAttribute('position').needsUpdate=true;
  const seg=lines.geometry.getAttribute('position'),arr=seg.array;
  for(let k=0;k<src.length;k++){const a=3*src[k],b=3*dst[k],o=6*k;arr[o]=next[a];arr[o+1]=next[a+1];arr[o+2]=next[a+2];arr[o+3]=next[b];arr[o+4]=next[b+1];arr[o+5]=next[b+2]}
  seg.needsUpdate=true;updateFocus();invalidate();
 }
 // State per node: 0 normal, 1 dimmed, 2 highlighted, 3 selected.
 function setStates(next,{dimLinks=false}={}){if(!points)return;states.set(next);points.geometry.getAttribute('aState').needsUpdate=true;lineMaterial.opacity=dimLinks?0.04:(lineMaterial.userData.base||0.12);invalidate()}
 function setFocusPairs(pairs){focusPairs=pairs||[];updateFocus();invalidate()}
 function updateFocus(){
  disposeObject(focusLines);focusLines=null;if(!focusPairs.length)return;
  const arr=new Float32Array(6*focusPairs.length);
  focusPairs.forEach(([a,b],k)=>{arr.set(positions.subarray(3*a,3*a+3),6*k);arr.set(positions.subarray(3*b,3*b+3),6*k+3)});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(arr,3));focusLines=new THREE.LineSegments(g,focusMaterial);focusLines.frustumCulled=false;scene.add(focusLines);
 }
 // Bounding sphere of every node (or a subset) -> camera distance that fits it.
 function bounds(indices){
  if(!indices&&whole)return whole;
  const size=indices?indices.length:n,at=k=>indices?indices[k]:k;if(!size)return {centre:new THREE.Vector3(),r:100};
  const c=new THREE.Vector3();for(let k=0;k<size;k++){const i=at(k);c.x+=positions[3*i];c.y+=positions[3*i+1];c.z+=positions[3*i+2]}c.divideScalar(size);
  // Fit 98% of the notes (all of them for small sets) so a few stragglers do not shrink the graph.
  const d=new Float32Array(size);for(let k=0;k<size;k++){const i=at(k);d[k]=Math.hypot(positions[3*i]-c.x,positions[3*i+1]-c.y,positions[3*i+2]-c.z)}
  d.sort();const r=size<50?d[size-1]:d[Math.floor((size-1)*0.98)];
  const result={centre:c,r:Math.max(r,20)};if(!indices)whole=result;return result;
 }
 function distanceFor(r){const v=THREE.MathUtils.degToRad(camera.fov/2),h=Math.atan(Math.tan(v)*camera.aspect);return r/Math.sin(Math.min(v,h))*1.04}
 function fly(toTarget,toRadius,{animate=true}={}){
  if(!animate||reduced()){target.copy(toTarget);radius=toRadius;tween=null;invalidate();return}
  tween={fromTarget:target.clone(),toTarget:toTarget.clone(),fromRadius:radius,toRadius,start:performance.now(),duration:650};invalidate();
 }
 function fit({animate=false,indices=null}={}){const b=bounds(indices);fly(b.centre,distanceFor(b.r),{animate})}
 // Fly to a note and frame its neighbourhood: span = how far its links reach (80th percentile).
 function focus(i,{animate=true,neighbours=[]}={}){
  if(i<0||i>=n)return;const d=neighbours.map(j=>Math.hypot(positions[3*j]-positions[3*i],positions[3*j+1]-positions[3*i+1],positions[3*j+2]-positions[3*i+2])).sort((a,b)=>a-b);
  const span=Math.max(45,d.length?d[Math.floor((d.length-1)*0.8)]:60);
  fly(new THREE.Vector3(positions[3*i],positions[3*i+1],positions[3*i+2]),distanceFor(span*1.05),{animate});
 }
 function zoom(factor){tween=null;radius/=factor;invalidate();listeners.camera()}

 // Screen projection for picking and labels.
 const m=new THREE.Matrix4();
 function project(i,out){
  const e=m.elements,x=positions[3*i],y=positions[3*i+1],z=positions[3*i+2],w=e[3]*x+e[7]*y+e[11]*z+e[15];
  if(w<=0.01)return false;
  out.x=((e[0]*x+e[4]*y+e[8]*z+e[12])/w*0.5+0.5)*width;out.y=(0.5-(e[1]*x+e[5]*y+e[9]*z+e[13])/w*0.5)*height;out.w=w;
  return true;
 }
 function ready(){place();m.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)}
 function buildGrid(){
  ready();const cell=16,cols=Math.ceil(width/cell)+1,map=new Map(),p={};
  for(let i=0;i<n;i++){if(states[i]===1||!project(i,p)||p.x<0||p.y<0||p.x>width||p.y>height)continue;const key=Math.floor(p.y/cell)*cols+Math.floor(p.x/cell);let list=map.get(key);if(!list)map.set(key,list=[]);list.push(i)}
  grid={cell,cols,map};
 }
 function pick(x,y){
  if(!n)return -1;if(!grid)buildGrid();else ready();
  const {cell,cols,map}=grid,p={};let best=-1,bestD=Infinity;
  for(let cy=Math.floor((y-18)/cell);cy<=Math.floor((y+18)/cell);cy++)for(let cx=Math.floor((x-18)/cell);cx<=Math.floor((x+18)/cell);cx++)for(const i of map.get(cy*cols+cx)||[]){
   if(!project(i,p))continue;const px=Math.max(7,sizes[i]*pointMaterial.uniforms.uScale.value/p.w*0.6),d=Math.hypot(p.x-x,p.y-y);
   if(d<=px&&d<bestD){best=i;bestD=d}
  }
  return best;
 }

 // HTML labels over the canvas, at most 40, nearest-first priority given by the caller.
 const pool=[];
 function setLabels(next){labels=next.slice(0,40);invalidate()}
 function drawLabels(){
  if(!labelLayer)return;ready();
  while(pool.length<labels.length){const s=document.createElement('span');s.className='brain-node-label';labelLayer.append(s);pool.push(s)}
  const placed=[],p={},far=radius>distanceFor(170);
  labels.forEach((label,k)=>{
   const el=pool[k];let ok=label.i>=0?project(label.i,p):projectPoint(label.point,p);
   // Zoomed out: cluster names and the best-linked notes; zoomed in: note names only.
   if(ok&&label.kind==='hub'&&far&&label.rank>=6)ok=false;
   if(ok&&label.kind==='group'&&!far)ok=false;
   if(ok&&(p.x<-40||p.y<-20||p.x>width+40||p.y>height+20))ok=false;
   const w=Math.min(220,label.text.length*6.6+12),rect=[p.x-w/2,p.y-26,p.x+w/2,p.y-8];
   if(ok&&label.kind!=='focus'&&placed.some(r=>r[0]<rect[2]&&rect[0]<r[2]&&r[1]<rect[3]&&rect[1]<r[3]))ok=false;
   el.hidden=!ok;if(!ok)return;placed.push(rect);
   if(el.textContent!==label.text)el.textContent=label.text;el.dataset.kind=label.kind;
   el.style.transform='translate('+Math.round(p.x)+'px,'+Math.round(p.y-14)+'px) translate(-50%,-100%)';
  });
  for(let k=labels.length;k<pool.length;k++)pool[k].hidden=true;
 }
 function projectPoint(point,out){
  const e=m.elements,[x,y,z]=point,w=e[3]*x+e[7]*y+e[11]*z+e[15];if(w<=0.01)return false;
  out.x=((e[0]*x+e[4]*y+e[8]*z+e[12])/w*0.5+0.5)*width;out.y=(0.5-(e[1]*x+e[5]*y+e[9]*z+e[13])/w*0.5)*height;out.w=w;return true;
 }

 // Input: drag to turn, shift/right-drag to pan, wheel or pinch to zoom, click to pick.
 const pointers=new Map();let downAt=null,moved=false,pinch=0;
 const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top}};
 function down(e){canvas.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,local(e));downAt=local(e);moved=false;dragging=true;tween=null;if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y)}}
 function move(e){
  const p=local(e);
  if(!pointers.has(e.pointerId)){hovering=true;if(!grid&&!animating())buildGrid();const i=pick(p.x,p.y);listeners.hover(i,p);canvas.style.cursor=i>=0?'pointer':'grab';return}
  const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,p);
  if(Math.hypot(p.x-downAt.x,p.y-downAt.y)>3)moved=true;
  if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)zoom(d/pinch);pinch=d;return}
  const dx=p.x-prev.x,dy=p.y-prev.y;
  if(e.shiftKey||e.buttons===2||e.buttons===4){const s=radius*0.0016,right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);target.addScaledVector(right,-dx*s).addScaledVector(up,dy*s)}
  else{theta-=dx*0.005;phi-=dy*0.005}
  needs=true;grid=null;schedule();listeners.camera();
 }
 function up(e){
  const p=local(e);pointers.delete(e.pointerId);if(pointers.size<2)pinch=0;
  if(!pointers.size){dragging=false;if(!moved&&downAt)listeners.pick(pick(p.x,p.y),p);schedule()}
 }
 function leave(){hovering=false;listeners.hover(-1,null);schedule()}
 function wheel(e){e.preventDefault();zoom(Math.exp(-e.deltaY*0.0015))}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('contextmenu',e=>e.preventDefault());

 resize();place();
 return {
  setGraph,setColours,setPositions,setStates,setFocusPairs,setLabels,fit,focus,zoom,pick,invalidate,
  rotate(dx,dy){tween=null;theta+=dx;phi+=dy;invalidate();listeners.camera()},
  pan(dx,dy){const s=radius*0.0016,right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);target.addScaledVector(right,-dx*s).addScaledVector(up,dy*s);invalidate()},
  setAmbient(on){ambient=Boolean(on);schedule()},
  setInsets({right=0}={}){const next=Math.round(right/2);if(next!==shift){shift=next;resize()}},
  onPick(fn){listeners.pick=fn},onHover(fn){listeners.hover=fn},onCamera(fn){listeners.camera=fn},
  get scale(){return distanceFor(bounds().r)/radius},
  stats:()=>({nodes:n,edges:src.length,frames,lastFrameAt,radius,animating:animating()}),
  dispose(){
   disposed=true;cancelAnimationFrame(raf);clearTimeout(resting);observer.disconnect();document.removeEventListener('visibilitychange',visibility);
   canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('wheel',wheel);
   disposeObject(points);disposeObject(lines);disposeObject(focusLines);pointMaterial.dispose();lineMaterial.dispose();focusMaterial.dispose();
   for(const s of pool)s.remove();renderer.dispose();
  }
 };
}
