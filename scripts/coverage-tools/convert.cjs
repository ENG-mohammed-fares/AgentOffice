'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {fileURLToPath} = require('node:url');
const v8toIstanbul = require('v8-to-istanbul');
const {createCoverageMap} = require('istanbul-lib-coverage');
const {createContext} = require('istanbul-lib-report');
const reports = require('istanbul-reports');
const {canonicalize} = require('../run-coverage.cjs');
async function convert(root, input) {
  const map = createCoverageMap({});
  let used = 0;
  for (const dir of input) {
    for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
      const data = JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
      for (const script of data.result) {
        if (!script.url.startsWith('file:') || !script.functions?.length) continue;
        const source = fileURLToPath(script.url);
        const relative = path.relative(root,source).replaceAll('\\','/');
        if (!/^(app\/(electron|src)\/.*\.(cjs|mjs|js)|app\/dist\/assets\/.*\.js)$/.test(relative)) continue;
        const converter = v8toIstanbul(source);
        await converter.load();
        converter.applyCoverage(script.functions);
        for (const [filename,coverage] of Object.entries(converter.toIstanbul())) {
          const relativeFile = path.relative(root,filename).replaceAll('\\','/');
          if (/^app\/(src|electron)\/.*\.(cjs|mjs|js)$/.test(relativeFile)) {
            map.addFileCoverage(coverage); used++;
          }
        }
      }
    }
  }
  if (!used || !map.files().some(file => file.endsWith(path.join('electron','auth.cjs')))) {
    throw Error('Missing actual Electron authentication execution coverage');
  }
  const dir = path.join(root,'coverage','execution');
  reports.create('lcovonly').execute(createContext({dir,coverageMap:map}));
  const lcov = fs.readFileSync(path.join(dir,'lcov.info'),'utf8').split(/\r?\n/).map(line => line.startsWith('SF:') ? 'SF:' + path.relative(root,path.resolve(line.slice(3))).replaceAll('\\','/') : line).join('\n');
  fs.writeFileSync(path.join(root,'coverage','execution-lcov.info'),canonicalize(lcov,root));
  fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(map.getCoverageSummary().toJSON(),null,2));
  console.log('Imported actual Electron execution for '+map.files().length+' source files');
}
if (require.main === module) {
  const root = path.resolve(__dirname,'../..');
  convert(root,[path.join(root,'coverage','runtime-v8'),path.join(root,'coverage','runtime-renderer')]).catch(error=>{console.error(error);process.exitCode=1});
}
module.exports = {convert};
