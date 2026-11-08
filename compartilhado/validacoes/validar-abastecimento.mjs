export function validarAbastecimento(dados, { lastOdometerKm: ultimoOdometerKm = null } = {}) {
  const erros = {};
  if (!dados.vehicleId) erros.vehicleId = 'Selecione o veículo.';
  if (!dados.fuelType) erros.fuelType = 'Selecione o produto.';

  const litros = Number(dados.liters);
  if (!Number.isFinite(litros) || litros <= 0) {
    erros.liters = 'Informe os litros.';
  }
  const preco = Number(dados.pricePerLiter);
  if (!Number.isFinite(preco) || preco <= 0) {
    erros.pricePerLiter = 'Informe o valor por litro.';
  }
  const odometro = Number(dados.odometerKm);
  if (!Number.isFinite(odometro) || odometro < 0) {
    erros.odometerKm = 'Informe o odômetro.';
  } else if (ultimoOdometerKm != null && odometro < Number(ultimoOdometerKm)) {
    erros.odometerKm = `Odômetro menor que a última leitura (${ultimoOdometerKm} km). Corrija ou registre uma correção.`;
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}

export function calcularTotalAbastecimento(litros, precoPorLitro) {
  const linhaItem = Number(litros);
  const parametroItem = Number(precoPorLitro);
  if (!Number.isFinite(linhaItem) || !Number.isFinite(parametroItem)) return null;

  const litrosMilesimos = Math.round(linhaItem * 1000); // 3 casas
  const precoMilesimos = Math.round(parametroItem * 1000); // 3 casas
  const microdados = litrosMilesimos * precoMilesimos; // inteiro exato, 6 casas

  const negativo = microdados < 0;
  const caminhoAbsoluto = Math.abs(microdados);
  const centavos = Math.floor((caminhoAbsoluto + 5000) / 10000);
  return (negativo ? -centavos : centavos) / 100;
}
