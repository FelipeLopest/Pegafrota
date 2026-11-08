import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import arquivosSistema from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import caminhosSistema from 'node:path';
const raiz = caminhosSistema.resolve(import.meta.dirname, '..');
const telas = arquivosSistema.readFileSync(caminhosSistema.join(raiz, 'telas/exportar-telas.mjs'), 'utf8');
const estilosCss = arquivosSistema.readFileSync(
  caminhosSistema.join(raiz, 'estilos/estilo-principal.css'),
  'utf8',
);
testar('graficos do admin usam modelos sem donut segmentado', () => {
  verificarCondicao.doesNotMatch(telas, /adminDonut\(/);
  verificarCondicao.doesNotMatch(telas, /donut-segment/);
  verificarCondicao.match(telas, /colunasAdministrador\(/);
  verificarCondicao.match(telas, /barrasAdministrador\(/);
});
testar('admin possui page head contextual e summary rail', () => {
  verificarCondicao.match(telas, /ADMIN_PAGE_META/);
  verificarCondicao.match(telas, /resumoAdministrador/);
  verificarCondicao.match(estilosCss, /summary-rail/);
});
