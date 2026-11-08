> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

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
