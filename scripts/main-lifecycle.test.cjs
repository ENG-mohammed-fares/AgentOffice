'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(__dirname,'../electron/main.cjs');
async function fixture({packaged=false,configured=false,primary=true,readyError=false}={}) {
  const app = new EventEmitter(), updater = new EventEmitter();
  const handlers = new Map(), windows = [], intervals = [], opened = [], errors = [];
  let gate, installs=0, quits=0, safe=true, idle=130, now=100000;
  Object.assign(app,{isPackaged:packaged,getVersion:()=> '1.6.15',requestSingleInstanceLock:()=>primary,
    quit:()=>{quits++},setAppUserModelId:()=>{},whenReady:()=>readyError?Promise.reject(Error('ready failed')):Promise.resolve()});
  class Window extends EventEmitter {
    constructor(options) {
      super();this.options=options;this.destroyed=false;windows.push(this);
      this.webContents=new EventEmitter();
      Object.assign(this.webContents,{send:(_channel,state)=>{this.lastState=state},
        isLoading:()=>false,executeJavaScript:()=>Promise.resolve(),
        setWindowOpenHandler:fn=>{this.openHandler=fn}});
    }
    isDestroyed(){return this.destroyed}
    isMinimized(){return true}
    restore(){this.restored=true}
    focus(){this.focused=true}
    show(){this.shown=true}
    setProgressBar(value){this.progress=value}
    close(){this.destroyed=true;this.emit('closed')}
    loadFile(file){this.loaded=file;return Promise.resolve()}
    loadURL(url){this.loaded=url;return Promise.resolve()}
    static getAllWindows(){return windows.filter(win=>!win.destroyed)}
  }
  updater.checkForUpdates=async()=>({downloadPromise:Promise.resolve()});
  const powerMonitor=new EventEmitter();
  powerMonitor.getSystemIdleTime=()=>idle;
  const electron={app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
    shell:{openExternal:async url=>{opened.push(url)}},Menu:{setApplicationMenu:()=>{}},powerMonitor};
  const deps={'electron':electron,'electron-updater':{autoUpdater:updater},
    'node:path':path,'node:fs':{existsSync:()=>configured},
    './crash-monitor.cjs':{installCrashMonitor:()=>{}},
    './auth.cjs':{registerAuth:()=>({canAutoRestart:()=>safe})},
    './update-policy.cjs':{...require('../electron/update-policy.cjs'),installSilently:()=>{installs++}},
    './startup-update.cjs':{createStartupGate:options=>{gate={...options,status:()=>{},cancel:()=>{gate.canceled=true}};return gate}}};
  const context={__dirname:path.dirname(source),require:name=>{assert.ok(Object.hasOwn(deps,name),'Unexpected dependency '+name);return deps[name]},
    process:{resourcesPath:'/fixture',env:{},platform:'win32'},console:{warn:()=>{},error:(...args)=>errors.push(args)},
    Date:class extends Date{static now(){return now}},setImmediate:fn=>fn(),
    setInterval:fn=>{intervals.push(fn);return {unref(){}}}};
  new vm.Script(fs.readFileSync(source,'utf8'),{filename:source}).runInNewContext(context);
  const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
  await settle();
  return {app,updater,windows,intervals,opened,errors,handlers,settle,context,
    call:name=>handlers.get('agentoffice:'+name)(),
    get gate(){return gate},get installs(){return installs},get quits(){return quits},
    setSafe:value=>{safe=value},advance:()=>{now+=20000},setIdle:value=>{idle=value}};
}
test('development boot isolates renderer navigation and reports local update state',async()=>{
  const f=await fixture();assert.equal(f.windows.length,1);
  const win=f.windows[0];assert.equal(win.options.webPreferences.nodeIntegration,false);
  assert.equal(win.options.webPreferences.sandbox,true);
  win.emit('ready-to-show');assert.equal(win.shown,true);
  assert.equal((await f.call('check-updates')).state,'development');
  assert.equal(f.call('install-update'),false);
  assert.equal(win.openHandler({url:'https://example.test'}).action,'deny');
  win.openHandler({url:'file:///private'});await f.settle();
  assert.deepEqual(f.opened,['https://example.test']);
  let prevented=false;win.webContents.emit('will-navigate',{preventDefault:()=>{prevented=true}},'https://example.test');
  assert.equal(prevented,true);
  f.app.emit('second-instance');assert.equal(win.restored,true);assert.equal(win.focused,true);
  win.close();f.app.emit('activate');assert.equal(f.windows.length,2);
  f.app.emit('before-quit');f.app.emit('window-all-closed');assert.equal(f.quits,1);
});
test('packaged update lifecycle keeps startup gate and safe-idle installation guards',async()=>{
  const f=await fixture({packaged:true,configured:true}), splash=f.windows[0];
  assert.ok(splash.loaded.endsWith('startup-update.html'));
  splash.emit('ready-to-show');splash.webContents.emit('did-finish-load');
  for(const [event,data] of [['checking-for-update'],['update-available',{version:'2.0.0'}],
    ['download-progress',{percent:56.4}],['update-not-available',{version:'1.6.15'}],
    ['error',Error('offline')]])f.updater.emit(event,data);
  assert.equal(f.call('update-status').state,'error');
  f.gate.open('current');const win=f.windows[1];win.emit('ready-to-show');
  assert.equal(splash.destroyed,true);
  f.updater.emit('update-downloaded',{version:'2.0.0'});
  f.setSafe(false);f.advance();f.intervals[1]();assert.equal(f.installs,0);
  f.setSafe(true);f.setIdle(0);f.intervals[1]();assert.equal(f.installs,0);
  f.setIdle(130);f.intervals[1]();assert.equal(f.installs,1);
  f.updater.emit('error',Error('install failed'));
  assert.equal(f.call('install-update'),false);
  f.updater.emit('update-downloaded',{version:'2.0.0'});
  assert.equal(f.call('install-update'),true);assert.equal(f.installs,2);
  f.app.emit('before-quit');
});
test('unconfigured builds and startup failures fail safely without publishing',async()=>{
  const unconfigured=await fixture({packaged:true});
  assert.equal((await unconfigured.call('check-updates')).state,'unconfigured');
  const rejected=await fixture({readyError:true});assert.equal(rejected.quits,1);
  assert.equal(rejected.errors.length,1);
  const secondary=await fixture({primary:false});assert.equal(secondary.quits,1);
  assert.equal(secondary.windows.length,0);
});
