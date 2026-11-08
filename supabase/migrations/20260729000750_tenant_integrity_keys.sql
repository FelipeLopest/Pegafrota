-- =============================================================================
-- PegaNaFrota — 000750 — Integridade de tenant por chave composta
-- =============================================================================
-- ARCHITECTURE.md §7 exige validar que "todos os relacionamentos pertencem à
-- mesma empresa". Isso é feito de forma DECLARATIVA, com foreign keys compostas
-- (id, company_id), em vez de triggers: é mais barato, não pode ser desabilitado
-- por engano e é verificado pelo planner.
--
-- Efeito prático: é impossível criar uma viagem da empresa A apontando para um
-- veículo da empresa B, mesmo com RLS desligada ou executando como postgres.
-- =============================================================================

alter table public.vehicles
  add constraint vehicles_id_company_key unique (id, company_id);

alter table public.drivers
  add constraint drivers_id_company_key unique (id, company_id);

alter table public.locations
  add constraint locations_id_company_key unique (id, company_id);

alter table public.cameras
  add constraint cameras_id_company_key unique (id, company_id);

alter table public.trips
  add constraint trips_id_company_key unique (id, company_id);

alter table public.plate_read_events
  add constraint plate_read_events_id_company_key unique (id, company_id);

alter table public.vehicle_odometer_events
  add constraint odometer_events_id_company_key unique (id, company_id);

-- ---------------------------------------------------------------------------
-- Substituição das FKs simples por FKs compostas
-- ---------------------------------------------------------------------------

-- vehicle_odometer_events
alter table public.vehicle_odometer_events
  drop constraint vehicle_odometer_events_vehicle_id_fkey,
  add constraint odometer_events_vehicle_same_company_fkey
    foreign key (vehicle_id, company_id)
    references public.vehicles (id, company_id) on delete restrict;

alter table public.vehicle_odometer_events
  drop constraint vehicle_odometer_events_correction_of_id_fkey,
  add constraint odometer_events_correction_same_company_fkey
    foreign key (correction_of_id, company_id)
    references public.vehicle_odometer_events (id, company_id) on delete restrict;

-- trips
alter table public.trips
  drop constraint trips_vehicle_id_fkey,
  add constraint trips_vehicle_same_company_fkey
    foreign key (vehicle_id, company_id)
    references public.vehicles (id, company_id) on delete restrict;

alter table public.trips
  drop constraint trips_driver_id_fkey,
  add constraint trips_driver_same_company_fkey
    foreign key (driver_id, company_id)
    references public.drivers (id, company_id) on delete restrict;

-- fuelings
alter table public.fuelings
  drop constraint fuelings_vehicle_id_fkey,
  add constraint fuelings_vehicle_same_company_fkey
    foreign key (vehicle_id, company_id)
    references public.vehicles (id, company_id) on delete restrict;

alter table public.fuelings
  drop constraint fuelings_driver_id_fkey,
  add constraint fuelings_driver_same_company_fkey
    foreign key (driver_id, company_id)
    references public.drivers (id, company_id) on delete restrict;

alter table public.fuelings
  drop constraint fuelings_trip_id_fkey,
  add constraint fuelings_trip_same_company_fkey
    foreign key (trip_id, company_id)
    references public.trips (id, company_id) on delete restrict;

-- maintenance_records
alter table public.maintenance_records
  drop constraint maintenance_records_vehicle_id_fkey,
  add constraint maintenance_vehicle_same_company_fkey
    foreign key (vehicle_id, company_id)
    references public.vehicles (id, company_id) on delete restrict;

-- cameras
alter table public.cameras
  drop constraint cameras_location_id_fkey,
  add constraint cameras_location_same_company_fkey
    foreign key (location_id, company_id)
    references public.locations (id, company_id) on delete restrict;

-- plate_read_events
alter table public.plate_read_events
  drop constraint plate_read_events_camera_id_fkey,
  add constraint plate_read_camera_same_company_fkey
    foreign key (camera_id, company_id)
    references public.cameras (id, company_id) on delete restrict;

alter table public.plate_read_events
  drop constraint plate_read_events_matched_vehicle_id_fkey,
  add constraint plate_read_vehicle_same_company_fkey
    foreign key (matched_vehicle_id, company_id)
    references public.vehicles (id, company_id) on delete restrict;

alter table public.plate_read_events
  drop constraint plate_read_events_duplicate_of_id_fkey,
  add constraint plate_read_duplicate_same_company_fkey
    foreign key (duplicate_of_id, company_id)
    references public.plate_read_events (id, company_id) on delete restrict;

-- vehicle_movements
alter table public.vehicle_movements
  drop constraint vehicle_movements_vehicle_id_fkey,
  add constraint movements_vehicle_same_company_fkey
    foreign key (vehicle_id, company_id)
    references public.vehicles (id, company_id) on delete restrict;

alter table public.vehicle_movements
  drop constraint vehicle_movements_location_id_fkey,
  add constraint movements_location_same_company_fkey
    foreign key (location_id, company_id)
    references public.locations (id, company_id) on delete restrict;

alter table public.vehicle_movements
  drop constraint vehicle_movements_plate_read_event_id_fkey,
  add constraint movements_plate_read_same_company_fkey
    foreign key (plate_read_event_id, company_id)
    references public.plate_read_events (id, company_id) on delete restrict;
