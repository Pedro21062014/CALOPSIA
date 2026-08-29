'use strict';

/* ============================================================
   CALOPSIA — processo principal
   Janela, protocolo interno, menu, permissões e downloads.
   ============================================================ */

const { app, BrowserWindow, shell, session, protocol, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_ROOT = __dirname;
const SRC_DIR = path.join(APP_ROOT, 'src');
const ASSETS_DIR = path.join(APP_ROOT, 'assets');

/* ------------------------------------------------------------
   Protocolo interno "calopsia://"
   Registrado ANTES do app ficar pronto (obrigatório).
   ------------------------------------------------------------ */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'calopsia',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
      stream: true
    }
  }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * Resolve um caminho do protocolo interno para um arquivo real do app.
 * Só aceita arquivos dentro de APP_ROOT — protege contra path traversal.
 */
function resolveInternalFile(urlPath) {
  const clean = decodeURIComponent(urlPath || '').replace(/^\/+/, '').split('?')[0].split('#')[0];
  if (!clean) return path.join(SRC_DIR, 'newtab.html');

  const candidates = [
    path.join(SRC_DIR, clean),
    path.join(APP_ROOT, clean),
    path.join(ASSETS_DIR, clean)
  ];

  const roots = [SRC_DIR, APP_ROOT, ASSETS_DIR].map((r) => path.resolve(r));
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const inside = roots.some((r) => resolved === r || resolved.startsWith(r + path.sep));
    if (!inside) continue;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    } catch { /* ignora */ }
  }
  return null;
}

let mainWindow = null;

/* ------------------------------------------------------------
   Instância única
   ------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    title: 'CALOPSIA',
    backgroundColor: '#0b0d13',
    show: false,
    autoHideMenuBar: true,
    icon: path.join(APP_ROOT, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,           // obrigatório para <webview>
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,             // o shell confia no preload; webviews continuam isoladas
      spellcheck: true,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(SRC_DIR, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('win:fullscreen', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('win:fullscreen', false));

  // Links abertos na UI do navegador (fora dos webviews) vão para o SO.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ------------------------------------------------------------
   Menu da aplicação
   Removido o atalho padrão de "fechar janela" (Cmd/Ctrl+W) para
   que ele feche a ABA, como em qualquer navegador.
   ------------------------------------------------------------ */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: 'CALOPSIA',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Nova aba',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow && mainWindow.webContents.send('app:new-tab')
        },
        {
          label: 'Nova janela',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow()
        },
        { type: 'separator' },
        {
          label: 'Fechar aba',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow && mainWindow.webContents.send('app:close-tab')
        },
        ...(isMac ? [] : [{ role: 'quit', accelerator: 'CmdOrCtrl+Q' }])
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: 'Tela cheia',
          accelerator: 'F11',
          click: () => {
            if (!mainWindow) return;
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------
   Downloads
   ------------------------------------------------------------ */
function setupDownloads() {
  session.defaultSession.on('will-download', (_event, item, webContents) => {
    const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
    const fileName = item.getFilename();
    const target = path.join(app.getPath('downloads'), fileName);

    item.setSavePath(target);
    item.on('updated', (_e, state) => {
      if (state === 'interrupted') item.resume();
      if (win) {
        win.webContents.send('dl:progress', {
          name: fileName,
          received: item.getReceivedBytes(),
          total: item.getTotalBytes(),
          state: state,
          path: item.getSavePath()
        });
      }
    });
    item.once('done', (_e, state) => {
      if (win) {
        win.webContents.send('dl:done', { name: fileName, state, path: item.getSavePath() });
      }
    });
  });
}

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
app.whenReady().then(() => {
  // Serve os arquivos internos (newtab, logo, css) com o MIME correto.
  protocol.handle('calopsia', async (request) => {
    const file = resolveInternalFile(new URL(request.url).pathname);
    if (!file) {
      return new Response('404 — recurso interno não encontrado', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
    const data = await fs.promises.readFile(file);
    return new Response(data, {
      status: 200,
      headers: { 'content-type': mimeFor(file), 'cache-control': 'no-cache' }
    });
  });

  // Permissões: libera só o essencial para os sites dentro das abas.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (webContents.getType() === 'webview' && permission === 'fullscreen') return callback(true);
    const allowed = ['fullscreen', 'clipboard-sanitized-write', 'notifications', 'media'];
    callback(allowed.includes(permission));
  });

  app.setAboutPanelOptions({
    applicationName: 'CALOPSIA',
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: '© CALOPSIA — licença MIT',
    iconPath: path.join(APP_ROOT, 'build', 'icon.png'),
    website: 'https://github.com/Pedro21062014/CALOPSIA'
  });

  setupDownloads();
  buildMenu();
  createWindow();
});

/* ------------------------------------------------------------
   Webviews (abas): popups e downloads externos
   ------------------------------------------------------------ */
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.setWindowOpenHandler(({ url }) => {
    // Um popup pedido por um site abre como nova aba no próprio navegador.
    if (/^https?:\/\//i.test(url) && mainWindow) {
      mainWindow.webContents.send('app:new-tab', url);
    } else if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

/* ------------------------------------------------------------
   IPC — controles de janela
   ------------------------------------------------------------ */
ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow && mainWindow.close());
ipcMain.on('win:fullscreen', () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.on('win:toggle-devtools', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win) win.webContents.toggleDevTools();
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch
}));

ipcMain.handle('dialog:open-file', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir arquivo no CALOPSIA',
    properties: ['openFile']
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.on('shell:show-item', (_e, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.on('shell:open-path', (_e, p) => { if (p) shell.openPath(p); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
