'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* API mínima e segura exposta para a interface do navegador. */
contextBridge.exposeInMainWorld('calopsia', {
  platform: process.platform,
  getAppPath: () => ipcRenderer.invoke('app:path'),

  /* janela */
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  toggleDevTools: () => ipcRenderer.send('win:toggle-devtools'),
  onMaximizeChange: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
  onFullscreenChange: (cb) => ipcRenderer.on('win:fullscreen', (_e, v) => cb(v)),

  /* tema: 'system' segue o dispositivo; 'light'/'dark' fixam */
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (fonte) => ipcRenderer.invoke('theme:set', fonte),
  onTheme: (cb) => ipcRenderer.on('theme:changed', (_e, info) => cb(info)),

  /* zoom por Ctrl+scroll, aplicado no processo principal */
  onTabZoom: (cb) => ipcRenderer.on('tab:zoom', (_e, info) => cb(info)),

  /* menu do ☰ (janela própria) */
  openMenu: (payload) => ipcRenderer.send('menu:open', payload),
  closeMenu: () => ipcRenderer.send('menu:close'),
  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_e, id) => cb(id)),

  /* comandos vindos do menu nativo */
  onNewTab: (cb) => ipcRenderer.on('app:new-tab', (_e, url) => cb(url)),
  onCloseTab: (cb) => ipcRenderer.on('app:close-tab', () => cb()),
  onAppCommand: (cb) => ipcRenderer.on('app:cmd', (_e, id) => cb(id)),

  /* senhas (cofre cifrado com senha mestre + chaveiro do sistema) */
  senhasSituacao: () => ipcRenderer.invoke('senhas:situacao'),
  senhasListar: () => ipcRenderer.invoke('senhas:listar'),
  senhasRevelar: (id) => ipcRenderer.invoke('senhas:revelar', id),
  senhasApagar: (id) => ipcRenderer.invoke('senhas:apagar', id),
  senhasGerar: (n) => ipcRenderer.invoke('senhas:gerar', n),
  senhasAvaliar: (s) => ipcRenderer.invoke('senhas:forca', s),
  senhasDesbloquear: (senha) => ipcRenderer.invoke('senhas:desbloquear', senha),
  senhasCriar: (senha) => ipcRenderer.invoke('senhas:criar', senha),
  senhasAbrirCofre: () => ipcRenderer.send('senhas:abrir-cofre'),
  senhasFechar: () => ipcRenderer.send('senhas:fechar'),
  senhasAbrirPopup: (p) => ipcRenderer.send('senhas:abrir-popup', p),
  senhasNavegou: (p) => ipcRenderer.send('senhas:navegou', p),
  onCampoSenha: (cb) => ipcRenderer.on('senhas:campo-foco', (_e, info) => cb(info)),
  onSenhaGerada: (cb) => ipcRenderer.on('senhas:gerada', (_e, senha) => cb(senha)),
  copiar: (texto) => ipcRenderer.send('senhas:copiar', texto),

  /* downloads */
  onDownloadProgress: (cb) => ipcRenderer.on('dl:progress', (_e, info) => cb(info)),
  onDownloadDone: (cb) => ipcRenderer.on('dl:done', (_e, info) => cb(info)),
  showItemInFolder: (p) => ipcRenderer.send('shell:show-item', p),
  openPath: (p) => ipcRenderer.send('shell:open-path', p),

  /* misc */
  getInfo: () => ipcRenderer.invoke('app:info'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),

  /* atualizações (GitHub Releases) */
  updateState: () => ipcRenderer.invoke('update:state:get'),
  updateCheckNow: () => ipcRenderer.invoke('update:check'),
  updateAction: () => ipcRenderer.send('update:action'),
  onUpdateState: (cb) => ipcRenderer.on('update:state', (_e, estado) => cb(estado))
});
