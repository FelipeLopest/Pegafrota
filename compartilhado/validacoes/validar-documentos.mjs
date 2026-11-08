export function normalizarDigitos(valor) {
  const digitos = String(valor ?? '').replace(/[^0-9]/g, '');
  return digitos.length ? digitos : null;
}

export function normalizarPlaca(valor) {
  const placa = String(valor ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return placa.length ? placa : null;
}

export function normalizarRotulo(valor) {
  const rotulo = String(valor ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return rotulo.length ? rotulo : null;
}

export function normalizarEmail(valor) {
  const email = String(valor ?? '')
    .trim()
    .toLowerCase();
  return email.length ? email : null;
}

export function cnpjValido(valor) {
  const dadosRegistro = normalizarDigitos(valor);
  if (!dadosRegistro || dadosRegistro.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(dadosRegistro)) return false;

  const digitoVerificador = (tamanho, inicioPeso) => {
    let soma = 0;
    let peso = inicioPeso;
    for (let indiceItem = 0; indiceItem < tamanho; indiceItem += 1) {
      soma += Number(dadosRegistro[indiceItem]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const digitoVerificador2 = 11 - (soma % 11);
    return digitoVerificador2 >= 10 ? 0 : digitoVerificador2;
  };

  if (digitoVerificador(12, 5) !== Number(dadosRegistro[12])) return false;
  return digitoVerificador(13, 6) === Number(dadosRegistro[13]);
}

export function formatarCnpj(valor) {
  const dadosRegistro = normalizarDigitos(valor);
  if (!dadosRegistro || dadosRegistro.length !== 14) return String(valor ?? '');
  return `${dadosRegistro.slice(0, 2)}.${dadosRegistro.slice(2, 5)}.${dadosRegistro.slice(5, 8)}/${dadosRegistro.slice(8, 12)}-${dadosRegistro.slice(12)}`;
}

export const PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
// AAA0000
export const PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
// AAA0A00

export function placaValida(valor) {
  const parametroItem = normalizarPlaca(valor);
  if (!parametroItem) return false;
  return PLACA_ANTIGA.test(parametroItem) || PLACA_MERCOSUL.test(parametroItem);
}

export function formatarPlaca(valor) {
  const parametroItem = normalizarPlaca(valor);
  if (!parametroItem) return null;
  if (PLACA_ANTIGA.test(parametroItem)) return 'antiga';
  if (PLACA_MERCOSUL.test(parametroItem)) return 'mercosul';
  return null;
}

export const EXPRESSAO_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

export function emailValido(valor) {
  const evento = normalizarEmail(valor);
  return Boolean(evento) && EXPRESSAO_EMAIL.test(evento);
}

export function telefoneValido(valor) {
  const dadosRegistro = normalizarDigitos(valor);
  return Boolean(dadosRegistro) && dadosRegistro.length >= 10 && dadosRegistro.length <= 13;
}

export function cepValido(valor) {
  const dadosRegistro = normalizarDigitos(valor);
  return Boolean(dadosRegistro) && dadosRegistro.length === 8;
}

export function estadoValido(valor) {
  return /^[A-Z]{2}$/.test(String(valor ?? '').toUpperCase());
}

export function validarMovimentacao(dados) {
  const erros = {};
  if (!dados.vehicleId) erros.vehicleId = 'Selecione o veículo.';
  if (!dados.locationId) erros.locationId = 'Selecione o local.';
  return { ok: Object.keys(erros).length === 0, errors: erros };
}

export function validarIntervaloDatas(de, destino) {
  const erros = {};
  if (de && destino && new Date(de) > new Date(destino)) {
    erros.to = 'O período final deve ser posterior ao inicial.';
  }
  return { ok: Object.keys(erros).length === 0, errors: erros };
}

export function nomeConfirmacaoConfere(digitado, esperado) {
  const digitadoRotulo = normalizarRotulo(digitado);
  const rotuloEsperado = normalizarRotulo(esperado);
  if (!digitadoRotulo || !rotuloEsperado) return false;
  return digitadoRotulo.toLocaleLowerCase('pt-BR') === rotuloEsperado.toLocaleLowerCase('pt-BR');
}

export function novaChaveIdempotencia(prefixo = 'prov') {
  const bytes = new Uint8Array(16);
  (globalThis.crypto ?? {}).getRandomValues?.(bytes);
  const hexadecimal = Array.from(bytes, (segundoItem) => segundoItem.toString(16).padStart(2, '0')).join('');
  return `${prefixo}-${Date.now().toString(36)}-${hexadecimal}`;
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { PLACA_ANTIGA as PLATE_OLD };
export { PLACA_MERCOSUL as PLATE_MERCOSUL };
export { EXPRESSAO_EMAIL as EMAIL_RE };
