// Collect coverage from the current, fully prepared production source tree.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const required = [
  'app/electron/identity.cjs',
  'app/electron/update-policy.cjs',
  'app/src/office-performance.mjs',
  'app/src/office-batching.mjs'
];
const slash = p => p.split(path.sep).join('/');
function inventory(dir, rootDir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? inventory(p,rootDir) :
      entry.isFile() && /\.(js|cjs|mjs)$/i.test(entry.name) ? [slash(path.relative(rootDir,p))] : [];
  });
}
function collect(raw, files, rootDir=root) {
  const available = new Set(files);
  const records = new Map();
  const normalized = [];
  for (const record of raw.trim().split(/^end_of_record\r?$/m)) {
    if (!record.trim()) continue;
    const lines = record.trim().split(/\r?\n/);
    const sf = lines.filter(s=>s.startsWith('SF:'));
    assert.equal(sf.length,1,'Invalid LCOV source record');
    const absolute = path.resolve(rootDir,'app',sf[0].slice(3));
    const relative = slash(path.relative(rootDir,absolute));
    assert.ok(available.has(relative),'Unexpected coverage source: '+relative);
    assert.ok(!records.has(relative),'Duplicate coverage source: '+relative);
    const count = key => {
      const found=lines.filter(s=>s.startsWith(key+':'));
      assert.equal(found.length,1,'Missing or duplicate '+key+' for '+relative);
      const value=Number(found[0].slice(key.length+1));
      assert.ok(Number.isSafeInteger(value)&&value>=0,'Invalid count '+key);
      return value;
    };
    const metrics = {lines:{hit:count('LH'),total:count('LF')},
      branches:{hit:count('BRH'),total:count('BRF')},
      functions:{hit:count('FNH'),total:count('FNF')}};
    for (const m of Object.values(metrics)) assert.ok(m.hit<=m.total,'Invalid hit count');
    records.set(relative,metrics);
    normalized.push(lines.map(s=>s.startsWith('SF:')?'SF:'+relative:s).join('\n')+'\nend_of_record');
  }
  const totals={lines:{hit:0,total:0},branches:{hit:0,total:0},functions:{hit:0,total:0}};
  for (const metrics of records.values()) for (const key of Object.keys(totals)) {
    totals[key].hit+=metrics[key].hit;totals[key].total+=metrics[key].total;
  }
  for (const m of Object.values(totals)) m.percent=m.total?Number((100*m.hit/m.total).toFixed(2)):null;
  return {lcov:normalized.join('\n')+'\n',report:{
    schemaVersion:1,node:process.version,scope:'Loaded production JS modules from app/src and app/electron during Node unit tests only',
    totals,measuredFiles:Object.fromEntries([...records].sort(([a],[b])=>a.localeCompare(b))),
    unmeasuredFiles:files.filter(p=>!records.has(p)),requiredFiles:required,
    missingRequired:required.filter(p=>!records.has(p)||records.get(p).lines.hit===0)
  }};
}
function main({rootDir=root,run=spawnSync,environment=process.env,log=console.log}={}){
  const app=path.join(rootDir,'app');
  const output=path.join(rootDir,'coverage');
  const rawPath=path.join(output,'raw-lcov.info');
  const lcovPath=path.join(output,'lcov.info');
  const summaryPath=path.join(output,'summary.json');
  assert.ok(Number(process.versions.node.split('.')[0])>=22,'Node 22+ required');
  const files=[...inventory(path.join(app,'src'),rootDir),...inventory(path.join(app,'electron'),rootDir)].sort((a,b)=>a.localeCompare(b,'en'));
  for(const p of required)assert.ok(files.includes(p),'Missing expected production source: '+p);
  fs.mkdirSync(output,{recursive:true});
  for(const p of [rawPath,lcovPath,summaryPath])fs.rmSync(p,{force:true});
  const tests=fs.readdirSync(path.join(app,'scripts')).filter(s=>/\.test\.(js|cjs|mjs)$/.test(s)).sort((a,b)=>a.localeCompare(b,'en'));
  for(const p of ['identity.test.cjs','office-performance.test.mjs'])assert.ok(tests.includes(p),'Missing mandatory test: '+p);
  const env={...environment};
  delete env.NODE_V8_COVERAGE;
  const result=run(process.execPath,[
    '--test','--experimental-vm-modules','--experimental-test-coverage',
    '--test-coverage-include=src/**','--test-coverage-include=electron/**',
    '--test-reporter=spec','--test-reporter-destination=stdout',
    '--test-reporter=lcov','--test-reporter-destination='+rawPath,
    ...tests.map(p=>'scripts/'+p)
  ],{cwd:app,stdio:'inherit',env});
  if(result.error)throw result.error;
  assert.ok(fs.existsSync(rawPath),'Missing LCOV output');
  const {lcov,report}=collect(fs.readFileSync(rawPath,'utf8'),files,rootDir);
  report.tests=tests;
  report.testExitCode=result.status;
  fs.writeFileSync(lcovPath,lcov);
  fs.writeFileSync(summaryPath,JSON.stringify(report,null,2)+'\n');
  const lines=['## Unit-test code coverage (measured modules only)','',
    '| Metric | Covered | Total | Percentage |','|---|---:|---:|---:|',
    ...Object.entries(report.totals).map(([k,m])=>'| '+k+' | '+m.hit+' | '+m.total+' | '+(m.percent??'N/A')+'% |'),
    '', 'Measured source files: '+Object.keys(report.measuredFiles).length,
    'Unmeasured source files: '+report.unmeasuredFiles.length,
    'These percentages do not represent whole-app or Electron runtime coverage.',
    '', 'Full file inventory: coverage/summary.json. Sonar-compatible paths: coverage/lcov.info.',''];
  log(lines.join('\n'));
  if(environment.GITHUB_STEP_SUMMARY)fs.appendFileSync(environment.GITHUB_STEP_SUMMARY,lines.join('\n'));
  assert.equal(result.status,0,'Unit tests failed');
  assert.deepEqual(report.missingRequired,[],'Required modules must be measured with at least one covered line');
  assert.ok(report.totals.lines.total>0,'Empty coverage report');
  return report;
}
// Only byte-identical prepared overlays may transfer measured coverage to Git-tracked source.
// The raw report and prepared-source inventory remain intact for independent QA.
const overlays=Object.freeze({
  'app/src/main.js':'assets/agile-office/main.js',
  'app/src/agile-renderer.js':'assets/agile-office/agile-renderer.js',
  'app/src/agile-office.css':'assets/agile-office/agile-office.css',
  'app/src/office-performance.mjs':'assets/agile-office/office-performance.mjs',
  'app/src/office-batching.mjs':'assets/agile-office/office-batching.mjs',
  'app/src/office-tasks.mjs':'assets/agile-office/office-tasks.mjs',
  'app/src/office-task-panel.mjs':'assets/agile-office/office-task-panel.mjs',
  'app/src/agent-animation.mjs':'assets/agile-office/agent-animation.mjs',
  'app/src/office-characters.mjs':'assets/agile-office/office-characters.mjs',
  'app/src/office-motion.mjs':'assets/agile-office/office-motion.mjs',
  'app/electron/crash-monitor.cjs':'assets/crash-monitor/crash-monitor.cjs'
});
function canonicalize(lcov,rootDir=root,aliases=overlays){
  const destination=new Set(Object.values(aliases));
  assert.equal(destination.size,Object.keys(aliases).length,'Duplicate overlay destination');
  for(const [from,to] of Object.entries(aliases)){
    assert.ok(fs.readFileSync(path.join(rootDir,from)).equals(fs.readFileSync(path.join(rootDir,to))),'Overlay bytes differ: '+from+' -> '+to);
  }
  const seen=new Set();
  return lcov.split(/\r?\n/).map(line=>{
    if(!line.startsWith('SF:'))return line;
    const name=line.slice(3),target=aliases[name]??name;
    assert.ok(!seen.has(target),'Duplicate canonical coverage source: '+target);
    seen.add(target);return 'SF:'+target;
  }).join('\n');
}
function writeCanonical(rootDir=root){
  const dir=path.join(rootDir,'coverage');
  const report=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'));
  assert.equal(report.testExitCode,0,'Cannot map failed test coverage');
  for(const file of ['app/src/office-tasks.mjs','app/src/office-task-panel.mjs']){
    const measured=report.measuredFiles[file];
    assert.ok(measured?.lines.total>0&&measured.lines.hit/measured.lines.total>=.8,'Task module line coverage below 80%: '+file);
  }
  const output=canonicalize(fs.readFileSync(path.join(dir,'lcov.info'),'utf8'),rootDir);
  fs.writeFileSync(path.join(dir,'sonar-lcov.info'),output);
  return output;
}

if(require.main===module){if(process.argv[2]==='--canonicalize')writeCanonical();else main()}
module.exports={collect,main,canonicalize,writeCanonical};

