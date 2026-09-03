'use strict';

/**
 * Smoke test do Calopsia.
 *
 * Sobe o navegador de verdade (processo principal completo), espera a
 * interface carregar e verifica os invariantes básicos:
 *   - a janela foi criada
 *   - a UI renderizou a barra de abas e a omnibox
 *   - existe uma aba ativa apontando para calopsia://newtab
 *   - a página interna respondeu pelo protocolo customizado
 *
 * Uso:  npx electron scripts/smoke.js --ozone-platform=headless
 */

const { app, BrowserWindow } = require('electron');

require('../src/main/index.js');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  console.log('\n▶ smoke test do Calopsia\n');
  await wait(5000);

  const windows = BrowserWindow.getAllWindows();
  check('janela criada', windows.length >= 1, `${windows.length} janela(s)`);

  if (!windows.length) return finish();

  const win = windows[0];
  const views = win.contentView.children;
  check('camadas montadas (UI + aba)', views.length >= 2, `${views.length} views`);

  // A uiView é a que carrega o index.html do renderer
  const ui = views.map((v) => v.webContents).find((wc) => wc && wc.getURL().includes('renderer/index.html'));
  check('interface carregada', !!ui, ui ? ui.getURL().split('/').slice(-1)[0] : 'não encontrada');

  if (ui) {
    try {
      const dom = await ui.executeJavaScript(`(() => ({
        tabs:      !!document.querySelector('#tabs'),
        omnibox:   !!document.querySelector('#url-input'),
        toolbar:   !!document.querySelector('#toolbar'),
        tabCount:  document.querySelectorAll('.tab').length,
        theme:     document.body.dataset.theme || null,
        platform:  document.body.dataset.platform || null
      }))()`);
      check('barra de abas presente', dom.tabs);
      check('omnibox presente', dom.omnibox);
      check('barra de ferramentas presente', dom.toolbar);
      check('aba renderizada na UI', dom.tabCount >= 1, `${dom.tabCount} aba(s)`);
      check('tema aplicado', !!dom.theme, dom.theme || '');
      check('plataforma detectada', !!dom.platform, dom.platform || '');
    } catch (err) {
      check('avaliação da UI', false, err.message);
    }
  }

  // Imagens da marca precisam realmente decodificar (a CSP das páginas
  // internas já bloqueou calopsia://assets uma vez — este teste evita regressão)
  const brandWc = views
    .map((v) => v.webContents)
    .find((wc) => wc && wc.getURL().startsWith('calopsia://'));
  if (brandWc) {
    try {
      const img = await brandWc.executeJavaScript(`(() => {
        const el = document.querySelector('img[src*="assets/logo"]');
        if (!el) return { found: false };
        return { found: true, complete: el.complete, w: el.naturalWidth, h: el.naturalHeight,
                 shownW: el.clientWidth, shownH: el.clientHeight };
      })()`);
      check('logo presente no DOM', img.found);
      check('logo decodificado', img.found && img.w > 0 && img.h > 0,
        img.found ? `natural ${img.w}x${img.h}` : 'ausente');
      check('logo visível na tela', img.found && img.shownW > 8 && img.shownH > 8,
        img.found ? `render ${img.shownW}x${img.shownH}` : 'ausente');
    } catch (err) {
      check('verificação do logo', false, err.message);
    }
  }

  const contentWc = views
    .map((v) => v.webContents)
    .find((wc) => wc && wc.getURL().startsWith('calopsia://'));
  check('protocolo calopsia:// respondeu', !!contentWc, contentWc ? contentWc.getURL() : 'nenhuma view interna');

  if (contentWc) {
    try {
      const nt = await contentWc.executeJavaScript(
        `({ title: document.title, brand: !!document.querySelector('.nt-word'), api: typeof window.calopsiaInternal })`
      );
      check('página Nova aba renderizou', nt.brand, nt.title);
      check('ponte interna exposta', nt.api === 'object', nt.api);
    } catch (err) {
      check('avaliação da Nova aba', false, err.message);
    }
  }

  finish();
});

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram\n`);
  app.exit(failed.length ? 1 : 0);
}

setTimeout(() => {
  console.error('\n✘ timeout: o navegador não respondeu a tempo\n');
  app.exit(2);
}, 45000);
