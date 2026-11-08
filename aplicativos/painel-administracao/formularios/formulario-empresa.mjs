import {
  el as criarElemento,
  botao,
  campo,
  notificacao,
  modal,
} from '../componentes/componentes-do-painel.mjs';

import { showConflict as mostrarConflito } from './confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos, ErroBackend } from '../comunicacao/comunicacao-com-servidor.mjs';

import { formatarCnpj } from '@peganafrota/validation';

export function abrirEditorEmpresaPlataforma(empresa, aoConcluir) {
  const formulario = {
    legalName: empresa.legalName || '',
    tradeName: empresa.tradeName || '',
    email: empresa.email || '',
    phone: empresa.phone || '',
    timezone: empresa.timezone || 'America/Sao_Paulo',
    addressStreet: empresa.address?.street || '',
    addressNumber: empresa.address?.number || '',
    addressComplement: empresa.address?.complement || '',
    addressDistrict: empresa.address?.district || '',
    addressCity: empresa.address?.city || '',
    addressState: empresa.address?.state || '',
    addressPostalCode: empresa.address?.postalCode || '',
  };
  let correspondenciaItem;
  const entrada = (nome, rotulo, opcoes = {}) =>
    campo({
      id: `edit-company-${nome}`,
      label: rotulo,
      required: opcoes.required,
      hint: opcoes.hint,
      control: criarElemento('input', {
        class: 'input',
        type: opcoes.type || 'text',
        value: formulario[nome],
        maxlength: opcoes.maxlength,
        onInput: (evento) => {
          formulario[nome] = opcoes.upper ? evento.target.value.toUpperCase() : evento.target.value;
        },
      }),
    });

  const corpo = criarElemento('div', {}, [
    criarElemento('p', {
      class: 'muted',
      text: `CNPJ ${formatarCnpj(empresa.cnpj)} é a identidade fiscal e não pode ser alterado.`,
    }),
    criarElemento('div', { class: 'form-row' }, [
      entrada('legalName', 'Razão social', { required: true }),
      entrada('tradeName', 'Nome fantasia', { required: true }),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      entrada('email', 'E-mail', { type: 'email' }),
      entrada('phone', 'Telefone'),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      entrada('addressStreet', 'Logradouro'),
      entrada('addressNumber', 'Número'),
    ]),
    entrada('addressComplement', 'Complemento'),
    criarElemento('div', { class: 'form-row' }, [
      entrada('addressDistrict', 'Bairro'),
      entrada('addressCity', 'Cidade'),
    ]),
    criarElemento('div', { class: 'form-row' }, [
      entrada('addressState', 'UF', { upper: true, maxlength: 2 }),
      entrada('addressPostalCode', 'CEP'),
    ]),
    entrada('timezone', 'Fuso horário', { hint: 'Ex.: America/Sao_Paulo' }),
  ]);

  const salvar = async () => {
    if (!formulario.legalName.trim() || !formulario.tradeName.trim()) {
      notificacao('Razão social e nome fantasia são obrigatórios.', { tone: 'warning' });
      return;
    }
    try {
      await servicos.companies.update(empresa.id, formulario, empresa.updatedAt ?? null);
      correspondenciaItem.close();
      notificacao('Cadastro da empresa atualizado.', { tone: 'success' });
      await aoConcluir();
    } catch (erro) {
      if (erro instanceof ErroBackend && erro.isConflict) {
        mostrarConflito({
          hint: erro.hint,
          message: erro.message,
          detail: erro.detail,
          onPrimary: aoConcluir,
          primaryLabel: 'Recarregar',
        });
        return;
      }
      notificacao(erro?.message || 'Não foi possível atualizar a empresa.', { tone: 'danger' });
    }
  };

  correspondenciaItem = modal({
    title: `Editar ${empresa.tradeName}`,
    size: 'lg',
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({ label: 'Salvar alterações', variant: 'primary', onClick: salvar }),
    ]),
  });
}
