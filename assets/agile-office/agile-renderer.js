import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import layout from './agile-layout.json';
import {makeFrameScheduler,makeResolutionController,graphicsPixelRatio,makeFrameMetrics} from './office-performance.mjs';
import {optimizeStaticMeshes} from './office-batching.mjs';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {loadCharacterRoster} from './office-characters.mjs';

const v=p=>new THREE.Vector3(p[0],p[2],-p[1]);
const cameras=layout.cameras.map(c=>({position:v(c.pos),target:v(c.target),fov:2*Math.atan(Math.tan(c.fov*Math.PI/360)/(16/9))*180/Math.PI}));
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function readGLB(url,responseType='arraybuffer'){
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();request.open('GET',url,true);request.responseType=responseType;request.timeout=20000;
    request.onload=()=>{if((request.status===0||request.status===200)&&(responseType==='text'?request.response?.length:request.response?.byteLength)>20)resolve(request.response);else reject(new Error('Office model unavailable'));};
    request.onerror=request.ontimeout=()=>reject(new Error('Office model unavailable'));request.send();
  });
}

// XHR handles the packaged Electron file: scheme. Blob-backed decoder assets
// also avoid depending on browser fetch support for local file URLs.
async function loadOfficeModel(renderer,url,isCancelled,bakedCandidate){
  if(bakedCandidate===true){
    const candidate=new URL('office-baked.glb',url).href;
    const raw=await readGLB(candidate);
    if(isCancelled())throw Error('Office cancelled');
    return {gltf:await new GLTFLoader().parseAsync(raw,new URL('./',candidate).href),format:'baked-candidate'};
  }
  let decoder,jsURL,wasmURL,timer,expired=false;
  try{
    const packedURL=new URL(bakedCandidate==='compressed'?'office-baked-ktx2.glb':'office-ktx2.glb',url).href;
    const data=await readGLB(packedURL);
    if(isCancelled())throw Error('Office cancelled');
    const basis=new URL('../basis/',url).href;
    const jsPath=new URL('basis_transcoder.js',basis).href;
    const wasmPath=new URL('basis_transcoder.wasm',basis).href;
    const [script,binary]=await Promise.all([readGLB(jsPath,'text'),readGLB(wasmPath)]);
    if(isCancelled())throw Error('Office cancelled');
    jsURL=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
    wasmURL=URL.createObjectURL(new Blob([binary],{type:'application/wasm'}));
    const manager=new THREE.LoadingManager();
    manager.setURLModifier(path=>path===jsPath?jsURL:path===wasmPath?wasmURL:path);
    decoder=new KTX2Loader(manager).setTranscoderPath(basis).setWorkerLimit(2).detectSupport(renderer);
    const parsed=new GLTFLoader().setKTX2Loader(decoder).parseAsync(data,new URL('./',packedURL).href);
    const gltf=await Promise.race([parsed.then(model=>{
      if(expired){model.scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const t of Object.values(m))if(t?.isTexture)t.dispose();m.dispose();}});throw Error('Office decode deadline exceeded');}
      return model;
    }),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Compressed texture decode timeout'));},20000)})]);
    return {gltf,format:bakedCandidate==='compressed'?'baked-ktx2':'ktx2'};
  }catch(err){
    if(isCancelled()||bakedCandidate==='compressed')throw err;
    console.warn('Compressed office unavailable; using original PBR textures',err?.message);
  }finally{clearTimeout(timer);decoder?.dispose();if(jsURL)URL.revokeObjectURL(jsURL);if(wasmURL)URL.revokeObjectURL(wasmURL);}
  const raw=await readGLB(url);
  if(isCancelled())throw Error('Office cancelled');
  return {gltf:await new GLTFLoader().parseAsync(raw,new URL('./',url).href),format:'original'};
}

export async function mountAgileRenderer(host,url,{onLost,isCancelled,getInitialIndex=()=>0,preset='balanced',bakedCandidate=false,characterRoster=[],onProgress=()=>{}}){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'});
  if(!gl)throw Error('WebGL2 unavailable');
  let renderer,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.045,130),environment,pmrem,model,observer,disposed=false,move=null,drag=null,frameScheduler,resolution,stats,lastFrame=0,settleFrames=0,frames=0;
  const started=performance.now(),motionMetrics=makeFrameMetrics();
  let contextLost=false,assetLoadMs=0,readyMs=0,selectedPreset=preset;
  let characters=null,characterFrame=0,characterStatus=characterRoster.length?'loading':'not bundled';
  const activity=new Map();
  const maxRatio=()=>graphicsPixelRatio(selectedPreset,devicePixelRatio,host.clientWidth,host.clientHeight);
  const gpuExtension=gl.getExtension?.('WEBGL_debug_renderer_info');
  const gpuRenderer=gl.getParameter?.(gpuExtension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)||'Unavailable';
  const softwareRendering=/swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(gpuRenderer);
  const direction=new THREE.Vector3(),spherical=new THREE.Spherical();
  const target=new THREE.Vector3();
  const disposeScene=()=>{
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
  };
  const lost=e=>{e.preventDefault();contextLost=true;onLost?.();};
  const dispose=()=>{if(disposed)return;disposed=true;characters?.dispose();characters=null;frameScheduler?.dispose();document.removeEventListener('visibilitychange',visibility);observer?.disconnect();canvas.removeEventListener('webglcontextlost',lost);disposeScene();environment?.dispose();pmrem?.dispose();renderer?.dispose();canvas.remove();};
  function visibility(){characterFrame=0;if(document.hidden){frameScheduler?.pause();lastFrame=0;}else{lastFrame=0;frameScheduler?.resume();}}
  try{
    renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true});
    resolution=makeResolutionController(maxRatio(),{stable:true});
    frameScheduler=makeFrameScheduler(requestAnimationFrame,cancelAnimationFrame,draw);
    canvas.addEventListener('webglcontextlost',lost);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    // Architecture and lights are static: generate shadow maps once, not per frame.
    renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    scene.background=new THREE.Color(0x302b29);
    const studio=new RoomEnvironment();pmrem=new THREE.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.08);studio.dispose();
    scene.environment=environment.texture;scene.environmentIntensity=.30;
    RectAreaLightUniformsLib.init();
    scene.add(new THREE.HemisphereLight(0xc8d8ff,0x67503b,.75));
    for(const [pos,u,w,n,rgb] of layout.lights){
      const power=Math.max(...rgb);const c=new THREE.Color(rgb[0]/power,rgb[1]/power,rgb[2]/power);
      const light=new THREE.RectAreaLight(c,Math.min(power*.35,13),Math.max(.03,2*Math.hypot(...u)),Math.max(.03,2*Math.hypot(...w)));
      light.position.copy(v(pos));light.lookAt(v(pos).add(v(n)));scene.add(light);
    }
    // Two shadow-casting overhead sources, in addition to the designed area lights.
    for(const [x,z] of [[-2.6,0],[5.6,0]]){
      const l=new THREE.SpotLight(0xffddb6,32,13,Math.PI/3,.8,2);l.position.set(x,3.05,z);l.target.position.set(x,.2,z);l.castShadow=true;l.shadow.mapSize.set(1024,1024);l.shadow.bias=-.00015;l.shadow.normalBias=.02;scene.add(l,l.target);
    }
    onProgress('office-asset-load');
    const loading=performance.now();
    const {gltf,format}=await loadOfficeModel(renderer,url,()=>isCancelled()||contextLost,bakedCandidate);
    assetLoadMs=performance.now()-loading;onProgress('office-asset-decoded');
    model=gltf.scene;scene.add(model);host.dataset.textureFormat=format;
    if(isCancelled()||contextLost)throw Error('Office cancelled');
    let bakedMeshes=0;
    model.traverse(o=>{
      if(!o.isMesh)return;
      const baked=bakedCandidate&&o.material?.isMeshBasicMaterial&&o.material.name==='Office baked static atlas';
      if(baked){o.material.toneMapped=false;bakedMeshes++;}
      o.receiveShadow=!baked;
      o.castShadow=!o.name.toLowerCase().includes('glass')&&!o.name.toLowerCase().includes('sky');
      if(o.material?.map)o.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    });
    if(bakedCandidate&&!bakedMeshes)throw Error('Baked candidate has no unlit atlas meshes');
    stats=optimizeStaticMeshes(model);
    const report=()=>{host.dataset.frames=String(++frames);host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.triangles=String(renderer.info.render.triangles);host.dataset.pixelRatio=resolution.ratio.toFixed(2);host.dataset.batchesBefore=String(stats.before);host.dataset.batchesAfter=String(stats.after);host.dataset.instances=String(stats.instances);};
    let qualityCap=maxRatio();
    const sizeToHost=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setDrawingBufferSize(w,h,resolution.ratio);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const resize=()=>{
      const cap=maxRatio();
      if(Math.abs(cap-qualityCap)>.01){qualityCap=cap;resolution=makeResolutionController(cap,{stable:true});}
      sizeToHost();frameScheduler.request();
    };
    function setGraphicsPreset(value){
      if(!['high','balanced','performance'].includes(value)||value===selectedPreset)return;
      selectedPreset=value;qualityCap=maxRatio();resolution=makeResolutionController(qualityCap,{stable:true});sizeToHost();frameScheduler.request();
    }
    function setCamera(c){camera.position.copy(c.position);target.copy(c.target);camera.fov=c.fov;camera.updateProjectionMatrix();camera.lookAt(target);}
    function go(i,instant=false){
      const c=cameras[i];if(!c)return;
      if(instant||reduced()){setCamera(c);move=null;}
      else{
        // Avoid a straight flight through the glass partition. The actual doorway
        // is at x=3.05, y=-2.25 in the authored Z-up floor plan.
        const crossing=(camera.position.x<3.05)!==(c.position.x<3.05);
        const pts=[camera.position.clone()];
        if(crossing){const a=c.position.x>3.05?2.45:3.65,b=c.position.x>3.05?3.65:2.45;pts.push(new THREE.Vector3(a,1.68,2.25),new THREE.Vector3(b,1.68,2.25));}
        pts.push(c.position.clone());move={start:performance.now(),duration:crossing?2100:950,path:new THREE.CatmullRomCurve3(pts,false,'centripetal'),from:target.clone(),to:c.target.clone(),fov:camera.fov,endFov:c.fov};
      }
      lastFrame=0;settleFrames=0;frameScheduler.request();
    }
    function draw(now){
      if(disposed)return;
      const moving=!!move||!!drag;
      if(moving&&lastFrame){
        const elapsed=now-lastFrame;motionMetrics.record(elapsed);
        if(resolution.sample(elapsed))sizeToHost();
      }
      lastFrame=moving?now:0;
      if(move){const q=Math.min(1,(now-move.start)/move.duration),e=q*q*(3-2*q);camera.position.copy(move.path.getPointAt(e));target.lerpVectors(move.from,move.to,e);camera.fov=THREE.MathUtils.lerp(move.fov,move.endFov,e);camera.updateProjectionMatrix();camera.lookAt(target);if(q>=1)move=null;}
      if(characters){
        const elapsed=characterFrame?now-characterFrame:33.34;
        if(!moving&&elapsed<33){frameScheduler.request();return;}
        characters.update(elapsed/1000);characterFrame=now;
      }
      renderer.render(scene,camera);report();
      if(characters||move||drag){settleFrames=0;frameScheduler.request();}
      else if(moving||settleFrames===1){if(settleFrames===0){settleFrames=1;frameScheduler.request();}else settleFrames=0;}
    }
    canvas.addEventListener('pointerdown',e=>{if(move)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);lastFrame=0;settleFrames=0;frameScheduler.request();});
    canvas.addEventListener('pointermove',e=>{if(!drag||move)return;direction.copy(target).sub(camera.position);spherical.setFromVector3(direction);spherical.theta-=(e.clientX-drag.x)*.003;spherical.phi=THREE.MathUtils.clamp(spherical.phi+(e.clientY-drag.y)*.003,.28,Math.PI-.28);target.copy(camera.position).add(direction.setFromSpherical(spherical));camera.lookAt(target);drag.x=e.clientX;drag.y=e.clientY;frameScheduler.request();});
    const endDrag=()=>{drag=null;lastFrame=0;settleFrames=0;frameScheduler.request();};
    canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
    sizeToHost();setCamera(cameras[getInitialIndex()]||cameras[0]);
    // Compile while the previous view is still visible. The initial render also
    // uploads visible textures and builds the cached static shadow maps.
    onProgress('office-shader-compile');
    await renderer.compileAsync(scene,camera);
    onProgress('office-shader-compiled');
    if(isCancelled()||contextLost)throw Error('Office cancelled');
    setCamera(cameras[getInitialIndex()]||cameras[0]);
    onProgress('office-first-render');
    if(document.hidden)frameScheduler.pause();else{renderer.render(scene,camera);report();}
    onProgress('office-first-render-complete');
    readyMs=performance.now()-started;
    host.replaceChildren(canvas);observer=new ResizeObserver(resize);observer.observe(host);
    document.addEventListener('visibilitychange',visibility);
    if(characterRoster.length){
      // Load only after the first office frame; keep the office usable on failure.
      loadCharacterRoster({roster:characterRoster,stations:layout.stations,officeURL:url,isCancelled:()=>disposed||contextLost||isCancelled(),onProgress}).then(roster=>{
        if(disposed||contextLost||isCancelled()){roster.dispose();return;}
        characters=roster;scene.add(roster.group);characterStatus='preview ready';onProgress('avatar-roster-attached');
        for(const [role,state] of activity)roster.setState(role,state);
        frameScheduler.request();
      }).catch(err=>{if(!disposed&&!contextLost){characterStatus='preview unavailable';onProgress('avatar-roster-failed');console.warn('Character preview unavailable',err?.message);}});
    }
    function setAgentState(role,state){activity.set(role,state);return characters?.setState(role,state)??false;}
    return {go,dispose,setGraphicsPreset,setAgentState,metrics:()=>({...stats,...motionMetrics.snapshot(),bakedMeshes,characters:characters?.count??0,characterStatus,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:resolution.ratio,width:canvas.width,height:canvas.height,geometries:renderer.info.memory?.geometries??null,textures:renderer.info.memory?.textures??null,gpuRenderer,softwareRendering,assetLoadMs,readyMs,preset:selectedPreset})};
  }catch(err){dispose();throw err;}
}
