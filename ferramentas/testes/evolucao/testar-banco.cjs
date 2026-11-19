const fs = require('node:fs');
const path = require('node:path');
const verificar = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const raiz = path.resolve(__dirname, '../../..');
const banco = new PGlite({ extensions: { pgcrypto } });
const empresa = randomUUID(),
  outra = randomUUID(),
  usuario = randomUUID(),
  outroUsuario = randomUUID();
const motorista = randomUUID(),
  vencido = randomUUID(),
  local = randomUUID(),
  outroLocal = randomUUID();
let numero = 1000;
let aprovados = 0;
async function como(sql, valores = [], ator = usuario, papel = 'authenticated') {
  return banco.transaction(async (transacao) => {
    await transacao.exec(`set local role ${papel}`);
    await transacao.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: ator, role: papel }),
    ]);
    return transacao.query(sql, valores);
  });
}
async function rpc(
  nome,
  valores = [],
  ator = usuario,
  papel = 'authenticated',
  esquema = 'public',
) {
  const resposta = await como(
    `select ${esquema}.${nome}(${valores.map((_, i) => '$' + (i + 1)).join(',')}) r`,
    valores,
    ator,
    papel,
  );
  return resposta.rows[0].r;
}
async function linha(sql, valores = []) {
  return (await banco.query(sql, valores)).rows[0];
}
async function veiculo(km = 0, empresaId = empresa, placa = 'AAA' + ++numero) {
  const id = randomUUID();
  await banco.query(
    'insert into public.vehicles(id,company_id,plate,brand,model,fuel_type,current_odometer_km) values($1,$2,$3,$4,$5,$6,$7)',
    [id, empresaId, placa, 'Marca', 'Modelo', 'diesel_s10', km],
  );
  return id;
}
function passou(caso) {
  aprovados++;
  process.stdout.write(`OK ${caso}\n`);
}
async function viagem(id, condutor = motorista) {
  return rpc('save_trip', [
    null,
    id,
    condutor,
    'Base',
    'Cliente',
    null,
    null,
    null,
    null,
    randomUUID(),
  ]);
}
function abastecer(id, km, data, cheio = false, comando = randomUUID(), tipo = 'diesel_s10') {
  return rpc('save_fueling', [
    id,
    10,
    6,
    km,
    tipo,
    data,
    null,
    null,
    'Posto',
    cheio,
    null,
    60,
    comando,
  ]);
}
const minuto = (deslocamento = 0) => new Date(Date.now() + deslocamento * 60000).toISOString();

(async () => {
  try {
    await banco.exec(
      fs.readFileSync(
        path.join(raiz, 'ferramentas/testes/cameras/ambiente-descartavel.sql'),
        'utf8',
      ),
    );
    const pasta = path.join(raiz, 'supabase/migrations');
    const migracoes = fs
      .readdirSync(pasta)
      .filter((nome) => nome.endsWith('.sql'))
      .sort();
    for (const nome of migracoes) {
      try {
        await banco.exec(fs.readFileSync(path.join(pasta, nome), 'utf8'));
      } catch (erro) {
        throw new Error(`${nome}: ${erro.message}`);
      }
    }
    await banco.query(
      'insert into public.companies(id,cnpj,legal_name,trade_name,timezone) values($1,$2,$3,$3,$4),($5,$6,$7,$7,$4)',
      [
        empresa,
        '19131243000197',
        'Frota Teste',
        'America/Sao_Paulo',
        outra,
        '11444777000161',
        'Outra frota',
      ],
    );
    await banco.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,'teste@example.test','{}'),($2,'outro@example.test','{}')",
      [usuario, outroUsuario],
    );
    await banco.query(
      "insert into public.profiles(id,full_name) values($1,'Administrador teste'),($2,'Outro teste')",
      [usuario, outroUsuario],
    );
    await banco.query(
      "insert into public.company_memberships(company_id,user_id,role) values($1,$2,'company_admin'),($3,$4,'company_admin')",
      [empresa, usuario, outra, outroUsuario],
    );
    await banco.query(
      "insert into public.locations(id,company_id,name) values($1,$2,'Portaria'),($3,$4,'Outra portaria')",
      [local, empresa, outroLocal, outra],
    );
    await banco.query(
      "insert into public.drivers(id,company_id,full_name,license_expires_on) values($1,$2,'Motorista válido',current_date+30),($3,$2,'Motorista vencido',current_date-20)",
      [motorista, empresa, vencido],
    );

    const primeiro = await veiculo(100),
      segundo = await veiculo(100);
    const a = await viagem(primeiro),
      b = await viagem(primeiro),
      c = await viagem(segundo);
    const expirada = await viagem(segundo, vencido);
    await verificar.rejects(() => rpc('start_trip', [expirada.tripId]), /DRIVER_LICENSE_EXPIRED/);
    await rpc('start_trip', [a.tripId, minuto(-10), 100]);
    await rpc('cancel_trip', [b.tripId, 'Agenda substituída']);
    verificar.equal(
      (await linha('select status from public.vehicles where id=$1', [primeiro])).status,
      'in_use',
    );
    verificar.equal(
      (await linha('select status from public.trips where id=$1', [a.tripId])).status,
      'in_progress',
    );
    passou('Cancelar o planejamento não libera veículo em outra viagem');
    await verificar.rejects(() => rpc('start_trip', [c.tripId]), /DRIVER_BUSY/);
    passou('Motorista ocupado ou com validade vencida não inicia');
    await verificar.rejects(() => rpc('cancel_trip', [a.tripId, 'Já saiu']), /TRIP_INVALID_STATE/);
    const interrompida = await rpc('trip_operation', [
      a.tripId,
      'interrupt',
      140,
      minuto(-2),
      null,
      'Viagem interrompida na rota',
      randomUUID(),
    ]);
    verificar.equal(interrompida.distanceKm, 40);
    const ficha = await linha(
      'select actual_departure_at,start_odometer_km,actual_return_at,end_odometer_km from public.trips where id=$1',
      [a.tripId],
    );
    verificar.ok(ficha.actual_departure_at && ficha.actual_return_at);
    verificar.equal(Number(ficha.start_odometer_km), 100);
    verificar.equal(Number(ficha.end_odometer_km), 140);
    passou('Interrupção preserva saída e registra o percurso');

    const chavePlano = randomUUID();
    const dadosPlano = [
      c.tripId,
      segundo,
      motorista,
      'Base principal',
      'Novo destino',
      null,
      null,
      null,
      null,
      chavePlano,
    ];
    verificar.deepEqual(await rpc('save_trip', dadosPlano), await rpc('save_trip', dadosPlano));
    verificar.equal(
      (await linha('select destination_label from public.trips where id=$1', [c.tripId]))
        .destination_label,
      'Novo destino',
    );
    passou('Planejamento editável com repetição segura');

    const presenca = await rpc('set_initial_presence', [
      segundo,
      'inside',
      local,
      'Conferência inicial em portaria',
      randomUUID(),
    ]);
    verificar.equal(presenca.presence, 'inside');
    verificar.equal(
      (
        await linha('select count(*)::int n from public.vehicle_movements where vehicle_id=$1', [
          segundo,
        ])
      ).n,
      0,
    );
    const antes = await rpc('yard_snapshot');
    verificar.equal(antes.vehicles.find((item) => item.id === segundo).presence, 'inside');
    await verificar.rejects(
      () =>
        rpc('trip_operation', [c.tripId, 'start', 100, minuto(-1), outroLocal, null, randomUUID()]),
      /LOCATION_NOT_FOUND/,
    );
    verificar.equal(
      (await linha('select status from public.trips where id=$1', [c.tripId])).status,
      'planned',
    );
    const acao = [c.tripId, 'start', 100, minuto(-1), local, null, randomUUID()];
    const inicio = await rpc('trip_operation', acao);
    verificar.equal(inicio.movement.movementType, 'exit');
    verificar.deepEqual(await rpc('trip_operation', acao), inicio);
    const retorno = await rpc('trip_operation', [
      c.tripId,
      'complete',
      150,
      minuto(),
      local,
      null,
      randomUUID(),
    ]);
    verificar.equal(retorno.movement.movementType, 'entry');
    passou('Presença inicial sem passagem inventada e viagem/pátio atômicos');
    const saidaArgs = [segundo, local, 'exit', minuto(), randomUUID(), null];
    const saida = await rpc('movement_command', saidaArgs);
    const replay = await rpc('movement_command', saidaArgs);
    verificar.equal(replay.movementId, saida.movementId);
    verificar.equal(replay.deduplicated, true);
    verificar.equal(
      (await rpc('movement_command', [segundo, local, 'entry', minuto(), randomUUID(), null]))
        .movementType,
      'entry',
    );
    passou('Passagens legítimas rápidas são distintas; repetição é deduplicada');

    const consumo = await veiculo();
    const horario1 = '2026-01-10T12:00:00Z',
      horario2 = '2026-01-11T12:00:00Z',
      horario3 = '2026-01-12T12:00:00Z';
    const chave = randomUUID();
    const tanque = await abastecer(consumo, 100, horario1, true, chave);
    verificar.equal(
      (await abastecer(consumo, 100, horario1, true, chave)).fuelingId,
      tanque.fuelingId,
    );
    await verificar.rejects(
      () => abastecer(consumo, 110, horario1, true, chave),
      /IDEMPOTENCY_REUSE/,
    );
    verificar.equal(
      (await linha('select count(*)::int n from public.fuelings where vehicle_id=$1', [consumo])).n,
      1,
    );
    passou('Reenviar o mesmo abastecimento não duplica custo');
    await abastecer(consumo, 300, horario3, true);
    const parcial = await abastecer(consumo, 200, horario2);
    verificar.equal(
      Number(
        (await linha('select current_odometer_km from public.vehicles where id=$1', [consumo]))
          .current_odometer_km,
      ),
      300,
    );
    await verificar.rejects(
      () => abastecer(consumo, 400, horario2),
      /ODOMETER_CHRONOLOGY_CONFLICT/,
    );
    const medido = (
      await como(
        'select km_per_unit,measured_segments from public.v_vehicle_energy_consumption where vehicle_id=$1',
        [consumo],
      )
    ).rows[0];
    verificar.equal(Number(medido.km_per_unit), 10);
    verificar.equal(Number(medido.measured_segments), 1);
    passou('Retroativo encaixa entre leituras; ciclo inclui parciais');
    const periodo = await rpc('fleet_report', [
      'monthlyCosts',
      '2026-01-10',
      '2026-01-10',
      1,
      50,
      consumo,
    ]);
    verificar.equal(periodo.period.timezone, 'America/Sao_Paulo');
    verificar.equal(periodo.items[0].fuel_cost, 60);
    passou('Relatório inclui o dia Até inteiro no fuso da empresa');

    const alterado = await rpc('replace_fueling', [
      parcial.fuelingId,
      'Preço do comprovante corrigido',
      10,
      7,
      200,
      'diesel_s10',
      horario2,
      null,
      null,
      'Posto',
      false,
      null,
      70,
      randomUUID(),
    ]);
    verificar.equal(alterado.replacesFuelingId, parcial.fuelingId);
    verificar.ok(
      (await linha('select voided_at from public.fuelings where id=$1', [parcial.fuelingId]))
        .voided_at,
    );
    const antesCorrigir = await linha(
      'select id,odometer_km from public.vehicle_odometer_events where vehicle_id=$1 order by occurred_at desc limit 1',
      [consumo],
    );
    const revisao = await rpc('correct_odometer', [
      consumo,
      antesCorrigir.id,
      290,
      'Conferência do painel do veículo',
      randomUUID(),
    ]);
    verificar.equal(revisao.currentOdometerKm, 290);
    verificar.equal(
      Number(
        (
          await linha('select odometer_km from public.vehicle_odometer_events where id=$1', [
            antesCorrigir.id,
          ])
        ).odometer_km,
      ),
      300,
    );
    const historico = await rpc('odometer_effective_history', [consumo]);
    verificar.equal(historico.items.find((item) => item.id === antesCorrigir.id).effective_km, 290);
    passou('Substituição e correção preservam originais, com leitura efetiva');

    const manutencao = await rpc('schedule_maintenance_work', [
      consumo,
      'preventive',
      'Troca de óleo',
      null,
      280,
      null,
      null,
      null,
      10000,
      randomUUID(),
    ]);
    const pendencias = await rpc('maintenance_due_items');
    verificar.equal(
      pendencias.find((item) => item.maintenance_id === manutencao.maintenanceId).is_overdue,
      true,
    );
    const visao = await rpc('fleet_overview');
    verificar.equal(visao.alerts.maintenanceOverdue, 1);
    verificar.equal(visao.alerts.maintenanceNext30Days, 0);
    const concluida = await rpc('complete_maintenance_v2', [
      manutencao.maintenanceId,
      0,
      minuto(),
      290,
      null,
      null,
      'Serviço realizado em garantia',
      randomUUID(),
    ]);
    verificar.ok(concluida.nextMaintenanceId);
    const proxima = await linha(
      'select scheduled_for,scheduled_odometer_km from public.maintenance_records where id=$1',
      [concluida.nextMaintenanceId],
    );
    verificar.equal(proxima.scheduled_for, null);
    verificar.equal(Number(proxima.scheduled_odometer_km), 10290);
    passou('Vencimento por km consistente, garantia sem custo e próxima preventiva');

    const diagnosticoCusto = `select severity from private.data_integrity_selftest()
      where detail = $1 and finding = 'manutenção concluída sem custo positivo'`;
    const manutencaoEmGarantia = [manutencao.maintenanceId];
    verificar.deepEqual((await banco.query(diagnosticoCusto, manutencaoEmGarantia)).rows, []);
    const manutencaoInvalida = randomUUID();
    const desfazerDadosInvalidos = new Error('Desfazer dados inválidos do autoteste');
    await verificar.rejects(
      banco.transaction(async (transacao) => {
        await transacao.exec(
          'alter table public.maintenance_records drop constraint maintenance_status_completed',
        );
        await transacao.query(
          `insert into public.maintenance_records
             (id, company_id, vehicle_id, maintenance_type, status, description, completed_at, total_cost, no_charge_reason)
           values ($1, $2, $3, 'preventive', 'completed', 'Garantia inválida de teste', now(), 0, '  curta  ')`,
          [manutencaoInvalida, empresa, consumo],
        );
        verificar.deepEqual((await transacao.query(diagnosticoCusto, [manutencaoInvalida])).rows, [
          { severity: 'critical' },
        ]);
        throw desfazerDadosInvalidos;
      }),
      (erro) => erro === desfazerDadosInvalidos,
    );
    passou('Autoteste aceita garantia justificada e detecta custo zero sem justificativa válida');

    const plano = await linha('select plan_id from public.maintenance_records where id=$1', [
      concluida.nextMaintenanceId,
    ]);
    const pausado = await rpc('set_maintenance_plan_active', [
      plano.plan_id,
      false,
      'Veículo em avaliação para venda',
    ]);
    verificar.equal(pausado.active, false);
    const semProxima = await rpc('complete_maintenance_v2', [
      concluida.nextMaintenanceId,
      150,
      minuto(),
      290,
      null,
      null,
      null,
      randomUUID(),
    ]);
    verificar.equal(semProxima.nextMaintenanceId, null);
    passou('Pausar recorrência preserva serviço atual sem agendar outro');

    for (let indice = 0; indice < 55; indice++) await veiculo();
    const pg1 = await rpc('fleet_report', ['vehicleCosts', null, null, 1, 50, null]);
    const pg2 = await rpc('fleet_report', ['vehicleCosts', null, null, 2, 50, null]);
    verificar.equal(pg1.items.length, 50);
    verificar.equal(pg1.items.length + pg2.items.length, pg1.total);
    verificar.equal(pg2.hasNext, false);
    const pesquisa = await rpc('fleet_list', ['vehicles', 'aaa', { visibility: 'current' }, 1, 20]);
    verificar.equal(pesquisa.items.length, 20);
    verificar.ok(pesquisa.total > 50 && pesquisa.hasNext);
    const filtrados = await rpc('fleet_list', ['fuelings', 'Posto', { vehicle: consumo }, 1, 50]);
    verificar.equal(filtrados.items.length, 3);
    const relatorioPatio = await rpc('fleet_report', [
      'recentMovements',
      null,
      null,
      1,
      50,
      segundo,
      local,
    ]);
    verificar.ok(relatorioPatio.items.length >= 2);
    const trilha = await rpc('vehicle_timeline', [consumo, 1, 30]);
    verificar.ok(trilha.items.some((item) => item.kind === 'Quilometragem'));
    verificar.ok(trilha.items.some((item) => item.description.includes('ESTORNADO')));
    passou('Paginação, pesquisa e linha do tempo incluem histórico autorizado');

    const importacao = ['drivers', { fullName: 'Motorista importado' }, randomUUID()];
    verificar.deepEqual(
      await rpc('import_catalog_record', importacao),
      await rpc('import_catalog_record', importacao),
    );
    verificar.equal(
      (
        await linha(
          "select count(*)::int n from public.drivers where full_name='Motorista importado'",
        )
      ).n,
      1,
    );
    const linhasCadastro = [
      [
        'vehicles',
        {
          plate: 'ZXY9K87',
          brand: 'Volvo',
          model: 'FH',
          fuelType: 'diesel_s10',
          modelYear: 2025,
          initialOdometerKm: 10,
          tankCapacityL: 150,
        },
        randomUUID(),
      ],
      [
        'locations',
        {
          name: 'Base importada',
          timezone: 'America/Sao_Paulo',
          addressCity: 'Santos',
          addressState: 'SP',
        },
        randomUUID(),
      ],
    ];
    for (const argumentos of linhasCadastro)
      verificar.deepEqual(
        await rpc('import_catalog_record', argumentos),
        await rpc('import_catalog_record', argumentos),
      );
    verificar.equal(
      (await linha("select count(*)::int n from public.vehicles where plate='ZXY9K87'")).n,
      1,
    );
    verificar.equal(
      (await linha("select count(*)::int n from public.locations where name='Base importada'")).n,
      1,
    );
    passou('Retentativa de cadastro em lote preserva a linha já concluída');
    const placa = (await linha('select plate from public.vehicles where id=$1', [consumo])).plate;
    await veiculo(0, outra, placa);
    await verificar.rejects(
      () => rpc('vehicle_timeline', [consumo], outroUsuario),
      /FORBIDDEN|TENANT_MISMATCH|PERMISSION/,
    );
    const outraLista = await rpc('fleet_list', ['vehicles', placa, {}, 1, 50], outroUsuario);
    verificar.equal(outraLista.total, 1);
    verificar.notEqual(outraLista.items[0].id, consumo);
    await verificar.rejects(
      () => rpc('fleet_list', ['vehicles'], null, 'anon'),
      /permission denied/,
    );
    passou('Mesma placa em empresas distintas não compartilha histórico');

    await banco.query('insert into platform.admins(user_id) values($1)', [usuario]);
    const listaAdmins = await rpc(
      'list_company_admins_filtered', [usuario, null, 'Outra frota', 'active', 'active', 1, 1],
      usuario, 'service_role', 'platform',
    );
    verificar.equal(listaAdmins.total, 1);
    verificar.equal(listaAdmins.items[0].userId, outroUsuario);
    await verificar.rejects(
      () => rpc('list_company_admins_filtered', [outroUsuario], outroUsuario, 'service_role', 'platform'),
      /FORBIDDEN/,
    );
    await verificar.rejects(
      () => rpc('list_company_admins_filtered', [usuario], usuario, 'authenticated', 'platform'),
      /permission denied/,
    );
    passou('Filtro global antecede a paginação e exige autorização da plataforma');

    const veiculoPartida = await veiculo(100);
    const viagemPartida = await viagem(veiculoPartida);
    await rpc('start_trip', [viagemPartida.tripId, minuto(-8), 500]);
    const partida = (await rpc('odometer_effective_history', [veiculoPartida])).items[0];
    verificar.equal(partida.source_type, 'trip_departure');
    verificar.equal(Number(partida.effective_km), 500);
    verificar.equal(Number(partida.previous_km), 100);
    verificar.equal(
      Number((await linha('select current_odometer_km from public.vehicles where id=$1', [veiculoPartida])).current_odometer_km),
      500,
    );
    await verificar.rejects(
      () => abastecer(veiculoPartida, 200, minuto(-7)),
      /ODOMETER_CHRONOLOGY_CONFLICT/,
    );
    const retornoComLeitura = await rpc('complete_trip', [viagemPartida.tripId, 550, minuto(-6)]);
    const corrigir = (evento, km) => rpc('correct_odometer', [
      veiculoPartida, evento, km, 'Leitura conferida com o comprovante', randomUUID(),
    ]);
    await verificar.rejects(() => corrigir(retornoComLeitura.odometerEventId, 400), /CORRECTION_CONFLICT/);
    await corrigir(retornoComLeitura.odometerEventId, 530);
    await corrigir(partida.id, 490);
    const atualizado = await rpc('fleet_list', ['trips', null, { vehicle: veiculoPartida }]);
    verificar.equal(Number(atualizado.items[0].start_odometer_km), 490);
    verificar.equal(Number(atualizado.items[0].end_odometer_km), 530);
    const relatado = await rpc('fleet_report', ['vehicleCosts', null, null, 1, 50, veiculoPartida]);
    verificar.equal(Number(relatado.items[0].distance_km), 40);
    const historia = (await rpc('odometer_effective_history', [veiculoPartida])).items;
    verificar.equal(Number(historia.find((item) => item.id === partida.id).odometer_km), 500);
    verificar.equal(Number(historia.find((item) => item.id === retornoComLeitura.odometerEventId).odometer_km), 550);
    passou('Partida define limite e correções da viagem preservam as leituras originais');

    const veiculoRecorrente = await veiculo(100);
    const recorrente = await rpc('schedule_maintenance_work', [
      veiculoRecorrente, 'preventive', 'Revisão por quilometragem', null, 1200,
      null, null, null, 500, randomUUID(),
    ]);
    const servico = await rpc('complete_maintenance_v2', [
      recorrente.maintenanceId, 70, minuto(-4), 1200, null, null, null, randomUUID(),
    ]);
    const ajustarRevisao = (km) => rpc('correct_odometer', [
      veiculoRecorrente, servico.odometerEventId, km, 'Leitura corrigida com a nota', randomUUID(),
    ]);
    const limiteProxima = async () => Number(
      (await linha('select scheduled_odometer_km from public.maintenance_records where id=$1', [servico.nextMaintenanceId])).scheduled_odometer_km,
    );
    verificar.equal(await limiteProxima(), 1700);
    await ajustarRevisao(1000);
    verificar.equal(await limiteProxima(), 1500);
    await rpc('start_maintenance', [servico.nextMaintenanceId, minuto(-3)]);
    await ajustarRevisao(1050);
    verificar.equal(await limiteProxima(), 1500);
    passou('Odômetro corrigido recalcula preventiva pendente e preserva a revisão iniciada');

    const novoMotorista = randomUUID();
    await banco.query("insert into public.drivers(id,company_id,full_name,license_expires_on) values($1,$2,'Motorista do fluxo simples',current_date+100)", [novoMotorista, empresa]);
    verificar.equal((await rpc('fleet_workflow_settings')).yardControlEnabled, false);
    verificar.equal((await rpc('fleet_workflow_settings', [true])).yardControlEnabled, true);
    verificar.equal((await rpc('fleet_workflow_settings', [], outroUsuario)).yardControlEnabled, false);
    await rpc('fleet_workflow_settings', [false]);
    passou('Preferência de garagem é opcional, persistente e isolada por empresa');

    const veiculoSimples = await veiculo(1000);
    const planejamento = {
      vehicleId: veiculoSimples, driverId: novoMotorista,
      originLabel: 'Rua da empresa', destinationLabel: 'Cliente sem cadastro de pátio',
    };
    const chaveSaida = randomUUID();
    const parametrosSaida = [planejamento, 1000, minuto(-8), null, chaveSaida];
    const saidaSimples = await rpc('create_and_start_trip', parametrosSaida);
    verificar.equal(saidaSimples.status, 'in_progress');
    verificar.equal((await linha('select status from public.vehicles where id=$1', [veiculoSimples])).status, 'in_use');
    verificar.equal((await linha('select count(*)::int n from public.vehicle_movements where vehicle_id=$1', [veiculoSimples])).n, 0);
    verificar.deepEqual(await rpc('create_and_start_trip', parametrosSaida), saidaSimples);
    verificar.equal((await linha('select count(*)::int n from public.trips where vehicle_id=$1', [veiculoSimples])).n, 1);
    await verificar.rejects(() => rpc('create_and_start_trip', [planejamento, 1001, parametrosSaida[2], null, chaveSaida]), /IDEMPOTENCY/);
    passou('Criar e iniciar sem garagem ocupa o veículo e a repetição não duplica a viagem');

    const antesFalha = (await linha('select count(*)::int n from public.trips')).n;
    const outroAtivo = await veiculo(1000);
    await verificar.rejects(() => rpc('create_and_start_trip', [{ ...planejamento, vehicleId: outroAtivo }, 1000, minuto(-7), null, randomUUID()]), /DRIVER_BUSY/);
    verificar.equal((await linha('select count(*)::int n from public.trips')).n, antesFalha);
    verificar.equal((await linha('select status from public.vehicles where id=$1', [outroAtivo])).status, 'available');
    await rpc('trip_operation', [saidaSimples.tripId, 'complete', 1050, minuto(-6), null, null, randomUUID()]);
    verificar.equal((await linha('select status from public.vehicles where id=$1', [veiculoSimples])).status, 'available');
    passou('Motorista ocupado bloqueia a saída sem deixar planejamento solto; encerramento libera recursos');

    const depoisEncerrar = (await linha('select count(*)::int n from public.trips')).n;
    const saidaComPatio = [planejamento, 1050, minuto(-5), local, randomUUID()];
    await verificar.rejects(() => rpc('create_and_start_trip', saidaComPatio), /MOVEMENT_DIRECTION_CONFLICT/);
    verificar.equal((await linha('select count(*)::int n from public.trips')).n, depoisEncerrar);
    verificar.equal((await linha('select status from public.vehicles where id=$1', [veiculoSimples])).status, 'available');
    await rpc('set_initial_presence', [veiculoSimples, 'inside', local, 'Veículo conferido na garagem', randomUUID()]);
    const comPassagem = await rpc('create_and_start_trip', saidaComPatio);
    verificar.equal(comPassagem.movement.movementType, 'exit');
    await verificar.rejects(() => rpc('trip_operation', [comPassagem.tripId, 'complete', 1080, minuto(-4), outroLocal, null, randomUUID()]), /LOCATION_NOT_FOUND/);
    verificar.equal((await linha('select status from public.trips where id=$1', [comPassagem.tripId])).status, 'in_progress');
    const retornoGaragem = await rpc('trip_operation', [comPassagem.tripId, 'complete', 1080, minuto(-3), local, null, randomUUID()]);
    verificar.equal(retornoGaragem.movement.movementType, 'entry');
    verificar.equal((await linha('select count(*)::int n from public.vehicle_movements where vehicle_id=$1', [veiculoSimples])).n, 2);
    passou('Saída e retorno com garagem são atômicos e não aceitam local de outra empresa');

    const outraGaragem = randomUUID();
    await banco.query("insert into public.locations(id,company_id,name) values($1,$2,'Segunda garagem')", [outraGaragem, empresa]);
    await verificar.rejects(() => rpc('create_and_start_trip', [planejamento, 1080, minuto(-2), outraGaragem, randomUUID()]), /MOVEMENT_LOCATION_CONFLICT/);
    verificar.equal((await linha('select status from public.vehicles where id=$1', [veiculoSimples])).status, 'available');
    passou('Veículo presente em uma garagem não pode registrar saída de outra');

    const operador = randomUUID();
    await banco.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'operador@example.test','{}')", [operador]);
    await banco.query("insert into public.profiles(id,full_name) values($1,'Operador')", [operador]);
    await banco.query("insert into public.company_memberships(company_id,user_id,role) values($1,$2,'operator')", [empresa, operador]);
    verificar.equal((await rpc('fleet_workflow_settings', [], operador)).yardControlEnabled, false);
    await verificar.rejects(() => rpc('fleet_workflow_settings', [true], operador), /FORBIDDEN/);
    passou('Operador consulta a rotina e somente administrador autorizado altera a preferência');

    const veiculoKmInvalido = await veiculo(100);
    await verificar.rejects(() => rpc('create_and_start_trip', [{ ...planejamento, vehicleId: veiculoKmInvalido }, 99, minuto(-2), null, randomUUID()]), /ODOMETER_REGRESSION/);
    await verificar.rejects(() => rpc('create_and_start_trip', [planejamento, 1080, minuto(60), null, randomUUID()]), /futuro/);
    await verificar.rejects(() => rpc('create_and_start_trip', [planejamento, 1080, minuto(-1), null, randomUUID()], outroUsuario), /FORBIDDEN|NOT_FOUND|TENANT/);
    await verificar.rejects(() => rpc('fleet_workflow_settings', [], usuario, 'anon'), /permission denied/);
    passou('Saída valida quilometragem, horário, acesso e isolamento no servidor');

    process.stdout.write(
      `${aprovados} cenários operacionais aprovados com ${migracoes.length} migrations em PostgreSQL descartável.\n`,
    );
  } finally {
    await banco.close();
  }
})().catch((erro) => {
  process.stderr.write(`${erro.stack}\n`);
  process.exitCode = 1;
});
