'use strict';

/* ============================================================
   CALOPSIA — lógica da interface (abas, navegação, atalhos)
   ============================================================ */

const tabstrip = document.getElementById('tabstrip');
const views = document.getElementById('views');
const urlInput = document.getElementById('url-input');
const securityIcon = document.getElementById('security-icon');
const statusText = document.getElementById('status-text');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const reloadBtn = document.getElementById('reload');
const newTabBtn = document.getElementById('newtab');
const winMin = document.getElementById('win-min');
const winMax = document.getElementById('win-max');
const winClose = document.getElementById('win-close');

const HOME_URL = 'calopsia://newtab';
const SEARCH_URL = 'https://www.google.com/search?q=';

let tabs = [];
let activeId = null;
let seq = 0;

/* ----------------------- helpers ----------------------- */
const getTab = (id) => tabs.find((t) => t.id === id);
const getActive = () => getTab(activeId);

function isUrl(text) {
  if (/^calopsia:/i.test(text) || /^about:/i.test(text)) return true;
  if (/^(https?|ftp|file):\/\//i.test(text)) return true;
  // "exemplo.com", "exemplo.com/pagina", "localhost:3000"
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i.test(text) && !text.includes(' ')) return true;
  return false;
}

function toUrl(text) {
  if (isUrl(text)) {
    if (/^[a-z]+:\/\//i.test(text) || /^calopsia:/i.test(text) || /^about:/i.test(text)) {
      return text;
    }
    return 'https://' + text;
  }
  return SEARCH_URL + encodeURIComponent(text);
}

/* ----------------------- criação de abas ----------------------- */
function createTab(url, opts = {}) {
  const activate = opts.activate !== false;
  const focusUrl = !!opts.focusUrl;

  const id = ++seq;
  const tab = { id, url: url || HOME_URL, view: null, title: 'Nova aba' };
  tabs.push(tab);

  // --- aba (pill) ---
  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.id = id;
  el.innerHTML = `
    <img class="favicon" alt="" />
    <span class="tab-title">Nova aba</span>
    <button class="tab-close" title="Fechar aba">&times;</button>
  `;
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
  tabstrip.insertBefore(el, newTabBtn);
  tab.el = el;

  // --- webview ---
  const view = document.createElement('webview');
  view.setAttribute('partition', 'persist:calopsia');
  view.setAttribute('allowpopups', 'true');
  view.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
  view.dataset.tab = id;
  view.src = tab.url;
  views.appendChild(view);
  tab.view = view;

  bindView(tab);

  if (activate) activateTab(id);
  if (focusUrl) { urlInput.focus(); urlInput.select(); }
  return tab;
}

function bindView(tab) {
  const v = tab.view;

  v.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || 'Nova aba';
    tab.el.querySelector('.tab-title').textContent = tab.title;
    if (tab.id === activeId) updateDocumentTitle();
  });

  v.addEventListener('page-favicon-updated', (e) => {
    const fav = (e.favicons && e.favicons.length) ? e.favicons[0] : '';
    tab.el.querySelector('.favicon').src = fav;
  });

  v.addEventListener('did-navigate', (e) => {
    tab.url = e.url;
    if (tab.id === activeId) onActiveNavigated();
  });

  v.addEventListener('did-navigate-in-page', (e) => {
    tab.url = e.url;
    if (tab.id === activeId) onActiveNavigated();
  });

  v.addEventListener('did-start-loading', () => {
    if (tab.id !== activeId) return;
    reloadBtn.innerHTML = '&#10005;';
    statusText.textContent = 'Carregando…';
  });

  v.addEventListener('did-stop-loading', () => {
    if (tab.id !== activeId) return;
    reloadBtn.innerHTML = '&#x21bb;';
    statusText.textContent = 'Pronto';
    updateNavButtons();
  });

  v.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return; // navegação abortada
    if (tab.id === activeId) statusText.textContent = 'Falha ao carregar a página';
  });

  v.addEventListener('update-target-url', (e) => {
    if (tab.id === activeId && e.url) statusText.textContent = e.url;
  });
}

function onActiveNavigated() {
  updateAddressBar();
  updateNavButtons();
  updateDocumentTitle();
}

function updateDocumentTitle() {
  const tab = getActive();
  document.title = (tab && tab.title && tab.title !== 'Nova aba' ? tab.title + ' — ' : '') + 'CALOPSIA';
}

/* ----------------------- ativação / fechamento ----------------------- */
function activateTab(id) {
  activeId = id;
  tabs.forEach((t) => {
    const on = t.id === id;
    t.el.classList.toggle('active', on);
    t.view.style.display = on ? 'block' : 'none';
  });
  const tab = getTab(id);
  urlInput.value = tab.url === HOME_URL ? '' : tab.url;
  updateAddressBar();
  updateNavButtons();
  updateDocumentTitle();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  tab.el.remove();
  tab.view.remove();
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    createTab(HOME_URL);
    return;
  }
  if (activeId === id) {
    const next = tabs[Math.max(0, idx - 1)];
    activateTab(next.id);
  }
}

/* ----------------------- barra de endereço ----------------------- */
function updateAddressBar() {
  const tab = getActive();
  if (!tab) return;

  if (tab.url === HOME_URL) {
    urlInput.value = '';
    setSecurity('neutral', '&#9679;', 'Página inicial');
    return;
  }
  try {
    const u = new URL(tab.url);
    if (u.protocol === 'https:') setSecurity('secure', '&#128274;', 'Conexão segura (HTTPS)');
    else if (u.protocol === 'http:') setSecurity('insecure', '&#9888;', 'Conexão não segura (HTTP)');
    else setSecurity('neutral', '&#9679;', 'Página interna');
  } catch {
    setSecurity('neutral', '&#9679;', '');
  }
}

function setSecurity(cls, glyph, title) {
  securityIcon.className = 'security ' + cls;
  securityIcon.innerHTML = glyph;
  securityIcon.title = title;
}

function navigateFromInput() {
  const tab = getActive();
  if (!tab) return;
  const value = urlInput.value.trim();
  if (!value) return;
  tab.view.loadURL(toUrl(value)).catch(() => {});
}

/* ----------------------- botões de navegação ----------------------- */
function updateNavButtons() {
  const tab = getActive();
  if (!tab || !tab.view) return;
  backBtn.disabled = !tab.view.canGoBack();
  forwardBtn.disabled = !tab.view.canGoForward();
}

/* ----------------------- eventos ----------------------- */
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); navigateFromInput(); }
});
urlInput.addEventListener('focus', () => urlInput.select());

backBtn.addEventListener('click', () => getActive() && getActive().view.goBack());
forwardBtn.addEventListener('click', () => getActive() && getActive().view.goForward());
reloadBtn.addEventListener('click', () => {
  const tab = getActive();
  if (!tab) return;
  if (tab.view.isLoading()) tab.view.stop();
  else tab.view.reload();
});
newTabBtn.addEventListener('click', () => createTab(HOME_URL, { focusUrl: true }));

/* atalhos de teclado */
window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === 't') { e.preventDefault(); createTab(HOME_URL, { focusUrl: true }); }
  else if (mod && key === 'w') { e.preventDefault(); closeTab(activeId); }
  else if (mod && key === 'l') { e.preventDefault(); urlInput.focus(); urlInput.select(); }
  else if (mod && key === 'r') { e.preventDefault(); const t = getActive(); t && t.view.reload(); }
  else if (mod && key === 'n') { e.preventDefault(); createTab(HOME_URL); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); const t = getActive(); t && t.view.goBack(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); const t = getActive(); t && t.view.goForward(); }
});

/* ----------------------- controles de janela ----------------------- */
if (window.calopsia) {
  winMin.addEventListener('click', () => window.calopsia.minimize());
  winMax.addEventListener('click', () => window.calopsia.maximize());
  winClose.addEventListener('click', () => window.calopsia.close());
  window.calopsia.onMaximizeChange((maximized) => {
    winMax.innerHTML = maximized ? '&#x2750;' : '&#x25A1;';
    winMax.title = maximized ? 'Restaurar' : 'Maximizar';
  });
}

/* ----------------------- inicialização ----------------------- */
createTab(HOME_URL, { focusUrl: true });
