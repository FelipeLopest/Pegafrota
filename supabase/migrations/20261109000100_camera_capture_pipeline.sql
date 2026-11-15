-- Integração opcional: ESP32 -> imagens privadas -> OCR no Windows -> RPC transacional.
-- Não altera migrations anteriores e não exige câmera na operação manual.
begin;

alter table public.cameras add column automatic_enabled boolean not null default false;
alter table public.cameras add column last_seen_at timestamptz;
alter table public.cameras add column last_capture_at timestamptz;
alter table public.cameras add column device_version text;
alter table public.cameras add column device_status text;
alter table public.cameras add constraint camera_automatic_safe check(not automatic_enabled or (direction<>'both' and min_confidence>=0.80));

create table private.camera_credentials (
  camera_id uuid primary key references public.cameras(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_request_at timestamptz
);
revoke all on private.camera_credentials from public, anon, authenticated;

create table public.camera_captures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  event_id uuid not null,
  passage_id uuid not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  object_path text not null unique,
  image_deleted_at timestamptz,
  status text not null default 'uploading' check(status in
    ('uploading','queued','processing','waiting_consensus','review','done','ignored','error')),
  claim_id uuid,
  claimed_by uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  suggested_plate text,
  confidence numeric check(confidence between 0 and 1),
  plate_read_event_id uuid references public.plate_read_events(id) on delete set null,
  result jsonb,
  error_message text,
  processed_at timestamptz,
  unique(camera_id,event_id)
);
create index camera_capture_queue_idx on public.camera_captures(company_id,status,received_at);
create index camera_capture_passage_idx on public.camera_captures(camera_id,passage_id);
create index camera_capture_daily_idx on public.camera_captures(camera_id,received_at);
create table private.camera_passages (
  camera_id uuid references public.cameras(id) on delete cascade,
  passage_id uuid not null,
  decided_at timestamptz not null default now(),
  result jsonb not null,
  primary key(camera_id,passage_id)
);
revoke all on private.camera_passages from public, anon, authenticated;
create table private.camera_image_gc(id uuid primary key,object_path text not null);
revoke all on private.camera_image_gc from public,anon,authenticated;
create function private.camera_schedule_image_removal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.image_deleted_at is null then insert into private.camera_image_gc values(old.id,old.object_path) on conflict do nothing; end if;
 return old;
end $$;
create trigger camera_capture_removal before delete on public.camera_captures for each row execute function private.camera_schedule_image_removal();
alter table public.camera_captures enable row level security;
create policy camera_captures_read on public.camera_captures for select to authenticated
 using (company_id=(select private.current_user_company_id()) and (select private.has_permission('ocr.read')));
revoke all on public.camera_captures from public,anon,authenticated;
grant select on public.camera_captures to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('camera-captures','camera-captures',false,307200,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=307200,allowed_mime_types=array['image/jpeg'];
create policy camera_capture_images_read on storage.objects for select to authenticated
using(bucket_id='camera-captures' and exists(select 1 from public.camera_captures c
  where c.object_path=name and c.company_id=(select private.current_user_company_id())
    and (select private.has_permission('ocr.read')) and c.image_deleted_at is null and c.received_at>now()-interval '24 hours'));

create function public.camera_save(p_camera_id uuid, p_name text, p_location_id uuid,
 p_direction public.camera_direction, p_active boolean default true,
 p_automatic boolean default false, p_min_confidence numeric default 0.90,
 p_roi jsonb default '[0,0,1,1]'::jsonb,p_daily_limit integer default 1000)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_company uuid:=private.current_user_company_id(); v_value numeric;
begin
 perform private.assert_permission('cameras.write');
 perform private.assert_company_access(v_company);
 if not exists(select 1 from public.locations where id=p_location_id and company_id=v_company and active and archived_at is null)
 then raise exception 'Selecione um local ativo da sua empresa.' using errcode='42501'; end if;
 if p_min_confidence is null or p_min_confidence<0.80 or p_min_confidence>1 then raise exception 'Confiança deve estar entre 0,80 e 1.'; end if;
 if p_daily_limit is null or p_daily_limit<1 or p_daily_limit>10000 then raise exception 'Limite por 24 horas deve estar entre 1 e 10000 fotos.'; end if;
 if p_automatic and p_direction='both' then raise exception 'Registro automático exige uma câmera de entrada ou de saída.'; end if;
 if jsonb_typeof(p_roi)<>'array' or jsonb_array_length(p_roi)<>4 then raise exception 'Área da imagem inválida.'; end if;
 for v_value in select value::text::numeric from jsonb_array_elements(p_roi) loop
  if v_value<0 or v_value>1 then raise exception 'Área da imagem deve usar valores entre 0 e 1.'; end if;
 end loop;
 if (p_roi->>2)::numeric-(p_roi->>0)::numeric<0.1 or (p_roi->>3)::numeric-(p_roi->>1)::numeric<0.1 then raise exception 'Área da imagem pequena ou invertida.'; end if;
 if p_camera_id is null then
  insert into public.cameras(company_id,location_id,name,local_identifier,direction,active,min_confidence,automatic_enabled,settings)
   values(v_company,p_location_id,btrim(p_name),'esp32-'||gen_random_uuid(),p_direction,p_active,p_min_confidence,p_automatic,jsonb_build_object('roi',p_roi,'dailyCaptureLimit',p_daily_limit)) returning id into v_id;
 else
  perform private.assert_company_access((select company_id from public.cameras where id=p_camera_id));
  update public.cameras set name=btrim(p_name),location_id=p_location_id,direction=p_direction,active=p_active,
   automatic_enabled=p_automatic,min_confidence=p_min_confidence,settings=jsonb_set(jsonb_set(settings,'{roi}',p_roi),'{dailyCaptureLimit}',to_jsonb(p_daily_limit)),updated_at=now() where id=p_camera_id returning id into v_id;
 end if;
 return v_id;
end $$;

create function public.camera_rotate_key(p_camera_id uuid, p_revoke_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text; v_company uuid;
begin
 perform private.assert_permission('cameras.write');
 select company_id into v_company from public.cameras where id=p_camera_id for update;
 perform private.assert_company_access(v_company);
 if p_revoke_only then
  update private.camera_credentials set revoked_at=now() where camera_id=p_camera_id;
  update public.cameras set last_seen_at=null,device_status='revoked' where id=p_camera_id;
  perform private.log_audit_event(v_company,'update','public.cameras',p_camera_id,null,jsonb_build_object('operation','camera_key_revoked'));
  return jsonb_build_object('revoked',true);
 end if;
 v_token:='pnfc_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into private.camera_credentials(camera_id,token_hash) values(p_camera_id,encode(extensions.digest(v_token,'sha256'),'hex'))
  on conflict(camera_id) do update set token_hash=excluded.token_hash,created_at=now(),revoked_at=null,last_request_at=null;
 update public.cameras set last_seen_at=null,device_status='waiting_pair' where id=p_camera_id;
 perform private.log_audit_event(v_company,'update','public.cameras',p_camera_id,null,jsonb_build_object('operation','camera_key_rotated'));
 return jsonb_build_object('cameraId',p_camera_id,'deviceKey',v_token);
end $$;

-- Exclusivo do servidor: a câmera não escolhe empresa, câmera, arquivo ou usuário.
create function public.camera_reserve(p_key text, p_event_id uuid default null, p_passage_id uuid default null,
 p_captured_at timestamptz default null, p_heartbeat boolean default false, p_version text default null,p_status text default 'ready')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_camera public.cameras; v_capture public.camera_captures; v_id uuid:=gen_random_uuid(); v_previous timestamptz;
begin
 if length(coalesce(p_key,''))<>69 then raise exception 'DEVICE_UNAUTHORIZED' using errcode='42501'; end if;
 select c.* into v_camera from public.cameras c join private.camera_credentials k on k.camera_id=c.id
  where k.token_hash=encode(extensions.digest(p_key,'sha256'),'hex') and k.revoked_at is null for update of c;
 if not found or not v_camera.active or not exists(select 1 from public.companies where id=v_camera.company_id and status='active')
  or not exists(select 1 from public.locations where id=v_camera.location_id and active and archived_at is null) then
  raise exception 'DEVICE_UNAUTHORIZED' using errcode='42501'; end if;
 select last_request_at into v_previous from private.camera_credentials where camera_id=v_camera.id;
 if v_previous>now()-interval '700 milliseconds' then raise exception 'DEVICE_RATE_LIMIT'; end if;
 update private.camera_credentials set last_request_at=now() where camera_id=v_camera.id;
 update public.cameras set last_seen_at=now(),device_version=left(p_version,60),device_status=left(p_status,40) where id=v_camera.id;
 if p_heartbeat then return jsonb_build_object('ok',true,'cameraId',v_camera.id,'intervalMs',1000,'maxBytes',307200,'roi',coalesce(v_camera.settings->'roi','[0,0,1,1]'::jsonb)); end if;
 if p_event_id is null or p_passage_id is null or p_captured_at is null or p_captured_at>now()+interval '2 minutes' or p_captured_at<now()-interval '15 minutes' then
  raise exception 'CAPTURE_INVALID_TIME_OR_ID'; end if;
 select * into v_capture from public.camera_captures where camera_id=v_camera.id and event_id=p_event_id;
 if found then
  if v_capture.status='uploading' then return jsonb_build_object('id',v_capture.id,'path',v_capture.object_path,'duplicate',false); end if;
  return jsonb_build_object('id',v_capture.id,'duplicate',true);
 end if;
 if (select count(*) from public.camera_captures where camera_id=v_camera.id and received_at>now()-interval '24 hours')>=least(greatest(coalesce((v_camera.settings->>'dailyCaptureLimit')::integer,1000),1),10000) then raise exception 'DEVICE_DAILY_LIMIT'; end if;
 if (select count(*) from public.camera_captures where camera_id=v_camera.id and status in ('uploading','queued','processing') and received_at>now()-interval '15 minutes')>=30 then raise exception 'DEVICE_QUEUE_FULL'; end if;
 insert into public.camera_captures(id,company_id,camera_id,event_id,passage_id,captured_at,object_path)
 values(v_id,v_camera.company_id,v_camera.id,p_event_id,p_passage_id,p_captured_at,v_camera.company_id||'/'||v_camera.id||'/'||v_id||'.jpg') returning * into v_capture;
 return jsonb_build_object('id',v_id,'path',v_capture.object_path,'duplicate',false);
end $$;

create function public.camera_commit_upload(p_capture_id uuid)
returns void language sql security definer set search_path='' as $$
 update public.camera_captures set status='queued' where id=p_capture_id and status='uploading';
 update public.cameras set last_capture_at=now() where id=(select camera_id from public.camera_captures where id=p_capture_id);
$$;

create function public.camera_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_capture public.camera_captures; v_camera public.cameras;
begin
 perform private.assert_permission('ocr.operate');
 select j.* into v_capture from public.camera_captures j join public.cameras c on c.id=j.camera_id
 where j.company_id=private.current_user_company_id() and c.active
  and (j.status='queued' or (j.status='processing' and j.lease_until<now())) and j.attempts<3
  and j.received_at>now()-interval '15 minutes' and j.image_deleted_at is null
 order by j.received_at for update of j skip locked limit 1;
 if not found then return null; end if;
 select * into v_camera from public.cameras where id=v_capture.camera_id;
 update public.camera_captures set status='processing',claim_id=gen_random_uuid(),claimed_by=private.current_user_id(),
  lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=v_capture.id returning * into v_capture;
 return jsonb_build_object('id',v_capture.id,'claimId',v_capture.claim_id,'path',v_capture.object_path,'roi',coalesce(v_camera.settings->'roi','[0,0,1,1]'::jsonb));
end $$;

create function public.camera_finish(p_capture_id uuid,p_claim_id uuid,p_plate text default null,
 p_confidence numeric default 0,p_ambiguous boolean default false,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_capture public.camera_captures; v_camera public.cameras; v_plate text; v_result jsonb;
 v_count integer; v_vehicle public.vehicles; v_last public.vehicle_movements; v_auto boolean;
begin
 perform private.assert_permission('ocr.operate');
 select c.* into v_camera from public.cameras c join public.camera_captures j on j.camera_id=c.id where j.id=p_capture_id for update of c;
 perform private.assert_company_access(v_camera.company_id);
 select * into v_capture from public.camera_captures where id=p_capture_id for update;
 if v_capture.claim_id is distinct from p_claim_id or v_capture.claimed_by is distinct from private.current_user_id() or v_capture.status<>'processing' or v_capture.lease_until<now() then raise exception 'CLAIM_EXPIRED'; end if;
 if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'INVALID_CONFIDENCE'; end if;
 if p_error is not null then
  update public.camera_captures set status=case when attempts<3 then 'queued' else 'error' end,error_message=left(p_error,240),lease_until=null where id=p_capture_id;
  return jsonb_build_object('status','error');
 end if;
 v_plate:=upper(regexp_replace(coalesce(p_plate,''),'[ -]','','g'));
 if v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
  update public.camera_captures set status='ignored',processed_at=now(),result='{"reason":"Nenhuma placa brasileira válida identificada"}' where id=p_capture_id;
  return jsonb_build_object('status','ignored');
 end if;
 update public.camera_captures set suggested_plate=v_plate,confidence=p_confidence,processed_at=now() where id=p_capture_id;
 select result into v_result from private.camera_passages where camera_id=v_camera.id and passage_id=v_capture.passage_id;
 if found then
  update public.camera_captures set status='ignored',result=v_result where id=p_capture_id;
  return jsonb_build_object('status','ignored','reason','Passagem já processada');
 end if;
 if not v_camera.active then raise exception 'CAMERA_INACTIVE'; end if;
 -- Uma primeira foto ruim não impede duas fotos seguintes boas da mesma passagem.
 -- Mantê-la revisável sem criar uma leitura idempotente definitiva prematuramente.
 if v_camera.automatic_enabled and not p_ambiguous and p_confidence<v_camera.min_confidence then
  update public.camera_captures set status='review',result=jsonb_build_object('reason','Confiança insuficiente; aguardando outras capturas ou revisão.') where id=p_capture_id;
  return jsonb_build_object('status','review');
 end if;
 v_auto:=v_camera.automatic_enabled and v_camera.direction<>'both' and not p_ambiguous
  and p_confidence>=v_camera.min_confidence and v_capture.captured_at>now()-interval '2 minutes';
 select count(*) into v_count from public.camera_captures where camera_id=v_camera.id and passage_id=v_capture.passage_id
  and suggested_plate=v_plate and confidence>=v_camera.min_confidence and processed_at is not null
  and captured_at between v_capture.captured_at-interval '15 seconds' and v_capture.captured_at+interval '15 seconds';
 if v_auto and v_count<2 then
  update public.camera_captures set status='waiting_consensus',result='{"reason":"Aguardando segunda captura concordante"}' where id=p_capture_id;
  return jsonb_build_object('status','waiting_consensus');
 end if;
 -- Leituras conflitantes da mesma passagem nunca geram uma alternância automática.
 if exists(select 1 from public.camera_captures where camera_id=v_camera.id and passage_id=v_capture.passage_id and suggested_plate<>v_plate and confidence>=v_camera.min_confidence) then v_auto:=false; end if;
 select * into v_vehicle from public.vehicles where company_id=v_camera.company_id and plate=v_plate and archived_at is null for update;
 if v_auto and found then
  select * into v_last from public.vehicle_movements where vehicle_id=v_vehicle.id order by occurred_at desc,created_at desc limit 1;
  if (v_camera.direction='entry' and v_last.movement_type='entry') or
     (v_camera.direction='exit' and (v_last.id is null or v_last.movement_type='exit')) then
   v_result:=jsonb_build_object('status','ignored','reason','Presença atual incompatível com a direção da câmera; confira no pátio.');
   insert into private.camera_passages(camera_id,passage_id,result) values(v_camera.id,v_capture.passage_id,v_result);
   update public.camera_captures set status='ignored',result=v_result where id=p_capture_id;
   update public.camera_captures set status='ignored',result=v_result where camera_id=v_camera.id and passage_id=v_capture.passage_id and status in ('waiting_consensus','review');
   return v_result;
  end if;
 end if;
 v_result:=public.register_plate_read(v_camera.id,v_plate,case when v_auto then p_confidence else 0 end,
  'rapidocr-windows-1','1.0.0',v_capture.captured_at,null,'esp32:'||v_camera.id||':'||v_capture.passage_id,null,90,v_auto);
 update public.camera_captures set status=case when v_result->>'status' in ('confirmed','duplicate') then 'done' else 'review' end,
  plate_read_event_id=(v_result->>'plateReadEventId')::uuid,result=v_result where id=p_capture_id;
 insert into private.camera_passages(camera_id,passage_id,result) values(v_camera.id,v_capture.passage_id,v_result);
 update public.camera_captures set status='ignored',result=v_result where camera_id=v_camera.id and passage_id=v_capture.passage_id and id<>p_capture_id and status in ('waiting_consensus','review');
 return v_result;
end $$;

create function public.camera_review(p_capture_id uuid,p_vehicle_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_capture public.camera_captures; v_read jsonb; v_result jsonb; v_camera public.cameras;
begin
 perform private.assert_permission('ocr.operate'); perform private.assert_permission('movements.write');
 if length(btrim(coalesce(p_reason,'')))<10 then raise exception 'Descreva a revisão em pelo menos 10 caracteres.'; end if;
 select c.* into v_camera from public.cameras c join public.camera_captures j on j.camera_id=c.id where j.id=p_capture_id for update of c;
 perform private.assert_company_access(v_camera.company_id);
 select * into v_capture from public.camera_captures where id=p_capture_id for update;
 if v_capture.status not in ('review','waiting_consensus') then raise exception 'Esta captura não aguarda revisão.'; end if;
 if v_capture.image_deleted_at is not null or v_capture.captured_at<now()-interval '24 hours' then raise exception 'Captura expirada. Confira e registre manualmente no Pátio.'; end if;
 if exists(select 1 from public.vehicle_movements where plate_read_event_id in
   (select plate_read_event_id from public.camera_captures where camera_id=v_camera.id and passage_id=v_capture.passage_id)) then raise exception 'Passagem já registrada.'; end if;
 if v_capture.plate_read_event_id is null then
  v_read:=public.register_plate_read(v_camera.id,v_capture.suggested_plate,0,'rapidocr-review','1.0.0',v_capture.captured_at,null,
    'esp32:'||v_camera.id||':'||v_capture.passage_id,null,90,false);
  v_capture.plate_read_event_id:=(v_read->>'plateReadEventId')::uuid;
 end if;
 v_result:=public.confirm_plate_read(v_capture.plate_read_event_id,p_vehicle_id,p_reason);
 update public.camera_captures set status='done',plate_read_event_id=v_capture.plate_read_event_id,result=v_result where id=p_capture_id;
 insert into private.camera_passages(camera_id,passage_id,result) values(v_camera.id,v_capture.passage_id,v_result)
  on conflict(camera_id,passage_id) do update set result=excluded.result,decided_at=now();
 update public.camera_captures set status='ignored',result=v_result where camera_id=v_camera.id and passage_id=v_capture.passage_id and id<>p_capture_id and status in ('waiting_consensus','review');
 return v_result;
end $$;

-- Retenção: fotos são removidas por camera-maintenance usando a API Storage.
create function public.camera_expired_images(p_limit integer default 100)
returns table(id uuid,object_path text) language sql security definer set search_path='' as $$
 select id,object_path from (
  select id,object_path from public.camera_captures where received_at<now()-interval '24 hours' and image_deleted_at is null
  union all select id,object_path from private.camera_image_gc
 ) itens limit least(greatest(p_limit,1),100);
$$;
create function public.camera_mark_deleted(p_ids uuid[])
returns void language sql security definer set search_path='' as $$
 update public.camera_captures set image_deleted_at=now() where id=any(p_ids) and received_at<now()-interval '24 hours';
 delete from private.camera_image_gc where id=any(p_ids);
 delete from private.camera_passages where decided_at<now()-interval '30 days';
 delete from public.camera_captures where received_at<now()-interval '30 days' and image_deleted_at is not null;
 update public.camera_captures set status='error',error_message='Captura expirada ou processamento interrompido.'
  where (status in ('uploading','queued','processing') and received_at<now()-interval '15 minutes') or (status='processing' and attempts>=3 and lease_until<now());
$$;

revoke all on function public.camera_save(uuid,text,uuid,public.camera_direction,boolean,boolean,numeric,jsonb,integer),
 public.camera_rotate_key(uuid,boolean),public.camera_claim(),public.camera_finish(uuid,uuid,text,numeric,boolean,text),public.camera_review(uuid,uuid,text) from public,anon;
grant execute on function public.camera_save(uuid,text,uuid,public.camera_direction,boolean,boolean,numeric,jsonb,integer),
 public.camera_rotate_key(uuid,boolean),public.camera_claim(),public.camera_finish(uuid,uuid,text,numeric,boolean,text),public.camera_review(uuid,uuid,text) to authenticated;
revoke all on function public.camera_reserve(text,uuid,uuid,timestamptz,boolean,text,text),public.camera_commit_upload(uuid),public.camera_expired_images(integer),public.camera_mark_deleted(uuid[]) from public,anon,authenticated;
grant execute on function public.camera_reserve(text,uuid,uuid,timestamptz,boolean,text,text),public.camera_commit_upload(uuid),public.camera_expired_images(integer),public.camera_mark_deleted(uuid[]) to service_role;
commit;
