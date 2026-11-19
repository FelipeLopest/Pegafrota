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
import { abrirOperacaoViagem } from './formulario-operacao-viagem.mjs';
import { impedimentoInicio } from './regras-inicio-viagem.mjs';

export function abrirFormularioViagem({
  vehicles: listaVeiculos,
  drivers: listaMotoristas,
  trip: viagem = null,
  vehicleId = '',
  locations: locais = [],
  history: historico = [],
  ongoingTrips: viagensEmAndamento = historico,
  yardEnabled: controlarPatio = null,
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
  const avisoInicio = criarElemento('p', { class: 'field-hint', 'aria-live': 'polite' });
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
        onChange: (evento) => {
          formulario[chave] = evento.target.value;
          atualizarSalvar();
        },
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
    // Cadastro rápido também fica disponível quando já há outros registros.
    faltaCadastro.hidden = itens.length > 0 && !contexto.can(permissao);
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
      text: 'Escolha veículo, motorista e trajeto. Siga para confirmar a saída ou salve o planejamento para depois. Pátio é opcional.',
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
        active: true,
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
      converter: (resultado, valores) => resultado && ({
        id: resultado.driverId,
        full_name: resultado.fullName,
        active: true,
        license_expires_on: valores?.licenseExpiresOn || null,
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
    avisoInicio,
  ]);
  function validarPlanejamento() {
    if (!formulario.vehicleId || !formulario.driverId || !formulario.originLabel.trim() || !formulario.destinationLabel.trim())
      throw new Error('Preencha veículo, motorista, origem e destino.');
    formulario.plannedDepartureAt = partida.value ? instanteEmpresa(partida.value) : '';
    formulario.plannedReturnAt = retorno.value ? instanteEmpresa(retorno.value) : '';
    if (formulario.plannedDepartureAt && formulario.plannedReturnAt &&
        Date.parse(formulario.plannedReturnAt) <= Date.parse(formulario.plannedDepartureAt)) {
      detalhes.open = true;
      throw new Error('O retorno previsto deve ser posterior à saída.');
    }
  }
  const iniciar = botao({
    label: 'Continuar para saída',
    variant: 'primary',
    onClick: () => {
      try {
        validarPlanejamento();
        const veiculo = veiculos.find((item) => item.id === formulario.vehicleId);
        const motorista = motoristas.find((item) => item.id === formulario.driverId);
        const impedimento = impedimentoInicio(veiculo, motorista, viagensEmAndamento, dataHoraEmpresa().slice(0, 10));
        if (impedimento) throw new Error(impedimento);
        janela.close();
        abrirOperacaoViagem({
          trip: { vehicle_id: formulario.vehicleId, origin_label: formulario.originLabel, destination_label: formulario.destinationLabel },
          vehicle: veiculo,
          action: 'start',
          locations: locais,
          yardEnabled: controlarPatio,
          onSubmit: (operacao) => dados.trips.createAndStart(formulario, operacao),
          onCancel: montarJanela,
          onDone: aoConcluir,
        });
      } catch (erro) {
        notificacao(erro.message, { tone: 'warning' });
      }
    },
  });
  const salvar = botao({
    label: 'Salvar planejamento',
    variant: viagem ? 'primary' : 'secondary',
    onClick: async () => {
      if (ocupado) return;
      try {
        validarPlanejamento();
        ocupado = true;
        atualizarSalvar();
        await dados.trips.create(formulario);
        janela.close();
        notificacao(viagem ? 'Planejamento atualizado.' : 'Planejamento salvo. Inicie a viagem quando o veículo sair.', {
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
    corpo.inert = ocupado;
    salvar.disabled = ocupado || !veiculos.length || !motoristas.length;
    iniciar.disabled = salvar.disabled;
    avisoInicio.textContent = viagem ? '' : impedimentoInicio(
      veiculos.find((item) => item.id === formulario.vehicleId),
      motoristas.find((item) => item.id === formulario.driverId),
      viagensEmAndamento, dataHoraEmpresa().slice(0, 10),
    );
  }
  function montarJanela() {
    janela = modal({
      title: viagem ? 'Editar planejamento' : 'Nova viagem',
      size: 'lg',
      dismissible: () => !ocupado,
      body: corpo,
      footer: criarElemento('div', { class: 'modal-actions' }, [
        botao({ label: 'Cancelar', onClick: () => { if (!ocupado) janela.close(); } }),
        salvar,
        !viagem ? iniciar : null,
      ]),
    });
  }
  atualizarSalvar();
  montarJanela();
}
export { abrirFormularioViagem as abrirModalViagemV8 };
