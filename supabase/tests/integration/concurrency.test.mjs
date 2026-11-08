#!/usr/bin/env node
/**
 * =============================================================================
 * PegaNaFrota — testes de integração com conexões simultâneas
 * =============================================================================
 * Os testes pgTAP rodam em UMA transação e por isso conseguem provar o
 * mecanismo (índice único, paridade, FOR UPDATE), mas não conseguem provar o
 * COMPORTAMENTO sob concorrência real. Este arquivo abre várias conexões de
 * verdade e dispara as chamadas ao mesmo tempo.
 *
 * Cobre o teste obrigatório nº 14 (concorrência) e complementa o nº 16
 * (deduplicação de leitura OCR).
 *
 * Uso:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     node supabase/tests/integration/concurrency.test.mjs
 *
 * Com o Supabase CLI local, a URL padrão é a acima. O script NÃO usa service
 * role key nem qualquer segredo: conecta direto ao Postgres local.
 * =============================================================================
 */

import postgres from 'pg';
import { randomUUID as criarIdentificadorUnico } from 'node:crypto';

const ENDERECO_BANCO = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const resultados = [];
let falhas = 0;

function verificar(nome, condicao, detalhe = '') {
  resultados.push({ name: nome, ok: Boolean(condicao), detail: detalhe });
  if (!condicao) falhas += 1;
  const marcar = condicao ? 'ok  ' : 'NOT OK';
  console.log(`${marcar} ${resultados.length} - ${nome}${detalhe ? ` (${detalhe})` : ''}`);
}

/** Abre uma conexão já autenticada como um usuário do aplicativo. */
async function conectarComo(usuarioIdentificador) {
  const cliente = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await cliente.connect();
  await cliente.query('set role authenticated');
  await cliente.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({ sub: usuarioIdentificador, role: 'authenticated' }),
  ]);
  return cliente;
}

async function principal() {
  const administrador = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await administrador.connect();

  // IDs determinísticos do seed.
  const { rows: dadosDemonstracaoLinhas } = await administrador.query(`
    select private.stable_uuid('user:auroraverde:operador') as operator_id,
           private.stable_uuid('company:auroraverde')       as company_id,
           private.stable_uuid('location:auroraverde:1')    as location_id,
           private.stable_uuid('camera:1:1:1')              as camera_id
  `);
  const dadosDemonstracao = dadosDemonstracaoLinhas[0];

  // ---------------------------------------------------------------------------
  // Veículo isolado para o teste, criado fora do seed.
  // ---------------------------------------------------------------------------
  const veiculoIdentificador = criarIdentificadorUnico();
  const placa = `TCC${String(Math.floor(Math.random() * 9000) + 1000)}`;
  await administrador.query(
    `insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
     values ($1, $2, $3, 'Marca Teste', 'Modelo Teste', 'flex', 1000)`,
    [veiculoIdentificador, dadosDemonstracao.company_id, placa],
  );

  // =========================================================================
  // TESTE 1 — N chamadas simultâneas de movimentação
  // =========================================================================
  // Sem serialização, o resultado seria: várias linhas com o mesmo sequence_no,
  // ou duas Entradas seguidas. O esperado é que TODAS as chamadas concluam sem
  // erro e produzam uma sequência perfeitamente alternada e sem buracos.
  const CONCORRENCIA = 12;
  const clientes = [];
  for (let indiceItem = 0; indiceItem < CONCORRENCIA; indiceItem += 1) {
    clientes.push(await conectarComo(dadosDemonstracao.operator_id));
  }

  const resolvido = await Promise.allSettled(
    clientes.map((cliente) =>
      cliente.query(`select public.register_vehicle_movement($1, $2, 'manual', null, null, 0) as result`, [
        veiculoIdentificador,
        dadosDemonstracao.location_id,
      ]),
    ),
  );

  const concluidos = resolvido.filter((textoItem) => textoItem.status === 'fulfilled');
  const rejeitados = resolvido.filter((textoItem) => textoItem.status === 'rejected');

  verificar(
    'todas as chamadas simultâneas terminam sem erro',
    rejeitados.length === 0,
    rejeitados.length ? rejeitados[0].reason.message : `${concluidos.length} chamadas`,
  );

  const { rows: movimentacoes } = await administrador.query(
    `select sequence_no, movement_type from public.vehicle_movements
      where vehicle_id = $1 order by sequence_no`,
    [veiculoIdentificador],
  );

  verificar(
    'número de movimentações é igual ao número de chamadas',
    movimentacoes.length === CONCORRENCIA,
    `${movimentacoes.length} de ${CONCORRENCIA}`,
  );

  const sequencial = movimentacoes.every(
    (correspondenciaItem, indiceItem2) => Number(correspondenciaItem.sequence_no) === indiceItem2 + 1,
  );
  verificar('sequência sem buracos e sem repetição', sequencial);

  const alternando = movimentacoes.every((correspondenciaItem) =>
    Number(correspondenciaItem.sequence_no) % 2 === 1
      ? correspondenciaItem.movement_type === 'entry'
      : correspondenciaItem.movement_type === 'exit',
  );
  verificar('alternância preservada sob concorrência', alternando);

  verificar(
    'primeira movimentação é Entrada',
    movimentacoes.length > 0 && movimentacoes[0].movement_type === 'entry',
  );

  // =========================================================================
  // TESTE 2 — deduplicação sob concorrência
  // =========================================================================
  // Duas chamadas idênticas ao mesmo tempo dentro da janela de deduplicação:
  // no máximo uma pode criar movimentação nova.
  const antes = movimentacoes.length;
  const deduplicacaoConcluidos = await Promise.allSettled(
    clientes
      .slice(0, 6)
      .map((cliente) =>
        cliente.query(
          `select public.register_vehicle_movement($1, $2, 'manual', null, null, 120) as result`,
          [veiculoIdentificador, dadosDemonstracao.location_id],
        ),
      ),
  );

  verificar(
    'chamadas deduplicadas simultâneas não geram erro',
    deduplicacaoConcluidos.every((textoItem) => textoItem.status === 'fulfilled'),
    deduplicacaoConcluidos.find((textoItem) => textoItem.status === 'rejected')?.reason?.message ?? '',
  );

  const { rows: depoisLinhas } = await administrador.query(
    `select count(*)::int as n from public.vehicle_movements where vehicle_id = $1`,
    [veiculoIdentificador],
  );
  verificar(
    'janela de deduplicação admite no máximo uma nova movimentação',
    depoisLinhas[0].n - antes <= 1,
    `${depoisLinhas[0].n - antes} nova(s)`,
  );

  // =========================================================================
  // TESTE 3 — leituras OCR idênticas em paralelo
  // =========================================================================
  // Mesma placa, mesma câmera, mesmo instante: uma confirma, as demais viram
  // duplicadas. Em nenhum caso podem existir duas movimentações.
  const ocrVeiculoIdentificador = criarIdentificadorUnico();
  const ocrPlaca = `TCD${String(Math.floor(Math.random() * 9000) + 1000)}`;
  await administrador.query(
    `insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
     values ($1, $2, $3, 'Marca Teste', 'Modelo Teste', 'flex', 1000)`,
    [ocrVeiculoIdentificador, dadosDemonstracao.company_id, ocrPlaca],
  );

  const ocrConcluidos = await Promise.allSettled(
    clientes
      .slice(0, 8)
      .map((cliente) =>
        cliente.query(`select public.register_plate_read($1, $2, 0.97, 'demo-ocr-1.4.2') as result`, [
          dadosDemonstracao.camera_id,
          ocrPlaca,
        ]),
      ),
  );

  verificar(
    'leituras OCR simultâneas não geram erro',
    ocrConcluidos.every((textoItem) => textoItem.status === 'fulfilled'),
    ocrConcluidos.find((textoItem) => textoItem.status === 'rejected')?.reason?.message ?? '',
  );

  const { rows: lerLinhas } = await administrador.query(
    `select status, count(*)::int as n from public.plate_read_events
      where normalized_plate = $1 group by status`,
    [ocrPlaca],
  );
  const situacaoMapa = Object.fromEntries(
    lerLinhas.map((resultadoItem) => [resultadoItem.status, resultadoItem.n]),
  );
  verificar(
    'exatamente uma leitura é confirmada',
    situacaoMapa.confirmed === 1,
    JSON.stringify(situacaoMapa),
  );
  verificar(
    'as demais leituras viram duplicadas',
    (situacaoMapa.confirmed ?? 0) + (situacaoMapa.duplicate ?? 0) === 8,
    JSON.stringify(situacaoMapa),
  );

  const { rows: ocrMovimentacoes } = await administrador.query(
    `select count(*)::int as n from public.vehicle_movements where vehicle_id = $1`,
    [ocrVeiculoIdentificador],
  );
  verificar(
    'rajada de leituras produz no máximo uma movimentação',
    ocrMovimentacoes[0].n === 1,
    `${ocrMovimentacoes[0].n} movimentação(ões)`,
  );

  // =========================================================================
  // TESTE 4 — conclusão simultânea da mesma viagem
  // =========================================================================
  // Só uma pode vencer; as demais precisam falhar com erro de negócio, e o
  // ledger não pode ganhar dois eventos para a mesma viagem.
  const viagemIdentificador = criarIdentificadorUnico();
  await administrador.query(
    `insert into public.trips (id, company_id, vehicle_id, status, origin_label,
                               destination_label, actual_departure_at, start_odometer_km)
     values ($1, $2, $3, 'in_progress', 'Pátio Central', 'Cliente Norte',
             now() - interval '3 hours', 1000)`,
    [viagemIdentificador, dadosDemonstracao.company_id, ocrVeiculoIdentificador],
  );

  const { rows: gestorLinhas } = await administrador.query(
    `select private.stable_uuid('user:auroraverde:gestor') as id`,
  );
  const gestores = [];
  for (let indiceItem2 = 0; indiceItem2 < 5; indiceItem2 += 1)
    gestores.push(await conectarComo(gestorLinhas[0].id));

  const viagemConcluidos = await Promise.allSettled(
    gestores.map((cliente) =>
      cliente.query(`select public.complete_trip($1, 1200) as result`, [viagemIdentificador]),
    ),
  );
  const viagemSucesso = viagemConcluidos.filter((textoItem) => textoItem.status === 'fulfilled').length;
  verificar(
    'exatamente uma conclusão de viagem vence a corrida',
    viagemSucesso === 1,
    `${viagemSucesso} vencedor(es)`,
  );

  const { rows: livroLinhas } = await administrador.query(
    `select count(*)::int as n from public.vehicle_odometer_events
      where source_type = 'trip_completion' and source_id = $1`,
    [viagemIdentificador],
  );
  verificar('ledger recebe exatamente um evento para a viagem', livroLinhas[0].n === 1);

  const { rows: viagemSituacao } = await administrador.query(
    `select status from public.trips where id = $1`,
    [viagemIdentificador],
  );
  verificar('viagem fica concluída', viagemSituacao[0].status === 'completed');

  // =========================================================================
  // TESTE 5 — duas desativações de administrador simultâneas (DB-AUD-002/010)
  // =========================================================================
  // Campo Novo tem DOIS administradores. Cada transação tenta desativar o
  // outro, ao mesmo tempo. Sem o advisory lock por empresa, cada uma enxerga
  // "ainda existe um admin" e as duas passam — a empresa fica sem acesso.
  const { rows: cnLinhas } = await administrador.query(`
    select private.stable_uuid('company:camponovo')     as company_id,
           private.stable_uuid('user:camponovo:admin')  as admin1,
           private.stable_uuid('user:camponovo:admin2') as admin2
  `);
  const conexao = cnLinhas[0];

  const { rows: antesAdministradores } = await administrador.query(
    `select private.count_effective_admins($1, null) as n`,
    [conexao.company_id],
  );
  verificar(
    'Campo Novo começa com dois administradores efetivos',
    antesAdministradores[0].n === 2,
    `${antesAdministradores[0].n}`,
  );

  const administradorA = await conectarComo(conexao.admin1);
  const administradorB = await conectarComo(conexao.admin2);

  const desativarConcluidos = await Promise.allSettled([
    administradorA.query(
      `update public.company_memberships set active = false
        where company_id = $1 and user_id = $2`,
      [conexao.company_id, conexao.admin2],
    ),
    administradorB.query(
      `update public.company_memberships set active = false
        where company_id = $1 and user_id = $2`,
      [conexao.company_id, conexao.admin1],
    ),
  ]);

  const desativarSucesso = desativarConcluidos.filter((textoItem) => textoItem.status === 'fulfilled').length;
  const desativarErros = desativarConcluidos
    .filter((textoItem) => textoItem.status === 'rejected')
    .map((textoItem) => textoItem.reason?.code ?? textoItem.reason?.message);

  verificar(
    'apenas uma das desativações concorrentes é aceita',
    desativarSucesso === 1,
    `${desativarSucesso} aceita(s), erros: ${desativarErros.join(', ')}`,
  );
  verificar(
    'a desativação recusada usa o código do piso de administradores',
    desativarErros.every((codigo) => codigo === '23514'),
    desativarErros.join(', '),
  );

  const { rows: depoisAdministradores } = await administrador.query(
    `select private.count_effective_admins($1, null) as n`,
    [conexao.company_id],
  );
  verificar(
    'a empresa NUNCA fica sem administrador efetivo',
    depoisAdministradores[0].n >= 1,
    `${depoisAdministradores[0].n} restante(s)`,
  );

  // Restaura o estado do seed para não contaminar os testes seguintes.
  await administrador.query(
    `update public.company_memberships set active = true
      where company_id = $1 and user_id in ($2, $3)`,
    [conexao.company_id, conexao.admin1, conexao.admin2],
  );
  await administradorA.end();
  await administradorB.end();

  // =========================================================================
  // TESTE 6 — concluir e cancelar a mesma viagem ao mesmo tempo (DB-AUD-008)
  // =========================================================================
  // Antes da correção, complete_trip bloqueava veículo -> viagem e cancel_trip
  // bloqueava viagem -> veículo. Duas transações simultâneas fechavam o ciclo
  // de espera e o PostgreSQL abortava uma delas com 40P01 (deadlock detected).
  // O teste dispara vários pares de uma vez, justamente para dar chance ao
  // ciclo aparecer.
  const PARES = 8;
  const viagemPares = [];
  for (let indiceItem3 = 0; indiceItem3 < PARES; indiceItem3 += 1) {
    const vIdentificador = criarIdentificadorUnico();
    const tIdentificador = criarIdentificadorUnico();
    const placaN = String(Math.floor(Math.random() * 9000) + 1000);
    await administrador.query(
      `insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
       values ($1, $2, $3, 'Marca Teste', 'Modelo Teste', 'diesel_s10', 1000)`,
      [vIdentificador, dadosDemonstracao.company_id, `TDL${placaN}`],
    );
    await administrador.query(
      `insert into public.trips (id, company_id, vehicle_id, status, origin_label,
                                 destination_label, actual_departure_at, start_odometer_km)
       values ($1, $2, $3, 'in_progress', 'Pátio Central', 'Cliente Sul',
               now() - interval '2 hours', 1000)`,
      [tIdentificador, dadosDemonstracao.company_id, vIdentificador],
    );
    await administrador.query(`update public.vehicles set status = 'in_use' where id = $1`, [vIdentificador]);
    viagemPares.push({ vId: vIdentificador, tId: tIdentificador });
  }

  const finalizadores = [];
  const canceladores = [];
  for (let indiceItem4 = 0; indiceItem4 < PARES; indiceItem4 += 1) {
    finalizadores.push(await conectarComo(gestorLinhas[0].id));
    canceladores.push(await conectarComo(gestorLinhas[0].id));
  }

  const concorrenciaConcluidos = await Promise.allSettled(
    viagemPares.flatMap((parAtual, indiceItem5) => [
      finalizadores[indiceItem5].query(`select public.complete_trip($1, 1500) as result`, [parAtual.tId]),
      canceladores[indiceItem5].query(`select public.cancel_trip($1, 'cancelamento concorrente') as result`, [
        parAtual.tId,
      ]),
    ]),
  );

  const concorrenciaCodigos = concorrenciaConcluidos
    .filter((textoItem) => textoItem.status === 'rejected')
    .map((textoItem) => textoItem.reason?.code ?? 'sem-codigo');

  verificar(
    'nenhum deadlock (40P01) em concluir x cancelar simultâneos',
    !concorrenciaCodigos.includes('40P01'),
    concorrenciaCodigos.join(', '),
  );
  verificar(
    'cada par produz exatamente um vencedor',
    concorrenciaConcluidos.filter((textoItem) => textoItem.status === 'fulfilled').length === PARES,
    `${concorrenciaConcluidos.filter((textoItem) => textoItem.status === 'fulfilled').length} de ${PARES}`,
  );

  const { rows: viagemFinal } = await administrador.query(
    `select count(*)::int as n from public.trips
      where id = any($1::uuid[]) and status in ('completed', 'cancelled')`,
    [viagemPares.map((parametroItem) => parametroItem.tId)],
  );
  verificar('toda viagem termina em estado final', viagemFinal[0].n === PARES, `${viagemFinal[0].n}`);

  for (const cliente of [...finalizadores, ...canceladores]) await cliente.end();

  // =========================================================================
  // TESTE 7 — iniciar e cancelar a mesma manutenção ao mesmo tempo (DB-AUD-008)
  // =========================================================================
  const manutencaoPares = [];
  for (let indiceItem5 = 0; indiceItem5 < PARES; indiceItem5 += 1) {
    const vIdentificador = criarIdentificadorUnico();
    const mIdentificador = criarIdentificadorUnico();
    const placaN = String(Math.floor(Math.random() * 9000) + 1000);
    await administrador.query(
      `insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
       values ($1, $2, $3, 'Marca Teste', 'Modelo Teste', 'diesel_s10', 1000)`,
      [vIdentificador, dadosDemonstracao.company_id, `TDM${placaN}`],
    );
    await administrador.query(
      `insert into public.maintenance_records
         (id, company_id, vehicle_id, maintenance_type, status, description, scheduled_for)
       values ($1, $2, $3, 'preventive', 'scheduled', 'Revisão concorrente', now() + interval '1 day')`,
      [mIdentificador, dadosDemonstracao.company_id, vIdentificador],
    );
    manutencaoPares.push({ vId: vIdentificador, mId: mIdentificador });
  }

  const iniciadores = [];
  const manutencaoCanceladores = [];
  for (let indiceItem6 = 0; indiceItem6 < PARES; indiceItem6 += 1) {
    iniciadores.push(await conectarComo(gestorLinhas[0].id));
    manutencaoCanceladores.push(await conectarComo(gestorLinhas[0].id));
  }

  const manutencaoConcluidos = await Promise.allSettled(
    manutencaoPares.flatMap((parAtual, indiceItem7) => [
      iniciadores[indiceItem7].query(`select public.start_maintenance($1) as result`, [parAtual.mId]),
      manutencaoCanceladores[indiceItem7].query(
        `select public.cancel_maintenance($1, 'cancelamento concorrente') as result`,
        [parAtual.mId],
      ),
    ]),
  );

  const manutencaoCodigos = manutencaoConcluidos
    .filter((textoItem) => textoItem.status === 'rejected')
    .map((textoItem) => textoItem.reason?.code ?? 'sem-codigo');

  verificar(
    'nenhum deadlock (40P01) em iniciar x cancelar manutenção',
    !manutencaoCodigos.includes('40P01'),
    manutencaoCodigos.join(', '),
  );

  const { rows: manutencaoFinal } = await administrador.query(
    `select count(*)::int as n from public.maintenance_records
      where id = any($1::uuid[]) and status in ('in_progress', 'cancelled')`,
    [manutencaoPares.map((parametroItem) => parametroItem.mId)],
  );
  verificar('toda manutenção sai de scheduled', manutencaoFinal[0].n === PARES, `${manutencaoFinal[0].n}`);

  const { rows: veiculoCoerente } = await administrador.query(
    `select count(*)::int as n
       from public.maintenance_records m
       join public.vehicles v on v.id = m.vehicle_id
      where m.id = any($1::uuid[])
        and m.status = 'in_progress'
        and v.status <> 'in_maintenance'`,
    [manutencaoPares.map((parametroItem) => parametroItem.mId)],
  );
  verificar(
    'nenhuma manutenção em andamento deixa o veículo fora de in_maintenance',
    veiculoCoerente[0].n === 0,
    `${veiculoCoerente[0].n} incoerência(s)`,
  );

  for (const cliente of [...iniciadores, ...manutencaoCanceladores]) await cliente.end();

  // =========================================================================
  // TESTE 5 — a integridade global continua intacta depois de tudo
  // =========================================================================
  const { rows: integridade } = await administrador.query(
    `select severity, finding, detail from private.data_integrity_selftest()`,
  );
  verificar(
    'data_integrity_selftest continua sem apontamentos',
    integridade.length === 0,
    integridade.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.detail}`).join(' | '),
  );

  // ---------------------------------------------------------------------------
  // Limpeza
  // ---------------------------------------------------------------------------
  // As linhas criadas aqui NÃO são apagadas: movimentações e ledger são
  // imutáveis por design (ADR-005/ADR-006). `supabase db reset` devolve a base
  // ao estado do seed.
  for (const cliente of [...clientes, ...gestores]) await cliente.end();
  await administrador.end();

  console.log(`\n1..${resultados.length}`);
  if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} de ${resultados.length} verificações.`);
    process.exit(1);
  }
  console.log(`\nTodas as ${resultados.length} verificações de concorrência passaram.`);
}

principal().catch((erro) => {
  console.error('Erro fatal no teste de integração:', erro);
  process.exit(1);
});
