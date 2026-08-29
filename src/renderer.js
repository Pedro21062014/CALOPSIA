'use strict';

/* ============================================================
   CALOPSIA — lógica da interface (abas, navegação, atalhos)
   ============================================================ */

/* --------------------------- ícones (SVG) --------------------------- */
const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

const ICON = {
  close:   S('<line x1="6.5" y1="6.5" x2="17.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="6.5" y2="17.5"/>'),
  lock:    S('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  unlock:  S('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>'),
  info:    S('<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.8" x2="12" y2="8.4"/>'),
  home:    S('<path d="M3.5 10.7 12 4l8.5 6.7"/><path d="M5.8 9.6V19.5h12.4V9.6"/><path d="M9.8 19.5v-5.2h4.4v5.2"/>'),
  plus:    S('<line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/>'),
  minus:   S('<line x1="5.5" y1="12" x2="18.5" y2="12"/>'),
  search:  S('<circle cx="11" cy="11" r="6.8"/><line x1="20.8" y1="20.8" x2="16.1" y2="16.1"/>'),
  reload:  S('<polyline points="20.5 5 20.5 10.5 15 10.5"/><path d="M4.2 14.8A8.5 8.5 0 0 0 18.4 17.4L20.5 15.4"/><path d="M19.8 9.2A8.5 8.5 0 0 0 5.6 6.6L3.5 8.6"/>'),
  folder:  S('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h3.7l1.8 2.2H19a1.5 1.5 0 0 1 1.5 1.5v7.8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/>'),
  code:    S('<polyline points="16 18 21 12 16 6"/><polyline points="8 6 3 12 8 18"/>'),
  expand:  S('<polyline points="9 4 4 4 4 9"/><polyline points="15 20 20 20 20 15"/><line x1="4" y1="4" x2="10" y2="10"/><line x1="20" y1="20" x2="14" y2="14"/>'),
  print:   S('<polyline points="6.5 9 6.5 3.5 17.5 3.5 17.5 9"/><path d="M6.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 15h-1.5"/><rect x="6.5" y="13.5" width="11" height="7" rx="1"/>'),
  download:S('<path d="M12 3.5v11"/><polyline points="7.5 10 12 14.5 16.5 10"/><path d="M4.5 18.5h15"/>'),
  copy:    S('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9"/>')
};

/* --------------------------- elementos --------------------------- */
const $ = (id) => document.getElementById(id);

const tabstrip    = $('tabstrip');
const views       = $('views');
const urlInput    = $('url-input');
const secIcon     = $('security-icon');
const statusText  = $('status-text');
const backBtn     = $('back');
const fwdBtn      = $('forward');
const reloadBtn   = $('reload');
const homeBtn     = $('home');
const newTabBtn   = $('newtab');
const winMin      = $('win-min');
const winMax      = $('win-max');
const winClose    = $('win-close');
const menuBtn     = $('menu');
const findBtn     = $('btn-find');
const menuBar     = $('menubar');
const findBar     = $('findbar');
const findInput   = $('find-text');
const findCount   = $('find-count');
const progress    = $('progress');
const progressBar = $('progress-bar');
const errorPage   = $('errorpage');
const errDesc     = $('err-desc');
const errCode     = $('err-code');
const toasts      = $('toasts');
const zoomBadge   = $('zoom-badge');
const dlBadge     = $('dl-badge');

/* --------------------------- constantes --------------------------- */
const HOME_URL   = 'calopsia://home/';
const ABOUT_URL  = 'calopsia://home/about.html';
const SEARCH_URL = 'https://www.google.com/search?q=';
const IS_WIN     = window.calopsia && window.calopsia.platform === 'win32';
const MOD_LABEL  = IS_WIN || (window.calopsia && window.calopsia.platform === 'linux') ? 'Ctrl' : '⌘';

let tabs = [];
let activeId = null;
let seq = 0;
let closedTabs = [];          // pilha de "reabrir aba fechada"

const getTab = (id) => tabs.find((t) => t.id === id);
const getActive = () => getTab(activeId);
const isHome = (url) => /^calopsia:\/\//i.test(url || '');

/* ============================ URL ============================ */
function looksLikeUrl(text) {
  if (/^calopsia:\/\//i.test(text) || /^about:/i.test(text) || /^file:\/\//i.test(text)) return true;
  if (/^(https?|ftp):\/\//i.test(text)) return true;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(text)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/.test(text)) return true;
  // exemplo.com / exemplo.com/pagina / sub.exemplo.com:8080/x
  if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(:\d+)?(\/\S*)?$/i.test(text)) {
    const host = text.split('/')[0].split(':')[0];
    if (host.includes('.') && !host.endsWith('.')) return true;
  }
  return false;
}

function toUrl(text) {
  const t = text.trim();
  if (looksLikeUrl(t)) {
    if (/^[a-z]+:\/\//i.test(t) || /^(calopsia|about|file):/i.test(t)) return t;
    return 'https://' + t;
  }
  return SEARCH_URL + encodeURIComponent(t);
}

const pathToFileUrl = (p) =>
  'file://' + encodeURI(String(p).replace(/\\/g, '/').replace(/^\/+/, '/').replace(/^(\w):/, '$1:'));

/* ============================ abas ============================ */
function createTab(url, opts = {}) {
  const id = ++seq;
  const initial = url || HOME_URL;

  const tab = {
    id,
    url: initial,
    title: 'Nova aba',
    favicon: '',
    loading: false,
    error: null,
    zoom: 1
  };
  tabs.push(tab);

  /* --- elementos da aba --- */
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.id = String(id);
  el.innerHTML =
    '<span class="favicon-wrap"><img class="favicon" alt="" /><span class="spin"></span></span>' +
    '<span class="tab-title">Nova aba</span>' +
    `<button class="tab-close" title="Fechar aba" aria-label="Fechar aba">${ICON.close}</button>`;
  el.title = 'Nova aba';

  el.addEventListener('click', (e) => {
    if (e.target.closest('.tab-close')) return;
    activateTab(id);
  });
  el.querySelector('.tab-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(id);
  });
  el.addEventListener('auxclick', (e) => {
    if (e.button === 1) { e.preventDefault(); closeTab(id); }
  });

  tabstrip.appendChild(el);          // <= aqui estava o bug: insertBefore com nó de outro pai
  tab.el = el;

  /* --- webview --- */
  const view = document.createElement('webview');
  view.setAttribute('partition', 'persist:calopsia');
  view.setAttribute('allowpopups', 'on');
  view.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes');
  view.dataset.tab = String(id);
  views.appendChild(view);
  tab.view = view;

  bindView(tab);
  view.src = initial;

  if (opts.activate !== false) activateTab(id);
  if (opts.focusUrl) focusAddressBar();
  return tab;
}

function bindView(tab) {
  const v = tab.view;

  v.addEventListener('did-attach-webview', () => {
    if (tab.zoom !== 1) applyZoom(tab);
    if (tab.id === activeId) updateNavButtons();
  });

  v.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || 'Nova aba';
    tab.el.querySelector('.tab-title').textContent = tab.title;
    tab.el.title = tab.title;
    if (tab.id === activeId) updateDocumentTitle();
  });

  v.addEventListener('page-favicon-updated', (e) => {
    const fav = e.favicons && e.favicons.length ? e.favicons[0] : '';
    if (!fav) return;
    tab.favicon = fav;
    tab.el.querySelector('.favicon').src = fav;
  });

  const onNavigated = (e) => {
    tab.url = e.url;
    tab.error = null;
    if (tab.id === activeId) {
      updateAddressBar();
      updateNavButtons();
      updateDocumentTitle();
      renderActiveView();
      closeFind();
    }
  };
  v.addEventListener('did-navigate', onNavigated);
  v.addEventListener('did-navigate-in-page', onNavigated);

  v.addEventListener('did-start-loading', () => {
    tab.loading = true;
    tab.error = null;
    tab.el.classList.add('loading');
    if (tab.id === activeId) {
      reloadBtn.classList.add('is-loading');
      setStatus('Carregando…');
      showProgress(true);
      renderActiveView();
    }
  });

  v.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    tab.el.classList.remove('loading');
    if (tab.id === activeId) {
      reloadBtn.classList.remove('is-loading');
      setStatus('Pronto');
      showProgress(false);
      updateNavButtons();
      zoomBadgeUpdate(tab);
    }
  });

  v.addEventListener('did-finish-load', () => {
    if (tab.id === activeId) { updateNavButtons(); updateAddressBar(); }
    if (tab.zoom !== 1) applyZoom(tab);
  });

  v.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;              // navegação abortada pelo usuário
    if (!e.isMainFrame) return;
    tab.error = { code: e.errorCode, description: e.errorDescription, url: e.validatedURL || tab.url };
    if (tab.id === activeId) { renderActiveView(); setStatus('Falha ao carregar'); }
  });

  v.addEventListener('update-target-url', (e) => {
    if (tab.id === activeId && e.url) setStatus(e.url);
  });

  v.addEventListener('crashed', () => {
    setStatus('A página travou — recarregue');
  });

  v.addEventListener('close', () => closeTab(tab.id));

  v.addEventListener('found-in-page', (e) => {
    const r = e.result;
    if (!r) return;
    if (r.requestId !== lastFindId) return;
    if (r.matches === 0) {
      findCount.textContent = '0 resultados';
      findCount.classList.add('empty');
    } else {
      findCount.classList.remove('empty');
      findCount.textContent = `${r.activeMatchOrdinal} de ${r.matches}`;
    }
  });
}

function activateTab(id) {
  const tab = getTab(id);
  if (!tab) return;
  activeId = id;

  tabs.forEach((t) => t.el.classList.toggle('active', t.id === id));

  renderActiveView();

  // mantém a aba visível na faixa (scroll)
  if (tab.el.scrollIntoView) tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  updateAddressBar();
  updateNavButtons();
  updateDocumentTitle();

  reloadBtn.classList.toggle('is-loading', !!tab.loading);
  showProgress(!!tab.loading);
  setStatus(tab.loading ? 'Carregando…' : 'Pronto');
  zoomBadgeUpdate(tab);
  closeFind();
}

/** Mostra a webview ativa ou a página de erro (nunca sobrepõe as duas: no
 *  Windows o <webview> é uma janela nativa que cobre o DOM). */
function renderActiveView() {
  const tab = getActive();
  const showErr = !!(tab && tab.error);
  errorPage.hidden = !showErr;
  tabs.forEach((t) => {
    t.view.style.display = (t.id === activeId && !showErr) ? 'block' : 'none';
  });
  if (showErr && tab) {
    errDesc.textContent = describeError(tab.error);
    errCode.textContent = `${tab.error.url}  ·  erro ${tab.error.code}`;
  }
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];

  if (!isHome(tab.url)) {
    closedTabs.push({ url: tab.url, index: idx });
    if (closedTabs.length > 25) closedTabs.shift();
  }

  tab.el.remove();
  tab.view.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) { createTab(HOME_URL); return; }
  if (activeId === id) activateTab(tabs[Math.max(0, idx - 1)].id);
}

function reopenClosedTab() {
  const last = closedTabs.pop();
  if (!last) { toast('Nenhuma aba fechada para reabrir'); return; }
  const tab = createTab(last.url);
  if (last.index > 0 && tab.el) {
    // tenta recolocar a aba na posição original
    const ref = tabstrip.children[Math.min(last.index, tabstrip.children.length - 1)];
    if (ref && ref !== tab.el) tabstrip.insertBefore(tab.el, ref);
  }
}

function cycleTab(delta) {
  if (tabs.length < 2) return;
  const idx = tabs.findIndex((t) => t.id === activeId);
  activateTab(tabs[(idx + delta + tabs.length) % tabs.length].id);
}

/* ============================ barra de endereço ============================ */
function updateAddressBar() {
  const tab = getActive();
  if (!tab) return;

  if (document.activeElement !== urlInput) {
    urlInput.value = isHome(tab.url) ? '' : tab.url;
  }

  if (isHome(tab.url)) { setSecurity('internal', ICON.home, 'Página interna do CALOPSIA'); return; }
  try {
    const p = new URL(tab.url).protocol;
    if (p === 'https:')      setSecurity('secure', ICON.lock, 'Conexão segura (HTTPS)');
    else if (p === 'http:')  setSecurity('insecure', ICON.unlock, 'Conexão não segura (HTTP)');
    else if (p === 'file:')  setSecurity('internal', ICON.folder, 'Arquivo local');
    else                     setSecurity('neutral', ICON.info, 'Outro protocolo');
  } catch {
    setSecurity('neutral', ICON.info, '');
  }
}

function setSecurity(cls, svg, title) {
  secIcon.className = 'security ' + cls;
  secIcon.innerHTML = svg;
  secIcon.title = title;
}

function focusAddressBar() {
  urlInput.focus();
  urlInput.select();
}

function navigateFromInput() {
  const tab = getActive();
  if (!tab) return;
  const value = urlInput.value.trim();
  if (!value) return;
  tab.error = null;
  try { tab.view.loadURL(toUrl(value)); } catch { /* webview ainda não pronto */ }
  urlInput.blur();
}

/* ============================ navegação ============================ */
function safe(fn) { try { return fn(); } catch { return null; } }

function updateNavButtons() {
  const tab = getActive();
  if (!tab || !tab.view) return;
  backBtn.disabled = !safe(() => tab.view.canGoBack());
  fwdBtn.disabled = !safe(() => tab.view.canGoForward());
}

function goBack()    { const t = getActive(); if (t) safe(() => t.view.goBack()); }
function goForward() { const t = getActive(); if (t) safe(() => t.view.goForward()); }

function reloadActive() {
  const t = getActive();
  if (!t) return;
  t.error = null;
  if (t.view.isLoading()) { t.view.stop(); }
  else { safe(() => t.view.reload()); }
  renderActiveView();
}

function updateDocumentTitle() {
  const tab = getActive();
  document.title = (tab && tab.title && tab.title !== 'Nova aba' ? tab.title + ' — ' : '') + 'CALOPSIA';
}

function setStatus(text) { statusText.textContent = text || ''; }

function showProgress(on) {
  progress.classList.toggle('visible', !!on);
  progress.classList.toggle('indeterminate', !!on);
  if (on) progressBar.style.width = '0%';
  else {
    progressBar.style.width = '100%';
    setTimeout(() => { if (activeId && !(getActive() || {}).loading) progress.classList.remove('visible'); }, 180);
  }
}

/* ============================ zoom ============================ */
function zoomBy(delta) {
  const t = getActive();
  if (!t) return;
  const next = Math.min(3, Math.max(0.25, Math.round((t.zoom + delta) * 100) / 100));
  t.zoom = next;
  applyZoom(t);
  zoomBadgeUpdate(t);
}
function zoomReset() {
  const t = getActive();
  if (!t) return;
  t.zoom = 1;
  applyZoom(t);
  zoomBadgeUpdate(t);
}
function applyZoom(tab) { safe(() => tab.view.setZoomFactor(tab.zoom)); }
function zoomBadgeUpdate(tab) {
  if (!tab || tab.zoom === 1) { zoomBadge.hidden = true; return; }
  zoomBadge.hidden = false;
  zoomBadge.textContent = Math.round(tab.zoom * 100) + '%';
}

/* ============================ localizar ============================ */
let lastFindId = 0;

function openFind() {
  const t = getActive();
  if (!t) return;
  closeMenu();
  findBar.hidden = false;
  findInput.focus();
  findInput.select();
}
function closeFind() {
  if (findBar.hidden) return;
  findBar.hidden = true;
  findCount.textContent = '';
  findCount.classList.remove('empty');
  const t = getActive();
  if (t) safe(() => t.view.stopFindInPage('clearSelection'));
}
function runFind(forward) {
  const t = getActive();
  if (!t) return;
  const text = findInput.value;
  if (!text) { findCount.textContent = ''; safe(() => t.view.stopFindInPage('clearSelection')); return; }
  lastFindId = safe(() => t.view.findInPage(text, { forward: forward !== false, findNext: true })) || 0;
}

/* ============================ menu ============================ */
const MENU = [
  { icon: ICON.plus, label: 'Nova aba', shortcut: `${MOD_LABEL}+T`, action: () => createTab(HOME_URL, { focusUrl: true }) },
  { icon: ICON.search, label: 'Localizar', shortcut: `${MOD_LABEL}+F`, action: openFind },
  { icon: ICON.folder, label: 'Abrir arquivo…', shortcut: `${MOD_LABEL}+O`, action: openFile },
  { sep: true },
  { icon: ICON.minus, label: '', title: 'Diminuir zoom', action: () => zoomBy(-0.1) },
  { id: 'zoom', label: '100%', title: 'Restaurar zoom', center: true, action: zoomReset },
  { icon: ICON.plus, label: '', title: 'Aumentar zoom', action: () => zoomBy(0.1) },
  { sep: true },
  { icon: ICON.reload, label: 'Recarregar', shortcut: `${MOD_LABEL}+R`, action: reloadActive },
  { icon: ICON.print, label: 'Imprimir…', shortcut: `${MOD_LABEL}+P`, action: () => { const t = getActive(); if (t) safe(() => t.view.print()); } },
  { spacer: true },
  { icon: ICON.code, label: 'DevTools', shortcut: `${MOD_LABEL}+Shift+I`, action: () => { const t = getActive(); if (t) safe(() => t.view.openDevTools()); } },
  { icon: ICON.expand, label: 'Tela cheia', shortcut: 'F11', action: () => window.calopsia && window.calopsia.toggleFullscreen() },
  { icon: ICON.info, label: 'Sobre', action: openAbout }
];

function buildMenu() {
  menuBar.innerHTML = '';
  MENU.forEach((item) => {
    if (item.sep) { const s = document.createElement('div'); s.className = 'menu-sep'; menuBar.appendChild(s); return; }
    if (item.spacer) { const s = document.createElement('div'); s.className = 'menu-spacer'; menuBar.appendChild(s); return; }

    const b = document.createElement('button');
    b.className = 'mbtn';
    b.dataset.id = item.id || '';
    b.innerHTML = (item.icon ? `<span class="m-ico">${item.icon}</span>` : '') +
                  (item.label ? `<span>${item.label}</span>` : '');
    if (item.icon && !item.label) {
      b.innerHTML = item.icon;
      b.style.padding = '0 9px';
    }
    if (item.title) b.title = item.title;
    if (item.shortcut) b.title = (item.title ? item.title + '  ' : '') + `(${item.shortcut})`;
    b.addEventListener('click', () => { item.action(); if (item.id !== 'zoom') closeMenu(); });
    menuBar.appendChild(b);
  });
}

function toggleMenu() { menuBar.hidden ? openMenu() : closeMenu(); }
function openMenu() {
  closeFind();
  const t = getActive();
  const zb = menuBar.querySelector('[data-id="zoom"]');
  if (zb && t) zb.textContent = Math.round(t.zoom * 100) + '%';
  menuBar.hidden = false;
  menuBtn.style.color = '#fff';
  menuBtn.style.background = 'rgba(255,255,255,.09)';
}
function closeMenu() {
  if (menuBar.hidden) return;
  menuBar.hidden = true;
  menuBtn.style.color = '';
  menuBtn.style.background = '';
}

/* ============================ extras ============================ */
async function openFile() {
  if (!window.calopsia) return;
  const p = await window.calopsia.openFileDialog();
  if (!p) return;
  const t = getActive();
  if (!t) return;
  t.error = null;
  safe(() => t.view.loadURL(pathToFileUrl(p)));
  renderActiveView();
}

async function openAbout() {
  closeMenu();
  let query = '';
  if (window.calopsia) {
    try {
      const info = await window.calopsia.getInfo();
      query = `?v=${encodeURIComponent(info.version)}&electron=${encodeURIComponent(info.electron)}` +
              `&chrome=${encodeURIComponent(info.chrome)}&node=${encodeURIComponent(info.node)}`;
    } catch { /* segue sem os dados */ }
  }
  createTab(ABOUT_URL + query);
}

function describeError(err) {
  const map = {
    '-105': 'Não foi possível encontrar o endereço (falha de DNS). Verifique se o domínio existe.',
    '-102': 'A conexão foi recusada pelo servidor.',
    '-104': 'A conexão foi redefinida pelo servidor.',
    '-106': 'Sem conexão com a internet. Verifique a sua rede.',
    '-109': 'Falha na conexão com o servidor.',
    '-2': 'Não foi possível concluir o carregamento.',
    '-6': 'Arquivo ou diretório não encontrado.',
    '-7': 'O tempo limite de carregamento foi excedido.',
    '-118': 'Tempo limite de conexão esgotado.',
    '-130': 'Falha de proxy — verifique as configurações de proxy do sistema.',
    '-202': 'Certificado de segurança inválido.',
    '-501': 'Falha no protocolo de segurança (SSL/TLS).'
  };
  return map[String(err.code)] || err.description || 'Ocorreu um erro ao carregar a página.';
}

/* --------------------------- toasts / downloads --------------------------- */
function toast(text, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.ok ? ' ok' : '');
  el.innerHTML = `<span class="t-dot"></span><span class="t-label"></span>`;
  el.querySelector('.t-label').textContent = text;
  toasts.appendChild(el);
  setTimeout(() => el.remove(), opts.duration || (opts.ok ? 4200 : 60000));
  return el;
}

let dlCount = 0;
if (window.calopsia) {
  window.calopsia.onDownloadProgress((info) => {
    let el = toasts.querySelector(`[data-dl="${CSS.escape(info.name)}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.dataset.dl = info.name;
      el.innerHTML = `<span class="t-dot"></span><span class="t-label"></span><span class="t-bar"><span></span></span>`;
      toasts.appendChild(el);
      dlCount++;
      updateDlBadge();
    }
    el.querySelector('.t-label').textContent = `Baixando ${info.name}`;
    const total = info.total || 0;
    const pct = total ? Math.min(100, (info.received / total) * 100) : 0;
    el.querySelector('.t-bar span').style.width = pct + '%';
  });

  window.calopsia.onDownloadDone((info) => {
    const el = toasts.querySelector(`[data-dl="${CSS.escape(info.name)}"]`);
    if (el) el.remove();
    dlCount = Math.max(0, dlCount - 1);
    updateDlBadge();

    if (info.state === 'completed') {
      const t = toast(`${info.name} — concluído`, { ok: true, duration: 6000 });
      const btn = document.createElement('button');
      btn.className = 't-action';
      btn.textContent = 'Abrir';
      btn.addEventListener('click', () => { window.calopsia.showItemInFolder(info.path); t.remove(); });
      t.appendChild(btn);
    } else {
      toast(`Download cancelado: ${info.name}`, { duration: 5000 });
    }
  });
}

function updateDlBadge() {
  dlBadge.hidden = dlCount === 0;
  dlBadge.textContent = `↓ ${dlCount}`;
}
dlBadge.addEventListener('click', () => {
  const folder = document.querySelector('.toast .t-label');
  if (folder && window.calopsia) window.calopsia.showItemInFolder(folder.textContent.replace(/^Baixando /, ''));
});

/* ============================ eventos ============================ */
backBtn.addEventListener('click', goBack);
fwdBtn.addEventListener('click', goForward);
reloadBtn.addEventListener('click', reloadActive);
homeBtn.addEventListener('click', () => { closeMenu(); const t = getActive(); if (t) { t.error = null; safe(() => t.view.loadURL(HOME_URL)); renderActiveView(); } });
newTabBtn.addEventListener('click', () => createTab(HOME_URL, { focusUrl: true }));
menuBtn.addEventListener('click', toggleMenu);
findBtn.addEventListener('click', openFind);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); navigateFromInput(); }
  else if (e.key === 'Escape') { e.preventDefault(); updateAddressBar(); urlInput.blur(); }
});
urlInput.addEventListener('focus', () => urlInput.select());

/* localizar */
findInput.addEventListener('input', () => runFind(true));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runFind(!e.shiftKey); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('find-prev').addEventListener('click', () => runFind(false));
$('find-next').addEventListener('click', () => runFind(true));
$('find-close').addEventListener('click', closeFind);

/* página de erro */
$('err-retry').addEventListener('click', () => { const t = getActive(); if (t) { t.error = null; safe(() => t.view.reload()); } renderActiveView(); });
$('err-home').addEventListener('click', () => { const t = getActive(); if (t) { t.error = null; safe(() => t.view.loadURL(HOME_URL)); } renderActiveView(); });

/* controles de janela */
if (window.calopsia) {
  winMin.addEventListener('click', () => window.calopsia.minimize());
  winMax.addEventListener('click', () => window.calopsia.maximize());
  winClose.addEventListener('click', () => window.calopsia.close());

  window.calopsia.onMaximizeChange((max) => document.body.classList.toggle('maximized', !!max));
  window.calopsia.onFullscreenChange((fs) => {
    document.body.classList.toggle('fullscreen', !!fs);
    document.getElementById('titlebar').style.display = fs ? 'none' : '';
    document.getElementById('toolbar').style.display = fs ? 'none' : '';
    document.getElementById('statusbar').style.display = fs ? 'none' : '';
  });

  /* comandos vindos do menu nativo (macOS/Windows) */
  window.calopsia.onNewTab((url) => createTab(url || HOME_URL, { focusUrl: !url }));
  window.calopsia.onCloseTab(() => closeTab(activeId));
}

/* duplo clique na titlebar maximiza */
document.getElementById('titlebar').addEventListener('dblclick', (e) => {
  if (e.target.closest('.tab, button')) return;
  if (window.calopsia) window.calopsia.maximize();
});

/* fecha menu ao clicar fora */
document.addEventListener('mousedown', (e) => {
  if (!menuBar.hidden && !e.target.closest('#menubar') && !e.target.closest('#menu')) closeMenu();
});

/* --------------------------- atalhos --------------------------- */
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (e.key === 'Escape') {
    if (!findBar.hidden) { closeFind(); return; }
    if (!menuBar.hidden) { closeMenu(); return; }
  }
  if (e.key === 'F5') { e.preventDefault(); reloadActive(); return; }
  if (e.key === 'F11') { e.preventDefault(); if (window.calopsia) window.calopsia.toggleFullscreen(); return; }
  if (e.key === 'F12' || (mod && e.shiftKey && key === 'i')) {
    e.preventDefault();
    const t = getActive();
    if (t) safe(() => t.view.openDevTools());
    return;
  }

  if (!mod) {
    if (e.altKey && e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    else if (e.altKey && e.key === 'Home')  { e.preventDefault(); homeBtn.click(); }
    return;
  }

  if (mod && e.shiftKey && key === 't') { e.preventDefault(); reopenClosedTab(); return; }
  if (mod && e.shiftKey && key === 'n') { e.preventDefault(); createTab(HOME_URL); return; }
  if (mod && key === 'tab')             { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); return; }

  switch (key) {
    case 't': e.preventDefault(); createTab(HOME_URL, { focusUrl: true }); break;
    case 'n': e.preventDefault(); createTab(HOME_URL, { focusUrl: true }); break;
    case 'w': e.preventDefault(); closeTab(activeId); break;
    case 'l': e.preventDefault(); focusAddressBar(); break;
    case 'f': e.preventDefault(); openFind(); break;
    case 'r': e.preventDefault(); reloadActive(); break;
    case 'o': e.preventDefault(); openFile(); break;
    case 'p': e.preventDefault(); { const t = getActive(); if (t) safe(() => t.view.print()); break; }
    case 'q': break; // deixa o SO / menu tratar
    default:
      if (key === '=' || key === '+') { e.preventDefault(); zoomBy(0.1); }
      else if (key === '-')           { e.preventDefault(); zoomBy(-0.1); }
      else if (key === '0')           { e.preventDefault(); zoomReset(); }
      else if (/^[1-8]$/.test(key))   { const t = tabs[Number(key) - 1]; if (t) activateTab(t.id); }
      else if (key === '9')           { const t = tabs[tabs.length - 1]; if (t) activateTab(t.id); }
  }
});

/* ============================ boot ============================ */
buildMenu();
createTab(HOME_URL, { focusUrl: true });

/* expõe um pouco de estado para depuração */
window.__calopsia = {
  get tabs() { return tabs; },
  get active() { return getActive(); },
  createTab, activateTab, closeTab, toUrl, looksLikeUrl
};
