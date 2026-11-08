-- =============================================================================
-- PegaNaFrota — 002200 — Hardening final e autoteste de segurança
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. anon não alcança nada do domínio
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on schema private from anon;
revoke all on schema audit   from anon;

-- ---------------------------------------------------------------------------
-- 2. service_role: usado apenas por Edge Function e script local administrativo
-- ---------------------------------------------------------------------------
-- ADR-003 e SECURITY_MODEL.md §3: a service role NUNCA é empacotada no Electron.
-- Os grants existem para o provisionamento de usuários (DATA_ACCESS.md §3).
grant select, insert, update, delete on
  public.companies,
  public.profiles,
  public.company_memberships
to service_role;

grant select on
  public.drivers,
  public.vehicles,
  public.vehicle_odometer_events,
  public.trips,
  public.fuelings,
  public.maintenance_records,
  public.locations,
  public.cameras,
  public.plate_read_events,
  public.vehicle_movements
to service_role;

grant select on audit.events to service_role;
grant execute on function private.log_audit_event(uuid, audit.event_action, text, uuid, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Autoteste de segurança
-- ---------------------------------------------------------------------------
-- Pensado para o handoff de auditoria: devolve UMA LINHA POR PROBLEMA
-- encontrado. Resultado vazio significa "nenhum desvio detectado".
create or replace function private.security_selftest()
returns table (severity text, finding text, object_name text)
language sql
stable
security definer
set search_path = ''
as $$
  -- (a) Tabela exposta em public sem RLS habilitada.
  select 'critical', 'tabela em public sem RLS habilitada', c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all
  -- (b) Tabela com RLS habilitada mas sem nenhuma policy (nega tudo por acidente).
  select 'warning', 'tabela com RLS e sem policy', c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'audit') and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)

  union all
  -- (c) Função SECURITY DEFINER sem search_path fixo (vetor clássico de escalada).
  select 'critical', 'SECURITY DEFINER sem search_path fixo',
         (n.nspname || '.' || p.proname)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private', 'audit')
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg like 'search_path=%'
    )

  union all
  -- (d) Qualquer privilégio concedido a anon em public/private/audit.
  select 'critical', 'privilégio concedido a anon',
         (table_schema || '.' || table_name || ' ' || privilege_type)::text
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema in ('public', 'private', 'audit')

  union all
  -- (e) Tabela de private acessível por authenticated (catálogo de permissões).
  select 'critical', 'tabela de private concedida a authenticated',
         (table_schema || '.' || table_name || ' ' || privilege_type)::text
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema in ('private')

  union all
  -- (f) authenticated com escrita em tabela cuja escrita deve ser só por RPC.
  select 'critical', 'escrita direta concedida em tabela transacional',
         (table_name || ' ' || privilege_type)::text
  from information_schema.role_table_grants
  where grantee = 'authenticated'
    and table_schema = 'public'
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    and table_name in (
      'vehicle_odometer_events', 'vehicle_movements', 'plate_read_events'
    )

  union all
  select 'critical', 'INSERT direto concedido em fuelings', 'public.fuelings'
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and table_name = 'fuelings' and privilege_type = 'INSERT'

  union all
  -- (g) View exposta sem security_invoker (caminho de escape de tenant).
  select 'critical', 'view sem security_invoker', c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(
      (select option_value::boolean
       from pg_options_to_table(c.reloptions)
       where option_name = 'security_invoker'),
      false
    )

  union all
  -- (h) Tabela de negócio em public sem company_id.
  select 'warning', 'tabela de negócio sem company_id', c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in ('companies', 'profiles')
    and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'company_id' and a.attnum > 0 and not a.attisdropped
    );
$$;

comment on function private.security_selftest() is
  'Devolve uma linha por desvio de segurança. Resultado vazio = nenhum desvio. Usado no handoff de auditoria.';

revoke all on function private.security_selftest() from public, anon, authenticated;
grant execute on function private.security_selftest() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Verificação de integridade de dados (usada por verify-seed.mjs)
-- ---------------------------------------------------------------------------
create or replace function private.data_integrity_selftest()
returns table (severity text, finding text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Cache de odômetro divergente do ledger.
  select 'critical', 'current_odometer_km divergente do ledger',
         (v.plate || ': cache=' || v.current_odometer_km || ' ledger=' || coalesce(l.max_km, 0))::text
  from public.vehicles v
  left join (
    select vehicle_id, max(odometer_km) as max_km
    from public.vehicle_odometer_events group by vehicle_id
  ) l on l.vehicle_id = v.id
  where v.current_odometer_km <> coalesce(l.max_km, v.current_odometer_km)

  union all
  -- Regressão dentro do ledger.
  select 'critical', 'regressão no ledger de odômetro',
         (e.vehicle_id::text || ' evento ' || e.id::text)::text
  from public.vehicle_odometer_events e
  where e.previous_km is not null and e.odometer_km < e.previous_km

  union all
  -- Movimentação fora de alternância.
  select 'critical', 'movimentação fora de alternância',
         (m.vehicle_id::text || ' seq ' || m.sequence_no::text)::text
  from public.vehicle_movements m
  where (m.sequence_no % 2 = 1 and m.movement_type <> 'entry')
     or (m.sequence_no % 2 = 0 and m.movement_type <> 'exit')

  union all
  -- Buraco na sequência de movimentações.
  select 'critical', 'buraco na sequência de movimentações',
         (t.vehicle_id::text || ' esperado ' || t.expected || ' encontrado ' || t.found)::text
  from (
    select vehicle_id, max(sequence_no) as found, count(*)::integer as expected
    from public.vehicle_movements group by vehicle_id
  ) t
  where t.found <> t.expected

  union all
  -- Total de abastecimento divergente.
  select 'critical', 'total de abastecimento divergente', f.id::text
  from public.fuelings f
  where f.total_amount <> round(f.liters * f.price_per_liter, 2)

  union all
  -- Leitura OCR não confirmada com movimentação associada.
  select 'critical', 'movimentação originada de leitura não confirmada', m.id::text
  from public.vehicle_movements m
  join public.plate_read_events e on e.id = m.plate_read_event_id
  where e.status <> 'confirmed'

  union all
  -- Manutenção concluída sem custo positivo.
  select 'critical', 'manutenção concluída sem custo positivo', m.id::text
  from public.maintenance_records m
  where m.status = 'completed' and coalesce(m.total_cost, 0) <= 0

  union all
  -- Viagem concluída sem progressão de quilometragem.
  select 'critical', 'viagem concluída sem progressão de km', t.id::text
  from public.trips t
  where t.status = 'completed' and t.end_odometer_km <= t.start_odometer_km

  union all
  -- Relacionamento cruzando empresa (deveria ser impossível pelas FKs compostas).
  select 'critical', 'relacionamento cruzando empresa', t.id::text
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id
  where v.company_id <> t.company_id;
$$;

comment on function private.data_integrity_selftest() is
  'Verifica invariantes de dados independentemente das constraints. Resultado vazio = base coerente.';

revoke all on function private.data_integrity_selftest() from public, anon, authenticated;
grant execute on function private.data_integrity_selftest() to service_role;
