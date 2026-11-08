-- =============================================================================
-- 01_constraints — CNPJ, placa, valores monetários, cronologia, unicidade
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- Helpers: executam SQL em subtransação e devolvem se falhou / qual SQLSTATE.
create function pg_temp.raises(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

create function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  return sqlstate;
end $$;

-- ---------------------------------------------------------------------------
-- CNPJ
-- ---------------------------------------------------------------------------
select ok(private.is_valid_cnpj('11222333000181') is not null, 'validador de CNPJ responde');
select ok(not private.is_valid_cnpj('11111111111111'), 'CNPJ com dígitos repetidos é inválido');
select ok(not private.is_valid_cnpj('1122233300018'),  'CNPJ com 13 dígitos é inválido');
select ok(not private.is_valid_cnpj('11222333000199'), 'CNPJ com DV errado é inválido');
select ok(private.is_valid_cnpj((select cnpj from public.companies limit 1)),
          'CNPJ do seed passa no módulo 11');

select ok(
  pg_temp.raises($$
    insert into public.companies (legal_name, trade_name, cnpj)
    values ('Empresa Teste LTDA', 'Teste', '11222333000199')
  $$),
  'CNPJ com dígito verificador inválido é recusado'
);

-- Unicidade global do CNPJ
select is(
  pg_temp.err(format($$
    insert into public.companies (legal_name, trade_name, cnpj)
    values ('Clone LTDA', 'Clone', %L)
  $$, (select cnpj from public.companies order by cnpj limit 1))),
  '23505',
  'CNPJ duplicado viola unique constraint'
);

-- Normalização: CNPJ enviado com pontuação é gravado apenas com dígitos
select lives_ok($$
  insert into public.companies (legal_name, trade_name, cnpj)
  values ('Normaliza LTDA', 'Normaliza', '55.666.777/0001-81')
$$, 'CNPJ com máscara é aceito');

select is(
  (select cnpj from public.companies where trade_name = 'Normaliza'),
  '55666777000181',
  'CNPJ é normalizado para 14 dígitos'
);

-- ---------------------------------------------------------------------------
-- Placa
-- ---------------------------------------------------------------------------
select is(private.normalize_plate(' abc-1d23 '), 'ABC1D23', 'placa normalizada: upper, sem hífen nem espaço');
select is(private.normalize_plate('xyz9876'),    'XYZ9876', 'placa antiga normalizada');

select ok(
  pg_temp.raises(format($$
    insert into public.vehicles (company_id, plate, brand, model, fuel_type)
    values (%L, 'ABCD123', 'Marca', 'Modelo', 'flex')
  $$, (select id from public.companies order by cnpj limit 1))),
  'placa fora dos padrões nacional/Mercosul é recusada'
);

select is(
  pg_temp.err(format($$
    insert into public.vehicles (company_id, plate, brand, model, fuel_type)
    values (%L, %L, 'Marca', 'Modelo', 'flex')
  $$, (select id from public.companies order by cnpj limit 1),
      (select plate from public.vehicles order by plate limit 1))),
  '23505',
  'placa duplicada é recusada (unicidade global)'
);

-- Placa duplicada mesmo em OUTRA empresa
select is(
  pg_temp.err(format($$
    insert into public.vehicles (company_id, plate, brand, model, fuel_type)
    values (%L, %L, 'Marca', 'Modelo', 'flex')
  $$, private.stable_uuid('company:camponovo'),
      (select plate from public.vehicles v
       where v.company_id = private.stable_uuid('company:auroraverde') order by plate limit 1))),
  '23505',
  'placa de uma empresa não pode ser reaproveitada por outra'
);

-- Normalização na gravação
select lives_ok(format($$
  insert into public.vehicles (company_id, plate, brand, model, fuel_type)
  values (%L, ' qqq-1z11 ', ' Marca  Teste ', 'Modelo', 'flex')
$$, private.stable_uuid('company:auroraverde')), 'placa com máscara é aceita');

select is(
  (select plate from public.vehicles where brand = 'Marca Teste'),
  'QQQ1Z11', 'placa é gravada normalizada'
);
select is(
  (select brand from public.vehicles where plate = 'QQQ1Z11'),
  'Marca Teste', 'espaços internos são colapsados'
);

-- ---------------------------------------------------------------------------
-- Abastecimento: total exato
-- ---------------------------------------------------------------------------
select ok(
  pg_temp.raises(format($$
    insert into public.fuelings (company_id, vehicle_id, fueled_at, fuel_type,
                                liters, price_per_liter, total_amount, odometer_km)
    values (%L, %L, now(), 'gasoline', 40.000, 6.000, 999.99, 100000)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'total divergente de litros x preço é recusado pela check constraint'
);

select is(
  (select count(*) from public.fuelings
   where total_amount <> round(liters * price_per_liter, 2)),
  0::bigint,
  'nenhum abastecimento do seed tem total divergente'
);

select ok(
  pg_temp.raises(format($$
    insert into public.fuelings (company_id, vehicle_id, fueled_at, fuel_type,
                                liters, price_per_liter, total_amount, odometer_km)
    values (%L, %L, now(), 'gasoline', 0, 6.000, 0, 100000)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'litros igual a zero é recusado pelo domain liters'
);

-- Combustível incoerente
select ok(
  pg_temp.raises(format($$
    insert into public.fuelings (company_id, vehicle_id, fueled_at, fuel_type,
                                liters, price_per_liter, total_amount, odometer_km)
    values (%L, %L, now(), 'diesel_s10', 40, 6, 240.00, 100000)
  $$, private.stable_uuid('company:auroraverde'),
      (select id from public.vehicles where fuel_type = 'flex'
        and company_id = private.stable_uuid('company:auroraverde') limit 1))),
  'veículo flex não aceita diesel'
);

select ok(
  pg_temp.raises(format($$
    insert into public.fuelings (company_id, vehicle_id, fueled_at, fuel_type,
                                liters, price_per_liter, total_amount, odometer_km)
    values (%L, %L, now(), 'gasoline', 40, 6, 240.00, 100000)
  $$, private.stable_uuid('company:auroraverde'),
      (select id from public.vehicles where fuel_type = 'electric'
        and company_id = private.stable_uuid('company:auroraverde') limit 1))),
  'veículo elétrico não aceita abastecimento'
);

-- ---------------------------------------------------------------------------
-- Manutenção
-- ---------------------------------------------------------------------------
select ok(
  pg_temp.raises(format($$
    insert into public.maintenance_records (company_id, vehicle_id, maintenance_type,
      status, description, completed_at, total_cost)
    values (%L, %L, 'preventive', 'completed', 'Teste', now(), 0)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'manutenção concluída com custo zero é recusada'
);

select ok(
  pg_temp.raises(format($$
    insert into public.maintenance_records (company_id, vehicle_id, maintenance_type,
      status, description, completed_at, total_cost)
    values (%L, %L, 'preventive', 'completed', 'Teste', now(), -50)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'manutenção com custo negativo é recusada'
);

select ok(
  pg_temp.raises(format($$
    insert into public.maintenance_records (company_id, vehicle_id, maintenance_type,
      status, description, scheduled_for)
    values (%L, %L, 'preventive', 'scheduled', 'Teste', null)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'manutenção agendada exige data prevista'
);

-- Data futura só é permitida em agendamento
select lives_ok(format($$
  insert into public.maintenance_records (company_id, vehicle_id, maintenance_type,
    status, description, scheduled_for)
  values (%L, %L, 'preventive', 'scheduled', 'Agendamento futuro', now() + interval '30 days')
$$, private.stable_uuid('company:auroraverde'),
    private.stable_uuid('vehicle:auroraverde:1')),
  'data futura é aceita em manutenção agendada');

select ok(
  pg_temp.raises(format($$
    insert into public.maintenance_records (company_id, vehicle_id, maintenance_type,
      status, description, started_at, completed_at, total_cost)
    values (%L, %L, 'corrective', 'completed', 'Conclusão no futuro',
            now(), now() + interval '10 days', 500)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'data de conclusão no futuro é recusada'
);

select is(
  (select count(*) from public.maintenance_records where status = 'completed' and coalesce(total_cost,0) <= 0),
  0::bigint, 'nenhuma manutenção concluída do seed sem custo positivo'
);

-- ---------------------------------------------------------------------------
-- Viagem: cronologia e quilometragem
-- ---------------------------------------------------------------------------
select ok(
  pg_temp.raises(format($$
    insert into public.trips (company_id, vehicle_id, status, origin_label, destination_label,
      actual_departure_at, actual_return_at, start_odometer_km, end_odometer_km)
    values (%L, %L, 'completed', 'A', 'B',
            now() - interval '1 hour', now() - interval '5 hours', 1000, 1100)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'retorno antes da saída é recusado'
);

select ok(
  pg_temp.raises(format($$
    insert into public.trips (company_id, vehicle_id, status, origin_label, destination_label,
      actual_departure_at, actual_return_at, start_odometer_km, end_odometer_km)
    values (%L, %L, 'completed', 'A', 'B',
            now() - interval '5 hours', now(), 1000, 1000)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('vehicle:auroraverde:1'))),
  'quilometragem final igual à inicial é recusada'
);

select is(
  (select count(*) from public.trips
   where status = 'completed' and end_odometer_km <= start_odometer_km),
  0::bigint, 'nenhuma viagem concluída do seed sem progressão de km'
);

select is(
  (select count(*) from public.trips
   where actual_return_at is not null and actual_departure_at is not null
     and actual_return_at < actual_departure_at),
  0::bigint, 'nenhuma viagem do seed com retorno antes da saída'
);

-- ---------------------------------------------------------------------------
-- Câmera: settings sem credenciais
-- ---------------------------------------------------------------------------
select ok(
  pg_temp.raises(format($$
    insert into public.cameras (company_id, location_id, name, local_identifier, settings)
    values (%L, %L, 'Cam Teste', 'cam-teste', '{"password":"1234"}'::jsonb)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('location:auroraverde:1'))),
  'settings de câmera com senha é recusado'
);

select ok(
  pg_temp.raises(format($$
    insert into public.cameras (company_id, location_id, name, local_identifier, settings)
    values (%L, %L, 'Cam Teste 2', 'cam-teste-2', '{"rtsp_url":"rtsp://x"}'::jsonb)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('location:auroraverde:1'))),
  'settings de câmera com URL RTSP é recusado'
);

-- ---------------------------------------------------------------------------
-- Membership: um usuário, uma empresa ativa (ADR-004)
-- ---------------------------------------------------------------------------
select is(
  pg_temp.err(format($$
    insert into public.company_memberships (company_id, user_id, role, active)
    values (%L, %L, 'viewer', true)
  $$, private.stable_uuid('company:camponovo'),
      private.stable_uuid('user:auroraverde:admin'))),
  '23505',
  'segunda membership ativa para o mesmo usuário é recusada'
);

select is(
  pg_temp.err(format($$
    insert into public.company_memberships (company_id, user_id, role, active)
    values (%L, %L, 'viewer', true)
  $$, private.stable_uuid('company:auroraverde'),
      private.stable_uuid('user:auroraverde:admin'))),
  '23505',
  'par empresa/usuário duplicado é recusado'
);

-- Vínculo inativo em outra empresa é permitido (preserva evolução futura)
select lives_ok(format($$
  insert into public.company_memberships (company_id, user_id, role, active)
  values (%L, %L, 'viewer', false)
$$, private.stable_uuid('company:camponovo'),
    private.stable_uuid('user:auroraverde:admin')),
  'membership inativa em outra empresa é aceita');

-- ---------------------------------------------------------------------------
-- Última conta administrativa protegida
-- ---------------------------------------------------------------------------
select ok(
  pg_temp.raises(format($$
    update public.company_memberships set active = false
    where company_id = %L and role = 'company_admin'
  $$, private.stable_uuid('company:auroraverde'))),
  'desativar o último company_admin é recusado'
);

select ok(
  pg_temp.raises(format($$
    delete from public.company_memberships
    where company_id = %L and role = 'company_admin'
  $$, private.stable_uuid('company:auroraverde'))),
  'remover o último company_admin é recusado'
);

-- Empresa 4 possui dois admins: desativar um é permitido
select lives_ok(format($$
  update public.company_memberships set active = false
  where user_id = %L
$$, private.stable_uuid('user:camponovo:admin2')),
  'com dois admins ativos, desativar um é permitido');

select * from finish();
rollback;
