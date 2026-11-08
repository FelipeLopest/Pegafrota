-- =============================================================================
-- PegaNaFrota — 20260731000900 — Segunda auditoria
-- =============================================================================
-- Corrige:
--   DB-AUD2-003  compensação da Edge Function não restaura o estado anterior
--   DB-AUD2-004  correção retrodatada de odômetro cria linha do tempo impossível
--   DB-AUD2-005  chave de idempotência não é vinculada à ação
--   DB-AUD2-006  company_members() concedida a service_role sem necessidade
--
-- A resposta para DB-AUD2-003 é estrutural, não mais compensatória: as três
-- operações administrativas viram RPCs TRANSACIONAIS. Profile, membership e
-- auditoria passam a acontecer na mesma transação. Se a auditoria falhar, o
-- PostgreSQL desfaz tudo — não existe "estado anterior a inferir", porque não
-- existe estado parcial. Sobra uma única compensação na Edge Function: apagar a
-- conta que ELA criou no GoTrue, que é o único passo fora do banco.
-- =============================================================================

-- =============================================================================
-- 1. DB-AUD2-004 — correção de odômetro é append-only no presente
-- =============================================================================
-- O modelo anterior deixava a correção furar a cronologia. Com um veículo em
-- 100 km (dia 1) e 200 km (dia 3), uma correção de 250 km datada no dia 2
-- passava nas duas checagens — valor não regride (250 >= 200) e retrodatação é
-- permitida para correções — e produzia o ledger 100 / 250 / 200, que o próprio
-- data_integrity_selftest() classifica como crítico.
--
-- SEMÂNTICA ADOTADA
--   * o ledger é append-only e monotônico em (occurred_at, odometer_km);
--   * uma correção NÃO reescreve o passado: ela é um evento novo, no instante
--     atual, que aponta para o evento histórico incorreto via correction_of_id;
--   * occurred_at de uma correção é sempre carimbado pelo servidor;
--   * o valor anterior fica registrado em corrected_from_km, para que o
--     histórico continue legível sem precisar reconstruir nada.
--
-- LIMITAÇÃO ACEITA E DOCUMENTADA
--   Correção para BAIXO é impossível por API. Um ledger imutável e monotônico
--   não admite reduzir a quilometragem: isso exigiria recalcular todos os
--   eventos posteriores, o que contraria ADR-006. Erro de digitação para mais
--   ("20000" em vez de "2000") é incidente de dados e se resolve por
--   procedimento administrativo com trilha, nunca pelo aplicativo.

alter table public.vehicle_odometer_events
  add column corrected_from_km public.odometer_km;

comment on column public.vehicle_odometer_events.corrected_from_km is
  'Valor que o evento apontado por correction_of_id registrava. Preenchido pelo servidor.';

alter table public.vehicle_odometer_events
  add constraint odometer_events_correction_metadata check (
    (correction_of_id is null and corrected_from_km is null)
    or (correction_of_id is not null and corrected_from_km is not null)
  );

-- ---------------------------------------------------------------------------
-- 1.1 Guarda estrutural: nenhuma exceção de cronologia, nem para correção
-- ---------------------------------------------------------------------------
create or replace function private.tg_odometer_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max_km    public.odometer_km;
  v_last_at   timestamptz;
  v_corrected public.vehicle_odometer_events;
begin
  select max(e.odometer_km), max(e.occurred_at)
    into v_max_km, v_last_at
  from public.vehicle_odometer_events e
  where e.vehicle_id = new.vehicle_id;

  if v_max_km is not null and new.odometer_km < v_max_km then
    raise exception
      'ODOMETER_REGRESSION: leitura % é menor que a maior já registrada (%) para o veículo %',
      new.odometer_km, v_max_km, new.vehicle_id
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  if new.previous_km is null then
    new.previous_km := coalesce(v_max_km, 0);
  end if;

  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'ODOMETER_FUTURE_EVENT: occurred_at no futuro não é aceito'
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  -- DB-AUD2-004: a exceção que existia aqui para correction_of_id não nulo é o
  -- que permitia a linha do tempo impossível. Agora a regra vale para TODOS os
  -- eventos, sem exceção.
  if v_last_at is not null and new.occurred_at < v_last_at then
    raise exception
      'ODOMETER_BACKDATED: occurred_at % é anterior ao último evento do veículo (%). '
      'O ledger é append-only: uma correção é registrada no instante atual apontando '
      'o evento histórico via correction_of_id.',
      new.occurred_at, v_last_at
      using errcode = '23514', hint = 'CHRONOLOGY_ERROR';
  end if;

  if new.correction_of_id is not null then
    if private.normalize_label(new.reason) is null then
      raise exception 'ODOMETER_CORRECTION_NEEDS_REASON: correção exige justificativa'
        using errcode = '22004', hint = 'VALIDATION_ERROR';
    end if;

    select * into v_corrected
    from public.vehicle_odometer_events e
    where e.id = new.correction_of_id;

    if not found then
      raise exception 'ODOMETER_CORRECTION_TARGET_NOT_FOUND: evento % não existe',
        new.correction_of_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;

    if v_corrected.vehicle_id <> new.vehicle_id then
      raise exception
        'ODOMETER_CORRECTION_VEHICLE_MISMATCH: o evento corrigido pertence a outro veículo'
        using errcode = '23514', hint = 'VALIDATION_ERROR';
    end if;

    -- Metadado do valor corrigido, carimbado pelo servidor.
    new.corrected_from_km := v_corrected.odometer_km;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1.2 Única porta de escrita: correção sempre no instante atual
-- ---------------------------------------------------------------------------
create or replace function private.record_odometer_event(
  p_vehicle_id       uuid,
  p_odometer_km      numeric,
  p_occurred_at      timestamptz,
  p_source_type      public.odometer_source_type,
  p_source_id        uuid default null,
  p_reason           text default null,
  p_correction_of_id uuid default null
)
returns public.vehicle_odometer_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle  public.vehicles;
  v_event    public.vehicle_odometer_events;
  v_last_at  timestamptz;
  v_occurred timestamptz;
begin
  if p_odometer_km is null then
    raise exception 'VALIDATION_ERROR: odometer_km é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- DB-AUD2-004: correção NÃO escolhe a própria data. Ela é sempre um evento do
  -- presente que aponta o passado.
  v_occurred := case
    when p_correction_of_id is not null then now()
    else coalesce(p_occurred_at, now())
  end;

  -- Lock da linha do veículo: serializa qualquer outra RPC do mesmo veículo.
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado', p_vehicle_id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  -- Garantia central: quilometragem nunca regride.
  if p_odometer_km < v_vehicle.current_odometer_km then
    raise exception
      'ODOMETER_REGRESSION: % é menor que a quilometragem atual (%) do veículo %',
      p_odometer_km, v_vehicle.current_odometer_km, p_vehicle_id
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  -- Cronologia, avaliada COM o lock do veículo em mãos e sem exceção para
  -- correções (DB-AUD2-004).
  select max(e.occurred_at) into v_last_at
  from public.vehicle_odometer_events e
  where e.vehicle_id = p_vehicle_id;

  if v_last_at is not null and v_occurred < v_last_at then
    raise exception
      'ODOMETER_BACKDATED: data % é anterior ao último evento do veículo (%)',
      v_occurred, v_last_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  insert into public.vehicle_odometer_events (
    company_id, vehicle_id, occurred_at, odometer_km, previous_km,
    source_type, source_id, reason, correction_of_id, created_by
  )
  values (
    v_vehicle.company_id,
    p_vehicle_id,
    v_occurred,
    p_odometer_km,
    v_vehicle.current_odometer_km,
    p_source_type,
    p_source_id,
    private.normalize_label(p_reason),
    p_correction_of_id,
    private.current_user_id()
  )
  returning * into v_event;

  update public.vehicles
     set current_odometer_km = p_odometer_km
   where id = p_vehicle_id
     and current_odometer_km <> p_odometer_km;

  return v_event;
end;
$$;

comment on function private.record_odometer_event is
  'Única porta de escrita do ledger. Lock no veículo, valor monotônico e cronologia sem exceção. '
  'Correção (correction_of_id) é sempre registrada no instante atual — DB-AUD2-004.';

-- ---------------------------------------------------------------------------
-- 1.3 register_odometer_reading devolve o contrato da correção
-- ---------------------------------------------------------------------------
create or replace function public.register_odometer_reading(
  p_vehicle_id       uuid,
  p_odometer_km      numeric,
  p_reason           text,
  p_occurred_at      timestamptz default now(),
  p_correction_of_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.vehicle_odometer_events;
begin
  perform private.assert_permission('odometer.adjust');

  if private.normalize_label(p_reason) is null then
    raise exception 'VALIDATION_ERROR: justificativa é obrigatória no ajuste manual'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  v_event := private.record_odometer_event(
    p_vehicle_id       => p_vehicle_id,
    p_odometer_km      => p_odometer_km,
    p_occurred_at      => coalesce(p_occurred_at, now()),
    p_source_type      => 'manual_adjustment',
    p_source_id        => null,
    p_reason           => p_reason,
    p_correction_of_id => p_correction_of_id
  );

  perform private.log_audit_event(
    v_event.company_id,
    'execute',
    'public.vehicle_odometer_events',
    v_event.id,
    jsonb_build_object(
      'odometer_km', jsonb_build_object('old', v_event.previous_km, 'new', v_event.odometer_km)
    ),
    jsonb_build_object(
      'rpc', 'register_odometer_reading',
      'vehicle_id', p_vehicle_id,
      'correctionOfId', p_correction_of_id,
      'correctedFromKm', v_event.corrected_from_km
    )
  );

  return jsonb_build_object(
    'eventId', v_event.id,
    'vehicleId', v_event.vehicle_id,
    'odometerKm', v_event.odometer_km,
    'previousKm', v_event.previous_km,
    'occurredAt', v_event.occurred_at,
    'sourceType', v_event.source_type,
    'correctionOfId', v_event.correction_of_id,
    'correctedFromKm', v_event.corrected_from_km,
    -- Deixa explícito para o cliente que a data pedida foi ignorada.
    'occurredAtStampedByServer', (p_correction_of_id is not null)
  );
end;
$$;

comment on function public.register_odometer_reading is
  'Ajuste manual de quilometragem. Exige odometer.adjust e justificativa. Correção histórica é '
  'registrada no instante atual apontando o evento corrigido (DB-AUD2-004). Sempre auditado.';

-- ---------------------------------------------------------------------------
-- 1.4 Autoteste passa a cobrir TODOS os eventos
-- ---------------------------------------------------------------------------
-- A exclusão de correções existia porque o modelo antigo as deixava fora de
-- ordem. Sem essa exceção no modelo de escrita, o autoteste também não precisa
-- dela — e fica mais forte.
create or replace function private.data_integrity_selftest()
returns table (severity text, finding text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'critical', 'current_odometer_km divergente do ledger',
         (v.plate || ': cache=' || v.current_odometer_km || ' ledger=' || coalesce(l.max_km, 0))::text
  from public.vehicles v
  left join (
    select vehicle_id, max(odometer_km) as max_km
    from public.vehicle_odometer_events group by vehicle_id
  ) l on l.vehicle_id = v.id
  where v.current_odometer_km <> coalesce(l.max_km, v.current_odometer_km)

  union all
  select 'critical', 'regressão no ledger de odômetro',
         (e.vehicle_id::text || ' evento ' || e.id::text)::text
  from public.vehicle_odometer_events e
  where e.previous_km is not null and e.odometer_km < e.previous_km

  union all
  -- DB-AUD2-004: sem exceção para correções. A invariante é formulada de modo
  -- INDEPENDENTE DE ORDEM: para quaisquer dois eventos do mesmo veículo, se um
  -- ocorreu antes, sua quilometragem não pode ser maior.
  --
  -- Usar lag() sobre (occurred_at, created_at, id) seria frágil: dentro de uma
  -- mesma transação now() é constante, dois eventos empatam nas duas primeiras
  -- colunas e o desempate cairia no id aleatório, acusando inversão onde não há.
  -- EXCLUDE GROUP compara cada evento apenas com os ESTRITAMENTE anteriores.
  select 'critical', 'ledger fora de ordem cronológica',
         (o.vehicle_id::text || ' evento ' || o.id::text)::text
  from (
    select e.id, e.vehicle_id, e.odometer_km,
           max(e.odometer_km) over (
             partition by e.vehicle_id order by e.occurred_at
             range between unbounded preceding and current row exclude group
           ) as max_before
    from public.vehicle_odometer_events e
  ) o
  where o.max_before is not null and o.odometer_km < o.max_before

  union all
  -- DB-AUD2-004: correção precisa apontar evento do mesmo veículo e anterior a si.
  select 'critical', 'correção de odômetro incoerente', e.id::text
  from public.vehicle_odometer_events e
  join public.vehicle_odometer_events alvo on alvo.id = e.correction_of_id
  where e.correction_of_id is not null
    and (alvo.vehicle_id <> e.vehicle_id
         or alvo.occurred_at > e.occurred_at
         or e.corrected_from_km is distinct from alvo.odometer_km)

  union all
  select 'critical', 'movimentação fora de alternância',
         (m.vehicle_id::text || ' seq ' || m.sequence_no::text)::text
  from public.vehicle_movements m
  where (m.sequence_no % 2 = 1 and m.movement_type <> 'entry')
     or (m.sequence_no % 2 = 0 and m.movement_type <> 'exit')

  union all
  select 'critical', 'buraco na sequência de movimentações',
         (t.vehicle_id::text || ' esperado ' || t.expected || ' encontrado ' || t.found)::text
  from (
    select vehicle_id, max(sequence_no) as found, count(*)::integer as expected
    from public.vehicle_movements group by vehicle_id
  ) t
  where t.found <> t.expected

  union all
  select 'critical', 'total de abastecimento divergente', f.id::text
  from public.fuelings f
  where f.total_amount <> round(f.liters * f.price_per_liter, 2)

  union all
  select 'critical', 'abastecimento com produto inválido', f.id::text
  from public.fuelings f
  where f.fuel_type in ('flex', 'electric')

  union all
  select 'critical', 'movimentação originada de leitura não confirmada', m.id::text
  from public.vehicle_movements m
  join public.plate_read_events e on e.id = m.plate_read_event_id
  where e.status <> 'confirmed'

  union all
  select 'critical', 'movimentação OCR com veículo divergente da leitura', m.id::text
  from public.vehicle_movements m
  join public.plate_read_events e on e.id = m.plate_read_event_id
  where e.matched_vehicle_id is distinct from m.vehicle_id

  union all
  select 'critical', 'manutenção concluída sem custo positivo', m.id::text
  from public.maintenance_records m
  where m.status = 'completed' and coalesce(m.total_cost, 0) <= 0

  union all
  select 'critical', 'veículo com mais de uma manutenção em andamento', t.vehicle_id::text
  from (
    select vehicle_id, count(*) as n
    from public.maintenance_records where status = 'in_progress' group by vehicle_id
  ) t
  where t.n > 1

  union all
  select 'critical', 'viagem concluída sem progressão de km', t.id::text
  from public.trips t
  where t.status = 'completed' and t.end_odometer_km <= t.start_odometer_km

  union all
  select 'critical', 'relacionamento cruzando empresa', t.id::text
  from public.trips t
  join public.vehicles v on v.id = t.vehicle_id
  where v.company_id <> t.company_id

  union all
  select 'critical', 'ator de viagem sem vínculo com a empresa', t.id::text
  from public.trips t
  where not private.actor_belongs_to_company(t.created_by, t.company_id)
     or not private.actor_belongs_to_company(t.cancelled_by, t.company_id)

  union all
  select 'critical', 'empresa ativa sem administrador efetivo', c.trade_name::text
  from public.companies c
  where c.status = 'active'
    and private.count_effective_admins(c.id, null) = 0;
$$;

revoke all on function private.data_integrity_selftest() from public, anon, authenticated;
grant execute on function private.data_integrity_selftest() to service_role;

-- =============================================================================
-- 2. DB-AUD2-006 — company_members() é RPC de contexto autenticado
-- =============================================================================
-- A função depende de auth.uid() através de assert_permission() e
-- current_user_company_id(). Chamada com service role ela não tem identidade e
-- falha — foi exatamente o bug DB-AUD2-001. Manter o grant só confundia o
-- contrato, então ele sai.
revoke execute on function public.company_members() from service_role;

comment on function public.company_members() is
  'Lista de membros da empresa do CHAMADOR AUTENTICADO. Depende de auth.uid(); '
  'não funciona com service role (DB-AUD2-001/006). Uso administrativo: admin_list_company_members.';

-- Contrapartida administrativa explícita, para quando o canal service-role
-- realmente precisar da lista (a empresa vem por parâmetro, não do JWT).
create or replace function public.admin_list_company_members(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  if p_company_id is null then
    raise exception 'INVALID_INPUT: empresa obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.full_name), '[]'::jsonb)
    into v_items
  from (
    select m.user_id, p.full_name, p.phone, m.role,
           m.active as membership_active,
           p.active as profile_active,
           (m.active and p.active) as effective_active,
           m.created_at, p.last_seen_at
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id
    where m.company_id = p_company_id
    order by p.full_name
  ) t;

  return jsonb_build_object('companyId', p_company_id, 'members', v_items);
end;
$$;

revoke all on function public.admin_list_company_members(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_company_members(uuid) to service_role;

-- =============================================================================
-- 3. DB-AUD2-005 — idempotência vinculada à ação
-- =============================================================================
-- Antes bastava a chave. Reaproveitar a mesma chave em outra ação devolvia
-- silenciosamente o resultado anterior. Agora a chave carrega a impressão
-- digital de ação + alvo + payload, e divergência vira conflito explícito.
drop function if exists public.admin_find_action(uuid, text);
drop function if exists public.log_admin_action(uuid, uuid, text, uuid, jsonb, text, jsonb);

create or replace function public.admin_find_action(
  p_company_id      uuid,
  p_idempotency_key text,
  p_fingerprint     text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event       audit.events;
  v_fingerprint text;
begin
  if p_company_id is null or private.normalize_label(p_idempotency_key) is null then
    return null;
  end if;

  select * into v_event
  from audit.events e
  where e.company_id = p_company_id
    and e.metadata ->> 'idempotencyKey' = p_idempotency_key
  limit 1;

  if not found then
    return null;
  end if;

  v_fingerprint := v_event.metadata ->> 'fingerprint';

  if p_fingerprint is not null
     and v_fingerprint is not null
     and v_fingerprint <> p_fingerprint then
    raise exception
      'IDEMPOTENCY_KEY_REUSED: a chave % já foi usada para outra operação nesta empresa',
      p_idempotency_key
      using errcode = '23505', hint = 'IDEMPOTENCY_KEY_REUSED';
  end if;

  return jsonb_build_object(
    'eventId', v_event.id,
    'action', v_event.metadata ->> 'adminAction',
    'entityId', v_event.entity_id,
    'fingerprint', v_fingerprint,
    'result', coalesce(v_event.metadata -> 'result', 'null'::jsonb),
    'occurredAt', v_event.occurred_at
  );
end;
$$;

revoke all on function public.admin_find_action(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_find_action(uuid, text, text) to service_role;

create or replace function public.log_admin_action(
  p_company_id      uuid,
  p_actor_user_id   uuid,
  p_action          text,
  p_entity_id       uuid default null,
  p_metadata        jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_result          jsonb default null,
  p_fingerprint     text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
  v_metadata jsonb;
  v_key      text := private.normalize_label(p_idempotency_key);
begin
  if p_company_id is null then
    raise exception 'INVALID_INPUT: empresa obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_action is null or btrim(p_action) = '' then
    raise exception 'INVALID_INPUT: ação obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_actor_user_id is not null and not exists (
    select 1 from public.company_memberships m
    where m.user_id = p_actor_user_id and m.company_id = p_company_id
  ) then
    raise exception 'FORBIDDEN: autor não pertence à empresa informada'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'channel', 'edge-function',
    'function', 'admin-users',
    'adminAction', p_action
  );

  if v_key is not null then
    v_metadata := v_metadata || jsonb_build_object('idempotencyKey', v_key);
  end if;

  if p_fingerprint is not null then
    v_metadata := v_metadata || jsonb_build_object('fingerprint', p_fingerprint);
  end if;

  if p_result is not null then
    v_metadata := v_metadata || jsonb_build_object('result', p_result);
  end if;

  insert into audit.events (
    company_id, actor_user_id, action, entity, entity_id, changed_fields, metadata
  )
  values (
    p_company_id, p_actor_user_id, 'execute', 'admin.users', p_entity_id, null, v_metadata
  )
  returning id into v_event_id;

  return v_event_id;
exception
  when unique_violation then
    raise exception 'IDEMPOTENCY_CONFLICT: chave % já registrada para esta empresa', v_key
      using errcode = '23505', hint = 'CONFLICT_DUPLICATE';
end;
$$;

revoke all on function public.log_admin_action(uuid, uuid, text, uuid, jsonb, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.log_admin_action(uuid, uuid, text, uuid, jsonb, text, jsonb, text)
  to service_role;

-- =============================================================================
-- 4. DB-AUD2-002 / DB-AUD2-003 — operações administrativas TRANSACIONAIS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1 Provisionamento de membro
-- ---------------------------------------------------------------------------
-- Profile, membership e auditoria em UMA transação. Falhou a auditoria, o
-- PostgreSQL desfaz tudo: não há membership histórica apagada nem profile
-- meio-alterado, porque não chega a existir estado parcial.
create or replace function public.admin_provision_member(
  p_company_id        uuid,
  p_actor_user_id     uuid,
  p_user_id           uuid,
  p_email             text,
  p_full_name         text,
  p_phone             text default null,
  p_role              public.membership_role default 'viewer',
  p_idempotency_key   text default null,
  p_fingerprint       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile          public.profiles;
  v_membership       public.company_memberships;
  v_profile_created  boolean := false;
  v_membership_prior jsonb   := null;
  v_other_company    uuid;
  v_result           jsonb;
begin
  if p_company_id is null or p_user_id is null then
    raise exception 'INVALID_INPUT: empresa e usuário são obrigatórios'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if private.normalize_label(p_full_name) is null then
    raise exception 'INVALID_INPUT: nome completo é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- Vínculo ativo em OUTRA empresa impede o provisionamento (ADR-004).
  select m.company_id into v_other_company
  from public.company_memberships m
  where m.user_id = p_user_id and m.active and m.company_id <> p_company_id
  limit 1;

  if v_other_company is not null then
    raise exception 'USER_ALREADY_LINKED: usuário já possui vínculo ativo com outra empresa'
      using errcode = '23505', hint = 'USER_ALREADY_LINKED';
  end if;

  -- -----------------------------------------------------------------------
  -- Profile: usuário NOVO x usuário EXISTENTE (DB-AUD2-002)
  -- -----------------------------------------------------------------------
  select * into v_profile from public.profiles where id = p_user_id for update;

  if not found then
    -- Conta nova: o profile nasce aqui, ativo. Não é reativação de nada.
    insert into public.profiles (id, full_name, phone, active)
    values (p_user_id, private.normalize_label(p_full_name), private.normalize_label(p_phone), true)
    returning * into v_profile;
    v_profile_created := true;
  else
    -- Conta existente: o administrador EMPRESARIAL não governa o estado global.
    -- Um profile suspenso continua suspenso; reativar é ato da plataforma, via
    -- admin_set_profile_active. Era exatamente o furo do achado DB-AUD2-002.
    if not v_profile.active then
      raise exception
        'PROFILE_GLOBALLY_INACTIVE: o usuário % está suspenso globalmente e não pode ser '
        'vinculado por um administrador de empresa', p_email
        using errcode = '42501', hint = 'PROFILE_GLOBALLY_INACTIVE';
    end if;
    -- Nome e telefone de um usuário que já existe NÃO são sobrescritos: são
    -- dados globais dele, não da empresa que está convidando.
  end if;

  -- -----------------------------------------------------------------------
  -- Membership: o que a empresa realmente administra
  -- -----------------------------------------------------------------------
  select * into v_membership
  from public.company_memberships
  where company_id = p_company_id and user_id = p_user_id
  for update;

  if found then
    v_membership_prior := jsonb_build_object('role', v_membership.role, 'active', v_membership.active);
    update public.company_memberships
       set role = p_role, active = true
     where id = v_membership.id
    returning * into v_membership;
  else
    insert into public.company_memberships (company_id, user_id, role, active)
    values (p_company_id, p_user_id, p_role, true)
    returning * into v_membership;
  end if;

  v_result := jsonb_build_object(
    'userId', p_user_id,
    'email', p_email,
    'role', p_role,
    'status', 'provisioned',
    'profileCreated', v_profile_created,
    'profileFullName', v_profile.full_name,
    'membershipRestored', (v_membership_prior is not null)
  );

  -- Auditoria na MESMA transação. Se falhar, tudo acima é desfeito.
  perform public.log_admin_action(
    p_company_id      => p_company_id,
    p_actor_user_id   => p_actor_user_id,
    p_action          => 'user_provisioned',
    p_entity_id       => p_user_id,
    p_metadata        => jsonb_build_object(
                           'email', p_email,
                           'role', p_role,
                           'profileCreated', v_profile_created,
                           'membershipPrior', v_membership_prior
                         ),
    p_idempotency_key => p_idempotency_key,
    p_result          => v_result,
    p_fingerprint     => p_fingerprint
  );

  return v_result;
end;
$$;

comment on function public.admin_provision_member is
  'Provisiona membro de forma ATÔMICA: profile (só se novo), membership e auditoria na mesma '
  'transação. Recusa profile globalmente inativo (DB-AUD2-002) e dispensa compensação (DB-AUD2-003).';

revoke all on function public.admin_provision_member(
  uuid, uuid, uuid, text, text, text, public.membership_role, text, text
) from public, anon, authenticated;
grant execute on function public.admin_provision_member(
  uuid, uuid, uuid, text, text, text, public.membership_role, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 4.2 Ativação/desativação de vínculo
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_membership_active(
  p_company_id      uuid,
  p_actor_user_id   uuid,
  p_user_id         uuid,
  p_active          boolean,
  p_idempotency_key text default null,
  p_fingerprint     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_previous   boolean;
  v_result     jsonb;
begin
  if p_active is null then
    raise exception 'INVALID_INPUT: estado é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_user_id = p_actor_user_id and not p_active then
    raise exception 'CANNOT_DEACTIVATE_SELF: o administrador não pode desativar a si mesmo'
      using errcode = '55000', hint = 'CANNOT_DEACTIVATE_SELF';
  end if;

  select * into v_membership
  from public.company_memberships
  where company_id = p_company_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: usuário % não pertence à empresa %', p_user_id, p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  v_previous := v_membership.active;

  -- Idempotente por natureza: reativar quem já está ativo não muda nada, e o
  -- rollback de uma falha devolve exatamente v_previous (DB-AUD2-003).
  update public.company_memberships
     set active = p_active
   where id = v_membership.id;

  v_result := jsonb_build_object(
    'userId', p_user_id,
    'active', p_active,
    'previousActive', v_previous,
    'changed', (v_previous is distinct from p_active)
  );

  perform public.log_admin_action(
    p_company_id      => p_company_id,
    p_actor_user_id   => p_actor_user_id,
    p_action          => case when p_active then 'user_reactivated' else 'user_deactivated' end,
    p_entity_id       => p_user_id,
    p_metadata        => jsonb_build_object('role', v_membership.role, 'previousActive', v_previous),
    p_idempotency_key => p_idempotency_key,
    p_result          => v_result,
    p_fingerprint     => p_fingerprint
  );

  return v_result;
end;
$$;

revoke all on function public.admin_set_membership_active(uuid, uuid, uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_membership_active(uuid, uuid, uuid, boolean, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4.3 Troca de papel
-- ---------------------------------------------------------------------------
create or replace function public.admin_change_member_role(
  p_company_id      uuid,
  p_actor_user_id   uuid,
  p_user_id         uuid,
  p_role            public.membership_role,
  p_idempotency_key text default null,
  p_fingerprint     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_previous   public.membership_role;
  v_result     jsonb;
begin
  if p_role is null then
    raise exception 'INVALID_INPUT: papel é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  select * into v_membership
  from public.company_memberships
  where company_id = p_company_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: usuário % não pertence à empresa %', p_user_id, p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  v_previous := v_membership.role;

  update public.company_memberships
     set role = p_role
   where id = v_membership.id;

  v_result := jsonb_build_object(
    'userId', p_user_id,
    'role', p_role,
    'previousRole', v_previous,
    'changed', (v_previous is distinct from p_role)
  );

  perform public.log_admin_action(
    p_company_id      => p_company_id,
    p_actor_user_id   => p_actor_user_id,
    p_action          => 'user_role_changed',
    p_entity_id       => p_user_id,
    p_metadata        => jsonb_build_object('previousRole', v_previous, 'newRole', p_role),
    p_idempotency_key => p_idempotency_key,
    p_result          => v_result,
    p_fingerprint     => p_fingerprint
  );

  return v_result;
end;
$$;

revoke all on function public.admin_change_member_role(
  uuid, uuid, uuid, public.membership_role, text, text
) from public, anon, authenticated;
grant execute on function public.admin_change_member_role(
  uuid, uuid, uuid, public.membership_role, text, text
) to service_role;
