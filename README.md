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

## 🔐 Senhas

O CALOPSIA detecta formulários de login, oferece para salvar e preenche
para você.

**Como usar:** entre em um site normalmente. Depois que o login der certo,
aparece a pergunta *"Salvar esta senha?"*. Da próxima vez, clique no campo
de usuário ou senha e escolha a conta na janelinha que abre.

**Seção "Tema" e "Senhas" no menu ☰:**
- **Senhas salvas** — abre a lista, com busca, revelar e esquecer
- **Gerar senha forte** — gera 20 caracteres e copia

### Como as senhas são protegidas

| Camada | O que faz |
|---|---|
| **Senha mestra** | deriva a chave com scrypt (16 MB por tentativa) e cifra tudo com AES-256-GCM |
| **Chaveiro do sistema** | Keychain (macOS), DPAPI (Windows) ou libsecret (Linux) por cima da primeira camada |

- A senha mestra **não** é gravada em lugar nenhum — só um verificador scrypt.
- O cofre fica em `cofre.json` dentro do perfil do app, **nunca** em texto puro.
- Se o Linux não tiver `gnome-keyring`/`kwallet`, o cofre avisa e segue
  protegido apenas pela senha mestra (nunca desprotegido).
- A chave só existe na memória enquanto o cofre está aberto.

⚠️ **Se você esquecer a senha mestra, as senhas salvas não podem ser recuperadas.**

## 🐛 Histórico de correções

### v0.5.4
- **"Vulkan" agora é só no Linux (provável regressão da v0.5.1 corrigida):** o switch
  `enable-features=Vulkan` era aplicado em TODOS os sistemas, mas só o WebGPU do **Linux**
  precisa dele. No **Windows**, forçar Vulkan faz o ANGLE/Dawn tentar um backend que a
  máquina talvez não tenha driver para rodar — e sem isso o `navigator.gpu.requestAdapter()`
  volta NULL ("No available adapters"), o desafio morre e a página recarrega em loop.
  No Windows o caminho nativo do Chrome é D3D11/D3D12 (o Chrome real nunca força Vulkan)
  e no macOS o motor usa Metal e ignora a flag de qualquer forma.
- **Permissões de storage de iframe liberadas:** o widget do Turnstile roda num **iframe de
  terceiros** (challenges.cloudflare.com) e, nos fluxos atuais, pede acesso a storage pela
  **Storage Access API** (`storage-access` / `top-level-storage-access`). O handler de
  permissões negava essas duas — o widget ficava girando para sempre mesmo com WebGPU e
  cookies em ordem. Agora são concedidas como num Chrome real.
- **Válvula anti-loop com limpeza pontual de cookies do Cloudflare:** o desafio recarrega a
  página de propósito (isso NUNCA é interrompido), mas loop REAL — a mesma página voltando
  dezenas de vezes — significa um `cf_clearance` morto sendo reenviado. A partir da **6ª volta
  da mesma rota em 90 s** (sem contar a query, pois o token do desafio muda a cada tentativa),
  o app limpa **apenas** os cookies do Cloudflare daquele domínio (`cf_clearance`, `__cf_bm`),
  recarrega uma vez e avisa na interface ("Verificação do Cloudflare travada — cookies do site
  limpos"). Mínimo de 60 s entre limpezas por aba; nada global; nada durante desafios
  saudáveis. É o equivalente automático de apagar o cookie à mão, que era a única saída.
- **Diagnóstico expandido:** a página "Diagnóstico do navegador" agora também mostra a
  Storage Access API (disponibilidade e estado do documento) — o componente que faltava
  para entender travamento de widget embutido.
- Página de diagnóstico documenta a válvula anti-loop para quem precisa reportar problemas.

### v0.5.3
- **CAUSA RAIZ DO LOOP ENCONTRADA COM PROVA (forense no app rodando):** o
  cookie de liberação `cf_clearance` era armazenado PARTICIONADO sob o site
  errado — `topLevelSite: novacrm.com.br` — quando a pessoa entra pelo site
  de marketing e clica em Login (que vai para `app.novacrm.com.br`). Com o
  cookie no "pote" de outro site, a navegação seguinte ao app não carrega a
  liberação → o Cloudflare desafia de novo → loop infinito. Corrigido
  desativando o particionamento de storage de terceiros
  (`ThirdPartyStoragePartitioning` + `PartitionedCookies`), o comportamento
  clássico de navegadores; presença dos switches confirmada no processo.
- Forense completa: console da página e do iframe Turnstile, requisições,
  headers reais enviados (requestWillBeSentExtraInfo) e chaves de partição
  dos cookies — foi assim que o "pote errado" apareceu.

### v0.5.2
- **Correção validada pela ferramenta OFICIAL do Cloudflare:** rodamos o
  Turnstile Troubleshooter (debug.challenges.cloudflare.com) dentro do
  CALOPSIA e ele acusou "Graphics Information Appears Fake — WebGL renderer
  info is spoofed". A causa era a flag `ignore-gpu-blocklist` (v0.5.1):
  forçar uma GPU que o Chromium bloqueou cria uma impressão de vídeo que
  nenhum Chrome real teria na mesma máquina. A flag foi removida — o
  WebGPU continua disponível pelo caminho de software (o mesmo fallback
  do Chrome). Rodando a ferramenta de novo: diagnóstico limpo, sem
  advertências.
- Página "Diagnóstico do navegador" ganhou atalho para a verificação
  oficial do Cloudflare.

### v0.5.1
- **Motor atualizado: Electron 44 (Chromium 152)** — inclui correções de
  GPU/WebGPU recentes (houve relatos de crash do processo de GPU no
  Windows durante o Turnstile em versões anteriores).
- **WebGPU garantido de volta:** o log capturado na máquina do usuário
  ("No available adapters") mostrou que, sem as flags, o Turnstile morre
  no `requestAdapter()` e recarrega em loop. Restauradas
  `enable-unsafe-webgpu` + `ignore-gpu-blocklist` e acrescentada
  `enable-features=Vulkan` (necessária ao WebGPU no Linux). Identidade
  continua 100% nativa (v0.5.0).
- **Nova página "Diagnóstico do navegador"** (menu ☰): mostra na tela
  User-Agent, marcas, cookies, DOM Storage, WebGL e o teste decisivo de
  WebGPU (adapter/dispositivo) — para saber na hora se a máquina está
  apta à verificação do Cloudflare.

### v0.5.0 — "modo compatibilidade": identidade 100% nativa
- **Zero modificações no ambiente da página.** Análise externa da v0.4.2
  apontou o caminho certo: cada camada custom (UA montado à mão, `sec-ch-ua`
  reescrito, `navigator.userAgentData` patcheado, `window.chrome` criado,
  flags de GPU forçadas) tornava o navegador MAIS inconsistente, não menos.
  Um Chromium nativo é consistente consigo mesmo.
- **User-Agent**: agora é o UA NATIVO do Chromium com apenas os tokens do
  wrapper (`Electron/x`, nome do app) removidos — exatamente um Chromium
  puro, que é o que o CALOPSIA é. Dicas de cliente (`sec-ch-ua`,
  `userAgentData`) ficam as nativas do motor, sem nenhum patch.
- **Removido** o rewrite de `sec-ch-ua`/`sec-ch-ua-full-version-list`
  (função `coerirCabecalhos` inteira) — o Chromium gera dicas coerentes
  sozinho.
- **Removida** qualquer injeção de JavaScript no mundo das páginas
  (`declararMarcaCalopsia`/`webFrame` fora do preload).
- **Removidas** as flags `enable-unsafe-webgpu`/`ignore-gpu-blocklist`:
  forçá-las sobrepõe decisões de segurança do Chromium e cria um estado
  que um Chrome real na mesma máquina não teria.
- Mantidos: permissões restritas ao essencial, preload de recursos do
  navegador (zoom/senhas) apenas no mundo isolado — como os content
  scripts do Chrome.

### v0.4.2
- **Removido o apagador de `cf_clearance` (causa do loop apontada em
  análise externa):** ao receber uma resposta `challenge`, o app apagava o
  cookie de liberação do Cloudflare — uma resposta tardia podia apagar o
  cookie RECIÉM-EMITIDO e o desafio recomeçava para sempre. Navegador
  nenhum mexe em cookie de terceiro; o bloco foi eliminado.
- **Identidade "navegador honesto" (padrão Edge/Vivaldi/Opera):** em vez
  de fingir ser o Google Chrome, o CALOPSIA agora declara a própria
  marca — `Calopsia/<versão>` no User-Agent, `Calopsia` nas dicas
  sec-ch-ua e no `navigator.userAgentData` (patch mínimo nos objetos
  reais). O `window.chrome` artificial foi removido (o próprio Chromium
  o fornece). Menos fingimento = menos inconsistências para o anti-bot.
- WebGPU (correção v0.4.1) mantido: adapter sempre disponível.

### v0.4.1
- **Cloudflare/Turnstile — causa raiz encontrada no console do usuário:**
  o erro `No available adapters` (WebGPU sem adapter) fazia a verificação
  falhar e recarregar em loop. O Turnstile atual usa WebGPU; quando o
  Electron não consegue um adapter (GPU na blocklist ou ausente), o desafio
  nunca conclui. Corrigido: o CALOPSIA agora garante sempre um adapter
  (hardware ou software), como o Chrome faz (`enable-unsafe-webgpu` +
  `ignore-gpu-blocklist`). Validado com o app rodando: `requestAdapter()`
  e `requestDevice()` voltam OK.

### v0.4.0
- **Fim do `<webview>`: abas agora são `WebContentsView` nativas.** O Electron
  desaconselha o `<webview>` ("mudanças arquitetônicas que afetam a
  estabilidade de renderização, navegação e roteamento de eventos") e
  recomenda a `WebContentsView`. Cada aba é agora uma view nativa presa
  direto à janela — a mesma arquitetura de um navegador de verdade: os
  eventos de entrada (clique, teclado, roda) vão diretos ao processo da
  página, sem serem re-roteados pelo renderer da interface. Com isso, o
  widget do Turnstile/Cloudflare renderiza de fato (checkbox visível) em
  vez de ficar girando sem engagement.
- **DevTools:** o painel à direita virou view nativa também, gerenciada pelo
  motor de abas — abre/fecha/posiciona sem depender da interface.
- **Menu de contexto, "Inspecionar", zoom por Ctrl+roda e permissões**
  funcionando nativamente para as views.
- Motor de abas isolado em `src/tabs.js`; a interface manda o retângulo
  útil e recebe um único canal de eventos (`view:event`).
- Testado de ponta a ponta com o app rodando: abas, navegação, títulos,
  voltar/avançar, páginas internas, Sobre, painel DevTools e troca de abas
  validada por screenshots (zero exceções no console).
- *Nota honesta:* em IP de datacenter (como o deste ambiente de teste) o
  Cloudflare mantém o desafio no máximo mesmo em Chrome genuíno — o
  resultado final depende da reputação do SEU IP. A combinação atual
  (motor Chromium 150 + views nativas + identidade coerente) é o melhor
  cenário possível para um IP residencial.

### v0.3.0
- **Atualização do motor: Electron 31 → 43 (Chromium 126 → 150).** Investigando
  o loop do Cloudflare a fundo (reproduzindo no app real e comparando com um
  Electron "puro" de controle), confirmei que a pilha do navegador estava
  coerente — o gargalo era a **idade do motor**: Chromium 126 é de meados de
  2024, e a pontuação anti-bot do Cloudflare pune versões antigas. Com o
  Chrome 150, User-Agent, cabeçalhos `sec-ch-ua`, `navigator.userAgentData` e
  o motor real voltam a dizer a mesma coisa — e atual. (Num IP de datacenter
  o desafio continua duro por política do Cloudflare — nem Chrome genuíno
  passa; em IP residencial a combinação "navegador atual + IP de casa" é o
  que o desafio pontua bem.)
- Testado de ponta a ponta no Electron 43: abas, navegação, painel DevTools,
  páginas internas (calopsia://), Sobre, voltar/avançar com título/favicon.

### v0.2.11
- **CORREÇÃO CRÍTICA — nenhuma página carregava:** a v0.2.10 saiu com um erro
  de inicialização (ReferenceError no boot, causado pelo estado do painel
  DevTools declarado após o seu primeiro uso). As páginas chegavam a
  carregar por baixo, mas nenhuma aba era ativada/exibida. Corrigido e
  **testado de ponta a ponta** com o app rodando de verdade.
- **Painel DevTools agora abre de fato:** a v0.2.10 também saiu sem a
  implementação do painel (o botão chamava uma ponte que não existia).
  Agora F12/Ctrl+Shift+I/menu/"Inspecionar" abrem o painel ao lado
  direito da página com o DevTools completo (Elements, Console, Network,
  Sources…), fecha ao trocar/fechar aba e reabre normalmente.

### v0.2.10
- **Cloudflare (loop infinito, a fundo):** eram TRÊS contradições somadas.
  (1) o cabeçalho `sec-ch-ua` usava um "grease" que não é o do Chromium 126 —
  cada versão usa o seu, inventar um é sinal de bot; agora o grease real é
  preservado e apenas a marca "Google Chrome" é acrescentada com o número
  certo. (2) o `navigator.userAgentData` das páginas listava só "Chromium"
  enquanto UA e cabeçalhos diziam "Chrome" — o Cloudflare cruza os dois;
  agora a lista de marcas é ajustada **nos objetos reais** (protótipos
  nativos intactos — nada de objetos falsos como na v0.2.6), a mesma
  estratégia do Brave. (3) `window.chrome` não existia (todo Chrome o tem) —
  agora existe, com `csi`/`loadTimes` de aparência nativa. Com a nota do
  desafio em alta, o `cf_clearance` deixa de ser rejeitado e o loop acaba.
- **DevTools realmente ao lado da página:** o Electron não sabe ancorar
  DevTools de `<webview>` (abria solto ou não abria). Agora o frontend do
  DevTools é hospedado num painel próprio da interface
  (`setDevToolsWebContents`), fisicamente ao lado direito da página —
  F12, Ctrl+Shift+I, menu ☰ e "Inspecionar" (botão direito) abrem esse
  painel; ele fecha sozinho ao trocar/fechar a aba.

### v0.2.9
- **Cloudflare (volta para a verificação):** o app enviava um User-Agent de
  Chrome, mas os cabeçalhos de dicas de cliente (`sec-ch-ua`) gerados pelo
  Electron diziam apenas "Chromium" — contradição que o Cloudflare trata
  como bot: o desafio passava, o site redirecionava… e caía de novo na
  verificação. Agora os cabeçalhos dizem exatamente o que o UA diz (a
  mesma estratégia do Brave) e, quando o Cloudflare responde "challenge",
  o cookie de liberação (`cf_clearance`) rejeitado é descartado na hora —
  reenviar um cookie morto era o que mantinha o loop.
- **DevTools ao lado da página:** as Ferramentas do Desenvolvedor
  (`Ctrl+Shift+I`/`F12`, menu ☰ e "Inspecionar" no botão direito) agora
  abrem **acopladas ao lado direito da página**, como painel, em vez de
  janela solta.
- **Logo maior:** a logo agora preenche mais o ícone do app (janela,
  barra de tarefas, instalador e menus) em todos os sistemas — antes ela
  ficava com uma margem transparenta grande.

### v0.2.8
- **Título e ícone da aba ao voltar/avançar:** quando a pessoa voltava para
  uma página, a aba continuava mostrando o título e o favicon do site
  anterior — o Chromium restaura páginas do back-forward cache sem avisar
  de novo. Agora cada aba guarda uma memória por URL e o título/ícone
  certos são reaplicados na hora (com um reforço no `dom-ready`).
- **DevTools de verdade para a página:** `Ctrl+Shift+I`/`F12` e o menu
  "Ver" agora abrem o inspetor completo (Elements, Console, Network,
  Sources…) **da página aberta** — antes abriam o da interface do
  navegador, que parecia um console "vazio".
- **Menu de contexto (botão direito) nas páginas:** Voltar/Avançar/
  Recarregar, Copiar/Colar em campos, abrir/copiar link, abrir/salvar/
  copiar imagem, pesquisar seleção no Google e **Inspecionar** — que abre
  o DevTools já parado no elemento sob o cursor.
- **Recarregar e zoom do menu nativo** agora agem na página, não na
  interface (incluindo "Recarregar ignorando o cache", `Ctrl+Shift+R`).

### v0.2.7
- **Atualizador automático:** o CALOPSIA agora verifica sozinho, a cada
  30 minutos, se saiu versão nova nas Releases do GitHub. Quando há
  atualização, um ponto verde aparece no botão ☰ e o primeiro item do
  menu fica destacado ("Atualizar para a vX") — um clique baixa o
  instalador certo para o seu sistema com barra de progresso e, no fim,
  pergunta se quer instalar agora. Também dá para verificar na mão e
  atualizar pela página **Sobre o CALOPSIA**.
- **Cloudflare corrigido de vez:** removidas as emulações de
  `navigator.userAgentData`, `window.chrome.runtime`, `chrome.csi`,
  `chrome.loadTimes` e `permissions.query` que eram injetadas nas
  páginas — eram exatamente elas que o desafio do Cloudflare detectava
  (objetos falsos não têm os protótipos nativos que ele inspeciona),
  deixando a tela presa em "Verificando…". Também saiu o "protetor
  contra loop de recarregamento", que interrompia o carregamento no
  meio da verificação — a tela do Cloudflare recarrega a página de
  propósito, e o protetor matava o desafio antes dele terminar. Agora
  o navegador se apresenta de forma honesta e o desafio conclui
  normalmente.

### v0.2.6
- **Gerenciador de senhas:** detecção automática de formulários de login,
  oferta para salvar depois que o login dá certo, preenchimento ao clicar no
  campo, gerador de senhas fortes e tela interna para ver/revelar/esquecer.
  Cofre cifrado com senha mestra (scrypt + AES-256-GCM) e, por cima, com o
  chaveiro do sistema quando ele existir.
- **Identidade do navegador:** o Electron anunciava User-Agent de Chrome mas
  se identificava como "Chromium" sem a marca "Google Chrome" no
  `navigator.userAgentData` — contradição que os anti-bots usam para travar
  a verificação. Agora o navegador é coerente com o que diz ser.
- **Loop de recarregamento:** páginas que ficam se recarregando para sempre
  (o sintoma clássico da tela de verificação do Cloudflare) agora são
  interrompidas com um aviso, em vez de travar a aba queimando CPU.
- **Firewall do Windows:** desligada a descoberta de dispositivos na rede
  (mDNS/Cast), que não usamos e que provocava o aviso do firewall.

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
