'use strict';
const {pathToFileURL}=require('node:url');

function isTrustedPage(candidate, expected) {
  try {
    const actual=new URL(candidate), target=new URL(expected);
    if (!['file:','http:','https:'].includes(target.protocol) ||
        actual.username || actual.password) return false;
    actual.hash='';target.hash='';
    return actual.href===target.href;
  } catch { return false; }
}
function trustedIpc(ipcMain, getWindow, expectedUrl) {
  return {handle(channel, handler) {
    ipcMain.handle(channel,(event,...args)=>{
      const win=getWindow();
      if (!win || win.isDestroyed() || event.sender!==win.webContents ||
          !event.senderFrame || event.senderFrame!==win.webContents.mainFrame ||
          !isTrustedPage(event.senderFrame.url,expectedUrl)) {
        throw new Error('Untrusted IPC sender');
      }
      return handler(event,...args);
    });
  }};
}
function workspaceUrl(indexPath, devUrl) {
  if (!devUrl) return pathToFileURL(indexPath).href;
  const url=new URL(devUrl);
  if (url.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
      url.username || url.password) throw Error('Invalid local development URL');
  return url.href;
}
module.exports={isTrustedPage,trustedIpc,workspaceUrl};
