-- =============================================================================
-- PegaNaFrota — 001000 — Row Level Security
-- =============================================================================
-- Princípios (SECURITY_MODEL.md §5, DATABASE_BLUEPRINT.md §5):
--   1. Toda tabela exposta tem RLS habilitada.
--   2. Policies separadas por operação (SELECT/INSERT/UPDATE/DELETE).
--   3. Nenhuma policy confia no company_id enviado pelo cliente: a empresa é
--      sempre resolvida no servidor por private.current_user_company_id().
--   4. Perfil E membership precisam estar ativos (a função retorna NULL caso
--      contrário, e "company_id = NULL" nunca é verdadeiro).
--   5. Chamadas a helpers são embrulhadas em (select ...) para virarem InitPlan
--      e serem avaliadas uma vez por consulta, não uma vez por linha.
--   6. DELETE é negado por ausência de policy em toda tabela histórica.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper auxiliar: o usuário-alvo pertence à empresa ativa do chamador?
-- SECURITY DEFINER para não recursar na policy de company_memberships.
-- ---------------------------------------------------------------------------
create or replace function private.user_belongs_to_current_company(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.user_id = p_user_id
      and m.company_id = private.current_user_company_id()
  );
$$;

alter table public.companies              enable row level security;
alter table public.profiles               enable row level security;
alter table public.company_memberships    enable row level security;
alter table public.drivers                enable row level security;
alter table public.vehicles               enable row level security;
alter table public.vehicle_odometer_events enable row level security;
alter table public.trips                  enable row level security;
alter table public.fuelings               enable row level security;
alter table public.maintenance_records    enable row level security;
alter table public.locations              enable row level security;
alter table public.cameras                enable row level security;
alter table public.plate_read_events      enable row level security;
alter table public.vehicle_movements      enable row level security;
alter table audit.events                  enable row level security;

-- =============================================================================
-- companies
-- =============================================================================
create policy companies_select on public.companies
  for select to authenticated
  using (
    id = (select private.current_user_company_id())
    and (select private.has_permission('company.read'))
  );

create policy companies_update on public.companies
  for update to authenticated
  using (
    id = (select private.current_user_company_id())
    and (select private.has_permission('company.update'))
  )
  with check (
    id = (select private.current_user_company_id())
    and (select private.has_permission('company.update'))
  );

-- Sem policy de INSERT/DELETE: criação e remoção de tenant são operações
-- administrativas (Edge Function com service role).

-- =============================================================================
-- profiles
-- =============================================================================
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select private.current_user_id()));

create policy profiles_select_company on public.profiles
  for select to authenticated
  using (
    (select private.has_permission('users.read'))
    and (select private.user_belongs_to_current_company(profiles.id))
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select private.current_user_id()) and (select private.is_active_member()))
  with check (id = (select private.current_user_id()) and active = true);

create policy profiles_update_managed on public.profiles
  for update to authenticated
  using (
    (select private.has_permission('users.manage'))
    and (select private.user_belongs_to_current_company(profiles.id))
  )
  with check (
    (select private.has_permission('users.manage'))
    and (select private.user_belongs_to_current_company(profiles.id))
  );

-- =============================================================================
-- company_memberships
-- =============================================================================
create policy memberships_select_self on public.company_memberships
  for select to authenticated
  using (user_id = (select private.current_user_id()));

create policy memberships_select_company on public.company_memberships
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('users.read'))
  );

create policy memberships_insert on public.company_memberships
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('users.manage'))
  );

create policy memberships_update on public.company_memberships
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('users.manage'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('users.manage'))
  );

create policy memberships_delete on public.company_memberships
  for delete to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('users.manage'))
  );

-- =============================================================================
-- drivers
-- =============================================================================
create policy drivers_select on public.drivers
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('drivers.read'))
  );

create policy drivers_insert on public.drivers
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('drivers.write'))
    and archived_at is null
  );

create policy drivers_update on public.drivers
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('drivers.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('drivers.write'))
  );

-- Sem DELETE: arquivamento (ADR-005).

-- =============================================================================
-- vehicles
-- =============================================================================
create policy vehicles_select on public.vehicles
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('vehicles.read'))
  );

create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('vehicles.write'))
    and archived_at is null
    and status <> 'archived'
  );

create policy vehicles_update on public.vehicles
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('vehicles.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('vehicles.write'))
  );

-- Sem DELETE: arquivamento por public.archive_vehicle (ADR-005).

-- =============================================================================
-- vehicle_odometer_events — leitura direta, escrita só por RPC (ADR-006)
-- =============================================================================
create policy odometer_events_select on public.vehicle_odometer_events
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('odometer.read'))
  );

-- =============================================================================
-- trips
-- =============================================================================
create policy trips_select on public.trips
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('trips.read'))
  );

create policy trips_insert on public.trips
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('trips.write'))
    and status = 'planned'
  );

create policy trips_update on public.trips
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('trips.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('trips.write'))
  );

-- =============================================================================
-- fuelings — INSERT apenas por public.register_fueling
-- =============================================================================
create policy fuelings_select on public.fuelings
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('fuelings.read'))
  );

create policy fuelings_update on public.fuelings
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('fuelings.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('fuelings.write'))
  );

-- =============================================================================
-- maintenance_records
-- =============================================================================
create policy maintenance_select on public.maintenance_records
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('maintenance.read'))
  );

-- Agendar exige permissão própria; registrar manutenção em andamento não.
create policy maintenance_insert on public.maintenance_records
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and status in ('scheduled', 'in_progress')
    and (
      case status
        when 'scheduled' then (select private.has_permission('maintenance.schedule'))
        else (select private.has_permission('maintenance.write'))
      end
    )
  );

create policy maintenance_update on public.maintenance_records
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('maintenance.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('maintenance.write'))
  );

-- =============================================================================
-- locations
-- =============================================================================
create policy locations_select on public.locations
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('locations.read'))
  );

create policy locations_insert on public.locations
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('locations.write'))
  );

create policy locations_update on public.locations
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('locations.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('locations.write'))
  );

-- DELETE permitido apenas sem referências: as FKs on delete restrict de
-- cameras e vehicle_movements bloqueiam qualquer local com histórico.
create policy locations_delete on public.locations
  for delete to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.current_user_role()) = 'company_admin'
  );

-- =============================================================================
-- cameras
-- =============================================================================
create policy cameras_select on public.cameras
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('cameras.read'))
  );

create policy cameras_insert on public.cameras
  for insert to authenticated
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('cameras.write'))
  );

create policy cameras_update on public.cameras
  for update to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('cameras.write'))
  )
  with check (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('cameras.write'))
  );

create policy cameras_delete on public.cameras
  for delete to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.current_user_role()) = 'company_admin'
  );

-- =============================================================================
-- plate_read_events — escrita só por public.register_plate_read
-- =============================================================================
create policy plate_read_select on public.plate_read_events
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('ocr.read'))
  );

-- =============================================================================
-- vehicle_movements — escrita só por public.register_vehicle_movement (ADR-007)
-- =============================================================================
create policy movements_select on public.vehicle_movements
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('movements.read'))
  );

-- =============================================================================
-- audit.events — append-only, leitura restrita
-- =============================================================================
create policy audit_events_select on audit.events
  for select to authenticated
  using (
    company_id = (select private.current_user_company_id())
    and (select private.has_permission('audit.read'))
  );

-- Sem INSERT/UPDATE/DELETE: escrita apenas por private.log_audit_event
-- (SECURITY DEFINER) e mutação bloqueada por trigger.
