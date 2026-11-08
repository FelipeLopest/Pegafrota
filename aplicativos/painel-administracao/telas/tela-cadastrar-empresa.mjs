import {
  el as criarElemento,
  botao,
  campo,
  notificacao,
} from '../componentes/componentes-do-painel.mjs';

import { showConflict as mostrarConflito } from '../formularios/confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos, ErroBackend } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';

import {
  validarEtapa1Empresa,
  validarEtapa2Empresa,
  validarEtapaPrimeiroAdministrador,
  validarSenha,
  forcaSenha,
  novaChaveIdempotencia,
} from '@peganafrota/validation';

import { showProvisioningProgress as mostrarProgressoCadastroEmpresa } from '../formularios/formulario-acompanhar-cadastro-empresa.mjs';
import {
  consultarCnpj,
  validarCnpjParaConsulta,
  preencherDadosCnpj,
  limparDadosAutomaticos,
} from '../dados/consultar-cnpj.mjs';

export async function telaCadastrarEmpresa({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Nova empresa');

  const formulario = {
    legalName: '',
    tradeName: '',
    cnpj: '',
    email: '',
    phone: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressDistrict: '',
    addressCity: '',
    addressState: '',
    addressPostalCode: '',
    timezone: 'America/Sao_Paulo',
    fullName: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  };
  let etapa = 1;
  let erros = {};
  const chaveIdempotencia = novaChaveIdempotencia('prov');
  const camposEditados = new Set();
  const camposAutomaticos = new Map();
  const entradasVisiveis = new Map();
  const areaConsulta = criarElemento('div', { 'data-consulta-cnpj': '', 'aria-live': 'polite' });
  let temporizadorConsulta = null;
  let controladorConsulta = null;
  let numeroConsulta = 0;
  let consultando = false;
  let mensagemConsulta = '';
  let ultimoCnpj = '';
  let telaEncerrada = false;

  const conteiner = criarElemento('div', {});
  conteudoTela.replaceChildren(conteiner);

  const entrada = (nome, rotulo, opcoes = {}) => {
    const no = criarElemento('input', {
      class: 'input',
      type: opcoes.type || 'text',
      value: formulario[nome] || '',
      placeholder: opcoes.placeholder || '',
      autocomplete: opcoes.autocomplete || null,
      onInput: (evento) => {
        formulario[nome] = evento.target.value;
        if (nome === 'cnpj') agendarConsulta();
        else camposEditados.add(nome);
      },
    });
    entradasVisiveis.set(nome, no);
    return campo({
      id: `f-${nome}`,
      label: rotulo,
      hint: opcoes.hint,
      error: erros[nome],
      required: opcoes.required,
      control: no,
    });
  };

  function atualizarEntradas() {
    for (const [nome, no] of entradasVisiveis) {
      if (no.value !== formulario[nome]) no.value = formulario[nome] || '';
    }
  }

  function atualizarConsulta() {
    areaConsulta.setAttribute('aria-busy', String(consultando));
    areaConsulta.replaceChildren(
      botao({
        label: consultando ? 'Consultando CNPJ…' : 'Consultar CNPJ',
        busy: consultando,
        onClick: buscarCnpj,
      }),
      criarElemento('p', {
        class: 'muted',
        role: 'status',
        text:
          mensagemConsulta ||
          'Ao completar o CNPJ, buscamos os dados públicos na BrasilAPI. Confira antes de salvar.',
      }),
    );
  }

  function cancelarConsulta() {
    clearTimeout(temporizadorConsulta);
    controladorConsulta?.abort();
    controladorConsulta = null;
    numeroConsulta += 1;
    consultando = false;
  }

  function agendarConsulta() {
    const cnpj = formulario.cnpj;
    if (cnpj === ultimoCnpj) return;
    ultimoCnpj = cnpj;
    cancelarConsulta();
    limparDadosAutomaticos(formulario, camposEditados, camposAutomaticos);
    atualizarEntradas();
    mensagemConsulta = '';
    atualizarConsulta();
    if (validarCnpjParaConsulta(formulario.cnpj))
      temporizadorConsulta = setTimeout(buscarCnpj, 500);
  }

  async function buscarCnpj() {
    clearTimeout(temporizadorConsulta);
    if (telaEncerrada || consultando) return;
    if (!validarCnpjParaConsulta(formulario.cnpj)) {
      mensagemConsulta = 'Informe um CNPJ válido com 14 números para consultar.';
      atualizarConsulta();
      return;
    }
    const cnpj = formulario.cnpj.replace(/\D/g, '');
    cancelarConsulta();
    const consultaAtual = numeroConsulta;
    controladorConsulta = new AbortController();
    consultando = true;
    mensagemConsulta = 'Consultando os dados da empresa…';
    atualizarConsulta();
    try {
      const dados = await consultarCnpj(formulario.cnpj, { sinal: controladorConsulta.signal });
      if (
        telaEncerrada ||
        consultaAtual !== numeroConsulta ||
        !validarCnpjParaConsulta(formulario.cnpj) ||
        formulario.cnpj.replace(/\D/g, '') !== cnpj
      )
        return;
      const preenchidos = preencherDadosCnpj(formulario, dados, camposEditados, camposAutomaticos);
      atualizarEntradas();
      mensagemConsulta = preenchidos
        ? 'Dados encontrados e preenchidos. Confira as informações e complete o que faltar.'
        : 'Dados encontrados. Mantivemos os campos que você já editou.';
    } catch (erro) {
      if (telaEncerrada || consultaAtual !== numeroConsulta || erro.name === 'AbortError') return;
      mensagemConsulta = erro.message;
    } finally {
      if (!telaEncerrada && consultaAtual === numeroConsulta) {
        consultando = false;
        controladorConsulta = null;
        atualizarConsulta();
      }
    }
  }

  function etapas() {
    return criarElemento(
      'ol',
      { class: 'wizard-steps' },
      ['Dados da empresa', 'Endereço', 'Primeiro administrador'].map((rotulo, indiceItem) =>
        criarElemento(
          'li',
          {
            class: 'wizard-step',
            dataset: {
              state:
                etapa === indiceItem + 1 ? 'current' : etapa > indiceItem + 1 ? 'done' : 'todo',
            },
          },
          [
            criarElemento('span', { class: 'wizard-step-index', text: `Etapa ${indiceItem + 1}` }),
            rotulo,
          ],
        ),
      ),
    );
  }

  function renderizar() {
    entradasVisiveis.clear();
    const corpo =
      etapa === 1
        ? criarElemento('div', {}, [
            entrada('cnpj', 'CNPJ', {
              required: true,
              hint: 'Somente números ou formatado. Consulta automática ao completar um CNPJ válido.',
            }),
            areaConsulta,
            entrada('legalName', 'Razão social', { required: true }),
            entrada('tradeName', 'Nome fantasia', { required: true }),
            criarElemento('div', { class: 'form-row' }, [
              entrada('email', 'E-mail da empresa', { type: 'email' }),
              entrada('phone', 'Telefone'),
            ]),
          ])
        : etapa === 2
          ? criarElemento('div', {}, [
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
                entrada('addressState', 'UF', { hint: 'Duas letras.' }),
                entrada('addressPostalCode', 'CEP'),
              ]),
              entrada('timezone', 'Fuso horário', { required: true }),
            ])
          : criarElemento('div', {}, [
              criarElemento('p', {
                class: 'muted',
                text: 'Defina a senha inicial do primeiro administrador. Assim que a empresa for provisionada, ele poderá entrar diretamente no PegaNaFrota Desktop com e-mail e senha. Nenhum link de convite será necessário.',
              }),
              entrada('fullName', 'Nome completo', { required: true }),
              entrada('adminEmail', 'E-mail', {
                type: 'email',
                required: true,
                autocomplete: 'username',
              }),
              entrada('adminPhone', 'Telefone'),
              entrada('adminPassword', 'Senha inicial', {
                type: 'password',
                required: true,
                autocomplete: 'new-password',
                hint: `Mínimo de 12 caracteres. Força atual: ${forcaSenha(formulario.adminPassword)}.`,
              }),
              entrada('adminPasswordConfirm', 'Confirmar senha', {
                type: 'password',
                required: true,
                autocomplete: 'new-password',
                hint: 'Digite novamente a mesma senha.',
              }),
            ]);

    const acoes = criarElemento('div', { class: 'wizard-actions' }, [
      botao({
        label: 'Voltar',
        disabled: etapa === 1,
        onClick: () => {
          cancelarConsulta();
          etapa -= 1;
          renderizar();
        },
      }),
      etapa < 3
        ? botao({ label: 'Continuar', variant: 'primary', onClick: proximo })
        : botao({ label: 'Provisionar empresa', variant: 'primary', onClick: enviar }),
    ]);

    conteiner.replaceChildren(etapas(), criarElemento('div', { class: 'card' }, [corpo, acoes]));
    atualizarConsulta();
  }

  function proximo() {
    const resultadoItem =
      etapa === 1 ? validarEtapa1Empresa(formulario) : validarEtapa2Empresa(formulario);
    erros = resultadoItem.errors;
    if (!resultadoItem.ok) {
      renderizar();
      return;
    }
    erros = {};
    cancelarConsulta();
    etapa += 1;
    renderizar();
  }

  async function enviar() {
    const resultadoItem = validarEtapaPrimeiroAdministrador({
      fullName: formulario.fullName,
      email: formulario.adminEmail,
      phone: formulario.adminPhone,
    });
    const rSenha = validarSenha(formulario.adminPassword, {
      confirm: formulario.adminPasswordConfirm,
    });
    erros = {};
    if (!resultadoItem.ok || !rSenha.ok) {
      erros = {
        fullName: resultadoItem.errors.fullName,
        adminEmail: resultadoItem.errors.email,
        adminPhone: resultadoItem.errors.phone,
        adminPassword: rSenha.errors.password,
        adminPasswordConfirm: rSenha.errors.confirm,
      };
      renderizar();
      return;
    }

    const progresso = mostrarProgressoCadastroEmpresa();

    try {
      const operacao = await servicos.companies.provision({
        idempotencyKey: chaveIdempotencia,
        company: {
          legalName: formulario.legalName,
          tradeName: formulario.tradeName,
          cnpj: formulario.cnpj,
          email: formulario.email || null,
          phone: formulario.phone || null,
          addressStreet: formulario.addressStreet,
          addressNumber: formulario.addressNumber,
          addressComplement: formulario.addressComplement,
          addressDistrict: formulario.addressDistrict,
          addressCity: formulario.addressCity,
          addressState: formulario.addressState,
          addressPostalCode: formulario.addressPostalCode,
          timezone: formulario.timezone,
        },
        firstAdmin: {
          fullName: formulario.fullName,
          email: formulario.adminEmail,
          phone: formulario.adminPhone || null,
          password: formulario.adminPassword,
        },
      });

      progresso.update(operacao);

      if (operacao.status === 'succeeded') {
        progresso.close();
        notificacao(
          'Empresa provisionada. O administrador já pode entrar no Electron com e-mail e senha.',
          {
            tone: 'success',
            duration: 8000,
          },
        );
        navegar(`/empresas/${operacao.companyId}`);
      }
    } catch (erro) {
      progresso.close();
      if (erro instanceof ErroBackend && erro.isConflict) {
        mostrarConflito({
          hint: erro.hint,
          message: erro.message,
          detail: erro.detail,
          primaryLabel: erro.hint === 'cnpj_already_exists' ? 'Abrir empresa existente' : null,
          onPrimary:
            erro.hint === 'cnpj_already_exists' && erro.detail
              ? () => navegar(`/empresas/${erro.detail}`)
              : null,
        });
      } else if (erro instanceof ErroBackend && erro.isValidation) {
        erros = { cnpj: erro.hint === 'invalid_cnpj' ? erro.message : undefined };
        etapa = 1;
        renderizar();
      } else {
        notificacao(erro?.message || 'Falha no provisionamento.', { tone: 'danger' });
      }
    }
  }

  renderizar();
  return () => {
    telaEncerrada = true;
    cancelarConsulta();
  };
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { telaCadastrarEmpresa as screenNewCompany };
