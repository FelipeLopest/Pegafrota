import { dataHoraEmpresa, instanteEmpresa, numeroInformado } from './apoio-operacoes.mjs';
import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

export function abrirConclusaoManutencao(registro, aoConcluir) {
  const formulario = {
    totalCost: '',
    completionOdometerKm: '',
    supplierName: '',
    invoiceNumber: '',
    noChargeReason: '',
    completedAt: '',
  };
  let correspondenciaItem;
  let ocupado = false;
  const data = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(),
  });
  const justificativa = campo({
    id: 'mc-motivo-zero',
    label: 'Motivo de não haver cobrança',
    control: criarElemento('input', {
      class: 'input',
      onInput: (evento) => (formulario.noChargeReason = evento.target.value),
    }),
  });
  justificativa.hidden = true;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'mc-data',
      label: 'Data e hora reais da conclusão',
      required: true,
      control: data,
    }),
    campo({
      id: 'mc8-cost',
      label: 'Custo total',
      required: true,
      control: criarElemento('input', {
        class: 'input',
        type: 'number',
        step: '.01',
        onInput: (evento) => {
          formulario.totalCost = evento.target.value;
          justificativa.hidden = formulario.totalCost === '' || Number(formulario.totalCost) !== 0;
        },
      }),
    }),
    justificativa,
    campo({
      id: 'mc8-odo',
      label: 'Odômetro na conclusão',
      control: criarElemento('input', {
        class: 'input',
        type: 'number',
        onInput: (evento) => (formulario.completionOdometerKm = evento.target.value),
      }),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'mc8-s',
        label: 'Fornecedor',
        control: criarElemento('input', {
          class: 'input',
          onInput: (evento) => (formulario.supplierName = evento.target.value),
        }),
      }),
      campo({
        id: 'mc8-i',
        label: 'Nota fiscal',
        control: criarElemento('input', {
          class: 'input',
          onInput: (evento) => (formulario.invoiceNumber = evento.target.value),
        }),
      }),
    ]),
  ]);
  correspondenciaItem = modal({
    title: 'Concluir manutenção',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({
        label: 'Concluir',
        variant: 'primary',
        onClick: async () => {
          if (ocupado) return;
          if (formulario.totalCost === '') {
            notificacao('Informe o custo total.', { tone: 'warning' });
            return;
          }
          try {
            numeroInformado(formulario.totalCost, 'custo');
            if (Number(formulario.totalCost) === 0 && formulario.noChargeReason.trim().length < 10)
              throw new Error(
                'Informe o motivo do serviço sem cobrança (ao menos dez caracteres).',
              );
            formulario.completedAt = instanteEmpresa(data.value);
            ocupado = true;
            const resultado = await dados.maintenance.complete(registro.id, formulario);
            if (resultado?.nextMaintenanceId)
              notificacao('Serviço concluído. Próxima revisão calculada.', {
                tone: 'success',
              });
            correspondenciaItem.close();
            aoConcluir();
          } catch (erroCapturado) {
            notificacao(erroCapturado.message, { tone: 'danger' });
          } finally {
            ocupado = false;
          }
        },
      }),
    ]),
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { abrirConclusaoManutencao as abrirConclusaoManutencaoV8 };
