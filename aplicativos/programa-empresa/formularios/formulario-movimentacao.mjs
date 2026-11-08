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

export function abrirFormularioMovimentacao({
  vehicle: veiculo,
  vehicles: veiculos,
  locations: locais,
  onDone: aoConcluir,
}) {
  const disponiveisLocais = (locais || []).filter((linhaItem) => linhaItem.active && !linhaItem.archived_at);
  const disponiveisVeiculos = veiculo ? [veiculo] : veiculosAtivos(veiculos || []);
  const formulario = { vehicleId: veiculo?.id || '', locationId: '', notes: '' };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'mv-v8-v',
      label: 'Veículo',
      required: true,
      control: veiculo
        ? criarElemento('input', { class: 'input', value: formatar.plate(veiculo.plate), disabled: true })
        : criarElemento(
            'select',
            { class: 'select', onChange: (evento) => (formulario.vehicleId = evento.target.value) },
            [
              criarElemento('option', { value: '', text: 'Selecione' }),
              ...disponiveisVeiculos.map((veiculoItem) =>
                criarElemento('option', {
                  value: veiculoItem.id,
                  text: `${veiculoItem.plate} — ${veiculoItem.brand || ''} ${veiculoItem.model || ''}`,
                }),
              ),
            ],
          ),
    }),
    campo({
      id: 'mv-v8-l',
      label: 'Local ativo',
      required: true,
      control: criarElemento(
        'select',
        { class: 'select', onChange: (evento) => (formulario.locationId = evento.target.value) },
        [
          criarElemento('option', { value: '', text: 'Selecione' }),
          ...disponiveisLocais.map((itemComparado) =>
            criarElemento('option', { value: itemComparado.id, text: itemComparado.name }),
          ),
        ],
      ),
    }),
    campo({
      id: 'mv-v8-n',
      label: 'Observação',
      hint: 'O servidor decide automaticamente se é entrada ou saída.',
      control: criarElemento('textarea', {
        class: 'textarea',
        rows: '2',
        onInput: (evento) => (formulario.notes = evento.target.value),
      }),
    }),
  ]);
  const enviar = async () => {
    if (!formulario.vehicleId || !formulario.locationId) {
      notificacao('Selecione veículo e local.', { tone: 'warning' });
      return;
    }
    try {
      const resultadoItem = await dados.movements.register(formulario);
      correspondenciaItem.close();
      notificacao(
        (resultadoItem?.movementType || resultadoItem?.movement_type) === 'exit'
          ? 'Saída registrada.'
          : 'Entrada registrada.',
        { tone: 'success' },
      );
      aoConcluir?.();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    }
  };
  correspondenciaItem = modal({
    title: veiculo
      ? `${veiculo.presence === 'inside' ? 'Registrar saída' : 'Registrar entrada'} · ${veiculo.plate}`
      : 'Registrar movimentação',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Registrar', variant: 'primary', onClick: enviar }),
    ]),
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { abrirFormularioMovimentacao as abrirModalMovimentacaoV8 };
