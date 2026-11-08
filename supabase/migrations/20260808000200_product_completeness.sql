-- PegaNaFrota v8 — completude funcional do Desktop
-- Edição segura de motoristas/locais + snapshot de pátio sem limite de 200 linhas.

create or replace function public.update_driver(p_driver_id uuid, p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v public.drivers;
begin
  perform private.assert_permission('drivers.write');
  select * into v from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'DRIVER_NOT_FOUND' using errcode='P0002', hint='NOT_FOUND'; end if;
  perform private.assert_company_access(v.company_id);
  if v.archived_at is not null then raise exception 'DRIVER_ARCHIVED' using errcode='42501', hint='CONFLICT_ARCHIVED'; end if;
  update public.drivers set
    full_name = case when p_patch ? 'fullName' then coalesce(private.normalize_label(p_patch->>'fullName'), full_name) else full_name end,
    internal_document = case when p_patch ? 'internalDocument' then private.normalize_label(p_patch->>'internalDocument') else internal_document end,
    phone = case when p_patch ? 'phone' then private.normalize_digits(p_patch->>'phone') else phone end,
    license_category = case when p_patch ? 'licenseCategory' then nullif(upper(btrim(p_patch->>'licenseCategory')), '') else license_category end,
    license_expires_on = case when p_patch ? 'licenseExpiresOn' then nullif(p_patch->>'licenseExpiresOn','')::date else license_expires_on end,
    notes = case when p_patch ? 'notes' then private.normalize_label(p_patch->>'notes') else notes end
  where id=p_driver_id returning * into v;
  perform private.log_audit_event(v.company_id,'update','public.drivers',v.id,
    jsonb_build_object('patchKeys',(select jsonb_agg(k) from jsonb_object_keys(p_patch) k)),
    jsonb_build_object('rpc','update_driver'));
  return jsonb_build_object('driverId',v.id,'updatedAt',v.updated_at);
end $$;

create or replace function public.create_location(
  p_name text, p_address_street text default null, p_address_number text default null,
  p_address_district text default null, p_address_city text default null,
  p_address_state text default null, p_address_postal_code text default null,
  p_timezone text default null, p_notes text default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c uuid; v public.locations;
begin
  perform private.assert_permission('locations.write'); c:=private.current_user_company_id();
  if private.normalize_label(p_name) is null then raise exception 'INVALID_INPUT' using errcode='22023',hint='VALIDATION_ERROR'; end if;
  insert into public.locations(company_id,name,address_street,address_number,address_district,address_city,address_state,address_postal_code,timezone,notes)
  values(c,private.normalize_label(p_name),private.normalize_label(p_address_street),private.normalize_label(p_address_number),private.normalize_label(p_address_district),private.normalize_label(p_address_city),nullif(upper(btrim(coalesce(p_address_state,''))),''),private.normalize_digits(p_address_postal_code),coalesce(private.normalize_label(p_timezone),'America/Sao_Paulo'),private.normalize_label(p_notes))
  returning * into v;
  perform private.log_audit_event(c,'insert','public.locations',v.id,jsonb_build_object('name',v.name),jsonb_build_object('rpc','create_location'));
  return jsonb_build_object('locationId',v.id,'name',v.name);
end $$;

create or replace function public.update_location(p_location_id uuid, p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v public.locations;
begin
  perform private.assert_permission('locations.write');
  select * into v from public.locations where id=p_location_id for update;
  if not found then raise exception 'LOCATION_NOT_FOUND' using errcode='P0002',hint='NOT_FOUND'; end if;
  perform private.assert_company_access(v.company_id);
  if v.archived_at is not null then raise exception 'LOCATION_ARCHIVED' using errcode='42501',hint='CONFLICT_ARCHIVED'; end if;
  update public.locations set
    name=case when p_patch?'name' then coalesce(private.normalize_label(p_patch->>'name'),name) else name end,
    address_street=case when p_patch?'addressStreet' then private.normalize_label(p_patch->>'addressStreet') else address_street end,
    address_number=case when p_patch?'addressNumber' then private.normalize_label(p_patch->>'addressNumber') else address_number end,
    address_district=case when p_patch?'addressDistrict' then private.normalize_label(p_patch->>'addressDistrict') else address_district end,
    address_city=case when p_patch?'addressCity' then private.normalize_label(p_patch->>'addressCity') else address_city end,
    address_state=case when p_patch?'addressState' then nullif(upper(btrim(p_patch->>'addressState')),'') else address_state end,
    address_postal_code=case when p_patch?'addressPostalCode' then private.normalize_digits(p_patch->>'addressPostalCode') else address_postal_code end,
    timezone=case when p_patch?'timezone' then coalesce(private.normalize_label(p_patch->>'timezone'),timezone) else timezone end,
    notes=case when p_patch?'notes' then private.normalize_label(p_patch->>'notes') else notes end
  where id=p_location_id returning * into v;
  perform private.log_audit_event(v.company_id,'update','public.locations',v.id,jsonb_build_object('patchKeys',(select jsonb_agg(k) from jsonb_object_keys(p_patch) k)),jsonb_build_object('rpc','update_location'));
  return jsonb_build_object('locationId',v.id,'updatedAt',v.updated_at);
end $$;

create or replace function public.set_location_active(p_location_id uuid,p_active boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v public.locations;
begin
 perform private.assert_permission('locations.write'); select * into v from public.locations where id=p_location_id for update;
 if not found then raise exception 'LOCATION_NOT_FOUND' using errcode='P0002',hint='NOT_FOUND'; end if; perform private.assert_company_access(v.company_id);
 if v.archived_at is not null then raise exception 'LOCATION_ARCHIVED' using errcode='42501',hint='CONFLICT_ARCHIVED'; end if;
 update public.locations set active=coalesce(p_active,false) where id=p_location_id;
 perform private.log_audit_event(v.company_id,'update','public.locations',v.id,jsonb_build_object('active',p_active),jsonb_build_object('rpc','set_location_active'));
 return jsonb_build_object('locationId',v.id,'active',coalesce(p_active,false));
end $$;

create or replace function public.archive_location(p_location_id uuid,p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v public.locations;
begin
 perform private.assert_permission('locations.write'); select * into v from public.locations where id=p_location_id for update;
 if not found then raise exception 'LOCATION_NOT_FOUND' using errcode='P0002',hint='NOT_FOUND'; end if; perform private.assert_company_access(v.company_id);
 if v.archived_at is not null then return jsonb_build_object('locationId',v.id,'changed',false); end if;
 update public.locations set active=false,archived_at=now(),archived_by=private.current_user_id(),notes=case when private.normalize_label(p_reason) is null then notes else coalesce(notes||E'\n','')||'Arquivado: '||private.normalize_label(p_reason) end where id=p_location_id;
 perform private.log_audit_event(v.company_id,'archive','public.locations',v.id,jsonb_build_object('reason',private.normalize_label(p_reason)),jsonb_build_object('rpc','archive_location'));
 return jsonb_build_object('locationId',v.id,'changed',true);
end $$;

create or replace function public.unarchive_location(p_location_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v public.locations;
begin
 perform private.assert_permission('locations.write'); select * into v from public.locations where id=p_location_id for update;
 if not found then raise exception 'LOCATION_NOT_FOUND' using errcode='P0002',hint='NOT_FOUND'; end if; perform private.assert_company_access(v.company_id);
 if v.archived_at is null then return jsonb_build_object('locationId',v.id,'changed',false); end if;
 update public.locations set active=true,archived_at=null,archived_by=null where id=p_location_id;
 perform private.log_audit_event(v.company_id,'unarchive','public.locations',v.id,'{}'::jsonb,jsonb_build_object('rpc','unarchive_location'));
 return jsonb_build_object('locationId',v.id,'changed',true);
end $$;

create or replace function public.yard_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; tz text; today date; result jsonb;
begin
 perform private.assert_permission('movements.read'); c:=private.current_user_company_id();
 select timezone into tz from public.companies where id=c; tz:=coalesce(tz,'America/Sao_Paulo'); today:=(now() at time zone tz)::date;
 with active_vehicles as (
   select id,plate,brand,model,status from public.vehicles where company_id=c and archived_at is null
 ), latest as (
   select distinct on (m.vehicle_id) m.vehicle_id,m.movement_type,m.location_id,m.occurred_at
   from public.vehicle_movements m join active_vehicles v on v.id=m.vehicle_id
   order by m.vehicle_id,m.occurred_at desc,m.sequence_no desc
 ), daily as (
   select count(*) filter(where movement_type='entry') entries, count(*) filter(where movement_type='exit') exits
   from public.vehicle_movements where company_id=c and (occurred_at at time zone tz)::date=today
 )
 select jsonb_build_object(
   'timezone',tz,'localDate',today,
   'entriesToday',(select entries from daily),'exitsToday',(select exits from daily),
   'inside',(select count(*) from latest where movement_type='entry'),
   'outside',(select count(*) from latest where movement_type='exit'),
   'neverMoved',(select count(*) from active_vehicles v where not exists(select 1 from latest l where l.vehicle_id=v.id)),
   'vehicles',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'plate',v.plate,'brand',v.brand,'model',v.model,'status',v.status,'presence',case when l.vehicle_id is null then 'unknown' when l.movement_type='entry' then 'inside' else 'outside' end,'lastMovementType',l.movement_type,'locationId',l.location_id,'occurredAt',l.occurred_at) order by v.plate) from active_vehicles v left join latest l on l.vehicle_id=v.id),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke all on function public.update_driver(uuid,jsonb) from public;
revoke all on function public.create_location(text,text,text,text,text,text,text,text,text) from public;
revoke all on function public.update_location(uuid,jsonb) from public;
revoke all on function public.set_location_active(uuid,boolean) from public;
revoke all on function public.archive_location(uuid,text) from public;
revoke all on function public.unarchive_location(uuid) from public;
revoke all on function public.yard_snapshot() from public;
grant execute on function public.update_driver(uuid,jsonb) to authenticated;
grant execute on function public.create_location(text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.update_location(uuid,jsonb) to authenticated;
grant execute on function public.set_location_active(uuid,boolean) to authenticated;
grant execute on function public.archive_location(uuid,text) to authenticated;
grant execute on function public.unarchive_location(uuid) to authenticated;
grant execute on function public.yard_snapshot() to authenticated;

-- -----------------------------------------------------------------------------
-- Equipe: o front-end precisa mostrar o e-mail real da conta. O perfil público
-- não duplica e-mail; a RPC SECURITY DEFINER consulta auth.users apenas para os
-- membros da própria empresa, depois de validar users.read.
-- -----------------------------------------------------------------------------
create or replace function public.company_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_items   jsonb;
begin
  perform private.assert_permission('users.read');
  v_company := private.current_user_company_id();

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.full_name), '[]'::jsonb)
    into v_items
  from (
    select m.user_id,
           u.email,
           p.full_name,
           p.phone,
           m.role,
           m.active                 as membership_active,
           p.active                 as profile_active,
           (m.active and p.active)  as effective_active,
           m.created_at,
           p.last_seen_at
      from public.company_memberships m
      join public.profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
     where m.company_id = v_company
     order by p.full_name
  ) t;

  return jsonb_build_object('companyId', v_company, 'members', v_items);
end;
$$;

comment on function public.company_members() is
  'Membros da empresa do chamador com e-mail do Auth; exige users.read e nunca cruza tenants.';

revoke all on function public.company_members() from public;
grant execute on function public.company_members() to authenticated;
revoke execute on function public.company_members() from service_role;
