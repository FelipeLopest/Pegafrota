import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const roteador = lerArquivoSincrono(new URL('../navegacao/trocar-tela.mjs', import.meta.url), 'utf8');
const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const estilosCss = lerArquivoSincrono(new URL('../estilos/estilo-principal.css', import.meta.url), 'utf8');

testar('v11 Admin possui sidebar compactável persistida', () => {
  verificarCondicao.match(roteador, /pnf\.admin\.sidebar-collapsed/);
  verificarCondicao.match(roteador, /evento2\.key\.toLowerCase\(\) === 'b'/);
  verificarCondicao.match(estilosCss, /admin-shell\[data-sidebar=['"]collapsed['"]\]/);
});

testar('v11 Admin possui gráficos no overview sem biblioteca externa', () => {
  verificarCondicao.match(telas, /function colunasAdministrador/);
  verificarCondicao.match(telas, /function barrasAdministrador/);
  verificarCondicao.match(estilosCss, /admin-dashboard-grid/);
  verificarCondicao.match(estilosCss, /t-column-grow/);
});
