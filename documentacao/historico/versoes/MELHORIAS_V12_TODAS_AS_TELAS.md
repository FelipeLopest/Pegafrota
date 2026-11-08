> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota v12 — melhorias em todas as telas

Esta versão corrige os gráficos quebrados da v11 e aplica a mesma qualidade visual em todas as rotas do Electron e do painel administrativo.

## Principais mudanças
- Roscas refeitas com `conic-gradient`, sem transformações SVG que geravam artefatos no Electron.
- Cabeçalho contextual com ícone e seção em todas as telas.
- Faixa de indicadores nas listas de veículos, motoristas, viagens, abastecimentos, manutenções, locais, movimentações, equipe e auditoria.
- Tabelas, filtros, formulários, detalhes, cards, modais e estados vazios redesenhados globalmente.
- Pesquisa local com debounce para reduzir rerenderizações durante digitação.
- `content-visibility` removido dos cards animados; mantido somente em tabelas grandes.
- Odômetro e relatórios também receberam contexto visual e indicadores.
- O painel administrativo recebeu a mesma linguagem visual fora do dashboard.

Não há migration nova nesta versão.
