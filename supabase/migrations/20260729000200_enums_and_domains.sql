-- =============================================================================
-- PegaNaFrota — 000200 — Enums e domains
-- =============================================================================
-- Todos os status de negócio são enums nomeados (DATABASE_BLUEPRINT.md §2).
-- Enums são preferidos a check constraints de texto porque:
--   - aparecem no schema introspectivo do PostgREST e do cliente;
--   - impedem valores livres em qualquer caminho de escrita;
--   - permitem evolução controlada por ALTER TYPE ... ADD VALUE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create type public.company_status as enum ('active', 'suspended', 'archived');

create type public.membership_role as enum (
  'company_admin',   -- administrador da empresa
  'fleet_manager',   -- gestor de frota
  'operator',        -- operador
  'viewer'           -- visualizador
);

-- ---------------------------------------------------------------------------
-- Frota
-- ---------------------------------------------------------------------------
create type public.vehicle_status as enum (
  'available',       -- disponível no pátio
  'in_use',          -- em viagem
  'in_maintenance',  -- em manutenção
  'inactive',        -- fora de operação, ainda não arquivado
  'archived'         -- arquivado (ADR-005)
);

create type public.fuel_type as enum (
  'gasoline',
  'ethanol',
  'flex',
  'diesel_s10',
  'diesel_s500',
  'cng',
  'electric'
);

create type public.odometer_source_type as enum (
  'vehicle_registration',
  'trip_completion',
  'fueling',
  'maintenance_completion',
  'manual_adjustment'
);

-- ---------------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------------
create type public.trip_status as enum ('planned', 'in_progress', 'completed', 'cancelled');

create type public.maintenance_type as enum ('preventive', 'corrective');

create type public.maintenance_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Controle de acesso físico / OCR
-- ---------------------------------------------------------------------------
create type public.camera_direction as enum ('entry', 'exit', 'both');

create type public.plate_read_status as enum (
  'captured',        -- capturado, ainda não classificado
  'low_confidence',  -- confiança abaixo do limiar
  'unknown_plate',   -- placa normalizada não pertence a nenhum veículo da empresa
  'duplicate',       -- leitura dentro da janela de deduplicação
  'confirmed',       -- leitura válida associada a um veículo
  'error'            -- falha do motor OCR
);

create type public.movement_type as enum ('entry', 'exit');

create type public.movement_source as enum ('manual', 'ocr');

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create type audit.event_action as enum (
  'insert',
  'update',
  'delete',
  'archive',
  'unarchive',
  'execute'
);

-- ---------------------------------------------------------------------------
-- Domains de unidade — centralizam precisão e sinal (DATABASE_BLUEPRINT.md §2)
-- ---------------------------------------------------------------------------
create domain public.money_brl as numeric(14, 2)
  check (value is null or value >= 0);
comment on domain public.money_brl is 'Valores monetários em BRL. Nunca usar ponto flutuante.';

create domain public.liters as numeric(12, 3)
  check (value is null or value > 0);

create domain public.odometer_km as numeric(12, 1)
  check (value is null or (value >= 0 and value <= 9999999));

create domain public.confidence_score as numeric(5, 4)
  check (value is null or (value >= 0 and value <= 1));

-- NOTA DE PROJETO: CNPJ, placa e UF NÃO usam domain.
-- Um domain é validado durante a coerção do valor de entrada, ou seja ANTES de
-- qualquer BEFORE trigger. Isso tornaria a normalização inútil: '11.222.333/0001-81'
-- seria recusado antes de virar '11222333000181'.
-- Essas colunas usam text + CHECK na tabela, que é avaliado DEPOIS do trigger.
-- Resultado: o cliente pode enviar o valor com máscara e o banco continua
-- garantindo que o dado ARMAZENADO está normalizado e válido.
