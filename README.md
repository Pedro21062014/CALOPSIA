# CALOPSIA 🦜

> Navegador web moderno, baseado em **Chromium** (via Electron), disponível para
> **macOS**, **Linux** e **Windows**.

O CALOPSIA usa o mecanismo Chromium como motor de renderização, com uma interface
própria e profissional — abas, barra de endereço com indicador de segurança,
atalhos de teclado e página inicial personalizada.

---

## ✨ Recursos (base atual)

- **Multi-abas** com favicon e título em tempo real.
- **Navegação completa** — voltar, avançar, recarregar/parar.
- **Barra de endereço inteligente** — detecta URL ou pesquisa (Google).
- **Indicador de segurança** — cadeado para HTTPS, alerta para HTTP.
- **Atalhos de teclado** — `Ctrl+T`, `Ctrl+W`, `Ctrl+L`, `Ctrl+R`, `Ctrl+N`, `Alt+←/→`.
- **Página inicial própria** — relógio, saudação, busca e atalhos rápidos.
- **Titlebar customizada** (minimizar / maximizar / fechar) com visual escuro moderno.
- **Sessão persistente** — cookies e logins são mantidos entre sessões.
- **Build automatizado** via GitHub Actions para os 3 sistemas operacionais.

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

## 🔁 Build automático (CI)

O workflow `.github/workflows/build.yml` compila os três sistemas em paralelo:

- **macos-latest** → `.dmg` / `.zip`
- **ubuntu-latest** → `.AppImage` / `.deb`
- **windows-latest** → `.exe` (NSIS) / portátil

O build dispara ao publicar uma **tag** (`v*`) ou manualmente pela aba *Actions*.
Os instaladores ficam disponíveis como *artifacts* do workflow.

---

## 🎨 Logo / ícone

- `assets/logo.png` — logo oficial (usada na interface).
- `build/icon.png` — ícone dos instaladores (1024×1024, fundo transparente), gerado a partir da logo oficial.

> O `electron-builder` converte automaticamente o `build/icon.png` para
> `.ico` (Windows) e `.icns` (macOS) durante o build. Para trocar a logo,
> basta substituir `build/icon.png` (mínimo 512×512, ideal 1024×1024).

---

## 🗂 Estrutura do projeto

```
calopsia/
├── main.js                    # Processo principal (janela, protocolo, segurança)
├── preload.js                 # Ponte segura entre main e UI
├── src/
│   ├── index.html             # Interface do navegador (shell)
│   ├── styles.css             # Estilos (tema escuro profissional)
│   ├── renderer.js            # Lógica de abas, navegação e atalhos
│   └── newtab.html            # Página inicial (nova aba)
├── assets/logo.png            # Logo oficial
├── build/icon.png             # Ícone dos instaladores
└── .github/workflows/build.yml # CI multiplataforma
```

---

## 🔒 Segurança

- `contextIsolation` habilitado e `nodeIntegration` desabilitado.
- Webviews rodam em sandbox, com popups externos abertos no navegador padrão.
- Protocolo interno `calopsia://` restrito à página inicial.

---

## 📄 Licença

MIT © CALOPSIA
