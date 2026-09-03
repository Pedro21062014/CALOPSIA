/* =========================================================================
   Calopsia — controlador da interface
   ========================================================================= */

const api = window.calopsia;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  tabs: [],
  activeTabId: null,
  settings: {},
  bookmarks: [],
  downloads: [],
  platform: 'linux',
  incognito: false,
  maximized: false,
  zoom: 1,
  omniboxDirty: false,
  suggestions: [],
  sugIndex: -1,
  openPopover: null,
  findVisible: false,
  info: null
};

const el = {
  body: document.body,
  tabs: $('#tabs'),
  tabsScroll: $('#tabs-scroll'),
  urlInput: $('#url-input'),
  omnibox: $('#omnibox'),
  siteInfo: $('#site-info'),
  siteIcon: $('#site-icon'),
  back: $('#btn-back'),
  forward: $('#btn-forward'),
  reload: $('#btn-reload'),
  home: $('#btn-home'),
  bookmark: $('#btn-bookmark'),
  bookmarkIcon: $('#bookmark-icon'),
  shield: $('#btn-shield'),
  shieldCount: $('#shield-count'),
  downloads: $('#btn-downloads'),
  downloadDot: $('#download-dot'),
  menu: $('#btn-menu'),
  bmBar: $('#bookmarks-bar'),
  bmItems: $('#bm-items'),
  overlay: $('#overlay'),
  scrim: $('#scrim'),
  suggestions: $('#suggestions'),
  mainMenu: $('#main-menu'),
  dlPanel: $('#downloads-panel'),
  dlList: $('#dl-list'),
  shieldPanel: $('#shield-panel'),
  sitePanel: $('#site-panel'),
  findbar: $('#findbar'),
  findInput: $('#find-input'),
  findCount: $('#find-count'),
  progress: $('#progress'),
  status: $('#status-bubble'),
  zoomValue: $('#zoom-value')
};

const svg = (id, cls = 'icon-sm') =>
  `<svg class="${cls}"><use href="#${id}"/></svg>`;

const activeTab = () => state.tabs.find((t) => t.id === state.activeTabId) || null;

/* =========================================================================
   Utilidades
   ========================================================================= */

function prettyUrl(url = '') {
  if (url.startsWith('calopsia://')) {
    const page = url.replace('calopsia://', '').split(/[?#]/)[0];
    return page === 'newtab' ? '' : `calopsia://${page}`;
  }
  return url;
}

function hostOf(url = '') {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function formatBytes(n = 0) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function highlight(text, query) {
  const t = escapeHtml(text);
  if (!query) return t;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return t;
  return `${escapeHtml(text.slice(0, i))}<b>${escapeHtml(text.slice(i, i + query.length))}</b>${escapeHtml(text.slice(i + query.length))}`;
}

/* =========================================================================
   Abas
   ========================================================================= */

function renderTabs() {
  const frag = document.createDocumentFragment();

  for (const tab of state.tabs) {
    const node = document.createElement('div');
    node.className = 'tab';
    node.dataset.id = tab.id;
    node.draggable = true;
    if (tab.id === state.activeTabId) node.classList.add('active');
    if (tab.pinned) node.classList.add('pinned');
    node.title = tab.title || tab.url;

    // favicon / spinner
    const fav = document.createElement('div');
    fav.className = 'tab-fav';
    if (tab.loading) {
      fav.innerHTML = '<div class="tab-spinner"></div>';
    } else if (tab.favicon) {
      const img = document.createElement('img');
      img.src = tab.favicon;
      img.onerror = () => { fav.innerHTML = svg('i-globe', 'icon-sm'); };
      fav.appendChild(img);
    } else {
      fav.innerHTML = svg(tab.internal ? 'i-globe' : 'i-globe', 'icon-sm');
    }
    node.appendChild(fav);

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || prettyUrl(tab.url) || 'Nova aba';
    node.appendChild(title);

    if (tab.audible || tab.muted) {
      const audio = document.createElement('button');
      audio.className = 'tab-audio';
      audio.innerHTML = svg(tab.muted ? 'i-mute' : 'i-volume');
      audio.title = tab.muted ? 'Reativar som' : 'Silenciar aba';
      audio.onclick = (e) => { e.stopPropagation(); api.tabs.mute(tab.id); };
      node.appendChild(audio);
    }

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.innerHTML = svg('i-close');
    close.title = 'Fechar aba';
    close.onclick = (e) => { e.stopPropagation(); api.tabs.close(tab.id); };
    node.appendChild(close);

    node.addEventListener('mousedown', (e) => {
      if (e.button === 0) api.tabs.activate(tab.id);
      if (e.button === 1) { e.preventDefault(); api.tabs.close(tab.id); }
    });
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      api.tabs.contextMenu(tab.id, e.clientX, e.clientY);
    });
    node.addEventListener('dblclick', () => api.tabs.pin(tab.id));

    frag.appendChild(node);
  }

  el.tabs.replaceChildren(frag);
  setupTabDrag();
}

/** Reordenação de abas por arrastar-e-soltar. */
function setupTabDrag() {
  let draggedId = null;

  el.tabs.querySelectorAll('.tab').forEach((node) => {
    node.addEventListener('dragstart', (e) => {
      draggedId = Number(node.dataset.id);
      node.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(draggedId));
    });

    node.addEventListener('dragend', () => {
      node.classList.remove('dragging');
      el.tabs.querySelectorAll('.tab').forEach((n) => n.classList.remove('drop-left', 'drop-right'));
      draggedId = null;
    });

    node.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      node.classList.toggle('drop-right', after);
      node.classList.toggle('drop-left', !after);
    });

    node.addEventListener('dragleave', () => node.classList.remove('drop-left', 'drop-right'));

    node.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = Number(e.dataTransfer.getData('text/plain')) || draggedId;
      if (!id) return;
      const rect = node.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      let index = state.tabs.findIndex((t) => t.id === Number(node.dataset.id));
      if (after) index += 1;
      const from = state.tabs.findIndex((t) => t.id === id);
      if (from < index) index -= 1;
      api.tabs.move(id, Math.max(0, index));
      node.classList.remove('drop-left', 'drop-right');
    });
  });
}

/* =========================================================================
   Barra de ferramentas / omnibox
   ========================================================================= */

function renderToolbar() {
  const tab = activeTab();
  el.back.disabled = !tab?.canGoBack;
  el.forward.disabled = !tab?.canGoForward;

  el.reload.innerHTML = svg(tab?.loading ? 'i-stop' : 'i-reload', 'icon');
  el.reload.title = tab?.loading ? 'Parar (Esc)' : 'Recarregar (Ctrl+R)';
  el.progress.hidden = !tab?.loading;

  if (!state.omniboxDirty && document.activeElement !== el.urlInput) {
    el.urlInput.value = prettyUrl(tab?.url || '');
  }

  // Indicador de segurança
  const url = tab?.url || '';
  el.siteInfo.classList.remove('secure', 'insecure', 'internal');
  let icon = 'i-search';
  if (url.startsWith('https://')) { icon = 'i-lock'; el.siteInfo.classList.add('secure'); }
  else if (url.startsWith('http://')) { icon = 'i-unlock'; el.siteInfo.classList.add('insecure'); }
  else if (url.startsWith('calopsia://')) { icon = 'i-settings'; el.siteInfo.classList.add('internal'); }
  else if (url.startsWith('file://')) icon = 'i-folder';
  el.siteIcon.innerHTML = `<use href="#${icon}"/>`;

  // Favorito
  const isBookmarked = !!tab && state.bookmarks.some((b) => b.url === tab.url);
  el.bookmarkIcon.innerHTML = `<use href="#${isBookmarked ? 'i-star-fill' : 'i-star'}"/>`;
  el.bookmark.classList.toggle('active', isBookmarked);
  el.bookmark.title = isBookmarked ? 'Remover dos favoritos' : 'Adicionar aos favoritos (Ctrl+D)';

  // Escudo
  const blocked = tab?.blocked || 0;
  el.shieldCount.textContent = blocked > 99 ? '99+' : String(blocked);
  el.shieldCount.hidden = blocked === 0;
  el.shield.classList.toggle('active', blocked > 0);

  document.title = tab ? `${tab.title} — Calopsia` : 'Calopsia';
}

function focusOmnibox(selectAll = true) {
  el.urlInput.focus();
  if (selectAll) el.urlInput.select();
}

let suggestTimer = null;
function onOmniboxInput() {
  state.omniboxDirty = true;
  const query = el.urlInput.value.trim();
  clearTimeout(suggestTimer);
  if (!query) { closePopover(); return; }
  suggestTimer = setTimeout(async () => {
    const results = await api.omnibox.suggest(query);
    if (document.activeElement !== el.urlInput) return;
    state.suggestions = results || [];
    state.sugIndex = -1;
    renderSuggestions(query);
  }, 90);
}

function renderSuggestions(query) {
  if (!state.suggestions.length) { closePopover(); return; }

  const kindLabel = { url: 'Endereço', history: 'Histórico', bookmark: 'Favorito', search: 'Busca' };
  const kindIcon = { url: 'i-globe', history: 'i-history', bookmark: 'i-star', search: 'i-search' };

  el.suggestions.innerHTML = state.suggestions
    .map((s, i) => {
      const ico = s.favicon
        ? `<img src="${escapeHtml(s.favicon)}" alt="" />`
        : svg(kindIcon[s.type] || 'i-search');
      const showUrl = s.type !== 'search' && s.url;
      return `<div class="sug${i === state.sugIndex ? ' sel' : ''}" data-i="${i}" role="option">
        <div class="sug-ico">${ico}</div>
        <div class="sug-txt">${highlight(s.title || s.text, query)}</div>
        ${showUrl ? `<div class="sug-url">${escapeHtml(s.url)}</div>` : ''}
        <div class="sug-kind">${kindLabel[s.type] || ''}</div>
      </div>`;
    })
    .join('');

  el.suggestions.querySelectorAll('.sug').forEach((node) => {
    node.addEventListener('mouseenter', () => {
      state.sugIndex = Number(node.dataset.i);
      el.suggestions.querySelectorAll('.sug').forEach((n) => n.classList.remove('sel'));
      node.classList.add('sel');
    });
    node.addEventListener('mousedown', (e) => {
      e.preventDefault();
      commitSuggestion(Number(node.dataset.i));
    });
  });

  const rect = el.omnibox.getBoundingClientRect();
  openPopover(el.suggestions, { left: rect.left, top: rect.bottom + 6, width: rect.width }, false);
}

function commitSuggestion(index) {
  const s = state.suggestions[index];
  if (!s) return;
  navigateTo(s.url);
}

function navigateTo(input) {
  const tab = activeTab();
  closePopover();
  state.omniboxDirty = false;
  el.urlInput.blur();
  if (tab) api.tabs.navigate(tab.id, input);
  else api.tabs.create({ url: input, active: true });
  api.tabs.focus(tab?.id);
}

function onOmniboxKey(e) {
  const max = state.suggestions.length - 1;

  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey && state.suggestions.length)) {
    e.preventDefault();
    state.sugIndex = state.sugIndex >= max ? 0 : state.sugIndex + 1;
    renderSuggestions(el.urlInput.value.trim());
    return;
  }
  if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey && state.suggestions.length)) {
    e.preventDefault();
    state.sugIndex = state.sugIndex <= 0 ? max : state.sugIndex - 1;
    renderSuggestions(el.urlInput.value.trim());
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (state.sugIndex >= 0) commitSuggestion(state.sugIndex);
    else navigateTo(el.urlInput.value.trim());
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    state.omniboxDirty = false;
    closePopover();
    renderToolbar();
    el.urlInput.blur();
    api.tabs.focus(state.activeTabId);
  }
}

/* =========================================================================
   Popovers e camada de sobreposição
   ========================================================================= */

function openPopover(node, pos, exclusive = true) {
  if (exclusive) {
    $$('.popover').forEach((p) => { if (p !== node) p.hidden = true; });
  }
  el.overlay.hidden = false;
  api.window.setOverlay(true);

  node.hidden = false;
  node.style.left = `${Math.round(pos.left)}px`;
  node.style.top = `${Math.round(pos.top)}px`;
  if (pos.width) node.style.width = `${Math.round(pos.width)}px`;
  if (pos.right !== undefined) { node.style.left = 'auto'; node.style.right = `${Math.round(pos.right)}px`; }

  state.openPopover = node.id;
}

/** Ancora um popover ao canto direito de um botão da toolbar. */
function anchorRight(node, button) {
  const rect = button.getBoundingClientRect();
  openPopover(node, { right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 6 });
}

function closePopover() {
  if (!state.openPopover) {
    el.overlay.hidden = true;
    return;
  }
  $$('.popover').forEach((p) => { p.hidden = true; });
  el.overlay.hidden = true;
  state.openPopover = null;
  api.window.setOverlay(false);
}

function togglePopover(node, anchor) {
  if (state.openPopover === node.id) { closePopover(); return; }
  anchorRight(node, anchor);
}

/* =========================================================================
   Favoritos
   ========================================================================= */

function renderBookmarksBar() {
  const show = state.settings.showBookmarksBar && !state.incognito;
  el.bmBar.hidden = !show;
  if (!show) return;

  if (!state.bookmarks.length) {
    el.bmItems.innerHTML = '<span class="bm-empty">Seus favoritos aparecerão aqui — use ★ na barra de endereço.</span>';
    return;
  }

  el.bmItems.innerHTML = state.bookmarks
    .slice(0, 40)
    .map((b) => {
      const ico = b.favicon ? `<img src="${escapeHtml(b.favicon)}" alt="" />` : svg('i-globe');
      return `<button class="bm-item" data-id="${escapeHtml(b.id)}" data-url="${escapeHtml(b.url)}" title="${escapeHtml(b.title)}\n${escapeHtml(b.url)}">
        ${ico}<span>${escapeHtml(b.title || hostOf(b.url))}</span>
      </button>`;
    })
    .join('');

  el.bmItems.querySelectorAll('.bm-item').forEach((node) => {
    node.addEventListener('click', (e) => {
      const url = node.dataset.url;
      if (e.ctrlKey || e.metaKey || e.button === 1) api.tabs.create({ url, active: false });
      else navigateTo(url);
    });
    node.addEventListener('auxclick', (e) => {
      if (e.button === 1) { e.preventDefault(); api.tabs.create({ url: node.dataset.url, active: false }); }
    });
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      api.bookmarks.contextMenu({ id: node.dataset.id, url: node.dataset.url, x: e.clientX, y: e.clientY });
    });
  });
}

async function toggleBookmark() {
  const tab = activeTab();
  if (!tab || tab.internal) return;
  const res = await api.bookmarks.toggle({ url: tab.url, title: tab.title, favicon: tab.favicon });
  state.bookmarks = res.items;
  renderToolbar();
  renderBookmarksBar();
}

/* =========================================================================
   Downloads
   ========================================================================= */

function renderDownloads() {
  if (!state.downloads.length) {
    el.dlList.innerHTML = `<div class="empty-state">${svg('i-download', 'icon')}<div>Nenhum download ainda.</div></div>`;
    return;
  }

  el.dlList.innerHTML = state.downloads
    .slice(0, 20)
    .map((d) => {
      const pct = d.totalBytes ? Math.min(100, (d.receivedBytes / d.totalBytes) * 100) : 0;
      const done = d.state === 'completed';
      const failed = d.state === 'cancelled' || d.state === 'interrupted';
      const sub = done
        ? formatBytes(d.receivedBytes)
        : failed
          ? (d.state === 'cancelled' ? 'Cancelado' : 'Interrompido')
          : `${formatBytes(d.receivedBytes)} de ${formatBytes(d.totalBytes)}`;
      return `<div class="dl-item" data-id="${escapeHtml(d.id)}">
        <div class="dl-ico">${svg('i-download', 'icon')}</div>
        <div class="dl-meta">
          <div class="dl-name">${escapeHtml(d.filename)}</div>
          <div class="dl-sub">${sub} · ${escapeHtml(hostOf(d.url))}</div>
          ${done || failed ? '' : `<div class="dl-track"><div class="dl-fill" style="width:${pct}%"></div></div>`}
        </div>
        <button class="dl-act" data-act="${done ? 'show' : 'cancel'}" title="${done ? 'Mostrar na pasta' : 'Cancelar'}">
          ${svg(done ? 'i-folder' : 'i-close')}
        </button>
      </div>`;
    })
    .join('');

  el.dlList.querySelectorAll('.dl-item').forEach((node) => {
    const id = node.dataset.id;
    node.addEventListener('click', (e) => {
      if (e.target.closest('.dl-act')) return;
      api.downloads.open(id);
    });
    node.querySelector('.dl-act')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = e.currentTarget.dataset.act;
      if (act === 'show') api.downloads.show(id);
      else api.downloads.cancel(id);
    });
  });
}

function upsertDownload(record) {
  const i = state.downloads.findIndex((d) => d.id === record.id);
  if (i >= 0) state.downloads[i] = record;
  else state.downloads.unshift(record);
  el.downloadDot.hidden = !state.downloads.some((d) => d.state === 'progressing');
  if (state.openPopover === 'downloads-panel') renderDownloads();
}

/* =========================================================================
   Localizar na página
   ========================================================================= */

function showFind(show) {
  state.findVisible = show;
  el.findbar.hidden = !show;
  api.window.setExtraChromeHeight(show ? 44 : 0);
  if (show) {
    el.findInput.focus();
    el.findInput.select();
    if (el.findInput.value) api.find.start(el.findInput.value);
  } else {
    api.find.stop();
    el.findCount.textContent = '0/0';
    api.tabs.focus(state.activeTabId);
  }
}

/* =========================================================================
   Painéis
   ========================================================================= */

function openShieldPanel() {
  const tab = activeTab();
  $('#shield-host').textContent = hostOf(tab?.url || '') || '—';
  $('#shield-blocked').textContent = String(tab?.blocked || 0);
  $('#sw-adblock').checked = !!state.settings.adBlockEnabled;
  $('#sw-trackers').checked = !!state.settings.blockTrackers;
  $('#sw-https').checked = !!state.settings.httpsOnly;
  togglePopover(el.shieldPanel, el.shield);
}

function openSitePanel() {
  const tab = activeTab();
  const url = tab?.url || '';
  const secure = url.startsWith('https://');
  const internal = url.startsWith('calopsia://');
  $('#site-panel-icon').innerHTML = `<use href="#${internal ? 'i-settings' : secure ? 'i-lock' : 'i-unlock'}"/>`;
  $('#site-panel-title').textContent = internal
    ? 'Página do Calopsia'
    : secure ? 'Conexão segura' : 'Conexão não segura';
  $('#site-panel-host').textContent = hostOf(url) || prettyUrl(url) || '—';
  $('#site-panel-desc').textContent = internal
    ? 'Esta é uma página interna do navegador, servida localmente.'
    : secure
      ? 'Suas informações (senhas, cartões) são criptografadas antes de sair deste dispositivo.'
      : 'Não envie informações sensíveis: os dados trafegam sem criptografia.';

  const rect = el.siteInfo.getBoundingClientRect();
  openPopover(el.sitePanel, { left: rect.left - 6, top: rect.bottom + 8 });
}

function openMainMenu() {
  el.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  togglePopover(el.mainMenu, el.menu);
}

async function openDownloadsPanel() {
  state.downloads = await api.downloads.list();
  renderDownloads();
  togglePopover(el.dlPanel, el.downloads);
}

/* =========================================================================
   Ações do menu
   ========================================================================= */

const actions = {
  'new-tab': () => api.tabs.create({ active: true }),
  'new-window': () => api.window.newWindow(),
  'new-private': () => api.window.newPrivate(),
  'zoom-in': () => api.zoom.in(),
  'zoom-out': () => api.zoom.out(),
  'zoom-reset': () => api.zoom.reset(),
  fullscreen: () => api.window.fullscreen(),
  bookmarks: () => api.tabs.create({ url: 'calopsia://bookmarks', active: true }),
  history: () => api.tabs.create({ url: 'calopsia://history', active: true }),
  downloads: () => api.tabs.create({ url: 'calopsia://downloads', active: true }),
  settings: () => api.tabs.create({ url: 'calopsia://settings', active: true }),
  about: () => api.tabs.create({ url: 'calopsia://about', active: true }),
  find: () => showFind(true),
  print: () => api.tabs.print(state.activeTabId),
  devtools: () => api.tabs.devtools(state.activeTabId)
};

function runAction(name) {
  const fn = actions[name];
  if (!fn) return;
  closePopover();
  fn();
}

/* =========================================================================
   Ligações de eventos
   ========================================================================= */

function bindUI() {
  // navegação
  el.back.onclick = () => api.tabs.back(state.activeTabId);
  el.forward.onclick = () => api.tabs.forward(state.activeTabId);
  el.reload.onclick = (e) => {
    const tab = activeTab();
    if (tab?.loading) api.tabs.stop(tab.id);
    else api.tabs.reload(tab?.id, e.shiftKey);
  };
  el.home.onclick = () => navigateTo(state.settings.homepage || 'calopsia://newtab');
  $('#btn-new-tab').onclick = () => api.tabs.create({ active: true });

  // omnibox
  el.urlInput.addEventListener('input', onOmniboxInput);
  el.urlInput.addEventListener('keydown', onOmniboxKey);
  el.urlInput.addEventListener('focus', () => {
    el.omnibox.classList.add('focused');
    requestAnimationFrame(() => el.urlInput.select());
  });
  el.urlInput.addEventListener('blur', () => {
    el.omnibox.classList.remove('focused');
    state.omniboxDirty = false;
    setTimeout(() => { if (state.openPopover === 'suggestions') closePopover(); }, 120);
    renderToolbar();
  });

  el.siteInfo.onclick = openSitePanel;
  el.bookmark.onclick = toggleBookmark;
  el.shield.onclick = openShieldPanel;
  el.downloads.onclick = openDownloadsPanel;
  el.menu.onclick = openMainMenu;

  // controles de janela
  $('#wc-min').onclick = () => api.window.minimize();
  $('#wc-max').onclick = () => api.window.maximize();
  $('#wc-close').onclick = () => api.window.close();
  $('#tabstrip').addEventListener('dblclick', (e) => {
    if (e.target.closest('.tab, button')) return;
    api.window.maximize();
  });

  // ações declarativas
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    if (target && !target.classList.contains('mz-btn') && !target.classList.contains('mz-value')) {
      runAction(target.dataset.act);
      return;
    }
    if (target) {
      // botões de zoom não fecham o menu
      const fn = actions[target.dataset.act];
      if (fn) { fn(); refreshZoom(); }
    }
  });

  el.scrim.addEventListener('mousedown', closePopover);

  // escudo
  $('#sw-adblock').onchange = (e) => api.settings.set({ adBlockEnabled: e.target.checked });
  $('#sw-trackers').onchange = (e) => api.settings.set({ blockTrackers: e.target.checked });
  $('#sw-https').onchange = (e) => api.settings.set({ httpsOnly: e.target.checked });
  $('#dl-clear').onclick = async () => { state.downloads = await api.downloads.clear(); renderDownloads(); };
  $('#site-copy').onclick = () => { api.clipboard.write(activeTab()?.url || ''); closePopover(); };
  $('#site-settings').onclick = () => runAction('settings');

  // localizar
  el.findInput.addEventListener('input', () => {
    const v = el.findInput.value;
    if (v) api.find.start(v);
    else { api.find.stop(); el.findCount.textContent = '0/0'; }
  });
  el.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      api.find.start(el.findInput.value, { findNext: true, forward: !e.shiftKey });
    }
    if (e.key === 'Escape') { e.preventDefault(); showFind(false); }
  });
  $('#find-next').onclick = () => api.find.start(el.findInput.value, { findNext: true, forward: true });
  $('#find-prev').onclick = () => api.find.start(el.findInput.value, { findNext: true, forward: false });
  $('#find-close').onclick = () => showFind(false);

  // atalhos tratados na própria UI
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (state.openPopover) { closePopover(); return; }
      if (state.findVisible && document.activeElement !== el.findInput) { showFind(false); return; }
    }
    if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); focusOmnibox(); }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); showFind(true); }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleBookmark(); }
    if (e.key === 'F6') { e.preventDefault(); focusOmnibox(); }
  });

  window.addEventListener('resize', () => { if (state.openPopover) closePopover(); });
}

async function refreshZoom() {
  state.zoom = await api.zoom.get();
  el.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* =========================================================================
   Tema
   ========================================================================= */

function applyTheme(settings) {
  const theme = settings.theme || 'system';
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  el.body.dataset.theme = dark ? 'dark' : 'light';
  if (settings.accent) document.documentElement.style.setProperty('--accent', settings.accent);
}

/* =========================================================================
   Eventos vindos do processo principal
   ========================================================================= */

function bindIpc() {
  api.on('bootstrap', (data) => {
    state.settings = data.settings;
    state.bookmarks = data.bookmarks || [];
    state.downloads = data.downloads || [];
    state.tabs = data.tabs || [];
    state.activeTabId = data.activeTabId;
    state.platform = data.platform;
    state.incognito = data.incognito;
    state.info = data;

    el.body.dataset.platform = data.platform;
    el.body.dataset.incognito = String(data.incognito);
    applyTheme(state.settings);
    renderTabs();
    renderToolbar();
    renderBookmarksBar();
    refreshZoom();
  });

  api.on('tabs:changed', ({ tabs, activeTabId }) => {
    state.tabs = tabs;
    state.activeTabId = activeTabId;
    renderTabs();
    renderToolbar();
    refreshZoom();
  });

  api.on('tab:updated', (tab) => {
    const i = state.tabs.findIndex((t) => t.id === tab.id);
    if (i >= 0) state.tabs[i] = tab;
    else state.tabs.push(tab);
    // Atualização cirúrgica evita recriar o DOM a cada frame de carregamento
    const node = el.tabs.querySelector(`.tab[data-id="${tab.id}"]`);
    if (!node) { renderTabs(); }
    else {
      const title = node.querySelector('.tab-title');
      if (title) title.textContent = tab.title || prettyUrl(tab.url) || 'Nova aba';
      node.title = tab.title || tab.url;
      const fav = node.querySelector('.tab-fav');
      if (fav) {
        if (tab.loading) {
          if (!fav.querySelector('.tab-spinner')) fav.innerHTML = '<div class="tab-spinner"></div>';
        } else if (tab.favicon) {
          const img = fav.querySelector('img');
          if (!img || img.src !== tab.favicon) fav.innerHTML = `<img src="${escapeHtml(tab.favicon)}" alt="" />`;
        } else if (!fav.querySelector('svg')) {
          fav.innerHTML = svg('i-globe');
        }
      }
      const hasAudio = !!node.querySelector('.tab-audio');
      if (hasAudio !== (tab.audible || tab.muted)) renderTabs();
    }
    if (tab.id === state.activeTabId) renderToolbar();
  });

  api.on('tab:zoom', ({ zoom }) => {
    state.zoom = zoom;
    el.zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  });

  api.on('tab:hover-link', ({ url }) => {
    if (!url) { el.status.hidden = true; return; }
    el.status.textContent = url;
    el.status.hidden = false;
  });

  api.on('find:result', (r) => {
    el.findCount.textContent = r.matches ? `${r.activeMatchOrdinal}/${r.matches}` : '0/0';
  });

  api.on('window:state', (s) => {
    if (s.maximized !== undefined) {
      state.maximized = s.maximized;
      $('#wc-max').innerHTML = `<svg class="icon-xs"><use href="#${s.maximized ? 'i-win-restore' : 'i-win-max'}"/></svg>`;
    }
    if (s.fullscreen !== undefined) el.body.dataset.fullscreen = String(s.fullscreen);
  });

  api.on('window:content-fullscreen', (on) => {
    el.body.dataset.fullscreen = String(on);
  });

  api.on('settings:changed', (settings) => {
    state.settings = settings;
    applyTheme(settings);
    renderBookmarksBar();
    renderToolbar();
  });

  api.on('theme:changed', () => applyTheme(state.settings));

  api.on('bookmarks:changed', (items) => {
    state.bookmarks = items;
    renderBookmarksBar();
    renderToolbar();
  });

  api.on('download:started', (d) => {
    upsertDownload(d);
    el.downloadDot.hidden = false;
    el.downloads.classList.add('on');
    setTimeout(() => el.downloads.classList.remove('on'), 1400);
  });
  api.on('download:updated', upsertDownload);
  api.on('download:done', (d) => {
    upsertDownload(d);
    el.downloadDot.hidden = !state.downloads.some((x) => x.state === 'progressing');
  });

  api.on('shortcut:find', () => showFind(true));
  api.on('shortcut:focus-omnibox', () => focusOmnibox());
  api.on('shortcut:bookmark', () => toggleBookmark());
  api.on('shortcut:toggle-bookmarks-bar', () =>
    api.settings.set({ showBookmarksBar: !state.settings.showBookmarksBar }));
}

/* =========================================================================
   Início
   ========================================================================= */

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(state.settings));

bindUI();
bindIpc();
