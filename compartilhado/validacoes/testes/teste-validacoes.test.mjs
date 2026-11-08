import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';

import {
  normalizarDigitos,
  normalizarPlaca,
  normalizarRotulo,
  cnpjValido,
  formatarCnpj,
  placaValida,
  formatarPlaca,
  emailValido,
  telefoneValido,
  validarEtapa1Empresa,
  validarEtapaPrimeiroAdministrador,
  validarVeiculo,
  validarMovimentacao,
  validarAbastecimento,
  calcularTotalAbastecimento,
  validarViagem,
  validarConclusaoViagem,
  validarAjusteOdometro,
  validarIntervaloDatas,
  nomeConfirmacaoConfere,
  novaChaveIdempotencia,
} from '../exportar-validacoes.mjs';

testar('normalizeDigits mantém apenas dígitos', () => {
  verificarCondicao.equal(normalizarDigitos('11.444.777/0001-61'), '11444777000161');
  verificarCondicao.equal(normalizarDigitos('  '), null);
  verificarCondicao.equal(normalizarDigitos(null), null);
});

testar('normalizePlate remove separadores e sobe para caixa alta', () => {
  verificarCondicao.equal(normalizarPlaca('abc-1234'), 'ABC1234');
  verificarCondicao.equal(normalizarPlaca(' abc 1d23 '), 'ABC1D23');
  verificarCondicao.equal(normalizarPlaca(''), null);
});

testar('normalizeLabel colapsa espaços internos', () => {
  verificarCondicao.equal(normalizarRotulo('  Aurora   Verde  '), 'Aurora Verde');
  verificarCondicao.equal(normalizarRotulo('   '), null);
});

testar('isValidCnpj aceita CNPJs válidos', () => {
  for (const cnpj of ['11444777000161', '06990590000123', '60746948000112', '33000167000101']) {
    verificarCondicao.equal(cnpjValido(cnpj), true, `${cnpj} deveria ser válido`);
  }
});

testar('isValidCnpj recusa dígito verificador errado', () => {
  verificarCondicao.equal(cnpjValido('11444777000162'), false);
  verificarCondicao.equal(cnpjValido('11222333000180'), false);
});

testar('isValidCnpj recusa sequências repetidas', () => {
  verificarCondicao.equal(cnpjValido('11111111111111'), false);
  verificarCondicao.equal(cnpjValido('00000000000000'), false);
});

testar('isValidCnpj recusa tamanho errado', () => {
  verificarCondicao.equal(cnpjValido('1144477700016'), false);
  verificarCondicao.equal(cnpjValido(''), false);
});

testar('isValidCnpj aceita entrada formatada — o banco normaliza no trigger', () => {
  verificarCondicao.equal(cnpjValido('11.444.777/0001-61'), true);
});

testar('formatCnpj só formata para exibição', () => {
  verificarCondicao.equal(formatarCnpj('11444777000161'), '11.444.777/0001-61');
});

testar('isValidPlate aceita formato antigo e Mercosul', () => {
  verificarCondicao.equal(placaValida('ABC1234'), true);
  verificarCondicao.equal(formatarPlaca('ABC1234'), 'antiga');
  verificarCondicao.equal(placaValida('ABC1D23'), true);
  verificarCondicao.equal(formatarPlaca('ABC1D23'), 'mercosul');
});

testar('isValidPlate recusa formatos inválidos', () => {
  verificarCondicao.equal(placaValida('AB1234'), false);
  verificarCondicao.equal(placaValida('ABCD123'), false);
  verificarCondicao.equal(placaValida('1234ABC'), false);
  verificarCondicao.equal(placaValida(''), false);
});

testar('isValidPlate normaliza antes de validar', () => {
  verificarCondicao.equal(placaValida('abc-1234'), true);
});

testar('isValidEmail segue a mesma regra da check constraint', () => {
  verificarCondicao.equal(emailValido('contato@empresa.com.br'), true);
  verificarCondicao.equal(emailValido('sem-arroba.com'), false);
  verificarCondicao.equal(emailValido('a@b'), false);
  verificarCondicao.equal(emailValido('com espaco@b.com'), false);
});

testar('isValidPhone exige de 10 a 13 dígitos', () => {
  verificarCondicao.equal(telefoneValido('1533334444'), true);
  verificarCondicao.equal(telefoneValido('(15) 3333-4444'), true);
  verificarCondicao.equal(telefoneValido('153333'), false);
});

testar('validarEtapa1Empresa exige razão social, nome fantasia e CNPJ', () => {
  const resultadoItem = validarEtapa1Empresa({});
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.ok(resultadoItem.errors.legalName);
  verificarCondicao.ok(resultadoItem.errors.tradeName);
  verificarCondicao.ok(resultadoItem.errors.cnpj);
});

testar('validarEtapa1Empresa aponta CNPJ inválido separadamente de CNPJ ausente', () => {
  const ausente = validarEtapa1Empresa({ legalName: 'Empresa X LTDA', tradeName: 'X' });
  verificarCondicao.match(ausente.errors.cnpj, /Informe o CNPJ/);

  const invalido = validarEtapa1Empresa({
    legalName: 'Empresa X LTDA',
    tradeName: 'X',
    cnpj: '11444777000162',
  });
  verificarCondicao.match(invalido.errors.cnpj, /inválido/);
});

testar('validarEtapa1Empresa passa com dados corretos', () => {
  const resultadoItem = validarEtapa1Empresa({
    legalName: 'Transportes Aurora LTDA',
    tradeName: 'Aurora',
    cnpj: '11.444.777/0001-61',
    email: 'contato@aurora.test',
  });
  verificarCondicao.equal(resultadoItem.ok, true);
});

testar('validarEtapaPrimeiroAdministrador valida os dados pessoais; a senha é validada separadamente', () => {
  const resultadoItem = validarEtapaPrimeiroAdministrador({
    fullName: 'Ana Ribeiro',
    email: 'ana@empresa.test',
  });
  verificarCondicao.equal(resultadoItem.ok, true);
  verificarCondicao.equal('password' in resultadoItem.errors, false);
});

testar('validarMovimentacao exige apenas veículo e local', () => {
  verificarCondicao.equal(validarMovimentacao({}).ok, false);
  verificarCondicao.equal(validarMovimentacao({ vehicleId: 'v1', locationId: 'l1' }).ok, true);
});

testar('validarMovimentacao não valida data/hora, tipo nem viagem', () => {
  const resultadoItem = validarMovimentacao({ vehicleId: 'v1', locationId: 'l1' });
  verificarCondicao.equal(resultadoItem.ok, true);
  verificarCondicao.deepEqual(Object.keys(resultadoItem.errors), []);

  const comExtras = validarMovimentacao({
    vehicleId: 'v1',
    locationId: 'l1',
    occurredAt: '2026-01-01T00:00:00Z',
    movementType: 'entry',
    tripId: 't1',
  });
  verificarCondicao.equal(comExtras.ok, true);
});

testar('computeFuelingTotal arredonda em 2 casas como a check constraint', () => {
  verificarCondicao.equal(calcularTotalAbastecimento(53.457, 6.239), 333.52);
  verificarCondicao.equal(calcularTotalAbastecimento(10, 5.5), 55);
  verificarCondicao.equal(calcularTotalAbastecimento('abc', 5), null);
});

testar('computeFuelingTotal arredonda meio-centavo para cima, como o numeric do banco', () => {
  verificarCondicao.equal(calcularTotalAbastecimento(1, 1.005), 1.01);
  verificarCondicao.equal(calcularTotalAbastecimento(0.5, 2.01), 1.01); // 1.005 → 1.01
  verificarCondicao.equal(calcularTotalAbastecimento(2.5, 1.002), 2.51); // 2.505 → 2.51
});

testar('computeFuelingTotal é exato em valores realistas de bomba', () => {
  verificarCondicao.equal(calcularTotalAbastecimento(45.678, 6.099), 278.59);
  verificarCondicao.equal(calcularTotalAbastecimento(100, 5.999), 599.9);
  verificarCondicao.equal(calcularTotalAbastecimento(33.333, 4.444), 148.13);
});

testar('validarAbastecimento avisa regressão de odômetro antes de o banco recusar', () => {
  const resultadoItem = validarAbastecimento(
    { vehicleId: 'v1', fuelType: 'diesel_s10', liters: 50, pricePerLiter: 6, odometerKm: 1000 },
    { lastOdometerKm: 1500 },
  );
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.match(resultadoItem.errors.odometerKm, /menor que a última leitura/);
});

testar('validarAbastecimento passa com leitura crescente', () => {
  const resultadoItem = validarAbastecimento(
    { vehicleId: 'v1', fuelType: 'diesel_s10', liters: 50, pricePerLiter: 6, odometerKm: 2000 },
    { lastOdometerKm: 1500 },
  );
  verificarCondicao.equal(resultadoItem.ok, true);
});

testar('validarViagem exige fim previsto posterior ao início', () => {
  const resultadoItem = validarViagem({
    vehicleId: 'v',
    driverId: 'd',
    originLabel: 'A',
    destinationLabel: 'B',
    plannedDepartureAt: '2026-08-02T10:00:00Z',
    plannedReturnAt: '2026-08-02T09:00:00Z',
  });
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.ok(resultadoItem.errors.plannedReturnAt);
});

testar('validarConclusaoViagem exige km final >= km inicial', () => {
  verificarCondicao.equal(
    validarConclusaoViagem({ endOdometerKm: 900 }, { startOdometerKm: 1000 }).ok,
    false,
  );
  verificarCondicao.equal(
    validarConclusaoViagem({ endOdometerKm: 1000 }, { startOdometerKm: 1000 }).ok,
    true,
  );
});

testar('validarAjusteOdometro exige justificativa', () => {
  const resultadoItem = validarAjusteOdometro({ odometerKm: 5000, reason: '   ' }, { lastOdometerKm: 4000 });
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.ok(resultadoItem.errors.reason);
});

testar('correção exige apontar o registro corrigido', () => {
  const resultadoItem = validarAjusteOdometro(
    { odometerKm: 3000, reason: 'digitação errada', nature: 'correction' },
    { lastOdometerKm: 4000 },
  );
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.ok(resultadoItem.errors.correctionOfId);
});

testar('correção pode ter leitura menor que o topo do ledger', () => {
  const resultadoItem = validarAjusteOdometro(
    { odometerKm: 3000, reason: 'digitação errada', nature: 'correction', correctionOfId: 'e1' },
    { lastOdometerKm: 4000 },
  );
  verificarCondicao.equal(resultadoItem.ok, true);
});

testar('validarIntervaloDatas bloqueia intervalo invertido', () => {
  verificarCondicao.equal(validarIntervaloDatas('2026-08-10', '2026-08-01').ok, false);
  verificarCondicao.equal(validarIntervaloDatas('2026-08-01', '2026-08-10').ok, true);
});

testar('nomeConfirmacaoConfere ignora espaçamento e caixa, mas não conteúdo', () => {
  verificarCondicao.equal(nomeConfirmacaoConfere('  Aurora  Verde ', 'Aurora Verde'), true);
  verificarCondicao.equal(nomeConfirmacaoConfere('AURORA VERDE', 'Aurora Verde'), true);
  verificarCondicao.equal(nomeConfirmacaoConfere('aurora verde', 'Aurora Verde'), true);
  verificarCondicao.equal(nomeConfirmacaoConfere('Aurora Verde Ltda', 'Aurora Verde'), false);
  verificarCondicao.equal(nomeConfirmacaoConfere('', ''), false);
});

testar('newIdempotencyKey respeita o tamanho aceito pelo banco (8..200)', () => {
  const chave = novaChaveIdempotencia();
  verificarCondicao.ok(chave.length >= 8 && chave.length <= 200);
  verificarCondicao.notEqual(chave, novaChaveIdempotencia());
});
