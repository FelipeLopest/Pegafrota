> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Correção v5 — ações do Admin Web

## Causa raiz

Os diálogos do Admin Web usavam uma Promise e faziam esta sequência:

1. `m.close()`
2. `resolve(resultado_positivo)`

Porém `modal.close()` chama `onClose` **sincronicamente**. O `onClose` resolvia a
mesma Promise como cancelada antes do `resolve(resultado_positivo)` acontecer.
Por isso o botão visualmente fechava o modal, mas o código recebia
`confirmed: false`/`null` e saía sem chamar a Edge Function.

Isso atingia principalmente:

- Suspender acesso de administrador à empresa;
- Bloquear conta;
- Suspender empresa;
- Arquivar empresa;
- Compensar provisionamento;
- Seleção do motivo de suspensão.

## MFA

Havia dois defeitos adicionais no mesmo fluxo:

- O cadastro TOTP fechava/recriava o modal em cada render, fazendo a Promise de
  enrollment resolver como cancelada antes de terminar.
- A Edge Function devolve `403 MFA_NOT_ENROLLED` quando o primeiro administrador
  ainda não cadastrou TOTP, mas o cliente só continuava automaticamente para
  `401 STEP_UP_REQUIRED`.

A v5 corrige os três pontos. Agora `modal.close(resultado)` é a fonte do
resultado, o enrollment TOTP usa um único modal e uma ação crítica abre o
cadastro/step-up de MFA e refaz a mesma ação automaticamente após a confirmação.

## Arquivos alterados

- `aplicativos/painel-administracao/formularios/confirmacoes-de-bloqueio-e-exclusao.mjs`
- `apps/platform-admin-web/src/screens/mfa.mjs`
- `aplicativos/painel-administracao/comunicacao/comunicacao-com-servidor.mjs`
- `aplicativos/painel-administracao/iniciar-aplicativo.mjs`
- `aplicativos/painel-administracao/testes/teste-inicializacao-basica.mjs`

## Validação executada

- `npm run build:admin` — PASS
- `npm run smoke:admin` — PASS (31/31)
- `npm run lint` — PASS

O teste unitário completo do monorepo não pôde ser reinstalado no ambiente de
empacotamento porque o registry interno não disponibilizou `xtend@4.0.2`.
Isso não afeta o patch; a validação específica do Admin Web foi executada.
