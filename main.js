'use strict';

/* ============================================================
   CALOPSIA — processo principal
   Janela, protocolo interno, menu, permissões e downloads.
   ============================================================ */

const { app, BrowserWindow, shell, session, protocol, ipcMain, Menu, dialog,
        nativeTheme, webContents, clipboard } = require('electron');
const path = require('path');
const cofre = require('./src/cofre');
const fs = require('fs');
const os = require('os');

/* O Chromium faz descoberta de dispositivos na rede (mDNS/Cast) sozinho,
   e é isso que faz o Firewall do Windows perguntar se o app pode escutar
   a rede na primeira vez que ele abre. Não usamos transmissão para
   dispositivos, então essa descoberta fica desligada. */
try {
  app.commandLine.appendSwitch('disable-features', 'MediaRouter');
} catch { /* ignora se o switch não existir nesta versão */ }

const APP_ROOT = __dirname;

/* Partição das abas — precisa ser a mesma string usada no renderer.js */
const TAB_PARTITION = 'persist:calopsia';
const SRC_DIR = path.join(APP_ROOT, 'src');
const ASSETS_DIR = path.join(APP_ROOT, 'assets');

/* Ícone da janela.
   - No pacote (asar) só existe assets/ — build/ fica fora do app.
   - No Windows o Electron só aceita .ico para o ícone da janela. */
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const ICON_PATH = (process.platform === 'win32'
  ? [
      path.join(APP_ROOT, 'build', 'icon.ico'),
      path.join(ASSETS_DIR, 'icon.ico'),
      path.join(ASSETS_DIR, 'logo.png')
    ]
  : [
      path.join(APP_ROOT, 'build', 'icon.png'),
      path.join(ASSETS_DIR, 'icon-512.png'),
      path.join(ASSETS_DIR, 'logo.png')
    ]
).find(exists) || undefined;

/* ------------------------------------------------------------
   Tema — segue o sistema por padrão; o menu pode fixar claro/escuro.
   ------------------------------------------------------------ */
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const settings = { theme: 'system' };          // 'system' | 'light' | 'dark'

function loadSettings() {
  try {
    const salvo = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (salvo && ['system', 'light', 'dark'].includes(salvo.theme)) settings.theme = salvo.theme;
  } catch { /* primeira execução ou arquivo ausente */ }
}

function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); } catch { /* só visual */ }
}

const temaInfo = () => ({ source: settings.theme, dark: nativeTheme.shouldUseDarkColors });

/* Avisa tudo que está aberto: janela principal, menu e as abas (webviews). */
function broadcastTema() {
  const info = temaInfo();
  for (const wc of webContents.getAllWebContents()) {
    try { wc.send('theme:changed', info); } catch { /* conteúdo morrendo */ }
  }
  const fundo = info.dark ? '#0e1013' : '#f3f4f6';
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(fundo);
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.setBackgroundColor(info.dark ? '#1a1d24' : '#ffffff');
  return info;
}

function definirTema(fonte) {
  settings.theme = ['light', 'dark'].includes(fonte) ? fonte : 'system';
  saveSettings();
  nativeTheme.themeSource = settings.theme;   // também ajusta o prefers-color-scheme
  return broadcastTema();
}

// O sistema mudou de tema (e então só seguimos se a escolha for "sistema").
nativeTheme.on('updated', broadcastTema);

/* ------------------------------------------------------------
   Protocolo interno "calopsia://"
   Registrado ANTES do app ficar pronto (obrigatório).
   ------------------------------------------------------------ */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'calopsia',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
      stream: true
    }
  }
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

/**
 * Resolve um caminho do protocolo interno para um arquivo real do app.
 * Só aceita arquivos dentro de APP_ROOT — protege contra path traversal.
 */
function resolveInternalFile(urlPath) {
  const clean = decodeURIComponent(urlPath || '').replace(/^\/+/, '').split('?')[0].split('#')[0];
  if (!clean) return path.join(SRC_DIR, 'newtab.html');

  const candidates = [
    path.join(SRC_DIR, clean),
    path.join(APP_ROOT, clean),
    path.join(ASSETS_DIR, clean)
  ];

  const roots = [SRC_DIR, APP_ROOT, ASSETS_DIR].map((r) => path.resolve(r));
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    const inside = roots.some((r) => resolved === r || resolved.startsWith(r + path.sep));
    if (!inside) continue;
    try {
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    } catch { /* ignora */ }
  }
  return null;
}

/** User-Agent "puro" de Chrome.
 *  O UA padrão do Electron termina com "Electron/31.x", e vários sites
 *  (WhatsApp Web, alguns bancos, Google) detectam isso e exibem
 *  "funciona no Google Chrome 100 ou posterior". */
function chromeUserAgent() {
  const chrome = process.versions.chrome || '126.0.0.0';
  const plataforma = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${plataforma}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

let mainWindow = null;

/* ------------------------------------------------------------
   Instância única
   ------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    title: 'CALOPSIA',
    backgroundColor: temaInfo().dark ? '#0e1013' : '#f3f4f6',
    show: false,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,           // obrigatório para <webview>
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,             // o shell confia no preload; webviews continuam isoladas
      spellcheck: false,           // evita carregar o dicionário no boot
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(SRC_DIR, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:maximized', false));
  mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('win:fullscreen', true));
  mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('win:fullscreen', false));

  // Links abertos na UI do navegador (fora dos webviews) vão para o SO.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Qualquer mudança de geometria da janela principal fecha o menu do ☰.
  mainWindow.on('resize', closeMenuWindow);
  mainWindow.on('move', closeMenuWindow);
  mainWindow.on('minimize', closeMenuWindow);
  mainWindow.on('restore', closeMenuWindow);
  mainWindow.on('closed', () => { closeMenuWindow(); mainWindow = null; });
}

/* ------------------------------------------------------------
   Menu da aplicação
   Removido o atalho padrão de "fechar janela" (Cmd/Ctrl+W) para
   que ele feche a ABA, como em qualquer navegador.
   ------------------------------------------------------------ */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: 'CALOPSIA',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Nova aba',
          accelerator: 'CmdOrCtrl+T',
          click: () => mainWindow && mainWindow.webContents.send('app:new-tab')
        },
        {
          label: 'Nova janela',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createWindow()
        },
        { type: 'separator' },
        {
          label: 'Fechar aba',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow && mainWindow.webContents.send('app:close-tab')
        },
        ...(isMac ? [] : [{ role: 'quit', accelerator: 'CmdOrCtrl+Q' }])
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: 'Tela cheia',
          accelerator: 'F11',
          click: () => {
            if (!mainWindow) return;
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------
   Downloads
   ------------------------------------------------------------ */
function setupDownloads() {
  for (const ses of [session.defaultSession, session.fromPartition(TAB_PARTITION)]) ses.on('will-download', (_event, item, webContents) => {
    const win = BrowserWindow.fromWebContents(webContents) || mainWindow;
    const fileName = item.getFilename();
    const target = path.join(app.getPath('downloads'), fileName);

    item.setSavePath(target);
    item.on('updated', (_e, state) => {
      if (state === 'interrupted') item.resume();
      if (win) {
        win.webContents.send('dl:progress', {
          name: fileName,
          received: item.getReceivedBytes(),
          total: item.getTotalBytes(),
          state: state,
          path: item.getSavePath()
        });
      }
    });
    item.once('done', (_e, state) => {
      if (win) {
        win.webContents.send('dl:done', { name: fileName, state, path: item.getSavePath() });
      }
    });
  });
}

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
/* Handler do protocolo interno.
   ATENÇÃO: precisa ser registrado em CADA sessão usada pelo app.
   As abas (<webview>) rodam na partição "persist:calopsia", que é uma sessão
   diferente da padrão — registrar só em `protocol` não resolve dentro delas. */
const calopsiaHandler = async (request) => {
  const file = resolveInternalFile(new URL(request.url).pathname);
  if (!file) {
    return new Response('404 — recurso interno não encontrado', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
  const data = await fs.promises.readFile(file);
  return new Response(data, {
    status: 200,
    headers: { 'content-type': mimeFor(file), 'cache-control': 'no-cache' }
  });
};

app.whenReady().then(() => {
  loadSettings();
  nativeTheme.themeSource = settings.theme;   // antes de qualquer janela existir
  // Sessão padrão (janela principal) e sessão das abas (webviews).
  const ua = chromeUserAgent();
  protocol.handle('calopsia', calopsiaHandler);
  session.defaultSession.setUserAgent(ua);
  const tabSession = session.fromPartition(TAB_PARTITION);
  tabSession.protocol.handle('calopsia', calopsiaHandler);
  tabSession.setUserAgent(ua);

  // Permissões: libera só o essencial para os sites dentro das abas.
  const permissionHandler = (webContents, permission, callback) => {
    if (webContents.getType() === 'webview' && permission === 'fullscreen') return callback(true);
    const allowed = ['fullscreen', 'clipboard-sanitized-write', 'notifications', 'media'];
    callback(allowed.includes(permission));
  };
  session.defaultSession.setPermissionRequestHandler(permissionHandler);
  session.fromPartition(TAB_PARTITION).setPermissionRequestHandler(permissionHandler);

  try {
    app.setAboutPanelOptions({
      applicationName: 'CALOPSIA',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: '© CALOPSIA — licença MIT',
      iconPath: ICON_PATH,
      website: 'https://github.com/Pedro21062014/CALOPSIA'
    });
  } catch (e) { console.warn('about panel:', e.message); }

  setupDownloads();
  buildMenu();
  createWindow();
});

/* ------------------------------------------------------------
   Webviews (abas): popups e downloads externos
   ------------------------------------------------------------ */
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  // Caminho 2 (fallback): o Chromium também emite zoom-changed para o
  // gesto de Ctrl+scroll. Se o listener da página já aplicou, ignora para
  // não zoomar duas vezes.
  contents.on('zoom-changed', (event, direction) => {
    event.preventDefault();
    if (Date.now() - (ultimoZoomPorRoda.get(contents.id) || 0) < 500) return;
    aplicarZoomPasso(contents, direction);
  });

  contents.setWindowOpenHandler(({ url }) => {
    // Um popup pedido por um site abre como nova aba no próprio navegador.
    if (/^https?:\/\//i.test(url) && mainWindow) {
      mainWindow.webContents.send('app:new-tab', url);
    } else if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});

/* ------------------------------------------------------------
   IPC — controles de janela
   ------------------------------------------------------------ */
ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow && mainWindow.close());
ipcMain.on('win:fullscreen', () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.on('win:toggle-devtools', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win) win.webContents.toggleDevTools();
});

ipcMain.handle('app:path', () => app.getAppPath());

/* Tema: fonte escolhida ('system' | 'light' | 'dark') e tema resolvido. */
ipcMain.handle('theme:get', () => temaInfo());
ipcMain.handle('theme:set', (_e, fonte) => definirTema(fonte));

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  partition: TAB_PARTITION,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch
}));

ipcMain.handle('dialog:open-file', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir arquivo no CALOPSIA',
    properties: ['openFile']
  });
  return res.canceled ? null : res.filePaths[0];
});

/* ------------------------------------------------------------
   Zoom por aba (Ctrl+scroll / pinça)
   ------------------------------------------------------------ */
const ultimoZoomPorRoda = new Map();   // contents.id -> timestamp

function aplicarZoomPasso(contents, direction) {
  const atual = contents.getZoomFactor();
  const bruto = direction === 'in' ? atual + 0.1 : atual - 0.1;
  const proximo = Math.min(3, Math.max(0.25, Math.round(bruto * 100) / 100));
  if (proximo === atual) return;
  contents.setZoomFactor(proximo);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tab:zoom', { id: contents.id, zoom: proximo });
  }
}

// Caminho 1: listener de wheel injetado nas páginas (webview-preload.js).
ipcMain.on('tab:zoom-wheel', (event, { delta }) => {
  const contents = event.sender;
  if (!contents || contents.isDestroyed() || contents.getType() !== 'webview') return;
  ultimoZoomPorRoda.set(contents.id, Date.now());
  aplicarZoomPasso(contents, delta < 0 ? 'in' : 'out');
});

/* ------------------------------------------------------------
   Senhas — cofre, detecção e preenchimento
   ------------------------------------------------------------ */

/* Envios ainda não confirmados: só viram "salvar?" depois que o site
   realmente navegar (ou seja, depois que o login deu certo). */
const enviosPendentes = new Map();   // webContents.id -> {url, usuario, senha}

/* ------------------------------------------------------------
   Janelinha flutuante de senhas (desbloquear / criar / salvar / preencher)
   ------------------------------------------------------------ */
let popupWindow = null;
let popupCtx = null;
let popupAbertoEm = 0;

function fecharPopup() {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.destroy();
  popupWindow = null;
  popupCtx = null;
}

function abrirPopup(ctx) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  fecharPopup();
  popupCtx = ctx;
  popupAbertoEm = Date.now();

  popupWindow = new BrowserWindow({
    width: ctx.largura || 300,
    height: 60,
    x: -10000,
    y: -10000,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: true,
    parent: mainWindow,
    backgroundColor: temaInfo().dark ? '#1a1d24' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload-popup.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  popupWindow.loadFile(path.join(SRC_DIR, 'popup.html'));
  popupWindow.webContents.once('did-finish-load', () => {
    if (!popupWindow || popupWindow.isDestroyed()) return;
    popupWindow.webContents.send('popup:dados', ctx.dados);
  });
  popupWindow.on('blur', fecharPopup);
  popupWindow.on('closed', () => { popupWindow = null; popupCtx = null; });
}

ipcMain.on('popup:pronto', (_e, { height }) => {
  if (!popupWindow || popupWindow.isDestroyed() || !popupCtx) return;
  const w = popupCtx.largura || 300;
  popupWindow.setSize(w, Math.max(48, height), false);

  if (popupCtx.x != null && popupCtx.y != null) {
    const [wx, wy] = mainWindow.getPosition();
    popupWindow.setPosition(wx + Math.round(popupCtx.x), wy + Math.round(popupCtx.y), false);
  } else {
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    popupWindow.setPosition(wx + Math.round((ww - w) / 2), wy + Math.round(wh * 0.28), false);
  }
  popupWindow.show();
  popupWindow.focus();
});

ipcMain.on('popup:fechar', () => fecharPopup());

ipcMain.on('popup:acao', (_e, { id, dados }) => {
  const ctx = popupCtx || {};

  if (id === 'criar') {
    const r = cofre.criar(dados.senha);
    if (!r.ok) {
      abrirPopup({ dados: { modo: 'criar', erro: r.erro, protecaoSO: cofre.situacao().protecaoSO }, depois: ctx.depois, largura: 300 });
      return;
    }
    fecharPopup();
    if (ctx.depois) ctx.depois();
    return;
  }

  if (id === 'desbloquear') {
    const r = cofre.abrir(dados.senha);
    if (!r.ok) {
      abrirPopup({ dados: { modo: 'desbloquear', erro: r.erro }, depois: ctx.depois, largura: 300 });
      return;
    }
    fecharPopup();
    if (ctx.depois) ctx.depois();
    return;
  }

  if (id === 'salvar') {
    if (ctx.pendente) cofre.guardar(ctx.pendente);
    fecharPopup();
    return;
  }

  if (id === 'nunca') {
    if (ctx.pendente) cofre.nuncaAqui(ctx.pendente.url);
    fecharPopup();
    return;
  }

  if (id === 'preencher') {
    const conta = (cofre.contasDoLocal(ctx.url) || []).find((c) => c.id === dados.id);
    const alvo = webContents.fromId(ctx.contentsId);
    if (conta && alvo && !alvo.isDestroyed()) {
      alvo.send('senhas:aplicar', { usuario: conta.usuario, senha: conta.senha, usuarioId: true });
    }
    fecharPopup();
    return;
  }

  if (id === 'gerar') {
    const senha = cofre.gerarSenha(20);
    const alvo = webContents.fromId(ctx.contentsId);
    if (alvo && !alvo.isDestroyed()) alvo.send('senhas:aplicar', { senha });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('senhas:gerada', senha);
    fecharPopup();
    return;
  }

  fecharPopup();
});

/** Garante o cofre aberto; pede (ou cria) a senha mestra se precisar. */
function comCofreAberto(depois) {
  const sit = cofre.situacao();
  if (!sit.existe) { abrirPopup({ dados: { modo: 'criar', protecaoSO: sit.protecaoSO }, depois, largura: 300 }); return; }
  if (sit.aberto) { depois(); return; }
  abrirPopup({ dados: { modo: 'desbloquear' }, depois, largura: 300 });
}

/* --- mensagens vindas das páginas (webview-preload) --- */

// Foco num campo de login: a interface decide, pois só ela sabe a aba ativa.
ipcMain.on('senhas:campo-foco', (evento, info) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('senhas:campo-foco', {
    contentsId: evento.sender.id, tipo: info.tipo, rect: info.rect
  });
});

ipcMain.on('senhas:fechar-popup', () => {
  if (Date.now() - popupAbertoEm < 700) return;   // folga: ignora o scroll do próprio clique
  if (popupCtx && !popupCtx.pendente) fecharPopup();
});

// Formulário enviado: guarda e espera a navegação confirmar o login.
ipcMain.on('senhas:enviou', (evento, info) => {
  if (!info || !info.senha) return;
  enviosPendentes.set(evento.sender.id, info);
});

/* --- pedidos da interface --- */
const origemDe = (u) => { try { return new URL(u).origin; } catch { return String(u || ''); } };

ipcMain.on('senhas:navegou', (_e, { contentsId, url }) => {
  const p = enviosPendentes.get(contentsId);
  if (!p) return;
  enviosPendentes.delete(contentsId);
  try {
    const antes = new URL(p.url);
    const depois = new URL(url);
    if (antes.origin === depois.origin && antes.pathname === depois.pathname) {
      enviosPendentes.set(contentsId, p);   // mesma página: ainda não deu certo
      return;
    }
  } catch { /* endereço interno: oferece mesmo assim */ }

  if (cofre.nuncaSalvar(p.url)) return;

  const jaTem = cofre.estaAberto()
    ? cofre.contasDoLocal(p.url).find((c) => c.usuario === p.usuario) || null
    : null;
  const modo = jaTem ? (jaTem.senha === p.senha ? null : 'atualizar') : 'salvar';
  if (!modo) return;

  const dados = { modo, site: origemDe(p.url), usuario: p.usuario, senha: p.senha };

  if (!cofre.estaAberto()) {
    comCofreAberto(() => {
      if (cofre.nuncaSalvar(p.url)) return;
      const t = cofre.contasDoLocal(p.url).find((c) => c.usuario === p.usuario);
      if (t && t.senha === p.senha) return;
      abrirPopup({ dados: { ...dados, modo: t ? 'atualizar' : 'salvar' }, pendente: p, largura: 320 });
    });
    return;
  }
  abrirPopup({ dados, pendente: p, largura: 320 });
});

ipcMain.on('senhas:abrir-popup', (_e, { x, y, contentsId, tipo, url }) => {
  comCofreAberto(() => {
    const contas = cofre.contasDoLocal(url) || [];
    if (!contas.length && tipo !== 'nova-senha') return;
    abrirPopup({
      x, y, largura: 300, contentsId, url,
      dados: {
        modo: 'preencher',
        site: origemDe(url),
        contas: contas.map((c) => ({ id: c.id, usuario: c.usuario })),
        podeGerar: tipo === 'nova-senha'
      }
    });
  });
});

ipcMain.on('senhas:abrir-cofre', () => comCofreAberto(() => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('senhas:estado', cofre.situacao());
}));

/* --- consultas do cofre --- */
ipcMain.handle('senhas:situacao', () => cofre.situacao());
ipcMain.handle('senhas:listar', () => (cofre.estaAberto() ? cofre.listar() : []));
ipcMain.handle('senhas:revelar', (_e, id) => cofre.revelar(id));
ipcMain.handle('senhas:apagar', (_e, id) => cofre.apagar(id));
ipcMain.handle('senhas:gerar', (_e, n) => cofre.gerarSenha(n));
ipcMain.handle('senhas:forca', (_e, s) => cofre.forca(s));
ipcMain.handle('senhas:desbloquear', (_e, senha) => cofre.abrir(senha));
ipcMain.handle('senhas:criar', (_e, senha) => cofre.criar(senha));
ipcMain.on('senhas:fechar', () => cofre.fechar());
ipcMain.on('senhas:copiar', (_e, texto) => { if (texto) clipboard.writeText(texto); });

/* ------------------------------------------------------------
   Menu do ☰ — janela própria (garante que a lista apareça sempre
   acima do <webview>, que no Windows é uma janela nativa e cobre
   qualquer elemento DOM sobreposto).
   ------------------------------------------------------------ */
let menuWindow = null;
let menuPayload = null;

function closeMenuWindow() {
  if (menuWindow && !menuWindow.isDestroyed()) menuWindow.destroy();
  menuWindow = null;
  menuPayload = null;
}

ipcMain.on('menu:open', (_e, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  closeMenuWindow();

  menuPayload = payload;
  const width = payload.width || 272;

  menuWindow = new BrowserWindow({
    width,
    height: 40,
    x: -10000,
    y: -10000,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: true,
    parent: mainWindow,
    backgroundColor: temaInfo().dark ? '#1a1d24' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload-menu.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  menuWindow.loadFile(path.join(SRC_DIR, 'menu.html'));

  menuWindow.webContents.once('did-finish-load', () => {
    if (!menuWindow || menuWindow.isDestroyed()) return;
    menuWindow.webContents.send('menu:items', menuPayload.items);
  });

  menuWindow.on('blur', closeMenuWindow);
  menuWindow.on('closed', () => { menuWindow = null; menuPayload = null; });

});

ipcMain.on('menu:ready', (_e, { height }) => {
  if (!menuWindow || menuWindow.isDestroyed() || !menuPayload) return;
  const width = menuPayload.width || 272;
  const [wx, wy] = mainWindow.getPosition();

  menuWindow.setSize(width, Math.max(40, height), false);
  menuWindow.setPosition(wx + Math.round(menuPayload.x), wy + Math.round(menuPayload.y), false);
  menuWindow.show();
  menuWindow.focus();
});

ipcMain.on('menu:action', (_e, id) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:action', id);
  closeMenuWindow();
});

ipcMain.on('menu:close', () => closeMenuWindow());

ipcMain.on('shell:show-item', (_e, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.on('shell:open-path', (_e, p) => { if (p) shell.openPath(p); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  const visiveis = BrowserWindow.getAllWindows().filter((w) => w !== menuWindow && !w.isDestroyed());
  if (visiveis.length === 0) createWindow();
});
