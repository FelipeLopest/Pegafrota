> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Histórico de refatoração

O projeto passou por revisão de instalação, segurança, completude funcional, navegação e interface.

Resultados consolidados:

- bootstrap reproduzível do administrador da plataforma;
- seed remoto idempotente e verificável;
- separação entre `platform_admin` e `company_admin`;
- gestão completa das principais entidades no Desktop;
- filtros, paginação, navegação por papel e busca global;
- painel e Electron com tema preto/laranja e ações de alto contraste;
- contrato estático entre frontend, RPCs e migrations;
- proteção contra build apontando silenciosamente para backend local;
- identificadores internos em português, preservando contratos externos.

Os relatórios versionados antigos foram removidos. O estado atual está no `README.md`, em `documentacao/GUIA_PRODUTO.md` e na documentação técnica por área.
