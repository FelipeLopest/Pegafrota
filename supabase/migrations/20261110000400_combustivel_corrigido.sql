-- Consumo, registros retroativos validados e substituição sem apagar originais.
begin;
alter table public.fuelings alter column price_per_liter type numeric(14,6);
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

  -- DB-AUD-019: sem produto explícito, um veículo flex gravaria combustível
  -- 'flex', que não é produto vendido.
  v_fuel_type := coalesce(p_fuel_type, private.default_fuel_product(v_vehicle.fuel_type));
  if v_fuel_type is null then
    raise exception
      'FUELING_PRODUCT_REQUIRED: veículo % é % e exige o produto abastecido explicitamente',
      p_vehicle_id, v_vehicle.fuel_type
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  v_total := round(round(p_liters,3) * round(p_price_per_liter,6), 2);
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

  -- Leituras retroativas passam pelos limites anterior e posterior do ledger.
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

alter table public.fuelings add column replaces_fueling_id uuid references public.fuelings(id) on delete set null;
create unique index fuelings_one_replacement_idx on public.fuelings(replaces_fueling_id) where replaces_fueling_id is not null;
create index odometer_source_lookup_idx on public.vehicle_odometer_events(source_type,source_id);
-- A exclusão global autorizada continua alcançando os metadados vinculados.
alter table private.odometer_revisions drop constraint odometer_revisions_event_id_fkey,
 add foreign key(event_id) references public.vehicle_odometer_events(id) on delete cascade;
alter table private.odometer_voids drop constraint odometer_voids_event_id_fkey,
 add foreign key(event_id) references public.vehicle_odometer_events(id) on delete cascade;
alter table private.odometer_revisions alter column created_by drop not null;
alter table private.odometer_revisions drop constraint odometer_revisions_created_by_fkey,
 add foreign key(created_by) references public.profiles(id) on delete set null;
alter table private.odometer_voids alter column created_by drop not null;
alter table private.odometer_voids drop constraint odometer_voids_created_by_fkey,
 add foreign key(created_by) references public.profiles(id) on delete set null;
alter table public.fuelings drop constraint fuelings_voided_by_fkey,
 add foreign key(voided_by) references public.profiles(id) on delete set null;

create function public.replace_fueling(p_fueling_id uuid,p_reason text,p_liters numeric,p_price_per_liter numeric,p_odometer_km numeric,p_fuel_type public.fuel_type,p_fueled_at timestamptz,p_driver_id uuid,p_trip_id uuid,p_station_name text,p_full_tank boolean,p_notes text,p_total_amount numeric,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.fuelings; r jsonb;
begin
 perform private.assert_permission('fuelings.write');perform private.assert_permission('odometer.adjust');
 select * into f from public.fuelings where id=p_fueling_id;
 if not found then raise exception 'FUELING_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(f.company_id);
 r:=private.begin_operation(f.company_id,p_command_id,'replace_fueling',jsonb_build_array(p_fueling_id,p_reason,p_liters,p_price_per_liter,p_odometer_km,p_fuel_type,p_fueled_at,p_driver_id,p_trip_id,p_station_name,p_full_tank,p_notes,p_total_amount));if r is not null then return r;end if;
 perform public.reverse_fueling(p_fueling_id,p_reason,gen_random_uuid());
 r:=public.save_fueling(f.vehicle_id,p_liters,p_price_per_liter,p_odometer_km,p_fuel_type,p_fueled_at,p_driver_id,p_trip_id,p_station_name,p_full_tank,p_notes,p_total_amount,gen_random_uuid());
 update public.fuelings set replaces_fueling_id=p_fueling_id where id=(r->>'fuelingId')::uuid;
 return private.finish_operation(f.company_id,p_command_id,r||jsonb_build_object('replacesFuelingId',p_fueling_id));
end $$;
revoke all on function public.replace_fueling(uuid,text,numeric,numeric,numeric,public.fuel_type,timestamptz,uuid,uuid,text,boolean,text,numeric,uuid) from public,anon,service_role;
grant execute on function public.replace_fueling(uuid,text,numeric,numeric,numeric,public.fuel_type,timestamptz,uuid,uuid,text,boolean,text,numeric,uuid) to authenticated;

create view public.v_vehicle_energy_consumption with(security_invoker=true) as
with leituras as (
 select f.company_id,f.vehicle_id,f.unit,f.liters,f.total_amount,f.full_tank,f.fueled_at,f.created_at,f.id,
 public.fueling_effective_km(f.id) km from public.fuelings f where f.voided_at is null
), marcadas as (
 select l.*,count(*) filter(where full_tank) over anterior as ciclo,
 max(case when full_tank then km end) over anterior as abertura,
 max(case when full_tank then fueled_at end) over anterior as inicio
 from leituras l window anterior as(partition by vehicle_id,unit order by fueled_at,created_at,id rows between unbounded preceding and 1 preceding)
), ciclos as (
 select company_id,vehicle_id,unit,ciclo,max(abertura) abertura,max(km) filter(where full_tank) fechamento,
 max(inicio) inicio,max(fueled_at) fim,sum(liters) quantidade,sum(total_amount) custo
 from marcadas group by company_id,vehicle_id,unit,ciclo having bool_or(full_tank) and max(abertura) is not null
)
select c.company_id,c.vehicle_id,c.unit,sum(c.fechamento-c.abertura)::numeric(12,1) total_distance_km,
 sum(c.quantidade)::numeric(14,3) total_quantity,sum(c.custo)::numeric(14,2) total_fuel_cost,
 round(sum(c.fechamento-c.abertura)/nullif(sum(c.quantidade),0),2) km_per_unit,
 round(sum(c.custo)/nullif(sum(c.fechamento-c.abertura),0),4) cost_per_km,count(*) measured_segments
from ciclos c where c.fechamento>c.abertura and not exists(select 1 from leituras l where l.vehicle_id=c.vehicle_id and l.unit<>c.unit and l.fueled_at between c.inicio and c.fim)
group by c.company_id,c.vehicle_id,c.unit;
revoke all on public.v_vehicle_energy_consumption from public,anon;
grant select on public.v_vehicle_energy_consumption to authenticated;

create or replace view public.v_vehicle_fuel_consumption with(security_invoker=true) as
select e.company_id,e.vehicle_id,v.plate,e.total_distance_km,e.total_quantity::numeric(12,3) as total_liters,e.total_fuel_cost,
 e.km_per_unit as km_per_liter,e.cost_per_km,e.measured_segments
from public.v_vehicle_energy_consumption e join public.vehicles v on v.id=e.vehicle_id and v.company_id=e.company_id where e.unit='L';

create function private.trip_effective_distance(p_trip_id uuid,p_start numeric,p_end numeric)
returns numeric language sql stable security definer set search_path='' as $$
 select case when p_start is not null and p_end is not null then greatest(0,coalesce((select effective_km from private.effective_odometer_events where source_type='trip_completion' and source_id=p_trip_id order by created_at desc limit 1),p_end)-p_start) end
$$;
revoke all on function private.trip_effective_distance(uuid,numeric,numeric) from public,anon,authenticated,service_role;
commit;
