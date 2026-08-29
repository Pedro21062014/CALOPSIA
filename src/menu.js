'use strict';

/* Renderiza a lista do menu e avisa o processo principal sobre o tamanho. */

const list = document.getElementById('list');
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
    const b = document.createElement('button');
    b.className = 'item' + (it.danger ? ' danger' : '');
    b.type = 'button';
    b.disabled = !!it.disabled;
    b.dataset.id = it.id;
    b.innerHTML =
      `<span class="ico">${it.icon || ''}</span>` +
      `<span class="lbl"></span>` +
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
