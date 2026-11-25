import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Only static opaque, single-material meshes. Preserve glass sorting, shadows,
// UVs, vertex normals and original name metadata. The source GLB is untouched.
export function optimizeStaticMeshes(root){
  root.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups=new Map(),instances=new Map(),meshes=[];
  root.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const eligible=m=>!m.isInstancedMesh&&!m.isSkinnedMesh&&!m.material.transparent&&!Array.isArray(m.material)&&!m.material.lightMap&&!m.geometry.morphAttributes.position?.length&&m.children.length===0&&m.visible&&m.material.visible&&m.matrixWorld.determinant()>0;
  // True instancing is safe only for shared geometry AND material. Merging
  // already-batched, distinct geometry is usually better for this office.
  const state=m=>[m.material.uuid,m.castShadow,m.receiveShadow,m.renderOrder,m.layers.mask].join('|');
  for(const m of meshes){if(!eligible(m))continue;const key=state(m)+'|'+m.geometry.uuid;const a=instances.get(key)||[];a.push(m);instances.set(key,a);}
  const removed=new Set();let instanceCount=0;
  for(const a of instances.values()){
    if(a.length<3)continue;const first=a[0];
    const inst=new THREE.InstancedMesh(first.geometry,first.material,a.length);
    inst.castShadow=first.castShadow;inst.receiveShadow=first.receiveShadow;inst.renderOrder=first.renderOrder;inst.layers.mask=first.layers.mask;inst.name='Office instances: '+first.name;
    inst.userData.sourceNames=a.map(m=>m.name);
    a.forEach((m,i)=>{inst.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld));m.removeFromParent();removed.add(m);});
    inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();root.add(inst);instanceCount+=a.length;
  }
  const geometriesToDispose=new Set();
  for(const m of meshes){if(removed.has(m)||!eligible(m))continue;
    const attributes=Object.keys(m.geometry.attributes).sort().map(k=>{const a=m.geometry.attributes[k];return [k,a.itemSize,a.normalized,a.array.constructor.name].join(':')}).join(',');
    const key=state(m)+'|'+attributes+'|'+!!m.geometry.index;
    const a=groups.get(key)||[];a.push(m);groups.set(key,a);
  }
  for(const a of groups.values()){
    if(a.length<2)continue;
    const gs=a.map(m=>m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld)));
    let geo;try{geo=mergeGeometries(gs,false);}finally{gs.forEach(g=>g.dispose());}
    if(!geo)continue;
    const first=a[0],merged=new THREE.Mesh(geo,first.material);merged.name='Office batch: '+first.material.name;merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;merged.renderOrder=first.renderOrder;merged.layers.mask=first.layers.mask;
    let face=0;merged.userData.sourceRanges=a.map(m=>{const count=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;const r={name:m.name,firstFace:face,faceCount:count};face+=count;return r;});
    a.forEach(m=>{m.removeFromParent();geometriesToDispose.add(m.geometry);});
    geo.computeBoundingSphere();root.add(merged);
  }
  const remaining=new Set();let after=0;root.traverse(o=>{if(o.isMesh){after++;remaining.add(o.geometry);}});
  geometriesToDispose.forEach(g=>{if(!remaining.has(g))g.dispose();});
  return {before:meshes.length,after,instances:instanceCount};
}
