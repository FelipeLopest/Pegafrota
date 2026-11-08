-- =============================================================================
-- PegaNaFrota — 20260731000200 — Transições de estado fechadas
-- =============================================================================
-- Corrige:
--   DB-AUD-004  viagem iniciada por UPDATE direto (planned -> in_progress)
--   DB-AUD-005  manutenção iniciada por escrita direta e registro concluído mutável
--   DB-AUD-006  arquivamento de veículo/motorista por UPDATE direto
--   DB-AUD-009  start_maintenance em veículo arquivado/inativo + política de
--               múltiplas manutenções simultâneas
--
-- Estratégia (a mesma do resto do projeto: duas camadas independentes):
--   1. GRANT DE COLUNA  — o verbo UPDATE deixa de existir para as colunas de
--      estado. Nenhum bug de policy reabre o caminho.
--   2. TRIGGER DEFENSIVO — mesmo com grant errado, a transição é recusada.
--
-- Campos de estado, conclusão, cancelamento, arquivamento, ator e odômetro
-- passam a ser exclusividade das RPCs SECURITY DEFINER.
-- =============================================================================

-- =============================================================================
-- 1. GRANTS POR COLUNA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- trips: apenas campos descritivos e de planejamento
-- ---------------------------------------------------------------------------
revoke update on public.trips from authenticated;
grant update (
  vehicle_id,
  driver_id,
  origin_label,
  destination_label,
  planned_departure_at,
  planned_return_at,
  purpose,
  notes
) on public.trips to authenticated;

-- ---------------------------------------------------------------------------
-- maintenance_records: apenas campos de agendamento e texto
-- ---------------------------------------------------------------------------
revoke update on public.maintenance_records from authenticated;
grant update (
  maintenance_type,
  description,
  scheduled_for,
  scheduled_odometer_km,
  supplier_name,
  invoice_number,
  notes
) on public.maintenance_records to authenticated;

-- ---------------------------------------------------------------------------
-- vehicles: apenas cadastro. status, odômetro e arquivamento saem da API.
-- ---------------------------------------------------------------------------
revoke update on public.vehicles from authenticated;
grant update (
  plate,
  brand,
  model,
  model_year,
  manufacture_year,
  color,
  fuel_type,
  category,
  tank_capacity_l,
  notes
) on public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- drivers: apenas cadastro. active e arquivamento saem da API.
-- ---------------------------------------------------------------------------
revoke update on public.drivers from authenticated;
grant update (
  full_name,
  internal_document,
  phone,
  license_category,
  license_expires_on,
  notes
) on public.drivers to authenticated;

-- ---------------------------------------------------------------------------
-- companies: status e arquivamento do tenant não são operação de cliente
-- ---------------------------------------------------------------------------
revoke update on public.companies from authenticated;
grant update (
  legal_name,
  trade_name,
  email,
  phone,
  address_street,
  address_number,
  address_complement,
  address_district,
  address_city,
  address_state,
  address_postal_code,
  timezone
) on public.companies to authenticated;

-- ---------------------------------------------------------------------------
-- fuelings: a correção de posto/observação continua possível; o resto não
-- ---------------------------------------------------------------------------
revoke update on public.fuelings from authenticated;
grant update (station_name, notes, full_tank) on public.fuelings to authenticated;

-- =============================================================================
-- 2. POLICY DE INSERT DE MANUTENÇÃO — somente 'scheduled' (DB-AUD-005)
-- =============================================================================
drop policy if exists maintenance_insert on public.maintenance_records;

create policy maintenance_insert on public.maintenance_records
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and status = 'scheduled'
    and archived_at is null
    and (select private.has_permission('maintenance.schedule'))
  );

comment on policy maintenance_insert on public.maintenance_records is
  'INSERT direto cria apenas agendamento. in_progress/completed/cancelled só por RPC (DB-AUD-005).';

-- Veículo nasce disponível ou inativo; nunca em uso/manutenção/arquivado.
drop policy if exists vehicles_insert on public.vehicles;

create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('vehicles.write'))
    and archived_at is null
    and archived_by is null
    and status in ('available', 'inactive')
  );

-- =============================================================================
-- 3. TRIGGERS DEFENSIVOS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3.1 Viagens (DB-AUD-004)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_trip_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Regra estrutural, válida para QUALQUER papel: viagem finalizada é imutável.
  if tg_op = 'UPDATE' and old.status in ('completed', 'cancelled') then
    if private.is_api_role() then
      raise exception 'TRIP_FINALIZED: viagem % já finalizada não pode ser editada', old.id
        using errcode = '42501', hint = 'CONFLICT_FINALIZED';
    end if;
  end if;

  -- A partir daqui, apenas escrita vinda de papel de API. As RPCs SECURITY
  -- DEFINER rodam como dono e seguem adiante.
  if not private.is_api_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'planned' then
      raise exception
        'TRIP_STATUS_GUARD: INSERT direto só cria viagem planejada (recebido: %)', new.status
        using errcode = '42501', hint = 'USE_RPC';
    end if;
    return new;
  end if;

  -- Nenhuma transição de status por escrita direta — inclusive planned -> in_progress.
  if new.status is distinct from old.status then
    raise exception
      'TRIP_STATUS_GUARD: use public.start_trip, public.complete_trip ou public.cancel_trip'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  -- Campos operacionais nunca mudam por escrita direta.
  if new.actual_departure_at is distinct from old.actual_departure_at
     or new.actual_return_at  is distinct from old.actual_return_at
     or new.start_odometer_km is distinct from old.start_odometer_km
     or new.end_odometer_km   is distinct from old.end_odometer_km
     or new.cancelled_at      is distinct from old.cancelled_at
     or new.cancelled_by      is distinct from old.cancelled_by
     or new.cancel_reason     is distinct from old.cancel_reason
     or new.archived_at       is distinct from old.archived_at
     or new.archived_by       is distinct from old.archived_by
     or new.created_by        is distinct from old.created_by then
    raise exception 'TRIP_FIELD_LOCKED: campo operacional da viagem só muda por RPC'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  -- Depois de iniciada, só a observação continua editável.
  if old.status <> 'planned' then
    if new.vehicle_id           is distinct from old.vehicle_id
       or new.driver_id            is distinct from old.driver_id
       or new.origin_label         is distinct from old.origin_label
       or new.destination_label    is distinct from old.destination_label
       or new.planned_departure_at is distinct from old.planned_departure_at
       or new.planned_return_at    is distinct from old.planned_return_at
       or new.purpose              is distinct from old.purpose then
      raise exception
        'TRIP_IN_PROGRESS_LOCKED: viagem em andamento só aceita alteração de observação'
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.2 Manutenções (DB-AUD-005)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_maintenance_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_rest jsonb;
  v_new_rest jsonb;
begin
  -- ---------------------------------------------------------------------
  -- Regra estrutural, válida para QUALQUER papel (inclusive as RPCs):
  -- registro finalizado só admite arquivamento, e o arquivamento não pode
  -- carregar nenhuma outra alteração junto.
  --
  -- Era exatamente essa a brecha do achado: a guarda antiga só valia quando
  -- archived_at NÃO mudava, então bastava arquivar e reescrever custo e
  -- descrição no mesmo UPDATE.
  -- ---------------------------------------------------------------------
  if tg_op = 'UPDATE' and old.status in ('completed', 'cancelled') then
    v_old_rest := to_jsonb(old) - 'archived_at' - 'archived_by' - 'updated_at';
    v_new_rest := to_jsonb(new) - 'archived_at' - 'archived_by' - 'updated_at';

    if v_old_rest is distinct from v_new_rest then
      raise exception
        'MAINTENANCE_FINALIZED: manutenção % finalizada é imutável, inclusive durante arquivamento',
        old.id
        using errcode = '42501', hint = 'CONFLICT_FINALIZED';
    end if;

    -- Sobrou apenas arquivamento/desarquivamento: exclusividade da RPC.
    if private.is_api_role()
       and (new.archived_at is distinct from old.archived_at
            or new.archived_by is distinct from old.archived_by) then
      raise exception 'MAINTENANCE_ARCHIVE_GUARD: use public.archive_maintenance'
        using errcode = '42501', hint = 'USE_RPC';
    end if;

    return new;
  end if;

  if not private.is_api_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' then
      raise exception
        'MAINTENANCE_STATUS_GUARD: INSERT direto só cria agendamento (recebido: %)', new.status
        using errcode = '42501', hint = 'USE_RPC';
    end if;
    if new.archived_at is not null or new.archived_by is not null then
      raise exception 'MAINTENANCE_ARCHIVE_GUARD: registro novo não nasce arquivado'
        using errcode = '42501', hint = 'USE_RPC';
    end if;
    return new;
  end if;

  -- Nenhuma transição de status por escrita direta — inclusive scheduled -> in_progress.
  if new.status is distinct from old.status then
    raise exception
      'MAINTENANCE_STATUS_GUARD: use public.start_maintenance, '
      'public.complete_maintenance ou public.cancel_maintenance'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  if new.started_at             is distinct from old.started_at
     or new.completed_at           is distinct from old.completed_at
     or new.completion_odometer_km is distinct from old.completion_odometer_km
     or new.total_cost             is distinct from old.total_cost
     or new.cancelled_at           is distinct from old.cancelled_at
     or new.cancelled_by           is distinct from old.cancelled_by
     or new.cancel_reason          is distinct from old.cancel_reason
     or new.archived_at            is distinct from old.archived_at
     or new.archived_by            is distinct from old.archived_by
     or new.created_by             is distinct from old.created_by then
    raise exception 'MAINTENANCE_FIELD_LOCKED: campo operacional da manutenção só muda por RPC'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  -- Manutenção em andamento: agendamento e tipo já não fazem sentido.
  if old.status = 'in_progress'
     and (new.maintenance_type is distinct from old.maintenance_type
          or new.scheduled_for is distinct from old.scheduled_for
          or new.scheduled_odometer_km is distinct from old.scheduled_odometer_km) then
    raise exception 'MAINTENANCE_IN_PROGRESS_LOCKED: agendamento não muda com manutenção em andamento'
      using errcode = '42501', hint = 'CONFLICT_STATE';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3.3 Veículos (DB-AUD-006)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_vehicle_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return new;
  end if;

  if old.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado e não aceita escrita direta', old.id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  if new.status is distinct from old.status then
    raise exception
      'VEHICLE_STATUS_GUARD: status do veículo muda por RPC (start_trip, start_maintenance, '
      'set_vehicle_status, archive_vehicle)'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    raise exception 'VEHICLE_ARCHIVE_GUARD: use public.archive_vehicle / public.unarchive_vehicle'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  return new;
end;
$$;

create trigger a_guard_vehicles_state before update on public.vehicles
  for each row execute function private.tg_vehicle_state_guard();

-- ---------------------------------------------------------------------------
-- 3.4 Motoristas (DB-AUD-006)
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_driver_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return new;
  end if;

  if old.archived_at is not null then
    raise exception 'DRIVER_ARCHIVED: motorista % está arquivado e não aceita escrita direta', old.id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  if new.active is distinct from old.active then
    raise exception 'DRIVER_STATE_GUARD: use public.set_driver_active'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  if new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    raise exception 'DRIVER_ARCHIVE_GUARD: use public.archive_driver / public.unarchive_driver'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  return new;
end;
$$;

create trigger a_guard_drivers_state before update on public.drivers
  for each row execute function private.tg_driver_state_guard();

-- ---------------------------------------------------------------------------
-- 3.5 Empresa: status e arquivamento fora do alcance do cliente
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_company_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_role() then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.archived_at is distinct from old.archived_at
     or new.archived_by is distinct from old.archived_by then
    raise exception 'COMPANY_STATE_PRIVILEGED: status/arquivamento da empresa é operação administrativa'
      using errcode = '42501', hint = 'USE_ADMIN_CHANNEL';
  end if;

  return new;
end;
$$;

create trigger a_guard_companies_state before update on public.companies
  for each row execute function private.tg_company_state_guard();

-- =============================================================================
-- 4. MANUTENÇÃO SIMULTÂNEA: política explícita (DB-AUD-009)
-- =============================================================================
-- Decisão registrada: um veículo tem NO MÁXIMO uma manutenção em andamento.
-- Agendamentos múltiplos continuam permitidos.
create unique index maintenance_one_in_progress_per_vehicle_idx
  on public.maintenance_records (vehicle_id)
  where status = 'in_progress';

comment on index public.maintenance_one_in_progress_per_vehicle_idx is
  'Política DB-AUD-009: um veículo não tem duas manutenções em andamento.';

-- =============================================================================
-- 5. start_maintenance exige veículo efetivamente disponível (DB-AUD-009)
-- =============================================================================
create or replace function public.start_maintenance(
  p_maintenance_id uuid,
  p_started_at     timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record  public.maintenance_records;
  v_vehicle public.vehicles;
  v_started timestamptz := coalesce(p_started_at, now());
  v_other   integer;
begin
  perform private.assert_permission('maintenance.write');

  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  -- Ordem padronizada: veículo primeiro, documento depois.
  select * into v_vehicle from public.vehicles where id = v_record.vehicle_id for update;
  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;

  if v_record.status <> 'scheduled' then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser iniciada', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  -- DB-AUD-009: antes bastava não estar 'in_use'. Veículo arquivado ou inativo
  -- passava, e a manutenção ficava em andamento sem o veículo refletir isso.
  if v_vehicle.archived_at is not null or v_vehicle.status = 'archived' then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado', v_vehicle.id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  if v_vehicle.status <> 'available' then
    raise exception
      'VEHICLE_UNAVAILABLE: veículo % está em % e não pode entrar em manutenção',
      v_vehicle.id, v_vehicle.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  select count(*) into v_other
  from public.maintenance_records m
  where m.vehicle_id = v_vehicle.id
    and m.status = 'in_progress'
    and m.id <> p_maintenance_id;

  if v_other > 0 then
    raise exception 'MAINTENANCE_ALREADY_RUNNING: veículo % já possui manutenção em andamento',
      v_vehicle.id
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.maintenance_records
     set status = 'in_progress', started_at = v_started
   where id = p_maintenance_id;

  update public.vehicles set status = 'in_maintenance' where id = v_vehicle.id;

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object('status', jsonb_build_object('old', v_record.status, 'new', 'in_progress')),
    jsonb_build_object('rpc', 'start_maintenance')
  );

  return jsonb_build_object(
    'maintenanceId', p_maintenance_id,
    'status', 'in_progress',
    'vehicleId', v_vehicle.id,
    'startedAt', v_started
  );
end;
$$;

comment on function public.start_maintenance(uuid, timestamptz) is
  'Inicia manutenção. Exige veículo disponível (não arquivado, não inativo, não em uso) — DB-AUD-009.';

-- =============================================================================
-- 6. RPCs que substituem as escritas diretas removidas
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6.1 Status cadastral do veículo: available <-> inactive
-- ---------------------------------------------------------------------------
create or replace function public.set_vehicle_status(
  p_vehicle_id uuid,
  p_status     public.vehicle_status
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  perform private.assert_permission('vehicles.write');

  if p_status not in ('available', 'inactive') then
    raise exception
      'VEHICLE_STATUS_NOT_ALLOWED: % é estado operacional e só muda por viagem/manutenção/arquivamento',
      p_status
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado', p_vehicle_id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  if v_vehicle.status not in ('available', 'inactive') then
    raise exception 'VEHICLE_BUSY: veículo % está em % e não pode mudar de estado cadastral',
      p_vehicle_id, v_vehicle.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.vehicles set status = p_status where id = p_vehicle_id;

  perform private.log_audit_event(
    v_vehicle.company_id, 'execute', 'public.vehicles', p_vehicle_id,
    jsonb_build_object('status', jsonb_build_object('old', v_vehicle.status, 'new', p_status)),
    jsonb_build_object('rpc', 'set_vehicle_status')
  );

  return jsonb_build_object('vehicleId', p_vehicle_id, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6.2 Ativação/desativação de motorista
-- ---------------------------------------------------------------------------
create or replace function public.set_driver_active(
  p_driver_id uuid,
  p_active    boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_driver     public.drivers;
  v_open_trips integer;
begin
  perform private.assert_permission('drivers.write');

  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found then
    raise exception 'DRIVER_NOT_FOUND: motorista % não existe', p_driver_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_driver.company_id);

  if v_driver.archived_at is not null then
    raise exception 'DRIVER_ARCHIVED: motorista % está arquivado; use public.unarchive_driver',
      p_driver_id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  if not coalesce(p_active, false) then
    select count(*) into v_open_trips
    from public.trips
    where driver_id = p_driver_id and status in ('planned', 'in_progress');

    if v_open_trips > 0 then
      raise exception 'DRIVER_HAS_OPEN_TRIPS: % viagem(ns) em aberto impedem a desativação', v_open_trips
        using errcode = '55000', hint = 'CONFLICT_STATE';
    end if;
  end if;

  update public.drivers set active = coalesce(p_active, false) where id = p_driver_id;

  return jsonb_build_object('driverId', p_driver_id, 'active', coalesce(p_active, false));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6.3 Desarquivamento de motorista (contrapartida de archive_driver)
-- ---------------------------------------------------------------------------
create or replace function public.unarchive_driver(p_driver_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_driver public.drivers;
begin
  perform private.assert_permission('drivers.archive');

  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found then
    raise exception 'DRIVER_NOT_FOUND: motorista % não existe', p_driver_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_driver.company_id);

  if v_driver.archived_at is null then
    return jsonb_build_object('driverId', p_driver_id, 'changed', false);
  end if;

  update public.drivers
     set archived_at = null, archived_by = null, active = true
   where id = p_driver_id;

  return jsonb_build_object('driverId', p_driver_id, 'changed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6.4 Arquivamento de manutenção — toca SOMENTE os campos de arquivamento
-- ---------------------------------------------------------------------------
create or replace function public.archive_maintenance(
  p_maintenance_id uuid,
  p_archived       boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record public.maintenance_records;
begin
  perform private.assert_permission('maintenance.write');

  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  if v_record.status not in ('completed', 'cancelled') then
    raise exception 'MAINTENANCE_INVALID_STATE: só manutenção finalizada pode ser arquivada (atual: %)',
      v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if coalesce(p_archived, true) then
    if v_record.archived_at is not null then
      return jsonb_build_object('maintenanceId', p_maintenance_id, 'archived', true, 'changed', false);
    end if;
    -- Somente estas duas colunas. Nenhum campo financeiro ou histórico é tocado.
    update public.maintenance_records
       set archived_at = now(), archived_by = private.current_user_id()
     where id = p_maintenance_id;
  else
    if v_record.archived_at is null then
      return jsonb_build_object('maintenanceId', p_maintenance_id, 'archived', false, 'changed', false);
    end if;
    update public.maintenance_records
       set archived_at = null, archived_by = null
     where id = p_maintenance_id;
  end if;

  return jsonb_build_object(
    'maintenanceId', p_maintenance_id,
    'archived', coalesce(p_archived, true),
    'changed', true
  );
end;
$$;

comment on function public.archive_maintenance(uuid, boolean) is
  'Arquiva/desarquiva manutenção finalizada alterando exclusivamente archived_at e archived_by.';

-- =============================================================================
-- 7. Conclusão/cancelamento não liberam veículo se houver outra manutenção
-- =============================================================================
create or replace function public.complete_maintenance(
  p_maintenance_id         uuid,
  p_total_cost             numeric,
  p_completed_at           timestamptz default now(),
  p_completion_odometer_km numeric default null,
  p_supplier_name          text default null,
  p_invoice_number         text default null,
  p_notes                  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record    public.maintenance_records;
  v_vehicle   public.vehicles;
  v_event     public.vehicle_odometer_events;
  v_event_id  uuid;
  v_completed timestamptz := coalesce(p_completed_at, now());
  v_other     integer;
begin
  perform private.assert_permission('maintenance.write');

  if p_total_cost is null or p_total_cost <= 0 then
    raise exception 'MAINTENANCE_COST_INVALID: valor da manutenção concluída deve ser maior que zero'
      using errcode = '23514', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  select * into v_vehicle from public.vehicles where id = v_record.vehicle_id for update;
  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;

  if v_record.status not in ('scheduled', 'in_progress') then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser concluída', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if v_completed > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data de conclusão não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if v_record.started_at is not null and v_completed < v_record.started_at then
    raise exception 'MAINTENANCE_CHRONOLOGY_INVALID: conclusão (%) antes do início (%)',
      v_completed, v_record.started_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if p_completion_odometer_km is not null then
    v_event := private.record_odometer_event(
      p_vehicle_id  => v_record.vehicle_id,
      p_odometer_km => p_completion_odometer_km,
      p_occurred_at => v_completed,
      p_source_type => 'maintenance_completion',
      p_source_id   => p_maintenance_id,
      p_reason      => null
    );
    v_event_id := v_event.id;
  end if;

  update public.maintenance_records
     set status = 'completed',
         completed_at = v_completed,
         started_at = coalesce(started_at, v_completed),
         completion_odometer_km = p_completion_odometer_km,
         total_cost = round(p_total_cost, 2),
         supplier_name = coalesce(private.normalize_label(p_supplier_name), supplier_name),
         invoice_number = coalesce(private.normalize_label(p_invoice_number), invoice_number),
         notes = coalesce(private.normalize_label(p_notes), notes),
         scheduled_for = case when scheduled_for > v_completed then null else scheduled_for end
   where id = p_maintenance_id;

  -- DB-AUD-009: só libera o veículo se nenhuma outra manutenção seguir aberta.
  select count(*) into v_other
  from public.maintenance_records m
  where m.vehicle_id = v_record.vehicle_id
    and m.status = 'in_progress'
    and m.id <> p_maintenance_id;

  if v_other = 0 then
    update public.vehicles set status = 'available'
     where id = v_record.vehicle_id and status = 'in_maintenance';
  end if;

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object(
      'status', jsonb_build_object('old', v_record.status, 'new', 'completed'),
      'total_cost', jsonb_build_object('old', v_record.total_cost, 'new', round(p_total_cost, 2))
    ),
    jsonb_build_object('rpc', 'complete_maintenance', 'odometer_event_id', v_event_id)
  );

  return jsonb_build_object(
    'maintenanceId', p_maintenance_id,
    'status', 'completed',
    'vehicleId', v_record.vehicle_id,
    'completedAt', v_completed,
    'totalCost', round(p_total_cost, 2),
    'completionOdometerKm', p_completion_odometer_km,
    'odometerEventId', v_event_id
  );
end;
$$;

-- =============================================================================
-- 8. Grants das novas RPCs
-- =============================================================================
revoke all on function public.set_vehicle_status(uuid, public.vehicle_status) from public;
revoke all on function public.set_driver_active(uuid, boolean)               from public;
revoke all on function public.unarchive_driver(uuid)                          from public;
revoke all on function public.archive_maintenance(uuid, boolean)              from public;

grant execute on function public.set_vehicle_status(uuid, public.vehicle_status) to authenticated;
grant execute on function public.set_driver_active(uuid, boolean)               to authenticated;
grant execute on function public.unarchive_driver(uuid)                          to authenticated;
grant execute on function public.archive_maintenance(uuid, boolean)              to authenticated;
