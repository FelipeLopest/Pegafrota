-- =============================================================================
-- PegaNaFrota — seed.sql
-- =============================================================================
-- Dados de demonstração determinísticos e recriáveis por `supabase db reset`.
--
-- Propriedades:
--   - IDs derivados por private.stable_uuid(): a mesma base sai igual sempre.
--   - Variação derivada por private.stable_random(): sem random() real.
--   - Idempotente: se a base já tem empresas, o seed não faz nada.
--   - Cronologia e quilometragem coerentes POR VEÍCULO.
--   - Nenhum nome de pessoa ou empresa real. CNPJs fictícios, porém válidos
--     no módulo 11 (a constraint exige).
--
-- O timeline termina "agora": os últimos eventos ficam no mês corrente para que
-- dashboard, alertas e relatórios nunca apareçam vazios.
--
-- Credenciais de demonstração: docs/database/SEED_GUIDE.md
-- =============================================================================

set client_min_messages to warning;

do $seed$
declare
  v_pw        text;
  v_now       timestamptz := now();
  v_t0        timestamptz;   -- início do timeline (24 meses atrás)
  v_count     bigint;
  v_company   record;
begin
  -- ---------------------------------------------------------------------------
  -- Idempotência
  -- ---------------------------------------------------------------------------
  if exists (select 1 from public.companies) then
    raise notice 'PegaNaFrota seed: base já populada, nada a fazer.';
    return;
  end if;

  v_t0 := date_trunc('month', v_now) - interval '23 months';
  v_pw := extensions.crypt('PegaNaFrota#2026', extensions.gen_salt('bf'));

  -- ===========================================================================
  -- 1. Empresas
  -- ===========================================================================
  create temporary table _co (
    idx         integer primary key,
    slug        text not null,
    legal_name  text not null,
    trade_name  text not null,
    cnpj_base   text not null,
    city        text not null,
    state       text not null,
    timezone    text not null,
    n_vehicles  integer not null,
    n_drivers   integer not null,
    n_locations integer not null,
    plate_prefix text not null,
    id          uuid
  ) on commit drop;

  insert into _co (idx, slug, legal_name, trade_name, cnpj_base, city, state, timezone,
                   n_vehicles, n_drivers, n_locations, plate_prefix)
  values
    (1, 'auroraverde', 'Transportes Aurora Verde LTDA',   'Aurora Verde',
        '112223330001', 'Sorocaba',       'SP', 'America/Sao_Paulo', 18,  6, 2, 'AVD'),
    (2, 'pedraalta',   'Logística Pedra Alta LTDA',       'Pedra Alta',
        '223334440001', 'Campinas',       'SP', 'America/Sao_Paulo', 24,  8, 2, 'PDA'),
    (3, 'riosereno',   'Frota Rio Sereno LTDA',           'Rio Sereno',
        '334445550001', 'Curitiba',       'PR', 'America/Sao_Paulo', 31, 10, 3, 'RSN'),
    (4, 'camponovo',   'Distribuidora Campo Novo LTDA',   'Campo Novo',
        '445556660001', 'Uberlândia',     'MG', 'America/Sao_Paulo', 16,  5, 2, 'CPN');

  update _co set id = private.stable_uuid('company:' || slug);

  -- Cálculo dos dois dígitos verificadores do CNPJ (a check constraint valida).
  create temporary table _cnpj (idx integer primary key, cnpj text) on commit drop;
  insert into _cnpj (idx, cnpj)
  select c.idx, c.cnpj_base || d1.v::text || d2.v::text
  from _co c
  cross join lateral (
    select case when 11 - (s % 11) >= 10 then 0 else 11 - (s % 11) end as v
    from (
      select sum(substr(c.cnpj_base, i, 1)::integer *
                 (case when 6 - i > 1 then 6 - i else 14 - i end)) as s
      from generate_series(1, 12) i
    ) t
  ) d1
  cross join lateral (
    select case when 11 - (s % 11) >= 10 then 0 else 11 - (s % 11) end as v
    from (
      select sum(substr(c.cnpj_base || d1.v::text, i, 1)::integer *
                 (case when 7 - i > 1 then 7 - i else 15 - i end)) as s
      from generate_series(1, 13) i
    ) t
  ) d2;

  insert into public.companies (
    id, legal_name, trade_name, cnpj, email, phone,
    address_street, address_number, address_district, address_city,
    address_state, address_postal_code, timezone, status, created_at, updated_at
  )
  select
    c.id, c.legal_name, c.trade_name, n.cnpj,
    'contato@' || c.slug || '.example.com',
    '1' || lpad((3000000000 + c.idx * 111111)::text, 10, '0'),
    'Avenida das Operações', (100 * c.idx)::text, 'Distrito Industrial', c.city,
    c.state, lpad((18000000 + c.idx * 1111)::text, 8, '0'),
    c.timezone, 'active', v_t0 - interval '40 days', v_t0 - interval '40 days'
  from _co c
  join _cnpj n on n.idx = c.idx;

  -- ===========================================================================
  -- 2. Usuários (auth.users + profiles + memberships)
  -- ===========================================================================
  -- Inclui deliberadamente:
  --   - um usuário com MEMBERSHIP inativa (empresa 1)
  --   - um usuário com PERFIL inativo (empresa 2)
  -- para os testes de "usuário inativo" exigidos em SECURITY_MODEL.md §13.
  create temporary table _users (
    co_idx            integer not null,
    local_part        text not null,
    full_name         text not null,
    role              public.membership_role not null,
    profile_active    boolean not null default true,
    membership_active boolean not null default true,
    id                uuid,
    email             text
  ) on commit drop;

  insert into _users (co_idx, local_part, full_name, role, profile_active, membership_active) values
    -- Empresa 1 — 5 usuários
    (1, 'admin',    'Ana R.',      'company_admin', true,  true),
    (1, 'gestor',   'Bruno M.',    'fleet_manager', true,  true),
    (1, 'operador', 'Camila S.',   'operator',      true,  true),
    (1, 'consulta', 'Diego L.',    'viewer',        true,  true),
    (1, 'desligado','Eduarda P.',  'operator',      true,  false),
    -- Empresa 2 — 6 usuários
    (2, 'admin',    'Fabio T.',    'company_admin', true,  true),
    (2, 'gestor',   'Gisele A.',   'fleet_manager', true,  true),
    (2, 'operador', 'Henrique B.', 'operator',      true,  true),
    (2, 'operador2','Isabela C.',  'operator',      true,  true),
    (2, 'consulta', 'Joao V.',     'viewer',        true,  true),
    (2, 'suspenso', 'Karina D.',   'operator',      false, true),
    -- Empresa 3 — 6 usuários
    (3, 'admin',    'Lucas E.',    'company_admin', true,  true),
    (3, 'gestor',   'Marina F.',   'fleet_manager', true,  true),
    (3, 'gestor2',  'Nelson G.',   'fleet_manager', true,  true),
    (3, 'operador', 'Olivia H.',   'operator',      true,  true),
    (3, 'operador2','Paulo I.',    'operator',      true,  true),
    (3, 'consulta', 'Renata J.',   'viewer',        true,  true),
    -- Empresa 4 — 8 usuários
    (4, 'admin',    'Sergio K.',   'company_admin', true,  true),
    (4, 'admin2',   'Tatiana L.',  'company_admin', true,  true),
    (4, 'gestor',   'Ulisses M.',  'fleet_manager', true,  true),
    (4, 'gestor2',  'Vanessa N.',  'fleet_manager', true,  true),
    (4, 'operador', 'Wagner O.',   'operator',      true,  true),
    (4, 'operador2','Xenia P.',    'operator',      true,  true),
    (4, 'operador3','Yuri Q.',     'operator',      true,  true),
    (4, 'consulta', 'Zilda R.',    'viewer',        true,  true);

  update _users u
     set email = u.local_part || '@' || c.slug || '.example.com'
  from _co c where c.idx = u.co_idx;

  -- DB-AUD-012: em um projeto Supabase REMOTO as contas nascem pela Admin API
  -- do GoTrue e recebem um UUID próprio. Reaproveitar esse UUID é o que permite
  -- rodar ESTE MESMO arquivo contra um projeto real, sem edição manual. Quando
  -- a conta não existe (ambiente local), cai no UUID determinístico de sempre e
  -- nada muda para `supabase db reset`.
  update _users u
     set id = coalesce(
       (select au.id from auth.users au where lower(au.email) = u.email),
       private.stable_uuid('user:' || c.slug || ':' || u.local_part)
     )
  from _co c where c.idx = u.co_idx;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_super_admin
  )
  select
    '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
    u.email, v_pw, v_t0 - interval '39 days',
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', u.full_name),
    v_t0 - interval '39 days', v_t0 - interval '39 days',
    '', '', '', '', false
  from _users u
  where not exists (select 1 from auth.users au where au.id = u.id);

  -- `auth.identities.email` é GENERATED ALWAYS nas versões atuais do GoTrue.
  -- Nunca grave essa coluna diretamente: ela é derivada de identity_data->>'email'.
  -- Isso mantém o seed compatível tanto com `supabase db reset` quanto com o
  -- schema Auth hospedado atual.
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at,
                               created_at, updated_at, id)
  select
    u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
    'email', v_t0 - interval '39 days', v_t0 - interval '39 days', v_t0 - interval '39 days',
    private.stable_uuid('identity:' || u.email)
  from _users u
  where not exists (select 1 from auth.identities ai where ai.user_id = u.id);

  insert into public.profiles (id, full_name, phone, active, last_seen_at, created_at, updated_at)
  select
    u.id, u.full_name,
    '119' || lpad((10000000 + (private.stable_random('phone:' || u.email) * 89999999)::bigint)::text, 8, '0'),
    u.profile_active,
    case when u.profile_active then v_now - interval '3 hours' else null end,
    v_t0 - interval '39 days', v_t0 - interval '39 days'
  from _users u
  on conflict (id) do update
     set full_name    = excluded.full_name,
         phone        = excluded.phone,
         active       = excluded.active,
         last_seen_at = excluded.last_seen_at,
         updated_at   = excluded.updated_at;

  insert into public.company_memberships (id, company_id, user_id, role, active, created_at, updated_at)
  select
    private.stable_uuid('membership:' || u.email), c.id, u.id, u.role, u.membership_active,
    v_t0 - interval '38 days', v_t0 - interval '38 days'
  from _users u join _co c on c.idx = u.co_idx;

  -- ===========================================================================
  -- 3. Locais e câmeras
  -- ===========================================================================
  create temporary table _loc (
    co_idx integer not null,
    seq    integer not null,
    id     uuid not null,
    name   text not null,
    primary key (co_idx, seq)
  ) on commit drop;

  insert into _loc (co_idx, seq, id, name)
  select
    c.idx, s.seq,
    private.stable_uuid('location:' || c.slug || ':' || s.seq),
    case s.seq
      when 1 then 'Pátio Central'
      when 2 then 'Garagem Norte'
      else 'Base Sul'
    end
  from _co c cross join generate_series(1, 3) s(seq)
  where s.seq <= c.n_locations;

  insert into public.locations (
    id, company_id, name, address_street, address_number, address_district,
    address_city, address_state, address_postal_code, timezone, active,
    created_at, updated_at
  )
  select
    l.id, c.id, l.name, 'Rua do Pátio ' || l.seq, (l.seq * 50)::text, 'Zona Logística',
    c.city, c.state, lpad((18100000 + c.idx * 100 + l.seq)::text, 8, '0'),
    c.timezone, true, v_t0 - interval '37 days', v_t0 - interval '37 days'
  from _loc l join _co c on c.idx = l.co_idx;

  create temporary table _cam (
    co_idx  integer not null,
    loc_seq integer not null,
    seq     integer not null,
    id      uuid not null,
    loc_id  uuid not null,
    primary key (co_idx, loc_seq, seq)
  ) on commit drop;

  insert into _cam (co_idx, loc_seq, seq, id, loc_id)
  select
    l.co_idx, l.seq, s.seq,
    private.stable_uuid('camera:' || l.co_idx || ':' || l.seq || ':' || s.seq),
    l.id
  from _loc l cross join generate_series(1, 2) s(seq)
  where s.seq = 1 or l.seq = 1;   -- o pátio principal tem duas câmeras

  insert into public.cameras (
    id, company_id, location_id, name, local_identifier, direction, active,
    settings, created_at, updated_at
  )
  select
    m.id, c.id, m.loc_id,
    'Câmera ' || m.loc_seq || '-' || m.seq,
    'cam-' || c.slug || '-' || m.loc_seq || '-' || m.seq,
    case when m.seq = 1 then 'both' else 'entry' end::public.camera_direction,
    true,
    jsonb_build_object('resolution', '1920x1080', 'fps', 15, 'roi', 'center'),
    v_t0 - interval '36 days', v_t0 - interval '36 days'
  from _cam m join _co c on c.idx = m.co_idx;

  -- ===========================================================================
  -- 4. Motoristas
  -- ===========================================================================
  create temporary table _drv (
    co_idx integer not null,
    seq    integer not null,
    id     uuid not null,
    primary key (co_idx, seq)
  ) on commit drop;

  insert into _drv (co_idx, seq, id)
  select c.idx, s.seq, private.stable_uuid('driver:' || c.slug || ':' || s.seq)
  from _co c cross join generate_series(1, 10) s(seq)
  where s.seq <= c.n_drivers;

  insert into public.drivers (
    id, company_id, full_name, internal_document, phone, license_category,
    license_expires_on, active, created_at, updated_at
  )
  select
    d.id, c.id,
    'Motorista ' || chr(64 + d.seq) || '. ' || upper(substr(c.slug, 1, 3)),
    'MAT-' || upper(substr(c.slug, 1, 3)) || '-' || lpad(d.seq::text, 3, '0'),
    '119' || lpad((20000000 + c.idx * 1000 + d.seq)::text, 8, '0'),
    (array['B', 'C', 'D', 'E', 'AB', 'AD'])[1 + (d.seq % 6)],
    -- Alguns vencimentos próximos alimentam o alerta de CNH do dashboard.
    case when d.seq % 5 = 0
      then (v_now + interval '20 days')::date
      else (v_now + make_interval(days => 200 + d.seq * 30))::date
    end,
    true, v_t0 - interval '35 days', v_t0 - interval '35 days'
  from _drv d join _co c on c.idx = d.co_idx;

  -- ===========================================================================
  -- 5. Veículos
  -- ===========================================================================
  create temporary table _veh (
    co_idx     integer not null,
    seq        integer not null,
    id         uuid not null,
    plate      text not null,
    fuel_type  public.fuel_type not null,
    initial_km numeric(12, 1) not null,
    created_at timestamptz not null,
    primary key (co_idx, seq)
  ) on commit drop;

  insert into _veh (co_idx, seq, id, plate, fuel_type, initial_km, created_at)
  select
    c.idx, s.seq,
    private.stable_uuid('vehicle:' || c.slug || ':' || s.seq),
    -- Até 25: padrão nacional antigo. Acima: padrão Mercosul.
    case when s.seq <= 25
      then c.plate_prefix || lpad(s.seq::text, 4, '0')
      else c.plate_prefix || (s.seq % 10)::text || chr(65 + (s.seq % 26)) || lpad((s.seq / 10)::text, 2, '0')
    end,
    (array['flex', 'flex', 'diesel_s10', 'diesel_s10', 'gasoline',
           'diesel_s500', 'flex', 'cng', 'electric', 'flex'])[1 + (s.seq % 10)]::public.fuel_type,
    round((5000 + private.stable_random('km0:' || c.slug || ':' || s.seq) * 85000)::numeric, 1),
    v_t0 - interval '30 days'
  from _co c cross join generate_series(1, 40) s(seq)
  where s.seq <= c.n_vehicles;

  insert into public.vehicles (
    id, company_id, plate, brand, model, model_year, manufacture_year, color,
    fuel_type, category, tank_capacity_l, status, current_odometer_km,
    created_at, updated_at
  )
  select
    v.id, c.id, v.plate,
    (array['Marca Alfa', 'Marca Beta', 'Marca Gama', 'Marca Delta'])[1 + (v.seq % 4)],
    (array['Modelo 100', 'Modelo 200', 'Modelo 300', 'Modelo 400', 'Modelo 500'])[1 + (v.seq % 5)],
    2018 + (v.seq % 7), 2017 + (v.seq % 7),
    (array['Branco', 'Prata', 'Preto', 'Cinza', 'Vermelho'])[1 + (v.seq % 5)],
    v.fuel_type,
    (array['Utilitário', 'Van', 'Caminhão Leve', 'Automóvel'])[1 + (v.seq % 4)],
    case when v.fuel_type = 'electric' then null else 55 + (v.seq % 4) * 25 end,
    'available', v.initial_km,
    v.created_at, v.created_at
  from _veh v join _co c on c.idx = v.co_idx;

  -- Evento inicial do ledger: origem "cadastro do veículo".
  insert into public.vehicle_odometer_events (
    id, company_id, vehicle_id, occurred_at, odometer_km, previous_km,
    source_type, source_id, reason, created_by, created_at
  )
  select
    private.stable_uuid('odo:init:' || v.id::text), c.id, v.id,
    v.created_at, v.initial_km, 0, 'vehicle_registration', null,
    'quilometragem informada no cadastro', null, v.created_at
  from _veh v join _co c on c.idx = v.co_idx;

  -- ===========================================================================
  -- 6. Plano de eventos: 24 meses por veículo
  -- ===========================================================================
  -- Quatro slots por mês (viagem, abastecimento, viagem, abastecimento) nos dias
  -- 1, 7, 13 e 19, mais uma manutenção no dia 25 a cada seis meses. Os slots são
  -- espaçados o suficiente para que nenhum evento se sobreponha a uma viagem.
  create temporary table _plan on commit drop as
  select
    v.co_idx,
    v.id            as vehicle_id,
    v.seq           as veh_seq,
    m.month_offset,
    s.slot,
    (date_trunc('month', v_now)
      - make_interval(months => 23 - m.month_offset)
      + make_interval(days => s.slot * 6, hours => 7 + s.slot * 3)) as occurred_at,
    case when s.slot % 2 = 0 then 'trip' else 'fueling' end as kind
  from _veh v
  cross join generate_series(0, 23) m(month_offset)
  cross join generate_series(0, 3) s(slot)
  where not (s.slot % 2 = 1 and v.fuel_type = 'electric');   -- elétrico não abastece

  insert into _plan (co_idx, vehicle_id, veh_seq, month_offset, slot, occurred_at, kind)
  select
    v.co_idx, v.id, v.seq, m.month_offset, 4,
    (date_trunc('month', v_now)
      - make_interval(months => 23 - m.month_offset)
      + make_interval(days => 24, hours => 9)),
    'maintenance'
  from _veh v
  cross join generate_series(0, 23) m(month_offset)
  where (m.month_offset % 6) = (v.seq % 6);

  -- Nada no futuro.
  delete from _plan where occurred_at > v_now - interval '4 hours';

  -- Quilometragem acumulada por veículo, em ordem cronológica estrita.
  create temporary table _ev on commit drop as
  select
    p.*,
    v.initial_km
      + coalesce(sum(p.delta_km) over (
          partition by p.vehicle_id order by p.occurred_at
          rows between unbounded preceding and 1 preceding), 0) as km_before,
    v.initial_km
      + sum(p.delta_km) over (
          partition by p.vehicle_id order by p.occurred_at
          rows between unbounded preceding and current row)     as km_after,
    row_number() over (partition by p.vehicle_id order by p.occurred_at) as event_no
  from (
    select
      pp.*,
      case when pp.kind = 'trip'
        then round((40 + private.stable_random(
               'dist:' || pp.vehicle_id::text || ':' || pp.month_offset || ':' || pp.slot) * 460)::numeric, 1)
        else 0::numeric
      end as delta_km
    from _plan pp
  ) p
  join _veh v on v.id = p.vehicle_id;

  -- ===========================================================================
  -- 7. Viagens concluídas
  -- ===========================================================================
  create temporary table _trip on commit drop as
  select
    e.co_idx,
    e.vehicle_id,
    e.veh_seq,
    private.stable_uuid('trip:' || e.vehicle_id::text || ':' || e.event_no) as id,
    e.occurred_at as departure_at,
    e.occurred_at + make_interval(
      hours  => 2 + (private.stable_random('dur:' || e.vehicle_id::text || ':' || e.event_no) * 8)::integer,
      mins   => (15 * (e.event_no % 4))::integer
    ) as return_at,
    e.km_before as start_km,
    e.km_after  as end_km,
    e.event_no
  from _ev e
  where e.kind = 'trip';

  insert into public.trips (
    id, company_id, vehicle_id, driver_id, status, origin_label, destination_label,
    planned_departure_at, actual_departure_at, planned_return_at, actual_return_at,
    start_odometer_km, end_odometer_km, purpose, created_by, created_at, updated_at
  )
  select
    t.id, c.id, t.vehicle_id,
    d.id,
    'completed',
    (array['Pátio Central', 'Garagem Norte', 'Base Sul', 'Centro de Distribuição'])[1 + (t.event_no % 4)],
    (array['Cliente Norte', 'Cliente Sul', 'Filial Leste', 'Terminal Oeste', 'Rota Regional'])[1 + (t.event_no % 5)],
    t.departure_at - interval '1 day', t.departure_at,
    t.return_at, t.return_at,
    t.start_km, t.end_km,
    (array['Entrega', 'Coleta', 'Transferência', 'Apoio operacional'])[1 + (t.event_no % 4)],
    u.id, t.departure_at - interval '1 day', t.return_at
  from _trip t
  join _co c on c.idx = t.co_idx
  left join lateral (
    select dd.id from _drv dd
    where dd.co_idx = t.co_idx
      and dd.seq = 1 + ((t.veh_seq + t.event_no) % (select n_drivers from _co where idx = t.co_idx))
    limit 1
  ) d on true
  left join lateral (
    select uu.id from _users uu
    where uu.co_idx = t.co_idx and uu.local_part = 'operador' limit 1
  ) u on true;

  -- ===========================================================================
  -- 8. Abastecimentos
  -- ===========================================================================
  insert into public.fuelings (
    id, company_id, vehicle_id, driver_id, fueled_at, fuel_type, liters,
    price_per_liter, total_amount, odometer_km, station_name, full_tank,
    created_by, created_at, updated_at
  )
  select
    private.stable_uuid('fuel:' || e.vehicle_id::text || ':' || e.event_no),
    c.id, e.vehicle_id, d.id, e.occurred_at,
    -- Flex alterna gasolina e etanol; os demais usam o próprio combustível.
    case
      when v.fuel_type = 'flex' and e.event_no % 3 = 0 then 'ethanol'
      when v.fuel_type = 'flex' then 'gasoline'
      else v.fuel_type
    end::public.fuel_type,
    lt.liters,
    pr.price,
    round(lt.liters * pr.price, 2),
    e.km_before,
    (array['Posto Rota 1', 'Posto Rota 2', 'Posto Rodovia', 'Posto Cidade'])[1 + (e.event_no % 4)],
    (e.event_no % 3 <> 1),
    u.id, e.occurred_at, e.occurred_at
  from _ev e
  join _veh v on v.id = e.vehicle_id
  join _co c on c.idx = e.co_idx
  cross join lateral (
    select round((28 + private.stable_random('lt:' || e.vehicle_id::text || ':' || e.event_no) * 62)::numeric, 3) as liters
  ) lt
  cross join lateral (
    select round((5.19 + private.stable_random('pr:' || e.vehicle_id::text || ':' || e.event_no) * 1.9
                  + e.month_offset * 0.012)::numeric, 3) as price
  ) pr
  left join lateral (
    select dd.id from _drv dd
    where dd.co_idx = e.co_idx
      and dd.seq = 1 + ((e.veh_seq + e.event_no) % (select n_drivers from _co where idx = e.co_idx))
    limit 1
  ) d on true
  left join lateral (
    select uu.id from _users uu where uu.co_idx = e.co_idx and uu.local_part = 'operador' limit 1
  ) u on true
  where e.kind = 'fueling';

  -- ===========================================================================
  -- 9. Manutenções concluídas (histórico)
  -- ===========================================================================
  insert into public.maintenance_records (
    id, company_id, vehicle_id, maintenance_type, status, description,
    scheduled_for, scheduled_odometer_km, started_at, completed_at,
    completion_odometer_km, total_cost, supplier_name, invoice_number,
    created_by, created_at, updated_at
  )
  select
    private.stable_uuid('maint:' || e.vehicle_id::text || ':' || e.event_no),
    c.id, e.vehicle_id,
    case when e.month_offset % 12 = 0 then 'corrective' else 'preventive' end::public.maintenance_type,
    'completed',
    (array['Revisão programada', 'Troca de óleo e filtros', 'Sistema de freios',
           'Suspensão dianteira', 'Pneus e alinhamento'])[1 + (e.event_no % 5)],
    e.occurred_at - interval '10 days', e.km_before,
    e.occurred_at - interval '6 hours', e.occurred_at,
    e.km_before,
    round((320 + private.stable_random('cost:' || e.vehicle_id::text || ':' || e.event_no) * 3400)::numeric, 2),
    (array['Oficina Alfa', 'Oficina Beta', 'Concessionária Gama'])[1 + (e.event_no % 3)],
    'NF-' || lpad(((e.veh_seq * 100 + e.event_no) % 99999)::text, 6, '0'),
    u.id, e.occurred_at - interval '10 days', e.occurred_at
  from _ev e
  join _co c on c.idx = e.co_idx
  left join lateral (
    select uu.id from _users uu where uu.co_idx = e.co_idx and uu.local_part = 'gestor' limit 1
  ) u on true
  where e.kind = 'maintenance';

  -- ===========================================================================
  -- 10. Ledger de odômetro
  -- ===========================================================================
  -- ORDEM IMPORTA: o trigger private.tg_odometer_ledger_insert() compara cada
  -- inserção com o maior valor já registrado do veículo. O ORDER BY abaixo é o
  -- que faz a inserção em massa ser aceita — e, ao mesmo tempo, prova que a
  -- cronologia gerada é coerente.
  insert into public.vehicle_odometer_events (
    id, company_id, vehicle_id, occurred_at, odometer_km, previous_km,
    source_type, source_id, reason, created_by, created_at
  )
  select id, company_id, vehicle_id, occurred_at, odometer_km, null,
         source_type, source_id, null, created_by, created_at
  from (
    select
      private.stable_uuid('odo:trip:' || t.id::text) as id,
      c.id as company_id, t.vehicle_id, t.return_at as occurred_at,
      t.end_km as odometer_km, 'trip_completion'::public.odometer_source_type as source_type,
      t.id as source_id, null::uuid as created_by, t.return_at as created_at
    from _trip t join _co c on c.idx = t.co_idx
    union all
    select
      private.stable_uuid('odo:fuel:' || private.stable_uuid('fuel:' || e.vehicle_id::text || ':' || e.event_no)::text),
      c.id, e.vehicle_id, e.occurred_at, e.km_before, 'fueling',
      private.stable_uuid('fuel:' || e.vehicle_id::text || ':' || e.event_no),
      null, e.occurred_at
    from _ev e join _co c on c.idx = e.co_idx
    where e.kind = 'fueling'
    union all
    select
      private.stable_uuid('odo:maint:' || private.stable_uuid('maint:' || e.vehicle_id::text || ':' || e.event_no)::text),
      c.id, e.vehicle_id, e.occurred_at, e.km_before, 'maintenance_completion',
      private.stable_uuid('maint:' || e.vehicle_id::text || ':' || e.event_no),
      null, e.occurred_at
    from _ev e join _co c on c.idx = e.co_idx
    where e.kind = 'maintenance'
  ) all_events
  order by vehicle_id, occurred_at, odometer_km;

  -- Cache derivado do ledger.
  update public.vehicles v
     set current_odometer_km = l.max_km
  from (
    select vehicle_id, max(odometer_km) as max_km
    from public.vehicle_odometer_events group by vehicle_id
  ) l
  where l.vehicle_id = v.id and v.current_odometer_km <> l.max_km;

  -- ===========================================================================
  -- 11. Viagens em andamento, planejadas e canceladas
  -- ===========================================================================
  -- As em andamento deixam o veículo FORA do pátio (última movimentação = saída).
  create temporary table _open_trip on commit drop as
  select
    v.co_idx, v.id as vehicle_id, v.seq,
    private.stable_uuid('trip:open:' || v.id::text) as id,
    v_now - make_interval(hours => 2 + (v.seq % 18)) as departure_at,
    (select max(odometer_km) from public.vehicle_odometer_events e where e.vehicle_id = v.id) as start_km
  from _veh v
  where v.seq % 7 = 3;   -- ~14% da frota está na rua

  insert into public.trips (
    id, company_id, vehicle_id, driver_id, status, origin_label, destination_label,
    planned_departure_at, actual_departure_at, planned_return_at,
    start_odometer_km, purpose, created_by, created_at, updated_at
  )
  select
    o.id, c.id, o.vehicle_id, d.id, 'in_progress',
    'Pátio Central', 'Rota em execução',
    o.departure_at, o.departure_at, v_now + interval '6 hours',
    o.start_km, 'Entrega em rota', u.id, o.departure_at - interval '2 hours', o.departure_at
  from _open_trip o
  join _co c on c.idx = o.co_idx
  left join lateral (select dd.id from _drv dd where dd.co_idx = o.co_idx and dd.seq = 1 + (o.seq % (select n_drivers from _co where idx = o.co_idx)) limit 1) d on true
  left join lateral (select uu.id from _users uu where uu.co_idx = o.co_idx and uu.local_part = 'operador' limit 1) u on true;

  update public.vehicles set status = 'in_use'
  where id in (select vehicle_id from _open_trip);

  -- Planejadas (futuro): alimentam a agenda operacional.
  insert into public.trips (
    id, company_id, vehicle_id, driver_id, status, origin_label, destination_label,
    planned_departure_at, planned_return_at, purpose, created_by, created_at, updated_at
  )
  select
    private.stable_uuid('trip:planned:' || v.id::text), c.id, v.id, d.id, 'planned',
    'Pátio Central',
    (array['Cliente Norte', 'Filial Leste', 'Terminal Oeste'])[1 + (v.seq % 3)],
    v_now + make_interval(days => 1 + (v.seq % 9), hours => 8),
    v_now + make_interval(days => 1 + (v.seq % 9), hours => 18),
    'Entrega programada', u.id, v_now - interval '1 day', v_now - interval '1 day'
  from _veh v
  join _co c on c.idx = v.co_idx
  left join lateral (select dd.id from _drv dd where dd.co_idx = v.co_idx and dd.seq = 1 + (v.seq % (select n_drivers from _co where idx = v.co_idx)) limit 1) d on true
  left join lateral (select uu.id from _users uu where uu.co_idx = v.co_idx and uu.local_part = 'gestor' limit 1) u on true
  where v.seq % 5 = 1 and v.seq % 7 <> 3;

  -- Canceladas.
  insert into public.trips (
    id, company_id, vehicle_id, driver_id, status, origin_label, destination_label,
    planned_departure_at, planned_return_at, cancel_reason, cancelled_at, cancelled_by,
    created_by, created_at, updated_at
  )
  select
    private.stable_uuid('trip:cancelled:' || v.id::text), c.id, v.id, d.id, 'cancelled',
    'Pátio Central', 'Cliente Sul',
    v_now - interval '12 days', v_now - interval '11 days',
    'Cliente cancelou a janela de entrega', v_now - interval '13 days', u.id,
    u.id, v_now - interval '15 days', v_now - interval '13 days'
  from _veh v
  join _co c on c.idx = v.co_idx
  left join lateral (select dd.id from _drv dd where dd.co_idx = v.co_idx and dd.seq = 1 limit 1) d on true
  left join lateral (select uu.id from _users uu where uu.co_idx = v.co_idx and uu.local_part = 'gestor' limit 1) u on true
  where v.seq % 11 = 4;

  -- ===========================================================================
  -- 12. Manutenções agendadas, vencidas, em execução e canceladas
  -- ===========================================================================
  -- Agendadas dentro dos próximos 30 dias -> alerta "maintenanceNext30Days".
  insert into public.maintenance_records (
    id, company_id, vehicle_id, maintenance_type, status, description,
    scheduled_for, scheduled_odometer_km, created_by, created_at, updated_at
  )
  select
    private.stable_uuid('maint:sched:' || v.id::text), c.id, v.id, 'preventive', 'scheduled',
    'Revisão preventiva programada',
    v_now + make_interval(days => 3 + (v.seq % 24)),
    (select max(odometer_km) + 4000 from public.vehicle_odometer_events e where e.vehicle_id = v.id),
    u.id, v_now - interval '5 days', v_now - interval '5 days'
  from _veh v
  join _co c on c.idx = v.co_idx
  left join lateral (select uu.id from _users uu where uu.co_idx = v.co_idx and uu.local_part = 'gestor' limit 1) u on true
  where v.seq % 3 = 0;

  -- Vencidas por data -> alerta "maintenanceOverdue".
  insert into public.maintenance_records (
    id, company_id, vehicle_id, maintenance_type, status, description,
    scheduled_for, scheduled_odometer_km, created_by, created_at, updated_at
  )
  select
    private.stable_uuid('maint:overdue:' || v.id::text), c.id, v.id, 'preventive', 'scheduled',
    'Revisão preventiva em atraso',
    v_now - make_interval(days => 4 + (v.seq % 22)),
    (select max(odometer_km) - 1500 from public.vehicle_odometer_events e where e.vehicle_id = v.id),
    u.id, v_now - interval '45 days', v_now - interval '45 days'
  from _veh v
  join _co c on c.idx = v.co_idx
  left join lateral (select uu.id from _users uu where uu.co_idx = v.co_idx and uu.local_part = 'gestor' limit 1) u on true
  where v.seq % 8 = 5;

  -- Em execução -> veículo em manutenção.
  insert into public.maintenance_records (
    id, company_id, vehicle_id, maintenance_type, status, description,
    scheduled_for, started_at, created_by, created_at, updated_at
  )
  select
    private.stable_uuid('maint:running:' || v.id::text), c.id, v.id, 'corrective', 'in_progress',
    'Correção de sistema elétrico',
    v_now - interval '3 days', v_now - interval '2 days',
    u.id, v_now - interval '4 days', v_now - interval '2 days'
  from _veh v
  join _co c on c.idx = v.co_idx
  left join lateral (select uu.id from _users uu where uu.co_idx = v.co_idx and uu.local_part = 'gestor' limit 1) u on true
  where v.seq % 13 = 6 and v.seq % 7 <> 3;

  update public.vehicles set status = 'in_maintenance'
  where id in (
    select vehicle_id from public.maintenance_records where status = 'in_progress'
  ) and status <> 'in_use';

  -- Canceladas.
  insert into public.maintenance_records (
    id, company_id, vehicle_id, maintenance_type, status, description,
    scheduled_for, cancel_reason, cancelled_at, cancelled_by, created_by, created_at, updated_at
  )
  select
    private.stable_uuid('maint:cancelled:' || v.id::text), c.id, v.id, 'preventive', 'cancelled',
    'Revisão reagendada pela oficina',
    v_now - interval '20 days', 'Oficina sem disponibilidade de peça',
    v_now - interval '22 days', u.id, u.id, v_now - interval '25 days', v_now - interval '22 days'
  from _veh v
  join _co c on c.idx = v.co_idx
  left join lateral (select uu.id from _users uu where uu.co_idx = v.co_idx and uu.local_part = 'gestor' limit 1) u on true
  where v.seq % 17 = 7;

  -- ===========================================================================
  -- 13. Movimentações alternadas
  -- ===========================================================================
  -- Construção: entrada inicial no cadastro, depois saída/entrada por viagem
  -- concluída, e saída sem retorno para as viagens em andamento. A ordem
  -- cronológica produz alternância perfeita, e o sequence_no é derivado dela.
  create temporary table _mv_raw on commit drop as
  select
    v.co_idx,
    v.id as vehicle_id,
    v.seq as veh_seq,
    v.created_at + interval '1 hour' as occurred_at,
    'entry' as expected_type,
    null::uuid as trip_id
  from _veh v
  union all
  select t.co_idx, t.vehicle_id, t.veh_seq, t.departure_at, 'exit', t.id from _trip t
  union all
  select t.co_idx, t.vehicle_id, t.veh_seq, t.return_at, 'entry', t.id from _trip t
  union all
  select o.co_idx, o.vehicle_id, o.seq, o.departure_at, 'exit', o.id from _open_trip o;

  create temporary table _mv on commit drop as
  select
    r.*,
    row_number() over (partition by r.vehicle_id order by r.occurred_at) as sequence_no,
    -- Local "casa" do veículo, determinístico.
    (select l.id from _loc l
      where l.co_idx = r.co_idx
        and l.seq = 1 + (r.veh_seq % (select n_locations from _co where idx = r.co_idx))
      limit 1) as location_id
  from _mv_raw r;

  -- Coerência da construção: paridade tem que casar com a semântica.
  select count(*) into v_count
  from _mv
  where (sequence_no % 2 = 1 and expected_type <> 'entry')
     or (sequence_no % 2 = 0 and expected_type <> 'exit');
  if v_count > 0 then
    raise exception 'SEED_INCONSISTENT: % movimentações com paridade divergente', v_count;
  end if;

  -- Leituras OCR confirmadas para as entradas recentes de parte da frota.
  create temporary table _ocr_read on commit drop as
  select
    m.co_idx,
    m.vehicle_id,
    m.sequence_no,
    private.stable_uuid('read:mv:' || m.vehicle_id::text || ':' || m.sequence_no) as read_id,
    m.occurred_at - interval '4 seconds' as captured_at,
    (select cm.id from _cam cm where cm.co_idx = m.co_idx and cm.loc_seq = 1 and cm.seq = 1 limit 1) as camera_id
  from _mv m
  where m.expected_type = 'entry'
    and m.occurred_at > v_now - interval '45 days'
    and m.veh_seq % 3 = 0;

  insert into public.plate_read_events (
    id, company_id, camera_id, captured_at, raw_text, normalized_plate, confidence,
    frame_hash, status, matched_vehicle_id, engine_version, contract_version,
    client_event_id, created_by, created_at, updated_at
  )
  select
    r.read_id, c.id, r.camera_id, r.captured_at,
    substr(v.plate, 1, 3) || '-' || substr(v.plate, 4), v.plate,
    round((0.88 + private.stable_random('conf:' || r.read_id::text) * 0.11)::numeric, 4),
    md5('frame:' || r.read_id::text), 'confirmed', r.vehicle_id,
    'demo-ocr-1.4.2', '1.0.0',
    'seed-' || r.read_id::text,
    u.id, r.captured_at, r.captured_at
  from _ocr_read r
  join _co c on c.idx = r.co_idx
  join public.vehicles v on v.id = r.vehicle_id
  left join lateral (select uu.id from _users uu where uu.co_idx = r.co_idx and uu.local_part = 'operador' limit 1) u on true;

  insert into public.vehicle_movements (
    id, company_id, vehicle_id, location_id, movement_type, sequence_no,
    occurred_at, source, plate_read_event_id, operator_user_id, created_at
  )
  select
    private.stable_uuid('mv:' || m.vehicle_id::text || ':' || m.sequence_no),
    c.id, m.vehicle_id, m.location_id,
    (case when m.sequence_no % 2 = 1 then 'entry' else 'exit' end)::public.movement_type,
    m.sequence_no, m.occurred_at,
    (case when r.read_id is null then 'manual' else 'ocr' end)::public.movement_source,
    r.read_id,
    u.id,
    m.occurred_at
  from _mv m
  join _co c on c.idx = m.co_idx
  left join _ocr_read r on r.vehicle_id = m.vehicle_id and r.sequence_no = m.sequence_no
  left join lateral (select uu.id from _users uu where uu.co_idx = m.co_idx and uu.local_part = 'operador' limit 1) u on true;

  -- ===========================================================================
  -- 14. Leituras OCR que NÃO geram movimentação
  -- ===========================================================================
  -- desconhecida: placa fora da frota
  insert into public.plate_read_events (
    id, company_id, camera_id, captured_at, raw_text, normalized_plate, confidence,
    frame_hash, status, matched_vehicle_id, rejection_reason,
    engine_version, contract_version, client_event_id, created_at, updated_at
  )
  select
    private.stable_uuid('read:unknown:' || c.slug || ':' || s.i),
    c.id,
    (select cm.id from _cam cm where cm.co_idx = c.idx and cm.loc_seq = 1 and cm.seq = 1 limit 1),
    v_now - make_interval(days => s.i, hours => 3),
    'ZZ' || s.i::text || 'Q' || (10 + s.i)::text,
    'ZZZ' || s.i::text || 'Q' || lpad((10 + s.i)::text, 2, '0'),
    round((0.90 + s.i * 0.01)::numeric, 4),
    md5('frame:unknown:' || c.slug || ':' || s.i),
    'unknown_plate', null,
    'placa não pertence à frota',
    'demo-ocr-1.4.2', '1.0.0',
    'seed-unknown-' || c.slug || '-' || s.i,
    v_now - make_interval(days => s.i, hours => 3), v_now - make_interval(days => s.i, hours => 3)
  from _co c cross join generate_series(1, 3) s(i);

  -- baixa confiança
  insert into public.plate_read_events (
    id, company_id, camera_id, captured_at, raw_text, normalized_plate, confidence,
    frame_hash, status, rejection_reason, engine_version, contract_version,
    client_event_id, created_at, updated_at
  )
  select
    private.stable_uuid('read:lowconf:' || c.slug || ':' || s.i),
    c.id,
    (select cm.id from _cam cm where cm.co_idx = c.idx and cm.loc_seq = 1 and cm.seq = 1 limit 1),
    v_now - make_interval(days => s.i, hours => 7),
    lower(substr(v.plate, 1, 2)) || '?' || substr(v.plate, 4),
    private.normalize_plate(substr(v.plate, 1, 2) || 'X' || substr(v.plate, 4)),
    round((0.41 + s.i * 0.09)::numeric, 4),
    md5('frame:lowconf:' || c.slug || ':' || s.i),
    'low_confidence', 'confiança abaixo do limiar de 0.80',
    'demo-ocr-1.4.2', '1.0.0',
    'seed-lowconf-' || c.slug || '-' || s.i,
    v_now - make_interval(days => s.i, hours => 7), v_now - make_interval(days => s.i, hours => 7)
  from _co c
  cross join generate_series(1, 3) s(i)
  cross join lateral (
    select vv.plate from public.vehicles vv where vv.company_id = c.id order by vv.plate limit 1
  ) v;

  -- duplicada: aponta para uma leitura confirmada existente
  insert into public.plate_read_events (
    id, company_id, camera_id, captured_at, raw_text, normalized_plate, confidence,
    frame_hash, status, matched_vehicle_id, duplicate_of_id, rejection_reason,
    engine_version, contract_version, client_event_id, created_at, updated_at
  )
  select
    private.stable_uuid('read:dup:' || src.id::text),
    src.company_id, src.camera_id, src.captured_at + interval '11 seconds',
    src.raw_text, src.normalized_plate, src.confidence,
    md5('frame:dup:' || src.id::text),
    'duplicate', src.matched_vehicle_id, src.id,
    'leitura repetida dentro da janela de deduplicação',
    src.engine_version, src.contract_version,
    'seed-dup-' || src.id::text,
    src.captured_at + interval '11 seconds', src.captured_at + interval '11 seconds'
  from (
    select distinct on (e.company_id) e.*
    from public.plate_read_events e
    where e.status = 'confirmed'
    order by e.company_id, e.captured_at desc
  ) src;

  -- erro do motor
  insert into public.plate_read_events (
    id, company_id, camera_id, captured_at, raw_text, confidence, status,
    rejection_reason, engine_version, contract_version, client_event_id,
    created_at, updated_at
  )
  select
    private.stable_uuid('read:error:' || c.slug),
    c.id,
    (select cm.id from _cam cm where cm.co_idx = c.idx and cm.loc_seq = 1 and cm.seq = 1 limit 1),
    v_now - interval '2 days', '???', 0,
    'error', 'timeout do worker OCR',
    'demo-ocr-1.4.2', '1.0.0', 'seed-error-' || c.slug,
    v_now - interval '2 days', v_now - interval '2 days'
  from _co c;

  -- ===========================================================================
  -- 15. Veículos inativos e arquivados (ADR-005)
  -- ===========================================================================
  -- Arquivamento preserva todo o histórico: viagens, abastecimentos, ledger e
  -- movimentações do veículo continuam consultáveis.
  update public.vehicles v
     set status = 'inactive'
   where v.id in (select id from _veh where seq % 19 = 9)
     and v.status = 'available';

  update public.vehicles v
     set status = 'archived',
         archived_at = v_now - interval '10 days',
         archived_by = (select uu.id from _users uu
                        join _veh vv on vv.id = v.id
                        where uu.co_idx = vv.co_idx and uu.local_part = 'admin' limit 1)
   where v.id in (
     select vv.id from _veh vv
     where vv.seq = 14
       and not exists (
         select 1 from public.trips t
         where t.vehicle_id = vv.id and t.status in ('planned', 'in_progress')
       )
       and not exists (
         select 1 from public.maintenance_records m
         where m.vehicle_id = vv.id and m.status in ('scheduled', 'in_progress')
       )
   );

  -- ===========================================================================
  -- 16. Operações reais pelas RPCs transacionais
  -- ===========================================================================
  -- Este bloco NÃO é enfeite: ele exercita as RPCs a cada `supabase db reset`.
  -- Se qualquer garantia transacional quebrar, o reset falha imediatamente, em
  -- vez de a falha aparecer só nos testes. Também é o que produz eventos de
  -- auditoria com ação "execute" e com AUTOR real.
  --
  -- A troca de papel não é necessária: as RPCs são SECURITY DEFINER e resolvem
  -- a identidade pelo claim JWT, que é definido aqui por transação.
  for v_company in
    select c.idx, c.id, c.slug,
           (select u.id from _users u where u.co_idx = c.idx and u.local_part = 'admin') as admin_id
    from _co c order by c.idx
  loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_company.admin_id, 'role', 'authenticated')::text,
      true
    );

    -- Ajuste manual de odômetro auditado (evento compensatório do ADR-006).
    perform public.register_odometer_reading(
      p_vehicle_id  => private.stable_uuid('vehicle:' || v_company.slug || ':2'),
      p_odometer_km => (select current_odometer_km + 12
                        from public.vehicles
                        where id = private.stable_uuid('vehicle:' || v_company.slug || ':2')),
      p_reason      => 'ajuste após conferência física do painel'
    );

    -- Abastecimento pela RPC (prova que total e ledger saem consistentes).
    perform public.register_fueling(
      p_vehicle_id      => private.stable_uuid('vehicle:' || v_company.slug || ':1'),
      p_liters          => 47.318,
      p_price_per_liter => 6.099,
      p_odometer_km     => (select current_odometer_km + 63
                            from public.vehicles
                            where id = private.stable_uuid('vehicle:' || v_company.slug || ':1')),
      p_fuel_type       => 'gasoline',
      p_station_name    => 'Posto Rota 1',
      p_full_tank       => true
    );
  end loop;

  perform set_config('request.jwt.claims', '', true);

  -- ===========================================================================
  -- 17. Relatório do seed
  -- ===========================================================================
  raise notice 'PegaNaFrota seed concluído:';
  raise notice '  empresas ............ %', (select count(*) from public.companies);
  raise notice '  usuários ............ %', (select count(*) from public.profiles);
  raise notice '  veículos ............ %', (select count(*) from public.vehicles);
  raise notice '  motoristas .......... %', (select count(*) from public.drivers);
  raise notice '  locais / câmeras .... % / %', (select count(*) from public.locations),
                                               (select count(*) from public.cameras);
  raise notice '  viagens ............. %', (select count(*) from public.trips);
  raise notice '  abastecimentos ...... %', (select count(*) from public.fuelings);
  raise notice '  manutenções ......... %', (select count(*) from public.maintenance_records);
  raise notice '  eventos de odômetro . %', (select count(*) from public.vehicle_odometer_events);
  raise notice '  movimentações ....... %', (select count(*) from public.vehicle_movements);
  raise notice '  leituras de placa ... %', (select count(*) from public.plate_read_events);
  raise notice '  eventos de auditoria  %', (select count(*) from audit.events);
end
$seed$;
