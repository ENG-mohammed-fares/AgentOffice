import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {rosterPlan,loadCharacterRoster,CLIPS} from '../src/office-characters.mjs';
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
