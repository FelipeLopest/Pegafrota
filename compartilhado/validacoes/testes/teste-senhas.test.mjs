import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import {
  TAMANHO_MINIMO_SENHA,
  TAMANHO_MAXIMO_SENHA,
  validarSenha,
  forcaSenha,
} from '../exportar-validacoes.mjs';

testar('o mínimo compartilhado é 12, alinhado ao Auth', () => {
  verificarCondicao.equal(TAMANHO_MINIMO_SENHA, 12);
});

testar('senha com 11 caracteres é recusada pelo cliente', () => {
  const resultadoItem = validarSenha('abcdefghijk');
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.match(resultadoItem.errors.password, /12 caracteres/);
});

testar('senha com exatamente 12 é aceita', () => {
  verificarCondicao.equal(validarSenha('abcdefghijkl').ok, true);
});

testar('senha vazia tem mensagem própria', () => {
  const resultadoItem = validarSenha('');
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.match(resultadoItem.errors.password, /Informe uma senha/);
});

testar('senha só de espaços é recusada', () => {
  verificarCondicao.equal(validarSenha('              ').ok, false);
});

testar('limite do bcrypt é respeitado', () => {
  const base = 'PegaNaFrota-senha-';
  const noLimite = base.repeat(10).slice(0, TAMANHO_MAXIMO_SENHA);
  const acimaDoLimite = base.repeat(10).slice(0, TAMANHO_MAXIMO_SENHA + 1);
  verificarCondicao.equal(noLimite.length, TAMANHO_MAXIMO_SENHA);
  verificarCondicao.equal(validarSenha(noLimite).ok, true);
  verificarCondicao.equal(validarSenha(acimaDoLimite).ok, false);
});

testar('caractere único repetido é recusado mesmo com 12+', () => {
  verificarCondicao.equal(validarSenha('aaaaaaaaaaaaaaaa').ok, false);
});

testar('confirmação divergente é apontada no campo certo', () => {
  const resultadoItem = validarSenha('senhabemcomprida', { confirm: 'outracoisa' });
  verificarCondicao.equal(resultadoItem.ok, false);
  verificarCondicao.ok(resultadoItem.errors.confirm);
  verificarCondicao.equal(resultadoItem.errors.password, undefined);
});

testar('confirmação igual passa', () => {
  verificarCondicao.equal(validarSenha('senhabemcomprida', { confirm: 'senhabemcomprida' }).ok, true);
});

testar('não há exigência de maiúscula, número ou símbolo', () => {
  verificarCondicao.equal(validarSenha('todasminusculas').ok, true);
});

testar('força é orientação, não barreira', () => {
  verificarCondicao.equal(forcaSenha('curta'), 'insuficiente');
  verificarCondicao.equal(forcaSenha('abcdefghijkl'), 'aceitável');
  verificarCondicao.equal(forcaSenha('abcdefghijklmn'), 'boa');
  verificarCondicao.equal(forcaSenha('Abcdefghijklmnop#1'), 'forte');
  verificarCondicao.equal(forcaSenha('a'.repeat(20)), 'forte');
});
