import { comCache } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosTelaInicial = ({ de = null, ate = null } = {}) =>
  comCache(
    'dashboard:' + de + ':' + ate,
    () => executarFuncaoBanco('fleet_overview', { p_from: de, p_to: ate }),
    10000,
  );
