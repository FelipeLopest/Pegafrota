import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

export function abrirEditorEmpresa(registro, aoConcluir) {
  const formulario = {
    legalName: registro.legalName || '',
    tradeName: registro.tradeName || '',
    email: registro.email || '',
    phone: registro.phone || '',
    addressStreet: registro.addressStreet || '',
    addressNumber: registro.addressNumber || '',
    addressComplement: registro.addressComplement || '',
    addressDistrict: registro.addressDistrict || '',
    addressCity: registro.addressCity || '',
    addressState: registro.addressState || '',
    addressPostalCode: registro.addressPostalCode || '',
    timezone: registro.timezone || 'America/Sao_Paulo',
  };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'co-ln',
        label: 'Razão social',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.legalName,
          onInput: (evento) => (formulario.legalName = evento.target.value),
        }),
      }),
      campo({
        id: 'co-tn',
        label: 'Nome fantasia',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.tradeName,
          onInput: (evento) => (formulario.tradeName = evento.target.value),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'co-em',
        label: 'E-mail',
        control: criarElemento('input', {
          class: 'input',
          type: 'email',
          value: formulario.email,
          onInput: (evento) => (formulario.email = evento.target.value),
        }),
      }),
      campo({
        id: 'co-ph',
        label: 'Telefone',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.phone,
          onInput: (evento) => (formulario.phone = evento.target.value.replace(/\D/g, '')),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'co-st',
        label: 'Logradouro',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressStreet,
          onInput: (evento) => (formulario.addressStreet = evento.target.value),
        }),
      }),
      campo({
        id: 'co-no',
        label: 'Número',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressNumber,
          onInput: (evento) => (formulario.addressNumber = evento.target.value),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'co-comp',
        label: 'Complemento',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressComplement,
          onInput: (evento) => (formulario.addressComplement = evento.target.value),
        }),
      }),
      campo({
        id: 'co-dist',
        label: 'Bairro',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressDistrict,
          onInput: (evento) => (formulario.addressDistrict = evento.target.value),
        }),
      }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'co-ci',
        label: 'Cidade',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.addressCity,
          onInput: (evento) => (formulario.addressCity = evento.target.value),
        }),
      }),
      campo({
        id: 'co-uf',
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
      id: 'co-cep',
      label: 'CEP',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.addressPostalCode,
        onInput: (evento) => (formulario.addressPostalCode = evento.target.value.replace(/\D/g, '')),
      }),
    }),
    campo({
      id: 'co-tz',
      label: 'Fuso horário',
      control: criarElemento('input', {
        class: 'input',
        value: formulario.timezone,
        onInput: (evento) => (formulario.timezone = evento.target.value),
      }),
    }),
  ]);
  correspondenciaItem = modal({
    title: 'Editar empresa',
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({
        label: 'Salvar alterações',
        variant: 'primary',
        onClick: async () => {
          try {
            await dados.company.update(formulario);
            correspondenciaItem.close();
            notificacao('Empresa atualizada.', { tone: 'success' });
            aoConcluir();
          } catch (erroCapturado) {
            notificacao(erroCapturado.message, { tone: 'danger' });
          }
        },
      }),
    ]),
  });
}
