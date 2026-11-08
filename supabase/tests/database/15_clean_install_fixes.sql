-- =============================================================================
-- 15_clean_install_fixes — ciclo de vida de identidade e troca de platform_admin
-- =============================================================================
-- Garante que uma instalação limpa não recrie o bloqueio encontrado no banco
-- hospedado: o histórico deve sobreviver, mas a identidade antiga deve poder ser
-- removida depois de o papel global ser transferido.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Contrato estrutural das FKs corrigidas
-- ---------------------------------------------------------------------------
select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'platform' and table_name = 'operations'
     and column_name = 'actor_user_id'),
  'YES',
  'platform.operations.actor_user_id aceita NULL após exclusão do ator'
);

select is(
  (select confdeltype::text
   from pg_constraint
   where conrelid = 'platform.operations'::regclass
     and conname = 'operations_actor_user_id_fkey'),
  'n',
  'operations.actor_user_id usa ON DELETE SET NULL'
);

select is(
  (select confdeltype::text
   from pg_constraint
   where conrelid = 'platform.admins'::regclass
     and conname = 'admins_user_id_fkey'),
  'c',
  'platform.admins.user_id acompanha o profile com ON DELETE CASCADE'
);

select is(
  (select count(*)::int
   from pg_constraint con
   join lateral unnest(con.conkey) k(attnum) on true
   join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
   where con.conrelid = 'platform.audit_events'::regclass
     and con.contype = 'f'
     and a.attname = 'actor_user_id'),
  0,
  'audit global preserva actor_user_id histórico sem FK mutável'
);

-- ---------------------------------------------------------------------------
-- Fixtures de duas identidades globais
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role)
values
  (private.stable_uuid('t15:old'), 'old-platform@t15.test', 'authenticated', 'authenticated'),
  (private.stable_uuid('t15:new'), 'new-platform@t15.test', 'authenticated', 'authenticated');

insert into public.profiles (id, full_name, active)
values
  (private.stable_uuid('t15:old'), 'Admin antigo T15', true),
  (private.stable_uuid('t15:new'), 'Admin novo T15', true);

insert into platform.admins (user_id, status)
values (private.stable_uuid('t15:old'), 'active');

insert into platform.operations (
  kind, status, idempotency_key, fingerprint, actor_user_id, request_payload
) values (
  'provision_company', 'pending', 't15-clean-install-op-0001', repeat('a', 64),
  private.stable_uuid('t15:old'), '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- A troca é atômica: primeiro ativa o novo, depois remove o papel antigo.
-- ---------------------------------------------------------------------------
select lives_ok(
  format(
    $$ select platform.replace_platform_admin(%L::uuid, %L::uuid, 'rotação de teste') $$,
    private.stable_uuid('t15:old'), private.stable_uuid('t15:new')
  ),
  'replace_platform_admin transfere o papel sem disparar LAST_PLATFORM_ADMIN_PROTECTED'
);

select ok(
  private.is_platform_admin(private.stable_uuid('t15:new')),
  'novo platform_admin fica ativo'
);

select is(
  (select count(*)::int from platform.admins
   where user_id = private.stable_uuid('t15:old')),
  0,
  'papel global do administrador anterior é removido'
);

select is(
  (select count(*)::int from platform.audit_events
   where action = 'platform_admin.replaced'
     and actor_user_id = private.stable_uuid('t15:old')),
  1,
  'troca fica registrada na auditoria com o UUID real do ator antigo'
);

-- ---------------------------------------------------------------------------
-- Depois da troca, a identidade antiga pode ser removida de verdade.
-- `profiles` cai por CASCADE; a operação sobrevive com ator NULL; a auditoria
-- append-only sobrevive mantendo o UUID histórico, sem UPDATE disfarçado.
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ delete from auth.users where id = %L::uuid $$, private.stable_uuid('t15:old')),
  'identidade antiga pode ser excluída depois da transferência'
);

select is(
  (select count(*)::int from public.profiles where id = private.stable_uuid('t15:old')),
  0,
  'profile antigo é removido pelo ciclo de vida do Auth'
);

select is_null(
  (select actor_user_id from platform.operations
   where idempotency_key = 't15-clean-install-op-0001'),
  'operação histórica sobrevive e solta a FK do ator removido'
);

select is(
  (select actor_user_id from platform.audit_events
   where action = 'platform_admin.replaced' limit 1),
  private.stable_uuid('t15:old'),
  'auditoria append-only preserva o UUID histórico do ator excluído'
);

-- O piso continua valendo mesmo com ON DELETE CASCADE no papel global: apagar
-- a identidade do último admin ativo tentaria remover sua linha em admins e é
-- bloqueado pelo trigger de segurança.
select throws_ok(
  format($$ delete from auth.users where id = %L::uuid $$, private.stable_uuid('t15:new')),
  '23514',
  null,
  'não é possível apagar a identidade do último platform_admin ativo'
);

select ok(
  private.is_platform_admin(private.stable_uuid('t15:new')),
  'o último platform_admin continua íntegro após a tentativa recusada'
);

select * from finish();
rollback;
