-- Preventiva por data ou quilometragem, com renovação na conclusão.
begin;
create table public.maintenance_plans(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,description text not null check(char_length(btrim(description)) between 3 and 500),
 interval_days integer check(interval_days between 1 and 3650),interval_km numeric check(interval_km between 1 and 1000000),
 active boolean not null default true,created_at timestamptz not null default now(),created_by uuid references public.profiles(id) on delete set null,
 check(interval_days is not null or interval_km is not null)
);
alter table public.maintenance_plans enable row level security;
create policy maintenance_plans_read on public.maintenance_plans for select to authenticated using(company_id=private.current_user_company_id() and private.has_permission('maintenance.read'));
revoke all on public.maintenance_plans from public,anon,authenticated;
grant select on public.maintenance_plans to authenticated;
alter table public.maintenance_records add column plan_id uuid references public.maintenance_plans(id) on delete set null,add column previous_maintenance_id uuid references public.maintenance_records(id) on delete set null,add column no_charge_reason text;
create unique index maintenance_plan_successor_idx on public.maintenance_records(previous_maintenance_id) where previous_maintenance_id is not null;
alter table public.maintenance_records drop constraint maintenance_status_scheduled;
alter table public.maintenance_records add constraint maintenance_status_scheduled check(status<>'scheduled' or ((scheduled_for is not null or scheduled_odometer_km is not null) and completed_at is null and total_cost is null));
alter table public.maintenance_records drop constraint maintenance_status_completed;
alter table public.maintenance_records add constraint maintenance_status_completed check(status<>'completed' or (completed_at is not null and total_cost is not null and (total_cost>0 or (total_cost=0 and char_length(btrim(coalesce(no_charge_reason,'')))>=10))));

create function private.maintenance_attention(p_company_id uuid)
returns table(maintenance_id uuid,vehicle_id uuid,plate text,description text,status public.maintenance_status,scheduled_for timestamptz,scheduled_odometer_km numeric,current_odometer_km numeric,overdue_by_date boolean,overdue_by_odometer boolean,is_overdue boolean,is_due_soon boolean,days_remaining integer,km_remaining numeric)
language sql stable security definer set search_path='' as $$
 select m.id,m.vehicle_id,v.plate::text,m.description,m.status,m.scheduled_for,m.scheduled_odometer_km::numeric,v.current_odometer_km::numeric,
 coalesce(m.status='scheduled' and m.scheduled_for<=now(),false),coalesce(m.status='scheduled' and m.scheduled_odometer_km<=v.current_odometer_km,false),
 coalesce(m.status='scheduled' and (m.scheduled_for<=now() or m.scheduled_odometer_km<=v.current_odometer_km),false),
 coalesce(m.status='scheduled' and (m.scheduled_for<=now()+interval '30 days' or m.scheduled_odometer_km<=v.current_odometer_km+500) and not coalesce(m.scheduled_for<=now() or m.scheduled_odometer_km<=v.current_odometer_km,false),false),
 ceil(extract(epoch from(m.scheduled_for-now()))/86400)::integer,m.scheduled_odometer_km-v.current_odometer_km
 from public.maintenance_records m join public.vehicles v on v.id=m.vehicle_id and v.company_id=m.company_id
 where m.company_id=p_company_id and m.archived_at is null and v.archived_at is null and m.status in('scheduled','in_progress')
$$;
revoke all on function private.maintenance_attention(uuid) from public,anon,authenticated,service_role;
create function public.maintenance_due_items()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform private.assert_permission('maintenance.read');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.is_overdue desc,x.scheduled_for nulls last,x.maintenance_id),'[]') into r from private.maintenance_attention(private.current_user_company_id()) x;
 return r;
end $$;

create function public.schedule_maintenance_work(p_vehicle_id uuid,p_maintenance_type public.maintenance_type,p_description text,p_scheduled_for timestamptz,p_scheduled_odometer_km numeric,p_supplier_name text,p_notes text,p_interval_days integer,p_interval_km numeric,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.vehicles; r jsonb; plano uuid; m uuid; data_prevista timestamptz; km_previsto numeric;
begin
 perform private.assert_permission('maintenance.schedule');select * into v from public.vehicles where id=p_vehicle_id;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(v.company_id);
 r:=private.begin_operation(v.company_id,p_command_id,'schedule_maintenance',jsonb_build_array(p_vehicle_id,p_maintenance_type,p_description,p_scheduled_for,p_scheduled_odometer_km,p_supplier_name,p_notes,p_interval_days,p_interval_km));if r is not null then return r;end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if v.archived_at is not null then raise exception 'VEHICLE_ARCHIVED' using hint='CONFLICT_ARCHIVED';end if;
 if p_maintenance_type is null or char_length(btrim(coalesce(p_description,''))) not between 3 and 500 or p_scheduled_odometer_km<0 or (p_interval_days is not null and p_interval_days not between 1 and 3650) or (p_interval_km is not null and p_interval_km not between 1 and 1000000) then raise exception 'INVALID_INPUT: revise os dados da manutenção' using hint='VALIDATION_ERROR';end if;
 data_prevista:=coalesce(p_scheduled_for,case when p_interval_days is not null then now()+make_interval(days=>p_interval_days) end);
 km_previsto:=coalesce(p_scheduled_odometer_km,case when p_interval_km is not null then v.current_odometer_km+p_interval_km end);
 if data_prevista is null and km_previsto is null then raise exception 'INVALID_INPUT: informe data, quilometragem ou intervalo' using hint='VALIDATION_ERROR';end if;
 if p_interval_days is not null or p_interval_km is not null then
  if p_maintenance_type<>'preventive' then raise exception 'INVALID_INPUT: recorrência disponível para preventiva' using hint='VALIDATION_ERROR';end if;
  insert into public.maintenance_plans(company_id,vehicle_id,description,interval_days,interval_km,created_by) values(v.company_id,v.id,btrim(p_description),p_interval_days,p_interval_km,private.current_user_id()) returning id into plano;
 end if;
 insert into public.maintenance_records(company_id,vehicle_id,maintenance_type,description,scheduled_for,scheduled_odometer_km,supplier_name,notes,created_by,plan_id)
 values(v.company_id,v.id,p_maintenance_type,btrim(p_description),data_prevista,km_previsto,private.normalize_label(p_supplier_name),private.normalize_label(p_notes),private.current_user_id(),plano) returning id into m;
 perform private.log_audit_event(v.company_id,'insert','public.maintenance_records',m,jsonb_build_object('planId',plano),jsonb_build_object('rpc','schedule_maintenance_work'));
 return private.finish_operation(v.company_id,p_command_id,jsonb_build_object('maintenanceId',m,'planId',plano,'status','scheduled'));
end $$;

create or replace function public.complete_maintenance(
  p_maintenance_id         uuid,
  p_total_cost             numeric,
  p_completed_at           timestamptz default now(),
  p_completion_odometer_km numeric default null,
  p_supplier_name          text default null,
  p_invoice_number         text default null,
  p_notes                  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record    public.maintenance_records;
  v_vehicle   public.vehicles;
  v_event     public.vehicle_odometer_events;
  v_event_id  uuid;
  v_completed timestamptz := coalesce(p_completed_at, now());
  v_other     integer;
  v_plan public.maintenance_plans;
  v_next uuid;
begin
  perform private.assert_permission('maintenance.write');

  if p_total_cost is null or p_total_cost < 0 or (round(p_total_cost,2)=0 and char_length(btrim(coalesce(p_notes,'')))<10) then
    raise exception 'MAINTENANCE_COST_INVALID: informe o custo ou justifique o serviço sem cobrança'
      using errcode = '23514', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  select * into v_vehicle from public.vehicles where id = v_record.vehicle_id for update;
  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;

  if v_record.status not in ('scheduled', 'in_progress') then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser concluída', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if v_completed > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data de conclusão não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if v_record.started_at is not null and v_completed < v_record.started_at then
    raise exception 'MAINTENANCE_CHRONOLOGY_INVALID: conclusão (%) antes do início (%)',
      v_completed, v_record.started_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if v_record.plan_id is not null then
    select * into v_plan from public.maintenance_plans where id=v_record.plan_id and active for update;
    if v_plan.id is not null and v_plan.interval_km is not null and p_completion_odometer_km is null then
      raise exception 'ODOMETER_REQUIRED: informe a leitura real para calcular a próxima revisão' using hint='VALIDATION_ERROR';
    end if;
  end if;
  if p_completion_odometer_km is not null then
    v_event := private.record_odometer_event(
      p_vehicle_id  => v_record.vehicle_id,
      p_odometer_km => p_completion_odometer_km,
      p_occurred_at => v_completed,
      p_source_type => 'maintenance_completion',
      p_source_id   => p_maintenance_id,
      p_reason      => null
    );
    v_event_id := v_event.id;
  end if;

  update public.maintenance_records
     set status = 'completed',
         completed_at = v_completed,
         started_at = coalesce(started_at, v_completed),
         completion_odometer_km = p_completion_odometer_km,
         total_cost = round(p_total_cost, 2),
         no_charge_reason = case when round(p_total_cost,2)=0 then btrim(p_notes) end,
         supplier_name = coalesce(private.normalize_label(p_supplier_name), supplier_name),
         invoice_number = coalesce(private.normalize_label(p_invoice_number), invoice_number),
         notes = coalesce(private.normalize_label(p_notes), notes),
         scheduled_for = case when scheduled_for > v_completed then null else scheduled_for end
   where id = p_maintenance_id;

  if v_plan.id is not null and v_vehicle.archived_at is null then
    insert into public.maintenance_records(company_id,vehicle_id,maintenance_type,description,scheduled_for,scheduled_odometer_km,supplier_name,created_by,plan_id,previous_maintenance_id)
    values(v_record.company_id,v_record.vehicle_id,'preventive',v_plan.description,
      case when v_plan.interval_days is not null then v_completed+make_interval(days=>v_plan.interval_days) end,
      case when v_plan.interval_km is not null then p_completion_odometer_km+v_plan.interval_km end,
      coalesce(private.normalize_label(p_supplier_name),v_record.supplier_name),private.current_user_id(),v_plan.id,p_maintenance_id)
    returning id into v_next;
  end if;

  -- DB-AUD-009: só libera o veículo se nenhuma outra manutenção seguir aberta.
  select count(*) into v_other
  from public.maintenance_records m
  where m.vehicle_id = v_record.vehicle_id
    and m.status = 'in_progress'
    and m.id <> p_maintenance_id;

  if v_other = 0 then
    update public.vehicles set status = 'available'
     where id = v_record.vehicle_id and status = 'in_maintenance';
  end if;

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object(
      'status', jsonb_build_object('old', v_record.status, 'new', 'completed'),
      'total_cost', jsonb_build_object('old', v_record.total_cost, 'new', round(p_total_cost, 2))
    ),
    jsonb_build_object('rpc', 'complete_maintenance', 'odometer_event_id', v_event_id)
  );

  return jsonb_build_object(
    'maintenanceId', p_maintenance_id,
    'status', 'completed',
    'vehicleId', v_record.vehicle_id,
    'completedAt', v_completed,
    'totalCost', round(p_total_cost, 2),
    'completionOdometerKm', p_completion_odometer_km,
    'odometerEventId', v_event_id,
    'nextMaintenanceId', v_next
  );
end;
$$;

create function public.complete_maintenance_v2(p_maintenance_id uuid,p_total_cost numeric,p_completed_at timestamptz,p_completion_odometer_km numeric,p_supplier_name text,p_invoice_number text,p_no_charge_reason text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; r jsonb;
begin
 perform private.assert_permission('maintenance.write');select company_id into c from public.maintenance_records where id=p_maintenance_id;
 if not found then raise exception 'MAINTENANCE_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(c);
 r:=private.begin_operation(c,p_command_id,'complete_maintenance',jsonb_build_array(p_maintenance_id,p_total_cost,p_completed_at,p_completion_odometer_km,p_supplier_name,p_invoice_number,p_no_charge_reason));if r is not null then return r;end if;
 r:=public.complete_maintenance(p_maintenance_id,p_total_cost,p_completed_at,p_completion_odometer_km,p_supplier_name,p_invoice_number,case when round(p_total_cost,2)=0 then p_no_charge_reason end);
 return private.finish_operation(c,p_command_id,r);
end $$;

create function public.set_maintenance_plan_active(p_plan_id uuid,p_active boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.maintenance_plans;
begin
 perform private.assert_permission('maintenance.schedule');select * into v from public.maintenance_plans where id=p_plan_id for update;
 if not found then raise exception 'PLAN_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(v.company_id);
 if p_active is null or length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
   raise exception 'Informe uma justificativa de 10 a 500 caracteres.' using hint='VALIDATION_ERROR';
 end if;
 update public.maintenance_plans set active=p_active where id=v.id;
 perform private.log_audit_event(v.company_id,'update','public.maintenance_plans',v.id,jsonb_build_object('active',jsonb_build_object('old',v.active,'new',p_active)),jsonb_build_object('rpc','set_maintenance_plan_active','reason',btrim(p_reason)));
 return jsonb_build_object('planId',v.id,'active',p_active);
end $$;

revoke all on function public.maintenance_due_items(),public.schedule_maintenance_work(uuid,public.maintenance_type,text,timestamptz,numeric,text,text,integer,numeric,uuid),public.complete_maintenance_v2(uuid,numeric,timestamptz,numeric,text,text,text,uuid),public.set_maintenance_plan_active(uuid,boolean,text) from public,anon,service_role;
grant execute on function public.maintenance_due_items(),public.schedule_maintenance_work(uuid,public.maintenance_type,text,timestamptz,numeric,text,text,integer,numeric,uuid),public.complete_maintenance_v2(uuid,numeric,timestamptz,numeric,text,text,text,uuid),public.set_maintenance_plan_active(uuid,boolean,text) to authenticated;
commit;
