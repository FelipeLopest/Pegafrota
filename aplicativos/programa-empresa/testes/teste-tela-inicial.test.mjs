import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import arquivosSistema from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
const telas = arquivosSistema.readFileSync(
  new URL('../telas/exportar-telas-analise.mjs', import.meta.url),
  'utf8',
);
const estilosCss = arquivosSistema.readFileSync(
  new URL('../estilos/estilo-principal.css', import.meta.url),
  'utf8',
);
testar('dashboard usa modelos variados e não depende de rosca', () => {
  verificarCondicao.match(telas, /colunasCusto\(/);
  verificarCondicao.match(telas, /barraProporcao\(/);
  verificarCondicao.match(telas, /barrasHorizontais\(/);
  verificarCondicao.doesNotMatch(telas, /donutChart\(/);
});
testar('dashboard tem resumo compacto das áreas essenciais', () => {
  for (const textoItem of [
    'Frota ativa',
    'Disponíveis',
    'Viagens agora',
    'Dentro do pátio',
    'Custo no período',
    'Atenções',
  ])
    verificarCondicao.match(telas, new RegExp(textoItem));
});
testar('botões têm contraste reforçado', () => {
  verificarCondicao.match(estilosCss, /\.btn-secondary \{/);
  verificarCondicao.match(estilosCss, /\.btn-primary \{/);
  verificarCondicao.match(estilosCss, /var\(--pnf-destaque-sob-ponteiro\)/);
});
