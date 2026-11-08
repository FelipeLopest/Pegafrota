-- =============================================================================
-- PegaNaFrota — 20260804000100 — RPCs de cadastro que faltavam ao Desktop
-- =============================================================================
-- CORREÇÃO DOS ACHADOS R2-001 (parcial) e do teste de contrato.
--
-- O banco V2 nasceu com RPCs de OPERAÇÃO (iniciar viagem, abastecer, mover
-- veículo) mas sem os de CADASTRO. As telas precisavam deles e chamaram nomes
-- que não existiam.
--
-- Das duas saídas do prompt, escolhi criar as RPCs em vez de fazer o cliente
-- escrever direto nas tabelas:
--
--   INSERT direto pelo PostgREST passaria pela RLS — o isolamento continuaria
--   de pé — mas perderia três coisas que o resto do banco garante:
--     1. `private.assert_permission()`, que separa quem lê de quem escreve
--        dentro da mesma empresa;
--     2. `private.log_audit_event()`, que deixa rastro de quem criou o quê;
--     3. a semente do ledger de odômetro na criação do veículo, que é o que
--        torna a primeira leitura auditável em vez de mágica.
--   Perder auditoria para economizar SQL contraria a instrução explícita de não
--   enfraquecer auditoria.
--
-- Todas seguem o padrão das RPCs existentes: SECURITY DEFINER, search_path
-- fixo, permissão checada, empresa derivada do contexto (nunca do cliente) e
-- evento de auditoria.
-- =============================================================================

-- =============================================================================
-- 1. Veículos
-- =============================================================================
create or replace function public.create_vehicle(
  p_plate                text,
  p_brand                text,
  p_model                text,
  p_fuel_type            public.fuel_type,
  p_model_year           integer default null,
  p_initial_odometer_km  numeric default 0,
  p_color                text default null,
  p_category             text default null,
  p_tank_capacity_l      numeric default null,
  p_notes                text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_plate   text;
  v_vehicle public.vehicles;
begin
  perform private.assert_permission('vehicles.write');
  v_company := private.current_user_company_id();

  v_plate := private.normalize_plate(p_plate);
  if v_plate is null then
    raise exception 'INVALID_INPUT: placa é obrigatória'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  -- A unicidade é por EMPRESA: duas empresas podem operar placas iguais em
  -- momentos diferentes, e o índice do banco reflete isso.
  if exists (select 1 from public.vehicles where company_id = v_company and plate = v_plate) then
    raise exception 'VEHICLE_DUPLICATE: já existe veículo com a placa % nesta empresa', v_plate
      using errcode = '23505', hint = 'CONFLICT_DUPLICATE';
  end if;

  if coalesce(p_initial_odometer_km, 0) < 0 then
    raise exception 'INVALID_INPUT: odômetro inicial não pode ser negativo'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  insert into public.vehicles (
    company_id, plate, brand, model, model_year, fuel_type,
    color, category, tank_capacity_l, notes, status, current_odometer_km
  )
  values (
    v_company, v_plate,
    private.normalize_label(p_brand), private.normalize_label(p_model),
    p_model_year, p_fuel_type,
    private.normalize_label(p_color), private.normalize_label(p_category),
    p_tank_capacity_l, private.normalize_label(p_notes),
    'available', coalesce(p_initial_odometer_km, 0)
  )
  returning * into v_vehicle;

  -- Semeia o ledger. Sem este evento, a primeira leitura do odômetro não teria
  -- origem registrada e qualquer conferência futura começaria no escuro.
  insert into public.vehicle_odometer_events (
    company_id, vehicle_id, occurred_at, odometer_km, previous_km,
    source_type, reason, created_by
  )
  values (
    v_company, v_vehicle.id, now(), coalesce(p_initial_odometer_km, 0), null,
    'vehicle_registration', 'Cadastro do veículo', private.current_user_id()
  );

  perform private.log_audit_event(
    v_company, 'insert', 'public.vehicles', v_vehicle.id,
    jsonb_build_object('plate', v_plate, 'brand', v_vehicle.brand, 'model', v_vehicle.model),
    jsonb_build_object('rpc', 'create_vehicle')
  );

  return jsonb_build_object(
    'vehicleId', v_vehicle.id, 'plate', v_vehicle.plate,
    'status', v_vehicle.status, 'currentOdometerKm', v_vehicle.current_odometer_km
  );
end;
$$;

create or replace function public.update_vehicle(
  p_vehicle_id uuid,
  p_patch      jsonb
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

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo arquivado não é editável'
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  -- Placa e odômetro NÃO entram no patch.
  --   A placa identifica o veículo em movimentações e leituras já gravadas;
  --   trocá-la reescreveria o passado.
  --   O odômetro só muda pelo ledger, via register_odometer_reading, que exige
  --   justificativa. Permitir aqui seria uma porta lateral sem rastro.
  if p_patch ? 'plate' then
    raise exception 'INVALID_INPUT: a placa não é editável'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;
  if p_patch ? 'current_odometer_km' or p_patch ? 'currentOdometerKm' then
    raise exception 'INVALID_INPUT: o odômetro muda apenas pelo ledger'
      using errcode = '22023', hint = 'USE_RPC';
  end if;

  update public.vehicles
     set brand           = coalesce(private.normalize_label(p_patch ->> 'brand'), brand),
         model           = coalesce(private.normalize_label(p_patch ->> 'model'), model),
         model_year      = case when p_patch ? 'modelYear'
                                then nullif(p_patch ->> 'modelYear', '')::integer else model_year end,
         color           = case when p_patch ? 'color'
                                then private.normalize_label(p_patch ->> 'color') else color end,
         category        = case when p_patch ? 'category'
                                then private.normalize_label(p_patch ->> 'category') else category end,
         tank_capacity_l = case when p_patch ? 'tankCapacityL'
                                then nullif(p_patch ->> 'tankCapacityL', '')::numeric else tank_capacity_l end,
         fuel_type       = case when p_patch ? 'fuelType'
                                then (p_patch ->> 'fuelType')::public.fuel_type else fuel_type end,
         notes           = case when p_patch ? 'notes'
                                then private.normalize_label(p_patch ->> 'notes') else notes end
   where id = p_vehicle_id
  returning * into v_vehicle;

  perform private.log_audit_event(
    v_vehicle.company_id, 'update', 'public.vehicles', p_vehicle_id,
    jsonb_build_object('patchKeys', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)),
    jsonb_build_object('rpc', 'update_vehicle')
  );

  return jsonb_build_object('vehicleId', v_vehicle.id, 'plate', v_vehicle.plate,
                            'updatedAt', v_vehicle.updated_at);
end;
$$;

-- =============================================================================
-- 2. Motoristas
-- =============================================================================
create or replace function public.create_driver(
  p_full_name          text,
  p_internal_document  text default null,
  p_phone              text default null,
  p_license_category   text default null,
  p_license_expires_on date default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_driver  public.drivers;
  v_name    text;
begin
  perform private.assert_permission('drivers.write');
  v_company := private.current_user_company_id();

  v_name := private.normalize_label(p_full_name);
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'INVALID_INPUT: nome do motorista é obrigatório'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  insert into public.drivers (
    company_id, full_name, internal_document, phone,
    license_category, license_expires_on, notes, active
  )
  values (
    v_company, v_name,
    private.normalize_label(p_internal_document),
    private.normalize_digits(p_phone),
    nullif(upper(btrim(coalesce(p_license_category, ''))), ''),
    p_license_expires_on,
    private.normalize_label(p_notes),
    true
  )
  returning * into v_driver;

  perform private.log_audit_event(
    v_company, 'insert', 'public.drivers', v_driver.id,
    jsonb_build_object('fullName', v_driver.full_name),
    jsonb_build_object('rpc', 'create_driver')
  );

  return jsonb_build_object('driverId', v_driver.id, 'fullName', v_driver.full_name,
                            'active', v_driver.active);
end;
$$;

-- =============================================================================
-- 3. Viagens
-- =============================================================================
create or replace function public.create_trip(
  p_vehicle_id           uuid,
  p_driver_id            uuid,
  p_origin_label         text,
  p_destination_label    text,
  p_planned_departure_at timestamptz default null,
  p_planned_return_at    timestamptz default null,
  p_purpose              text default null,
  p_notes                text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_vehicle public.vehicles;
  v_driver  public.drivers;
  v_trip    public.trips;
begin
  perform private.assert_permission('trips.write');
  v_company := private.current_user_company_id();

  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo arquivado não recebe viagem'
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  select * into v_driver from public.drivers where id = p_driver_id;
  if not found then
    raise exception 'DRIVER_NOT_FOUND: motorista % não existe', p_driver_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_driver.company_id);

  if not v_driver.active or v_driver.archived_at is not null then
    raise exception 'DRIVER_INACTIVE: motorista inativo não recebe viagem'
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if private.normalize_label(p_origin_label) is null
     or private.normalize_label(p_destination_label) is null then
    raise exception 'INVALID_INPUT: origem e destino são obrigatórios'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  if p_planned_departure_at is not null and p_planned_return_at is not null
     and p_planned_return_at <= p_planned_departure_at then
    raise exception 'INVALID_INPUT: retorno previsto deve ser posterior à saída prevista'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  -- A viagem nasce PLANEJADA. O veículo só sai de `available` ao iniciar, em
  -- start_trip — assim planejar não bloqueia o veículo para outra operação.
  insert into public.trips (
    company_id, vehicle_id, driver_id, status,
    origin_label, destination_label,
    planned_departure_at, planned_return_at, purpose, notes, created_by
  )
  values (
    v_company, p_vehicle_id, p_driver_id, 'planned',
    private.normalize_label(p_origin_label), private.normalize_label(p_destination_label),
    p_planned_departure_at, p_planned_return_at,
    private.normalize_label(p_purpose), private.normalize_label(p_notes),
    private.current_user_id()
  )
  returning * into v_trip;

  perform private.log_audit_event(
    v_company, 'insert', 'public.trips', v_trip.id,
    jsonb_build_object('vehicleId', p_vehicle_id, 'driverId', p_driver_id,
                       'origin', v_trip.origin_label, 'destination', v_trip.destination_label),
    jsonb_build_object('rpc', 'create_trip')
  );

  return jsonb_build_object('tripId', v_trip.id, 'status', v_trip.status);
end;
$$;

-- =============================================================================
-- 4. Manutenção
-- =============================================================================
create or replace function public.schedule_maintenance(
  p_vehicle_id            uuid,
  p_maintenance_type      public.maintenance_type,
  p_description           text,
  p_scheduled_for         timestamptz,
  p_scheduled_odometer_km numeric default null,
  p_supplier_name         text default null,
  p_notes                 text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_vehicle public.vehicles;
  v_rec     public.maintenance_records;
begin
  perform private.assert_permission('maintenance.schedule');
  v_company := private.current_user_company_id();

  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo arquivado não recebe manutenção'
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  if private.normalize_label(p_description) is null then
    raise exception 'INVALID_INPUT: descrição do serviço é obrigatória'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  if p_scheduled_for is null then
    raise exception 'INVALID_INPUT: data do agendamento é obrigatória'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;

  insert into public.maintenance_records (
    company_id, vehicle_id, maintenance_type, status, description,
    scheduled_for, scheduled_odometer_km, supplier_name, notes, created_by
  )
  values (
    v_company, p_vehicle_id, p_maintenance_type, 'scheduled',
    private.normalize_label(p_description), p_scheduled_for, p_scheduled_odometer_km,
    private.normalize_label(p_supplier_name), private.normalize_label(p_notes),
    private.current_user_id()
  )
  returning * into v_rec;

  perform private.log_audit_event(
    v_company, 'insert', 'public.maintenance_records', v_rec.id,
    jsonb_build_object('vehicleId', p_vehicle_id, 'type', p_maintenance_type,
                       'scheduledFor', p_scheduled_for),
    jsonb_build_object('rpc', 'schedule_maintenance')
  );

  return jsonb_build_object('maintenanceId', v_rec.id, 'status', v_rec.status);
end;
$$;

-- =============================================================================
-- 5. Empresa
-- =============================================================================
-- Leitura e edição do cadastro da PRÓPRIA empresa, pelo company_admin.
-- Distinta de platform.update_company, que é do administrador da plataforma:
-- aqui a empresa é derivada do contexto do usuário e nunca recebida do cliente.
create or replace function public.my_company()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  perform private.assert_permission('company.read');

  select * into v_company from public.companies where id = private.current_user_company_id();
  if not found then
    raise exception 'NOT_FOUND: empresa do contexto não existe'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', v_company.id,
    'legalName', v_company.legal_name,
    'tradeName', v_company.trade_name,
    'cnpj', v_company.cnpj,
    'email', v_company.email,
    'phone', v_company.phone,
    'addressStreet', v_company.address_street,
    'addressNumber', v_company.address_number,
    'addressComplement', v_company.address_complement,
    'addressDistrict', v_company.address_district,
    'addressCity', v_company.address_city,
    'addressState', v_company.address_state,
    'addressPostalCode', v_company.address_postal_code,
    'timezone', v_company.timezone,
    'status', v_company.status,
    'createdAt', v_company.created_at
  );
end;
$$;

create or replace function public.update_company(p_patch jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  perform private.assert_permission('company.update');

  select * into v_company
  from public.companies
  where id = private.current_user_company_id()
  for update;

  if not found then
    raise exception 'NOT_FOUND: empresa do contexto não existe'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  -- CNPJ e status ficam fora do alcance do cliente. O CNPJ é a identidade
  -- fiscal do tenant e chave única; o status pertence ao ciclo de vida
  -- administrado pela plataforma, não pela própria empresa.
  if p_patch ? 'cnpj' then
    raise exception 'INVALID_INPUT: CNPJ não é editável'
      using errcode = '22023', hint = 'VALIDATION_ERROR';
  end if;
  if p_patch ? 'status' then
    raise exception 'PERMISSION_DENIED: o estado da empresa é administrado pela plataforma'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;

  update public.companies
     set legal_name          = coalesce(private.normalize_label(p_patch ->> 'legalName'), legal_name),
         trade_name          = coalesce(private.normalize_label(p_patch ->> 'tradeName'), trade_name),
         email               = case when p_patch ? 'email'
                                    then nullif(lower(btrim(p_patch ->> 'email')), '') else email end,
         phone               = case when p_patch ? 'phone'
                                    then private.normalize_digits(p_patch ->> 'phone') else phone end,
         address_street      = case when p_patch ? 'addressStreet'
                                    then private.normalize_label(p_patch ->> 'addressStreet') else address_street end,
         address_number      = case when p_patch ? 'addressNumber'
                                    then private.normalize_label(p_patch ->> 'addressNumber') else address_number end,
         address_complement  = case when p_patch ? 'addressComplement'
                                    then private.normalize_label(p_patch ->> 'addressComplement') else address_complement end,
         address_district    = case when p_patch ? 'addressDistrict'
                                    then private.normalize_label(p_patch ->> 'addressDistrict') else address_district end,
         address_city        = case when p_patch ? 'addressCity'
                                    then private.normalize_label(p_patch ->> 'addressCity') else address_city end,
         address_state       = case when p_patch ? 'addressState'
                                    then nullif(upper(btrim(p_patch ->> 'addressState')), '') else address_state end,
         address_postal_code = case when p_patch ? 'addressPostalCode'
                                    then private.normalize_digits(p_patch ->> 'addressPostalCode') else address_postal_code end,
         timezone            = coalesce(private.normalize_label(p_patch ->> 'timezone'), timezone)
   where id = v_company.id
  returning * into v_company;

  perform private.log_audit_event(
    v_company.id, 'update', 'public.companies', v_company.id,
    jsonb_build_object('patchKeys', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)),
    jsonb_build_object('rpc', 'update_company')
  );

  return jsonb_build_object('id', v_company.id, 'updatedAt', v_company.updated_at);
end;
$$;

-- =============================================================================
-- 6. Grants
-- =============================================================================
-- Mesmo padrão das demais RPCs do tenant: `authenticated` executa, e quem
-- autoriza de fato é `private.assert_permission()` dentro da função.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_vehicle', 'update_vehicle', 'create_driver',
                        'create_trip', 'schedule_maintenance',
                        'my_company', 'update_company')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end
$$;
