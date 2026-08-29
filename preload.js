'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* API mínima e segura exposta para a interface do navegador. */
contextBridge.exposeInMainWorld('calopsia', {
  platform: process.platform,

  /* janela */
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  toggleDevTools: () => ipcRenderer.send('win:toggle-devtools'),
  onMaximizeChange: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
  onFullscreenChange: (cb) => ipcRenderer.on('win:fullscreen', (_e, v) => cb(v)),

  /* menu do ☰ (janela própria) */
  openMenu: (payload) => ipcRenderer.send('menu:open', payload),
  closeMenu: () => ipcRenderer.send('menu:close'),
  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_e, id) => cb(id)),

  /* comandos vindos do menu nativo */
  onNewTab: (cb) => ipcRenderer.on('app:new-tab', (_e, url) => cb(url)),
  onCloseTab: (cb) => ipcRenderer.on('app:close-tab', () => cb()),

  /* downloads */
  onDownloadProgress: (cb) => ipcRenderer.on('dl:progress', (_e, info) => cb(info)),
  onDownloadDone: (cb) => ipcRenderer.on('dl:done', (_e, info) => cb(info)),
  showItemInFolder: (p) => ipcRenderer.send('shell:show-item', p),
  openPath: (p) => ipcRenderer.send('shell:open-path', p),

  /* misc */
  getInfo: () => ipcRenderer.invoke('app:info'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file')
});
