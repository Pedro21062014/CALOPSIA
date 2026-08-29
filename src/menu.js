'use strict';

/* Renderiza a lista do menu e avisa o processo principal sobre o tamanho. */

const list = document.getElementById('list');
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
              'stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>';
let items = [];

window.menuApi.onItems((data) => {
  items = data || [];
  render();
  // altura real do conteúdo (com uma folga para a sombra)
  requestAnimationFrame(() => {
    const h = Math.ceil(list.getBoundingClientRect().height) + 10;
    window.menuApi.ready(h);
  });
});

function render() {
  list.innerHTML = '';
  items.forEach((it) => {
    if (it.sep) {
      const s = document.createElement('div');
      s.className = 'sep';
      list.appendChild(s);
      return;
    }
    if (it.header) {
      const h = document.createElement('div');
      h.className = 'header';
      h.textContent = it.header;
      list.appendChild(h);
      return;
    }
    const b = document.createElement('button');
    b.className = 'item' + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : '');
    b.type = 'button';
    b.disabled = !!it.disabled;
    b.dataset.id = it.id;
    if (it.checked) b.setAttribute('aria-checked', 'true');
    b.innerHTML =
      `<span class="ico">${it.icon || ''}</span>` +
      `<span class="lbl"></span>` +
      (it.checked ? `<span class="ck">${CHECK}</span>` : '') +
      (it.shortcut ? `<span class="sc">${it.shortcut}</span>` : '');
    b.querySelector('.lbl').textContent = it.label;
    if (!b.disabled) b.addEventListener('click', () => window.menuApi.action(it.id));
    list.appendChild(b);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.menuApi.close(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const btns = [...list.querySelectorAll('.item:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown'
      ? btns[Math.min(btns.length - 1, i + 1)]
      : btns[Math.max(0, i - 1)];
    if (next) next.focus();
  }
});

// clicar fora / perder o foco fecha (o processo principal também escuta blur)
window.addEventListener('blur', () => window.menuApi.close());
