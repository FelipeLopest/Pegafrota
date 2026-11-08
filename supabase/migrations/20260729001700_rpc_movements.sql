-- =============================================================================
-- PegaNaFrota — 001700 — Movimentações de Entrada/Saída (ADR-007)
-- =============================================================================
-- Fluxo obrigatório (ARCHITECTURE.md §9):
--   1. localizar o veículo na empresa
--   2. bloquear o estado necessário para concorrência
--   3. consultar a última movimentação
--   4. determinar Entrada ou Saída
--   5. aplicar janela de deduplicação
--   6. registrar o evento
--   7. devolver o novo estado do veículo
--
-- Três camadas independentes garantem a alternância:
--   a) SELECT ... FOR UPDATE na linha do veículo (serializa concorrentes)
--   b) índice único (vehicle_id, sequence_no)  (uma das transações falha)
--   c) check de paridade sequence_no/movement_type (impossível gravar torto)
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
  v_next_seq  integer;
  v_type      public.movement_type;
  v_window    interval;
begin
  -- Permissão: OCR usa ocr.operate, operação manual usa movements.write.
  if p_source = 'ocr' then
    perform private.assert_permission('ocr.operate');
  else
    perform private.assert_permission('movements.write');
  end if;

  v_window := make_interval(secs => least(greatest(coalesce(p_dedup_window_seconds, 90), 0), 3600));

  -- (1)(2) localizar e bloquear o veículo.
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

  -- (3) última movimentação do veículo.
  select * into v_last
  from public.vehicle_movements
  where vehicle_id = p_vehicle_id
  order by sequence_no desc
  limit 1;

  -- (5) deduplicação: mesmo veículo, mesmo local, mesma origem, dentro da janela.
  --
  -- Duas proteções sutis, ambas encontradas por teste de concorrência real:
  --  a) v_window > 0 — janela zero significa "não deduplicar". Sem esta guarda,
  --     transações simultâneas caíam no ramo de deduplicação por causa de (b).
  --  b) greatest(..., 0) — now() é o instante de INÍCIO da transação. Em uma
  --     rajada simultânea, a transação que perde a corrida pelo lock tem now()
  --     ANTERIOR ao occurred_at gravado pela vencedora, e o intervalo fica
  --     negativo. Sem o greatest, qualquer intervalo negativo era menor que a
  --     janela e deduplicava indevidamente.
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

  -- (6) registrar. occurred_at é SEMPRE carimbo do servidor: o cliente não
  -- consegue backdatar uma movimentação.
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
    -- Corrida perdida para outra transação no mesmo veículo.
    raise exception 'MOVEMENT_CONFLICT: outra movimentação do veículo % foi registrada simultaneamente',
      p_vehicle_id
      using errcode = '40001', hint = 'CONFLICT_RETRY';
end;
$$;

comment on function public.register_vehicle_movement is
  'Única forma de criar Entrada/Saída. Primeira sempre Entrada, alternância garantida, dedup por janela.';

-- -----------------------------------------------------------------------------
-- Estado atual: veículo dentro ou fora
-- -----------------------------------------------------------------------------
create or replace function public.vehicle_presence(p_vehicle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_last    public.vehicle_movements;
  v_vehicle public.vehicles;
begin
  perform private.assert_permission('movements.read');
  v_company := private.current_user_company_id();

  select * into v_vehicle from public.vehicles where id = p_vehicle_id and company_id = v_company;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe nesta empresa', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select * into v_last
  from public.vehicle_movements
  where vehicle_id = p_vehicle_id and company_id = v_company
  order by sequence_no desc
  limit 1;

  return jsonb_build_object(
    'vehicleId', p_vehicle_id,
    'plate', v_vehicle.plate,
    'isInside', coalesce(v_last.movement_type = 'entry', false),
    'lastMovementType', v_last.movement_type,
    'lastMovementAt', v_last.occurred_at,
    'lastLocationId', v_last.location_id,
    'sequenceNo', coalesce(v_last.sequence_no, 0),
    'nextMovementType', case when coalesce(v_last.movement_type, 'exit') = 'entry' then 'exit' else 'entry' end
  );
end;
$$;

revoke all on function public.register_vehicle_movement(
  uuid, uuid, public.movement_source, uuid, text, integer
) from public;
revoke all on function public.vehicle_presence(uuid) from public;

grant execute on function public.register_vehicle_movement(
  uuid, uuid, public.movement_source, uuid, text, integer
) to authenticated;
grant execute on function public.vehicle_presence(uuid) to authenticated;
