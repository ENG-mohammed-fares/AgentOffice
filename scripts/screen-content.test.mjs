import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {screenPlacements,createRoleScreens} from '../src/screen-content.mjs';

const stations=[[-5.95,2.9,0],[-3,2.9,0],[-.05,2.9,0],[-5.95,-.15,0],[-2.35,-.15,0],[.65,-.15,0],[-3.7,-3.22,0]];
const screens=[
 {role:'Product Owner',station:0,monitors:[{x:-.15,y:.12,width:.76,variant:'roadmap'}]},
 {role:'Frontend Developer',station:1,monitors:[{x:-.31,y:.13,width:.58,variant:'code'},{x:.31,y:.13,width:.58,variant:'preview'}]},
 {role:'AI Engineer',station:2,monitors:[{x:-.31,y:.13,width:.58,variant:'workflow'},{x:.31,y:.13,width:.58,variant:'evaluation'}]},
 {role:'Backend Developer',station:3,monitors:[{x:-.47,y:.14,width:.44,variant:'api'},{x:0,y:.14,width:.44,variant:'database'},{x:.47,y:.14,width:.44,variant:'logs'}]},
 {role:'QA Engineer',station:4,monitors:[{x:-.31,y:.13,width:.58,variant:'tests'},{x:.31,y:.13,width:.58,variant:'bugs'}]},
 {role:'DevOps Engineer',station:5,monitors:[{x:-.31,y:.13,width:.58,variant:'pipeline'},{x:.31,y:.13,width:.58,variant:'terminal'}]},
 {role:'Scrum Master',station:6,monitors:[{x:-.15,y:.12,width:.76,variant:'board'}]}
];
test('screen layouts provide unique role-specific monitor content for every station',()=>{
 const placements=screenPlacements(screens,stations);
 assert.equal(placements.length,13);
 assert.throws(()=>screenPlacements(screens.slice(1),stations),/Exactly seven role layouts/);
 assert.throws(()=>screenPlacements(screens,stations.slice(1)),/Exactly seven role layouts/);
 assert.equal(new Set(placements.map(x=>x.role)).size,7);
 assert.equal(new Set(placements.map(x=>x.role+':'+x.variant)).size,13);
 assert.ok(placements.every(x=>x.width>0&&x.height>0&&x.position.every(Number.isFinite)));
 assert.equal(placements.find(x=>x.role==='Backend Developer'&&x.variant==='database').monitorCount,3);
 assert.equal(placements.find(x=>x.role==='AI Engineer'&&x.variant==='evaluation').monitorIndex,1);
});
test('screen layout rejects duplicate roles, stations and monitor variants',()=>{
 assert.throws(()=>screenPlacements([...screens,{...screens[0],station:1}],stations),/Invalid role screen layout/);
 const bad=screens.map(x=>({...x,monitors:x.monitors.map(y=>({...y}))}));
 bad[1].monitors[1].variant='code';
 assert.throws(()=>screenPlacements(bad,stations),/Invalid or duplicate role monitor variant/);
});

function recordingCanvasFactory(){
 const contexts=[];
 const canvasFactory=()=>({
  width:0,height:0,
  getContext(type){
   assert.equal(type,'2d');
   const calls=[];
   const ctx=new Proxy({calls},{get(target,key){if(key in target)return target[key];return (...args)=>target.calls.push([String(key),...args]);},set(target,key,value){target[key]=value;return true;}});
   contexts.push(ctx);return ctx;
  }
 });
 return {canvasFactory,contexts};
}
test('all thirteen workstation screens render distinct role content with a visible simulation marker',()=>{
 const {canvasFactory,contexts}=recordingCanvasFactory();
 const result=createRoleScreens({screens,stations,THREEImpl:THREE,canvasFactory});
 assert.equal(result.count,13);
 assert.equal(result.group.children.length,13);
 assert.ok(result.group.children.every(mesh=>mesh.isMesh&&mesh.material.map?.isCanvasTexture));
 assert.ok(contexts.every(ctx=>ctx.calls.some(call=>call[0]==='fillText'&&call[1]==='SIMULATION')));
 assert.ok(contexts.every(ctx=>ctx.calls.some(call=>call[0]==='fillText')));
 for(const mesh of result.group.children){mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();}
});
test('role screen construction disposes partial resources when a canvas context is unavailable',()=>{
 let calls=0;
 const canvasFactory=()=>({width:0,height:0,getContext(){calls++;return calls===1?recordingCanvasFactory().canvasFactory().getContext('2d'):null;}});
 assert.throws(()=>createRoleScreens({screens,stations,THREEImpl:THREE,canvasFactory}),/2D canvas context unavailable/);
});
