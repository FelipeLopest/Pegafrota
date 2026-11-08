import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const principal = lerArquivoSincrono(new URL('../iniciar-aplicativo.mjs', import.meta.url), 'utf8');
const painel = lerArquivoSincrono(new URL('../telas/exportar-telas-analise.mjs', import.meta.url), 'utf8');
const estilosCss = lerArquivoSincrono(new URL('../estilos/estilo-principal.css', import.meta.url), 'utf8');
const processoPrincipal = lerArquivoSincrono(new URL('../sistema/abrir-janela.cjs', import.meta.url), 'utf8');

testar('v11 Desktop possui menu lateral compactável e atalho Ctrl+B', () => {
  verificarCondicao.match(principal, /sidebar-collapsed/);
  verificarCondicao.match(principal, /evento2\.key\.toLowerCase\(\) === 'b'/);
  verificarCondicao.match(estilosCss, /data-sidebar=['"]collapsed['"]/);
});

testar('v11 Desktop possui gráficos leves e animações respeitando o design', () => {
  verificarCondicao.match(painel, /function colunasCusto/);
  verificarCondicao.match(painel, /function barrasHorizontais/);
  verificarCondicao.match(painel, /barraProporcao\(/);
  verificarCondicao.match(estilosCss, /pnf-vbar/);
  verificarCondicao.match(estilosCss, /pnf-route-in/);
});

testar('v11 Electron reduz gravações do estado da janela durante resize', () => {
  verificarCondicao.match(processoPrincipal, /agendarSalvamentoEstadoJanela/);
  verificarCondicao.match(processoPrincipal, /setTimeout\(salvarEstadoJanela, 180\)/);
});
