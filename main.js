'use strict';

const { app, BrowserWindow, shell, session, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Registra o protocolo interno "calopsia://" (usado na página inicial).
// Precisa ser chamado ANTES de `app.whenReady()`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'calopsia',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    title: 'CALOPSIA',
    backgroundColor: '#0e1016',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Mantém o botão de maximizar sincronizado.
  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false));

  // Links abertos na própria interface (não no webview) vão para o navegador padrão.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // Serve a página inicial interna.
  protocol.handle('calopsia', (request) => {
    const file = path.join(__dirname, 'src', 'newtab.html');
    return net.fetch(pathToFileURL(file).toString());
  });

  // Permissões: permite apenas o essencial para os sites dentro do navegador.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['fullscreen', 'clipboard-sanitized-write', 'notifications', 'media'];
    callback(allowed.includes(permission));
  });

  createWindow();
});

// Segurança para abas (webviews): abre popups externos no navegador padrão.
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  }
});

// Controles de janela (titlebar customizada).
ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow && mainWindow.close());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
