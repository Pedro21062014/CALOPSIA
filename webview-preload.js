'use strict';

/* Preload das abas (<webview>). Roda em TODA página visitada, por isso:
   - não expõe nada em sites da internet;
   - só entrega as pontes às páginas internas (calopsia://). */

const { contextBridge, ipcRenderer, webFrame } = require('electron');
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
      criarCofre: (senha) => ipcRenderer.invoke('senhas:criar', senha)
    });
  } catch { /* página não isolada: segue sem ponte */ }
}

/* ============================================================
   Consistência de "impressão digital"
   ------------------------------------------------------------
   O Electron anuncia um User-Agent de Chrome, mas o resto do
   navegador continua se identificando como Chromium genérico.
   Essa contradição é exatamente o que os anti-bots (Cloudflare e
   companhia) procuram — e o resultado é o desafio nunca passar.

   O código abaixo roda no mundo principal da página (por isso via
   webFrame) e só alinha o que o Chromium já é, sem mentir sobre
   hardware nem driblar desafio manual.
   ============================================================ */
function alinharIdentidade() {
  const ua = navigator.userAgent;
  const achou = /Chrome\/([\d.]+)/.exec(ua);
  const completo = achou ? achou[1] : '126.0.0.0';
  const principal = completo.split('.')[0];

  let plataforma = 'Linux';
  if (/Windows/.test(ua)) plataforma = 'Windows';
  else if (/Macintosh|Mac OS X/.test(ua)) plataforma = 'macOS';
  else if (/Android/.test(ua)) plataforma = 'Android';
  else if (/iPhone|iPad/.test(ua)) plataforma = 'iOS';
  const movel = /Android|iPhone|iPad|Mobile/.test(ua);

  const versaoPlataforma = plataforma === 'Windows' ? '15.0.0'
    : plataforma === 'macOS' ? '14.0.0'
    : plataforma === 'Linux' ? '6.5.0' : '';

  /* navigator.userAgentData: era "Chromium" sem o "Google Chrome". */
  const marcas = [
    { brand: 'Not)A;Brand', version: '99' },
    { brand: 'Chromium', version: principal },
    { brand: 'Google Chrome', version: principal }
  ];
  const listaCompleta = [
    { brand: 'Not)A;Brand', version: '99.0.0.0' },
    { brand: 'Chromium', version: completo },
    { brand: 'Google Chrome', version: completo }
  ];

  const uaData = {
    brands: marcas,
    mobile: movel,
    platform: plataforma,
    getHighEntropyValues: (dicas) => {
      const tudo = {
        architecture: 'x86',
        bitness: '64',
        model: '',
        platformVersion: versaoPlataforma,
        uaFullVersion: completo,
        fullVersionList: listaCompleta,
        wow64: false
      };
      const pedido = Array.isArray(dicas) ? dicas : Object.keys(tudo);
      const resposta = {};
      for (const d of pedido) if (Object.prototype.hasOwnProperty.call(tudo, d)) resposta[d] = tudo[d];
      return Promise.resolve(resposta);
    },
    toJSON: () => ({ brands: marcas, mobile: movel, platform: plataforma })
  };

  const define = (obj, prop, valor) => {
    try { Object.defineProperty(obj, prop, { get: () => valor, configurable: true }); } catch { /* só leitura */ }
  };

  define(navigator, 'userAgentData', uaData);

  /* window.chrome.runtime — existe no Chrome de verdade. */
  try {
    const c = window.chrome && typeof window.chrome === 'object' ? window.chrome : {};
    if (!c.runtime) {
      c.runtime = {
        id: undefined,
        connect() { return { onMessage: { addListener() {}, removeListener() {} }, onDisconnect: { addListener() {}, removeListener() {} }, postMessage() {}, disconnect() {} }; },
        sendMessage() {},
        onMessage: { addListener() {}, removeListener() {} },
        onConnect: { addListener() {}, removeListener() {} }
      };
    }
    if (!c.csi) {
      c.csi = () => ({ startE: Date.now(), onloadT: Date.now(), pageT: performance.now(), tran: 15 });
    }
    if (!c.loadTimes) {
      c.loadTimes = () => ({
        requestTime: performance.timeOrigin / 1000,
        startLoadTime: performance.timeOrigin / 1000,
        commitLoadTime: performance.now() / 1000,
        finishDocumentLoadTime: performance.now() / 1000,
        finishLoadTime: performance.now() / 1000,
        firstPaintTime: performance.now() / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h2'
      });
    }
    define(window, 'chrome', c);
  } catch { /* opcional */ }

  /* Idiomas: o Electron responde só "en-US"; um navegador real
     devolve a lista de preferências do sistema. */
  try {
    const local = (Intl.DateTimeFormat().resolvedOptions().locale || 'pt-BR');
    const idiomas = [...new Set([local, 'pt-BR', 'pt', 'en-US', 'en'])];
    define(navigator, 'languages', Object.freeze(idiomas));
  } catch { /* opcional */ }

  /* Permissões: o Chrome responde "prompt"; automação costuma
     responder "denied" para notificação. */
  try {
    if (window.Notification && Notification.permission === 'denied' && navigator.permissions) {
      const original = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (p) => (
        p && p.name === 'notifications'
          ? Promise.resolve({ state: 'prompt', onchange: null })
          : original(p)
      );
    }
  } catch { /* opcional */ }

  try {
    if (navigator.webdriver) define(navigator, 'webdriver', undefined);
  } catch { /* opcional */ }
}

try {
  webFrame.executeJavaScript(`(${alinharIdentidade.toString()})();`);
} catch { /* ambiente sem webFrame: segue sem o ajuste */ }

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
