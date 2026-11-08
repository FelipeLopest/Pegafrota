import {
  el as criarElemento,
  botao,
  campo,
  notificacao,
  modal,
} from '../componentes/componentes-do-painel.mjs';

import { showConflict as mostrarConflito } from './confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { validarSenha, forcaSenha } from '@peganafrota/validation';

export async function abrirAlteracaoSenhaMembro(empresa, membro, aoConcluir) {
  const formulario = { password: '', confirm: '' };
  let erros = {};
  let correspondenciaItem;

  const renderizar = () => {
    const senha = criarElemento('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'new-password',
      value: formulario.password,
      onInput: (evento) => {
        formulario.password = evento.target.value;
      },
    });
    const confirmar = criarElemento('input', {
      class: 'input',
      type: 'password',
      autocomplete: 'new-password',
      value: formulario.confirm,
      onInput: (evento) => {
        formulario.confirm = evento.target.value;
      },
    });
    const corpo = criarElemento('div', {}, [
      criarElemento('p', {
        class: 'muted',
        text: `Defina uma nova senha para ${membro.fullName}. A senha não será exibida nem armazenada no painel.`,
      }),
      campo({
        id: 'member-new-password',
        label: 'Nova senha',
        required: true,
        hint: `Mínimo de 12 caracteres. Força atual: ${forcaSenha(formulario.password)}.`,
        error: erros.password,
        control: senha,
      }),
      campo({
        id: 'member-confirm-password',
        label: 'Confirmar nova senha',
        required: true,
        error: erros.confirm,
        control: confirmar,
      }),
    ]);
    const rodape = criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Alterar senha', variant: 'primary', icon: 'key', onClick: enviar }),
    ]);
    correspondenciaItem.dialog.querySelector('.modal-body').replaceChildren(corpo);
    correspondenciaItem.dialog.querySelector('.modal-footer').replaceChildren(rodape);
  };

  async function enviar() {
    const validacao = validarSenha(formulario.password, { confirm: formulario.confirm });
    erros = validacao.errors || {};
    if (!validacao.ok) {
      renderizar();
      return;
    }
    try {
      await servicos.members.resetPassword(empresa.id, membro.userId, formulario.password);
      formulario.password = '';
      formulario.confirm = '';
      correspondenciaItem.close();
      notificacao(`Senha de ${membro.fullName} alterada.`, { tone: 'success' });
      aoConcluir?.();
    } catch (erro) {
      if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
      else notificacao(erro.message || 'Não foi possível alterar a senha.', { tone: 'danger' });
    }
  }

  correspondenciaItem = modal({
    title: `Alterar senha — ${membro.fullName}`,
    body: criarElemento('div', {}),
    footer: criarElemento('div', { class: 'modal-actions' }),
    size: 'md',
  });
  renderizar();
}
