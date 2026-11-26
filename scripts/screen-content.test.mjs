import {test} from 'node:test';
import assert from 'node:assert/strict';
import {screenPlacements} from '../src/screen-content.mjs';

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
