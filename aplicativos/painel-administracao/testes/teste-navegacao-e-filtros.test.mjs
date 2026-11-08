import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const roteador = lerArquivoSincrono(new URL('../navegacao/trocar-tela.mjs', import.meta.url), 'utf8');

testar('admin possui filtros recolhíveis nas listagens críticas', () => {
  verificarCondicao.match(telas, /function barraFiltros/);
  verificarCondicao.match(telas, /Estado da conta/);
  verificarCondicao.match(telas, /Acesso à empresa/);
  verificarCondicao.match(telas, /Buscar nesta página por empresa, ID ou erro/);
  verificarCondicao.match(telas, /Ação contém/);
});

testar('admin possui busca global e atalho Ctrl+K', () => {
  verificarCondicao.match(roteador, /abrirBuscaNavegacao/);
  verificarCondicao.match(roteador, /Ctrl K/);
  verificarCondicao.match(roteador, /data-list-search/);
});
