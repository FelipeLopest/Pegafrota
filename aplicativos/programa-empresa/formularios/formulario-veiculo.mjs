import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { TIPOS_COMBUSTIVEL_VEICULO } from '@peganafrota/contracts';

export function abrirEditorVeiculo({ vehicle: veiculo, onDone: aoConcluir }) {
  const editar = !!veiculo;
  const formulario = {
    plate: veiculo?.plate || '',
    brand: veiculo?.brand || '',
    model: veiculo?.model || '',
    modelYear: veiculo?.model_year || '',
    fuelType: veiculo?.fuel_type || '',
    color: veiculo?.color || '',
    category: veiculo?.category || '',
    tankCapacityL: veiculo?.tank_capacity_l || '',
    notes: veiculo?.notes || '',
    initialOdometerKm: '',
  };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 've-plate',
      label: 'Placa',
      required: true,
      hint: editar ? 'A placa não pode ser alterada.' : 'Identidade permanente do veículo.',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.plate,
        disabled: editar,
        onInput: (evento) => (formulario.plate = evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')),
      }),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 've-brand',
        label: 'Marca',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          value: formulario.brand,
          onInput: (evento) => (formulario.brand = evento.target.value),
        }),
      }),
      campo({
        id: 've-model',
        label: 'Modelo',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          value: formulario.model,
          onInput: (evento) => (formulario.model = evento.target.value),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 've-year',
        label: 'Ano',
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          value: formulario.modelYear,
          onInput: (evento) => (formulario.modelYear = evento.target.value),
        }),
      }),
      campo({
        id: 've-fuel',
        label: 'Combustível',
        required: true,
        control: criarElemento(
          'select',
          { class: 'select', onChange: (evento) => (formulario.fuelType = evento.target.value) },
          [
            criarElemento('option', { value: '', text: 'Selecione' }),
            ...TIPOS_COMBUSTIVEL_VEICULO.map((formulario2) =>
              criarElemento('option', {
                value: formulario2.value,
                text: formulario2.label,
                selected: formulario2.value === formulario.fuelType,
              }),
            ),
          ],
        ),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 've-color',
        label: 'Cor',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.color,
          onInput: (evento) => (formulario.color = evento.target.value),
        }),
      }),
      campo({
        id: 've-cat',
        label: 'Categoria',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.category,
          onInput: (evento) => (formulario.category = evento.target.value),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 've-tank',
        label: 'Capacidade do tanque (L)',
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          min: '0',
          step: '.1',
          value: formulario.tankCapacityL,
          onInput: (evento) => (formulario.tankCapacityL = evento.target.value),
        }),
      }),
      !editar
        ? campo({
            id: 've-odo',
            label: 'Odômetro inicial',
            control: criarElemento('input', {
              class: 'input',
              type: 'number',
              min: '0',
              value: formulario.initialOdometerKm,
              onInput: (evento) => (formulario.initialOdometerKm = evento.target.value),
            }),
          })
        : criarElemento('div', { class: 'field-spacer', 'aria-hidden': 'true' }),
    ]),
    campo({
      id: 've-notes',
      label: 'Observações',
      control: criarElemento(
        'textarea',
        { class: 'textarea', rows: '2', onInput: (evento) => (formulario.notes = evento.target.value) },
        [formulario.notes],
      ),
    }),
  ]);
  const salvar = async () => {
    if (
      !formulario.brand.trim() ||
      !formulario.model.trim() ||
      !formulario.fuelType ||
      (!editar && !formulario.plate.trim())
    ) {
      notificacao('Preencha placa, marca, modelo e combustível.', { tone: 'warning' });
      return;
    }
    try {
      if (editar)
        await dados.vehicles.update(veiculo.id, {
          brand: formulario.brand,
          model: formulario.model,
          modelYear: formulario.modelYear,
          fuelType: formulario.fuelType,
          color: formulario.color,
          category: formulario.category,
          tankCapacityL: formulario.tankCapacityL,
          notes: formulario.notes,
        });
      else await dados.vehicles.create(formulario);
      correspondenciaItem.close();
      notificacao(editar ? 'Veículo atualizado.' : 'Veículo cadastrado.', { tone: 'success' });
      aoConcluir?.();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    }
  };
  correspondenciaItem = modal({
    title: editar ? `Editar ${veiculo.plate}` : 'Novo veículo',
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Salvar', variant: 'primary', onClick: salvar }),
    ]),
  });
}
