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

## 🎨 Logo / ícones

Todos os ícones são gerados a partir de `assets/logo.png`:

| Arquivo | Uso |
|---|---|
| `assets/logo.png` | logo oficial (barra de título, página inicial, favicon das abas) |
| `assets/icon-1024.png` | mestre 1024×1024 para `.icns` (macOS) e `.ico` (Windows) |
| `assets/icons/<N>x<N>.png` | conjunto hicolor 16→512, instalado em `/usr/share/icons/hicolor/` no Linux |
| `assets/icon.ico` | ícone da janela em runtime no Windows |
| `build/icon.png` | cópia do mestre (convenção do electron-builder) |

Para regenerar tudo depois de trocar a logo:

```bash
pip install Pillow
npm run icons
```

> Os ícones já vão versionados no repositório, então a CI **não** precisa do
> Pillow — ela só confere se os arquivos existem antes de compilar.
>
> **Atenção:** no Linux o ícone só aparece no menu/dock se o `.deb` instalar
> os PNGs em `hicolor/<tamanho>/apps/`. Por isso `build.linux.icon` aponta para
> o *diretório* `assets/icons` — passando um arquivo único o electron-builder
> grava em `hicolor/0x0/` e nenhum ambiente acha o ícone.

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

## 🎨 Tema

O CALOPSIA segue o tema do seu dispositivo (claro ou escuro). Para escolher na mão:

**☰ (três barrinhas) → Tema**

| Opção | O que faz |
|---|---|
| **Seguir o dispositivo** | padrão — acompanha o sistema em tempo real |
| **Claro** | fixa o tema claro |
| **Escuro** | fixa o tema escuro |

A escolha fica salva em `settings.json` e vale para tudo: barras, menus, página
de nova aba e a tela "Sobre". A paleta é monocromática (grafite), sem matizes.

## 🐛 Histórico de correções

### v0.2.5
- **Tema do dispositivo:** a interface agora acompanha o tema claro/escuro do
  sistema, inclusive em tempo real, e o menu ☰ ganhou a seção "Tema" para fixar
  claro ou escuro à escolha da pessoa. A preferência fica salva entre sessões.

### v0.2.4
- **WhatsApp Web (e sites parecidos):** o User-Agent padrão do Electron termina
  com `Electron/31.x` e vários sites detectam isso, mostrando "funciona no
  Google Chrome 100 ou posterior". Agora as abas enviam um UA de Chrome limpo.
- **Ctrl + scroll (e pinça) dá zoom na aba**, como em qualquer navegador, com o
  indicador de zoom acompanhando. Scroll sem Ctrl continua rolando a página.
- **Botão ＋** agora fica logo à direita da última aba aberta, em vez de preso
  no canto antes dos botões de janela.
- **Logo da página inicial:** passou a usar uma cópia embutida em data URI como
  garantia (além do favicon da aba), para não depender de nenhum caminho.

### v0.2.3
- **Ícone no Linux/installador:** o `build/icon.png` era rejeitado pelo
  app-builder em runtime e a CI caía no ícone padrão do Electron
  (`default Electron icon is used`). Além disso, passando um arquivo único o
  `electron-builder` gravava em `hicolor/0x0/`, caminho inválido na spec XDG.
  Agora `build.linux.icon` aponta para o diretório `assets/icons` e o `.deb`
  instala 16×16 … 512×512 nos caminhos corretos.
- **Logo na página inicial:** logo do CALOPSIA em destaque (78px) e
  `<link rel="icon">`, para a aba mostrar o logo em vez do ícone genérico.
- **Ícone da janela no Windows:** gerado `assets/icon.ico` multi-tamanho.
- **Blindagem:** script `npm run icons` regenera tudo de `assets/logo.png`, e a
  CI falha se algum ícone estiver faltando.

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
