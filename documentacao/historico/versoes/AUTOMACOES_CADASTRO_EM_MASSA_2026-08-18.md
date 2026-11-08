# Automações de cadastro em massa — 2026-08-18

Evolução da central de importação do Desktop para reduzir tarefas repetitivas em empresas com frotas grandes.

## Entregue

- leitura local de Excel `.xlsx`, CSV/TSV e células copiadas;
- modelos Excel oficiais com aba `Dados` e `Ajuda`;
- veículos, motoristas, locais, abastecimentos, manutenções, viagens e equipe;
- atalhos de importação nas telas correspondentes;
- prévia, validação por linha, duplicidade interna, referências existentes e relatório de erros;
- progresso e interrupção controlada;
- concorrência limitada para cadastros independentes;
- abastecimentos em ordem por veículo para proteger cronologia/odômetro;
- equipe por convite, sem senha em planilha;
- parser XLSX interno sem biblioteca/CDN nova;
- nenhuma migration nova.

## Fora do importador genérico por segurança

Movimentações de pátio e ajustes do ledger de odômetro continuam nos fluxos especializados porque dependem de ordem temporal e estado atual.

## Saneamento validado durante a entrega

A cópia enviada continha dois artefatos obsoletos que já eram proibidos pelos testes atuais: `screens/v8.mjs` (cópia morta das telas) e `screens/mfa.mjs` (fluxo MFA removido). Eles e quatro testes versionados antigos que dependiam da cópia `v8.mjs` foram removidos. Os testes canônicos (`product`, `navigation-filters`, `screens-ui`, `performance` e `ui-regression`) permanecem e a suíte unitária passou integralmente.
