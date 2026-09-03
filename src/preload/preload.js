'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calopsiaAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (s) => ipcRenderer.invoke('set-settings', s),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (e) => ipcRenderer.invoke('add-history', e),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (b) => ipcRenderer.invoke('add-bookmark', b),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (t) => ipcRenderer.send('set-theme', t),

  // Downloads
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_, d) => cb(d)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, d) => cb(d)),
  onDownloadDone: (cb) => ipcRenderer.on('download-done', (_, d) => cb(d)),

  // External
  openExternal: (url) => ipcRenderer.send('open-external', url),

  platform: process.platform,
});
