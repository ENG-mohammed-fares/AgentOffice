import './style.css';
import './agile-office.css';
import {mountAuth} from './auth.js';
import {mountLoadingIntro} from './loading-intro.js';
import {mountTaskPanel,mountOfficeControls} from './office-task-panel.mjs';
import layout from './agile-layout.json';

const desktop=window.agentOfficeDesktop;
const url=name=>new URL('./office/'+name,document.baseURI).href;
const views=['Desk View','Overview','Team View','Meeting Room'];

function mountWorkspace(user){
  const app=document.querySelector('#app');
  const stage=document.createElement('main');
  stage.id='agile-office';
  stage.className='agile-office';
  stage.innerHTML='<img id="office-poster" alt="Architectural render of the office"><div id="office-live" aria-label="Interactive office"></div><header class="office-header"><span class="office-brand"><img src="./icon.png" alt="">AgentOffice</span><div class="office-account"><span id="office-user"></span><button id="office-tasks-toggle" type="button" aria-controls="office-tasks" aria-expanded="false">Tasks</button><label class="office-graphics-label">Graphics <select id="office-graphics"><option value="balanced">Balanced</option><option value="high">High</option><option value="performance">Performance</option></select></label><button id="office-diagnostics-toggle" type="button" aria-controls="office-diagnostics" aria-expanded="false">Diagnostics</button><button id="check-update" type="button" aria-label="Check for updates" title="Check for updates">Updates</button><button id="sign-out" type="button">Sign out</button></div></header><footer class="office-footer"><div><span class="office-kicker">AGENTOFFICE / 01</span><h1 id="office-title">Desk View</h1><div class="office-nav" aria-label="Office camera views"><button id="office-workspace" type="button" aria-pressed="true">Desk View</button><button id="office-overview" type="button" aria-pressed="false">Overview</button><button id="office-team" type="button" aria-pressed="false">Team View</button><button id="office-meeting" type="button" aria-pressed="false">Meeting Room</button></div></div><span id="office-status" role="status">Preparing interactive office...</span></footer><aside id="office-tasks" aria-label="Sprint tasks" hidden><div class="office-task-heading"><h2>Sprint tasks</h2><button id="office-task-close" type="button" aria-label="Close tasks">Close</button></div><form id="office-task-form"><label for="office-task-title">Task title</label><input id="office-task-title" required maxlength="160" autocomplete="off"><label for="office-task-owner">Role</label><select id="office-task-owner"></select><button type="submit">Add task</button></form><p id="office-task-feedback" role="status"></p><ul id="office-task-list"></ul><h3>Demo activity</h3><button id="office-demo-toggle" type="button" aria-pressed="false">Start demo</button><p id="office-demo-activity" role="status">Demo paused. AI agents are not connected.</p><h3>Meeting simulation</h3><button id="office-meeting-demo" type="button" aria-pressed="false" disabled>Start meeting demo</button><p id="office-meeting-demo-status" role="status">Live 3D character preview required. No real meeting is connected.</p></aside><aside id="office-diagnostics" aria-label="Rendering diagnostics" hidden><h2>Rendering diagnostics</h2><pre id="office-metrics"></pre><button id="office-metrics-refresh" type="button">Refresh</button></aside><div id="office-update" role="status" hidden><span></span><button id="install-update" type="button" hidden>Restart and install</button><button id="dismiss-update" type="button">Dismiss</button></div><div id="office-loading" aria-live="polite" aria-busy="true"><div class="office-loading-card"><span class="office-loading-spinner" aria-hidden="true"></span><strong id="office-loading-title">Preparing your workspace</strong><p id="office-loading-message">Loading office, characters, and scene.</p><button id="office-loading-continue" type="button" hidden>Continue with preview</button></div></div>';
  const el=id=>stage.querySelector('#'+id);
  const poster=el('office-poster'), live=el('office-live'), status=el('office-status');
  const loading=el('office-loading'),loadingTitle=el('office-loading-title'),loadingMessage=el('office-loading-message'),continueButton=el('office-loading-continue');
  const progressMessage=event=>{
    if(event==='office-asset-load')return 'Loading office geometry and materials.';
    if(event==='office-asset-decoded')return 'Preparing office geometry and lighting.';
    if(event==='office-shader-compile')return 'Preparing the graphics pipeline.';
    if(event==='office-shader-compiled'||event==='office-first-render')return 'Rendering the first office frame.';
    if(event==='office-first-render-complete')return 'Loading the seven character models.';
    if(event.startsWith('avatar-load:'))return 'Loading the seven character models.';
    if(event.startsWith('avatar-decoded:')||event.startsWith('avatar-ready:'))return 'Preparing character skeletons and animations.';
    if(event==='avatar-shader-compile')return 'Preparing character shaders.';
    if(event==='avatar-shader-compiled'||event==='avatar-roster-attached')return 'Rendering the characters.';
    if(event==='avatar-first-render')return 'Rendering the first usable character frame.';
    if(event==='avatar-first-render-complete')return 'Workspace ready.';
    return 'Preparing your workspace.';
  };
  const updateLoading=event=>{loadingMessage.textContent=progressMessage(String(event));};
  const finishLoading=()=>{stage.dataset.officeReady='true';loading.setAttribute('aria-busy','false');loading.setAttribute('aria-hidden','true');};
  const showLoadingError=(message,label,fallbackStatus)=>{
    loadingTitle.textContent='Workspace could not fully initialize';
    loadingMessage.textContent=message;
    continueButton.textContent=label;
    continueButton.hidden=false;
    loading.setAttribute('aria-busy','false');
    stage.dataset.officeFailed='true';
    stage.dataset.officeFallbackStatus=fallbackStatus;
  };
  continueButton.onclick=()=>{finishLoading();status.textContent=stage.dataset.officeFallbackStatus||'Office preview ready.';};
  el('office-user').textContent=user?.guest?'Guest workspace':(user?.name||user?.email||'Workspace');
  let index=0,renderer=null,disposed=false,signingOut=false;
  const graphics=el('office-graphics'),diagnostics=el('office-diagnostics');
  const refreshMetrics=()=>{el('office-metrics').textContent=renderer?JSON.stringify(renderer.metrics(),null,2):'Live renderer not available.';};
  graphics.onchange=()=>{renderer?.setGraphicsPreset(graphics.value);if(!diagnostics.hidden)refreshMetrics();};
  el('office-diagnostics-toggle').onclick=()=>{diagnostics.hidden=!diagnostics.hidden;el('office-diagnostics-toggle').setAttribute('aria-expanded',String(!diagnostics.hidden));if(!diagnostics.hidden)refreshMetrics();};
  el('office-metrics-refresh').onclick=refreshMetrics;
  const initialView=()=>{const still=[0,1,1,2][index]??0;poster.src=url('view-'+still+'.webp');poster.hidden=false;poster.removeAttribute('aria-hidden');};
  initialView();app.replaceChildren(stage);
  const activity=new Map();
  const disposeTasks=mountTaskPanel(stage,user,{roles:layout.roles,onActivity:(role,state)=>{activity.set(role,state);renderer?.setAgentState(role,state);}});
  const choose=i=>{
    if(!Number.isInteger(i)||i<0||i>=views.length)return;
    index=i;el('office-title').textContent=views[i];
    for(const [id,viewIndex] of [['office-workspace',0],['office-overview',1],['office-team',2],['office-meeting',3]])el(id).setAttribute('aria-pressed',String(i===viewIndex));
    stage.querySelector('.office-kicker').textContent='AGENTOFFICE / '+(i===3?'02':'01');
    if(renderer)renderer.go(i);else initialView();
  };
  const controls=mountOfficeControls(stage,{onView:choose,onMeeting:value=>renderer?.setMeeting?.(value)});
  function fallback(){if(disposed)return;controls.setAvailable(false);renderer?.dispose();renderer=null;live.replaceChildren();initialView();status.textContent='Rendered views • live 3D unavailable';stage.dataset.renderMode='poster';if(stage.dataset.officeReady!=='true')showLoadingError('Interactive 3D could not be initialized. You can continue with the rendered office preview.','Continue with preview','Rendered office preview mode.');}
  function showUpdate(st){if(disposed||!st)return;const box=el('office-update');box.hidden=!['checking','available','downloading','ready','error','current'].includes(st.state);box.querySelector('span').textContent=st.message||st.state;el('install-update').hidden=st.state!=='ready';}
  const stopUpdate=desktop?.onUpdateStatus?.(showUpdate);
  if(desktop?.updateStatus)desktop.updateStatus().then(showUpdate).catch(()=>{});
  el('check-update').onclick=async()=>{try{if(desktop?.checkUpdates)showUpdate(await desktop.checkUpdates());}catch{status.textContent='Unable to check for updates.';}};
  el('dismiss-update').onclick=()=>{el('office-update').hidden=true;};
  el('install-update').onclick=()=>desktop?.installUpdate?.();
  el('sign-out').onclick=async()=>{
    if(signingOut)return;signingOut=true;el('sign-out').disabled=true;
    try{if(desktop?.auth?.logout&&!await desktop.auth.logout())throw Error('Logout rejected');}
    catch{signingOut=false;el('sign-out').disabled=false;status.textContent='Unable to sign out. Try again.';return;}
    disposed=true;controls.dispose();disposeTasks();stopUpdate?.();renderer?.dispose();
    mountLoadingIntro({mode:'logout',onComplete:()=>mountAuth({onAuthenticated:mountWorkspace})});
  };
  // Real rendered stills appear immediately, even on machines with no WebGL2.
  // The expensive GLB and renderer load only after the authenticated destination exists.
  import('./agile-renderer.js').then(async mod=>{
    if(disposed)return;
    const view=await mod.mountAgileRenderer(live,url('office.glb'),{onLost:fallback,isCancelled:()=>disposed,getInitialIndex:()=>index,preset:graphics.value,characterRoster:layout.characters??[],onProgress:updateLoading});
    if(disposed){view.dispose();return;}
    renderer=view;for(const [role,state] of activity)renderer.setAgentState(role,state);renderer.setGraphicsPreset(graphics.value);stage.dataset.renderMode='live';
    const readiness=await view.ready;
    if(disposed){view.dispose();return;}
    if(readiness?.ok){controls.setAvailable(readiness.characters===7);poster.hidden=true;poster.setAttribute('aria-hidden','true');if(!diagnostics.hidden)refreshMetrics();status.textContent='Live 3D • drag to look around';finishLoading();}
    else if(stage.dataset.renderMode!=='poster'){controls.setAvailable(false);status.textContent='Office ready • character preview unavailable';showLoadingError('The office is available, but one or more character assets could not be initialized. You can continue without the characters.','Continue without characters','Office ready without character models.');}
  }).catch(()=>{if(!disposed)fallback();});
  return Promise.resolve();
}
mountLoadingIntro({mode:'startup',onComplete:()=>{
  if(desktop?.auth?.current){return desktop.auth.current().then(user=>user?mountWorkspace(user):mountAuth({onAuthenticated:mountWorkspace})).catch(()=>mountAuth({onAuthenticated:mountWorkspace}));}
  return mountAuth({onAuthenticated:mountWorkspace});
}});
