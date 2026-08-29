'use strict';

/* Aplica o tema assim que a página carrega.
   Funciona nas três interfaces: a janela principal (window.calopsia),
   as páginas internas dentro das abas (window.calopsiaTab) e o menu (menuApi). */

(function () {
  const api = window.calopsiaTab || window.calopsia || window.menuApi;
  if (!api || typeof api.getTheme !== 'function') return;

  function aplicar(info) {
    if (!info) return;
    const tema = info.dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = tema;
    document.documentElement.style.colorScheme = tema;
  }

  // Antes desta resposta chegar, o CSS já pinta pelo prefers-color-scheme,
  // que o Electron controla — ou seja: sem piscar na cor errada.
  api.getTheme().then(aplicar).catch(() => { /* mantém o padrão do CSS */ });
  if (typeof api.onTheme === 'function') api.onTheme(aplicar);
})();
