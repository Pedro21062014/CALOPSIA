'use strict';

/* Ponte segura da janelinha de menu (dropdown do botão ☰). */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('menuApi', {
  getTheme: () => ipcRenderer.invoke('theme:get'),
  onTheme: (cb) => ipcRenderer.on('theme:changed', (_e, info) => cb(info)),

  onItems: (cb) => ipcRenderer.on('menu:items', (_e, items) => cb(items)),
  ready: (height) => ipcRenderer.send('menu:ready', { height }),
  action: (id) => ipcRenderer.send('menu:action', id),
  close: () => ipcRenderer.send('menu:close')
});
