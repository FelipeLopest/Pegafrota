import { sessao } from '../acesso/sessao-do-usuario.mjs';
import { chamar } from './enviar-requisicao.mjs';

export let cachePainel = null;

export let painelEmCurso = null;

export async function carregarPainelComCache(parametros = {}) {
  const chave = JSON.stringify([sessao.accessToken, parametros || {}]);
  const agora = Date.now();
  if (cachePainel?.chave === chave && cachePainel.expiraEm > agora) return cachePainel.valor;
  if (painelEmCurso?.chave === chave) return painelEmCurso.promessa;
  const promessa = chamar('dashboard.get', parametros)
    .then((valor) => {
      cachePainel = { chave, valor, expiraEm: Date.now() + 3000 };
      return valor;
    })
    .finally(() => {
      if (painelEmCurso?.promessa === promessa) painelEmCurso = null;
    });
  painelEmCurso = { chave, promessa };
  return promessa;
}
