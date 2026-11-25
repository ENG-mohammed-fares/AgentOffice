import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import layout from './agile-layout.json';
import {makeFrameScheduler,makeResolutionController} from './office-performance.mjs';
import {optimizeStaticMeshes} from './office-batching.mjs';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';

const v=p=>new THREE.Vector3(p[0],p[2],-p[1]);
const cameras=layout.cameras.map(c=>({position:v(c.pos),target:v(c.target),fov:2*Math.atan(Math.tan(c.fov*Math.PI/360)/(16/9))*180/Math.PI}));
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function readGLB(url){
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();request.open('GET',url,true);request.responseType='arraybuffer';request.timeout=20000;
    request.onload=()=>{if((request.status===0||request.status===200)&&request.response?.byteLength>20)resolve(request.response);else reject(new Error('Office model unavailable'));};
    request.onerror=request.ontimeout=()=>reject(new Error('Office model unavailable'));request.send();
  });
}

export async function mountAgileRenderer(host,url,{onLost,isCancelled}){
  const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'high-performance'});
  if(!gl)throw Error('WebGL2 unavailable');
  let renderer,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.045,130),environment,pmrem,model,observer,disposed=false,move=null,drag=null,ktxLoader,frameScheduler,resolution,stats,lastFrame=0,settleFrames=0;
  const baseDpr=Math.min(devicePixelRatio||1,1.75);
  const target=new THREE.Vector3();
  const disposeScene=()=>{
    const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
  };
  const lost=e=>{e.preventDefault();onLost?.();};
  const dispose=()=>{if(disposed)return;disposed=true;frameScheduler?.dispose();document.removeEventListener('visibilitychange',visibility);ktxLoader?.dispose();observer?.disconnect();canvas.removeEventListener('webglcontextlost',lost);disposeScene();environment?.dispose();pmrem?.dispose();renderer?.dispose();canvas.remove();};
  function visibility(){if(document.hidden){frameScheduler?.pause();lastFrame=0;}else{lastFrame=0;frameScheduler?.resume();}}
  try{
    renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:true});
    renderer.setPixelRatio(baseDpr);resolution=makeResolutionController(baseDpr);
    frameScheduler=makeFrameScheduler(requestAnimationFrame,cancelAnimationFrame,draw);
    document.addEventListener('visibilitychange',visibility);
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
    const data=await readGLB(url);
    if(isCancelled())throw Error('Office cancelled');
    ktxLoader=new KTX2Loader().setTranscoderPath(new URL('../basis/',url).href).setWorkerLimit(2).detectSupport(renderer);
    const gltf=await new GLTFLoader().setKTX2Loader(ktxLoader).parseAsync(data,new URL('./',url).href);
    model=gltf.scene;scene.add(model);
    if(isCancelled())throw Error('Office cancelled');
    model.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=!o.name.toLowerCase().includes('glass')&&!o.name.toLowerCase().includes('sky');if(o.material?.map)o.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());});
    stats=optimizeStaticMeshes(model);
    const report=()=>{host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.triangles=String(renderer.info.render.triangles);host.dataset.pixelRatio=resolution.ratio.toFixed(2);host.dataset.batchesBefore=String(stats.before);host.dataset.batchesAfter=String(stats.after);host.dataset.instances=String(stats.instances);};
    const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();frameScheduler.request();};
    function refreshQuality(){renderer.setPixelRatio(resolution.ratio);resize();}
    function go(i,instant=false){
      const c=cameras[i];if(!c)return;
      if(instant||reduced()){camera.position.copy(c.position);target.copy(c.target);camera.fov=c.fov;camera.updateProjectionMatrix();camera.lookAt(target);move=null;}
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
      if(moving&&lastFrame&&resolution.sample(now-lastFrame))refreshQuality();
      lastFrame=moving?now:0;
      if(move){const q=Math.min(1,(now-move.start)/move.duration),e=q*q*(3-2*q);camera.position.copy(move.path.getPointAt(e));target.lerpVectors(move.from,move.to,e);camera.fov=THREE.MathUtils.lerp(move.fov,move.endFov,e);camera.updateProjectionMatrix();camera.lookAt(target);if(q>=1)move=null;}
      renderer.render(scene,camera);report();
      if(move||drag){settleFrames=0;frameScheduler.request();}
      else if(moving||settleFrames===1){if(settleFrames===0){settleFrames=1;frameScheduler.request();}else{settleFrames=0;if(resolution.restore())refreshQuality();}}
      else if(resolution.restore())refreshQuality();
    }
    canvas.addEventListener('pointerdown',e=>{if(move)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);lastFrame=0;settleFrames=0;frameScheduler.request();});
    canvas.addEventListener('pointermove',e=>{if(!drag||move)return;const d=target.clone().sub(camera.position),s=new THREE.Spherical().setFromVector3(d);s.theta-=(e.clientX-drag.x)*.003;s.phi=THREE.MathUtils.clamp(s.phi+(e.clientY-drag.y)*.003,.28,Math.PI-.28);target.copy(camera.position).add(new THREE.Vector3().setFromSpherical(s));camera.lookAt(target);drag={x:e.clientX,y:e.clientY};frameScheduler.request();});
    const endDrag=()=>{drag=null;lastFrame=0;settleFrames=0;frameScheduler.request();};
    canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
    canvas.addEventListener('webglcontextlost',lost);host.replaceChildren(canvas);observer=new ResizeObserver(resize);observer.observe(host);resize();go(0,true);if(document.hidden)frameScheduler.pause();else{renderer.render(scene,camera);report();}
    return {go,dispose,metrics:()=>({...stats,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:resolution.ratio})};
  }catch(err){dispose();throw err;}
}
