import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seatingPlan,mouseSurfaceTargets,standingPoint,meetingRoute,createSeatedMotion,createMeetingQueue,advanceWalk} from '../src/office-motion.mjs';
const stations=[[-5.95,2.9,0],[-3,2.9,0],[-.05,2.9,0],[-5.95,-.15,0],[-2.35,-.15,0],[.65,-.15,0],[-3.7,-3.22,0]];
function fixture(i=0){
 const plan=seatingPlan(stations)[i],position={},rotation={},chairs=new Map(),poses=[];
 const motion=createSeatedMotion({plan,position,rotation,setPose:p=>poses.push(p),setChair:(id,offset)=>chairs.set(id,offset)});
 return {plan,position,rotation,chairs,poses,motion};
}
const advance=(m,n)=>{for(let i=0;i<n;i++)m.update(.05);};
test('seated agents type, pull the chair, rise before walking, then sit and push it in',()=>{
 const f=fixture(),m=f.motion;assert.equal(m.phase,'seated');m.setActivity('working');assert.equal(f.poses.at(-1),'seatedTyping');
 const initialZ=f.chairs.get('desk_0').z;
 m.requestMeeting(true);advance(m,5);assert.equal(m.phase,'pull');assert.ok(f.chairs.get('desk_0').z>initialZ,'chair must move backward relative to its tucked starting position');assert.equal(f.poses.at(-1),'sitting');
 advance(m,11);assert.equal(m.phase,'rise');assert.equal(f.poses.at(-1),'idle');
 advance(m,20);assert.equal(m.phase,'walk');assert.equal(f.poses.at(-1),'walking');
 advance(m,1000);assert.equal(m.phase,'seated');assert.equal(m.location,'meeting_0');assert.equal(f.poses.at(-1),'seatedMeeting');assert.equal(f.chairs.get('meeting_0').x,0);
 m.requestMeeting(false);advance(m,1500);assert.equal(m.location,'desk_0');assert.equal(m.phase,'seated');assert.equal(f.poses.at(-1),'seatedTyping');
});
test('seven unique seats and doorway route on correct side of the glass',()=>{
 const plans=seatingPlan(stations);assert.equal(new Set(plans.map(p=>p.meeting.id)).size,7);
 for(const p of plans){const route=meetingRoute(p.desk,p.meeting);assert.ok(route.some(q=>q.x===2.08&&q.z===2.25));assert.ok(route.some(q=>q.x===3.48&&q.z===2.25));assert.deepEqual(route.at(-1),standingPoint(p.meeting));}
});
test('all agents prepare and stand concurrently while only one doorway crossing is reserved',()=>{
 const fixtures=stations.map((_,i)=>fixture(i)),records=fixtures.map(f=>f.motion),q=createMeetingQueue(records);q.request(true);
 const started=Array(7).fill(null);let elapsed=0;
 for(let i=0;i<40;i++){q.update(.05);elapsed+=.05;fixtures.forEach((f,index)=>{if(started[index]===null&&f.poses.filter(p=>p==='sitting').length>1)started[index]=elapsed;});}
 assert.ok(started.every(Number.isFinite),'every agent must begin preparation');
 assert.ok(Math.max(...started)-Math.min(...started)<=.30,'preparation should be staggered within 300 ms, not serialized');
 assert.equal(records.filter(r=>r.phase!=='seated').length,7,'all seven agents must begin meeting preparation together');
 assert.ok(records.filter(r=>r.phase==='waiting-travel'||r.phase==='walk').length>=6,'the other agents should be standing while the first travels');
 for(let i=40;i<9000;i++){
  q.update(.05);
  assert.ok(records.filter(r=>r.corridorReserved).length<=1,'only one agent may reserve the doorway at a time');
 }
 assert.ok(records.every(r=>r.location.startsWith('meeting_')&&r.phase==='seated'));
 q.request(false);
 for(let i=0;i<9000;i++){
  q.update(.05);
  assert.ok(records.filter(r=>r.corridorReserved).length<=1,'return travel must also reserve the doorway');
 }
 assert.ok(records.every(r=>r.location.startsWith('desk_')&&r.phase==='seated'));
});

test('destination chair is pulled gradually before stepping into the seat space',()=>{
 const f=fixture(),m=f.motion;m.requestMeeting(true);
 for(let i=0;i<2000&&m.phase!=='prepare-chair';i++)m.update(.05);
 assert.equal(m.phase,'prepare-chair');const initial=f.chairs.get('meeting_0')?.x??0;
 m.update(.05);const first=f.chairs.get('meeting_0').x;assert.ok(first<initial&&first>-.55);
 for(let i=0;i<20&&m.phase==='prepare-chair';i++)m.update(.05);
 assert.equal(m.phase,'approach-seat');assert.ok(Math.abs(f.chairs.get('meeting_0').x+.55)<1e-8);
});

test('both workstation hand targets are on the existing mouse interaction surface',()=>{
 const plan=seatingPlan(stations);
 for(const {desk} of plan){
  const targets=mouseSurfaceTargets(desk.mouse);
  assert.equal(targets.length,2);
  assert.ok(Math.abs(targets[0].z-desk.mouse.z)<1e-9);
  assert.ok(Math.abs(targets[1].z-desk.mouse.z)<1e-9);
  assert.ok(Math.abs((targets[1].x-targets[0].x)-.18)<1e-9);
  assert.ok(targets[0].x<desk.mouse.x&&targets[1].x>desk.mouse.x);
  assert.ok(targets.every(p=>Math.abs(p.x-desk.mouse.x)<=.09+1e-9));
 }
 assert.throws(()=>mouseSurfaceTargets(null),/Invalid mouse surface/);
 assert.throws(()=>mouseSurfaceTargets({x:0,z:0},0),/Invalid mouse surface/);
});
test('keyboard and mouse surface targets follow the authored station heading',()=>{
 const rotated=seatingPlan([[2,3,Math.PI/2]])[0].desk;
 assert.ok(Math.abs(rotated.mouse.x-2.2)<1e-9);
 assert.ok(Math.abs(rotated.mouse.z+3.16)<1e-9);
 assert.ok(Math.abs(rotated.keyboard.x-2.19)<1e-9);
 assert.ok(Math.abs(rotated.keyboard.z+2.81)<1e-9);
});

test('waypoint travel turns in place then accelerates and stops without overshoot',()=>{
 const start={x:0,z:0},target={x:1,z:0},dt=.05;
 let state={position:start,yaw:-Math.PI/2,speed:0};
 for(let i=0;i<100&&!state.walking;i++){
  state=advanceWalk(state.position,state.yaw,target,state.speed,dt);
  if(!state.walking)assert.deepEqual(state.position,start);
 }
 assert.equal(state.walking,true);assert.ok(state.speed>0&&state.speed<=1.6*dt+1e-9);
 let peak=state.speed,braked=false;
 for(let i=0;i<200&&!state.arrived;i++){
  const before=state;state=advanceWalk(state.position,state.yaw,target,state.speed,dt);
  assert.ok(state.position.x>=before.position.x&&state.position.x<=1);
  assert.ok(state.speed<=.78+1e-9);assert.ok(state.speed-before.speed<=1.6*dt+1e-9);
  assert.equal(state.position.z,0);peak=Math.max(peak,state.speed);
  if(!state.arrived&&state.speed<before.speed)braked=true;
 }
 assert.ok(peak>.5);assert.ok(braked);assert.equal(state.arrived,true);
 assert.deepEqual(state.position,target);assert.equal(state.speed,0);
});
test('rear desk route clears the planter proxy in both travel directions',()=>{
 const plan=seatingPlan(stations)[6],route=[standingPoint(plan.desk),...meetingRoute(plan.desk,plan.meeting)];
 const obstacle={x:2.25,z:4.58},radius=.27+.22;
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z;
  const length=dx*dx+dz*dz;
  const f=length?Math.max(0,Math.min(1,((obstacle.x-a.x)*dx+(obstacle.z-a.z)*dz)/length)):0;
  assert.ok(Math.hypot(a.x+f*dx-obstacle.x,a.z+f*dz-obstacle.z)>=radius,
    'segment '+i+' must clear the planter and estimated avatar radius');
 }
 const reverse=route.slice(0,-1).reverse();
 for(let i=1;i<reverse.length;i++){
  const a=reverse[i-1],b=reverse[i],dx=b.x-a.x,dz=b.z-a.z;
  const length=dx*dx+dz*dz;
  const f=length?Math.max(0,Math.min(1,((obstacle.x-a.x)*dx+(obstacle.z-a.z)*dz)/length)):0;
  assert.ok(Math.hypot(a.x+f*dx-obstacle.x,a.z+f*dz-obstacle.z)>=radius,'return segment must clear the planter');
 }
});
test('meeting reversal while walking returns all avatars without seat sharing',()=>{
 const records=stations.map((_,i)=>fixture(i).motion),q=createMeetingQueue(records);
 q.request(true);advance(q,120);q.request(false);
 for(let i=0;i<12000;i++){
  q.update(.05);
  const seated=records.filter(r=>r.phase==='seated').map(r=>r.location);
  assert.equal(new Set(seated).size,seated.length);
 }
 assert.ok(records.every(r=>r.phase==='seated'&&r.location.startsWith('desk_')));
});
