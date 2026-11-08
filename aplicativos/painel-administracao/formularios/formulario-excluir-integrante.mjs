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
    description: `${membro.fullName} será removido de ${empresa.tradeName}. Se esta identidade não for usada em outro lugar da plataforma, a conta de login também será excluída.`,
    expectedName: identidade,
    confirmLabel: 'Excluir usuário',
    consequences: [
      'O vínculo com esta empresa será removido definitivamente.',
      'Se a conta for exclusiva desta empresa, o login no Supabase Auth também será apagado.',
      'O último administrador ativo da empresa continua protegido.',
    ],
  });
  if (!confirmado.confirmed) return;

  try {
    const resultado = await servicos.members.delete(empresa.id, membro.userId, confirmado.confirmedName);
    notificacao(
      resultado.authUserDeleted
        ? `${membro.fullName} e a conta de login foram excluídos.`
        : `${membro.fullName} foi removido da empresa. A conta global foi mantida.`,
      { tone: 'success' },
    );
    aoConcluir?.();
  } catch (erro) {
    if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
    else notificacao(erro.message || 'Não foi possível excluir o usuário.', { tone: 'danger' });
  }
}
