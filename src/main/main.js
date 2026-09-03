'use strict';

const { app, BrowserWindow, ipcMain, session, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const Store = require('electron-store');

// ─── Persistent store ────────────────────────────────────────────────────────
const store = new Store({
  defaults: {
    windowBounds: { width: 1280, height: 800 },
    tabs: [],
    history: [],
    bookmarks: [],
    settings: {
      homepage: 'https://www.google.com',
      searchEngine: 'https://www.google.com/search?q=',
      theme: 'system',
      adBlock: true,
      javascript: true,
    },
  },
});

// ─── Globals ─────────────────────────────────────────────────────────────────
let mainWindow = null;
const isDev = process.env.NODE_ENV === 'development';

// ─── Ad-block / tracker block list (basic) ───────────────────────────────────
const BLOCKED_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adnxs.com', 'ads.yahoo.com', 'advertising.com', 'scorecardresearch.com',
  'outbrain.com', 'taboola.com', 'revcontent.com', 'media.net',
  'mathtag.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  'casalemedia.com', 'smaato.net', 'smartadserver.com', 'yieldmo.com',
  'criteo.com', 'criteo.net', 'quantserve.com', 'chartbeat.com',
  'hotjar.com', 'optimizely.com',
];

function setupAdBlock() {
  const settings = store.get('settings');
  if (!settings.adBlock) return;

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    try {
      const url = new URL(details.url);
      const blocked = BLOCKED_HOSTS.some(h => url.hostname.endsWith(h));
      cb({ cancel: blocked });
    } catch {
      cb({ cancel: false });
    }
  });
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f13' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      allowRunningInsecureContent: false,
    },
    show: false,
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools();
  });

  // Save window size
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    store.set('windowBounds', { width: w, height: h });
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  setupAdBlock();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Settings
ipcMain.handle('get-settings', () => store.get('settings'));
ipcMain.handle('set-settings', (_, s) => { store.set('settings', { ...store.get('settings'), ...s }); });

// History
ipcMain.handle('get-history', () => store.get('history'));
ipcMain.handle('add-history', (_, entry) => {
  const history = store.get('history');
  history.unshift({ ...entry, date: Date.now() });
  store.set('history', history.slice(0, 5000));
});
ipcMain.handle('clear-history', () => store.set('history', []));

// Bookmarks
ipcMain.handle('get-bookmarks', () => store.get('bookmarks'));
ipcMain.handle('add-bookmark', (_, bm) => {
  const bms = store.get('bookmarks');
  bms.push({ ...bm, id: Date.now() });
  store.set('bookmarks', bms);
});
ipcMain.handle('remove-bookmark', (_, id) => {
  store.set('bookmarks', store.get('bookmarks').filter(b => b.id !== id));
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

// Theme
ipcMain.handle('get-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
ipcMain.on('set-theme', (_, t) => { nativeTheme.themeSource = t; });

// Open external
ipcMain.on('open-external', (_, url) => shell.openExternal(url));

// Download dialog
ipcMain.on('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  event.reply('save-dialog-result', result);
});

// Downloads
session.defaultSession.on('will-download', (event, item) => {
  mainWindow?.webContents.send('download-started', {
    filename: item.getFilename(),
    totalBytes: item.getTotalBytes(),
    url: item.getURL(),
  });
  item.on('updated', (_, state) => {
    mainWindow?.webContents.send('download-progress', {
      filename: item.getFilename(),
      state,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
    });
  });
  item.once('done', (_, state) => {
    mainWindow?.webContents.send('download-done', {
      filename: item.getFilename(),
      state,
      savePath: item.getSavePath(),
    });
  });
});
