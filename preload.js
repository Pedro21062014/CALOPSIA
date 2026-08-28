'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// API mínima e segura exposta para a interface do navegador.
contextBridge.exposeInMainWorld('calopsia', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('win:maximized', (_event, value) => callback(value));
  }
});
