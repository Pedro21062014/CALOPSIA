'use strict';

/* Preload das abas (<webview>). Roda em TODA página visitada, por isso:
   - não expõe nada em sites da internet;
   - só entrega a ponte de tema às páginas internas (calopsia://). */

const { contextBridge, ipcRenderer } = require('electron');

/* Ctrl/⌘ + roda do mouse -> zoom só desta aba.
   O listener é de captura e não-passivo para vencer o handler de pinça
   do Chromium e impedir o zoom nativo em dobro. */
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.send('tab:zoom-wheel', { delta: e.deltaY });
}, { passive: false, capture: true });

/* Ponte de tema — apenas para as páginas do próprio navegador. */
if (location.protocol === 'calopsia:') {
  try {
    contextBridge.exposeInMainWorld('calopsiaTab', {
      getTheme: () => ipcRenderer.invoke('theme:get'),
      onTheme: (cb) => ipcRenderer.on('theme:changed', (_e, info) => cb(info))
    });
  } catch { /* página não isolada: segue sem ponte */ }
}
