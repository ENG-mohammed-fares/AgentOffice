import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountTaskPanel} from '../src/office-task-panel.mjs';

// Minimal DOM contract fixture; Electron smoke remains the real browser check.
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.value='';this.textContent='';this.hidden=false;this.focused=false}
  append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value)this.value=this.children[0]?.value||''}
  replaceChildren(...nodes){this.children=nodes.flatMap(n=>n.tag==='fragment'?n.children:[n])}
  setAttribute(key,value){this.attributes[key]=value}
  focus(){this.focused=true}
}
function fixture({user={id:'account'},getStorage}={}){
  const ids=['office-tasks','office-tasks-toggle','office-task-form','office-task-title','office-task-owner','office-task-list','office-task-feedback','office-demo-toggle','office-demo-activity','office-task-close'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element(id==='office-task-owner'?'select':id)]));
  const el=name=>nodes['office-'+name];
  el('tasks').hidden=true;
  const db=new Map();let tick,cleared=0;
  const stage={querySelector:key=>nodes[key.slice(1)],ownerDocument:{createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment')}};
  const dispose=mountTaskPanel(stage,user,{roles:['QA Engineer','Product Owner'],getStorage:getStorage??(()=>({getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)})),setTimer:fn=>{tick=fn;return 42},clearTimer:id=>{assert.equal(id,42);cleared++}});
  const submit=()=>{let prevented=false;el('task-form').onsubmit({preventDefault:()=>{prevented=true}});assert.equal(prevented,true)};
  return {el,submit,db,dispose,tick:()=>tick(),cleared:()=>cleared};
}
test('task panel opens, validates, saves, renders literal text, updates, and tears down',()=>{
  const f=fixture(),{el}=f;
  assert.equal(el('task-owner').children.length,2);
  el('tasks-toggle').onclick();assert.equal(el('tasks').hidden,false);assert.equal(el('task-title').focused,true);
  el('tasks-toggle').onclick();assert.equal(el('tasks').hidden,true);
  f.submit();assert.match(el('task-feedback').textContent,/Enter a valid task/);
  el('task-title').value='<b>QA</b>';f.submit();
  assert.equal(el('task-title').value,'');assert.equal(el('task-feedback').textContent,'Task added.');
  const row=el('task-list').children[0],select=row.children[1];
  assert.equal(row.children[0].textContent,'<b>QA</b> · QA Engineer');
  assert.equal(select.children.length,3);select.value='Done';select.onchange();
  assert.equal(el('task-list').children[0].children[1].value,'Done');
  assert.equal(JSON.parse(f.db.get('agentoffice:agile-tasks:v1:account'))[0].status,'Done');
  el('task-close').onclick();assert.equal(el('tasks').hidden,true);assert.equal(el('tasks-toggle').focused,true);
  el('demo-toggle').onclick();assert.equal(el('demo-toggle').attributes['aria-pressed'],'true');
  f.tick();assert.match(el('demo-activity').textContent,/QA Engineer.*working/);
  el('demo-toggle').onclick();assert.equal(el('demo-activity').textContent,'Demo paused.');
  el('demo-toggle').onclick();f.dispose();assert.equal(f.cleared(),2);
  assert.equal(el('tasks-toggle').onclick,null);assert.equal(el('task-form').onsubmit,null);assert.equal(el('task-list').children.length,0);
});
test('storage denial is visible, task status remains usable, guest does not persist',()=>{
  const f=fixture({getStorage:()=>{throw Error('denied')}}),{el}=f;
  el('task-title').value='A';f.submit();assert.match(el('task-feedback').textContent,/Could not save/);
  const select=el('task-list').children[0].children[1];select.value='Done';select.onchange();
  assert.match(el('task-feedback').textContent,/Could not save/);f.dispose();
  const guest=fixture({user:{guest:true,id:'ignored'}});
  guest.el('task-title').value='Guest';guest.submit();assert.equal(guest.db.size,0);guest.dispose();
});
