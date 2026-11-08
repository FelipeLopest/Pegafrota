import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import arquivosSistema from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import caminhosSistema from 'node:path';
const raiz = caminhosSistema.resolve(import.meta.dirname, '..');
const telas = arquivosSistema.readFileSync(
  caminhosSistema.join(raiz, 'telas/exportar-telas-analise.mjs'),
  'utf8',
);
const telasIndice = arquivosSistema.readFileSync(
  caminhosSistema.join(raiz, 'telas/exportar-telas.mjs'),
  'utf8',
);
const estilosCss = arquivosSistema.readFileSync(
  caminhosSistema.join(raiz, 'estilos/estilo-principal.css'),
  'utf8',
);
const interfaceVisual = arquivosSistema.readFileSync(
  caminhosSistema.join(raiz, 'componentes/componentes-do-programa.mjs'),
  'utf8',
);
testar('graficos do desktop nao dependem de donut/SVG vulneravel a artefatos', () => {
  verificarCondicao.doesNotMatch(telas, /donutChart\(/);
  verificarCondicao.doesNotMatch(telas, /class: 'donut-segment'/);
  verificarCondicao.match(telas, /colunasCusto\(/);
  verificarCondicao.match(telas, /barraProporcao\(/);
});
testar('telas de colecao recebem resumo visual', () => {
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
    verificarCondicao.match(telasIndice, new RegExp(rotulo));
});
testar('page head contextual vale para todas as rotas', () => {
  verificarCondicao.match(interfaceVisual, /PAGE_META/);
  verificarCondicao.match(estilosCss, /page-head-mark/);
  verificarCondicao.match(estilosCss, /summary-rail/);
});
testar('cards nao usam content-visibility que quebrava elementos animados', () => {
  verificarCondicao.match(estilosCss, /\.content \.card \{\s*content-visibility:\s*visible/);
});
