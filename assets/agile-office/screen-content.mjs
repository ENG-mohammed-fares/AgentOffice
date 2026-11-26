import * as THREE from 'three';

const WIDTH=1024,HEIGHT=576;
const palette={bg:'#0b1020',panel:'#121b2d',panel2:'#18253a',line:'#293b55',text:'#e7edf7',muted:'#8fa1bb',accent:'#55c6b0',blue:'#6ca8ff',amber:'#e8b36c',red:'#f07c83',green:'#68d6a5'};
const roleTitles=Object.freeze({
  'Product Owner':'PRODUCT ROADMAP','Frontend Developer':'FRONTEND / UI','AI Engineer':'AGENT WORKFLOW',
  'Backend Developer':'BACKEND SERVICES','QA Engineer':'QUALITY / TESTS','DevOps Engineer':'CI / CD PIPELINE',
  'Scrum Master':'SPRINT BOARD'
});
const variants=Object.freeze({
  roadmap:'roadmap',code:'code',preview:'preview',workflow:'workflow',evaluation:'evaluation',
  api:'api',database:'database',logs:'logs',tests:'tests',bugs:'bugs',pipeline:'pipeline',terminal:'terminal',board:'board'
});
const round=(ctx,x,y,w,h,r=10,fill=palette.panel,stroke=null)=>{
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
};
const label=(ctx,x,y,value,size=20,color=palette.text,weight=500)=>{
  ctx.font=`${weight} ${size}px Inter, Segoe UI, Arial, sans-serif`;
  ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(value,x,y);
};
const bar=(ctx,x,y,w,h,value,color=palette.accent)=>{
  round(ctx,x,y,w,h,h/2,palette.line);
  round(ctx,x,y,Math.max(h,w*Math.max(0,Math.min(1,value))),h,h/2,color);
};
function header(ctx,role,variant){
  ctx.fillStyle=palette.bg;ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#111a2a';ctx.fillRect(0,0,WIDTH,82);
  ctx.fillStyle=palette.accent;ctx.fillRect(0,78,WIDTH,4);
  label(ctx,34,32,roleTitles[role]||role.toUpperCase(),26,palette.text,700);
  label(ctx,36,59,variant.toUpperCase().replaceAll('-',' '),13,palette.muted,500);
  round(ctx,812,20,118,30,14,palette.panel2,palette.line);label(ctx,831,35,'SIMULATION',12,palette.amber,700);
  for(let i=0;i<3;i++){ctx.fillStyle=[palette.red,palette.amber,palette.green][i];ctx.beginPath();ctx.arc(956+i*22,35,5,0,Math.PI*2);ctx.fill();}
}
function roadmap(ctx){
  const cols=[['NOW',palette.accent],['NEXT',palette.blue],['LATER',palette.amber]];
  cols.forEach(([name,color],i)=>{
    const x=32+i*330;round(ctx,x,112,306,414,12,palette.panel);
    label(ctx,x+20,145,name,18,color,700);
    for(let j=0;j<3;j++){
      const y=178+j*108;round(ctx,x+16,y,274,86,8,palette.panel2);
      label(ctx,x+30,y+25,['Agent onboarding','Run reliability','Workspace launch'][(j+i)%3],17,palette.text,600);
      label(ctx,x+30,y+54,['Design review','Engineering','Acceptance'][j],13,palette.muted,400);
      bar(ctx,x+30,y+72,230,5,.25+.12*((j+i)%5),color);
    }
  });
}
function codeEditor(ctx){
  round(ctx,28,108,632,430,10,palette.panel);
  label(ctx,50,134,'agent-workspace.ts',16,palette.muted,600);
  const code=['import { AgentRuntime } from "./runtime";','export async function runAgent(task) {','  const plan = await runtime.plan(task);','  const tools = await registry.resolve(plan);','  const result = await execute(plan, tools);','  return evaluate(result);','}',''];
  code.forEach((line,i)=>{label(ctx,48,185+i*43,String(i+1).padStart(2,'0'),14,palette.muted,400);label(ctx,92,185+i*43,line,16,i%3===0?palette.blue:i%3===1?palette.text:palette.accent,500);});
  round(ctx,686,108,310,430,10,palette.panel);
  label(ctx,710,140,'COMPONENT TREE',15,palette.muted,700);
  ['AppShell','WorkspaceView','AgentCard','TaskPanel','StatusBadge'].forEach((v,i)=>{round(ctx,708,175+i*62,260,46,7,palette.panel2);label(ctx,730,198+i*62,'▸  '+v,16,palette.text,500);});
}
function preview(ctx){
  round(ctx,34,108,956,430,12,'#101827');
  ctx.fillStyle='#18253a';ctx.fillRect(34,108,956,45);
  label(ctx,58,132,'AgentOffice  /  Workspace',16,palette.text,600);
  round(ctx,58,178,195,330,8,'#172337');
  ['Workspace','Agents','Tasks','Reports','Settings'].forEach((v,i)=>label(ctx,82,211+i*48,v,16,i===0?palette.accent:palette.muted,500));
  for(let i=0;i<3;i++){round(ctx,278+i*226,178,204,105,8,palette.panel2);label(ctx,296+i*226,207,['ACTIVE AGENTS','OPEN TASKS','HEALTH'][i],13,palette.muted,600);label(ctx,296+i*226,253,['07','12','98%'][i],30,[palette.accent,palette.blue,palette.green][i],700);}
  round(ctx,278,306,656,202,8,palette.panel2);
  label(ctx,300,334,'Agent activity',16,palette.text,600);
  for(let i=0;i<5;i++)bar(ctx,300,365+i*27,590,9,.34+.11*((i*3)%5),[palette.accent,palette.blue,palette.amber][i%3]);
}
function workflow(ctx){
  const nodes=[['PLAN',120,210],['TOOLS',390,210],['ACT',660,210],['EVALUATE',390,405]];
  nodes.forEach(([name,x,y],i)=>{round(ctx,x,y,210,92,12,palette.panel2,[palette.accent,palette.blue,palette.amber,palette.green][i]);label(ctx,x+24,y+36,name,20,palette.text,700);label(ctx,x+24,y+65,['Task decomposition','Tool selection','Execution','Quality feedback'][i],13,palette.muted,400);});
  ctx.strokeStyle=palette.accent;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(330,256);ctx.lineTo(390,256);ctx.moveTo(600,256);ctx.lineTo(660,256);ctx.moveTo(765,302);ctx.lineTo(600,405);ctx.moveTo(390,450);ctx.lineTo(225,302);ctx.stroke();
}
function evaluation(ctx){
  round(ctx,34,110,450,416,10,palette.panel);label(ctx,60,145,'EVALUATION RUNS',17,palette.text,700);
  ['Task completion','Tool accuracy','Grounded output','Latency budget','Safety checks'].forEach((v,i)=>{label(ctx,60,198+i*62,v,15,palette.muted,500);bar(ctx,60,222+i*62,370,10,[.91,.86,.94,.72,.99][i],[palette.accent,palette.blue,palette.green,palette.amber,palette.accent][i]);});
  round(ctx,512,110,478,416,10,palette.panel);label(ctx,540,145,'QUALITY TREND',17,palette.text,700);
  ctx.strokeStyle=palette.line;ctx.lineWidth=2;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(548,210+i*72);ctx.lineTo(956,210+i*72);ctx.stroke();}
  const pts=[[550,430],[620,390],[690,410],[760,310],[830,330],[900,245],[954,260]];
  ctx.strokeStyle=palette.accent;ctx.lineWidth=5;ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
}
function table(ctx,title,rows){
  round(ctx,34,110,956,418,10,palette.panel);label(ctx,60,146,title,18,palette.text,700);
  rows.forEach((row,i)=>{const y=190+i*57;ctx.fillStyle=i%2?'#162237':'#1b2940';ctx.fillRect(56,y-20,910,46);label(ctx,74,y,row[0],15,palette.text,500);label(ctx,430,y,row[1],14,palette.muted,400);label(ctx,830,y,row[2],14,row[3]||palette.accent,600);});
}
function tests(ctx){table(ctx,'TEST EXECUTION',[['Auth flow','integration','PASS',palette.green],['Agent tools','unit','PASS',palette.green],['Retry policy','unit','PASS',palette.green],['Failure recovery','integration','RUNNING',palette.amber],['Policy checks','security','PASS',palette.green],['Renderer lifecycle','integration','PASS',palette.green]]);}
function bugs(ctx){table(ctx,'DEFECT TRIAGE',[['#142 · Focus trap','P1 · UI','IN PROGRESS',palette.amber],['#138 · Retry state','P2 · runtime','OPEN',palette.red],['#126 · Empty result','P2 · data','REVIEW',palette.blue],['#121 · Label overlap','P3 · visual','FIXED',palette.green],['#119 · Slow startup','P1 · perf','VERIFY',palette.amber],['#114 · Stale task','P2 · state','FIXED',palette.green]]);}
function api(ctx){table(ctx,'SERVICE ENDPOINTS',[['GET  /agents','200 · 18 ms','HEALTHY',palette.green],['POST /runs','202 · queued','READY',palette.accent],['GET  /health','200 · 4 ms','HEALTHY',palette.green],['GET  /tools','200 · 12 ms','HEALTHY',palette.green],['POST /events','202 · accepted','READY',palette.blue],['GET  /metrics','200 · 9 ms','HEALTHY',palette.green]]);}
function database(ctx){table(ctx,'DATA MODEL',[['agents','id · role · status','7 ROWS',palette.accent],['runs','id · agent_id · state','128 ROWS',palette.blue],['events','id · run_id · created_at','2.4K ROWS',palette.green],['tool_calls','id · tool · latency','612 ROWS',palette.amber],['evaluations','id · score · verdict','94 ROWS',palette.accent],['sessions','id · user_id · expiry','18 ROWS',palette.blue]]);}
function logs(ctx){table(ctx,'SERVICE LOGS',[['10:42:18.221','worker started','INFO',palette.green],['10:42:18.406','tool registry ready','INFO',palette.green],['10:42:19.012','retry budget = 2','DEBUG',palette.muted],['10:42:19.818','request accepted','INFO',palette.green],['10:42:20.109','rate limit window','WARN',palette.amber],['10:42:20.312','trace flushed','INFO',palette.green]]);}
function pipeline(ctx){
  const names=['SOURCE','TEST','BUILD','SCAN','PACKAGE','PUBLISH'];
  names.forEach((v,i)=>{const x=28+i*164;round(ctx,x,220,142,118,10,palette.panel2,i<5?palette.green:palette.amber);label(ctx,x+20,258,v,16,palette.text,700);label(ctx,x+20,297,i<5?'PASSED':'PENDING',13,i<5?palette.green:palette.amber,600);if(i<5){ctx.strokeStyle=palette.accent;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+142,278);ctx.lineTo(x+164,278);ctx.stroke();}});
  label(ctx,54,410,'Release candidate  /  Windows x64',17,palette.muted,500);
  bar(ctx,54,452,850,12,.82,palette.accent);
}
function terminal(ctx){
  round(ctx,32,110,620,418,10,'#080e18');label(ctx,56,146,'ops@agentoffice  ~',15,palette.accent,600);
  ['$ agentoffice status','runtime: healthy','agents: 7 / 7 ready','queue depth: 03','gpu memory: 2.1 GB','$ kubectl get pods','office-api   1/1   Running','agent-worker 3/3   Running'].forEach((v,i)=>label(ctx,56,194+i*43,v,15,i===0||i===5?palette.blue:palette.text,500));
  round(ctx,680,110,310,418,10,palette.panel);label(ctx,704,146,'RESOURCE USAGE',16,palette.text,700);
  ['CPU','GPU','RAM','QUEUE'].forEach((v,i)=>{label(ctx,704,208+i*75,v,13,palette.muted,600);bar(ctx,704,232+i*75,240,10,[.42,.58,.63,.24][i],[palette.accent,palette.blue,palette.amber,palette.green][i]);});
}
function board(ctx){
  const columns=[['TO DO',palette.muted],['IN PROGRESS',palette.blue],['REVIEW',palette.amber],['DONE',palette.green]];
  columns.forEach(([name,color],i)=>{const x=26+i*248;round(ctx,x,112,226,414,10,palette.panel);label(ctx,x+18,145,name,15,color,700);for(let j=0;j<3;j++){const y=176+j*105;round(ctx,x+12,y,202,84,8,palette.panel2);label(ctx,x+25,y+26,['Sprint planning','Agent metrics','Release review'][(i+j)%3],14,palette.text,500);label(ctx,x+25,y+55,['Owner: team','Due: Friday','Priority: P1'][j],12,palette.muted,400);}});
}
function draw(ctx,placement){
  header(ctx,placement.role,placement.variant);
  switch(placement.variant){
    case 'roadmap':roadmap(ctx);break;case 'code':codeEditor(ctx);break;case 'preview':preview(ctx);break;
    case 'workflow':workflow(ctx);break;case 'evaluation':evaluation(ctx);break;case 'api':api(ctx);break;
    case 'database':database(ctx);break;case 'logs':logs(ctx);break;case 'tests':tests(ctx);break;
    case 'bugs':bugs(ctx);break;case 'pipeline':pipeline(ctx);break;case 'terminal':terminal(ctx);break;
    case 'board':board(ctx);break;default:table(ctx,'WORKSPACE',[['Status','Ready','ACTIVE',palette.green]]);
  }
}
/**
 * Resolves monitor overlays from role-keyed layout metadata and station-local transforms.
 * @param {object[]} screens - Role/station mapping with one or more validated monitor variants.
 * @param {number[][]} stations - Authored station x/y/heading tuples in Blender coordinates.
 * @returns {object[]} Monitor placements in Three.js world coordinates.
 * @throws {TypeError|Error} If arrays, stations, roles or monitor variants are invalid.
 */
export function screenPlacements(screens,stations){
  if(!Array.isArray(screens)||!Array.isArray(stations))throw new TypeError('Screen layout and station arrays are required');
  if(screens.length!==7||stations.length!==7)throw new Error('Exactly seven role layouts and seven workstation stations are required');
  const roles=new Set(),slots=new Set(),placements=[];
  for(const screen of screens){
    if(!screen||typeof screen.role!=='string'||!Object.hasOwn(roleTitles,screen.role)||!Number.isInteger(screen.station)||!stations[screen.station]||roles.has(screen.role)||slots.has(screen.station)||!Array.isArray(screen.monitors)||!screen.monitors.length)throw new Error('Invalid role screen layout');
    roles.add(screen.role);slots.add(screen.station);
    const [sx,sy,angle]=stations[screen.station];
    if(![sx,sy,angle].every(Number.isFinite))throw new Error('Invalid screen station coordinates');
    const seen=new Set();
    for(let i=0;i<screen.monitors.length;i++){
      const monitor=screen.monitors[i];
      if(!monitor||!Number.isFinite(monitor.x)||!Number.isFinite(monitor.y)||!Number.isFinite(monitor.width)||monitor.width<=.1||!Object.hasOwn(variants,monitor.variant)||seen.has(monitor.variant))throw new Error('Invalid or duplicate role monitor variant');
      seen.add(monitor.variant);
      const c=Math.cos(angle),s=Math.sin(angle),localY=monitor.y-.031;
      const x=sx+c*monitor.x-s*localY,y=sy+s*monitor.x+c*localY;
      placements.push({role:screen.role,station:screen.station,variant:monitor.variant,monitorIndex:i,monitorCount:screen.monitors.length,position:[x,1.17,-y],rotationY:angle,width:monitor.width-.04,height:.316});
    }
  }
  if(placements.length!==13)throw new Error('Exactly thirteen role-specific monitor placements are required');
  return placements;
}
/**
 * Creates owned, role-specific monitor textures and meshes for the live office scene.
 * @param {object} options - Screen metadata, station transforms and optional rendering test doubles.
 * @returns {{group:THREE.Group,count:number}} Scene group and number of generated monitor overlays.
 * @throws {Error} If canvas rendering or geometry construction fails; partially created resources are disposed.
 */
export function createRoleScreens({screens,stations,THREEImpl=THREE,canvasFactory=()=>document.createElement('canvas')}={}){
  const placements=screenPlacements(screens??[],stations??[]),group=new THREEImpl.Group(),owned=[];
  group.name='AgentOffice role-specific monitor content';
  try{
    for(const placement of placements){
      const canvas=canvasFactory();canvas.width=WIDTH;canvas.height=HEIGHT;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('2D canvas context unavailable for role screens');
      draw(ctx,placement);
      const texture=new THREEImpl.CanvasTexture(canvas);texture.colorSpace=THREEImpl.SRGBColorSpace;texture.generateMipmaps=true;
      texture.minFilter=THREEImpl.LinearMipmapLinearFilter;texture.magFilter=THREEImpl.LinearFilter;
      const geometry=new THREEImpl.PlaneGeometry(placement.width,placement.height);
      const material=new THREEImpl.MeshBasicMaterial({map:texture,side:THREEImpl.DoubleSide,toneMapped:false});
      const mesh=new THREEImpl.Mesh(geometry,material);mesh.name=`Role screen ${placement.role} ${placement.variant}`;
      mesh.position.set(...placement.position);mesh.rotation.y=placement.rotationY;mesh.renderOrder=2;mesh.castShadow=false;mesh.receiveShadow=false;
      group.add(mesh);owned.push({geometry,material,texture});
    }
    return {group,count:placements.length};
  }catch(error){
    for(const item of owned){item.geometry.dispose();item.material.dispose();item.texture.dispose();}
    throw error;
  }
}
