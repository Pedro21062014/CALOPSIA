import { api, $, icon, escapeHtml, hostOf, faviconFor, dayLabel, initTheme, go, bindLinks } from './common.js';

let query = '';
let cache = { items: [], total: 0 };

function itemHtml(h) {
  const fav = faviconFor(h.url, h.favicon);
  const time = new Date(h.visitedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `<div class="list-item" data-url="${escapeHtml(h.url)}">
    <div class="li-fav">${fav ? `<img src="${escapeHtml(fav)}" alt="" onerror="this.remove()" />` : icon('globe', 'icon-sm')}</div>
    <div class="li-body">
      <div class="li-title">${escapeHtml(h.title || hostOf(h.url))}</div>
      <div class="li-url">${escapeHtml(h.url)}</div>
    </div>
    <div class="li-time">${time}</div>
    <button class="li-act" data-del="${escapeHtml(h.url)}" title="Remover do histórico">${icon('close', 'icon-sm')}</button>
  </div>`;
}

async function render() {
  const data = await api.history.list({ query, limit: 600 });
  cache = data;
  const root = $('#list');

  $('#subtitle').textContent = query
    ? `${data.total.toLocaleString('pt-BR')} resultado(s) para "${query}"`
    : `${data.total.toLocaleString('pt-BR')} página(s) no histórico deste dispositivo.`;

  if (!data.items.length) {
    root.innerHTML = `<div class="empty">${icon('history', 'icon')}
      <h3>${query ? 'Nada encontrado' : 'Histórico vazio'}</h3>
      <p>${query ? 'Tente outros termos de busca.' : 'As páginas que você visitar aparecerão aqui.'}</p></div>`;
    return;
  }

  // agrupa por dia
  const groups = [];
  let currentDay = null;
  for (const item of data.items) {
    const label = dayLabel(item.visitedAt);
    if (label !== currentDay) { groups.push({ label, items: [] }); currentDay = label; }
    groups[groups.length - 1].items.push(item);
  }

  root.innerHTML = groups
    .map((g) => `<div class="group-head">${escapeHtml(g.label)}</div>${g.items.map(itemHtml).join('')}`)
    .join('');

  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      await api.history.delete(b.dataset.del);
      render();
    };
  });
}

(async function init() {
  await initTheme();
  $('#search-ico').innerHTML = icon('search', 'icon-sm');
  bindLinks(document.body);

  let debounce;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(debounce);
    query = e.target.value.trim();
    debounce = setTimeout(render, 140);
  });

  $('#clear-all').onclick = async () => {
    await api.history.clear();
    render();
  };

  render();
})();
