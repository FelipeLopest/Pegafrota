import { criarGerenciadorConta } from './gerenciar-conta.mjs';
import { configuracao } from '../comunicacao/carregar-configuracao.mjs';
import { sessao } from './sessao-do-usuario.mjs';
export const contaUsuario = criarGerenciadorConta({
  configurar: configuracao,
  obterToken: () => sessao.accessToken,
  salvarSessao: (valor) => sessao.set(valor),
});
