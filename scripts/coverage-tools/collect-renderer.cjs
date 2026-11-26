'use strict';
// Test-harness only: never copied into production Electron code.
const fs = require('node:fs');
const path = require('node:path');
async function start(webContents) {
  if (!process.env.AGENTOFFICE_EXECUTION_COVERAGE) return async () => {};
  await webContents.loadURL('about:blank');
  const results = [];
  const debuggerApi = webContents.debugger;
  debuggerApi.attach('1.3');
  await debuggerApi.sendCommand('Profiler.enable');
  await debuggerApi.sendCommand('Profiler.startPreciseCoverage', {callCount:true,detailed:true});
  // The outer application document stays loaded through every auth transition.
  // Take one complete sample before closing it; iframe-only inline markup is
  // intentionally not mapped to application JS modules.
  return async () => {
    const data = await debuggerApi.sendCommand('Profiler.takePreciseCoverage');
    results.push(...data.result);
    await debuggerApi.sendCommand('Profiler.stopPreciseCoverage');
    debuggerApi.detach();
    const output = path.resolve(process.env.AGENTOFFICE_EXECUTION_COVERAGE);
    fs.mkdirSync(output, {recursive:true});
    fs.writeFileSync(path.join(output, 'renderer.json'), JSON.stringify({result:results}));
    require('node:v8').takeCoverage();
  };
}
module.exports = {start};
