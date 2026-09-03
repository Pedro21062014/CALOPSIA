let tabCount = 0;
let tabs = [];
let activeTabId = null;

const tabsListEl = document.getElementById('tabs');
const tabViewsEl = document.getElementById('tab-views');
const addressBar = document.getElementById('address-bar');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnHome = document.getElementById('btn-home');
const btnNewTab = document.getElementById('btn-new-tab');

function createTab(url = 'https://www.google.com') {
  const id = `tab-${tabCount++}`;
  
  // Create Tab Element
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.id = `tab-el-${id}`;
  
  const titleEl = document.createElement('div');
  titleEl.className = 'tab-title';
  titleEl.innerText = 'Loading...';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.innerText = '×';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeTab(id);
  };
  
  tabEl.appendChild(titleEl);
  tabEl.appendChild(closeBtn);
  tabEl.onclick = () => switchTab(id);
  
  tabsListEl.appendChild(tabEl);
  
  // Create Webview Element
  const webviewEl = document.createElement('webview');
  webviewEl.id = `webview-${id}`;
  webviewEl.setAttribute('src', url);
  webviewEl.setAttribute('allowpopups', 'true');
  
  webviewEl.addEventListener('did-start-loading', () => {
    if (activeTabId === id) addressBar.value = webviewEl.getURL();
  });
  
  webviewEl.addEventListener('did-stop-loading', () => {
    if (activeTabId === id) addressBar.value = webviewEl.getURL();
    titleEl.innerText = webviewEl.getTitle() || 'New Tab';
  });
  
  webviewEl.addEventListener('page-title-updated', (e) => {
    titleEl.innerText = e.title;
  });
  
  tabViewsEl.appendChild(webviewEl);
  
  const tab = { id, tabEl, webviewEl, titleEl };
  tabs.push(tab);
  
  switchTab(id);
}

function switchTab(id) {
  activeTabId = id;
  
  tabs.forEach(tab => {
    if (tab.id === id) {
      tab.tabEl.classList.add('active');
      tab.webviewEl.classList.add('active');
      addressBar.value = tab.webviewEl.getURL();
    } else {
      tab.tabEl.classList.remove('active');
      tab.webviewEl.classList.remove('active');
    }
  });
}

function closeTab(id) {
  const tabIndex = tabs.findIndex(t => t.id === id);
  if (tabIndex > -1) {
    const tab = tabs[tabIndex];
    tab.tabEl.remove();
    tab.webviewEl.remove();
    tabs.splice(tabIndex, 1);
    
    if (tabs.length === 0) {
      window.close(); // Close app if no tabs
    } else if (activeTabId === id) {
      // Switch to previous tab
      const newIndex = Math.max(0, tabIndex - 1);
      switchTab(tabs[newIndex].id);
    }
  }
}

function getActiveWebview() {
  const activeTab = tabs.find(t => t.id === activeTabId);
  return activeTab ? activeTab.webviewEl : null;
}

// Navigation Events
btnBack.onclick = () => {
  const view = getActiveWebview();
  if (view && view.canGoBack()) view.goBack();
};

btnForward.onclick = () => {
  const view = getActiveWebview();
  if (view && view.canGoForward()) view.goForward();
};

btnReload.onclick = () => {
  const view = getActiveWebview();
  if (view) view.reload();
};

btnHome.onclick = () => {
  const view = getActiveWebview();
  if (view) view.loadURL('https://www.google.com');
};

btnNewTab.onclick = () => createTab();

addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let url = addressBar.value;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }
    const view = getActiveWebview();
    if (view) view.loadURL(url);
  }
});

// Initialize first tab
createTab();
