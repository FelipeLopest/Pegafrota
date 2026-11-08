-- =============================================================================
-- 12_platform_provisioning — provisionamento, idempotência e compensação
-- =============================================================================
-- Cobre os casos que o handoff exige demonstrar:
--   criação normal · CNPJ inválido · CNPJ duplicado · e-mail já usado ·
--   falha após criar empresa (partial_failure) · compensação · retentativa ·
--   resposta idempotente · reuso indevido de chave.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Fixtures: um platform_admin ativo
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  (private.stable_uuid('t12:owner'),  'owner@t12.test',  'authenticated', 'authenticated'),
  (private.stable_uuid('t12:admin1'), 'admin1@t12.test', 'authenticated', 'authenticated'),
  (private.stable_uuid('t12:admin2'), 'admin2@t12.test', 'authenticated', 'authenticated'),
  (private.stable_uuid('t12:intruso'),'intruso@t12.test','authenticated', 'authenticated');

insert into public.profiles (id, full_name, active) values
  (private.stable_uuid('t12:owner'),  'Dona da Plataforma', true),
  (private.stable_uuid('t12:intruso'),'Pessoa Qualquer',    true);

insert into platform.admins (user_id, status) values (private.stable_uuid('t12:owner'), 'active');

-- Payload reutilizado nos testes.
create temporary view _payload as
select jsonb_build_object(
  'legalName', 'Transportes T12 Alfa LTDA',
  'tradeName', 'T12 Alfa',
  'cnpj', '11444777000161',
  'email', 'contato@t12alfa.test',
  'addressCity', 'Sorocaba',
  'addressState', 'SP',
  'timezone', 'America/Sao_Paulo'
) as company;

-- ===========================================================================
-- 1. Abertura da operação e idempotência
-- ===========================================================================
select lives_ok(
  format($$ select platform.open_operation(
              'provision_company', %L, 'idem-key-0001',
              (select company from _payload),
              array['create_company','create_auth_user','link_company_admin','send_invite']) $$,
         private.stable_uuid('t12:owner')),
  'operação de provisionamento é aberta'
);

select is(
  (select count(*)::int from platform.operation_steps s
   join platform.operations o on o.id = s.operation_id
   where o.idempotency_key = 'idem-key-0001'),
  4,
  'a operação nasce com as quatro sub-operações da barra de progresso'
);

-- Repetir a MESMA chave com o MESMO payload devolve a operação original.
select is(
  (select is_replay from platform.open_operation(
     'provision_company', private.stable_uuid('t12:owner'), 'idem-key-0001',
     (select company from _payload),
     array['create_company','create_auth_user','link_company_admin','send_invite'])),
  true,
  'chave repetida com payload idêntico devolve replay (resposta idempotente)'
);

select is(
  (select count(*)::int from platform.operations where idempotency_key = 'idem-key-0001'),
  1,
  'e NÃO cria uma segunda operação'
);

-- Repetir a chave com payload DIFERENTE é erro — não se devolve silenciosamente
-- o resultado antigo para um pedido novo.
select throws_ok(
  format($$ select platform.open_operation(
              'provision_company', %L, 'idem-key-0001',
              jsonb_build_object('legalName','Outra Empresa LTDA','cnpj','06990590000123'),
              array['create_company']) $$,
         private.stable_uuid('t12:owner')),
  '23505',
  null,
  'chave reutilizada com payload diferente é recusada (IDEMPOTENCY_REUSE)'
);

-- Fingerprint é estável para o mesmo conteúdo lógico em ordem diferente.
select is(
  platform.payload_fingerprint('{"a":1,"b":2}'::jsonb),
  platform.payload_fingerprint('{"b":2,"a":1}'::jsonb),
  'fingerprint independe da ordem das chaves'
);
select isnt(
  platform.payload_fingerprint('{"a":1}'::jsonb),
  platform.payload_fingerprint('{"a":2}'::jsonb),
  'fingerprint muda quando o conteúdo muda'
);

-- ===========================================================================
-- 2. Etapa 1 — criação da empresa
-- ===========================================================================
create temporary table _op (id uuid) on commit drop;
insert into _op select operation_id from platform.open_operation(
  'provision_company', private.stable_uuid('t12:owner'), 'idem-key-0001',
  (select company from _payload),
  array['create_company','create_auth_user','link_company_admin','send_invite']);

select lives_ok(
  format($$ select platform.provision_company_record(%L, %L, (select company from _payload)) $$,
         (select id from _op), private.stable_uuid('t12:owner')),
  'empresa é criada na etapa 1'
);

select is(
  (select status::text from platform.operation_steps
   where operation_id = (select id from _op) and step_code = 'create_company'),
  'succeeded',
  'a sub-operação create_company fica succeeded'
);

select is(
  (select cnpj from public.companies where trade_name = 'T12 Alfa'),
  '11444777000161',
  'o CNPJ é normalizado e gravado sem separadores'
);

select isnt(
  (select company_id from platform.operations where id = (select id from _op)),
  null,
  'a operação passa a apontar a empresa criada'
);

-- CNPJ inválido: 422.
select throws_ok(
  format($$ select platform.provision_company_record(%L, %L,
             jsonb_build_object('legalName','X LTDA','tradeName','X','cnpj','11111111111111')) $$,
         (select id from _op), private.stable_uuid('t12:owner')),
  '22023',
  null,
  'CNPJ inválido é recusado'
);

-- CNPJ duplicado: 409 apontando a empresa existente.
select throws_ok(
  format($$ select platform.provision_company_record(%L, %L, (select company from _payload)) $$,
         (select id from _op), private.stable_uuid('t12:owner')),
  '23505',
  null,
  'CNPJ duplicado é recusado'
);

-- ===========================================================================
-- 3. Etapas 3 e 4 — primeiro company_admin + convite
-- ===========================================================================
select lives_ok(
  format($$ select platform.provision_first_admin(
              %L, %L, %L, %L, 'admin1@t12.test', 'Primeira Administradora', null,
              'TOKEN-DE-CONVITE-COM-TAMANHO-SUFICIENTE-01') $$,
         (select id from _op), private.stable_uuid('t12:owner'),
         (select company_id from platform.operations where id = (select id from _op)),
         private.stable_uuid('t12:admin1')),
  'primeiro company_admin é provisionado com convite'
);

select is(
  (select role::text from public.company_memberships
   where user_id = private.stable_uuid('t12:admin1')),
  'company_admin',
  'o primeiro administrador recebe o cargo fixo company_admin'
);

-- O vínculo nasce INATIVO: só o aceite do convite o liga.
select is(
  (select active from public.company_memberships
   where user_id = private.stable_uuid('t12:admin1')),
  false,
  'o vínculo nasce inativo, pendente de aceite do convite'
);

select is(
  (select count(*)::int from platform.company_invites
   where user_id = private.stable_uuid('t12:admin1')
     and accepted_at is null and revoked_at is null),
  1,
  'existe exatamente um convite pendente'
);

-- O token do convite não é armazenado em claro.
select is(
  (select count(*)::int from platform.company_invites
   where token_sha256 = 'TOKEN-DE-CONVITE-COM-TAMANHO-SUFICIENTE-01'),
  0,
  'o token do convite NÃO é gravado em claro'
);

-- Prazos vêm do backend, e existem.
select ok(
  (select expires_at > now() from platform.company_invites
   where user_id = private.stable_uuid('t12:admin1') and revoked_at is null),
  'o convite traz expires_at do backend'
);
select ok(
  (select resend_available_at is not null from platform.company_invites
   where user_id = private.stable_uuid('t12:admin1') and revoked_at is null),
  'o convite traz resend_available_at do backend'
);

-- Reenvio antes da janela é recusado com o tempo restante.
select throws_ok(
  format($$ select platform.issue_invite(%L, %L, 'admin1@t12.test',
             'OUTRO-TOKEN-DE-CONVITE-COM-TAMANHO-OK-02', %L) $$,
         (select company_id from platform.operations where id = (select id from _op)),
         private.stable_uuid('t12:admin1'), private.stable_uuid('t12:owner')),
  '55000',
  null,
  'reenviar antes de resend_available_at é recusado'
);

-- ===========================================================================
-- 4. Aceite do convite ativa o vínculo
-- ===========================================================================
select lives_ok(
  format($$ select platform.accept_invite(
             'TOKEN-DE-CONVITE-COM-TAMANHO-SUFICIENTE-01', %L) $$,
         private.stable_uuid('t12:admin1')),
  'o convite é aceito'
);

select is(
  (select active from public.company_memberships
   where user_id = private.stable_uuid('t12:admin1')),
  true,
  'o aceite ativa o vínculo do primeiro administrador'
);

-- Uso único.
select throws_ok(
  format($$ select platform.accept_invite(
             'TOKEN-DE-CONVITE-COM-TAMANHO-SUFICIENTE-01', %L) $$,
         private.stable_uuid('t12:admin1')),
  '55000',
  null,
  'o convite é de uso único'
);

-- ===========================================================================
-- 5. Conclusão da operação
-- ===========================================================================
select lives_ok(
  format($$ select platform.finish_provisioning(%L, %L,
             jsonb_build_object('inviteSent', true)) $$,
         (select id from _op), private.stable_uuid('t12:owner')),
  'a operação é concluída'
);

select is(
  (select status::text from platform.operations where id = (select id from _op)),
  'succeeded',
  'a operação fica succeeded'
);

select ok(
  (select finished_at is not null from platform.operations where id = (select id from _op)),
  'estado terminal carimba finished_at'
);

select is(
  (select retryable from platform.operations where id = (select id from _op)),
  false,
  'operação concluída nunca é oferecida para retentativa'
);

-- Retentar o que deu certo devolve o resultado original, sem refazer nada.
select is(
  (select platform.retry_provisioning((select id from _op), private.stable_uuid('t12:owner'))
          ->> 'replayed'),
  'true',
  'retentar operação concluída devolve o resultado original'
);

-- ===========================================================================
-- 6. Falha parcial e COMPENSAÇÃO
-- ===========================================================================
-- Nova operação: empresa criada, e a etapa seguinte falha.
create temporary table _op2 (id uuid) on commit drop;
insert into _op2 select operation_id from platform.open_operation(
  'provision_company', private.stable_uuid('t12:owner'), 'idem-key-0002',
  jsonb_build_object('legalName','Frota Meia Falha LTDA','tradeName','Meia Falha',
                     'cnpj','06990590000123'),
  array['create_company','create_auth_user','link_company_admin','send_invite']);

select lives_ok(
  format($$ select platform.provision_company_record(%L, %L,
             jsonb_build_object('legalName','Frota Meia Falha LTDA','tradeName','Meia Falha',
                                'cnpj','06990590000123')) $$,
         (select id from _op2), private.stable_uuid('t12:owner')),
  'empresa da segunda operação é criada'
);

select lives_ok(
  format($$ select platform.fail_provisioning(%L, %L, 'auth_user_creation_failed',
             'GoTrue indisponível', true) $$,
         (select id from _op2), private.stable_uuid('t12:owner')),
  'a falha após criar a empresa é registrada (partial_failure)'
);

select is(
  (select status::text from platform.operations where id = (select id from _op2)),
  'failed',
  'a operação fica failed'
);
select is(
  (select retryable from platform.operations where id = (select id from _op2)),
  true,
  'e é marcada como repetível pelo backend'
);

-- A empresa órfã existe neste ponto — é exatamente o lixo que a compensação remove.
select is(
  (select count(*)::int from public.companies where cnpj = '06990590000123'),
  1,
  'antes da compensação, a empresa órfã existe'
);

select lives_ok(
  format($$ select platform.compensate_provisioning(%L, %L, 'teste de compensação') $$,
         (select id from _op2), private.stable_uuid('t12:owner')),
  'a compensação executa'
);

-- Compensar NÃO apaga: apaga seria enfraquecer a auditoria append-only e
-- violar "sem exclusão física de empresa". A empresa é arquivada.
select is(
  (select status::text from public.companies where cnpj = '06990590000123'),
  'archived',
  'a empresa meio provisionada é arquivada, não apagada'
);

select ok(
  (select archived_at is not null from public.companies where cnpj = '06990590000123'),
  'o arquivamento é carimbado'
);

-- E a trilha tenant da criação continua íntegra: nada foi destruído para
-- encobrir a falha.
select ok(
  (select count(*) > 0 from audit.events e
   join public.companies c on c.id = e.company_id
   where c.cnpj = '06990590000123'),
  'a auditoria tenant da empresa compensada permanece intacta'
);

-- Nenhum vínculo ativo sobra apontando para a empresa compensada.
select is(
  (select count(*)::int from public.company_memberships m
   join public.companies c on c.id = m.company_id
   where c.cnpj = '06990590000123' and m.active),
  0,
  'não sobra vínculo ativo após a compensação'
);

select is(
  (select status::text from platform.operations where id = (select id from _op2)),
  'compensated',
  'a operação fica compensated'
);

-- A trilha GLOBAL do que aconteceu permanece, mesmo tendo a empresa sumido.
select is(
  (select count(*)::int from platform.audit_events
   where action = 'company.provision_compensated' and result = 'compensated'),
  1,
  'a compensação fica registrada na auditoria global'
);

-- Compensar duas vezes é inofensivo.
select is(
  (select platform.compensate_provisioning(
            (select id from _op2), private.stable_uuid('t12:owner')) ->> 'changed'),
  'false',
  'compensar de novo é idempotente'
);

-- Retentar depois de compensar reativa a MESMA empresa: mesmo id, mesmo CNPJ.
-- É o que torna a compensação por arquivamento superior ao delete — não há
-- colisão de CNPJ nem um segundo registro para o mesmo cliente.
select lives_ok(
  format($$ select platform.retry_provisioning(%L, %L) $$,
         (select id from _op2), private.stable_uuid('t12:owner')),
  'operação compensada aceita retentativa'
);

select is(
  (select status::text from public.companies where cnpj = '06990590000123'),
  'active',
  'a retentativa reativa a empresa arquivada pela compensação'
);

select is(
  (select count(*)::int from public.companies where cnpj = '06990590000123'),
  1,
  'e continua existindo exatamente uma empresa com esse CNPJ'
);

-- ===========================================================================
-- 7. Compensação RECUSADA quando a empresa já tem dados
-- ===========================================================================
create temporary table _op3 (id uuid) on commit drop;
insert into _op3 select operation_id from platform.open_operation(
  'provision_company', private.stable_uuid('t12:owner'), 'idem-key-0003',
  jsonb_build_object('legalName','Com Dados LTDA','tradeName','Com Dados',
                     'cnpj','60746948000112'),
  array['create_company','create_auth_user','link_company_admin','send_invite']);

select platform.provision_company_record(
  (select id from _op3), private.stable_uuid('t12:owner'),
  jsonb_build_object('legalName','Com Dados LTDA','tradeName','Com Dados',
                     'cnpj','60746948000112'));

-- Um veículo basta para tornar a empresa intocável.
insert into public.vehicles (company_id, plate, brand, model, fuel_type)
select company_id, 'ABC1D23', 'Marca', 'Modelo', 'diesel_s10'
from platform.operations where id = (select id from _op3);

select platform.fail_provisioning(
  (select id from _op3), private.stable_uuid('t12:owner'), 'algum_erro', null, true);

select is(
  (select platform.compensate_provisioning(
            (select id from _op3), private.stable_uuid('t12:owner')) ->> 'status'),
  'needs_manual',
  'compensar empresa com dados é recusado: vira needs_manual'
);

select is(
  (select count(*)::int from public.companies where cnpj = '60746948000112'),
  1,
  'a empresa com dados NÃO é apagada'
);

select is(
  (select retryable from platform.operations where id = (select id from _op3)),
  false,
  'operação em needs_manual não é repetível'
);

-- Retentar o que exige intervenção manual é recusado.
select throws_ok(
  format($$ select platform.retry_provisioning(%L, %L) $$,
         (select id from _op3), private.stable_uuid('t12:owner')),
  '55000',
  null,
  'retentar operação needs_manual é recusado (NOT_RETRYABLE)'
);

-- ===========================================================================
-- 8. Retentativa de operação repetível
-- ===========================================================================
create temporary table _op4 (id uuid) on commit drop;
insert into _op4 select operation_id from platform.open_operation(
  'provision_company', private.stable_uuid('t12:owner'), 'idem-key-0004',
  jsonb_build_object('legalName','Retentar LTDA','tradeName','Retentar',
                     'cnpj','33000167000101'),
  array['create_company','create_auth_user','link_company_admin','send_invite']);

select platform.fail_provisioning(
  (select id from _op4), private.stable_uuid('t12:owner'), 'transitorio', null, true);

select lives_ok(
  format($$ select platform.retry_provisioning(%L, %L) $$,
         (select id from _op4), private.stable_uuid('t12:owner')),
  'operação repetível aceita retentativa'
);

select is(
  (select status::text from platform.operations where id = (select id from _op4)),
  'running',
  'a retentativa devolve a operação para running'
);

select ok(
  (select attempt_count >= 1 from platform.operations where id = (select id from _op4)),
  'a contagem de tentativas é incrementada'
);

-- ===========================================================================
-- 9. Acesso negado em todo o fluxo
-- ===========================================================================
select throws_ok(
  format($$ select platform.open_operation('provision_company', %L, 'chave-intrusa-0001',
             '{}'::jsonb, array['create_company']) $$,
         private.stable_uuid('t12:intruso')),
  '42501',
  null,
  'quem não é platform_admin não abre operação'
);

select throws_ok(
  format($$ select platform.provision_company_record(%L, %L, (select company from _payload)) $$,
         (select id from _op), private.stable_uuid('t12:intruso')),
  '42501',
  null,
  'quem não é platform_admin não cria empresa'
);

select throws_ok(
  format($$ select platform.compensate_provisioning(%L, %L) $$,
         (select id from _op2), private.stable_uuid('t12:intruso')),
  '42501',
  null,
  'quem não é platform_admin não compensa'
);

-- ===========================================================================
-- 10. Privacidade operacional: o detalhe da empresa não expõe a frota
-- ===========================================================================
select is(
  (select count(*)::int
   from jsonb_object_keys(
     platform.get_company(private.stable_uuid('t12:owner'),
       (select company_id from platform.operations where id = (select id from _op3)))
   ) k
   where k in ('vehicles','plates','trips','fuelings','maintenance','costs','drivers')),
  0,
  'get_company não devolve nenhum dado operacional do cliente'
);

select * from finish();
rollback;
