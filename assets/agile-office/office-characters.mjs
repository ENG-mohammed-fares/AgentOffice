import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAgentAnimator} from './agent-animation.mjs';
import {seatingPlan,createSeatedMotion,createMeetingQueue} from './office-motion.mjs';
// Compose genuine skeletal tracks: seated pelvis and legs, animated upper body.
/**
 * Combines seated lower-body skeletal tracks with animated upper-body tracks.
 * @param {import('three').AnimationClip[]} clips - Source clips including Sitting and activity clips.
 * @param {object} [THREEImpl] - Three.js implementation used to create clips.
 * @returns {import('three').AnimationClip[]} Derived clips, without mutating source tracks.
 */
export function seatedClips(clips,THREEImpl=THREE){
  const sitting=clips.find(c=>c.name==='Sitting');
  if(!sitting)return [];
  const lower=/^(Hips|LeftUpLeg|RightUpLeg|LeftLeg|RightLeg|LeftFoot|RightFoot|LeftToeBase|RightToeBase)\./;
  return [['Typing','SeatedTyping'],['Meeting','SeatedMeeting']].flatMap(([source,name])=>{
    const upper=clips.find(c=>c.name===source);if(!upper)return [];
    const duration=upper.duration;
    const legs=sitting.tracks.filter(t=>lower.test(t.name)).map(t=>{
      const track=t.clone();track.times=Float32Array.from(track.times,time=>time*duration/sitting.duration);return track;
    });
    const tracks=[...upper.tracks.filter(t=>!lower.test(t.name)).map(t=>t.clone()),...legs];
    return [new THREEImpl.AnimationClip(name,duration,tracks)];
  });
}
// Two-bone reach uses real joint lengths and a bend plane, never stretches
// the hand or translates the whole avatar to the keyboard.
/** Rotates a joint toward a world-space target without changing its length. */
function aimBone(bone,child,target){
  const origin=bone.getWorldPosition(new THREE.Vector3());
  const from=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const to=target.clone().sub(origin).normalize();
  if(!from.lengthSq()||!to.lengthSq())return;
  const world=bone.getWorldQuaternion(new THREE.Quaternion());
  const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(new THREE.Quaternion().setFromUnitVectors(from,to).multiply(world)));
  bone.updateWorldMatrix(false,true);
}
/** Solves a two-segment arm reach within the existing joint lengths. */
function reachArm(upper,fore,hand,target){
  const shoulder=upper.getWorldPosition(new THREE.Vector3()),elbow=fore.getWorldPosition(new THREE.Vector3()),wrist=hand.getWorldPosition(new THREE.Vector3());
  const a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist);
  if(a<.01||b<.01)return;
  const direction=target.clone().sub(shoulder);
  const d=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+.001,a+b-.001);
  direction.normalize();
  const along=(a*a+d*d-b*b)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const bend=new THREE.Vector3(0,-1,0).addScaledVector(direction,direction.y);
  if(bend.lengthSq()<1e-6)return;
  const nextElbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend.normalize(),height);
  aimBone(upper,fore,nextElbow);aimBone(fore,hand,shoulder.clone().addScaledVector(direction,d));
}
/** Resolves rig joints once and returns a per-frame keyboard reach callback. */
function keyboardReach(root,seat){
  const arms=['Left','Right'].map((side,i)=>({upper:root.getObjectByName(side+'Arm'),fore:root.getObjectByName(side+'ForeArm'),hand:root.getObjectByName(side+'Hand'),target:new THREE.Vector3(seat.keyboard.x+(i===0?-.105:.105),.885,seat.keyboard.z)}));
  return ()=>{root.updateWorldMatrix(true,true);for(const a of arms)if(a.upper&&a.fore&&a.hand)reachArm(a.upper,a.fore,a.hand,a.target);};
}
export const CLIPS=Object.freeze(['Idle','Walk','Typing','Thinking','Review','Meeting','Talk','Error','Celebrate','Sitting']);
const filePattern=/^[a-z-]+\.glb$/;
/**
 * Validates the seven unique role/file/station assignments and computes preview transforms.
 * @param {object[]} roster - Local GLB filenames and station indices.
 * @param {number[][]} stations - Authored station coordinates and headings.
 * @returns {object[]} Validated roster entries in Three.js world coordinates.
 * @throws {Error} If the roster, paths or station coordinates are invalid.
 */
export function rosterPlan(roster,stations){
  if(!Array.isArray(roster)||roster.length!==7||!Array.isArray(stations)||stations.length!==7)throw Error('Expected seven characters and stations');
  const roles=new Set(),slots=new Set(),files=new Set();
  return roster.map(({role,file,station})=>{
    if(typeof role!=='string'||!role||typeof file!=='string'||!filePattern.test(file)||!Number.isInteger(station)||!stations[station]||roles.has(role)||slots.has(station)||files.has(file))throw Error('Invalid character roster');
    roles.add(role);slots.add(station);files.add(file);
    if(!Array.isArray(stations[station])||stations[station].length!==3)throw Error('Invalid character station');
    const [x,y,a]=stations[station];
    if(![x,y,a].every(Number.isFinite))throw Error('Invalid character station');
    // Preview stands behind the chair, rather than claiming validated seating/IK.
    const offset=1.60;
    return {role,file,x:x+Math.sin(a)*offset,z:-y+Math.cos(a)*offset,yaw:Math.PI-a};
  });
}
/** Disposes unique avatar-owned GPU resources after detaching the roster. */
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
/** Loads a GLB via bounded XHR, including packaged Electron file URLs. */
function readModel(url){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('GET',url,true);xhr.responseType='arraybuffer';xhr.timeout=20000;
    xhr.onload=()=>{if((xhr.status===0||xhr.status===200)&&xhr.response?.byteLength>20)resolve(xhr.response);else reject(Error('Character asset unavailable'));};
    xhr.onerror=xhr.ontimeout=()=>reject(Error('Character asset unavailable'));xhr.send();
  });
}
/**
 * Loads and validates all seven local avatars as an all-or-nothing roster.
 * @param {object} options - Roster, office URL, cancellation/progress callbacks,
 * injectable loader and optional movable-chair map.
 * @returns {Promise<object>} Owned roster with animation, motion and disposal methods.
 * @throws {Error} On cancellation, missing clips, invalid rigs or failed asset loading.
 * Partial resources are disposed on failure; callers must dispose a successful roster.
 */
export async function loadCharacterRoster({roster,stations,officeURL,isCancelled,read=readModel,loader=new GLTFLoader(),onProgress=()=>{},chairs=null}){
  const plan=rosterPlan(roster,stations),group=new THREE.Group(),records=new Map();
  group.name='AgentOffice character preview';
  let disposed=false,queue=null;
  const seats=seatingPlan(stations);
  function dispose(){
    if(disposed)return;disposed=true;records.forEach(r=>r.animator.dispose());records.clear();group.removeFromParent();disposeTree(group);
  }
  try{
    for(const entry of plan){
      if(isCancelled())throw Error('Character loading cancelled');
      const url=new URL('characters/'+entry.file,officeURL).href;
      onProgress('avatar-load:'+entry.file);
      const data=await read(url);
      if(isCancelled())throw Error('Character loading cancelled');
      const {scene:root,animations:clips}=await loader.parseAsync(data,new URL('./',url).href);
      group.add(root);
      onProgress('avatar-decoded:'+entry.file);
      if(isCancelled())throw Error('Character loading cancelled');
      if(!CLIPS.every(name=>clips.some(c=>c.name===name)))throw Error('Required character clips missing');
      let skinned=false;root.traverse(o=>{if(o.isSkinnedMesh)skinned=true;if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
      if(!skinned)throw Error('Missing character skeleton');
      const bounds=new THREE.Box3().setFromObject(root,true),height=bounds.max.y-bounds.min.y;
      if(!Number.isFinite(height)||height<.1||height>10)throw Error('Invalid character dimensions');
      const scale=1.66/height;root.scale.multiplyScalar(scale);
      root.position.set(entry.x,-bounds.min.y*scale,entry.z);root.rotation.y=entry.yaw;root.name=entry.role;
      const animator=createAgentAnimator({root,clips:[...clips,...seatedClips(clips)],mixer:new THREE.AnimationMixer(root),loopRepeat:THREE.LoopRepeat,loopOnce:THREE.LoopOnce,fade:.65});
      const slot=roster.find(r=>r.role===entry.role).station;
      const motion=chairs?createSeatedMotion({plan:seats[slot],position:root.position,rotation:root.rotation,groundY:root.position.y,setPose:state=>animator.setState(state),setChair:(id,offset)=>chairs.get(id)?.position.set(offset.x,0,offset.z)}):null;
      // Evaluate the initial seated pose before attaching to the rendered scene.
      if(motion)animator.update(.1);
      records.set(entry.role,{animator,motion,reach:motion?keyboardReach(root,seats[slot].desk):null});onProgress('avatar-ready:'+entry.file);
    }
    if(chairs)queue=createMeetingQueue([...records.values()].map(r=>r.motion));
    return {group,get count(){return records.size;},get seated(){return [...records.values()].filter(r=>r.motion?.phase==='seated').length;},get meetingSeated(){return [...records.values()].filter(r=>r.motion?.phase==='seated'&&r.motion.location.startsWith('meeting_')).length;},setMeeting(value){queue?.request(value);},setState(role,state){const r=records.get(role);if(!r)return false;if(r.motion){r.motion.setActivity(state);return true;}return r.animator.setState(state);},update(dt){queue?.update(dt);records.forEach(r=>{r.animator.update(dt);if(r.motion?.typing)r.reach?.();});},dispose};
  }catch(error){dispose();throw error;}
}
