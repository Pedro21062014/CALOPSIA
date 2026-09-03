'use strict';

const { stores } = require('./store');

/**
 * Bloqueador leve de anúncios e rastreadores.
 * Trabalha por sufixo de domínio (hostname matching), o que é rápido
 * (O(número de labels do domínio)) e não exige parser de EasyList.
 */

const ADS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'criteo.com',
  'criteo.net', 'taboola.com', 'outbrain.com', 'zedo.com', 'adform.net', 'casalemedia.com',
  'smartadserver.com', 'sharethrough.com', 'teads.tv', 'yieldmo.com', '3lift.com', 'bidswitch.net',
  'contextweb.com', 'gumgum.com', 'indexww.com', 'media.net', 'mgid.com', 'revcontent.com',
  'propellerads.com', 'popads.net', 'adcash.com', 'exoclick.com', 'juicyads.com', 'trafficjunky.com',
  'ad.doubleclick.net', 'partner.googleadservices.com', 'pagead2.googlesyndication.com',
  'amazon-adsystem.com', 'ads.yahoo.com', 'advertising.com', 'adtechus.com', 'servedbyadbutler.com',
  'moatads.com', 'adroll.com', 'bluekai.com', 'demdex.net', 'everesttech.net', 'flashtalking.com'
];

const TRACKERS = [
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com', 'googletagservices.com',
  'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'hotjar.io', 'mouseflow.com',
  'fullstory.com', 'inspectlet.com', 'crazyegg.com', 'luckyorange.com', 'mixpanel.com',
  'segment.com', 'segment.io', 'amplitude.com', 'heap.io', 'heapanalytics.com', 'kissmetrics.com',
  'chartbeat.com', 'parsely.com', 'newrelic.com', 'nr-data.net', 'bugsnag.com',
  'facebook.net', 'connect.facebook.net', 'pixel.facebook.com', 'analytics.tiktok.com',
  'ads.tiktok.com', 'analytics.twitter.com', 'ads-twitter.com', 'static.ads-twitter.com',
  'snap.licdn.com', 'px.ads.linkedin.com', 'bat.bing.com', 'clarity.ms',
  'yandex.ru/metrika', 'mc.yandex.ru', 'matomo.cloud', 'branch.io', 'appsflyer.com',
  'adjust.com', 'kochava.com', 'onesignal.com', 'braze.com', 'iterable.com', 'klaviyo.com'
];

/** Sites que quebram completamente se bloqueados — mantidos em allowlist. */
const ALLOWLIST = new Set([
  'google.com', 'www.google.com', 'accounts.google.com', 'youtube.com', 'www.youtube.com',
  'gstatic.com', 'googleapis.com', 'ytimg.com'
]);

class AdBlocker {
  constructor() {
    /** @type {Set<string>} */
    this.blocked = new Set();
    /** @type {Map<number, number>} contagem por webContents id */
    this.counts = new Map();
    /** @type {Set<string>} domínios com bloqueio desativado pelo usuário */
    this.exceptions = new Set(stores.settings?.get('adBlockExceptions', []) || []);
    this.rebuild();
  }

  rebuild() {
    const s = stores.settings;
    this.blocked = new Set();
    if (s.get('adBlockEnabled')) ADS.forEach((d) => this.blocked.add(d));
    if (s.get('blockTrackers')) TRACKERS.forEach((d) => this.blocked.add(d));
  }

  /** Retorna true se o hostname (ou um pai) estiver na blocklist. */
  matches(hostname) {
    if (!hostname || ALLOWLIST.has(hostname)) return false;
    const parts = hostname.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      if (this.blocked.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  isExempt(pageHost) {
    if (!pageHost) return false;
    const parts = pageHost.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      if (this.exceptions.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  toggleException(host, enabled) {
    if (enabled) this.exceptions.delete(host);
    else this.exceptions.add(host);
    stores.settings.set('adBlockExceptions', [...this.exceptions]);
  }

  count(id) {
    return this.counts.get(id) || 0;
  }

  resetCount(id) {
    this.counts.set(id, 0);
  }

  /** Aplica os interceptadores de rede em uma sessão. */
  attach(session) {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      const s = stores.settings;
      if (!s.get('adBlockEnabled') && !s.get('blockTrackers')) return callback({});
      if (details.resourceType === 'mainFrame') return callback({});

      let host;
      try {
        host = new URL(details.url).hostname;
      } catch {
        return callback({});
      }

      // Respeita exceções por site
      try {
        if (details.referrer && this.isExempt(new URL(details.referrer).hostname)) {
          return callback({});
        }
      } catch { /* referrer inválido */ }

      if (this.matches(host)) {
        const id = details.webContentsId;
        if (id != null) this.counts.set(id, (this.counts.get(id) || 0) + 1);
        return callback({ cancel: true });
      }
      return callback({});
    });

    session.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (stores.settings.get('doNotTrack')) {
        headers.DNT = '1';
        headers['Sec-GPC'] = '1';
      }
      callback({ requestHeaders: headers });
    });
  }
}

module.exports = { AdBlocker, ADS, TRACKERS };
