import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const tela = lerArquivoSincrono(new URL('../telas/tela-importar-planilha.mjs', import.meta.url), 'utf8');
const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const estilosCss = lerArquivoSincrono(new URL('../estilos/estilo-principal.css', import.meta.url), 'utf8');

testar('importação usa dropdown decorado e trilha de etapas', () => {
  verificarCondicao.match(tela, /import-select-shell/);
  verificarCondicao.match(tela, /import-stepper/);
  verificarCondicao.match(tela, /import-step-number/);
  verificarCondicao.match(estilosCss, /\.import-select-shell/);
  verificarCondicao.match(estilosCss, /\.import-stepper/);
});

testar('upload usa dropzone visual e seletor de arquivo customizado', () => {
  verificarCondicao.match(tela, /import-drop-icon/);
  verificarCondicao.match(tela, /import-file-trigger/);
  verificarCondicao.match(tela, /is-dragging/);
  verificarCondicao.match(estilosCss, /\.import-file-input/);
  verificarCondicao.match(estilosCss, /\.import-drop\.is-dragging/);
});

testar('ações de importação nas telas usam variante visual própria', () => {
  const ocorrencias = telas.match(/label: 'Importar planilha',\s*variant: 'automation'/g) || [];
  verificarCondicao.equal(ocorrencias.length, 7);
  verificarCondicao.match(estilosCss, /\.btn-automation/);
});

testar('validação e progresso possuem estados visuais sem remover o fluxo', () => {
  verificarCondicao.match(tela, /import-validation-panel is-danger/);
  verificarCondicao.match(tela, /import-validation-panel is-success/);
  verificarCondicao.match(tela, /import-progress-percent/);
  verificarCondicao.match(tela, /Importar \$\{resultado\.validas\.length\} registro\(s\)/);
});
