import { selecionar } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosOdometro = {
  history: (veiculoIdentificador, pagina = 1, tamanhoPagina = 50) =>
    executarFuncaoBanco('vehicle_odometer_history', {
      p_vehicle_id: veiculoIdentificador,
      p_page: pagina,
      p_page_size: tamanhoPagina,
    }),
  ledger: (veiculoIdentificador) =>
    selecionar('vehicle_odometer_events', {
      columns:
        'id,vehicle_id,occurred_at,odometer_km,previous_km,source_type,' +
        'reason,correction_of_id,corrected_from_km',
      filters: { vehicle_id: `eq.${veiculoIdentificador}` },
      order: 'occurred_at.desc',
    }),
  adjust: (primeiroItem) =>
    executarFuncaoBanco('register_odometer_reading', {
      p_vehicle_id: primeiroItem.vehicleId,
      p_odometer_km: Number(primeiroItem.odometerKm),
      p_reason: primeiroItem.reason,
      p_correction_of_id: primeiroItem.correctionOfId || null,
    }),
};
