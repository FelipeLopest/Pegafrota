import { numeroInformado } from './apoio-operacoes.mjs';
import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { empresaLocalParaIso } from '../componentes/listas-resumos-e-detalhes.mjs';

export function abrirAgendamentoManutencao({
  vehicles: veiculos,
  vehicleId = '',
  historico = [],
  onDone: aoConcluir,
}) {
  const formulario = {
    vehicleId,
    maintenanceType: 'preventive',
    description: '',
    scheduledFor: '',
    scheduledOdometerKm: '',
    intervalDays: '',
    intervalKm: '',
    supplierName: '',
  };
  let correspondenciaItem;
  let ocupado = false;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'ms-v',
      label: 'Veículo',
      required: true,
      control: criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => (formulario.vehicleId = evento.target.value),
        },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...veiculos.map((veiculoItem) =>
            criarElemento('option', {
              value: veiculoItem.id,
              selected: veiculoItem.id === vehicleId,
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
        {
          class: 'select',
          onChange: (evento) => (formulario.maintenanceType = evento.target.value),
        },
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
        control: criarElemento('input', {
          class: 'input',
          type: 'datetime-local',
          onInput: (evento) =>
            (formulario.scheduledFor = evento.target.value
              ? empresaLocalParaIso(evento.target.value)
              : ''),
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
    criarElemento('p', {
      class: 'field-hint',
      text: 'Informe data, quilometragem ou intervalo. Quando os dois limites forem informados, vale o primeiro atingido.',
    }),
    campo({
      id: 'ms-fornecedor',
      label: 'Fornecedor',
      control: criarElemento('input', {
        class: 'input',
        list: 'fornecedores-recentes',
        onInput: (evento) => (formulario.supplierName = evento.target.value),
      }),
    }),
    criarElemento(
      'datalist',
      { id: 'fornecedores-recentes' },
      [...new Set(historico.map((item) => item.supplier_name).filter(Boolean))]
        .slice(0, 30)
        .map((nome) => criarElemento('option', { value: nome })),
    ),
    criarElemento('details', {}, [
      criarElemento('summary', { text: 'Repetir preventiva (opcional)' }),
      criarElemento('div', { class: 'form-row' }, [
        campo({
          id: 'ms-intervalo-dias',
          label: 'A cada quantos dias?',
          control: criarElemento('input', {
            class: 'input',
            type: 'number',
            min: '1',
            max: '3650',
            onInput: (evento) => (formulario.intervalDays = evento.target.value),
          }),
        }),
        campo({
          id: 'ms-intervalo-km',
          label: 'A cada quantos km?',
          control: criarElemento('input', {
            class: 'input',
            type: 'number',
            min: '1',
            onInput: (evento) => (formulario.intervalKm = evento.target.value),
          }),
        }),
      ]),
      criarElemento('p', {
        class: 'muted',
        text: 'Ao concluir o serviço, o sistema calcula a próxima revisão usando a data e a leitura reais.',
      }),
    ]),
  ]);
  const salvar = async () => {
    if (ocupado) return;
    if (
      !formulario.vehicleId ||
      !formulario.description.trim() ||
      (!formulario.scheduledFor &&
        !formulario.scheduledOdometerKm &&
        !formulario.intervalDays &&
        !formulario.intervalKm)
    ) {
      notificacao('Informe veículo, descrição e pelo menos um limite ou intervalo.', {
        tone: 'warning',
      });
      return;
    }
    try {
      for (const chave of ['intervalDays', 'intervalKm'])
        if (formulario[chave]) numeroInformado(formulario[chave], 'intervalo', 1);
      if (formulario.intervalDays && !Number.isInteger(Number(formulario.intervalDays)))
        throw new Error('Use dias inteiros.');
      ocupado = true;
      await dados.maintenance.schedule(formulario);
      correspondenciaItem.close();
      aoConcluir();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    } finally {
      ocupado = false;
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
