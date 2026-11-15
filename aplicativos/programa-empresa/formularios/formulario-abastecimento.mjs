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
import {
  dataHoraEmpresa,
  instanteEmpresa,
  numeroInformado,
  unidadeProduto,
} from './apoio-operacoes.mjs';

export function abrirFormularioAbastecimento({
  vehicles: veiculos,
  drivers: motoristas = [],
  trips: viagens = [],
  fuelings: historico = [],
  vehicleId = '',
  original = null,
  motivo = '',
  onDone: aoConcluir,
}) {
  const formulario = {
    vehicleId,
    fuelType: '',
    liters: '',
    pricePerLiter: '',
    totalAmount: '',
    odometerKm: '',
    stationName: '',
    fullTank: false,
    fueledAt: '',
    driverId: '',
    tripId: '',
    notes: '',
  };
  let janela;
  let ocupado = false;
  let consultaSugestao = 0;
  let edicaoProduto = 0;
  let edicaoPosto = 0;
  const substituir = Boolean(original?.id);
  const entradas = {};
  const referencia = criarElemento('p', {
    class: 'field-hint',
    'aria-live': 'polite',
  });
  const alerta = criarElemento('p', { class: 'field-hint', role: 'status' });
  const data = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(),
  });
  const campoNumero = (id, chave, rotulo, passo) => {
    const controle = criarElemento('input', {
      class: 'input',
      type: 'number',
      min: '0',
      step: passo,
      value: formulario[chave],
      onInput: (evento) => {
        formulario[chave] = evento.target.value;
        recalcular(chave);
      },
    });
    entradas[chave] = controle;
    return campo({ id, label: rotulo, required: true, control: controle });
  };
  const produto = criarElemento(
    'select',
    {
      class: 'select',
      onChange: (evento) => {
        edicaoProduto++;
        formulario.fuelType = evento.target.value;
        atualizarAvisos();
      },
    },
    [
      criarElemento('option', { value: '', text: 'Selecione' }),
      ...TIPOS_COMBUSTIVEL_BOMBA.map((item) =>
        criarElemento('option', { value: item.value, text: item.label }),
      ),
    ],
  );
  const posto = criarElemento('input', {
    class: 'input',
    list: 'postos-recentes',
    onInput: (evento) => {
      edicaoPosto++;
      formulario.stationName = evento.target.value;
    },
  });
  const motorista = criarElemento(
    'select',
    {
      class: 'select',
      onChange: (evento) => (formulario.driverId = evento.target.value),
    },
    [
      criarElemento('option', { value: '', text: 'Não informado' }),
      ...motoristas
        .filter((item) => item.active && !item.archived_at)
        .map((item) => criarElemento('option', { value: item.id, text: item.full_name })),
    ],
  );
  const viagem = criarElemento('select', {
    class: 'select',
    onChange: (evento) => {
      formulario.tripId = evento.target.value;
      const item = viagens.find((item) => item.id === formulario.tripId);
      if (item) {
        formulario.driverId = item.driver_id;
        motorista.value = item.driver_id;
      }
    },
  });
  function atualizarAvisos() {
    const selecionado = veiculos.find((item) => item.id === formulario.vehicleId);
    const unidade = unidadeProduto(formulario.fuelType);
    const rotuloQuantidade = entradas.liters?.closest('.field')?.querySelector('label');
    const rotuloPreco = entradas.pricePerLiter?.closest('.field')?.querySelector('label');
    if (rotuloQuantidade) rotuloQuantidade.firstChild.textContent = `Quantidade (${unidade})`;
    if (rotuloPreco) rotuloPreco.firstChild.textContent = `Preço por ${unidade}`;
    const avisos = [];
    if (
      selecionado &&
      formulario.fuelType &&
      selecionado.fuel_type !== formulario.fuelType &&
      !(
        selecionado.fuel_type === 'flex' && ['gasoline', 'ethanol'].includes(formulario.fuelType)
      ) &&
      !(selecionado.fuel_type?.startsWith('diesel') && formulario.fuelType.startsWith('diesel'))
    )
      avisos.push('Produto diferente do combustível cadastrado. Confira antes de registrar.');
    if (
      unidade === 'L' &&
      Number(selecionado?.tank_capacity_l) > 0 &&
      Number(formulario.liters) > Number(selecionado.tank_capacity_l) * 1.1
    )
      avisos.push(
        'Quantidade acima da capacidade cadastrada do tanque. Confira a quantidade e informe a justificativa.',
      );
    alerta.textContent = avisos.join(' ');
  }
  function recalcular(chave) {
    const quantidade = Number(formulario.liters),
      preco = Number(formulario.pricePerLiter),
      total = Number(formulario.totalAmount);
    if (chave === 'totalAmount' && quantidade > 0 && total > 0) {
      formulario.pricePerLiter = String(Number((total / quantidade).toFixed(6)));
      entradas.pricePerLiter.value = formulario.pricePerLiter;
    } else if (chave === 'pricePerLiter' && quantidade <= 0 && preco > 0 && total > 0) {
      formulario.liters = String(Number((total / preco).toFixed(3)));
      entradas.liters.value = formulario.liters;
    } else if (quantidade > 0 && preco > 0) {
      formulario.totalAmount = (quantidade * preco).toFixed(2);
      entradas.totalAmount.value = formulario.totalAmount;
    }
    atualizarAvisos();
  }
  function selecionarVeiculo(id) {
    formulario.vehicleId = id;
    formulario.odometerKm = '';
    entradas.odometerKm.value = '';
    const item = veiculos.find((item) => item.id === id);
    const anterior = historico
      .filter((registro) => registro.vehicle_id === id && !registro.voided_at)
      .sort((a, b) => Date.parse(b.fueled_at) - Date.parse(a.fueled_at))[0];
    referencia.textContent = item
      ? `Última leitura cadastrada: ${formatar.km(item.current_odometer_km)}. Informe a quilometragem real do comprovante/painel.`
      : 'Selecione o veículo para ver a última leitura.';
    formulario.fuelType =
      anterior?.fuel_type ||
      (item?.fuel_type === 'flex'
        ? 'gasoline'
        : item?.fuel_type === 'electric'
          ? ''
          : item?.fuel_type || '');
    produto.value = formulario.fuelType;
    formulario.stationName = anterior?.station_name || '';
    posto.value = formulario.stationName;
    viagem.replaceChildren(
      criarElemento('option', { value: '', text: 'Sem vínculo com viagem' }),
      ...viagens
        .filter((registro) => registro.vehicle_id === id && registro.status === 'in_progress')
        .map((registro) =>
          criarElemento('option', {
            value: registro.id,
            text: `${registro.origin_label} → ${registro.destination_label}`,
          }),
        ),
    );
    formulario.tripId = '';
    atualizarAvisos();
    const consultaAtual = ++consultaSugestao;
    if (!id || substituir) return;
    const produtoAntes = edicaoProduto;
    const postoAntes = edicaoPosto;
    void dados.fuelings
      .recent({ vehicle_id: `eq.${id}` }, 1)
      .then(([recente]) => {
        if (!recente || consultaAtual !== consultaSugestao || !posto.isConnected || ocupado) return;
        if (produtoAntes === edicaoProduto && recente.fuel_type) {
          formulario.fuelType = recente.fuel_type;
          produto.value = formulario.fuelType;
        }
        if (postoAntes === edicaoPosto && recente.station_name) {
          formulario.stationName = recente.station_name;
          posto.value = formulario.stationName;
        }
        atualizarAvisos();
      })
      .catch(() => {});
  }
  const seletorVeiculo = criarElemento(
    'select',
    {
      class: 'select',
      disabled: substituir,
      onChange: (evento) => selecionarVeiculo(evento.target.value),
    },
    [
      criarElemento('option', { value: '', text: 'Selecione' }),
      ...veiculos.map((item) =>
        criarElemento('option', {
          value: item.id,
          text: `${item.plate} — ${item.brand} ${item.model}`,
          selected: item.id === vehicleId,
        }),
      ),
    ],
  );
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'fv8-v',
      label: 'Veículo',
      required: true,
      control: seletorVeiculo,
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'fv8-data',
        label: 'Data e hora do abastecimento',
        required: true,
        control: data,
      }),
      campo({
        id: 'fv8-f',
        label: 'Produto',
        required: true,
        control: produto,
      }),
    ]),
    campoNumero('fv8-o', 'odometerKm', 'Odômetro real', '0.1'),
    referencia,
    criarElemento('div', { class: 'form-row' }, [
      campoNumero('fv8-l', 'liters', 'Quantidade (L)', '.001'),
      campoNumero('fv8-p', 'pricePerLiter', 'Preço por L', '.001'),
      campoNumero('fv8-total', 'totalAmount', 'Total pago (R$)', '.01'),
    ]),
    criarElemento('p', {
      class: 'field-hint',
      text: 'Informe quantidade e preço para calcular o total, ou quantidade e total para calcular o preço. Confira os três valores.',
    }),
    criarElemento('label', { class: 'auth-remember' }, [
      criarElemento('input', {
        type: 'checkbox',
        checked: original?.full_tank === true,
        onChange: (evento) => (formulario.fullTank = evento.target.checked),
      }),
      'Completou o tanque?',
    ]),
    criarElemento('p', {
      class: 'field-hint',
      text: 'Marque somente se o tanque ficou cheio. O consumo é calculado entre dois tanques cheios, incluindo os parciais intermediários.',
    }),
    campo({ id: 'fv8-s', label: 'Posto', control: posto }),
    criarElemento(
      'datalist',
      { id: 'postos-recentes' },
      [...new Set(historico.map((item) => item.station_name).filter(Boolean))]
        .slice(0, 30)
        .map((nome) => criarElemento('option', { value: nome })),
    ),
    criarElemento('details', {}, [
      criarElemento('summary', { text: 'Motorista e viagem (opcionais)' }),
      campo({ id: 'fv8-motorista', label: 'Motorista', control: motorista }),
      campo({
        id: 'fv8-viagem',
        label: 'Viagem em andamento',
        control: viagem,
      }),
    ]),
    alerta,
    campo({
      id: 'fv8-notas',
      label: 'Observação / justificativa',
      control: criarElemento('textarea', {
        class: 'textarea',
        rows: '2',
        onInput: (evento) => (formulario.notes = evento.target.value),
      }),
    }),
  ]);
  const salvar = botao({
    label: substituir ? 'Salvar substituição' : 'Registrar',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      try {
        if (!formulario.vehicleId || !formulario.fuelType)
          throw new Error('Selecione veículo e produto.');
        numeroInformado(formulario.odometerKm, 'odômetro');
        numeroInformado(formulario.liters, 'quantidade', 0.001);
        numeroInformado(formulario.pricePerLiter, 'preço', 0.000001);
        numeroInformado(formulario.totalAmount, 'total', 0.01);
        formulario.fueledAt = instanteEmpresa(data.value);
        if (Date.parse(formulario.fueledAt) > Date.now() + 300000)
          throw new Error('O abastecimento não pode estar no futuro.');
        if (alerta.textContent && formulario.notes.trim().length < 10)
          throw new Error(
            'Confira o aviso e informe uma justificativa com pelo menos 10 caracteres.',
          );
        ocupado = true;
        salvar.disabled = true;
        salvar.setAttribute('aria-busy', 'true');
        if (substituir) await dados.fuelings.replace(formulario);
        else await dados.fuelings.create(formulario);
        janela.close();
        notificacao('Abastecimento registrado.', { tone: 'success' });
        aoConcluir?.();
      } catch (erro) {
        notificacao(erro.message, { tone: 'danger' });
      } finally {
        ocupado = false;
        salvar.disabled = false;
        salvar.removeAttribute('aria-busy');
      }
    },
  });
  janela = modal({
    title: substituir ? 'Substituir abastecimento' : 'Registrar abastecimento',
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => janela.close() }),
      salvar,
    ]),
  });
  selecionarVeiculo(vehicleId);
  if (substituir) {
    Object.assign(formulario, {
      fuelingId: original.id,
      reason: motivo,
      fuelType: original.fuel_type,
      liters: String(original.liters),
      pricePerLiter: String(original.price_per_liter),
      totalAmount: String(original.total_amount),
      odometerKm: String(original.effective_odometer_km ?? original.odometer_km),
      stationName: original.station_name || '',
      fullTank: original.full_tank === true,
      driverId: original.driver_id || '',
      tripId: original.trip_id || '',
      notes: original.notes || '',
    });
    for (const [chave, no] of Object.entries(entradas)) no.value = formulario[chave];
    produto.value = formulario.fuelType;
    posto.value = formulario.stationName;
    motorista.value = formulario.driverId;
    if (formulario.tripId && ![...viagem.options].some((item) => item.value === formulario.tripId))
      viagem.append(
        criarElemento('option', {
          value: formulario.tripId,
          text: 'Viagem do registro original',
        }),
      );
    viagem.value = formulario.tripId;
    data.value = dataHoraEmpresa(original.fueled_at);
    atualizarAvisos();
  }
}
export { abrirFormularioAbastecimento as abrirModalAbastecimentoV8 };
