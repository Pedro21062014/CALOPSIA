'use strict';

/* ─── Platform detection ────────────────────────────────────────── */
const platform = navigator.userAgentData?.platform?.toLowerCase()
  || navigator.platform.toLowerCase();
if (platform.includes('mac'))   document.body.classList.add('mac');
else if (platform.includes('win')) document.body.classList.add('win');
else document.body.classList.add('linux');

/* ─── State ─────────────────────────────────────────────────────── */
let tabs       = [];
let activeTabId = null;
let bookmarks  = [];
let currentPanel = 'bookmarks';

/* ─── DOM refs ──────────────────────────────────────────────────── */
const $tabsList    = document.getElementById('tabs-list');
const $omnibox     = document.getElementById('omnibox');
const $btnBack     = document.getElementById('btn-back');
const $btnForward  = document.getElementById('btn-forward');
const $btnReload   = document.getElementById('btn-reload');
const $btnNewTab   = document.getElementById('btn-new-tab');
const $btnBM       = document.getElementById('btn-bookmark-toggle');
const $btnMenu     = document.getElementById('btn-menu');
const $btnDevtools = document.getElementById('btn-devtools');
const $btnZoomIn   = document.getElementById('btn-zoom-in');
const $btnZoomOut  = document.getElementById('btn-zoom-out');
const $sidePanel   = document.getElementById('side-panel');
const $panelContent= document.getElementById('panel-content');
const $panelSearch = document.getElementById('panel-search');
const $dropdown    = document.getElementById('dropdown-menu');
const $toast       = document.getElementById('toast');
const $secure      = document.getElementById('omnibox-secure');

/* ─── Helpers ───────────────────────────────────────────────────── */
function getActiveTab() { return tabs.find(t => t.id === activeTabId); }

function showToast(msg, ms = 2000) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  setTimeout(() => $toast.classList.remove('show'), ms);
}

let toastTimer;
function queueToast(msg) {
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => showToast(msg), 100);
}

/* ─── Omnibox ───────────────────────────────────────────────────── */
function updateOmnibox(tab) {
  if (!tab || tab.id !== activeTabId) return;
  $omnibox.value = tab.url || '';
  const secure = tab.url?.startsWith('https://');
  $secure.style.color = secure ? '#4caf88' : '#f5a623';
  $secure.title = secure ? 'Secure connection' : 'Not secure';
  updateBookmarkBtn(tab.url);
}

$omnibox.addEventListener('focus', () => $omnibox.select());
$omnibox.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const tab = getActiveTab();
    if (tab) window.calopsia.navigate(tab.id, $omnibox.value);
    $omnibox.blur();
  }
  if (e.key === 'Escape') $omnibox.blur();
});

/* ─── Nav buttons ───────────────────────────────────────────────── */
$btnBack.addEventListener('click',    () => { const t = getActiveTab(); t && window.calopsia.tabBack(t.id); });
$btnForward.addEventListener('click', () => { const t = getActiveTab(); t && window.calopsia.tabForward(t.id); });
$btnReload.addEventListener('click',  () => {
  const t = getActiveTab();
  if (!t) return;
  if ($btnReload.dataset.state === 'stop') window.calopsia.tabStop(t.id);
  else window.calopsia.tabReload(t.id);
});
$btnNewTab.addEventListener('click',  () => window.calopsia.tabNew());
$btnDevtools.addEventListener('click',() => { const t = getActiveTab(); t && window.calopsia.openDevtools(t.id); });
$btnZoomIn.addEventListener('click',  () => { const t = getActiveTab(); t && window.calopsia.zoomIn(t.id); });
$btnZoomOut.addEventListener('click', () => { const t = getActiveTab(); t && window.calopsia.zoomOut(t.id); });

/* Window controls */
document.getElementById('btn-minimize')?.addEventListener('click', () => window.calopsia.minimize());
document.getElementById('btn-maximize')?.addEventListener('click', () => window.calopsia.maximize());
document.getElementById('btn-close')?.addEventListener('click',    () => window.calopsia.close());

/* ─── Keyboard shortcuts ────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 't') { e.preventDefault(); window.calopsia.tabNew(); }
  if (ctrl && e.key === 'w') { e.preventDefault(); const t = getActiveTab(); t && window.calopsia.tabClose(t.id); }
  if (ctrl && e.key === 'l') { e.preventDefault(); $omnibox.focus(); $omnibox.select(); }
  if (ctrl && e.key === 'r') { e.preventDefault(); const t = getActiveTab(); t && window.calopsia.tabReload(t.id); }
  if (ctrl && e.key === '=') { e.preventDefault(); const t = getActiveTab(); t && window.calopsia.zoomIn(t.id); }
  if (ctrl && e.key === '-') { e.preventDefault(); const t = getActiveTab(); t && window.calopsia.zoomOut(t.id); }
  if (ctrl && e.key === '0') { e.preventDefault(); const t = getActiveTab(); t && window.calopsia.zoomReset(t.id); }
  if (ctrl && e.key === 'b') { e.preventDefault(); togglePanel('bookmarks'); }
  if (ctrl && e.key === 'h') { e.preventDefault(); togglePanel('history'); }
  if (e.key === 'F12') { const t = getActiveTab(); t && window.calopsia.openDevtools(t.id); }
  if (e.key === 'Escape') closeDropdown();
  // Tab switching
  if (ctrl && e.key >= '1' && e.key <= '9') {
    const i = parseInt(e.key) - 1;
    if (tabs[i]) window.calopsia.tabSwitch(tabs[i].id);
  }
});

/* ─── Tab rendering ─────────────────────────────────────────────── */
function renderTabs() {
  $tabsList.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
    el.dataset.id = tab.id;

    // Loading / favicon
    let mediaHtml = '';
    if (tab.loading) {
      mediaHtml = `<div class="tab-spinner"></div>`;
    } else if (tab.favicon) {
      mediaHtml = `<img class="tab-favicon" src="${escHtml(tab.favicon)}" alt="" onerror="this.style.display='none'"/>`;
    } else {
      mediaHtml = `<div class="tab-favicon-default"><svg viewBox="0 0 14 14" width="12" height="12"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.3" fill="none"/></svg></div>`;
    }

    el.innerHTML = `
      ${mediaHtml}
      <span class="tab-title">${escHtml(tab.title || 'New Tab')}</span>
      <button class="tab-close" data-id="${tab.id}" title="Close tab">
        <svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
    `;

    el.addEventListener('click', e => {
      if (e.target.closest('.tab-close')) return;
      window.calopsia.tabSwitch(tab.id);
    });
    el.querySelector('.tab-close').addEventListener('click', e => {
      e.stopPropagation();
      window.calopsia.tabClose(tab.id);
    });

    $tabsList.appendChild(el);
  });
}

function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ─── IPC events ────────────────────────────────────────────────── */
window.calopsia.on('tab-created', tab => {
  tabs.push(tab);
  if (tab.active) {
    activeTabId = tab.id;
    updateOmnibox(tab);
  }
  renderTabs();
});

window.calopsia.on('tab-closed', ({ id }) => {
  tabs = tabs.filter(t => t.id !== id);
  renderTabs();
});

window.calopsia.on('tab-activated', ({ id }) => {
  activeTabId = id;
  renderTabs();
  const tab = getActiveTab();
  updateOmnibox(tab);
  if (tab) {
    $btnReload.dataset.state = tab.loading ? 'stop' : 'reload';
    window.calopsia.tabCanNav(id);
  }
});

window.calopsia.on('tab-updated', data => {
  const tab = tabs.find(t => t.id === data.id);
  if (!tab) return;
  Object.assign(tab, data);
  renderTabs();
  if (data.id === activeTabId) {
    if (data.url !== undefined) {
      updateOmnibox(tab);
      window.calopsia.addHistory({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon });
    }
    if (data.loading !== undefined) {
      $btnReload.dataset.state = data.loading ? 'stop' : 'reload';
      window.calopsia.tabCanNav(data.id);
    }
  }
});

window.calopsia.on('tab-can-nav', ({ id, canGoBack, canGoForward }) => {
  if (id !== activeTabId) return;
  $btnBack.disabled    = !canGoBack;
  $btnForward.disabled = !canGoForward;
});

window.calopsia.on('window-state', state => {
  // update maximize icon
  const svg = document.querySelector('#btn-maximize svg rect');
  if (svg && state === 'maximized') svg.setAttribute('rx', '4');
  else if (svg) svg.setAttribute('rx', '1');
});

window.calopsia.on('bookmarks-updated', bms => {
  bookmarks = bms;
  if (currentPanel === 'bookmarks' && !$sidePanel.classList.contains('hidden')) renderPanel();
  updateBookmarkBtn(getActiveTab()?.url);
});

/* ─── Bookmarks ─────────────────────────────────────────────────── */
function updateBookmarkBtn(url) {
  if (!url) { $btnBM.classList.remove('active'); return; }
  const isBM = bookmarks.some(b => b.url === url);
  $btnBM.classList.toggle('active', isBM);
}

$btnBM.addEventListener('click', async () => {
  const tab = getActiveTab();
  if (!tab) return;
  const isBM = bookmarks.some(b => b.url === tab.url);
  if (isBM) {
    window.calopsia.removeBookmark(tab.url);
    queueToast('Bookmark removed');
  } else {
    window.calopsia.addBookmark({ url: tab.url, title: tab.title || tab.url, favicon: tab.favicon || '' });
    queueToast('Bookmark added');
  }
});

/* ─── Side Panel ────────────────────────────────────────────────── */
async function renderPanel() {
  let items = [];
  if (currentPanel === 'bookmarks') {
    items = await window.calopsia.getBookmarks();
  } else {
    items = await window.calopsia.getHistory();
  }

  const query = $panelSearch.value.toLowerCase();
  if (query) items = items.filter(i => (i.title + i.url).toLowerCase().includes(query));

  if (items.length === 0) {
    $panelContent.innerHTML = `<div class="panel-empty">No ${currentPanel} yet</div>`;
    return;
  }

  $panelContent.innerHTML = items.slice(0, 200).map(item => `
    <div class="panel-item" data-url="${escHtml(item.url)}">
      ${item.favicon ? `<img src="${escHtml(item.favicon)}" alt="" onerror="this.src=''"/>` : '<div style="width:14px"></div>'}
      <div class="panel-item-info">
        <div class="panel-item-title">${escHtml(item.title || item.url)}</div>
        <div class="panel-item-url">${escHtml(item.url)}</div>
      </div>
      ${currentPanel === 'bookmarks' ? `
        <button class="panel-item-remove" data-url="${escHtml(item.url)}" title="Remove">
          <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>` : ''}
    </div>
  `).join('');

  $panelContent.querySelectorAll('.panel-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.panel-item-remove')) return;
      const url = el.dataset.url;
      const tab = getActiveTab();
      if (tab) window.calopsia.navigate(tab.id, url);
      else window.calopsia.tabNew(url);
    });
    el.querySelector('.panel-item-remove')?.addEventListener('click', e => {
      e.stopPropagation();
      window.calopsia.removeBookmark(el.dataset.url);
    });
  });
}

function togglePanel(panel) {
  if (!$sidePanel.classList.contains('hidden') && currentPanel === panel) {
    $sidePanel.classList.add('hidden');
    return;
  }
  currentPanel = panel;
  $sidePanel.classList.remove('hidden');
  document.querySelectorAll('.panel-tab').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
  renderPanel();
}

document.querySelectorAll('.panel-tab').forEach(btn => {
  btn.addEventListener('click', () => togglePanel(btn.dataset.panel));
});
$panelSearch.addEventListener('input', () => renderPanel());

/* ─── Dropdown Menu ─────────────────────────────────────────────── */
function closeDropdown() { $dropdown.classList.add('hidden'); }

$btnMenu.addEventListener('click', e => {
  e.stopPropagation();
  $dropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => closeDropdown());
$dropdown.addEventListener('click', e => e.stopPropagation());

$dropdown.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const tab = getActiveTab();
    closeDropdown();
    switch (action) {
      case 'new-tab':          window.calopsia.tabNew(); break;
      case 'history-panel':    togglePanel('history');   break;
      case 'bookmarks-panel':  togglePanel('bookmarks'); break;
      case 'zoom-in':          tab && window.calopsia.zoomIn(tab.id);    break;
      case 'zoom-out':         tab && window.calopsia.zoomOut(tab.id);   break;
      case 'zoom-reset':       tab && window.calopsia.zoomReset(tab.id); break;
      case 'devtools':         tab && window.calopsia.openDevtools(tab.id); break;
    }
  });
});

/* ─── Init ──────────────────────────────────────────────────────── */
(async () => {
  bookmarks = await window.calopsia.getBookmarks();
  $btnBack.disabled    = true;
  $btnForward.disabled = true;
})();
