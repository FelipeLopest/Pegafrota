import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { empresaLocalParaIso } from '../componentes/listas-resumos-e-detalhes.mjs';

export function abrirFormularioViagem({ vehicles: veiculos, drivers: motoristas, onDone: aoConcluir }) {
  const formulario = {
    vehicleId: '',
    driverId: '',
    originLabel: '',
    destinationLabel: '',
    plannedDepartureAt: '',
    plannedReturnAt: '',
  };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'tv-v',
      label: 'Veículo disponível',
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
      id: 'tv-d',
      label: 'Motorista ativo',
      required: true,
      control: criarElemento(
        'select',
        { class: 'select', onChange: (evento) => (formulario.driverId = evento.target.value) },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...motoristas.map((dadosRegistro) =>
            criarElemento('option', { value: dadosRegistro.id, text: dadosRegistro.full_name }),
          ),
        ],
      ),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'tv-o',
        label: 'Origem',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          onInput: (evento) => (formulario.originLabel = evento.target.value),
        }),
      }),
      campo({
        id: 'tv-dst',
        label: 'Destino',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          onInput: (evento) => (formulario.destinationLabel = evento.target.value),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'tv-pd',
        label: 'Saída prevista',
        control: criarElemento('input', {
          class: 'input',
          type: 'datetime-local',
          onInput: (evento) =>
            (formulario.plannedDepartureAt = evento.target.value
              ? empresaLocalParaIso(evento.target.value)
              : ''),
        }),
      }),
      campo({
        id: 'tv-pr',
        label: 'Retorno previsto',
        control: criarElemento('input', {
          class: 'input',
          type: 'datetime-local',
          onInput: (evento) =>
            (formulario.plannedReturnAt = evento.target.value
              ? empresaLocalParaIso(evento.target.value)
              : ''),
        }),
      }),
    ]),
  ]);
  const salvar = async () => {
    if (
      !formulario.vehicleId ||
      !formulario.driverId ||
      !formulario.originLabel.trim() ||
      !formulario.destinationLabel.trim()
    ) {
      notificacao('Preencha veículo, motorista, origem e destino.', { tone: 'warning' });
      return;
    }
    try {
      await dados.trips.create(formulario);
      correspondenciaItem.close();
      notificacao('Viagem criada.', { tone: 'success' });
      aoConcluir();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    }
  };
  correspondenciaItem = modal({
    title: 'Nova viagem',
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Criar viagem', variant: 'primary', onClick: salvar }),
    ]),
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { abrirFormularioViagem as abrirModalViagemV8 };
