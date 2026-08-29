'use strict';

/* ============================================================
   CALOPSIA — lógica da página de nova aba
   Servida pelo protocolo interno calopsia://home/
   ============================================================ */

const SEARCH_URL = 'https://www.google.com/search?q=';

const SHORTCUTS = [
  { label: 'Google',    url: 'https://www.google.com',        domain: 'google.com',        letter: 'G' },
  { label: 'YouTube',   url: 'https://www.youtube.com',       domain: 'youtube.com',       letter: '▶' },
  { label: 'GitHub',    url: 'https://github.com',            domain: 'github.com',        letter: 'GH' },
  { label: 'WhatsApp',  url: 'https://web.whatsapp.com',      domain: 'whatsapp.com',      letter: 'W' },
  { label: 'Gmail',     url: 'https://mail.google.com',       domain: 'mail.google.com',   letter: 'M' },
  { label: 'ChatGPT',   url: 'https://chat.openai.com',       domain: 'openai.com',        letter: 'AI' },
  { label: 'Netflix',   url: 'https://www.netflix.com',       domain: 'netflix.com',       letter: 'N' },
  { label: 'Spotify',   url: 'https://open.spotify.com',      domain: 'spotify.com',       letter: '♫' },
  { label: 'Maps',      url: 'https://www.google.com/maps',   domain: 'maps.google.com',   letter: '⌖' },
  { label: 'Wikipedia', url: 'https://pt.wikipedia.org',      domain: 'pt.wikipedia.org',  letter: 'W' }
];

const pad = (n) => String(n).padStart(2, '0');

function tick() {
  const now = new Date();
  document.getElementById('hh').textContent = pad(now.getHours());
  document.getElementById('mm').textContent = pad(now.getMinutes());
  document.getElementById('ss').textContent = pad(now.getSeconds());

  document.getElementById('date').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const h = now.getHours();
  const greeting = h < 6 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('greeting').textContent = greeting + ' 👋';
}

function buildShortcuts() {
  const nav = document.getElementById('quick');

  SHORTCUTS.forEach((s) => {
    const a = document.createElement('a');
    a.href = s.url;
    a.title = s.url;

    const tile = document.createElement('span');
    tile.className = 'tile';
    tile.textContent = s.letter;

    // Tenta o favicon real; se falhar (sem rede), mantém a letra.
    const img = new Image();
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.domain)}&sz=64`;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('load', () => {
      if (img.naturalWidth > 1) {
        tile.textContent = '';
        tile.appendChild(img);
      }
    });

    const label = document.createElement('span');
    label.textContent = s.label;

    a.appendChild(tile);
    a.appendChild(label);
    nav.appendChild(a);
  });
}

function submitSearch(value) {
  const q = value.trim();
  if (!q) return;
  const url = /^(https?|calopsia|file):/i.test(q) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(q)
    ? (/^https?:\/\//i.test(q) ? q : 'https://' + q)
    : SEARCH_URL + encodeURIComponent(q);
  window.location.href = url;
}

document.addEventListener('DOMContentLoaded', () => {
  tick();
  setInterval(tick, 1000);
  buildShortcuts();

  const form = document.getElementById('search-form');
  const input = document.getElementById('q');

  form.addEventListener('submit', (e) => { e.preventDefault(); submitSearch(input.value); });

  // digitar em qualquer lugar foca a busca
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement === input) return;
    if (e.key.length === 1 && !e.target.closest('a')) {
      input.focus();
      input.value += e.key;
      e.preventDefault();
    }
  });

  input.focus();
});
