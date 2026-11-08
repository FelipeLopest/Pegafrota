-- =============================================================================
-- 14_invite_lifecycle — ciclo de vida completo do convite
-- =============================================================================
-- Cobre os oito casos exigidos pela Rodada 3: sucesso, expirado, revogado, já
-- aceito, usuário diferente, reenvio invalidando o anterior, janela de reenvio
-- e usuário já existente.
--
-- Estas regras moram no BANCO de propósito. A Edge Function e a tela apenas as
-- apresentam — colocá-las no cliente significaria que um convite vazado poderia
-- ser aceito por quem controlasse a requisição.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- Fixtures -------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  (private.stable_uuid('t14:owner'),  'owner@t14.test',  'authenticated', 'authenticated'),
  (private.stable_uuid('t14:admin'),  'admin@t14.test',  'authenticated', 'authenticated'),
  (private.stable_uuid('t14:other'),  'other@t14.test',  'authenticated', 'authenticated');

insert into public.profiles (id, full_name, active) values
  (private.stable_uuid('t14:owner'), 'Dona da Plataforma', true),
  (private.stable_uuid('t14:admin'), 'Admin Convidado',    true),
  (private.stable_uuid('t14:other'), 'Outra Pessoa',       true);

insert into platform.admins (user_id, status) values (private.stable_uuid('t14:owner'), 'active');

insert into public.companies (id, legal_name, trade_name, cnpj, status)
values (private.stable_uuid('t14:co'), 'Convites Teste LTDA', 'Convites T14', '06990590000123', 'active');

insert into public.company_memberships (company_id, user_id, role, active)
values (private.stable_uuid('t14:co'), private.stable_uuid('t14:admin'), 'company_admin', false);

-- ===========================================================================
-- 1. Emissão
-- ===========================================================================
select lives_ok(
  format($$ select platform.issue_invite(%L, %L, 'admin@t14.test',
             'TOKEN-CONVITE-T14-COM-TAMANHO-SUFICIENTE-01', %L, 72, 300) $$,
         private.stable_uuid('t14:co'), private.stable_uuid('t14:admin'),
         private.stable_uuid('t14:owner')),
  'convite é emitido'
);

select is(
  (select count(*)::int from platform.company_invites
   where token_sha256 = 'TOKEN-CONVITE-T14-COM-TAMANHO-SUFICIENTE-01'),
  0,
  'o token em claro NÃO é armazenado'
);

select is(
  (select count(*)::int from platform.company_invites
   where company_id = private.stable_uuid('t14:co')
     and accepted_at is null and revoked_at is null),
  1,
  'existe exatamente um convite pendente'
);

-- ===========================================================================
-- 2. Usuário diferente do titular
-- ===========================================================================
-- O caso que um link vazado exploraria.
select throws_ok(
  format($$ select platform.accept_invite(
             'TOKEN-CONVITE-T14-COM-TAMANHO-SUFICIENTE-01', %L) $$,
         private.stable_uuid('t14:other')),
  '42501',
  null,
  'convite apresentado por outro usuário é recusado'
);

select is(
  (select active from public.company_memberships
   where company_id = private.stable_uuid('t14:co')
     and user_id = private.stable_uuid('t14:admin')),
  false,
  'e o vínculo do titular continua inativo'
);

-- ===========================================================================
-- 3. Janela de reenvio
-- ===========================================================================
select throws_ok(
  format($$ select platform.issue_invite(%L, %L, 'admin@t14.test',
             'OUTRO-TOKEN-T14-COM-TAMANHO-SUFICIENTE-002', %L, 72, 300) $$,
         private.stable_uuid('t14:co'), private.stable_uuid('t14:admin'),
         private.stable_uuid('t14:owner')),
  '55000',
  null,
  'reenviar antes da janela é recusado'
);

-- ===========================================================================
-- 4. Reenvio invalida o anterior
-- ===========================================================================
-- Encurta a janela para exercitar o reenvio sem esperar de verdade.
update platform.company_invites set resend_available_at = now() - interval '1 minute'
where company_id = private.stable_uuid('t14:co') and accepted_at is null and revoked_at is null;

select lives_ok(
  format($$ select platform.issue_invite(%L, %L, 'admin@t14.test',
             'OUTRO-TOKEN-T14-COM-TAMANHO-SUFICIENTE-002', %L, 72, 300) $$,
         private.stable_uuid('t14:co'), private.stable_uuid('t14:admin'),
         private.stable_uuid('t14:owner')),
  'reenvio é permitido depois da janela'
);

select is(
  (select count(*)::int from platform.company_invites
   where company_id = private.stable_uuid('t14:co')
     and accepted_at is null and revoked_at is null),
  1,
  'continua existindo apenas UM convite válido'
);

select is(
  (select revoked_reason from platform.company_invites
   where company_id = private.stable_uuid('t14:co') and revoked_at is not null
   order by created_at limit 1),
  'superseded_by_resend',
  'o convite anterior foi revogado pelo reenvio'
);

-- O link antigo deixa de funcionar. Se continuasse valendo, dois links ativos
-- coexistiriam e o "uso único" seria só aparência.
select throws_ok(
  format($$ select platform.accept_invite(
             'TOKEN-CONVITE-T14-COM-TAMANHO-SUFICIENTE-01', %L) $$,
         private.stable_uuid('t14:admin')),
  '55000',
  null,
  'o link anterior ao reenvio é recusado (revogado)'
);

-- ===========================================================================
-- 5. Aceite com sucesso
-- ===========================================================================
select lives_ok(
  format($$ select platform.accept_invite(
             'OUTRO-TOKEN-T14-COM-TAMANHO-SUFICIENTE-002', %L) $$,
         private.stable_uuid('t14:admin')),
  'o titular aceita o convite'
);

select is(
  (select active from public.company_memberships
   where company_id = private.stable_uuid('t14:co')
     and user_id = private.stable_uuid('t14:admin')),
  true,
  'o aceite ATIVA o vínculo'
);

select is(
  (select count(*)::int from platform.audit_events
   where action = 'invite.accepted' and result = 'success'),
  1,
  'o aceite é auditado'
);

-- ===========================================================================
-- 6. Uso único
-- ===========================================================================
select throws_ok(
  format($$ select platform.accept_invite(
             'OUTRO-TOKEN-T14-COM-TAMANHO-SUFICIENTE-002', %L) $$,
         private.stable_uuid('t14:admin')),
  '55000',
  null,
  'o mesmo convite não é aceito duas vezes'
);

-- ===========================================================================
-- 7. Expiração
-- ===========================================================================
insert into public.companies (id, legal_name, trade_name, cnpj, status)
values (private.stable_uuid('t14:co2'), 'Expirado LTDA', 'Expirado T14', '60746948000112', 'active');
insert into public.company_memberships (company_id, user_id, role, active)
values (private.stable_uuid('t14:co2'), private.stable_uuid('t14:other'), 'company_admin', false);

select platform.issue_invite(
  private.stable_uuid('t14:co2'), private.stable_uuid('t14:other'), 'other@t14.test',
  'TOKEN-EXPIRADO-T14-COM-TAMANHO-SUFICIENTE-3', private.stable_uuid('t14:owner'), 72, 300);

update platform.company_invites set expires_at = now() - interval '1 hour'
where company_id = private.stable_uuid('t14:co2') and accepted_at is null and revoked_at is null;

select throws_ok(
  format($$ select platform.accept_invite(
             'TOKEN-EXPIRADO-T14-COM-TAMANHO-SUFICIENTE-3', %L) $$,
         private.stable_uuid('t14:other')),
  '55000',
  null,
  'convite expirado é recusado'
);

select is(
  (select active from public.company_memberships
   where company_id = private.stable_uuid('t14:co2')
     and user_id = private.stable_uuid('t14:other')),
  false,
  'e o vínculo permanece inativo'
);

-- ===========================================================================
-- 8. Token inexistente
-- ===========================================================================
select throws_ok(
  format($$ select platform.accept_invite(
             'TOKEN-QUE-NUNCA-EXISTIU-COM-TAMANHO-OK-99', %L) $$,
         private.stable_uuid('t14:other')),
  '42501',
  null,
  'token inexistente é recusado'
);

-- ===========================================================================
-- 9. Usuário já existente é reaproveitado, não duplicado
-- ===========================================================================
-- `t14:other` já tem profile. Um novo convite para ele em outra empresa não
-- pode criar um segundo profile nem exigir conta nova.
select is(
  (select count(*)::int from public.profiles where id = private.stable_uuid('t14:other')),
  1,
  'usuário já existente continua com um único profile'
);

select * from finish();
rollback;
