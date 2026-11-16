import { configuracao } from '../comunicacao/carregar-configuracao.mjs';
import { requisicaoServidor } from '../comunicacao/verificar-conexao.mjs';

export const CHAVE_SESSAO = 'pnf.admin.session';
let geracao = 0;
let renovacaoEmCurso;

function guardarSessao(valor) {
  sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(valor));
}

export const sessao = {
  get() {
    try {
      const bruto = sessionStorage.getItem(CHAVE_SESSAO);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  },
  set(valor) {
    guardarSessao(valor);
    geracao++;
  },
  clear() {
    sessionStorage.removeItem(CHAVE_SESSAO);
    geracao++;
  },
  get geracao() {
    return geracao;
  },
  get accessToken() {
    return this.get()?.access_token ?? null;
  },
};

export async function renovarSessao(tokenRejeitado, geracaoInicial) {
  if (geracao !== geracaoInicial) return false;
  const atual = sessao.get();
  if (!atual?.access_token) return false;
  // Uma requisição paralela pode ter terminado a renovação deste token.
  if (atual.access_token !== tokenRejeitado) return true;
  if (!atual.refresh_token) return false;
  if (renovacaoEmCurso?.geracao === geracaoInicial) return renovacaoEmCurso.promessa;

  const promessa = (async () => {
    const { supabaseUrl, anonKey } = configuracao();
    const resposta = await requisicaoServidor(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ refresh_token: atual.refresh_token }),
      signal: AbortSignal.timeout(12000),
    });
    if (geracao !== geracaoInicial) return false;
    if ([400, 401, 403, 422].includes(resposta.status)) return false;
    if (!resposta.ok) throw new Error('Não foi possível renovar a sessão agora. Tente novamente.');
    const renovada = await resposta.json();
    if (geracao !== geracaoInicial) return false;
    if (!renovada?.access_token || !renovada?.refresh_token)
      throw new Error('A resposta da renovação está incompleta. Tente novamente.');
    if (atual.user?.id && atual.user.id !== renovada.user?.id) return false;
    // A conta continua a mesma. Apenas trocamos seus tokens.
    guardarSessao(renovada);
    return true;
  })().finally(() => {
    if (renovacaoEmCurso?.promessa === promessa) renovacaoEmCurso = null;
  });
  renovacaoEmCurso = { geracao: geracaoInicial, promessa };
  return promessa;
}
