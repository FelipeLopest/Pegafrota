> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Correção v16.2 — Admin preso em “Carregando…”

A tradução de identificadores deixou três imports com nomes antigos em inglês no Admin Web. Como módulos ES validam exports antes de executar `main.mjs`, o bootstrap nem chegava ao tratamento de erro e a tela permanecia em “Carregando…”.

Correções:
- `newIdempotencyKey` → `novaChaveIdempotencia`;
- `formatCnpj` → `formatarCnpj`;
- `passwordStrength` → `forcaSenha`;
- remoção da tela `mfa.mjs` obsoleta;
- verificação automática de imports nomeados no `build:admin`;
- `boot-guard.js` para transformar falhas de carregamento de módulo em mensagem útil em vez de tela presa.

Nenhuma RPC, migration, Edge Function ou contrato persistido foi alterado.
