import { normalizarRotulo } from './validar-documentos.mjs';

export function validarAjusteOdometro(dados, { lastOdometerKm: ultimoOdometerKm = null } = {}) {
  const erros = {};
  const km = Number(dados.odometerKm);
  if (!Number.isFinite(km) || km < 0) {
    erros.odometerKm = 'Informe a nova leitura.';
  } else if (ultimoOdometerKm != null && km < Number(ultimoOdometerKm) && dados.nature !== 'correction') {
    erros.odometerKm = `Leitura menor que o topo do ledger (${ultimoOdometerKm} km).`;
  }
  if (!normalizarRotulo(dados.reason)) {
    erros.reason = 'A justificativa é obrigatória.';
  }
  if (dados.nature === 'correction' && !dados.correctionOfId) {
    erros.correctionOfId = 'Selecione o registro que está sendo corrigido.';
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}
