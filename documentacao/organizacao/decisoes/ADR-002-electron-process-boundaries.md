> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ADR-002 — Fronteiras do Electron

## Status
Aprovada.

## Decisão
Main para capacidades locais, preload mínimo e renderer isolado.

## Regras
`nodeIntegration` desativado, `contextIsolation` e sandbox ativos, IPC específico e validado.

## Consequência
Mais segurança e contratos explícitos.
