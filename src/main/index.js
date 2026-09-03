'use strict';

/**
 * Calopsia — ponto de entrada do processo principal.
 *
 * Ordem de inicialização importa:
 *   1. nome do app  → define o diretório de userData
 *   2. stores       → precisamos das preferências antes de tocar em flags do Chromium
 *   3. switches     → só podem ser aplicados antes de app.whenReady()
 *   4. protocolo    → registerSchemesAsPrivileged também é pré-ready
 */

const { app, BrowserWindow, nativeTheme, session } = require('electron');
const path = require('node:path');

app.setName('Calopsia');
app.setAppUserModelId('app.calopsia.browser');

const { initStores, stores, flushAll } = require('./store');
initStores();

const { registerSchemes, registerProtocolHandler } = require('./protocol');
const { BrowserApp } = require('./app');
const { registerIpc } = require('./ipc');
const { applyMenu } = require('./menu');

// ------------------------------------------------------------ flags Chromium

if (stores.settings.get('hardwareAcceleration') === false) {
  app.disableHardwareAcceleration();
}

app.commandLine.appendSwitch('enable-features', [
  'CanvasOopRasterization',
  'OverlayScrollbar',
  'ParallelDownloading',
  'BackForwardCache'
].join(','));

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors,CrossOriginOpenerPolicy');
app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.commandLine.appendSwitch('enable-smooth-scrolling');

if (process.platform === 'linux') {
  // Melhora a nitidez de fontes e o suporte a Wayland em compositores modernos.
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-wayland-ime');
}

registerSchemes();

// --------------------------------------------------------- instância única

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  /** @type {BrowserApp} */
  let browser;

  /** Extrai uma URL passada por linha de comando (ex.: abrir link do SO). */
  const urlFromArgv = (argv) =>
    argv.slice(1).find((a) => /^(https?|calopsia|file):\/\//i.test(a)) || null;

  app.on('second-instance', (_e, argv) => {
    const url = urlFromArgv(argv);
    const win = browser?.current();
    if (win) {
      if (win.browserWindow.isMinimized()) win.browserWindow.restore();
      win.browserWindow.focus();
      if (url) win.createTab({ url, active: true });
    } else {
      browser?.createWindow({ url });
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    const win = browser?.current();
    if (win) win.createTab({ url, active: true });
    else app.whenReady().then(() => browser?.createWindow({ url }));
  });

  app.whenReady().then(() => {
    registerProtocolHandler();

    nativeTheme.themeSource = ['dark', 'light'].includes(stores.settings.get('theme'))
      ? stores.settings.get('theme')
      : 'system';

    browser = new BrowserApp();
    registerIpc(browser);
    applyMenu(browser);

    if (!app.isDefaultProtocolClient('http')) {
      // Não força — apenas deixa disponível em Configurações.
    }

    browser.bootstrapWindows(urlFromArgv(process.argv));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) browser.createWindow();
      else browser.current()?.browserWindow.show();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', async () => {
    browser?.saveSession();
    if (stores.settings.get('clearOnExit')) {
      try {
        const ses = session.fromPartition('persist:calopsia');
        await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb'] });
        await ses.clearCache();
        stores.history.set('items', []);
      } catch { /* melhor esforço no encerramento */ }
    }
    flushAll();
  });

  // Endurecimento: nenhum conteúdo remoto pode ganhar preload/node.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (event, webPreferences) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
    });
    contents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://') && contents.getType() === 'window') event.preventDefault();
    });
  });

  process.on('uncaughtException', (err) => {
    console.error('[calopsia] exceção não tratada:', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[calopsia] promise rejeitada:', reason);
  });
}
