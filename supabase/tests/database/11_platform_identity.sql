-- =============================================================================
-- 11_platform_identity — bootstrap, papel global e os DOIS EIXOS
-- =============================================================================
-- O ponto mais delicado do handoff: `profiles.active` (conta global) e
-- `company_memberships.active` (acesso a UMA empresa) são independentes.
-- Aqui isso deixa de ser afirmação de documento e vira teste.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create temporary table _fx (k text primary key, v uuid) on commit drop;

insert into auth.users (id, email, aud, role)
values
  (private.stable_uuid('t11:owner'),  'owner@t11.test',  'authenticated', 'authenticated'),
  (private.stable_uuid('t11:second'), 'second@t11.test', 'authenticated', 'authenticated'),
  (private.stable_uuid('t11:cadmin'), 'cadmin@t11.test', 'authenticated', 'authenticated');

insert into public.profiles (id, full_name, active) values
  (private.stable_uuid('t11:owner'),  'Dona da Plataforma', true),
  (private.stable_uuid('t11:second'), 'Segunda Admin',      true),
  (private.stable_uuid('t11:cadmin'), 'Admin da Empresa',   true);

insert into _fx values
  ('owner',  private.stable_uuid('t11:owner')),
  ('second', private.stable_uuid('t11:second')),
  ('cadmin', private.stable_uuid('t11:cadmin'));

-- ===========================================================================
-- 1. Bootstrap do primeiro platform_admin
-- ===========================================================================
select is(
  (select count(*)::int from platform.admins where status = 'active'),
  0,
  'base limpa: nenhum platform_admin ativo antes do bootstrap'
);

-- Token curto demais é recusado: não se aceita segredo fraco.
select throws_ok(
  $$ select platform.issue_bootstrap_token('curto', 'teste', 60) $$,
  '22023',
  null,
  'token de bootstrap com menos de 32 caracteres é recusado'
);

select lives_ok(
  $$ select platform.issue_bootstrap_token(
       'TOKEN-DE-BOOTSTRAP-COM-TAMANHO-SUFICIENTE-0001', 'primeiro acesso', 60) $$,
  'token de bootstrap é emitido'
);

-- Só o hash é gravado: o segredo em claro não existe no banco.
select is(
  (select count(*)::int from platform.bootstrap_tokens
   where token_sha256 = 'TOKEN-DE-BOOTSTRAP-COM-TAMANHO-SUFICIENTE-0001'),
  0,
  'o token em claro NÃO é armazenado'
);
select is(
  (select count(*)::int from platform.bootstrap_tokens
   where token_sha256 ~ '^[a-f0-9]{64}$'),
  1,
  'apenas o SHA-256 do token é armazenado'
);

-- Token errado não concede nada.
select throws_ok(
  $$ select platform.consume_bootstrap_token('TOKEN-ERRADO-MAS-COM-TAMANHO-SUFICIENTE-XX', private.stable_uuid('t11:owner')) $$,
  '42501',
  null,
  'token inválido não cria platform_admin'
);

-- PNF-PLAT-001: auditar uma recusa ANTES de `raise` não persiste — o raise
-- desfaz o INSERT junto. A recusa não é registrada de dentro da função.
select is(
  (select count(*)::int from platform.audit_events
   where action = 'platform.bootstrap' and result = 'denied'),
  0,
  'a função recusada NÃO grava auditoria de dentro (o raise desfaria o INSERT)'
);

-- Quem audita a recusa é o chamador, em transação separada, por log_denial().
select lives_ok(
  format($$ select platform.log_denial(
              p_actor_user_id => null,
              p_action        => 'platform.bootstrap',
              p_reason        => 'invalid_token',
              p_target_id     => %L) $$, private.stable_uuid('t11:owner')),
  'platform.log_denial registra a recusa a partir do chamador'
);

select is(
  (select count(*)::int from platform.audit_events
   where action = 'platform.bootstrap' and result = 'denied'),
  1,
  'a recusa fica auditada quando registrada pelo caminho correto'
);

select is(
  (select metadata ->> 'reason' from platform.audit_events
   where action = 'platform.bootstrap' and result = 'denied' limit 1),
  'invalid_token',
  'o motivo da recusa é preservado na auditoria'
);

select lives_ok(
  $$ select platform.consume_bootstrap_token(
       'TOKEN-DE-BOOTSTRAP-COM-TAMANHO-SUFICIENTE-0001', private.stable_uuid('t11:owner')) $$,
  'token válido cria o primeiro platform_admin'
);

select ok(
  private.is_platform_admin(private.stable_uuid('t11:owner')),
  'o primeiro administrador global está ativo'
);

-- Uso único: o mesmo token não serve duas vezes.
select throws_ok(
  $$ select platform.consume_bootstrap_token(
       'TOKEN-DE-BOOTSTRAP-COM-TAMANHO-SUFICIENTE-0001', private.stable_uuid('t11:second')) $$,
  '55000',
  null,
  'com um admin ativo, o bootstrap fica indisponível'
);

-- Emitir novo token também é bloqueado enquanto houver admin ativo.
select throws_ok(
  $$ select platform.issue_bootstrap_token(
       'OUTRO-TOKEN-DE-BOOTSTRAP-COM-TAMANHO-OK-002', 'tentativa', 60) $$,
  '55000',
  null,
  'não se emite novo token de bootstrap com plataforma já inicializada'
);

-- ===========================================================================
-- 2. platform_admin NÃO depende de membership tenant
-- ===========================================================================
select is(
  (select count(*)::int from public.company_memberships
   where user_id = private.stable_uuid('t11:owner')),
  0,
  'o platform_admin não possui nenhum vínculo de empresa'
);

select ok(
  private.is_platform_admin(private.stable_uuid('t11:owner')),
  'e mesmo assim é platform_admin — o papel global independe de membership'
);

-- O inverso: um company_admin não é platform_admin.
select ok(
  not private.is_platform_admin(private.stable_uuid('t11:cadmin')),
  'um administrador de empresa NÃO é platform_admin'
);

-- ===========================================================================
-- 3. Piso da plataforma: o último administrador global é protegido
-- ===========================================================================
select throws_ok(
  $$ update platform.admins set status = 'blocked', blocked_at = now()
     where user_id = private.stable_uuid('t11:owner') $$,
  '23514',
  null,
  'bloquear o último platform_admin ativo é recusado'
);

-- Com dois administradores, bloquear um é permitido.
insert into platform.admins (user_id, status, granted_by)
values (private.stable_uuid('t11:second'), 'active', private.stable_uuid('t11:owner'));

select lives_ok(
  $$ update platform.admins set status = 'blocked', blocked_at = now(),
            blocked_by = private.stable_uuid('t11:owner')
     where user_id = private.stable_uuid('t11:second') $$,
  'com dois administradores globais, bloquear um é permitido'
);

-- ===========================================================================
-- 4. Profile inativo derruba o papel global
-- ===========================================================================
-- Os dois eixos precisam estar ativos, como em private.current_membership().
update public.profiles set active = false where id = private.stable_uuid('t11:owner');

select ok(
  not private.is_platform_admin(private.stable_uuid('t11:owner')),
  'profile globalmente inativo remove o papel global mesmo com platform.admins ativo'
);

update public.profiles set active = true where id = private.stable_uuid('t11:owner');

select ok(
  private.is_platform_admin(private.stable_uuid('t11:owner')),
  'reativar o profile devolve o papel global'
);

-- ===========================================================================
-- 5. OS DOIS EIXOS — o coração do handoff do Admin Web
-- ===========================================================================
-- Empresa de teste com dois company_admin.
insert into public.companies (id, legal_name, trade_name, cnpj, status)
values (private.stable_uuid('t11:co'), 'Empresa Teste Eixos LTDA', 'Eixos',
        '11444777000161', 'active');

insert into auth.users (id, email, aud, role)
values (private.stable_uuid('t11:cadmin2'), 'cadmin2@t11.test', 'authenticated', 'authenticated');
insert into public.profiles (id, full_name, active)
values (private.stable_uuid('t11:cadmin2'), 'Segundo Admin Empresa', true);

-- Três administradores: é o mínimo para exercitar os dois eixos e ainda sobrar
-- um titular ativo, sem esbarrar no piso do tenant antes da hora.
insert into auth.users (id, email, aud, role)
values (private.stable_uuid('t11:cadmin3'), 'cadmin3@t11.test', 'authenticated', 'authenticated');
insert into public.profiles (id, full_name, active)
values (private.stable_uuid('t11:cadmin3'), 'Terceiro Admin Empresa', true);

insert into public.company_memberships (company_id, user_id, role, active) values
  (private.stable_uuid('t11:co'), private.stable_uuid('t11:cadmin'),  'company_admin', true),
  (private.stable_uuid('t11:co'), private.stable_uuid('t11:cadmin2'), 'company_admin', true),
  (private.stable_uuid('t11:co'), private.stable_uuid('t11:cadmin3'), 'company_admin', true);

-- 5.1 Suspender ACESSO À EMPRESA toca membership e não toca a conta global.
select lives_ok(
  format($$ select platform.suspend_company_access(%L, %L, %L) $$,
         private.stable_uuid('t11:owner'),
         private.stable_uuid('t11:co'),
         private.stable_uuid('t11:cadmin')),
  'suspender acesso à empresa é permitido quando há outro admin ativo'
);

select is(
  (select active from public.company_memberships
   where company_id = private.stable_uuid('t11:co')
     and user_id = private.stable_uuid('t11:cadmin')),
  false,
  'EIXO EMPRESA: company_memberships.active virou false'
);

select is(
  (select active from public.profiles where id = private.stable_uuid('t11:cadmin')),
  true,
  'EIXO PLATAFORMA intacto: profiles.active continua true'
);

-- 5.2 Bloquear CONTA GLOBAL toca profile e não é o mesmo que suspender acesso.
select lives_ok(
  format($$ select platform.block_admin_account(%L, %L, 'teste') $$,
         private.stable_uuid('t11:owner'),
         private.stable_uuid('t11:cadmin2')),
  'bloquear conta global é permitido'
);

select is(
  (select active from public.profiles where id = private.stable_uuid('t11:cadmin2')),
  false,
  'EIXO PLATAFORMA: profiles.active virou false'
);

select is(
  (select active from public.company_memberships
   where company_id = private.stable_uuid('t11:co')
     and user_id = private.stable_uuid('t11:cadmin2')),
  true,
  'EIXO EMPRESA intacto: o vínculo continua marcado como ativo'
);

-- ...mas a conta global bloqueada derruba o acesso efetivo assim mesmo,
-- porque private.current_membership() exige profile ativo. É a diferença entre
-- "o vínculo existe" e "o vínculo funciona".
select is(
  (select count(*)::int from public.company_memberships m
   join public.profiles p on p.id = m.user_id
   where m.user_id = private.stable_uuid('t11:cadmin2') and m.active and p.active),
  0,
  'conta global bloqueada anula o acesso efetivo mesmo com vínculo ativo'
);

-- 5.3 Os dois eixos geram eventos de auditoria DISTINTOS.
select is(
  (select count(*)::int from platform.audit_events
   where action = 'company_access.suspended' and result = 'success'),
  1,
  'suspensão de acesso à empresa gera o evento company_access.suspended'
);
select is(
  (select count(*)::int from platform.audit_events
   where action = 'admin.account_blocked' and result = 'success'),
  1,
  'bloqueio de conta global gera o evento admin.account_blocked'
);
select isnt(
  (select action from platform.audit_events where action = 'company_access.suspended' limit 1),
  (select action from platform.audit_events where action = 'admin.account_blocked' limit 1),
  'os dois escopos nunca compartilham o mesmo evento de auditoria'
);

-- ===========================================================================
-- 6. Proteção do último administrador da EMPRESA
-- ===========================================================================
-- cadmin está suspenso e cadmin2 teve a conta global bloqueada; cadmin3 é o
-- único administrador efetivamente ativo restante.
select throws_ok(
  format($$ select platform.suspend_company_access(%L, %L, %L) $$,
         private.stable_uuid('t11:owner'),
         private.stable_uuid('t11:co'),
         private.stable_uuid('t11:cadmin3')),
  '23514',
  null,
  'suspender o último acesso administrativo ativo é recusado (last_admin_protected)'
);

-- E o mesmo piso vale pelo eixo da PLATAFORMA: bloquear a conta global do
-- último administrador também é recusado, agora com contrato próprio em vez de
-- um erro cru de trigger.
select throws_ok(
  format($$ select platform.block_admin_account(%L, %L) $$,
         private.stable_uuid('t11:owner'),
         private.stable_uuid('t11:cadmin3')),
  '23514',
  null,
  'bloquear a conta global do último administrador é recusado'
);

-- Mesma regra PNF-PLAT-001: a recusa levanta exceção, logo não se audita de
-- dentro. Quem registra é a Edge Function, ao capturar o hint.
select is(
  (select count(*)::int from platform.audit_events
   where action = 'company_access.suspended' and result = 'denied'),
  0,
  'a recusa por last_admin_protected não é auditada de dentro da função'
);

select lives_ok(
  format($$ select platform.log_denial(%L, 'company_access.suspended',
             'last_admin_protected', 'public.company_memberships', %L, %L) $$,
         private.stable_uuid('t11:owner'),
         private.stable_uuid('t11:cadmin3'),
         private.stable_uuid('t11:co')),
  'a Edge Function registra a recusa last_admin_protected via log_denial'
);

select is(
  (select count(*)::int from platform.audit_events
   where action = 'company_access.suspended' and result = 'denied'),
  1,
  'após log_denial, a recusa last_admin_protected está auditada'
);

select is(
  (select active from public.company_memberships
   where company_id = private.stable_uuid('t11:co')
     and user_id = private.stable_uuid('t11:cadmin3')),
  true,
  'a empresa continua com um administrador ativo após a recusa'
);

-- ===========================================================================
-- 7. Acesso negado: quem não é platform_admin não executa nada
-- ===========================================================================
select throws_ok(
  format($$ select platform.list_companies(%L) $$, private.stable_uuid('t11:cadmin')),
  '42501',
  null,
  'company_admin não consegue listar empresas da plataforma'
);

select throws_ok(
  format($$ select platform.get_dashboard(%L) $$, private.stable_uuid('t11:cadmin')),
  '42501',
  null,
  'company_admin não consegue abrir o dashboard global'
);

select throws_ok(
  $$ select platform.list_companies(null) $$,
  '42501',
  null,
  'ator nulo é recusado'
);

-- Administrador global bloqueado perde o acesso imediatamente.
select throws_ok(
  format($$ select platform.list_companies(%L) $$, private.stable_uuid('t11:second')),
  '42501',
  null,
  'platform_admin bloqueado não executa operações globais'
);

-- ===========================================================================
-- 8. Não é possível bloquear a própria conta
-- ===========================================================================
select throws_ok(
  format($$ select platform.block_admin_account(%L, %L) $$,
         private.stable_uuid('t11:owner'), private.stable_uuid('t11:owner')),
  '55000',
  null,
  'o administrador não bloqueia a própria conta'
);

select * from finish();
rollback;
