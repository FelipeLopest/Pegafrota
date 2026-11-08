import { normalizarPlaca, placaValida, normalizarRotulo } from './validar-documentos.mjs';

export function validarVeiculo(dados) {
  const erros = {};
  if (!normalizarPlaca(dados.plate)) {
    erros.plate = 'Informe a placa.';
  } else if (!placaValida(dados.plate)) {
    erros.plate = 'Placa inválida. Use AAA0000 ou AAA0A00.';
  }
  if (!normalizarRotulo(dados.brand)) erros.brand = 'Informe a marca.';
  if (!normalizarRotulo(dados.model)) erros.model = 'Informe o modelo.';
  if (!dados.fuelType) erros.fuelType = 'Selecione o combustível.';

  if (dados.modelYear != null && dados.modelYear !== '') {
    const outroItemComparado = Number(dados.modelYear);
    if (
      !Number.isInteger(outroItemComparado) ||
      outroItemComparado < 1900 ||
      outroItemComparado > new Date().getFullYear() + 2
    ) {
      erros.modelYear = 'Ano inválido.';
    }
  }
  if (dados.initialOdometerKm != null && dados.initialOdometerKm !== '') {
    const km = Number(dados.initialOdometerKm);
    if (!Number.isFinite(km) || km < 0) erros.initialOdometerKm = 'Quilometragem inválida.';
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}
