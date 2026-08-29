'use strict';

/* ============================================================
   CALOPSIA — motor de abas com WebContentsView (v0.4.0)
   ------------------------------------------------------------
   Substitui o antigo <webview>, desaconselhado pelo Electron
   (instabilidade de renderização/navegação/roteamento de eventos).
   Cada aba agora é uma WebContentsView NATIVA presa à janela —
   a mesma arquitetura de um navegador de verdade: os eventos de
   entrada vão direto ao processo da página, sem passar pelo
   renderer da interface.

   A interface (renderer) continua dona da "faixa de conteúdo":
   ela informa o retângulo útil (#views) e o processo principal
   posiciona as views nele. Tudo chega à interface via 'view:event'.
   ============================================================ */

const { ipcMain, WebContentsView } = require('electron');

let obterJanela = () => null;          // getter da BrowserWindow
let opcoes = {};                       // { sessao, preload, fundoEscuro }
const abas = new Map();                // tabId -> { view, url, visivel }
let ativa = null;                      // tabId visível
let area = { x: 0, y: 0, width: 0, height: 0 };

/* DevTools em painel à direita (view própria do processo principal) */
let devtools = { tabId: null, host: null };

const LARGURA_DEVTOOLS = 0.38;         // fração da área de conteúdo

function janela() {
  const w = obterJanela();
  return w && !w.isDestroyed() ? w : null;
}

function evento(payload) {
  const w = janela();
  if (w) w.webContents.send('view:event', payload);
}

/* ---------- geometria ---------- */

function boundsDaAba(aba) {
  const ehAtiva = aba && aba.tabId === ativa && abas.get(aba.tabId);
  if (!ehAtiva) return { x: 0, y: 0, width: 0, height: 0 };

  const item = abas.get(aba.tabId);
  if (!item.visivel) return { x: 0, y: 0, width: 0, height: 0 };

  const dtAberto = devtools.host && devtools.tabId === aba.tabId;
  if (!dtAberto) return { ...area };

  const wPagina = Math.max(80, Math.round(area.width * (1 - LARGURA_DEVTOOLS)));
  return { x: area.x, y: area.y, width: wPagina, height: area.height };
}

function aplicarBounds() {
  const w = janela();
  if (!w) return;
  for (const [tabId, item] of abas) {
    const b = boundsDaAba({ tabId });
    try { item.view.setBounds(b); } catch { /* ignora */ }
  }
  if (devtools.host) {
    const wPagina = Math.max(80, Math.round(area.width * (1 - LARGURA_DEVTOOLS)));
    try {
      devtools.host.setBounds({
        x: area.x + wPagina,
        y: area.y,
        width: Math.max(0, area.width - wPagina),
        height: area.height
      });
    } catch { /* ignora */ }
  }
}

/* ---------- criação / destruição ---------- */

function criarAba(tabId, url) {
  const w = janela();
  if (!w) return null;
  if (abas.has(tabId)) destruirAba(tabId);

  const view = new WebContentsView({
    webPreferences: {
      preload: opcoes.preload,
      session: opcoes.sessao,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });
  view.setBackgroundColor(opcoes.fundoEscuro && opcoes.fundoEscuro() ? '#0e1013' : '#ffffff');
  w.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  const item = { view, url: url || 'about:blank', visivel: true };
  abas.set(tabId, item);
  ligarEventos(tabId, view);
  try { view.webContents.loadURL(item.url); } catch { /* ignora */ }
  return { contentsId: view.webContents.id };
}

function destruirAba(tabId) {
  const item = abas.get(tabId);
  if (!item) return;
  if (devtools.tabId === tabId) fecharDevtools();
  abas.delete(tabId);
  const w = janela();
  try {
    if (w) w.contentView.removeChildView(item.view);
    item.view.webContents.close();
  } catch { /* ignora */ }
  if (ativa === tabId) ativa = null;
}

function itemDeContents(contentsId) {
  for (const [tabId, item] of abas) {
    if (item.view.webContents.id === contentsId) return { tabId, item };
  }
  return null;
}

/* O frontend do DevTools também é uma view — os handlers globais
   (menu de contexto etc.) devem ignora-la. */
function ehHostDevtools(contentsId) {
  return !!(devtools.host && devtools.host.webContents.id === contentsId);
}

/* posição absoluta (na janela) de um ponto dentro da página —
   usado para posicionar o popup de senhas logo abaixo do campo. */
function pontoAbsoluto(contentsId, x, y) {
  const achado = itemDeContents(contentsId);
  if (!achado) return null;
  let b = { x: 0, y: 0 };
  try { b = achado.item.view.getBounds(); } catch { /* ignora */ }
  let z = 1;
  try { z = achado.item.view.webContents.getZoomFactor() || 1; } catch { /* ignora */ }
  return { x: b.x + Math.round(x * z), y: b.y + Math.round(y * z) };
}

/* ---------- eventos da página → interface ---------- */

function estadoNav(wc) {
  try {
    if (wc.navigationHistory) return {
      podeVoltar: !!wc.navigationHistory.canGoBack(),
      podeAvancar: !!wc.navigationHistory.canGoForward()
    };
  } catch { /* ignora */ }
  return { podeVoltar: !!wc.canGoBack(), podeAvancar: !!wc.canGoForward() };
}

function ligarEventos(tabId, view) {
  const wc = view.webContents;

  wc.on('page-title-updated', (_e, titulo) => evento({ tabId, tipo: 'titulo', titulo }));
  wc.on('page-favicon-updated', (_e, favicons) => evento({
    tabId, tipo: 'favicon', favicon: favicons && favicons.length ? favicons[0] : ''
  }));

  const navegou = (_e, url) => {
    const item = abas.get(tabId);
    if (item) item.url = url;
    let titulo = '';
    try { titulo = wc.getTitle(); } catch { /* ignora */ }
    evento({ tabId, tipo: 'navegou', url, titulo, ...estadoNav(wc) });
  };
  wc.on('did-navigate', navegou);
  wc.on('did-navigate-in-page', navegou);

  wc.on('did-start-loading', () => evento({ tabId, tipo: 'carregando', valor: true, ...estadoNav(wc) }));
  wc.on('did-stop-loading', () => evento({ tabId, tipo: 'carregando', valor: false, ...estadoNav(wc) }));
  wc.on('dom-ready', () => {
    let titulo = '';
    try { titulo = wc.getTitle(); } catch { /* ignora */ }
    evento({ tabId, tipo: 'pronto', titulo });
  });

  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    evento({ tabId, tipo: 'falha', codigo: errorCode, descricao: errorDescription, url: validatedURL });
  });

  wc.on('update-target-url', (_e, url) => {
    if (tabId === ativa) evento({ tabId, tipo: 'url-alvo', url });
  });

  wc.on('found-in-page', (_e, resultado) => evento({ tabId, tipo: 'achou', resultado }));
  wc.on('render-process-gone', () => evento({ tabId, tipo: 'travou' }));
  wc.on('devtools-closed', () => {
    if (devtools.tabId === tabId) {
      limparDevtools();
      evento({ tabId, tipo: 'devtools-fechado' });
    }
  });
}

/* ---------- DevTools (painel nativo à direita) ---------- */

function limparDevtools() {
  const w = janela();
  if (devtools.host) {
    try {
      if (w) w.contentView.removeChildView(devtools.host);
      devtools.host.webContents.close();
    } catch { /* ignora */ }
  }
  devtools = { tabId: null, host: null };
}

function fecharDevtools() {
  const item = devtools.tabId != null ? abas.get(devtools.tabId) : null;
  limparDevtools();
  if (item) { try { item.view.webContents.closeDevTools(); } catch { /* ignora */ } }
  aplicarBounds();
}

function abrirDevtools(tabId, inspecionar) {
  const w = janela();
  const item = abas.get(tabId);
  if (!w || !item) return false;

  if (devtools.tabId === tabId) { fecharDevtools(); return false; }
  if (devtools.host) fecharDevtools();

  const host = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  w.contentView.addChildView(host);
  devtools = { tabId, host };

  try {
    item.view.webContents.setDevToolsWebContents(host.webContents);
    item.view.webContents.openDevTools();
  } catch { limparDevtools(); return false; }

  if (inspecionar && Number.isFinite(inspecionar.x)) {
    setTimeout(() => {
      try { item.view.webContents.inspectElement(Math.round(inspecionar.x), Math.round(inspecionar.y)); }
      catch { /* ignora */ }
    }, 350);
  }
  aplicarBounds();
  return true;
}

function alternarDevtools(tabId) {
  if (devtools.tabId === tabId) { fecharDevtools(); return false; }
  return abrirDevtools(tabId, null);
}

/* "Inspecionar" do botão direito: abre o painel já no elemento. */
function inspecionarContents(contentsId, x, y) {
  const achado = itemDeContents(contentsId);
  if (!achado) return;
  if (devtools.tabId !== achado.tabId) abrirDevtools(achado.tabId, { x, y });
  else {
    try { achado.item.view.webContents.inspectElement(Math.round(x), Math.round(y)); }
    catch { /* ignora */ }
  }
}

/* ---------- boot / IPC ---------- */

function init(getWin, config) {
  obterJanela = getWin;
  opcoes = config || {};

  ipcMain.handle('view:criar', (_e, { tabId, url }) => criarAba(tabId, url) || {});
  ipcMain.on('view:destruir', (_e, { tabId }) => destruirAba(tabId));

  ipcMain.on('view:mostrar', (_e, { tabId, visivel, foco }) => {
    const item = abas.get(tabId);
    if (!item) return;
    ativa = tabId;
    item.visivel = visivel !== false;
    aplicarBounds();
    if (foco) { try { item.view.webContents.focus(); } catch { /* ignora */ } }
  });

  ipcMain.on('view:carregar', (_e, { tabId, url }) => {
    const item = abas.get(tabId);
    if (!item) return;
    item.url = url;
    try { item.view.webContents.loadURL(url); } catch { /* ignora */ }
  });

  ipcMain.on('view:comando', (_e, { tabId, cmd }) => {
    const item = abas.get(tabId);
    if (!item) return;
    const wc = item.view.webContents;
    try {
      if (cmd === 'voltar') wc.goBack();
      else if (cmd === 'avancar') wc.goForward();
      else if (cmd === 'recarregar') wc.reload();
      else if (cmd === 'recarregar-forte') wc.reloadIgnoringCache();
      else if (cmd === 'parar') wc.stop();
      else if (cmd === 'imprimir') wc.print();
      else if (cmd === 'focar') wc.focus();
    } catch { /* ignora */ }
    setTimeout(() => evento({ tabId, tipo: 'estado', ...estadoNav(wc), url: item.url }), 120);
  });

  ipcMain.on('view:zoom', (_e, { tabId, fator }) => {
    const item = abas.get(tabId);
    if (!item) return;
    try { item.view.webContents.setZoomFactor(fator); } catch { /* ignora */ }
  });

  ipcMain.handle('view:estado', (_e, { tabId }) => {
    const item = abas.get(tabId);
    if (!item) return {};
    const wc = item.view.webContents;
    let titulo = '';
    try { titulo = wc.getTitle(); } catch { /* ignora */ }
    return { url: item.url, titulo, contentsId: wc.id, ...estadoNav(wc) };
  });

  ipcMain.on('view:area', (_e, ret) => {
    if (!ret || !ret.width || !ret.height) return;
    area = { x: Math.round(ret.x), y: Math.round(ret.y), width: Math.round(ret.width), height: Math.round(ret.height) };
    aplicarBounds();
  });

  ipcMain.on('view:devtools', (_e, { tabId }) => alternarDevtools(tabId));
  ipcMain.on('view:devtools-fechar', () => fecharDevtools());

  ipcMain.on('view:localizar', (_e, { tabId, texto, proximo }) => {
    const item = abas.get(tabId);
    if (!item) return;
    const wc = item.view.webContents;
    try {
      if (!texto) wc.stopFindInPage('clearSelection');
      else wc.findInPage(texto, { forward: proximo !== false, findNext: true });
    } catch { /* ignora */ }
  });
  ipcMain.on('view:localizar-parar', (_e, { tabId }) => {
    const item = abas.get(tabId);
    if (!item) return;
    try { item.view.webContents.stopFindInPage('clearSelection'); } catch { /* ignora */ }
  });
}

module.exports = { init, pontoAbsoluto, inspecionarContents, fecharDevtools, aplicarBounds, ehHostDevtools };
