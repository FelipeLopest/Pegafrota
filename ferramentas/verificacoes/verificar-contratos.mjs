import { listarArquivos } from '../apoio/arquivos.mjs';
import {
  readFileSync as lerArquivoSincrono,
  readdirSync as listarPastaSincrona,
  existsSync as arquivoExiste,
} from 'node:fs';
import { join as juntarCaminhos } from 'node:path';

const RAIZ = process.cwd();
const PASTA_MIGRACOES = juntarCaminhos(RAIZ, 'supabase/migrations');
const ARQUIVOS_CLIENTE = listarArquivos(juntarCaminhos(RAIZ, 'aplicativos/programa-empresa'), {
  ignorar: new Set(['dist', 'testes', 'node_modules']),
})
  .filter((arquivo) => arquivo.endsWith('.mjs'))
  .map((arquivo) => arquivo.slice(RAIZ.length + 1));

function carregarMigracoes() {
  return listarPastaSincrona(PASTA_MIGRACOES)
    .filter((formulario) => formulario.endsWith('.sql'))
    .sort()
    .map((formulario) => lerArquivoSincrono(juntarCaminhos(PASTA_MIGRACOES, formulario), 'utf8'))
    .join('\n');
}

const codigoSql = carregarMigracoes();

function interpretarFuncoes(fonte) {
  const limpo = fonte.replace(/^\s*--.*$/gm, '');
  const funcoes = new Map();

  const expressaoRegular =
    /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(limpo)) !== null) {
    const nome = correspondenciaItem[1];
    const parametros = [];
    let profundidade = 0;
    let trechoAcumulado = '';
    for (const caractere of correspondenciaItem[2]) {
      if (caractere === '(') profundidade += 1;
      if (caractere === ')') profundidade -= 1;
      if (caractere === ',' && profundidade === 0) {
        parametros.push(trechoAcumulado);
        trechoAcumulado = '';
      } else trechoAcumulado += caractere;
    }
    if (trechoAcumulado.trim()) parametros.push(trechoAcumulado);

    const interpretado = parametros
      .map((parametroItem) => {
        const itemAtual = parametroItem.trim();
        const nomeCorrespondencia = /^([a-z0-9_]+)\s+/i.exec(itemAtual);
        return {
          name: nomeCorrespondencia ? nomeCorrespondencia[1] : itemAtual.split(/\s+/)[0],
          hasDefault: /\bdefault\b/i.test(itemAtual),
        };
      })
      .filter((parametroItem) => parametroItem.name);

    funcoes.set(nome, interpretado);
  }
  return funcoes;
}

function interpretarTabelas(fonte) {
  const limpo = fonte.replace(/^\s*--.*$/gm, '');
  const tabelas = new Map();

  const expressaoRegular =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\)\s*;/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(limpo)) !== null) {
    const colunas = new Set();
    let profundidade = 0;
    let trechoAcumulado = '';
    const partes = [];
    for (const caractere of correspondenciaItem[2]) {
      if (caractere === '(') profundidade += 1;
      if (caractere === ')') profundidade -= 1;
      if (caractere === ',' && profundidade === 0) {
        partes.push(trechoAcumulado);
        trechoAcumulado = '';
      } else trechoAcumulado += caractere;
    }
    if (trechoAcumulado.trim()) partes.push(trechoAcumulado);

    for (const parametroItem of partes) {
      const itemAtual = parametroItem.trim();
      if (/^(constraint|primary\s+key|unique|foreign\s+key|check|exclude)\b/i.test(itemAtual)) continue;
      const correspondenciaColuna = /^([a-z0-9_]+)\s+/i.exec(itemAtual);
      if (correspondenciaColuna) colunas.add(correspondenciaColuna[1]);
    }
    tabelas.set(correspondenciaItem[1], colunas);
  }

  const expressaoAlteracao =
    /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi;
  while ((correspondenciaItem = expressaoAlteracao.exec(limpo)) !== null) {
    if (!tabelas.has(correspondenciaItem[1])) tabelas.set(correspondenciaItem[1], new Set());
    tabelas.get(correspondenciaItem[1]).add(correspondenciaItem[2]);
  }

  const expressaoVisualizacao =
    /create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)\s+(?:with\s*\([^)]*\)\s*)?as\s+([\s\S]*?);\s*$/gim;
  while ((correspondenciaItem = expressaoVisualizacao.exec(limpo)) !== null) {
    if (!tabelas.has(correspondenciaItem[1])) tabelas.set(correspondenciaItem[1], new Set(['*']));
  }

  return tabelas;
}

const funcoesBanco = interpretarFuncoes(codigoSql);
const tabelasBanco = interpretarTabelas(codigoSql);

const fonteCliente = ARQUIVOS_CLIENTE.filter((formulario) =>
  arquivoExiste(juntarCaminhos(RAIZ, formulario)),
).map((formulario) => ({
  file: formulario,
  code: lerArquivoSincrono(juntarCaminhos(RAIZ, formulario), 'utf8'),
}));

function extrairChamadasFuncaoBanco({ file: arquivo, code: codigo }) {
  const chamadas = [];
  const limpo = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const expressaoRegular = /\b(?:rpc|executarFuncaoBanco)\(\s*['"`]([a-z0-9_]+)['"`]\s*(?:,\s*\{)?/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(limpo)) !== null) {
    const nome = correspondenciaItem[1];
    const argumentos = [];

    if (limpo[correspondenciaItem.index + correspondenciaItem[0].length - 1] === '{') {
      let profundidade = 1;
      let indiceItem = correspondenciaItem.index + correspondenciaItem[0].length;
      let corpo = '';
      while (indiceItem < limpo.length && profundidade > 0) {
        const caractere = limpo[indiceItem];
        if (caractere === '{') profundidade += 1;
        if (caractere === '}') {
          profundidade -= 1;
          if (profundidade === 0) break;
        }
        corpo += caractere;
        indiceItem += 1;
      }
      for (const km of corpo.matchAll(/(^|[,{\s])([a-z_][a-z0-9_]*)\s*:/gi)) argumentos.push(km[2]);
    }

    const linha = limpo.slice(0, correspondenciaItem.index).split('\n').length;
    chamadas.push({ name: nome, args: argumentos, file: arquivo, line: linha });
  }
  return chamadas;
}

function extrairSelecoes({ file: arquivo, code: codigo }) {
  const saida = [];
  const limpo = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const expressaoRegular =
    /\b(?:select|selecionar|selecionarTodos)\(\s*['"`]([a-z0-9_]+)['"`]\s*,\s*\{([\s\S]{0,600}?)\}\s*\)/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(limpo)) !== null) {
    const tabela = correspondenciaItem[1];
    const colunaCorrespondencia = /columns\s*:\s*['"`]([^'"`]+)['"`]/.exec(correspondenciaItem[2]);
    const correspondenciaOrdem = /order\s*:\s*['"`]([a-z0-9_]+)\./.exec(correspondenciaItem[2]);
    const colunas = colunaCorrespondencia
      ? colunaCorrespondencia[1]
          .split(',')
          .map((registro) => registro.trim())
          .filter(Boolean)
      : [];
    const linha = limpo.slice(0, correspondenciaItem.index).split('\n').length;
    saida.push({
      table: tabela,
      cols: colunas,
      orderColumn: correspondenciaOrdem ? correspondenciaOrdem[1] : null,
      file: arquivo,
      line: linha,
    });
  }
  return saida;
}

function extrairColunasFiltro({ file: arquivo, code: codigo }) {
  const saida = [];
  const limpo = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const expressaoRegular = /filters:\s*\{([^}]{0,200})\}/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(limpo)) !== null) {
    for (const km of correspondenciaItem[1].matchAll(/([a-z_][a-z0-9_]*)\s*:/gi)) {
      saida.push({
        column: km[1],
        line: limpo.slice(0, correspondenciaItem.index).split('\n').length,
        file: arquivo,
      });
    }
  }
  return saida;
}

function extrairRelatorios() {
  const arquivo = 'aplicativos/programa-empresa/dados/dados-do-programa.mjs';
  if (!arquivoExiste(juntarCaminhos(RAIZ, arquivo)))
    return { catalog: [], implemented: new Set(), file: arquivo };
  const codigo = lerArquivoSincrono(juntarCaminhos(RAIZ, arquivo), 'utf8');

  const catalogo2 = /export const (?:REPORTS|RELATORIOS) = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(codigo);
  const catalogo = catalogo2
    ? [...catalogo2[1].matchAll(/id:\s*['"`]([A-Za-z0-9_]+)['"`]/g)].map(
        (correspondenciaItem) => correspondenciaItem[1],
      )
    : [];

  const bloquear = [
    null,
    lerArquivoSincrono(
      juntarCaminhos(RAIZ, 'aplicativos/programa-empresa/dados/dados-relatorios.mjs'),
      'utf8',
    ),
  ];
  const implementados = new Set(
    bloquear
      ? [...bloquear[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*\(/gm)].map(
          (correspondenciaItem) => correspondenciaItem[1],
        )
      : [],
  );

  return { catalog: catalogo, implemented: implementados, file: arquivo };
}

const problemas = [];
const adicionar = (categoria, detalhe) => problemas.push({ kind: categoria, detail: detalhe });

const funcaoBancoChamadas = fonteCliente.flatMap(extrairChamadasFuncaoBanco);
const selecoes = fonteCliente.flatMap(extrairSelecoes);
const colunasFiltro = fonteCliente.flatMap(extrairColunasFiltro);
const relatorios = extrairRelatorios();

const selecaoTabelas = new Map(
  selecoes.map((textoItem) => [textoItem.file + textoItem.line, textoItem.table]),
);

for (const chamar of funcaoBancoChamadas) {
  const funcao = funcoesBanco.get(chamar.name);
  if (!funcao) {
    adicionar('rpc-ausente', `${chamar.file}:${chamar.line}  rpc('${chamar.name}') não existe em public`);
    continue;
  }
  const aceito = new Set(funcao.map((parametroItem) => parametroItem.name));
  for (const primeiroItem of chamar.args) {
    if (!aceito.has(primeiroItem)) {
      adicionar(
        'argumento-invalido',
        `${chamar.file}:${chamar.line}  ${chamar.name}: envia '${primeiroItem}'; aceita [${[...aceito].join(', ')}]`,
      );
    }
  }
  const enviado = new Set(chamar.args);
  for (const parametroItem of funcao) {
    if (!parametroItem.hasDefault && !enviado.has(parametroItem.name)) {
      adicionar(
        'argumento-faltando',
        `${chamar.file}:${chamar.line}  ${chamar.name}: parâmetro obrigatório '${parametroItem.name}' não é enviado`,
      );
    }
  }
}

for (const seletor of selecoes) {
  const colunas = tabelasBanco.get(seletor.table);
  if (!colunas) {
    adicionar('tabela-ausente', `${seletor.file}:${seletor.line}  tabela public.${seletor.table} não existe`);
    continue;
  }
  if (colunas.has('*')) continue; // view: colunas não extraídas do SQL
  for (const registro of seletor.cols) {
    if (registro === '*') continue;
    if (!colunas.has(registro)) {
      adicionar('coluna-ausente', `${seletor.file}:${seletor.line}  ${seletor.table}.${registro} não existe`);
    }
  }
  if (seletor.orderColumn && !colunas.has(seletor.orderColumn)) {
    adicionar(
      'coluna-ausente',
      `${seletor.file}:${seletor.line}  ${seletor.table}: order por '${seletor.orderColumn}' inexistente`,
    );
  }
}

for (const formulario of colunasFiltro) {
  const tabela = selecaoTabelas.get(formulario.file + formulario.line);
  if (!tabela) continue;
  const colunas = tabelasBanco.get(tabela);
  if (!colunas || colunas.has('*')) continue;
  if (!colunas.has(formulario.column)) {
    adicionar(
      'coluna-ausente',
      `${formulario.file}:${formulario.line}  ${tabela}: filtro por '${formulario.column}' inexistente`,
    );
  }
}

for (const identificador of relatorios.catalog) {
  if (!relatorios.implemented.has(identificador)) {
    adicionar(
      'relatorio-sem-implementacao',
      `${relatorios.file}  REPORTS oferece '${identificador}', mas data.reports.${identificador} não existe`,
    );
  }
}
for (const identificador2 of relatorios.implemented) {
  if (!relatorios.catalog.includes(identificador2)) {
    adicionar(
      'relatorio-fora-do-catalogo',
      `${relatorios.file}  data.reports.${identificador2} existe mas não aparece em REPORTS — inalcançável pela tela`,
    );
  }
}
{
  const telaArquivo = 'aplicativos/programa-empresa/telas/tela-relatorios.mjs';
  if (arquivoExiste(juntarCaminhos(RAIZ, telaArquivo))) {
    const codigo = lerArquivoSincrono(juntarCaminhos(RAIZ, telaArquivo), 'utf8');
    if (!/REPORTS/.test(codigo)) {
      adicionar(
        'relatorio-desalinhado',
        `${telaArquivo}  a tela de relatórios não consome o catálogo REPORTS`,
      );
    }
  }
}

console.log('test:contracts — Desktop ↔ banco\n');
console.log(`  funções públicas nas migrations: ${funcoesBanco.size}`);
console.log(`  tabelas/views nas migrations:    ${tabelasBanco.size}`);
console.log(`  chamadas rpc() no cliente:       ${funcaoBancoChamadas.length}`);
console.log(`  selects no cliente:              ${selecoes.length}`);
console.log(`  relatórios no catálogo:          ${relatorios.catalog.length}\n`);

if (problemas.length === 0) {
  console.log('test:contracts  PASS — todo contrato do cliente existe no banco');
  process.exit(0);
}

const porTipo = {};
for (const parametroItem of problemas) (porTipo[parametroItem.kind] ||= []).push(parametroItem);

console.error(`test:contracts  FAIL — ${problemas.length} divergência(s)\n`);
for (const [categoria, lista] of Object.entries(porTipo)) {
  console.error(`  ${categoria} (${lista.length})`);
  for (const parametroItem2 of lista) console.error(`    ${parametroItem2.detail}`);
  console.error('');
}
process.exit(1);
