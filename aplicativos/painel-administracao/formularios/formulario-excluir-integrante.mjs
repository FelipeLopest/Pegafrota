import { notificacao } from '../componentes/componentes-do-painel.mjs';

import {
  showConflict as mostrarConflito,
  confirmDestructive as confirmarAcaoDestrutiva,
} from './confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

export async function excluirMembroEmpresa(empresa, membro, aoConcluir) {
  const identidade = membro.email || membro.fullName;
  const confirmado = await confirmarAcaoDestrutiva({
    title: 'Excluir usuário da empresa',
    description: `${membro.fullName} perderá o acesso a ${empresa.tradeName}.`,
    expectedName: identidade,
    confirmLabel: 'Excluir usuário',
    consequences: [
      'Se houver autoria nos registros da empresa, o vínculo ficará inativo para manter o histórico válido.',
      'Contas com outros vínculos ou com autoria no histórico operacional serão preservadas.',
      'Contas exclusivas sem essas dependências terão o login excluído.',
      'O último administrador ativo da empresa continua protegido.',
    ],
  });
  if (!confirmado.confirmed) return;

  try {
    const resultado = await servicos.members.delete(
      empresa.id,
      membro.userId,
      confirmado.confirmedName,
    );
    notificacao(
      resultado.authUserDeleted
        ? `${membro.fullName} e a conta de login foram excluídos.`
        : `${membro.fullName} perdeu o acesso a ${empresa.tradeName}. ${resultado.accountRetainedReason || 'A conta de login foi mantida.'}`,
      { tone: 'success' },
    );
    aoConcluir?.();
  } catch (erro) {
    if (erro.isConflict || erro.hint === 'CONFIRMATION_MISMATCH')
      mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
    else notificacao(erro.message || 'Não foi possível excluir o usuário.', { tone: 'danger' });
  }
}
