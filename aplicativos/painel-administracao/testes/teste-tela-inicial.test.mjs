import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import arquivosSistema from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
const telas = arquivosSistema.readFileSync(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const estilosCss = arquivosSistema.readFileSync(
  new URL('../estilos/estilo-principal.css', import.meta.url),
  'utf8',
);
testar('admin usa barras segmentadas, colunas e barras horizontais', () => {
  verificarCondicao.match(telas, /segmentoCicloVida\(/);
  verificarCondicao.match(telas, /colunasAdministrador\(/);
  verificarCondicao.match(telas, /barrasAdministrador\(/);
  verificarCondicao.doesNotMatch(telas, /adminDonut\(/);
});
testar('admin tem resumo compacto', () => {
  for (const textoItem of ['Empresas', 'Ativas', 'Suspensas', 'Convites', 'Falhas'])
    verificarCondicao.match(telas, new RegExp(textoItem));
});
testar('botões admin têm contraste reforçado', () => {
  verificarCondicao.match(estilosCss, /\.btn-secondary \{/);
  verificarCondicao.match(estilosCss, /\.btn-primary \{/);
  verificarCondicao.match(estilosCss, /var\(--tema-destaque-sob-ponteiro\)/);
});
