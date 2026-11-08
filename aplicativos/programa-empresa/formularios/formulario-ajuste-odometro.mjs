import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { validarAjusteOdometro } from '@peganafrota/validation';

export function abrirAjusteOdometro({ vehicleId: veiculoIdentificador, ledger: livro, onDone: aoConcluir }) {
  const formulario = {
    vehicleId: veiculoIdentificador,
    odometerKm: '',
    reason: '',
    nature: 'adjustment',
    correctionOfId: '',
  };
  let erros = {};
  let correspondenciaItem;
  const ultimo = livro?.[0]?.odometer_km ?? null;

  function renderizar() {
    const corpo = criarElemento('div', {}, [
      criarElemento('p', { class: 'muted', text: `Topo do ledger: ${formatar.km(ultimo)}` }),
      campo({
        id: 'oa-nat',
        label: 'Natureza',
        required: true,
        control: criarElemento(
          'select',
          {
            class: 'select',
            onChange: (evento) => {
              formulario.nature = evento.target.value;
              renderizar();
            },
          },
          [
            criarElemento('option', { value: 'adjustment', text: 'Ajuste (nova leitura)' }),
            criarElemento('option', { value: 'correction', text: 'Correção de registro anterior' }),
          ],
        ),
      }),
      formulario.nature === 'correction'
        ? campo({
            id: 'oa-of',
            label: 'Registro corrigido',
            required: true,
            error: erros.correctionOfId,
            control: criarElemento(
              'select',
              {
                class: 'select',
                onChange: (evento) => {
                  formulario.correctionOfId = evento.target.value;
                },
              },
              [
                criarElemento('option', { value: '', text: 'Selecione' }),
                ...(livro || []).map((evento) =>
                  criarElemento('option', {
                    value: evento.id,
                    text: `${formatar.dateTime(evento.occurred_at)} — ${formatar.km(evento.odometer_km)}`,
                  }),
                ),
              ],
            ),
          })
        : null,
      campo({
        id: 'oa-km',
        label: 'Nova leitura',
        required: true,
        error: erros.odometerKm,
        control: criarElemento('input', {
          class: 'input',
          type: 'number',
          onInput: (evento) => {
            formulario.odometerKm = evento.target.value;
          },
        }),
      }),
      campo({
        id: 'oa-reason',
        label: 'Justificativa',
        required: true,
        error: erros.reason,
        hint: 'O banco exige justificativa em todo ajuste manual.',
        control: criarElemento('textarea', {
          class: 'textarea',
          rows: '2',
          onInput: (evento) => {
            formulario.reason = evento.target.value;
          },
        }),
      }),
    ]);
    const rodape = criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Registrar ajuste', variant: 'primary', onClick: enviar }),
    ]);
    if (correspondenciaItem) correspondenciaItem.close();
    correspondenciaItem = modal({ title: 'Ajuste de odômetro', body: corpo, footer: rodape });
  }

  async function enviar() {
    const resultadoItem = validarAjusteOdometro(formulario, { lastOdometerKm: ultimo });
    erros = resultadoItem.errors;
    if (!resultadoItem.ok) {
      renderizar();
      return;
    }
    try {
      await dados.odometer.adjust(formulario);
      correspondenciaItem.close();
      notificacao('Ajuste registrado no ledger.', { tone: 'success' });
      aoConcluir();
    } catch (erro) {
      notificacao(erro.message, { tone: 'danger' });
    }
  }

  renderizar();
}
