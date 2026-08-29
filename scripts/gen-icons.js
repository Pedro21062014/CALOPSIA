#!/usr/bin/env node
'use strict';

/* ============================================================
   Regenera todos os ícones do CALOPSIA a partir de assets/logo.png

   Uso:  npm run icons

   Gera:
     assets/icons/<N>x<N>.png   conjunto hicolor (16..512) usado no Linux
     assets/icon-1024.png       mestre para macOS (.icns) e Windows (.ico)
     assets/icon.ico            ícone da janela em runtime no Windows
     src/logo-data.js           logo embutida em data URI (página inicial / Sobre)
     build/icon.png             cópia do mestre (convenção do electron-builder)

   Requer Python + Pillow (só para desenvolvimento — os ícones gerados
   já estão versionados no repositório, então a CI não precisa disso).
   ============================================================ */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo.png');

const PY = `
import sys, base64, io
from PIL import Image

logo = Image.open(sys.argv[1]).convert('RGBA')
out_dir = sys.argv[2]

def fit(img, box):
    # redimensiona PROPORCIONALMENTE para caber no box — aumentando
    # se preciso (o thumbnail() do Pillow nunca amplia, o que deixava
    # a logo pequena nos tamanhos grandes)
    w, h = img.size
    r = min(float(box) / w, float(box) / h)
    return img.resize((max(1, int(round(w * r))), max(1, int(round(h * r)))), Image.LANCZOS)

def canvas(size, scale=0.94):
    c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    f = fit(logo, int(size * scale))
    c.paste(f, ((size - f.width) // 2, (size - f.height) // 2), f)
    return c

import os
icons = os.path.join(out_dir, 'assets', 'icons')
os.makedirs(icons, exist_ok=True)
for s in (16, 32, 64, 128, 256, 512):
    canvas(s, 0.96 if s <= 32 else 0.94).save(os.path.join(icons, '%dx%d.png' % (s, s)), 'PNG', optimize=True)

canvas(1024).save(os.path.join(out_dir, 'assets', 'icon-1024.png'), 'PNG', optimize=True)
os.makedirs(os.path.join(out_dir, 'build'), exist_ok=True)
canvas(1024).save(os.path.join(out_dir, 'build', 'icon.png'), 'PNG', optimize=True)

sizes = [(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)]
imgs = []
for s in sizes:
    im = Image.new('RGBA', s, (0,0,0,0)); f = fit(logo, int(s[0]*0.94))
    im.paste(f, ((s[0]-f.width)//2, (s[1]-f.height)//2), f); imgs.append(im)
imgs[0].save(os.path.join(out_dir, 'assets', 'icon.ico'), 'ICO', sizes=sizes, append_images=imgs[1:])

# logo embutida (data URI) para a pagina inicial e a tela Sobre
w = 200
h = int(logo.height * w / logo.width)
buf = io.BytesIO()
logo.resize((w, h), Image.LANCZOS).save(buf, 'PNG', optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode('ascii')
with open(os.path.join(out_dir, 'src', 'logo-data.js'), 'w', encoding='utf-8') as f:
    f.write('/* GERADO AUTOMATICAMENTE por scripts/gen-icons.js - nao editar a mao.\\n')
    f.write('   Logo do CALOPSIA embutida em data URI, para a pagina inicial e a\\n')
    f.write('   tela Sobre nao dependerem de nenhum caminho de arquivo. */\\n')
    f.write("window.CALOPSIA_LOGO = 'data:image/png;base64," + b64 + "';\\n")
print('ok')
`;

if (!fs.existsSync(SRC)) {
  console.error('✗ assets/logo.png não encontrado.');
  process.exit(1);
}

// procura um interpretador Python com Pillow
let python = null;
for (const candidate of [process.env.PYTHON || 'python3', 'python']) {
  const probe = spawnSync(candidate, ['-c', 'import PIL'], { stdio: 'ignore' });
  if (probe.status === 0) { python = candidate; break; }
}

if (!python) {
  console.warn('⚠ Pillow não encontrado — mantendo os ícones já versionados.');
  console.warn('  Para regenerar: pip install Pillow && npm run icons');
  process.exit(0);
}

const tmp = path.join(os.tmpdir(), `calopsia-icons-${Date.now()}.py`);
fs.writeFileSync(tmp, PY);
try {
  execFileSync(python, [tmp, SRC, ROOT], { stdio: 'inherit' });
  console.log('✓ Ícones regenerados em assets/icons/, assets/icon-1024.png, assets/icon.ico e build/icon.png');
} catch (e) {
  console.error('✗ Falha ao gerar os ícones:', e.message);
  process.exit(1);
} finally {
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
}
