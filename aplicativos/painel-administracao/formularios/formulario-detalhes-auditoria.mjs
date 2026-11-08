import {
  el as criarElemento,
  notificacao,
  modal,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { detalhe } from '../componentes/listas-resumos-e-detalhes.mjs';

export async function abrirDetalheAuditoria(identificador) {
  try {
    const evento = await servicos.audit.get(identificador);
    modal({
      title: 'Evento de auditoria',
      size: 'lg',
      body: criarElemento('div', { class: 'detail-grid' }, [
        detalhe('Quando', formatarDadosHora(evento.occurredAt)),
        detalhe('Ação', evento.action),
        detalhe('Resultado', evento.result),
        detalhe('Alvo', `${evento.targetType || '—'} ${evento.targetId || ''}`),
        detalhe('Empresa', evento.companyId || '—'),
        detalhe('Operação', evento.operationId || '—'),
        detalhe('Requisição', evento.requestId || '—'),
        detalhe('IP', evento.ipAddress || '—'),
        criarElemento('div', { class: 'detail-item' }, [
          criarElemento('p', { class: 'detail-label', text: 'Metadados' }),
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
