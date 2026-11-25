// Run from the prepared repository with Electron: see docs/performance-testing.md.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'app');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agentoffice-benchmark-'));
const html = path.join(appDir, 'scripts', 'office-benchmark-' + process.pid + '.html');
const reportPath = path.resolve(process.env.AGENTOFFICE_PERF_REPORT || path.join(root, 'office-performance-report.json'));
let server, win, lastStage='starting';
const reviewEvents=[];
const previewDir=process.env.AGENTOFFICE_PREVIEW_DIR;
const previewMode=Boolean(previewDir);
const characterReview=process.env.AGENTOFFICE_CHARACTER_REVIEW==='1';
const ciReview=characterReview&&process.env.CI==='true';
assert.ok(!characterReview||previewMode,'Character review requires a screenshot destination');
const preset=process.env.AGENTOFFICE_GRAPHICS_PRESET||'balanced';
const bakedMode=process.env.AGENTOFFICE_BAKED_CANDIDATE;
assert.ok(!bakedMode||['1','ktx2'].includes(bakedMode),'Invalid baked candidate mode');
const bakedCandidate=bakedMode==='ktx2'?'compressed':bakedMode==='1';
assert.ok(['balanced','high','performance'].includes(preset),'Invalid graphics preset');
const page = `<!doctype html><meta charset="utf-8"><title>AgentOffice renderer benchmark</title>
<style>html,body,#host{width:100%;height:100%;margin:0;overflow:hidden}canvas{display:block;width:100%;height:100%}</style>
<div id="host"></div><script type="module">
import {mountAgileRenderer} from '../src/agile-renderer.js';
import layout from '../src/agile-layout.json';
const characterReview=${JSON.stringify(characterReview)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const host=document.querySelector('#host');
const count=()=>Number(host.dataset.frames||0);
const stage=value=>{if(characterReview)console.info('OFFICE_REVIEW_STAGE '+value);};
const round=n=>Math.round(n*100)/100;
const percentile=(a,p)=>a.length?round([...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1]):null;
async function waitCharacters(view){
  const deadline=performance.now()+120000;
  while(performance.now()<deadline){
    const m=view.metrics();
    if(m.characters===7)return;
    if(m.characterStatus==='preview unavailable')throw Error('Actual character assets failed to load');
    await sleep(100);
  }
  throw Error('Seven characters did not become ready');
}
async function waitFrame(previous){
  const deadline=performance.now()+45000;
  while(performance.now()<deadline){
    if(count()>previous+2)return;
    await sleep(50);
  }
  throw Error('Character review did not render three frames');
}
async function quiet(previous){
  const deadline=performance.now()+20000;
  let last=count(),changed=performance.now();
  while(performance.now()<deadline){
    await sleep(50);
    const n=count();
    if(n!==last){last=n;changed=performance.now();}
    if(n>previous&&performance.now()-changed>=600)return;
  }
  throw Error('Renderer did not settle after an observable frame');
}
window.benchmarkResult=(async()=>{
  let view,contextLost=false,keepView=false;
  try{
    const start=performance.now();
    stage('mount-start');
    view=await mountAgileRenderer(host,new URL('/office/office.glb',location.href).href,{onLost:()=>{contextLost=true},isCancelled:()=>contextLost,preset:${JSON.stringify(preset)},bakedCandidate:${JSON.stringify(bakedCandidate)},characterRoster:characterReview?layout.characters:[],onProgress:stage});
    stage('office-first-frame');
    const firstFrameMs=round(performance.now()-start);
    if(characterReview){
      await waitCharacters(view);stage('seven-avatars-ready');
      if(!view.setAgentState('QA Engineer','working'))throw Error('QA typing clip unavailable');
      await waitFrame(count());stage('animated-frames-observed');
    }else await quiet(0);
    const initial=view.metrics(),initialFrames=count();
    if(${JSON.stringify(previewMode)}){
      window.previewView=async index=>{
        const before=count();view.go(index,true);if(characterReview)await waitFrame(before);else await quiet(before);return view.metrics();
      };
      keepView=true;
      return {ok:true,firstFrameMs,textureFormat:host.dataset.textureFormat,initial,contextLost};
    }
    await sleep(1000);
    const initialIdleFrames=count()-initialFrames;
    const transitions=[];
    for(const index of [2,0,2,0]){
      const before=count(),times=[],started=performance.now();
      const observer=new MutationObserver(()=>times.push(performance.now()));
      observer.observe(host,{attributes:true,attributeFilter:['data-frames']});
      try{view.go(index);await quiet(before);}finally{observer.disconnect();}
      const intervals=times.slice(1).map((t,i)=>t-times[i]);
      const elapsed=times.length>1?times.at(-1)-times[0]:0;
      const after=count(),metrics=view.metrics();
      await sleep(1000);
      transitions.push({...metrics,target:index,frames:after-before,observedIntervals:intervals.length,observedFps:elapsed>0?round((times.length-1)*1000/elapsed):null,p95FrameIntervalMs:percentile(intervals,.95),firstObservedFrameMs:times.length?round(times[0]-started):null,idleExtraFrames:count()-after});
    }
    return {ok:true,firstFrameMs,initialIdleFrames,textureFormat:host.dataset.textureFormat,contextLost,viewport:{width:host.clientWidth,height:host.clientHeight,devicePixelRatio},initial,transitions};
  }catch(error){return {ok:false,error:String(error?.stack||error),contextLost};}
  finally{if(!keepView)view?.dispose();}
})();
</script>`;
async function boundedResult(){
  const timeoutMs=characterReview?240000:120000;
  let timer;
  const read=async()=>{
    while(!(await win.webContents.executeJavaScript('Boolean(window.benchmarkResult)')))await new Promise(r=>setTimeout(r,100));
    return win.webContents.executeJavaScript('window.benchmarkResult');
  };
  try{return await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Benchmark timeout at stage: '+lastStage)),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
async function run(){
  assert.ok(fs.existsSync(path.join(appDir,'src','agile-renderer.js')),'Prepare the current app source first');
  assert.ok(fs.existsSync(path.join(appDir,'public','office','office.glb')),'Office asset missing');
  const vitePackage=require.resolve('vite/package.json',{paths:[appDir]});
  const {build,preview}=await import(pathToFileURL(path.join(path.dirname(vitePackage),'dist','node','index.js')).href);
  fs.writeFileSync(html,page,{flag:'wx'});
  const config={configFile:false,root:appDir,base:'/',build:{outDir:out,emptyOutDir:true,rollupOptions:{input:html}},logLevel:'warn'};
  await build(config);
  server=await preview({...config,preview:{host:'127.0.0.1',port:4173,strictPort:false}});
  const port=server.httpServer.address().port;
  win=new BrowserWindow({width:ciReview?800:previewMode&&!characterReview?1920:1280,height:ciReview?450:previewMode&&!characterReview?1080:800,useContentSize:true,show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,details,legacyMessage)=>{
    const message=typeof details==='object'?details.message:legacyMessage;
    if(typeof message!=='string')return;
    if(message.startsWith('OFFICE_REVIEW_STAGE '))lastStage=message.slice('OFFICE_REVIEW_STAGE '.length);
    if(characterReview){const entry={at:new Date().toISOString(),message:message.slice(0,2000)};if(reviewEvents.length<200)reviewEvents.push(entry);console.log('[renderer]',entry.message);}
  });
  win.webContents.on('render-process-gone',(_event,details)=>{lastStage='renderer process gone: '+details.reason;console.error(lastStage);});
  console.log('GPU feature status:',JSON.stringify(app.getGPUFeatureStatus()));
  await win.loadURL('http://127.0.0.1:'+port+'/scripts/'+path.basename(html));
  const result=await boundedResult();
  assert.ok(result,'Benchmark module did not initialize');
  if(previewMode){
    assert.ok(result.ok,result.error);
    if(characterReview){
      assert.equal(result.initial.characters,7);
      assert.equal(result.textureFormat,bakedCandidate?'baked-ktx2':'ktx2');
      if(bakedCandidate)assert.ok(result.initial.bakedMeshes>0,'No actual baked meshes');
      assert.equal(result.contextLost,false);
    }
    const destination=path.resolve(previewDir);
    const views=[];
    fs.mkdirSync(destination,{recursive:true});
    for(const index of [0,1,2]){
      lastStage='capture-view-'+index;
      const metrics=await win.webContents.executeJavaScript('window.previewView('+index+')');
      if(!characterReview)assert.ok(metrics.width>=1920&&metrics.height>=1080,'Actual rendering buffer is below Full HD; select High or use a larger display.');
      else {assert.equal(metrics.characters,7);assert.ok(metrics.width>0&&metrics.height>0);}
      const shot=await win.webContents.capturePage();
      const {width,height}=shot.getSize();
      if(!characterReview)assert.ok(width>=1920&&height>=1080,'Captured viewport is below Full HD.');
      else assert.ok(width>0&&height>0);
      fs.writeFileSync(path.join(destination,'view-'+index+'.png'),shot.toPNG(),{flag:'wx'});
      views.push({index,width,height,...metrics});
    }
    if(characterReview){
      fs.writeFileSync(path.join(destination,'review.json'),JSON.stringify({schemaVersion:1,ciReview,gpuFeatures:app.getGPUFeatureStatus(),gpuInfo:await app.getGPUInfo('basic').catch(()=>null),...result,views},null,2)+'\n');
      console.log('Actual character review captures:',destination);
    }else console.log('Native Full HD office previews:',destination);
    return;
  }
  const report={schemaVersion:1,recordedAt:new Date().toISOString(),electron:process.versions.electron,platform:process.platform,arch:process.arch,gpuFeatures:app.getGPUFeatureStatus(),gpuInfo:await app.getGPUInfo('basic').catch(()=>null),...result};
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log('Performance report:',reportPath);
  assert.ok(result.ok,result.error);
  assert.equal(result.contextLost,false,'WebGL context lost');
  assert.equal(result.initialIdleFrames,0,'Unexpected idle render');
  assert.ok(result.initial.after<result.initial.before,'Office batching ineffective');
  assert.ok(result.initial.drawCalls>0&&result.initial.triangles>0,'No actual drawing');
  for(const t of result.transitions){
    assert.ok(t.frames>0,'No camera-transition frames');
    assert.equal(t.idleExtraFrames,0,'Unexpected idle rendering after transition');
  }
  if(bakedCandidate){assert.equal(result.textureFormat,bakedCandidate==='compressed'?'baked-ktx2':'baked-candidate');assert.ok(result.initial.bakedMeshes>0);}
  else if(process.env.AGENTOFFICE_REQUIRE_KTX2==='1')assert.equal(result.textureFormat,'ktx2');
}
app.whenReady().then(run).then(()=>finish(0),error=>{
  console.error(error);
  if(characterReview){
    try{const destination=path.resolve(previewDir);fs.mkdirSync(destination,{recursive:true});
      fs.writeFileSync(path.join(destination,'failure.json'),JSON.stringify({schemaVersion:1,ciReview,lastStage,error:String(error?.stack||error),gpuFeatures:app.getGPUFeatureStatus(),reviewEvents},null,2)+'\n');
    }catch(writeError){console.error('Could not preserve review diagnostics',writeError);}
  }
  finish(1);
});
function finish(code){
  try{win?.destroy();server?.httpServer.close();}finally{
    try{fs.unlinkSync(html);}catch{}
    try{fs.rmSync(out,{recursive:true,force:true});}catch{}
    app.exit(code);
  }
}
