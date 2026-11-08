import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import { dirname as obterPastaPai, resolve as resolverCaminho } from 'node:path';

const aqui = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const documentoHtml = lerArquivoSincrono(resolverCaminho(aqui, '../index.html'), 'utf8');

verificarCondicao.ok(
  documentoHtml.includes('<div id="app" aria-busy="true"></div>'),
  'o container inicial deve ficar vazio para o login/app entrar sem tela intermediária',
);
verificarCondicao.ok(!documentoHtml.includes('boot-text'), 'não deve existir texto visual de boot');
verificarCondicao.ok(
  !documentoHtml.includes('Carregando…'),
  'não deve existir a tela Carregando… no HTML inicial',
);
console.log('boot direto: PASS');
