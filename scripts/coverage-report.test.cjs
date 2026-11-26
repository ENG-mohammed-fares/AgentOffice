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
const required=['electron/identity.cjs','electron/update-policy.cjs','src/office-performance.mjs','src/office-batching.mjs','src/screen-content.mjs'];
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
  write('app/scripts/screen-content.test.mjs');
  write('app/scripts/README.md');
  const reportFile=path.join(rootDir,'coverage','raw-lcov.info');
  const raw=required.map(file=>fixture(file)).join('');
  const run=(_exe,args,options)=>{
    assert.equal(options.cwd,path.join(rootDir,'app'));
    assert.equal(options.env.NODE_V8_COVERAGE,undefined);
    assert.ok(args.includes('--experimental-test-coverage'));
    assert.deepEqual(args.slice(-3),['scripts/identity.test.cjs','scripts/office-performance.test.mjs','scripts/screen-content.test.mjs']);
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
  assert.equal(report.totals.lines.hit,10);
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

const {canonicalize,writeCanonical,overlays}=require('./run-coverage.cjs');
test('Sonar analyzes canonical overlays once and excludes their byte-identical prepared copies',()=>{
  const properties=fs.readFileSync(path.join(__dirname,'..','sonar-project.properties'),'utf8');
  const line=properties.split(/\\r?\\n/).find(x=>x.startsWith('sonar.exclusions='));
  assert.ok(line,'Sonar exclusions must be explicit');
  const excluded=new Set(line.slice('sonar.exclusions='.length).split(','));
  for(const [prepared,canonical] of Object.entries(overlays)){
    assert.ok(excluded.has(prepared),'Prepared duplicate is not excluded: '+prepared);
    assert.ok(!excluded.has(canonical),'Canonical tracked source must remain analyzed: '+canonical);
  }
});
test('canonical mapping transfers only actual measurements from byte-identical overlays',t=>{
  const f=setup(t),aliases={'app/src/office-performance.mjs':'assets/office-performance.mjs'};
  f.write('assets/office-performance.mjs','// fixture');
  const raw='SF:app/src/office-performance.mjs\nDA:1,2\nend_of_record\nSF:app/electron/identity.cjs\nDA:1,0\nend_of_record\n';
  assert.equal(canonicalize(raw,f.rootDir,aliases),raw.replace('SF:app/src/office-performance.mjs','SF:assets/office-performance.mjs'));
  assert.throws(()=>canonicalize(raw+'SF:assets/office-performance.mjs\n',f.rootDir,aliases),/Duplicate canonical/);
  assert.throws(()=>canonicalize(raw,f.rootDir,{...aliases,'app/src/other.js':'assets/office-performance.mjs'}),/Duplicate overlay destination/);
  f.write('assets/office-performance.mjs','different');
  assert.throws(()=>canonicalize(raw,f.rootDir,aliases),/Overlay bytes differ/);
  fs.rmSync(path.join(f.rootDir,'assets/office-performance.mjs'));
  assert.throws(()=>canonicalize(raw,f.rootDir,aliases),/ENOENT/);
});
test('canonical writer rejects failed coverage and missing or low task module coverage',t=>{
  const f=setup(t),file='coverage/summary.json',a='app/src/office-tasks.mjs',b='app/src/office-task-panel.mjs';
  f.write(file,JSON.stringify({testExitCode:1}));assert.throws(()=>writeCanonical(f.rootDir),/failed test coverage/);
  f.write(file,JSON.stringify({testExitCode:0,measuredFiles:{}}));assert.throws(()=>writeCanonical(f.rootDir),/below 80%/);
  f.write(file,JSON.stringify({testExitCode:0,measuredFiles:{[a]:{lines:{total:10,hit:10}},[b]:{lines:{total:10,hit:7}}}}));assert.throws(()=>writeCanonical(f.rootDir),/below 80%/);
  const mappings={'app/src/main.js':'assets/agile-office/main.js','app/src/agile-renderer.js':'assets/agile-office/agile-renderer.js','app/src/agile-office.css':'assets/agile-office/agile-office.css','app/src/office-performance.mjs':'assets/agile-office/office-performance.mjs','app/src/office-batching.mjs':'assets/agile-office/office-batching.mjs',[a]:'assets/agile-office/office-tasks.mjs',[b]:'assets/agile-office/office-task-panel.mjs','app/src/agent-animation.mjs':'assets/agile-office/agent-animation.mjs','app/src/office-characters.mjs':'assets/agile-office/office-characters.mjs','app/src/screen-content.mjs':'assets/agile-office/screen-content.mjs','app/src/office-motion.mjs':'assets/agile-office/office-motion.mjs','app/electron/crash-monitor.cjs':'assets/crash-monitor/crash-monitor.cjs'};
  for(const [from,to] of Object.entries(mappings)){f.write(from,'identical');f.write(to,'identical')}
  f.write(file,JSON.stringify({testExitCode:0,measuredFiles:{[a]:{lines:{total:10,hit:10}},[b]:{lines:{total:10,hit:8}}}}));
  f.write('coverage/lcov.info','SF:'+a+'\nDA:1,3\nend_of_record\nSF:'+b+'\nDA:1,1\nend_of_record\n');
  const result=writeCanonical(f.rootDir);assert.match(result,/SF:assets\/agile-office\/office-task-panel.mjs/);
  assert.equal(fs.readFileSync(path.join(f.rootDir,'coverage/sonar-lcov.info'),'utf8'),result);
});
