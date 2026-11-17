const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const raiz = path.resolve(__dirname, '../../..');
const banco = new PGlite({ extensions: { pgcrypto } });
const operadorPlataforma = randomUUID();
const gestor = randomUUID();
const autor = randomUUID();
const autorViagem = randomUUID();
const contaExclusiva = randomUUID();
const semHistorico = randomUUID();
const gestorExterno = randomUUID();
const empresa = randomUUID();
const outraEmpresa = randomUUID();
const veiculo = randomUUID();
const outroVeiculo = randomUUID();
const leitura = randomUUID();
const outraLeitura = randomUUID();
const abastecimento = randomUUID();
const viagem = randomUUID();
const local = randomUUID();
const camera = randomUUID();
const placa = randomUUID();

async function chamar(esquema, funcao, argumentos, papel = 'service_role', usuario = null) {
  const seletores = argumentos.map((_, indice) => `$${indice + 1}`).join(', ');
  return banco.transaction(async transacao => {
    await transacao.exec(`set local role ${papel}`);
    await transacao.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: papel, sub: usuario }),
    ]);
    const resposta = await transacao.query(`select ${esquema}.${funcao}(${seletores}) as r`, argumentos);
    return resposta.rows[0].r;
  });
}

async function prepararBanco() {
  const pasta = path.join(raiz, 'supabase/migrations');
  const migracoes = fs.readdirSync(pasta).filter(nome => nome.endsWith('.sql')).sort();
  await banco.exec(fs.readFileSync(path.join(raiz, 'ferramentas/testes/cameras/ambiente-descartavel.sql'), 'utf8'));
  for (const nome of migracoes) await banco.exec(fs.readFileSync(path.join(pasta, nome), 'utf8'));

  for (const [id, nome] of [[operadorPlataforma, 'Plataforma'], [gestor, 'Gestor'],
    [autor, 'Autor'], [autorViagem, 'Viagem'], [contaExclusiva, 'Exclusiva'],
    [semHistorico, 'Operador'], [gestorExterno, 'Externo']]) {
    await banco.query('insert into auth.users(id,email) values($1,$2)', [id, `${nome.toLowerCase()}@example.test`]);
    await banco.query('insert into public.profiles(id,full_name) values($1,$2)', [id, nome]);
  }
  await banco.query('insert into platform.admins(user_id) values($1)', [operadorPlataforma]);
  await banco.query(`insert into public.companies(id,cnpj,legal_name,trade_name) values
    ($1,'11444777000161','Frota São Tomé','Frota São Tomé'),
    ($2,'27865757000102','Frota Externa','Frota Externa')`, [empresa, outraEmpresa]);
  await banco.query(`insert into public.company_memberships(company_id,user_id,role,active) values
    ($1,$2,'company_admin',true),($1,$3,'company_admin',true),($1,$4,'operator',true),
    ($5,$6,'company_admin',true),($1,$6,'viewer',false),($5,$4,'viewer',false),
    ($1,$7,'operator',true),($1,$8,'operator',true)`,
  [empresa, gestor, autor, semHistorico, outraEmpresa, gestorExterno, autorViagem, contaExclusiva]);
  await banco.query(`insert into public.vehicles(id,company_id,plate,brand,model,fuel_type,current_odometer_km) values
    ($1,$2,'QAQ1A23','Marca','Modelo','diesel_s10',100),
    ($3,$4,'QAQ1A23','Marca','Modelo','diesel_s10',350)`, [veiculo, empresa, outroVeiculo, outraEmpresa]);
  await banco.query(`insert into public.vehicle_odometer_events(id,company_id,vehicle_id,occurred_at,odometer_km,source_type,created_by) values
    ($1,$2,$3,now()-interval '2 days',100,'vehicle_registration',$4),
    ($5,$6,$7,now()-interval '2 days',350,'vehicle_registration',$8)`, [leitura, empresa, veiculo, gestor, outraLeitura, outraEmpresa, outroVeiculo, semHistorico]);
  await banco.query('delete from public.company_memberships where company_id=$1 and user_id=$2', [outraEmpresa, semHistorico]);
  await banco.query(`insert into public.trips(id,company_id,vehicle_id,origin_label,destination_label,created_by)
    values($1,$2,$3,'Portaria','Garagem',$4)`, [viagem, empresa, veiculo, autorViagem]);
  assert.equal((await chamar('public', 'correct_odometer', [veiculo, leitura, 101, 'Conferência da leitura original', randomUUID()], 'authenticated', autor)).correctedKm, 101);
  await banco.query(`insert into public.fuelings(id,company_id,vehicle_id,fueled_at,odometer_km,fuel_type,liters,price_per_liter,total_amount)
    values($1,$2,$3,now()-interval '1 day',150,'diesel_s10',10,5,50)`, [abastecimento, empresa, veiculo]);
  await banco.query(`insert into public.vehicle_odometer_events(company_id,vehicle_id,occurred_at,odometer_km,source_type,source_id,created_by)
    values($1,$2,now()-interval '1 day',150,'fueling',$3,$4)`, [empresa, veiculo, abastecimento, gestor]);
  assert.equal((await chamar('public', 'reverse_fueling', [abastecimento, 'Abastecimento registrado em duplicidade', randomUUID()], 'authenticated', autor)).voided, true);

  await banco.query("insert into public.locations(id,company_id,name) values($1,$2,'Portaria')", [local, empresa]);
  await banco.query("insert into public.cameras(id,company_id,location_id,name,local_identifier) values($1,$2,$3,'Câmera QA','camera-qa')", [camera, empresa, local]);
  await banco.query(`insert into public.plate_read_events(id,company_id,camera_id,captured_at,raw_text,confidence,engine_version,contract_version)
    values($1,$2,$3,now(),'QAQ1A23',0.9,'qa','qa')`, [placa, empresa, camera]);
  await banco.query(`insert into public.plate_read_events(company_id,camera_id,captured_at,raw_text,confidence,status,duplicate_of_id,engine_version,contract_version)
    values($1,$2,now(),'QAQ1A23',0.9,'duplicate',$3,'qa','qa')`, [empresa, camera, placa]);
  return migracoes.length;
}

async function principal() {
  const migracoes = await prepararBanco();
  const prepararExclusao = (usuario, identidade) => chamar('platform', 'prepare_delete_company_member', [operadorPlataforma, empresa, usuario, identidade]);
  const alterarStatus = nome => chamar('platform', 'set_company_status', [operadorPlataforma, empresa, 'archived', null, nome]);
  const excluirEmpresa = nome => chamar('platform', 'hard_delete_company', [operadorPlataforma, empresa, nome]);

  await assert.rejects(prepararExclusao(autor, 'outra@example.test'), erro => erro.hint === 'CONFIRMATION_MISMATCH');
  const preparados = await prepararExclusao(autor, '  AUTOR@EXAMPLE.TEST ');
  assert.equal(preparados.deleteAuthUser, false);
  assert.equal(preparados.retainedReason, 'operational_history');
  const desligado = await chamar('platform', 'unlink_company_member', [operadorPlataforma, empresa, autor]);
  assert.equal(desligado.membershipDeleted, false);
  assert.equal(desligado.companyAccessRevoked, true);
  assert.equal(desligado.authUserDeleted, false);
  const contexto = await chamar('public', 'my_context', [], 'authenticated', autor);
  assert.equal(contexto.sessionState, 'NO_ACTIVE_MEMBERSHIP');
  assert.deepEqual(contexto.permissions, []);
  assert.equal((await banco.query('select count(*)::int as n from private.odometer_revisions where created_by=$1', [autor])).rows[0].n, 1);
  assert.equal((await banco.query('select count(*)::int as n from private.odometer_voids where created_by=$1', [autor])).rows[0].n, 1);
  await assert.rejects(prepararExclusao(gestor, 'gestor@example.test'), erro => erro.hint === 'LAST_ADMIN_PROTECTED');
  assert.equal((await prepararExclusao(gestorExterno, 'externo@example.test')).retainedReason, 'other_company_membership');
  const desvinculado = await chamar('platform', 'unlink_company_member', [operadorPlataforma, empresa, gestorExterno]);
  assert.equal(desvinculado.membershipDeleted, true);
  assert.equal((await chamar('public', 'my_context', [], 'authenticated', gestorExterno)).companyId, outraEmpresa);

  const contaViagem = await prepararExclusao(autorViagem, 'viagem@example.test');
  assert.equal(contaViagem.retainedReason, 'operational_history');
  const acessoViagem = await chamar('platform', 'unlink_company_member', [operadorPlataforma, empresa, autorViagem]);
  assert.equal(acessoViagem.membershipDeleted, false);
  const viagemAtualizada = await banco.query('update public.trips set notes=$2 where id=$1 returning created_by', [viagem, 'Conferida pela gestão']);
  assert.equal(viagemAtualizada.rows[0].created_by, autorViagem);
  assert.equal((await prepararExclusao(contaExclusiva, 'exclusiva@example.test')).deleteAuthUser, true);
  await banco.query('delete from auth.users where id=$1', [contaExclusiva]);
  assert.equal((await banco.query('select 1 from public.company_memberships where user_id=$1', [contaExclusiva])).rows.length, 0);
  console.log('PASSOU revogação com autoria preservada, edição de viagem, conta exclusiva e último administrador');

  await assert.rejects(excluirEmpresa('Frota São Tomé'), erro => erro.hint === 'CONFLICT_STATE');
  await assert.rejects(alterarStatus('Outra empresa'), erro => erro.hint === 'CONFIRMATION_MISMATCH');
  assert.equal((await alterarStatus('  FROTA  SÃO TOMÉ  ')).status, 'archived');
  await assert.rejects(excluirEmpresa('Outro nome'), erro => erro.hint === 'CONFIRMATION_MISMATCH');
  await assert.rejects(
    chamar('platform', 'hard_delete_company', [operadorPlataforma, empresa, 'Frota São Tomé'], 'authenticated', gestor),
    erro => erro.code === '42501',
  );
  const exclusao = await excluirEmpresa('frota são tomé');
  assert.equal(exclusao.deleted, true);
  assert.equal(exclusao.counts.plateReads, 2);
  assert.equal(exclusao.counts.fuelings, 1);
  const contas = new Map(exclusao.members.map(membro => [membro.userId, membro]));
  assert.equal(contas.get(gestor).deleteAuthUser, true);
  assert.equal(contas.get(autor).deleteAuthUser, true);
  assert.equal(contas.get(semHistorico).retainedReason, 'operational_history');
  for (const tabela of ['private.odometer_revisions', 'private.odometer_voids', 'public.vehicle_odometer_events', 'audit.events', 'public.plate_read_events']) {
    assert.equal((await banco.query(`select 1 from ${tabela} where company_id=$1`, [empresa])).rows.length, 0);
  }
  assert.equal((await banco.query('select 1 from public.companies where id=$1', [empresa])).rows.length, 0);
  assert.equal((await banco.query('select 1 from public.companies where id=$1', [outraEmpresa])).rows.length, 1);
  assert.equal((await banco.query('select 1 from public.vehicle_odometer_events where id=$1 and created_by=$2', [outraLeitura, semHistorico])).rows.length, 1);
  assert.equal((await banco.query("select count(*)::int as n from platform.audit_events where action='company.deleted_permanently' and target_id=$1 and company_id is null", [empresa])).rows[0].n, 1);
  await assert.rejects(banco.query('delete from public.vehicle_odometer_events where id=$1', [outraLeitura]), erro => erro.hint === 'IMMUTABLE_RECORD');
  console.log(`PASSOU purge com odômetro original, corrigido e anulado, duplicatas de placa e isolamento (${migracoes} migrations)`);
}

principal().catch(erro => { console.error(erro); process.exitCode = 1; }).finally(() => banco.close());
