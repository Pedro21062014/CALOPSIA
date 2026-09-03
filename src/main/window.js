'use strict';

const path = require('node:path');
const { BrowserWindow, WebContentsView, session, shell, nativeTheme, dialog, app } = require('electron');
const { PATHS, CHROME, SCHEME } = require('./constants');
const { stores } = require('./store');
const { AdBlocker } = require('./adblock');
const { Tab } = require('./tab');
const { isInternalUrl, registerProtocolHandler } = require('./protocol');

const IS_MAC = process.platform === 'darwin';

let WIN_SEQ = 0;

/**
 * Janela do navegador.
 *
 * Arquitetura de camadas:
 *   contentView
 *     ├── tabView (WebContentsView da aba ativa)   → área abaixo da chrome
 *     └── uiView (WebContentsView com a interface) → faixa superior
 *
 * Quando um overlay da UI precisa cobrir a página (menu, sugestões da
 * omnibox, painel de downloads), a uiView é expandida para a janela inteira
 * e trazida ao topo — com fundo transparente. Isso reproduz o comportamento
 * nativo do Chrome sem recorrer a janelas auxiliares.
 */
class AppWindow {
  /**
   * @param {import('./app')} appCtl
   * @param {{url?: string, incognito?: boolean, restore?: object}} opts
   */
  constructor(appCtl, opts = {}) {
    this.id = ++WIN_SEQ;
    this.app = appCtl;
    this.incognito = !!opts.incognito;
    this.tabs = [];
    this.activeTab = null;
    this.overlayExpanded = false;
    this.contentFullScreen = false;
    this.extraChromeHeight = 0;
    this.destroyed = false;

    this.session = this.incognito
      ? session.fromPartition(`calopsia-private-${this.id}`)
      : session.fromPartition('persist:calopsia');

    this.adblock = new AdBlocker();

    const bounds = stores.settings.get('windowBounds', { width: 1280, height: 820 });

    this.browserWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: opts.x,
      y: opts.y,
      minWidth: 620,
      minHeight: 420,
      show: false,
      frame: false,
      titleBarStyle: IS_MAC ? 'hidden' : 'default',
      trafficLightPosition: IS_MAC ? { x: 14, y: 13 } : undefined,
      backgroundColor: this.incognito ? '#1c1b22' : '#16161a',
      title: 'Calopsia',
      icon: this._iconPath(),
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });

    this._setupSession();
    this._createUI();
    this._bindWindowEvents();

    if (opts.restore?.tabs?.length) {
      opts.restore.tabs.forEach((t, i) =>
        this.createTab({ url: t.url, active: i === (opts.restore.activeIndex || 0), pinned: t.pinned, silent: true })
      );
      this.layout();
    } else {
      this.createTab({ url: opts.url || this.app.startUrl(), active: true });
    }
  }

  _iconPath() {
    const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
    return path.join(PATHS.ROOT, 'build', file);
  }

  // ---------------------------------------------------------------- sessão

  _setupSession() {
    const ses = this.session;
    if (ses._calopsiaReady) return;
    ses._calopsiaReady = true;

    // O esquema calopsia:// precisa existir dentro desta partição.
    registerProtocolHandler(ses);

    this.adblock.attach(ses);

    // Bloqueia permissões sensíveis por padrão, perguntando ao usuário.
    const AUTO_ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
    const AUTO_DENY = new Set(['midiSysex', 'hid', 'serial', 'usb', 'idle-detection']);

    ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
      if (AUTO_ALLOW.has(permission)) return callback(true);
      if (AUTO_DENY.has(permission)) return callback(false);
      if (permission === 'openExternal') return callback(false);

      const origin = (() => {
        try { return new URL(details.requestingUrl || wc.getURL()).origin; } catch { return 'este site'; }
      })();

      const labels = {
        media: 'usar sua câmera e/ou microfone',
        geolocation: 'acessar sua localização',
        notifications: 'enviar notificações',
        'display-capture': 'capturar sua tela',
        'persistent-storage': 'armazenar dados permanentemente',
        'clipboard-read': 'ler sua área de transferência'
      };

      const { response } = await dialog.showMessageBox(this.browserWindow, {
        type: 'question',
        buttons: ['Permitir', 'Bloquear'],
        defaultId: 1,
        cancelId: 1,
        title: 'Permissão solicitada',
        message: `${origin} quer ${labels[permission] || `usar: ${permission}`}.`,
        detail: 'Só permita se você confia neste site.'
      });
      callback(response === 0);
    });

    ses.setPermissionCheckHandler(() => false);

    // HTTPS-Only: promove http:// → https:// quando habilitado.
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
      if (!stores.settings.get('httpsOnly') || details.resourceType !== 'mainFrame') return callback({});
      let u;
      try { u = new URL(details.url); } catch { return callback({}); }
      if (u.hostname === 'localhost' || /^127\.|^192\.168\.|^10\./.test(u.hostname)) return callback({});
      u.protocol = 'https:';
      callback({ redirectURL: u.toString() });
    });

    ses.on('will-download', (_e, item) => this._handleDownload(item));
  }

  _handleDownload(item) {
    const settings = stores.settings;
    const dir = settings.get('downloadPath') || app.getPath('downloads');
    if (!settings.get('askDownloadLocation')) {
      item.setSavePath(path.join(dir, item.getFilename()));
    }

    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filename: item.getFilename(),
      url: item.getURL(),
      path: '',
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      startedAt: Date.now(),
      paused: false
    };

    if (!this.incognito) {
      const items = stores.downloads.get('items', []);
      items.unshift(record);
      stores.downloads.set('items', items.slice(0, 300));
    }
    this.app.broadcast('download:started', record);

    item.on('updated', (_ev, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.state = state === 'interrupted' ? 'interrupted' : 'progressing';
      record.paused = item.isPaused();
      this.app.broadcast('download:updated', record);
      const total = record.totalBytes;
      this.browserWindow.setProgressBar(total > 0 ? record.receivedBytes / total : -1);
    });

    item.once('done', (_ev, state) => {
      record.state = state;
      record.path = item.getSavePath();
      record.receivedBytes = item.getReceivedBytes();
      record.finishedAt = Date.now();
      this.browserWindow.setProgressBar(-1);
      if (!this.incognito) {
        const items = stores.downloads.get('items', []);
        const idx = items.findIndex((d) => d.id === record.id);
        if (idx >= 0) items[idx] = record;
        stores.downloads.set('items', items);
      }
      this.app.broadcast('download:done', record);
    });

    this.app.downloadItems.set(record.id, item);
  }

  // -------------------------------------------------------------------- UI

  _createUI() {
    this.uiView = new WebContentsView({
      webPreferences: {
        preload: PATHS.PRELOAD_CHROME,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        transparent: true
      }
    });
    this.uiView.setBackgroundColor('#00000000');
    this.ui = this.uiView.webContents;

    this.browserWindow.contentView.addChildView(this.uiView);
    this.ui.loadFile(path.join(PATHS.RENDERER, 'index.html'), {
      query: { incognito: String(this.incognito), platform: process.platform }
    });

    this.ui.on('did-finish-load', () => {
      this.sendBootstrap();
      this.browserWindow.show();
    });

    // A UI nunca navega para fora de si mesma.
    this.ui.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) this.createTab({ url, active: true });
      return { action: 'deny' };
    });
    this.ui.on('will-navigate', (e) => e.preventDefault());
  }

  sendBootstrap() {
    this.send('bootstrap', {
      windowId: this.id,
      incognito: this.incognito,
      platform: process.platform,
      version: app.getVersion(),
      chromeVersion: process.versions.chrome,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      settings: stores.settings.get(),
      bookmarks: stores.bookmarks.get('items', []),
      downloads: this.incognito ? [] : stores.downloads.get('items', []).slice(0, 40),
      tabs: this.tabs.map((t) => t.serialize()).filter(Boolean),
      activeTabId: this.activeTab?.id ?? null,
      maximized: this.browserWindow.isMaximized(),
      chromeMetrics: CHROME
    });
  }

  send(channel, payload) {
    if (this.destroyed || this.ui.isDestroyed()) return;
    this.ui.send(channel, payload);
  }

  emitTabUpdate(tab) {
    const data = tab.serialize();
    if (data) this.send('tab:updated', data);
  }

  emitTabsChanged() {
    this.send('tabs:changed', {
      tabs: this.tabs.map((t) => t.serialize()).filter(Boolean),
      activeTabId: this.activeTab?.id ?? null
    });
  }

  // --------------------------------------------------------------- layout

  get chromeHeight() {
    if (this.contentFullScreen) return 0;
    const bookmarks =
      stores.settings.get('showBookmarksBar') && !this.incognito ? CHROME.BOOKMARKS_BAR : 0;
    return CHROME.TAB_BAR + CHROME.TOOLBAR + bookmarks + this.extraChromeHeight;
  }

  /** Faixas extras acopladas ao topo, como a barra de localizar na página. */
  setExtraChromeHeight(px) {
    const next = Math.max(0, Math.min(200, Number(px) || 0));
    if (next === this.extraChromeHeight) return;
    this.extraChromeHeight = next;
    this.layout();
  }

  layout() {
    if (this.destroyed || this.browserWindow.isDestroyed()) return;
    const { width, height } = this.browserWindow.getContentBounds();
    const top = this.chromeHeight;

    this.uiView.setBounds(
      this.overlayExpanded || this.contentFullScreen
        ? { x: 0, y: 0, width, height }
        : { x: 0, y: 0, width, height: top }
    );

    for (const tab of this.tabs) {
      if (tab === this.activeTab) {
        tab.view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
        tab.view.setVisible(true);
      } else {
        tab.view.setVisible(false);
      }
    }
  }

  /** Expande a UI para cobrir a página (usado por menus e popovers). */
  setOverlay(expanded) {
    if (this.overlayExpanded === expanded) return;
    this.overlayExpanded = expanded;
    if (expanded) this.browserWindow.contentView.addChildView(this.uiView); // topo
    this.layout();
    if (!expanded && this.activeTab) {
      this.browserWindow.contentView.addChildView(this.activeTab.view);
      this.layout();
    }
  }

  setContentFullScreen(on) {
    this.contentFullScreen = on;
    this.browserWindow.setFullScreen(on);
    this.send('window:content-fullscreen', on);
    this.layout();
  }

  // ----------------------------------------------------------------- abas

  indexOf(tab) {
    return this.tabs.indexOf(tab);
  }

  getTab(id) {
    return this.tabs.find((t) => t.id === id) || null;
  }

  createTab(opts = {}) {
    const tab = new Tab(this, opts);
    const index = Number.isInteger(opts.index) ? Math.min(opts.index, this.tabs.length) : this.tabs.length;
    this.tabs.splice(index, 0, tab);
    this.browserWindow.contentView.addChildView(tab.view);

    if (opts.active !== false) this.setActiveTab(tab.id);
    if (!opts.silent) {
      this.emitTabsChanged();
      this.layout();
    }
    return tab;
  }

  setActiveTab(id) {
    const tab = this.getTab(id);
    if (!tab || tab === this.activeTab) {
      if (tab) this.layout();
      return;
    }
    this.activeTab = tab;
    // Reordena: a aba ativa entra abaixo da UI, e a UI volta ao topo se expandida.
    this.browserWindow.contentView.addChildView(tab.view);
    if (this.overlayExpanded) this.browserWindow.contentView.addChildView(this.uiView);
    this.layout();
    this.emitTabsChanged();
    this.browserWindow.setTitle(`${tab.title} — Calopsia`);
    if (!tab.destroyed) tab.wc.focus();
  }

  closeTab(id) {
    const tab = this.getTab(id);
    if (!tab) return;
    const index = this.indexOf(tab);
    this.tabs.splice(index, 1);

    this.app.pushClosedTab({ url: tab.url, title: tab.title, windowId: this.id });

    try {
      this.browserWindow.contentView.removeChildView(tab.view);
    } catch { /* view já removida */ }
    tab.destroy();

    if (this.activeTab === tab) {
      this.activeTab = null;
      const next = this.tabs[index] || this.tabs[index - 1];
      if (next) this.setActiveTab(next.id);
    }

    if (!this.tabs.length) {
      if (stores.settings.get('closeWindowOnLastTab', true)) this.browserWindow.close();
      else this.createTab({ url: this.app.startUrl(), active: true });
      return;
    }
    this.emitTabsChanged();
    this.layout();
  }

  closeOtherTabs(id) {
    [...this.tabs].filter((t) => t.id !== id).forEach((t) => this.closeTab(t.id));
  }

  closeTabsToRight(id) {
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    [...this.tabs.slice(idx + 1)].forEach((t) => this.closeTab(t.id));
  }

  moveTab(id, toIndex) {
    const from = this.tabs.findIndex((t) => t.id === id);
    if (from < 0) return;
    const [tab] = this.tabs.splice(from, 1);
    this.tabs.splice(Math.max(0, Math.min(toIndex, this.tabs.length)), 0, tab);
    this.emitTabsChanged();
  }

  cycleTab(delta) {
    if (this.tabs.length < 2) return;
    const idx = this.indexOf(this.activeTab);
    const next = (idx + delta + this.tabs.length) % this.tabs.length;
    this.setActiveTab(this.tabs[next].id);
  }

  selectTabByIndex(n) {
    const tab = n === 9 ? this.tabs[this.tabs.length - 1] : this.tabs[n];
    if (tab) this.setActiveTab(tab.id);
  }

  duplicateTab(id) {
    const tab = this.getTab(id);
    if (tab) this.createTab({ url: tab.url, active: true, index: this.indexOf(tab) + 1 });
  }

  togglePin(id) {
    const tab = this.getTab(id);
    if (!tab) return;
    tab.pinned = !tab.pinned;
    // Abas fixadas ficam sempre no início.
    this.tabs.splice(this.indexOf(tab), 1);
    const lastPinned = this.tabs.filter((t) => t.pinned).length;
    this.tabs.splice(tab.pinned ? lastPinned : this.tabs.length, 0, tab);
    this.emitTabsChanged();
  }

  // -------------------------------------------------------------- histórico

  recordHistory(url, title, favicon) {
    if (this.incognito || isInternalUrl(url) || !/^https?:/i.test(url)) return;
    const items = stores.history.get('items', []);
    const now = Date.now();
    const existing = items.findIndex((h) => h.url === url);
    if (existing >= 0) {
      items[existing].visitedAt = now;
      items[existing].visits = (items[existing].visits || 1) + 1;
      if (title) items[existing].title = title;
      const [entry] = items.splice(existing, 1);
      items.unshift(entry);
    } else {
      items.unshift({ url, title: title || url, favicon, visitedAt: now, visits: 1 });
    }
    stores.history.set('items', items.slice(0, 8000));
  }

  recordHistoryTitle(url, title) {
    if (this.incognito || !title) return;
    const items = stores.history.get('items', []);
    const entry = items.find((h) => h.url === url);
    if (entry && entry.title !== title) {
      entry.title = title;
      stores.history.save();
    }
  }

  // --------------------------------------------------------------- eventos

  _bindWindowEvents() {
    const bw = this.browserWindow;

    bw.on('resize', () => {
      this.layout();
      if (!bw.isMaximized() && !bw.isFullScreen()) {
        const [width, height] = bw.getSize();
        stores.settings.set('windowBounds', { width, height });
      }
    });
    bw.on('move', () => this.layout());
    bw.on('maximize', () => { this.send('window:state', { maximized: true }); this.layout(); });
    bw.on('unmaximize', () => { this.send('window:state', { maximized: false }); this.layout(); });
    bw.on('enter-full-screen', () => { this.send('window:state', { fullscreen: true }); this.layout(); });
    bw.on('leave-full-screen', () => {
      this.contentFullScreen = false;
      this.send('window:state', { fullscreen: false });
      this.layout();
    });
    bw.on('focus', () => this.send('window:state', { focused: true }));
    bw.on('blur', () => this.send('window:state', { focused: false }));

    bw.on('close', () => {
      if (!this.incognito) this.app.saveSession();
    });

    bw.on('closed', () => {
      this.destroyed = true;
      this.tabs.forEach((t) => t.destroy());
      this.tabs = [];
      if (this.incognito) this.session.clearStorageData().catch(() => {});
      this.app.removeWindow(this);
    });

    nativeTheme.on('updated', () => {
      this.send('theme:changed', {
        dark: nativeTheme.shouldUseDarkColors,
        source: nativeTheme.themeSource
      });
    });
  }

  serializeSession() {
    return {
      bounds: this.browserWindow.getBounds(),
      maximized: this.browserWindow.isMaximized(),
      activeIndex: Math.max(0, this.indexOf(this.activeTab)),
      tabs: this.tabs
        .filter((t) => !isInternalUrl(t.url) || t.url.includes('newtab'))
        .map((t) => ({ url: t.url, title: t.title, pinned: t.pinned }))
    };
  }
}

module.exports = { AppWindow };
