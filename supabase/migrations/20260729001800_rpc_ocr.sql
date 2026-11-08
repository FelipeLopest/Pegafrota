-- =============================================================================
-- PegaNaFrota — 001800 — Leitura de placa (ADR-009)
-- =============================================================================
-- A saída do worker OCR é ENTRADA NÃO CONFIÁVEL (SECURITY_MODEL.md §9).
-- Esta RPC é o ponto de entrada único e aplica, nesta ordem:
--   idempotência -> normalização -> confiança -> correspondência -> lock do
--   veículo -> deduplicação -> gravação do evento -> movimentação (se confirmado)
--
-- Garantia: evento OCR desconhecido, duplicado ou de baixa confiança NUNCA
-- cria movimentação.
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
  p_min_confidence       numeric default 0.80,
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

  -- (1) Idempotência: o worker pode reenviar o mesmo evento após reconexão.
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

  -- (3) Confiança.
  if p_confidence < coalesce(p_min_confidence, 0.80) then
    v_status := 'low_confidence';
    v_reason := 'confiança ' || p_confidence::text || ' abaixo do limiar ' ||
                coalesce(p_min_confidence, 0.80)::text;

  -- (4) Correspondência: a placa precisa existir NA EMPRESA da câmera.
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
      -- (5) Trava a linha do veículo ANTES de qualquer outra coisa.
      --
      -- Sem esta linha há deadlock real sob rajada de leituras da mesma placa:
      -- o INSERT em plate_read_events dispara a FK de matched_vehicle_id, que
      -- pega KEY SHARE na linha do veículo; logo depois
      -- register_vehicle_movement pede FOR UPDATE na MESMA linha. Duas
      -- transações simultâneas seguram KEY SHARE (compatível entre si) e então
      -- ambas tentam subir para FOR UPDATE — cada uma esperando a outra.
      -- Adquirir o lock mais forte primeiro impõe uma ordem única e elimina o
      -- ciclo. Reproduzido e verificado em tests/integration/concurrency.test.mjs.
      --
      -- Efeito colateral desejado: a deduplicação abaixo passa a ser avaliada
      -- COM o lock em mãos, então uma leitura concorrente que já tenha sido
      -- confirmada fica visível e a segunda rajada vira 'duplicate' de fato.
      perform 1 from public.vehicles where id = v_vehicle.id for update;

      -- (6) Deduplicação: mesma placa, mesma câmera, dentro da janela.
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

  -- (7) Gravação. matched_vehicle_id só é preenchido em confirmed/duplicate.
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
    'rejectionReason', v_read.rejection_reason,
    'idempotent', false,
    'movement', v_movement
  );
end;
$$;

comment on function public.register_plate_read is
  'Pipeline OCR completo. Somente status=confirmed origina movimentação (garantia ADR-007/ADR-009).';

-- -----------------------------------------------------------------------------
-- Confirmação manual de uma leitura recusada por baixa confiança
-- -----------------------------------------------------------------------------
create or replace function public.confirm_plate_read(
  p_plate_read_event_id uuid,
  p_vehicle_id          uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_read     public.plate_read_events;
  v_camera   public.cameras;
  v_vehicle  public.vehicles;
  v_movement jsonb;
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

  select * into v_camera from public.cameras where id = v_read.camera_id;

  update public.plate_read_events
     set status = 'confirmed',
         matched_vehicle_id = p_vehicle_id,
         rejection_reason = null
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
    jsonb_build_object('rpc', 'confirm_plate_read', 'vehicle_id', p_vehicle_id)
  );

  return jsonb_build_object(
    'plateReadEventId', p_plate_read_event_id,
    'status', 'confirmed',
    'matchedVehicleId', p_vehicle_id,
    'movement', v_movement
  );
end;
$$;

revoke all on function public.register_plate_read(
  uuid, text, numeric, text, text, timestamptz, text, text, numeric, integer, boolean
) from public;
revoke all on function public.confirm_plate_read(uuid, uuid) from public;

grant execute on function public.register_plate_read(
  uuid, text, numeric, text, text, timestamptz, text, text, numeric, integer, boolean
) to authenticated;
grant execute on function public.confirm_plate_read(uuid, uuid) to authenticated;
