> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Otimização e limpeza do código

A limpeza foi feita sem alterar migrations já aplicadas, `seed.sql`, `config.toml`, nomes de RPC, payloads ou regras de negócio.

## Removido

- pacote `packages/shared-types`, que não possuía nenhum consumidor;
- tela Desktop legada duplicada; o código ativo virou `screens/index.mjs` e Dashboard/Odômetro/Relatórios foram isolados em `screens/analise.mjs`;
- script antigo `seed-auth-users.mjs`, substituído por `seed-demo-remote.mjs`;
- `config.example.json` e `apps/company-desktop/config.json` residuais;
- relatórios de versões antigas e documentação de MFA já desativado;
- funções internas sem nenhuma referência;
- comentários de seção/docblocks excessivos, mantendo comentários inline relevantes;
- testes versionados repetitivos, consolidados em testes semânticos de regressão.

## Deduplicado

- canais IPC do processo principal/preload agora vêm de `ipc-channels.cjs`;
- varredura recursiva de arquivos dos scripts de verificação usa `ferramentas/apoio/arquivos.mjs`;
- o smoke do Electron remove seus arquivos temporários ao terminar.

## Correções encontradas durante a limpeza

- `report:counts` agora cria a pasta de saída automaticamente;
- `report:counts` conta as rotas traduzidas como `rota(...)`;
- smoke do convite de equipe verifica comportamento real em vez de depender de texto de comentário.

## O que foi preservado de propósito

Migrations históricas não foram compactadas nem reescritas: projetos novos precisam do histórico e projetos existentes já registraram essas versões. Admin Web e Electron também continuam com componentes visuais separados para preservar a fronteira arquitetural entre os dois produtos.
