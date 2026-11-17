-- Aceita manutenção concluída com custo zero e justificativa, como exige
-- a restrição de conclusão. As demais verificações e permissões são preservadas.

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
  where m.status = 'completed'
    and (m.total_cost is null or m.total_cost < 0
         or (m.total_cost = 0 and char_length(btrim(coalesce(m.no_charge_reason, ''))) < 10))

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
