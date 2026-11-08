import { carregarConfiguracao } from '../sistema/carregar-configuracao-da-interface.mjs';
import { sessao, tryRefresh as tentarRenovarSessao } from '../acesso/sessao-do-usuario.mjs';
import { requisicaoServidor } from './verificar-conexao.mjs';

export class ErroBackend extends Error {
  constructor({ hint: dica, message: mensagem, detail: detalhe, status: situacao }) {
    super(mensagem || dica || 'Erro');
    this.name = 'BackendError';
    this.hint = dica || 'INTERNAL_ERROR';
    this.detail = detalhe ?? null;
    this.status = situacao ?? 0;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isPermission() {
    return this.status === 403 || this.hint === 'PERMISSION_DENIED';
  }
}

export async function requisitar(
  caminho,
  {
    method: metodo = 'POST',
    body: corpo,
    headers: cabecalhos = {},
    auth: autenticacao = true,
    raw: respostaBruta = false,
    renovacaoTentada = false,
  } = {},
) {
  const geracaoInicial = sessao.geracao;
  const configuracao = await carregarConfiguracao();
  const cabecalhos2 = {
    'Content-Type': 'application/json',
    apikey: configuracao.anonKey,
    ...cabecalhos,
  };
  if (autenticacao) {
    const token = sessao.accessToken;
    if (!token) throw new ErroBackend({ hint: 'UNAUTHENTICATED', status: 401, message: 'Sessão expirada.' });
    cabecalhos2.Authorization = `Bearer ${token}`;
  }

  let resposta;
  try {
    resposta = await requisicaoServidor(`${configuracao.supabaseUrl}${caminho}`, {
      method: metodo,
      headers: cabecalhos2,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroBackend({ hint: 'NETWORK_ERROR', status: 0, message: 'Sem conexão com o servidor.' });
  }

  if (resposta.status === 401 && autenticacao) {
    const renovado = !renovacaoTentada && (await tentarRenovarSessao());
    if (renovado)
      return requisitar(caminho, {
        method: metodo,
        body: corpo,
        headers: cabecalhos,
        auth: autenticacao,
        raw: respostaBruta,
        renovacaoTentada: true,
      });
    if (sessao.geracao !== geracaoInicial)
      throw new ErroBackend({
        hint: 'SESSION_CHANGED',
        status: 401,
        message: 'A sessão foi alterada durante a consulta.',
      });
    await sessao.clear();
    throw new ErroBackend({ hint: 'UNAUTHENTICATED', status: 401, message: 'Sessão expirada.' });
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    const servidorErro = dados?.error && typeof dados.error === 'object' ? dados.error : dados;
    const brutoCodigo = servidorErro?.code || servidorErro?.hint || '';
    const brutoMensagem = servidorErro?.message || 'Erro no servidor.';
    const funcaoBancoDesatualizada = brutoCodigo === 'PGRST202';
    throw new ErroBackend({
      hint: funcaoBancoDesatualizada
        ? 'BACKEND_SCHEMA_OUTDATED'
        : servidorErro?.hint || brutoCodigo || brutoMensagem.split(':')[0] || 'INTERNAL_ERROR',
      message: funcaoBancoDesatualizada
        ? 'O aplicativo está mais novo que o banco. A atualização do backend ainda não foi aplicada.'
        : brutoMensagem,
      detail: funcaoBancoDesatualizada
        ? `${brutoMensagem}${servidorErro?.details ? ` — ${servidorErro.details}` : ''}`
        : (servidorErro?.detail ?? servidorErro?.details ?? null),
      status: resposta.status,
    });
  }

  return respostaBruta ? { data: dados, headers: resposta.headers, status: resposta.status } : dados;
}

export function executarFuncaoBanco(nome, argumentos = {}) {
  return requisitar(`/rest/v1/rpc/${nome}`, { body: argumentos });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { executarFuncaoBanco as rpc };
