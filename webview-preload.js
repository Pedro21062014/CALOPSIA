'use strict';

/* Preload das abas (<webview>). Roda em TODA página visitada, por isso:
   - não expõe nada em sites da internet;
   - só entrega as pontes às páginas internas (calopsia://). */

const { contextBridge, ipcRenderer } = require('electron');
const INTERNO = location.protocol === 'calopsia:';

/* Ctrl/⌘ + roda do mouse -> zoom só desta aba.
   O listener é de captura e não-passivo para vencer o handler de pinça
   do Chromium e impedir o zoom nativo em dobro. */
window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.send('tab:zoom-wheel', { delta: e.deltaY });
}, { passive: false, capture: true });

/* ------------------------------------------------------------
   Pontes — só para as páginas do próprio navegador
   ------------------------------------------------------------ */
if (INTERNO) {
  try {
    contextBridge.exposeInMainWorld('calopsiaTab', {
      /* tema */
      getTheme: () => ipcRenderer.invoke('theme:get'),
      onTheme: (cb) => ipcRenderer.on('theme:changed', (_e, info) => cb(info)),

      /* cofre de senhas */
      getCofre: () => ipcRenderer.invoke('senhas:situacao'),
      listarContas: () => ipcRenderer.invoke('senhas:listar'),
      revelarConta: (id) => ipcRenderer.invoke('senhas:revelar', id),
      apagarConta: (id) => ipcRenderer.invoke('senhas:apagar', id),
      gerarSenha: (n) => ipcRenderer.invoke('senhas:gerar', n),
      avaliarForca: (s) => ipcRenderer.invoke('senhas:forca', s),
      desbloquear: (senha) => ipcRenderer.invoke('senhas:desbloquear', senha),
      criarCofre: (senha) => ipcRenderer.invoke('senhas:criar', senha),

      /* Atualizações — usadas pela página "Sobre o CALOPSIA". */
      estadoAtualizacao: () => ipcRenderer.invoke('update:state:get'),
      verificarAtualizacao: () => ipcRenderer.invoke('update:check'),
      atualizarAgora: () => ipcRenderer.send('update:action'),
      onAtualizacao: (cb) => ipcRenderer.on('update:state', (_e, estado) => cb(estado))
    });
  } catch { /* página não isolada: segue sem ponte */ }
}

/* ============================================================
   Identidade do navegador — versão 0.2.7
   ------------------------------------------------------------
   A versão anterior emulava aqui navigator.userAgentData,
   window.chrome.runtime, chrome.csi, chrome.loadTimes e
   permissions.query para "parecer" Chrome de verdade.

   Era exatamente isso que quebrava a verificação do Cloudflare:
   os objetos falsos não têm os protótipos nativos que o desafio
   inspeciona, então o navegador parecia robô e a tela ficava
   presa em "Verificando…".

   Agora a regra é simples: o User-Agent de Chrome já é definido
   de forma coerente no processo principal (mesma versão do
   Chromium real que roda aqui) e NADA é emulado dentro da
   página. Navegador honesto passa no desafio; navegador
   disfarçado, não.
   ============================================================ */

/* ============================================================
   Detecção de formulários de senha
   ------------------------------------------------------------
   Só observa; nunca lê valor de campo sem que a pessoa tenha
   digitado e enviado, e não expõe nada no site.
   ============================================================ */
if (!INTERNO) {
  const ehSenha = (el) => !!el && el.tagName === 'INPUT' && el.type === 'password';

  /** O campo de usuário é o texto/e-mail editável logo antes da senha. */
  function campoUsuario(senha) {
    const form = senha.form;
    const escopo = form || document;
    const campos = [...escopo.querySelectorAll('input')].filter((i) => (
      !ehSenha(i) && ['text', 'email', 'tel', ''].includes(i.type) && i.offsetParent !== null
    ));
    if (!campos.length) return null;
    const antes = campos.filter((i) => i.compareDocumentPosition(senha) & Node.DOCUMENT_POSITION_FOLLOWING);
    return antes.length ? antes[antes.length - 1] : (form ? campos[0] : null);
  }

  /** 'nova-senha' quando o site está pedindo para criar uma senha. */
  function classificar(el) {
    if (ehSenha(el)) {
      const ac = (el.autocomplete || '').toLowerCase();
      if (ac.includes('new-password')) return 'nova-senha';
      if (el.form) {
        const senhas = [...el.form.querySelectorAll('input')].filter(ehSenha);
        if (senhas.length > 1) return 'nova-senha';
      }
      return 'senha';
    }
    if (['text', 'email', 'tel'].includes(el.type)) {
      const form = el.form;
      if (form && [...form.querySelectorAll('input')].some(ehSenha)) return 'usuario';
      // formulários sem <form> (muito comum hoje): olha a página inteira
      if (!form && document.querySelector('input[type="password"]')) {
        const campos = [...document.querySelectorAll('input')].filter((i) => (
          ['text', 'email', 'tel'].includes(i.type) && i.offsetParent !== null
        ));
        if (campos.length <= 3 && campos.includes(el)) return 'usuario';
      }
    }
    return null;
  }

  const rectDe = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.bottom), w: Math.round(r.width) };
  };

  const avisarFoco = (el) => {
    const tipo = classificar(el);
    if (!tipo) return;
    ipcRenderer.send('senhas:campo-foco', { tipo, rect: rectDe(el) });
  };

  // 'focusin' cobre Tab e clique; 'pointerdown' garante o clique mesmo
  // quando a página ainda não tem o foco do sistema.
  document.addEventListener('focusin', (e) => avisarFoco(e.target), true);
  document.addEventListener('pointerdown', (e) => avisarFoco(e.target), true);

  // Se a página rolar, a janelinha ficaria fora de lugar: fecha.
  window.addEventListener('scroll', () => ipcRenderer.send('senhas:fechar-popup'), true);
  window.addEventListener('resize', () => ipcRenderer.send('senhas:fechar-popup'));

  /* Envio do formulário: guarda as credenciais, mas NÃO oferece salvar
     agora — o aviso aparece depois que o site realmente navegar
     (ou seja, depois que o login deu certo). */
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const senha = [...form.querySelectorAll('input')].find(ehSenha);
    if (!senha || !senha.value) return;
    const usuario = campoUsuario(senha);
    ipcRenderer.send('senhas:enviou', {
      url: location.href,
      usuario: usuario ? usuario.value.trim() : '',
      senha: senha.value
    });
  }, true);

  /* Preenche os campos imitando digitação, para que React/Vue e
     companhia percebam a mudança. */
  ipcRenderer.on('senhas:aplicar', (_e, { usuario, senha, usuarioId }) => {
    const aplicar = (el, valor) => {
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      if (setter && setter.set) setter.set.call(el, valor); else el.value = valor;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const alvo = document.activeElement && ehSenha(document.activeElement)
      ? document.activeElement
      : document.querySelector('input[type="password"]');
    if (usuarioId) {
      const u = campoUsuario(alvo || document.querySelector('input[type="password"]'));
      aplicar(u, usuario);
    }
    if (senha) aplicar(alvo, senha);
    if (alvo) alvo.focus();
  });
}
