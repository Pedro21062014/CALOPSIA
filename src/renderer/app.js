'use strict';

const api = window.calopsia;
const elements = {
  tabs: document.querySelector('#tabs'),
  newTab: document.querySelector('#new-tab'),
  back: document.querySelector('#back'),
  forward: document.querySelector('#forward'),
  reload: document.querySelector('#reload'),
  reloadSymbol: document.querySelector('#reload-symbol'),
  home: document.querySelector('#home'),
  form: document.querySelector('#address-form'),
  address: document.querySelector('#address'),
  security: document.querySelector('#security'),
  securitySymbol: document.querySelector('#security-symbol'),
  downloads: document.querySelector('#downloads'),
  zoomChip: document.querySelector('#zoom-chip'),
  status: document.querySelector('#status'),
  version: document.querySelector('#version'),
  maximizeIcon: document.querySelector('#maximize-icon use'),
  findPanel: document.querySelector('#find-panel'),
  findInput: document.querySelector('#find-input'),
  findCount: document.querySelector('#find-count'),
  findPrevious: document.querySelector('#find-previous'),
  findNext: document.querySelector('#find-next'),
  findClose: document.querySelector('#find-close'),
};

let state = null;
let draggedTabId = null;
let findHasRun = false;

document.body.classList.add(`platform-${api.platform}`);

function iconUse(symbol) {
  return `<svg aria-hidden="true"><use href="#${symbol}"></use></svg>`;
}

function renderTabs(tabs, activeTabId) {
  elements.tabs.replaceChildren();

  for (const tab of tabs) {
    const node = document.createElement('div');
    node.className = `tab${tab.id === activeTabId ? ' active' : ''}`;
    node.dataset.id = String(tab.id);
    node.role = 'tab';
    node.tabIndex = tab.id === activeTabId ? 0 : -1;
    node.ariaSelected = tab.id === activeTabId ? 'true' : 'false';
    node.title = tab.title;
    node.draggable = true;

    if (tab.loading) {
      const spinner = document.createElement('span');
      spinner.className = 'tab-loading';
      spinner.ariaHidden = 'true';
      node.append(spinner);
    } else if (tab.favicon) {
      const favicon = document.createElement('img');
      favicon.className = 'tab-favicon';
      favicon.src = tab.favicon;
      favicon.alt = '';
      favicon.referrerPolicy = 'no-referrer';
      favicon.addEventListener('error', () => favicon.replaceWith(makePlaceholder()));
      node.append(favicon);
    } else {
      node.append(makePlaceholder());
    }

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'Nova aba';
    node.append(title);

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.type = 'button';
    close.title = 'Fechar aba';
    close.ariaLabel = `Fechar ${tab.title || 'aba'}`;
    close.innerHTML = iconUse('i-close');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      api.command('close-tab', { id: tab.id });
    });
    node.append(close);

    node.addEventListener('click', () => api.command('activate-tab', { id: tab.id }));
    node.addEventListener('auxclick', (event) => {
      if (event.button === 1) api.command('close-tab', { id: tab.id });
    });
    node.addEventListener('dblclick', () => api.command('duplicate-tab'));
    node.addEventListener('dragstart', (event) => {
      draggedTabId = tab.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(tab.id));
    });
    node.addEventListener('dragover', (event) => {
      event.preventDefault();
      node.classList.add('drag-over');
    });
    node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      node.classList.remove('drag-over');
      if (draggedTabId && draggedTabId !== tab.id) {
        api.command('reorder-tabs', { sourceId: draggedTabId, targetId: tab.id });
      }
      draggedTabId = null;
    });
    node.addEventListener('dragend', () => {
      draggedTabId = null;
      document.querySelectorAll('.drag-over').forEach((item) => item.classList.remove('drag-over'));
    });

    elements.tabs.append(node);
  }
}

function makePlaceholder() {
  const placeholder = document.createElement('span');
  placeholder.className = 'tab-favicon placeholder';
  placeholder.textContent = 'C';
  placeholder.ariaHidden = 'true';
  return placeholder;
}

function render(nextState) {
  if (!nextState) return;
  state = nextState;
  renderTabs(state.tabs, state.activeTabId);

  const active = state.active;
  if (!active) return;
  const addressIsFocused = document.activeElement === elements.address;
  if (!addressIsFocused) elements.address.value = active.url || '';

  elements.back.disabled = !active.canGoBack;
  elements.forward.disabled = !active.canGoForward;
  elements.reload.ariaLabel = active.loading ? 'Parar carregamento' : 'Recarregar';
  elements.reload.title = active.loading ? 'Parar carregamento' : 'Recarregar (Ctrl+R)';
  elements.reloadSymbol.setAttribute('href', active.loading ? '#i-stop' : '#i-reload');
  elements.form.classList.toggle('loading', active.loading);

  const security = active.security || { level: 'internal', label: 'CALOPSIA' };
  elements.security.className = `security-indicator ${security.level}`;
  elements.security.title = security.label;
  elements.security.ariaLabel = security.label;
  elements.securitySymbol.setAttribute(
    'href',
    security.level === 'secure'
      ? '#i-lock'
      : security.level === 'internal'
        ? '#i-search'
        : '#i-info',
  );

  elements.status.textContent = state.status || 'Pronto';
  elements.version.textContent = `v${state.version}`;
  elements.maximizeIcon.setAttribute('href', state.window.maximized ? '#i-restore' : '#i-maximize');

  elements.zoomChip.hidden = active.zoom === 100;
  elements.zoomChip.textContent = `${active.zoom}%`;
}

function focusAddress() {
  elements.address.focus();
  elements.address.select();
}

function showFind() {
  elements.findPanel.classList.add('open');
  elements.findPanel.ariaHidden = 'false';
  elements.findInput.focus();
  elements.findInput.select();
}

function closeFind() {
  elements.findPanel.classList.remove('open');
  elements.findPanel.ariaHidden = 'true';
  elements.findCount.textContent = '0/0';
  findHasRun = false;
  api.command('stop-find', { action: 'clearSelection' });
}

function find(forward = true) {
  const text = elements.findInput.value.trim();
  if (!text) {
    elements.findCount.textContent = '0/0';
    api.command('stop-find', { action: 'clearSelection' });
    findHasRun = false;
    return;
  }
  api.command('find', { text, forward, findNext: findHasRun });
  findHasRun = true;
}

elements.newTab.addEventListener('click', () => api.command('new-tab'));
elements.back.addEventListener('click', () => api.command('back'));
elements.forward.addEventListener('click', () => api.command('forward'));
elements.reload.addEventListener('click', () => api.command('reload'));
elements.home.addEventListener('click', () => api.command('home'));
elements.downloads.addEventListener('click', () => api.command('open-downloads'));
elements.zoomChip.addEventListener('click', () => api.command('zoom-reset'));

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  api.command('navigate', { value: elements.address.value });
  elements.address.blur();
});

elements.address.addEventListener('focus', () => elements.address.select());
elements.findInput.addEventListener('input', () => {
  findHasRun = false;
  find(true);
});
elements.findInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    find(event.shiftKey ? false : true);
  } else if (event.key === 'Escape') {
    closeFind();
  }
});
elements.findPrevious.addEventListener('click', () => find(false));
elements.findNext.addEventListener('click', () => find(true));
elements.findClose.addEventListener('click', closeFind);

document.querySelectorAll('[data-window]').forEach((button) => {
  button.addEventListener('click', () => api.windowCommand(button.dataset.window));
});

document.addEventListener('keydown', (event) => {
  const primary = api.platform === 'darwin' ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();

  if (primary && key === 'l') {
    event.preventDefault();
    focusAddress();
  } else if (primary && key === 't') {
    event.preventDefault();
    api.command('new-tab');
  } else if (primary && key === 'w' && !event.shiftKey) {
    event.preventDefault();
    api.command('close-tab');
  } else if (primary && event.shiftKey && key === 't') {
    event.preventDefault();
    api.command('reopen-closed-tab');
  } else if (primary && key === 'f') {
    event.preventDefault();
    showFind();
  } else if (event.key === 'Escape' && elements.findPanel.classList.contains('open')) {
    closeFind();
  }
});

api.onState(render);
api.onFocusAddress(focusAddress);
api.onShowFind(showFind);
api.onFindResult((result) => {
  const total = result.matches || 0;
  const activeMatch = total ? result.activeMatchOrdinal || 0 : 0;
  elements.findCount.textContent = `${activeMatch}/${total}`;
});

api.getState().then(render);
