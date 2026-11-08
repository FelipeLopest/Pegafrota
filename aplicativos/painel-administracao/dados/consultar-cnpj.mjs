import { cnpjValido, emailValido, normalizarDigitos } from '@peganafrota/validation';

const ENDERECO_CONSULTA = 'https://brasilapi.com.br/api/cnpj/v1/';
const CAMPOS_EMPRESA = [
  'legalName',
  'tradeName',
  'email',
  'phone',
  'addressStreet',
  'addressNumber',
  'addressComplement',
  'addressDistrict',
  'addressCity',
  'addressState',
  'addressPostalCode',
];

export class ErroConsultaCnpj extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.name = 'ErroConsultaCnpj';
    this.codigo = codigo;
  }
}

function texto(valor) {
  return typeof valor === 'string'
    ? valor.trim()
    : typeof valor === 'number' && Number.isFinite(valor)
      ? String(valor)
      : '';
}

export function validarCnpjParaConsulta(valor) {
  return typeof valor === 'string' && /^[0-9./\s-]+$/.test(valor) && cnpjValido(valor);
}

export function normalizarDadosCnpj(resposta, cnpj) {
  if (
    !resposta ||
    typeof resposta !== 'object' ||
    Array.isArray(resposta) ||
    normalizarDigitos(resposta.cnpj) !== cnpj ||
    !texto(resposta.razao_social)
  ) {
    throw new ErroConsultaCnpj(
      'RESPOSTA_INVALIDA',
      'A consulta retornou dados inesperados. Preencha os dados manualmente.',
    );
  }
  const razaoSocial = texto(resposta.razao_social);
  const logradouro = texto(resposta.logradouro);
  const tipoLogradouro = texto(resposta.descricao_tipo_de_logradouro);
  const rua =
    tipoLogradouro &&
    logradouro &&
    !logradouro.toUpperCase().startsWith(tipoLogradouro.toUpperCase() + ' ')
      ? `${tipoLogradouro} ${logradouro}`
      : logradouro;
  const email = texto(resposta.email);
  const telefones = [resposta.ddd_telefone_1, resposta.ddd_telefone_2].map(
    (valor) => normalizarDigitos(texto(valor)) || '',
  );
  const telefone = telefones.find((valor) => valor.length >= 10 && valor.length <= 13) || '';
  const cep = normalizarDigitos(texto(resposta.cep)) || '';
  const estado = texto(resposta.uf).toUpperCase();
  return Object.freeze({
    legalName: razaoSocial,
    tradeName: texto(resposta.nome_fantasia) || razaoSocial,
    email: emailValido(email) ? email : '',
    phone: telefone,
    addressStreet: rua,
    addressNumber: texto(resposta.numero),
    addressComplement: texto(resposta.complemento),
    addressDistrict: texto(resposta.bairro),
    addressCity: texto(resposta.municipio),
    addressState: /^[A-Z]{2}$/.test(estado) ? estado : '',
    addressPostalCode: cep.length === 8 ? cep : '',
  });
}

export function preencherDadosCnpj(formulario, dados, camposEditados, camposAutomaticos) {
  let preenchidos = 0;
  for (const campo of CAMPOS_EMPRESA) {
    if (camposEditados.has(campo)) continue;
    if (formulario[campo] && formulario[campo] !== camposAutomaticos.get(campo)) continue;
    const valor = dados[campo] || '';
    formulario[campo] = valor;
    camposAutomaticos.set(campo, valor);
    if (valor) preenchidos += 1;
  }
  return preenchidos;
}

export function limparDadosAutomaticos(formulario, camposEditados, camposAutomaticos) {
  for (const [campo, valor] of camposAutomaticos) {
    if (!camposEditados.has(campo) && formulario[campo] === valor) formulario[campo] = '';
  }
  camposAutomaticos.clear();
}

export function criarConsultaCnpj({
  requisitar = (...argumentos) => fetch(...argumentos),
  tempoLimite = 8000,
  validadeCache = 10 * 60 * 1000,
  agora = () => Date.now(),
} = {}) {
  const cache = new Map();
  return async function consultar(valor, { sinal } = {}) {
    if (!validarCnpjParaConsulta(valor)) {
      throw new ErroConsultaCnpj('CNPJ_INVALIDO', 'Informe um CNPJ válido com 14 números.');
    }
    if (sinal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
    const cnpj = normalizarDigitos(valor);
    const anterior = cache.get(cnpj);
    if (anterior && anterior.expiraEm > agora()) return anterior.dados;
    const controlador = new AbortController();
    let tempoEsgotado = false;
    const cancelar = () => controlador.abort();
    sinal?.addEventListener('abort', cancelar, { once: true });
    const temporizador = setTimeout(() => {
      tempoEsgotado = true;
      controlador.abort();
    }, tempoLimite);
    try {
      const resposta = await requisitar(ENDERECO_CONSULTA + cnpj, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: controlador.signal,
      });
      if (resposta.status === 404)
        throw new ErroConsultaCnpj(
          'NAO_ENCONTRADO',
          'CNPJ não encontrado. Confira o número ou preencha manualmente.',
        );
      if (resposta.status === 429)
        throw new ErroConsultaCnpj(
          'LIMITE_CONSULTAS',
          'O serviço atingiu o limite de consultas. Tente mais tarde ou preencha manualmente.',
        );
      if (!resposta.ok)
        throw new ErroConsultaCnpj(
          'SERVICO_INDISPONIVEL',
          'A consulta está indisponível. Você pode preencher os dados manualmente.',
        );
      const dados = normalizarDadosCnpj(await resposta.json(), cnpj);
      if (sinal?.aborted || controlador.signal.aborted)
        throw new DOMException('Consulta cancelada.', 'AbortError');
      cache.delete(cnpj);
      if (cache.size >= 30) cache.delete(cache.keys().next().value);
      cache.set(cnpj, { dados, expiraEm: agora() + validadeCache });
      return dados;
    } catch (erro) {
      if (sinal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
      if (tempoEsgotado)
        throw new ErroConsultaCnpj(
          'TEMPO_EXCEDIDO',
          'A consulta demorou para responder. Tente novamente ou preencha manualmente.',
        );
      if (erro instanceof ErroConsultaCnpj) throw erro;
      throw new ErroConsultaCnpj(
        'FALHA_CONSULTA',
        'Não foi possível consultar o CNPJ agora. Você pode preencher os dados manualmente.',
      );
    } finally {
      clearTimeout(temporizador);
      sinal?.removeEventListener('abort', cancelar);
    }
  };
}

export const consultarCnpj = criarConsultaCnpj();
