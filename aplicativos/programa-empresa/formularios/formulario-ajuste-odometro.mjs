import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { numeroInformado } from './apoio-operacoes.mjs';

export function abrirAjusteOdometro({
  vehicleId,
  ledger: livro = [],
  leituraAtual,
  onDone: aoConcluir,
}) {
  const formulario = {
    vehicleId,
    odometerKm: '',
    reason: '',
    nature: 'adjustment',
    correctionOfId: '',
  };
  let janela;
  let ocupado = false;
  const atual =
    leituraAtual ??
    livro.find((item) => !item.voided && !item.correction_marker)?.effective_km ??
    0;
  const previa = criarElemento('p', { class: 'field-hint', role: 'status' });
  const alvo = criarElemento(
    'select',
    {
      class: 'select',
      onChange: (evento) => {
        formulario.correctionOfId = evento.target.value;
        atualizar();
      },
    },
    [
      criarElemento('option', {
        value: '',
        text: 'Selecione o registro incorreto',
      }),
      ...livro
        .filter((item) => !item.voided && !item.correction_marker)
        .map((item) =>
          criarElemento('option', {
            value: item.id,
            text: `${formatar.dateTime(item.occurred_at)} — ${formatar.km(item.odometer_km)}`,
          }),
        ),
    ],
  );
  const areaAlvo = campo({
    id: 'oa-of',
    label: 'Registro que contém erro',
    required: true,
    control: alvo,
  });
  areaAlvo.hidden = true;
  function atualizar() {
    const anterior = livro.find((item) => item.id === formulario.correctionOfId);
    previa.textContent =
      formulario.nature === 'correction'
        ? `O registro de ${formatar.km(anterior?.odometer_km)} será preservado na auditoria e substituído por uma leitura válida. O servidor confere os eventos anteriores/posteriores e recalcula a leitura atual.`
        : `Leitura atual: ${formatar.km(atual)}. Diferença informada: ${formulario.odometerKm === '' ? '—' : formatar.km(Number(formulario.odometerKm) - Number(atual))}.`;
  }
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'oa-nat',
      label: 'O que deseja fazer?',
      control: criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => {
            formulario.nature = evento.target.value;
            areaAlvo.hidden = formulario.nature !== 'correction';
            atualizar();
          },
        },
        [
          criarElemento('option', {
            value: 'adjustment',
            text: 'Registrar nova leitura',
          }),
          criarElemento('option', {
            value: 'correction',
            text: 'Corrigir leitura digitada incorretamente',
          }),
        ],
      ),
    }),
    areaAlvo,
    campo({
      id: 'oa-km',
      label: 'Quilometragem correta',
      required: true,
      control: criarElemento('input', {
        class: 'input',
        type: 'number',
        min: '0',
        step: '.1',
        onInput: (evento) => {
          formulario.odometerKm = evento.target.value;
          atualizar();
        },
      }),
    }),
    previa,
    campo({
      id: 'oa-reason',
      label: 'Justificativa',
      required: true,
      hint: 'Descreva o ocorrido. O histórico original não será apagado.',
      control: criarElemento('textarea', {
        class: 'textarea',
        rows: '3',
        onInput: (evento) => (formulario.reason = evento.target.value),
      }),
    }),
    criarElemento('label', { class: 'auth-remember' }, [
      criarElemento('input', { type: 'checkbox', id: 'oa-conferido' }),
      'Conferi a leitura real e o impacto informado.',
    ]),
  ]);
  const salvar = botao({
    label: 'Confirmar leitura',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      try {
        numeroInformado(formulario.odometerKm, 'quilometragem');
        if (formulario.reason.trim().length < 10)
          throw new Error('Informe uma justificativa com pelo menos 10 caracteres.');
        if (!corpo.querySelector('#oa-conferido').checked)
          throw new Error('Confirme que conferiu a leitura.');
        if (formulario.nature === 'correction' && !formulario.correctionOfId)
          throw new Error('Selecione o registro que contém erro.');
        if (formulario.nature === 'adjustment' && Number(formulario.odometerKm) < Number(atual))
          throw new Error(
            'Para corrigir um erro anterior, selecione a opção de correção e o registro correspondente.',
          );
        ocupado = true;
        salvar.disabled = true;
        if (formulario.nature === 'correction') await dados.odometer.correct(formulario);
        else await dados.odometer.adjust(formulario);
        janela.close();
        notificacao('Leitura registrada com histórico preservado.', {
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
    title: 'Histórico de quilometragem — registrar/corrigir',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => janela.close() }),
      salvar,
    ]),
  });
  atualizar();
}
