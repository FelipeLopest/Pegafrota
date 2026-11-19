-- A empresa escolhe controlar a garagem. A criação com saída é indivisível.
begin;

alter table public.companies add column yard_control_enabled boolean not null default false;
-- Preserva a rotina das empresas que já mantêm presença ou passagens.
update public.companies c set yard_control_enabled = true
where exists (select 1 from public.vehicle_movements m where m.company_id = c.id)
   or exists (select 1 from private.initial_vehicle_presence p where p.company_id = c.id);

create function public.fleet_workflow_settings(p_yard_control_enabled boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare empresa uuid := private.current_user_company_id(); anterior boolean; atual boolean;
begin
  perform private.assert_company_access(empresa);
  if p_yard_control_enabled is not null then
    perform private.assert_permission('company.update');
    select yard_control_enabled into anterior from public.companies where id = empresa for update;
    update public.companies set yard_control_enabled = p_yard_control_enabled where id = empresa;
    if anterior is distinct from p_yard_control_enabled then
      perform private.log_audit_event(empresa, 'update', 'public.companies', empresa,
        jsonb_build_object('yardControlEnabled', jsonb_build_object('old', anterior, 'new', p_yard_control_enabled)),
        jsonb_build_object('rpc', 'fleet_workflow_settings'));
    end if;
  end if;
  select yard_control_enabled into atual from public.companies where id = empresa;
  return jsonb_build_object('yardControlEnabled', atual,
    'hasTrips', exists (select 1 from public.trips where company_id = empresa));
end $$;

-- Uma saída deve ocorrer no pátio em que o veículo consta presente.
create or replace function public.movement_command(p_vehicle_id uuid,p_location_id uuid,p_direction public.movement_type,p_occurred_at timestamptz,p_command_id uuid,p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare veiculo public.vehicles; movimento public.vehicle_movements; anterior public.vehicle_movements;
  estado public.movement_type; resultado jsonb; quando timestamptz := coalesce(p_occurred_at,now()); patio_atual uuid;
begin
  perform private.assert_permission('movements.write');
  select * into veiculo from public.vehicles where id = p_vehicle_id;
  if not found then raise exception 'VEHICLE_NOT_FOUND' using hint = 'NOT_FOUND'; end if;
  perform private.assert_company_access(veiculo.company_id);
  resultado := private.begin_operation(veiculo.company_id,p_command_id,'movement',jsonb_build_array(p_vehicle_id,p_location_id,p_direction,p_occurred_at,p_notes));
  if resultado is not null then return resultado || jsonb_build_object('deduplicated',true); end if;
  select * into veiculo from public.vehicles where id = p_vehicle_id for update;
  if veiculo.archived_at is not null then raise exception 'VEHICLE_ARCHIVED' using hint = 'CONFLICT_ARCHIVED'; end if;
  if not exists(select 1 from public.locations where id = p_location_id and company_id = veiculo.company_id and active and archived_at is null) then
    raise exception 'LOCATION_NOT_FOUND: selecione base ativa da empresa' using hint = 'VALIDATION_ERROR';
  end if;
  select * into anterior from public.vehicle_movements where vehicle_id = veiculo.id order by sequence_no desc limit 1;
  estado := private.current_vehicle_movement(veiculo.id);
  if p_direction is null or (p_direction = 'exit' and estado is distinct from 'entry') or (p_direction = 'entry' and estado = 'entry') then
    raise exception 'MOVEMENT_DIRECTION_CONFLICT: confira a presença e o sentido. Para primeira saída, confirme a presença inicial.' using hint = 'CONFLICT_STATE';
  end if;
  patio_atual := coalesce(anterior.location_id,(select location_id from private.initial_vehicle_presence where vehicle_id = veiculo.id));
  if p_direction = 'exit' and patio_atual is not null and patio_atual <> p_location_id then
    raise exception 'MOVEMENT_LOCATION_CONFLICT: veículo consta em outro pátio. Confira o local da saída.' using hint = 'CONFLICT_STATE';
  end if;
  if quando > now()+interval '5 minutes' or (anterior.id is not null and quando < anterior.occurred_at) then
    raise exception 'MOVEMENT_CHRONOLOGY: data incompatível com a última passagem' using hint = 'CHRONOLOGY_ERROR';
  end if;
  insert into public.vehicle_movements(company_id,vehicle_id,location_id,movement_type,sequence_no,occurred_at,source,operator_user_id,notes)
  values(veiculo.company_id,veiculo.id,p_location_id,p_direction,coalesce(anterior.sequence_no,0)+1,quando,'manual',private.current_user_id(),private.normalize_label(p_notes)) returning * into movimento;
  return private.finish_operation(veiculo.company_id,p_command_id,jsonb_build_object('movementId',movimento.id,'vehicleId',veiculo.id,'plate',veiculo.plate,'movementType',movimento.movement_type,'occurredAt',movimento.occurred_at,'locationId',movimento.location_id,'sequenceNo',movimento.sequence_no,'deduplicated',false,'vehicleIsInside',movimento.movement_type = 'entry'));
end $$;

create function public.create_and_start_trip(
  p_trip jsonb, p_odometer_km numeric, p_occurred_at timestamptz,
  p_location_id uuid, p_command_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare empresa uuid := private.current_user_company_id(); resultado jsonb; viagem jsonb;
begin
  perform private.assert_permission('trips.write');
  perform private.assert_company_access(empresa);
  if p_trip is null or jsonb_typeof(p_trip) <> 'object' or p_odometer_km is null or p_occurred_at is null then
    raise exception 'INVALID_INPUT: informe viagem, quilometragem e horário da saída' using hint = 'VALIDATION_ERROR';
  end if;
  resultado := private.begin_operation(empresa, p_command_id, 'create_and_start_trip',
    jsonb_build_array(p_trip, p_odometer_km, p_occurred_at, p_location_id));
  if resultado is not null then return resultado; end if;
  viagem := public.create_trip(
    (p_trip->>'vehicleId')::uuid, (p_trip->>'driverId')::uuid,
    p_trip->>'originLabel', p_trip->>'destinationLabel',
    nullif(p_trip->>'plannedDepartureAt', '')::timestamptz,
    nullif(p_trip->>'plannedReturnAt', '')::timestamptz,
    p_trip->>'purpose', p_trip->>'notes');
  resultado := public.trip_operation((viagem->>'tripId')::uuid, 'start',
    p_odometer_km, p_occurred_at, p_location_id, null, gen_random_uuid());
  return private.finish_operation(empresa, p_command_id, resultado);
end $$;

revoke all on function public.fleet_workflow_settings(boolean),
  public.create_and_start_trip(jsonb,numeric,timestamptz,uuid,uuid) from public, anon, service_role;
grant execute on function public.fleet_workflow_settings(boolean),
  public.create_and_start_trip(jsonb,numeric,timestamptz,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
