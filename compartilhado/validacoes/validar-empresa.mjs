import {
  normalizarRotulo,
  normalizarDigitos,
  cnpjValido,
  emailValido,
  telefoneValido,
  estadoValido,
  cepValido,
  normalizarEmail,
} from './validar-documentos.mjs';

export function validarEtapa1Empresa(dados) {
  const erros = {};
  const razaoSocial = normalizarRotulo(dados.legalName);
  const nomeFantasia = normalizarRotulo(dados.tradeName);

  if (!razaoSocial || razaoSocial.length < 3 || razaoSocial.length > 200) {
    erros.legalName = 'Informe a razão social (3 a 200 caracteres).';
  }
  if (!nomeFantasia || nomeFantasia.length < 2 || nomeFantasia.length > 200) {
    erros.tradeName = 'Informe o nome fantasia (2 a 200 caracteres).';
  }
  if (!normalizarDigitos(dados.cnpj)) {
    erros.cnpj = 'Informe o CNPJ.';
  } else if (!cnpjValido(dados.cnpj)) {
    erros.cnpj = 'CNPJ inválido. Confira os dígitos verificadores.';
  }
  if (dados.email && !emailValido(dados.email)) {
    erros.email = 'E-mail inválido.';
  }
  if (dados.phone && !telefoneValido(dados.phone)) {
    erros.phone = 'Telefone deve ter de 10 a 13 dígitos.';
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}

export function validarEtapa2Empresa(dados) {
  const erros = {};
  if (dados.addressState && !estadoValido(dados.addressState)) {
    erros.addressState = 'UF deve ter duas letras.';
  }
  if (dados.addressPostalCode && !cepValido(dados.addressPostalCode)) {
    erros.addressPostalCode = 'CEP deve ter 8 dígitos.';
  }
  if (!normalizarRotulo(dados.timezone)) {
    erros.timezone = 'Selecione o fuso horário.';
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}

export function validarEtapaPrimeiroAdministrador(dados) {
  const erros = {};
  const nomeCompleto = normalizarRotulo(dados.fullName);
  if (!nomeCompleto || nomeCompleto.length < 2 || nomeCompleto.length > 150) {
    erros.fullName = 'Informe o nome completo (2 a 150 caracteres).';
  }
  if (!normalizarEmail(dados.email)) {
    erros.email = 'Informe o e-mail do administrador.';
  } else if (!emailValido(dados.email)) {
    erros.email = 'E-mail inválido.';
  }
  if (dados.phone && !telefoneValido(dados.phone)) {
    erros.phone = 'Telefone deve ter de 10 a 13 dígitos.';
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}
