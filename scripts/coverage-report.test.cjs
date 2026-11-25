const {test}=require('node:test');
const assert=require('node:assert/strict');
const {collect}=require('./run-coverage.cjs');
const fixture=(file,hit=2)=>['TN:','SF:'+file,'FNF:1','FNH:1','BRF:2','BRH:1','LF:3','LH:'+hit,'end_of_record',''].join('\n');
test('normalizes LCOV paths and lists unmeasured files without inflating coverage',()=>{
  const files=['app/electron/identity.cjs','app/src/main.js'];
  const {lcov,report}=collect(fixture('electron/identity.cjs'),files);
  assert.match(lcov,/SF:app\/electron\/identity\.cjs/);
  assert.deepEqual(report.unmeasuredFiles,['app/src/main.js']);
  assert.equal(report.totals.lines.percent,66.67);
  assert.equal(report.totals.branches.percent,50);
  assert.ok(report.missingRequired.includes('app/electron/update-policy.cjs'));
});
test('rejects unknown source, duplicate records, and impossible hit counts',()=>{
  const file='electron/identity.cjs',files=['app/'+file];
  assert.throws(()=>collect(fixture('electron/unexpected.cjs'),files),/Unexpected coverage source/);
  assert.throws(()=>collect(fixture(file)+fixture(file),files),/Duplicate coverage source/);
  assert.throws(()=>collect(fixture(file,4),files),/Invalid hit count/);
});

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {main}=require('./run-coverage.cjs');
const required=['electron/identity.cjs','electron/update-policy.cjs','src/office-performance.mjs','src/office-batching.mjs'];
function setup(t){
  const rootDir=fs.mkdtempSync(path.join(os.tmpdir(),'agentoffice-coverage-'));
  t.after(()=>fs.rmSync(rootDir,{recursive:true,force:true}));
  const write=(name,body='')=>{
    const file=path.join(rootDir,name);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,body);
  };
  for(const file of required)write('app/'+file,'// fixture');
  write('app/src/nested/unmeasured.js','// fixture');
  write('app/src/README.md');
  write('app/scripts/identity.test.cjs');
  write('app/scripts/office-performance.test.mjs');
  write('app/scripts/README.md');
  const reportFile=path.join(rootDir,'coverage','raw-lcov.info');
  const raw=required.map(file=>fixture(file)).join('');
  const run=(_exe,args,options)=>{
    assert.equal(options.cwd,path.join(rootDir,'app'));
    assert.equal(options.env.NODE_V8_COVERAGE,undefined);
    assert.ok(args.includes('--experimental-test-coverage'));
    assert.deepEqual(args.slice(-2),['scripts/identity.test.cjs','scripts/office-performance.test.mjs']);
    fs.writeFileSync(reportFile,raw);
    return {status:0};
  };
  return {rootDir,write,reportFile,raw,run};
}
test('runner inventories nested sources, runs required tests and writes actual report files',t=>{
  const f=setup(t), summary=path.join(f.rootDir,'step-summary.md'), messages=[];
  f.write('coverage/lcov.info','stale');
  const report=main({rootDir:f.rootDir,run:f.run,environment:{NODE_V8_COVERAGE:'old',GITHUB_STEP_SUMMARY:summary},log:s=>messages.push(s)});
  assert.equal(report.testExitCode,0);
  assert.equal(report.totals.lines.hit,8);
  assert.deepEqual(report.unmeasuredFiles,['app/src/nested/unmeasured.js']);
  assert.deepEqual(report.missingRequired,[]);
  assert.match(fs.readFileSync(path.join(f.rootDir,'coverage','lcov.info'),'utf8'),/SF:app\/src\/office-performance\.mjs/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.rootDir,'coverage','summary.json'),'utf8')),report);
  assert.match(fs.readFileSync(summary,'utf8'),/66.67%/);
  assert.equal(messages.length,1);
});
test('runner fails closed on missing source, missing test, and absent LCOV',t=>{
  const f=setup(t),opts={rootDir:f.rootDir,log:()=>{},environment:{}};
  const missing=path.join(f.rootDir,'app',required[0]);
  fs.rmSync(missing);
  assert.throws(()=>main({...opts,run:f.run}),/Missing expected production source/);
  f.write('app/'+required[0]);
  fs.rmSync(path.join(f.rootDir,'app/scripts/identity.test.cjs'));
  assert.throws(()=>main({...opts,run:f.run}),/Missing mandatory test/);
  f.write('app/scripts/identity.test.cjs');
  assert.throws(()=>main({...opts,run:()=>({status:0})}),/Missing LCOV output/);
});
test('runner rejects child failure and missing required coverage without hiding the report',t=>{
  const f=setup(t),opts={rootDir:f.rootDir,log:()=>{},environment:{}};
  const error=new Error('spawn failed');
  assert.throws(()=>main({...opts,run:()=>({error})}),/spawn failed/);
  assert.throws(()=>main({...opts,run:(...args)=>{f.run(...args);return {status:1};}}),/Unit tests failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.rootDir,'coverage/summary.json'),'utf8')).testExitCode,1);
  assert.throws(()=>main({...opts,run:()=>{fs.writeFileSync(f.reportFile,fixture(required[0]));return {status:0};}}),/Required modules/);
});
test('LCOV rejects absent, duplicate or nonnumeric counters and malformed source entries',()=>{
  const file='electron/identity.cjs',files=['app/'+file],raw=fixture(file);
  assert.throws(()=>collect(raw.replace('SF:'+file,''),files),/Invalid LCOV source/);
  assert.throws(()=>collect(raw.replace('LH:2',''),files),/Missing or duplicate LH/);
  assert.throws(()=>collect(raw.replace('LH:2','LH:2\nLH:2'),files),/Missing or duplicate LH/);
  assert.throws(()=>collect(raw.replace('LH:2','LH:no'),files),/Invalid count/);
  const result=collect('',files);
  assert.equal(result.report.totals.lines.percent,null);
  assert.deepEqual(result.report.unmeasuredFiles,files);
});
