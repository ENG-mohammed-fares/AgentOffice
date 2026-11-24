'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Only expose narrowly scoped updater commands to the 3D renderer.
contextBridge.exposeInMainWorld('agentOfficeDesktop', {
  auth: {
    identityStatus: () => ipcRenderer.invoke('agentoffice:auth:identity-status'),
    google: () => ipcRenderer.invoke('agentoffice:auth:google'),
    github: () => ipcRenderer.invoke('agentoffice:auth:github'),
    cancelGoogle: () => ipcRenderer.invoke('agentoffice:auth:cancel-google'),
    requestCode: email => ipcRenderer.invoke('agentoffice:auth:request-code',{email}),
    verifyCode: (email,code) => ipcRenderer.invoke('agentoffice:auth:verify-code',{email,code}),
    resetPassword: (grant,password) => ipcRenderer.invoke('agentoffice:auth:reset-password',{grant,password}),
    current: () => ipcRenderer.invoke('agentoffice:auth:current'),
    signUp: payload => ipcRenderer.invoke('agentoffice:auth:signup', payload),
    signIn: payload => ipcRenderer.invoke('agentoffice:auth:signin', payload),
    guest: () => ipcRenderer.invoke('agentoffice:auth:guest'),
    logout: () => ipcRenderer.invoke('agentoffice:auth:logout')
  },
  version: () => ipcRenderer.invoke('agentoffice:version'),
  updateStatus: () => ipcRenderer.invoke('agentoffice:update-status'),
  checkUpdates: () => ipcRenderer.invoke('agentoffice:check-updates'),
  installUpdate: () => ipcRenderer.invoke('agentoffice:install-update'),
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('agentoffice:update-status', handler);
    return () => ipcRenderer.removeListener('agentoffice:update-status', handler);
  }
});
