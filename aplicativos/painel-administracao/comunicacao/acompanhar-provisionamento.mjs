import { servicos } from '../dados/dados-do-painel.mjs';

export async function acompanharOperacao(
  operacaoIdentificador,
  aoAtualizar,
  { signal: sinalCancelamento } = {},
) {
  const ESTADOS_FINAIS = new Set(['succeeded', 'failed', 'compensated', 'needs_manual']);
  let atraso = 600;

  for (;;) {
    if (sinalCancelamento?.aborted) return null;
    const operacao = await servicos.operations.get(operacaoIdentificador);
    aoAtualizar?.(operacao);
    if (ESTADOS_FINAIS.has(operacao.status)) return operacao;
    await new Promise((resultadoItem) => setTimeout(resultadoItem, atraso));
    atraso = Math.min(atraso * 1.4, 4000);
  }
}
