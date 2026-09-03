'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/**
 * Store JSON simples, atômico e sem dependências externas.
 * Escritas são debounced e feitas via arquivo temporário + rename,
 * evitando corrupção de dados em caso de crash/queda de energia.
 */
class Store {
  /**
   * @param {string} name  nome do arquivo (sem extensão)
   * @param {object} defaults valores padrão
   */
  constructor(name, defaults = {}) {
    this.name = name;
    this.defaults = defaults;
    this.file = path.join(app.getPath('userData'), `${name}.json`);
    this.data = this._read();
    this._timer = null;
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...structuredClone(this.defaults), ...parsed };
    } catch {
      return structuredClone(this.defaults);
    }
  }

  get(key, fallback) {
    if (key === undefined) return this.data;
    const value = key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), this.data);
    return value === undefined ? fallback : value;
  }

  set(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.data, key);
    } else {
      const keys = key.split('.');
      const last = keys.pop();
      let target = this.data;
      for (const k of keys) {
        if (typeof target[k] !== 'object' || target[k] === null) target[k] = {};
        target = target[k];
      }
      target[last] = value;
    }
    this.save();
    return this.data;
  }

  reset() {
    this.data = structuredClone(this.defaults);
    this.save(true);
  }

  /** Persiste em disco (debounced por padrão). */
  save(immediate = false) {
    if (this._timer) clearTimeout(this._timer);
    const write = () => {
      this._timer = null;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(tmp, this.file);
      } catch (err) {
        console.error(`[store:${this.name}] falha ao salvar:`, err.message);
      }
    };
    if (immediate) write();
    else this._timer = setTimeout(write, 400);
  }

  /** Força flush pendente (chamado no before-quit). */
  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
      this.save(true);
    }
  }
}

const DEFAULT_SETTINGS = {
  theme: 'system', // 'system' | 'dark' | 'light'
  accent: '#01a7e4',
  searchEngine: 'duckduckgo',
  homepage: 'calopsia://newtab',
  startup: 'newtab', // 'newtab' | 'restore' | 'homepage'
  restoreTabs: true,
  showBookmarksBar: true,
  adBlockEnabled: true,
  blockTrackers: true,
  httpsOnly: true,
  doNotTrack: true,
  blockPopups: true,
  clearOnExit: false,
  downloadPath: '',
  askDownloadLocation: false,
  hardwareAcceleration: true,
  zoomDefault: 1,
  userAgentMode: 'default' // 'default' | 'chrome'
};

const stores = {};

function initStores() {
  stores.settings = new Store('settings', DEFAULT_SETTINGS);
  stores.history = new Store('history', { items: [] });
  stores.bookmarks = new Store('bookmarks', { items: [] });
  stores.downloads = new Store('downloads', { items: [] });
  stores.session = new Store('session', { windows: [] });
  return stores;
}

function flushAll() {
  Object.values(stores).forEach((s) => s.flush?.());
}

module.exports = { Store, initStores, stores, flushAll, DEFAULT_SETTINGS };
