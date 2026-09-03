'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  dialog,
  ipcMain,
  session,
  shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_ROOT = path.resolve(__dirname, '..');
const RENDERER_ROOT = path.join(APP_ROOT, 'renderer');
const NEW_TAB_FILE = path.join(RENDERER_ROOT, 'newtab.html');
const ERROR_FILE = path.join(RENDERER_ROOT, 'error.html');
const NEW_TAB_URL = pathToFileURL(NEW_TAB_FILE).href;
const ERROR_URL = pathToFileURL(ERROR_FILE).href;
const CHROME_HEIGHT = 108;
const STATUS_HEIGHT = 26;
const SEARCH_URL = 'https://duckduckgo.com/?q=';
const isMac = process.platform === 'darwin';
const isDevelopment = process.argv.includes('--dev');

let nextTabId = 1;
let sessionConfigured = false;
const controllers = new Set();
const uiOwners = new Map();

app.setName('CALOPSIA');
app.setAppUserModelId('ai.calopsia.browser');

class BrowserController {
  constructor() {
    this.tabs = [];
    this.activeTabId = null;
    this.closedTabs = [];
    this.status = 'Pronto';
    this.downloadStatus = '';
    this.destroying = false;

    this.win = new BrowserWindow({
      width: 1320,
      height: 840,
      minWidth: 820,
      minHeight: 560,
      show: false,
      backgroundColor: '#090b10',
      title: 'CALOPSIA',
      ...(isMac
        ? {
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 16, y: 14 },
          }
        : { frame: false }),
      webPreferences: {
        preload: path.join(APP_ROOT, 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
      },
    });

    controllers.add(this);
    uiOwners.set(this.win.webContents.id, this);

    this.win.loadFile(path.join(RENDERER_ROOT, 'index.html'));
    this.win.once('ready-to-show', () => this.win.show());
    this.win.on('resize', () => this.layoutActiveView());
    this.win.on('maximize', () => this.pushState());
    this.win.on('unmaximize', () => this.pushState());
    this.win.on('enter-full-screen', () => this.pushState());
    this.win.on('leave-full-screen', () => this.pushState());
    this.win.on('focus', () => this.pushState());
    this.win.on('closed', () => this.dispose());

    this.createTab('', true);
  }

  get activeTab() {
    return this.tabs.find((tab) => tab.id === this.activeTabId) || null;
  }

  createTab(input = '', activate = true) {
    const tab = {
      id: nextTabId++,
      title: 'Nova aba',
      favicon: '',
      view: new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          spellcheck: true,
          partition: 'persist:calopsia',
        },
      }),
      lastRequestedUrl: '',
      failedUrl: '',
    };

    tab.view.setBackgroundColor('#0b0e14');
    this.tabs.push(tab);
    this.wireTab(tab);

    if (activate) this.activateTab(tab.id);
    this.navigate(tab, input);
    this.pushState();
    return tab;
  }

  wireTab(tab) {
    const contents = tab.view.webContents;

    contents.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) this.createTab(url, true);
      else this.openExternalProtocol(url);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (isAllowedInTab(url)) return;
      event.preventDefault();
      this.openExternalProtocol(url);
    });

    contents.on('did-start-loading', () => {
      if (tab.id === this.activeTabId) this.status = 'Carregando…';
      this.pushState();
    });

    contents.on('did-stop-loading', () => {
      if (tab.id === this.activeTabId) this.status = this.downloadStatus || 'Pronto';
      this.pushState();
    });

    const navigationChanged = (_event, url) => {
      if (isWebUrl(url)) {
        tab.lastRequestedUrl = url;
        tab.failedUrl = '';
      }
      this.pushState();
    };

    contents.on('did-navigate', navigationChanged);
    contents.on('did-navigate-in-page', navigationChanged);

    contents.on('page-title-updated', (event, title) => {
      event.preventDefault();
      tab.title = cleanTitle(title) || titleFromUrl(this.displayUrl(tab)) || 'Nova aba';
      this.pushState();
    });

    contents.on('page-favicon-updated', (_event, favicons) => {
      tab.favicon = favicons.find((favicon) => /^https?:|^data:/.test(favicon)) || '';
      this.pushState();
    });

    contents.on('update-target-url', (_event, url) => {
      if (tab.id !== this.activeTabId) return;
      this.status = url ? compactUrl(url) : this.downloadStatus || 'Pronto';
      this.pushState();
    });

    contents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame || errorCode === -3 || validatedURL.startsWith(ERROR_URL)) return;
        if (!isWebUrl(validatedURL)) return;
        tab.failedUrl = validatedURL;
        tab.lastRequestedUrl = validatedURL;
        tab.title = 'Não foi possível abrir';
        contents
          .loadFile(ERROR_FILE, {
            query: {
              url: validatedURL,
              code: String(errorCode),
              description: errorDescription,
            },
          })
          .catch(() => {});
        this.pushState();
      },
    );

    contents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit') return;
      tab.title = 'A aba parou';
      this.status = 'O conteúdo desta aba foi encerrado inesperadamente.';
      this.pushState();
    });

    contents.on('found-in-page', (_event, result) => {
      if (!this.win.isDestroyed()) this.win.webContents.send('browser:find-result', result);
    });

    contents.on('context-menu', (_event, params) => this.showPageContextMenu(tab, params));
    contents.on('before-input-event', (event, input) => this.handlePageShortcut(event, input));
  }

  navigate(tab, input) {
    if (!tab || tab.view.webContents.isDestroyed()) return;
    const target = normalizeInput(input);

    if (target.kind === 'home') {
      tab.lastRequestedUrl = '';
      tab.failedUrl = '';
      tab.title = 'Nova aba';
      tab.favicon = '';
      tab.view.webContents.loadFile(NEW_TAB_FILE).catch(() => {});
      return;
    }

    if (target.kind === 'external') {
      this.openExternalProtocol(target.url);
      return;
    }

    tab.lastRequestedUrl = target.url;
    tab.failedUrl = '';
    tab.view.webContents.loadURL(target.url).catch(() => {});
  }

  activateTab(id) {
    const next = this.tabs.find((tab) => tab.id === id);
    if (!next || next.id === this.activeTabId) return;

    const current = this.activeTab;
    if (current) {
      try {
        this.win.contentView.removeChildView(current.view);
      } catch {
        // A view may already have been detached while closing a window.
      }
    }

    this.activeTabId = next.id;
    this.win.contentView.addChildView(next.view);
    this.layoutActiveView();
    next.view.webContents.focus();
    this.status = this.downloadStatus || 'Pronto';
    this.pushState();
  }

  closeTab(id = this.activeTabId) {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const [tab] = this.tabs.splice(index, 1);
    const wasActive = tab.id === this.activeTabId;

    if (isWebUrl(tab.lastRequestedUrl)) {
      this.closedTabs.unshift({ url: tab.lastRequestedUrl, title: tab.title });
      this.closedTabs = this.closedTabs.slice(0, 12);
    }

    if (wasActive) {
      try {
        this.win.contentView.removeChildView(tab.view);
      } catch {
        // The window can already be tearing down.
      }
      this.activeTabId = null;
    }

    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();

    if (this.tabs.length === 0) {
      this.win.close();
      return;
    }

    if (wasActive) {
      const replacement = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activateTab(replacement.id);
    }
    this.pushState();
  }

  reopenClosedTab() {
    const tab = this.closedTabs.shift();
    if (tab) this.createTab(tab.url, true);
  }

  reorderTabs(sourceId, targetId) {
    const from = this.tabs.findIndex((tab) => tab.id === sourceId);
    const to = this.tabs.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [tab] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, tab);
    this.pushState();
  }

  duplicateTab() {
    const tab = this.activeTab;
    this.createTab(tab && this.displayUrl(tab) ? this.displayUrl(tab) : '', true);
  }

  layoutActiveView() {
    const tab = this.activeTab;
    if (!tab || this.win.isDestroyed()) return;
    const [width, height] = this.win.getContentSize();
    tab.view.setBounds({
      x: 0,
      y: CHROME_HEIGHT,
      width: Math.max(0, width),
      height: Math.max(0, height - CHROME_HEIGHT - STATUS_HEIGHT),
    });
  }

  displayUrl(tab) {
    if (!tab || tab.view.webContents.isDestroyed()) return '';
    const current = tab.view.webContents.getURL();
    if (!current || current.startsWith(NEW_TAB_URL)) return '';
    if (current.startsWith(ERROR_URL)) return tab.failedUrl || tab.lastRequestedUrl;
    return current;
  }

  serialize() {
    const active = this.activeTab;
    const url = this.displayUrl(active);
    return {
      appName: 'CALOPSIA',
      version: app.getVersion(),
      platform: process.platform,
      activeTabId: this.activeTabId,
      tabs: this.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title || titleFromUrl(this.displayUrl(tab)) || 'Nova aba',
        url: this.displayUrl(tab),
        favicon: tab.favicon,
        loading: !tab.view.webContents.isDestroyed() && tab.view.webContents.isLoading(),
      })),
      active: active
        ? {
            id: active.id,
            title: active.title,
            url,
            canGoBack: active.view.webContents.navigationHistory.canGoBack(),
            canGoForward: active.view.webContents.navigationHistory.canGoForward(),
            loading: active.view.webContents.isLoading(),
            security: securityForUrl(url),
            zoom: Math.round(active.view.webContents.getZoomFactor() * 100),
          }
        : null,
      window: {
        maximized: this.win.isMaximized(),
        fullscreen: this.win.isFullScreen(),
      },
      status: this.status,
    };
  }

  pushState() {
    if (this.destroying || this.win.isDestroyed() || this.win.webContents.isDestroyed()) return;
    this.win.webContents.send('browser:state', this.serialize());
  }

  execute(command, payload = {}) {
    const tab = this.activeTab;
    const contents = tab && tab.view.webContents;

    switch (command) {
      case 'new-tab':
        this.createTab(payload.url || '', true);
        break;
      case 'close-tab':
        this.closeTab(Number(payload.id) || this.activeTabId);
        break;
      case 'activate-tab':
        this.activateTab(Number(payload.id));
        break;
      case 'reorder-tabs':
        this.reorderTabs(Number(payload.sourceId), Number(payload.targetId));
        break;
      case 'reopen-closed-tab':
        this.reopenClosedTab();
        break;
      case 'duplicate-tab':
        this.duplicateTab();
        break;
      case 'navigate':
        this.navigate(tab, String(payload.value || ''));
        break;
      case 'back':
        if (contents && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
        break;
      case 'forward':
        if (contents && contents.navigationHistory.canGoForward()) {
          contents.navigationHistory.goForward();
        }
        break;
      case 'reload':
        if (!contents) break;
        if (contents.isLoading()) contents.stop();
        else contents.reload();
        break;
      case 'home':
        this.navigate(tab, '');
        break;
      case 'find':
        if (contents && payload.text) {
          contents.findInPage(String(payload.text), {
            forward: payload.forward !== false,
            findNext: Boolean(payload.findNext),
          });
        }
        break;
      case 'stop-find':
        if (contents) contents.stopFindInPage(payload.action || 'clearSelection');
        break;
      case 'zoom-in':
        this.changeZoom(0.1);
        break;
      case 'zoom-out':
        this.changeZoom(-0.1);
        break;
      case 'zoom-reset':
        if (contents) contents.setZoomFactor(1);
        this.pushState();
        break;
      case 'open-downloads':
        shell.openPath(app.getPath('downloads'));
        break;
      default:
        break;
    }
  }

  changeZoom(delta) {
    const contents = this.activeTab && this.activeTab.view.webContents;
    if (!contents) return;
    const next = Math.min(3, Math.max(0.5, contents.getZoomFactor() + delta));
    contents.setZoomFactor(Number(next.toFixed(1)));
    this.pushState();
  }

  executeWindow(command) {
    switch (command) {
      case 'minimize':
        this.win.minimize();
        break;
      case 'maximize':
        if (this.win.isMaximized()) this.win.unmaximize();
        else this.win.maximize();
        break;
      case 'close':
        this.win.close();
        break;
      case 'fullscreen':
        this.win.setFullScreen(!this.win.isFullScreen());
        break;
      default:
        break;
    }
  }

  handlePageShortcut(event, input) {
    if (input.type !== 'keyDown') return;
    const primary = isMac ? input.meta : input.control;
    const key = input.key.toLowerCase();

    if (primary && key === 'l') {
      event.preventDefault();
      this.win.webContents.send('browser:focus-address');
    } else if (primary && key === 't') {
      event.preventDefault();
      this.createTab('', true);
    } else if (primary && key === 'w' && !input.shift) {
      event.preventDefault();
      this.closeTab();
    } else if (primary && input.shift && key === 't') {
      event.preventDefault();
      this.reopenClosedTab();
    } else if (primary && key === 'r') {
      event.preventDefault();
      this.execute('reload');
    } else if (primary && key === 'f') {
      event.preventDefault();
      this.win.webContents.send('browser:show-find');
    } else if (primary && (key === '+' || key === '=')) {
      event.preventDefault();
      this.changeZoom(0.1);
    } else if (primary && key === '-') {
      event.preventDefault();
      this.changeZoom(-0.1);
    } else if (primary && key === '0') {
      event.preventDefault();
      this.execute('zoom-reset');
    } else if (input.alt && key === 'arrowleft') {
      event.preventDefault();
      this.execute('back');
    } else if (input.alt && key === 'arrowright') {
      event.preventDefault();
      this.execute('forward');
    } else if (primary && /^[1-9]$/.test(key)) {
      event.preventDefault();
      const index = key === '9' ? this.tabs.length - 1 : Number(key) - 1;
      if (this.tabs[index]) this.activateTab(this.tabs[index].id);
    }
  }

  showPageContextMenu(tab, params) {
    const items = [];
    if (params.linkURL) {
      items.push(
        {
          label: 'Abrir link em nova aba',
          click: () => this.createTab(params.linkURL, true),
        },
        {
          label: 'Copiar endereço do link',
          click: () => require('electron').clipboard.writeText(params.linkURL),
        },
        { type: 'separator' },
      );
    }

    if (params.isEditable) {
      items.push(
        { role: 'undo', label: 'Desfazer', enabled: params.editFlags.canUndo },
        { role: 'redo', label: 'Refazer', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar', enabled: params.editFlags.canCut },
        { role: 'copy', label: 'Copiar', enabled: params.editFlags.canCopy },
        { role: 'paste', label: 'Colar', enabled: params.editFlags.canPaste },
        { role: 'selectAll', label: 'Selecionar tudo', enabled: params.editFlags.canSelectAll },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy', label: 'Copiar' }, { type: 'separator' });
    }

    items.push(
      {
        label: 'Voltar',
        enabled: tab.view.webContents.navigationHistory.canGoBack(),
        click: () => this.execute('back'),
      },
      {
        label: 'Avançar',
        enabled: tab.view.webContents.navigationHistory.canGoForward(),
        click: () => this.execute('forward'),
      },
      { label: 'Recarregar', click: () => this.execute('reload') },
    );

    if (isDevelopment) {
      items.push(
        { type: 'separator' },
        {
          label: 'Inspecionar',
          click: () => tab.view.webContents.inspectElement(params.x, params.y),
        },
      );
    }

    Menu.buildFromTemplate(items).popup({ window: this.win });
  }

  openExternalProtocol(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      this.status = 'Endereço inválido';
      this.pushState();
      return;
    }

    if (['mailto:', 'tel:', 'sms:'].includes(parsed.protocol)) {
      shell.openExternal(url).catch(() => {});
    } else {
      this.status = `Protocolo bloqueado: ${parsed.protocol}`;
      this.pushState();
    }
  }

  dispose() {
    if (this.destroying) return;
    this.destroying = true;
    uiOwners.delete(this.win.webContents.id);
    controllers.delete(this);
    for (const tab of this.tabs) {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    }
    this.tabs = [];
  }
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 180);
}

function titleFromUrl(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function compactUrl(raw) {
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 140);
  } catch {
    return raw.slice(0, 140);
  }
}

function isWebUrl(raw) {
  try {
    const protocol = new URL(raw).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedInTab(raw) {
  if (isWebUrl(raw)) return true;
  if (raw === 'about:blank') return true;
  try {
    if (new URL(raw).protocol !== 'file:') return false;
    const filePath = path.resolve(require('node:url').fileURLToPath(raw));
    return filePath.startsWith(`${RENDERER_ROOT}${path.sep}`) || filePath === RENDERER_ROOT;
  } catch {
    return false;
  }
}

function normalizeInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return { kind: 'home' };

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { kind: 'web', url: parsed.href };
      }
      return { kind: 'external', url: parsed.href };
    } catch {
      return { kind: 'web', url: `${SEARCH_URL}${encodeURIComponent(value)}` };
    }
  }

  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
  const domain = /^(?:[\p{L}\d-]+\.)+[\p{L}]{2,}(?::\d+)?(?:\/|$)/iu.test(value);
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/.test(value);

  if (!/\s/.test(value) && (local || domain || ipv4)) {
    return { kind: 'web', url: `${local ? 'http' : 'https'}://${value}` };
  }

  return { kind: 'web', url: `${SEARCH_URL}${encodeURIComponent(value)}` };
}

function securityForUrl(raw) {
  if (!raw) return { level: 'internal', label: 'CALOPSIA' };
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') return { level: 'secure', label: 'Conexão segura' };
    if (url.protocol === 'http:') return { level: 'insecure', label: 'Não seguro' };
    return { level: 'internal', label: 'Página local' };
  } catch {
    return { level: 'insecure', label: 'Endereço inválido' };
  }
}

function controllerForWebContents(contents) {
  for (const controller of controllers) {
    if (controller.tabs.some((tab) => tab.view.webContents === contents)) return controller;
  }
  return null;
}

function focusedController() {
  return [...controllers].find((controller) => controller.win.isFocused()) || [...controllers][0];
}

function uniqueDownloadPath(filename) {
  const directory = app.getPath('downloads');
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let candidate = path.join(directory, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${index++})${extension}`);
  }
  return candidate;
}

function configureSession() {
  if (sessionConfigured) return;
  sessionConfigured = true;
  const browserSession = session.fromPartition('persist:calopsia');
  const cleanUserAgent = browserSession
    .getUserAgent()
    .replace(/\sElectron\/[\d.]+/g, '')
    .replace(/\sCALOPSIA\/[\d.]+/g, '');
  browserSession.setUserAgent(cleanUserAgent);

  browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const controller = controllerForWebContents(webContents);
    if (!controller) return callback(false);

    const automaticallyAllowed = new Set(['fullscreen', 'clipboard-sanitized-write']);
    if (automaticallyAllowed.has(permission)) return callback(true);

    let origin = 'este site';
    try {
      origin = new URL(details.requestingUrl || webContents.getURL()).hostname || origin;
    } catch {
      // Keep the generic label.
    }

    dialog
      .showMessageBox(controller.win, {
        type: 'question',
        title: 'Permissão do site',
        message: `${origin} solicitou a permissão “${permission}”.`,
        detail: 'Permita apenas se você confia no site e iniciou esta ação.',
        buttons: ['Bloquear', 'Permitir'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => callback(response === 1))
      .catch(() => callback(false));
  });

  browserSession.on('will-download', (_event, item, webContents) => {
    const controller = controllerForWebContents(webContents);
    const savePath = uniqueDownloadPath(path.basename(item.getFilename()));
    item.setSavePath(savePath);

    if (controller) {
      controller.downloadStatus = `Baixando ${path.basename(savePath)}…`;
      controller.status = controller.downloadStatus;
      controller.pushState();
    }

    item.on('updated', (_downloadEvent, state) => {
      if (!controller || state === 'interrupted') return;
      const total = item.getTotalBytes();
      const percent = total > 0 ? Math.round((item.getReceivedBytes() / total) * 100) : 0;
      controller.downloadStatus = `Baixando ${path.basename(savePath)}${total > 0 ? ` — ${percent}%` : '…'}`;
      controller.status = controller.downloadStatus;
      controller.pushState();
    });

    item.once('done', (_downloadEvent, state) => {
      if (!controller) return;
      controller.downloadStatus = '';
      controller.status =
        state === 'completed'
          ? `Download concluído: ${path.basename(savePath)}`
          : `Download não concluído: ${path.basename(savePath)}`;
      controller.pushState();
    });
  });
}

function installIpc() {
  ipcMain.handle('browser:get-state', (event) => {
    const controller = uiOwners.get(event.sender.id);
    return controller ? controller.serialize() : null;
  });

  ipcMain.handle('browser:command', (event, command, payload) => {
    const controller = uiOwners.get(event.sender.id);
    if (!controller) return false;
    controller.execute(String(command), payload || {});
    return true;
  });

  ipcMain.handle('window:command', (event, command) => {
    const controller = uiOwners.get(event.sender.id);
    if (!controller) return false;
    controller.executeWindow(String(command));
    return true;
  });
}

function buildApplicationMenu() {
  const browser = (command, payload) => () => focusedController()?.execute(command, payload);
  const send = (channel) => () => focusedController()?.win.webContents.send(channel);

  const template = [
    ...(isMac
      ? [
          {
            label: 'CALOPSIA',
            submenu: [
              { role: 'about', label: 'Sobre o CALOPSIA' },
              { type: 'separator' },
              { role: 'services', label: 'Serviços' },
              { type: 'separator' },
              { role: 'hide', label: 'Ocultar CALOPSIA' },
              { role: 'hideOthers', label: 'Ocultar outros' },
              { role: 'unhide', label: 'Mostrar tudo' },
              { type: 'separator' },
              { role: 'quit', label: 'Encerrar CALOPSIA' },
            ],
          },
        ]
      : []),
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Nova aba', accelerator: 'CmdOrCtrl+T', click: browser('new-tab') },
        { label: 'Nova janela', accelerator: 'CmdOrCtrl+N', click: () => new BrowserController() },
        {
          label: 'Reabrir aba fechada',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: browser('reopen-closed-tab'),
        },
        { type: 'separator' },
        { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: browser('close-tab') },
        ...(isMac ? [] : [{ role: 'quit', label: 'Sair' }]),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
        { type: 'separator' },
        {
          label: 'Localizar na página',
          accelerator: 'CmdOrCtrl+F',
          click: send('browser:show-find'),
        },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: browser('reload') },
        { type: 'separator' },
        { label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+Plus', click: browser('zoom-in') },
        { label: 'Diminuir zoom', accelerator: 'CmdOrCtrl+-', click: browser('zoom-out') },
        { label: 'Zoom real', accelerator: 'CmdOrCtrl+0', click: browser('zoom-reset') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(isDevelopment
          ? [
              { type: 'separator' },
              { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor da interface' },
            ]
          : []),
      ],
    },
    {
      label: 'Janela',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        ...(isMac
          ? [
              { role: 'zoom', label: 'Zoom da janela' },
              { type: 'separator' },
              { role: 'front', label: 'Trazer tudo para frente' },
            ]
          : [{ role: 'close', label: 'Fechar janela' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    let controller = focusedController();
    if (!controller) controller = new BrowserController();
    if (controller.win.isMinimized()) controller.win.restore();
    controller.win.focus();
    const candidate = commandLine.find((argument) => isWebUrl(argument));
    if (candidate) controller.createTab(candidate, true);
  });

  app.whenReady().then(() => {
    configureSession();
    installIpc();
    buildApplicationMenu();
    new BrowserController();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) new BrowserController();
    });
  });
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
