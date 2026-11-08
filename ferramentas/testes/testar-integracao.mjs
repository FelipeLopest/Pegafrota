#!/usr/bin/env node
import { execFileSync as executarArquivoSincrono } from 'node:child_process';
import { emitirToken } from '../desenvolvimento/token-local.mjs';

const BASE = process.env.PNF_DEV_URL || 'http://127.0.0.1:54321';
const CHAVE_ANONIMA = 'dev-anon-key-local-harness';

const resultados = [];
let tokenAtual = null;

function sucesso(nome, detalhe) {
  resultados.push({ name: nome, ok: true, detail: detalhe ?? '' });
}
function invalido(nome, detalhe) {
  resultados.push({ name: nome, ok: false, detail: detalhe ?? '' });
}

async function requisicao(caminho, { method: metodo = 'POST', body: corpo } = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      apikey: CHAVE_ANONIMA,
      ...(tokenAtual ? { Authorization: `Bearer ${tokenAtual}` } : {}),
      Prefer: 'return=representation',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  if (!resposta.ok) {
    const erro = new Error(dados?.message || `HTTP ${resposta.status}`);
    erro.status = resposta.status;
    erro.hint = dados?.hint ?? null;
    erro.code = dados?.code ?? null;
    erro.body = dados;
    throw erro;
  }
  return dados;
}

const executarFuncaoBanco = (nome, argumentos = {}) =>
  requisicao(`/rest/v1/rpc/${nome}`, { body: argumentos });
const selecionar = (tabela, parametrosBusca) =>
  requisicao(`/rest/v1/${tabela}?${parametrosBusca}`, { method: 'GET' });

async function etapa(nome, funcao) {
  try {
    const detalhe = await funcao();
    sucesso(nome, typeof detalhe === 'string' ? detalhe : '');
  } catch (erro) {
    invalido(nome, `${erro.status ?? ''} ${erro.hint ?? ''} ${erro.message}`.trim());
  }
}

async function esperarFalha(nome, dicaEsperada, funcao) {
  try {
    await funcao();
    invalido(nome, `deveria falhar com ${dicaEsperada}, mas passou`);
  } catch (erro) {
    if (dicaEsperada && erro.hint !== dicaEsperada && erro.status !== dicaEsperada) {
      invalido(nome, `esperado ${dicaEsperada}, veio ${erro.hint ?? erro.status}`);
    } else {
      sucesso(nome, String(erro.hint ?? erro.status));
    }
  }
}

async function principal() {
  try {
    const verificacao = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    if (!verificacao.ok && verificacao.status >= 500) throw new Error('indisponível');
  } catch {
    console.log('test:integration  NÃO EXECUTADO — stack de desenvolvimento fora do ar');
    console.log('  suba com: bash ferramentas/desenvolvimento/pilha-local.sh up');
    process.exit(2);
  }

  const codigoSql = (buscaAtual) =>
    executarArquivoSincrono(
      'psql',
      [
        '-h',
        '127.0.0.1',
        '-p',
        '5433',
        '-U',
        'postgres',
        '-d',
        process.env.PNF_DEV_DB || 'pnf_dev',
        '-t',
        '-A',
        '-c',
        buscaAtual,
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: `${process.env.PATH}:/usr/lib/postgresql/16/bin` } },
    ).trim();

  const administradorIdentificador = codigoSql(`select m.user_id from public.company_memberships m
    join public.profiles p on p.id=m.user_id
    where m.role='company_admin' and m.active and p.active limit 1`);
  const outroAdministradorEmpresaIdentificador = codigoSql(`select m.user_id from public.company_memberships m
    join public.profiles p on p.id=m.user_id
    where m.role='company_admin' and m.active and p.active
      and m.company_id <> (select company_id from public.company_memberships
                           where user_id='${administradorIdentificador}' and active limit 1)
    limit 1`);

  if (!administradorIdentificador) {
    console.error('test:integration  FAIL — seed sem company_admin ativo');
    process.exit(1);
  }

  tokenAtual = emitirToken(administradorIdentificador);

  let contextoLocal = null;
  await etapa('login: my_context devolve empresa e permissões', async () => {
    contextoLocal = await executarFuncaoBanco('my_context');
    if (!contextoLocal?.companyId) throw new Error('sem companyId');
    if (!contextoLocal.company?.tradeName) throw new Error('company.tradeName ausente');
    if (!contextoLocal.profile) throw new Error('profile ausente');
    if (!Array.isArray(contextoLocal.permissions) || contextoLocal.permissions.length === 0) {
      throw new Error('sem permissões');
    }
    return `${contextoLocal.company.tradeName} · ${contextoLocal.role} · ${contextoLocal.permissions.length} permissões`;
  });

  await etapa('my_permissions responde', async () => {
    const parametroItem = await executarFuncaoBanco('my_permissions');
    return `${Array.isArray(parametroItem) ? parametroItem.length : Object.keys(parametroItem ?? {}).length} itens`;
  });

  const placa = `INT${Math.floor(Math.random() * 9000 + 1000)}`;
  let veiculoIdentificador = null;

  await etapa('veículos: listar', async () => {
    const veiculoItem = await selecionar(
      'vehicles',
      'select=id,plate,brand,model,model_year,fuel_type,color,status,current_odometer_km,archived_at&order=plate.asc&limit=5',
    );
    return `${veiculoItem.length} veículo(s)`;
  });

  await etapa('veículos: cadastrar', async () => {
    const resultadoItem = await executarFuncaoBanco('create_vehicle', {
      p_plate: placa,
      p_brand: 'Scania',
      p_model: 'R450',
      p_fuel_type: 'diesel_s10',
      p_model_year: 2024,
      p_initial_odometer_km: 1000,
    });
    veiculoIdentificador = resultadoItem.vehicleId;
    if (!veiculoIdentificador) throw new Error('sem vehicleId');
    return `${resultadoItem.plate} · ${resultadoItem.status}`;
  });

  await etapa('veículos: editar', async () => {
    const resultadoItem = await executarFuncaoBanco('update_vehicle', {
      p_vehicle_id: veiculoIdentificador,
      p_patch: { color: 'Azul', notes: 'teste de integração' },
    });
    return resultadoItem.plate;
  });

  await esperarFalha('veículos: placa não é editável', 'VALIDATION_ERROR', () =>
    executarFuncaoBanco('update_vehicle', {
      p_vehicle_id: veiculoIdentificador,
      p_patch: { plate: 'AAA0000' },
    }),
  );

  await esperarFalha('veículos: placa duplicada é recusada', 'CONFLICT_DUPLICATE', () =>
    executarFuncaoBanco('create_vehicle', {
      p_plate: placa,
      p_brand: 'X',
      p_model: 'Y',
      p_fuel_type: 'diesel_s10',
    }),
  );

  let motoristaIdentificador = null;
  await etapa('motoristas: listar com as colunas reais', async () => {
    const dadosRegistro = await selecionar(
      'drivers',
      'select=id,full_name,internal_document,phone,license_category,license_expires_on,active,archived_at&order=full_name.asc&limit=5',
    );
    return `${dadosRegistro.length} motorista(s)`;
  });

  await etapa('motoristas: cadastrar', async () => {
    const resultadoItem = await executarFuncaoBanco('create_driver', {
      p_full_name: 'Motorista Integração',
      p_internal_document: 'INT-001',
      p_phone: '15999990000',
      p_license_category: 'E',
      p_license_expires_on: '2028-01-31',
    });
    motoristaIdentificador = resultadoItem.driverId;
    return resultadoItem.fullName;
  });

  let viagemIdentificador = null;
  await etapa('viagens: criar', async () => {
    const resultadoItem = await executarFuncaoBanco('create_trip', {
      p_vehicle_id: veiculoIdentificador,
      p_driver_id: motoristaIdentificador,
      p_origin_label: 'Pátio central',
      p_destination_label: 'Cliente Norte',
    });
    viagemIdentificador = resultadoItem.tripId;
    return resultadoItem.status;
  });

  await etapa('viagens: iniciar (p_start_odometer_km)', async () => {
    const resultadoItem = await executarFuncaoBanco('start_trip', {
      p_trip_id: viagemIdentificador,
      p_start_odometer_km: 1000,
    });
    return resultadoItem.status;
  });

  await esperarFalha('viagens: odômetro final menor é recusado', 'VALIDATION_ERROR', () =>
    executarFuncaoBanco('complete_trip', { p_trip_id: viagemIdentificador, p_end_odometer_km: 500 }),
  );

  await etapa('viagens: concluir (p_end_odometer_km)', async () => {
    const resultadoItem = await executarFuncaoBanco('complete_trip', {
      p_trip_id: viagemIdentificador,
      p_end_odometer_km: 1250,
    });
    return `${resultadoItem.status} · ${resultadoItem.distanceKm} km`;
  });

  await etapa('viagens: listar com actual_departure_at/actual_return_at', async () => {
    const itemAtual = await selecionar(
      'trips',
      'select=id,vehicle_id,driver_id,status,origin_label,destination_label,planned_departure_at,planned_return_at,actual_departure_at,actual_return_at,start_odometer_km,end_odometer_km&order=created_at.desc&limit=5',
    );
    return `${itemAtual.length} viagem(ns)`;
  });

  await etapa('viagens: cancelar', async () => {
    const nova = await executarFuncaoBanco('create_trip', {
      p_vehicle_id: veiculoIdentificador,
      p_driver_id: motoristaIdentificador,
      p_origin_label: 'Origem cancelamento',
      p_destination_label: 'Destino cancelamento',
    });
    const resultadoItem = await executarFuncaoBanco('cancel_trip', {
      p_trip_id: nova.tripId,
      p_reason: 'teste',
    });
    return resultadoItem.status ?? 'cancelada';
  });

  await etapa('abastecimento: registrar (total calculado pelo servidor)', async () => {
    const resultadoItem = await executarFuncaoBanco('register_fueling', {
      p_vehicle_id: veiculoIdentificador,
      p_liters: 53.457,
      p_price_per_liter: 6.239,
      p_odometer_km: 1300,
      p_fuel_type: 'diesel_s10',
    });
    const total = Number(resultadoItem.totalAmount ?? resultadoItem.total_amount);
    if (Math.abs(total - 333.52) > 0.001) throw new Error(`total ${total} ≠ 333.52`);
    return `R$ ${total}`;
  });

  await etapa('abastecimento: listar com fueled_at', async () => {
    const formulario = await selecionar(
      'fuelings',
      'select=id,vehicle_id,driver_id,fuel_type,liters,price_per_liter,total_amount,odometer_km,fueled_at,station_name,full_tank&order=fueled_at.desc&limit=5',
    );
    return `${formulario.length} abastecimento(s)`;
  });

  let manutencaoIdentificador = null;
  await etapa('manutenção: agendar', async () => {
    const resultadoItem = await executarFuncaoBanco('schedule_maintenance', {
      p_vehicle_id: veiculoIdentificador,
      p_maintenance_type: 'preventive',
      p_description: 'Revisão de integração',
      p_scheduled_for: new Date(Date.now() + 7 * 864e5).toISOString(),
    });
    manutencaoIdentificador = resultadoItem.maintenanceId;
    return resultadoItem.status;
  });

  await etapa('manutenção: concluir (p_total_cost, p_completion_odometer_km)', async () => {
    await executarFuncaoBanco('start_maintenance', { p_maintenance_id: manutencaoIdentificador });
    const resultadoItem = await executarFuncaoBanco('complete_maintenance', {
      p_maintenance_id: manutencaoIdentificador,
      p_total_cost: 1234.56,
      p_completion_odometer_km: 1400,
      p_supplier_name: 'Oficina Teste',
    });
    return resultadoItem.status ?? 'concluída';
  });

  await etapa('manutenção: listar com maintenance_type/total_cost', async () => {
    const correspondenciaItem = await selecionar(
      'maintenance_records',
      'select=id,vehicle_id,maintenance_type,status,description,scheduled_for,scheduled_odometer_km,started_at,completed_at,completion_odometer_km,total_cost,supplier_name,invoice_number&order=scheduled_for.desc&limit=5',
    );
    return `${correspondenciaItem.length} registro(s)`;
  });

  await etapa('movimentação: registrar (servidor decide tipo e horário)', async () => {
    const locais = await selecionar('locations', 'select=id,name,address_city,address_state,active&limit=1');
    if (!locais.length) throw new Error('sem locais no seed');
    const resultadoItem = await executarFuncaoBanco('register_vehicle_movement', {
      p_vehicle_id: veiculoIdentificador,
      p_location_id: locais[0].id,
      p_notes: 'integração',
    });
    const categoria = resultadoItem.movementType ?? resultadoItem.movement_type;
    if (!categoria) throw new Error('servidor não devolveu o tipo');
    return `${categoria} em ${locais[0].name}`;
  });

  await etapa('movimentação: listar', async () => {
    const movimentacao = await selecionar(
      'vehicle_movements',
      'select=id,vehicle_id,location_id,movement_type,occurred_at,source,notes&order=occurred_at.desc&limit=5',
    );
    return `${movimentacao.length} movimentação(ões)`;
  });

  await etapa('odômetro: ledger com source_type/correction_of_id', async () => {
    const linhaItem = await selecionar(
      'vehicle_odometer_events',
      `select=id,vehicle_id,occurred_at,odometer_km,previous_km,source_type,reason,correction_of_id,corrected_from_km&vehicle_id=eq.${veiculoIdentificador}&order=occurred_at.desc&limit=10`,
    );
    if (!linhaItem.length) throw new Error('ledger vazio: o cadastro deveria semeá-lo');
    return `${linhaItem.length} evento(s), topo ${linhaItem[0].odometer_km} km`;
  });

  await etapa('odômetro: ajuste manual exige justificativa', async () => {
    const resultadoItem = await executarFuncaoBanco('register_odometer_reading', {
      p_vehicle_id: veiculoIdentificador,
      p_odometer_km: 1500,
      p_reason: 'Conferência de pátio',
    });
    return `${resultadoItem.odometerKm} km · ${resultadoItem.sourceType}`;
  });

  await etapa('odômetro: histórico paginado', async () => {
    const cabecalhos = await executarFuncaoBanco('vehicle_odometer_history', {
      p_vehicle_id: veiculoIdentificador,
      p_page: 1,
      p_page_size: 10,
    });
    return Array.isArray(cabecalhos) ? `${cabecalhos.length} linha(s)` : 'ok';
  });

  await etapa('empresa: my_company', async () => {
    const registro = await executarFuncaoBanco('my_company');
    if (!registro?.cnpj) throw new Error('sem CNPJ');
    return registro.tradeName;
  });

  await etapa('empresa: update_company', async () => {
    const resultadoItem = await executarFuncaoBanco('update_company', { p_patch: { phone: '1533220000' } });
    return resultadoItem.id ? 'atualizada' : 'sem id';
  });

  await esperarFalha('empresa: CNPJ não é editável', 'VALIDATION_ERROR', () =>
    executarFuncaoBanco('update_company', { p_patch: { cnpj: '11444777000161' } }),
  );

  await esperarFalha('empresa: status é da plataforma', 'PERMISSION_DENIED', () =>
    executarFuncaoBanco('update_company', { p_patch: { status: 'suspended' } }),
  );

  await etapa('usuários: company_members devolve { members: [...] }', async () => {
    const correspondenciaItem = await executarFuncaoBanco('company_members');
    const itens = correspondenciaItem?.members;
    if (!Array.isArray(itens)) throw new Error('resposta sem a chave `members`');
    const primeiro = itens[0];
    for (const chaveItem of ['membership_active', 'profile_active', 'effective_active']) {
      if (primeiro && !(chaveItem in primeiro)) throw new Error(`campo ${chaveItem} ausente`);
    }
    return `${itens.length} vínculo(s), com os dois eixos e o efetivo`;
  });

  await etapa('auditoria: listar', async () => {
    const primeiroItem = await selecionar('audit_events', 'select=*&order=occurred_at.desc&limit=10');
    return `${primeiroItem.length} evento(s)`;
  });

  await etapa('dashboard: dashboard_summary', async () => {
    const dadosRegistro = await executarFuncaoBanco('dashboard_summary');
    return dadosRegistro ? 'ok' : 'vazio';
  });

  for (const [nome, argumentos] of [
    ['report_monthly_costs', {}],
    ['report_vehicle_costs', { p_page: 1, p_page_size: 10 }],
    ['report_maintenance_due', { p_horizon_days: 30 }],
    ['report_recent_movements', { p_page: 1, p_page_size: 10 }],
  ]) {
    await etapa(`relatório: ${nome}`, async () => {
      const resultadoItem = await executarFuncaoBanco(nome, argumentos);
      const linhas = Array.isArray(resultadoItem)
        ? resultadoItem
        : (resultadoItem?.items ?? resultadoItem?.rows ?? []);
      return `${linhas.length} linha(s)`;
    });
  }

  if (outroAdministradorEmpresaIdentificador) {
    await etapa('RLS: outra empresa não vê o veículo criado', async () => {
      const salvo = tokenAtual;
      tokenAtual = emitirToken(outroAdministradorEmpresaIdentificador);
      const veiculoItem = await selecionar('vehicles', `select=id,plate&plate=eq.${placa}`);
      tokenAtual = salvo;
      if (veiculoItem.length !== 0)
        throw new Error(`vazou ${veiculoItem.length} linha(s) para outra empresa`);
      return 'nenhuma linha vazou';
    });

    await esperarFalha('RLS: outra empresa não altera o veículo', 'TENANT_MISMATCH', async () => {
      const salvo = tokenAtual;
      tokenAtual = emitirToken(outroAdministradorEmpresaIdentificador);
      try {
        await executarFuncaoBanco('update_vehicle', {
          p_vehicle_id: veiculoIdentificador,
          p_patch: { color: 'Invasor' },
        });
      } finally {
        tokenAtual = salvo;
      }
    });
  }

  await esperarFalha('RLS: sem token, my_context é recusado', 401, async () => {
    const salvo = tokenAtual;
    tokenAtual = null;
    try {
      await executarFuncaoBanco('my_context');
    } finally {
      tokenAtual = salvo;
    }
  });

  await etapa('veículos: arquivar', async () => {
    const resultadoItem = await executarFuncaoBanco('archive_vehicle', {
      p_vehicle_id: veiculoIdentificador,
      p_reason: 'fim do teste',
    });
    return resultadoItem.status ?? 'arquivado';
  });

  await esperarFalha('veículos: arquivado não é editável', 'CONFLICT_ARCHIVED', () =>
    executarFuncaoBanco('update_vehicle', {
      p_vehicle_id: veiculoIdentificador,
      p_patch: { color: 'Verde' },
    }),
  );

  await etapa('veículos: desarquivar', async () => {
    const resultadoItem = await executarFuncaoBanco('unarchive_vehicle', {
      p_vehicle_id: veiculoIdentificador,
    });
    return resultadoItem.status ?? 'ativo';
  });

  const falhou = resultados.filter((resultadoItem) => !resultadoItem.ok);
  for (const resultadoItem of resultados) {
    console.log(
      `  ${resultadoItem.ok ? 'OK  ' : 'FAIL'}  ${resultadoItem.name}${resultadoItem.detail ? `  — ${resultadoItem.detail}` : ''}`,
    );
  }
  console.log('');
  console.log(
    '  não coberto: GoTrue real (senha, cadastro e fluxos próprios do Auth) — tokens emitidos por dev-token.mjs',
  );
  console.log('');

  if (falhou.length) {
    console.error(`test:integration  FAIL — ${falhou.length}/${resultados.length}`);
    process.exit(1);
  }
  console.log(`test:integration  PASS — ${resultados.length}/${resultados.length}`);
}

principal().catch((erro) => {
  console.error('test:integration  FAIL —', erro.message);
  process.exit(1);
});
