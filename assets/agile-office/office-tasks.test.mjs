import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTaskStore,createActivityDemo} from '../src/office-tasks.mjs';
const roles=['Product Owner','QA Engineer'];
function memory(){const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),values}}
function fixture(options={}){let i=0;return createTaskStore({roles,uuid:()=>String(++i),...options})}
test('validate roles and tasks, notify, update, snapshots are independent',()=>{
  for(const bad of [null,[],[''],['x','x'],[1]])assert.throws(()=>fixture({roles:bad}));
  const db=memory(),s=fixture({storage:db,accountId:'a'});let calls=0;const off=s.subscribe(()=>calls++);
  for(const [title,role] of [[null,roles[0]],[' ',roles[0]],['a'.repeat(161),roles[0]],['x','other']])assert.equal(s.add(title,role),false);
  assert.equal(s.add(' task ',roles[0]),true);assert.equal(s.get()[0].title,'task');
  const copied=s.get();copied[0].title='changed';assert.equal(s.get()[0].title,'task');
  assert.equal(s.update('missing','Done'),false);assert.equal(s.update('1','bad'),false);
  assert.equal(s.update('1','In progress'),true);assert.equal(calls,2);off();assert.equal(s.update('1','Done'),true);assert.equal(calls,2);
  assert.equal(fixture({storage:db,accountId:'a'}).get()[0].status,'Done');
  assert.equal(fixture({storage:db,accountId:'b'}).get().length,0);
  const guest=fixture({storage:db});guest.add('Guest task',roles[0]);assert.equal(fixture({storage:db}).get().length,0);
});
test('storage failures, duplicate and invalid stored entries, limits and recovery',()=>{
  const db=memory(),key='agentoffice:agile-tasks:v1:a';
  db.values.set(key,'{');const s=fixture({storage:db,accountId:'a'});assert.equal(s.storageFailed,true);s.add('Recover',roles[0]);assert.equal(s.storageFailed,false);
  db.values.set(key,JSON.stringify([null,{id:'2',title:'',owner:roles[0],status:'Done'},{id:'3',title:'Keep',owner:roles[0],status:'Done',extra:'discard'},{id:'3',title:'duplicate',owner:roles[0],status:'Done'}]));
  const restored=fixture({storage:db,accountId:'a'});assert.deepEqual(restored.get(),[{id:'3',title:'Keep',owner:roles[0],status:'Done'}]);
  const broken=fixture({accountId:'a',storage:{getItem:()=>null,setItem:()=>{throw Error('quota')}}});broken.add('X',roles[0]);assert.equal(broken.storageFailed,true);
  const noStorage=fixture({accountId:'a'});noStorage.add('X',roles[0]);assert.equal(noStorage.storageFailed,true);
  const repeated=fixture({uuid:()=> 'same'});assert.equal(repeated.add('a',roles[0]),true);assert.equal(repeated.add('b',roles[0]),false);
  assert.equal(fixture({uuid:()=>null}).add('a',roles[0]),false);
  const full=fixture();for(let i=0;i<250;i++)assert.equal(full.add('Task '+i,roles[0]),true);assert.equal(full.add('Overflow',roles[0]),false);
});
test('demo is opt-in, rotates roles, stops and cannot resume after disposal',()=>{
  let callback,clears=0,starts=0;const events=[];
  const demo=createActivityDemo({roles,emit:e=>events.push(e),setTimer:(fn,ms)=>{assert.equal(ms,12000);callback=fn;starts++;return 1},clearTimer:id=>{assert.equal(id,1);clears++}});
  assert.equal(demo.running,false);demo.start();demo.start();assert.equal(starts,1);callback();callback();callback();
  assert.deepEqual(events,[{role:roles[0],activity:'working'},{role:roles[1],activity:'talking'},{role:roles[0],activity:'available'}]);
  demo.stop();callback();assert.equal(events.length,3);assert.equal(demo.running,false);
  demo.start();demo.dispose();callback();demo.start();assert.equal(starts,2);assert.equal(clears,2);assert.equal(events.length,3);
  const empty=createActivityDemo({roles:[],emit:()=>assert.fail('unexpected event'),setTimer:fn=>{fn();callback=fn;return 2},clearTimer:()=>{}});empty.start();callback();empty.dispose();
});
