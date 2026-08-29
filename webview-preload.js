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
   Identidade do navegador — versão 0.4.2 ("navegador honesto")
   ------------------------------------------------------------
    Padrão Edge/Vivaldi/Opera: declarar a PRÓPRIA marca em vez
    de fingir ser o Google Chrome. A única interferência na
    página é acrescentar a marca "Calopsia" à lista de marcas do
    navigator.userAgentData (nos objetos reais, protótipos nativos
    intactos). Nada de window.chrome artificial, nada de objetos
    falsos: quanto menos disfarce, menos inconsistência para os
    anti-bots acharem.
   ============================================================ */
function declararMarcaCalopsia() {
  const principal = (/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1];
  if (!principal || !navigator.userAgentData) return;

  /* Acrescenta "Calopsia" à lista de marcas, logo após "Chromium",
     mantendo versões e ordem originais (o UA e os cabeçalhos dizem
     o mesmo — coerência total). */
  const comMarca = (lista) => {
    const copia = [];
    let inserido = false;
    for (const b of (lista || [])) {
      if (!b || !b.brand) continue;
      if (b.brand === 'Calopsia') { inserido = true; continue; }
      if (b.brand === 'Google Chrome') continue;   // não fingimos ser Chrome
      copia.push({ brand: b.brand, version: b.version });
      if (b.brand === 'Chromium' && !inserido) {
        copia.push({ brand: 'Calopsia', version: b.version });
        inserido = true;
      }
    }
    if (!inserido) copia.push({ brand: 'Calopsia', version: principal });
    return Object.freeze(copia.map((b) => Object.freeze(b)));
  };

  const nativo = (nome, fn) => {
    try {
      Object.defineProperty(fn, 'toString', {
        value: () => `function ${nome}() { [native code] }`
      });
    } catch { /* ignora */ }
    return fn;
  };

  try {
    const uad = navigator.userAgentData;
    const proto = Object.getPrototypeOf(uad);

    const descBrands = Object.getOwnPropertyDescriptor(proto, 'brands');
    if (descBrands && descBrands.get) {
      const getterOriginal = descBrands.get;
      Object.defineProperty(proto, 'brands', {
        get() { return comMarca(getterOriginal.call(this)); },
        configurable: true
      });
    }

    if (typeof proto.getHighEntropyValues === 'function') {
      const hevOriginal = proto.getHighEntropyValues;
      proto.getHighEntropyValues = nativo('getHighEntropyValues', function (dicas) {
        return hevOriginal.call(this, dicas).then((r) => {
          if (r && r.brands) r.brands = comMarca(r.brands);
          if (r && r.fullVersionList) r.fullVersionList = comMarca(r.fullVersionList);
          return r;
        });
      });
    }

    if (typeof proto.toJSON === 'function') {
      const toJSONOriginal = proto.toJSON;
      proto.toJSON = nativo('toJSON', function () {
        const r = toJSONOriginal.call(this);
        if (r && r.brands) r.brands = comMarca(r.brands);
        return r;
      });
    }
  } catch { /* ignora */ }
}

if (!INTERNO) {
  try {
    webFrame.executeJavaScript(`(${declararMarcaCalopsia.toString()})();`);
  } catch { /* ambiente sem webFrame: segue sem o ajuste */ }
}

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
