import { el as criarElemento, notificacao, botao, campo } from '../componentes/componentes-do-painel.mjs';

import { icone } from '../componentes/icones.mjs';

import { entrar } from '../comunicacao/comunicacao-com-servidor.mjs';

import { aplicativo } from '../componentes/conteiner-do-aplicativo.mjs';

export function renderizarLogin({ onSuccess: aoSucesso }) {
  let email = '';
  let senha = '';
  let erros = {};
  let ocupado = false;
  let senhaVisivel = false;

  function renderizar() {
    const entradaEmail = criarElemento('input', {
      class: 'input',
      type: 'email',
      autocomplete: 'username',
      value: email,
      onInput: (evento) => {
        email = evento.target.value;
      },
    });
    const entradaSenha = criarElemento('input', {
      class: 'input',
      type: senhaVisivel ? 'text' : 'password',
      autocomplete: 'current-password',
      value: senha,
      onInput: (evento) => {
        senha = evento.target.value;
      },
      onKeydown: (evento) => {
        if (evento.key === 'Enter') enviar();
      },
    });

    // Botão de exibir senha, igual ao do Desktop: poder conferir antes de
    // enviar evita o bloqueio por tentativas erradas.
    const alternarSenha = criarElemento(
      'button',
      {
        class: 'input-affix-btn',
        type: 'button',
        'aria-label': senhaVisivel ? 'Ocultar senha' : 'Exibir senha',
        'aria-pressed': senhaVisivel ? 'true' : 'false',
        title: senhaVisivel ? 'Ocultar senha' : 'Exibir senha',
        onClick: () => {
          senhaVisivel = !senhaVisivel;
          const posicao = entradaSenha.selectionStart;
          renderizar();
          const novo = document.getElementById('senha');
          novo?.focus();
          try {
            novo?.setSelectionRange(posicao, posicao);
          } catch {
            /* campo vazio */
          }
        },
      },
      [icone(senhaVisivel ? 'eye-off' : 'eye', { size: 'sm' })],
    );

    const campoSenha = criarElemento('div', { class: 'input-affix' }, [entradaSenha, alternarSenha]);

    aplicativo.replaceChildren(
      criarElemento('div', { class: 'auth-split' }, [
        criarElemento('aside', { class: 'auth-hero' }, [
          criarElemento('div', {}, [
            criarElemento('div', { class: 'auth-hero-brand' }, [
              criarElemento('span', { class: 'sidebar-brand-mark', text: 'PF' }),
              criarElemento('span', {}, [
                criarElemento('span', { text: 'Pega' }),
                criarElemento('span', { class: 'auth-hero-brand-accent', text: 'NaFrota' }),
              ]),
            ]),
            criarElemento('p', { class: 'auth-hero-kicker', text: 'AMBIENTE ADMINISTRATIVO' }),
          ]),

          criarElemento('div', { class: 'auth-hero-body' }, [
            criarElemento('h2', { class: 'auth-hero-title', text: 'O painel de quem opera a plataforma.' }),
            criarElemento('p', {
              class: 'auth-hero-text',
              text:
                'Cadastro de empresas, primeiro administrador, provisionamentos ' +
                'e auditoria global. Sem acesso à frota dos clientes.',
            }),
            criarElemento(
              'ul',
              { class: 'auth-hero-asset' },
              [
                ['company', 'Provisionamento de empresas com passos rastreáveis'],
                ['admin', 'Primeiro administrador com senha para o Desktop'],
                ['operation', 'Reprocessamento e compensação de operações'],
                ['audit', 'Auditoria global, inclusive das tentativas negadas'],
              ].map(([nomeIcone, rotulo]) =>
                criarElemento('li', { class: 'auth-hero-mark' }, [
                  icone(nomeIcone, { size: 'sm' }),
                  criarElemento('span', { text: rotulo }),
                ]),
              ),
            ),
          ]),

          criarElemento('div', { class: 'auth-hero-foot' }, [
            criarElemento('p', { text: 'Aplicação web · acesso restrito a platform_admin' }),
            criarElemento('p', { text: 'Não existe cadastro público.' }),
          ]),
        ]),

        criarElemento('main', { class: 'auth-form-pane' }, [
          criarElemento('div', { class: 'auth-form' }, [
            criarElemento('h1', { class: 'auth-title', text: 'Entrar no painel administrativo' }),
            criarElemento('p', {
              class: 'auth-subtitle',
              text:
                'Acesso exclusivo do administrador da plataforma. ' +
                'Não há criação de conta neste ambiente.',
            }),
            campo({
              id: 'email',
              label: 'E-mail',
              error: erros.email,
              required: true,
              control: entradaEmail,
            }),
            campo({
              id: 'senha',
              label: 'Senha',
              error: erros.password,
              required: true,
              control: entradaSenha,
              wrapper: campoSenha,
            }),
            erros.form
              ? criarElemento('p', { class: 'field-error', role: 'alert' }, [
                  icone('warning', { size: 'sm' }),
                  criarElemento('span', { text: erros.form }),
                ])
              : null,
            botao({ label: 'Continuar', variant: 'primary', size: 'block', busy: ocupado, onClick: enviar }),
            criarElemento(
              'button',
              {
                class: 'auth-link',
                type: 'button',
                onClick: () =>
                  notificacao(
                    'A redefinição é feita por outro administrador da plataforma ou pelo procedimento de bootstrap.',
                    { tone: 'info', duration: 8000 },
                  ),
              },
              ['Esqueci minha senha'],
            ),
          ]),
        ]),
      ]),
    );
    aplicativo.removeAttribute('aria-busy');
    entradaEmail.focus();
  }

  async function enviar() {
    erros = {};
    if (!email) erros.email = 'Informe o e-mail.';
    if (!senha) erros.password = 'Informe a senha.';
    if (Object.keys(erros).length) {
      renderizar();
      return;
    }

    ocupado = true;
    renderizar();
    try {
      await entrar(email, senha);
      aoSucesso();
    } catch (erro) {
      ocupado = false;
      erros.form =
        erro?.status === 400 || erro?.status === 401
          ? 'E-mail ou senha incorretos.'
          : erro?.message || 'Não foi possível entrar.';
      renderizar();
    }
  }

  renderizar();
}
