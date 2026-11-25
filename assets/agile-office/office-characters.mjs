import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAgentAnimator} from './agent-animation.mjs';
export const CLIPS=Object.freeze(['Idle','Walk','Typing','Thinking','Review','Meeting','Talk','Error','Celebrate','Sitting']);
const filePattern=/^[a-z-]+\.glb$/;
export function rosterPlan(roster,stations){
  if(!Array.isArray(roster)||roster.length!==7||stations.length!==7)throw Error('Expected seven characters and stations');
  const roles=new Set(),slots=new Set(),files=new Set();
  return roster.map(({role,file,station})=>{
    if(typeof role!=='string'||!role||!filePattern.test(file)||!Number.isInteger(station)||!stations[station]||roles.has(role)||slots.has(station)||files.has(file))throw Error('Invalid character roster');
    roles.add(role);slots.add(station);files.add(file);
    const [x,y,a]=stations[station];
    if(![x,y,a].every(Number.isFinite))throw Error('Invalid character station');
    // Preview stands behind the chair, rather than claiming validated seating/IK.
    const offset=1.60;
    return {role,file,x:x+Math.sin(a)*offset,z:-y+Math.cos(a)*offset,yaw:Math.PI-a};
  });
}
function disposeTree(root){
  const geometry=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  root.traverse(o=>{
    if(o.geometry)geometry.add(o.geometry);
    if(o.skeleton)skeletons.add(o.skeleton);
    for(const m of (Array.isArray(o.material)?o.material:o.material?[o.material]:[])){
      materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
    }
  });
  skeletons.forEach(s=>s.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometry.forEach(g=>g.dispose());
}
function readModel(url){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('GET',url,true);xhr.responseType='arraybuffer';xhr.timeout=20000;
    xhr.onload=()=>{if((xhr.status===0||xhr.status===200)&&xhr.response?.byteLength>20)resolve(xhr.response);else reject(Error('Character asset unavailable'));};
    xhr.onerror=xhr.ontimeout=()=>reject(Error('Character asset unavailable'));xhr.send();
  });
}
export async function loadCharacterRoster({roster,stations,officeURL,isCancelled,read=readModel,loader=new GLTFLoader()}){
  const plan=rosterPlan(roster,stations),group=new THREE.Group(),records=new Map();
  group.name='AgentOffice character preview';
  let disposed=false;
  function dispose(){
    if(disposed)return;disposed=true;records.forEach(r=>r.animator.dispose());records.clear();group.removeFromParent();disposeTree(group);
  }
  try{
    for(const entry of plan){
      if(isCancelled())throw Error('Character loading cancelled');
      const url=new URL('characters/'+entry.file,officeURL).href;
      const data=await read(url);
      if(isCancelled())throw Error('Character loading cancelled');
      const {scene:root,animations:clips}=await loader.parseAsync(data,new URL('./',url).href);
      group.add(root);
      if(isCancelled())throw Error('Character loading cancelled');
      if(!CLIPS.every(name=>clips.some(c=>c.name===name)))throw Error('Required character clips missing');
      let skinned=false;root.traverse(o=>{if(o.isSkinnedMesh)skinned=true;if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
      if(!skinned)throw Error('Missing character skeleton');
      const bounds=new THREE.Box3().setFromObject(root,true),height=bounds.max.y-bounds.min.y;
      if(!Number.isFinite(height)||height<.1||height>10)throw Error('Invalid character dimensions');
      const scale=1.66/height;root.scale.multiplyScalar(scale);
      root.position.set(entry.x,-bounds.min.y*scale,entry.z);root.rotation.y=entry.yaw;root.name=entry.role;
      const animator=createAgentAnimator({root,clips,mixer:new THREE.AnimationMixer(root),loopRepeat:THREE.LoopRepeat,loopOnce:THREE.LoopOnce});
      records.set(entry.role,{animator});
    }
    return {group,get count(){return records.size;},setState(role,state){return records.get(role)?.animator.setState(state)??false;},update(dt){records.forEach(r=>r.animator.update(dt));},dispose};
  }catch(error){dispose();throw error;}
}
