import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { PERMISSAO } from '@peganafrota/contracts';
import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import {
  abrirModalComVolta,
  dataHoraEmpresa,
  instanteEmpresa,
  numeroInformado,
} from './apoio-operacoes.mjs';
import { abrirEditorLocal } from './formulario-local.mjs';
import { abrirFormularioMovimentacao } from './formulario-movimentacao.mjs';

export function abrirOperacaoViagem({
  trip: viagem,
  vehicle: veiculo,
  action: acao,
  locations: locais = [],
  yardEnabled: controlarPatio = null,
  onSubmit: enviarOperacao = (formulario) => dados.trips.operate(formulario),
  onCancel: aoCancelar,
  onLocationsChanged: aoAtualizarLocais,
  onDone: aoConcluir,
}) {
  const inicio = acao === 'start',
    interromper = acao === 'interrupt';
  const titulo = inicio
    ? 'Iniciar viagem'
    : interromper
      ? 'Encerrar viagem interrompida'
      : 'Concluir viagem';
  const podeRegistrarPassagem = controlarPatio !== false && contexto.can(PERMISSAO.MOVEMENTS_WRITE);
  const podeCadastrarPatio = contexto.can(PERMISSAO.LOCATIONS_WRITE);
  let basesAtivas = locais?.filter((item) => item.active && !item.archived_at) ?? null;
  let presenca;
  let consultaPresenca = 0;
  let consultandoPresenca = false;
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
  let trocandoJanela = false;
  let erroPresenca = false;
  const abrirAuxiliar = (editor, aoSalvar) => {
    trocandoJanela = true;
    abrirModalComVolta(janela, editor, montarJanela, aoSalvar);
  };
  const km = criarElemento('input', {
    class: 'input',
    type: 'number',
    min: '0',
    step: '.1',
    placeholder: inicio ? String(veiculo?.current_odometer_km ?? '') : '',
    onInput: (evento) => (formulario.odometerKm = evento.target.value),
  });
  const data = criarElemento('input', {
    class: 'input',
    type: 'datetime-local',
    value: dataHoraEmpresa(),
  });
  const local = criarElemento('select', { class: 'select' });
  const avisoPresenca = criarElemento('div', { 'aria-live': 'polite' });
  const areaLocal = campo({
    id: 'tv-op-local',
    label: 'Pátio da passagem',
    control: local,
  });
  areaLocal.hidden = true;
  const integrar = criarElemento('input', {
    type: 'checkbox',
    onChange: (evento) => {
      areaLocal.hidden = !evento.target.checked;
      conferirPresenca();
    },
  });
  const areaPortaria = criarElemento('div', { class: 'field' });
  const dica = (text) => criarElemento('p', { class: 'field-hint', text });

  async function buscarPatios(evento) {
    const retentar = evento.currentTarget;
    if (retentar.disabled || ocupado) return;
    retentar.disabled = true;
    retentar.setAttribute('aria-busy', 'true');
    try {
      basesAtivas = (await dados.locations.eligible())
        .filter((item) => item.active && !item.archived_at);
      aoAtualizarLocais?.(basesAtivas);
      atualizarPortaria();
    } catch (erro) {
      notificacao(erro.message, { tone: 'danger' });
    } finally {
      retentar.disabled = false;
      retentar.removeAttribute('aria-busy');
    }
  }
  function cadastrarPatio() {
    abrirAuxiliar(
      (opcoes) => abrirEditorLocal({ title: 'Cadastrar pátio', ...opcoes }),
      (resultado) => {
        if (!resultado?.locationId) return;
        basesAtivas = [{ id: resultado.locationId, name: resultado.name, active: true }];
        aoAtualizarLocais?.(basesAtivas);
        atualizarPortaria(resultado.locationId);
      },
    );
  }
  function atualizarPortaria(escolhido = '') {
    if (!basesAtivas) {
      areaPortaria.replaceChildren(
        dica('A lista de pátios está indisponível. Você pode registrar só a viagem.'),
        botao({ label: 'Tentar buscar pátios', size: 'sm', onClick: buscarPatios }),
      );
      return;
    }
    if (!basesAtivas.length) {
      areaPortaria.replaceChildren(
        dica('Você pode registrar só a viagem.'),
        podeCadastrarPatio
          ? criarElemento('div', {}, [
              botao({ label: 'Cadastrar pátio', size: 'sm', onClick: cadastrarPatio }),
            ])
          : dica('Para registrar a passagem, peça a quem administra a empresa para cadastrar um pátio.'),
      );
      return;
    }
    local.replaceChildren(
      criarElemento('option', { value: '', text: 'Selecione o pátio' }),
      ...basesAtivas.map((item) => criarElemento('option', { value: item.id, text: item.name })),
    );
    local.value = escolhido || (basesAtivas.length === 1 ? basesAtivas[0].id : '');
    areaPortaria.replaceChildren(
      criarElemento('label', { class: 'auth-remember' }, [
        integrar,
        `Registrar também ${inicio ? 'saída' : 'entrada'} na portaria`,
      ]),
      areaLocal,
      avisoPresenca,
      dica('Marque a opção se o veículo passou pelo pátio.'),
    );
  }

  async function conferirPresenca() {
    const atual = ++consultaPresenca;
    presenca = undefined;
    erroPresenca = false;
    consultandoPresenca = integrar.checked;
    atualizarConfirmacao();
    avisoPresenca.replaceChildren();
    if (!consultandoPresenca) return;
    avisoPresenca.textContent = 'Conferindo a presença no pátio…';
    try {
      const resultado = await dados.movements.presence(viagem.vehicle_id);
      if (atual !== consultaPresenca) return;
      avisoPresenca.replaceChildren();
      presenca = resultado?.presence || resultado?.currentPresence;
      if (!['unknown', 'inside', 'outside'].includes(presenca)) throw new Error('Presença indisponível');
      if (inicio && presenca === 'inside' && resultado.locationId &&
          basesAtivas.some((item) => item.id === resultado.locationId)) local.value = resultado.locationId;
      if (inicio && presenca === 'unknown') {
        avisoPresenca.replaceChildren(
          dica('Para registrar a primeira saída do pátio, confira onde o veículo está.'),
          botao({
            label: 'Conferir presença inicial',
            size: 'sm',
            onClick: () => abrirAuxiliar(
              (opcoes) => abrirFormularioMovimentacao({
                vehicle: { ...veiculo, id: viagem.vehicle_id },
                locations: basesAtivas,
                locationId: local.value,
                initial: true,
                ...opcoes,
              }),
              (confirmada) => {
                if (confirmada?.locationId) local.value = confirmada.locationId;
                conferirPresenca();
              },
            ),
          }),
        );
      } else if (inicio && presenca === 'outside') {
        avisoPresenca.textContent = 'O veículo está fora do pátio. Para registrar só a viagem, desmarque a saída na portaria.';
      } else if (!inicio && presenca === 'inside') {
        avisoPresenca.textContent = 'O veículo já consta dentro do pátio. Desmarque a entrada para encerrar somente a viagem.';
      }
    } catch {
      if (atual === consultaPresenca) {
        erroPresenca = true;
        avisoPresenca.replaceChildren(
          dica('Não foi possível consultar a presença. Tente novamente ou desmarque a passagem para registrar somente a viagem.'),
          botao({ label: 'Conferir novamente', size: 'sm', onClick: conferirPresenca }),
        );
      }
    } finally {
      if (atual === consultaPresenca) {
        consultandoPresenca = false;
        atualizarConfirmacao();
      }
    }
  }

  if (podeRegistrarPassagem) atualizarPortaria();
  const corpo = criarElemento('div', {}, [
    criarElemento('p', {
      class: 'muted',
      text: [veiculo?.plate, `${viagem.origin_label} → ${viagem.destination_label}`].filter(Boolean).join(' · '),
    }),
    criarElemento('p', {
      class: 'field-hint',
      text: `Última leitura do veículo: ${formatar.km(veiculo?.current_odometer_km)}${!inicio ? `. Saída desta viagem: ${formatar.km(viagem.start_odometer_km)}` : ''}. Informe a leitura real.`,
    }),
    campo({
      id: 'odo-action',
      label: inicio ? 'Quilometragem na saída' : 'Quilometragem ao encerrar',
      required: true,
      control: km,
    }),
    inicio && Number.isFinite(Number(veiculo?.current_odometer_km))
      ? botao({ label: 'Usar última quilometragem', size: 'sm', onClick: () => {
          km.value = String(veiculo.current_odometer_km);
          formulario.odometerKm = km.value;
          km.focus();
        } })
      : null,
    campo({
      id: 'tv-op-data',
      label: inicio ? 'Data e hora da saída' : 'Data e hora do encerramento',
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
    podeRegistrarPassagem ? areaPortaria : null,
  ]);
  const salvar = botao({
    label: inicio ? 'Confirmar saída' : 'Confirmar encerramento',
    variant: 'primary',
    onClick: async () => {
      if (ocupado || consultandoPresenca) return;
      try {
        numeroInformado(formulario.odometerKm, 'um número de quilômetros');
        formulario.occurredAt = instanteEmpresa(data.value);
        if (interromper && formulario.reason.trim().length < 10)
          throw new Error('Informe um motivo com pelo menos 10 caracteres.');
        const registrarPassagem = podeRegistrarPassagem && integrar.checked;
        formulario.locationId = registrarPassagem ? local.value : '';
        if (registrarPassagem && !formulario.locationId)
          throw new Error('Selecione o pátio para registrar a passagem.');
        if (registrarPassagem && inicio && presenca === 'unknown')
          throw new Error('Confira a presença inicial para registrar a primeira saída.');
        if (registrarPassagem && (erroPresenca || (inicio ? presenca === 'outside' : presenca === 'inside')))
          throw new Error('Confira a presença ou desmarque a passagem para registrar somente a viagem.');
        if (
          Number(formulario.odometerKm) <
          Number(inicio ? veiculo?.current_odometer_km : viagem.start_odometer_km)
        )
          throw new Error('A leitura é menor que a referência da operação. Confira o valor.');
        ocupado = true;
        atualizarConfirmacao();
        const resultado = await enviarOperacao(formulario);
        janela.close(true);
        notificacao(`${titulo}: operação registrada.`, { tone: 'success' });
        aoConcluir?.(resultado);
      } catch (erro) {
        notificacao(erro.message, { tone: 'danger' });
      } finally {
        ocupado = false;
        atualizarConfirmacao();
      }
    },
  });
  function atualizarConfirmacao() {
    salvar.disabled = ocupado || consultandoPresenca;
    corpo.inert = ocupado;
    areaPortaria.inert = ocupado;
  }
  function montarJanela() {
    trocandoJanela = false;
    janela = modal({
      title: titulo,
      body: corpo,
      dismissible: () => !ocupado,
      onClose: (concluida) => {
        if (!concluida && !trocandoJanela) aoCancelar?.();
      },
      footer: criarElemento('div', { class: 'modal-actions' }, [
        botao({ label: 'Voltar', onClick: () => { if (!ocupado) janela.close(); } }),
        salvar,
      ]),
    });
  }
  montarJanela();
}
