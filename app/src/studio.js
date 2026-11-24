import * as THREE from 'three';

/** Live 3D visualization. Models are bespoke procedural prototype assets, not fake screenshots. */
const palette = ['#d67b55','#317d78','#b6a47e','#6f8e84','#b57d6c','#b1a17e','#698b86'];
const roomNames = ['Product','Sprint','Architecture','Design','Backend','Quality','Operations'];
const color = c => new THREE.Color(c);

export function mountStudio(target,{full=false,onRoom=()=>{}}={}) {
  const scene=new THREE.Scene(); scene.background=color(full?'#d7dbd4':'#d9e0d9');
  const pixelRatio=Math.min(window.devicePixelRatio||1,1.6);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.45;
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.className='studio-canvas';
  renderer.domElement.setAttribute('aria-label',full?'Interactive three-dimensional virtual office':'Live three-dimensional preview of AgentOffice');
  target.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(full?39:40,1,.1,150);
  const targetCam=new THREE.Vector3(),lookAt=new THREE.Vector3(),goalCam=new THREE.Vector3();
  const overview=full?new THREE.Vector3(21,27,28):new THREE.Vector3(11,8.5,13.8);
  goalCam.copy(overview);
  camera.position.copy(goalCam);
  let selected=null,dragging=false,orbit=0,lastPointer=0,distance=full?45:18.5,disposed=false,raf=0;
  const lowMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const material=(hex,r=.66,m=.0)=>new THREE.MeshStandardMaterial({color:hex,roughness:r,metalness:m});
  const ivory=material('#eae6da'),chalk=material('#f6f2e8'),stone=material('#d6d4c8'),wood=material('#aa7b58'),darkWood=material('#5b6257'),teal=material('#1f6965',.43,.15),black=material('#243c3c',.35,.16),screens=material('#142e32',.25,.2),plantMat=material('#4a8060'),gold=material('#d19a63',.44,.15),darkSteel=material('#50605a',.5,.4);
  const floorMat=material('#c4c5b9',.96),lineMat=material('#bcb9ac',.93);
  const makeBox=(parent,[w,h,d],[x,y,z],mat,cast=true)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  const cylinder=(parent,rt,rb,h,x,y,z,mat)=>{const o=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,20),mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  const sphere=(parent,r,x,y,z,mat)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,20,14),mat);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;};
  const plane=(parent,w,h,x,y,z,mat,rotation=0)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.position.set(x,y,z);mesh.rotation.y=rotation;parent.add(mesh);return mesh;};
  const label=(text,size=30,ink='#ecefe7',bg='#24514b',w=256,h=64)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.fillStyle=ink;ctx.font=`600 ${size}px Segoe UI,Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2,w-18);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide});};
  const ridges=(parent,n,x,y,z,step,mat)=>{for(let i=0;i<n;i++)makeBox(parent,[.045,.035,.7],[x+(i-(n-1)/2)*step,y,z],mat,false);};
  function monitor(parent,x,y,z,scale=1,accent='#4b9d93') {
    const frame=new THREE.Group();frame.position.set(x,y,z);frame.scale.setScalar(scale);parent.add(frame);
    makeBox(frame,[1.16,.78,.08],[0,0,0],black);
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=220;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#102e32';ctx.fillRect(0,0,320,220);
    ctx.fillStyle=accent;ctx.fillRect(18,18,66,6);ctx.fillStyle='#406a69';ctx.fillRect(18,39,134,5);ctx.fillRect(18,59,95,5);
    ctx.fillStyle='#2d5652';ctx.fillRect(18,99,89,72);ctx.fillStyle='#568e84';ctx.fillRect(119,110,82,61);ctx.fillStyle='#b8bda8';ctx.fillRect(213,80,87,90);
    ctx.fillStyle='#79bfb2';ctx.fillRect(18,189,283,7);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.MeshBasicMaterial({map:texture});
    plane(frame,1.07,.7,0,0,.047,m);
    makeBox(frame,[.055,.27,.055],[0,-.52,0],darkSteel);
    makeBox(frame,[.55,.035,.23],[0,-.65,.07],darkSteel);
  }
  function workDesk(parent,x,z,rotation=0,small=false) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;g.scale.setScalar(small?.82:1);parent.add(g);
    makeBox(g,[2.15,.13,1.08],[0,.89,0],wood);
    for(let i of [-1,1]) {makeBox(g,[.085,.78,.085],[i*.91,.44,-.4],darkSteel);makeBox(g,[.085,.78,.085],[i*.91,.44,.41],darkSteel);}
    monitor(g,-.24,1.58,-.24,.82);
    makeBox(g,[.56,.035,.2],[.35,.99,.27],black);
    ridges(g,7,.35,1.03,.27,.065,chalk);
    sphere(g,.085,.83,1.05,.29,material('#cfaa71'));
    return g;
  }
  function chair(parent,x,z,rotation=0) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rotation;parent.add(g);
    cylinder(g,.36,.31,.12,0,.54,0,teal);
    makeBox(g,[.73,.72,.11],[0,1.04,.32],teal);
    makeBox(g,[.3,.045,.62],[0,.58,.12],teal);
    cylinder(g,.047,.047,.44,0,.28,0,darkSteel);
    for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;makeBox(g,[.6,.045,.055],[Math.cos(angle)*.23,.07,Math.sin(angle)*.24],darkSteel);}
    return g;
  }
  function plant(parent,x,z,scale=1) {
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
    cylinder(g,.24,.17,.44,0,.25,0,material('#b67c63'));
    cylinder(g,.22,.22,.04,0,.48,0,material('#675f4b'));
    for(let i=0;i<6;i++){const a=i*Math.PI*2/6;const o=sphere(g,.23,Math.cos(a)*.16,.84+((i+1)%3)*.10,Math.sin(a)*.16,plantMat);o.scale.set(.62,1.75,.65);o.rotation.z=Math.cos(a)*.25;}
  }
  function worker(parent,x,z,shirtColor='#bb8158',child=false) {
    const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(child?.66:1);parent.add(g);
    const skin=material('#bc9073');const shirt=material(shirtColor);
    cylinder(g,.25,.30,.65,0,1.13,0,shirt);
    cylinder(g,.12,.11,.3,-.20,.55,0,black);cylinder(g,.12,.11,.3,.20,.55,0,black);
    const head=sphere(g,.27,0,1.7,0,skin);head.scale.set(1,.96,.89);
    const hair=sphere(g,.276,0,1.88,-.04,black);hair.scale.set(1,.4,1);
    const armA=cylinder(g,.105,.09,.44,-.31,1.05,-.11,shirt);armA.rotation.z=.3;
    const armB=cylinder(g,.105,.09,.44,.31,1.05,-.11,shirt);armB.rotation.z=-.3;
    return g;
  }
  function room(id,x,z,accent,showWorker=true) {
    const g=new THREE.Group();g.position.set(x,0,z);g.userData.room=id;scene.add(g);
    makeBox(g,[4.55,.22,4.35],[0,.02,0],ivory);
    const stripe=makeBox(g,[4.55,.04,.10],[0,.16,2.14],material(accent));stripe.castShadow=false;
    makeBox(g,[4.55,2.30,.15],[0,1.17,-2.14],chalk);
    makeBox(g,[.16,2.0,4.35],[-2.2,1.04,0],chalk);
    makeBox(g,[.09,1.45,4.3],[2.24,.8,0],new THREE.MeshStandardMaterial({color:'#a5cec7',transparent:true,opacity:.18,roughness:.11,metalness:.1,depthWrite:false}),false);
    // Architectural wall trim and recessed panels.
    makeBox(g,[4.45,.075,.075],[0,2.17,-2.05],wood);
    makeBox(g,[1.25,1.06,.075],[-1.4,1.36,-2.03],material('#c3d6cf'),false);
    makeBox(g,[1.05,1.12,.09],[1.5,1.32,-2.03],black);
    plane(g,.97,.40,1.5,1.5,-1.97,label(roomNames[id],23),0);
    const deskX = id === 0 ? -.35 : .15;
    workDesk(g,deskX,.15,.0,id===0);chair(g,deskX,.92,0);
    if(showWorker)worker(g,deskX,-.55,accent,id===0);
    plant(g,-1.72,1.5,.82);
    makeBox(g,[.7,.9,.5],[1.72,.59,1.1],stone);
    if(id===0){cylinder(g,.34,.34,.14,1.7,1.18,.1,material('#ad4f42'));}
    if(id===4 || id===6){for(let j=0;j<3;j++)makeBox(g,[.45,.9,.45],[1.2+j*.48,.57,-1.2],black);}
    return g;
  }
  function previewScene(){
    // Artist-directed hero scene: the same desk and room geometry used in the office.
    const g=new THREE.Group();scene.add(g);
    makeBox(g,[10.8,.18,8.8],[0,.02,0],ivory);
    makeBox(g,[10.8,4,.16],[0,2,-4.4],chalk);
    makeBox(g,[.14,4,8.8],[-5.3,2,0],chalk);
    for(let j=0;j<4;j++){
      makeBox(g,[1.60,2.7,.12],[-3.25+j*2.15,2.15,-4.28],material('#8eb8b3',.25),false);
      makeBox(g,[.06,2.8,.18],[-4.25+j*2.15,2.15,-4.17],black);
      makeBox(g,[1.68,.08,.20],[-3.25+j*2.15,3.52,-4.13],wood);
    }
    makeBox(g,[6.8,.08,.08],[0,.12,4.36],material('#bd916a'));
    const desks=[[-2.3,-.55], [1.5,-.55],[-1.45,2.65],[2.1,2.65]];
    desks.forEach(([x,z],idx)=>{workDesk(g,x,z,0);chair(g,x,z+.91,0);if(idx!==3)worker(g,x,z-.60,['#b57558','#4f8981','#bca17d'][idx]);});
    plant(g,-4.35,3.2,1.4);plant(g,4.50,-3.2,1.35);
    makeBox(g,[2.2,1.2,.12],[3.5,1.9,-4.18],black);
    plane(g,1.92,.48,3.5,2,-4.09,label('AgentOffice',24),0);
    for(let k=0;k<5;k++){makeBox(g,[.40,.06,.42],[3.6,1.18+k*.17, -3.9],material(k%2?'#b27a58':'#5d9991'));}
    // Warm pendant fixtures create credible depth in closeups.
    for(let [x,z] of [[-1.2,1],[3,1]]){
      cylinder(g,.03,.03,1.2,x,4.5,z,darkSteel);
      const lamp=cylinder(g,.28,.46,.24,x,3.78,z,black);lamp.castShadow=false;
      const bulb=new THREE.PointLight(0xffd9ae,2.6,8);bulb.position.set(x,3.56,z);g.add(bulb);
    }
    targetCam.set(0,.9,0);lookAt.copy(targetCam);
  }
  const picks=[];
  function fullOffice(){
    makeBox(scene,[25,.35,17],[0,-.28,0],floorMat);
    for(let i=0;i<13;i++)makeBox(scene,[.018,.018,16.9],[-12+i*2,-.095,0],lineMat,false);
    const positions=[[-8.1,-4.2],[-2.7,-4.2],[2.7,-4.2],[8.1,-4.2],[-5.4,3.15],[0,3.15],[5.4,3.15]];
    positions.forEach(([x,z],idx)=>{const o=room(idx,x,z,palette[idx]);picks.push(o);});
    makeBox(scene,[23,.19,1.05],[0,.0,0],wood);
    targetCam.set(0,0,0);lookAt.copy(targetCam);
  }
  scene.add(new THREE.HemisphereLight(0xf8f4e7,0x556a65,2.1));
  const sun=new THREE.DirectionalLight(0xfff0d7,3.5);sun.position.set(-15,25,17);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=25;sun.shadow.camera.bottom=-25;sun.shadow.normalBias=.03;scene.add(sun);
  const bounce=new THREE.DirectionalLight(0xc8e9e3,1.2);bounce.position.set(10,10,-9);scene.add(bounce);
  if(full)fullOffice();else previewScene();
  function resize(){const w=target.clientWidth,h=target.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(target);resize();
  function pointerDown(e){dragging=true;lastPointer=e.clientX;renderer.domElement.setPointerCapture?.(e.pointerId);}
  function pointerMove(e){if(!dragging)return;orbit=Math.max(-.9,Math.min(.85,orbit+(e.clientX-lastPointer)*.003));lastPointer=e.clientX;}
  function pointerUp(e){dragging=false;try{renderer.domElement.releasePointerCapture(e.pointerId)}catch{};}
  function wheel(e){if(!full)return;e.preventDefault();distance=Math.max(24,Math.min(65,distance+e.deltaY*.025));}
  function click(e){if(!full||dragging)return;const rect=renderer.domElement.getBoundingClientRect();const p=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);const caster=new THREE.Raycaster();caster.setFromCamera(p,camera);const hits=caster.intersectObjects(picks,true);if(hits.length){let obj=hits[0].object;while(obj && !('room' in (obj.userData||{})))obj=obj.parent;if(obj){selected=obj.userData.room;onRoom(selected);}}}
  let downPos=null;
  renderer.domElement.addEventListener('pointerdown',e=>{downPos=[e.clientX,e.clientY];pointerDown(e);});
  renderer.domElement.addEventListener('pointermove',pointerMove);
  renderer.domElement.addEventListener('pointerup',e=>{const isClick=downPos&&Math.hypot(e.clientX-downPos[0],e.clientY-downPos[1])<4;pointerUp(e);if(isClick)click(e);});
  renderer.domElement.addEventListener('wheel',wheel,{passive:false});
  function animate(){if(disposed)return;raf=requestAnimationFrame(animate);if(full){const dist=distance;goalCam.set(Math.sin(.75+orbit)*dist*.52,dist*.60,Math.cos(.75+orbit)*dist*.64);}else{goalCam.set(11.5,8.6,14);}
    camera.position.lerp(goalCam,lowMotion?1:.055);lookAt.lerp(targetCam,lowMotion?1:.065);camera.lookAt(lookAt);renderer.render(scene,camera);
  }
  animate();
  return {focusRoom(index){if(!full)return;const loc=picks[index];if(!loc)return;selected=index;targetCam.copy(loc.position).add(new THREE.Vector3(0,1,0));distance=26;onRoom(index);},overview(){selected=null;targetCam.set(0,0,0);distance=45;},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();renderer.dispose();renderer.domElement.remove();scene.traverse(o=>{o.geometry?.dispose?.();const m=o.material;if(Array.isArray(m))m.forEach(x=>x.dispose?.());else m?.dispose?.();});}};
}
