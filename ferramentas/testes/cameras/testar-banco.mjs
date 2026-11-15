import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import verificar from 'node:assert/strict';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const banco = new PGlite({ extensions: { pgcrypto } });
let verificacoes = 0;
const empresa = '10000000-0000-4000-8000-000000000001';
const outraEmpresa = '10000000-0000-4000-8000-000000000002';
const usuario = '20000000-0000-4000-8000-000000000001';
const outroUsuario = '20000000-0000-4000-8000-000000000002';
const leitor = '20000000-0000-4000-8000-000000000003';
const local = '30000000-0000-4000-8000-000000000001';
const veiculo = '40000000-0000-4000-8000-000000000001';
const veiculoManual = '40000000-0000-4000-8000-000000000002';

async function como(identificador, consulta, valores = [], papel = 'authenticated') {
  return banco.transaction(async (transacao) => {
    await transacao.exec(`set local role ${papel}`);
    await transacao.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: identificador, role: papel }),
    ]);
    return transacao.query(consulta, valores);
  });
}
async function rpc(nome, valores = [], identificador = usuario, papel = 'authenticated') {
  const resultado = await como(
    identificador,
    `select public.${nome}(${valores.map((_, indice) => '$' + (indice + 1)).join(',')}) as resposta`,
    valores,
    papel,
  );
  return resultado.rows[0].resposta;
}
async function deveFalhar(funcao, descricao) {
  await verificar.rejects(funcao, descricao);
  verificacoes++;
}
async function reservar(chave, passagem = randomUUID(), evento = randomUUID()) {
  // Avançar só o limitador na base isolada; não aguardar relógio nos testes.
  await banco.exec(
    "update private.camera_credentials set last_request_at=now()-interval '2 seconds'",
  );
  const reserva = await rpc(
    'camera_reserve',
    [chave, evento, passagem, new Date().toISOString(), false, 'teste', 'ready'],
    null,
    'service_role',
  );
  return { ...reserva, passagem, evento };
}
async function concluir(reserva, placa = 'ABC1D23', confianca = 0.99, ambiguo = false) {
  await rpc('camera_commit_upload', [reserva.id], null, 'service_role');
  const capturada = await rpc('camera_claim');
  verificar.equal(capturada.id, reserva.id);
  return {
    claim: capturada,
    resultado: await rpc('camera_finish', [
      reserva.id,
      capturada.claimId,
      placa,
      confianca,
      ambiguo,
    ]),
  };
}
try {
  await banco.exec(
    readFileSync(join(raiz, 'ferramentas/testes/cameras/ambiente-descartavel.sql'), 'utf8'),
  );
  for (const nome of readdirSync(join(raiz, 'supabase/migrations'))
    .filter((nome) => nome.endsWith('.sql'))
    .sort()) {
    await banco.exec(readFileSync(join(raiz, 'supabase/migrations', nome), 'utf8'));
  }
  await banco.exec(`
    insert into public.companies(id,cnpj,legal_name,trade_name) values
      ('${empresa}','19131243000197','Empresa Camera','Empresa Camera'),
      ('${outraEmpresa}','11444777000161','Outra Empresa','Outra Empresa');
    insert into auth.users(id,email,raw_user_meta_data) values
      ('${usuario}','operador@example.test','{"full_name":"Operador Teste"}'),
      ('${outroUsuario}','outro@example.test','{"full_name":"Outro Teste"}'),
      ('${leitor}','leitor@example.test','{"full_name":"Leitor Teste"}');
    insert into public.profiles(id,full_name) values ('${usuario}','Operador Teste'),('${outroUsuario}','Outro Teste'),('${leitor}','Leitor Teste');
    insert into public.company_memberships(company_id,user_id,role) values
      ('${empresa}','${usuario}','company_admin'),('${outraEmpresa}','${outroUsuario}','company_admin'),('${empresa}','${leitor}','viewer');
    insert into public.locations(id,company_id,name) values('${local}','${empresa}','Portaria Teste');
    insert into public.vehicles(id,company_id,plate,brand,model,fuel_type,current_odometer_km)
      values('${veiculo}','${empresa}','ABC1D23','Marca','Modelo','diesel_s10',0),
            ('${veiculoManual}','${empresa}','DEF2G34','Marca','Modelo','diesel_s10',0);
  `);
  // A operação sem câmera continua sendo a mesma RPC existente.
  const manual = await rpc('register_vehicle_movement', [veiculoManual, local]);
  verificar.ok(manual);
  verificacoes++;
  const camera = await rpc('camera_save', [
    null,
    'Entrada',
    local,
    'entry',
    true,
    true,
    0.9,
    [0, 0, 1, 1],
  ]);
  const segredo = await rpc('camera_rotate_key', [camera, false]);
  verificar.match(segredo.deviceKey, /^pnfc_[a-f0-9]{64}$/);
  verificacoes++;
  const hashes = await banco.query('select token_hash from private.camera_credentials');
  verificar.notEqual(hashes.rows[0].token_hash, segredo.deviceKey);
  verificacoes++;
  await deveFalhar(
    () => rpc('camera_rotate_key', [camera, false], outroUsuario),
    'Outra empresa não pode gerar chave',
  );
  await deveFalhar(() => rpc('camera_save', [null, 'Intrusa', local, 'entry'], outroUsuario));
  await deveFalhar(() => rpc('camera_claim', [], leitor), 'Viewer não processa');
  await deveFalhar(
    () => como(usuario, 'select * from private.camera_credentials'),
    'Segredos não são selecionáveis',
  );
  await deveFalhar(
    () => rpc('camera_reserve', [segredo.deviceKey]),
    'Usuário não chama intake interno',
  );
  await deveFalhar(
    () => rpc('camera_reserve', ['pnfc_' + '0'.repeat(64)], null, 'service_role'),
    'Chave inválida',
  );
  await deveFalhar(
    () => rpc('camera_save', [camera, 'Entrada', local, 'both', true, true, 0.9, [0, 0, 1, 1]]),
    'Bidirecional não automatiza',
  );
  await deveFalhar(
    () => rpc('camera_save', [camera, 'Entrada', local, 'entry', true, true, 0.2, [0, 0, 1, 1]]),
    'Limiar inseguro',
  );
  const primeira = await reservar(segredo.deviceKey);
  await deveFalhar(
    () =>
      rpc(
        'camera_reserve',
        [segredo.deviceKey, randomUUID(), randomUUID(), new Date().toISOString(), false],
        null,
        'service_role',
      ),
    'Rate limit',
  );
  const repetida = await reservar(segredo.deviceKey, primeira.passagem, primeira.evento);
  verificar.equal(repetida.id, primeira.id);
  verificacoes++;
  const retorno1 = await concluir(primeira);
  verificar.equal(retorno1.resultado.status, 'waiting_consensus');
  verificacoes++;
  const segunda = await reservar(segredo.deviceKey, primeira.passagem);
  const retorno2 = await concluir(segunda);
  verificar.equal(retorno2.resultado.status, 'confirmed');
  verificacoes++;
  verificar.equal(
    Number(
      (
        await banco.query(
          'select count(*) as total from public.vehicle_movements where vehicle_id=$1',
          [veiculo],
        )
      ).rows[0].total,
    ),
    1,
  );
  verificacoes++;
  const terceira = await reservar(segredo.deviceKey, primeira.passagem);
  verificar.equal((await concluir(terceira)).resultado.status, 'ignored');
  verificacoes++;
  await deveFalhar(
    () => rpc('camera_finish', [segunda.id, retorno2.claim.claimId, 'ABC1D23', 0.99, false]),
    'Resposta não é reaplicada',
  );
  const acessoOutraEmpresa = await como(outroUsuario, 'select * from public.camera_captures');
  verificar.equal(acessoOutraEmpresa.rows.length, 0);
  verificacoes++;
  const baixa = await reservar(segredo.deviceKey);
  const baixaRetorno = await concluir(baixa, 'ABC1D23', 0.4);
  verificar.equal(baixaRetorno.resultado.status, 'review');
  verificacoes++;
  await deveFalhar(() =>
    rpc('camera_review', [baixa.id, veiculo, 'Confirmado visualmente'], outroUsuario),
  );
  await deveFalhar(() => rpc('camera_review', [baixa.id, veiculo, 'curto']));
  await rpc('camera_review', [
    baixa.id,
    veiculoManual,
    'Conferido pelo operador no teste: sugestão corrigida',
  ]);
  verificar.equal(
    Number(
      (
        await banco.query(
          'select count(*) as total from public.vehicle_movements where vehicle_id=$1',
          [veiculoManual],
        )
      ).rows[0].total,
    ),
    2,
  );
  verificacoes++;
  await deveFalhar(() => rpc('camera_review', [baixa.id, veiculo, 'Repetir a mesma conferência']));
  const semPlaca = await reservar(segredo.deviceKey);
  verificar.equal((await concluir(semPlaca, null, 0)).resultado.status, 'ignored');
  verificacoes++;
  const desconhecida = await reservar(segredo.deviceKey);
  verificar.equal(
    (await concluir(desconhecida, 'ZZZ9Z99', 0.99, true)).resultado.status,
    'low_confidence',
  );
  verificacoes++;
  const perdida = await reservar(segredo.deviceKey);
  await rpc('camera_commit_upload', [perdida.id], null, 'service_role');
  const reivindicada = await rpc('camera_claim');
  verificar.equal(await rpc('camera_claim'), null);
  verificacoes++;
  await banco.query(
    "update public.camera_captures set lease_until=now()-interval '1 second' where id=$1",
    [perdida.id],
  );
  await deveFalhar(() =>
    rpc('camera_finish', [perdida.id, reivindicada.claimId, 'ABC1D23', 0.99, false]),
  );
  const retomada = await rpc('camera_claim');
  verificar.notEqual(retomada.claimId, reivindicada.claimId);
  verificacoes++;
  await rpc('camera_finish', [perdida.id, retomada.claimId, null, 0, false, 'Falha temporária']);
  const novamente = await rpc('camera_claim');
  verificar.equal(novamente.id, perdida.id);
  verificacoes++;
  await rpc('camera_finish', [perdida.id, novamente.claimId, null, 0, false]);
  const mesmaPresenca = await reservar(segredo.deviceKey);
  await concluir(mesmaPresenca);
  const mesmaPresenca2 = await reservar(segredo.deviceKey, mesmaPresenca.passagem);
  verificar.equal((await concluir(mesmaPresenca2)).resultado.status, 'ignored');
  verificacoes++;
  const novoVeiculo = randomUUID();
  await banco.query(
    "insert into public.vehicles(id,company_id,plate,brand,model,fuel_type,current_odometer_km) values($1,$2,'GHI3J45','Marca','Modelo','diesel_s10',0)",
    [novoVeiculo, empresa],
  );
  const tremida = await reservar(segredo.deviceKey);
  verificar.equal((await concluir(tremida, 'GHI3J45', 0.3)).resultado.status, 'review');
  verificacoes++;
  const nitida = await reservar(segredo.deviceKey, tremida.passagem);
  verificar.equal((await concluir(nitida, 'GHI3J45')).resultado.status, 'waiting_consensus');
  verificacoes++;
  const nitida2 = await reservar(segredo.deviceKey, tremida.passagem);
  verificar.equal((await concluir(nitida2, 'GHI3J45')).resultado.status, 'confirmed');
  verificacoes++;
  verificar.equal(
    (await banco.query('select status from public.camera_captures where id=$1', [tremida.id]))
      .rows[0].status,
    'ignored',
  );
  verificacoes++;
  await banco.query("insert into storage.objects(bucket_id,name) values('camera-captures',$1)", [
    primeira.path,
  ]);
  verificar.equal(
    (await como(usuario, "select * from storage.objects where bucket_id='camera-captures'")).rows
      .length,
    1,
  );
  verificacoes++;
  verificar.equal(
    (await como(outroUsuario, "select * from storage.objects where bucket_id='camera-captures'"))
      .rows.length,
    0,
  );
  verificacoes++;
  await banco.query("update public.cameras set settings=jsonb_set(settings,'{dailyCaptureLimit}','1') where id=$1",[camera]);
  await deveFalhar(() => reservar(segredo.deviceKey), 'Limite por câmera é aplicado no servidor');
  await banco.query("update public.cameras set settings=jsonb_set(settings,'{dailyCaptureLimit}','1000') where id=$1",[camera]);
  const chaveNova = await rpc('camera_rotate_key', [camera, false]);
  await deveFalhar(() => reservar(segredo.deviceKey));
  await reservar(chaveNova.deviceKey);
  await rpc('camera_rotate_key', [camera, true]);
  await deveFalhar(() => reservar(chaveNova.deviceKey));
  verificar.equal(
    (await banco.query("select public from storage.buckets where id='camera-captures'")).rows[0]
      .public,
    false,
  );
  verificacoes++;
  await banco.query(
    "update public.camera_captures set received_at=now()-interval '25 hours' where id=$1",
    [primeira.id],
  );
  const expiradas = (
    await como(null, 'select * from public.camera_expired_images(100)', [], 'service_role')
  ).rows;
  verificar.ok(expiradas.some((item) => item.id === primeira.id));
  verificacoes++;
  await rpc('camera_mark_deleted', [[primeira.id]], null, 'service_role');
  verificar.equal(
    (await como(usuario, "select * from storage.objects where bucket_id='camera-captures'")).rows
      .length,
    0,
  );
  verificacoes++;
  verificar.ok(
    (
      await banco.query('select image_deleted_at from public.camera_captures where id=$1', [
        primeira.id,
      ])
    ).rows[0].image_deleted_at,
  );
  verificacoes++;
  console.log(
    `Câmeras: ${verificacoes} verificações de banco aprovadas; todas as migrations aplicadas em PostgreSQL isolado.`,
  );
} catch (erro) {
  console.error(erro.message, erro.where || '');
  process.exitCode = 1;
} finally {
  await banco.close();
}
