'use strict';

/* ============================================================
   CALOPSIA — processo principal
   Janela, protocolo interno, menu, permissões e downloads.
   ============================================================ */

const { app, BrowserWindow, shell, session, protocol, ipcMain, Menu, dialog,
        nativeTheme, webContents, clipboard } = require('electron');
const path = require('path');
const cofre = require('./src/cofre');
const { initUpdater } = require('./src/updater');
const abas = require('./src/tabs');
const fs = require('fs');
const os = require('os');

/* Particionamento de storage de terceiros DESLIGADO (v0.5.3):
   descoberta forense mostrou que o cf_clearance do Cloudflare era
   armazenado PARTICIONADO sob o topLevelSite errado (novacrm.com.br)
   quando a pessoa navegava para app.novacrm.com.br/login — cookie no
   "pote" errado = liberação invisível = desafio em loop. Navegadores
   Chromium de navegador (não app) usam storage não-particionado. */
/* O Chromium faz descoberta de dispositivos na rede (mDNS/Cast) sozinho,
   e é isso que faz o Firewall do Windows perguntar se o app pode escutar
   a rede na primeira vez que ele abre. Não usamos transmissão para
   dispositivos, então essa descoberta fica desligada. */
try {
  app.commandLine.appendSwitch('disable-features', 'MediaRouter,ThirdPartyStoragePartitioning,PartitionedCookies');
} catch { /* ignora se o switch não existir nesta versão */ }

/* WebGPU — necessário para o Turnstile do Cloudflare.
   A verificação chama navigator.gpu.requestAdapter(); sem adapter
   ("No available adapters", capturado na máquina do usuário), o desafio
   morre e recarrega em loop. enable-unsafe-webgpu garante o caminho de
   fallback por software — o MESMO que um Chrome real usa quando a
   GPU/driver está na blocklist.

   IMPORTANTE: NÃO usar "ignore-gpu-blocklist". Forçar hardware que o
   Chromium bloqueou cria uma impressão de GPU que nenhum Chrome real
   teria na mesma máquina — a ferramenta oficial do Cloudflare
   (debug.challenges.cloudflare.com) classifica exatamente isso como
   "Graphics Information Appears Fake", ou seja, fingerprint suspeito.

   v0.5.4 — "Vulkan" agora é SÓ no Linux (onde o WebGPU precisa dele).
   Aplicar em TODOS os sistemas (como estava desde a v0.5.1) forçava o
   backend Vulkan do ANGLE/Dawn no Windows; sem driver Vulkan instalado,
   o adapter WebGPU desaparecia de novo — o mesmo "No available adapters"
   que trava o Turnstile. No Windows o caminho nativo é D3D11/D3D12 e o
   Chrome real nunca força Vulkan; no macOS o motor usa Metal e ignora
   a flag de qualquer forma.

   v0.5.5 — CAUSA RAIZ RESTANTE, PROVADA COM FORENSE AQUI NO APP:
   "enable-unsafe-swiftshader". Quando a inicialização de GPU falha
   (driver antigo/corrompido, GPU em crash, VM, acesso remoto), o
   Chromium cai para renderização por software (SwiftShader). Só que,
   desde o Chromium 128+, o fallback por software de WebGL/WebGPU é
   considerado "unsafe" e vem DESLIGADO no Chromium puro (o Electron):
   sem a flag, o resultado medido com o app rodando foi
   "ContextResult::kFatalFailure: WebGL1/WebGL2 blocklisted" +
   navigator.gpu AUSENTE — e a ferramenta oficial do Cloudflare
   (debug.challenges.cloudflare.com) ficava presa em "Waiting for
   Turnstile to finish" PARA SEMPRE: o desafio não tem nenhum sinal
   gráfico para coletar, nunca conclui e a página recarrega em loop.
   O Chrome do Google (branding) tem esse fallback LIGADO por padrão —
   por isso o "mesmo site" funciona nele. A flag deixa o CALOPSIA no
   mesmo estado. Em máquinas com GPU saudável ela é inerte: a GPU real
   é usada e o fingerprint não muda em nada. */
try {
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'Vulkan');
  }
  /* v0.5.6 — WINDOWS: fixar o caminho gráfico do ANGLE em D3D11, o MESMO
     que o Chrome do Google usa. Com "enable-unsafe-swiftshader" (v0.5.5),
     quando o driver falhava o ANGLE podia escolher o backend Vulkan sobre
     SwiftShader — cuja assinatura "SwiftShader Device (Subzero)" é EXATAMENTE
     o que a ferramenta oficial do Cloudflare classifica como "Graphics
     Information Appears Fake / WebGL renderer info is spoofed" (provado
     com probe: a mesma tool dá SUCCESS num Chromium real no mesmo hardware).
     Fixado em D3D11, o fallback de driver problemático passa a ser o WARP
     da Microsoft ("Microsoft Basic Render Driver") — o MESMO renderer crível
     que um Chrome real mostra na mesma máquina — e a verificação para de
     ser rejeitada por gráficos "falsos". Em máquinas com driver saudável a
     flag é inerte: D3D11 já era o caminho nativo. */
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'd3d11');
  }
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
} catch { /* ignora */ }
const APP_ROOT = __dirname;

/* Partição das abas — precisa ser a mesma string usada no renderer.js */
const TAB_PARTITION = 'persist:calopsia';
/* Sessão das abas, guardada no boot (v0.5.8): é o critério usado para
   reconhecer webContents de ABA — as abas WebContentsView chegam em
   'web-contents-created' com tipo 'window' (não 'webview'/'browserView'
   como na era do <webview>), então a sessão é o identificador confiável. */
let sessaoAbas = null;
const SRC_DIR = path.join(APP_ROOT, 'src');
const ASSETS_DIR = path.join(APP_ROOT, 'assets');

/* Ícone da janela.
   - No pacote (asar) só existe assets/ — build/ fica fora do app.
   - No Windows o Electron só aceita .ico para o ícone da janela. */
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const ICON_PATH = (process.platform === 'win32'
  ? [
      path.join(APP_ROOT, 'buildres', 'icon.ico'),
      path.join(ASSETS_DIR, 'icon.ico'),
      path.join(ASSETS_DIR, 'logo.png')
    ]
  : [
      path.join(APP_ROOT, 'buildres', 'icon.png'),
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
  /* Identidade 100% NATIVA (v0.5.0 — "modo compatibilidade"):
     o UA padrão do Electron carrega os tokens "Electron/x" e o nome do app,
     que travam sites (WhatsApp/bancos) e denunciam o wrapper. Basta REMOVER
     esses tokens: o resultado é exatamente o UA de um Chromium puro — que
     é o que somos — e as dicas de cliente (sec-ch-ua, userAgentData) ficam
     nativas e coerentes com ele, sem nenhum patch. Um Chromium nativo é
     consistente consigo mesmo; quanto menos mexido, melhor.

     v0.5.6 — REDUÇÃO DE VERSÃO DO UA: todo Chrome/Chromium REAL envia o UA
     com versão REDUZIDA ("Chrome/152.0.0.0") desde a redução de UA de 2023;
     o Electron nativo envia a versão CHEIA ("Chrome/152.0.7977.54") — que
     nenhum Chrome real envia, assinatura direta de cliente forjado que a
     ferramenta oficial do Cloudflare cruza com o resto do fingerprint.
     A versão é reduzida para o formato nativo de um Chrome de verdade. */
  const padrao = app.userAgent || '';
  const limpo = padrao
    .replace(new RegExp('\\s+Electron/[\\d.]+', 'gi'), '')
    .replace(new RegExp('\\s+' + String(app.name || 'calopsia').replace(/[^a-z0-9]/gi, '') + '/[\\d.]+', 'i'), '')
    .replace(/(Chrome\/\d+)\.\d+\.\d+\.\d+/i, '$1.0.0.0')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (/Chrome\/[\d.]+/.test(limpo)) return limpo;
  const chrome = (process.versions.chrome || '126.0.0.0').split('.')[0];
  const plataforma = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${plataforma}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome}.0.0.0 Safari/537.36`;
}

/* ------------------------------------------------------------
   Diário do navegador (v0.5.8)
   ------------------------------------------------------------
   Registro curto e LOCAL de tudo que ajuda a diagnosticar
   problemas que só acontecem na máquina de quem usa — loop do
   Cloudflare, falha de GPU, erros de console das páginas:
   - anel em memória com as últimas ~800 linhas;
   - espelhado em arquivo diario.log dentro da pasta do perfil
     (no Windows: %APPDATA%\CALOPSIA\diario.log);
   - NÃO sai do computador por conta própria — a página de
     diagnóstico tem o botão "Copiar relatório", e quem decide
     o que fazer com ele é a pessoa.
   ------------------------------------------------------------ */
const DIARIO_PATH = path.join(app.getPath('userData'), 'diario.log');
const DIARIO_MAX = 800;
const diario = [];
let diarioEscritas = 0;

function anotar(origem, msg) {
  try {
    const linha = `[${new Date().toISOString()}] [${origem}] ${String(msg).replace(/\s+/g, ' ').slice(0, 500)}`;
    diario.push(linha);
    if (diario.length > DIARIO_MAX) diario.splice(0, diario.length - DIARIO_MAX);
    try { console.log(linha); } catch { /* sem console */ }
    /* Roda o arquivo a cada 64 anotações, se passar de 1 MB. */
    if ((diarioEscritas++ & 63) === 0) {
      try { if (fs.statSync(DIARIO_PATH).size > 1024 * 1024) fs.writeFileSync(DIARIO_PATH, ''); } catch { /* novo */ }
    }
    fs.appendFile(DIARIO_PATH, linha + '\n', () => {});
  } catch { /* diário é best-effort: nunca atrapalha o app */ }
}

let mainWindow = null;

/* ------------------------------------------------------------
   Identidade na rede — NENHUMA (v0.5.0)
   ------------------------------------------------------------
    Nada de reescrever sec-ch-ua / sec-ch-ua-full-version-list:
    o Chromium gera dicas coerentes com o UA nativo sozinho.
    Qualquer edição manual cria o tipo de inconsistência que os
    anti-bots procuram. Cookie de terceiro então, nem se fala.
   ------------------------------------------------------------ */

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,             // o shell confia no preload; abas são views isoladas
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
   Comandos que agem na PÁGINA da aba ativa (não na interface):
   recarregar, DevTools e zoom vêm do menu nativo até aqui e são
   repassados para a janela em foco via 'app:cmd'.
   ------------------------------------------------------------ */
function cmdPagina(id) {
  return () => {
    let alvo = null;
    try {
      const foco = webContents.getFocusedWebContents();
      const host = foco && foco.hostWebContents ? foco.hostWebContents : foco;
      alvo = host ? BrowserWindow.fromWebContents(host) : null;
    } catch { /* ignora */ }
    if (!alvo || alvo.isDestroyed()) alvo = BrowserWindow.getFocusedWindow() || mainWindow;
    if (alvo && !alvo.isDestroyed()) alvo.webContents.send('app:cmd', id);
  };
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
        { label: 'Recarregar a página', accelerator: 'CmdOrCtrl+R', click: cmdPagina('reload') },
        { label: 'Recarregar ignorando o cache', accelerator: 'CmdOrCtrl+Shift+R', click: cmdPagina('reload-hard') },
        { label: 'Ferramentas do desenvolvedor', accelerator: 'CmdOrCtrl+Shift+I', click: cmdPagina('devtools') },
        { label: 'Ferramentas do desenvolvedor (F12)', visible: false, accelerator: 'F12', click: cmdPagina('devtools') },
        { type: 'separator' },
        { label: 'Restaurar zoom', accelerator: 'CmdOrCtrl+0', click: cmdPagina('zoom-reset') },
        { label: 'Ampliar', accelerator: 'CmdOrCtrl+Plus', click: cmdPagina('zoom-in') },
        { label: 'Reduzir', accelerator: 'CmdOrCtrl+-', click: cmdPagina('zoom-out') },
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
  anotar('boot', `CALOPSIA ${app.getVersion()} · Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node} · ${process.platform}-${process.arch}`);
  anotar('boot', `UA em uso: ${ua}`);
  anotar('boot', `diário gravado em: ${DIARIO_PATH}`);
  protocol.handle('calopsia', calopsiaHandler);
  session.defaultSession.setUserAgent(ua);
  const tabSession = session.fromPartition(TAB_PARTITION);
  sessaoAbas = tabSession;
  tabSession.protocol.handle('calopsia', calopsiaHandler);
  tabSession.setUserAgent(ua);

  /* Motor de abas: WebContentsView nativa por aba (substitui o <webview>). */
  abas.init(() => mainWindow, {
    sessao: tabSession,
    preload: path.join(__dirname, 'webview-preload.js'),
    fundoEscuro: () => nativeTheme.shouldUseDarkColors
  });


  // Permissões: libera só o essencial para os sites dentro das abas.
  // v0.5.4 — "storage-access" e "top-level-storage-access" entram na lista:
  // são as permissões que iframes de terceiros (o widget do Turnstile roda
  // num iframe de challenges.cloudflare.com) usam para pedir acesso ao
  // storage do navegador. Negar aqui trava o widget girando para sempre,
  // mesmo com WebGPU e cookies em ordem. Comportamento idêntico ao Chrome,
  // que concede automaticamente nos contextos apropriados.
  const permissionHandler = (webContents, permission, callback) => {
    const allowed = ['fullscreen', 'clipboard-sanitized-write', 'notifications', 'media',
                     'storage-access', 'top-level-storage-access'];
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

  /* Atualizador: verifica nas Releases do GitHub 30 em 30 minutos. */
  initUpdater();
});

/* ------------------------------------------------------------
   Webviews (abas): popups e downloads externos
   ------------------------------------------------------------ */
app.on('web-contents-created', (_event, contents) => {
  const tipo = contents.getType();
  anotar('contents', `criado: tipo=${tipo} url=${String(contents.getURL() || '').slice(0, 80)}`);
  /* v0.5.8 — CRITÉRIO DE ABA CORRIGIDO: as abas WebContentsView chegam
     aqui com tipo 'window' (não 'webview'/'browserView' como na era do
     <webview>). O filtro antigo devolvia cedo e deixava MUDO, dentro das
     abas: o menu de contexto, o zoom por roda, a conversão de popups em
     abas, a válvula anti-loop e o diário de eventos. O critério estável
     é a SESSÃO: toda aba roda na partição 'persist:calopsia'; a janela
     principal, o menu ☰ e os popups internos rodam na sessão padrão. */
  if (!sessaoAbas || contents.session !== sessaoAbas || abas.ehHostDevtools(contents.id)) return;

  /* ------------------------------------------------------------
     Menu de contexto (botão direito) das páginas
     Como num navegador de verdade: navegação, área de transferência,
     link/imagem e — o principal — "Inspecionar", que abre o DevTools
     completo já parado no elemento sob o cursor.
     ------------------------------------------------------------ */
  contents.on('context-menu', (_e, params) => {
    const janela = (() => {
      try { return BrowserWindow.fromWebContents(contents.hostWebContents) || mainWindow; }
      catch { return mainWindow; }
    })();

    const podeVoltar = (() => {
      try { return contents.navigationHistory ? contents.navigationHistory.canGoBack() : contents.canGoBack(); }
      catch { return false; }
    })();
    const podeAvancar = (() => {
      try { return contents.navigationHistory ? contents.navigationHistory.canGoForward() : contents.canGoForward(); }
      catch { return false; }
    })();

    const abrirAba = (url) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:new-tab', url);
    };

    const itens = [];

    if (params.linkURL) {
      itens.push(
        { label: 'Abrir link em nova aba', click: () => abrirAba(params.linkURL) },
        { label: 'Copiar endereço do link', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      );
    }

    if (params.mediaType === 'image' && params.srcURL) {
      itens.push(
        { label: 'Abrir imagem em nova aba', click: () => abrirAba(params.srcURL) },
        { label: 'Salvar imagem como…', click: () => { try { contents.downloadURL(params.srcURL); } catch { /* ignora */ } } },
        { label: 'Copiar imagem', click: () => { try { contents.copyImageAt(params.x, params.y); } catch { /* ignora */ } } },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      itens.push(
        { label: 'Cortar', enabled: !!((params.editFlags || {}).canCut), click: () => contents.cut() },
        { label: 'Copiar', enabled: !!((params.editFlags || {}).canCopy), click: () => contents.copy() },
        { label: 'Colar', enabled: !!((params.editFlags || {}).canPaste), click: () => contents.paste() },
        { label: 'Selecionar tudo', click: () => contents.selectAll() },
        { type: 'separator' }
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      const texto = params.selectionText.trim();
      const resumo = texto.length > 18 ? texto.slice(0, 18) + '…' : texto;
      itens.push(
        { label: 'Copiar', click: () => contents.copy() },
        { label: `Pesquisar “${resumo}”`, click: () => abrirAba('https://www.google.com/search?q=' + encodeURIComponent(texto)) },
        { type: 'separator' }
      );
    }

    itens.push(
      { label: 'Voltar', enabled: podeVoltar, click: () => contents.goBack() },
      { label: 'Avançar', enabled: podeAvancar, click: () => contents.goForward() },
      { label: 'Recarregar', click: () => contents.reload() },
      { type: 'separator' },
      {
        label: 'Inspecionar',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => abas.inspecionarContents(contents.id, params.x, params.y)
      }
    );

    try {
      Menu.buildFromTemplate(itens).popup({ window: janela, x: Math.round(params.x), y: Math.round(params.y) });
    } catch { /* ignora */ }
  });

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

  ligarValvulaAntiLoop(contents);
  ligarDiarioDaAba(contents);
});

/* ------------------------------------------------------------
   Válvula anti-loop do Cloudflare (v0.5.4)
   ------------------------------------------------------------
   O desafio do Cloudflare recarrega a página algumas vezes DE
   PROPÓSITO — isso é normal e nunca deve ser interrompido (a
   tentativa de v0.2.6 quebrava o desafio no meio e foi removida).

   Loop REAL é outra coisa: a MESMA página volta dezenas de vezes
   sem nunca sair da verificação — em geral porque um cf_clearance
   recusado continua sendo reenviado (cookie morto). Navegador
   nenhum resolve isso sozinho; o usuário teria de apagar os cookies
   do site à mão.

   Esta válvula faz exatamente isso, e SÓ nesse estado:
   - conta voltas à mesma origem+rota (sem query, pois o token do
     desafio muda a cada tentativa) dentro de uma janela de 90 s;
   - a partir da 6ª volta, limpa APENAS os cookies do Cloudflare
     daquele domínio (cf_clearance, __cf_bm) — nada global;
   - recarrega uma única vez e avisa na interface;
   - no mínimo 60 s entre limpezas da mesma aba, para nunca virar
     um "apagador" que brigue com o desafio.

   Desafios saudáveis passam com 1–3 recarregamentos e nem chegam
   perto do limite.
   ------------------------------------------------------------ */
const LOOP_JANELA_MS = 90 * 1000;      // janela de observação
const LOOP_LIMITE = 6;                 // voltas até agir
const LOOP_GAP_LIMPEZA_MS = 60 * 1000; // mínimo entre limpezas por aba
const COOKIES_CF = ['cf_clearance', '__cf_bm'];
const voltasDaUrl = new Map();         // contents.id -> estado da contagem

function ligarValvulaAntiLoop(contents) {
  contents.on('did-navigate', (_e, url) => {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return;
      const chave = u.origin + u.pathname;   // sem ?query (token muda sempre)

      const agora = Date.now();
      let reg = voltasDaUrl.get(contents.id);
      if (!reg || reg.chave !== chave || agora - reg.primeiraEm > LOOP_JANELA_MS) {
        reg = { chave, primeiraEm: agora, contagem: 0, ultimaLimpeza: 0 };
        voltasDaUrl.set(contents.id, reg);
      }
      reg.contagem += 1;
      if (reg.contagem < LOOP_LIMITE) return;
      if (agora - reg.ultimaLimpeza < LOOP_GAP_LIMPEZA_MS) return;
      reg.ultimaLimpeza = agora;
      reg.contagem = 0;

      limparCookiesCloudflare(contents, u);
    } catch { /* URL estranha: ignora */ }
  });

  contents.once('destroyed', () => voltasDaUrl.delete(contents.id));
}

/* Limpa os cookies do Cloudflare de UM domínio e recarrega sem eles. */
async function limparCookiesCloudflare(contents, u) {
  try {
    const ses = contents.session;
    if (!ses) return;
    const origem = u.origin;

    let removidos = 0;
    const cookies = await ses.cookies.get({ url: origem });
    for (const c of cookies) {
      if (!COOKIES_CF.includes(c.name)) continue;
      const cookieUrl = `http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path || '/'}`;
      try { await ses.cookies.remove(cookieUrl, c.name); removidos += 1; } catch { /* já ido */ }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cf:loop', { url: origem + u.pathname, removidos });
    }

    anotar('cf-loop', `válvula anti-loop acionada para ${origem}${u.pathname} — ${removidos} cookie(s) do Cloudflare removido(s); recarregando uma vez`);

    /* Recarrega uma única vez, agora sem o cookie de liberação morto. */
    try { contents.loadURL(origem + u.pathname); } catch { /* ignora */ }
  } catch { /* ignora */ }
}

/* ------------------------------------------------------------
   Diário da aba (v0.5.8): navegações, falhas de carga e mensagens
   de console (só avisos/erros) de cada aba — a matéria-prima do
   relatório de suporte. Volume baixo; nada é enviado para fora.
   ------------------------------------------------------------ */
function ligarDiarioDaAba(contents) {
  const curto = (u) => String(u == null ? '' : u).slice(0, 300);

  contents.on('did-navigate', (_e, url) => anotar('navegou', curto(url)));
  contents.on('did-navigate-in-page', (_e, url) => anotar('navegou (mesma página)', curto(url)));

  contents.on('did-fail-load', (_e, code, desc, url, isPrincipal) => {
    if (code === -3) return;   // abortado: quem navega cancelou / trocou de página
    if (isPrincipal) anotar('falha de carga', `${code} ${desc} — ${curto(url)}`);
  });

  /* 'console-message' mudou de assinatura entre versões do Electron:
     formato antigo = (e, nivel, msg, linha, fonte); novo = um objeto
     de detalhes no primeiro argumento. Tratamos os dois formatos. */
  contents.on('console-message', (...args) => {
    try {
      let nivel, msg, fonte, linha;
      if (typeof args[1] === 'number') {
        nivel = args[1]; msg = args[2]; linha = args[3]; fonte = args[4];
      } else {
        const d = args[0] || {};
        nivel = d.level; msg = d.message; linha = d.lineNumber; fonte = d.sourceId;
      }
      const n = typeof nivel === 'string'
        ? ({ verbose: 0, info: 1, warning: 2, error: 3 }[String(nivel).toLowerCase()] ?? 1)
        : Number(nivel);
      if (n < 2) return;   // só avisos e erros — ruído de log comum não entra
      anotar(n >= 3 ? 'console erro' : 'console aviso', `${String(msg == null ? '' : msg).slice(0, 300)} (${String(fonte || '').slice(0, 140)}:${linha == null ? '?' : linha})`);
    } catch { /* ignora */ }
  });

  contents.on('render-process-gone', (_e, detalhes) => {
    anotar('render morreu', `${detalhes.reason} exit=${detalhes.exitCode}`);
  });
}

/* Quedas de processos auxiliares — GPU incluída (clássica causa de
   loop: o driver de vídeo trava no meio da verificação). */
app.on('child-process-gone', (_e, detalhes) => {
  anotar('processo saiu', `${detalhes.type} ${detalhes.reason} exit=${detalhes.exitCode}`);
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
ipcMain.on('win:toggle-devtools', () => cmdPagina('devtools')());

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

/* Diário (v0.5.8) — usado pela página de diagnóstico para montar
   o relatório de suporte e abrir a pasta do arquivo de eventos. */
ipcMain.handle('diario:cauda', () => diario.join('\n'));
ipcMain.handle('diario:local', () => DIARIO_PATH);
ipcMain.handle('diario:copiar', (_e, texto) => {
  try { clipboard.writeText(String(texto || '')); return true; } catch { return false; }
});
ipcMain.on('diario:abrir-pasta', () => {
  try { shell.showItemInFolder(DIARIO_PATH); } catch { /* ignora */ }
});

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
  if (!contents || contents.isDestroyed()) return;
  /* v0.5.8 — critério de aba pela sessão (as abas WebContentsView não
     são mais do tipo 'webview'/'browserView'). */
  if (!sessaoAbas || contents.session !== sessaoAbas) return;
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
// O popup aparece logo abaixo do campo — as coordenadas vindas da página
// são convertidas para posição absoluta na janela pelo motor de abas.
ipcMain.on('senhas:campo-foco', (evento, info) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const abs = abas.pontoAbsoluto(evento.sender.id, info.rect ? info.rect.x : 0, info.rect ? info.rect.y : 0);
  mainWindow.webContents.send('senhas:campo-foco', {
    contentsId: evento.sender.id, tipo: info.tipo, rect: info.rect, abs
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
