import { api, $, icon, escapeHtml, hostOf, faviconFor, relativeTime, initTheme, bindLinks } from './common.js';

let items = [];
let query = '';

function itemHtml(b) {
  const fav = faviconFor(b.url, b.favicon);
  return `<div class="list-item" data-url="${escapeHtml(b.url)}">
    <div class="li-fav">${fav ? `<img src="${escapeHtml(fav)}" alt="" onerror="this.remove()" />` : icon('globe', 'icon-sm')}</div>
    <div class="li-body">
      <div class="li-title">${escapeHtml(b.title || hostOf(b.url))}</div>
      <div class="li-url">${escapeHtml(b.url)}</div>
    </div>
    <div class="li-time">${escapeHtml(relativeTime(b.createdAt || Date.now()))}</div>
    <button class="li-act" data-edit="${escapeHtml(b.id)}" title="Renomear">${icon('settings', 'icon-sm')}</button>
    <button class="li-act" data-del="${escapeHtml(b.id)}" title="Remover">${icon('trash', 'icon-sm')}</button>
  </div>`;
}

function render() {
  const q = query.toLowerCase();
  const filtered = q
    ? items.filter((b) => b.url.toLowerCase().includes(q) || (b.title || '').toLowerCase().includes(q))
    : items;

  $('#subtitle').textContent = `${items.length.toLocaleString('pt-BR')} favorito(s) salvo(s).`;
  const root = $('#list');

  if (!filtered.length) {
    root.innerHTML = `<div class="empty">${icon('star', 'icon')}
      <h3>${query ? 'Nada encontrado' : 'Nenhum favorito ainda'}</h3>
      <p>${query ? 'Tente outros termos.' : 'Use a estrela ★ na barra de endereço para salvar páginas.'}</p></div>`;
    return;
  }

  root.innerHTML = filtered.map(itemHtml).join('');

  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      items = await api.bookmarks.remove(b.dataset.del);
      render();
    };
  });

  root.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const current = items.find((x) => x.id === b.dataset.edit);
      const title = prompt('Novo nome para o favorito:', current?.title || '');
      if (title === null) return;
      items = await api.bookmarks.update({ id: b.dataset.edit, title: title.trim() || current.title });
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
    debounce = setTimeout(render, 120);
  });

  items = await api.bookmarks.list();
  api.on('bookmarks:changed', (next) => { items = next; render(); });
  render();
})();
