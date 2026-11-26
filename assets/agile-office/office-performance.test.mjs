import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {makeFrameScheduler,makeResolutionController,graphicsPixelRatio,makeFrameMetrics,makeStartupDeadline} from '../src/office-performance.mjs';
import {optimizeStaticMeshes} from '../src/office-batching.mjs';
test('idle, hidden and disposed render scheduler does not loop',()=>{
 let i=0,frames=new Map(),count=0;const s=makeFrameScheduler(fn=>{frames.set(++i,fn);return i},id=>frames.delete(id),()=>count++);
 s.request();s.request();assert.equal(frames.size,1);const [id,fn]=[...frames][0];frames.delete(id);fn(1);assert.equal(count,1);assert.equal(frames.size,0);
 s.request();s.pause();assert.equal(frames.size,0);s.request();assert.equal(frames.size,0);s.resume();assert.equal(frames.size,1);s.dispose();assert.equal(frames.size,0);s.request();assert.equal(frames.size,0);
});
test('adaptive resolution drops under sustained load and restores full idle quality',()=>{
 const c=makeResolutionController(1.75);for(let i=0;i<40;i++)c.sample(35);assert.ok(c.ratio<1.75&&c.ratio>=.55*1.75);assert.ok(c.restore());assert.equal(c.ratio,1.75);assert.equal(c.restore(),false);
});
test('opaque geometry merges; shared geometry instances; glass stays independent',()=>{
 const root=new THREE.Group(),mat=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true}),shared=new THREE.BoxGeometry();
 for(let i=0;i<3;i++){const m=new THREE.Mesh(shared,mat);m.position.x=i;root.add(m);}
 for(let i=0;i<2;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(),mat);m.position.y=i;root.add(m);}
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),glass),new THREE.Mesh(new THREE.BoxGeometry(),glass));
 const r=optimizeStaticMeshes(root);assert.deepEqual(r,{before:7,after:4,instances:3});assert.equal(root.children.filter(x=>x.material===glass).length,2);assert.equal(root.children.find(x=>x.isInstancedMesh).count,3);assert.equal(root.children.find(x=>x.userData.sourceRanges).userData.sourceRanges.length,2);
});

test('very slow rendering still reduces resolution',()=>{
 const c=makeResolutionController(1);for(let i=0;i<40;i++)c.sample(350);assert.ok(c.ratio<.8);assert.ok(c.ratio>=.55);
});
test('actual packaged office: preserve all triangles and transparent materials during batching',()=>{
 const raw=readFileSync(new URL('../public/office/office.glb',import.meta.url));const n=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+n).toString('utf8'));const binStart=28+n;
 const root=new THREE.Group(),mats=doc.materials.map(m=>new THREE.MeshStandardMaterial({name:m.name,transparent:m.alphaMode==='BLEND'}));
 const classes={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array,5122:Int16Array,5120:Int8Array};
 const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 const attr=idx=>{const a=doc.accessors[idx],v=doc.bufferViews[a.bufferView],C=classes[a.componentType],size=sizes[a.type];assert.ok(C&&size&&!a.sparse&&!v.byteStride,'expected tightly packed office attribute');const offset=binStart+(v.byteOffset||0)+(a.byteOffset||0);const buf=raw.subarray(offset,offset+a.count*size*C.BYTES_PER_ELEMENT);return new THREE.BufferAttribute(new C(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)),size,!!a.normalized);};
 const key={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',TEXCOORD_1:'uv1',COLOR_0:'color',TANGENT:'tangent'};
 for(const node of doc.nodes){if(node.mesh===undefined)continue;for(const p of doc.meshes[node.mesh].primitives){const g=new THREE.BufferGeometry();for(const [name,id] of Object.entries(p.attributes)){assert.ok(key[name],name);g.setAttribute(key[name],attr(id));}if(p.indices!==undefined)g.setIndex(attr(p.indices));const mesh=new THREE.Mesh(g,mats[p.material]);mesh.name=node.name;mesh.castShadow=!mesh.name.toLowerCase().includes('glass')&&!mesh.name.toLowerCase().includes('sky');mesh.receiveShadow=true;if(node.matrix){mesh.matrix.fromArray(node.matrix);mesh.matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);}else{if(node.translation)mesh.position.fromArray(node.translation);if(node.rotation)mesh.quaternion.fromArray(node.rotation);if(node.scale)mesh.scale.fromArray(node.scale);}root.add(mesh);}}
 const totals=()=>{let triangles=0,glass=0;root.traverse(m=>{if(m.isMesh){triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*(m.isInstancedMesh?m.count:1);if(m.material.transparent)glass++;}});return {triangles,glass};};
 const before=totals(),result=optimizeStaticMeshes(root),after=totals();assert.deepEqual(after,before);assert.equal(before.triangles,116332);assert.ok(result.after<result.before);console.log('ACTUAL OFFICE:',JSON.stringify({...result,...after}));
});

test('stable motion resolution ignores short stalls, reduces gradually and holds quality',()=>{
 const c=makeResolutionController(1.25,{stable:true});
 for(let i=0;i<11;i++)assert.equal(c.sample(35),false);
 assert.equal(c.sample(35),true);assert.equal(c.ratio,1.125);
 for(let i=0;i<24;i++)assert.equal(c.sample(35),false);
 for(let i=0;i<120;i++)c.sample(60);
 assert.equal(c.ratio,.875);
 for(let i=0;i<300;i++)c.sample(8);
 assert.ok(c.ratio>.875&&c.ratio<=1.25);
 assert.equal(c.restore(),true);assert.equal(c.ratio,1.25);
});
test('graphics presets cap physical pixel load independently of UI size',()=>{
 assert.equal(graphicsPixelRatio('high',2,1920,1080),1.75);
 assert.equal(graphicsPixelRatio('balanced',2,1920,1080),1.25);
 assert.equal(graphicsPixelRatio('performance',2,3840,2160),.5);
 assert.equal(graphicsPixelRatio('unknown',2,1920,1080),1.25);
});
test('motion metrics use a bounded interval window without inventing idle FPS',()=>{
 const m=makeFrameMetrics(3);assert.equal(m.snapshot().fps,null);
 for(const x of [NaN,0,-1,10,20,30,40])m.record(x);
 const s=m.snapshot();assert.equal(s.samples,3);assert.equal(s.frameTimeMs,30);assert.equal(s.p95FrameIntervalMs,40);assert.equal(s.fps,1000/30);
});

test('startup failure deadline fires once and ignores cancelled or late callbacks',()=>{
 let calls=0,callback,delay,cancellations=0;
 const options={ms:60000,schedule(fn,ms){callback=fn;delay=ms;return 9;},cancel(id){assert.equal(id,9);cancellations++;}};
 const first=makeStartupDeadline(()=>calls++,options);
 assert.equal(delay,60000);first.cancel();first.cancel();callback();assert.equal(calls,0);assert.equal(cancellations,1);
 const second=makeStartupDeadline(()=>calls++,options);callback();callback();second.cancel();assert.equal(calls,1);assert.equal(cancellations,1);
});
