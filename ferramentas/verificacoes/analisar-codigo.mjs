#!/usr/bin/env node
import { readFileSync as lerArquivoSincrono, existsSync as arquivoExiste } from 'node:fs';
import {
  join as juntarCaminhos,
  dirname as obterPastaPai,
  relative as caminhoRelativo,
  resolve as resolverCaminho,
} from 'node:path';
import { execFileSync as executarArquivoSincrono } from 'node:child_process';
import { listarArquivos } from '../apoio/arquivos.mjs';

const RAIZ = process.cwd();
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'dist', 'out', 'coverage', 'artifacts']);

const arquivos = listarArquivos(RAIZ, { ignorar: PASTAS_IGNORADAS }).filter((formulario) =>
  /\.(mjs|cjs|js)$/.test(formulario),
);
const problemas = [];

function adicionar(arquivo, linha, regra, mensagem) {
  problemas.push({ file: caminhoRelativo(RAIZ, arquivo), line: linha, rule: regra, message: mensagem });
}

for (const arquivo of arquivos) {
  const caminhoRelativoAtual = caminhoRelativo(RAIZ, arquivo);
  const codigo = lerArquivoSincrono(arquivo, 'utf8');

  try {
    executarArquivoSincrono(process.execPath, ['--check', arquivo], { stdio: 'pipe' });
  } catch (erro) {
    const mensagem =
      String(erro.stderr || erro.message)
        .split('\n')
        .find((linhaItem) => linhaItem.includes('Error')) || 'erro de sintaxe';
    adicionar(arquivo, 0, 'syntax', mensagem.trim());
    continue;
  }

  const linhas = codigo.split('\n');
  const somenteCodigo = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const expressaoImportacao = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoImportacao.exec(somenteCodigo)) !== null) {
    const caminhoImportado = correspondenciaItem[1];
    const alvo = resolverCaminho(obterPastaPai(arquivo), caminhoImportado);
    const candidatos = [alvo, `${alvo}.mjs`, `${alvo}.js`, juntarCaminhos(alvo, 'index.mjs')];
    if (!candidatos.some(arquivoExiste)) {
      const linha = somenteCodigo.slice(0, correspondenciaItem.index).split('\n').length;
      adicionar(arquivo, linha, 'unresolved-import', `import relativo não resolve: ${caminhoImportado}`);
    }
  }

  const expressaoWebsocket = /(?:from|import)\s+['"](@peganafrota\/[^'"]+)['"]/g;
  while ((correspondenciaItem = expressaoWebsocket.exec(somenteCodigo)) !== null) {
    const pacotePasta = buscarDiretorioPacote(arquivo);
    if (!pacotePasta) continue;
    const pacote = JSON.parse(lerArquivoSincrono(juntarCaminhos(pacotePasta, 'package.json'), 'utf8'));
    const dependencias = { ...pacote.dependencies, ...pacote.devDependencies };
    // Um subcaminho (`@peganafrota/validation/importacao`) é o mesmo pacote com
    // outro ponto de entrada: o que precisa estar declarado é o pacote.
    const nomePacote = correspondenciaItem[1].split('/').slice(0, 2).join('/');
    if (!dependencias[nomePacote]) {
      const linha = somenteCodigo.slice(0, correspondenciaItem.index).split('\n').length;
      adicionar(
        arquivo,
        linha,
        'undeclared-dependency',
        `${nomePacote} não está em ${caminhoRelativo(RAIZ, pacotePasta)}/package.json`,
      );
    }
  }

  const ehFerramenta =
    /(compilar-aplicativo|abrir-visualizacao-local)\.mjs$/.test(caminhoRelativoAtual) ||
    /\/(testes|dist)\//.test(caminhoRelativoAtual);
  const ehProduto = /^(aplicativos|compartilhado)\//.test(caminhoRelativoAtual) && !ehFerramenta;
  linhas.forEach((linhaItem, indiceItem) => {
    const semComentarios = linhaItem.replace(/\/\/.*$/, '');
    if (ehProduto && /\bconsole\.log\s*\(/.test(semComentarios)) {
      adicionar(arquivo, indiceItem + 1, 'no-console-log', 'console.log em código de produto');
    }
    if (/(^|[;{}])\s*debugger\s*(;|$)/.test(semComentarios)) {
      adicionar(arquivo, indiceItem + 1, 'no-debugger', 'debugger esquecido');
    }
    if (/[ \t]+$/.test(linhaItem))
      adicionar(arquivo, indiceItem + 1, 'trailing-whitespace', 'espaço em branco no fim da linha');
  });

  if (codigo.length && !codigo.endsWith('\n'))
    adicionar(arquivo, linhas.length, 'final-newline', 'arquivo sem nova linha final');
}

function buscarDiretorioPacote(arquivo) {
  let diretorio = obterPastaPai(arquivo);
  while (diretorio.startsWith(RAIZ)) {
    if (arquivoExiste(juntarCaminhos(diretorio, 'package.json')) && diretorio !== RAIZ) return diretorio;
    const pai = obterPastaPai(diretorio);
    if (pai === diretorio) break;
    diretorio = pai;
  }
  return null;
}

const pacoteRaiz = JSON.parse(lerArquivoSincrono(juntarCaminhos(RAIZ, 'package.json'), 'utf8'));
for (const [nome, comando] of Object.entries(pacoteRaiz.scripts || {})) {
  for (const correspondencia of String(comando).matchAll(
    /(?:^|\s)((?:ferramentas|aplicativos|compartilhado)\/[\w./-]+\.mjs)/g,
  )) {
    if (!arquivoExiste(juntarCaminhos(RAIZ, correspondencia[1]))) {
      problemas.push({
        file: 'package.json',
        line: 0,
        rule: 'dead-script',
        message: `script "${nome}" aponta para ${correspondencia[1]}, que não existe`,
      });
    }
  }
}

if (problemas.length === 0) {
  console.log('lint  PASS');
  console.log(`  arquivos analisados: ${arquivos.length}`);
  console.log('  regras: syntax, unresolved-import, undeclared-dependency,');
  console.log('          no-console-log, no-debugger, trailing-whitespace,');
  console.log('          final-newline, dead-script');
  process.exit(0);
}

const porRegra = {};
for (const parametroItem of problemas) (porRegra[parametroItem.rule] ||= []).push(parametroItem);

console.error(`lint  FAIL — ${problemas.length} problema(s)\n`);
for (const [regra, lista] of Object.entries(porRegra)) {
  console.error(`  ${regra} (${lista.length})`);
  for (const parametroItem2 of lista.slice(0, 12))
    console.error(`    ${parametroItem2.file}:${parametroItem2.line}  ${parametroItem2.message}`);
  if (lista.length > 12) console.error(`    … e mais ${lista.length - 12}`);
}
process.exit(1);
