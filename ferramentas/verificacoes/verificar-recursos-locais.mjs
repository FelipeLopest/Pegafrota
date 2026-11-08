#!/usr/bin/env node
import { readFileSync as lerArquivoSincrono } from 'node:fs';
import { join as juntarCaminhos, relative as caminhoRelativo, sep as separadorAtual } from 'node:path';
import { listarArquivos } from '../apoio/arquivos.mjs';

const RAIZ = process.cwd();
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'coverage', 'artifacts']);
const PASTAS_PRODUTO = ['aplicativos/programa-empresa', 'aplicativos/painel-administracao'];

const REGRAS = [
  { re: /<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi, what: 'script remoto' },
  { re: /<link[^>]+href\s*=\s*["']https?:\/\/[^"']+["']/gi, what: 'folha de estilo remota' },
  { re: /@import\s+(?:url\()?["']https?:\/\/[^"')]+/gi, what: '@import remoto' },
  { re: /url\(\s*["']?https?:\/\/[^"')]+/gi, what: 'url() remota em CSS' },
  { re: /<img[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi, what: 'imagem remota' },
  { re: /import\s+[^'"]*['"]https?:\/\/[^'"]+['"]/g, what: 'import ESM de origem remota' },
];

const achados = [];
let escaneados = 0;

for (const diretorio of PASTAS_PRODUTO) {
  for (const arquivo of listarArquivos(juntarCaminhos(RAIZ, diretorio), { ignorar: PASTAS_IGNORADAS })) {
    if (!/\.(html|css|mjs|cjs|js|jsx)$/.test(arquivo)) continue;
    escaneados += 1;
    const caminhoRelativoAtual = caminhoRelativo(RAIZ, arquivo).split(separadorAtual).join('/');
    const codigo = lerArquivoSincrono(arquivo, 'utf8');
    for (const regra of REGRAS) {
      regra.re.lastIndex = 0;
      let correspondenciaItem;
      while ((correspondenciaItem = regra.re.exec(codigo)) !== null) {
        const linha = codigo.slice(0, correspondenciaItem.index).split('\n').length;
        achados.push({
          rel: caminhoRelativoAtual,
          line: linha,
          what: regra.what,
          snippet: correspondenciaItem[0].slice(0, 70),
        });
      }
    }
  }
}

if (achados.length === 0) {
  console.log('verify:no-cdn  PASS');
  console.log(`  arquivos de produto varridos: ${escaneados}`);
  console.log('  nenhuma origem remota em script, estilo, fonte ou imagem');
  process.exit(0);
}

console.error(`verify:no-cdn  FAIL — ${achados.length} origem(ns) remota(s)\n`);
for (const formulario of achados)
  console.error(`  ${formulario.rel}:${formulario.line}  ${formulario.what}: ${formulario.snippet}`);
process.exit(1);
