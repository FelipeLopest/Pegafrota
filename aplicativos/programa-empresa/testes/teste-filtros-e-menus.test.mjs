import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const principal = lerArquivoSincrono(new URL('../iniciar-aplicativo.mjs', import.meta.url), 'utf8');
const estilosCss = lerArquivoSincrono(new URL('../estilos/estilo-principal.css', import.meta.url), 'utf8');

testar('listas operacionais usam explorador com busca, filtros e paginação', () => {
  verificarCondicao.match(telas, /function exploradorColecao/);
  for (const chave of [
    'vehicles',
    'drivers',
    'trips',
    'fuelings',
    'maintenance',
    'locations',
    'movements',
    'users',
    'yard',
  ]) {
    verificarCondicao.match(telas, new RegExp(`key: '${chave}'`));
  }
});

testar('arquivados podem ficar ocultos sem perder acesso ao histórico', () => {
  verificarCondicao.match(telas, /defaults: \{ visibility: 'current' \}/);
  verificarCondicao.match(telas, /Somente arquivados/);
  verificarCondicao.match(telas, /defaults: \{ state: 'current' \}/);
});

testar('menu tem grupos recolhíveis, busca global e atalhos de teclado', () => {
  verificarCondicao.match(principal, /pnf\.desktop\.nav-groups/);
  verificarCondicao.match(principal, /abrirBuscaNavegacao/);
  verificarCondicao.match(principal, /Ctrl K/);
  verificarCondicao.match(principal, /data-list-search/);
  verificarCondicao.match(estilosCss, /\.filter-drawer/);
  verificarCondicao.match(estilosCss, /\.nav-section/);
});
