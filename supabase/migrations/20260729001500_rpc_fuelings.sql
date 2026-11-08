-- =============================================================================
-- PegaNaFrota — 001500 — Abastecimentos
-- =============================================================================
-- INSERT direto em public.fuelings não existe: o papel authenticated não possui
-- o grant. Todo abastecimento passa por aqui e por isso sempre gera o evento de
-- odômetro correspondente.
-- =============================================================================

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
  v_fuel_type public.fuel_type;
  v_total     numeric(14, 2);
  v_fueled_at timestamptz := coalesce(p_fueled_at, now());
  v_fueling   public.fuelings;
  v_event     public.vehicle_odometer_events;
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

  v_fuel_type := coalesce(p_fuel_type, v_vehicle.fuel_type);

  -- Garantia: total exato. Se o cliente enviou um total, ele precisa bater.
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

  -- Garantia: registro de abastecimento cria evento de odômetro.
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
  'Registra abastecimento e evento de odômetro na mesma transação. Total sempre = round(litros x preço, 2).';

revoke all on function public.register_fueling(
  uuid, numeric, numeric, numeric, public.fuel_type, timestamptz,
  uuid, uuid, text, boolean, text, numeric
) from public;

grant execute on function public.register_fueling(
  uuid, numeric, numeric, numeric, public.fuel_type, timestamptz,
  uuid, uuid, text, boolean, text, numeric
) to authenticated;
