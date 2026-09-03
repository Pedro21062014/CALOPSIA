'use strict';

/**
 * Captura telas do Calopsia para documentação.
 *
 * Uso: xvfb-run -a npx electron scripts/screenshot.js --no-sandbox
 *
 * Como a janela usa `contentView` com WebContentsViews (e não um webContents
 * próprio), `win.capturePage()` devolve uma imagem vazia. Aqui capturamos cada
 * camada separadamente e compomos os bitmaps BGRA na ordem correta.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

require('../src/main/index.js');

const OUT = path.join(__dirname, '..', 'docs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cola o bitmap `src` (BGRA) em `dst` na posição (x, y). */
function paste(dst, dstW, src, srcW, srcH, x, y) {
  for (let row = 0; row < srcH; row++) {
    const from = row * srcW * 4;
    const to = ((y + row) * dstW + x) * 4;
    if (to < 0 || to + srcW * 4 > dst.length) continue;
    src.copy(dst, to, from, from + srcW * 4);
  }
}

async function compose(win, chromeHeight, name) {
  const { width, height } = win.getContentBounds();
  const views = win.contentView.children;

  const canvas = Buffer.alloc(width * height * 4, 0);
  // opaco por padrão (evita bordas transparentes onde nada foi desenhado)
  for (let i = 3; i < canvas.length; i += 4) canvas[i] = 255;

  const ui = views.map((v) => v.webContents).find((wc) => wc.getURL().includes('renderer/index.html'));
  const content = views.map((v) => v.webContents).find((wc) => wc !== ui);

  if (content) {
    const img = await content.capturePage();
    const size = img.getSize();
    if (size.width) paste(canvas, width, img.toBitmap(), size.width, size.height, 0, chromeHeight);
  }
  if (ui) {
    const img = await ui.capturePage();
    const size = img.getSize();
    if (size.width) paste(canvas, width, img.toBitmap(), size.width, size.height, 0, 0);
  }

  const out = nativeImage.createFromBitmap(canvas, { width, height });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.png`), out.toPNG());
  console.log(`  → docs/${name}.png (${width}×${height})`);
}

app.whenReady().then(async () => {
  const { stores } = require('../src/main/store');
  await wait(3500);

  const win = BrowserWindow.getAllWindows()[0];
  win.setContentSize(1360, 850);
  await wait(500);

  stores.settings.set('theme', 'dark');
  stores.settings.set('showBookmarksBar', true);
  stores.bookmarks.set('items', [
    { id: 'b1', url: 'https://github.com', title: 'GitHub', createdAt: Date.now() - 864e5 },
    { id: 'b2', url: 'https://developer.mozilla.org', title: 'MDN Web Docs', createdAt: Date.now() - 172e6 },
    { id: 'b3', url: 'https://news.ycombinator.com', title: 'Hacker News', createdAt: Date.now() - 26e7 },
    { id: 'b4', url: 'https://pt.wikipedia.org', title: 'Wikipédia', createdAt: Date.now() - 30e7 },
    { id: 'b5', url: 'https://excalidraw.com', title: 'Excalidraw', createdAt: Date.now() - 40e7 }
  ]);
  stores.history.set('items', [
    { url: 'https://github.com/Pedro21062014', title: 'Pedro21062014 · GitHub', visitedAt: Date.now() - 6e5, visits: 12 },
    { url: 'https://developer.mozilla.org/pt-BR/docs/Web/API', title: 'Web APIs — MDN Web Docs', visitedAt: Date.now() - 36e5, visits: 8 },
    { url: 'https://news.ycombinator.com', title: 'Hacker News', visitedAt: Date.now() - 72e5, visits: 5 },
    { url: 'https://www.electronjs.org/docs/latest/api/web-contents-view', title: 'WebContentsView | Electron', visitedAt: Date.now() - 9e7, visits: 3 },
    { url: 'https://pt.wikipedia.org/wiki/Calopsita', title: 'Calopsita — Wikipédia, a enciclopédia livre', visitedAt: Date.now() - 9.2e7, visits: 3 },
    { url: 'https://caniuse.com', title: 'Can I use… Support tables for HTML5, CSS3', visitedAt: Date.now() - 1.8e8, visits: 2 }
  ]);

  const views = win.contentView.children;
  const ui = views.map((v) => v.webContents).find((wc) => wc.getURL().includes('renderer/index.html'));
  const tab = views.map((v) => v.webContents).find((wc) => wc !== ui);

  ui.send('settings:changed', stores.settings.get());
  ui.send('bookmarks:changed', stores.bookmarks.get('items'));
  await wait(1000);

  const CHROME = 40 + 48 + 34; // tab bar + toolbar + bookmarks bar

  console.log('\n📸 capturando telas\n');
  await tab.reload();
  await wait(1600);
  await compose(win, CHROME, 'screenshot-newtab');

  await tab.loadURL('calopsia://settings');
  await wait(1600);
  await compose(win, CHROME, 'screenshot-settings');

  await tab.loadURL('calopsia://history');
  await wait(1400);
  await compose(win, CHROME, 'screenshot-history');

  await tab.loadURL('calopsia://about');
  await wait(1400);
  await compose(win, CHROME, 'screenshot-about');

  console.log('\n✔ concluído\n');
  app.exit(0);
});

setTimeout(() => { console.error('timeout'); app.exit(2); }, 90000);
