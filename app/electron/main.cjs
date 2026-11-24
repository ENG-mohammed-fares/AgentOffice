'use strict';
const { app, BrowserWindow, ipcMain, shell, Menu, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');
const { registerAuth } = require('./auth.cjs');
const {isTrustedPage,trustedIpc,workspaceUrl}=require('./ipc-security.cjs');
const devUrl=!app.isPackaged&&process.env.AGENTOFFICE_DEV_URL;
const workspaceIndex=path.join(__dirname,'..','dist','index.html');
const expectedWorkspaceUrl=workspaceUrl(workspaceIndex,devUrl);
const { mayAutoRestart, installSilently } = require('./update-policy.cjs');
const { createStartupGate } = require('./startup-update.cjs');
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance) app.quit();

let mainWindow;
let startupWindow=null;
let startupGate=null;
let quitting=false;
let checking = false;
let installing = false;
let readyAt = 0;
let authSafety = null;
let state = { state: 'idle', message: 'Ready to check', version: app.getVersion(), percent: 0 };

// Download automatically, install silently at a safe idle login screen, or on ordinary exit.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

const updatesConfigured = () => app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'));
function notify(patch) {
  state = { ...state, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agentoffice:update-status', state);
  }
  renderStartup();
  startupGate?.status(state.state);
}
function checkUpdates() {
  if (!app.isPackaged) {
    notify({ state: 'development', message: 'Update checking works in installed releases, not development.' });
    return Promise.resolve(state);
  }
  if (!updatesConfigured()) {
    notify({ state: 'unconfigured', message: 'This build has no GitHub update feed. Publish through GitHub Actions.' });
    return Promise.resolve(state);
  }
  if (checking || installing || state.state === 'ready' || state.state === 'downloading' || state.state === 'available') return Promise.resolve(state);
  checking = true;
  notify({ state: 'checking', message: 'Checking for updates…', percent: 0 });
  return autoUpdater.checkForUpdates()
    .then(result=>{
      if(result?.downloadPromise) result.downloadPromise.catch(err=>{
        if(state.state!=='ready'&&!installing)notify({state:'error',message:String(err.message||err).slice(0,220)});
      });
      return result;
    })
    .catch(err => {
      notify({ state: 'error', message: String(err.message || err).slice(0, 220) });
      return state;
    })
    .finally(() => { checking = false; });
}

autoUpdater.on('checking-for-update', () => notify({ state: 'checking', message: 'Checking GitHub Releases…' }));
autoUpdater.on('update-available', info => notify({ state: 'available', message: `Version ${info.version} available. Downloading…`, newVersion: info.version }));
autoUpdater.on('update-not-available', () => notify({ state: 'current', message: `You have the latest version (${app.getVersion()}).` }));
autoUpdater.on('download-progress', info => notify({ state: 'downloading', percent: Math.round(info.percent), message: `Downloading update: ${Math.round(info.percent)}%` }));
autoUpdater.on('update-downloaded', info => {
  readyAt = Date.now();
  notify({ state: 'ready', percent: 100, newVersion: info.version, message: `Version ${info.version} downloaded. Installs automatically when safe or when you close AgentOffice.` });
});
autoUpdater.on('error', err => {
  installing = false;
  notify({ state: 'error', message: String(err.message || err).slice(0, 220) });
});

function installDownloaded() {
  if (installing || state.state !== 'ready' || !updatesConfigured()) return false;
  installing = true;
  try {
    installSilently(autoUpdater);
    return true;
  } catch (err) {
    installing = false;
    notify({state:'error',message:'Automatic installation failed: '+String(err.message||err).slice(0,180)});
    return false;
  }
}
function tryAutoInstall() {
  if (!mainWindow || mainWindow.isDestroyed() || !authSafety || state.state !== 'ready') return;
  try {
    if (mayAutoRestart({ready:true,configured:updatesConfigured(),installing,authSafe:authSafety.canAutoRestart(),idleSeconds:powerMonitor.getSystemIdleTime(),readySeconds:(Date.now()-readyAt)/1000})) {
      installDownloaded();
    }
  } catch { /* Defer safely to normal exit if idle information is unavailable. */ }
}

function renderStartup() {
  if(!startupWindow || startupWindow.isDestroyed() || startupWindow.webContents.isLoading())return;
  const installingNow=installing;
  const text=installingNow?'Installing update. AgentOffice will reopen automatically…':
    state.state==='current'?'You have the latest version. Opening your office…':
    state.state==='downloading'?'Downloading version '+(state.newVersion||'')+' — '+Math.max(0,Math.min(100,state.percent||0))+'%':
    state.state==='available'?'New approved version '+(state.newVersion||'')+' found. Preparing download…':
    state.state==='ready'?'Download verified. Installing update…':
    state.state==='error'?'Update unavailable. Opening your installed version…':
    'Checking for the latest approved release…';
  const percent=installingNow||state.state==='ready'?100:state.state==='downloading'?Math.max(0,Math.min(100,state.percent||0)):null;
  // All dynamic text is serialized as data and inserted using textContent.
  const payload=JSON.stringify({text,percent});
  startupWindow.webContents.executeJavaScript(
    '(()=>{const s='+payload+';document.getElementById("status").textContent=s.text;const p=document.getElementById("progress");if(s.percent===null)p.removeAttribute("value");else p.value=s.percent})()'
  ).catch(()=>{});
  startupWindow.setProgressBar(percent===null?2:percent/100);
}
function openWorkspaceAfterStartup(reason) {
  if(quitting || mainWindow&&!mainWindow.isDestroyed())return;
  startupGate=null;
  if(reason!=='current')console.warn('Startup update bypass:',reason);
  const splash=startupWindow;
  createWindow();
  // Keep a visible window until the main UI is ready; avoid window-all-closed.
  const workspace=mainWindow;
  const closeSplash=()=>{if(splash&&!splash.isDestroyed())splash.close()};
  workspace.once('ready-to-show',closeSplash);
  workspace.once('closed',closeSplash);
}
function startWithUpdates() {
  if(!updatesConfigured()){
    if(app.isPackaged)notify({state:'unconfigured',message:'GitHub updates are not configured for this local build.'});
    createWindow();return;
  }
  startupWindow=new BrowserWindow({width:440,height:310,resizable:false,maximizable:false,minimizable:true,
    title:'AgentOffice — Starting',backgroundColor:'#181a19',show:false,
    icon:path.join(__dirname,'..','build','icon.png'),
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  const splash=startupWindow;
  splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  splash.webContents.on('will-navigate',event=>event.preventDefault());
  splash.once('ready-to-show',()=>{if(!splash.isDestroyed()){splash.show();renderStartup()}});
  splash.webContents.on('did-finish-load',renderStartup);
  splash.on('closed',()=>{startupWindow=null;if(!mainWindow&&!installing){startupGate?.cancel();startupGate=null}});
  splash.loadFile(path.join(__dirname,'startup-update.html')).catch(()=>{});
  startupGate=createStartupGate({
    open:openWorkspaceAfterStartup,
    install:()=>{const started=installDownloaded();renderStartup();return started}
  });
  checkUpdates().catch(()=>startupGate?.status('error'));
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 620,
    title: 'AgentOffice', backgroundColor: '#0a101b',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  Menu.setApplicationMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (devUrl) mainWindow.loadURL(expectedWorkspaceUrl);
  else mainWindow.loadFile(workspaceIndex);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedPage(url,expectedWorkspaceUrl)) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

if(primaryInstance) app.whenReady().then(() => {
  app.setAppUserModelId('com.agentoffice.desktop');
  const safeIpc=trustedIpc(ipcMain,()=>mainWindow,expectedWorkspaceUrl);
  authSafety = registerAuth(safeIpc);
  safeIpc.handle('agentoffice:version', () => ({ version: app.getVersion(), configured: updatesConfigured(), packaged: app.isPackaged }));
  safeIpc.handle('agentoffice:update-status', () => state);
  safeIpc.handle('agentoffice:check-updates', () => checkUpdates().then(() => state));
  safeIpc.handle('agentoffice:install-update', () => {
    if (state.state !== 'ready' || !updatesConfigured()) return false;
    setImmediate(() => installDownloaded());
    return true;
  });
  Menu.setApplicationMenu(null);
  startWithUpdates();
  if (updatesConfigured()) {
    const interval = setInterval(() => checkUpdates().catch(() => {}), 30 * 60 * 1000);
    interval.unref?.();
    const installInterval = setInterval(tryAutoInstall, 5000);
    installInterval.unref?.();
    powerMonitor.on('resume', () => checkUpdates().catch(() => {}));
  }
  app.on('activate', () => { if (!quitting&&!installing&&!startupGate&&BrowserWindow.getAllWindows().length === 0) startWithUpdates(); });
});
app.on('second-instance',()=>{const win=mainWindow||startupWindow;if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.focus()}});
app.on('before-quit',()=>{quitting=true;startupGate?.cancel();startupGate=null});
app.on('window-all-closed', () => { if (process.platform !== 'darwin'&&!installing) app.quit(); });
