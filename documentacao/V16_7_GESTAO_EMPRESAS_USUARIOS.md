> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# V16.7 — exclusão definitiva e gestão de usuários no painel

O painel da plataforma passa a permitir, no detalhe de cada empresa:

- listar todos os usuários vinculados, não apenas `company_admin`;
- redefinir a senha de um usuário com vínculo e conta ativos;
- excluir um usuário da empresa, removendo também a identidade Auth quando ela não é usada em outro escopo;
- excluir definitivamente uma empresa já arquivada.

## Regras de segurança

A senha nova viaja somente até a Edge Function `platform-admin`, que usa a API administrativa do Supabase Auth. A senha não entra em tabelas, operações ou auditoria.

A exclusão individual continua protegendo o último `company_admin` ativo. Quando a identidade é usada como `platform_admin` ou possui outro vínculo de empresa, apenas o vínculo da empresa atual é apagado; a conta Auth é mantida.

A exclusão definitiva exige que a empresa esteja `archived` e que o operador digite o nome fantasia para confirmar. Ela remove os dados operacionais do tenant e a auditoria do tenant. A auditoria global da plataforma é preservada de forma saneada.

## Backend necessário

Migration:

`20260812000200_platform_hard_delete_user_management.sql`

Depois de aplicar a migration, a Edge Function `platform-admin` precisa ser republicada.
