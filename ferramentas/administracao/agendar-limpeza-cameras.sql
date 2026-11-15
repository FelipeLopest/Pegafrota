-- Executar no SQL Editor do projeto Supabase DEPOIS de implantar camera-maintenance.
-- No Vault do projeto, criar previamente os segredos abaixo sem incluí-los no Git:
-- pnf_camera_project_url : URL HTTPS do Supabase, sem barra no fim.
-- pnf_camera_service_key : chave service_role do MESMO projeto (somente servidor).
-- Não usar a chave anon: a manutenção exige a credencial administrativa do servidor.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='pnf_camera_project_url' and decrypted_secret like 'https://%.supabase.co')
 or not exists(select 1 from vault.decrypted_secrets where name='pnf_camera_service_key' and length(decrypted_secret)>50)
 then raise exception 'Configure pnf_camera_project_url e pnf_camera_service_key no Vault antes de agendar.'; end if;
end $$;
select cron.schedule('pnf-camera-retention','*/5 * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='pnf_camera_project_url')||'/functions/v1/camera-maintenance',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='pnf_camera_service_key')),
  body:='{}'::jsonb,timeout_milliseconds:=30000
 );
$job$);
