'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {createRecorder,installCrashMonitor,LIMIT,MAX_AGE_MS}=require('../electron/crash-monitor.cjs');

function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ao-crash-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let now=1800000000000;
  const recorder=createRecorder({directory:()=>dir,version:'1.6.15',clock:()=>now});
  const reports=()=>fs.readdirSync(dir).filter(n=>n.startsWith('incident-')).map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8')));
  return {dir,recorder,reports,advance:ms=>{now+=ms}};
}
test('records allowlisted metadata only; never records credentials or arbitrary error contents',t=>{
  const {recorder,reports}=setup(t);
  assert.equal(recorder.record('renderer',{reason:'crashed',exitCode:123,url:'https://example.com/?token=secret',stack:'secret',email:'secret'}),true);
  assert.equal(recorder.record('child',{type:'GPU',reason:'oom',exitCode:4294967295,serviceName:'secret'}),true);
  assert.equal(recorder.record('main',{origin:'unhandledRejection',message:'secret'}),true);
  const rows=reports();
  assert.equal(rows.length,3);
  assert.ok(!JSON.stringify(rows).includes('secret'));
  assert.equal(rows.find(r=>r.process==='child').childType,'GPU');
  assert.equal(rows.find(r=>r.process==='main').origin,'unhandledRejection');
  assert.equal(rows.find(r=>r.process==='renderer').reason,'crashed');
  assert.equal(recorder.record('renderer',{reason:'clean-exit'}),false);
  assert.equal(recorder.record('invalid',{reason:'crashed'}),false);
  assert.equal(recorder.record('child',{reason:'secret',type:'secret',exitCode:'secret'}),true);
  assert.ok(reports().some(r=>r.reason==='unknown'&&r.childType==='Unknown'&&r.exitCode===null));
});
test('retention caps count and deletes expired incidents without deleting unrelated files',t=>{
  const {dir,recorder,reports,advance}=setup(t);
  fs.writeFileSync(path.join(dir,'unrelated.txt'),'keep');
  for(let i=0;i<LIMIT+5;i++){advance(1);assert.equal(recorder.record('renderer',{reason:'oom'}),true);}
  assert.equal(reports().length,LIMIT);
  advance(MAX_AGE_MS+1);
  assert.equal(recorder.cleanup(),true);
  assert.equal(reports().length,0);
  assert.equal(fs.readFileSync(path.join(dir,'unrelated.txt'),'utf8'),'keep');
});
test('storage failures are contained',t=>{
  const {dir}=setup(t),file=path.join(dir,'not-a-directory');
  fs.writeFileSync(file,'x');
  const recorder=createRecorder({directory:()=>file,version:'invalid'});
  assert.equal(recorder.cleanup(),false);
  assert.equal(recorder.record('main'),false);
});
test('Electron and Node event wiring observes rather than handles fatal exceptions',t=>{
  const {dir}=setup(t),app=new EventEmitter(),processTarget=new EventEmitter();
  app.getPath=key=>{assert.equal(key,'userData');return dir;};
  app.getVersion=()=> '1.6.15';
  app.isReady=()=>false;
  const stop=installCrashMonitor({app,processTarget});
  t.after(stop);
  app.emit('ready');
  app.emit('render-process-gone',{}, {},{reason:'crashed',exitCode:1});
  app.emit('child-process-gone',{}, {reason:'oom',type:'GPU',exitCode:1});
  processTarget.emit('uncaughtExceptionMonitor',Error('secret'),'uncaughtException');
  assert.equal(processTarget.listenerCount('uncaughtException'),0);
  const directory=path.join(dir,'crash-incidents');
  assert.equal(fs.readdirSync(directory).length,3);
  stop();
  assert.equal(app.listenerCount('render-process-gone'),0);
  assert.equal(processTarget.listenerCount('uncaughtExceptionMonitor'),0);
});
