'use strict';
/* ============================================================
   Probe A/B de flags gráficas — qual combo passa na tool OFICIAL?
   ------------------------------------------------------------
   Uso:  CF_FLAGS=a|b|c|d DISPLAY=:99 electron scripts/probe-flags.js --no-sandbox

   Combos:
     a = atual v0.5.5: disable-features + Vulkan(Linux) + unsafe-webgpu + unsafe-swiftshader
     b = sem Vulkan:   disable-features + unsafe-webgpu + unsafe-swiftshader
     c = b + use-angle=swiftshader (ANGLE/SwiftShader explícito)
     d = b + use-gl=angle + use-angle=gl (ANGLE sobre GL)
     e = v0.5.6 proposto: disable-features + Vulkan(Linux) + unsafe-swiftshader (SEM unsafe-webgpu)
     f = e sem Vulkan: disable-features + unsafe-swiftshader (SEM unsafe-webgpu, sem Vulkan)
   ============================================================ */
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');

const COMBO = (process.env.CF_FLAGS || 'a').toLowerCase();
if (COMBO !== 'a') {
  // o combo "a" (atual) é replicado abaixo também, para clareza
}
try {
  const base = ['MediaRouter', 'ThirdPartyStoragePartitioning', 'PartitionedCookies'];
  app.commandLine.appendSwitch('disable-features', base.join(','));
  if ((COMBO === 'a' || COMBO === 'e') && process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'Vulkan');
  }
  // combos e/f NÃO adicionam enable-unsafe-webgpu (adapter WebGPU fica nativo)
  if (COMBO !== 'e' && COMBO !== 'f') app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  if (COMBO === 'c') app.commandLine.appendSwitch('use-angle', 'swiftshader');
  if (COMBO === 'd') {
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'gl');
  }
} catch { /* ignora */ }

const OUT = `/home/z/my-project/probe-flags-${COMBO}.json`;
const log = [];
function logev(ev, data) {
  const e = { t: Date.now(), ev, data };
  log.push(e);
  console.log('[' + new Date(e.t).toISOString().slice(11, 23) + ']', ev, JSON.stringify(data).slice(0, 400));
}

const uaLimpo = () => {
  const padrao = app.userAgent || '';
  const limpo = padrao
    .replace(new RegExp('\\s+Electron/[\\d.]+', 'gi'), '')
    .replace(/\s{2,}/g, ' ').trim();
  if (/Chrome\/[\d.]+/.test(limpo)) return limpo;
  /* fallback: app.userAgent veio vazio (Electron 44 no boot) — constrói o UA
     EXATAMENTE como o Chrome real: versão REDUZIDA X.0.0.0 (o Chrome corta
     build/patch do UA desde a redução de versão) */
  const maior = String(process.versions.chrome || '152').split('.')[0];
  const plataforma = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${plataforma}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${maior}.0.0.0 Safari/537.36`;
};

async function main() {
  await app.whenReady();
  const ua = uaLimpo();
  const ses = session.fromPartition('probe-flags-' + COMBO);
  ses.setUserAgent(ua);
  logev('boot', {
    combo: COMBO, ua,
    electron: process.versions.electron, chrome: process.versions.chrome
  });

  const win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  const wc = win.webContents;
  wc.on('console-message', (...args) => {
    const a = args[1];
    const msg = a && typeof a === 'object' ? a.message : String(args[2] || '');
    if (/Success|success|ISSUE|Issue|challenge|Turnstile/i.test(msg)) {
      logev('console', { msg: String(msg).slice(0, 200) });
    }
  });

  /* --- tool OFICIAL --- */
  logev('fase', 'debug.challenges.cloudflare.com');
  try { await wc.loadURL('https://debug.challenges.cloudflare.com/', { userAgent: ua }); }
  catch (e) { logev('load-error', { msg: e.message }); }
  await new Promise((r) => setTimeout(r, 30000));

  const toolText = await wc.executeJavaScript(
    'document.body ? document.body.innerText.replace(/\\n{2,}/g, "\\n").slice(0, 3000) : ""', true
  ).catch(() => '(erro ao ler)');

  /* --- fingerprint gráfico medido DENTRO da página HTTPS da tool --- */
  const fp = await wc.executeJavaScript(`(async () => {
    const r = {};
    r.hasGPU = !!navigator.gpu;
    r.brands = navigator.userAgentData ? navigator.userAgentData.brands : null;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      r.webglRenderer = gl && dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
      r.webglVendor = gl && dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null;
    } catch (e) { r.webglRenderer = 'erro: ' + e.message; }
    if (navigator.gpu) {
      try {
        const a = await navigator.gpu.requestAdapter();
        r.gpuAdapter = a ? JSON.stringify(a.info || {}) : null;
      } catch (e) { r.gpuAdapter = 'erro: ' + e.message; }
    }
    return r;
  })()`, true).catch((e) => ({ erro: e.message }));

  const veredito = /ISSUE FOUND/i.test(toolText)
    ? (toolText.match(/ISSUE FOUND[\s\S]{0,200}/) || ['ISSUE FOUND'])[0]
    : /Success|SUCCESS/i.test(toolText) ? 'SUCCESS' : 'INDETERMINADO';
  logev('veredito', { combo: COMBO, veredito });
  logev('fingerprint', fp);

  try {
    const img = await wc.capturePage();
    fs.writeFileSync(`/home/z/my-project/probe-flags-${COMBO}.png`, img.toPNG());
  } catch { /* sem screenshot */ }

  fs.writeFileSync(OUT, JSON.stringify({ combo: COMBO, veredito, fp, toolText, log }, null, 2));
  console.log('=== COMBO', COMBO.toUpperCase(), 'VEREDITO:', veredito, '===');
  app.quit();
}

main().catch((e) => { console.error('PROBE ERRO:', e); app.quit(); });
