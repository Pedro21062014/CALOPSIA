'use strict';

/**
 * Preload da interface do navegador (a "chrome").
 * Expõe uma API tipada e fechada — o renderer nunca toca em `ipcRenderer`
 * diretamente nem em qualquer primitiva do Node.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const send = (channel, payload) => ipcRenderer.send(channel, payload);
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

/** Canais que o main pode empurrar para a UI. */
const LISTENABLE = new Set([
  'bootstrap',
  'tab:updated',
  'tabs:changed',
  'tab:zoom',
  'tab:hover-link',
  'find:result',
  'window:state',
  'window:content-fullscreen',
  'theme:changed',
  'settings:changed',
  'bookmarks:changed',
  'download:started',
  'download:updated',
  'download:done',
  'data:cleared',
  'app:restart-required',
  'shortcut:find',
  'shortcut:focus-omnibox',
  'shortcut:bookmark',
  'shortcut:toggle-bookmarks-bar'
]);

const api = {
  // ------------------------------------------------------------------ abas
  tabs: {
    create: (opts) => send('tab:create', opts),
    close: (id) => send('tab:close', id),
    activate: (id) => send('tab:activate', id),
    move: (id, index) => send('tab:move', { id, index }),
    duplicate: (id) => send('tab:duplicate', id),
    pin: (id) => send('tab:pin', id),
    mute: (id) => send('tab:mute', id),
    closeOthers: (id) => send('tab:close-others', id),
    closeToRight: (id) => send('tab:close-right', id),
    navigate: (id, url) => send('tab:navigate', { id, url }),
    reload: (id, hard = false) => send('tab:reload', { id, hard }),
    stop: (id) => send('tab:stop', id),
    back: (id) => send('tab:back', id),
    forward: (id) => send('tab:forward', id),
    devtools: (id) => send('tab:devtools', id),
    print: (id) => send('tab:print', id),
    focus: (id) => send('tab:focus', id),
    preview: (id) => invoke('tab:preview', id),
    history: (id) => invoke('tab:history', id),
    goToIndex: (id, index) => send('tab:go-to-index', { id, index }),
    contextMenu: (tabId, x, y) => send('menu:tab-context', { tabId, x, y })
  },

  // ------------------------------------------------------------------ zoom
  zoom: {
    in: () => send('zoom:in'),
    out: () => send('zoom:out'),
    reset: () => send('zoom:reset'),
    get: () => invoke('zoom:get')
  },

  // -------------------------------------------------------------- localizar
  find: {
    start: (text, opts = {}) => send('find:start', { text, ...opts }),
    stop: () => send('find:stop')
  },

  // ---------------------------------------------------------------- janela
  window: {
    minimize: () => send('window:minimize'),
    maximize: () => send('window:maximize'),
    close: () => send('window:close'),
    fullscreen: () => send('window:fullscreen'),
    newWindow: () => send('window:new'),
    newPrivate: () => send('window:new-private'),
    setOverlay: (expanded) => send('overlay:set', expanded),
    relayout: () => send('window:relayout'),
    setExtraChromeHeight: (px) => send('chrome:extra-height', px)
  },

  // -------------------------------------------------------------- omnibox
  omnibox: {
    suggest: (q) => invoke('omnibox:suggest', q),
    normalize: (input) => invoke('omnibox:normalize', input)
  },

  // ------------------------------------------------------------- favoritos
  bookmarks: {
    list: () => invoke('bookmarks:list'),
    add: (data) => invoke('bookmarks:add', data),
    remove: (id) => invoke('bookmarks:remove', id),
    update: (data) => invoke('bookmarks:update', data),
    toggle: (data) => invoke('bookmarks:toggle', data),
    reorder: (ids) => invoke('bookmarks:reorder', ids),
    contextMenu: (opts) => send('menu:bookmark-context', opts)
  },

  // ------------------------------------------------------------- histórico
  history: {
    list: (opts) => invoke('history:list', opts),
    delete: (urls) => invoke('history:delete', urls),
    clear: () => invoke('history:clear')
  },

  // ------------------------------------------------------------- downloads
  downloads: {
    list: () => invoke('downloads:list'),
    open: (id) => send('downloads:open', id),
    show: (id) => send('downloads:show', id),
    pause: (id) => send('downloads:pause', id),
    cancel: (id) => send('downloads:cancel', id),
    remove: (id) => invoke('downloads:remove', id),
    clear: () => invoke('downloads:clear')
  },

  // ---------------------------------------------------------- configurações
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    reset: () => invoke('settings:reset'),
    chooseDownloadDir: () => invoke('settings:choose-download-dir'),
    clearData: (options) => invoke('data:clear', options)
  },

  // -------------------------------------------------------------------- app
  app: {
    info: () => invoke('app:info'),
    openExternal: (url) => send('app:open-external', url),
    relaunch: () => send('app:relaunch'),
    reopenTab: () => send('app:reopen-tab'),
    closedTabs: () => invoke('app:closed-tabs')
  },

  clipboard: {
    write: (text) => send('clipboard:write', text),
    read: () => invoke('clipboard:read')
  },

  // ------------------------------------------------------------------ eventos
  on(channel, listener) {
    if (!LISTENABLE.has(channel)) {
      console.warn(`[calopsia] canal não permitido: ${channel}`);
      return () => {};
    }
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },

  once(channel, listener) {
    if (!LISTENABLE.has(channel)) return;
    ipcRenderer.once(channel, (_event, payload) => listener(payload));
  }
};

contextBridge.exposeInMainWorld('calopsia', api);
