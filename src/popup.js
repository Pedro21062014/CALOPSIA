'use strict';

/* Renderiza a janelinha de senhas e avisa a altura real do conteúdo. */

const card = document.getElementById('card');
const api = window.popupApi;

const SVG = {
  olho: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
        '<path d="M1.8 12S5.5 5.5 12 5.5 22.2 12 22.2 12 18.5 18.5 12 18.5 1.8 12 1.8 12Z"/><circle cx="12" cy="12" r="3.2"/></svg>',
  oculto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
          '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.5 0 10.2 6 10.2 6a17 17 0 0 1-3.3 3.9"/>' +
          '<path d="M6.7 8A17 17 0 0 0 1.8 12S5.5 18 12 18a10 10 0 0 0 4-.8"/></svg>',
  chave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
         '<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1 20 3"/><path d="M16.5 6.5 19 9"/></svg>'
};

let dados = null;

function el(tag, classe, html) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (html !== undefined) n.innerHTML = html;
  return n;
}
function texto(tag, classe, txt) {
  const n = el(tag, classe);
  n.textContent = txt;
  return n;
}

/* ------------------------------------------------------------ modos */
function telaCriar() {
  card.appendChild(texto('div', 'titulo', 'Criar a senha mestra'));
  card.appendChild(texto('div', 'sub',
    'Ela protege as senhas que o navegador salvar. Guarde-a bem: ' +
    'sem ela as senhas salvas não podem ser recuperadas.'));
  if (!dados.protecaoSO) {
    card.appendChild(texto('div', 'sub',
      'Aviso: este sistema não oferece chaveiro próprio, então a proteção ' +
      'fica somente na senha mestra.'));
  }

  const a = el('input');
  a.type = 'password'; a.placeholder = 'Senha mestra'; a.autocomplete = 'off';
  const b = el('input');
  b.type = 'password'; b.placeholder = 'Repita a senha mestra'; b.autocomplete = 'off';
  card.appendChild(a); card.appendChild(b);

  const acoes = el('div', 'acoes');
  const criar = texto('button', 'bt primario', 'Criar');
  const depois = el('div', 'acoes');
  const cancelar = texto('button', 'bt suave', 'Agora não');
  acoes.appendChild(criar);
  depois.appendChild(cancelar);
  card.appendChild(acoes);

  const enviar = () => {
    if (a.value.length < 6) { erro('Use pelo menos 6 caracteres.'); a.focus(); return; }
    if (a.value !== b.value) { erro('As duas senhas não coincidem.'); b.focus(); return; }
    api.acao('criar', { senha: a.value });
  };
  criar.addEventListener('click', enviar);
  [a, b].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); }));
  cancelar.addEventListener('click', () => api.fechar());

  setTimeout(() => a.focus(), 30);
}

function telaDesbloquear() {
  card.appendChild(texto('div', 'titulo', 'Desbloquear as senhas'));
  card.appendChild(texto('div', 'sub', 'Digite a senha mestra para usar as senhas salvas.'));
  if (dados.erro) card.appendChild(texto('div', 'erro', dados.erro));

  const a = el('input');
  a.type = 'password'; a.placeholder = 'Senha mestra'; a.autocomplete = 'off';
  card.appendChild(a);

  const acoes = el('div', 'acoes');
  const entrar = texto('button', 'bt primario', 'Desbloquear');
  const cancelar = texto('button', 'bt suave', 'Cancelar');
  acoes.appendChild(cancelar); acoes.appendChild(entrar);
  card.appendChild(acoes);

  const enviar = () => { if (a.value) api.acao('desbloquear', { senha: a.value }); };
  entrar.addEventListener('click', enviar);
  a.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
  cancelar.addEventListener('click', () => api.fechar());
  setTimeout(() => a.focus(), 30);
}

function telaSalvar() {
  const atualizar = dados.modo === 'atualizar';
  card.appendChild(texto('div', 'titulo', atualizar ? 'Atualizar a senha salva?' : 'Salvar esta senha?'));
  card.appendChild(texto('div', 'sub', '')).innerHTML =
    'Site <strong>' + esc(dados.site) + '</strong>';

  const mostra = el('input');
  mostra.type = 'text'; mostra.readOnly = true;
  mostra.value = dados.senha;
  mostra.style.fontFamily = 'ui-monospace, Consolas, monospace';
  mostra.style.fontSize = '11.5px';
  mostra.style.display = 'none';
  mostra.userSelect = 'text';

  const linhaU = el('div', 'linha');
  linhaU.appendChild(texto('span', 'rot', 'Usuário'));
  linhaU.appendChild(texto('span', 'val', dados.usuario || '—'));

  const linhaS = el('div', 'linha');
  linhaS.appendChild(texto('span', 'rot', 'Senha'));
  const valS = texto('span', 'val', '••••••••••••');
  const olho = el('button', 'olho', SVG.olho);
  olho.title = 'Mostrar a senha';
  let visivel = false;
  olho.addEventListener('click', () => {
    visivel = !visivel;
    valS.textContent = visivel ? dados.senha : '••••••••••••';
    olho.innerHTML = visivel ? SVG.oculto : SVG.olho;
  });
  linhaS.appendChild(valS); linhaS.appendChild(olho);

  card.appendChild(linhaU); card.appendChild(linhaS); card.appendChild(mostra);

  const acoes = el('div', 'acoes');
  const nunca = texto('button', 'bt suave', 'Nunca neste site');
  const agora = texto('button', 'bt', 'Agora não');
  const salvar = texto('button', 'bt primario', atualizar ? 'Atualizar' : 'Salvar');
  acoes.appendChild(nunca); acoes.appendChild(agora); acoes.appendChild(salvar);
  card.appendChild(acoes);

  salvar.addEventListener('click', () => api.acao('salvar'));
  nunca.addEventListener('click', () => api.acao('nunca'));
  agora.addEventListener('click', () => api.fechar());
  setTimeout(() => salvar.focus(), 30);
}

function telaPreencher() {
  card.appendChild(texto('div', 'titulo', 'Entrar como'));
  card.appendChild(texto('div', 'sub', '')).innerHTML = 'Site <strong>' + esc(dados.site) + '</strong>';

  if (!dados.contas.length && !dados.podeGerar) {
    card.appendChild(texto('div', 'sub', 'Nenhuma senha salva para este site.'));
  }

  const lista = el('div', 'lista');
  dados.contas.forEach((c) => {
    const b = el('button', 'item-conta');
    const inicial = (c.usuario || '?').trim().charAt(0) || '?';
    b.appendChild(texto('span', 'icone', inicial));
    const t = el('span', 'txt');
    t.appendChild(document.createTextNode(c.usuario));
    t.appendChild(el('small')).textContent = '••••••••';
    b.appendChild(t);
    b.addEventListener('click', () => api.acao('preencher', { id: c.id }));
    lista.appendChild(b);
  });
  card.appendChild(lista);

  if (dados.podeGerar) {
    card.appendChild(el('div', 'sep'));
    const g = texto('button', 'bt largo', 'Sugerir senha forte');
    g.style.display = 'flex';
    g.style.alignItems = 'center';
    g.style.gap = '7px';
    g.innerHTML = SVG.chave + '<span>Sugerir senha forte</span>';
    g.addEventListener('click', () => api.acao('gerar'));
    card.appendChild(g);
  }
  setTimeout(() => { const p = lista.querySelector('.item-conta'); if (p) p.focus(); }, 30);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

function erro(msg) {
  const antigo = card.querySelector('.erro');
  if (antigo) antigo.remove();
  const e = texto('div', 'erro', msg);
  card.insertBefore(e, card.querySelector('input'));
}

/* ------------------------------------------------------------ boot */
api.onDados((d) => {
  dados = d;
  card.innerHTML = '';
  if (d.modo === 'criar') telaCriar();
  else if (d.modo === 'desbloquear') telaDesbloquear();
  else if (d.modo === 'salvar' || d.modo === 'atualizar') telaSalvar();
  else if (d.modo === 'preencher') telaPreencher();

  requestAnimationFrame(() => {
    const h = Math.ceil(card.getBoundingClientRect().height) + 24;
    api.pronto(h);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { api.fechar(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const b = [...card.querySelectorAll('button, input')];
    const i = b.indexOf(document.activeElement);
    const prox = e.key === 'ArrowDown' ? b[Math.min(b.length - 1, i + 1)] : b[Math.max(0, i - 1)];
    if (prox) { e.preventDefault(); prox.focus(); }
  }
});

window.addEventListener('blur', () => api.fechar());
