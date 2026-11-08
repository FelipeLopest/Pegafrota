> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota v11 — Experiência e performance

## Interface
- Menu lateral recolhível no Desktop e no Admin Web, persistido por usuário/navegador.
- Atalho `Ctrl+B` alterna o menu; `Ctrl+K` continua abrindo a busca global.
- Painel administrativo migrou de barra horizontal para lateral compactável, mantendo o selo de ambiente e o escopo PLATAFORMA.
- Gráficos SVG sem dependências externas no dashboard dos dois produtos.
- Animações curtas de rota, cards, gráficos, modais, toasts e botões, todas desativadas por `prefers-reduced-motion`.
- Cabeçalhos de tabela fixos, hover mais claro e pintura adiada de conteúdo fora da viewport.

## Electron
- Escrita do estado da janela agora é debounced para evitar I/O a cada pixel durante resize/move.
- `backgroundThrottling` explicitamente ativado.
- Nenhuma mudança em RLS, migrations ou contratos do backend.

## Deploy
É uma atualização de frontend/Electron. Se o backend v10 já está aplicado, não é necessário `db push` por causa desta versão.
