import { api, $, icon, escapeHtml, hostOf, faviconFor, initTheme, go } from './common.js';

const q = $('#q');

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada — a web é toda sua.';
  if (h < 12) return 'Bom dia! Por onde começamos?';
  if (h < 18) return 'Boa tarde! O que vamos explorar?';
  return 'Boa noite — navegue com calma.';
}

async function renderTiles() {
  const wrap = $('#tiles');
  let sites = [];
  try { sites = await api.topSites(); } catch { /* sem histórico ainda */ }

  const defaults = [
    { host: 'github.com', url: 'https://github.com', title: 'GitHub' },
    { host: 'wikipedia.org', url: 'https://pt.wikipedia.org', title: 'Wikipédia' },
    { host: 'youtube.com', url: 'https://youtube.com', title: 'YouTube' },
    { host: 'duckduckgo.com', url: 'https://duckduckgo.com', title: 'DuckDuckGo' },
    { host: 'developer.mozilla.org', url: 'https://developer.mozilla.org', title: 'MDN' },
    { host: 'news.ycombinator.com', url: 'https://news.ycombinator.com', title: 'Hacker News' }
  ];

  const list = (sites.length ? sites : defaults).slice(0, 12);

  wrap.innerHTML = list
    .map((s) => {
      const label = s.title || s.host || hostOf(s.url);
      const fav = faviconFor(s.url, s.favicon);
      const letter = (label || '?')[0].toUpperCase();
      return `<button class="tile" data-url="${escapeHtml(s.url)}" title="${escapeHtml(s.url)}">
        <span class="tile-ico">${fav ? `<img src="${escapeHtml(fav)}" alt="" onerror="this.replaceWith(document.createTextNode('${escapeHtml(letter)}'))" />` : escapeHtml(letter)}</span>
        <span class="tile-name">${escapeHtml(label)}</span>
      </button>`;
    })
    .join('');

  wrap.querySelectorAll('.tile').forEach((tile) => {
    tile.addEventListener('click', (e) => go(tile.dataset.url, e.ctrlKey || e.metaKey));
    tile.addEventListener('auxclick', (e) => {
      if (e.button === 1) { e.preventDefault(); go(tile.dataset.url, true); }
    });
  });
}

async function renderStats() {
  try {
    const [history, bookmarks] = await Promise.all([
      api.history.list({ limit: 1 }),
      api.bookmarks.list()
    ]);
    $('#st-sites').textContent = history.total.toLocaleString('pt-BR');
    $('#st-marks').textContent = bookmarks.length.toLocaleString('pt-BR');
    const blocked = Number(localStorage.getItem('calopsia:blocked') || 0);
    $('#st-blocked').textContent = blocked.toLocaleString('pt-BR');
  } catch {
    ['#st-sites', '#st-marks', '#st-blocked'].forEach((s) => { $(s).textContent = '0'; });
  }
}

function bind() {
  $('#search-ico').innerHTML = icon('search', 'icon');

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = q.value.trim();
    if (value) go(value);
  });

  document.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => go(b.dataset.go)));

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); }
  });
}

(async function init() {
  await initTheme();
  $('#greeting').textContent = greeting();
  bind();
  renderTiles();
  renderStats();
  q.focus();
})();
