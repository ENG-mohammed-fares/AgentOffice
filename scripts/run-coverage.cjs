// Collect coverage from the current, fully prepared production source tree.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const app = path.join(root, 'app');
const output = path.join(root, 'coverage');
const rawPath = path.join(output, 'raw-lcov.info');
const lcovPath = path.join(output, 'lcov.info');
const summaryPath = path.join(output, 'summary.json');
const required = [
  'app/electron/identity.cjs',
  'app/electron/update-policy.cjs',
  'app/src/office-performance.mjs',
  'app/src/office-batching.mjs'
];
const slash = p => p.split(path.sep).join('/');
function inventory(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const p = path.join(dir, entry.name);
    return entry.isDirectory() ? inventory(p) :
      entry.isFile() && /\.(js|cjs|mjs)$/i.test(entry.name) ? [slash(path.relative(root,p))] : [];
  });
}
function collect(raw, files) {
  const available = new Set(files);
  const records = new Map();
  const normalized = [];
  for (const record of raw.trim().split(/^end_of_record\r?$/m)) {
    if (!record.trim()) continue;
    const lines = record.trim().split(/\r?\n/);
    const sf = lines.filter(s=>s.startsWith('SF:'));
    assert.equal(sf.length,1,'Invalid LCOV source record');
    const absolute = path.resolve(app,sf[0].slice(3));
    const relative = slash(path.relative(root,absolute));
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
function main(){
  assert.ok(Number(process.versions.node.split('.')[0])>=22,'Node 22+ required');
  const files=[...inventory(path.join(app,'src')),...inventory(path.join(app,'electron'))].sort();
  for(const p of required)assert.ok(files.includes(p),'Missing expected production source: '+p);
  fs.mkdirSync(output,{recursive:true});
  for(const p of [rawPath,lcovPath,summaryPath])fs.rmSync(p,{force:true});
  const tests=fs.readdirSync(path.join(app,'scripts')).filter(s=>/\.test\.(js|cjs|mjs)$/.test(s)).sort();
  for(const p of ['identity.test.cjs','office-performance.test.mjs'])assert.ok(tests.includes(p),'Missing mandatory test: '+p);
  const result=spawnSync(process.execPath,[
    '--test','--experimental-test-coverage',
    '--test-coverage-include=src/**','--test-coverage-include=electron/**',
    '--test-reporter=spec','--test-reporter-destination=stdout',
    '--test-reporter=lcov','--test-reporter-destination='+rawPath,
    ...tests.map(p=>'scripts/'+p)
  ],{cwd:app,stdio:'inherit',env:{...process.env,NODE_V8_COVERAGE:''}});
  if(result.error)throw result.error;
  assert.ok(fs.existsSync(rawPath),'Missing LCOV output');
  const {lcov,report}=collect(fs.readFileSync(rawPath,'utf8'),files);
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
  console.log(lines.join('\n'));
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));
  assert.equal(result.status,0,'Unit tests failed');
  assert.deepEqual(report.missingRequired,[],'Required modules must be measured with at least one covered line');
  assert.ok(report.totals.lines.total>0,'Empty coverage report');
}
if(require.main===module)main();
module.exports={collect};
