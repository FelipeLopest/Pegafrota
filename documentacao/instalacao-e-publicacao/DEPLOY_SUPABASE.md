> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Implantação do PegaNaFrota no Supabase

Checklist técnico para um projeto Supabase novo. Para o passo a passo completo,
veja [`../../COMO_SUBIR_O_SISTEMA.md`](../../COMO_SUBIR_O_SISTEMA.md).

## 1. Dependências e vínculo

```bash
npm ci
npx supabase login
npx supabase link --project-ref <REF>
npx supabase db push
```

Não crie tabelas ou papéis manualmente antes do `db push`.

## 2. Autotestes do banco

No SQL Editor:

```sql
select * from private.security_selftest();
select * from private.data_integrity_selftest();
```

Ambos devem retornar zero linhas. Com `psql` disponível:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/smoke.sql
```

## 3. Auth

Em `Authentication → URL Configuration`:

| Campo | Valor |
|---|---|
| Site URL | origem final do Admin Web |
| Redirect URLs | origem final e `<origem>/**` |

A origem deve combinar com `INVITE_BASE_URL`.

O primeiro administrador da empresa é provisionado com **senha direta** e vínculo ativo; ele não depende de convite. `INVITE_BASE_URL` permanece necessário para convites de integrantes/equipe. Nesse fluxo, o Desktop usa `?flow=team-invite` para a definição inicial de senha.

No provider de e-mail:

- senha mínima: 12;
- signup público: desligado;
- SMTP configurado para produção.

## 4. Edge Function

```bash
npx supabase functions deploy platform-admin
npx supabase functions deploy admin-users
npx supabase secrets set ADMIN_WEB_ORIGINS=https://<admin>
npx supabase secrets set INVITE_BASE_URL=https://<admin>
npx supabase secrets set INVITE_DELIVERY=smtp
npx supabase secrets set INVITE_FROM=nao-responda@<dominio>
npx supabase secrets set INVITE_TTL_HOURS=72
npx supabase secrets set RESEND_COOLDOWN_SECONDS=300
npx supabase secrets set ADMIN_USERS_ALLOWED_ORIGINS="null,app://peganafrota,http://localhost:5173,http://127.0.0.1:5173"
```

Adicione o relay SMTP conforme o provedor. A chave privilegiada do projeto não
vai para o bundle do navegador ou do Electron.

## 5. Primeiro administrador global

Use o script oficial, que sincroniza Auth → profile → papel global:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY='<sua-service-role-key>' \
PLATFORM_ADMIN_EMAIL='admin@exemplo.com' \
PLATFORM_ADMIN_PASSWORD='SUA_SENHA_FORTE' \
PLATFORM_ADMIN_FULL_NAME='Administrador' \
npm run platform:bootstrap
```

Não há SQL manual de UUID/profile nesse fluxo.

## 6. Seed opcional de demonstração

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY='<sua-service-role-key>' \
DATABASE_URL='postgresql://...' \
SEED_DEMO_PASSWORD='SENHA_DEMO_12_OU_MAIS' \
npm run seed:remote

DATABASE_URL='postgresql://...' npm run seed:verify
```

Para reconstruir os dados demo preservando as contas do Auth:

```bash
npm run seed:remote -- --reset
```

O seed atual faz upsert de `public.profiles`, portanto o reset remoto pode
preservar perfis sem colisão de chave primária.

## 7. Troca de administrador global

Use `npm run platform:replace`. A RPC ativa o substituto antes de retirar o
papel antigo e mantém a proteção contra ausência de administrador.

A política de ciclo de vida foi ajustada para que:

- `platform.operations.actor_user_id` use `ON DELETE SET NULL`;
- `platform.audit_events.actor_user_id` preserve o UUID histórico sem FK
  mutável, pois a tabela é append-only;
- `platform.admins.user_id` acompanhe o profile por cascade, com o trigger de
  último administrador ainda ativo.

## 8. Validação final

1. login no Admin Web com e-mail e senha;
2. ação crítica com confirmação explícita e auditoria;
3. provisionamento de empresa com senha inicial para o primeiro administrador;
4. login direto do primeiro `company_admin` no Desktop;
5. gestão de equipe pelo `company_admin`;
6. se convites de equipe forem usados, envio/aceite de um convite real;
7. edição/arquivamento de veículo, motorista e local;
8. fluxo completo de viagem e manutenção;
9. `npm run seed:verify` se o ambiente usar os dados demo.
