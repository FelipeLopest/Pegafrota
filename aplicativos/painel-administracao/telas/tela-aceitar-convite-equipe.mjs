import { el as criarElemento, botao, campo } from '../componentes/componentes-do-painel.mjs';

import {
  definirSenha,
  sessionFromUrlFragment as sessaoPeloFragmentoEndereco,
  sessao,
  sair,
} from '../comunicacao/comunicacao-com-servidor.mjs';

import { validarSenha, TAMANHO_MINIMO_SENHA } from '@peganafrota/validation';
import {
  interpretarUrlConvite as interpretarEnderecoConvite,
  STEP as ETAPAS,
} from '../acesso/interpretar-convite.mjs';

export function renderizarAceiteConviteEquipe(raiz) {
  const interpretado = interpretarEnderecoConvite();
  let etapa = ETAPAS.CHECKING;
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
          criarElemento('h1', { class: 'auth-title', text: 'Preparando seu acesso' }),
          criarElemento('p', {
            class: 'auth-subtitle',
            text: 'Validando o convite enviado pela sua empresa…',
          }),
        ]),
      );
      return;
    }

    if (etapa === ETAPAS.FAILED) {
      raiz.replaceChildren(
        cartao([
          criarElemento('h1', { class: 'auth-title', text: 'Não foi possível ativar a conta' }),
          criarElemento('p', {
            class: 'auth-subtitle',
            text: 'O link pode ter expirado ou já ter sido utilizado. Peça ao administrador da sua empresa para enviar um novo convite.',
          }),
        ]),
      );
      return;
    }

    if (etapa === ETAPAS.DONE) {
      raiz.replaceChildren(
        cartao([
          criarElemento('h1', { class: 'auth-title', text: 'Conta ativada' }),
          criarElemento('p', { class: 'auth-subtitle', text: 'Sua senha foi definida com sucesso.' }),
          criarElemento('div', { class: 'card' }, [
            criarElemento('h2', { class: 'card-title', text: 'Agora entre no PegaNaFrota Desktop' }),
            criarElemento('p', {
              text: 'Abra o aplicativo no computador da empresa e use o mesmo e-mail do convite com a senha que você acabou de criar.',
            }),
            criarElemento('p', {
              class: 'field-hint',
              text: 'Este painel web é exclusivo da administração global da plataforma.',
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

    raiz.replaceChildren(
      cartao([
        criarElemento('h1', { class: 'auth-title', text: 'Crie sua senha' }),
        criarElemento('p', {
          class: 'auth-subtitle',
          text: 'Seu acesso à empresa já foi preparado. Defina a senha que você usará no aplicativo Desktop.',
        }),
        campo({
          id: 'team-pw',
          label: 'Nova senha',
          required: true,
          error: errosCampos.password,
          hint: `Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres.`,
          control: entradaSenha,
        }),
        campo({
          id: 'team-pw2',
          label: 'Repita a senha',
          required: true,
          error: errosCampos.confirm,
          control: entradaConfirmacao,
        }),
        errosCampos.form
          ? criarElemento('p', { class: 'field-error', role: 'alert', text: errosCampos.form })
          : null,
        botao({ label: 'Ativar conta', variant: 'primary', busy: ocupado, onClick: enviar }),
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
      await sair();
      etapa = ETAPAS.DONE;
    } catch (erro) {
      ocupado = false;
      errosCampos.form = erro?.message || 'Não foi possível definir a senha.';
    }
    renderizar();
  }

  (async () => {
    renderizar();
    if (interpretado.error) {
      etapa = ETAPAS.FAILED;
      renderizar();
      return;
    }
    const estabelecido = await sessaoPeloFragmentoEndereco(interpretado);
    if (!estabelecido && !sessao.accessToken) {
      etapa = ETAPAS.FAILED;
      renderizar();
      return;
    }
    etapa = ETAPAS.PASSWORD;
    renderizar();
  })();
}
