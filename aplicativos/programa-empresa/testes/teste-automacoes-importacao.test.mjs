import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import {
  existsSync as arquivoExiste,
  readFileSync as lerArquivoSincrono,
  statSync as consultarArquivoSincrono,
} from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '..');
const repositorio = resolverCaminho(raiz, '../..');
const ler = (caminho) => lerArquivoSincrono(resolverCaminho(raiz, caminho), 'utf8');

const modelos = ['veiculos', 'motoristas', 'locais', 'abastecimentos', 'manutencoes', 'viagens', 'equipe'];

testar('central aceita XLSX, CSV e colagem e possui os sete fluxos de alto volume', () => {
  const tela = ler('telas/tela-importar-planilha.mjs');
  verificarCondicao.match(tela, /\.xlsx/);
  verificarCondicao.match(tela, /lerPlanilhaXlsx/);
  verificarCondicao.match(tela, /Conferir dados colados/);
  verificarCondicao.match(tela, /10\.000 linhas/);
  for (const identificador of modelos)
    verificarCondicao.ok(tela.includes(`${identificador}:`), identificador);
});

testar('modelos Excel oficiais estão empacotados e não são placeholders vazios', () => {
  for (const identificador of modelos) {
    const caminho = resolverCaminho(raiz, `importacao/modelos-de-planilha/modelo-${identificador}.xlsx`);
    verificarCondicao.ok(arquivoExiste(caminho), caminho);
    verificarCondicao.ok(
      consultarArquivoSincrono(caminho).size > 10000,
      `${identificador}: modelo muito pequeno`,
    );
  }
});

testar('telas volumosas oferecem atalho contextual para a importação correta', () => {
  const telas = ler('telas/exportar-telas.mjs');
  for (const identificador of modelos)
    verificarCondicao.match(telas, new RegExp(`/importar\\?tipo=${identificador}`));
});

testar('operador pode abrir a central, mas cada modelo continua filtrado por permissão', () => {
  const principal2 = ler('iniciar-aplicativo.mjs');
  const tela = ler('telas/tela-importar-planilha.mjs');
  verificarCondicao.match(principal2, /label: 'Importar planilha'[\s\S]*permission: null[\s\S]*operator/);
  verificarCondicao.match(tela, /contexto\.can\(PERMISSAO_POR_MODELO\[correspondenciaItem\.id\]\)/);
});

testar('salvar modelo XLSX usa IPC dedicado e whitelist', () => {
  const canais = ler('sistema/canais-de-comunicacao.cjs');
  const ponteSegura = ler('sistema/ponte-segura.cjs');
  const principal = ler('sistema/abrir-janela.cjs');
  verificarCondicao.match(canais, /IMPORT_TEMPLATE_SAVE/);
  verificarCondicao.match(ponteSegura, /saveImportTemplate/);
  verificarCondicao.match(principal, /IMPORT_TEMPLATE_SAVE/);
  for (const identificador of modelos)
    verificarCondicao.ok(principal.includes(`'${identificador}'`), identificador);
  verificarCondicao.match(principal, /copyFile/);
});

testar('build leva o parser XLSX e os templates, sem adicionar biblioteca de planilha', () => {
  const compilacao = ler('compilar-aplicativo.mjs');
  const pacote = JSON.parse(lerArquivoSincrono(resolverCaminho(repositorio, 'package.json'), 'utf8'));
  verificarCondicao.match(compilacao, /listarArquivos/);
  verificarCondicao.ok(
    arquivoExiste(resolverCaminho(repositorio, 'compartilhado/validacoes/ler-planilha.mjs')),
  );
  const dependencias = { ...(pacote.dependencies || {}), ...(pacote.devDependencies || {}) };
  for (const nome of Object.keys(dependencias)) verificarCondicao.doesNotMatch(nome, /xlsx|exceljs|sheetjs/i);
});

testar('abastecimentos preservam sequência por veículo e importação tem concorrência controlada', () => {
  const tela = ler('telas/tela-importar-planilha.mjs');
  verificarCondicao.match(tela, /async function enviarAbastecimentos/);
  verificarCondicao.match(tela, /grupo\.sort/);
  verificarCondicao.match(tela, /CONCORRENCIA_POR_MODELO/);
  verificarCondicao.doesNotMatch(tela, /Promise\.all\(resultado\.validas\.map/);
});
