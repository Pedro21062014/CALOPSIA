'use strict';

/* Preload das abas (<webview>). Roda em TODA página visitada, por isso:
   - não expõe nada em sites da internet;
   - só entrega as pontes às páginas internas (calopsia://). */

const { contextBridge, ipcRenderer, webFrame } = require('electron');
const INTERNO = location.protocol === 'calopsia:';

/* ============================================================
   v0.5.7 — Complemento do window.chrome (defeito do motor)
   ------------------------------------------------------------
   O Electron define window.chrome como um objeto VAZIO ({}).
   TODO Chromium/Chrome genuíno o define com três membros nativos:
   loadTimes, csi e app — presentes desde sempre. O diff de
   identidade medido com os dois navegadores lado a lado mostrou
   que esse objeto vazio é O ÚNICO sinal restante que separa o
   CALOPSIA de um Chromium real (UA, marcas, plugins, mimeTypes,
   codecs, pdfViewer, webdriver etc. já são idênticos).

   Diagnóstico de campo (novacrm.com.br, reprodução em tempo real):
   o desafio gerenciado do Cloudflare aceita o clique no checkbox,
   mostra "Verifying you are human…" por ~12 s e depois RECUSA a
   verificação e reapresenta o desafio em loop — ou seja, algo na
   coleta de sinais reprova o cliente. Um objeto Chrome incompleto
   é um veto trivial de detectar (chrome.csi ausente = wrapper).

   ESCOPO MÍNIMO (a lição da v0.2.6/v0.5.0 continua de pé):
   - completamos o objeto que o PRÓPRIO motor já cria e que o
     Chromium genuíno preenche — não criamos nada que um
     Chromium não tenha, nem mudamos nenhuma API da Web;
   - NÃO tocamos em Function.prototype / Navigator.prototype
     (nenhum patch de prototypes);
   - as funções respondem ao próprio toString() como nativas,
     mas Function.prototype.toString.call() permanece intocado;
   - zero leitura de dados da página, zero listeners novos.
   ============================================================ */
(function complementaWindowChrome() {
  const codigo = `
  (function () {
    try {
      /* já preenchido? (não mexemos em nada) */
      if (window.chrome && Object.keys(window.chrome).length) return;

      var membros = {};

      /* ---- chrome.app — assinatura do Chromium real ---- */
      var app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      };
      app.getDetails = function getDetails() { return null; };
      app.getIsInstalled = function getIsInstalled() { return false; };
      app.installState = function installState() { return app.InstallState.NOT_INSTALLED; };
      app.runningState = function runningState() { return app.RunningState.CANNOT_RUN; };
      membros.app = app;

      /* ---- chrome.csi() — forma do Chromium: {startE, onloadT, pageT, tran} ---- */
      var csi = function csi() {
        var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        var inicio = nav ? nav.startTime : 0;
        var agora = performance.now();
        return {
          startE: Math.round(performance.timeOrigin + inicio),
          onloadT: Math.round(performance.timeOrigin + (nav ? (nav.loadEventStart || agora) : agora)),
          pageT: Math.round(agora - inicio),
          tran: 0
        };
      };

      /* ---- chrome.loadTimes() — forma do Chromium ---- */
      var loadTimes = function loadTimes() {
        var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        var origem = performance.timeOrigin || 0;
        var seg = function (ms) { return ms ? Math.round((origem + ms)) / 1000 : 0; };
        var protocolo = 'unknown';
        try {
          if (nav && nav.nextHopProtocol) protocolo = nav.nextHopProtocol === 'h2' ? 'h2' : nav.nextHopProtocol;
        } catch (e) { /* mantém unknown */ }
        return {
          requestTime: seg(nav ? nav.startTime : 0),
          startLoadTime: seg(nav ? nav.startTime : 0),
          commitLoadTime: seg(nav ? nav.responseStart : 0),
          finishDocumentLoadTime: seg(nav ? nav.domContentLoadedEventEnd : 0),
          finishLoadTime: seg(nav ? nav.loadEventEnd : 0),
          firstPaintTime: 0,
          firstPaintAfterLoadTime: 0,
          navigationType: nav && nav.type === 'navigate' ? 'Other' : 'Other',
          wasFetchedViaSpdy: protocolo === 'h2' || protocolo === 'h3',
          wasNpnNegotiated: protocolo !== 'unknown',
          npnNegotiatedProtocol: protocolo,
          wasAlternateProtocolAvailable: false,
          connectionInfo: protocolo
        };
      };

      /* funções respondem ao PRÓPRIO toString como nativas
         (Function.prototype.toString não é tocado) */
      var comToStringNativo = function (fn) {
        try {
          Object.defineProperty(fn, 'toString', {
            value: function toString() { return 'function ' + (fn.name || '') + '() { [native code] }'; },
            writable: true, enumerable: false, configurable: true
          });
        } catch (e) { /* segue */ }
        return fn;
      };
      csi = comToStringNativo(csi);
      loadTimes = comToStringNativo(loadTimes);
      ['getDetails', 'getIsInstalled', 'installState', 'runningState'].forEach(function (m) {
        if (app[m]) comToStringNativo(app[m]);
      });

      membros.csi = csi;
      membros.loadTimes = loadTimes;

      /* o Chromium define 'chrome' no Window.prototype; seguimos a forma
         nativa quando possível, com fallback para propriedade própria */
      var congelado = Object.freeze(membros);
      try {
        var proto = Object.getPrototypeOf(window);
        if (proto && window.chrome === undefined) {
          Object.defineProperty(proto, 'chrome', { get: function () { return congelado; }, configurable: true });
          if (window.chrome === congelado) return;
        }
      } catch (e) { /* segue para o fallback */ }
      try {
        if (window.chrome !== congelado) {
          var base = (window.chrome && typeof window.chrome === 'object') ? window.chrome : {};
          Object.keys(congelado).forEach(function (k) { if (!(k in base)) { try { base[k] = congelado[k]; } catch (e) { /* */ } } });
          try { Object.defineProperty(window, 'chrome', { value: congelado, writable: false, configurable: true }); } catch (e2) { /* mantém o base */ }
        }
      } catch (e) { /* desiste em silêncio */ }
    } catch (e) { /* nunca quebra a página */ }
  })();`;
  try { webFrame.executeJavaScript(codigo, false); } catch { /* motor recusou: segue */ }
})();

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
      onAtualizacao: (cb) => ipcRenderer.on('update:state', (_e, estado) => cb(estado)),

      /* Diário do navegador (v0.5.8) — alimenta o botão "Copiar relatório
         para suporte" da página de diagnóstico. Tudo fica no computador:
         o relatório só sai se a pessoa copiar e colar onde quiser. */
      getAppInfo: () => ipcRenderer.invoke('app:info'),
      diarioCauda: () => ipcRenderer.invoke('diario:cauda'),
      diarioLocal: () => ipcRenderer.invoke('diario:local'),
      copiarTexto: (texto) => ipcRenderer.invoke('diario:copiar', texto),
      abrirDiario: () => ipcRenderer.send('diario:abrir-pasta')
    });
  } catch { /* página não isolada: segue sem ponte */ }
}

/* ============================================================
   Identidade do navegador — NENHUMA interferência (v0.5.0…v0.5.6)
   ------------------------------------------------------------
    Desde a v0.5.0 o CALOPSIA não patcheia NENHUMA API da Web: o
    User-Agent e as dicas de cliente são as NATIVAS do Chromium
    (apenas sem os tokens do wrapper), e prototypes de
    Function/Navigator continuam intocados. Um Chromium nativo é
    consistente consigo mesmo.

    v0.5.7 — exceção ÚNICA e documentada: o complemento do
    window.chrome (logo acima). Diferente das tentativas da era
    v0.2.6, não criamos objeto que o Chromium não tenha nem
    patcheamos API alguma — completamos, com comportamento fiel,
    o objeto que o PRÓPRIO Electron já cria e deixa vazio, e que
    todo Chromium genuíno preenche. Ver "Complemento do
    window.chrome (defeito do motor)" no topo deste arquivo.
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
