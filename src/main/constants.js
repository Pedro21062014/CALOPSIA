'use strict';

const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');

const PATHS = {
  ROOT,
  SRC,
  RENDERER: path.join(SRC, 'renderer'),
  PAGES: path.join(SRC, 'pages'),
  ASSETS: path.join(SRC, 'assets'),
  PRELOAD_CHROME: path.join(SRC, 'preload', 'chrome.js'),
  PRELOAD_CONTENT: path.join(SRC, 'preload', 'content.js')
};

/** Altura da "chrome" (UI do navegador) em CSS px. */
const CHROME = {
  TAB_BAR: 40,
  TOOLBAR: 48,
  BOOKMARKS_BAR: 34
};

const SCHEME = 'calopsia';

const INTERNAL_PAGES = {
  newtab: 'newtab.html',
  settings: 'settings.html',
  history: 'history.html',
  bookmarks: 'bookmarks.html',
  downloads: 'downloads.html',
  about: 'about.html',
  error: 'error.html'
};

const SEARCH_ENGINES = {
  duckduckgo: {
    name: 'DuckDuckGo',
    search: 'https://duckduckgo.com/?q=%s',
    suggest: 'https://duckduckgo.com/ac/?q=%s&type=list',
    icon: 'https://duckduckgo.com/favicon.ico'
  },
  google: {
    name: 'Google',
    search: 'https://www.google.com/search?q=%s',
    suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s',
    icon: 'https://www.google.com/favicon.ico'
  },
  bing: {
    name: 'Bing',
    search: 'https://www.bing.com/search?q=%s',
    suggest: 'https://api.bing.com/osjson.aspx?query=%s',
    icon: 'https://www.bing.com/favicon.ico'
  },
  brave: {
    name: 'Brave Search',
    search: 'https://search.brave.com/search?q=%s',
    suggest: 'https://search.brave.com/api/suggest?q=%s',
    icon: 'https://brave.com/static-assets/images/brave-favicon.png'
  },
  ecosia: {
    name: 'Ecosia',
    search: 'https://www.ecosia.org/search?q=%s',
    suggest: 'https://ac.ecosia.org/autocomplete?q=%s&type=list',
    icon: 'https://www.ecosia.org/favicon.ico'
  },
  startpage: {
    name: 'Startpage',
    search: 'https://www.startpage.com/sp/search?query=%s',
    suggest: '',
    icon: 'https://www.startpage.com/favicon.ico'
  }
};

const USER_AGENTS = {
  // Remove a assinatura "Electron/xx" e "Calopsia/xx" do UA padrão,
  // evitando quebra de sites que fazem sniffing agressivo.
  strip: (ua) => ua.replace(/ Electron\/[\d.]+/g, '').replace(/ Calopsia\/[\d.]+/g, '')
};

module.exports = { PATHS, CHROME, SCHEME, INTERNAL_PAGES, SEARCH_ENGINES, USER_AGENTS };
