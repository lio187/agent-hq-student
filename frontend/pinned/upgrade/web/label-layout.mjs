// Screen-space labels stay near their subjects. When a small viewport is full,
// the complete Team roster remains the accessible way to select every agent.
export function overlaps(a,b,gap=3){return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap&&Math.abs(a.y-b.y)<(a.h+b.h)/2+gap}
export function placeLabels(labels,{width,height,obstacles=[],margin=8,bottom=75,radius=120,dense=false}={}){
 const occupied=[...obstacles],result=new Map(),candidates=[[0,0]];
 for(let distance=24;distance<=radius;distance+=24)for(const [dx,dy]of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]])candidates.push([dx*distance,dy*distance]);
 if(dense)for(let distance=24;distance<=radius;distance+=24)for(let offset=-distance+24;offset<distance;offset+=24)candidates.push([offset,-distance],[offset,distance],[-distance,offset],[distance,offset]);
 if(dense)candidates.sort((a,b)=>a[0]*a[0]+a[1]*a[1]-b[0]*b[0]-b[1]*b[1]);
 for(const label of [...labels].sort((a,b)=>(b.priority||0)-(a.priority||0))){
  if(label.x<0||label.x>width||label.y<0||label.y>height){result.set(label.id,null);continue}
  let placed=null;
  for(const [dx,dy]of candidates){const box={...label,x:Math.max(margin+label.w/2,Math.min(width-margin-label.w/2,label.x+dx)),y:Math.max(margin+label.h/2,Math.min(height-bottom-label.h/2,label.y+dy))};if(box.y-box.h/2<margin||box.x-box.w/2<margin||occupied.some(o=>overlaps(box,o)))continue;placed=box;occupied.push(box);break}
  result.set(label.id,placed);
 }
 return result;
}
