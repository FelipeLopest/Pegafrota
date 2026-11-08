-- =============================================================================
-- PegaNaFrota — 20260731000300 — Blindagem de OCR e movimentação
-- =============================================================================
-- Corrige:
--   DB-AUD-007  register_vehicle_movement aceita leitura inválida ou de outro veículo
--   DB-AUD-018  cliente controla limiar de confiança e data da leitura
--
-- A garantia documentada ("leitura desconhecida ou de baixa confiança nunca gera
-- movimentação") era verdadeira DENTRO de register_plate_read, mas não no ponto
-- público de register_vehicle_movement, que é chamável diretamente por quem tem
-- ocr.operate. Esta migration move a garantia para onde ela precisa estar.
-- =============================================================================

-- =============================================================================
-- 1. Limiar de confiança passa a ser configuração do servidor (DB-AUD-018)
-- =============================================================================
alter table public.cameras
  add column min_confidence public.confidence_score not null default 0.80;

alter table public.cameras
  add constraint cameras_min_confidence_floor
  check (min_confidence >= 0.50 and min_confidence <= 1.00);

comment on column public.cameras.min_confidence is
  'Limiar mínimo de confiança da câmera. O cliente pode ser MAIS rigoroso na chamada, nunca menos.';

-- Só quem administra câmeras altera o limiar; o operador OCR não.
grant update (min_confidence) on public.cameras to authenticated;

-- =============================================================================
-- 2. Override manual explicitamente auditado (DB-AUD-007)
-- =============================================================================
-- Confirmar manualmente uma leitura cuja placa NÃO corresponde ao veículo é uma
-- operação legítima (placa suja, leitura parcial), mas precisa deixar rastro.
alter table public.plate_read_events
  add column manual_override_reason text,
  add column manual_override_by     uuid references public.profiles (id) on delete set null,
  add column manual_override_at     timestamptz;

alter table public.plate_read_events
  add constraint plate_read_override_consistent check (
    (manual_override_reason is null and manual_override_at is null)
    or (manual_override_reason is not null and manual_override_at is not null)
  );

comment on column public.plate_read_events.manual_override_reason is
  'Justificativa obrigatória quando a movimentação usa leitura cuja placa não bate com o veículo.';

-- =============================================================================
-- 3. register_vehicle_movement: validação integral do evento OCR (DB-AUD-007)
-- =============================================================================
create or replace function public.register_vehicle_movement(
  p_vehicle_id           uuid,
  p_location_id          uuid,
  p_source               public.movement_source default 'manual',
  p_plate_read_event_id  uuid default null,
  p_notes                text default null,
  p_dedup_window_seconds integer default 90
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle   public.vehicles;
  v_location  public.locations;
  v_last      public.vehicle_movements;
  v_movement  public.vehicle_movements;
  v_read      public.plate_read_events;
  v_camera    public.cameras;
  v_consumed  uuid;
  v_next_seq  integer;
  v_type      public.movement_type;
  v_window    interval;
begin
  if p_source = 'ocr' then
    perform private.assert_permission('ocr.operate');
  else
    perform private.assert_permission('movements.write');
  end if;

  -- ---------------------------------------------------------------------
  -- (0) Origem manual NUNCA carrega leitura de placa (DB-AUD-007).
  -- ---------------------------------------------------------------------
  if p_source = 'manual' and p_plate_read_event_id is not null then
    raise exception
      'MOVEMENT_MANUAL_WITH_READ: movimentação manual não aceita plate_read_event_id'
      using errcode = '22023', hint = 'OCR_INVALID_PAYLOAD';
  end if;

  if p_source = 'ocr' and p_plate_read_event_id is null then
    raise exception 'MOVEMENT_OCR_REQUIRES_READ: origem ocr exige plate_read_event_id'
      using errcode = '22004', hint = 'OCR_INVALID_PAYLOAD';
  end if;

  v_window := make_interval(secs => least(greatest(coalesce(p_dedup_window_seconds, 90), 0), 3600));

  -- (1)(2) localizar e bloquear o veículo (ordem de lock padronizada).
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

  select * into v_location from public.locations where id = p_location_id;
  if not found then
    raise exception 'LOCATION_NOT_FOUND: local % não existe', p_location_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_location.company_id);

  if not v_location.active or v_location.archived_at is not null then
    raise exception 'LOCATION_INACTIVE: local % está inativo', p_location_id
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  -- ---------------------------------------------------------------------
  -- (2b) Validação integral da leitura OCR — ANTES de qualquer INSERT.
  -- ---------------------------------------------------------------------
  if p_source = 'ocr' then
    -- Bloqueia a leitura: impede que duas transações consumam o mesmo evento.
    select * into v_read
    from public.plate_read_events
    where id = p_plate_read_event_id
    for update;

    if not found then
      raise exception 'PLATE_READ_NOT_FOUND: leitura % não existe', p_plate_read_event_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;

    -- Mesma empresa, por lógica e não apenas pela FK composta.
    if v_read.company_id <> v_vehicle.company_id then
      raise exception 'PLATE_READ_TENANT_MISMATCH: leitura pertence a outra empresa'
        using errcode = '42501', hint = 'TENANT_MISMATCH';
    end if;
    perform private.assert_company_access(v_read.company_id);

    if v_read.status <> 'confirmed' then
      raise exception
        'PLATE_READ_NOT_CONFIRMED: leitura em % não pode originar movimentação', v_read.status
        using errcode = '55000', hint = 'CONFLICT_STATE';
    end if;

    if v_read.matched_vehicle_id is distinct from p_vehicle_id then
      raise exception
        'PLATE_READ_VEHICLE_MISMATCH: leitura aponta o veículo % e não o veículo %',
        v_read.matched_vehicle_id, p_vehicle_id
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;

    -- Câmera e local coerentes.
    select * into v_camera from public.cameras where id = v_read.camera_id;
    if not found then
      raise exception 'CAMERA_NOT_FOUND: câmera da leitura % não existe', p_plate_read_event_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;

    if v_camera.location_id <> p_location_id then
      raise exception
        'PLATE_READ_LOCATION_MISMATCH: a câmera da leitura pertence ao local % e não ao local %',
        v_camera.location_id, p_location_id
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;

    -- Placa coerente OU override manual explicitamente justificado.
    if v_read.normalized_plate is distinct from v_vehicle.plate
       and private.normalize_label(v_read.manual_override_reason) is null then
      raise exception
        'PLATE_READ_PLATE_MISMATCH: placa lida (%) difere da placa do veículo (%) sem override auditado',
        coalesce(v_read.normalized_plate, '(vazia)'), v_vehicle.plate
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;

    -- Evento ainda não consumido.
    select m.id into v_consumed
    from public.vehicle_movements m
    where m.plate_read_event_id = p_plate_read_event_id
    limit 1;

    if v_consumed is not null then
      raise exception
        'PLATE_READ_ALREADY_CONSUMED: leitura % já originou a movimentação %',
        p_plate_read_event_id, v_consumed
        -- 55000 e não 23505 de propósito: o handler de unique_violation no fim
        -- desta função traduziria um 23505 em MOVEMENT_CONFLICT (40001) e o
        -- cliente receberia "tente de novo" em vez de "leitura já usada".
        using errcode = '55000', hint = 'CONFLICT_DUPLICATE';
    end if;
  end if;

  -- (3) última movimentação do veículo.
  select * into v_last
  from public.vehicle_movements
  where vehicle_id = p_vehicle_id
  order by sequence_no desc
  limit 1;

  -- (5) deduplicação: mesmo veículo, mesmo local, mesma origem, dentro da janela.
  if v_last.id is not null
     and v_last.location_id = p_location_id
     and v_last.source = p_source
     and v_window > interval '0'
     and greatest(now() - v_last.occurred_at, interval '0') < v_window then
    return jsonb_build_object(
      'movementId', v_last.id,
      'vehicleId', p_vehicle_id,
      'plate', v_vehicle.plate,
      'movementType', v_last.movement_type,
      'occurredAt', v_last.occurred_at,
      'locationId', v_last.location_id,
      'sequenceNo', v_last.sequence_no,
      'deduplicated', true,
      'vehicleIsInside', (v_last.movement_type = 'entry')
    );
  end if;

  -- (4) primeira movimentação é Entrada; depois alternância obrigatória.
  v_next_seq := coalesce(v_last.sequence_no, 0) + 1;
  v_type := case when v_next_seq % 2 = 1 then 'entry' else 'exit' end;

  -- (6) registrar. occurred_at é SEMPRE carimbo do servidor.
  insert into public.vehicle_movements (
    company_id, vehicle_id, location_id, movement_type, sequence_no,
    occurred_at, source, plate_read_event_id, operator_user_id, notes
  )
  values (
    v_vehicle.company_id, p_vehicle_id, p_location_id, v_type, v_next_seq,
    now(), p_source, p_plate_read_event_id, private.current_user_id(),
    private.normalize_label(p_notes)
  )
  returning * into v_movement;

  -- (7) novo estado.
  return jsonb_build_object(
    'movementId', v_movement.id,
    'vehicleId', p_vehicle_id,
    'plate', v_vehicle.plate,
    'movementType', v_movement.movement_type,
    'occurredAt', v_movement.occurred_at,
    'locationId', v_movement.location_id,
    'sequenceNo', v_movement.sequence_no,
    'deduplicated', false,
    'vehicleIsInside', (v_movement.movement_type = 'entry')
  );
exception
  when unique_violation then
    raise exception 'MOVEMENT_CONFLICT: outra movimentação do veículo % foi registrada simultaneamente',
      p_vehicle_id
      using errcode = '40001', hint = 'CONFLICT_RETRY';
end;
$$;

comment on function public.register_vehicle_movement is
  'Única forma de criar Entrada/Saída. Para source=ocr valida existência, empresa, status confirmado, '
  'veículo, câmera/local, placa (ou override auditado) e não reutilização do evento — DB-AUD-007.';

-- =============================================================================
-- 4. register_plate_read: limiar e janela de captura sob controle do servidor
-- =============================================================================
create or replace function public.register_plate_read(
  p_camera_id            uuid,
  p_raw_text             text,
  p_confidence           numeric,
  p_engine_version       text,
  p_contract_version     text default '1.0.0',
  p_captured_at          timestamptz default now(),
  p_frame_hash           text default null,
  p_client_event_id      text default null,
  p_min_confidence       numeric default null,
  p_dedup_window_seconds integer default 90,
  p_auto_register_movement boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_camera     public.cameras;
  v_existing   public.plate_read_events;
  v_read       public.plate_read_events;
  v_vehicle    public.vehicles;
  v_duplicate  public.plate_read_events;
  v_plate      text;
  v_status     public.plate_read_status;
  v_reason     text;
  v_movement   jsonb;
  v_window     interval;
  v_threshold  numeric;
  v_captured   timestamptz := coalesce(p_captured_at, now());
begin
  perform private.assert_permission('ocr.operate');

  v_window := make_interval(secs => least(greatest(coalesce(p_dedup_window_seconds, 90), 0), 3600));

  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'OCR_INVALID_CONFIDENCE: confiança deve estar entre 0 e 1'
      using errcode = '22003', hint = 'OCR_INVALID_PAYLOAD';
  end if;

  if private.normalize_label(p_raw_text) is null then
    raise exception 'OCR_INVALID_PAYLOAD: texto bruto é obrigatório'
      using errcode = '22004', hint = 'OCR_INVALID_PAYLOAD';
  end if;

  select * into v_camera from public.cameras where id = p_camera_id;
  if not found then
    raise exception 'CAMERA_NOT_FOUND: câmera % não existe', p_camera_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_camera.company_id);

  if not v_camera.active then
    raise exception 'CAMERA_INACTIVE: câmera % está inativa', p_camera_id
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  -- ---------------------------------------------------------------------
  -- DB-AUD-018: o limiar é da CÂMERA. O parâmetro só pode endurecer a regra.
  -- Um cliente que enviar 0 continua submetido ao piso configurado.
  -- ---------------------------------------------------------------------
  v_threshold := greatest(coalesce(v_camera.min_confidence, 0.80), coalesce(p_min_confidence, 0));

  -- ---------------------------------------------------------------------
  -- DB-AUD-018: janela de captura limitada. Sem isso o cliente podia criar
  -- leitura com data muito antiga ou futura e contaminar dedup e relatórios.
  -- ---------------------------------------------------------------------
  if v_captured > now() + interval '2 minutes' then
    raise exception 'OCR_CAPTURE_IN_FUTURE: captured_at não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if v_captured < now() - interval '24 hours' then
    raise exception 'OCR_CAPTURE_TOO_OLD: captured_at excede a janela de 24 horas'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  -- (1) Idempotência.
  if p_client_event_id is not null then
    select * into v_existing
    from public.plate_read_events
    where company_id = v_camera.company_id and client_event_id = p_client_event_id;

    if found then
      return jsonb_build_object(
        'plateReadEventId', v_existing.id,
        'status', v_existing.status,
        'normalizedPlate', v_existing.normalized_plate,
        'matchedVehicleId', v_existing.matched_vehicle_id,
        'idempotent', true,
        'movement', null
      );
    end if;
  end if;

  -- (2) Normalização.
  v_plate := private.normalize_plate(p_raw_text);

  -- (3) Confiança, contra o limiar efetivo do servidor.
  if p_confidence < v_threshold then
    v_status := 'low_confidence';
    v_reason := 'confiança ' || p_confidence::text || ' abaixo do limiar ' || v_threshold::text;

  -- (4) Correspondência na empresa da câmera.
  else
    select * into v_vehicle
    from public.vehicles
    where company_id = v_camera.company_id
      and plate = v_plate
      and archived_at is null;

    if not found then
      v_status := 'unknown_plate';
      v_reason := 'placa ' || coalesce(v_plate, '(vazia)') || ' não pertence à frota';
    else
      -- (5) Lock do veículo antes da FK e da movimentação (anti-deadlock).
      perform 1 from public.vehicles where id = v_vehicle.id for update;

      -- (6) Deduplicação.
      select * into v_duplicate
      from public.plate_read_events
      where company_id = v_camera.company_id
        and camera_id = p_camera_id
        and normalized_plate = v_plate
        and status = 'confirmed'
        and captured_at > v_captured - v_window
      order by captured_at desc
      limit 1;

      if found then
        v_status := 'duplicate';
        v_reason := 'leitura repetida dentro da janela de ' || v_window::text;
      else
        v_status := 'confirmed';
      end if;
    end if;
  end if;

  -- (7) Gravação.
  insert into public.plate_read_events (
    company_id, camera_id, captured_at, raw_text, normalized_plate, confidence,
    frame_hash, status, matched_vehicle_id, duplicate_of_id, rejection_reason,
    engine_version, contract_version, client_event_id, created_by
  )
  values (
    v_camera.company_id, p_camera_id, v_captured, p_raw_text, v_plate, p_confidence,
    p_frame_hash, v_status,
    case when v_status in ('confirmed', 'duplicate') then v_vehicle.id else null end,
    case when v_status = 'duplicate' then v_duplicate.id else null end,
    v_reason,
    p_engine_version, p_contract_version, p_client_event_id, private.current_user_id()
  )
  returning * into v_read;

  -- (8) Movimentação SOMENTE para leitura confirmada.
  if v_status = 'confirmed' and coalesce(p_auto_register_movement, true) then
    v_movement := public.register_vehicle_movement(
      p_vehicle_id           => v_vehicle.id,
      p_location_id          => v_camera.location_id,
      p_source               => 'ocr',
      p_plate_read_event_id  => v_read.id,
      p_notes                => null,
      p_dedup_window_seconds => p_dedup_window_seconds
    );
  end if;

  return jsonb_build_object(
    'plateReadEventId', v_read.id,
    'status', v_read.status,
    'normalizedPlate', v_read.normalized_plate,
    'matchedVehicleId', v_read.matched_vehicle_id,
    'confidence', v_read.confidence,
    'appliedMinConfidence', v_threshold,
    'rejectionReason', v_read.rejection_reason,
    'idempotent', false,
    'movement', v_movement
  );
end;
$$;

comment on function public.register_plate_read is
  'Pipeline OCR completo. Limiar vem da câmera (cliente só endurece) e captured_at é limitado '
  'a [-24h, +2min] — DB-AUD-018. Somente status=confirmed origina movimentação.';

-- =============================================================================
-- 5. confirm_plate_read com override auditado
-- =============================================================================
-- A assinatura muda: um parâmetro novo com DEFAULT geraria ambiguidade com a
-- versão de dois argumentos, então a antiga é removida explicitamente.
drop function if exists public.confirm_plate_read(uuid, uuid);

create or replace function public.confirm_plate_read(
  p_plate_read_event_id uuid,
  p_vehicle_id          uuid,
  p_override_reason     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_read      public.plate_read_events;
  v_camera    public.cameras;
  v_vehicle   public.vehicles;
  v_movement  jsonb;
  v_override  text := private.normalize_label(p_override_reason);
  v_mismatch  boolean;
begin
  perform private.assert_permission('ocr.operate');
  perform private.assert_permission('movements.write');

  select * into v_read from public.plate_read_events where id = p_plate_read_event_id for update;
  if not found then
    raise exception 'PLATE_READ_NOT_FOUND: leitura % não existe', p_plate_read_event_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_read.company_id);

  if v_read.status not in ('low_confidence', 'unknown_plate', 'captured') then
    raise exception 'PLATE_READ_INVALID_STATE: leitura em % não pode ser confirmada manualmente',
      v_read.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and company_id = v_read.company_id and archived_at is null;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe nesta empresa', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  -- Override: associar leitura cuja placa não bate exige justificativa.
  v_mismatch := v_read.normalized_plate is distinct from v_vehicle.plate;
  if v_mismatch and v_override is null then
    raise exception
      'PLATE_READ_OVERRIDE_REQUIRED: placa lida (%) difere de (%); informe a justificativa',
      coalesce(v_read.normalized_plate, '(vazia)'), v_vehicle.plate
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_camera from public.cameras where id = v_read.camera_id;

  update public.plate_read_events
     set status = 'confirmed',
         matched_vehicle_id = p_vehicle_id,
         rejection_reason = null,
         manual_override_reason = case when v_mismatch then v_override else null end,
         manual_override_by     = case when v_mismatch then private.current_user_id() else null end,
         manual_override_at     = case when v_mismatch then now() else null end
   where id = p_plate_read_event_id;

  v_movement := public.register_vehicle_movement(
    p_vehicle_id          => p_vehicle_id,
    p_location_id         => v_camera.location_id,
    p_source              => 'ocr',
    p_plate_read_event_id => p_plate_read_event_id,
    p_notes               => 'confirmação manual de leitura'
  );

  perform private.log_audit_event(
    v_read.company_id, 'execute', 'public.plate_read_events', p_plate_read_event_id,
    jsonb_build_object('status', jsonb_build_object('old', v_read.status, 'new', 'confirmed')),
    jsonb_build_object(
      'rpc', 'confirm_plate_read',
      'vehicle_id', p_vehicle_id,
      'plateMismatch', v_mismatch,
      'overrideReason', case when v_mismatch then v_override else null end
    )
  );

  return jsonb_build_object(
    'plateReadEventId', p_plate_read_event_id,
    'status', 'confirmed',
    'matchedVehicleId', p_vehicle_id,
    'plateMismatch', v_mismatch,
    'movement', v_movement
  );
end;
$$;

-- =============================================================================
-- 6. Grants
-- =============================================================================
revoke all on function public.register_plate_read(
  uuid, text, numeric, text, text, timestamptz, text, text, numeric, integer, boolean
) from public;
revoke all on function public.confirm_plate_read(uuid, uuid, text) from public;

grant execute on function public.register_plate_read(
  uuid, text, numeric, text, text, timestamptz, text, text, numeric, integer, boolean
) to authenticated;
grant execute on function public.confirm_plate_read(uuid, uuid, text) to authenticated;
