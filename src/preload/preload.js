'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('calopsia', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('browser:get-state'),
  command: (command, payload = {}) => ipcRenderer.invoke('browser:command', command, payload),
  windowCommand: (command) => ipcRenderer.invoke('window:command', command),
  onState: (callback) => subscribe('browser:state', callback),
  onFocusAddress: (callback) => subscribe('browser:focus-address', callback),
  onShowFind: (callback) => subscribe('browser:show-find', callback),
  onFindResult: (callback) => subscribe('browser:find-result', callback),
});
