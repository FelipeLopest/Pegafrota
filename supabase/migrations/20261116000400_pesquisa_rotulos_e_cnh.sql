-- Pesquisa os rótulos exibidos na frota e separa CNH próxima de CNH vencida.
begin;

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
 cond:='(nullif($2,'''') is null or strpos(private.fleet_text(concat(item::text, '' '', case item->>''fuel_type''
   when ''diesel_s10'' then ''Diesel S10''
   when ''diesel_s500'' then ''Diesel S500''
   when ''gasoline'' then ''Gasolina''
   when ''ethanol'' then ''Etanol''
   when ''cng'' then ''GNV''
   when ''electric'' then ''Elétrico''
   when ''flex'' then ''Flex''
 end)),private.fleet_text($2))>0)
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
 ''license30'',count(*) filter(where item->>''archived_at'' is null
   and (item->>''license_expires_on'')::date between current_date and current_date+30),
 ''amount'',coalesce(sum((item->>''total_amount'')::numeric),0),
 ''cost'',coalesce(sum((item->>''total_cost'')::numeric) filter(where item->>''status''=''completed''),0),
 ''liters'',coalesce(sum((item->>''liters'')::numeric) filter(where coalesce(item->>''unit'',''L'')=''L''),0),
 ''m3'',coalesce(sum((item->>''liters'')::numeric) filter(where item->>''unit''=''m3''),0)) from base'
 into resumo using c;
 execute base||'select jsonb_build_object(''brands'',coalesce(jsonb_agg(distinct item->>''brand'') filter(where item->>''brand'' is not null),''[]''),''categories'',coalesce(jsonb_agg(distinct item->>''license_category'') filter(where item->>''license_category'' is not null),''[]''),''states'',coalesce(jsonb_agg(distinct item->>''address_state'') filter(where item->>''address_state'' is not null),''[]'')) from base' into facetas using c;
 return jsonb_build_object('items',itens,'total',n,'allTotal',all_n,'page',pg,'pageSize',sz,'hasNext',pg::bigint*sz<n,'summary',resumo,'facets',facetas);
end $$;

commit;
