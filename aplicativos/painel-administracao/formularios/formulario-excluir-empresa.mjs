import { notificacao } from '../componentes/componentes-do-painel.mjs';

import {
  showConflict as mostrarConflito,
  confirmDestructive as confirmarAcaoDestrutiva,
} from './confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';

export async function excluirEmpresaDefinitivamente(empresa) {
  const confirmado = await confirmarAcaoDestrutiva({
    title: 'Excluir empresa definitivamente',
    description: `${empresa.tradeName} e todos os dados operacionais do tenant serão apagados. Esta operação não pode ser desfeita.`,
    expectedName: empresa.tradeName,
    confirmLabel: 'Excluir definitivamente',
    consequences: [
      'Veículos, motoristas, viagens, abastecimentos, manutenções, locais, OCR e movimentações serão excluídos.',
      'Usuários exclusivos desta empresa terão a conta de login removida.',
      'A auditoria operacional do tenant será apagada; a trilha global da plataforma preserva apenas o registro saneado da exclusão.',
    ],
  });
  if (!confirmado.confirmed) return;

  try {
    const resultado = await servicos.companies.deletePermanently(empresa.id, confirmado.confirmedName);
    const falhas = Number(resultado?.authCleanup?.failed || 0);
    notificacao(
      falhas
        ? `Empresa excluída. ${falhas} conta(s) de autenticação não puderam ser removidas e ficaram sem vínculo.`
        : `${empresa.tradeName} foi excluída definitivamente.`,
      { tone: falhas ? 'warning' : 'success' },
    );
    navegar('/empresas');
  } catch (erro) {
    if (erro.isConflict || erro.hint === 'CONFIRMATION_MISMATCH') {
      mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
    } else {
      notificacao(erro.message || 'Não foi possível excluir a empresa.', { tone: 'danger' });
    }
  }
}
