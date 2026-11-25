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
