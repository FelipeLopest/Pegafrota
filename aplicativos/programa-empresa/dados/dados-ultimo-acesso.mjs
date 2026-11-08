import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const registrarUltimoAcesso = () => executarFuncaoBanco('touch_last_seen');
