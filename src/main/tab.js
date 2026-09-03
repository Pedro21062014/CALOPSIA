'use strict';

const { WebContentsView, Menu, clipboard, shell, nativeImage } = require('electron');
const { PATHS, SCHEME, USER_AGENTS } = require('./constants');
const { stores } = require('./store');
const { isInternalUrl } = require('./protocol');

let TAB_SEQ = 0;

/**
 * Uma aba do navegador. Encapsula um WebContentsView isolado
 * e normaliza os eventos do Chromium para o formato consumido pela UI.
 */
class Tab {
  /**
   * @param {import('./window')} win janela dona da aba
   * @param {{url?: string, active?: boolean, pinned?: boolean, index?: number}} opts
   */
  constructor(win, opts = {}) {
    this.id = ++TAB_SEQ;
    this.win = win;
    this.pinned = !!opts.pinned;
    this.muted = false;
    this.audible = false;
    this.loading = false;
    this.title = 'Nova aba';
    this.url = opts.url || 'calopsia://newtab';
    this.favicon = null;
    this.themeColor = null;
    this.error = null;
    this.findActive = false;
    this.destroyed = false;

    this.view = new WebContentsView({
      webPreferences: {
        preload: PATHS.PRELOAD_CONTENT,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        safeDialogs: true,
        spellcheck: true,
        session: win.session,
        backgroundThrottling: true,
        enableBlinkFeatures: '',
        v8CacheOptions: 'code'
      }
    });

    this.view.setBackgroundColor('#ffffff');
    this.wc = this.view.webContents;

    if (stores.settings.get('userAgentMode') !== 'chrome') {
      this.wc.setUserAgent(USER_AGENTS.strip(this.wc.getUserAgent()));
    }

    const zoom = stores.settings.get('zoomDefault', 1);
    this.wc.setZoomFactor(Number(zoom) || 1);

    this._bindEvents();
    this.navigate(this.url);
  }

  get webContentsId() {
    return this.destroyed ? -1 : this.wc.id;
  }

  /** Snapshot serializável enviado para a UI. */
  serialize() {
    if (this.destroyed) return null;
    return {
      id: this.id,
      url: this.url,
      title: this.title || this.url,
      favicon: this.favicon,
      loading: this.loading,
      pinned: this.pinned,
      muted: this.muted,
      audible: this.audible,
      themeColor: this.themeColor,
      error: this.error,
      internal: isInternalUrl(this.url),
      canGoBack: this.destroyed ? false : this.wc.navigationHistory.canGoBack(),
      canGoForward: this.destroyed ? false : this.wc.navigationHistory.canGoForward(),
      blocked: this.win.adblock.count(this.webContentsId)
    };
  }

  emit() {
    this.win.emitTabUpdate(this);
  }

  _bindEvents() {
    const wc = this.wc;

    wc.on('page-title-updated', (_e, title) => {
      this.title = title;
      this.emit();
      this.win.recordHistoryTitle(this.url, title);
    });

    wc.on('page-favicon-updated', (_e, favicons) => {
      this.favicon = favicons?.[0] || null;
      this.emit();
    });

    wc.on('did-start-loading', () => {
      this.loading = true;
      this.error = null;
      this.emit();
    });

    wc.on('did-stop-loading', () => {
      this.loading = false;
      this.emit();
    });

    wc.on('did-start-navigation', (e) => {
      if (!e.isMainFrame) return;
      this.win.adblock.resetCount(this.webContentsId);
      this.url = e.url;
      this.emit();
    });

    wc.on('did-navigate', (_e, url) => {
      this.url = url;
      this.error = null;
      this.emit();
      this.win.recordHistory(url, this.title, this.favicon);
    });

    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      this.url = url;
      this.emit();
    });

    wc.on('did-finish-load', () => {
      this.loading = false;
      this.emit();
    });

    wc.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
      // -3 = ABORTED (navegação cancelada pelo usuário), não é erro real
      if (!isMainFrame || code === -3) return;
      this.error = { code, desc, url: validatedURL };
      this.loading = false;
      const target = `${SCHEME}://error?code=${code}&desc=${encodeURIComponent(desc)}&url=${encodeURIComponent(validatedURL)}`;
      wc.loadURL(target).catch(() => {});
      this.emit();
    });

    wc.on('render-process-gone', (_e, details) => {
      this.error = { code: 'crash', desc: details.reason };
      this.loading = false;
      this.emit();
    });

    wc.on('media-started-playing', () => {
      this.audible = true;
      this.emit();
    });
    wc.on('media-paused', () => {
      this.audible = false;
      this.emit();
    });

    wc.on('did-change-theme-color', (_e, color) => {
      this.themeColor = color;
      this.emit();
    });

    wc.on('enter-html-full-screen', () => this.win.setContentFullScreen(true));
    wc.on('leave-html-full-screen', () => this.win.setContentFullScreen(false));

    wc.on('found-in-page', (_e, result) => {
      this.win.send('find:result', { tabId: this.id, ...result });
    });

    wc.on('context-menu', (_e, params) => this._showContextMenu(params));

    wc.on('update-target-url', (_e, url) => {
      this.win.send('tab:hover-link', { tabId: this.id, url });
    });

    // Abertura de novas janelas → vira aba (ou é bloqueada)
    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === 'save-to-disk') return { action: 'allow' };
      if (!/^https?:|^calopsia:/i.test(url)) {
        shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
      }
      const background = disposition === 'background-tab';
      this.win.createTab({ url, active: !background, index: this.win.indexOf(this) + 1 });
      return { action: 'deny' };
    });

    // Downloads são tratados na sessão (window.js)
  }

  _showContextMenu(params) {
    const wc = this.wc;
    const has = (s) => !!s && s.trim().length > 0;
    const items = [];

    if (has(params.linkURL)) {
      items.push(
        { label: 'Abrir link em nova aba', click: () => this.win.createTab({ url: params.linkURL, active: false, index: this.win.indexOf(this) + 1 }) },
        { label: 'Abrir link em nova janela', click: () => this.win.app.createWindow({ url: params.linkURL }) },
        { label: 'Abrir link em janela anônima', click: () => this.win.app.createWindow({ url: params.linkURL, incognito: true }) },
        { type: 'separator' },
        { label: 'Copiar endereço do link', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' }
      );
    }

    if (params.mediaType === 'image' && has(params.srcURL)) {
      items.push(
        { label: 'Abrir imagem em nova aba', click: () => this.win.createTab({ url: params.srcURL, active: true }) },
        { label: 'Salvar imagem como…', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copiar endereço da imagem', click: () => clipboard.writeText(params.srcURL) },
        { type: 'separator' }
      );
    }

    if (params.mediaType === 'video' || params.mediaType === 'audio') {
      items.push(
        { label: 'Salvar mídia como…', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copiar endereço da mídia', click: () => clipboard.writeText(params.srcURL) },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      items.push(
        { label: 'Desfazer', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Refazer', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
        { label: 'Selecionar tudo', role: 'selectAll' },
        { type: 'separator' }
      );
      if (params.misspelledWord) {
        const suggestions = (params.dictionarySuggestions || []).slice(0, 5).map((s) => ({
          label: s,
          click: () => wc.replaceMisspelling(s)
        }));
        if (suggestions.length) items.unshift(...suggestions, { type: 'separator' });
      }
    } else if (has(params.selectionText)) {
      const sel = params.selectionText.trim();
      const short = sel.length > 32 ? `${sel.slice(0, 32)}…` : sel;
      items.push(
        { label: 'Copiar', role: 'copy' },
        {
          label: `Pesquisar por "${short}"`,
          click: () => this.win.createTab({ url: this.win.app.buildSearchUrl(sel), active: true, index: this.win.indexOf(this) + 1 })
        },
        { type: 'separator' }
      );
    }

    if (!items.length || (!has(params.linkURL) && !params.isEditable && !has(params.selectionText))) {
      items.push(
        { label: 'Voltar', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: 'Avançar', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: 'Recarregar', click: () => wc.reload() },
        { type: 'separator' },
        { label: 'Salvar página como…', click: () => wc.downloadURL(this.url) },
        { label: 'Imprimir…', click: () => wc.print() },
        { type: 'separator' }
      );
    }

    items.push(
      { label: 'Ver código-fonte', click: () => this.win.createTab({ url: `view-source:${this.url}`, active: true }) },
      {
        label: 'Inspecionar elemento',
        click: () => {
          wc.inspectElement(params.x, params.y);
          if (wc.isDevToolsOpened()) wc.devToolsWebContents?.focus();
        }
      }
    );

    Menu.buildFromTemplate(items).popup({ window: this.win.browserWindow });
  }

  /** Normaliza uma entrada do usuário e navega. */
  navigate(input) {
    const url = this.win.app.normalizeInput(input);
    this.url = url;
    this.wc.loadURL(url).catch((err) => {
      if (!/ERR_ABORTED/.test(String(err))) console.error('[tab] loadURL:', err.message);
    });
  }

  reload(ignoreCache = false) {
    if (ignoreCache) this.wc.reloadIgnoringCache();
    else this.wc.reload();
  }

  stop() {
    this.wc.stop();
  }

  goBack() {
    if (this.wc.navigationHistory.canGoBack()) this.wc.navigationHistory.goBack();
  }

  goForward() {
    if (this.wc.navigationHistory.canGoForward()) this.wc.navigationHistory.goForward();
  }

  setMuted(muted) {
    this.muted = muted;
    this.wc.setAudioMuted(muted);
    this.emit();
  }

  setZoom(factor) {
    this.wc.setZoomFactor(Math.min(5, Math.max(0.25, factor)));
    this.win.send('tab:zoom', { tabId: this.id, zoom: this.wc.getZoomFactor() });
  }

  zoomIn() {
    this.setZoom(this.wc.getZoomFactor() + 0.1);
  }

  zoomOut() {
    this.setZoom(this.wc.getZoomFactor() - 0.1);
  }

  zoomReset() {
    this.setZoom(stores.settings.get('zoomDefault', 1));
  }

  find(text, options = {}) {
    if (!text) return this.stopFind();
    this.findActive = true;
    this.wc.findInPage(text, options);
  }

  stopFind(action = 'clearSelection') {
    if (!this.findActive) return;
    this.findActive = false;
    this.wc.stopFindInPage(action);
  }

  toggleDevTools() {
    if (this.wc.isDevToolsOpened()) this.wc.closeDevTools();
    else this.wc.openDevTools({ mode: 'bottom' });
  }

  async capturePreview() {
    try {
      const image = await this.wc.capturePage();
      return image.resize({ width: 320 }).toDataURL();
    } catch {
      return null;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.wc.removeAllListeners();
      if (!this.wc.isDestroyed()) this.wc.close();
    } catch { /* já destruído */ }
  }
}

module.exports = { Tab };
