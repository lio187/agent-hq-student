export function officeRoute(base,platform,brainSeat){
 const [x,z,width,depth]=platform,exitZ=z>0?-depth/2:depth/2;
 // Leave behind the chair, pass outside the angled desks, then use the bridge.
 const aisle=Math.sign(base.x||1)*(width/2-1.2),back=Math.min(depth/2-.7,base.z+2.2);
 return [{x:base.x,z:base.z},{x:base.x,z:back},{x:aisle,z:back},{x:aisle,z:exitZ},{x:0,z:exitZ},{x:brainSeat.x-x,z:brainSeat.z-z}];
}
export function pathLength(points){return points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.z-points[i].z),0)}
export function samplePath(points,distance){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(distance<=length&&length){const t=Math.max(0,distance/length);return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,angle:Math.atan2(b.x-a.x,b.z-a.z)}}distance-=length}return {...points.at(-1),angle:0}}
