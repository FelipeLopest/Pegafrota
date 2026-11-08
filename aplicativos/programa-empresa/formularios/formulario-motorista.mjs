import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

export function abrirEditorMotorista({ driver: motorista, onDone: aoConcluir }) {
  const editar = !!motorista;
  const formulario = {
    fullName: motorista?.full_name || '',
    internalDocument: motorista?.internal_document || '',
    phone: motorista?.phone || '',
    licenseCategory: motorista?.license_category || '',
    licenseExpiresOn: motorista?.license_expires_on || '',
    notes: motorista?.notes || '',
  };
  let correspondenciaItem;
  const corpo = criarElemento('div', {}, [
    campo({
      id: 'de-name',
      label: 'Nome completo',
      required: true,
      control: criarElemento('input', {
        class: 'input',
        value: formulario.fullName,
        onInput: (evento) => (formulario.fullName = evento.target.value),
      }),
    }),
    criarElemento('div', { class: 'form-row' }, [
      campo({
        id: 'de-doc',
        label: 'Documento interno',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.internalDocument,
          onInput: (evento) => (formulario.internalDocument = evento.target.value),
        }),
      }),
      campo({
        id: 'de-phone',
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
        id: 'de-cat',
        label: 'Categoria CNH',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.licenseCategory,
          onInput: (evento) => (formulario.licenseCategory = evento.target.value.toUpperCase()),
        }),
      }),
      campo({
        id: 'de-exp',
        label: 'Validade CNH',
        control: criarElemento('input', {
          class: 'input',
          type: 'date',
          value: formulario.licenseExpiresOn,
          onInput: (evento) => (formulario.licenseExpiresOn = evento.target.value),
        }),
      }),
    ]),
    campo({
      id: 'de-notes',
      label: 'Observações',
      control: criarElemento(
        'textarea',
        { class: 'textarea', rows: '2', onInput: (evento) => (formulario.notes = evento.target.value) },
        [formulario.notes],
      ),
    }),
  ]);
  const salvar = async () => {
    if (formulario.fullName.trim().length < 2) {
      notificacao('Informe o nome completo.', { tone: 'warning' });
      return;
    }
    try {
      if (editar) await dados.drivers.update(motorista.id, formulario);
      else await dados.drivers.create(formulario);
      correspondenciaItem.close();
      notificacao(editar ? 'Motorista atualizado.' : 'Motorista cadastrado.', { tone: 'success' });
      aoConcluir?.();
    } catch (erroCapturado) {
      notificacao(erroCapturado.message, { tone: 'danger' });
    }
  };
  correspondenciaItem = modal({
    title: editar ? 'Editar motorista' : 'Novo motorista',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Salvar', variant: 'primary', onClick: salvar }),
    ]),
  });
}
