-- =============================================================================
-- PegaNaFrota — 000900 — Triggers: normalização, guardas e auditoria
-- =============================================================================
-- Convenção: funções de guarda são SECURITY INVOKER (precisam ver o papel do
-- chamador). Apenas o trigger de auditoria é SECURITY DEFINER, porque escreve
-- em audit.events, onde nenhum papel de aplicação possui INSERT.
-- =============================================================================

-- =============================================================================
-- 1. updated_at
-- =============================================================================
create or replace function private.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 2. company_id é imutável
-- =============================================================================
create or replace function private.tg_block_company_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'TENANT_IMMUTABLE: company_id de %.% não pode ser alterado',
      tg_table_schema, tg_table_name
      using errcode = '42501', hint = 'TENANT_MISMATCH';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 3. Normalização
-- =============================================================================
create or replace function private.tg_normalize_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cnpj                := private.normalize_digits(new.cnpj);
  new.phone               := private.normalize_digits(new.phone);
  new.address_postal_code := private.normalize_digits(new.address_postal_code);
  new.legal_name          := private.normalize_label(new.legal_name);
  new.trade_name          := private.normalize_label(new.trade_name);
  new.email               := lower(private.normalize_label(new.email));
  new.address_state       := upper(private.normalize_label(new.address_state));
  new.timezone            := private.normalize_label(new.timezone);
  return new;
end;
$$;

create or replace function private.tg_normalize_vehicle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.plate    := private.normalize_plate(new.plate);
  new.brand    := private.normalize_label(new.brand);
  new.model    := private.normalize_label(new.model);
  new.color    := private.normalize_label(new.color);
  new.category := private.normalize_label(new.category);
  return new;
end;
$$;

create or replace function private.tg_normalize_driver()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name         := private.normalize_label(new.full_name);
  new.phone             := private.normalize_digits(new.phone);
  new.internal_document := private.normalize_label(new.internal_document);
  new.license_category  := upper(private.normalize_label(new.license_category));
  return new;
end;
$$;

create or replace function private.tg_normalize_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := private.normalize_label(new.full_name);
  new.phone     := private.normalize_digits(new.phone);
  return new;
end;
$$;

create or replace function private.tg_normalize_location()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name                := private.normalize_label(new.name);
  new.address_postal_code := private.normalize_digits(new.address_postal_code);
  new.address_state       := upper(private.normalize_label(new.address_state));
  new.timezone            := private.normalize_label(new.timezone);
  return new;
end;
$$;

create or replace function private.tg_normalize_camera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name             := private.normalize_label(new.name);
  new.local_identifier := private.normalize_label(new.local_identifier);
  return new;
end;
$$;

create or replace function private.tg_normalize_plate_read()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.raw_text         := btrim(new.raw_text);
  new.normalized_plate := private.normalize_plate(new.normalized_plate);
  new.frame_hash       := lower(private.normalize_label(new.frame_hash));
  return new;
end;
$$;

create or replace function private.tg_normalize_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.origin_label      := private.normalize_label(new.origin_label);
  new.destination_label := private.normalize_label(new.destination_label);
  return new;
end;
$$;

-- =============================================================================
-- 4. Ledger de odômetro — imutável e sem regressão (ADR-006)
-- =============================================================================
create or replace function private.tg_odometer_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max_km public.odometer_km;
begin
  select max(e.odometer_km)
    into v_max_km
  from public.vehicle_odometer_events e
  where e.vehicle_id = new.vehicle_id;

  if v_max_km is not null and new.odometer_km < v_max_km then
    raise exception
      'ODOMETER_REGRESSION: leitura % é menor que a maior já registrada (%) para o veículo %',
      new.odometer_km, v_max_km, new.vehicle_id
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  if new.previous_km is null then
    new.previous_km := coalesce(v_max_km, 0);
  end if;

  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'ODOMETER_FUTURE_EVENT: occurred_at no futuro não é aceito'
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  return new;
end;
$$;

create or replace function private.tg_forbid_update_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE_RECORD: % em %.% não é permitido',
    tg_op, tg_table_schema, tg_table_name
    using errcode = '23514', hint = 'IMMUTABLE_RECORD';
end;
$$;

-- =============================================================================
-- 5. current_odometer_km só muda por função transacional
-- =============================================================================
create or replace function private.tg_vehicle_odometer_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.current_odometer_km is distinct from old.current_odometer_km
     and private.is_api_role() then
    raise exception
      'ODOMETER_DIRECT_WRITE: current_odometer_km só pode ser alterado por RPC de odômetro'
      using errcode = '42501', hint = 'USE_RPC_REGISTER_ODOMETER';
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 6. Conclusão/cancelamento de viagem e manutenção somente por RPC
-- =============================================================================
create or replace function private.tg_trip_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return new;
  end if;

  if new.status in ('completed', 'cancelled')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception
      'TRIP_STATUS_GUARD: use public.complete_trip ou public.cancel_trip para o status %',
      new.status
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  if tg_op = 'UPDATE' and old.status in ('completed', 'cancelled') then
    raise exception 'TRIP_FINALIZED: viagem % já finalizada não pode ser editada', old.id
      using errcode = '42501', hint = 'CONFLICT_FINALIZED';
  end if;

  return new;
end;
$$;

create or replace function private.tg_maintenance_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return new;
  end if;

  if new.status in ('completed', 'cancelled')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception
      'MAINTENANCE_STATUS_GUARD: use public.complete_maintenance ou public.cancel_maintenance'
      using errcode = '42501', hint = 'USE_RPC';
  end if;

  if tg_op = 'UPDATE' and old.status in ('completed', 'cancelled')
     and new.archived_at is not distinct from old.archived_at then
    raise exception 'MAINTENANCE_FINALIZED: manutenção % já finalizada não pode ser editada', old.id
      using errcode = '42501', hint = 'CONFLICT_FINALIZED';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 7. Cronologia de manutenção
-- =============================================================================
-- "Data futura é permitida somente para agendamento" (DATABASE_BLUEPRINT.md §3.9).
-- now() não é IMMUTABLE, portanto isso não pode ser check constraint.
create or replace function private.tg_maintenance_chronology()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at is not null and new.started_at > now() + interval '5 minutes' then
    raise exception 'MAINTENANCE_FUTURE_START: started_at não pode estar no futuro'
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  if new.completed_at is not null and new.completed_at > now() + interval '5 minutes' then
    raise exception 'MAINTENANCE_FUTURE_COMPLETION: completed_at não pode estar no futuro'
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  if new.status <> 'scheduled'
     and new.scheduled_for is not null
     and new.scheduled_for > now() + interval '5 minutes'
     and new.completed_at is not null then
    raise exception 'MAINTENANCE_FUTURE_SCHEDULE: manutenção concluída não pode ter agendamento futuro'
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 8. Coerência de combustível no abastecimento
-- =============================================================================
create or replace function private.tg_fueling_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vehicle_fuel public.fuel_type;
begin
  select v.fuel_type into v_vehicle_fuel
  from public.vehicles v
  where v.id = new.vehicle_id;

  if v_vehicle_fuel is null then
    raise exception 'VEHICLE_NOT_FOUND: veículo % inexistente', new.vehicle_id
      using errcode = '23503';
  end if;

  if not private.fuel_is_compatible(v_vehicle_fuel, new.fuel_type) then
    raise exception 'FUEL_INCOMPATIBLE: veículo % (%s) não aceita abastecimento de %',
      new.vehicle_id, v_vehicle_fuel, new.fuel_type
      using errcode = '23514', hint = 'FUEL_INCOMPATIBLE';
  end if;

  if new.fueled_at > now() + interval '5 minutes' then
    raise exception 'FUELING_FUTURE: fueled_at não pode estar no futuro'
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 8b. Campos críticos do abastecimento são imutáveis pela API
-- =============================================================================
-- A UI pode corrigir posto e observação. Litros, preço, total, odômetro,
-- veículo e data estão amarrados a um evento de odômetro já gravado no ledger
-- e por isso só mudam por RPC (na prática: não mudam).
create or replace function private.tg_fueling_core_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_api_role() then
    return new;
  end if;

  if new.vehicle_id      is distinct from old.vehicle_id
     or new.liters       is distinct from old.liters
     or new.price_per_liter is distinct from old.price_per_liter
     or new.total_amount is distinct from old.total_amount
     or new.odometer_km  is distinct from old.odometer_km
     or new.fueled_at    is distinct from old.fueled_at
     or new.fuel_type    is distinct from old.fuel_type then
    raise exception
      'FUELING_CORE_IMMUTABLE: valores e odômetro do abastecimento não podem ser editados'
      using errcode = '42501', hint = 'IMMUTABLE_FIELDS';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 9. Última conta administrativa protegida
-- =============================================================================
create or replace function private.tg_protect_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_company uuid;
  v_remaining integer;
begin
  if tg_op = 'UPDATE' then
    -- Ainda é admin ativo? Nada a proteger.
    if new.active and new.role = 'company_admin' then
      return new;
    end if;
    if not (old.active and old.role = 'company_admin') then
      return new;
    end if;
    v_company := old.company_id;
  else
    if not (old.active and old.role = 'company_admin') then
      return old;
    end if;
    v_company := old.company_id;
  end if;

  select count(*)
    into v_remaining
  from public.company_memberships m
  where m.company_id = v_company
    and m.role = 'company_admin'
    and m.active
    and m.id <> old.id;

  if v_remaining = 0 then
    raise exception
      'LAST_ADMIN_PROTECTED: a empresa % precisa manter ao menos um company_admin ativo', v_company
      using errcode = '23514', hint = 'LAST_ADMIN_PROTECTED';
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return old;
end;
$$;

-- =============================================================================
-- 10. Attach dos triggers
-- =============================================================================

-- updated_at
create trigger companies_set_updated_at before update on public.companies
  for each row execute function private.tg_set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.tg_set_updated_at();
create trigger memberships_set_updated_at before update on public.company_memberships
  for each row execute function private.tg_set_updated_at();
create trigger drivers_set_updated_at before update on public.drivers
  for each row execute function private.tg_set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
  for each row execute function private.tg_set_updated_at();
create trigger trips_set_updated_at before update on public.trips
  for each row execute function private.tg_set_updated_at();
create trigger fuelings_set_updated_at before update on public.fuelings
  for each row execute function private.tg_set_updated_at();
create trigger maintenance_set_updated_at before update on public.maintenance_records
  for each row execute function private.tg_set_updated_at();
create trigger locations_set_updated_at before update on public.locations
  for each row execute function private.tg_set_updated_at();
create trigger cameras_set_updated_at before update on public.cameras
  for each row execute function private.tg_set_updated_at();
create trigger plate_read_set_updated_at before update on public.plate_read_events
  for each row execute function private.tg_set_updated_at();

-- company_id imutável
create trigger memberships_block_company_change before update on public.company_memberships
  for each row execute function private.tg_block_company_change();
create trigger drivers_block_company_change before update on public.drivers
  for each row execute function private.tg_block_company_change();
create trigger vehicles_block_company_change before update on public.vehicles
  for each row execute function private.tg_block_company_change();
create trigger trips_block_company_change before update on public.trips
  for each row execute function private.tg_block_company_change();
create trigger fuelings_block_company_change before update on public.fuelings
  for each row execute function private.tg_block_company_change();
create trigger maintenance_block_company_change before update on public.maintenance_records
  for each row execute function private.tg_block_company_change();
create trigger locations_block_company_change before update on public.locations
  for each row execute function private.tg_block_company_change();
create trigger cameras_block_company_change before update on public.cameras
  for each row execute function private.tg_block_company_change();
create trigger plate_read_block_company_change before update on public.plate_read_events
  for each row execute function private.tg_block_company_change();

-- normalização
create trigger companies_normalize before insert or update on public.companies
  for each row execute function private.tg_normalize_company();
create trigger profiles_normalize before insert or update on public.profiles
  for each row execute function private.tg_normalize_profile();
create trigger drivers_normalize before insert or update on public.drivers
  for each row execute function private.tg_normalize_driver();
create trigger vehicles_normalize before insert or update on public.vehicles
  for each row execute function private.tg_normalize_vehicle();
create trigger locations_normalize before insert or update on public.locations
  for each row execute function private.tg_normalize_location();
create trigger cameras_normalize before insert or update on public.cameras
  for each row execute function private.tg_normalize_camera();
create trigger plate_read_normalize before insert or update on public.plate_read_events
  for each row execute function private.tg_normalize_plate_read();
create trigger trips_normalize before insert or update on public.trips
  for each row execute function private.tg_normalize_trip();

-- ledger imutável e sem regressão
create trigger odometer_events_check_insert before insert on public.vehicle_odometer_events
  for each row execute function private.tg_odometer_ledger_insert();
create trigger odometer_events_no_update before update on public.vehicle_odometer_events
  for each row execute function private.tg_forbid_update_delete();
create trigger odometer_events_no_delete before delete on public.vehicle_odometer_events
  for each row execute function private.tg_forbid_update_delete();

-- movimentações imutáveis
create trigger movements_no_update before update on public.vehicle_movements
  for each row execute function private.tg_forbid_update_delete();
create trigger movements_no_delete before delete on public.vehicle_movements
  for each row execute function private.tg_forbid_update_delete();

-- guardas de negócio
--
-- CONVENÇÃO DE NOME: guardas de AUTORIZAÇÃO usam o prefixo "a_guard_".
-- O PostgreSQL dispara triggers BEFORE ... FOR EACH ROW em ordem alfabética de
-- nome. O prefixo garante que a guarda de autorização rode ANTES das validações
-- de forma de dado, de modo que o cliente receba sempre 42501 (FORBIDDEN) em vez
-- de um 23514 (check violation) acidental. Sem isso, a mensagem de erro
-- dependeria de qual constraint falhasse primeiro.
create trigger a_guard_vehicles_odometer before update on public.vehicles
  for each row execute function private.tg_vehicle_odometer_guard();
create trigger a_guard_trips_status before insert or update on public.trips
  for each row execute function private.tg_trip_status_guard();
create trigger a_guard_maintenance_status before insert or update on public.maintenance_records
  for each row execute function private.tg_maintenance_status_guard();
create trigger a_guard_fuelings_core before update on public.fuelings
  for each row execute function private.tg_fueling_core_immutable();

create trigger maintenance_chronology before insert or update on public.maintenance_records
  for each row execute function private.tg_maintenance_chronology();
create trigger fuelings_consistency before insert or update on public.fuelings
  for each row execute function private.tg_fueling_consistency();
create trigger memberships_protect_last_admin before update or delete on public.company_memberships
  for each row execute function private.tg_protect_last_admin();

-- auditoria
create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function private.tg_audit();
create trigger memberships_audit after insert or update or delete on public.company_memberships
  for each row execute function private.tg_audit();
create trigger drivers_audit after insert or update or delete on public.drivers
  for each row execute function private.tg_audit();
create trigger vehicles_audit after insert or update or delete on public.vehicles
  for each row execute function private.tg_audit();
create trigger odometer_events_audit after insert on public.vehicle_odometer_events
  for each row execute function private.tg_audit();
create trigger trips_audit after insert or update or delete on public.trips
  for each row execute function private.tg_audit();
create trigger fuelings_audit after insert or update or delete on public.fuelings
  for each row execute function private.tg_audit();
create trigger maintenance_audit after insert or update or delete on public.maintenance_records
  for each row execute function private.tg_audit();
create trigger locations_audit after insert or update or delete on public.locations
  for each row execute function private.tg_audit();
create trigger cameras_audit after insert or update or delete on public.cameras
  for each row execute function private.tg_audit();
create trigger movements_audit after insert on public.vehicle_movements
  for each row execute function private.tg_audit();
