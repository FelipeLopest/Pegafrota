import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { dataHoraEmpresa, instanteEmpresa, numeroInformado } from './apoio-operacoes.mjs';

export function abrirOperacaoViagem({
  trip: viagem,
  vehicle: veiculo,
  action: acao,
  locations: locais = [],
  onDone: aoConcluir,
}) {
  const inicio = acao === 'start',
    interromper = acao === 'interrupt';
  const titulo = inicio
    ? 'Iniciar viagem'
    : interromper
      ? 'Encerrar viagem interrompida'
      : 'Concluir viagem';
  const formulario = {
    tripId: viagem.id,
    action: acao,
    odometerKm: '',
    occurredAt: '',
    locationId: '',
    reason: '',
  };
  let janela;
  let ocupado = false;
  const km = criarElemento('input', {
    class: 'input',
    type: 'number',
    min: '0',
    step: '.1',
    onInput: (evento) => (formulario.odometerKm = evento.target.value),
  });
  const data = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(),
  });
  const local = criarElemento(
    'select',
    {
      class: 'select',
      onChange: (evento) => (formulario.locationId = evento.target.value),
    },
    [
      criarElemento('option', { value: '', text: 'Selecione a base' }),
      ...locais
        .filter((item) => item.active && !item.archived_at)
        .map((item) => criarElemento('option', { value: item.id, text: item.name })),
    ],
  );
  const areaLocal = campo({
    id: 'tv-op-local',
    label: 'Base da portaria',
    control: local,
  });
  areaLocal.hidden = true;
  const integrar = criarElemento('input', {
    type: 'checkbox',
    onChange: (evento) => {
      areaLocal.hidden = !evento.target.checked;
      if (!evento.target.checked) {
        formulario.locationId = '';
        local.value = '';
      }
    },
  });
  const corpo = criarElemento('div', {}, [
    criarElemento('p', {
      class: 'muted',
      text: `${veiculo?.plate || ''} · ${viagem.origin_label} → ${viagem.destination_label}`,
    }),
    criarElemento('p', {
      class: 'field-hint',
      text: `Última leitura do veículo: ${formatar.km(veiculo?.current_odometer_km)}${!inicio ? `. Saída desta viagem: ${formatar.km(viagem.start_odometer_km)}` : ''}. Informe a leitura real.`,
    }),
    campo({
      id: 'odo-action',
      label: inicio ? 'Odômetro de saída' : 'Odômetro de retorno',
      required: true,
      control: km,
    }),
    campo({
      id: 'tv-op-data',
      label: inicio ? 'Data e hora da saída' : 'Data e hora do retorno',
      required: true,
      control: data,
    }),
    interromper
      ? campo({
          id: 'tv-op-motivo',
          label: 'Motivo da interrupção',
          required: true,
          hint: 'A saída, o percurso e o motivo permanecerão no histórico.',
          control: criarElemento('textarea', {
            class: 'textarea',
            rows: '2',
            onInput: (evento) => (formulario.reason = evento.target.value),
          }),
        })
      : null,
    locais.length
      ? criarElemento('label', { class: 'auth-remember' }, [
          integrar,
          `Registrar também ${inicio ? 'saída' : 'entrada'} na portaria`,
        ])
      : null,
    areaLocal,
    criarElemento('p', {
      class: 'field-hint',
      text: 'A movimentação de portaria é opcional. Use somente se o veículo realmente passou por essa base.',
    }),
  ]);
  const salvar = botao({
    label: 'Confirmar',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      try {
        numeroInformado(formulario.odometerKm, 'odômetro');
        formulario.occurredAt = instanteEmpresa(data.value);
        if (interromper && formulario.reason.trim().length < 10)
          throw new Error('Informe um motivo com pelo menos 10 caracteres.');
        if (integrar.checked && !formulario.locationId)
          throw new Error('Selecione a base para registrar a passagem.');
        if (
          Number(formulario.odometerKm) <
          Number(inicio ? veiculo?.current_odometer_km : viagem.start_odometer_km)
        )
          throw new Error('A leitura é menor que a referência da operação. Confira o valor.');
        ocupado = true;
        salvar.disabled = true;
        await dados.trips.operate(formulario);
        janela.close();
        notificacao(`${titulo}: operação registrada.`, { tone: 'success' });
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
    title: titulo,
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => janela.close() }),
      salvar,
    ]),
  });
}
