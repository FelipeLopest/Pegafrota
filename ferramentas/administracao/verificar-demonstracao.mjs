#!/usr/bin/env node

import postgres from 'pg';

const ENDERECO_BANCO = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const verificacoes = [];
let falhas = 0;

function registro(nome, sucesso, detalhe = '') {
  verificacoes.push({ name: nome, ok: sucesso, detail: detalhe });
  if (!sucesso) falhas += 1;
  console.log(`${sucesso ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
}

async function principal() {
  const cliente = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await cliente.connect();

  const um = async (codigoSql, parametros = []) => (await cliente.query(codigoSql, parametros)).rows[0];
  const todos = async (codigoSql, parametros = []) => (await cliente.query(codigoSql, parametros)).rows;

  console.log('PegaNaFrota — verificação do seed\n');

  console.log('Volumes');
  const empresas = await um('select count(*)::int n from public.companies');
  registro('4 empresas', empresas.n === 4, `${empresas.n}`);

  const porEmpresa = await todos(`
    select c.trade_name,
           (select count(*) from public.company_memberships m where m.company_id = c.id)::int users,
           (select count(*) from public.vehicles v where v.company_id = c.id)::int vehicles,
           (select count(*) from public.drivers d where d.company_id = c.id)::int drivers,
           (select count(*) from public.locations l where l.company_id = c.id)::int locations,
           (select count(*) from public.cameras k where k.company_id = c.id)::int cameras
    from public.companies c order by c.trade_name
  `);
  for (const linha of porEmpresa) {
    registro(`${linha.trade_name}: 3–8 usuários`, linha.users >= 3 && linha.users <= 8, `${linha.users}`);
    registro(
      `${linha.trade_name}: 15–40 veículos`,
      linha.vehicles >= 15 && linha.vehicles <= 40,
      `${linha.vehicles}`,
    );
    registro(
      `${linha.trade_name}: motoristas, locais e câmeras`,
      linha.drivers > 0 && linha.locations > 0 && linha.cameras > 0,
      `${linha.drivers}/${linha.locations}/${linha.cameras}`,
    );
  }

  console.log('\nPapéis');
  const ausentesPapeis = await todos(`
    select c.trade_name, r.role::text
    from public.companies c
    cross join (select unnest(enum_range(null::public.membership_role)) role) r
    where not exists (
      select 1 from public.company_memberships m
      where m.company_id = c.id and m.role = r.role)
  `);
  registro(
    'os quatro papéis existem em todas as empresas',
    ausentesPapeis.length === 0,
    ausentesPapeis.map((resultadoItem) => `${resultadoItem.trade_name}/${resultadoItem.role}`).join(', '),
  );

  const inativo = await um(`
    select count(*) filter (where not m.active)::int membership_off,
           count(*) filter (where not p.active)::int profile_off
    from public.company_memberships m join public.profiles p on p.id = m.user_id
  `);
  registro(
    'existe usuário com vínculo inativo e usuário com perfil inativo',
    inativo.membership_off > 0 && inativo.profile_off > 0,
    `vínculo=${inativo.membership_off} perfil=${inativo.profile_off}`,
  );

  console.log('\nHistórico');
  const meses = await um(`
    select count(distinct date_trunc('month', actual_departure_at))::int n,
           (extract(year from age(now(), min(actual_departure_at))) * 12
          + extract(month from age(now(), min(actual_departure_at))))::int span
    from public.trips where status = 'completed'
  `);
  registro('pelo menos 23 meses distintos de viagens', meses.n >= 23, `${meses.n} meses`);
  registro('viagem mais antiga com 22+ meses', meses.span >= 22, `${meses.span} meses`);

  const recentes = await um(`
    select (max(occurred_at) > now() - interval '10 days') fresh
    from public.vehicle_movements
  `);
  registro('existe movimentação nos últimos 10 dias', recentes.fresh === true);

  const situacoes = {
    viagem: await todos('select distinct status::text s from public.trips'),
    manutenção: await todos('select distinct status::text s from public.maintenance_records'),
    veículo: await todos('select distinct status::text s from public.vehicles'),
    'leitura de placa': await todos('select distinct status::text s from public.plate_read_events'),
  };
  const obrigatorio = {
    viagem: ['planned', 'in_progress', 'completed', 'cancelled'],
    manutenção: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    veículo: ['available', 'in_use', 'in_maintenance', 'inactive', 'archived'],
    'leitura de placa': ['confirmed', 'unknown_plate', 'duplicate', 'low_confidence'],
  };
  for (const [rotulo, linhas] of Object.entries(situacoes)) {
    const presente = new Set(linhas.map((resultadoItem) => resultadoItem.s));
    const ausentes = obrigatorio[rotulo].filter((textoItem) => !presente.has(textoItem));
    registro(`todos os status de ${rotulo}`, ausentes.length === 0, ausentes.join(', '));
  }

  const presenca = await um(`
    select count(*) filter (where is_inside)::int inside,
           count(*) filter (where not is_inside)::int outside
    from public.v_vehicle_presence
  `);
  registro(
    'existem veículos dentro e fora do pátio',
    presenca.inside > 0 && presenca.outside > 0,
    `dentro=${presenca.inside} fora=${presenca.outside}`,
  );

  console.log('\nDashboards');
  const administradores = await todos(`
    select c.trade_name, m.user_id
    from public.company_memberships m
    join public.companies c on c.id = m.company_id
    where m.role = 'company_admin' and m.active
    order by c.trade_name
  `);
  for (const administrador of administradores) {
    await cliente.query('begin');
    await cliente.query('set local role authenticated');
    await cliente.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: administrador.user_id, role: 'authenticated' }),
    ]);
    const painelAtual = (
      await cliente.query(`select public.dashboard_summary(now() - interval '400 days', now()) d`)
    ).rows[0].d;
    await cliente.query('rollback');

    const naoVazio =
      painelAtual.fleet.total > 0 &&
      Number(painelAtual.costs.totalCost) > 0 &&
      Number(painelAtual.operations.distanceKm) > 0 &&
      painelAtual.operations.tripsCompleted > 0 &&
      painelAtual.operations.movements > 0;
    registro(
      `${administrador.trade_name}: dashboard populado`,
      naoVazio,
      `frota=${painelAtual.fleet.total} custo=${painelAtual.costs.totalCost} km=${painelAtual.operations.distanceKm}`,
    );

    const alertas = Object.values(painelAtual.alerts).reduce(
      (primeiroItem, segundoItem) => primeiroItem + Number(segundoItem),
      0,
    );
    registro(
      `${administrador.trade_name}: alertas presentes`,
      alertas > 0,
      JSON.stringify(painelAtual.alerts),
    );
  }

  console.log('\nIntegridade');
  const integridade = await todos('select * from private.data_integrity_selftest()');
  registro(
    'data_integrity_selftest sem apontamentos',
    integridade.length === 0,
    integridade.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.detail}`).join(' | '),
  );

  const seguranca = await todos('select * from private.security_selftest()');
  registro(
    'security_selftest sem desvios',
    seguranca.length === 0,
    seguranca.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.object_name}`).join(' | '),
  );

  const cruzado = await um(`
    select count(*)::int n from public.trips t
    join public.vehicles v on v.id = t.vehicle_id
    where v.company_id <> t.company_id
  `);
  registro('nenhum relacionamento cruzando empresa', cruzado.n === 0);

  const auditoria = await um('select count(*)::int n from audit.events');
  registro('trilha de auditoria populada', auditoria.n > 1000, `${auditoria.n} eventos`);

  await cliente.end();

  console.log(`\n${verificacoes.length - falhas} de ${verificacoes.length} verificações passaram.`);
  if (falhas > 0) {
    console.error(`${falhas} verificação(ões) falharam.`);
    process.exit(1);
  }
}

principal().catch((erro) => {
  console.error('Erro ao verificar o seed:', erro.message);
  process.exit(1);
});
