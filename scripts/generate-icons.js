#!/usr/bin/env node
'use strict';

/**
 * Gera `build/icon.png` (1024×1024) sem nenhuma dependência externa.
 *
 * - Se existir `build/logo.png`, ele é usado como está (basta soltar o
 *   arquivo definitivo na pasta e rodar `npm run icons`).
 * - Caso contrário, desenha o ícone provisório do Calopsia por SDF
 *   (signed distance fields), o que garante bordas suaves sem canvas.
 *
 * O electron-builder deriva .icns (macOS) e .ico (Windows) a partir do PNG.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 1024;
const OUT_DIR = path.join(__dirname, '..', 'build');
const OUT = path.join(OUT_DIR, 'icon.png');
const SOURCE = path.join(OUT_DIR, 'logo.png');

/* ----------------------------------------------------------------- PNG */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "None"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------ desenho */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (d) => clamp(0.5 - d); // antialias de ~1px

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

/** Arco grosso (anel com abertura) — desenha o "C" do Calopsia. */
function sdArc(px, py, cx, cy, radius, thickness, startDeg, endDeg) {
  const dx = px - cx;
  const dy = py - cy;
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (ang < 0) ang += 360;
  const ring = Math.abs(Math.hypot(dx, dy) - radius) - thickness / 2;

  const inSpan = startDeg <= endDeg
    ? ang >= startDeg && ang <= endDeg
    : ang >= startDeg || ang <= endDeg;

  if (inSpan) return ring;

  // fora do arco: distância até a ponta mais próxima (mantém as pontas redondas)
  const tip = (deg) => [cx + radius * Math.cos((deg * Math.PI) / 180), cy + radius * Math.sin((deg * Math.PI) / 180)];
  const [sx, sy] = tip(startDeg);
  const [ex, ey] = tip(endDeg);
  return Math.min(Math.hypot(px - sx, py - sy), Math.hypot(px - ex, py - ey)) - thickness / 2;
}

function blend(dst, i, r, g, b, a) {
  const inv = 1 - a;
  dst[i]     = Math.round(r * a + dst[i] * inv);
  dst[i + 1] = Math.round(g * a + dst[i + 1] * inv);
  dst[i + 2] = Math.round(b * a + dst[i + 2] * inv);
  dst[i + 3] = Math.round(255 * a + dst[i + 3] * inv);
}

function drawIcon() {
  const S = SIZE;
  const px = Buffer.alloc(S * S * 4, 0);
  const c = S / 2;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const fx = x + 0.5;
      const fy = y + 0.5;

      // 1. Base: quadrado arredondado escuro (estilo "squircle" de app)
      const base = smooth(sdRoundRect(fx, fy, c, c, S * 0.47, S * 0.47, S * 0.225));
      if (base > 0) {
        const t = clamp((fx + fy) / (2 * S));
        blend(px, i, mix(43, 20, t), mix(43, 20, t), mix(52, 27, t), base);
      }

      // 2. Brilho superior sutil
      const gloss = smooth(sdRoundRect(fx, fy, c, c * 0.62, S * 0.44, S * 0.30, S * 0.20));
      if (gloss > 0) blend(px, i, 255, 255, 255, gloss * 0.035);

      // 3. Arco principal em gradiente (o "C")
      const arc = smooth(sdArc(fx, fy, c, c, S * 0.255, S * 0.115, 38, 322));
      if (arc > 0) {
        const t = clamp((fy - S * 0.2) / (S * 0.6));
        blend(px, i, mix(255, 255, t), mix(214, 122, t), mix(102, 69, t), arc);
      }

      // 4. Bochecha laranja (marca registrada da calopsita)
      const cheek = smooth(sdCircle(fx, fy, c + S * 0.185, c + S * 0.145, S * 0.062));
      if (cheek > 0) blend(px, i, 255, 122, 69, cheek);

      // 5. Olho
      const eye = smooth(sdCircle(fx, fy, c + S * 0.155, c - S * 0.115, S * 0.045));
      if (eye > 0) blend(px, i, 23, 23, 27, eye);
      const glint = smooth(sdCircle(fx, fy, c + S * 0.168, c - S * 0.128, S * 0.015));
      if (glint > 0) blend(px, i, 255, 255, 255, glint * 0.9);

      // 6. Crista
      for (const [ox, oy, r] of [[-0.045, -0.335, 0.040], [0.010, -0.375, 0.034], [0.062, -0.352, 0.028]]) {
        const crest = smooth(sdCircle(fx, fy, c + S * ox, c + S * oy, S * r));
        if (crest > 0) blend(px, i, 255, 209, 102, crest);
      }
    }
  }
  return px;
}

/* ------------------------------------------------------------------ main */

fs.mkdirSync(OUT_DIR, { recursive: true });

if (fs.existsSync(SOURCE)) {
  fs.copyFileSync(SOURCE, OUT);
  console.log(`✔ build/logo.png encontrado → copiado para build/icon.png`);
} else {
  const t0 = Date.now();
  fs.writeFileSync(OUT, encodePng(drawIcon(), SIZE, SIZE));
  console.log(`✔ ícone provisório gerado em build/icon.png (${SIZE}×${SIZE}) em ${Date.now() - t0}ms`);
  console.log('  Para usar o logo definitivo: salve-o como build/logo.png (1024×1024) e rode "npm run icons".');
}
