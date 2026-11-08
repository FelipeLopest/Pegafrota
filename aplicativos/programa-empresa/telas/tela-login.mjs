import { el as criarElemento, campo, botao, notificacao } from '../componentes/componentes-do-programa.mjs';

import { icone } from '../componentes/icones.mjs';

import { entrar } from '../acesso/sessao-e-permissoes.mjs';

import { aplicativo } from '../componentes/conteiner-do-aplicativo.mjs';

export function renderizarLogin({ onSuccess: aoSucesso }) {
  let email = '';
  let senha = '';
  let manterConectado = false;
  let senhaVisivel = false;
  let erros = {};
  let ocupado = false;

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

    // Botão de exibir senha. Digitar senha às cegas num teclado de pátio, com
    // luva ou pressa, é a causa mais comum de "senha incorreta" — poder
    // conferir antes de enviar evita o bloqueio por tentativas.
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
          // Preserva o ponto de digitação: renderizar do zero jogaria o cursor
          // para o fim e faria a pessoa perder o lugar.
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
          criarElemento('div', { class: 'auth-hero-brand' }, [
            criarElemento('span', { class: 'brand-mark', text: 'PF' }),
            criarElemento('span', {}, [
              criarElemento('span', { text: 'Pega' }),
              criarElemento('span', { class: 'auth-hero-brand-accent', text: 'NaFrota' }),
            ]),
          ]),
          criarElemento('div', { class: 'auth-hero-body' }, [
            // Título curto e tópicos, no lugar do parágrafo corrido: quem abre a
            // tela de entrada não lê texto explicativo — varre a página.
            criarElemento('h2', { class: 'auth-hero-title', text: 'Sua frota inteira em um só lugar' }),
            criarElemento(
              'ul',
              { class: 'auth-hero-marks' },
              [
                ['vehicles', 'Veículos e motoristas sempre atualizados'],
                ['movements', 'Entrada e saída do pátio com odômetro conferido'],
                ['fuel', 'Abastecimentos com consumo calculado por veículo'],
                ['tool', 'Manutenções avisadas antes de vencer'],
                ['reports', 'Relatórios de custo prontos para exportar'],
              ].map(([nomeIcone, rotulo]) =>
                criarElemento('li', { class: 'auth-hero-mark' }, [
                  icone(nomeIcone, { size: 'sm' }),
                  criarElemento('span', { text: rotulo }),
                ]),
              ),
            ),
          ]),
          // O rodapé técnico ("Desktop · janela mínima 1024×720") foi removido:
          // é informação de especificação, não serve a quem vai entrar.
        ]),

        criarElemento('main', { class: 'auth-form-pane' }, [
          criarElemento('div', { class: 'auth-form' }, [
            criarElemento('h1', { class: 'auth-title', text: 'Entrar' }),
            criarElemento('p', { class: 'auth-subtitle', text: 'Acesse com as credenciais da sua empresa.' }),
            campo({
              id: 'email',
              label: 'E-mail',
              required: true,
              error: erros.email,
              control: entradaEmail,
            }),
            campo({
              id: 'senha',
              label: 'Senha',
              required: true,
              error: erros.password,
              control: entradaSenha,
              wrapper: campoSenha,
            }),
            criarElemento('label', { class: 'auth-remember' }, [
              criarElemento('input', {
                type: 'checkbox',
                checked: manterConectado,
                onChange: (evento) => {
                  manterConectado = evento.target.checked;
                },
              }),
              criarElemento('span', { text: 'Manter conectado' }),
            ]),
            erros.form
              ? criarElemento('p', { class: 'field-error', role: 'alert' }, [
                  icone('warning', { size: 'sm' }),
                  criarElemento('span', { text: erros.form }),
                ])
              : null,
            botao({ label: 'Entrar', variant: 'primary', size: 'block', busy: ocupado, onClick: enviar }),
            criarElemento(
              'button',
              {
                class: 'auth-link',
                type: 'button',
                onClick: () =>
                  notificacao('Peça ao administrador da sua empresa para redefinir seu acesso.', {
                    tone: 'info',
                    duration: 7000,
                  }),
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
      await entrar(email, senha, { manterConectado });
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
