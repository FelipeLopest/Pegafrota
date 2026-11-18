import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { PERMISSAO } from '@peganafrota/contracts';
import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { abrirModalComVolta, dataHoraEmpresa, instanteEmpresa } from './apoio-operacoes.mjs';
import { abrirEditorMotorista } from './formulario-motorista.mjs';
import { abrirEditorVeiculo } from './formulario-veiculo.mjs';

export function abrirFormularioViagem({
  vehicles: listaVeiculos,
  drivers: listaMotoristas,
  trip: viagem = null,
  vehicleId = '',
  locations: locais = [],
  history: historico = [],
  onVehicleAdded: aoAdicionarVeiculo,
  onDriverAdded: aoAdicionarMotorista,
  onDone: aoConcluir,
}) {
  const veiculos = listaVeiculos.filter((item) => !item.archived_at && item.status !== 'inactive');
  const motoristas = listaMotoristas.filter((item) => item.active && !item.archived_at);
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
  function campoCadastro({ id, chave, rotulo, itens, nomeItem, permissao, editor, converter, aoAdicionar }) {
    const selecionar = criarElemento(
      'select',
      {
        class: 'select',
        onChange: (evento) => (formulario[chave] = evento.target.value),
      },
      [
        criarElemento('option', { value: '', text: 'Selecione' }),
        ...itens.map((item) => criarElemento('option', { value: item.id, text: nomeItem(item) })),
      ],
    );
    selecionar.value = formulario[chave];
    formulario[chave] = selecionar.value;
    const incluirNovo = (resultado, valores) => {
      const criado = converter(resultado, valores);
      if (!criado?.id) return;
      itens.push(criado);
      aoAdicionar?.(criado);
      selecionar.append(criarElemento('option', { value: criado.id, text: nomeItem(criado) }));
      selecionar.options[0].textContent = 'Selecione';
      formulario[chave] = criado.id;
      selecionar.value = criado.id;
      selecionar.disabled = false;
      faltaCadastro.hidden = true;
      atualizarSalvar();
    };
    const reabrir = () => {
      montarJanela();
      (selecionar.value ? selecionar : faltaCadastro.querySelector('button'))?.focus();
    };
    const faltaCadastro = criarElemento('div', { class: 'field' }, [
      contexto.can(permissao)
        ? botao({
            label: `Cadastrar ${rotulo.toLowerCase()}`,
            size: 'sm',
            onClick: () => abrirModalComVolta(janela, editor, reabrir, incluirNovo),
          })
        : criarElemento('p', {
            class: 'field-hint',
            text: `Peça a quem administra a empresa para cadastrar um ${rotulo.toLowerCase()}.`,
          }),
    ]);
    faltaCadastro.hidden = itens.length > 0;
    selecionar.disabled = !itens.length;
    if (!itens.length) selecionar.options[0].textContent = `Nenhum ${rotulo.toLowerCase()} ativo`;
    return criarElemento('div', {}, [
      campo({ id, label: rotulo, required: true, control: selecionar }),
      faltaCadastro,
    ]);
  }

  const detalhes = criarElemento('details', {
    class: 'inline-details',
    open: !!(formulario.plannedDepartureAt || formulario.plannedReturnAt || formulario.purpose || formulario.notes),
  }, [
    criarElemento('summary', { text: 'Datas previstas e observações' }),
    criarElemento('div', { class: 'form-row' }, [
      campo({ id: 'tv-pd', label: 'Saída prevista', control: partida }),
      campo({ id: 'tv-pr', label: 'Retorno previsto', control: retorno }),
    ]),
    campo({
      id: 'tv-purpose',
      label: 'Motivo da viagem',
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
  const corpo = criarElemento('div', {}, [
    criarElemento('p', {
      class: 'field-hint',
      text: 'Escolha veículo, motorista e rota. Depois de criar a viagem, clique em Iniciar para registrar a saída.',
    }),
    campoCadastro({
      id: 'tv-v',
      chave: 'vehicleId',
      rotulo: 'Veículo',
      itens: veiculos,
      nomeItem: (item) => `${item.plate} — ${item.brand} ${item.model}`,
      permissao: PERMISSAO.VEHICLES_WRITE,
      editor: abrirEditorVeiculo,
      converter: (resultado, valores) => resultado && ({
        id: resultado.vehicleId,
        plate: resultado.plate,
        brand: valores.brand,
        model: valores.model,
        status: resultado.status,
        current_odometer_km: resultado.currentOdometerKm,
      }),
      aoAdicionar: aoAdicionarVeiculo,
    }),
    campoCadastro({
      id: 'tv-d',
      chave: 'driverId',
      rotulo: 'Motorista',
      itens: motoristas,
      nomeItem: (item) => item.full_name,
      permissao: PERMISSAO.DRIVERS_WRITE,
      editor: abrirEditorMotorista,
      converter: (resultado) => resultado && ({
        id: resultado.driverId,
        full_name: resultado.fullName,
        active: true,
      }),
      aoAdicionar: aoAdicionarMotorista,
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
    detalhes,
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
        ) {
          detalhes.open = true;
          throw new Error('O retorno previsto deve ser posterior à saída.');
        }
        ocupado = true;
        salvar.disabled = true;
        await dados.trips.create(formulario);
        janela.close();
        notificacao(viagem ? 'Planejamento atualizado.' : 'Viagem criada. Use Iniciar para registrar a saída.', {
          tone: 'success',
        });
        aoConcluir?.();
      } catch (erro) {
        notificacao(erro.message, { tone: 'danger' });
      } finally {
        ocupado = false;
        atualizarSalvar();
      }
    },
  });
  function atualizarSalvar() {
    salvar.disabled = ocupado || !veiculos.length || !motoristas.length;
  }
  function montarJanela() {
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
  atualizarSalvar();
  montarJanela();
}
export { abrirFormularioViagem as abrirModalViagemV8 };
