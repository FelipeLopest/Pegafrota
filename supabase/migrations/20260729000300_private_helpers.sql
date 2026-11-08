-- =============================================================================
-- PegaNaFrota — 000300 — Helpers privados
-- =============================================================================
-- Todas as funções deste arquivo:
--   - vivem no schema private (nunca expostas pelo PostgREST);
--   - têm search_path fixo e vazio, com todos os objetos qualificados;
--   - têm EXECUTE revogado de PUBLIC (grants mínimos na migration 001100).
--
-- Referências: SECURITY_MODEL.md §5.2, DATABASE_BLUEPRINT.md §4
-- =============================================================================

-- =============================================================================
-- 1. Normalização e validação (funções puras / IMMUTABLE)
-- =============================================================================

create or replace function private.normalize_digits(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '');
$$;
comment on function private.normalize_digits(text) is 'Mantém apenas dígitos. Base da normalização de CNPJ e telefone.';

create or replace function private.normalize_plate(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g'), '');
$$;
comment on function private.normalize_plate(text) is
  'Placa em caixa alta, sem hífen, espaço ou pontuação. Guarantee: placa única e normalizada.';

create or replace function private.normalize_label(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')), '');
$$;
comment on function private.normalize_label(text) is 'Colapsa espaços internos e remove espaços nas bordas.';

-- Validação completa de CNPJ, incluindo os dois dígitos verificadores (módulo 11).
create or replace function private.is_valid_cnpj(p_value text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_digits text;
  v_sum    integer;
  v_weight integer;
  v_dv1    integer;
  v_dv2    integer;
  i        integer;
begin
  v_digits := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');

  if length(v_digits) <> 14 then
    return false;
  end if;

  -- Sequências repetidas (00000000000000, 11111111111111, ...) são inválidas.
  if v_digits ~ '^(\d)\1{13}$' then
    return false;
  end if;

  -- Primeiro dígito verificador: pesos 5..2 e 9..2.
  v_sum := 0;
  v_weight := 5;
  for i in 1 .. 12 loop
    v_sum := v_sum + (substr(v_digits, i, 1))::integer * v_weight;
    v_weight := case when v_weight = 2 then 9 else v_weight - 1 end;
  end loop;
  v_dv1 := 11 - (v_sum % 11);
  if v_dv1 >= 10 then
    v_dv1 := 0;
  end if;

  if v_dv1 <> (substr(v_digits, 13, 1))::integer then
    return false;
  end if;

  -- Segundo dígito verificador: pesos 6..2 e 9..2.
  v_sum := 0;
  v_weight := 6;
  for i in 1 .. 13 loop
    v_sum := v_sum + (substr(v_digits, i, 1))::integer * v_weight;
    v_weight := case when v_weight = 2 then 9 else v_weight - 1 end;
  end loop;
  v_dv2 := 11 - (v_sum % 11);
  if v_dv2 >= 10 then
    v_dv2 := 0;
  end if;

  return v_dv2 = (substr(v_digits, 14, 1))::integer;
end;
$$;
comment on function private.is_valid_cnpj(text) is
  'Valida CNPJ por módulo 11. Usada em check constraint de companies.';

-- Compatibilidade entre o combustível do veículo e o combustível abastecido.
-- Política aprovada (DATABASE_BLUEPRINT.md §3.8 "combustível coerente").
create or replace function private.fuel_is_compatible(
  p_vehicle_fuel public.fuel_type,
  p_fueling_fuel public.fuel_type
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_vehicle_fuel
    when 'flex'        then p_fueling_fuel in ('gasoline', 'ethanol', 'flex', 'cng')
    when 'gasoline'    then p_fueling_fuel in ('gasoline', 'cng')
    when 'ethanol'     then p_fueling_fuel in ('ethanol')
    when 'diesel_s10'  then p_fueling_fuel in ('diesel_s10', 'diesel_s500')
    when 'diesel_s500' then p_fueling_fuel in ('diesel_s10', 'diesel_s500')
    when 'cng'         then p_fueling_fuel in ('cng', 'gasoline')
    when 'electric'    then false
    else false
  end;
$$;
comment on function private.fuel_is_compatible(public.fuel_type, public.fuel_type) is
  'Veículo elétrico não aceita abastecimento. Flex aceita gasolina, etanol e GNV.';

-- UUID determinístico derivado de uma semente textual (formato v5-like).
-- Usada pelo seed e pelos testes para gerar IDs previsíveis (TEST_STRATEGY.md §3).
create or replace function private.stable_uuid(p_seed text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (
      substr(h, 1, 8) || '-' ||
      substr(h, 9, 4) || '-5' ||
      substr(h, 14, 3) || '-' ||
      lpad(to_hex((( ('x' || substr(h, 17, 2))::bit(8)::integer & 63) | 128)), 2, '0') ||
      substr(h, 19, 2) || '-' ||
      substr(h, 21, 12)
    )::uuid
  from (select md5(coalesce(p_seed, '')) as h) s;
$$;
comment on function private.stable_uuid(text) is 'UUID determinístico para seed e fixtures.';

-- Pseudo-aleatório determinístico em [0,1). Usado pelo seed.
create or replace function private.stable_random(p_seed text)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (('x' || substr(md5(coalesce(p_seed, '')), 1, 8))::bit(32)::bigint & 2147483647)::numeric
         / 2147483647::numeric;
$$;

-- =============================================================================
-- 2. Catálogo de permissões
-- =============================================================================
-- A matriz de PERMISSIONS_MATRIX.md é materializada em tabela (opção prevista em
-- DATABASE_BLUEPRINT.md §10) para que possa ser testada, auditada e consultada
-- pela UI sem duplicar regra em JavaScript.

create table private.permissions (
  code        text primary key,
  description text not null,
  created_at  timestamptz not null default now()
);
comment on table private.permissions is 'Catálogo de permissões atômicas.';

create table private.role_permissions (
  role            public.membership_role not null,
  permission_code text not null references private.permissions (code) on delete restrict,
  primary key (role, permission_code)
);
comment on table private.role_permissions is
  'Matriz papel x permissão. Fonte única de verdade para PERMISSIONS_MATRIX.md.';

insert into private.permissions (code, description) values
  ('company.read',         'Ver dados da empresa'),
  ('company.update',       'Editar dados da empresa'),
  ('users.read',           'Ver usuários e vínculos da empresa'),
  ('users.manage',         'Criar, alterar papel e desativar usuários'),
  ('drivers.read',         'Ver motoristas'),
  ('drivers.write',        'Criar e editar motoristas'),
  ('drivers.archive',      'Arquivar motoristas'),
  ('vehicles.read',        'Ver veículos'),
  ('vehicles.write',       'Criar e editar veículos'),
  ('vehicles.archive',     'Arquivar e desarquivar veículos'),
  ('odometer.read',        'Ver ledger de odômetro'),
  ('odometer.adjust',      'Registrar ajuste manual de odômetro'),
  ('trips.read',           'Ver viagens'),
  ('trips.write',          'Criar, iniciar e concluir viagens'),
  ('trips.cancel',         'Cancelar viagens'),
  ('fuelings.read',        'Ver abastecimentos'),
  ('fuelings.write',       'Registrar abastecimentos'),
  ('maintenance.read',     'Ver manutenções'),
  ('maintenance.write',    'Registrar e concluir manutenções'),
  ('maintenance.schedule', 'Agendar manutenções futuras'),
  ('locations.read',       'Ver locais'),
  ('locations.write',      'Criar e editar locais'),
  ('cameras.read',         'Ver câmeras'),
  ('cameras.write',        'Criar e editar câmeras'),
  ('movements.read',       'Ver movimentações de entrada e saída'),
  ('movements.write',      'Registrar movimentação'),
  ('ocr.read',             'Ver leituras de placa'),
  ('ocr.operate',          'Operar câmera e registrar leitura de placa'),
  ('dashboard.read',       'Ver dashboard'),
  ('reports.read',         'Gerar relatórios'),
  ('reports.export',       'Exportar relatórios'),
  ('audit.read',           'Ver auditoria');

-- company_admin: todas as permissões.
insert into private.role_permissions (role, permission_code)
select 'company_admin'::public.membership_role, code from private.permissions;

-- fleet_manager: toda a operação, sem gestão crítica da empresa.
insert into private.role_permissions (role, permission_code)
select 'fleet_manager'::public.membership_role, code
from private.permissions
where code not in ('company.update', 'users.manage');

-- operator: registros operacionais e OCR, sem cadastro estrutural nem exportação.
insert into private.role_permissions (role, permission_code)
values
  ('operator', 'company.read'),
  ('operator', 'drivers.read'),
  ('operator', 'vehicles.read'),
  ('operator', 'odometer.read'),
  ('operator', 'trips.read'),
  ('operator', 'trips.write'),
  ('operator', 'fuelings.read'),
  ('operator', 'fuelings.write'),
  ('operator', 'maintenance.read'),
  ('operator', 'maintenance.write'),
  ('operator', 'locations.read'),
  ('operator', 'cameras.read'),
  ('operator', 'movements.read'),
  ('operator', 'movements.write'),
  ('operator', 'ocr.read'),
  ('operator', 'ocr.operate'),
  ('operator', 'dashboard.read'),
  ('operator', 'reports.read');

-- viewer: somente consulta.
insert into private.role_permissions (role, permission_code)
values
  ('viewer', 'company.read'),
  ('viewer', 'drivers.read'),
  ('viewer', 'vehicles.read'),
  ('viewer', 'odometer.read'),
  ('viewer', 'trips.read'),
  ('viewer', 'fuelings.read'),
  ('viewer', 'maintenance.read'),
  ('viewer', 'locations.read'),
  ('viewer', 'cameras.read'),
  ('viewer', 'movements.read'),
  ('viewer', 'ocr.read'),
  ('viewer', 'dashboard.read'),
  ('viewer', 'reports.read');

-- =============================================================================
-- 3. Contexto de execução
-- =============================================================================
-- Vários triggers precisam distinguir "escrita direta na tabela feita pelo
-- cliente" de "escrita feita de dentro de uma RPC transacional autorizada".
--
-- A distinção NÃO usa GUC (falsificável em tese) e sim o papel efetivo:
--   - chamada direta via PostgREST  -> current_user = anon | authenticated | service_role
--   - dentro de uma RPC SECURITY DEFINER -> current_user = dono da função (postgres)
--
-- Esta função é obrigatoriamente SECURITY INVOKER: precisa enxergar o papel do
-- chamador, não o do dono.

create or replace function private.is_api_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user::text in ('anon', 'authenticated', 'service_role');
$$;
comment on function private.is_api_role() is
  'True quando a instrução veio diretamente de um papel de API. SECURITY INVOKER por definição.';

create or replace function private.request_id()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(coalesce(pg_catalog.current_setting('peganafrota.request_id', true), ''), '');
$$;
