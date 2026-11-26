import {createTaskStore,createActivityDemo,STATUSES} from './office-tasks.mjs';
export function mountTaskPanel(stage,user,{roles,getStorage=()=>globalThis.localStorage,setTimer,clearTimer,onActivity=()=>{}}){
  const document=stage.ownerDocument;
  const $=id=>stage.querySelector('#'+id);
  const panel=$('office-tasks'),toggle=$('office-tasks-toggle'),form=$('office-task-form'),title=$('office-task-title'),owner=$('office-task-owner'),list=$('office-task-list'),feedback=$('office-task-feedback'),demoButton=$('office-demo-toggle'),activity=$('office-demo-activity');
  let storage;
  try{storage=getStorage()}catch{storage=undefined}
  // Missing identity and guests are session-only; never share a persistent guest bucket.
  const store=createTaskStore({roles,accountId:user?.guest?null:user?.id,storage});
  const option=(value,label=value)=>{const el=document.createElement('option');el.value=value;el.textContent=label;return el};
  for(const role of roles)owner.append(option(role));
  const demo=createActivityDemo({roles,setTimer,clearTimer,emit:({role,activity:state})=>{activity.textContent='Demo: '+role+' · '+state;onActivity(role,state==='available'?'idle':state)}});
  function render(){
    const tasks=store.get();
    for(const role of roles)onActivity(role,tasks.some(t=>t.owner===role&&t.status==='In progress')?'working':'idle');
    const fragment=document.createDocumentFragment();
    for(const task of tasks){
      const row=document.createElement('li'),text=document.createElement('span'),select=document.createElement('select');
      text.textContent=task.title+' · '+task.owner;
      select.setAttribute('aria-label','Status: '+task.title);
      for(const status of STATUSES)select.append(option(status));
      select.value=task.status;
      select.onchange=()=>{store.update(task.id,select.value);if(store.storageFailed)feedback.textContent='Could not save locally.'};
      row.append(text,select);fragment.append(row);
    }
    list.replaceChildren(fragment);
    if(store.storageFailed)feedback.textContent='Could not load or save local tasks.';
  }
  const off=store.subscribe(render);
  toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)title.focus()};
  $('office-task-close').onclick=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus()};
  form.onsubmit=event=>{event.preventDefault();if(!store.add(title.value,owner.value)){feedback.textContent='Enter a valid task (1–160 characters; up to 250 tasks).';return}title.value='';feedback.textContent=store.storageFailed?'Could not save locally.':'Task added.';title.focus()};
  demoButton.onclick=()=>{if(demo.running){demo.stop();render();}else demo.start();demoButton.setAttribute('aria-pressed',String(demo.running));demoButton.textContent=demo.running?'Pause demo':'Start demo';activity.textContent=demo.running?'Demo running — agents are not connected.':'Demo paused.'};
  render();
  return()=>{demo.dispose();off();toggle.onclick=null;$('office-task-close').onclick=null;form.onsubmit=null;demoButton.onclick=null;list.replaceChildren()};
}

 
/**
 * Binds four independent camera presets and an explicit, reversible meeting simulation.
 * @param {object} stage - Workspace element containing camera and meeting controls.
 * @param {object} callbacks - onView(index) navigates; onMeeting(boolean) requests motion.
 * @returns {object} Availability and lifecycle methods for the mounted workspace.
 */
export function mountOfficeControls(stage,{onView,onMeeting}){
  const el=id=>stage.querySelector('#'+id);
  const cameraButtons=[['office-workspace',0],['office-overview',1],['office-team',2],['office-meeting',3]];
  const demo=el('office-meeting-demo'),status=el('office-meeting-demo-status');
  let available=false,active=false,disposed=false;
  function renderMeeting(){
    demo.disabled=!available||disposed;
    demo.setAttribute('aria-pressed',String(active));
    demo.textContent=active?'End meeting demo':'Start meeting demo';
    status.textContent=!available?'Live 3D character preview required. No real meeting is connected.':
      active?'Meeting simulation running. No real meeting is connected.':'Meeting simulation idle. No real meeting is connected.';
  }
  function reset(){
    if(active){active=false;onMeeting(false);}
    renderMeeting();
  }
  for(const [id,index] of cameraButtons){
    const button=el(id);
    button.onclick=()=>{if(!disposed)onView(index);};
  }
  demo.onclick=()=>{
    if(!available||disposed)return;
    active=!active;onMeeting(active);renderMeeting();
  };
  renderMeeting();
  return {
    setAvailable(value){if(disposed)return;available=Boolean(value);if(!available)reset();else renderMeeting();},
    dispose(){if(disposed)return;disposed=true;available=false;reset();for(const [id] of cameraButtons)el(id).onclick=null;demo.onclick=null;}
  };
}
