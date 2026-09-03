'use strict';

// ════════════════════════════════════════════════════════════
//  CALOPSIA BROWSER  –  Renderer / UI Logic
// ════════════════════════════════════════════════════════════

const api = window.calopsiaAPI;

// ── State ───────────────────────────────────────────────────
let tabs = [];
let activeTabId = null;
let settings = {};
let downloads = [];

// ── DOM helpers ─────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ── Quick links data ─────────────────────────────────────────
const QUICKLINKS = [
  { label: 'Google',    url: 'https://google.com',    icon: '🔍', bg: '#e8f0fe' },
  { label: 'YouTube',   url: 'https://youtube.com',   icon: '▶',  bg: '#fee2e2' },
  { label: 'GitHub',    url: 'https://github.com',    icon: '⚡',  bg: '#f3f4f6' },
  { label: 'Reddit',    url: 'https://reddit.com',    icon: '🔴', bg: '#fff7ed' },
  { label: 'X',         url: 'https://x.com',         icon: '✖',  bg: '#fafafa' },
  { label: 'Wikipedia', url: 'https://wikipedia.org', icon: '📖', bg: '#f0fdf4' },
];

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════
async function init() {
  settings = await api.getSettings();
  applyTheme(settings.theme);
  setupWindowControls();
  setupNavbar();
  setupPanels();
  setupNewTabPage();
  setupDownloads();
  openNewTab();          // open a blank tab on startup
  startClock();
}

// ════════════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════════════
async function applyTheme(pref) {
  let resolved = pref;
  if (pref === 'system') resolved = await api.getTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  api.setTheme(pref);
}

// ════════════════════════════════════════════════════════════
//  WINDOW CONTROLS
// ════════════════════════════════════════════════════════════
function setupWindowControls() {
  const isMac  = api.platform === 'darwin';
  const macCtl = $('#macos-controls');
  const winCtl = $('#win-controls');

  if (isMac) {
    macCtl.classList.remove('hidden');
    $('#btn-close').onclick = () => api.close();
    $('#btn-min').onclick   = () => api.minimize();
    $('#btn-max').onclick   = () => api.maximize();
  } else {
    winCtl.classList.remove('hidden');
    $('#btn-close-win').onclick = () => api.close();
    $('#btn-min-win').onclick   = () => api.minimize();
    $('#btn-max-win').onclick   = () => api.maximize();
  }
}

// ════════════════════════════════════════════════════════════
//  TABS
// ════════════════════════════════════════════════════════════
function createTabData(url) {
  return {
    id: Date.now() + Math.random(),
    url: url || '',
    title: url ? 'Loading…' : 'New Tab',
    favicon: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

function openNewTab(url) {
  const tab = createTabData(url);
  tabs.push(tab);
  activeTabId = tab.id;
  renderTabs();
  createWebview(tab);
  if (url) navigate(tab.id, url);
  else showNewTab(tab.id);
  return tab;
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;

  // Remove webview
  const wv = getWebview(id);
  if (wv) wv.remove();

  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    openNewTab();
    return;
  }
  // Switch to adjacent tab
  const newIdx = Math.min(idx, tabs.length - 1);
  setActiveTab(tabs[newIdx].id);
  renderTabs();
}

function setActiveTab(id) {
  activeTabId = id;
  // Show/hide webviews
  $$('#content-area webview').forEach(wv => wv.classList.remove('active'));
  const wv = getWebview(id);
  if (wv) wv.classList.add('active');

  // Show/hide new tab page
  const tab = tabs.find(t => t.id === id);
  if (tab && !tab.url) {
    $('#newtab-page').classList.remove('hidden');
  } else {
    $('#newtab-page').classList.add('hidden');
  }

  // Update omnibox
  syncOmnibox();
  updateNavButtons();
  renderTabs();
}

function renderTabs() {
  const list = $('#tabs-list');
  list.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.id = tab.id;

    // favicon / spinner
    if (tab.loading) {
      el.innerHTML = `<div class="tab-loading"></div>`;
    } else if (tab.favicon) {
      el.innerHTML = `<img class="tab-favicon" src="${tab.favicon}" onerror="this.style.display='none'" />`;
    } else {
      el.innerHTML = `<img class="tab-favicon tab-brand-icon" src="../../assets/icon.png" alt="" />`;
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'New Tab';
    el.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };
    el.appendChild(closeBtn);

    el.onclick = () => setActiveTab(tab.id);
    list.appendChild(el);
  });
}

// ════════════════════════════════════════════════════════════
//  WEBVIEWS
// ════════════════════════════════════════════════════════════
function createWebview(tab) {
  const container = $('#content-area');
  const wv = document.createElement('webview');
  wv.setAttribute('data-tab-id', tab.id);
  wv.setAttribute('allowpopups', 'true');
  wv.setAttribute('webpreferences', 'contextIsolation=true');
  if (tab.url) wv.setAttribute('src', tab.url);

  // Events
  wv.addEventListener('did-start-loading', () => {
    updateTab(tab.id, { loading: true });
  });
  wv.addEventListener('did-stop-loading', () => {
    updateTab(tab.id, { loading: false });
  });
  wv.addEventListener('did-navigate', (e) => {
    updateTab(tab.id, { url: e.url, loading: false });
    updateTabNavState(tab.id);
    if (tab.id === activeTabId) syncOmnibox();
    // Save to history
    const t = tabs.find(x => x.id === tab.id);
    if (t && e.url && !e.url.startsWith('about:')) {
      api.addHistory({ title: t.title || e.url, url: e.url });
    }
  });
  wv.addEventListener('did-navigate-in-page', (e) => {
    updateTab(tab.id, { url: e.url });
    if (tab.id === activeTabId) syncOmnibox();
    updateTabNavState(tab.id);
  });
  wv.addEventListener('page-title-updated', (e) => {
    updateTab(tab.id, { title: e.title });
  });
  wv.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons && e.favicons[0]) updateTab(tab.id, { favicon: e.favicons[0] });
  });
  wv.addEventListener('new-window', (e) => {
    openNewTab(e.url);
  });

  container.appendChild(wv);

  if (tab.id === activeTabId) {
    wv.classList.add('active');
  }
  return wv;
}

function getWebview(id) {
  return $(`#content-area webview[data-tab-id="${CSS.escape(id)}"]`);
}

function updateTab(id, patch) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  Object.assign(tab, patch);
  if (id === activeTabId) {
    updateNavButtons();
    syncOmnibox();
  }
  renderTabs();
}

function updateTabNavState(id) {
  const wv = getWebview(id);
  if (!wv) return;
  updateTab(id, {
    canGoBack: wv.canGoBack(),
    canGoForward: wv.canGoForward(),
  });
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════
function navigate(tabId, input) {
  let url = input.trim();
  if (!url) return;
  // If it looks like a URL
  if (/^https?:\/\//i.test(url) || /^file:\/\//i.test(url)) {
    // ok
  } else if (/^localhost|127\.0\.0\.1/.test(url)) {
    url = 'http://' + url;
  } else if (/^[a-z0-9-]+\.[a-z]{2,}(\/|$)/i.test(url) && !url.includes(' ')) {
    url = 'https://' + url;
  } else {
    // Search
    url = settings.searchEngine + encodeURIComponent(url);
  }

  const wv = getWebview(tabId);
  if (wv) {
    wv.setAttribute('src', url);
    updateTab(tabId, { url, title: 'Loading…', loading: true });
    $('#newtab-page').classList.add('hidden');
  }
}

function showNewTab(tabId) {
  $('#newtab-page').classList.remove('hidden');
  updateTab(tabId, { url: '', title: 'New Tab' });
}

// ── Omnibox sync ─────────────────────────────────────────────
function syncOmnibox() {
  const tab = tabs.find(t => t.id === activeTabId);
  const omni = $('#omnibox');
  if (!omni) return;
  if (document.activeElement !== omni) {
    omni.value = tab ? (tab.url || '') : '';
  }
  // SSL icon
  const ssl = $('#ssl-icon');
  if (tab && tab.url && tab.url.startsWith('https://')) {
    ssl.textContent = '🔒';
    ssl.title = 'Secure connection';
  } else if (tab && tab.url && tab.url.startsWith('http://')) {
    ssl.textContent = '⚠️';
    ssl.title = 'Not secure';
  } else {
    ssl.textContent = '🌐';
    ssl.title = '';
  }
}

function updateNavButtons() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  const wv = getWebview(activeTabId);
  $('#btn-back').disabled    = !(wv && wv.canGoBack());
  $('#btn-forward').disabled = !(wv && wv.canGoForward());
}

// ════════════════════════════════════════════════════════════
//  NAVBAR SETUP
// ════════════════════════════════════════════════════════════
function setupNavbar() {
  const omni   = $('#omnibox');
  const clear  = $('#omnibox-clear');

  $('#btn-new-tab').onclick = () => openNewTab();
  $('#btn-back').onclick    = () => { const wv = getWebview(activeTabId); wv?.goBack(); };
  $('#btn-forward').onclick = () => { const wv = getWebview(activeTabId); wv?.goForward(); };
  $('#btn-reload').onclick  = () => {
    const wv = getWebview(activeTabId);
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab?.loading) wv?.stop();
    else wv?.reload();
  };
  $('#btn-home').onclick = () => navigate(activeTabId, settings.homepage);

  // Omnibox
  omni.addEventListener('focus', () => { omni.select(); });
  omni.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      navigate(activeTabId, omni.value);
      omni.blur();
    }
    if (e.key === 'Escape') { omni.blur(); syncOmnibox(); }
  });
  clear.onclick = () => { omni.value = ''; omni.focus(); };

  // Nav panel buttons
  $('#btn-settings').onclick  = () => openPanel('settings');
  $('#btn-history').onclick   = () => openPanel('history');
  $('#btn-downloads').onclick = () => openPanel('downloads');
  $('#btn-bookmark').onclick  = () => toggleBookmark();
}

// ════════════════════════════════════════════════════════════
//  NEW TAB PAGE
// ════════════════════════════════════════════════════════════
function setupNewTabPage() {
  // Quick links
  const ql = $('#nt-quicklinks');
  QUICKLINKS.forEach(link => {
    const item = document.createElement('div');
    item.className = 'ql-item';
    item.innerHTML = `
      <div class="ql-icon" style="background:${link.bg}">${link.icon}</div>
      <span class="ql-label">${link.label}</span>`;
    item.onclick = () => navigate(activeTabId, link.url);
    ql.appendChild(item);
  });

  // Search
  const searchInput = $('#nt-search-input');
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      navigate(activeTabId, searchInput.value.trim());
      searchInput.value = '';
    }
  });
}

// ════════════════════════════════════════════════════════════
//  PANELS
// ════════════════════════════════════════════════════════════
function openPanel(name) {
  // Close all
  $$('.side-panel').forEach(p => p.classList.add('hidden'));
  $('#panel-overlay').classList.remove('hidden');
  $(`#panel-${name}`).classList.remove('hidden');

  if (name === 'settings')  loadSettings();
  if (name === 'history')   loadHistory();
  if (name === 'downloads') renderDownloads();
  if (name === 'bookmarks') loadBookmarks();
}

function closeAllPanels() {
  $$('.side-panel').forEach(p => p.classList.add('hidden'));
  $('#panel-overlay').classList.add('hidden');
}

function setupPanels() {
  $('#panel-overlay').onclick = closeAllPanels;
  $$('.panel-close').forEach(btn => btn.onclick = closeAllPanels);
  setupSettingsPanel();
  setupHistoryPanel();
  setupBookmarksPanel();
}

// ── Settings ─────────────────────────────────────────────────
function loadSettings() {
  $('#cfg-homepage').value = settings.homepage;
  $('#cfg-search').value   = settings.searchEngine;
  $('#cfg-theme').value    = settings.theme;
  $('#cfg-adblock').checked = settings.adBlock;
  $('#cfg-js').checked      = settings.javascript;
}

function setupSettingsPanel() {
  $('#cfg-save').onclick = async () => {
    settings.homepage    = $('#cfg-homepage').value;
    settings.searchEngine = $('#cfg-search').value;
    settings.theme       = $('#cfg-theme').value;
    settings.adBlock     = $('#cfg-adblock').checked;
    settings.javascript  = $('#cfg-js').checked;
    await api.setSettings(settings);
    applyTheme(settings.theme);
    closeAllPanels();
    toast('Settings saved!');
  };
  $('#cfg-clear-history').onclick = async () => {
    if (!confirm('Clear all browsing history?')) return;
    await api.clearHistory();
    toast('History cleared');
  };
}

// ── History ──────────────────────────────────────────────────
async function loadHistory() {
  const history = await api.getHistory();
  renderHistoryList(history);

  $('#hist-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    renderHistoryList(history.filter(h =>
      h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q)
    ));
  };
}

function renderHistoryList(items) {
  const list = $('#hist-list');
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<p class="empty-msg">No history yet.</p>';
    return;
  }
  items.slice(0, 200).forEach(item => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `
      <span class="li-icon">🕐</span>
      <div class="li-text">
        <div class="li-title">${escHtml(item.title || item.url)}</div>
        <div class="li-url">${escHtml(item.url)}</div>
      </div>
      <span class="li-date">${formatDate(item.date)}</span>`;
    li.onclick = () => { closeAllPanels(); navigate(activeTabId, item.url); };
    list.appendChild(li);
  });
}

function setupHistoryPanel() {}

// ── Bookmarks ─────────────────────────────────────────────────
async function toggleBookmark() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !tab.url) { toast('Nothing to bookmark'); return; }
  const bookmarks = await api.getBookmarks();
  const existing = bookmarks.find(b => b.url === tab.url);
  if (existing) {
    await api.removeBookmark(existing.id);
    $('#btn-bookmark').textContent = '☆';
    toast('Bookmark removed');
  } else {
    await api.addBookmark({ url: tab.url, title: tab.title || tab.url });
    $('#btn-bookmark').textContent = '★';
    toast('Bookmarked!');
  }
}

async function loadBookmarks() {
  const bookmarks = await api.getBookmarks();
  renderBookmarkList(bookmarks);

  $('#bm-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    renderBookmarkList(bookmarks.filter(b =>
      b.url.toLowerCase().includes(q) || (b.title || '').toLowerCase().includes(q)
    ));
  };
}

function renderBookmarkList(items) {
  const list = $('#bm-list');
  const empty = $('#bm-empty');
  list.innerHTML = '';
  if (!items.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.innerHTML = `
      <span class="li-icon">★</span>
      <div class="li-text">
        <div class="li-title">${escHtml(item.title || item.url)}</div>
        <div class="li-url">${escHtml(item.url)}</div>
      </div>
      <button class="li-del" title="Remove">✕</button>`;
    li.querySelector('.li-del').onclick = async (e) => {
      e.stopPropagation();
      await api.removeBookmark(item.id);
      loadBookmarks();
      toast('Bookmark removed');
    };
    li.onclick = () => { closeAllPanels(); navigate(activeTabId, item.url); };
    list.appendChild(li);
  });
}

function setupBookmarksPanel() {}

// ════════════════════════════════════════════════════════════
//  DOWNLOADS
// ════════════════════════════════════════════════════════════
function setupDownloads() {
  api.onDownloadStarted((d) => {
    downloads.unshift({ ...d, progress: 0, done: false, state: 'progressing' });
    renderDownloads();
  });
  api.onDownloadProgress((d) => {
    const item = downloads.find(x => x.filename === d.filename);
    if (item) {
      item.receivedBytes = d.receivedBytes;
      item.totalBytes    = d.totalBytes;
      item.progress      = d.totalBytes ? (d.receivedBytes / d.totalBytes) * 100 : 0;
      item.state         = d.state;
    }
    renderDownloads();
  });
  api.onDownloadDone((d) => {
    const item = downloads.find(x => x.filename === d.filename);
    if (item) { item.done = true; item.state = d.state; item.progress = 100; }
    renderDownloads();
    toast(`Downloaded: ${d.filename}`);
  });
}

function renderDownloads() {
  const list  = $('#dl-list');
  const empty = $('#dl-empty');
  list.innerHTML = '';
  if (!downloads.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  downloads.forEach(d => {
    const li = document.createElement('li');
    li.className = 'dl-item';
    const pct = Math.round(d.progress || 0);
    const status = d.done ? (d.state === 'completed' ? '✅ Done' : '❌ Failed') : `${pct}%`;
    li.innerHTML = `
      <div class="dl-name">${escHtml(d.filename)}</div>
      <div class="dl-bar-wrap"><div class="dl-bar" style="width:${pct}%"></div></div>
      <div class="dl-info">${status}</div>`;
    list.appendChild(li);
  });
}

// ════════════════════════════════════════════════════════════
//  CLOCK
// ════════════════════════════════════════════════════════════
function startClock() {
  function tick() {
    const el = $('#nt-clock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

// ════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ════════════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 't') { e.preventDefault(); openNewTab(); }
  if (mod && e.key === 'w') { e.preventDefault(); closeTab(activeTabId); }
  if (mod && e.key === 'l') { e.preventDefault(); $('#omnibox').focus(); }
  if (mod && e.key === 'r') { e.preventDefault(); getWebview(activeTabId)?.reload(); }
  if (mod && e.shiftKey && e.key === 'H') openPanel('history');
  if (mod && e.shiftKey && e.key === 'B') openPanel('bookmarks');
  if (mod && e.key === 'd') { e.preventDefault(); toggleBookmark(); }
  // Tab switching
  if (mod && e.key === 'Tab') {
    e.preventDefault();
    const idx = tabs.findIndex(t => t.id === activeTabId);
    const next = e.shiftKey
      ? (idx - 1 + tabs.length) % tabs.length
      : (idx + 1) % tabs.length;
    setActiveTab(tabs[next].id);
  }
});

// ════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════
init();
