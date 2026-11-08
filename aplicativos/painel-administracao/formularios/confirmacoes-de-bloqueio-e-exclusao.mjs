import {
  el as criarElemento,
  botao,
  modal,
  notificacao,
  formatarDataHora as formatarDadosHora,
  untilLabel as ateRotulo,
} from '../componentes/componentes-do-painel.mjs';
import { nomeConfirmacaoConfere } from '@peganafrota/validation';
import { ROTULO_MOTIVO_SUSPENSAO } from '@peganafrota/contracts';

export function confirmarAcaoDestrutiva({
  title: titulo,
  description: descricao,
  expectedName: esperadoNome,
  confirmLabel: confirmarRotulo,
  consequences: consequencias = [],
}) {
  return new Promise((resolver) => {
    let digitado = '';
    let correspondenciaItem;

    const botaoConfirmar = botao({
      label: confirmarRotulo,
      variant: 'danger',
      disabled: true,
      onClick: () => {
        correspondenciaItem.close({ confirmed: true, confirmedName: digitado });
      },
    });

    const entrada = criarElemento('input', {
      class: 'input',
      type: 'text',
      autocomplete: 'off',
      'aria-label': `Digite ${esperadoNome} para confirmar`,
      placeholder: esperadoNome,
      onInput: (evento) => {
        digitado = evento.target.value;
        botaoConfirmar.disabled = !nomeConfirmacaoConfere(digitado, esperadoNome);
      },
    });

    const corpo = criarElemento('div', { class: 'danger-confirm' }, [
      criarElemento('p', { class: 'danger-description', text: descricao }),
      consequencias.length
        ? criarElemento(
            'ul',
            { class: 'danger-consequences' },
            consequencias.map((registro) => criarElemento('li', { text: registro })),
          )
        : null,
      criarElemento('label', { class: 'field-label', text: `Digite ${esperadoNome} para confirmar` }),
      entrada,
    ]);

    const rodape = criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close({ confirmed: false }) }),
      botaoConfirmar,
    ]);

    correspondenciaItem = modal({
      title: titulo,
      body: corpo,
      footer: rodape,
      size: 'md',
      onClose: (resultado) => resolver(resultado ?? { confirmed: false }),
    });
    entrada.focus();
  });
}

export function mostrarConflito({
  hint: dica,
  message: mensagem,
  detail: detalhe,
  onPrimary: aoPrincipal,
  primaryLabel: principalRotulo,
}) {
  const EXPLICACAO = {
    LAST_ADMIN_PROTECTED:
      'Esta empresa ficaria sem nenhum administrador ativo. Vincule ou reative outro administrador antes de continuar.',
    cnpj_already_exists: 'Já existe uma empresa cadastrada com este CNPJ.',
    auth_email_conflict:
      'Este e-mail já está vinculado a outra empresa. Um usuário pode ter vínculo ativo com apenas uma empresa.',
    USER_ALREADY_LINKED: 'Este usuário já possui vínculo ativo com outra empresa.',
    CONFLICT_STALE:
      'Outro administrador alterou este registro enquanto você editava. Recarregue para ver a versão atual.',
    IDEMPOTENCY_REUSE: 'Esta submissão já foi usada com outro conteúdo. Inicie um novo cadastro.',
    NOT_RETRYABLE: 'Esta operação exige intervenção manual e não pode ser repetida automaticamente.',
    CANNOT_BLOCK_SELF: 'Você não pode bloquear a própria conta.',
    LAST_PLATFORM_ADMIN_PROTECTED: 'A plataforma precisa manter ao menos um administrador ativo.',
    CONFLICT_ARCHIVED: 'Empresa arquivada não muda de estado. O arquivamento é definitivo.',
    CONFLICT_STATE: 'A empresa precisa estar arquivada antes da exclusão definitiva.',
    USER_NOT_ACTIVE:
      'A senha só pode ser alterada quando o vínculo da empresa e a conta global estão ativos.',
  };

  let empresasBloqueando = [];
  if (dica === 'LAST_ADMIN_PROTECTED' && detalhe) {
    try {
      empresasBloqueando = JSON.parse(detalhe);
    } catch {
      empresasBloqueando = [];
    }
  }

  const corpo = criarElemento('div', { class: 'conflict' }, [
    criarElemento('p', { class: 'conflict-explain', text: EXPLICACAO[dica] || mensagem }),
    empresasBloqueando.length
      ? criarElemento('div', {}, [
          criarElemento('p', { class: 'field-label', text: 'Empresas afetadas' }),
          criarElemento(
            'ul',
            { class: 'conflict-list' },
            empresasBloqueando.map((registro) =>
              criarElemento('li', { text: registro.tradeName || registro.companyId }),
            ),
          ),
        ])
      : null,
    criarElemento('p', { class: 'conflict-hint' }, ['Código: ', criarElemento('code', { text: dica })]),
  ]);

  let correspondenciaItem;
  const rodape = criarElemento('div', { class: 'modal-actions' }, [
    botao({ label: 'Entendi', onClick: () => correspondenciaItem.close() }),
    aoPrincipal
      ? botao({
          label: principalRotulo || 'Resolver',
          variant: 'primary',
          onClick: () => {
            correspondenciaItem.close();
            aoPrincipal();
          },
        })
      : null,
  ]);

  correspondenciaItem = modal({ title: 'Ação não concluída', body: corpo, footer: rodape });
  return correspondenciaItem;
}

export function linhaAdministrador(
  entrada,
  {
    onSuspendCompany: aoSuspendEmpresa,
    onRestoreCompany: aoRestaurarEmpresa,
    onBlockAccount: aoBloquearAccount,
    onUnblockAccount: aoUnblockAccount,
    onResendInvite: aoReenviarConvite,
  },
) {
  const {
    userId: usuarioIdentificador,
    fullName: nomeCompleto,
    companyId: empresaIdentificador,
    companyTradeName: empresaTradeNome,
    companyAccessActive: empresaAcessoAtivo,
    globalAccountActive: globalAccountAtivo,
    invite: convite,
    lastSeenAt: ultimoVistoEm,
  } = entrada;

  const escopoEmpresa = criarElemento('div', { class: 'scope-cell' }, [
    criarElemento('status-pill', {
      status: empresaAcessoAtivo ? 'active' : 'suspended',
      label: empresaAcessoAtivo ? 'Com acesso' : 'Acesso suspenso',
    }),
    criarElemento('span', {
      class: 'scope-caption',
      text: empresaAcessoAtivo
        ? `Acessa ${empresaTradeNome || 'esta empresa'}`
        : `Sem acesso a ${empresaTradeNome || 'esta empresa'}`,
    }),
    empresaAcessoAtivo
      ? botao({
          label: 'Suspender acesso',
          variant: 'ghost-danger',
          title: `Remove o acesso de ${nomeCompleto} apenas a ${empresaTradeNome}. A conta na plataforma continua ativa.`,
          onClick: () => aoSuspendEmpresa?.(entrada),
        })
      : botao({
          label: 'Restaurar acesso',
          variant: 'ghost',
          title: `Devolve o acesso de ${nomeCompleto} a ${empresaTradeNome}.`,
          onClick: () => aoRestaurarEmpresa?.(entrada),
        }),
  ]);

  const escopoPlataforma = criarElemento('div', { class: 'scope-cell' }, [
    criarElemento('status-pill', {
      status: globalAccountAtivo ? 'active' : 'failed',
      label: globalAccountAtivo ? 'Conta ativa' : 'Conta bloqueada',
    }),
    criarElemento('span', {
      class: 'scope-caption',
      text: globalAccountAtivo ? 'Pode entrar na plataforma' : 'Bloqueada em todas as empresas',
    }),
    globalAccountAtivo
      ? botao({
          label: 'Bloquear conta',
          variant: 'ghost-danger',
          title: `Bloqueia a conta de ${nomeCompleto} em TODAS as empresas da plataforma, não apenas nesta.`,
          onClick: () => aoBloquearAccount?.(entrada),
        })
      : botao({
          label: 'Desbloquear conta',
          variant: 'ghost',
          title: `Reativa a conta de ${nomeCompleto} na plataforma.`,
          onClick: () => aoUnblockAccount?.(entrada),
        }),
  ]);

  const celulaConvite = (() => {
    if (!convite) return criarElemento('span', { class: 'muted', text: '—' });

    const reenviarEm = ateRotulo(convite.resendAvailableAt);
    const etiquetaSituacao = criarElemento('status-pill', {
      status: convite.status,
      label:
        {
          pending: 'Convite pendente',
          accepted: 'Convite aceito',
          expired: 'Convite expirado',
          revoked: 'Convite revogado',
        }[convite.status] || convite.status,
    });

    const podeReenviar = convite.status !== 'accepted' && !reenviarEm;

    return criarElemento('div', { class: 'invite-cell' }, [
      etiquetaSituacao,
      convite.status === 'pending'
        ? criarElemento('span', {
            class: 'scope-caption',
            text: `Expira em ${formatarDadosHora(convite.expiresAt)}`,
          })
        : null,
      convite.status !== 'accepted'
        ? botao({
            label: 'Reenviar convite',
            variant: 'ghost',
            disabled: !podeReenviar,
            title: reenviarEm
              ? `Reenvio disponível em ${reenviarEm}`
              : 'Envia um novo convite e invalida o link anterior.',
            onClick: () => aoReenviarConvite?.(entrada),
          })
        : null,
    ]);
  })();

  return criarElemento(
    'tr',
    { class: 'admin-row', dataset: { userId: usuarioIdentificador, companyId: empresaIdentificador } },
    [
      criarElemento('td', {}, [
        criarElemento('div', { class: 'admin-identity' }, [
          criarElemento('span', { class: 'admin-name', text: nomeCompleto || '—' }),
          criarElemento('span', { class: 'admin-meta', text: empresaTradeNome || '' }),
        ]),
      ]),
      criarElemento('td', { class: 'col-scope' }, [escopoEmpresa]),
      criarElemento('td', { class: 'col-scope' }, [escopoPlataforma]),
      criarElemento('td', {}, [celulaConvite]),
      criarElemento('td', {
        class: 'col-meta',
        text: ultimoVistoEm ? formatarDadosHora(ultimoVistoEm) : 'Nunca acessou',
      }),
    ],
  );
}

export async function executarSuspensaoEmpresa(entrada, servicos, aoConcluir) {
  const confirmado = await confirmarAcaoDestrutiva({
    title: 'Suspender acesso à empresa',
    description:
      `${entrada.fullName} perderá o acesso a ${entrada.companyTradeName}. ` +
      'A conta na plataforma continua ativa e outros vínculos não são afetados.',
    expectedName: entrada.companyTradeName,
    confirmLabel: 'Suspender acesso',
    consequences: [
      `Escopo: apenas ${entrada.companyTradeName}.`,
      'A conta na plataforma permanece ativa.',
      'A ação pode ser revertida por "Restaurar acesso".',
    ],
  });
  if (!confirmado.confirmed) return;

  try {
    await servicos.admins.suspendCompanyAccess(entrada.companyId, entrada.userId);
    notificacao(`Acesso de ${entrada.fullName} a ${entrada.companyTradeName} suspenso.`, { tone: 'success' });
    aoConcluir?.();
  } catch (erro) {
    if (erro.isConflict) {
      mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
    } else {
      notificacao(erro.message || 'Não foi possível suspender o acesso.', { tone: 'danger' });
    }
  }
}

export async function executarBloqueioConta(entrada, servicos, aoConcluir) {
  const confirmado = await confirmarAcaoDestrutiva({
    title: 'Bloquear conta na plataforma',
    description:
      `${entrada.fullName} perderá o acesso a TODAS as empresas da plataforma, ` +
      'não apenas a esta. Use "Suspender acesso" se quiser afetar somente uma empresa.',
    expectedName: entrada.fullName,
    confirmLabel: 'Bloquear conta',
    consequences: [
      'Escopo: a plataforma inteira.',
      'Todos os vínculos com empresas deixam de funcionar.',
      'A pessoa não conseguirá entrar até o desbloqueio.',
    ],
  });
  if (!confirmado.confirmed) return;

  try {
    await servicos.admins.blockAccount(entrada.userId, null);
    notificacao(`Conta de ${entrada.fullName} bloqueada na plataforma.`, { tone: 'success' });
    aoConcluir?.();
  } catch (erro) {
    if (erro.isConflict) {
      mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
    } else {
      notificacao(erro.message || 'Não foi possível bloquear a conta.', { tone: 'danger' });
    }
  }
}

export async function executarAlteracaoSituacaoEmpresa(empresa, proximaSituacao, servicos, aoConcluir) {
  if (proximaSituacao === 'suspended') {
    const motivo = await escolherMotivoSuspensao();
    if (!motivo) return;

    const confirmado = await confirmarAcaoDestrutiva({
      title: 'Suspender empresa',
      description:
        `${empresa.tradeName} ficará suspensa. Os usuários da empresa perdem o acesso ` +
        'até a reativação. Nenhum dado é apagado.',
      expectedName: empresa.tradeName,
      confirmLabel: 'Suspender empresa',
      consequences: [
        `Motivo registrado: ${ROTULO_MOTIVO_SUSPENSAO[motivo]}.`,
        'Os dados da empresa permanecem intactos.',
        'A empresa pode ser reativada depois.',
      ],
    });
    if (!confirmado.confirmed) return;

    try {
      await servicos.companies.setStatus({
        companyId: empresa.id,
        status: 'suspended',
        reasonCode: motivo,
        confirmedName: confirmado.confirmedName,
      });
      notificacao(`${empresa.tradeName} suspensa.`, { tone: 'success' });
      aoConcluir?.();
    } catch (erro) {
      if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
      else notificacao(erro.message, { tone: 'danger' });
    }
    return;
  }

  if (proximaSituacao === 'archived') {
    const confirmado = await confirmarAcaoDestrutiva({
      title: 'Arquivar empresa',
      description:
        `${empresa.tradeName} será arquivada. Esta ação é DEFINITIVA: ` +
        'uma empresa arquivada não volta a ficar ativa nem suspensa.',
      expectedName: empresa.tradeName,
      confirmLabel: 'Arquivar definitivamente',
      consequences: [
        'A ação não pode ser desfeita.',
        'Os dados são preservados para auditoria, mas a empresa sai de operação.',
        'Nenhum dado é apagado fisicamente.',
      ],
    });
    if (!confirmado.confirmed) return;

    try {
      await servicos.companies.setStatus({
        companyId: empresa.id,
        status: 'archived',
        confirmedName: confirmado.confirmedName,
      });
      notificacao(`${empresa.tradeName} arquivada.`, { tone: 'success' });
      aoConcluir?.();
    } catch (erro) {
      if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
      else notificacao(erro.message, { tone: 'danger' });
    }
    return;
  }

  try {
    await servicos.companies.setStatus({ companyId: empresa.id, status: 'active' });
    notificacao(`${empresa.tradeName} reativada.`, { tone: 'success' });
    aoConcluir?.();
  } catch (erro) {
    if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
    else notificacao(erro.message, { tone: 'danger' });
  }
}

function escolherMotivoSuspensao() {
  return new Promise((resolver) => {
    let selecionado = null;
    let correspondenciaItem;

    const botaoConfirmar = botao({
      label: 'Continuar',
      variant: 'primary',
      disabled: true,
      onClick: () => correspondenciaItem.close(selecionado),
    });

    const opcoes = Object.entries(ROTULO_MOTIVO_SUSPENSAO).map(([valor, rotulo]) =>
      criarElemento('label', { class: 'radio-option' }, [
        criarElemento('input', {
          type: 'radio',
          name: 'suspension-reason',
          value: valor,
          onChange: () => {
            selecionado = valor;
            botaoConfirmar.disabled = false;
          },
        }),
        criarElemento('span', { text: rotulo }),
      ]),
    );

    const corpo = criarElemento('fieldset', { class: 'reason-picker' }, [
      criarElemento('legend', { class: 'field-label', text: 'Motivo da suspensão' }),
      ...opcoes,
    ]);

    const rodape = criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close(null) }),
      botaoConfirmar,
    ]);

    correspondenciaItem = modal({
      title: 'Motivo da suspensão',
      body: corpo,
      footer: rodape,
      onClose: (resultado) => resolver(resultado ?? null),
    });
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { confirmarAcaoDestrutiva as confirmDestructive };
export { mostrarConflito as showConflict };
export { executarSuspensaoEmpresa as runSuspendCompanyAccess };
export { executarBloqueioConta as runBlockAccount };
export { executarAlteracaoSituacaoEmpresa as runSetCompanyStatus };
