# Segurança

## Relatando uma vulnerabilidade

Não abra uma issue pública para falhas de segurança. Use o canal privado de contato do mantenedor do repositório.

## Princípios da base

- `nodeIntegration` permanece desativado em todo conteúdo remoto.
- `contextIsolation`, `sandbox` e `webSecurity` permanecem ativados.
- A API exposta pelo preload é pequena e validada no processo principal.
- Protocolos externos são abertos pelo sistema, não renderizados dentro do navegador.
- Permissões sensíveis de sites exigem confirmação explícita.

Não adicione tokens, certificados de assinatura ou arquivos `.env` ao repositório. Use **GitHub Actions Secrets**.
