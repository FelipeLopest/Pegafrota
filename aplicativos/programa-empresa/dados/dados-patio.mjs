import { comCache } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosPatio = () => comCache('yard', () => executarFuncaoBanco('yard_snapshot'), 5000);
