> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

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
