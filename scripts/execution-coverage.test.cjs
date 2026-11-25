'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {convert} = require('./coverage-tools/convert.cjs');
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentoffice-execution-'));
  const aliases={
    'app/src/main.js':'assets/agile-office/main.js',
    'app/src/agile-renderer.js':'assets/agile-office/agile-renderer.js',
    'app/src/agile-office.css':'assets/agile-office/agile-office.css',
    'app/src/office-performance.mjs':'assets/agile-office/office-performance.mjs',
    'app/src/office-batching.mjs':'assets/agile-office/office-batching.mjs',
    'app/src/office-tasks.mjs':'assets/agile-office/office-tasks.mjs',
    'app/src/office-task-panel.mjs':'assets/agile-office/office-task-panel.mjs',
    'app/src/agent-animation.mjs':'assets/agile-office/agent-animation.mjs',
    'app/src/office-characters.mjs':'assets/agile-office/office-characters.mjs',
    'app/electron/crash-monitor.cjs':'assets/crash-monitor/crash-monitor.cjs'};
  for(const file of Object.entries(aliases).flat()) {
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
    fs.writeFileSync(path.join(root,file),'// identical fixture overlay\n');
  }
  const dir=path.join(root,'coverage','v8');fs.mkdirSync(dir,{recursive:true});
  const source=path.join(root,'app/electron/auth.cjs');
  fs.writeFileSync(source,"module.exports = function authenticate(allowed) {\n  if (allowed) {\n    return 'granted';\n  }\n  return 'denied';\n};\n");
  const execute=value=>{
    const result=spawnSync(process.execPath,['-e','require('+JSON.stringify(source)+')('+value+')'],
      {env:{...process.env,NODE_V8_COVERAGE:dir},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  };
  return {root,dir,execute,clean:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('imports real V8 execution, retains uncovered lines, and merges repeated processes',async()=>{
  const f=fixture();
  try{
    f.execute(true);await convert(f.root,[f.dir]);
    const report=()=>fs.readFileSync(path.join(f.root,'coverage/execution-lcov.info'),'utf8');
    assert.match(report(),/SF:app\/electron\/auth.cjs/);
    assert.match(report(),/DA:5,0/,'unexecuted rejection branch must stay uncovered');
    f.execute(false);await convert(f.root,[f.dir]);
    assert.match(report(),/DA:5,[1-9]/,'later measured rejection execution must merge');
    assert.doesNotMatch(report(),/node:internal|node_modules|execution-coverage.test/);
  }finally{f.clean()}
});
test('rejects absent execution evidence rather than inventing a passing report',async()=>{
  const f=fixture();
  try{await assert.rejects(convert(f.root,[f.dir]),/Missing actual Electron/)}
  finally{f.clean()}
});
test('maps actual bundled execution back to original renderer source lines',async()=>{
  const f=fixture();
  try{
    f.execute(true);
    const original=fs.readFileSync(path.join(f.root,'app/electron/auth.cjs'),'utf8');
    const bundle=path.join(f.root,'app/dist/assets/fixture.js');
    fs.mkdirSync(path.dirname(bundle),{recursive:true});
    fs.writeFileSync(path.join(f.root,'app/src/auth-view.js'),original);
    fs.writeFileSync(bundle,original+'//# sourceMappingURL=fixture.js.map\n');
    fs.writeFileSync(bundle+'.map',JSON.stringify({version:3,file:'fixture.js',sources:['../../src/auth-view.js'],
      sourcesContent:[original],names:[],mappings:'AAAA;AACA;AACA;AACA;AACA;AACA'}));
    const result=spawnSync(process.execPath,['-e','require('+JSON.stringify(bundle)+')(true)'],
      {env:{...process.env,NODE_V8_COVERAGE:f.dir},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    await convert(f.root,[f.dir]);
    const report=fs.readFileSync(path.join(f.root,'coverage/execution-lcov.info'),'utf8');
    assert.match(report,/SF:app\/src\/auth-view.js/);
    const renderer=report.split('SF:app/src/auth-view.js')[1];
    assert.match(renderer,/DA:3,[1-9]/);
    assert.match(renderer,/DA:5,0/);
    assert.doesNotMatch(report,/SF:.*dist\/assets/);
  }finally{f.clean()}
});
test('refuses to transfer coverage after canonical overlay bytes change',async()=>{
  const f=fixture();
  try{
    f.execute(true);
    fs.writeFileSync(path.join(f.root,'assets/agile-office/main.js'),'// changed\n');
    await assert.rejects(convert(f.root,[f.dir]),/Overlay bytes differ/);
  }finally{f.clean()}
});
