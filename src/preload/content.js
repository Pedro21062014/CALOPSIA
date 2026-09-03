'use strict';

/**
 * Preload aplicado a TODAS as páginas carregadas em abas.
 *
 * Para sites comuns (http/https) ele não expõe absolutamente nada —
 * apenas aplica pequenos ajustes de compatibilidade. A API interna
 * `window.calopsiaInternal` só é publicada em páginas `calopsia://`.
 */

const { contextBridge, ipcRenderer } = require('electron');

const isInternal = location.protocol === 'calopsia:';

if (isInternal) {
  contextBridge.exposeInMainWorld('calopsiaInternal', {
    page: location.hostname,

    navigate: (url) => ipcRenderer.invoke('internal:navigate', url),
    newTab: (url) => ipcRenderer.invoke('internal:new-tab', url),
    openExternal: (url) => ipcRenderer.send('app:open-external', url),

    info: () => ipcRenderer.invoke('app:info'),

    settings: {
      get: () => ipcRenderer.invoke('settings:get'),
      set: (patch) => ipcRenderer.invoke('settings:set', patch),
      reset: () => ipcRenderer.invoke('settings:reset'),
      chooseDownloadDir: () => ipcRenderer.invoke('settings:choose-download-dir'),
      clearData: (options) => ipcRenderer.invoke('data:clear', options)
    },

    history: {
      list: (opts) => ipcRenderer.invoke('history:list', opts),
      delete: (urls) => ipcRenderer.invoke('history:delete', urls),
      clear: () => ipcRenderer.invoke('history:clear')
    },

    bookmarks: {
      list: () => ipcRenderer.invoke('bookmarks:list'),
      add: (data) => ipcRenderer.invoke('bookmarks:add', data),
      remove: (id) => ipcRenderer.invoke('bookmarks:remove', id),
      update: (data) => ipcRenderer.invoke('bookmarks:update', data)
    },

    downloads: {
      list: () => ipcRenderer.invoke('downloads:list'),
      open: (id) => ipcRenderer.send('downloads:open', id),
      show: (id) => ipcRenderer.send('downloads:show', id),
      remove: (id) => ipcRenderer.invoke('downloads:remove', id),
      clear: () => ipcRenderer.invoke('downloads:clear')
    },

    topSites: () => ipcRenderer.invoke('internal:top-sites'),

    relaunch: () => ipcRenderer.send('app:relaunch'),

    on(channel, listener) {
      const allowed = ['settings:changed', 'theme:changed', 'bookmarks:changed', 'download:updated', 'download:done', 'data:cleared'];
      if (!allowed.includes(channel)) return () => {};
      const wrapped = (_e, payload) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    }
  });
}

// Ajuste de compatibilidade: alguns sites checam `navigator.brave` ou
// esperam que `window.open` retorne um objeto. Nada aqui expõe privilégios.
if (!isInternal) {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  } catch { /* alguns contextos são congelados */ }
}
