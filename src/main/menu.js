'use strict';

const { app, Menu, shell } = require('electron');
const { SCHEME } = require('./constants');

const IS_MAC = process.platform === 'darwin';

/**
 * Menu de aplicação. Em macOS aparece na barra do sistema; em Windows/Linux
 * a janela é frameless e o menu fica oculto, mas seus aceleradores continuam
 * ativos — é assim que os atalhos globais do navegador são registrados.
 */
function buildMenu(browser) {
  const win = () => browser.current();
  const tab = () => browser.current()?.activeTab;

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];

  if (IS_MAC) {
    template.push({
      label: app.name,
      submenu: [
        { label: 'Sobre o Calopsia', click: () => win()?.createTab({ url: `${SCHEME}://about`, active: true }) },
        { type: 'separator' },
        { label: 'Configurações…', accelerator: 'Cmd+,', click: () => win()?.createTab({ url: `${SCHEME}://settings`, active: true }) },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar Calopsia' },
        { role: 'hideOthers', label: 'Ocultar outros' },
        { role: 'unhide', label: 'Mostrar todos' },
        { type: 'separator' },
        { role: 'quit', label: 'Encerrar Calopsia' }
      ]
    });
  }

  template.push({
    label: 'Arquivo',
    submenu: [
      { label: 'Nova aba', accelerator: 'CmdOrCtrl+T', click: () => (win() || browser.createWindow()).createTab({ active: true }) },
      { label: 'Nova janela', accelerator: 'CmdOrCtrl+N', click: () => browser.createWindow() },
      { label: 'Nova janela anônima', accelerator: 'CmdOrCtrl+Shift+N', click: () => browser.createWindow({ incognito: true }) },
      { type: 'separator' },
      { label: 'Reabrir aba fechada', accelerator: 'CmdOrCtrl+Shift+T', click: () => browser.reopenClosedTab() },
      { type: 'separator' },
      { label: 'Abrir arquivo…', accelerator: 'CmdOrCtrl+O', click: () => openFile(browser) },
      { label: 'Salvar página como…', accelerator: 'CmdOrCtrl+S', click: () => { const t = tab(); if (t) t.wc.downloadURL(t.url); } },
      { label: 'Imprimir…', accelerator: 'CmdOrCtrl+P', click: () => tab()?.wc.print() },
      { type: 'separator' },
      { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: () => { const w = win(); if (w?.activeTab) w.closeTab(w.activeTab.id); } },
      IS_MAC ? { role: 'close', label: 'Fechar janela', accelerator: 'Cmd+Shift+W' }
             : { label: 'Fechar janela', accelerator: 'Ctrl+Shift+W', click: () => win()?.browserWindow.close() },
      ...(IS_MAC ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Sair' }])
    ]
  });

  template.push({
    label: 'Editar',
    submenu: [
      { role: 'undo', label: 'Desfazer' },
      { role: 'redo', label: 'Refazer' },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Colar' },
      { role: 'pasteAndMatchStyle', label: 'Colar sem formatação' },
      { role: 'delete', label: 'Excluir' },
      { role: 'selectAll', label: 'Selecionar tudo' },
      { type: 'separator' },
      { label: 'Localizar na página…', accelerator: 'CmdOrCtrl+F', click: () => win()?.send('shortcut:find') },
      { label: 'Focar barra de endereço', accelerator: 'CmdOrCtrl+L', click: () => win()?.send('shortcut:focus-omnibox') }
    ]
  });

  template.push({
    label: 'Ver',
    submenu: [
      { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => tab()?.reload(false) },
      { label: 'Recarregar ignorando cache', accelerator: 'CmdOrCtrl+Shift+R', click: () => tab()?.reload(true) },
      { label: 'Parar', accelerator: 'Esc', click: () => tab()?.stop() },
      { type: 'separator' },
      { label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+Plus', click: () => tab()?.zoomIn() },
      { label: 'Aumentar zoom ', accelerator: 'CmdOrCtrl+=', visible: false, click: () => tab()?.zoomIn() },
      { label: 'Diminuir zoom', accelerator: 'CmdOrCtrl+-', click: () => tab()?.zoomOut() },
      { label: 'Zoom padrão', accelerator: 'CmdOrCtrl+0', click: () => tab()?.zoomReset() },
      { type: 'separator' },
      { label: 'Barra de favoritos', accelerator: 'CmdOrCtrl+Shift+B', click: () => win()?.send('shortcut:toggle-bookmarks-bar') },
      { label: 'Tela cheia', accelerator: IS_MAC ? 'Ctrl+Cmd+F' : 'F11', click: () => { const w = win(); if (w) w.browserWindow.setFullScreen(!w.browserWindow.isFullScreen()); } },
      { type: 'separator' },
      { label: 'Ferramentas do desenvolvedor', accelerator: IS_MAC ? 'Alt+Cmd+I' : 'Ctrl+Shift+I', click: () => tab()?.toggleDevTools() },
      { label: 'Ferramentas do desenvolvedor ', accelerator: 'F12', visible: false, click: () => tab()?.toggleDevTools() },
      { label: 'Inspecionar interface', accelerator: IS_MAC ? 'Alt+Cmd+U' : 'Ctrl+Shift+U', click: () => win()?.ui.openDevTools({ mode: 'detach' }) },
      { label: 'Ver código-fonte', accelerator: IS_MAC ? 'Alt+Cmd+U' : 'Ctrl+U', visible: false, click: () => { const t = tab(); if (t) win()?.createTab({ url: `view-source:${t.url}`, active: true }); } }
    ]
  });

  template.push({
    label: 'Histórico',
    submenu: [
      { label: 'Voltar', accelerator: IS_MAC ? 'Cmd+Left' : 'Alt+Left', click: () => tab()?.goBack() },
      { label: 'Avançar', accelerator: IS_MAC ? 'Cmd+Right' : 'Alt+Right', click: () => tab()?.goForward() },
      { label: 'Página inicial', accelerator: IS_MAC ? 'Cmd+Shift+H' : 'Alt+Home', click: () => tab()?.navigate(browser.startUrl()) },
      { type: 'separator' },
      { label: 'Mostrar histórico completo', accelerator: IS_MAC ? 'Cmd+Y' : 'Ctrl+H', click: () => win()?.createTab({ url: `${SCHEME}://history`, active: true }) }
    ]
  });

  template.push({
    label: 'Favoritos',
    submenu: [
      { label: 'Adicionar esta página', accelerator: 'CmdOrCtrl+D', click: () => win()?.send('shortcut:bookmark') },
      { label: 'Gerenciar favoritos', accelerator: IS_MAC ? 'Alt+Cmd+B' : 'Ctrl+Shift+O', click: () => win()?.createTab({ url: `${SCHEME}://bookmarks`, active: true }) }
    ]
  });

  const tabSwitchers = Array.from({ length: 8 }, (_, i) => ({
    label: `Aba ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    visible: false,
    click: () => win()?.selectTabByIndex(i)
  }));

  template.push({
    label: 'Janela',
    submenu: [
      { role: 'minimize', label: 'Minimizar' },
      { label: 'Zoom da janela', click: () => { const bw = win()?.browserWindow; if (bw) bw.isMaximized() ? bw.unmaximize() : bw.maximize(); } },
      { type: 'separator' },
      { label: 'Próxima aba', accelerator: 'Ctrl+Tab', click: () => win()?.cycleTab(1) },
      { label: 'Aba anterior', accelerator: 'Ctrl+Shift+Tab', click: () => win()?.cycleTab(-1) },
      { label: 'Próxima aba ', accelerator: IS_MAC ? 'Alt+Cmd+Right' : 'Ctrl+PageDown', visible: false, click: () => win()?.cycleTab(1) },
      { label: 'Aba anterior ', accelerator: IS_MAC ? 'Alt+Cmd+Left' : 'Ctrl+PageUp', visible: false, click: () => win()?.cycleTab(-1) },
      ...tabSwitchers,
      { label: 'Última aba', accelerator: 'CmdOrCtrl+9', visible: false, click: () => win()?.selectTabByIndex(9) },
      { type: 'separator' },
      { label: 'Downloads', accelerator: IS_MAC ? 'Alt+Cmd+L' : 'Ctrl+J', click: () => win()?.createTab({ url: `${SCHEME}://downloads`, active: true }) },
      { label: 'Configurações', accelerator: 'CmdOrCtrl+,', visible: !IS_MAC, click: () => win()?.createTab({ url: `${SCHEME}://settings`, active: true }) },
      ...(IS_MAC ? [{ type: 'separator' }, { role: 'front', label: 'Trazer todas para frente' }] : [])
    ]
  });

  template.push({
    role: 'help',
    label: 'Ajuda',
    submenu: [
      { label: 'Sobre o Calopsia', click: () => win()?.createTab({ url: `${SCHEME}://about`, active: true }) },
      { label: 'Repositório no GitHub', click: () => shell.openExternal('https://github.com/Pedro21062014/CALOPSIA') },
      { label: 'Relatar um problema', click: () => shell.openExternal('https://github.com/Pedro21062014/CALOPSIA/issues/new') }
    ]
  });

  return Menu.buildFromTemplate(template);
}

async function openFile(browser) {
  const { dialog } = require('electron');
  const win = browser.current();
  const res = await dialog.showOpenDialog(win?.browserWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Páginas web', extensions: ['html', 'htm', 'xhtml', 'svg'] },
      { name: 'Documentos', extensions: ['pdf', 'txt', 'md', 'json'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });
  if (res.canceled || !res.filePaths[0]) return;
  const url = `file://${res.filePaths[0].replace(/\\/g, '/')}`;
  (win || browser.createWindow()).createTab({ url, active: true });
}

function applyMenu(browser) {
  Menu.setApplicationMenu(buildMenu(browser));
}

module.exports = { applyMenu, buildMenu };
