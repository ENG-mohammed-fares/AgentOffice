// Initial scoped refactoring gate. No network, paid service or modified working source.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {SourceTextModule} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const baseline='b46d45976cd198e8aa4219e4a48ffb5bf496ac4b';
const production='app/src/office-performance.mjs';
const report={schemaVersion:1,baseline,scope:production,checks:{},mutations:[]};
const read=p=>readFileSync(join(root,p),'utf8');
const load=async (source)=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function scheduler(module, operations){
  let seq=0, pending=new Map(), draws=[], canceled=[];
  const s=module.makeFrameScheduler(fn=>{pending.set(++seq,fn);return seq;},
    id=>{canceled.push(id);pending.delete(id);},t=>draws.push(t));
  const trace=[];
  for(let i=0;i<operations.length;i++){
    const op=operations[i];
    if(op==='tick'){
      const entries=[...pending];for(const [id,fn] of entries){pending.delete(id);fn(i);}
    }else s[op]();
    trace.push({pending:pending.size,draws:[...draws],canceled:[...canceled]});
  }
  return trace;
}
function resolution(module,max,ops){
  const c=module.makeResolutionController(max);
  return ops.map(op=>({changed:op==='restore'?c.restore():c.sample(op),ratio:c.ratio}));
}
function characterize(m){
  const t=scheduler(m,['request','request','tick','request','pause','request','resume','dispose','resume','tick']);
  assert.deepEqual(t.map(x=>x.pending),[1,1,0,1,0,0,1,0,0,0]);
  assert.deepEqual(t.at(-1).draws,[2]);
  assert.deepEqual(t.at(-1).canceled,[2,3]);
  const c=resolution(m,1,[35,35,35,35,35,35,'restore','restore']);
  assert.deepEqual(c.map(x=>x.changed),[false,false,false,false,false,true,true,false]);
  assert.equal(c[5].ratio,.82);
  assert.equal(c[6].ratio,1);
  const slow=resolution(m,1,Array(100).fill(350));
  assert.equal(slow.at(-1).ratio,.55);
  assert.ok(slow.every(x=>x.ratio>=.55&&x.ratio<=1));
  const recover=resolution(m,1,[...Array(40).fill(35),...Array(250).fill(8)]);
  assert.equal(recover.at(-1).ratio,1);
  const reset=resolution(m,1,[35,35,35,35,35,NaN,35]);
  assert.equal(reset.at(-1).ratio,1);
  const paused=scheduler(m,['pause','request','tick']);
  assert.deepEqual(paused.map(x=>x.pending),[0,0,0]);
  const low=resolution(m,.2,['restore',35]);
  assert.equal(low.at(-1).ratio,.5);
}
function differential(previous,current){
  const ops=['request','pause','resume','dispose','tick'];
  const samples=[0,-1,NaN,Infinity,8,14,15,24,25,35,350,'restore'];
  for(let seed=1;seed<=32;seed++){
    let state=seed;
    const next=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
    const actions=Array.from({length:96},()=>ops[next(ops.length)]);
    assert.deepEqual(scheduler(current,actions),scheduler(previous,actions),'Scheduler changed at seed '+seed);
    const frames=Array.from({length:256},()=>samples[next(samples.length)]);
    const max=[.2,.5,1,1.75,3][seed%5];
    assert.deepEqual(resolution(current,max,frames),resolution(previous,max,frames),'Resolution changed at seed '+seed);
  }
}
function staticImports(source){
  const mod=new SourceTextModule(source);
  // Node 22 exposes dependencySpecifiers; moduleRequests is the newer equivalent.
  return mod.moduleRequests?mod.moduleRequests.map(r=>r.specifier):mod.dependencySpecifiers;
}
function enforceImports(source,allowed,{dynamic=false}={}){
  for(const name of staticImports(source))assert.ok(allowed(name),'Forbidden static dependency: '+name);
  assert.ok(!/\brequire\s*\(/.test(source),'CommonJS require in renderer/pure module');
  assert.ok(dynamic||!/\bimport\s*\(/.test(source),'Unexpected dynamic import');
  assert.ok(!/\b(?:eval|Function)\s*\(/.test(source),'Dynamic code evaluation');
}
function architecture(){
  const pure=read(production);
  enforceImports(pure,()=>false);
  assert.ok(!/\b(?:window|document|process|fetch|XMLHttpRequest)\b/.test(pure),'Pure policy has environment dependency');
  const three=s=>s==='three'||s.startsWith('three/addons/');
  enforceImports(read('app/src/office-batching.mjs'),three);
  enforceImports(read('app/src/agile-renderer.js'),s=>three(s)||['./agile-layout.json','./office-performance.mjs','./office-batching.mjs'].includes(s));
  const main=read('app/src/main.js');
  enforceImports(main,s=>['./style.css','./agile-office.css','./auth.js','./loading-intro.js'].includes(s),{dynamic:true});
  const dynamic=[...main.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(m=>m[2]);
  assert.deepEqual(dynamic,['./agile-renderer.js']);
  assert.equal((main.match(/\bimport\s*\(/g)||[]).length,dynamic.length,'Computed renderer import is not allowed');
  const crash=read('app/electron/crash-monitor.cjs');
  const deps=[...crash.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)].map(m=>m[2]);
  assert.deepEqual([...new Set(deps)].sort(),['node:crypto','node:fs','node:path']);
  assert.equal((crash.match(/\brequire\s*\(/g)||[]).length,deps.length,'Computed crash monitor require');
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\(/.test(crash),'Unexpected crash monitor transport or evaluation');
  // Negative controls ensure the architecture rule actually rejects violations.
  assert.throws(()=>enforceImports("import fs from 'node:fs';",()=>false),assert.AssertionError);
  assert.throws(()=>enforceImports("import('node:fs');",()=>false),assert.AssertionError);
  assert.throws(()=>enforceImports("require('electron');",()=>false),assert.AssertionError);
}
const mutations=[
  ['remove frame deduplication','||id!==null',''],
  ['ignore paused scheduler','if(paused||disposed||id!==null)','if(disposed||id!==null)'],
  ['allow resume after disposal','resume(){if(disposed)return;','resume(){disposed=false;'],
  ['change slow threshold','if(slow>=6)','if(slow>=7)'],
  ['remove resolution lower clamp','Math.max(min,ratio*.82)','ratio*.82'],
  ['break resolution restore','ratio=max;reset();return changed','ratio=min;reset();return changed'],
  ['ignore invalid samples','if(!Number.isFinite(ms)||ms<=0){reset();return false;}','if(!Number.isFinite(ms)||ms<=0){return false;}']
];
async function main(){
  const source=read(production);
  const old=execFileSync('git',['show',baseline+':assets/agile-office/office-performance.mjs'],{cwd:root,encoding:'utf8'});
  const previous=await load(old),current=await load(source);
  characterize(previous);characterize(current);
  report.checks.characterization='passed';
  differential(previous,current);
  report.checks.differential={status:'passed',seeds:32,schedulerOperationsPerSeed:96,resolutionSamplesPerSeed:256};
  architecture();
  report.checks.architecture='passed';
  for(const [name,anchor,replacement] of mutations){
    // Mutants must target a unique real production expression. A stale mutation
    // anchor is a review failure, not an automatically killed mutant.
    assert.equal(source.split(anchor).length,2,'Stale mutation anchor: '+name);
    const changed=source.replace(anchor,()=>replacement);
    const mutant=await load(changed); // Syntax/loader errors fail the gate.
    let killed=false;
    try{characterize(mutant);}catch(e){if(!(e instanceof assert.AssertionError))throw e;killed=true;}
    report.mutations.push({name,killed});
  }
  const killed=report.mutations.filter(m=>m.killed).length;
  report.checks.mutation={killed,total:mutations.length,score:killed/mutations.length*100};
  assert.equal(killed,mutations.length,'Targeted surviving mutations require stronger tests');
  report.checks.refactoringGate='passed';
}
try{await main();}catch(error){
  report.checks.refactoringGate='failed';
  console.error(error);
  process.exitCode=1;
}finally{
  mkdirSync(join(root,'refactoring-report'),{recursive:true});
  writeFileSync(join(root,'refactoring-report','summary.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
