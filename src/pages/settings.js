import { api, $, $$, icon, escapeHtml, initTheme } from './common.js';

let settings = {};
let info = {};

/* ------------------------------------------------------------------ toast */

let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

async function update(patch) {
  settings = await api.settings.set(patch);
  toast('Preferência salva');
  return settings;
}

/* ---------------------------------------------------------------- esquema */

const ACCENTS = ['#f7b32b', '#ff7a45', '#46d19a', '#4aa8ff', '#a78bfa', '#ff6b9d', '#e2e8f0'];

const SECTIONS = [
  {
    id: 'appearance',
    label: 'Aparência',
    icon: 'palette',
    desc: 'Ajuste o visual do Calopsia ao seu gosto.',
    groups: [
      {
        title: 'Tema',
        rows: [
          {
            label: 'Modo de cor',
            desc: 'Escuro, claro ou seguir o sistema operacional.',
            render: () => `<div class="theme-picks">
              ${[['system', 'Sistema', 'sw-sys'], ['dark', 'Escuro', 'sw-dark'], ['light', 'Claro', 'sw-light']]
                .map(([v, name, sw]) => `<button class="theme-card${settings.theme === v ? ' sel' : ''}" data-theme="${v}">
                  <div class="theme-swatch ${sw}"></div>${name}</button>`).join('')}
            </div>`,
            bind: (root) => root.querySelectorAll('[data-theme]').forEach((b) =>
              b.onclick = async () => { await update({ theme: b.dataset.theme }); render(); })
          },
          {
            label: 'Cor de destaque',
            desc: 'Usada em botões, links e indicadores.',
            render: () => `<div class="accent-picks">${ACCENTS.map((c) =>
              `<button class="accent-dot${settings.accent === c ? ' sel' : ''}" data-accent="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`,
            bind: (root) => root.querySelectorAll('[data-accent]').forEach((b) =>
              b.onclick = async () => { await update({ accent: b.dataset.accent }); render(); })
          },
          {
            label: 'Barra de favoritos',
            desc: 'Mostrar os favoritos abaixo da barra de endereço.',
            toggle: 'showBookmarksBar'
          },
          {
            label: 'Zoom padrão',
            desc: 'Nível de ampliação aplicado a novas páginas.',
            select: 'zoomDefault',
            options: [[0.75, '75%'], [0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%'], [1.5, '150%']],
            cast: Number
          }
        ]
      }
    ]
  },

  {
    id: 'startup',
    label: 'Início e busca',
    icon: 'search',
    desc: 'O que o navegador faz ao abrir e como pesquisa.',
    groups: [
      {
        title: 'Inicialização',
        rows: [
          {
            label: 'Ao abrir o Calopsia',
            desc: 'Escolha o que aparece quando o navegador inicia.',
            select: 'startup',
            options: [['newtab', 'Abrir a página Nova aba'], ['restore', 'Restaurar a sessão anterior'], ['homepage', 'Abrir a página inicial']]
          },
          {
            label: 'Página inicial',
            desc: 'Destino do botão de início e da opção acima.',
            text: 'homepage',
            placeholder: 'calopsia://newtab'
          }
        ]
      },
      {
        title: 'Mecanismo de busca',
        rows: [
          {
            label: 'Buscador padrão',
            desc: 'Usado na barra de endereço e na página Nova aba.',
            select: 'searchEngine',
            optionsFrom: () => (info.engines || []).map((e) => [e.id, e.name])
          }
        ]
      }
    ]
  },

  {
    id: 'privacy',
    label: 'Privacidade',
    icon: 'shield',
    desc: 'Controle o que os sites podem fazer e coletar.',
    groups: [
      {
        title: 'Proteções',
        rows: [
          { label: 'Bloquear anúncios', desc: 'Remove banners e redes de anúncios conhecidas.', toggle: 'adBlockEnabled' },
          { label: 'Bloquear rastreadores', desc: 'Impede scripts de análise e perfilamento entre sites.', toggle: 'blockTrackers' },
          { label: 'Enviar "Não me rastreie"', desc: 'Adiciona os cabeçalhos DNT e Sec-GPC às requisições.', toggle: 'doNotTrack' },
          { label: 'Forçar HTTPS', desc: 'Promove automaticamente conexões http:// para https://.', toggle: 'httpsOnly' },
          { label: 'Bloquear pop-ups', desc: 'Impede que sites abram janelas sem sua ação.', toggle: 'blockPopups' }
        ]
      },
      {
        title: 'Dados de navegação',
        rows: [
          { label: 'Limpar tudo ao sair', desc: 'Apaga histórico, cookies e cache quando o navegador é fechado.', toggle: 'clearOnExit' },
          {
            label: 'Limpar dados agora',
            desc: 'Remove histórico, cookies, cache e dados de sites deste dispositivo.',
            render: () => '<button class="btn btn-danger" id="clear-now">Limpar dados…</button>',
            bind: (root) => {
              $('#clear-now', root).onclick = async () => {
                await api.settings.clearData({ cookies: true, storage: true, cache: true, history: true, authCache: true });
                toast('Dados de navegação apagados');
              };
            }
          }
        ]
      }
    ]
  },

  {
    id: 'downloads',
    label: 'Downloads',
    icon: 'download',
    desc: 'Onde salvar os arquivos que você baixa.',
    groups: [
      {
        title: 'Arquivos',
        rows: [
          {
            label: 'Pasta de downloads',
            desc: () => settings.downloadPath || info.downloads || '—',
            render: () => '<button class="btn" id="pick-dir">Alterar…</button>',
            bind: (root) => {
              $('#pick-dir', root).onclick = async () => {
                const dir = await api.settings.chooseDownloadDir();
                if (dir) { settings = await api.settings.get(); render(); toast('Pasta atualizada'); }
              };
            }
          },
          { label: 'Perguntar onde salvar', desc: 'Escolher o destino a cada download.', toggle: 'askDownloadLocation' }
        ]
      }
    ]
  },

  {
    id: 'performance',
    label: 'Desempenho',
    icon: 'settings',
    desc: 'Ajustes de renderização e compatibilidade.',
    groups: [
      {
        title: 'Sistema',
        rows: [
          {
            label: 'Aceleração por hardware',
            desc: 'Usa a GPU para renderizar. Desative se houver falhas gráficas. Requer reinício.',
            toggle: 'hardwareAcceleration'
          },
          {
            label: 'Identificação do navegador',
            desc: 'Alguns sites bloqueiam navegadores desconhecidos.',
            select: 'userAgentMode',
            options: [['default', 'Padrão do Calopsia'], ['chrome', 'Compatível com Chrome']]
          },
          {
            label: 'Reiniciar o navegador',
            desc: 'Aplica as alterações que exigem reinício.',
            render: () => '<button class="btn" id="relaunch">Reiniciar agora</button>',
            bind: (root) => { $('#relaunch', root).onclick = () => api.relaunch(); }
          }
        ]
      }
    ]
  },

  {
    id: 'about',
    label: 'Sobre',
    icon: 'info',
    desc: 'Informações da versão e do sistema.',
    custom: () => `
      <div class="section">
        <div class="section-title">${icon('info', 'icon-sm')} Versões</div>
        <dl class="about-grid">
          ${[
            ['Calopsia', info.version],
            ['Chromium', info.chrome],
            ['Electron', info.electron],
            ['Node.js', info.node],
            ['V8', info.v8],
            ['Plataforma', `${info.platform} · ${info.arch}`],
            ['Idioma', info.locale],
            ['Perfil', info.userData]
          ].map(([k, v]) => `<div class="about-cell"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v ?? '—'))}</dd></div>`).join('')}
        </dl>
      </div>
      <div class="section">
        <div class="section-title">${icon('warn', 'icon-sm')} Restaurar</div>
        <div class="row">
          <div class="row-main">
            <div class="row-label">Restaurar configurações padrão</div>
            <div class="row-desc">Volta todas as preferências ao estado original. Favoritos e histórico são preservados.</div>
          </div>
          <div class="row-control"><button class="btn btn-danger" id="reset-all">Restaurar</button></div>
        </div>
        <div class="danger-note">${icon('warn', 'icon-sm')}<div>Esta ação não pode ser desfeita.</div></div>
      </div>`,
    bind: (root) => {
      $('#reset-all', root).onclick = async () => {
        settings = await api.settings.reset();
        render();
        toast('Configurações restauradas');
      };
    }
  }
];

/* -------------------------------------------------------------- renderização */

let current = 'appearance';

function rowHtml(row) {
  const desc = typeof row.desc === 'function' ? row.desc() : row.desc;
  let control = '';

  if (row.toggle) {
    control = `<input type="checkbox" class="switch" data-key="${row.toggle}" ${settings[row.toggle] ? 'checked' : ''} />`;
  } else if (row.select) {
    const opts = row.optionsFrom ? row.optionsFrom() : row.options;
    control = `<select data-key="${row.select}">${opts
      .map(([v, name]) => `<option value="${escapeHtml(String(v))}"${String(settings[row.select]) === String(v) ? ' selected' : ''}>${escapeHtml(name)}</option>`)
      .join('')}</select>`;
  } else if (row.text) {
    control = `<input class="input" type="text" data-key="${row.text}" value="${escapeHtml(settings[row.text] ?? '')}" placeholder="${escapeHtml(row.placeholder || '')}" />`;
  } else if (row.render) {
    control = row.render();
  }

  return `<div class="row">
    <div class="row-main">
      <div class="row-label">${escapeHtml(row.label)}</div>
      ${desc ? `<div class="row-desc">${escapeHtml(desc)}</div>` : ''}
    </div>
    <div class="row-control">${control}</div>
  </div>`;
}

function render() {
  const section = SECTIONS.find((s) => s.id === current);
  $('#section-title').textContent = section.label;
  $('#section-desc').textContent = section.desc;

  const root = $('#sections');
  root.innerHTML = section.custom
    ? section.custom()
    : section.groups
        .map((g) => `<div class="section">
            <div class="section-title">${icon(section.icon, 'icon-sm')} ${escapeHtml(g.title)}</div>
            ${g.rows.map(rowHtml).join('')}
          </div>`)
        .join('');

  // liga controles genéricos
  root.querySelectorAll('.switch[data-key]').forEach((input) => {
    input.onchange = () => update({ [input.dataset.key]: input.checked });
  });
  root.querySelectorAll('select[data-key]').forEach((sel) => {
    sel.onchange = () => {
      const row = section.groups?.flatMap((g) => g.rows).find((r) => r.select === sel.dataset.key);
      const value = row?.cast ? row.cast(sel.value) : sel.value;
      update({ [sel.dataset.key]: value });
    };
  });
  root.querySelectorAll('input.input[data-key]').forEach((input) => {
    input.onchange = () => update({ [input.dataset.key]: input.value.trim() });
  });

  // liga controles customizados
  section.groups?.flatMap((g) => g.rows).forEach((r) => r.bind?.(root));
  section.bind?.(root);

  // estado da barra lateral
  $$('.sb-item').forEach((b) => b.classList.toggle('active', b.dataset.id === current));
  location.hash = current;
}

function renderSidebar() {
  const nav = $('#sidebar');
  SECTIONS.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'sb-item';
    b.dataset.id = s.id;
    b.innerHTML = `${icon(s.icon, 'icon-sm')}<span>${escapeHtml(s.label)}</span>`;
    b.onclick = () => { current = s.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    nav.appendChild(b);
  });
}

(async function init() {
  settings = await initTheme();
  settings = await api.settings.get();
  info = await api.info();

  const hash = location.hash.replace('#', '');
  if (SECTIONS.some((s) => s.id === hash)) current = hash;

  renderSidebar();
  render();

  api.on('settings:changed', (next) => { settings = next; });
})();
