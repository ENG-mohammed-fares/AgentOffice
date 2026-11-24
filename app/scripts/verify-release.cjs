'use strict';
if (process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true') {
  const {spawnSync} = require('node:child_process');
  const path = require('node:path');
  const identity = spawnSync(process.execPath,['--test',path.join(__dirname,'identity.test.cjs')],{stdio:'inherit',timeout:30000});
  if(identity.status!==0)process.exit(1);
  const test = spawnSync(require('electron'), [path.join(__dirname, 'auth-smoke.cjs')], {stdio:'inherit',timeout:120000});
  if (test.error) throw test.error;
  process.exitCode = test.status ?? 1;
}
