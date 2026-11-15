import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { dataHoraEmpresa, instanteEmpresa } from './apoio-operacoes.mjs';

export function abrirFormularioViagem({
  vehicles: veiculos,
  drivers: motoristas,
  trip: viagem = null,
  vehicleId = '',
  locations: locais = [],
  history: historico = [],
  onDone: aoConcluir,
}) {
  const formulario = {
    id: viagem?.id || null,
    vehicleId: viagem?.vehicle_id || vehicleId,
    driverId: viagem?.driver_id || '',
    originLabel: viagem?.origin_label || '',
    destinationLabel: viagem?.destination_label || '',
    plannedDepartureAt: viagem?.planned_departure_at || '',
    plannedReturnAt: viagem?.planned_return_at || '',
    purpose: viagem?.purpose || '',
    notes: viagem?.notes || '',
  };
  let janela;
  let ocupado = false;
  const entrada = (id, chave, rotulo) =>
    campo({
      id,
      label: rotulo,
      required: true,
      control: criarElemento('input', {
        class: 'input',
        list: 'rotas-conhecidas',
        value: formulario[chave],
        onInput: (evento) => (formulario[chave] = evento.target.value),
      }),
    });
  const partida = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(formulario.plannedDepartureAt),
  });
  const retorno = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(formulario.plannedReturnAt),
  });
  const corpo = criarElemento('div', {}, [
    criarElemento('p', {
      class: 'field-hint',
      text: 'Planejar não ocupa o veículo. A disponibilidade do veículo e do motorista será conferida novamente ao iniciar.',
    }),
    campo({
      id: 'tv-v',
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
          ...veiculos
            .filter((item) => !item.archived_at && item.status !== 'inactive')
            .map((item) =>
              criarElemento('option', {
                value: item.id,
                selected: item.id === formulario.vehicleId,
                text: `${item.plate} — ${item.brand} ${item.model}`,
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
        {
          class: 'select',
          onChange: (evento) => (formulario.driverId = evento.target.value),
        },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...motoristas
            .filter((item) => item.active && !item.archived_at)
            .map((item) =>
              criarElemento('option', {
                value: item.id,
                selected: item.id === formulario.driverId,
                text: item.full_name,
              }),
            ),
        ],
      ),
    }),
    criarElemento('div', { class: 'form-row' }, [
      entrada('tv-o', 'originLabel', 'Origem'),
      entrada('tv-dst', 'destinationLabel', 'Destino'),
    ]),
    criarElemento(
      'datalist',
      { id: 'rotas-conhecidas' },
      [
        ...new Set(
          [
            ...locais.map((item) => item.name),
            ...historico.flatMap((item) => [item.origin_label, item.destination_label]),
          ].filter(Boolean),
        ),
      ]
        .slice(0, 80)
        .map((nome) => criarElemento('option', { value: nome })),
    ),
    criarElemento('div', { class: 'form-row' }, [
      campo({ id: 'tv-pd', label: 'Saída prevista', control: partida }),
      campo({ id: 'tv-pr', label: 'Retorno previsto', control: retorno }),
    ]),
    campo({
      id: 'tv-purpose',
      label: 'Finalidade (opcional)',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.purpose,
        onInput: (evento) => (formulario.purpose = evento.target.value),
      }),
    }),
    campo({
      id: 'tv-notas',
      label: 'Observação',
      control: criarElemento('textarea', {
        class: 'textarea',
        rows: '2',
        value: formulario.notes,
        onInput: (evento) => (formulario.notes = evento.target.value),
      }),
    }),
  ]);
  const salvar = botao({
    label: viagem ? 'Salvar planejamento' : 'Criar viagem',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      try {
        if (
          !formulario.vehicleId ||
          !formulario.driverId ||
          !formulario.originLabel.trim() ||
          !formulario.destinationLabel.trim()
        )
          throw new Error('Preencha veículo, motorista, origem e destino.');
        formulario.plannedDepartureAt = partida.value ? instanteEmpresa(partida.value) : '';
        formulario.plannedReturnAt = retorno.value ? instanteEmpresa(retorno.value) : '';
        if (
          formulario.plannedDepartureAt &&
          formulario.plannedReturnAt &&
          Date.parse(formulario.plannedReturnAt) <= Date.parse(formulario.plannedDepartureAt)
        )
          throw new Error('O retorno previsto deve ser posterior à saída.');
        ocupado = true;
        salvar.disabled = true;
        await dados.trips.create(formulario);
        janela.close();
        notificacao(viagem ? 'Planejamento atualizado.' : 'Viagem planejada.', {
          tone: 'success',
        });
        aoConcluir?.();
      } catch (erro) {
        notificacao(erro.message, { tone: 'danger' });
      } finally {
        ocupado = false;
        salvar.disabled = false;
      }
    },
  });
  janela = modal({
    title: viagem ? 'Editar planejamento' : 'Nova viagem',
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => janela.close() }),
      salvar,
    ]),
  });
}
export { abrirFormularioViagem as abrirModalViagemV8 };
