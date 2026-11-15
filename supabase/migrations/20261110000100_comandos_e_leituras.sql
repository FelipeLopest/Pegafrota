-- Comandos estáveis e correções por eventos compensatórios. Os originais não são alterados.
begin;

create table private.operation_commands (
  company_id uuid not null references public.companies(id) on delete cascade,
  command_id uuid not null,
  action text not null,
  fingerprint text not null,
  actor_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key(company_id,command_id)
);
revoke all on private.operation_commands from public,anon,authenticated,service_role;

create function private.begin_operation(p_company uuid,p_command uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_comando private.operation_commands; v_hash text;
begin
 if p_command is null then raise exception 'COMMAND_REQUIRED: identificador da operação é obrigatório' using hint='VALIDATION_ERROR'; end if;
 v_hash:=encode(extensions.digest(coalesce(p_payload,'null'::jsonb)::text,'sha256'),'hex');
 insert into private.operation_commands(company_id,command_id,action,fingerprint,actor_id)
 values(p_company,p_command,p_action,v_hash,private.current_user_id()) on conflict do nothing;
 select * into v_comando from private.operation_commands where company_id=p_company and command_id=p_command for update;
 if v_comando.action<>p_action or v_comando.fingerprint<>v_hash or v_comando.actor_id<>private.current_user_id() then
   raise exception 'IDEMPOTENCY_REUSE: identificador já usado para outra solicitação' using hint='IDEMPOTENCY_REUSE';
 end if;
 return v_comando.result;
end $$;
create function private.finish_operation(p_company uuid,p_command uuid,p_result jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 update private.operation_commands set result=p_result where company_id=p_company and command_id=p_command and actor_id=private.current_user_id();
 return p_result;
end $$;
revoke all on function private.begin_operation(uuid,uuid,text,jsonb),private.finish_operation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create table private.odometer_baselines (
 vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
 odometer_km public.odometer_km not null
);
insert into private.odometer_baselines(vehicle_id,odometer_km)
 select v.id,coalesce((select min(coalesce(e.previous_km,0)) from public.vehicle_odometer_events e where e.vehicle_id=v.id),v.current_odometer_km) from public.vehicles v;
create table private.odometer_revisions (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 event_id uuid not null references public.vehicle_odometer_events(id) on delete restrict,
 corrected_km public.odometer_km not null,
 correction_event_id uuid not null references public.vehicle_odometer_events(id) deferrable initially deferred,
 reason text not null check(char_length(btrim(reason))>=10),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp()
);
create index odometer_revisions_event_idx on private.odometer_revisions(event_id,created_at desc,id desc);
create table private.odometer_voids (
 event_id uuid primary key references public.vehicle_odometer_events(id) on delete restrict,
 company_id uuid not null references public.companies(id) on delete cascade,
 reason text not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create trigger odometer_revisions_no_update before update or delete on private.odometer_revisions for each row execute function private.tg_forbid_update_delete();
create trigger odometer_voids_no_update before update or delete on private.odometer_voids for each row execute function private.tg_forbid_update_delete();
revoke all on private.odometer_baselines,private.odometer_revisions,private.odometer_voids from public,anon,authenticated,service_role;

create view private.effective_odometer_events as
 select e.*,coalesce(r.corrected_km,e.odometer_km) as effective_km
 from public.vehicle_odometer_events e
 left join lateral(select rr.corrected_km from private.odometer_revisions rr where rr.event_id=e.id order by rr.created_at desc,rr.id desc limit 1) r on true
 where not exists(select 1 from private.odometer_revisions marker where marker.correction_event_id=e.id)
   and not exists(select 1 from private.odometer_voids x where x.event_id=e.id);
revoke all on private.effective_odometer_events from public,anon,authenticated,service_role;

create function private.refresh_odometer(p_vehicle uuid)
returns numeric language plpgsql volatile security definer set search_path='' as $$
declare v_km numeric;
begin
 select effective_km into v_km from private.effective_odometer_events where vehicle_id=p_vehicle order by occurred_at desc,created_at desc,id desc limit 1;
 if v_km is null then select odometer_km into v_km from private.odometer_baselines where vehicle_id=p_vehicle; end if;
 update public.vehicles set current_odometer_km=coalesce(v_km,current_odometer_km) where id=p_vehicle returning current_odometer_km into v_km;
 return v_km;
end $$;
revoke all on function private.refresh_odometer(uuid) from public,anon,authenticated,service_role;

create or replace function private.tg_odometer_ledger_insert()
returns trigger language plpgsql set search_path='' as $$
declare v_anterior numeric; v_seguinte numeric; v_corrigido public.vehicle_odometer_events;
begin
 if new.occurred_at>now()+interval '5 minutes' then raise exception 'ODOMETER_FUTURE_EVENT: data no futuro' using hint='CHRONOLOGY_ERROR'; end if;
 if exists(select 1 from private.odometer_revisions r where r.correction_event_id=new.id and r.vehicle_id=new.vehicle_id) then
   select * into v_corrigido from public.vehicle_odometer_events where id=new.correction_of_id and vehicle_id=new.vehicle_id;
   if not found then raise exception 'ODOMETER_CORRECTION_TARGET_NOT_FOUND' using hint='NOT_FOUND'; end if;
   new.corrected_from_km:=v_corrigido.odometer_km;
   new.previous_km:=new.odometer_km;
   return new;
 end if;
 select effective_km into v_anterior from private.effective_odometer_events where vehicle_id=new.vehicle_id and occurred_at<=new.occurred_at order by occurred_at desc,created_at desc,id desc limit 1;
 select effective_km into v_seguinte from private.effective_odometer_events where vehicle_id=new.vehicle_id and occurred_at>new.occurred_at order by occurred_at,created_at,id limit 1;
 if v_anterior is null then select odometer_km into v_anterior from private.odometer_baselines where vehicle_id=new.vehicle_id; end if;
 if new.odometer_km<coalesce(v_anterior,0) or (v_seguinte is not null and new.odometer_km>v_seguinte) then
   raise exception 'ODOMETER_CHRONOLOGY_CONFLICT: leitura não cabe entre as leituras válidas anterior (%) e posterior (%)',v_anterior,v_seguinte using errcode='23514',hint='ODOMETER_REGRESSION';
 end if;
 new.previous_km:=coalesce(v_anterior,0);
 if new.correction_of_id is not null then
   select * into v_corrigido from public.vehicle_odometer_events where id=new.correction_of_id and vehicle_id=new.vehicle_id;
   if not found or private.normalize_label(new.reason) is null then raise exception 'ODOMETER_CORRECTION_INVALID' using hint='VALIDATION_ERROR'; end if;
   new.corrected_from_km:=v_corrigido.odometer_km;
 end if;
 return new;
end $$;

create or replace function private.record_odometer_event(
 p_vehicle_id uuid,p_odometer_km numeric,p_occurred_at timestamptz,p_source_type public.odometer_source_type,p_source_id uuid default null,p_reason text default null,p_correction_of_id uuid default null
) returns public.vehicle_odometer_events language plpgsql volatile security definer set search_path='' as $$
declare v_veiculo public.vehicles; v_evento public.vehicle_odometer_events; v_data timestamptz:=coalesce(p_occurred_at,now());
begin
 if p_odometer_km is null or p_odometer_km<0 then raise exception 'VALIDATION_ERROR: informe a quilometragem real' using hint='VALIDATION_ERROR'; end if;
 select * into v_veiculo from public.vehicles where id=p_vehicle_id for update;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND'; end if;
 perform private.assert_company_access(v_veiculo.company_id);
 if v_veiculo.archived_at is not null then raise exception 'VEHICLE_ARCHIVED' using hint='CONFLICT_ARCHIVED'; end if;
 insert into private.odometer_baselines(vehicle_id,odometer_km) values(p_vehicle_id,v_veiculo.current_odometer_km) on conflict do nothing;
 if p_correction_of_id is not null then v_data:=now(); end if;
 insert into public.vehicle_odometer_events(company_id,vehicle_id,occurred_at,odometer_km,previous_km,source_type,source_id,reason,correction_of_id,created_by)
 values(v_veiculo.company_id,p_vehicle_id,v_data,p_odometer_km,null,p_source_type,p_source_id,private.normalize_label(p_reason),p_correction_of_id,private.current_user_id()) returning * into v_evento;
 perform private.refresh_odometer(p_vehicle_id);
 return v_evento;
end $$;

create function public.correct_odometer(p_vehicle_id uuid,p_event_id uuid,p_odometer_km numeric,p_reason text,p_command_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_veiculo public.vehicles; v_evento private.effective_odometer_events; v_antes numeric; v_depois numeric; v_marcador uuid:=gen_random_uuid(); v_km numeric; v_cache jsonb;
begin
 perform private.assert_permission('odometer.adjust');
 select * into v_veiculo from public.vehicles where id=p_vehicle_id for update;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND'; end if;
 perform private.assert_company_access(v_veiculo.company_id);
 v_cache:=private.begin_operation(v_veiculo.company_id,p_command_id,'correct_odometer',jsonb_build_array(p_vehicle_id,p_event_id,p_odometer_km,p_reason)); if v_cache is not null then return v_cache; end if;
 if v_veiculo.archived_at is not null or p_odometer_km is null or p_odometer_km<0 or char_length(btrim(coalesce(p_reason,'')))<10 then raise exception 'VALIDATION_ERROR: correção exige leitura válida e motivo de pelo menos 10 caracteres' using hint='VALIDATION_ERROR'; end if;
 select * into v_evento from private.effective_odometer_events where vehicle_id=p_vehicle_id and (p_event_id is null or id=p_event_id) order by occurred_at desc,created_at desc,id desc limit 1;
 if not found then raise exception 'ODOMETER_EVENT_NOT_FOUND: selecione uma leitura válida do histórico' using hint='NOT_FOUND'; end if;
 if v_evento.correction_of_id is not null then raise exception 'CORRECTION_TARGET_INVALID: selecione a leitura original' using hint='VALIDATION_ERROR'; end if;
 select effective_km into v_antes from private.effective_odometer_events where vehicle_id=p_vehicle_id and (occurred_at,created_at,id)<(v_evento.occurred_at,v_evento.created_at,v_evento.id) order by occurred_at desc,created_at desc,id desc limit 1;
 select effective_km into v_depois from private.effective_odometer_events where vehicle_id=p_vehicle_id and (occurred_at,created_at,id)>(v_evento.occurred_at,v_evento.created_at,v_evento.id) order by occurred_at,created_at,id limit 1;
 if p_odometer_km<coalesce(v_antes,0) or (v_depois is not null and p_odometer_km>v_depois) then raise exception 'CORRECTION_CONFLICT: leitura deve estar entre % e %; corrija as leituras dependentes na ordem apropriada',v_antes,v_depois using hint='ODOMETER_REGRESSION'; end if;
 insert into private.odometer_revisions(company_id,vehicle_id,event_id,corrected_km,correction_event_id,reason,created_by) values(v_veiculo.company_id,p_vehicle_id,v_evento.id,p_odometer_km,v_marcador,p_reason,private.current_user_id());
 v_km:=private.refresh_odometer(p_vehicle_id);
 insert into public.vehicle_odometer_events(id,company_id,vehicle_id,occurred_at,odometer_km,previous_km,source_type,reason,correction_of_id,created_by)
 values(v_marcador,v_veiculo.company_id,p_vehicle_id,now(),v_km,v_km,'manual_adjustment',p_reason,v_evento.id,private.current_user_id());
 perform private.log_audit_event(v_veiculo.company_id,'execute','public.vehicle_odometer_events',v_marcador,jsonb_build_object('effectiveKm',jsonb_build_object('old',v_evento.effective_km,'new',p_odometer_km)),jsonb_build_object('rpc','correct_odometer','originalEventId',v_evento.id,'reason',p_reason));
 return private.finish_operation(v_veiculo.company_id,p_command_id,jsonb_build_object('eventId',v_marcador,'originalEventId',v_evento.id,'currentOdometerKm',v_km,'correctedKm',p_odometer_km));
end $$;

alter table public.fuelings add column voided_at timestamptz,add column void_reason text,add column voided_by uuid references public.profiles(id),add column unit text generated always as (case when fuel_type='cng'::public.fuel_type then 'm3'::text else 'L'::text end) stored;
create function private.tg_fueling_void_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if private.is_api_role() and (new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason or new.voided_by is distinct from old.voided_by) then raise exception 'USE_RPC: estorno exige operação auditada' using hint='USE_RPC'; end if;
 return new;
end $$;
create trigger fuelings_void_guard before update on public.fuelings for each row execute function private.tg_fueling_void_guard();

create function public.save_fueling(
 p_vehicle_id uuid,p_liters numeric,p_price_per_liter numeric,p_odometer_km numeric,p_fuel_type public.fuel_type,p_fueled_at timestamptz,p_driver_id uuid,p_trip_id uuid,p_station_name text,p_full_tank boolean,p_notes text,p_total_amount numeric,p_command_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_empresa uuid; v_cache jsonb; v_resultado jsonb;
begin
 perform private.assert_permission('fuelings.write');
 select company_id into v_empresa from public.vehicles where id=p_vehicle_id;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND'; end if;
 perform private.assert_company_access(v_empresa);
 v_cache:=private.begin_operation(v_empresa,p_command_id,'save_fueling',jsonb_build_array(p_vehicle_id,p_liters,p_price_per_liter,p_odometer_km,p_fuel_type,p_fueled_at,p_driver_id,p_trip_id,p_station_name,p_full_tank,p_notes,p_total_amount));
 if v_cache is not null then return v_cache; end if;
 if p_fuel_type in ('flex','electric') then raise exception 'FUELING_PRODUCT_REQUIRED: selecione o produto efetivamente abastecido' using hint='VALIDATION_ERROR'; end if;
 v_resultado:=public.register_fueling(p_vehicle_id,p_liters,p_price_per_liter,p_odometer_km,p_fuel_type,p_fueled_at,p_driver_id,p_trip_id,p_station_name,p_full_tank,p_notes,p_total_amount);
 return private.finish_operation(v_empresa,p_command_id,v_resultado);
end $$;

create function public.reverse_fueling(p_fueling_id uuid,p_reason text,p_command_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_abastecimento public.fuelings; v_veiculo public.vehicles; v_cache jsonb; v_km numeric;
begin
 perform private.assert_permission('fuelings.write'); perform private.assert_permission('odometer.adjust');
 select * into v_abastecimento from public.fuelings where id=p_fueling_id;
 if not found then raise exception 'FUELING_NOT_FOUND' using hint='NOT_FOUND'; end if;
 perform private.assert_company_access(v_abastecimento.company_id);
 v_cache:=private.begin_operation(v_abastecimento.company_id,p_command_id,'reverse_fueling',jsonb_build_array(p_fueling_id,p_reason)); if v_cache is not null then return v_cache; end if;
 select * into v_veiculo from public.vehicles where id=v_abastecimento.vehicle_id for update;
 select * into v_abastecimento from public.fuelings where id=p_fueling_id for update;
 if char_length(btrim(coalesce(p_reason,'')))<10 then raise exception 'REASON_REQUIRED: informe pelo menos 10 caracteres' using hint='VALIDATION_ERROR'; end if;
 if v_abastecimento.voided_at is not null then raise exception 'FUELING_ALREADY_VOIDED: lançamento já estornado' using hint='CONFLICT_STATE'; end if;
 insert into private.odometer_voids(event_id,company_id,reason,created_by)
 select id,company_id,p_reason,private.current_user_id() from public.vehicle_odometer_events where source_type='fueling' and source_id=p_fueling_id on conflict do nothing;
 update public.fuelings set voided_at=now(),void_reason=p_reason,voided_by=private.current_user_id() where id=p_fueling_id;
 v_km:=private.refresh_odometer(v_abastecimento.vehicle_id);
 perform private.log_audit_event(v_abastecimento.company_id,'execute','public.fuelings',p_fueling_id,jsonb_build_object('voided',true),jsonb_build_object('rpc','reverse_fueling','reason',p_reason,'odometerEventSuperseded',true));
 return private.finish_operation(v_abastecimento.company_id,p_command_id,jsonb_build_object('fuelingId',p_fueling_id,'voided',true,'currentOdometerKm',v_km));
end $$;

create function public.fueling_effective_km(p_fueling_id uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_abastecimento public.fuelings; v_km numeric;
begin
 select * into v_abastecimento from public.fuelings where id=p_fueling_id;
 if not found then return null; end if;
 perform private.assert_company_access(v_abastecimento.company_id);
 select effective_km into v_km from private.effective_odometer_events where source_type='fueling' and source_id=p_fueling_id limit 1;
 return coalesce(v_km,v_abastecimento.odometer_km);
end $$;

create function public.odometer_effective_history(p_vehicle_id uuid,p_page integer default 1,p_page_size integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_empresa uuid; v_itens jsonb; v_total bigint; v_pagina int:=greatest(coalesce(p_page,1),1); v_tamanho int:=least(greatest(coalesce(p_page_size,50),1),200);
begin
 perform private.assert_permission('odometer.read'); select company_id into v_empresa from public.vehicles where id=p_vehicle_id;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND'; end if; perform private.assert_company_access(v_empresa);
 select count(*) into v_total from public.vehicle_odometer_events where vehicle_id=p_vehicle_id;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc,t.created_at desc,t.id desc),'[]'::jsonb) into v_itens from (
  select e.*,ef.effective_km,exists(select 1 from private.odometer_revisions r where r.event_id=e.id) as revised,
   exists(select 1 from private.odometer_voids x where x.event_id=e.id) as voided,
   exists(select 1 from private.odometer_revisions r where r.correction_event_id=e.id) as correction_marker
  from public.vehicle_odometer_events e left join private.effective_odometer_events ef on ef.id=e.id where e.vehicle_id=p_vehicle_id
  order by e.occurred_at desc,e.created_at desc,e.id desc limit v_tamanho offset (v_pagina-1)*v_tamanho
 ) t;
 return jsonb_build_object('items',v_itens,'total',v_total,'page',v_pagina,'pageSize',v_tamanho,'hasNext',v_pagina*v_tamanho<v_total);
end $$;

revoke all on function public.correct_odometer(uuid,uuid,numeric,text,uuid),public.save_fueling(uuid,numeric,numeric,numeric,public.fuel_type,timestamptz,uuid,uuid,text,boolean,text,numeric,uuid),public.reverse_fueling(uuid,text,uuid),public.fueling_effective_km(uuid),public.odometer_effective_history(uuid,integer,integer) from public,anon,service_role;
grant execute on function public.correct_odometer(uuid,uuid,numeric,text,uuid),public.save_fueling(uuid,numeric,numeric,numeric,public.fuel_type,timestamptz,uuid,uuid,text,boolean,text,numeric,uuid),public.reverse_fueling(uuid,text,uuid),public.fueling_effective_km(uuid),public.odometer_effective_history(uuid,integer,integer) to authenticated;

commit;
