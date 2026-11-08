-- =============================================================================
-- PegaNaFrota — 20260731000500 — Integridade do ator
-- =============================================================================
-- Corrige DB-AUD-013.
--
-- Problema: created_by, cancelled_by, archived_by e operator_user_id apontam
-- apenas para profiles(id). Uma FK simples prova que o UUID existe, mas não
-- prova que aquele perfil pertence à empresa do registro. Em tabelas com INSERT
-- direto o cliente podia informar qualquer UUID conhecido — ou deixar nulo.
--
-- Correção em duas partes:
--   1. o servidor CARIMBA created_by em toda escrita direta do cliente;
--   2. todo campo de ator é validado contra a empresa da própria linha.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FK que faltava em companies.archived_by
-- ---------------------------------------------------------------------------
alter table public.companies
  add constraint companies_archived_by_fkey
  foreign key (archived_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Ator precisa ter vínculo com a empresa do registro
-- ---------------------------------------------------------------------------
create or replace function private.actor_belongs_to_company(
  p_actor_id   uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_id is null
      or exists (
        select 1
        from public.company_memberships m
        where m.user_id = p_actor_id
          and m.company_id = p_company_id
      );
$$;
comment on function private.actor_belongs_to_company(uuid, uuid) is
  'Prova que o perfil informado como ator pertence à empresa do registro (DB-AUD-013).';

-- ---------------------------------------------------------------------------
-- 3. Trigger genérico de integridade de ator
-- ---------------------------------------------------------------------------
-- Genérico de propósito: as colunas de ator têm o mesmo nome em todas as
-- tabelas, então a checagem é feita sobre a representação jsonb da linha e a
-- mesma função serve para trips, fuelings, maintenance_records, vehicles,
-- drivers, locations e plate_read_events.
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_actor_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row     jsonb;
  v_company uuid;
  v_col     text;
  v_actor   uuid;
  v_cols    text[] := array[
    'created_by', 'cancelled_by', 'archived_by', 'operator_user_id', 'manual_override_by'
  ];
begin
  v_row := to_jsonb(new);

  -- O cliente nunca escolhe quem é o autor: o servidor carimba.
  if tg_op = 'INSERT' and private.is_client_role() and (v_row ? 'created_by') then
    new := jsonb_populate_record(
      new,
      jsonb_build_object('created_by', private.current_user_id())
    );
    v_row := to_jsonb(new);
  end if;

  v_company := nullif(v_row ->> 'company_id', '')::uuid;
  if v_company is null then
    return new;
  end if;

  foreach v_col in array v_cols loop
    if not (v_row ? v_col) then
      continue;
    end if;

    v_actor := nullif(v_row ->> v_col, '')::uuid;
    if v_actor is null then
      continue;
    end if;

    if not private.actor_belongs_to_company(v_actor, v_company) then
      raise exception
        'ACTOR_TENANT_MISMATCH: %.% aponta um perfil sem vínculo com a empresa % (tabela %)',
        tg_table_name, v_col, v_company, tg_table_name
        using errcode = '42501', hint = 'TENANT_MISMATCH';
    end if;
  end loop;

  return new;
end;
$$;

comment on function private.tg_actor_integrity() is
  'Carimba created_by na escrita do cliente e valida todo campo de ator contra a empresa da linha.';

-- ---------------------------------------------------------------------------
-- 4. Attach
-- ---------------------------------------------------------------------------
-- Prefixo "a_" mantém a convenção: guardas de autorização rodam antes das
-- validações de forma de dado.
create trigger a_actor_trips before insert or update on public.trips
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_maintenance before insert or update on public.maintenance_records
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_fuelings before insert or update on public.fuelings
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_vehicles before insert or update on public.vehicles
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_drivers before insert or update on public.drivers
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_locations before insert or update on public.locations
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_plate_reads before insert or update on public.plate_read_events
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_movements before insert on public.vehicle_movements
  for each row execute function private.tg_actor_integrity();

create trigger a_actor_odometer before insert on public.vehicle_odometer_events
  for each row execute function private.tg_actor_integrity();

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
-- tg_actor_integrity é SECURITY INVOKER (precisa enxergar o papel do chamador),
-- portanto o helper que ele chama precisa ser executável pelo papel de API.
-- A função é SECURITY DEFINER e devolve apenas um booleano, sem expor linhas.
grant execute on function private.actor_belongs_to_company(uuid, uuid)
  to authenticated, service_role;
