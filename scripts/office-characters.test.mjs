import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {rosterPlan,loadCharacterRoster,CLIPS,seatedClips,identityForRole,mouseReach} from '../src/office-characters.mjs';
const roster=Array.from({length:7},(_,i)=>({role:'Role '+i,file:'character-'+String.fromCharCode(97+i)+'.glb',station:i}));
const stations=Array.from({length:7},(_,i)=>[i*3,2,0]);
test('roster requires distinct roles, filenames and stations, with contained local asset paths',()=>{
 const plan=rosterPlan(roster,stations);assert.equal(plan.length,7);assert.ok(Math.abs(plan[0].z+.4)<1e-9);
 for(const invalid of [{file:'../escape.glb'},{file:'https://example.com/file.glb'},{station:1},{role:roster[1].role},{file:roster[1].file}]){
  assert.throws(()=>rosterPlan([{...roster[0],...invalid},...roster.slice(1)],stations),/Invalid character roster/);
 }
 assert.throws(()=>rosterPlan(roster.slice(1),stations),/Expected seven/);
});
function fixture({missing=false,skinned=true}={}){
 let disposed=0,loaded=0;
 const read=async url=>{assert.ok(url.startsWith('https://example.test/office/characters/'));return new ArrayBuffer(32)};
 const loader={async parseAsync(){loaded++;const scene=new THREE.Group(),geometry=new THREE.BoxGeometry(.4,1.7,.4);geometry.addEventListener('dispose',()=>disposed++);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.isSkinnedMesh=skinned;scene.add(mesh);
 const animations=(missing?['Idle']:CLIPS).map(name=>new THREE.AnimationClip(name,1,[]));return {scene,animations}}};
 return {read,loader,get loaded(){return loaded},get disposed(){return disposed}};
}
const base={roster,stations,officeURL:'https://example.test/office/office.glb',isCancelled:()=>false};
test('all seven character groups load; task animations and cleanup are isolated',async()=>{
 const f=fixture();const layer=await loadCharacterRoster({...base,read:f.read,loader:f.loader});
 assert.equal(f.loaded,7);assert.equal(layer.count,7);assert.equal(layer.group.children.length,7);
 assert.ok(layer.setState('Role 0','working'));assert.equal(layer.setState('unknown','working'),false);
 layer.update(.05);layer.dispose();layer.dispose();assert.equal(layer.count,0);assert.equal(f.disposed,7);
});
test('missing clips, missing rig and cancellation clean up without partial characters',async()=>{
 for(const options of [{missing:true},{skinned:false}]){
  const f=fixture(options);await assert.rejects(loadCharacterRoster({...base,read:f.read,loader:f.loader}),/Required character clips missing|Missing character skeleton/);assert.equal(f.disposed,1);
 }
 const f=fixture();await assert.rejects(loadCharacterRoster({...base,read:f.read,loader:f.loader,isCancelled:()=>true}),/cancelled/);assert.equal(f.loaded,0);
});

test('invalid station data and cancellation after decoding are rejected safely',async()=>{
 assert.throws(()=>rosterPlan(roster,null),/Expected seven/);
 assert.throws(()=>rosterPlan(roster,[['bad',2,0],...stations.slice(1)]),/Invalid character station/);
 assert.throws(()=>rosterPlan(roster,[{},...stations.slice(1)]),/Invalid character station/);
 assert.throws(()=>rosterPlan([{...roster[0],file:{toString:()=>roster[0].file}},...roster.slice(1)],stations),/Invalid character roster/);
 const f=fixture();
 await assert.rejects(loadCharacterRoster({...base,read:f.read,loader:f.loader,isCancelled:()=>f.loaded>0}),/cancelled/);
 assert.equal(f.disposed,1);
});
test('asset read failure leaves no partially attached roster',async()=>{
 const f=fixture();let reads=0;
 await assert.rejects(loadCharacterRoster({...base,loader:f.loader,read:async url=>{if(++reads===2)throw Error('read failure');return f.read(url)}}),/read failure/);
 assert.equal(f.disposed,1);
});

test('seated clips preserve hip and leg tracks while using actual animated upper-body tracks',()=>{
 const track=(name,y)=>new THREE.VectorKeyframeTrack(name,[0,1],[0,y,0,0,y,0]);
 const sitting=new THREE.AnimationClip('Sitting',1,[track('Hips.position',.55),track('LeftLeg.position',.4),track('LeftHand.position',.7)]);
 const typing=new THREE.AnimationClip('Typing',2,[track('Hips.position',.9),track('LeftHand.position',.88)]);
 const meeting=new THREE.AnimationClip('Meeting',2,[track('RightHand.position',.8)]);
 const [a,b]=seatedClips([sitting,typing,meeting]);
 assert.equal(a.duration,2);assert.equal(a.tracks.find(t=>t.name==='Hips.position').values[1],Math.fround(.55));
 assert.equal(a.tracks.find(t=>t.name==='Hips.position').times[1],2);
 assert.equal(a.tracks.find(t=>t.name==='LeftHand.position').values[1],Math.fround(.88));
 assert.ok(b.tracks.some(t=>t.name==='RightHand.position'));assert.equal(sitting.tracks[0].times[1],1);
});

test('role identities use first names only and render bold names beside regular role titles',async()=>{
 const expected=[['Product Owner','Luca'],['Frontend Developer','Sara'],['AI Engineer','Aiko'],['Backend Developer','Diego'],['QA Engineer','Arjun'],['DevOps Engineer','Kwame'],['Scrum Master','Freja']];
 assert.deepEqual(expected.map(([role])=>identityForRole(role)?.firstName),expected.map(([,name])=>name));
 assert.equal(identityForRole('Unknown'),null);
 const f=fixture(),drawn=[];
 const canvasFactory=()=>({
  width:0,height:0,
  getContext(){return {
   font:'',measureText(value){return {width:value.length*18};},
   clearRect(){},beginPath(){},roundRect(){},fill(){},stroke(){},
   fillText(value){drawn.push({value,font:this.font});}
  }}
 });
 const layer=await loadCharacterRoster({...base,read:f.read,loader:f.loader,canvasFactory});
 assert.equal(layer.labels,7);assert.equal(layer.group.children.length,14);
 assert.equal(layer.meetingAvailable,false,'meeting demo requires the complete movable-chair map');
 const root=layer.group.children.find(x=>x.name==='Product Owner');
 const label=layer.group.children.find(x=>x.name==='Identity Luca · Product Owner');
 assert.ok(root&&label,'each character has a role identity sprite');
 const before=label.position.clone();root.position.x+=1;layer.update(.05);
 assert.ok(Math.abs(label.position.x-before.x-1)<1e-6,'identity sprite follows its avatar root');
 const head=root.getObjectByName('Head')||root.getObjectByName('head');
 if(head){const headBefore=label.position.y;head.position.y+=.1;layer.update(.05);assert.ok(label.position.y>headBefore+.05,'identity sprite follows head animation while standing or walking');}
 assert.ok(drawn.some(x=>x.value==='  ·  '&&x.font.startsWith('400 ')),'separator must be a regular-weight middle dot');
 for(const [role,name] of expected){
  assert.ok(drawn.some(x=>x.value===name&&x.font.startsWith('700 ')),role+' first name must be bold');
  assert.ok(drawn.some(x=>x.value===role&&x.font.startsWith('400 ')),role+' title must be regular');
 }
 layer.dispose();
});
test('both arms reach separate positions on the same mouse interaction surface',()=>{
 const root=new THREE.Group();
 function arm(side,shoulderX,foreX,handX){
  const upper=new THREE.Bone();upper.name=side+'Arm';upper.position.set(shoulderX,1.3,0);root.add(upper);
  const fore=new THREE.Bone();fore.name=side+'ForeArm';fore.position.set(foreX,-.25,0);upper.add(fore);
  const hand=new THREE.Bone();hand.name=side+'Hand';hand.position.set(handX,-.2,0);fore.add(hand);
  return hand;
 }
 const left=arm('Left',-.25,.25,.2),right=arm('Right',.57,-.25,-.2);
 root.updateWorldMatrix(true,true);
 const reach=mouseReach(root,{mouse:{x:.16,z:0}});
 reach();
 const leftTarget=new THREE.Vector3(.07,.885,0),rightTarget=new THREE.Vector3(.25,.885,0);
 assert.ok(left.getWorldPosition(new THREE.Vector3()).distanceTo(leftTarget)<.2);
 assert.ok(right.getWorldPosition(new THREE.Vector3()).distanceTo(rightTarget)<.2);
});
