'use strict';
/* ============================================================
   Probe forense do Cloudflare — ferramenta de diagnóstico do CALOPSIA
   ------------------------------------------------------------
   Uso (com o Xvfb no Linux headless):
     Xvfb :99 -screen 0 1280x900x24 -ac &
     DISPLAY=:99 electron scripts/probe-cloudflare.js --no-sandbox

   Variáveis:
     PROBE_SWIFT=1  → também testa com --enable-unsafe-swiftshader
     PROBE_URL=...  → site alvo da fase de managed challenge
                      (padrão: scrapingcourse.com/cloudflare-challenge)

   O que faz:
   1. replica os switches/sessão do main.js (identidade nativa);
   2. mede WebGL/WebGPU/plugins no motor real;
   3. roda a ferramenta OFICIAL debug.challenges.cloudflare.com
      e captura o veredito dela (innerText);
   4. abre um site com managed challenge por 45 s e registra
      navegações (loop), console e cookies do Cloudflare.
   Relatório completo: /tmp/probe-cloudflare-report.json (ajustável
   na constante OUT).
   ============================================================ */
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');

/* --- switches IDÊNTICOS ao main.js (mantenha em sincronia) --- */
try {
  app.commandLine.appendSwitch('disable-features', 'MediaRouter,ThirdPartyStoragePartitioning,PartitionedCookies');
  if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'Vulkan');
  if (process.platform === 'win32') {
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'd3d11');
  }
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
} catch { /* ignora */ }

const OUT = '/home/z/my-project/probe-cloudflare-report.json';
const log = [];
function logev(ev, data) {
  const e = { t: Date.now(), ev, data };
  log.push(e);
  console.log('[' + new Date(e.t).toISOString().slice(11, 23) + ']', ev, JSON.stringify(data).slice(0, 260));
}

let win = null;

const uaLimpo = () => {
  const padrao = app.userAgent || '';
  const limpo = padrao
    .replace(new RegExp('\\s+Electron/[\\d.]+', 'gi'), '')
    .replace(new RegExp('\\s+' + String(app.name || 'calopsia').replace(/[^a-z0-9]/gi, '') + '/[\\d.]+', 'i'), '')
    .replace(/(Chrome\/\d+)\.\d+\.\d+\.\d+/i, '$1.0.0.0')
    .replace(/\s{2,}/g, ' ').trim();
  if (/Chrome\/[\d.]+/.test(limpo)) return limpo;
  const maior = String(process.versions.chrome || '152').split('.')[0];
  const plataforma = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${plataforma}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${maior}.0.0.0 Safari/537.36`;
};

async function main() {
  await app.whenReady();
  const ua = uaLimpo();
  const ses = session.fromPartition('probe-cf');
  ses.setUserAgent(ua);
  logev('boot', { ua, electron: process.versions.electron, chrome: process.versions.chrome });

  win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  const wc = win.webContents;

  wc.on('did-navigate', (_e, url) => logev('navigate', { url: String(url).slice(0, 180) }));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) logev('fail', { code, desc, url: String(url).slice(0, 140) }); });
  wc.on('console-message', (...args) => {
    const a = args[1];
    if (a && typeof a === 'object' && a.message !== undefined) logev('console', { level: a.level, msg: String(a.message).slice(0, 220) });
    else logev('console', { level: args[1], msg: String(args[2] || '').slice(0, 220), src: String(args[4] || '').slice(0, 100) });
  });

  /* ---------- 1) WebGPU no ambiente ---------- */
  await win.loadURL('about:blank');
  const gpu = await wc.executeJavaScript(`(async () => {
    const r = { hasGPU: !!navigator.gpu, plugins: navigator.plugins.length,
                brands: navigator.userAgentData ? navigator.userAgentData.brands : null,
                webdriver: navigator.webdriver,
                idiomas: (navigator.languages || []).join(','),
                cores: navigator.hardwareConcurrency,
                memoria: navigator.deviceMemory || null,
                temWindowChrome: typeof window.chrome !== 'undefined' };
    if (navigator.gpu) {
      try {
        const a = await navigator.gpu.requestAdapter();
        r.adapter = a ? (a.info ? JSON.stringify(a.info) : 'adapter (sem info)') : null;
        if (a) { try { const d = await a.requestDevice(); r.device = d ? 'ok' : 'null'; } catch (e) { r.device = 'erro: ' + e.message; } }
      } catch (e) { r.adapter = 'erro: ' + e.message; }
    }
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      r.webgl = gl ? (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'presente') : null;
    } catch (e) { r.webgl = 'erro: ' + e.message; }
    return r;
  })()`, true).catch((e) => ({ erro: e.message }));
  logev('webgpu-probe', gpu);

  /* ---------- 2) ferramenta OFICIAL do Cloudflare ---------- */
  logev('fase', 'debug.challenges.cloudflare.com');
  try { await wc.loadURL('https://debug.challenges.cloudflare.com/', { userAgent: ua }); }
  catch (e) { logev('load-error', { msg: e.message }); }
  await new Promise((r) => setTimeout(r, 30000));
  const toolText = await wc.executeJavaScript(
    'document.body ? document.body.innerText.replace(/\\n{2,}/g, "\\n").slice(0, 3500) : ""', true
  ).catch(() => '(erro ao ler)');
  logev('tool-resultado', { texto: toolText });
  try {
    const img = await wc.capturePage();
    fs.writeFileSync('/home/z/my-project/probe-tool.png', img.toPNG());
    logev('screenshot', 'probe-tool.png salvo');
  } catch (e) { logev('screenshot-erro', { msg: e.message }); }

  const cookiesAteAqui = await ses.cookies.get({});
  logev('cookies', {
    cf: cookiesAteAqui
      .filter((c) => /^cf|^__cf/i.test(c.name))
      .map((c) => ({ name: c.name, domain: c.domain, part: c.partitionKey ? JSON.stringify(c.partitionKey) : null }))
  });

  /* ---------- 3) site com managed challenge (loop observado?) ---------- */
  const alvo = process.env.PROBE_URL || 'https://www.scrapingcourse.com/cloudflare-challenge/';
  logev('fase', alvo);
  const inicio = Date.now();
  let voltas = 0;
  const marca = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };
  const ultimo = new Map();
  const contaNavegacao = (_e, url) => {
    const chave = marca(url);
    ultimo.set(chave, (ultimo.get(chave) || 0) + 1);
    if (ultimo.get(chave) >= 2) voltas += 1;
    logev('nav', { url: String(url).slice(0, 150), repete: ultimo.get(chave) });
  };
  wc.on('did-navigate', contaNavegacao);

  try { await wc.loadURL(alvo, { userAgent: ua }); }
  catch (e) { logev('load-error', { msg: e.message }); }
  await new Promise((r) => setTimeout(r, 45000));

  const estadoFinal = await wc.executeJavaScript(
    'document.body ? { titulo: document.title, texto: document.body.innerText.replace(/\\n{2,}/g, "\\n").slice(0, 1200) } : {}', true
  ).catch(() => ({}));
  const cookiesFim = await ses.cookies.get({});
  const cfFim = cookiesFim.filter((c) => /^cf|^__cf/i.test(c.name))
    .map((c) => ({ name: c.name, domain: c.domain, part: c.partitionKey ? JSON.stringify(c.partitionKey) : null }));
  logev('fim-challenge', { segundos: Math.round((Date.now() - inicio) / 1000), voltas, cookies: cfFim, pagina: estadoFinal });
  try {
    const img2 = await wc.capturePage();
    fs.writeFileSync('/home/z/my-project/probe-challenge.png', img2.toPNG());
    logev('screenshot', 'probe-challenge.png salvo');
  } catch (e) { logev('screenshot-erro', { msg: e.message }); }

  fs.writeFileSync(OUT, JSON.stringify({ gpu, toolText, voltas, cfFim, estadoFinal, log }, null, 2));
  console.log('=== RELATÓRIO COMPLETO EM', OUT, '===');
  app.quit();
}

main().catch((e) => { console.error('PROBE ERRO:', e); app.quit(); });
