export const TAMANHO_MINIMO_SENHA = 12;

export const TAMANHO_MAXIMO_SENHA = 72;

export function validarSenha(senha, { confirm: confirmar } = {}) {
  const erros = {};
  const valor = String(senha ?? '');

  if (!valor) {
    erros.password = 'Informe uma senha.';
  } else if (valor.length < TAMANHO_MINIMO_SENHA) {
    erros.password =
      `A senha precisa de ao menos ${TAMANHO_MINIMO_SENHA} caracteres ` +
      `(faltam ${TAMANHO_MINIMO_SENHA - valor.length}).`;
  } else if (valor.length > TAMANHO_MAXIMO_SENHA) {
    erros.password = `A senha pode ter no máximo ${TAMANHO_MAXIMO_SENHA} caracteres.`;
  } else if (/^\s+$/.test(valor)) {
    erros.password = 'A senha não pode ser só espaços.';
  } else if (/^(.)\1+$/.test(valor)) {
    erros.password = 'A senha não pode ser um único caractere repetido.';
  }

  if (confirmar !== undefined && valor !== String(confirmar ?? '')) {
    erros.confirm = 'As senhas não conferem.';
  }

  return { ok: Object.keys(erros).length === 0, errors: erros, strength: forcaSenha(valor) };
}

export function forcaSenha(senha) {
  const valor = String(senha ?? '');
  if (valor.length < TAMANHO_MINIMO_SENHA) return 'insuficiente';

  const variedade = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((expressaoRegular) =>
    expressaoRegular.test(valor),
  ).length;

  if (valor.length >= 20 || (valor.length >= 16 && variedade >= 3)) return 'forte';
  if (valor.length >= 14 || variedade >= 3) return 'boa';
  return 'aceitável';
}
