-- Consultas paginadas e relatórios com calendário da empresa.
begin;

create or replace function private.fleet_text(p_value text)
returns text language sql immutable set search_path='' as $$
  select translate(lower(coalesce(p_value,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
$$;

create or replace function private.fleet_window(p_from date,p_to date)
returns table(start_at timestamptz,end_at timestamptz,from_day date,to_day date,zone text)
language plpgsql stable security definer set search_path='' as $$
declare z text; a date; b date;
begin
 select c.timezone into z from public.companies c where c.id=private.current_user_company_id();
 z:=coalesce(z,'America/Sao_Paulo'); b:=coalesce(p_to,(now() at time zone z)::date); a:=coalesce(p_from,b-29);
 if b<a or b-a>3660 then raise exception 'INVALID_INPUT: escolha um período válido de até dez anos' using hint='VALIDATION_ERROR'; end if;
 return query select a::timestamp at time zone z,(b+1)::timestamp at time zone z,a,b,z;
end $$;

create or replace function public.fleet_list(
 p_resource text,p_search text default null,p_filters jsonb default '{}'::jsonb,
 p_page integer default 1,p_page_size integer default 50
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; r text; src text; cond text; base text; ordenacao text; perm text;
 n bigint; all_n bigint; itens jsonb; resumo jsonb; facetas jsonb; pg integer:=least(100000,greatest(1,coalesce(p_page,1))); sz integer:=least(250,greatest(1,coalesce(p_page_size,50)));
begin
 c:=private.current_user_company_id(); r:=p_resource; p_filters:=coalesce(p_filters,'{}');
 if jsonb_typeof(p_filters)<>'object' then raise exception 'INVALID_INPUT' using hint='VALIDATION_ERROR'; end if;
 case r
 when 'vehicles' then perm:='vehicles.read'; src:='select to_jsonb(v) item,v.plate sort_key,v.created_at event_at from public.vehicles v where v.company_id=$1';
 when 'drivers' then perm:='drivers.read'; src:='select to_jsonb(d) item,d.full_name sort_key,d.created_at event_at from public.drivers d where d.company_id=$1';
 when 'locations' then perm:='locations.read'; src:='select to_jsonb(l) item,l.name sort_key,l.created_at event_at from public.locations l where l.company_id=$1';
 when 'trips' then perm:='trips.read'; src:='select to_jsonb(t)||jsonb_build_object(''vehicle_plate'',v.plate,''driver_name'',d.full_name) item,t.id::text sort_key,coalesce(t.actual_departure_at,t.planned_departure_at,t.created_at) event_at from public.trips t join public.vehicles v on v.id=t.vehicle_id and v.company_id=t.company_id left join public.drivers d on d.id=t.driver_id and d.company_id=t.company_id where t.company_id=$1';
 when 'fuelings' then perm:='fuelings.read'; src:='select to_jsonb(f)||jsonb_build_object(''vehicle_plate'',v.plate,''effective_odometer_km'',coalesce((select effective_km from private.effective_odometer_events where source_type=''fueling'' and source_id=f.id limit 1),f.odometer_km)) item,f.id::text sort_key,f.fueled_at event_at from public.fuelings f join public.vehicles v on v.id=f.vehicle_id and v.company_id=f.company_id where f.company_id=$1 and f.voided_at is null';
 when 'maintenance' then perm:='maintenance.read'; src:='select to_jsonb(m)||jsonb_build_object(''vehicle_plate'',v.plate,''current_odometer_km'',v.current_odometer_km,''plan_active'',coalesce(p.active,false),''is_overdue'',coalesce(m.status=''scheduled'' and v.archived_at is null and (m.scheduled_for<=now() or m.scheduled_odometer_km<=v.current_odometer_km),false)) item,m.id::text sort_key,m.scheduled_for event_at from public.maintenance_records m join public.vehicles v on v.id=m.vehicle_id and v.company_id=m.company_id left join public.maintenance_plans p on p.id=m.plan_id and p.company_id=m.company_id where m.company_id=$1 and m.archived_at is null';
 when 'movements' then perm:='movements.read'; src:='select to_jsonb(m)||jsonb_build_object(''vehicle_plate'',v.plate,''location_name'',l.name) item,m.id::text sort_key,m.occurred_at event_at from public.vehicle_movements m join public.vehicles v on v.id=m.vehicle_id and v.company_id=m.company_id left join public.locations l on l.id=m.location_id and l.company_id=m.company_id where m.company_id=$1';
 else raise exception 'INVALID_INPUT: lista desconhecida' using hint='VALIDATION_ERROR';
 end case;
 perform private.assert_permission(perm);
 cond:='(nullif($2,'''') is null or strpos(private.fleet_text(item::text),private.fleet_text($2))>0)
 and (coalesce($3->>''visibility'','''')<>''current'' or item->>''archived_at'' is null)
 and (coalesce($3->>''visibility'','''')<>''archived'' or item->>''archived_at'' is not null)
 and (coalesce($3->>''status'','''')='''' or item->>''status''=$3->>''status'')
 and (coalesce($3->>''fuel'','''')='''' or item->>''fuel_type''=$3->>''fuel'')
 and (coalesce($3->>''brand'','''')='''' or item->>''brand''=$3->>''brand'')
 and (coalesce($3->>''vehicle'','''')='''' or item->>''vehicle_id''=$3->>''vehicle'')
 and (coalesce($3->>''driver'','''')='''' or item->>''driver_id''=$3->>''driver'')
 and (coalesce($3->>''location'','''')='''' or item->>''location_id''=$3->>''location'')
 and (coalesce($3->>''uf'','''')='''' or item->>''address_state''=$3->>''uf'')
 and (coalesce($3->>''category'','''')='''' or item->>''license_category''=$3->>''category'')
 and (coalesce($3->>''type'','''')='''' or coalesce(item->>''movement_type'',item->>''maintenance_type'')=$3->>''type'')
 and (coalesce($3->>''state'','''')<>''current'' or item->>''archived_at'' is null)
 and (coalesce($3->>''state'','''')<>''archived'' or item->>''archived_at'' is not null)
 and (coalesce($3->>''state'','''')<>''active'' or (item->>''active''=''true'' and item->>''archived_at'' is null))
 and (coalesce($3->>''state'','''')<>''inactive'' or (item->>''active''=''false'' and item->>''archived_at'' is null))
 and (coalesce($3->>''license'','''')='''' or case $3->>''license''
 when ''unknown'' then item->>''license_expires_on'' is null
 when ''expired'' then (item->>''license_expires_on'')::date<current_date
 when ''30d'' then (item->>''license_expires_on'')::date between current_date and current_date+30
 when ''valid'' then (item->>''license_expires_on'')::date>current_date+30 else false end)
 and (coalesce($3->>''due'','''')='''' or ($3->>''due''=''overdue'' and item->>''is_overdue''=''true''))
 and (coalesce($3->>''period'','''')='''' or case $3->>''period''
 when ''today'' then (event_at at time zone (select timezone from public.companies where id=$1))::date=(now() at time zone (select timezone from public.companies where id=$1))::date
 when ''7d'' then event_at between now()-interval ''7 days'' and now()
 when ''30d'' then event_at between now()-interval ''30 days'' and now()
 when ''90d'' then event_at between now()-interval ''90 days'' and now()
 when ''older'' then event_at<now()-interval ''90 days'' else false end)';
 base:='with base as ('||src||') ';
 execute base||'select count(*) from base' into all_n using c;
 execute base||'select count(*) from base where '||cond into n using c,p_search,p_filters;
 ordenacao:=case when r in ('vehicles','drivers','locations') then 'sort_key,id' else 'event_at desc nulls last,sort_key' end;
 -- O desempate por id está contido em item para listas de cadastro.
 ordenacao:=replace(ordenacao,',id',',item->>''id''');
 execute base||'select coalesce(jsonb_agg(item order by pos),''[]''::jsonb) from (select item,row_number() over(order by '||ordenacao||') pos from base where '||cond||' order by '||ordenacao||' limit $4 offset $5) q'
 into itens using c,p_search,p_filters,sz,(pg-1)*sz;
 execute base||'select jsonb_build_object(
 ''total'',count(*),''current'',count(*) filter(where item->>''archived_at'' is null),
 ''available'',count(*) filter(where item->>''status''=''available'' and item->>''archived_at'' is null),
 ''in_use'',count(*) filter(where item->>''status''=''in_use'' and item->>''archived_at'' is null),
 ''in_maintenance'',count(*) filter(where item->>''status''=''in_maintenance'' and item->>''archived_at'' is null),
 ''archived'',count(*) filter(where item->>''archived_at'' is not null),
 ''active'',count(*) filter(where item->>''active''=''true'' and item->>''archived_at'' is null),
 ''inactive'',count(*) filter(where item->>''active''=''false'' and item->>''archived_at'' is null),
 ''planned'',count(*) filter(where item->>''status''=''planned''),''in_progress'',count(*) filter(where item->>''status''=''in_progress''),
 ''completed'',count(*) filter(where item->>''status''=''completed''),''cancelled'',count(*) filter(where item->>''status''=''cancelled''),
 ''scheduled'',count(*) filter(where item->>''status''=''scheduled''),''overdue'',count(*) filter(where item->>''is_overdue''=''true''),
 ''states'',count(distinct item->>''address_state'') filter(where item->>''archived_at'' is null),
 ''last30'',count(*) filter(where event_at between now()-interval ''30 days'' and now()),
 ''license30'',count(*) filter(where item->>''archived_at'' is null and (item->>''license_expires_on'')::date<=current_date+30),
 ''amount'',coalesce(sum((item->>''total_amount'')::numeric),0),
 ''cost'',coalesce(sum((item->>''total_cost'')::numeric) filter(where item->>''status''=''completed''),0),
 ''liters'',coalesce(sum((item->>''liters'')::numeric) filter(where coalesce(item->>''unit'',''L'')=''L''),0),
 ''m3'',coalesce(sum((item->>''liters'')::numeric) filter(where item->>''unit''=''m3''),0)) from base'
 into resumo using c;
 execute base||'select jsonb_build_object(''brands'',coalesce(jsonb_agg(distinct item->>''brand'') filter(where item->>''brand'' is not null),''[]''),''categories'',coalesce(jsonb_agg(distinct item->>''license_category'') filter(where item->>''license_category'' is not null),''[]''),''states'',coalesce(jsonb_agg(distinct item->>''address_state'') filter(where item->>''address_state'' is not null),''[]'')) from base' into facetas using c;
 return jsonb_build_object('items',itens,'total',n,'allTotal',all_n,'page',pg,'pageSize',sz,'hasNext',pg::bigint*sz<n,'summary',resumo,'facets',facetas);
end $$;
revoke all on function public.fleet_list(text,text,jsonb,integer,integer) from public,anon;
grant execute on function public.fleet_list(text,text,jsonb,integer,integer) to authenticated;

create or replace function public.fleet_report(
 p_kind text,p_from date default null,p_to date default null,p_page integer default 1,
 p_page_size integer default 50,p_vehicle_id uuid default null,p_location_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; w record; sql_text text; pg integer:=least(100000,greatest(1,coalesce(p_page,1))); sz integer:=least(1000,greatest(1,coalesce(p_page_size,50))); n bigint; itens jsonb;
begin
 perform private.assert_permission('reports.read'); c:=private.current_user_company_id(); select * into w from private.fleet_window(p_from,p_to);
 case p_kind
 when 'monthlyCosts' then sql_text:='select jsonb_build_object(''month_start'',x.month_day,''fuel_cost'',coalesce(f.cost,0),''maintenance_cost'',coalesce(m.cost,0),''total_cost'',coalesce(f.cost,0)+coalesce(m.cost,0),''distance_km'',coalesce(t.km,0)) item,x.month_day::text ord from generate_series(date_trunc(''month'',$2 at time zone $5),date_trunc(''month'',($3-interval ''1 microsecond'') at time zone $5),interval ''1 month'') x(month_day)
 left join (select date_trunc(''month'',fueled_at at time zone $5) mo,sum(total_amount) cost from public.fuelings where company_id=$1 and voided_at is null and fueled_at >=$2 and fueled_at<$3 and ($4::uuid is null or vehicle_id=$4) group by 1) f on f.mo=x.month_day
 left join (select date_trunc(''month'',completed_at at time zone $5) mo,sum(total_cost) cost from public.maintenance_records where company_id=$1 and status=''completed'' and completed_at >=$2 and completed_at<$3 and ($4::uuid is null or vehicle_id=$4) group by 1) m on m.mo=x.month_day
 left join (select date_trunc(''month'',actual_return_at at time zone $5) mo,sum(private.trip_effective_distance(id,start_odometer_km,end_odometer_km)) km from public.trips where company_id=$1 and status in(''completed'',''cancelled'') and end_odometer_km is not null and actual_return_at >=$2 and actual_return_at<$3 and ($4::uuid is null or vehicle_id=$4) group by 1) t on t.mo=x.month_day';
 when 'vehicleCosts' then sql_text:='select jsonb_build_object(''vehicle_id'',v.id,''plate'',v.plate,''brand'',v.brand,''model'',v.model,''fuel_cost'',coalesce(f.cost,0),''maintenance_cost'',coalesce(m.cost,0),''total_cost'',coalesce(f.cost,0)+coalesce(m.cost,0),''distance_km'',coalesce(t.km,0),''cost_per_km'',round((coalesce(f.cost,0)+coalesce(m.cost,0))/nullif(t.km,0),4)) item,v.plate ord from public.vehicles v
 left join (select vehicle_id,sum(total_amount) cost from public.fuelings where company_id=$1 and voided_at is null and fueled_at >=$2 and fueled_at<$3 group by vehicle_id) f on f.vehicle_id=v.id
 left join (select vehicle_id,sum(total_cost) cost from public.maintenance_records where company_id=$1 and status=''completed'' and completed_at >=$2 and completed_at<$3 group by vehicle_id) m on m.vehicle_id=v.id
 left join (select vehicle_id,sum(private.trip_effective_distance(id,start_odometer_km,end_odometer_km)) km from public.trips where company_id=$1 and status in(''completed'',''cancelled'') and end_odometer_km is not null and actual_return_at >=$2 and actual_return_at<$3 group by vehicle_id) t on t.vehicle_id=v.id
 where v.company_id=$1 and ($4::uuid is null or v.id=$4)';
 when 'recentMovements' then sql_text:='select jsonb_build_object(''occurred_at'',m.occurred_at,''plate'',v.plate,''movement_type'',m.movement_type,''location_name'',l.name,''source'',m.source,''notes'',m.notes) item,m.occurred_at::text||m.id::text ord from public.vehicle_movements m join public.vehicles v on v.id=m.vehicle_id and v.company_id=m.company_id left join public.locations l on l.id=m.location_id and l.company_id=m.company_id where m.company_id=$1 and m.occurred_at >=$2 and m.occurred_at<$3 and ($4::uuid is null or m.vehicle_id=$4) and ($8::uuid is null or m.location_id=$8)';
 when 'maintenanceDue' then sql_text:='select value item,coalesce(value->>''scheduled_for'',''9999'')||(value->>''maintenance_id'') ord from (select to_jsonb(m) value from private.maintenance_attention($1) m) dados where ($4::uuid is null or value->>''vehicle_id''=$4::text) and (coalesce((value->>''is_overdue'')::boolean,false) or coalesce((value->>''is_due_soon'')::boolean,false))';
 when 'fuelEfficiency' then sql_text:='select to_jsonb(e)||jsonb_build_object(''plate'',v.plate) item,v.plate||e.unit ord from public.v_vehicle_energy_consumption e join public.vehicles v on v.id=e.vehicle_id where v.company_id=$1 and ($4::uuid is null or v.id=$4)';
 else raise exception 'INVALID_INPUT: relatório desconhecido' using hint='VALIDATION_ERROR';
 end case;
 execute 'select count(*) from ('||sql_text||') q' into n using c,w.start_at,w.end_at,p_vehicle_id,w.zone,sz,(pg-1)*sz,p_location_id;
 execute 'select coalesce(jsonb_agg(item order by ord),''[]''::jsonb) from ('||sql_text||' order by ord limit $6 offset $7) q' into itens using c,w.start_at,w.end_at,p_vehicle_id,w.zone,sz,(pg-1)*sz,p_location_id;
 return jsonb_build_object('items',itens,'total',n,'page',pg,'pageSize',sz,'hasNext',pg::bigint*sz<n,'period',jsonb_build_object('from',w.from_day,'to',w.to_day,'timezone',w.zone),'coverage',case when p_kind in ('vehicleCosts','monthlyCosts') then 'Combustível e manutenção; distância de viagens encerradas com leitura no período. Não inclui todos os custos de propriedade.' when p_kind='fuelEfficiency' then 'Ciclos válidos entre tanques cheios, com parciais intermediários; histórico completo, separado por unidade.' else 'Resultados da empresa e do recorte informado.' end);
end $$;
revoke all on function public.fleet_report(text,date,date,integer,integer,uuid,uuid) from public,anon;
grant execute on function public.fleet_report(text,date,date,integer,integer,uuid,uuid) to authenticated;

create or replace function public.vehicle_timeline(p_vehicle_id uuid,p_page integer default 1,p_page_size integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; itens jsonb; n bigint; pg integer:=least(100000,greatest(1,coalesce(p_page,1))); sz integer:=least(100,greatest(1,coalesce(p_page_size,30)));
begin
 perform private.assert_permission('vehicles.read'); select company_id into c from public.vehicles where id=p_vehicle_id; if c is null then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND';end if; perform private.assert_company_access(c);
 with eventos as (
 select f.id,f.fueled_at at_time,'Abastecimento' kind,concat(f.liters,' ',f.unit,' · R$ ',f.total_amount,case when f.voided_at is not null then ' · ESTORNADO' else '' end) description from public.fuelings f where f.vehicle_id=p_vehicle_id and private.has_permission('fuelings.read')
 union all select t.id,coalesce(t.actual_return_at,t.actual_departure_at,t.created_at),'Viagem',concat(t.origin_label,' → ',t.destination_label,' · ',t.status) from public.trips t where t.vehicle_id=p_vehicle_id and private.has_permission('trips.read')
 union all select m.id,coalesce(m.completed_at,m.started_at,m.created_at),'Manutenção',concat(m.description,' · ',m.status) from public.maintenance_records m where m.vehicle_id=p_vehicle_id and private.has_permission('maintenance.read')
 union all select mv.id,mv.occurred_at,'Pátio',concat(case when mv.movement_type='entry' then 'Entrada' else 'Saída' end,' · ',l.name) from public.vehicle_movements mv left join public.locations l on l.id=mv.location_id and l.company_id=mv.company_id where mv.vehicle_id=p_vehicle_id and private.has_permission('movements.read')
 union all select e.id,e.occurred_at,'Quilometragem',concat(coalesce(e.effective_km,e.odometer_km),' km',case when e.effective_km<>e.odometer_km then ' · leitura corrigida' else '' end) from private.effective_odometer_events e where e.vehicle_id=p_vehicle_id and private.has_permission('odometer.read')
 ) select count(*) into n from eventos;
 with eventos as (
 select f.id,f.fueled_at at_time,'Abastecimento' kind,concat(f.liters,' ',f.unit,' · R$ ',f.total_amount,case when f.voided_at is not null then ' · ESTORNADO' else '' end) description from public.fuelings f where f.vehicle_id=p_vehicle_id and private.has_permission('fuelings.read')
 union all select t.id,coalesce(t.actual_return_at,t.actual_departure_at,t.created_at),'Viagem',concat(t.origin_label,' → ',t.destination_label,' · ',t.status) from public.trips t where t.vehicle_id=p_vehicle_id and private.has_permission('trips.read')
 union all select m.id,coalesce(m.completed_at,m.started_at,m.created_at),'Manutenção',concat(m.description,' · ',m.status) from public.maintenance_records m where m.vehicle_id=p_vehicle_id and private.has_permission('maintenance.read')
 union all select mv.id,mv.occurred_at,'Pátio',concat(case when mv.movement_type='entry' then 'Entrada' else 'Saída' end,' · ',l.name) from public.vehicle_movements mv left join public.locations l on l.id=mv.location_id and l.company_id=mv.company_id where mv.vehicle_id=p_vehicle_id and private.has_permission('movements.read')
 union all select e.id,e.occurred_at,'Quilometragem',concat(coalesce(e.effective_km,e.odometer_km),' km',case when e.effective_km<>e.odometer_km then ' · leitura corrigida' else '' end) from private.effective_odometer_events e where e.vehicle_id=p_vehicle_id and private.has_permission('odometer.read')
 ) select coalesce(jsonb_agg(to_jsonb(x) order by x.at_time desc,x.id),'[]') into itens from(select * from eventos order by at_time desc,id limit sz offset (pg-1)*sz)x;
 return jsonb_build_object('items',itens,'total',n,'page',pg,'pageSize',sz,'hasNext',pg::bigint*sz<n);
end $$;
revoke all on function public.vehicle_timeline(uuid,integer,integer) from public,anon;
grant execute on function public.vehicle_timeline(uuid,integer,integer) to authenticated;

create or replace function public.fleet_overview(p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; w record; fleet jsonb; ops jsonb; costs jsonb; alerts jsonb; presence jsonb; attention jsonb; due jsonb; onboarding jsonb; fuel numeric; maint numeric;
begin
 perform private.assert_permission('dashboard.read'); c:=private.current_user_company_id(); select * into w from private.fleet_window(p_from,p_to);
 select jsonb_build_object('total',count(*) filter(where archived_at is null),'available',count(*) filter(where archived_at is null and status='available'),'inUse',count(*) filter(where archived_at is null and status='in_use'),'inMaintenance',count(*) filter(where archived_at is null and status='in_maintenance'),'inactive',count(*) filter(where archived_at is null and status='inactive'),'archived',count(*) filter(where archived_at is not null)) into fleet from public.vehicles where company_id=c;
 select coalesce(sum(total_amount),0) into fuel from public.fuelings where company_id=c and voided_at is null and fueled_at>=w.start_at and fueled_at<w.end_at;
 select coalesce(sum(total_cost),0) into maint from public.maintenance_records where company_id=c and status='completed' and completed_at>=w.start_at and completed_at<w.end_at;
 costs:=jsonb_build_object('fuelCost',fuel,'maintenanceCost',maint,'totalCost',fuel+maint);
 select jsonb_build_object('tripsInProgress',count(*) filter(where status='in_progress'),'tripsCompleted',count(*) filter(where status='completed' and actual_return_at>=w.start_at and actual_return_at<w.end_at),'distanceKm',coalesce(sum(private.trip_effective_distance(id,start_odometer_km,end_odometer_km)) filter(where status in('completed','cancelled') and end_odometer_km is not null and actual_return_at>=w.start_at and actual_return_at<w.end_at),0),'movements',(select count(*) from public.vehicle_movements where company_id=c and occurred_at>=w.start_at and occurred_at<w.end_at)) into ops from public.trips where company_id=c;
 -- A mesma fonte de pendências alimenta visão geral e relatório.
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into due from private.maintenance_attention(c) x;
 select jsonb_build_object('maintenanceOverdue',count(*) filter(where (value->>'is_overdue')::boolean),'maintenanceNext30Days',count(*) filter(where coalesce((value->>'is_due_soon')::boolean,false)),'licenseExpiring',(select count(*) from public.drivers where company_id=c and active and archived_at is null and license_expires_on<=((now() at time zone w.zone)::date+30)),'unknownPlateReads',(select count(*) from public.plate_read_events where company_id=c and status='unknown_plate' and captured_at>=w.start_at and captured_at<w.end_at),'lowConfidenceReads',(select count(*) from public.plate_read_events where company_id=c and status='low_confidence' and captured_at>=w.start_at and captured_at<w.end_at)) into alerts from jsonb_array_elements(due);
 select coalesce(jsonb_agg(jsonb_build_object('vehicleId',value->>'vehicle_id','label',concat(value->>'plate',' · ',value->>'description'),'detail',case when (value->>'overdue_by_odometer')::boolean then 'Quilometragem da revisão atingida' else 'Data da revisão vencida' end,'path','/manutencoes?veiculo='||(value->>'vehicle_id')||'&vencidas=1')),'[]') into attention from jsonb_array_elements(due) where (value->>'is_overdue')::boolean;
 select jsonb_build_object('vehicles',(fleet->>'total')::integer,'drivers',(select count(*) from public.drivers where company_id=c and active and archived_at is null),'locations',(select count(*) from public.locations where company_id=c and active and archived_at is null),'fuelings',(select count(*) from public.fuelings where company_id=c and voided_at is null),'unknownPresence',(select count(*) from public.vehicles v where v.company_id=c and v.archived_at is null and private.current_vehicle_movement(v.id) is null)) into onboarding;
 with estados as(select private.current_vehicle_movement(v.id) as tipo from public.vehicles v where v.company_id=c and v.archived_at is null)
 select jsonb_build_object('inside',count(*) filter(where tipo='entry'),'outside',count(*) filter(where tipo='exit'),'neverMoved',count(*) filter(where tipo is null)) into presence from estados;
 return jsonb_build_object('fleet',fleet,'operations',ops,'costs',costs,'alerts',alerts,'presence',presence,'attention',attention,'onboarding',onboarding,'period',jsonb_build_object('from',w.from_day,'to',w.to_day,'timezone',w.zone),'coverage','Custos: combustível e manutenção. Distância: viagens encerradas com leitura no período.');
end $$;
revoke all on function public.fleet_overview(date,date) from public,anon;
grant execute on function public.fleet_overview(date,date) to authenticated;

-- Filtros administrativos aplicados antes da paginação; execução só no servidor.
create or replace function platform.list_company_admins_filtered(
 p_actor_user_id uuid,p_company_id uuid default null,p_search text default null,
 p_access text default null,p_account text default null,p_page integer default 1,p_page_size integer default 25
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n bigint; itens jsonb; pg integer:=least(100000,greatest(1,coalesce(p_page,1))); sz integer:=least(100,greatest(1,coalesce(p_page_size,25))); busc text:=nullif(trim(p_search),'');
begin
 perform private.assert_platform_admin(p_actor_user_id);
 if p_access is not null and p_access not in('active','inactive') or p_account is not null and p_account not in('active','blocked') then raise exception 'INVALID_INPUT' using hint='VALIDATION_ERROR'; end if;
 select count(*) into n from public.company_memberships m join public.profiles p on p.id=m.user_id join public.companies c on c.id=m.company_id
 where m.role='company_admin' and (p_company_id is null or m.company_id=p_company_id)
 and (busc is null or private.fleet_text(concat(p.full_name,' ',c.trade_name)) like '%'||private.fleet_text(busc)||'%')
 and (p_access is null or m.active=(p_access='active')) and(p_account is null or p.active=(p_account='active'));
 select coalesce(jsonb_agg(x.item order by x.created_at desc,x.user_id),'[]') into itens from(
 select m.created_at,m.user_id,jsonb_build_object('userId',p.id,'fullName',p.full_name,'phone',p.phone,'companyId',c.id,'companyTradeName',c.trade_name,'role',m.role,'globalAccountActive',p.active,'companyAccessActive',m.active,'lastSeenAt',p.last_seen_at,'invite',(select jsonb_build_object('status',case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at<=now() then 'expired' else 'pending' end,'expiresAt',i.expires_at,'resendAvailableAt',i.resend_available_at,'sentAt',i.created_at) from platform.company_invites i where i.company_id=m.company_id and i.user_id=m.user_id order by i.created_at desc limit 1)) item
 from public.company_memberships m join public.profiles p on p.id=m.user_id join public.companies c on c.id=m.company_id
 where m.role='company_admin' and (p_company_id is null or m.company_id=p_company_id)
 and(busc is null or private.fleet_text(concat(p.full_name,' ',c.trade_name)) like '%'||private.fleet_text(busc)||'%')
 and(p_access is null or m.active=(p_access='active')) and(p_account is null or p.active=(p_account='active'))
 order by m.created_at desc,m.user_id limit sz offset (pg-1)*sz)x;
 return jsonb_build_object('items',itens,'page',pg,'pageSize',sz,'total',n,'hasNext',pg::bigint*sz<n);
end $$;
revoke all on function platform.list_company_admins_filtered(uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function platform.list_company_admins_filtered(uuid,uuid,text,text,text,integer,integer) to service_role;
revoke all on function private.fleet_text(text),private.fleet_window(date,date) from public,anon,authenticated;

commit;
