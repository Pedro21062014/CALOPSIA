# CALOPSIA 🦜

> Navegador web moderno, baseado em **Chromium** (via Electron), disponível para
> **Windows**, **Linux** e **macOS**.

O CALOPSIA usa o mecanismo Chromium como motor de renderização, com uma interface
própria: abas, barra de endereço inteligente com indicador de segurança,
localizar na página, zoom por aba, downloads e página inicial personalizada.

---

## ✨ Recursos

### Interface
- **Multi-abas** com favicon, título em tempo real, indicador de carregamento e fechamento com o botão do meio.
- **Titlebar customizada** (minimizar / maximizar / fechar) com duplo clique para maximizar.
- **Tema escuro** com acento em gradiente (roxo → ciano) e ícones SVG nítidos.
- **Barra de status** com link de destino, nível de zoom e downloads em andamento.
- **Página de erro própria** quando um site não carrega (com o motivo e "Tentar novamente").

### Navegação
- Voltar / avançar / recarregar-parar / página inicial.
- **Barra de endereço inteligente** — detecta URL, domínio simples (`exemplo.com`), `localhost:3000` ou pesquisa (Google).
- **Indicador de segurança** — cadeado para HTTPS, aviso para HTTP, marcação para páginas internas.
- **Localizar na página** (`Ctrl+F`) com contador de ocorrências, anterior/próximo.
- **Zoom por aba** (`Ctrl +/-/0`) que se mantém entre navegações.
- **Downloads** com barra de progresso e atalho para abrir a pasta.
- **Popups** abrem como nova aba em vez de janela separada.
- **Sessão persistente** — cookies e logins são mantidos entre sessões.

### Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+T` / `Ctrl+N` | Nova aba |
| `Ctrl+W` | Fechar aba |
| `Ctrl+Shift+T` | Reabrir aba fechada |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Alternar entre abas |
| `Ctrl+1` … `Ctrl+8` / `Ctrl+9` | Ir para a aba N / última aba |
| `Ctrl+L` | Focar a barra de endereço |
| `Ctrl+R` / `F5` | Recarregar |
| `Ctrl+F` | Localizar na página |
| `Ctrl+O` | Abrir arquivo local |
| `Ctrl+P` | Imprimir |
| `Ctrl+Shift+I` / `F12` | Ferramentas do desenvolvedor |
| `Alt+←` / `Alt+→` | Voltar / avançar |
| `Alt+Home` | Página inicial |
| `F11` | Tela cheia |

> No macOS use `⌘` no lugar de `Ctrl`.

---

## 🚀 Como rodar em desenvolvimento

Requisitos: [Node.js 20+](https://nodejs.org) e npm.

```bash
npm install
npm start
```

## 📦 Como gerar os instaladores localmente

```bash
npm run dist:win     # Windows (.exe NSIS + portátil)
npm run dist:mac     # macOS (.dmg + .zip)
npm run dist:linux   # Linux (.AppImage + .deb)
```

Os artefatos são gerados na pasta `release/`.

---

## 🔁 Build automático + Release (CI)

O workflow `.github/workflows/build.yml` roda em dois estágios:

### 1. `build` — compila em paralelo
| Runner | Alvos |
|---|---|
| `ubuntu-latest` | `.AppImage` + `.deb` |
| `macos-latest` | `.dmg` + `.zip` (x64 **e** arm64) |
| `windows-latest` | `.exe` (NSIS) + portátil |

Cada job também gera um `SHA256SUMS.txt` com os hashes dos seus instaladores.

### 2. `release` — publica
Baixa todos os artefatos, consolida os checksums e **cria a Release no GitHub
com os instaladores anexados**, usando `softprops/action-gh-release`.

**Gatilhos:**

- **Automático** ao publicar uma tag:
  ```bash
  git tag v0.2.0
  git push origin v0.2.0
  ```
- **Manual** pela aba *Actions → Build & Release → Run workflow* — você pode
  informar a tag (ex.: `v0.2.1`) ou deixar vazio para usar a versão do
  `package.json`, e marcar como pré-release.

> A action usa o `GITHUB_TOKEN` automático (já com `contents: write`), então não
> é necessário configurar nenhum segredo.

Para conferir os hashes de um instalador baixado:

```bash
sha256sum CALOPSIA-0.2.0-linux-x64.AppImage
```

---

## 🎨 Logo / ícone

- `assets/logo.png` — logo oficial (usada na interface).
- `build/icon.png` — ícone dos instaladores (1024×1024, fundo transparente).

> O `electron-builder` converte automaticamente o `build/icon.png` para
> `.ico` (Windows) e `.icns` (macOS) durante o build. Para trocar a logo,
> basta substituir `build/icon.png` (mínimo 512×512, ideal 1024×1024).

---

## 🗂 Estrutura do projeto

```
calopsia/
├── main.js                     # Processo principal: janela, protocolo, menu, downloads
├── preload.js                  # Ponte segura entre main e interface (contextBridge)
├── preload-menu.js             # Ponte da janelinha do menu ☰
├── src/
│   ├── index.html              # Interface do navegador (shell)
│   ├── styles.css              # Tema escuro
│   ├── renderer.js             # Abas, navegação, localizar, zoom, atalhos
│   ├── newtab.html             # Página inicial (nova aba)
│   ├── newtab.css
│   ├── newtab.js
│   ├── about.html / .css / .js # Tela "Sobre o CALOPSIA"
│   └── menu.html / .css / .js  # Lista dropdown do botão ☰ (janela própria)
├── assets/logo.png             # Logo oficial
├── build/icon.png              # Ícone dos instaladores
└── .github/workflows/build.yml # CI: compila nos 3 SOs e publica a Release
```

---

## 🔒 Segurança

- `contextIsolation` habilitado e `nodeIntegration` desabilitado no shell e nas abas.
- Cada aba é um `<webview>` isolado em _sandbox_, com partição própria.
- Protocolo interno `calopsia://` serve apenas arquivos de dentro do app
  (com proteção contra _path traversal_ e MIME types explícitos).
- Permissões restritas a `fullscreen`, `notifications`, `media` e área de transferência.

---

## 🐛 Histórico de correções

### v0.2.2
- **Robustez de layout:** os webviews agora têm o tamanho reafirmado sempre que
  a janela é redimensionada, maximizada/restaurada ou a aba é ativada — mata
  qualquer viewport "preso" que deixe a página cortada.
- **Zoom normalizado:** ao anexar a aba o fator de zoom é aplicado sempre
  (inclusive `1`), impedindo zoom herdado da sessão ou da escala do SO.
- **Ícone:** dentro do pacote só existe `assets/`; o caminho do ícone agora é
  resolvido com `existsSync` em vez de apontar para `build/` (inexistente no asar).

### v0.2.1
- **Corrigido:** a página inicial não carregava: `protocol.handle()` registra o
  esquema só na sessão padrão, e as abas usam a partição `persist:calopsia`.
  Agora o handler (e as permissões/downloads) é registrado nas duas sessões.
- **Corrigido:** sites apareciam "cortados/ampliados" — o `<webview>` só
  dimensiona o conteúdo corretamente com `display: flex` (antes era `block`).
- **Corrigido:** a barra de endereço ficava sempre vazia porque o input mantinha
  o foco do boot; agora só é preservada enquanto o usuário está digitando.
- **Menu do ☰** virou uma lista dropdown de verdade (janela própria, para
  aparecer sempre acima do webview — inclusive no Windows).
- **Visual:** tema monocromático minimalista, sem os tons de roxo.
- **Desempenho:** removida a compressão máxima do instalador e o dicionário de
  soletragem, que atrasavam a abertura do app.

### v0.2.0

- **Corrigido:** `tabstrip.insertBefore(el, newTabBtn)` lançava `NotFoundError`
  (o botão `＋` é irmão da faixa de abas, não filho), o que fazia o renderer
  inteiro parar na primeira aba — era por isso que o navegador não funcionava.
- **Corrigido:** o handler do protocolo `calopsia://` devolvia `newtab.html`
  para *qualquer* sub-recurso, quebrando logo e CSS da página inicial.
- **Corrigido:** menu/locais flutuantes ficavam atrás do `<webview>` no Windows
  (o webview é uma janela nativa). Agora todos os painéis empurram o layout.
- **Adicionado:** localizar na página, zoom por aba, downloads, reabrir aba
  fechada, página de erro, tela "Sobre", checksums na release.

---

## 📄 Licença

MIT © CALOPSIA
