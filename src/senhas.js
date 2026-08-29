'use strict';

/* Página interna de senhas: cria/desbloqueia o cofre, lista as contas
   e gera senhas fortes. Usa só a ponte calopsiaTab (sem Node aqui). */

const api = window.calopsiaTab;
const $ = (id) => document.getElementById(id);

const telas = {
  criar: $('tela-criar'),
  abrir: $('tela-abrir'),
  lista: $('tela-lista'),
  gerar: $('tela-gerar')
};

function mostrar(nome) {
  Object.entries(telas).forEach(([k, el]) => { el.hidden = k !== nome; });
}

function erroQual(id, msg) {
  const e = $(id);
  e.textContent = msg || '';
  e.hidden = !msg;
}

/* ------------------------------------------------------------ estado */
let contas = [];
let reveladas = new Set();

async function atualizar() {
  if (!api) return;
  const sit = await api.getCofre();
  $('sub').textContent = !sit.existe
    ? 'Nenhum cofre criado ainda.'
    : (sit.aberto ? 'Cofre desbloqueado.' : 'Cofre trancado.')
      + (sit.protecaoSO ? ' Proteção do sistema ativa.' : ' Sem chaveiro no sistema — só a senha mestra protege.');

  if (!sit.existe) { mostrar('criar'); return; }
  if (!sit.aberto) { mostrar('abrir'); return; }

  contas = await api.listarContas();
  reveladas = new Set();
  renderizar();
  mostrar('lista');
}

/* ------------------------------------------------------------ lista */
function renderizar() {
  const busca = ($('busca').value || '').trim().toLowerCase();
  const lista = $('lista');
  lista.innerHTML = '';

  const filtradas = contas.filter((c) => (
    !busca || c.site.toLowerCase().includes(busca) || (c.usuario || '').toLowerCase().includes(busca)
  ));

  $('vazio').hidden = contas.length > 0;

  filtradas.forEach((c) => {
    const linha = document.createElement('div');
    linha.className = 'conta';

    const ico = document.createElement('div');
    ico.className = 'ico';
    ico.textContent = (c.site || '?').replace(/^https?:\/\//, '').charAt(0);

    const dados = document.createElement('div');
    dados.className = 'dados';
    const site = document.createElement('div');
    site.className = 'site';
    site.textContent = c.site.replace(/^https?:\/\//, '');
    const usuario = document.createElement('div');
    usuario.className = 'usuario';
    usuario.textContent = c.usuario || '(sem usuário)';
    dados.appendChild(site);
    dados.appendChild(usuario);

    const senha = document.createElement('span');
    senha.className = 'senha';
    const ver = reveladas.has(c.id);
    senha.textContent = ver ? (c.senhaRevelada || '••••••••') : '••••••••';
    senha.title = ver ? 'Clique para copiar' : 'Clique para revelar';
    senha.addEventListener('click', async () => {
      if (!reveladas.has(c.id)) {
        const completa = await api.revelarConta(c.id);
        c.senhaRevelada = completa ? completa.senha : '(não disponível)';
        reveladas.add(c.id);
        senha.textContent = c.senhaRevelada;
        senha.title = 'Clique para copiar';
      } else {
        navigator.clipboard.writeText(c.senhaRevelada || '');
        senha.textContent = 'copiada ✓';
        setTimeout(() => { senha.textContent = c.senhaRevelada; }, 1200);
      }
    });

    const acoes = document.createElement('div');
    acoes.className = 'acoes';
    const apagar = document.createElement('button');
    apagar.className = 'perigo';
    apagar.title = 'Esquecer esta senha';
    apagar.textContent = '🗑';
    apagar.addEventListener('click', async () => {
      await api.apagarConta(c.id);
      await atualizar();
    });
    acoes.appendChild(apagar);

    linha.appendChild(ico);
    linha.appendChild(dados);
    linha.appendChild(senha);
    linha.appendChild(acoes);
    lista.appendChild(linha);
  });
}

/* ------------------------------------------------------------ gerador */
async function gerar() {
  if (!api) return;
  const senha = await api.gerarSenha(20);
  $('senha-gerada').textContent = senha;
  const f = await api.avaliarForca(senha);
  $('barra-forca').style.width = `${(f.nota / 4) * 100}%`;
  $('forca-rotulo').textContent = f.rotulo;
}

/* ------------------------------------------------------------ eventos */
$('btn-criar').addEventListener('click', async () => {
  const a = $('nova-senha').value;
  const b = $('nova-senha-2').value;
  if (a.length < 6) { erroQual('erro-criar', 'Use pelo menos 6 caracteres.'); return; }
  if (a !== b) { erroQual('erro-criar', 'As duas senhas não coincidem.'); return; }
  const r = await api.criarCofre(a);
  if (!r.ok) { erroQual('erro-criar', r.erro); return; }
  erroQual('erro-criar', '');
  $('nova-senha').value = '';
  $('nova-senha-2').value = '';
  await atualizar();
});

$('btn-abrir').addEventListener('click', async () => {
  const r = await api.desbloquear($('senha-mestra').value);
  if (!r.ok) { erroQual('erro-abrir', r.erro); return; }
  erroQual('erro-abrir', '');
  $('senha-mestra').value = '';
  await atualizar();
});

$('senha-mestra').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-abrir').click(); });
$('nova-senha-2').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-criar').click(); });

$('btn-trancar').addEventListener('click', () => {
  telas.lista.hidden = true;
  mostrar('abrir');
  $('sub').textContent = 'Cofre trancado.';
});

$('busca').addEventListener('input', renderizar);

$('btn-gerar').addEventListener('click', gerar);
$('btn-copiar').addEventListener('click', () => {
  navigator.clipboard.writeText($('senha-gerada').textContent);
  const b = $('btn-copiar');
  b.textContent = 'Copiada ✓';
  setTimeout(() => { b.textContent = 'Copiar senha'; }, 1400);
});

/* ------------------------------------------------------------ boot */
(async function () {
  await atualizar();
  telas.gerar.hidden = false;      // o gerador aparece em qualquer estado
  await gerar();
})();
