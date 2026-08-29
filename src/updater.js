'use strict';

/* ============================================================
   CALOPSIA — atualizador
   ------------------------------------------------------------
   Verifica a cada 30 minutos (e sob pedido, na página "Sobre")
   se existe uma versão mais nova nas Releases do GitHub.

   Fluxo:
     1. consulta a API do GitHub (releases/latest);
     2. compara com a versão instalada (app.getVersion());
     3. avisa a interface (menu ☰ e página Sobre) via "update:state";
     4. quando a pessoa aceita, baixa o instalador certo para o
        sistema dela na pasta de Downloads e o executa.

   Sem dependências novas — usa o módulo `net` do Electron.
   ============================================================ */

const { app, net, shell, ipcMain, dialog, webContents } = require('electron');
const fs = require('fs');
const path = require('path');

const REPO = 'Pedro21062014/CALOPSIA';
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const PAGINA_RELEASES = `https://github.com/${REPO}/releases/latest`;

const INTERVALO_MS = 30 * 60 * 1000;   // 30 minutos
const PRIMEIRA_VERIFICACAO_MS = 8 * 1000;

/* status: 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'error' */
let estado = {
  status: 'idle',
  atual: app.getVersion ? app.getVersion() : null,
  versao: null,          // versão disponível, quando houver
  progresso: 0,          // 0..100 durante o download
  arquivo: null,         // instalador já baixado (status 'ready')
  notas: '',             // resumo da release
  url: PAGINA_RELEASES,
  checadoEm: 0,
  erro: null
};

let intervalo = null;
let baixando = false;
let verificando = false;

/* ---------- utilidades ---------- */

function cmpVersao(a, b) {
  const limpo = (v) => String(v || '').toLowerCase().replace(/^v/, '').split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pa = limpo(a);
  const pb = limpo(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function definir(novo) {
  estado = { ...estado, ...novo };
  avisarInterface();
  return estado;
}

function avisarInterface() {
  for (const wc of webContents.getAllWebContents()) {
    try { wc.send('update:state', estado); } catch { /* conteúdo fechando */ }
  }
}

/* Escolhe o instalador certo para o sistema atual entre os
   arquivos anexados à release. */
function escolherAsset(assets) {
  const lista = (assets || []).map((a) => ({ ...a, n: String(a.name || '').toLowerCase() }));
  if (!lista.length) return null;

  if (process.platform === 'win32') {
    return lista.find((a) => a.n.endsWith('.exe') && a.n.includes('instalador') && a.n.includes(process.arch))
      || lista.find((a) => a.n.endsWith('.exe') && a.n.includes('instalador'))
      || lista.find((a) => a.n.endsWith('.exe') && !a.n.includes('portatil'))
      || lista.find((a) => a.n.endsWith('.exe'));
  }
  if (process.platform === 'linux') {
    return lista.find((a) => a.n.endsWith('.appimage'));
  }
  if (process.platform === 'darwin') {
    return lista.find((a) => a.n.endsWith('.dmg') && a.n.includes(process.arch))
      || lista.find((a) => a.n.endsWith('.dmg'));
  }
  return null;
}

/* ---------- verificação ---------- */

async function verificar(manual = false) {
  if (verificando || baixando) return estado;
  verificando = true;

  if (manual) definir({ status: 'checking', erro: null });

  try {
    const resp = await net.fetch(API_LATEST, {
      headers: {
        'User-Agent': 'CALOPSIA-Updater',
        'Accept': 'application/vnd.github+json'
      }
    });
    if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);
    const rel = await resp.json();

    const tag = String(rel.tag_name || '').replace(/^v/i, '');
    const atual = app.getVersion();
    if (!tag) throw new Error('release sem tag');

    const notas = String(rel.body || '')
      .replace(/\r/g, '')
      .replace(/[#*`_>]/g, '')
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .slice(0, 6).join(' · ')
      .slice(0, 300);

    estado.checadoEm = Date.now();
    estado.versao = tag;
    estado.notas = notas;
    estado.url = rel.html_url || PAGINA_RELEASES;
    estado.atual = atual;

    if (cmpVersao(tag, atual) > 0) {
      const asset = escolherAsset(rel.assets);
      estado.asset = asset ? { url: asset.browser_download_url, nome: asset.name, tamanho: asset.size || 0 } : null;
      definir({ status: 'available' });
    } else {
      estado.asset = null;
      definir({ status: 'latest' });
    }
  } catch (e) {
    definir({ status: 'error', erro: e && e.message ? e.message : 'falha ao verificar' });
  } finally {
    verificando = false;
  }
  return estado;
}

/* ---------- download e instalação ---------- */

/* Nome de arquivo que não sobrescreve nada já existente. */
function destinoUnico(pasta, nome) {
  let alvo = path.join(pasta, nome);
  let i = 1;
  while (fs.existsSync(alvo)) {
    const ext = path.extname(nome);
    alvo = path.join(pasta, `${path.basename(nome, ext)} (${i++})${ext}`);
  }
  return alvo;
}

function baixar() {
  if (baixando) return;
  if (!estado.asset || !estado.asset.url) {
    shell.openExternal(PAGINA_RELEASES);
    return;
  }
  baixando = true;
  definir({ status: 'downloading', progresso: 0, erro: null });

  const pasta = app.getPath('downloads');
  const alvo = destinoUnico(pasta, estado.asset.nome || `CALOPSIA-${estado.versao}.exe`);

  const req = net.request(estado.asset.url);
  req.setHeader('User-Agent', 'CALOPSIA-Updater');

  let recebido = 0;
  let total = estado.asset.tamanho || 0;
  let arquivo = null;
  let ultimoPct = -1;

  req.on('response', (resp) => {
    if (resp.statusCode >= 300 || resp.statusCode < 200) {
      req.abort();
      baixando = false;
      definir({ status: 'error', erro: `download falhou (${resp.statusCode})` });
      return;
    }
    const len = Number(resp.headers['content-length'] || 0);
    if (len > total) total = len;

    arquivo = fs.createWriteStream(alvo);
    arquivo.on('error', () => {
      req.abort();
      baixando = false;
      definir({ status: 'error', erro: 'não foi possível salvar o arquivo' });
    });

    resp.on('data', (chunk) => {
      recebido += chunk.length;
      if (arquivo) arquivo.write(chunk);
      const pct = total > 0 ? Math.min(99, Math.floor((recebido / total) * 100)) : 0;
      if (pct !== ultimoPct) {
        ultimoPct = pct;
        definir({ status: 'downloading', progresso: pct });
      }
    });

    resp.on('end', () => {
      if (!arquivo) return;
      arquivo.end(() => {
        baixando = false;
        definir({ status: 'ready', progresso: 100, arquivo: alvo });
      });
    });
  });

  req.on('error', () => {
    baixando = false;
    try { if (arquivo) arquivo.destroy(); } catch { /* já fechado */ }
    try { fs.unlinkSync(alvo); } catch { /* sem arquivo */ }
    definir({ status: 'error', erro: 'download interrompido' });
  });

  req.end();
}

async function instalar() {
  const arquivo = estado.arquivo;
  if (!arquivo || !fs.existsSync(arquivo)) {
    definir({ status: 'available' });
    return;
  }

  if (process.platform === 'linux') {
    /* AppImage não substitui a si mesmo enquanto roda: mostra onde está. */
    shell.showItemInFolder(arquivo);
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualização baixada',
      message: 'A nova versão foi baixada.',
      detail: `Arquivo: ${path.basename(arquivo)}\n\nFeche o CALOPSIA e execute o novo AppImage para concluir a atualização.`
    }).catch(() => {});
    return;
  }

  /* Windows (instalador .exe) e macOS (.dmg): abre e encerra o app. */
  const r = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Atualizar agora', 'Mais tarde'],
    defaultId: 0,
    cancelId: 1,
    title: 'Atualização baixada',
    message: `CALOPSIA v${estado.versao} pronto para instalar`,
    detail: 'O instalador será aberto e o navegador será fechado.'
  }).catch(() => ({ response: 1 }));

  if (r.response !== 0) return;
  const ok = await shell.openPath(arquivo).catch(() => '');
  if (ok) {
    dialog.showMessageBox({ type: 'error', title: 'Atualização', message: 'Não foi possível abrir o instalador.', detail: String(ok) }).catch(() => {});
    return;
  }
  setTimeout(() => app.quit(), 400);
}

/* Ação única da interface: baixa se ainda não baixou, instala se já baixou. */
function agir() {
  if (estado.status === 'available') return baixar();
  if (estado.status === 'ready') return instalar();
  if (estado.status === 'downloading') return;               // já em andamento
  if (estado.status === 'error' || estado.status === 'idle') return baixar();
}

/* ---------- ponte IPC ---------- */

ipcMain.handle('update:state:get', () => estado);
ipcMain.handle('update:check', () => verificar(true));
ipcMain.on('update:action', () => agir());

/* ---------- boot ---------- */

function initUpdater() {
  setTimeout(() => verificar(false), PRIMEIRA_VERIFICACAO_MS);
  intervalo = setInterval(() => verificar(false), INTERVALO_MS);
}

module.exports = { initUpdater, verificar, cmpVersao };
