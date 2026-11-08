import { normalizarRotulo } from './validar-documentos.mjs';

export function validarViagem(dados) {
  const erros = {};
  if (!dados.vehicleId) erros.vehicleId = 'Selecione o veículo.';
  if (!dados.driverId) erros.driverId = 'Selecione o motorista.';
  if (!normalizarRotulo(dados.originLabel)) erros.originLabel = 'Informe a origem.';
  if (!normalizarRotulo(dados.destinationLabel)) erros.destinationLabel = 'Informe o destino.';

  if (dados.plannedDepartureAt && dados.plannedReturnAt) {
    if (new Date(dados.plannedReturnAt) <= new Date(dados.plannedDepartureAt)) {
      erros.plannedReturnAt = 'O fim previsto deve ser posterior ao início previsto.';
    }
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}

export function validarConclusaoViagem(dados, { startOdometerKm: inicioOdometerKm }) {
  const erros = {};
  const fim = Number(dados.endOdometerKm);
  if (!Number.isFinite(fim)) {
    erros.endOdometerKm = 'Informe o km final.';
  } else if (Number.isFinite(Number(inicioOdometerKm)) && fim < Number(inicioOdometerKm)) {
    erros.endOdometerKm = `O km final deve ser maior ou igual ao inicial (${inicioOdometerKm} km).`;
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}
