import {
  el as criarElemento,
  notificacao,
  modal,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { detalhe, rotuloAcao, ROTULO_RESULTADO_ACAO } from '../componentes/listas-resumos-e-detalhes.mjs';

export async function abrirDetalheAuditoria(identificador) {
  try {
    const evento = await servicos.audit.get(identificador);
    modal({
      title: 'Detalhes da ação',
      size: 'lg',
      body: criarElemento('div', { class: 'detail-grid' }, [
        detalhe('Quando', formatarDadosHora(evento.occurredAt)),
        detalhe('Ação', rotuloAcao(evento.action)),
        detalhe('Resultado', ROTULO_RESULTADO_ACAO[evento.result] || evento.result),
        detalhe('Alvo', `${evento.targetType || '—'} ${evento.targetId || ''}`),
        detalhe('Empresa', evento.companyId || '—'),
        detalhe('Operação', evento.operationId || '—'),
        detalhe('Requisição', evento.requestId || '—'),
        detalhe('IP', evento.ipAddress || '—'),
        criarElemento('details', { class: 'detail-item' }, [
          criarElemento('summary', { text: 'Dados técnicos' }),
          detalhe('Código da ação', evento.action),
          criarElemento('pre', {}, [
            criarElemento('code', { text: JSON.stringify(evento.metadata, null, 2) }),
          ]),
        ]),
      ]),
    });
  } catch (erro) {
    notificacao(erro.message, { tone: 'danger' });
  }
}
