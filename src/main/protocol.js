'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { protocol, net } = require('electron');
const { PATHS, SCHEME, INTERNAL_PAGES } = require('./constants');

/**
 * Registra o esquema `calopsia://` como privilegiado.
 * Deve ser chamado ANTES de app.whenReady().
 */
function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
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
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/** Impede path traversal para fora dos diretórios permitidos. */
function safeResolve(baseDir, relative) {
  const resolved = path.resolve(baseDir, '.' + path.sep + relative.replace(/^[/\\]+/, ''));
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) {
    return null;
  }
  return resolved;
}

function fileResponse(filePath) {
  try {
    const body = fs.readFileSync(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff'
      }
    });
  } catch {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
}

/**
 * Registra o handler do protocolo em uma sessão.
 *
 * Atenção: `protocol.handle` global só cobre a sessão padrão. Como cada
 * janela usa uma partição própria (`persist:calopsia`, `calopsia-private-N`),
 * o handler precisa ser registrado em cada uma delas — caso contrário
 * `calopsia://newtab` falha com ERR_FAILED dentro das abas.
 *
 * @param {Electron.Session} [ses] sessão alvo; padrão: sessão padrão
 */
function registerProtocolHandler(ses) {
  const target = ses ? ses.protocol : protocol;
  if (target.isProtocolHandled?.(SCHEME)) return;

  target.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    const host = url.hostname || 'newtab';
    const pathname = decodeURIComponent(url.pathname || '/');

    // Assets compartilhados: calopsia://assets/logo.svg
    if (host === 'assets') {
      const target = safeResolve(PATHS.ASSETS, pathname);
      if (!target) return new Response('Forbidden', { status: 403 });
      return fileResponse(target);
    }

    // Recursos irmãos de uma página interna (css/js): calopsia://settings/app.css
    if (pathname !== '/' && pathname !== '') {
      const target = safeResolve(PATHS.PAGES, pathname);
      if (target && fs.existsSync(target)) return fileResponse(target);
    }

    // Páginas internas: calopsia://newtab, calopsia://settings, ...
    const page = INTERNAL_PAGES[host];
    if (page) return fileResponse(path.join(PATHS.PAGES, page));

    return fileResponse(path.join(PATHS.PAGES, INTERNAL_PAGES.newtab));
  });
}

/** true se a URL for uma página interna do navegador. */
function isInternalUrl(url = '') {
  return typeof url === 'string' && url.startsWith(`${SCHEME}://`);
}

module.exports = { registerSchemes, registerProtocolHandler, isInternalUrl };
