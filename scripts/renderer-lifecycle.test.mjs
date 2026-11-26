import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import * as THREE from 'three';
import * as performancePolicy from '../src/office-performance.mjs';
import * as batching from '../src/office-batching.mjs';
const source=fileURLToPath(new URL('../src/agile-renderer.js',import.meta.url));
async function fixture({fallback=false,noGL=false,failParse=false,cancelled=false,reduced=false,hidden=false,bakedCandidate=false,characterRoster=[],characterFailure=false}={}){
  let now=0,sequence=0,lost=0,renders=0,disposed=0,decoderDisposed=0,compiled=0;
  const frames=new Map(),events=new Map(),canvasEvents=new Map(),requests=[],characterStates=[],characterTicks=[];
  let characterDisposed=0;
  const characterLayer={group:new THREE.Group(),count:7,setState(role,state){characterStates.push([role,state]);return true},update(dt){characterTicks.push(dt)},dispose(){characterDisposed++;this.group.removeFromParent()}};
  const canvas={getContext:()=>noGL?null:{},addEventListener:(key,fn)=>canvasEvents.set(key,fn),
    removeEventListener:key=>canvasEvents.delete(key),setPointerCapture:()=>{},remove(){this.removed=true}};
  const document={hidden,createElement:()=>canvas,addEventListener:(key,fn)=>events.set(key,fn),
    removeEventListener:key=>events.delete(key)};
  const host={dataset:{},clientWidth:800,clientHeight:450,replaceChildren:()=>{}};
  class Renderer{
    constructor(){this.shadowMap={};this.info={render:{calls:2,triangles:24}};this.capabilities={getMaxAnisotropy:()=>16}}
    setDrawingBufferSize(w,h,ratio){this.ratio=ratio;canvas.width=w*ratio;canvas.height=h*ratio;} async compileAsync(){compiled++;} render(){assert.ok(compiled,'compile before render');renders++} dispose(){disposed++}
  }
  const texture=new THREE.Texture(),material=new THREE.MeshStandardMaterial({map:texture});
  const model=new THREE.Group();
  if(bakedCandidate){const baked=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({name:'Office baked static atlas',map:new THREE.Texture()}));baked.name='Baked wall';model.add(baked);}
  const box=new THREE.Mesh(new THREE.BoxGeometry(),material);box.name='Desk';model.add(box);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({transparent:true}));
  glass.name='Glass';model.add(glass);
  class Loader{
    setKTX2Loader(){return this}
    async parseAsync(){if(failParse)throw Error('Invalid model');return {scene:model}}
  }
  class Decoder{
    setTranscoderPath(){return this}setWorkerLimit(){return this}detectSupport(){return this}
    dispose(){decoderDisposed++}
  }
  class XHR{
    open(_method,url){this.url=url;requests.push(url)}
    send(){queueMicrotask(()=>{
      this.status=fallback&&this.url.endsWith('-ktx2.glb')?404:200;
      this.response=this.responseType==='text'?'// decoder fixture source length exceeds twenty':new ArrayBuffer(32);
      this.onload();
    })}
  }
  const context=createContext({document,devicePixelRatio:2,XMLHttpRequest:XHR,URL,Blob,
    matchMedia:()=>({matches:reduced}),performance:{now:()=>now},console:{warn(){}},
    requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence},
    cancelAnimationFrame:id=>frames.delete(id),setTimeout,clearTimeout,
    ResizeObserver:class{constructor(callback){this.callback=callback}observe(){this.callback()}disconnect(){}},
    queueMicrotask});
  const namespaces={
    three:{...THREE,WebGLRenderer:Renderer,PMREMGenerator:class{
      fromScene(){return {texture:new THREE.Texture(),dispose(){}}}dispose(){} }},
    'three/addons/loaders/GLTFLoader.js':{GLTFLoader:Loader},
    'three/addons/loaders/KTX2Loader.js':{KTX2Loader:Decoder},
    'three/addons/lights/RectAreaLightUniformsLib.js':{RectAreaLightUniformsLib:{init(){}}},
    'three/addons/environments/RoomEnvironment.js':{RoomEnvironment:class{dispose(){}}},
    './agile-layout.json':{default:JSON.parse(readFileSync(new URL('../src/agile-layout.json',import.meta.url),'utf8'))},
    './office-performance.mjs':performancePolicy,'./office-batching.mjs':batching,
    './office-characters.mjs':{async loadCharacterRoster(){if(characterFailure)throw Error('Invalid roster');return characterLayer}}};
  const module=new SourceTextModule(readFileSync(source,'utf8'),{context,identifier:source});
  await module.link(name=>{
    const namespace=namespaces[name];assert.ok(namespace,'Unexpected renderer import '+name);
    const linked=new SyntheticModule(Object.keys(namespace),function(){
      for(const [key,value] of Object.entries(namespace))this.setExport(key,value);
    },{context});return linked;
  });
  await module.evaluate();
  const mount=()=>module.namespace.mountAgileRenderer(host,'file:///fixture/office/office.glb',
    {onLost:()=>{lost++},isCancelled:()=>cancelled,bakedCandidate,characterRoster});
  const tick=time=>{now=time;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(time)};
  return {mount,host,canvas,canvasEvents,events,document,frames,tick,requests,box,glass,texture,characterStates,characterTicks,get characterDisposed(){return characterDisposed},
    get lost(){return lost},get renders(){return renders},get disposed(){return disposed},
    get decoderDisposed(){return decoderDisposed},get compiled(){return compiled}};
}
test('renderer controls camera/drag, pauses hidden work, and disposes real scene resources',async()=>{
  const f=await fixture(),renderer=await f.mount();
  assert.equal(f.host.dataset.textureFormat,'ktx2');
  assert.equal(f.decoderDisposed,1);assert.equal(f.texture.anisotropy,8);
  assert.equal(f.glass.castShadow,false);assert.equal(f.box.castShadow,true);
  assert.equal(renderer.metrics().triangles,24);assert.equal(f.compiled,1);
  assert.equal(renderer.metrics().preset,'balanced');renderer.setGraphicsPreset('invalid');assert.equal(renderer.metrics().preset,'balanced');
  renderer.setGraphicsPreset('performance');assert.equal(renderer.metrics().pixelRatio,1);renderer.setGraphicsPreset('performance');
  f.tick(1);const idle=f.renders;f.tick(2);assert.equal(f.renders,idle);
  renderer.go(999);renderer.go(2);f.tick(1500);f.tick(4000);f.tick(5000);
  f.canvasEvents.get('pointerdown')({clientX:10,clientY:10,pointerId:1});
  f.canvasEvents.get('pointermove')({clientX:35,clientY:22});
  f.tick(5020);f.tick(5050);assert.ok(renderer.metrics().frameTimeMs>0);assert.ok(renderer.metrics().samples>0);f.canvasEvents.get('pointerup')();f.tick(5070);
  f.document.hidden=true;f.events.get('visibilitychange')();assert.equal(f.frames.size,0);
  f.document.hidden=false;f.events.get('visibilitychange')();f.tick(6000);
  let prevented=false;f.canvasEvents.get('webglcontextlost')({preventDefault:()=>{prevented=true}});
  assert.equal(prevented,true);assert.equal(f.lost,1);
  renderer.dispose();renderer.dispose();
  assert.equal(f.disposed,1);assert.equal(f.frames.size,0);assert.equal(f.canvas.removed,true);
  assert.equal(f.events.has('visibilitychange'),false);
});
test('original-model fallback, reduced motion, and load errors preserve cleanup',async()=>{
  const f=await fixture({fallback:true,reduced:true,hidden:true});
  const renderer=await f.mount();assert.equal(f.host.dataset.textureFormat,'original');
  assert.ok(f.requests.some(url=>url.endsWith('/office.glb')));
  renderer.go(1);renderer.dispose();assert.equal(f.disposed,1);
  const failed=await fixture({failParse:true});
  await assert.rejects(failed.mount(),/Invalid model/);assert.equal(failed.disposed,1);
  const cancelled=await fixture({cancelled:true});
  await assert.rejects(cancelled.mount(),/Office cancelled/);assert.equal(cancelled.disposed,1);
  const noGL=await fixture({noGL:true});
  await assert.rejects(noGL.mount(),/WebGL2 unavailable/);
});

test('experimental baked path requests only its explicit asset and keeps PBR glass',async()=>{
 const f=await fixture({bakedCandidate:true});
 const renderer=await f.mount();
 assert.equal(f.host.dataset.textureFormat,'baked-candidate');
 assert.equal(renderer.metrics().bakedMeshes,1);
 assert.deepEqual(f.requests,['file:///fixture/office/office-baked.glb']);
 assert.equal(f.glass.receiveShadow,true);
 renderer.dispose();
});

test('compressed baked benchmark reuses Basis decoding and never silently falls back',async()=>{
 const f=await fixture({bakedCandidate:'compressed'});
 const renderer=await f.mount();
 assert.equal(f.host.dataset.textureFormat,'baked-ktx2');
 assert.equal(renderer.metrics().bakedMeshes,1);
 assert.equal(f.decoderDisposed,1);
 assert.ok(f.requests[0].endsWith('/office-baked-ktx2.glb'));
 renderer.dispose();
 const bad=await fixture({bakedCandidate:'compressed',fallback:true});
 await assert.rejects(bad.mount(),/Office model unavailable/);
 assert.equal(bad.requests.length,1);
});

test('character preview remains independent of the initial office and pauses when hidden',async()=>{
 const f=await fixture({characterRoster:[{}]});
 const renderer=await f.mount();for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(renderer.metrics().characters,7);assert.equal(f.compiled,2);
 assert.equal(renderer.setAgentState('QA Engineer','working'),true);
 assert.deepEqual(f.characterStates.at(-1),['QA Engineer','working']);
 f.tick(100);f.tick(120);f.tick(140);
 assert.ok(f.characterTicks.length>=1);
 f.document.hidden=true;f.events.get('visibilitychange')();
 assert.equal(f.frames.size,0);
 renderer.dispose();renderer.dispose();assert.equal(f.characterDisposed,1);
 const bad=await fixture({characterRoster:[{}],characterFailure:true});
 const view=await bad.mount();for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(view.metrics().characters,0);assert.equal(view.metrics().characterStatus,'preview unavailable');
 view.dispose();
});
