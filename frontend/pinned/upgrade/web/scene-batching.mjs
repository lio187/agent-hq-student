import * as THREE from 'three';
// Batch only immobile furniture. Original meshes remain invisible picking proxies.
// People and textured monitor screens keep their independent transforms/materials.
export function batchFurniture(group,people){
 const moving=new Set();people.forEach(p=>p.traverse(o=>moving.add(o)));
 const groups=new Map(),geometryKeys=new WeakMap();
 function geometryKey(g){
  if(geometryKeys.has(g))return geometryKeys.get(g);
  const attributes=Object.keys(g.attributes).sort().map(k=>k+':'+g.attributes[k].itemSize+':'+Array.from(g.attributes[k].array).join(','));
  const key=g.type+'|'+attributes.join('|')+'|'+(g.index?Array.from(g.index.array).join(','):'');
  geometryKeys.set(g,key);return key;
 }
 group.updateMatrixWorld(true);
 group.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh||moving.has(mesh)||Array.isArray(mesh.material)||mesh.material.map||!mesh.visible||mesh.matrixWorld.determinant()<0)return;
  const m=mesh.material;if(m.transparent||m.opacity!==1)return;
  const key=geometryKey(mesh.geometry)+'|'+[m.type,m.color?.getHex(),m.emissive?.getHex(),m.roughness,m.metalness,m.side,mesh.castShadow,mesh.receiveShadow].join('/');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
 });
 let batched=0,batches=0;const inverse=new THREE.Matrix4().copy(group.matrixWorld).invert(),matrix=new THREE.Matrix4();
 for(const meshes of groups.values()){
  if(meshes.length<2)continue;
  const first=meshes[0],instanced=new THREE.InstancedMesh(first.geometry,first.material.clone(),meshes.length);
  instanced.castShadow=first.castShadow;instanced.receiveShadow=first.receiveShadow;instanced.userData.base=first.userData.base?.clone();instanced.userData.furnitureBatch=true;
  meshes.forEach((mesh,i)=>{matrix.multiplyMatrices(inverse,mesh.matrixWorld);instanced.setMatrixAt(i,matrix);mesh.visible=false;mesh.userData.pickingProxy=true});
  instanced.instanceMatrix.needsUpdate=true;instanced.computeBoundingSphere();group.add(instanced);batched+=meshes.length;batches++;
 }
 return {batched,batches};
}
