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
      'Contas usadas somente nesta empresa serão excluídas quando não houver vínculos nem autoria a preservar em outros registros.',
      'A auditoria operacional do tenant será apagada; a trilha global da plataforma preserva apenas o registro saneado da exclusão.',
    ],
  });
  if (!confirmado.confirmed) return;

  try {
    const resultado = await servicos.companies.deletePermanently(
      empresa.id,
      confirmado.confirmedName,
    );
    const falhas = Number(resultado?.authCleanup?.failed || 0);
    const contasMantidas = Number(resultado?.authCleanup?.retained || 0);
    const resumo = [`${empresa.tradeName} foi excluída definitivamente.`];
    if (contasMantidas === 1) resumo.push('Uma conta de login foi preservada.');
    else if (contasMantidas > 1) resumo.push(`${contasMantidas} contas de login foram preservadas.`);
    if (falhas === 1) resumo.push('Uma conta de login ficou sem vínculo após falha na remoção.');
    else if (falhas > 1) resumo.push(`${falhas} contas de login ficaram sem vínculo após falha na remoção.`);
    notificacao(
      resumo.join(' '),
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
