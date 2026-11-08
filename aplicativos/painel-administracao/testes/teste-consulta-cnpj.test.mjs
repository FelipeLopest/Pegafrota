import teste from 'node:test';
import verificar from 'node:assert/strict';
import {
  criarConsultaCnpj,
  normalizarDadosCnpj,
  validarCnpjParaConsulta,
  preencherDadosCnpj,
  limparDadosAutomaticos,
} from '../dados/consultar-cnpj.mjs';

const CNPJ = '19131243000197';
const RESPOSTA = {
  cnpj: CNPJ,
  razao_social: 'OPEN KNOWLEDGE BRASIL',
  nome_fantasia: 'REDE PELO CONHECIMENTO LIVRE',
  uf: 'SP',
  cep: '01311902',
  email: null,
  bairro: 'BELA VISTA',
  numero: '37',
  municipio: 'SAO PAULO',
  logradouro: 'PAULISTA 37',
  descricao_tipo_de_logradouro: 'AVENIDA',
  complemento: 'ANDAR 4',
  ddd_telefone_1: '1123851939',
  qsa: [{ nome_socio: 'Não importar' }],
};
const responder = (dados = RESPOSTA, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => dados,
});

teste('CNPJ: aceita formatação e rejeita dígitos incorretos, letras e vazio', () => {
  verificar.equal(validarCnpjParaConsulta('19.131.243/0001-97'), true);
  for (const valor of ['', '19131243000196', '00000000000000', CNPJ + 'a', null])
    verificar.equal(validarCnpjParaConsulta(valor), false);
});

teste('CNPJ: converte somente campos de cadastro, sem importar sócios ou situação', () => {
  const dados = normalizarDadosCnpj(RESPOSTA, CNPJ);
  verificar.deepEqual(dados, {
    legalName: 'OPEN KNOWLEDGE BRASIL',
    tradeName: 'REDE PELO CONHECIMENTO LIVRE',
    email: '',
    phone: '1123851939',
    addressStreet: 'AVENIDA PAULISTA 37',
    addressNumber: '37',
    addressComplement: 'ANDAR 4',
    addressDistrict: 'BELA VISTA',
    addressCity: 'SAO PAULO',
    addressState: 'SP',
    addressPostalCode: '01311902',
  });
  verificar.equal(Object.isFrozen(dados), true);
});

teste('CNPJ: lida com campos opcionais ausentes e não duplica tipo de logradouro', () => {
  const dados = normalizarDadosCnpj(
    {
      ...RESPOSTA,
      nome_fantasia: '',
      email: 'inválido',
      uf: 'inválida',
      cep: '12',
      logradouro: 'AVENIDA PAULISTA',
      numero: 37,
      ddd_telefone_1: '',
      ddd_telefone_2: '(11) 99999-9999',
    },
    CNPJ,
  );
  verificar.equal(dados.tradeName, RESPOSTA.razao_social);
  verificar.equal(dados.addressStreet, 'AVENIDA PAULISTA');
  verificar.equal(dados.addressNumber, '37');
  verificar.equal(dados.phone, '11999999999');
  verificar.equal(dados.email, '');
  verificar.equal(dados.addressState, '');
  verificar.equal(dados.addressPostalCode, '');
});

teste('CNPJ: rejeita retorno de outra empresa e resposta incompleta', () => {
  for (const dados of [
    null,
    [],
    {},
    { ...RESPOSTA, cnpj: '11444777000161' },
    { ...RESPOSTA, razao_social: '' },
  ]) {
    verificar.throws(() => normalizarDadosCnpj(dados, CNPJ), { codigo: 'RESPOSTA_INVALIDA' });
  }
});

teste('CNPJ: consulta pública sem credenciais e reutiliza cache enquanto válido', async () => {
  const chamadas = [];
  let instante = 100;
  const consultar = criarConsultaCnpj({
    agora: () => instante,
    validadeCache: 1000,
    requisitar: async (...argumentos) => {
      chamadas.push(argumentos);
      return responder();
    },
  });
  await consultar(CNPJ);
  await consultar('19.131.243/0001-97');
  verificar.equal(chamadas.length, 1);
  verificar.equal(chamadas[0][0], 'https://brasilapi.com.br/api/cnpj/v1/' + CNPJ);
  verificar.deepEqual(chamadas[0][1].headers, { Accept: 'application/json' });
  verificar.equal(chamadas[0][1].credentials, 'omit');
  verificar.equal(chamadas[0][1].referrerPolicy, 'no-referrer');
  instante += 1001;
  await consultar(CNPJ);
  verificar.equal(chamadas.length, 2);
});

teste('CNPJ: número inválido nunca inicia uma requisição', async () => {
  let chamadas = 0;
  const consultar = criarConsultaCnpj({
    requisitar: async () => {
      chamadas++;
      return responder();
    },
  });
  await verificar.rejects(consultar('123'), { codigo: 'CNPJ_INVALIDO' });
  verificar.equal(chamadas, 0);
});

for (const [status, codigo] of [
  [404, 'NAO_ENCONTRADO'],
  [429, 'LIMITE_CONSULTAS'],
  [500, 'SERVICO_INDISPONIVEL'],
]) {
  teste(`CNPJ: erro HTTP ${status} permite cadastro manual e nova tentativa`, async () => {
    let chamadas = 0;
    const consultar = criarConsultaCnpj({
      requisitar: async () => (++chamadas === 1 ? responder({}, status) : responder()),
    });
    await verificar.rejects(consultar(CNPJ), { codigo });
    verificar.equal((await consultar(CNPJ)).legalName, RESPOSTA.razao_social);
    verificar.equal(chamadas, 2);
  });
}

teste('CNPJ: falha de rede ou JSON inválido gera erro compreensível', async () => {
  for (const requisitar of [
    async () => {
      throw new TypeError('Failed to fetch');
    },
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('JSON');
      },
    }),
  ]) {
    await verificar.rejects(criarConsultaCnpj({ requisitar })(CNPJ), { codigo: 'FALHA_CONSULTA' });
  }
});

const aguardarCancelamento = async (_endereco, { signal: sinal }) =>
  new Promise((_resolver, rejeitar) => {
    sinal.addEventListener('abort', () => rejeitar(new DOMException('Cancelado', 'AbortError')), {
      once: true,
    });
  });

teste('CNPJ: tempo limite encerra consulta sem bloquear formulário', async () => {
  await verificar.rejects(
    criarConsultaCnpj({ requisitar: aguardarCancelamento, tempoLimite: 10 })(CNPJ),
    { codigo: 'TEMPO_EXCEDIDO' },
  );
});

teste('CNPJ: cancelamento interrompe a requisição e não guarda resposta tardia', async () => {
  const controlador = new AbortController();
  const consultar = criarConsultaCnpj({ requisitar: aguardarCancelamento });
  const pendente = consultar(CNPJ, { sinal: controlador.signal });
  controlador.abort();
  await verificar.rejects(pendente, { name: 'AbortError' });
  let chamadas = 0;
  const outroControlador = new AbortController();
  const consultarTardio = criarConsultaCnpj({
    requisitar: async () => {
      chamadas++;
      if (chamadas === 1) outroControlador.abort();
      return responder();
    },
  });
  await verificar.rejects(consultarTardio(CNPJ, { sinal: outroControlador.signal }), {
    name: 'AbortError',
  });
  await consultarTardio(CNPJ);
  verificar.equal(chamadas, 2);
});

teste('CNPJ: sinal já cancelado não inicia consulta', async () => {
  const controlador = new AbortController();
  controlador.abort();
  const consultar = criarConsultaCnpj({
    requisitar: async () => {
      verificar.fail('Não deveria consultar');
    },
  });
  await verificar.rejects(consultar(CNPJ, { sinal: controlador.signal }), { name: 'AbortError' });
});

teste('CNPJ: preserva campos digitados, inclusive os apagados durante a consulta', () => {
  const formulario = {
    legalName: 'Razão digitada',
    tradeName: '',
    phone: '11988888888',
    email: '',
  };
  const editados = new Set(['legalName', 'tradeName']);
  const automaticos = new Map();
  preencherDadosCnpj(formulario, normalizarDadosCnpj(RESPOSTA, CNPJ), editados, automaticos);
  verificar.equal(formulario.legalName, 'Razão digitada');
  verificar.equal(formulario.tradeName, '');
  verificar.equal(formulario.phone, '11988888888');
  verificar.equal(formulario.addressCity, 'SAO PAULO');
  verificar.equal(formulario.fullName, undefined);
  verificar.equal(formulario.timezone, undefined);
});

teste('CNPJ: troca de empresa apaga somente dados automáticos e mantém correções manuais', () => {
  const formulario = {};
  const editados = new Set();
  const automaticos = new Map();
  preencherDadosCnpj(formulario, normalizarDadosCnpj(RESPOSTA, CNPJ), editados, automaticos);
  formulario.addressCity = 'Cidade corrigida';
  editados.add('addressCity');
  formulario.phone = '11988888888';
  limparDadosAutomaticos(formulario, editados, automaticos);
  verificar.equal(formulario.legalName, '');
  verificar.equal(formulario.addressStreet, '');
  verificar.equal(formulario.addressCity, 'Cidade corrigida');
  verificar.equal(formulario.phone, '11988888888');
  verificar.equal(automaticos.size, 0);
});
