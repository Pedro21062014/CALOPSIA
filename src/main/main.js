'use strict';

const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, shell, dialog, nativeTheme } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

// ─── Security ───────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');

// ─── State ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let tabs = [];       // { id, view, url, title, favicon, loading }
let activeTabId = null;
let tabIdCounter = 0;

// ─── Create Main Window ─────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0f0f13',
    show: false,
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Open first tab
    createTab('https://www.google.com');
  });

  mainWindow.on('resize', () => resizeActiveTab());
  mainWindow.on('maximize', () => { resizeActiveTab(); mainWindow.webContents.send('window-state', 'maximized'); });
  mainWindow.on('unmaximize', () => { resizeActiveTab(); mainWindow.webContents.send('window-state', 'normal'); });
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('window-state', 'fullscreen'));
  mainWindow.on('leave-full-screen', () => { resizeActiveTab(); mainWindow.webContents.send('window-state', 'normal'); });

  mainWindow.on('closed', () => { mainWindow = null; });

  buildAppMenu();
}

// ─── Tab Geometry ────────────────────────────────────────────────────────────
const TOOLBAR_HEIGHT = 92; // px — matches CSS

function getContentBounds() {
  const [w, h] = mainWindow.getContentSize();
  return { x: 0, y: TOOLBAR_HEIGHT, width: w, height: h - TOOLBAR_HEIGHT };
}

function resizeActiveTab() {
  if (!mainWindow) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) tab.view.setBounds(getContentBounds());
}

// ─── Tab Management ──────────────────────────────────────────────────────────
function createTab(url = 'https://www.google.com', background = false) {
  const id = ++tabIdCounter;
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      plugins: true,
    },
  });

  mainWindow.addBrowserView(view);
  view.setBackgroundColor('#ffffff');

  // Wire events
  const wc = view.webContents;

  wc.on('did-start-loading', () => sendTabUpdate(id, { loading: true }));
  wc.on('did-stop-loading', () => sendTabUpdate(id, { loading: false, url: wc.getURL() }));
  wc.on('did-navigate', (_, navUrl) => sendTabUpdate(id, { url: navUrl, loading: false }));
  wc.on('did-navigate-in-page', (_, navUrl) => sendTabUpdate(id, { url: navUrl }));
  wc.on('page-title-updated', (_, title) => sendTabUpdate(id, { title }));
  wc.on('page-favicon-updated', (_, favicons) => sendTabUpdate(id, { favicon: favicons[0] || '' }));
  wc.on('did-fail-load', (_, errCode, errDesc) => {
    if (errCode === -3) return; // aborted
    wc.loadFile(path.join(__dirname, '../renderer/error.html'), {
      query: { code: String(errCode), desc: errDesc, url: wc.getURL() },
    });
  });

  wc.on('new-window', (e, newUrl) => { e.preventDefault(); createTab(newUrl); });
  wc.setWindowOpenHandler(({ url: newUrl }) => { createTab(newUrl); return { action: 'deny' }; });

  // Context menu
  wc.on('context-menu', (e, params) => {
    buildContextMenu(params, view).popup({ window: mainWindow });
  });

  const tab = { id, view, url, title: 'New Tab', favicon: '', loading: true };
  tabs.push(tab);

  wc.loadURL(url).catch(() => {});

  if (!background) switchToTab(id);

  // Notify renderer
  mainWindow.webContents.send('tab-created', { id, url, title: 'New Tab', favicon: '', loading: true, active: !background });

  return id;
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  const tab = tabs[idx];
  mainWindow.removeBrowserView(tab.view);
  tab.view.webContents.destroy();
  tabs.splice(idx, 1);

  mainWindow.webContents.send('tab-closed', { id });

  if (tabs.length === 0) {
    app.quit();
    return;
  }
  if (activeTabId === id) {
    const next = tabs[Math.min(idx, tabs.length - 1)];
    switchToTab(next.id);
  }
}

function switchToTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  activeTabId = id;
  // Hide all, show active
  tabs.forEach(t => {
    if (t.id === id) {
      t.view.setBounds(getContentBounds());
    } else {
      t.view.setBounds({ x: 0, y: -9999, width: 0, height: 0 });
    }
  });
  mainWindow.setTopBrowserView(tab.view);
  mainWindow.webContents.send('tab-activated', { id });
}

function sendTabUpdate(id, data) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  Object.assign(tab, data);
  if (mainWindow) mainWindow.webContents.send('tab-updated', { id, ...data });
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────
ipcMain.on('navigate', (_, { id, url }) => {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  let target = url.trim();
  if (!target.startsWith('http://') && !target.startsWith('https://') && !target.includes('://')) {
    target = isURL(target) ? 'https://' + target : 'https://www.google.com/search?q=' + encodeURIComponent(target);
  }
  tab.view.webContents.loadURL(target).catch(() => {});
});

ipcMain.on('tab-new', () => createTab());
ipcMain.on('tab-close', (_, { id }) => closeTab(id));
ipcMain.on('tab-switch', (_, { id }) => switchToTab(id));
ipcMain.on('tab-reload', (_, { id }) => { const t = tabs.find(x => x.id === id); t && t.view.webContents.reload(); });
ipcMain.on('tab-stop', (_, { id }) => { const t = tabs.find(x => x.id === id); t && t.view.webContents.stop(); });
ipcMain.on('tab-back', (_, { id }) => { const t = tabs.find(x => x.id === id); t && t.view.webContents.goBack(); });
ipcMain.on('tab-forward', (_, { id }) => { const t = tabs.find(x => x.id === id); t && t.view.webContents.goForward(); });
ipcMain.on('tab-can-nav', (_, { id }) => {
  const t = tabs.find(x => x.id === id);
  if (!t) return;
  mainWindow.webContents.send('tab-can-nav', {
    id,
    canGoBack: t.view.webContents.canGoBack(),
    canGoForward: t.view.webContents.canGoForward(),
  });
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.handle('get-history', () => store.get('history', []));
ipcMain.on('add-history', (_, item) => {
  const history = store.get('history', []);
  history.unshift({ ...item, ts: Date.now() });
  store.set('history', history.slice(0, 2000));
});

ipcMain.handle('get-bookmarks', () => store.get('bookmarks', []));
ipcMain.on('add-bookmark', (_, item) => {
  const bookmarks = store.get('bookmarks', []);
  bookmarks.unshift({ ...item, ts: Date.now() });
  store.set('bookmarks', bookmarks);
  mainWindow.webContents.send('bookmarks-updated', bookmarks);
});
ipcMain.on('remove-bookmark', (_, { url }) => {
  const bookmarks = store.get('bookmarks', []).filter(b => b.url !== url);
  store.set('bookmarks', bookmarks);
  mainWindow.webContents.send('bookmarks-updated', bookmarks);
});

ipcMain.on('open-devtools', (_, { id }) => {
  const t = tabs.find(x => x.id === id);
  t && t.view.webContents.openDevTools();
});

ipcMain.on('zoom-in', (_, { id }) => {
  const t = tabs.find(x => x.id === id);
  if (t) t.view.webContents.setZoomLevel(t.view.webContents.getZoomLevel() + 0.5);
});
ipcMain.on('zoom-out', (_, { id }) => {
  const t = tabs.find(x => x.id === id);
  if (t) t.view.webContents.setZoomLevel(t.view.webContents.getZoomLevel() - 0.5);
});
ipcMain.on('zoom-reset', (_, { id }) => {
  const t = tabs.find(x => x.id === id);
  if (t) t.view.webContents.setZoomLevel(0);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isURL(str) {
  return /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/.test(str);
}

function buildContextMenu(params, view) {
  const wc = view.webContents;
  const items = [];
  if (params.linkURL) {
    items.push(
      { label: 'Open link in new tab', click: () => createTab(params.linkURL) },
      { label: 'Copy link address', click: () => require('electron').clipboard.writeText(params.linkURL) },
      { type: 'separator' },
    );
  }
  if (params.selectionText) {
    items.push(
      { label: 'Copy', role: 'copy' },
      { label: `Search for "${params.selectionText.slice(0, 30)}…"`, click: () => createTab(`https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`) },
      { type: 'separator' },
    );
  }
  items.push(
    { label: 'Back', enabled: wc.canGoBack(), click: () => wc.goBack() },
    { label: 'Forward', enabled: wc.canGoForward(), click: () => wc.goForward() },
    { label: 'Reload', click: () => wc.reload() },
    { type: 'separator' },
    { label: 'Save page as…', click: () => wc.savePage(path.join(app.getPath('downloads'), 'page.html'), 'HTMLComplete') },
    { label: 'Print…', click: () => wc.print() },
    { label: 'Inspect element', click: () => wc.inspectElement(params.x, params.y) },
  );
  return Menu.buildFromTemplate(items);
}

function buildAppMenu() {
  const template = [
    {
      label: 'Calopsia',
      submenu: [
        { label: 'About Calopsia', role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => {} },
        { type: 'separator' },
        { label: 'Quit Calopsia', role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => createTab() },
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => closeTab(activeTabId) },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' }, { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('find') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => { const t = tabs.find(x => x.id === activeTabId); t && t.view.webContents.reload(); } },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => { const t = tabs.find(x => x.id === activeTabId); t && t.view.webContents.reloadIgnoringCache(); } },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => ipcMain.emit('zoom-in', null, { id: activeTabId }) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => ipcMain.emit('zoom-out', null, { id: activeTabId }) },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => ipcMain.emit('zoom-reset', null, { id: activeTabId }) },
        { type: 'separator' },
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => { const t = tabs.find(x => x.id === activeTabId); t && t.view.webContents.toggleDevTools(); } },
        { label: 'Toggle UI DevTools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' },
        { role: 'front' }, { role: 'window' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Block ads / trackers (basic list)
  const filter = { urls: ['*://*.doubleclick.net/*', '*://*.googlesyndication.com/*', '*://*.adnxs.com/*'] };
  session.defaultSession.webRequest.onBeforeRequest(filter, (_, callback) => callback({ cancel: true }));

  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
