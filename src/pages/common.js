/* Utilidades compartilhadas pelas páginas internas do Calopsia. */

export const api = window.calopsiaInternal;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ------------------------------- ícones ---------------------------------- */

const PATHS = {
  globe: '<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 12h16.4M12 3.8c2.2 2.3 3.3 5.1 3.3 8.2S14.2 17.9 12 20.2c-2.2-2.3-3.3-5.1-3.3-8.2S9.8 6.1 12 3.8z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.8 15.8L20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  star: '<path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.3-4.8-2.5-4.8 2.5.9-5.3L4.2 9.9l5.4-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.4 8.4 0 005.4 6.6M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 4v3h3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  download: '<path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4L17.5 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  folder: '<path d="M3.5 7.5A1.5 1.5 0 015 6h4l2 2.5h8a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0119 18.5H5A1.5 1.5 0 013.5 17z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  shield: '<path d="M12 3.5l7 2.6v5.4c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6.1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  settings: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 01-4 0V21a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H2.8a2 2 0 010-4H3a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 4.2V4a2 2 0 014 0v.2a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11h.2a2 2 0 010 4H21a1.7 1.7 0 00-1.6 1z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 000 17c1.4 0 2-1 2-1.8s-.7-1.2-.7-2 .6-1.4 1.5-1.4h1.9A3.8 3.8 0 0020.5 11c0-4.1-3.8-7.5-8.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7.8" cy="11.5" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.8" r="1.1" fill="currentColor"/><circle cx="14.6" cy="8.2" r="1.1" fill="currentColor"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M17 14v4.5A1.5 1.5 0 0115.5 20h-10A1.5 1.5 0 014 18.5v-10A1.5 1.5 0 015.5 7H10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 7.8v.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  warn: '<path d="M12 4.5l8.5 15h-17z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4M12 16.8v.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'
};

export function icon(name, cls = 'icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || PATHS.globe}</svg>`;
}

/* ------------------------------ formatação -------------------------------- */

export const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function hostOf(url = '') {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function faviconFor(url, fallback) {
  if (fallback) return fallback;
  const host = hostOf(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
}

export function formatBytes(n = 0) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

const RTF = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
export function relativeTime(ts) {
  const diff = (ts - Date.now()) / 1000;
  const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month']];
  let unit = 'year', value = diff / 31557600;
  for (let i = 0; i < steps.length; i++) {
    if (Math.abs(diff) < steps[i][0]) {
      const div = i === 0 ? 1 : steps[i - 1][0];
      unit = steps[i][1];
      value = diff / div;
      break;
    }
  }
  return RTF.format(Math.round(value), unit);
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Hoje';
  if (same(d, yest)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* -------------------------------- tema ------------------------------------ */

export async function initTheme() {
  const apply = (settings) => {
    const theme = settings?.theme || 'system';
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.dataset.theme = dark ? 'dark' : 'light';
    if (settings?.accent) document.documentElement.style.setProperty('--accent', settings.accent);
  };

  let settings = {};
  try { settings = await api.settings.get(); } catch { /* fora do navegador */ }
  apply(settings);
  api?.on?.('settings:changed', apply);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => apply(settings));
  return settings;
}

/* ----------------------------- navegação ---------------------------------- */

export function go(url, newTab = false) {
  if (newTab) api.newTab(url);
  else api.navigate(url);
}

export function bindLinks(root = document) {
  root.addEventListener('click', (e) => {
    const link = e.target.closest('[data-url]');
    if (!link) return;
    e.preventDefault();
    go(link.dataset.url, e.ctrlKey || e.metaKey);
  });
  root.addEventListener('auxclick', (e) => {
    const link = e.target.closest('[data-url]');
    if (link && e.button === 1) { e.preventDefault(); go(link.dataset.url, true); }
  });
}
