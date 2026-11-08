import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { TIPOS_COMBUSTIVEL_BOMBA } from '@peganafrota/contracts';

export function abrirFormularioAbastecimento({ vehicles: veiculos, onDone: aoConcluir }) {
  const formulario = {
    vehicleId: '',
    fuelType: '',
    liters: '',
    pricePerLiter: '',
    odometerKm: '',
    stationName: '',
  };
  let correspondenciaItem;
  const total = criarElemento('p', { class: 'field-hint', text: 'Total estimado: —' });
  const recalcular = () => {
    const veiculoItem = Number(formulario.liters) * Number(formulario.pricePerLiter);
    total.textContent =
      Number.isFinite(veiculoItem) && veiculoItem > 0
        ? `Total estimado: ${formatar.money(veiculoItem)}`
        : 'Total estimado: —';
  };
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'fv8-v',
      label: 'Veículo',
      required: true,
      control: criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => {
            formulario.vehicleId = evento.target.value;
            const veiculoItem = veiculos.find((itemComparado) => itemComparado.id === formulario.vehicleId);
            if (veiculoItem) formulario.odometerKm = String(veiculoItem.current_odometer_km ?? '');
          },
        },
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
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'fv8-f',
        label: 'Produto',
        required: true,
        control: criarElemento(
          'select',
          {
            class: 'select',
            onChange: (evento) => {
              formulario.fuelType = evento.target.value;
            },
          },
          [
            criarElemento('option', { value: '', text: 'Selecione' }),
            ...TIPOS_COMBUSTIVEL_BOMBA.map((itemComparado) =>
              criarElemento('option', { value: itemComparado.value, text: itemComparado.label }),
            ),
          ],
        ),
      }),
      campo({
        id: 'fv8-s',
        label: 'Posto',
        control: criarElemento('input', {
          class: 'input',
          onInput: (evento) => {
            formulario.stationName = evento.target.value;
          },
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'fv8-l',
        label: 'Litros',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          step: '.001',
          onInput: (evento) => {
            formulario.liters = evento.target.value;
            recalcular();
          },
        }),
      }),
      campo({
        id: 'fv8-p',
        label: 'Preço por litro',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          step: '.001',
          onInput: (evento) => {
            formulario.pricePerLiter = evento.target.value;
            recalcular();
          },
        }),
      }),
      campo({
        id: 'fv8-o',
        label: 'Odômetro',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          onInput: (evento) => {
            formulario.odometerKm = evento.target.value;
          },
        }),
      }),
    ]),
    total,
  ]);
  correspondenciaItem = modal({
    title: 'Registrar abastecimento',
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({
        label: 'Registrar',
        variant: 'primary',
        onClick: async () => {
          if (
            !formulario.vehicleId ||
            !formulario.fuelType ||
            Number(formulario.liters) <= 0 ||
            Number(formulario.pricePerLiter) <= 0 ||
            Number(formulario.odometerKm) < 0
          ) {
            notificacao('Preencha veículo, produto, litros, preço e odômetro.', { tone: 'warning' });
            return;
          }
          try {
            await dados.fuelings.create(formulario);
            correspondenciaItem.close();
            notificacao('Abastecimento registrado.', { tone: 'success' });
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
export { abrirFormularioAbastecimento as abrirModalAbastecimentoV8 };
