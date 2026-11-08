> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# MFA/TOTP — recurso aposentado

O PegaNaFrota **não exige aplicativo autenticador**. A decisão de produto vigente é autenticação por e-mail e senha, com autorização server-side por papel/permissão, confirmação explícita para ações destrutivas, idempotência e auditoria.

Este arquivo é mantido apenas para registrar a decisão e evitar que documentação antiga reintroduza TOTP por engano.

## Recuperação de administrador da plataforma

- outro `platform_admin` pode substituir/bloquear o acesso;
- se for o primeiro ou único administrador, use `npm run platform:bootstrap` ou `npm run platform:replace`;
- nunca altere `auth.*` manualmente para recuperar acesso como procedimento normal.
