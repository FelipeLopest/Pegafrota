> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Documentação do PegaNaFrota

A documentação foi organizada para separar **estado atual**, **referência de arquitetura/banco** e **histórico de versões**.

## Comece por aqui

| Pasta/arquivo | Uso |
|---|---|
| [`ia/`](ia/README.md) | documentação atual consolidada para IA e novos desenvolvedores |
| [`ia/MAPA_DE_PASTAS_E_ARQUIVOS.md`](ia/MAPA_DE_PASTAS_E_ARQUIVOS.md) | onde cada arquivo pertence e para que servem as pastas |
| [`produto/GUIA_PRODUTO.md`](produto/GUIA_PRODUTO.md) | visão funcional para entender o sistema |
| [`produto/AUTOMACOES_IMPORTACAO_EM_MASSA.md`](produto/AUTOMACOES_IMPORTACAO_EM_MASSA.md) | automações para cadastros volumosos e regras de importação |
| [`operacao/DEPLOY_SUPABASE.md`](operacao/DEPLOY_SUPABASE.md) | implantação no Supabase |
| [`operacao/E2E_SCENARIOS.md`](operacao/E2E_SCENARIOS.md) | cenários funcionais de ponta a ponta |
| [`adr/`](adr/) | decisões arquiteturais originais aprovadas |
| [`database/`](database/) | documentação detalhada do banco e contratos SQL |
| [`architecture/`](architecture/) | blueprint/arquitetura original; algumas partes são históricas |
| [`historico/`](historico/README.md) | correções, relatórios e versões antigas — **não é fonte da regra atual** |
| [`assets/`](assets/) | imagens usadas como referência documental |

## Fonte de verdade

Se um documento divergir do código, a ordem é:

1. migrations e código executável;
2. `docs/ia/`;
3. ADRs e documentação detalhada;
4. histórico.

Essa ordem evita que uma nota de uma versão antiga volte a reintroduzir MFA, fluxo antigo de convite ou arquivos já removidos.
