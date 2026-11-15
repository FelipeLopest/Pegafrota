import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { veiculosAtivos } from '../componentes/listas-resumos-e-detalhes.mjs';
import { dataHoraEmpresa, instanteEmpresa } from './apoio-operacoes.mjs';

export function abrirFormularioMovimentacao({
  vehicle: veiculo,
  vehicles: veiculos = [],
  locations: locais = [],
  initial: inicial = false,
  onDone: aoConcluir,
}) {
  const lista = veiculo ? [veiculo] : veiculosAtivos(veiculos);
  const ativos = locais.filter((item) => item.active && !item.archived_at);
  const formulario = {
    vehicleId: veiculo?.id || '',
    locationId: veiculo?.locationId || (ativos.length === 1 ? ativos[0]?.id || '' : ''),
    notes: '',
    reason: '',
    direction: veiculo?.presence === 'inside' ? 'exit' : 'entry',
    presence: 'inside',
    occurredAt: '',
  };
  // Não registrar uma passagem fictícia para preparar a primeira saída.
  let janela;
  let ocupado = false;
  let geracao = 0;
  let edicaoSentido = 0;
  const resumo = criarElemento('p', {
    class: 'field-hint',
    'aria-live': 'polite',
  });
  const sentido = criarElemento(
    'select',
    {
      class: 'select',
      onChange: (evento) => {
        edicaoSentido++;
        formulario.direction = evento.target.value;
      },
    },
    [
      criarElemento('option', {
        value: 'entry',
        text: 'Entrada',
        selected: formulario.direction === 'entry',
      }),
      criarElemento('option', {
        value: 'exit',
        text: 'Saída',
        selected: formulario.direction === 'exit',
      }),
    ],
  );
  const data = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(),
  });
  async function conferirPresenca(id) {
    const atual = ++geracao;
    const edicaoAnterior = edicaoSentido;
    if (!id) {
      resumo.textContent = 'Selecione um veículo.';
      return;
    }
    resumo.textContent = 'Conferindo presença...';
    try {
      const presenca = await dados.movements.presence(id);
      if (atual !== geracao || !sentido.isConnected) return;
      const estado = presenca?.presence || presenca?.currentPresence || 'unknown';
      resumo.textContent =
        estado === 'inside'
          ? 'Presença atual: no pátio. Confira a saída.'
          : estado === 'outside'
            ? 'Presença atual: fora do pátio. Confira a entrada.'
            : 'Presença ainda não conferida. Se precisar registrar uma saída, confira primeiro a presença inicial.';
      if (edicaoAnterior === edicaoSentido && !ocupado) {
        formulario.direction = estado === 'inside' ? 'exit' : 'entry';
        sentido.value = formulario.direction;
      }
    } catch (erro) {
      if (atual === geracao) resumo.textContent = erro.message;
    }
  }
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'mv-v8-v',
      label: 'Veículo',
      required: true,
      control: criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => {
            formulario.vehicleId = evento.target.value;
            if (!inicial) conferirPresenca(formulario.vehicleId);
          },
        },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...lista.map((item) =>
            criarElemento('option', {
              value: item.id,
              selected: item.id === formulario.vehicleId,
              text: `${formatar.plate(item.plate)} — ${item.brand || ''} ${item.model || ''}`,
            }),
          ),
        ],
      ),
    }),
    resumo,
    inicial
      ? campo({
          id: 'mv-inicial',
          label: 'Onde o veículo está agora?',
          required: true,
          control: criarElemento(
            'select',
            {
              class: 'select',
              onChange: (evento) => (formulario.presence = evento.target.value),
            },
            [
              criarElemento('option', {
                value: 'inside',
                text: 'Dentro do pátio',
              }),
              criarElemento('option', {
                value: 'outside',
                text: 'Fora do pátio',
              }),
            ],
          ),
        })
      : campo({
          id: 'mv-sentido',
          label: 'Passagem que aconteceu',
          required: true,
          control: sentido,
        }),
    campo({
      id: 'mv-v8-l',
      label: 'Base / local',
      required: true,
      control: criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => (formulario.locationId = evento.target.value),
        },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...ativos.map((item) =>
            criarElemento('option', {
              value: item.id,
              selected: item.id === formulario.locationId,
              text: item.name,
            }),
          ),
        ],
      ),
    }),
    inicial
      ? criarElemento('p', {
          class: 'field-hint',
          text: 'Esta conferência define a situação inicial com justificativa e não conta como uma passagem normal.',
        })
      : campo({
          id: 'mv-quando',
          label: 'Data e hora da passagem',
          required: true,
          control: data,
        }),
    campo({
      id: 'mv-v8-n',
      label: inicial ? 'Justificativa da conferência' : 'Observação',
      required: inicial,
      control: criarElemento('textarea', {
        class: 'textarea',
        rows: '2',
        onInput: (evento) => {
          formulario.notes = evento.target.value;
          formulario.reason = evento.target.value;
        },
      }),
    }),
  ]);
  const salvar = botao({
    label: inicial ? 'Confirmar presença inicial' : 'Registrar',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      try {
        if (
          !formulario.vehicleId ||
          (!formulario.locationId && (!inicial || formulario.presence === 'inside'))
        )
          throw new Error('Selecione veículo e base.');
        if (inicial && formulario.reason.trim().length < 10)
          throw new Error('Informe uma justificativa com pelo menos 10 caracteres.');
        if (!inicial) formulario.occurredAt = instanteEmpresa(data.value);
        ocupado = true;
        salvar.disabled = true;
        const resultado = inicial
          ? await dados.movements.initialize(formulario)
          : await dados.movements.register(formulario);
        janela.close();
        notificacao(
          resultado?.deduplicated
            ? 'Esta solicitação já estava registrada.'
            : inicial
              ? 'Presença inicial conferida.'
              : formulario.direction === 'exit'
                ? 'Saída registrada.'
                : 'Entrada registrada.',
          { tone: 'success' },
        );
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
    title: inicial ? 'Conferir presença inicial' : 'Registrar entrada/saída',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => janela.close() }),
      salvar,
    ]),
  });
  if (!inicial && formulario.vehicleId) conferirPresenca(formulario.vehicleId);
}
export { abrirFormularioMovimentacao as abrirModalMovimentacaoV8 };
