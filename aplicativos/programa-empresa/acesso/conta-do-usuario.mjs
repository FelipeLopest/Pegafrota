import { criarGerenciadorConta } from './gerenciar-conta.mjs';
import { carregarConfiguracao } from '../sistema/carregar-configuracao-da-interface.mjs';
import { sessao } from './sessao-do-usuario.mjs';
export const contaUsuario = criarGerenciadorConta({
  configurar: carregarConfiguracao,
  obterToken: () => sessao.accessToken,
  salvarSessao: (valor) => sessao.set(valor),
});
