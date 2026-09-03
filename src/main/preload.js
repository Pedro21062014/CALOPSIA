'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('calopsia', {
  // Navigation
  navigate:    (id, url)  => ipcRenderer.send('navigate',    { id, url }),
  tabBack:     (id)       => ipcRenderer.send('tab-back',    { id }),
  tabForward:  (id)       => ipcRenderer.send('tab-forward', { id }),
  tabReload:   (id)       => ipcRenderer.send('tab-reload',  { id }),
  tabStop:     (id)       => ipcRenderer.send('tab-stop',    { id }),
  tabCanNav:   (id)       => ipcRenderer.send('tab-can-nav', { id }),

  // Tabs
  tabNew:    ()    => ipcRenderer.send('tab-new'),
  tabClose:  (id)  => ipcRenderer.send('tab-close',  { id }),
  tabSwitch: (id)  => ipcRenderer.send('tab-switch', { id }),

  // DevTools / Zoom
  openDevtools: (id) => ipcRenderer.send('open-devtools', { id }),
  zoomIn:    (id) => ipcRenderer.send('zoom-in',    { id }),
  zoomOut:   (id) => ipcRenderer.send('zoom-out',   { id }),
  zoomReset: (id) => ipcRenderer.send('zoom-reset', { id }),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // History
  getHistory:  ()     => ipcRenderer.invoke('get-history'),
  addHistory:  (item) => ipcRenderer.send('add-history', item),

  // Bookmarks
  getBookmarks:   ()     => ipcRenderer.invoke('get-bookmarks'),
  addBookmark:    (item) => ipcRenderer.send('add-bookmark', item),
  removeBookmark: (url)  => ipcRenderer.send('remove-bookmark', { url }),

  // Event listeners
  on: (channel, fn) => {
    const allowed = [
      'tab-created', 'tab-closed', 'tab-activated', 'tab-updated',
      'tab-can-nav', 'window-state', 'bookmarks-updated', 'find',
    ];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_, data) => fn(data));
  },
  off: (channel, fn) => ipcRenderer.removeListener(channel, fn),
});
