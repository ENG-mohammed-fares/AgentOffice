import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seatingPlan,standingPoint,meetingRoute,createSeatedMotion,createMeetingQueue} from '../src/office-motion.mjs';
const stations=[[-5.95,2.9,0],[-3,2.9,0],[-.05,2.9,0],[-5.95,-.15,0],[-2.35,-.15,0],[.65,-.15,0],[-3.7,-3.22,0]];
function fixture(i=0){
 const plan=seatingPlan(stations)[i],position={},rotation={},chairs=new Map(),poses=[];
 const motion=createSeatedMotion({plan,position,rotation,setPose:p=>poses.push(p),setChair:(id,offset)=>chairs.set(id,offset)});
 return {plan,position,rotation,chairs,poses,motion};
}
const advance=(m,n)=>{for(let i=0;i<n;i++)m.update(.05);};
test('seated agents type, pull the chair, rise before walking, then sit and push it in',()=>{
 const f=fixture(),m=f.motion;assert.equal(m.phase,'seated');m.setActivity('working');assert.equal(f.poses.at(-1),'seatedTyping');
 m.requestMeeting(true);advance(m,5);assert.equal(m.phase,'pull');assert.ok(f.chairs.get('desk_0').z>0);assert.equal(f.poses.at(-1),'sitting');
 advance(m,11);assert.equal(m.phase,'rise');assert.equal(f.poses.at(-1),'idle');
 advance(m,20);assert.equal(m.phase,'walk');assert.equal(f.poses.at(-1),'walking');
 advance(m,1000);assert.equal(m.phase,'seated');assert.equal(m.location,'meeting_0');assert.equal(f.poses.at(-1),'seatedMeeting');assert.equal(f.chairs.get('meeting_0').x,0);
 m.requestMeeting(false);advance(m,1500);assert.equal(m.location,'desk_0');assert.equal(m.phase,'seated');assert.equal(f.poses.at(-1),'seatedTyping');
});
test('seven unique seats and doorway route on correct side of the glass',()=>{
 const plans=seatingPlan(stations);assert.equal(new Set(plans.map(p=>p.meeting.id)).size,7);
 for(const p of plans){const route=meetingRoute(p.desk,p.meeting);assert.ok(route.some(q=>q.x===2.08&&q.z===2.25));assert.ok(route.some(q=>q.x===3.48&&q.z===2.25));assert.deepEqual(route.at(-1),standingPoint(p.meeting));}
});
test('meeting queue serializes travel and returns every agent',()=>{
 const records=stations.map((_,i)=>fixture(i).motion),q=createMeetingQueue(records);q.request(true);
 for(let i=0;i<9000;i++){q.update(.05);assert.ok(records.filter(r=>r.phase!=='seated').length<=1);}
 assert.ok(records.every(r=>r.location.startsWith('meeting_')&&r.phase==='seated'));
 q.request(false);for(let i=0;i<9000;i++)q.update(.05);
 assert.ok(records.every(r=>r.location.startsWith('desk_')&&r.phase==='seated'));
});
