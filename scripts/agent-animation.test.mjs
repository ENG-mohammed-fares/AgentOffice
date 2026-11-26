import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAgentAnimator,createRouteFollower,taskActivity} from '../src/agent-animation.mjs';
function fixture(names=['Idle','Walk','Typing','Celebrate']){
  const calls=[],events=new Map(),root={},actions=new Map();
  const mixer={
    clipAction(clip){const action={reset(){calls.push(['reset',clip.name]);return this;},setEffectiveTimeScale(){return this;},setEffectiveWeight(){return this;},setLoop(...args){calls.push(['loop',clip.name,...args]);return this;},play(){calls.push(['play',clip.name]);return this;},stop(){calls.push(['stop',clip.name]);return this;},crossFadeFrom(old,fade,warp){calls.push(['fade',clip.name,old,fade,warp]);return this;}};actions.set(clip.name,action);return action;},
    addEventListener(name,fn){events.set(name,fn);},removeEventListener(name){events.delete(name);},update(dt){calls.push(['update',dt]);},stopAllAction(){calls.push(['stopAll']);},uncacheRoot(r){assert.equal(r,root);calls.push(['uncache']);}
  };
  const clips=names.map(name=>({name,duration:1,tracks:[]}));
  return {root,mixer,clips,calls,events,actions};
}
const options=f=>({root:f.root,mixer:f.mixer,clips:f.clips,loopRepeat:2201,loopOnce:2200});
test('starts Idle, crossfades once, rejects absent clips and returns after one-shot',()=>{
 const f=fixture(),a=createAgentAnimator(options(f));
 assert.equal(a.state,'idle');assert.equal(a.setState('walking'),true);
 assert.equal(a.state,'walking');assert.equal(f.calls.filter(c=>c[0]==='fade').length,1);
 assert.equal(a.setState('walking'),true);assert.equal(f.calls.filter(c=>c[0]==='fade').length,1);
 assert.equal(a.setState('thinking'),false);assert.equal(a.state,'walking');
 assert.equal(a.setState('completed'),true);
 f.events.get('finished')({action:f.actions.get('Walk')});assert.equal(a.state,'completed');
 f.events.get('finished')({action:f.actions.get('Celebrate')});assert.equal(a.state,'idle');
 a.update(10);a.update(-1);assert.deepEqual(f.calls.at(-1),['update',.1]);
 a.dispose();a.dispose();assert.equal(f.events.size,0);assert.equal(f.calls.filter(c=>c[0]==='uncache').length,1);assert.equal(a.setState('working'),false);
});
test('required clips and root-motion constraints fail closed',()=>{
 const f=fixture(['Walk']);assert.throws(()=>createAgentAnimator(options(f)),/Idle/);
 const d=fixture(['Idle','Idle']);assert.throws(()=>createAgentAnimator(options(d)),/duplicate/);
 const r=fixture(['Idle']);r.clips[0].tracks=[{name:'Root.position'}];assert.throws(()=>createAgentAnimator({...options(r),rootTracks:['Root.position']}),/Root translation/);
});
test('route traversal is frame-rate independent and preserves height',()=>{
 function run(dt){const position={x:0,y:4,z:0},angles=[],r=createRouteFollower({position,face:a=>angles.push(a),speed:2});r.setRoute([{x:0,z:0},{x:1,z:0},{x:1,z:1}]);for(let t=0;t<2;t+=dt)r.update(dt);assert.equal(r.moving,false);assert.equal(position.y,4);assert.ok(angles.includes(Math.PI/2));return position;}
 assert.deepEqual(run(.02),run(.05));
});
test('invalid route, pause/stop, and agent task ownership',()=>{
 const p={x:0,z:0};const r=createRouteFollower({position:p,face:()=>{}});
 assert.throws(()=>r.setRoute([{x:NaN,z:0}]),/Invalid route/);
 r.setRoute([{x:3,z:2}]);r.update(0);assert.equal(p.x,0);r.stop();assert.equal(r.moving,false);
 assert.equal(taskActivity([{owner:'QA',status:'In progress'}],'QA'),'working');
 assert.equal(taskActivity([{owner:'QA',status:'Done'}],'QA'),'idle');
 assert.equal(taskActivity([{owner:'QA',status:'In progress'}],'DevOps'),'idle');
});

test('immediate transition stops old action and validates malformed configuration',()=>{
 const f=fixture(),a=createAgentAnimator({...options(f),fade:0});
 assert.equal(a.supports('working'),true);assert.equal(a.supports('unknown'),false);
 assert.equal(a.setState('unknown'),false);assert.equal(a.setState('working'),true);
 assert.deepEqual(f.calls.at(-1),['stop','Idle']);a.dispose();a.update(.1);
 assert.throws(()=>createAgentAnimator({...options(f),fade:2}),/Invalid animation configuration/);
 assert.throws(()=>createAgentAnimator({...options(f),clips:[{name:'Idle',duration:0,tracks:[]}]}),/Invalid or duplicate/);
 assert.throws(()=>createAgentAnimator({...options(f),clips:[{name:'Idle',duration:1}]}),/Invalid animation tracks/);
 assert.throws(()=>createRouteFollower({position:{x:0,z:0},face:()=>{},speed:0}),/Invalid movement/);
 assert.equal(taskActivity(null,'QA'),'idle');
});
