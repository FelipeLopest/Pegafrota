import { el as criarElemento, botao, campo } from '../componentes/componentes-do-painel.mjs';

import {
  acceptInvite as aceitarConvite,
  definirSenha,
  sessionFromUrlFragment as sessaoPeloFragmentoEndereco,
  sessao,
} from '../comunicacao/comunicacao-com-servidor.mjs';

import { validarSenha, TAMANHO_MINIMO_SENHA, forcaSenha } from '@peganafrota/validation';
import {
  interpretarUrlConvite as interpretarEnderecoConvite,
  STEP as ETAPAS,
  INVITE_ERROR as ERROS_CONVITE,
} from '../acesso/interpretar-convite.mjs';

export function renderizarAceiteConviteAdministracao(raiz) {
  const interpretado = interpretarEnderecoConvite();
  let etapa = ETAPAS.CHECKING;
  let erro = null;
  let senha = '';
  let confirmar = '';
  let errosCampos = {};
  let ocupado = false;

  const cartao = (filhos) =>
    criarElemento('div', { class: 'auth-page' }, [
      criarElemento('div', { class: 'auth-card' }, [
        criarElemento('div', { class: 'auth-brand' }, [
          criarElemento('span', { class: 'sidebar-brand-mark', text: 'PF' }),
          'PegaNaFrota',
        ]),
        ...filhos,
      ]),
    ]);

  function renderizar() {
    if (etapa === ETAPAS.CHECKING) {
      raiz.replaceChildren(
        cartao([
          criarElemento('h1', { class: 'auth-title', text: 'Validando seu convite' }),
          criarElemento('p', { class: 'auth-subtitle', text: 'Um instante…' }),
        ]),
      );
      return;
    }

    if (etapa === ETAPAS.FAILED) {
      const informacoes = ERROS_CONVITE[erro] || {
        title: 'Não foi possível abrir o convite',
        text: 'Tente novamente. Se o problema continuar, peça um novo convite.',
      };
      raiz.replaceChildren(
        cartao([
          criarElemento('h1', { class: 'auth-title', text: informacoes.title }),
          criarElemento('p', { class: 'auth-subtitle', text: informacoes.text }),
          criarElemento('p', { class: 'field-hint' }, [
            'Código: ',
            criarElemento('code', { text: erro || 'desconhecido' }),
          ]),
        ]),
      );
      return;
    }

    if (etapa === ETAPAS.DONE) {
      raiz.replaceChildren(
        cartao([
          criarElemento('h1', { class: 'auth-title', text: 'Acesso ativado' }),
          criarElemento('p', {
            class: 'auth-subtitle',
            text: 'Sua senha foi definida e seu vínculo com a empresa está ativo.',
          }),
          criarElemento('div', { class: 'card' }, [
            criarElemento('h2', { class: 'card-title', text: 'Próximo passo' }),
            criarElemento('p', {
              text: 'Abra o aplicativo PegaNaFrota Desktop no computador da empresa e entre com o seu e-mail e a senha que você acabou de definir.',
            }),
            criarElemento('p', {
              class: 'field-hint',
              text: 'Este painel é exclusivo da administração da plataforma; sua operação acontece no Desktop.',
            }),
          ]),
        ]),
      );
      return;
    }

    const entradaSenha = criarElemento('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'new-password',
      onInput: (evento) => {
        senha = evento.target.value;
        sincronizarForca();
      },
    });
    const entradaConfirmacao = criarElemento('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'new-password',
      onInput: (evento) => {
        confirmar = evento.target.value;
      },
      onKeydown: (evento) => {
        if (evento.key === 'Enter') enviar();
      },
    });

    const sincronizarForca = () => {
      const no = raiz.querySelector('[data-strength]');
      if (!no) return;
      no.textContent = senha.length >= TAMANHO_MINIMO_SENHA ? `Força: ${forcaSenha(senha)}` : '';
    };

    raiz.replaceChildren(
      cartao([
        criarElemento('h1', { class: 'auth-title', text: 'Defina sua senha' }),
        criarElemento('p', {
          class: 'auth-subtitle',
          text: 'Você foi cadastrado como administrador de uma empresa. Escolha uma senha para ativar seu acesso.',
        }),
        campo({
          id: 'pw',
          label: 'Nova senha',
          required: true,
          error: errosCampos.password,
          hint: `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.`,
          control: entradaSenha,
        }),
        campo({
          id: 'pw2',
          label: 'Repita a senha',
          required: true,
          error: errosCampos.confirm,
          control: entradaConfirmacao,
        }),
        errosCampos.form
          ? criarElemento('p', { class: 'field-error', role: 'alert', text: errosCampos.form })
          : null,
        botao({ label: 'Ativar meu acesso', variant: 'primary', busy: ocupado, onClick: enviar }),
      ]),
    );
    entradaSenha.focus();
  }

  async function enviar() {
    const verificar = validarSenha(senha, { confirm: confirmar });
    errosCampos = { ...verificar.errors };
    if (!verificar.ok) {
      renderizar();
      return;
    }

    ocupado = true;
    renderizar();
    try {
      await definirSenha(senha);
      const resultado = await aceitarConvite(interpretado.businessToken);
      etapa = ETAPAS.DONE;
      ocupado = false;
      renderizar();
      return resultado;
    } catch (erro) {
      ocupado = false;
      if (ERROS_CONVITE[erro.hint]) {
        erro = erro.hint;
        etapa = ETAPAS.FAILED;
      } else {
        errosCampos.form = erro.message || 'Não foi possível ativar o acesso.';
      }
      renderizar();
    }
  }

  (async () => {
    renderizar();

    if (interpretado.error) {
      erro = 'INVITE_INVALID';
      etapa = ETAPAS.FAILED;
      renderizar();
      return;
    }

    if (!interpretado.businessToken) {
      erro = 'INVITE_INVALID';
      etapa = ETAPAS.FAILED;
      renderizar();
      return;
    }

    const estabelecido = await sessaoPeloFragmentoEndereco(interpretado);
    if (!estabelecido && !sessao.accessToken) {
      erro = 'INVITE_INVALID';
      etapa = ETAPAS.FAILED;
      renderizar();
      return;
    }

    etapa = ETAPAS.PASSWORD;
    renderizar();
  })();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { renderizarAceiteConviteAdministracao as renderInviteAccept };
