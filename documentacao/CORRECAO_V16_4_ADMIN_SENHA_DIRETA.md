> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# v16.4 — primeiro administrador com senha direta

Ao provisionar uma empresa pelo Admin Web, o administrador da plataforma define a senha inicial do primeiro `company_admin`.

- Não é enviado link para novas empresas.
- A conta do Supabase Auth nasce com `email_confirm=true`.
- O vínculo `company_admin` nasce ativo e o usuário pode entrar imediatamente no Electron.
- A senha não é gravada em `platform.operations`, auditoria ou banco de negócio.
- Contas Auth já existentes são recusadas para evitar redefinição silenciosa de senha.
- Convites antigos continuam suportados apenas para compatibilidade com dados já existentes.

## Aplicação

1. `npx supabase db push --db-url "$env:SUPABASE_DB_URL"`
2. `npx supabase functions deploy platform-admin --project-ref jnznizrtbivrvqkskcep`
3. `npm run build:admin`
4. `npm run preview:admin`
