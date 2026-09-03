'use strict';

const { app, nativeTheme, shell, net } = require('electron');
const { AppWindow } = require('./window');
const { stores } = require('./store');
const { SEARCH_ENGINES, SCHEME } = require('./constants');

/** Esquemas que o navegador entrega ao sistema operacional. */
const EXTERNAL_SCHEMES = ['mailto:', 'tel:', 'sms:', 'magnet:', 'ftp:', 'itms-apps:'];

/** TLDs comuns — usados para decidir entre "navegar" e "pesquisar". */
const LIKELY_HOST = /^([\w-]+\.)+[a-z]{2,24}(:\d+)?(\/.*)?$/i;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/;

/**
 * Controlador global da aplicação: janelas, roteamento de URLs,
 * sugestões da omnibox e persistência de sessão.
 */
class BrowserApp {
  constructor() {
    /** @type {AppWindow[]} */
    this.windows = [];
    /** @type {Array<{url:string,title:string}>} */
    this.closedTabs = [];
    /** @type {Map<string, Electron.DownloadItem>} */
    this.downloadItems = new Map();
    this.applyTheme();
  }

  // ---------------------------------------------------------------- janelas

  createWindow(opts = {}) {
    const win = new AppWindow(this, opts);
    this.windows.push(win);
    return win;
  }

  removeWindow(win) {
    this.windows = this.windows.filter((w) => w !== win);
  }

  /** Janela focada, ou a última criada. */
  current() {
    const focused = this.windows.find((w) => w.browserWindow.isFocused());
    return focused || this.windows[this.windows.length - 1] || null;
  }

  windowFor(webContents) {
    return (
      this.windows.find((w) => w.ui === webContents) ||
      this.windows.find((w) => w.tabs.some((t) => t.wc === webContents)) ||
      null
    );
  }

  broadcast(channel, payload) {
    this.windows.forEach((w) => w.send(channel, payload));
  }

  relayoutAll() {
    this.windows.forEach((w) => w.layout());
  }

  // -------------------------------------------------------------------- URL

  get engine() {
    return SEARCH_ENGINES[stores.settings.get('searchEngine')] || SEARCH_ENGINES.duckduckgo;
  }

  buildSearchUrl(query) {
    return this.engine.search.replace('%s', encodeURIComponent(query));
  }

  startUrl() {
    const s = stores.settings;
    return s.get('startup') === 'homepage' ? s.get('homepage') : `${SCHEME}://newtab`;
  }

  /**
   * Converte a entrada do usuário em uma URL navegável.
   * Regras: esquema explícito → usa; parece host → https://; senão → busca.
   */
  normalizeInput(input) {
    const raw = String(input ?? '').trim();
    if (!raw) return `${SCHEME}://newtab`;

    if (/^(https?|file|calopsia|view-source|data|blob|chrome|devtools):/i.test(raw)) return raw;
    if (EXTERNAL_SCHEMES.some((s) => raw.toLowerCase().startsWith(s))) return raw;
    if (raw === 'localhost' || raw.startsWith('localhost:') || raw.startsWith('localhost/')) {
      return `http://${raw}`;
    }
    if (raw.startsWith('/') || /^[a-z]:\\/i.test(raw)) return `file://${raw}`;
    if (raw.startsWith('about:')) return `${SCHEME}://about`;

    const noSpaces = !/\s/.test(raw);
    if (noSpaces && (LIKELY_HOST.test(raw) || IPV4.test(raw))) return `https://${raw}`;

    return this.buildSearchUrl(raw);
  }

  /** Sugestões da omnibox: histórico + favoritos + autocompletar do buscador. */
  async suggest(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const out = [];
    const seen = new Set();

    const push = (item) => {
      const key = item.type + '|' + (item.url || item.text);
      if (seen.has(key) || out.length >= 10) return;
      seen.add(key);
      out.push(item);
    };

    // 1. Navegação direta
    if (LIKELY_HOST.test(q) || /^(https?|file):/i.test(q)) {
      push({ type: 'url', text: q, url: this.normalizeInput(q), title: 'Ir para o endereço' });
    }

    // 2. Histórico (peso por recência + visitas)
    const history = stores.history.get('items', []);
    history
      .filter((h) => h.url.toLowerCase().includes(lower) || (h.title || '').toLowerCase().includes(lower))
      .sort((a, b) => (b.visits || 1) - (a.visits || 1) || b.visitedAt - a.visitedAt)
      .slice(0, 4)
      .forEach((h) => push({ type: 'history', text: h.title || h.url, url: h.url, title: h.title, favicon: h.favicon }));

    // 3. Favoritos
    stores.bookmarks
      .get('items', [])
      .filter((b) => b.url.toLowerCase().includes(lower) || (b.title || '').toLowerCase().includes(lower))
      .slice(0, 3)
      .forEach((b) => push({ type: 'bookmark', text: b.title || b.url, url: b.url, title: b.title, favicon: b.favicon }));

    // 4. Autocompletar do buscador
    try {
      const remote = await this.fetchSuggestions(q);
      remote.slice(0, 6).forEach((s) =>
        push({ type: 'search', text: s, url: this.buildSearchUrl(s), title: `Pesquisar por "${s}"` })
      );
    } catch { /* offline: ignora */ }

    push({ type: 'search', text: q, url: this.buildSearchUrl(q), title: `Pesquisar "${q}" no ${this.engine.name}` });
    return out;
  }

  fetchSuggestions(query) {
    const template = this.engine.suggest;
    if (!template) return Promise.resolve([]);
    const url = template.replace('%s', encodeURIComponent(query));

    return new Promise((resolve, reject) => {
      const req = net.request({ url, useSessionCookies: false });
      const timer = setTimeout(() => { req.abort(); reject(new Error('timeout')); }, 2500);
      let body = '';
      req.on('response', (res) => {
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          clearTimeout(timer);
          try {
            const json = JSON.parse(body);
            // Formatos: ["q", ["a","b"]] | [{phrase}] | {suggestions:[{...}]}
            if (Array.isArray(json) && Array.isArray(json[1])) return resolve(json[1]);
            if (Array.isArray(json)) return resolve(json.map((i) => i.phrase || i.q || i).filter((s) => typeof s === 'string'));
            if (Array.isArray(json.suggestions)) return resolve(json.suggestions.map((s) => s.query || s.phrase || s));
            if (Array.isArray(json.results)) return resolve(json.results.map((s) => s.q || s.phrase || s));
            resolve([]);
          } catch { resolve([]); }
        });
      });
      req.on('error', (e) => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  openExternal(url) {
    if (/^https?:|^mailto:|^tel:/i.test(url)) shell.openExternal(url).catch(() => {});
  }

  // ------------------------------------------------------------- abas fechadas

  pushClosedTab(entry) {
    if (!entry.url || entry.url.includes('newtab')) return;
    this.closedTabs.unshift({ ...entry, closedAt: Date.now() });
    this.closedTabs = this.closedTabs.slice(0, 25);
  }

  reopenClosedTab() {
    const entry = this.closedTabs.shift();
    if (!entry) return;
    const win = this.current() || this.createWindow();
    win.createTab({ url: entry.url, active: true });
  }

  // ------------------------------------------------------------------ tema

  applyTheme() {
    const theme = stores.settings.get('theme', 'system');
    nativeTheme.themeSource = ['dark', 'light'].includes(theme) ? theme : 'system';
  }

  // --------------------------------------------------------------- sessão

  saveSession() {
    const windows = this.windows.filter((w) => !w.incognito && !w.destroyed).map((w) => w.serializeSession());
    stores.session.set('windows', windows);
  }

  restoreSession() {
    const windows = stores.session.get('windows', []);
    const valid = windows.filter((w) => w.tabs?.length);
    if (!valid.length) return false;
    valid.forEach((w) => {
      const win = this.createWindow({ restore: w, x: w.bounds?.x, y: w.bounds?.y });
      if (w.maximized) win.browserWindow.maximize();
    });
    return true;
  }

  /** Chamado no boot: decide entre restaurar sessão ou abrir nova aba. */
  bootstrapWindows(initialUrl) {
    const startup = stores.settings.get('startup', 'newtab');
    if (startup === 'restore' && !initialUrl && this.restoreSession()) return;
    this.createWindow({ url: initialUrl });
  }

  async clearBrowsingData(options = {}) {
    const ses = require('electron').session.fromPartition('persist:calopsia');
    const storages = [];
    if (options.cookies) storages.push('cookies');
    if (options.storage) storages.push('localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'filesystem', 'shadercache');
    if (storages.length) await ses.clearStorageData({ storages });
    if (options.cache) await ses.clearCache();
    if (options.history) stores.history.set('items', []);
    if (options.downloads) stores.downloads.set('items', []);
    if (options.authCache) await ses.clearAuthCache();
    this.broadcast('data:cleared', options);
  }
}

module.exports = { BrowserApp };
