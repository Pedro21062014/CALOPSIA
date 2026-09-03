import { api, $, icon, escapeHtml, hostOf, formatBytes, relativeTime, dayLabel, initTheme } from './common.js';

let items = [];
let query = '';

const STATE_LABEL = {
  completed: 'Concluído',
  cancelled: 'Cancelado',
  interrupted: 'Interrompido',
  progressing: 'Baixando'
};

function itemHtml(d) {
  const pct = d.totalBytes ? Math.min(100, (d.receivedBytes / d.totalBytes) * 100) : 0;
  const done = d.state === 'completed';
  const failed = d.state === 'cancelled' || d.state === 'interrupted';
  const sub = done
    ? `${formatBytes(d.receivedBytes)} · ${hostOf(d.url)}`
    : failed
      ? `${STATE_LABEL[d.state]} · ${hostOf(d.url)}`
      : `${formatBytes(d.receivedBytes)} de ${formatBytes(d.totalBytes)}`;

  return `<div class="list-item" data-id="${escapeHtml(d.id)}">
    <div class="li-fav" style="color:${done ? 'var(--success)' : failed ? 'var(--danger)' : 'var(--accent)'}">
      ${icon(done ? 'check' : failed ? 'close' : 'download', 'icon-sm')}
    </div>
    <div class="li-body" data-open="${escapeHtml(d.id)}">
      <div class="li-title">${escapeHtml(d.filename)}</div>
      <div class="li-url">${escapeHtml(sub)}</div>
      ${done || failed ? '' : `<div style="height:3px;border-radius:2px;background:var(--surface-3);margin-top:7px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--accent);border-radius:2px"></div></div>`}
    </div>
    <div class="li-time">${escapeHtml(relativeTime(d.finishedAt || d.startedAt))}</div>
    ${done ? `<button class="li-act" data-show="${escapeHtml(d.id)}" title="Mostrar na pasta">${icon('folder', 'icon-sm')}</button>` : ''}
    <button class="li-act" data-del="${escapeHtml(d.id)}" title="Remover da lista">${icon('close', 'icon-sm')}</button>
  </div>`;
}

function render() {
  const q = query.toLowerCase();
  const filtered = q ? items.filter((d) => d.filename.toLowerCase().includes(q) || d.url.toLowerCase().includes(q)) : items;

  $('#subtitle').textContent = `${items.length.toLocaleString('pt-BR')} arquivo(s) na lista.`;
  const root = $('#list');

  if (!filtered.length) {
    root.innerHTML = `<div class="empty">${icon('download', 'icon')}
      <h3>${query ? 'Nada encontrado' : 'Nenhum download'}</h3>
      <p>${query ? 'Tente outros termos.' : 'Os arquivos que você baixar aparecerão aqui.'}</p></div>`;
    return;
  }

  const groups = [];
  let currentDay = null;
  for (const d of filtered) {
    const label = dayLabel(d.finishedAt || d.startedAt);
    if (label !== currentDay) { groups.push({ label, items: [] }); currentDay = label; }
    groups[groups.length - 1].items.push(d);
  }

  root.innerHTML = groups
    .map((g) => `<div class="group-head">${escapeHtml(g.label)}</div>${g.items.map(itemHtml).join('')}`)
    .join('');

  root.querySelectorAll('[data-open]').forEach((n) => { n.onclick = () => api.downloads.open(n.dataset.open); });
  root.querySelectorAll('[data-show]').forEach((n) => {
    n.onclick = (e) => { e.stopPropagation(); api.downloads.show(n.dataset.show); };
  });
  root.querySelectorAll('[data-del]').forEach((n) => {
    n.onclick = async (e) => { e.stopPropagation(); items = await api.downloads.remove(n.dataset.del); render(); };
  });
}

(async function init() {
  await initTheme();
  $('#search-ico').innerHTML = icon('search', 'icon-sm');

  let debounce;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(debounce);
    query = e.target.value.trim();
    debounce = setTimeout(render, 120);
  });

  $('#clear-all').onclick = async () => { items = await api.downloads.clear(); render(); };

  items = await api.downloads.list();
  render();

  const refresh = async () => { items = await api.downloads.list(); render(); };
  api.on('download:updated', refresh);
  api.on('download:done', refresh);
})();
