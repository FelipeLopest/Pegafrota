import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '..');
const servicos = lerArquivoSincrono(
  resolverCaminho(raiz, 'comunicacao/comunicacao-com-servidor.mjs'),
  'utf8',
);
const roteador = lerArquivoSincrono(resolverCaminho(raiz, 'navegacao/trocar-tela.mjs'), 'utf8');
const telas = lerArquivoSincrono(resolverCaminho(raiz, 'telas/exportar-telas.mjs'), 'utf8');

testar('dashboard inicial é deduplicado entre verificação de acesso e primeira tela', () => {
  verificarCondicao.match(servicos, /painelEmCurso/);
  verificarCondicao.match(servicos, /cachePainel/);
  verificarCondicao.match(servicos, /expiraEm: Date\.now\(\) \+ 3000/);
});

testar('navegação invalida carregamentos antigos', () => {
  verificarCondicao.match(roteador, /__pnfLoadToken/);
  verificarCondicao.match(telas, /tokenCarregamento/);
});
