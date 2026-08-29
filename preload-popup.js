'use strict';

/* Ponte segura da janelinha flutuante de senhas (desbloquear / salvar / preencher). */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupApi', {
  getTheme: () => ipcRenderer.invoke('theme:get'),
  onTheme: (cb) => ipcRenderer.on('theme:changed', (_e, info) => cb(info)),

  onDados: (cb) => ipcRenderer.on('popup:dados', (_e, dados) => cb(dados)),
  pronto: (height) => ipcRenderer.send('popup:pronto', { height }),
  acao: (id, dados) => ipcRenderer.send('popup:acao', { id, dados }),
  fechar: () => ipcRenderer.send('popup:fechar')
});
