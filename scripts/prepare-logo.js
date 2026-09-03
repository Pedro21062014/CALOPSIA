'use strict';

/**
 * Prepara os arquivos de marca a partir da arte original.
 *
 * Entrada:  src/assets/logo-original.png  (qualquer tamanho, fundo transparente)
 * Saídas:
 *   src/assets/logo.png   arte recortada no conteúdo, altura 512 — usada na interface
 *   build/logo.png        mascote centralizado em canvas quadrado 1024×1024 — vira o ícone
 *
 * A arte original costuma vir com muita margem transparente. Aqui detectamos a
 * bounding box real do conteúdo e reenquadramos, para que o ícone do instalador
 * ocupe a área útil em vez de aparecer minúsculo no meio de um quadrado vazio.
 *
 * Uso: npm run logo   (roda sob Electron por causa do nativeImage)
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'assets', 'logo-original.png');
const OUT_UI = path.join(ROOT, 'src', 'assets', 'logo.png');
const OUT_ICON = path.join(ROOT, 'build', 'logo.png');

const ICON_SIZE = 1024;
const ICON_MARGIN = 0.07;  // 7% de respiro em cada lado
const UI_HEIGHT = 512;

/** Bounding box dos pixels com alpha significativo. */
function contentBounds(bitmap, w, h, threshold = 24) {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (bitmap[(y * w + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: w, height: h };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Cola um bitmap BGRA dentro de outro. */
function paste(dst, dstW, src, srcW, srcH, x, y) {
  for (let row = 0; row < srcH; row++) {
    const from = row * srcW * 4;
    const to = ((y + row) * dstW + x) * 4;
    if (to < 0 || to + srcW * 4 > dst.length) continue;
    src.copy(dst, to, from, from + srcW * 4);
  }
}

app.whenReady().then(() => {
  if (!fs.existsSync(SOURCE)) {
    console.error(`✘ arte original não encontrada: ${path.relative(ROOT, SOURCE)}`);
    return app.exit(1);
  }

  const original = nativeImage.createFromPath(SOURCE);
  const { width: ow, height: oh } = original.getSize();
  const box = contentBounds(original.toBitmap(), ow, oh);
  console.log(`origem ${ow}×${oh} → conteúdo ${box.width}×${box.height} em (${box.x}, ${box.y})`);

  const cropped = original.crop(box);

  // 1. Versão da interface: mantém a proporção, altura fixa
  const ui = cropped.resize({ height: UI_HEIGHT, quality: 'best' });
  fs.writeFileSync(OUT_UI, ui.toPNG());
  const uiSize = ui.getSize();
  console.log(`✔ src/assets/logo.png       ${uiSize.width}×${uiSize.height}`);

  // 2. Versão do ícone: quadrado, conteúdo centralizado com margem
  const inner = Math.round(ICON_SIZE * (1 - ICON_MARGIN * 2));
  const scale = Math.min(inner / box.width, inner / box.height);
  const fitW = Math.max(1, Math.round(box.width * scale));
  const fitH = Math.max(1, Math.round(box.height * scale));
  const fitted = cropped.resize({ width: fitW, height: fitH, quality: 'best' });

  const canvas = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4, 0); // transparente
  paste(
    canvas, ICON_SIZE,
    fitted.toBitmap(), fitW, fitH,
    Math.round((ICON_SIZE - fitW) / 2),
    Math.round((ICON_SIZE - fitH) / 2)
  );

  const iconImage = nativeImage.createFromBitmap(canvas, { width: ICON_SIZE, height: ICON_SIZE });
  fs.mkdirSync(path.dirname(OUT_ICON), { recursive: true });
  fs.writeFileSync(OUT_ICON, iconImage.toPNG());
  console.log(`✔ build/logo.png            ${ICON_SIZE}×${ICON_SIZE} (conteúdo ${fitW}×${fitH})`);
  console.log('\nExecute "npm run icons" para derivar build/icon.png.');

  app.exit(0);
});
