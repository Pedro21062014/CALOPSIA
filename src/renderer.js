'use strict';

/* ============================================================
   CALOPSIA — lógica da interface (abas, navegação, atalhos)
   ============================================================ */

/* --------------------------- ícones (SVG) --------------------------- */
const S = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

const ICON = {
  close:    S('<line x1="6.5" y1="6.5" x2="17.5" y2="17.5"/><line x1="17.5" y1="6.5" x2="6.5" y2="17.5"/>'),
  lock:     S('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  unlock:   S('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>'),
  info:     S('<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.8" x2="12" y2="8.4"/>'),
  home:     S('<path d="M3.5 10.7 12 4l8.5 6.7"/><path d="M5.8 9.6V19.5h12.4V9.6"/>'),
  plus:     S('<line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/>'),
  minus:    S('<line x1="5.5" y1="12" x2="18.5" y2="12"/>'),
  search:   S('<circle cx="11" cy="11" r="6.8"/><line x1="20.8" y1="20.8" x2="16.1" y2="16.1"/>'),
  reload:   S('<polyline points="20.5 5 20.5 10.5 15 10.5"/><path d="M4.2 14.8A8.5 8.5 0 0 0 18.4 17.4L20.5 15.4"/><path d="M19.8 9.2A8.5 8.5 0 0 0 5.6 6.6L3.5 8.6"/>'),
  folder:   S('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h3.7l1.8 2.2H19a1.5 1.5 0 0 1 1.5 1.5v7.8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z"/>'),
  code:     S('<polyline points="16 18 21 12 16 6"/><polyline points="8 6 3 12 8 18"/>'),
  expand:   S('<polyline points="9 4 4 4 4 9"/><polyline points="15 20 20 20 20 15"/><line x1="4" y1="4" x2="10" y2="10"/><line x1="20" y1="20" x2="14" y2="14"/>'),
  print:    S('<polyline points="6.5 9 6.5 3.5 17.5 3.5 17.5 9"/><path d="M6.5 15H5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 19 15h-1.5"/><rect x="6.5" y="13.5" width="11" height="7" rx="1"/>'),
  zoomIn:   S('<circle cx="11" cy="11" r="6.8"/><line x1="20.8" y1="20.8" x2="16.1" y2="16.1"/><line x1="8.5" y1="11" x2="13.5" y2="11"/><line x1="11" y1="8.5" x2="11" y2="13.5"/>'),
  zoomOut:  S('<circle cx="11" cy="11" r="6.8"/><line x1="20.8" y1="20.8" x2="16.1" y2="16.1"/><line x1="8.5" y1="11" x2="13.5" y2="11"/>'),
  zoomFit:  S('<circle cx="11" cy="11" r="6.8"/><line x1="20.8" y1="20.8" x2="16.1" y2="16.1"/><rect x="8.5" y="8.5" width="5" height="5" rx="1"/>'),
  sun:      S('<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.6" x2="12" y2="4.6"/><line x1="12" y1="19.4" x2="12" y2="21.4"/><line x1="2.6" y1="12" x2="4.6" y2="12"/><line x1="19.4" y1="12" x2="21.4" y2="12"/><line x1="5.4" y1="5.4" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="18.6" y2="18.6"/><line x1="5.4" y1="18.6" x2="6.8" y2="17.2"/><line x1="17.2" y1="6.8" x2="18.6" y2="5.4"/>'),
  moon:     S('<path d="M20.2 14.8A8.6 8.6 0 0 1 9.2 3.8a8.6 8.6 0 1 0 11 11Z"/>'),
  monitor:  S('<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><line x1="8.5" y1="20.5" x2="15.5" y2="20.5"/><line x1="12" y1="16.5" x2="12" y2="20.5"/>'),
  key:      S('<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1 20 3"/><path d="M16.5 6.5 19 9"/>'),
  download: S('<path d="M12 4v10.5"/><polyline points="6.8 9.8 12 15 17.2 9.8"/><path d="M4.5 19.5h15"/>')
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
const findBar     = $('findbar');
const findInput   = $('find-text');
const findCount   = $('find-count');
const progress    = $('progress');
const progressBar = $('progress-bar');
const errorPage   = $('errorpage');
const errDesc     = $('err-desc');
const errTitle    = $('err-title');
const errCode     = $('err-code');
const toasts      = $('toasts');
const zoomBadge   = $('zoom-badge');
const dlBadge     = $('dl-badge');

/* --------------------------- constantes --------------------------- */
const HOME_URL   = 'calopsia://home/';
const ABOUT_URL  = 'calopsia://home/about.html';
const SENHAS_URL = 'calopsia://home/senhas.html';
const SEARCH_URL = 'https://www.google.com/search?q=';
const TAB_PARTITION = 'persist:calopsia';   // precisa casar com main.js

/* Diretório do app (dentro do asar quando empacotado). Usado para apontar o
   preload das abas, que captura o Ctrl+scroll para dar zoom. */
let APP_DIR = '';

/* Tema: 'system' segue o dispositivo; 'light'/'dark' fixam a escolha da pessoa. */
let temaFonte = 'system';
const IS_WIN     = window.calopsia && window.calopsia.platform === 'win32';
const MOD_LABEL  = IS_WIN || (window.calopsia && window.calopsia.platform === 'linux') ? 'Ctrl' : '⌘';

let tabs = [];
let activeId = null;
let seq = 0;
let closedTabs = [];
let userTyping = false;     // usuário está digitando na barra de endereço?
let menuOpen = false;

/* Estado do painel DevTools (declarado AQUI no topo porque activateTab,
   chamada durante o boot, já referencia — deixar depois causaria
   ReferenceError de zona morta temporal e nenhuma aba abriria). */
/* (estado devtoolsHost/devtoolsTabId/devtoolsAbrindo: declarado no topo do arquivo) */
let devtoolsHost = null;      // o <webview> que hospeda o DevTools
let devtoolsTabId = null;     // aba sendo inspecionada
let devtoolsAbrindo = false;
let lastFindId = 0;

const getTab = (id) => tabs.find((t) => t.id === id);
const getActive = () => getTab(activeId);
const isHome = (url) => /^calopsia:\/\//i.test(url || '');
const safe = (fn) => { try { return fn(); } catch { return null; } };

/* ============================ URL ============================ */
function looksLikeUrl(text) {
  if (/^calopsia:\/\//i.test(text) || /^about:/i.test(text) || /^file:\/\//i.test(text)) return true;
  if (/^(https?|ftp):\/\//i.test(text)) return true;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(text)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/.test(text)) return true;
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

const pathToFileUrl = (p) => 'file://' + encodeURI(String(p).replace(/\\/g, '/'));

/* ============================ abas ============================ */
function createTab(url, opts = {}) {
  const id = ++seq;

  const tab = {
    id,
    url: url || HOME_URL,
    title: 'Nova aba',
    favicon: '',
    loading: false,
    error: null,
    zoom: 1,
    memorias: {}         // url -> {titulo, fav}: restaura título/favicon ao voltar
  };
  tabs.push(tab);

  /* --- elemento da aba --- */
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

  tabstrip.appendChild(el);
  // o botão "+" fica grudado à direita da última aba aberta
  if (newTabBtn && newTabBtn.parentNode === tabstrip) tabstrip.appendChild(newTabBtn);
  tab.el = el;

  /* --- webview --- */
  const view = document.createElement('webview');
  view.setAttribute('partition', TAB_PARTITION);
  view.setAttribute('allowpopups', 'on');
  view.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes');
  if (APP_DIR) view.setAttribute('preload', pathToFileUrl(APP_DIR + '/webview-preload.js'));
  view.dataset.tab = String(id);
  views.appendChild(view);
  tab.view = view;

  bindView(tab);
  view.src = tab.url;

  if (opts.activate !== false) activateTab(id);
  if (opts.focusUrl) focusAddressBar();
  return tab;
}

function bindView(tab) {
  const v = tab.view;

  /* Título e favicon da aba. Guardam uma "memória" por URL porque, quando
     a pessoa volta/avança, o Chromium restaura a página do back-forward
     cache SEM disparar page-title-updated / page-favicon-updated de novo —
     sem isso a aba continuava mostrando o título e o ícone do site
     anterior. */
  function lembrar(url, info) {
    if (!url || url === 'about:blank') return;
    if (Object.keys(tab.memorias).length > 300) tab.memorias = {};
    const m = tab.memorias[url] || (tab.memorias[url] = {});
    Object.assign(m, info);
  }

  function aplicarTitulo(texto) {
    tab.title = texto || 'Nova aba';
    tab.el.querySelector('.tab-title').textContent = tab.title;
    tab.el.title = tab.title;
    if (tab.id === activeId) updateDocumentTitle();
  }

  function aplicarFavicon(fav) {
    tab.favicon = fav || '';
    const img = tab.el.querySelector('.favicon');
    if (fav) img.src = fav;
    else img.removeAttribute('src');
  }

  v.addEventListener('did-attach-webview', () => {
    // Aplica sempre (inclusive 1): garante que nenhum zoom herdado da sessão
    // ou da escala do SO deixe a página "ampliada".
    applyZoom(tab);
    relayoutViews();
    if (tab.id === activeId) updateNavButtons();
  });

  v.addEventListener('page-title-updated', (e) => {
    aplicarTitulo(e.title);
    lembrar(tab.url, { titulo: tab.title });
  });

  v.addEventListener('page-favicon-updated', (e) => {
    const fav = e.favicons && e.favicons.length ? e.favicons[0] : '';
    if (!fav) return;
    aplicarFavicon(fav);
    lembrar(tab.url, { fav });
  });

  const onNavigated = (e) => {
    tab.url = e.url;
    tab.error = null;

    /* Volta/avança: reaplica o que se conhece da página de destino. */
    const memoria = tab.memorias[e.url];
    aplicarTitulo((memoria && memoria.titulo) || safe(() => v.getTitle()) || 'Nova aba');
    aplicarFavicon((memoria && memoria.fav) || '');

    const cid = safe(() => v.getWebContentsId());
    if (cid) window.calopsia.senhasNavegou({ contentsId: cid, url: e.url });
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

  /* Páginas restauradas do cache podem não avisar o título de novo:
     no dom-ready pega o título direto da página. */
  v.addEventListener('dom-ready', () => {
    const t = safe(() => v.getTitle());
    if (t && t !== tab.title) aplicarTitulo(t);
  });

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
    if (tab.zoom !== 1) applyZoom(tab);
    if (tab.id === activeId) { updateNavButtons(); updateAddressBar(); }
  });

  v.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;            // navegação abortada
    if (!e.isMainFrame) return;
    tab.error = { code: e.errorCode, description: e.errorDescription, url: e.validatedURL || tab.url };
    if (tab.id === activeId) { renderActiveView(); setStatus('Falha ao carregar'); }
  });

  v.addEventListener('update-target-url', (e) => {
    if (tab.id === activeId && e.url) setStatus(e.url);
  });

  v.addEventListener('crashed', () => setStatus('A página travou — recarregue'));
  v.addEventListener('close', () => closeTab(tab.id));

  /* Se o DevTools desta aba for fechado (por nós ou por ele mesmo), limpa o painel. */
  v.addEventListener('devtools-closed', () => {
    if (devtoolsTabId === tab.id) limparDevtoolsUI();
  });

  v.addEventListener('found-in-page', (e) => {
    const r = e.result;
    if (!r || r.requestId !== lastFindId) return;
    if (r.matches === 0) {
      findCount.textContent = '0 resultados';
      findCount.classList.add('empty');
    } else {
      findCount.classList.remove('empty');
      findCount.textContent = `${r.activeMatchOrdinal} de ${r.matches}`;
    }
  });
}

/** Reafirma o tamanho dos webviews. O guest às vezes mantém um viewport
 *  antigo quando o elemento foi criado/escondido ou a janela mudou de tamanho
 *  (sintoma: página aparece cortada/ampliada). */
function relayoutViews() {
  const w = views.clientWidth;
  const h = views.clientHeight;
  if (!w || !h) return;
  tabs.forEach((t) => {
    t.view.style.width = w + 'px';
    t.view.style.height = h + 'px';
  });
}

function activateTab(id) {
  const tab = getTab(id);
  if (!tab) return;
  if (devtoolsTabId != null && devtoolsTabId !== id) fecharDevtools();
  activeId = id;

  tabs.forEach((t) => t.el.classList.toggle('active', t.id === id));
  renderActiveView();
  requestAnimationFrame(relayoutViews);

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

/** Mostra a webview ativa ou a página de erro — nunca as duas juntas
 *  (no Windows o <webview> é uma janela nativa que cobre o DOM). */
/* ------------------------------------------------------------
   Loop de recarregamento — REMOVIDO na v0.2.7
   ------------------------------------------------------------
   Um "protetor" antigo interrompia páginas que recarregavam
   várias vezes seguidas. Só que a verificação do Cloudflare
   recarrega a página de propósito — o protetor matava o desafio
   no meio e a aba ficava presa no erro. Agora a página segue seu
   curso normal.
   ------------------------------------------------------------ */

function renderActiveView() {
  const tab = getActive();
  const showErr = !!(tab && tab.error);

  errorPage.hidden = !showErr;
  tabs.forEach((t) => t.view.classList.toggle('visible', t.id === activeId && !showErr));
  requestAnimationFrame(relayoutViews);

  if (showErr && tab) {
    errTitle.textContent = 'Não foi possível carregar esta página';
    errDesc.textContent = describeError(tab.error);
    errCode.textContent = `${tab.error.url}  ·  erro ${tab.error.code}`;
  }
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];

  if (devtoolsTabId === id) fecharDevtools();

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
  createTab(last.url);
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

  // Só NÃO sobrescreve enquanto o usuário está realmente digitando
  // (antes isso travava o valor vazio porque o input ficava focado no boot).
  if (!userTyping) urlInput.value = isHome(tab.url) ? '' : tab.url;

  if (isHome(tab.url)) { setSecurity('internal', ICON.home, 'Página interna do CALOPSIA'); return; }
  try {
    const p = new URL(tab.url).protocol;
    if (p === 'https:')     setSecurity('secure', ICON.lock, 'Conexão segura (HTTPS)');
    else if (p === 'http:') setSecurity('insecure', ICON.unlock, 'Conexão não segura (HTTP)');
    else if (p === 'file:') setSecurity('internal', ICON.folder, 'Arquivo local');
    else                    setSecurity('internal', ICON.info, 'Outro protocolo');
  } catch {
    setSecurity('internal', ICON.info, '');
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
  userTyping = false;
  tab.error = null;
  safe(() => tab.view.loadURL(toUrl(value)));
  urlInput.blur();
}

/* ============================ navegação ============================ */
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
  if (t.view.isLoading()) t.view.stop();
  else safe(() => t.view.reload());
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
    setTimeout(() => {
      if (activeId && !(getActive() || {}).loading) progress.classList.remove('visible');
    }, 180);
  }
}

/* ============================ zoom ============================ */
function zoomBy(delta) {
  const t = getActive();
  if (!t) return;
  t.zoom = Math.min(3, Math.max(0.25, Math.round((t.zoom + delta) * 100) / 100));
  applyZoom(t);
  zoomBadgeUpdate(t);
}
function zoomReset() { const t = getActive(); if (!t) return; t.zoom = 1; applyZoom(t); zoomBadgeUpdate(t); }
function applyZoom(tab) { safe(() => tab.view.setZoomFactor(tab.zoom)); }

/* Ctrl+scroll é capturado no processo principal (evento zoom-changed); aqui só
   espelhamos o valor para o indicador da interface. */
if (window.calopsia) {
  window.calopsia.onTabZoom(({ id, zoom }) => {
    const alvo = tabs.find((t) => safe(() => t.view.getWebContentsId()) === id);
    if (!alvo) return;
    alvo.zoom = zoom;
    if (alvo.id === activeId) zoomBadgeUpdate(alvo);
  });
}
function zoomBadgeUpdate(tab) {
  if (!tab || tab.zoom === 1) { zoomBadge.hidden = true; return; }
  zoomBadge.hidden = false;
  zoomBadge.textContent = Math.round(tab.zoom * 100) + '%';
}

/* ============================ localizar ============================ */
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

/* ============================ menu (lista dropdown) ============================ */

/* Estado do atualizador (chega do processo principal). */
let updateState = null;
let avisouAtualizacao = false;

function itemAtualizacao() {
  if (!updateState) return null;
  if (updateState.status === 'available')
    return { id: 'update', icon: ICON.download, label: `Atualizar para a v${updateState.versao}`, accent: true };
  if (updateState.status === 'downloading')
    return { id: 'update', icon: ICON.download, label: `Baixando v${updateState.versao}… ${updateState.progresso || 0}%`, disabled: true };
  if (updateState.status === 'ready')
    return { id: 'update', icon: ICON.download, label: `Reiniciar e instalar v${updateState.versao}`, accent: true };
  if (updateState.status === 'error')
    return { id: 'update', icon: ICON.reload, label: 'Atualização — tentar de novo' };
  return null;
}

function onUpdateState(novo) {
  const anterior = updateState && updateState.status;
  updateState = novo || null;

  const destaque = !!updateState && ['available', 'ready'].includes(updateState.status);
  menuBtn.classList.toggle('has-update', destaque);

  if (updateState && updateState.status === 'available' && !avisouAtualizacao && anterior !== 'available') {
    avisouAtualizacao = true;
    toast(`Atualização v${updateState.versao} disponível — toque no menu ☰ para atualizar.`, { ok: true, duration: 9000 });
  }
}

if (window.calopsia) {
  window.calopsia.onUpdateState(onUpdateState);
  window.calopsia.updateState().then(onUpdateState).catch(() => {});
}

function menuItems() {
  const t = getActive();
  const atualizacao = itemAtualizacao();
  return [
    ...(atualizacao ? [atualizacao, { sep: true }] : []),
    { id: 'new-tab',    icon: ICON.plus,    label: 'Nova aba',             shortcut: `${MOD_LABEL}+T` },
    { id: 'find',       icon: ICON.search,  label: 'Localizar na página',  shortcut: `${MOD_LABEL}+F` },
    { id: 'open-file',  icon: ICON.folder,  label: 'Abrir arquivo…',       shortcut: `${MOD_LABEL}+O` },
    { sep: true },
    { id: 'reload',     icon: ICON.reload,  label: 'Recarregar',           shortcut: `${MOD_LABEL}+R` },
    { id: 'print',      icon: ICON.print,   label: 'Imprimir…',            shortcut: `${MOD_LABEL}+P` },
    { sep: true },
    { id: 'zoom-out',   icon: ICON.zoomOut, label: 'Diminuir zoom',        shortcut: `${MOD_LABEL}+-` },
    { id: 'zoom-reset', icon: ICON.zoomFit, label: 'Restaurar zoom (100%)', shortcut: `${MOD_LABEL}+0` },
    { id: 'zoom-in',    icon: ICON.zoomIn,  label: 'Aumentar zoom',        shortcut: `${MOD_LABEL}++` },
    { sep: true },
    { id: 'devtools',   icon: ICON.code,    label: 'Ferramentas do desenvolvedor', shortcut: `${MOD_LABEL}+Shift+I` },
    { id: 'fullscreen', icon: ICON.expand,  label: 'Tela cheia',           shortcut: 'F11' },
    { sep: true },
    { header: 'Tema' },
    { id: 'theme-system', icon: ICON.monitor, label: 'Seguir o dispositivo', checked: temaFonte === 'system' },
    { id: 'theme-light',  icon: ICON.sun,     label: 'Claro',                checked: temaFonte === 'light' },
    { id: 'theme-dark',   icon: ICON.moon,    label: 'Escuro',               checked: temaFonte === 'dark' },
    { sep: true },
    { id: 'senhas',      icon: ICON.lock,    label: 'Senhas salvas' },
    { id: 'gerar-senha', icon: ICON.key,     label: 'Gerar senha forte' },
    { sep: true },
    { id: 'about',      icon: ICON.info,    label: 'Sobre o CALOPSIA' },
    { sep: true },
    { id: 'close-tab',  icon: ICON.close,   label: 'Fechar aba',           shortcut: `${MOD_LABEL}+W`, danger: true }
  ].filter(Boolean).map((it) => {
    if (it.id === 'reload' || it.id === 'print' || it.id === 'find') {
      return { ...it, disabled: !t };
    }
    return it;
  });
}

function toggleMenu() {
  if (menuOpen) { closeMenu(); return; }
  if (!window.calopsia) return;
  closeFind();

  const r = menuBtn.getBoundingClientRect();
  const width = 268;
  window.calopsia.openMenu({
    width,
    x: Math.max(4, Math.round(r.right - width)),
    y: Math.round(r.bottom + 6),
    items: menuItems()
  });
  menuOpen = true;
  menuBtn.classList.add('on');
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuBtn.classList.remove('on');
  if (window.calopsia) window.calopsia.closeMenu();
}

/* Gera uma senha forte, copia e avisa. */
async function gerarSenhaFortes() {
  if (!window.calopsia) return;
  const senha = await window.calopsia.senhasGerar(20);
  window.calopsia.copiar(senha);
  toast(`Senha de 20 caracteres copiada: ${senha}`, { ok: true });
}

/* Troca o tema no processo principal (que avisa todas as janelas e abas). */
function definirTema(fonte) {
  if (!window.calopsia) return;
  window.calopsia.setTheme(fonte).then((info) => { temaFonte = info.source; }).catch(() => {});
}

/* ------------------------------------------------------------
   DevTools — painel acoplado ao lado direito da página
   ------------------------------------------------------------
   O Electron não sabe "ancorar" DevTools de um <webview>; então o
   frontend do DevTools é hospedado num segundo webview, criado aqui,
   que ocupa o painel #devtools-pane ao lado da página.
   ------------------------------------------------------------ */
function aguardarDevtoolsHost(host) {
  return new Promise((resolve) => {
    let dado = false;
    const ok = () => { if (!dado) { dado = true; resolve(true); } };
    host.addEventListener('dom-ready', ok, { once: true });
    setTimeout(() => ok(), 2500);      // não trava se algo sair errado
  });
}

function limparDevtoolsUI() {
  if (devtoolsHost) { devtoolsHost.remove(); devtoolsHost = null; }
  devtoolsTabId = null;
  devtoolsAbrindo = false;
  document.body.classList.remove('devtools-aberto');
  requestAnimationFrame(relayoutViews);
}

function fecharDevtools() {
  const t = devtoolsTabId != null ? getTab(devtoolsTabId) : null;
  if (t) safe(() => t.view.closeDevTools && t.view.closeDevTools());
  limparDevtoolsUI();   // idempotente: o evento 'devtools-closed' também limpa
}

async function abrirDevtools(inspecionar) {
  const t = getActive();
  if (!t || !window.calopsia) return;

  if (devtoolsTabId === t.id && !devtoolsAbrindo) { fecharDevtools(); return; }
  fecharDevtools();

  const cid = safe(() => t.view.getWebContentsId());
  if (!cid) return;

  devtoolsAbrindo = true;
  const host = document.createElement('webview');
  host.setAttribute('src', 'about:blank');   // sem src o webview nunca fica pronto
  host.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes');
  document.getElementById('devtools-pane').appendChild(host);
  devtoolsHost = host;
  devtoolsTabId = t.id;

  await aguardarDevtoolsHost(host);
  const hid = safe(() => host.getWebContentsId());
  if (!hid) { devtoolsAbrindo = false; fecharDevtools(); return; }

  const ok = await window.calopsia.acoplarDevtools(cid, hid, inspecionar || null).catch(() => false);
  devtoolsAbrindo = false;
  if (!ok) { fecharDevtools(); toast('Não foi possível abrir as ferramentas do desenvolvedor.'); return; }

  document.body.classList.add('devtools-aberto');
  requestAnimationFrame(relayoutViews);
}

function toggleDevToolsAtiva() {
  abrirDevtools(null);
}

/* "Inspecionar" no botão direito: abre o painel já parado no elemento. */
if (window.calopsia) {
  window.calopsia.onDevtoolsInspecionar(async ({ contentsId, x, y }) => {
    const t = tabs.find((tb) => safe(() => tb.view.getWebContentsId()) === contentsId);
    if (!t) return;
    if (t.id !== activeId) activateTab(t.id);
    if (devtoolsTabId !== t.id) await abrirDevtools({ x, y });
  });
}

function runMenuAction(id) {
  const t = getActive();
  switch (id) {
    case 'new-tab':    createTab(HOME_URL, { focusUrl: true }); break;
    case 'find':       openFind(); break;
    case 'open-file':  openFile(); break;
    case 'reload':     reloadActive(); break;
    case 'reload-hard': if (t) safe(() => t.view.reloadIgnoringCache()); break;
    case 'print':      if (t) safe(() => t.view.print()); break;
    case 'zoom-in':    zoomBy(0.1); break;
    case 'zoom-out':   zoomBy(-0.1); break;
    case 'zoom-reset': zoomReset(); break;
    case 'devtools':   toggleDevToolsAtiva(); break;
    case 'fullscreen': if (window.calopsia) window.calopsia.toggleFullscreen(); break;
    case 'update':     if (window.calopsia) window.calopsia.updateAction(); break;
    case 'about':        openAbout(); break;
    case 'senhas':       createTab(SENHAS_URL); break;
    case 'gerar-senha':  gerarSenhaFortes(); break;
    case 'theme-system': definirTema('system'); break;
    case 'theme-light':  definirTema('light'); break;
    case 'theme-dark':   definirTema('dark'); break;
    case 'close-tab':    closeTab(activeId); break;
  }
}

if (window.calopsia) window.calopsia.onMenuAction((id) => { menuOpen = false; menuBtn.classList.remove('on'); runMenuAction(id); });

/* Comandos do menu nativo (Ver → recarregar/devtools/zoom): agem na
   PÁGINA da aba ativa, não na interface do navegador. */
if (window.calopsia) window.calopsia.onAppCommand(runMenuAction);

/* ------------------------------------------------------------
   Senhas: quando um campo de login recebe o foco, a janelinha com as
   contas salvas aparece logo abaixo dele.
   ------------------------------------------------------------ */
if (window.calopsia) {
  window.calopsia.onCampoSenha(({ contentsId, tipo, rect }) => {
    const t = getActive();
    if (!t || !rect) return;
    if (safe(() => t.view.getWebContentsId()) !== contentsId) return;   // aba em segundo plano

    const caixa = t.view.getBoundingClientRect();
    const z = t.zoom || 1;
    window.calopsia.senhasAbrirPopup({
      x: Math.round(caixa.left + rect.x * z),
      y: Math.round(caixa.top + rect.y * z),
      contentsId, tipo, url: t.url
    });
  });

  window.calopsia.onSenhaGerada((senha) => {
    window.calopsia.copiar(senha);
    toast(`Senha sugerida e copiada: ${senha}`, { ok: true });
  });
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
  el.innerHTML = '<span class="t-dot"></span><span class="t-label"></span>';
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
      el.innerHTML = '<span class="t-dot"></span><span class="t-label"></span><span class="t-bar"><span></span></span>';
      toasts.appendChild(el);
      dlCount++;
      updateDlBadge();
    }
    el.querySelector('.t-label').textContent = `Baixando ${info.name}`;
    const total = info.total || 0;
    el.querySelector('.t-bar span').style.width = (total ? Math.min(100, (info.received / total) * 100) : 0) + '%';
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
  const label = document.querySelector('.toast .t-label');
  if (label && window.calopsia) window.calopsia.showItemInFolder(label.textContent.replace(/^Baixando /, ''));
});

/* ============================ eventos ============================ */
backBtn.addEventListener('click', goBack);
fwdBtn.addEventListener('click', goForward);
reloadBtn.addEventListener('click', reloadActive);
homeBtn.addEventListener('click', () => {
  const t = getActive();
  if (!t) return;
  t.error = null;
  safe(() => t.view.loadURL(HOME_URL));
  renderActiveView();
});
newTabBtn.addEventListener('click', () => createTab(HOME_URL, { focusUrl: true }));
menuBtn.addEventListener('click', toggleMenu);
findBtn.addEventListener('click', openFind);

urlInput.addEventListener('input', () => { userTyping = true; });
urlInput.addEventListener('blur', () => { userTyping = false; updateAddressBar(); });
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); navigateFromInput(); }
  else if (e.key === 'Escape') { e.preventDefault(); userTyping = false; updateAddressBar(); urlInput.blur(); }
});
urlInput.addEventListener('focus', () => urlInput.select());

findInput.addEventListener('input', () => runFind(true));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runFind(!e.shiftKey); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
$('find-prev').addEventListener('click', () => runFind(false));
$('find-next').addEventListener('click', () => runFind(true));
$('find-close').addEventListener('click', closeFind);

$('err-retry').addEventListener('click', () => {
  const t = getActive();
  if (t) { t.error = null; safe(() => t.view.reload()); }
  renderActiveView();
});
$('err-home').addEventListener('click', () => {
  const t = getActive();
  if (t) { t.error = null; safe(() => t.view.loadURL(HOME_URL)); }
  renderActiveView();
});

if (window.calopsia) {
  winMin.addEventListener('click', () => window.calopsia.minimize());
  winMax.addEventListener('click', () => window.calopsia.maximize());
  winClose.addEventListener('click', () => window.calopsia.close());

  window.calopsia.onMaximizeChange((max) => document.body.classList.toggle('maximized', !!max));
  window.calopsia.onFullscreenChange((fs) => {
    document.body.classList.toggle('fullscreen', !!fs);
    $('titlebar').style.display = fs ? 'none' : '';
    $('toolbar').style.display = fs ? 'none' : '';
    $('statusbar').style.display = fs ? 'none' : '';
  });

  window.calopsia.onNewTab((url) => createTab(url || HOME_URL, { focusUrl: !url }));
  window.calopsia.onCloseTab(() => closeTab(activeId));
}

$('titlebar').addEventListener('dblclick', (e) => {
  if (e.target.closest('.tab, button')) return;
  if (window.calopsia) window.calopsia.maximize();
});

document.addEventListener('mousedown', (e) => {
  if (menuOpen && !e.target.closest('#menu')) closeMenu();
});

/* redimensionar a janela (inclusive maximizar/restaurar) reajusta as abas */
window.addEventListener('resize', () => requestAnimationFrame(relayoutViews));

/* --------------------------- atalhos --------------------------- */
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (e.key === 'Escape') {
    if (!findBar.hidden) { closeFind(); return; }
    if (menuOpen) { closeMenu(); return; }
  }
  if (e.key === 'F5')  { e.preventDefault(); reloadActive(); return; }
  if (e.key === 'F11') { e.preventDefault(); if (window.calopsia) window.calopsia.toggleFullscreen(); return; }
  if (e.key === 'F12' || (mod && e.shiftKey && key === 'i')) {
    e.preventDefault();
    toggleDevToolsAtiva();
    return;
  }

  if (!mod) {
    if (e.altKey && e.key === 'ArrowLeft')       { e.preventDefault(); goBack(); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    else if (e.altKey && e.key === 'Home')       { e.preventDefault(); homeBtn.click(); }
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
    case 'p': e.preventDefault(); { const t2 = getActive(); if (t2) safe(() => t2.view.print()); break; }
    case 'q': break;
    default:
      if (key === '=' || key === '+') { e.preventDefault(); zoomBy(0.1); }
      else if (key === '-')           { e.preventDefault(); zoomBy(-0.1); }
      else if (key === '0')           { e.preventDefault(); zoomReset(); }
      else if (/^[1-8]$/.test(key))   { const t3 = tabs[Number(key) - 1]; if (t3) activateTab(t3.id); }
      else if (key === '9')           { const t4 = tabs[tabs.length - 1]; if (t4) activateTab(t4.id); }
  }
});

/* ============================ boot ============================ */
(async function boot() {
  if (window.calopsia) {
    try {
      const [dir, tema] = await Promise.all([window.calopsia.getAppPath(), window.calopsia.getTheme()]);
      APP_DIR = dir;
      temaFonte = tema.source;
    } catch { /* segue sem preload nas abas */ }
    window.calopsia.onTheme((info) => { temaFonte = info.source; });
  }
  createTab(HOME_URL, { focusUrl: true });
})();

window.__calopsia = {
  get tabs() { return tabs; },
  get active() { return getActive(); },
  createTab, activateTab, closeTab, toUrl, looksLikeUrl, toggleMenu, runMenuAction
};
