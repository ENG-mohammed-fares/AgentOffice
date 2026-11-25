'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {installCrashMonitor}=require('../electron/crash-monitor.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ao-crash-electron-'));
app.setPath('userData',dir);
const stop=installCrashMonitor({app});
let win;
const timeout=setTimeout(()=>finish(1,new Error('Renderer crash event timeout')),30000);
let finishing=false;
function finish(code,error){
  if(finishing)return;
  finishing=true;clearTimeout(timeout);stop();
  if(error)console.error(error);
  if(win&&!win.isDestroyed())win.destroy();
  try{fs.rmSync(dir,{recursive:true,force:true});}catch{ /* Electron can retain handles until exit. */ }
  app.exit(code);
}
app.whenReady().then(async()=>{
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('data:text/html,<title>Crash test fixture</title>');
  app.once('render-process-gone',(_event,contents,details)=>{
    try{
      assert.equal(contents.id,win.webContents.id);
      assert.ok(['crashed','killed'].includes(details.reason),details.reason);
      const reports=fs.readdirSync(path.join(dir,'crash-incidents')).map(name=>JSON.parse(fs.readFileSync(path.join(dir,'crash-incidents',name),'utf8')));
      assert.ok(reports.some(row=>row.process==='renderer'&&row.reason===details.reason&&row.exitCode===details.exitCode));
      console.log('Observed genuine Electron renderer termination and saved privacy-minimized incident');
      finish(0);
    }catch(error){finish(1,error);}
  });
  win.webContents.forcefullyCrashRenderer();
}).catch(error=>finish(1,error));
