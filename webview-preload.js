'use strict';

/* ============================================================
   Preload das abas (roda DENTRO da página, em mundo isolado).

   Captura Ctrl+scroll / pinça do trackpad e avisa o processo
   principal, que aplica o zoom apenas naquela aba.
   ============================================================ */

const { ipcRenderer } = require('electron');

window.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;   // scroll normal segue para a página
    e.preventDefault();
    ipcRenderer.send('tab:zoom-wheel', { delta: e.deltaY });
  },
  { passive: false, capture: true }
);
