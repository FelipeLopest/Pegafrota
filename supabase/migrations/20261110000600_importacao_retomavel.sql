-- Repetição segura das linhas de cadastro após falha de transporte.
begin;
create function public.import_catalog_record(p_kind text,p_payload jsonb,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; r jsonb; p jsonb:=coalesce(p_payload,'{}');
begin
 if p_kind not in('vehicles','drivers','locations') or p_kind is null or jsonb_typeof(p)<>'object' then raise exception 'INVALID_INPUT' using hint='VALIDATION_ERROR';end if;
 perform private.assert_permission(p_kind||'.write');c:=private.current_user_company_id();
 r:=private.begin_operation(c,p_command_id,'import_'||p_kind,p);if r is not null then return r;end if;
 case p_kind
 when 'vehicles' then r:=public.create_vehicle(p_plate=>p->>'plate',p_brand=>p->>'brand',p_model=>p->>'model',p_fuel_type=>(p->>'fuelType')::public.fuel_type,p_model_year=>nullif(p->>'modelYear','')::integer,p_initial_odometer_km=>coalesce(nullif(p->>'initialOdometerKm','')::numeric,0),p_color=>p->>'color',p_category=>p->>'category',p_tank_capacity_l=>nullif(p->>'tankCapacityL','')::numeric,p_notes=>p->>'notes');
 when 'drivers' then r:=public.create_driver(p_full_name=>p->>'fullName',p_internal_document=>p->>'internalDocument',p_phone=>p->>'phone',p_license_category=>p->>'licenseCategory',p_license_expires_on=>nullif(p->>'licenseExpiresOn','')::date,p_notes=>p->>'notes');
 when 'locations' then r:=public.create_location(p_name=>p->>'name',p_address_street=>p->>'addressStreet',p_address_number=>p->>'addressNumber',p_address_district=>p->>'addressDistrict',p_address_city=>p->>'addressCity',p_address_state=>p->>'addressState',p_address_postal_code=>p->>'addressPostalCode',p_timezone=>p->>'timezone',p_notes=>p->>'notes');
 end case;
 return private.finish_operation(c,p_command_id,r);
end $$;
revoke all on function public.import_catalog_record(text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.import_catalog_record(text,jsonb,uuid) to authenticated;
commit;
