import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeFrameScheduler,makeResolutionController} from '../src/office-performance.mjs';
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
