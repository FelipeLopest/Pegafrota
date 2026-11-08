import {
  el as criarElemento,
  botao,
  campo,
  notificacao,
  modal,
} from '../componentes/componentes-do-painel.mjs';

import {
  showConflict as mostrarConflito,
  confirmDestructive as confirmarAcaoDestrutiva,
} from './confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos, sessao } from '../comunicacao/comunicacao-com-servidor.mjs';

export function abrirTransferenciaAdministradorPlataforma(ator) {
  const formulario = { email: '', reason: 'Substituição do administrador da plataforma' };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    criarElemento('p', {
      class: 'danger-description',
      text: 'Esta ação transfere o papel global para outra conta já existente no sistema. Seu acesso administrativo atual será removido imediatamente.',
    }),
    campo({
      id: 'platform-transfer-email',
      label: 'E-mail do novo administrador',
      required: true,
      hint: 'A conta precisa já existir e possuir um perfil ativo no PegaNaFrota.',
      control: criarElemento('input', {
        class: 'input',
        type: 'email',
        autocomplete: 'off',
        onInput: (evento) => {
          formulario.email = evento.target.value.trim().toLowerCase();
        },
      }),
    }),
    campo({
      id: 'platform-transfer-reason',
      label: 'Motivo',
      required: true,
      control: criarElemento(
        'textarea',
        {
          class: 'textarea',
          rows: '2',
          onInput: (evento) => {
            formulario.reason = evento.target.value;
          },
        },
        [formulario.reason],
      ),
    }),
  ]);

  const enviar = async () => {
    if (!formulario.email || !formulario.email.includes('@')) {
      notificacao('Informe um e-mail válido.', { tone: 'warning' });
      return;
    }
    if (formulario.email === String(ator?.email || '').toLowerCase()) {
      notificacao('Escolha uma conta diferente da atual.', { tone: 'warning' });
      return;
    }
    correspondenciaItem.close();
    const confirmado = await confirmarAcaoDestrutiva({
      title: 'Transferir administração global',
      description: `O papel platform_admin sairá de ${ator?.email || 'sua conta'} e irá para ${formulario.email}.`,
      expectedName: formulario.email,
      confirmLabel: 'Transferir administração',
      consequences: [
        'Seu painel atual deixará de ter autorização após a transferência.',
        'A nova conta passará a administrar todas as empresas da plataforma.',
        'A troca fica registrada na auditoria global.',
      ],
    });
    if (!confirmado.confirmed) return;
    try {
      await servicos.admins.replacePlatformAdmin(formulario.email, formulario.reason);
      notificacao('Administração transferida. Entre com a nova conta.', { tone: 'success', duration: 7000 });
      sessao.clear();
      setTimeout(() => location.reload(), 600);
    } catch (erro) {
      mostrarConflito({ hint: erro?.hint, message: erro?.message, detail: erro?.detail });
    }
  };

  correspondenciaItem = modal({
    title: 'Transferir administração da plataforma',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Continuar', variant: 'danger', onClick: enviar }),
    ]),
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { abrirTransferenciaAdministradorPlataforma as abrirTransferenciaAdminPlataforma };
