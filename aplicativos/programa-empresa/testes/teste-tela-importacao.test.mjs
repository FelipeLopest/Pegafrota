import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const tela = lerArquivoSincrono(
  new URL('../telas/tela-importar-planilha.mjs', import.meta.url),
  'utf8',
);
const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const estilosCss = lerArquivoSincrono(
  new URL('../estilos/estilo-principal.css', import.meta.url),
  'utf8',
);

testar('a importação mantém o modelo Excel visível e inclui instruções, exemplos e CSV', () => {
  verificarCondicao.match(tela, /class: 'import-modelo-pronto'/);
  verificarCondicao.match(tela, /label: 'Baixar modelo Excel'/);
  verificarCondicao.match(tela, /detalhes\('modelo', 'Como preencher a planilha'/);
  verificarCondicao.match(tela, /label: 'Baixar modelo CSV'/);
  verificarCondicao.match(tela, /coluna\.exemplo/);
  verificarCondicao.match(tela, /detalhes\('colagem', 'Colar dados do Excel'/);
  verificarCondicao.match(tela, /detalhes\('trocar', 'Trocar arquivo ou tipo'/);
  verificarCondicao.match(estilosCss, /\.import-details > summary:focus-visible/);
});

testar('a planilha pode ser arrastada ou escolhida por um botão nativo', () => {
  verificarCondicao.match(tela, /type: 'file'/);
  verificarCondicao.match(tela, /onClick: \(\) => entradaArquivo\.click\(\)/);
  verificarCondicao.match(tela, /is-dragging/);
  verificarCondicao.match(estilosCss, /\.import-drop\.is-dragging/);
});

testar('ações de importação nas telas usam variante visual própria', () => {
  const ocorrencias = telas.match(/label: 'Importar planilha',\s*variant: 'automation'/g) || [];
  verificarCondicao.equal(ocorrencias.length, 7);
  verificarCondicao.match(estilosCss, /\.btn-automation/);
});

testar('conferência exibe prévia, erros e progresso e só oferece importação de linhas pendentes', () => {
  verificarCondicao.match(tela, /detalhes\('previa', 'Prévia das linhas prontas'/);
  verificarCondicao.match(tela, /listarErros\('corrigir', 'Linhas que precisam de correção'/);
  verificarCondicao.match(tela, /criarElemento\('progress'/);
  verificarCondicao.match(tela, /prontas\.length && !enviando\s*\? botao\(/);
});
