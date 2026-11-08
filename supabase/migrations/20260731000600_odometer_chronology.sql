-- =============================================================================
-- PegaNaFrota — 20260731000600 — Cronologia do ledger de odômetro
-- =============================================================================
-- Corrige DB-AUD-014.
--
-- A garantia existente impedia REGRESSÃO DE VALOR (km nunca diminui), mas não
-- impedia RETRODATAÇÃO: era possível gravar um odômetro alto com occurred_at
-- anterior ao último evento, deixando o histórico ordenado por data incoerente
-- e distorcendo consumo por período.
--
-- Política adotada:
--   - evento comum  -> occurred_at >= occurred_at do último evento do veículo;
--   - retrodatação  -> somente como CORREÇÃO explícita (correction_of_id +
--                      motivo), que já exige a permissão odometer.adjust;
--   - monotonicidade por (occurred_at, created_at) vira invariante verificada
--     pelo autoteste de integridade.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Guarda estrutural no ledger
-- ---------------------------------------------------------------------------
create or replace function private.tg_odometer_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max_km public.odometer_km;
  v_last_at timestamptz;
begin
  select max(e.odometer_km), max(e.occurred_at)
    into v_max_km, v_last_at
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

  -- DB-AUD-014: retrodatação só como correção explícita e justificada.
  if v_last_at is not null
     and new.occurred_at < v_last_at
     and new.correction_of_id is null then
    raise exception
      'ODOMETER_BACKDATED: occurred_at % é anterior ao último evento do veículo (%). '
      'Retrodatação exige correção explícita (correction_of_id + motivo).',
      new.occurred_at, v_last_at
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  if new.correction_of_id is not null
     and private.normalize_label(new.reason) is null then
    raise exception 'ODOMETER_CORRECTION_NEEDS_REASON: correção exige justificativa'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Mesma regra dentro da única porta de escrita, com mensagem de negócio
-- ---------------------------------------------------------------------------
create or replace function private.record_odometer_event(
  p_vehicle_id       uuid,
  p_odometer_km      numeric,
  p_occurred_at      timestamptz,
  p_source_type      public.odometer_source_type,
  p_source_id        uuid default null,
  p_reason           text default null,
  p_correction_of_id uuid default null
)
returns public.vehicle_odometer_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle  public.vehicles;
  v_event    public.vehicle_odometer_events;
  v_last_at  timestamptz;
  v_occurred timestamptz := coalesce(p_occurred_at, now());
begin
  if p_odometer_km is null then
    raise exception 'VALIDATION_ERROR: odometer_km é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- Lock da linha do veículo: serializa qualquer outra RPC do mesmo veículo.
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado', p_vehicle_id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  -- Garantia central: quilometragem nunca regride.
  if p_odometer_km < v_vehicle.current_odometer_km then
    raise exception
      'ODOMETER_REGRESSION: % é menor que a quilometragem atual (%) do veículo %',
      p_odometer_km, v_vehicle.current_odometer_km, p_vehicle_id
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  -- DB-AUD-014: cronologia do ledger, avaliada COM o lock do veículo em mãos.
  select max(e.occurred_at) into v_last_at
  from public.vehicle_odometer_events e
  where e.vehicle_id = p_vehicle_id;

  if v_last_at is not null and v_occurred < v_last_at and p_correction_of_id is null then
    raise exception
      'ODOMETER_BACKDATED: data % é anterior ao último evento do veículo (%)',
      v_occurred, v_last_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  insert into public.vehicle_odometer_events (
    company_id, vehicle_id, occurred_at, odometer_km, previous_km,
    source_type, source_id, reason, correction_of_id, created_by
  )
  values (
    v_vehicle.company_id,
    p_vehicle_id,
    v_occurred,
    p_odometer_km,
    v_vehicle.current_odometer_km,
    p_source_type,
    p_source_id,
    private.normalize_label(p_reason),
    p_correction_of_id,
    private.current_user_id()
  )
  returning * into v_event;

  update public.vehicles
     set current_odometer_km = p_odometer_km
   where id = p_vehicle_id
     and current_odometer_km <> p_odometer_km;

  return v_event;
end;
$$;

comment on function private.record_odometer_event is
  'Única porta de escrita do ledger. Lock no veículo + não regressão de valor + cronologia (DB-AUD-014).';

-- ---------------------------------------------------------------------------
-- 3. Abastecimento retrodatado recebe erro de negócio, não erro de ledger
-- ---------------------------------------------------------------------------
create or replace function public.register_fueling(
  p_vehicle_id      uuid,
  p_liters          numeric,
  p_price_per_liter numeric,
  p_odometer_km     numeric,
  p_fuel_type       public.fuel_type default null,
  p_fueled_at       timestamptz default now(),
  p_driver_id       uuid default null,
  p_trip_id         uuid default null,
  p_station_name    text default null,
  p_full_tank       boolean default false,
  p_notes           text default null,
  p_total_amount    numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle   public.vehicles;
  v_trip      public.trips;
  v_driver    public.drivers;
  v_fuel_type public.fuel_type;
  v_total     numeric(14, 2);
  v_fueled_at timestamptz := coalesce(p_fueled_at, now());
  v_fueling   public.fuelings;
  v_event     public.vehicle_odometer_events;
  v_last_at   timestamptz;
begin
  perform private.assert_permission('fuelings.write');

  if p_liters is null or p_liters <= 0 then
    raise exception 'VALIDATION_ERROR: litros deve ser maior que zero'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  if p_price_per_liter is null or p_price_per_liter <= 0 then
    raise exception 'VALIDATION_ERROR: valor por litro deve ser maior que zero'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  if p_odometer_km is null then
    raise exception 'VALIDATION_ERROR: quilometragem do abastecimento é obrigatória'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- Lock do veículo: o abastecimento e o evento de odômetro são atômicos.
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

  -- Vínculos coerentes (plano de correção, lote 3).
  if p_trip_id is not null then
    select * into v_trip from public.trips where id = p_trip_id;
    if not found then
      raise exception 'TRIP_NOT_FOUND: viagem % não existe', p_trip_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    if v_trip.vehicle_id <> p_vehicle_id then
      raise exception 'FUELING_TRIP_MISMATCH: a viagem % pertence a outro veículo', p_trip_id
        using errcode = '23514', hint = 'VALIDATION_ERROR';
    end if;
    perform private.assert_company_access(v_trip.company_id);
  end if;

  if p_driver_id is not null then
    select * into v_driver from public.drivers where id = p_driver_id;
    if not found then
      raise exception 'DRIVER_NOT_FOUND: motorista % não existe', p_driver_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    perform private.assert_company_access(v_driver.company_id);
    if v_driver.archived_at is not null then
      raise exception 'DRIVER_ARCHIVED: motorista % está arquivado', p_driver_id
        using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
    end if;
  end if;

  v_fuel_type := coalesce(p_fuel_type, v_vehicle.fuel_type);

  v_total := round(p_liters * p_price_per_liter, 2);
  if p_total_amount is not null and round(p_total_amount, 2) <> v_total then
    raise exception
      'FUELING_TOTAL_MISMATCH: total informado (%) difere do calculado (%)',
      round(p_total_amount, 2), v_total
      using errcode = '23514', hint = 'VALIDATION_ERROR';
  end if;

  if v_fueled_at > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data do abastecimento não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  -- DB-AUD-014: sem limite inferior, o abastecimento podia ser retrodatado
  -- indefinidamente e quebrar o consumo por período.
  select max(e.occurred_at) into v_last_at
  from public.vehicle_odometer_events e
  where e.vehicle_id = p_vehicle_id;

  if v_last_at is not null and v_fueled_at < v_last_at then
    raise exception
      'FUELING_BACKDATED: data % é anterior ao último evento de odômetro do veículo (%)',
      v_fueled_at, v_last_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  insert into public.fuelings (
    company_id, vehicle_id, driver_id, trip_id, fueled_at, fuel_type,
    liters, price_per_liter, total_amount, odometer_km,
    station_name, full_tank, notes, created_by
  )
  values (
    v_vehicle.company_id, p_vehicle_id, p_driver_id, p_trip_id, v_fueled_at, v_fuel_type,
    p_liters, p_price_per_liter, v_total, p_odometer_km,
    private.normalize_label(p_station_name), coalesce(p_full_tank, false),
    private.normalize_label(p_notes), private.current_user_id()
  )
  returning * into v_fueling;

  v_event := private.record_odometer_event(
    p_vehicle_id  => p_vehicle_id,
    p_odometer_km => p_odometer_km,
    p_occurred_at => v_fueled_at,
    p_source_type => 'fueling',
    p_source_id   => v_fueling.id,
    p_reason      => null
  );

  return jsonb_build_object(
    'fuelingId', v_fueling.id,
    'vehicleId', p_vehicle_id,
    'fueledAt', v_fueled_at,
    'fuelType', v_fuel_type,
    'liters', v_fueling.liters,
    'pricePerLiter', v_fueling.price_per_liter,
    'totalAmount', v_fueling.total_amount,
    'odometerKm', v_fueling.odometer_km,
    'odometerEventId', v_event.id
  );
end;
$$;

comment on function public.register_fueling is
  'Registra abastecimento e evento de odômetro na mesma transação. Valida viagem/motorista do mesmo '
  'veículo e empresa e recusa retrodatação (DB-AUD-014).';

-- ---------------------------------------------------------------------------
-- 4. Monotonicidade vira invariante do autoteste
-- ---------------------------------------------------------------------------
create or replace function private.data_integrity_selftest()
returns table (severity text, finding text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'critical', 'current_odometer_km divergente do ledger',
         (v.plate || ': cache=' || v.current_odometer_km || ' ledger=' || coalesce(l.max_km, 0))::text
  from public.vehicles v
  left join (
    select vehicle_id, max(odometer_km) as max_km
    from public.vehicle_odometer_events group by vehicle_id
  ) l on l.vehicle_id = v.id
  where v.current_odometer_km <> coalesce(l.max_km, v.current_odometer_km)

  union all
  select 'critical', 'regressão no ledger de odômetro',
         (e.vehicle_id::text || ' evento ' || e.id::text)::text
  from public.vehicle_odometer_events e
  where e.previous_km is not null and e.odometer_km < e.previous_km

  union all
  -- DB-AUD-014: monotonicidade por (occurred_at, created_at), ignorando correções.
  select 'critical', 'ledger fora de ordem cronológica',
         (o.vehicle_id::text || ' evento ' || o.id::text)::text
  from (
    select e.id, e.vehicle_id, e.occurred_at, e.correction_of_id,
           lag(e.occurred_at) over (
             partition by e.vehicle_id order by e.occurred_at, e.created_at, e.id
           ) as prev_at,
           lag(e.odometer_km) over (
             partition by e.vehicle_id order by e.occurred_at, e.created_at, e.id
           ) as prev_km,
           e.odometer_km
    from public.vehicle_odometer_events e
  ) o
  where o.correction_of_id is null
    and o.prev_at is not null
    and (o.occurred_at < o.prev_at or o.odometer_km < o.prev_km)

  union all
  select 'critical', 'movimentação fora de alternância',
         (m.vehicle_id::text || ' seq ' || m.sequence_no::text)::text
  from public.vehicle_movements m
  where (m.sequence_no % 2 = 1 and m.movement_type <> 'entry')
     or (m.sequence_no % 2 = 0 and m.movement_type <> 'exit')

  union all
  select 'critical', 'buraco na sequência de movimentações',
         (t.vehicle_id::text || ' esperado ' || t.expected || ' encontrado ' || t.found)::text
  from (
    select vehicle_id, max(sequence_no) as found, count(*)::integer as expected
    from public.vehicle_movements group by vehicle_id
  ) t
  where t.found <> t.expected

  union all
  select 'critical', 'total de abastecimento divergente', f.id::text
  from public.fuelings f
  where f.total_amount <> round(f.liters * f.price_per_liter, 2)

  union all
  -- DB-AUD-019: produto abastecido não pode ser motorização.
  select 'critical', 'abastecimento com produto inválido', f.id::text
  from public.fuelings f
  where f.fuel_type in ('flex', 'electric')

  union all
  select 'critical', 'movimentação originada de leitura não confirmada', m.id::text
  from public.vehicle_movements m
  join public.plate_read_events e on e.id = m.plate_read_event_id
  where e.status <> 'confirmed'

  union all
  -- DB-AUD-007: movimentação OCR precisa apontar o mesmo veículo da leitura.
  select 'critical', 'movimentação OCR com veículo divergente da leitura', m.id::text
  from public.vehicle_movements m
  join public.plate_read_events e on e.id = m.plate_read_event_id
  where e.matched_vehicle_id is distinct from m.vehicle_id

  union all
  select 'critical', 'manutenção concluída sem custo positivo', m.id::text
  from public.maintenance_records m
  where m.status = 'completed' and coalesce(m.total_cost, 0) <= 0

  union all
  -- DB-AUD-009: no máximo uma manutenção em andamento por veículo.
  select 'critical', 'veículo com mais de uma manutenção em andamento', t.vehicle_id::text
  from (
    select vehicle_id, count(*) as n
    from public.maintenance_records where status = 'in_progress' group by vehicle_id
  ) t
  where t.n > 1

  union all
  select 'critical', 'viagem concluída sem progressão de km', t.id::text
  from public.trips t
  where t.status = 'completed' and t.end_odometer_km <= t.start_odometer_km

  union all
  select 'critical', 'relacionamento cruzando empresa', t.id::text
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id
  where v.company_id <> t.company_id

  union all
  -- DB-AUD-013: ator sem vínculo com a empresa do registro.
  select 'critical', 'ator de viagem sem vínculo com a empresa', t.id::text
  from public.trips t
  where not private.actor_belongs_to_company(t.created_by, t.company_id)
     or not private.actor_belongs_to_company(t.cancelled_by, t.company_id)

  union all
  -- DB-AUD-002: empresa ativa sem nenhum administrador efetivo.
  select 'critical', 'empresa ativa sem administrador efetivo', c.trade_name::text
  from public.companies c
  where c.status = 'active'
    and private.count_effective_admins(c.id, null) = 0;
$$;

comment on function private.data_integrity_selftest() is
  'Verifica invariantes de dados independentemente das constraints. Resultado vazio = base coerente.';

revoke all on function private.data_integrity_selftest() from public, anon, authenticated;
grant execute on function private.data_integrity_selftest() to service_role;
