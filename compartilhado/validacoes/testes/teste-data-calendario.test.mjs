import testar from 'node:test';
import verificar from 'node:assert/strict';
import { formatarDataCalendario } from '../formatar-data-calendario.mjs';

testar('validade cadastral continua no mesmo dia no Brasil', () => {
  const fusoAnterior = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    verificar.equal(formatarDataCalendario('2028-12-31'), '31/12/2028');
    const instante = '2028-12-31T01:00:00Z';
    const diaLocal = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
      new Date(instante),
    );
    verificar.equal(formatarDataCalendario(instante), diaLocal);
  } finally {
    if (fusoAnterior === undefined) delete process.env.TZ;
    else process.env.TZ = fusoAnterior;
  }
});
