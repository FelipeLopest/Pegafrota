import { comCache } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosTelaInicial = () =>
  comCache('dashboard', () => executarFuncaoBanco('dashboard_summary'), 10000);
