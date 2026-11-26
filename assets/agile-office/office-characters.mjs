import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAgentAnimator} from './agent-animation.mjs';
import {seatingPlan,mouseSurfaceTargets,createSeatedMotion,createMeetingQueue,advanceMotionTime} from './office-motion.mjs';
// Compose genuine skeletal tracks: seated pelvis and legs, animated upper body.
/**
 * Combines seated lower-body skeletal tracks with animated upper-body tracks.
 * @param {THREE.AnimationClip[]} clips - Source clips including Sitting and activity clips.
 * @param {object} [THREEImpl] - Three.js implementation used to create clips.
 * @returns {THREE.AnimationClip[]} Derived clips, without mutating source tracks.
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
// the hand or translates the whole avatar to the mouse surface.
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
/**
 * Resolves both arm chains and returns a per-frame reach to the mouse interaction surface.
 * @param {THREE.Object3D} root - Character hierarchy containing Left/RightArm, ForeArm and Hand.
 * @param {{mouse:{x:number,z:number}}} seat - Authored desk seat and mouse centre in world metres.
 * @returns {Function} Updates shoulder/elbow orientation toward paired wrist targets without scaling bones.
 */
export function mouseReach(root,seat){
  const targets=mouseSurfaceTargets(seat.mouse).map(p=>new THREE.Vector3(p.x,.885,p.z));
  const arms=['Left','Right'].map((side,i)=>({upper:root.getObjectByName(side+'Arm'),fore:root.getObjectByName(side+'ForeArm'),hand:root.getObjectByName(side+'Hand'),target:targets[i]}));
  return ()=>{root.updateWorldMatrix(true,true);for(const a of arms)if(a.upper&&a.fore&&a.hand)reachArm(a.upper,a.fore,a.hand,a.target);};
}
export const CLIPS=Object.freeze(['Idle','Walk','Typing','Thinking','Review','Meeting','Talk','Error','Celebrate','Sitting']);
const FIRST_NAMES=Object.freeze({
  'Product Owner':'Luca',
  'Frontend Developer':'Sara',
  'AI Engineer':'Aiko',
  'Backend Developer':'Diego',
  'QA Engineer':'Arjun',
  'DevOps Engineer':'Kwame',
  'Scrum Master':'Freja'
});
/**
 * Resolves a role to its approved first-name-only identity.
 * @param {string} role - Stable role identifier from the character roster.
 * @returns {{firstName:string,role:string}|null} Identity label data, or null for an unsupported role.
 */
export function identityForRole(role){
  const firstName=FIRST_NAMES[role];
  return firstName?{firstName,role}:null;
}
/**
 * Builds a camera-facing identity sprite above the transformed character bounds.
 * @param {string} role - Stable role identifier used for identity lookup.
 * @param {THREE.Object3D} root - Scaled and positioned character root.
 * @param {THREE.Group} group - Owning roster group; owns the resulting sprite.
 * @param {Function} canvasFactory - Creates a 2D canvas or returns null when unavailable.
 * @returns {{sprite:THREE.Sprite,anchor:THREE.Vector3,head:THREE.Bone|null,headOffsetY:number,position:THREE.Vector3}|null} Billboard sprite and reusable head-follow state, or null when canvas rendering is unavailable.
 */
function createIdentitySprite(role,root,group,canvasFactory){
  const identity=identityForRole(role),canvas=canvasFactory();
  if(!identity||!canvas)return null;
  canvas.width=1024;canvas.height=128;
  let context=canvas.getContext('2d');
  if(!context)return null;
  const nameFont='700 52px Inter, Segoe UI, Arial, sans-serif';
  const roleFont='400 42px Inter, Segoe UI, Arial, sans-serif';
  const separatorFont='400 34px Inter, Segoe UI, Arial, sans-serif';
  context.font=nameFont;const nameWidth=context.measureText(identity.firstName).width;
  context.font=separatorFont;const separator='  ·  ',separatorWidth=context.measureText(separator).width;
  context.font=roleFont;const roleWidth=context.measureText(identity.role).width;
  const total=nameWidth+separatorWidth+roleWidth;
  canvas.width=Math.ceil(total+72);canvas.height=128;
  context=canvas.getContext('2d');if(!context)return null;
  context.clearRect(0,0,canvas.width,canvas.height);
  context.beginPath();context.roundRect(8,8,canvas.width-16,112,24);
  context.fillStyle='rgba(13,18,26,.82)';context.fill();
  context.strokeStyle='rgba(230,200,165,.28)';context.lineWidth=2;context.stroke();
  context.textBaseline='middle';context.shadowColor='rgba(0,0,0,.45)';context.shadowBlur=4;
  let x=36;context.font=nameFont;context.fillStyle='#fff4e6';context.fillText(identity.firstName,x,64);x+=nameWidth;
  context.font=separatorFont;context.fillStyle='#d6bfa6';context.fillText(separator,x,65);x+=separatorWidth;
  context.font=roleFont;context.fillStyle='#e7e1d8';context.fillText(identity.role,x,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.name='Identity '+identity.firstName+' · '+identity.role;
  root.updateWorldMatrix(true,true);
  const bounds=new THREE.Box3().setFromObject(root,true),center=new THREE.Vector3();bounds.getCenter(center);
  const worldAnchor=new THREE.Vector3(center.x,bounds.max.y+.18,center.z);
  const localAnchor=root.worldToLocal(worldAnchor.clone());
  const head=root.getObjectByName('Head')||root.getObjectByName('head')||null;
  const headPosition=head?head.getWorldPosition(new THREE.Vector3()):null;
  const headOffsetY=head?Math.max(.12,bounds.max.y-headPosition.y+.12):0;
  sprite.position.copy(worldAnchor);sprite.scale.set(canvas.width*.00245,canvas.height*.00245,1);sprite.renderOrder=3;group.add(sprite);
  return {sprite,anchor:localAnchor,head,headOffsetY,position:new THREE.Vector3()};
}
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
    // This fallback preview transform is replaced by the seated motion controller when movable chairs are available.
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
export async function loadCharacterRoster({roster,stations,officeURL,isCancelled,read=readModel,loader=new GLTFLoader(),onProgress=()=>{},chairs=null,canvasFactory=()=>typeof document!=='undefined'?document.createElement('canvas'):null}){
  const plan=rosterPlan(roster,stations),group=new THREE.Group(),records=new Map();
  group.name='AgentOffice character preview';
  let disposed=false,queue=null,labelCount=0;
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
      const identityLabel=createIdentitySprite(entry.role,root,group,canvasFactory);
      if(identityLabel)labelCount++;
      const animator=createAgentAnimator({root,clips:[...clips,...seatedClips(clips)],mixer:new THREE.AnimationMixer(root),loopRepeat:THREE.LoopRepeat,loopOnce:THREE.LoopOnce,fade:.65});
      const slot=roster.find(r=>r.role===entry.role).station;
      const motion=chairs?createSeatedMotion({plan:seats[slot],position:root.position,rotation:root.rotation,groundY:root.position.y,setPose:state=>animator.setState(state),setChair:(id,offset)=>chairs.get(id)?.position.set(offset.x,0,offset.z)}):null;
      // Evaluate the initial seated pose before attaching to the rendered scene.
      if(motion)animator.update(.1);
      records.set(entry.role,{root,identityLabel,animator,motion,reach:motion?mouseReach(root,seats[slot].desk):null});onProgress('avatar-ready:'+entry.file);
    }
    if(chairs)queue=createMeetingQueue([...records.values()].map(r=>r.motion));
    return {group,get count(){return records.size;},get labels(){return labelCount;},get meetingAvailable(){return Boolean(queue);},get proceduralJoints(){return [...records.values()].reduce((sum,r)=>sum+r.animator.proceduralJointCount,0);},get seated(){return [...records.values()].filter(r=>r.motion?.phase==='seated').length;},get meetingSeated(){return [...records.values()].filter(r=>r.motion?.phase==='seated'&&r.motion.location.startsWith('meeting_')).length;},setMeeting(value){queue?.request(value);},setState(role,state){const r=records.get(role);if(!r)return false;if(r.motion){r.motion.setActivity(state);return true;}return r.animator.setState(state);},update(dt){advanceMotionTime(dt,step=>{queue?.update(step);records.forEach(r=>r.animator.update(step));});records.forEach(r=>{if(r.motion?.atDesk)r.reach?.();if(r.identityLabel){r.root.updateWorldMatrix(true,true);const identity=r.identityLabel;if(identity.head){identity.head.getWorldPosition(identity.position);identity.position.y+=identity.headOffsetY;}else{identity.position.copy(identity.anchor);r.root.localToWorld(identity.position);}identity.sprite.position.copy(identity.position);}});},dispose};
  }catch(error){dispose();throw error;}
}
