import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

export function abrirConclusaoManutencao(registro, aoConcluir) {
  const formulario = { totalCost: '', completionOdometerKm: '', supplierName: '', invoiceNumber: '' };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'mc8-cost',
      label: 'Custo total',
      required: true,
      control: criarElemento('input', {
        class: 'input',
        type: 'number',
        step: '.01',
        onInput: (evento) => (formulario.totalCost = evento.target.value),
      }),
    }),
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
          if (!formulario.totalCost) {
            notificacao('Informe o custo total.', { tone: 'warning' });
            return;
          }
          try {
            await dados.maintenance.complete(registro.id, formulario);
            correspondenciaItem.close();
            aoConcluir();
          } catch (erroCapturado) {
            notificacao(erroCapturado.message, { tone: 'danger' });
          }
        },
      }),
    ]),
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { abrirConclusaoManutencao as abrirConclusaoManutencaoV8 };
