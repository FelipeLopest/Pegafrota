-- =============================================================================
-- PegaNaFrota — 001100 — Grants mínimos
-- =============================================================================
-- A fronteira de segurança tem duas camadas independentes:
--   1. GRANT  — define QUAIS verbos SQL o papel pode sequer tentar.
--   2. RLS    — define QUAIS linhas ele alcança dentro desses verbos.
--
-- Tabelas cuja escrita é transacional (odômetro, abastecimento, movimentação,
-- leitura de placa) simplesmente não recebem INSERT. Nenhum bug de policy pode
-- abrir esse caminho, porque o verbo não existe para o papel.
--
-- Referência: SECURITY_MODEL.md §5.2, DEFINITION_OF_DONE.md "Banco"
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Zerar a superfície
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated;

revoke all on all tables    in schema private from anon, authenticated, service_role;
revoke all on all functions in schema private from anon, authenticated, service_role, public;

revoke all on all tables    in schema audit from anon, authenticated;
revoke all on all functions in schema audit from anon, authenticated, public;

-- anon (sem sessão) não enxerga absolutamente nada do domínio.
revoke usage on schema private from anon;
revoke usage on schema audit   from anon;

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
grant usage on schema public  to anon, authenticated, service_role;

-- authenticated precisa de USAGE em private apenas para conseguir EXECUTAR os
-- helpers de identidade citados nas policies. Nenhuma TABELA de private é
-- concedida, então o catálogo de permissões continua inacessível.
grant usage on schema private to authenticated, service_role;
grant usage on schema audit   to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers de identidade chamados pelas policies e pelas views
-- ---------------------------------------------------------------------------
grant execute on function private.current_user_id()            to authenticated, service_role;
grant execute on function private.current_user_company_id()    to authenticated, service_role;
grant execute on function private.current_user_role()          to authenticated, service_role;
grant execute on function private.current_membership()         to authenticated, service_role;
grant execute on function private.current_permissions()        to authenticated, service_role;
grant execute on function private.is_active_member()           to authenticated, service_role;
grant execute on function private.has_permission(text)         to authenticated, service_role;
grant execute on function private.user_belongs_to_current_company(uuid)
  to authenticated, service_role;

-- Funções puras usadas por check constraints e pela UI (normalização).
grant execute on function private.normalize_plate(text)  to authenticated, service_role;
grant execute on function private.normalize_digits(text) to authenticated, service_role;
grant execute on function private.normalize_label(text)  to authenticated, service_role;
grant execute on function private.is_valid_cnpj(text)    to authenticated, service_role;
grant execute on function private.is_api_role()          to authenticated, service_role;
grant execute on function private.request_id()           to authenticated, service_role;
grant execute on function private.fuel_is_compatible(public.fuel_type, public.fuel_type)
  to authenticated, service_role;

-- Tudo o mais em private permanece revogado: log_audit_event, assert_*,
-- stable_uuid, funções de trigger e as tabelas do catálogo de permissões.

-- ---------------------------------------------------------------------------
-- Tabelas: leitura
-- ---------------------------------------------------------------------------
grant select on
  public.companies,
  public.profiles,
  public.company_memberships,
  public.drivers,
  public.vehicles,
  public.vehicle_odometer_events,
  public.trips,
  public.fuelings,
  public.maintenance_records,
  public.locations,
  public.cameras,
  public.plate_read_events,
  public.vehicle_movements
to authenticated;

grant select on audit.events to authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas: escrita direta permitida (sempre sob RLS)
-- ---------------------------------------------------------------------------
grant update on public.companies              to authenticated;
grant update on public.profiles               to authenticated;
grant insert, update, delete on public.company_memberships to authenticated;
grant insert, update on public.drivers        to authenticated;
grant insert, update on public.vehicles       to authenticated;
grant insert, update on public.trips          to authenticated;
grant update on public.fuelings               to authenticated;
grant insert, update on public.maintenance_records to authenticated;
grant insert, update, delete on public.locations to authenticated;
grant insert, update, delete on public.cameras   to authenticated;

-- ---------------------------------------------------------------------------
-- Tabelas SEM escrita direta em nenhuma hipótese
-- ---------------------------------------------------------------------------
--   public.vehicle_odometer_events  -> public.register_odometer_reading e RPCs internas
--   public.vehicle_movements        -> public.register_vehicle_movement
--   public.plate_read_events        -> public.register_plate_read
--   public.fuelings (INSERT)        -> public.register_fueling
--   audit.events                    -> private.log_audit_event
-- Nada a conceder: a ausência do grant é a garantia.

-- ---------------------------------------------------------------------------
-- Default privileges para objetos futuros
-- ---------------------------------------------------------------------------
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on functions from anon, authenticated, public;
alter default privileges in schema private
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema private
  revoke all on functions from anon, authenticated, service_role, public;
alter default privileges in schema audit
  revoke all on tables from anon, authenticated;

comment on schema public is
  'API do PegaNaFrota. Toda tabela possui RLS. Escritas transacionais só por RPC.';
