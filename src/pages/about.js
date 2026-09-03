import { api, $, icon, escapeHtml, initTheme } from './common.js';

const FEATURES = [
  ['shield', 'Bloqueio integrado', 'Anúncios e rastreadores conhecidos são barrados antes mesmo de a requisição sair do seu computador.'],
  ['lock', 'HTTPS por padrão', 'Conexões inseguras são promovidas automaticamente sempre que o site oferecer suporte.'],
  ['search', 'Omnibox inteligente', 'Histórico, favoritos e sugestões do buscador reunidos em um único campo.'],
  ['palette', 'Interface adaptável', 'Tema claro, escuro ou automático, com cor de destaque personalizável.'],
  ['folder', 'Sessões persistentes', 'Feche o navegador sem medo: suas abas voltam exatamente como estavam.'],
  ['globe', 'Multiplataforma', 'O mesmo Calopsia no Windows, macOS e Linux, com instaladores nativos.']
];

(async function init() {
  await initTheme();
  const info = await api.info();

  $('#version').textContent = `Versão ${info.version} · ${info.platform} ${info.arch}`;

  $('#chips').innerHTML = [
    `Chromium ${info.chrome}`,
    `Electron ${info.electron}`,
    `Node ${info.node}`
  ].map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join('');

  $('#features').innerHTML = FEATURES
    .map(([ico, title, desc]) => `<div class="feature">
      ${icon(ico, 'icon')}
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(desc)}</p>
    </div>`)
    .join('');

  $('#sys-title').innerHTML = `${icon('info', 'icon-sm')} Componentes`;

  $('#components').innerHTML = [
    ['Motor de renderização', `Blink · Chromium ${info.chrome}`],
    ['Motor JavaScript', `V8 ${info.v8}`],
    ['Runtime', `Electron ${info.electron} · Node.js ${info.node}`],
    ['Idioma da interface', info.locale],
    ['Pasta do perfil', info.userData],
    ['Pasta de downloads', info.downloads]
  ].map(([k, v]) => `<div class="row">
      <div class="row-main"><div class="row-label">${escapeHtml(k)}</div></div>
      <div class="row-control" style="color:var(--text-dim);font-size:12.5px;max-width:60%;word-break:break-all;text-align:right">${escapeHtml(String(v))}</div>
    </div>`).join('');
})();
