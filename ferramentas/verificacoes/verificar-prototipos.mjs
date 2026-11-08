#!/usr/bin/env node
import { readFileSync as lerArquivoSincrono } from 'node:fs';
import { join as juntarCaminhos, relative as caminhoRelativo, sep as separadorAtual } from 'node:path';
import { listarArquivos } from '../apoio/arquivos.mjs';

const RAIZ = process.cwd();
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'coverage', 'artifacts']);
const PASTAS_PRODUTO = ['aplicativos/programa-empresa', 'aplicativos/painel-administracao', 'packages'];

const ARQUIVOS_PROIBIDOS = [
  { re: /\.dc\.html$/i, what: 'protótipo .dc.html' },
  { re: /(^|\/)support\.js$/i, what: 'support.js do protótipo' },
];

const REFERENCIAS_PROIBIDAS = [
  { re: /['"][^'"]*\.dc\.html['"]/gi, what: 'referência a .dc.html' },
  { re: /(?:from|import|src\s*=)\s*['"][^'"]*\/support\.js['"]/gi, what: 'referência a support.js' },
];

const achados = [];
let escaneados = 0;

for (const diretorio of PASTAS_PRODUTO) {
  for (const arquivo of listarArquivos(juntarCaminhos(RAIZ, diretorio), { ignorar: PASTAS_IGNORADAS })) {
    escaneados += 1;
    const caminhoRelativoAtual = caminhoRelativo(RAIZ, arquivo).split(separadorAtual).join('/');

    for (const regra of ARQUIVOS_PROIBIDOS) {
      if (regra.re.test(caminhoRelativoAtual))
        achados.push({ rel: caminhoRelativoAtual, line: 0, what: regra.what });
    }

    if (!/\.(html|mjs|cjs|js|json|css)$/.test(arquivo)) continue;
    const codigo = lerArquivoSincrono(arquivo, 'utf8');
    for (const regra of REFERENCIAS_PROIBIDAS) {
      regra.re.lastIndex = 0;
      let correspondenciaItem;
      while ((correspondenciaItem = regra.re.exec(codigo)) !== null) {
        const linha = codigo.slice(0, correspondenciaItem.index).split('\n').length;
        achados.push({ rel: caminhoRelativoAtual, line: linha, what: regra.what });
      }
    }
  }
}

if (achados.length === 0) {
  console.log('verify:prototype  PASS');
  console.log(`  arquivos varridos: ${escaneados}`);
  console.log('  nenhum .dc.html, nenhum support.js, nenhuma referência a eles');
  process.exit(0);
}

console.error(`verify:prototype  FAIL — ${achados.length} achado(s)\n`);
for (const formulario of achados) console.error(`  ${formulario.rel}:${formulario.line}  ${formulario.what}`);
process.exit(1);
