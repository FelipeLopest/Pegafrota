export const IDENTIFICADOR_ELEMENTO_CONFIGURACAO = 'pnf-admin-config';

export function lerConfiguracao() {
  const criarElemento = document.getElementById(IDENTIFICADOR_ELEMENTO_CONFIGURACAO);
  if (!criarElemento) {
    throw new Error(
      'Configuração ausente: elemento #' + IDENTIFICADOR_ELEMENTO_CONFIGURACAO + ' não encontrado.',
    );
  }
  const configuracao = JSON.parse(criarElemento.textContent || '{}');
  if (!configuracao.supabaseUrl || !configuracao.anonKey) {
    throw new Error('Configuração incompleta: supabaseUrl e anonKey são obrigatórios.');
  }
  return configuracao;
}

export let configuracaoCache = null;

export function configuracao() {
  if (!configuracaoCache) configuracaoCache = lerConfiguracao();
  return configuracaoCache;
}
