import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { empresaLocalParaIso } from '../componentes/listas-resumos-e-detalhes.mjs';

export function abrirAgendamentoManutencao({ vehicles: veiculos, onDone: aoConcluir }) {
  const formulario = {
    vehicleId: '',
    maintenanceType: 'preventive',
    description: '',
    scheduledFor: '',
    scheduledOdometerKm: '',
  };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'ms-v',
      label: 'Veículo',
      required: true,
      control: criarElemento(
        'select',
        { class: 'select', onChange: (evento) => (formulario.vehicleId = evento.target.value) },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...veiculos.map((veiculoItem) =>
            criarElemento('option', {
              value: veiculoItem.id,
              text: `${veiculoItem.plate} — ${veiculoItem.brand} ${veiculoItem.model}`,
            }),
          ),
        ],
      ),
    }),
    campo({
      id: 'ms-t',
      label: 'Tipo',
      control: criarElemento(
        'select',
        { class: 'select', onChange: (evento) => (formulario.maintenanceType = evento.target.value) },
        [
          criarElemento('option', { value: 'preventive', text: 'Preventiva' }),
          criarElemento('option', { value: 'corrective', text: 'Corretiva' }),
        ],
      ),
    }),
    campo({
      id: 'ms-d',
      label: 'Descrição',
      required: true,
      control: criarElemento('textarea', {
        class: 'textarea',
        rows: '3',
        onInput: (evento) => (formulario.description = evento.target.value),
      }),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'ms-date',
        label: 'Agendada para',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          type: 'datetime-local',
          onInput: (evento) =>
            (formulario.scheduledFor = evento.target.value ? empresaLocalParaIso(evento.target.value) : ''),
        }),
      }),
      campo({
        id: 'ms-o',
        label: 'Odômetro previsto',
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          onInput: (evento) => (formulario.scheduledOdometerKm = evento.target.value),
        }),
      }),
    ]),
  ]);
  const salvar = async () => {
    if (!formulario.vehicleId || !formulario.description.trim() || !formulario.scheduledFor) {
      notificacao('Preencha veículo, descrição e data.', { tone: 'warning' });
      return;
    }
    try {
      await dados.maintenance.schedule(formulario);
      correspondenciaItem.close();
      aoConcluir();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    }
  };
  correspondenciaItem = modal({
    title: 'Agendar manutenção',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Agendar', variant: 'primary', onClick: salvar }),
    ]),
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { abrirAgendamentoManutencao as abrirAgendamentoManutencaoV8 };
