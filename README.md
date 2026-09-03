# CALOPSIA

**CALOPSIA** é a base de um navegador desktop profissional construído com Electron e Chromium. O projeto foi preparado para rodar e gerar instaladores no **macOS, Linux e Windows**.

> O símbolo incluído nesta primeira versão é provisório. A identidade final poderá ser aplicada sem alterar a arquitetura.

## O que já está pronto

- Navegação Chromium com múltiplas abas
- Barra de endereço com pesquisa pelo DuckDuckGo
- Voltar, avançar, recarregar/parar e página inicial
- Criação, fechamento, duplicação e reordenação de abas
- Reabertura da última aba fechada
- Busca dentro da página
- Controle de zoom
- Downloads para a pasta padrão do sistema, com progresso na barra de status
- Página de nova aba e página de erro próprias
- Menu de contexto para links, edição e navegação
- Atalhos de teclado familiares
- Controles de janela personalizados no Windows e Linux
- Solicitação explícita para permissões sensíveis de sites
- Interface isolada por preload e conteúdo remoto em sandbox
- Build automatizado por GitHub Actions

## Plataformas e artefatos

| Plataforma  | Artefatos gerados                               |
| ----------- | ----------------------------------------------- |
| Windows x64 | Instalador NSIS `.exe` e versão portátil `.exe` |
| macOS       | `.dmg` e `.zip`                                 |
| Linux x64   | `.AppImage` e `.deb`                            |

Os pacotes gerados pelo workflow são **não assinados**. Para distribuição pública, configure certificados de assinatura de código e notarização usando GitHub Actions Secrets.

## Desenvolvimento local

### Requisitos

- Node.js 22 ou superior
- npm 10 ou superior

```bash
npm ci
npm start
```

Modo de desenvolvimento, com a opção de inspeção no menu de contexto:

```bash
npm run dev
```

### Validação

```bash
npm run lint
npm run format:check
```

### Gerar pacote local

```bash
# Pacote da plataforma atual
npm run build

# Comando específico
npm run build:win
npm run build:mac
npm run build:linux
```

O resultado fica em `release/`.

## GitHub Actions

O arquivo [`.github/workflows/build.yml`](.github/workflows/build.yml) executa:

1. instalação reproduzível com `npm ci`;
2. validação do JavaScript;
3. builds paralelos em Linux, Windows e macOS;
4. upload dos instaladores como artefatos por 14 dias;
5. criação automática de um GitHub Release quando uma tag `v*` é enviada.

Para publicar uma versão:

```bash
npm version patch
git push origin main --follow-tags
```

Também é possível iniciar o build manualmente em **Actions → Build multiplataforma → Run workflow**.

## Atalhos

| Atalho                 | Ação                      |
| ---------------------- | ------------------------- |
| `Ctrl/Cmd + L`         | Focar a barra de endereço |
| `Ctrl/Cmd + T`         | Nova aba                  |
| `Ctrl/Cmd + W`         | Fechar aba                |
| `Ctrl/Cmd + Shift + T` | Reabrir aba fechada       |
| `Ctrl/Cmd + R`         | Recarregar ou parar       |
| `Ctrl/Cmd + F`         | Localizar na página       |
| `Ctrl/Cmd + 0`         | Restaurar zoom            |
| `Ctrl/Cmd + + / -`     | Alterar zoom              |
| `Alt + ← / →`          | Voltar ou avançar         |
| `Ctrl/Cmd + 1…9`       | Alternar entre abas       |

## Estrutura

```text
CALOPSIA/
├── .github/workflows/build.yml
├── build/                    # ícone usado no empacotamento
├── src/
│   ├── main/main.js          # janelas, abas, navegação e segurança
│   ├── preload/preload.js    # ponte IPC mínima
│   └── renderer/             # interface, nova aba e página de erro
└── package.json
```

## Aplicar o logotipo final

Quando a arte final estiver disponível:

1. substitua `src/renderer/assets/logo-mark.svg` pela versão vetorial;
2. substitua `build/icon.png` por um PNG quadrado de pelo menos `512 × 512`;
3. para controle pixel a pixel em distribuição, também podem ser adicionados `icon.icns` e `icon.ico` e referenciados no `package.json`.

## Segurança

O conteúdo da web roda com:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`

Consulte [SECURITY.md](SECURITY.md) antes de ampliar IPC, permissões ou integrações nativas.

## Próximas evoluções sugeridas

- identidade visual final;
- assinatura e notarização dos instaladores;
- favoritos, histórico e restauração de sessão persistentes;
- atualizações automáticas;
- gerenciador visual de downloads e permissões;
- builds ARM64 adicionais;
- testes end-to-end com Playwright.
