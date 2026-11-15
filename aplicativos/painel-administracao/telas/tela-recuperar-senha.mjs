import { el as criarElemento, campo, botao } from '../componentes/componentes-do-painel.mjs';
import { validarSenha } from '@peganafrota/validation';
import { contaUsuario } from '../acesso/conta-do-usuario.mjs';
import { interpretarRecuperacao } from '../acesso/gerenciar-conta.mjs';
import { abrirRecuperacaoSenha } from '../formularios/formulario-senha.mjs';

export function renderizarRecuperacaoSenha(raiz) {
  const informacoes = interpretarRecuperacao(location.href);
  let token = informacoes?.token || null;
  let tokenHash = informacoes?.tokenHash || null;
  let ocupado = false;
  // Credenciais do link não entram em localStorage/sessionStorage nem na sessão do painel.
  history.replaceState(null, '', location.pathname + '?flow=recover');
  const nova = criarElemento('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'new-password',
    maxlength: '72',
  });
  const confirmar = criarElemento('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'new-password',
    maxlength: '72',
  });
  const mensagem = criarElemento('p', { class: 'field-error', role: 'alert' });
  const cabecalho = [
    criarElemento('img', {
      src: './recursos/icone-aplicativo.svg',
      alt: 'PegaNaFrota',
      width: '44',
      height: '44',
    }),
    criarElemento('h1', { class: 'auth-title', text: 'Definir outra senha' }),
    criarElemento('p', {
      class: 'auth-subtitle',
      text: 'Esta página serve às contas da empresa e da administração. Ao terminar, entre novamente no aplicativo que você usa.',
    }),
  ];
  const cartao = criarElemento('div', { class: 'auth-card' });
  const solicitar = botao({
    label: 'Pedir outro link',
    onClick: () => abrirRecuperacaoSenha(),
  });
  const salvar = botao({
    label: 'Salvar nova senha',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      const validacao = validarSenha(nova.value, { confirm: confirmar.value });
      if (!validacao.ok) {
        mensagem.textContent = Object.values(validacao.errors)[0];
        return;
      }
      ocupado = true;
      salvar.disabled = true;
      mensagem.textContent = '';
      try {
        if (!token && tokenHash) {
          const resposta = await contaUsuario.verificarRecuperacao(tokenHash);
          token = resposta.access_token;
          tokenHash = null;
        }
        await contaUsuario.concluirRecuperacao(token, nova.value, confirmar.value);
        token = tokenHash = null;
        nova.value = confirmar.value = '';
        cartao.replaceChildren(
          ...cabecalho.slice(0, 1),
          criarElemento('h1', { class: 'auth-title', text: 'Senha alterada' }),
          criarElemento('p', {
            text: 'Volte ao PegaNaFrota e entre com sua nova senha. Você já pode fechar esta página.',
          }),
          criarElemento('a', {
            class: 'btn btn-secondary',
            href: location.pathname,
            text: 'Voltar à entrada do painel',
          }),
        );
      } catch (erro) {
        mensagem.textContent = erro.message;
      } finally {
        ocupado = false;
        salvar.disabled = false;
      }
    },
  });
  if (!token && !tokenHash) {
    cartao.replaceChildren(
      ...cabecalho,
      criarElemento('p', {
        class: 'field-error',
        text: informacoes?.erro
          ? 'O link não é válido ou expirou. Solicite outro link.'
          : 'Abra o link recebido no e-mail para definir sua senha.',
      }),
      solicitar,
    );
  } else {
    cartao.replaceChildren(
      ...cabecalho,
      campo({
        id: 'rec-senha',
        label: 'Nova senha',
        required: true,
        hint: 'Ao menos 12 caracteres.',
        control: nova,
      }),
      campo({
        id: 'rec-confirmar',
        label: 'Confirmar nova senha',
        required: true,
        control: confirmar,
      }),
      mensagem,
      criarElemento('div', { class: 'modal-actions' }, [solicitar, salvar]),
    );
  }
  raiz.replaceChildren(criarElemento('main', { class: 'auth-page' }, [cartao]));
  raiz.removeAttribute('aria-busy');
}
