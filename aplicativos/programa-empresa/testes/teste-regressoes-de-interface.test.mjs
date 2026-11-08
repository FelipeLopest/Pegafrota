import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const analise = lerArquivoSincrono(new URL('../telas/exportar-telas-analise.mjs', import.meta.url), 'utf8');
const principal = lerArquivoSincrono(new URL('../iniciar-aplicativo.mjs', import.meta.url), 'utf8');
const interfaceVisual = lerArquivoSincrono(
  new URL('../componentes/componentes-do-programa.mjs', import.meta.url),
  'utf8',
);
const estilosCss = lerArquivoSincrono(new URL('../estilos/estilo-principal.css', import.meta.url), 'utf8');
const processoPrincipal = lerArquivoSincrono(new URL('../sistema/abrir-janela.cjs', import.meta.url), 'utf8');

testar('listas mantêm busca, filtros, paginação e ocultação de arquivados', () => {
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
  ])
    verificarCondicao.match(telas, new RegExp(`key: '${chave}'`));
  verificarCondicao.match(telas, /Somente arquivados/);
  verificarCondicao.match(telas, /defaults: \{ visibility: 'current' \}/);
  verificarCondicao.match(telas, /defaults: \{ state: 'current' \}/);
});

testar('navegação mantém grupos, busca global e atalhos', () => {
  verificarCondicao.match(principal, /pnf\.desktop\.nav-groups/);
  verificarCondicao.match(principal, /abrirBuscaNavegacao/);
  verificarCondicao.match(principal, /Ctrl K/);
  verificarCondicao.match(principal, /data-list-search/);
  verificarCondicao.match(principal, /sidebar-collapsed/);
  verificarCondicao.match(principal, /evento2\.key\.toLowerCase\(\) === 'b'/);
  verificarCondicao.match(estilosCss, /data-sidebar=['"]collapsed['"]/);
});

testar('dashboard usa gráficos leves variados e resumo compacto', () => {
  for (const trecho of ['colunasCusto(', 'barraProporcao(', 'barrasHorizontais('])
    verificarCondicao.match(analise, new RegExp(trecho.replace('(', '\\(')));
  verificarCondicao.doesNotMatch(analise, /donutChart\(/);
  for (const rotulo of [
    'Frota ativa',
    'Disponíveis',
    'Viagens agora',
    'Dentro do pátio',
    'Custo no período',
    'Atenções',
  ])
    verificarCondicao.match(analise, new RegExp(rotulo));
  verificarCondicao.match(estilosCss, /pnf-vbar/);
});

testar('coleções mantêm resumos e cabeçalho contextual', () => {
  for (const rotulo of [
    'Em cadastro',
    'CNH até 30 dias',
    'Planejadas',
    'Volume acumulado',
    'Em execução',
    'UFs cobertas',
    'Veículos movimentados',
    'Administradores',
  ])
    verificarCondicao.match(telas, new RegExp(rotulo));
  verificarCondicao.match(interfaceVisual, /PAGE_META/);
  verificarCondicao.match(estilosCss, /page-head-mark/);
  verificarCondicao.match(estilosCss, /summary-rail/);
});

testar('UI evita regressões visuais conhecidas', () => {
  verificarCondicao.doesNotMatch(analise, /class: 'donut-segment'/);
  verificarCondicao.match(estilosCss, /\.content \.card \{\s*content-visibility:\s*visible/);
  verificarCondicao.match(estilosCss, /\.btn-secondary \{/);
  verificarCondicao.match(estilosCss, /var\(--pnf-destaque-sob-ponteiro\)/);
});

testar('Electron limita gravações da geometria durante resize', () => {
  verificarCondicao.match(processoPrincipal, /agendarSalvamentoEstadoJanela/);
  verificarCondicao.match(processoPrincipal, /setTimeout\(salvarEstadoJanela, 180\)/);
});
