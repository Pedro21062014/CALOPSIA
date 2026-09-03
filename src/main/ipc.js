'use strict';

const { ipcMain, app, shell, dialog, clipboard, nativeTheme, Menu } = require('electron');
const path = require('node:path');
const { stores, DEFAULT_SETTINGS } = require('./store');
const { SEARCH_ENGINES, SCHEME } = require('./constants');

/**
 * Registra todos os canais IPC.
 * Todo handler resolve a janela a partir do `event.sender`, evitando que
 * um renderer manipule o estado de outra janela.
 */
function registerIpc(browser) {
  const winOf = (event) => browser.windowFor(event.sender) || browser.current();
  const tabOf = (event, tabId) => {
    const win = winOf(event);
    if (!win) return null;
    return tabId ? win.getTab(tabId) : win.activeTab;
  };

  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      console.error(`[ipc:${channel}]`, err);
      return { error: err.message };
    }
  });
  const on = (channel, fn) => ipcMain.on(channel, (event, ...args) => {
    try {
      fn(event, ...args);
    } catch (err) {
      console.error(`[ipc:${channel}]`, err);
    }
  });

  // ------------------------------------------------------------------ abas

  on('tab:create', (e, opts = {}) => winOf(e)?.createTab({ active: true, ...opts }));
  on('tab:close', (e, id) => winOf(e)?.closeTab(id));
  on('tab:activate', (e, id) => winOf(e)?.setActiveTab(id));
  on('tab:move', (e, { id, index }) => winOf(e)?.moveTab(id, index));
  on('tab:duplicate', (e, id) => winOf(e)?.duplicateTab(id));
  on('tab:pin', (e, id) => winOf(e)?.togglePin(id));
  on('tab:close-others', (e, id) => winOf(e)?.closeOtherTabs(id));
  on('tab:close-right', (e, id) => winOf(e)?.closeTabsToRight(id));
  on('tab:mute', (e, id) => {
    const tab = tabOf(e, id);
    if (tab) tab.setMuted(!tab.muted);
  });

  on('tab:navigate', (e, { id, url } = {}) => tabOf(e, id)?.navigate(url));
  on('tab:reload', (e, { id, hard } = {}) => tabOf(e, id)?.reload(hard));
  on('tab:stop', (e, id) => tabOf(e, id)?.stop());
  on('tab:back', (e, id) => tabOf(e, id)?.goBack());
  on('tab:forward', (e, id) => tabOf(e, id)?.goForward());
  on('tab:devtools', (e, id) => tabOf(e, id)?.toggleDevTools());
  on('tab:print', (e, id) => tabOf(e, id)?.wc.print());
  on('tab:focus', (e, id) => tabOf(e, id)?.wc.focus());

  handle('tab:preview', async (e, id) => (await tabOf(e, id)?.capturePreview()) || null);
  handle('tab:history', (e, id) => {
    const tab = tabOf(e, id);
    if (!tab) return [];
    const nav = tab.wc.navigationHistory;
    return nav.getAllEntries().map((entry, index) => ({
      index, url: entry.url, title: entry.title, active: index === nav.getActiveIndex()
    }));
  });
  on('tab:go-to-index', (e, { id, index }) => tabOf(e, id)?.wc.navigationHistory.goToIndex(index));

  // ------------------------------------------------------------------ zoom

  on('zoom:in', (e) => tabOf(e)?.zoomIn());
  on('zoom:out', (e) => tabOf(e)?.zoomOut());
  on('zoom:reset', (e) => tabOf(e)?.zoomReset());
  handle('zoom:get', (e) => tabOf(e)?.wc.getZoomFactor() ?? 1);

  // --------------------------------------------------------------- localizar

  on('find:start', (e, { text, forward = true, findNext = false } = {}) =>
    tabOf(e)?.find(text, { forward, findNext, matchCase: false }));
  on('find:stop', (e) => tabOf(e)?.stopFind());

  // ---------------------------------------------------------------- janela

  on('window:minimize', (e) => winOf(e)?.browserWindow.minimize());
  on('window:maximize', (e) => {
    const bw = winOf(e)?.browserWindow;
    if (!bw) return;
    bw.isMaximized() ? bw.unmaximize() : bw.maximize();
  });
  on('window:close', (e) => winOf(e)?.browserWindow.close());
  on('window:new', () => browser.createWindow());
  on('window:new-private', () => browser.createWindow({ incognito: true }));
  on('window:fullscreen', (e) => {
    const bw = winOf(e)?.browserWindow;
    if (bw) bw.setFullScreen(!bw.isFullScreen());
  });
  on('overlay:set', (e, expanded) => winOf(e)?.setOverlay(!!expanded));
  on('window:relayout', (e) => winOf(e)?.layout());
  on('chrome:extra-height', (e, px) => winOf(e)?.setExtraChromeHeight(px));

  // -------------------------------------------------------------- omnibox

  handle('omnibox:suggest', (_e, query) => browser.suggest(query));
  handle('omnibox:normalize', (_e, input) => browser.normalizeInput(input));

  // ------------------------------------------------------------- favoritos

  handle('bookmarks:list', () => stores.bookmarks.get('items', []));

  handle('bookmarks:add', (_e, { url, title, favicon, folder = '' }) => {
    const items = stores.bookmarks.get('items', []);
    if (items.some((b) => b.url === url)) return items;
    items.unshift({
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url, title: title || url, favicon, folder, createdAt: Date.now()
    });
    stores.bookmarks.set('items', items);
    browser.broadcast('bookmarks:changed', items);
    return items;
  });

  handle('bookmarks:remove', (_e, idOrUrl) => {
    const items = stores.bookmarks.get('items', []).filter((b) => b.id !== idOrUrl && b.url !== idOrUrl);
    stores.bookmarks.set('items', items);
    browser.broadcast('bookmarks:changed', items);
    return items;
  });

  handle('bookmarks:update', (_e, { id, ...patch }) => {
    const items = stores.bookmarks.get('items', []);
    const item = items.find((b) => b.id === id);
    if (item) Object.assign(item, patch);
    stores.bookmarks.set('items', items);
    browser.broadcast('bookmarks:changed', items);
    return items;
  });

  handle('bookmarks:toggle', (e, payload) => {
    const items = stores.bookmarks.get('items', []);
    const exists = items.find((b) => b.url === payload.url);
    if (exists) {
      const next = items.filter((b) => b.url !== payload.url);
      stores.bookmarks.set('items', next);
      browser.broadcast('bookmarks:changed', next);
      return { bookmarked: false, items: next };
    }
    items.unshift({
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: payload.url, title: payload.title || payload.url, favicon: payload.favicon,
      folder: '', createdAt: Date.now()
    });
    stores.bookmarks.set('items', items);
    browser.broadcast('bookmarks:changed', items);
    return { bookmarked: true, items };
  });

  handle('bookmarks:reorder', (_e, ids) => {
    const items = stores.bookmarks.get('items', []);
    const map = new Map(items.map((b) => [b.id, b]));
    const next = ids.map((id) => map.get(id)).filter(Boolean);
    items.forEach((b) => { if (!ids.includes(b.id)) next.push(b); });
    stores.bookmarks.set('items', next);
    browser.broadcast('bookmarks:changed', next);
    return next;
  });

  // ------------------------------------------------------------- histórico

  handle('history:list', (_e, { query = '', limit = 300, offset = 0 } = {}) => {
    let items = stores.history.get('items', []);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((h) => h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q));
    }
    return { total: items.length, items: items.slice(offset, offset + limit) };
  });

  handle('history:delete', (_e, urls) => {
    const set = new Set(Array.isArray(urls) ? urls : [urls]);
    const items = stores.history.get('items', []).filter((h) => !set.has(h.url));
    stores.history.set('items', items);
    return items.length;
  });

  handle('history:clear', () => {
    stores.history.set('items', []);
    return true;
  });

  // -------------------------------------------------------------- downloads

  handle('downloads:list', () => stores.downloads.get('items', []));
  on('downloads:open', (_e, id) => {
    const item = stores.downloads.get('items', []).find((d) => d.id === id);
    if (item?.path) shell.openPath(item.path);
  });
  on('downloads:show', (_e, id) => {
    const item = stores.downloads.get('items', []).find((d) => d.id === id);
    if (item?.path) shell.showItemInFolder(item.path);
  });
  on('downloads:pause', (_e, id) => {
    const dl = browser.downloadItems.get(id);
    if (dl && !dl.isDestroyed?.()) dl.isPaused() ? dl.resume() : dl.pause();
  });
  on('downloads:cancel', (_e, id) => browser.downloadItems.get(id)?.cancel());
  handle('downloads:remove', (_e, id) => {
    const items = stores.downloads.get('items', []).filter((d) => d.id !== id);
    stores.downloads.set('items', items);
    return items;
  });
  handle('downloads:clear', () => {
    stores.downloads.set('items', []);
    return [];
  });

  // ------------------------------------------------------------ configurações

  handle('settings:get', () => stores.settings.get());
  handle('settings:set', (_e, patch) => {
    const before = { ...stores.settings.get() };
    Object.entries(patch).forEach(([k, v]) => stores.settings.set(k, v));
    const after = stores.settings.get();

    if (patch.theme !== undefined) {
      browser.applyTheme();
      browser.broadcast('theme:changed', { dark: nativeTheme.shouldUseDarkColors, source: nativeTheme.themeSource });
    }
    if (patch.adBlockEnabled !== undefined || patch.blockTrackers !== undefined) {
      browser.windows.forEach((w) => w.adblock.rebuild());
    }
    if (patch.showBookmarksBar !== undefined) browser.relayoutAll();
    if (before.hardwareAcceleration !== after.hardwareAcceleration) {
      browser.broadcast('app:restart-required', true);
    }
    browser.broadcast('settings:changed', after);
    return after;
  });

  handle('settings:reset', () => {
    stores.settings.reset();
    browser.applyTheme();
    browser.relayoutAll();
    const data = stores.settings.get();
    browser.broadcast('settings:changed', data);
    return data;
  });

  handle('settings:choose-download-dir', async (e) => {
    const win = winOf(e);
    const res = await dialog.showOpenDialog(win.browserWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: stores.settings.get('downloadPath') || app.getPath('downloads')
    });
    if (res.canceled || !res.filePaths[0]) return null;
    stores.settings.set('downloadPath', res.filePaths[0]);
    browser.broadcast('settings:changed', stores.settings.get());
    return res.filePaths[0];
  });

  handle('data:clear', (_e, options) => browser.clearBrowsingData(options));

  // -------------------------------------------------------------------- app

  handle('app:info', () => ({
    name: 'Calopsia',
    version: app.getVersion(),
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
    locale: app.getLocale(),
    userData: app.getPath('userData'),
    downloads: stores.settings.get('downloadPath') || app.getPath('downloads'),
    engines: Object.entries(SEARCH_ENGINES).map(([id, v]) => ({ id, name: v.name })),
    defaults: DEFAULT_SETTINGS
  }));

  on('app:open-external', (_e, url) => browser.openExternal(url));
  on('app:relaunch', () => { app.relaunch(); app.exit(0); });
  on('app:reopen-tab', () => browser.reopenClosedTab());
  on('clipboard:write', (_e, text) => clipboard.writeText(String(text ?? '')));
  handle('clipboard:read', () => clipboard.readText());

  handle('app:closed-tabs', () => browser.closedTabs.slice(0, 10));

  // -------------------------------------------------- menus nativos (contexto)

  on('menu:tab-context', (e, { tabId, x, y }) => {
    const win = winOf(e);
    const tab = win?.getTab(tabId);
    if (!win || !tab) return;
    Menu.buildFromTemplate([
      { label: 'Nova aba à direita', click: () => win.createTab({ index: win.indexOf(tab) + 1, active: true }) },
      { type: 'separator' },
      { label: 'Recarregar', click: () => tab.reload() },
      { label: 'Duplicar', click: () => win.duplicateTab(tabId) },
      { label: tab.pinned ? 'Desafixar' : 'Fixar aba', click: () => win.togglePin(tabId) },
      { label: tab.muted ? 'Reativar som' : 'Silenciar aba', click: () => tab.setMuted(!tab.muted) },
      { type: 'separator' },
      { label: 'Fechar', click: () => win.closeTab(tabId) },
      { label: 'Fechar outras abas', enabled: win.tabs.length > 1, click: () => win.closeOtherTabs(tabId) },
      { label: 'Fechar abas à direita', enabled: win.indexOf(tab) < win.tabs.length - 1, click: () => win.closeTabsToRight(tabId) }
    ]).popup({ window: win.browserWindow, x: Math.round(x), y: Math.round(y) });
  });

  on('menu:bookmark-context', (e, { id, url, x, y }) => {
    const win = winOf(e);
    if (!win) return;
    Menu.buildFromTemplate([
      { label: 'Abrir', click: () => win.activeTab?.navigate(url) },
      { label: 'Abrir em nova aba', click: () => win.createTab({ url, active: false }) },
      { label: 'Abrir em nova janela', click: () => browser.createWindow({ url }) },
      { type: 'separator' },
      { label: 'Copiar endereço', click: () => clipboard.writeText(url) },
      { type: 'separator' },
      {
        label: 'Excluir',
        click: () => {
          const items = stores.bookmarks.get('items', []).filter((b) => b.id !== id);
          stores.bookmarks.set('items', items);
          browser.broadcast('bookmarks:changed', items);
        }
      }
    ]).popup({ window: win.browserWindow, x: Math.round(x), y: Math.round(y) });
  });

  // -------------------------------------------- páginas internas (calopsia://)

  handle('internal:navigate', (e, url) => {
    const win = browser.windowFor(e.sender);
    const tab = win?.tabs.find((t) => t.wc === e.sender);
    if (tab) tab.navigate(url);
    else win?.activeTab?.navigate(url);
  });

  handle('internal:new-tab', (e, url) => browser.windowFor(e.sender)?.createTab({ url, active: true }));

  handle('internal:top-sites', () => {
    const items = stores.history.get('items', []);
    const byHost = new Map();
    for (const h of items) {
      let host;
      try { host = new URL(h.url).hostname.replace(/^www\./, ''); } catch { continue; }
      const entry = byHost.get(host) || { host, url: `https://${host}`, title: host, visits: 0, favicon: h.favicon };
      entry.visits += h.visits || 1;
      if (!entry.favicon && h.favicon) entry.favicon = h.favicon;
      byHost.set(host, entry);
    }
    return [...byHost.values()].sort((a, b) => b.visits - a.visits).slice(0, 12);
  });
}

module.exports = { registerIpc };
