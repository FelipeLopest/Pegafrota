import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { contexto } from '../acesso/sessao-e-permissoes.mjs';

export function abrirEditorLocal({ location: local, onDone: aoConcluir }) {
  const editar = !!local;
  const formulario = {
    name: local?.name || '',
    addressStreet: local?.address_street || '',
    addressNumber: local?.address_number || '',
    addressDistrict: local?.address_district || '',
    addressCity: local?.address_city || '',
    addressState: local?.address_state || '',
    addressPostalCode: local?.address_postal_code || '',
    timezone: local?.timezone || contexto.data?.company?.timezone || 'America/Sao_Paulo',
    notes: local?.notes || '',
  };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'loc-n',
      label: 'Nome',
      required: true,
      control: criarElemento('input', {
        class: 'input',
        value: formulario.name,
        onInput: (evento) => (formulario.name = evento.target.value),
      }),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'loc-st',
        label: 'Logradouro',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressStreet,
          onInput: (evento) => (formulario.addressStreet = evento.target.value),
        }),
      }),
      campo({
        id: 'loc-no',
        label: 'Número',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressNumber,
          onInput: (evento) => (formulario.addressNumber = evento.target.value),
        }),
      }),
    ]),
    campo({
      id: 'loc-dist',
      label: 'Bairro',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.addressDistrict,
        onInput: (evento) => (formulario.addressDistrict = evento.target.value),
      }),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'loc-city',
        label: 'Cidade',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressCity,
          onInput: (evento) => (formulario.addressCity = evento.target.value),
        }),
      }),
      campo({
        id: 'loc-state',
        label: 'UF',
        control: criarElemento('input', {
          class: 'input',
          maxlength: '2',
          value: formulario.addressState,
          onInput: (evento) => (formulario.addressState = evento.target.value.toUpperCase()),
        }),
      }),
    ]),
    campo({
      id: 'loc-cep',
      label: 'CEP',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.addressPostalCode,
        onInput: (evento) => (formulario.addressPostalCode = evento.target.value.replace(/\D/g, '')),
      }),
    }),
    campo({
      id: 'loc-tz',
      label: 'Fuso horário',
      hint: 'Usado para datas locais deste ponto. Ex.: America/Sao_Paulo.',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.timezone,
        onInput: (evento) => (formulario.timezone = evento.target.value),
      }),
    }),
    campo({
      id: 'loc-notes',
      label: 'Observações',
      control: criarElemento(
        'textarea',
        { class: 'textarea', rows: '2', onInput: (evento) => (formulario.notes = evento.target.value) },
        [formulario.notes],
      ),
    }),
  ]);
  const salvar = async () => {
    if (formulario.name.trim().length < 2) {
      notificacao('Informe o nome do local.', { tone: 'warning' });
      return;
    }
    try {
      if (editar) await dados.locations.update(local.id, formulario);
      else await dados.locations.create(formulario);
      correspondenciaItem.close();
      aoConcluir();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    }
  };
  correspondenciaItem = modal({
    title: editar ? 'Editar local' : 'Novo local',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Salvar', variant: 'primary', onClick: salvar }),
    ]),
  });
}
