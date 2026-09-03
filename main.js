const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "CALOPSIA Browser",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
