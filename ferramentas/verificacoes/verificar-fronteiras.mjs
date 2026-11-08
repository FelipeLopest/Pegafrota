#!/usr/bin/env node
import {
  readFileSync as lerArquivoSincrono,
  readdirSync as listarPastaSincrona,
  statSync as consultarArquivoSincrono,
  existsSync as arquivoExiste,
} from 'node:fs';
import { join as juntarCaminhos, relative as caminhoRelativo, sep as separadorAtual } from 'node:path';

const RAIZ = process.cwd();
const PASTAS_IGNORADAS = new Set(['node_modules', '.git', 'dist', 'out', 'coverage']);

function percorrer(diretorio, saida = []) {
  if (!arquivoExiste(diretorio)) return saida;
  for (const entrada of listarPastaSincrona(diretorio)) {
    if (PASTAS_IGNORADAS.has(entrada)) continue;
    const completo = juntarCaminhos(diretorio, entrada);
    const estadoAtual = consultarArquivoSincrono(completo);
    if (estadoAtual.isDirectory()) percorrer(completo, saida);
    else saida.push(completo);
  }
  return saida;
}

const normalizado = (parametroItem) => caminhoRelativo(RAIZ, parametroItem).split(separadorAtual).join('/');

const achados = [];
const arquivos = percorrer(RAIZ);

const PASTAS_PRODUTO = ['aplicativos/programa-empresa', 'aplicativos/painel-administracao'];

const RECURSOS_REMOTOS = [
  { re: /<script[^>]+src\s*=\s*["']https?:\/\/[^"']+["']/gi, what: '<script> remoto' },
  { re: /<link[^>]+href\s*=\s*["']https?:\/\/[^"']+["']/gi, what: '<link> remoto' },
  { re: /@import\s+(url\()?["']https?:\/\//gi, what: '@import remoto' },
  {
    re: /src\s*=\s*["']https?:\/\/(cdn|unpkg|jsdelivr|cdnjs|fonts\.googleapis|fonts\.gstatic)/gi,
    what: 'asset de CDN conhecida',
  },
];

for (const arquivo of arquivos) {
  const caminhoRelativoAtual = normalizado(arquivo);
  if (!PASTAS_PRODUTO.some((dadosRegistro) => caminhoRelativoAtual.startsWith(`${dadosRegistro}/`))) continue;
  if (!/\.(html|css|mjs|js|jsx|ts|tsx)$/.test(arquivo)) continue;

  const conteudo = lerArquivoSincrono(arquivo, 'utf8');
  for (const regra of RECURSOS_REMOTOS) {
    regra.re.lastIndex = 0;
    let correspondenciaItem;
    while ((correspondenciaItem = regra.re.exec(conteudo)) !== null) {
      const linha = conteudo.slice(0, correspondenciaItem.index).split('\n').length;
      achados.push({
        gate: 'ZERO_CDN',
        file: caminhoRelativoAtual,
        line: linha,
        message: `${regra.what}: ${correspondenciaItem[0].slice(0, 80)}`,
      });
    }
  }
}

const NOMES_PROIBIDOS = [/\.dc\.html$/i, /(^|\/)support\.js$/i];

for (const arquivo of arquivos) {
  const caminhoRelativoAtual = normalizado(arquivo);
  if (!PASTAS_PRODUTO.some((dadosRegistro) => caminhoRelativoAtual.startsWith(`${dadosRegistro}/`))) continue;
  for (const padrao of NOMES_PROIBIDOS) {
    if (padrao.test(caminhoRelativoAtual)) {
      achados.push({
        gate: 'NO_PROTOTYPE_ARTIFACTS',
        file: caminhoRelativoAtual,
        line: 0,
        message: 'artefato de protótipo copiado para produção',
      });
    }
  }
}

const PROGRAMA_EMPRESA = 'aplicativos/programa-empresa';

for (const arquivo of arquivos) {
  const caminhoRelativoAtual = normalizado(arquivo);
  if (!caminhoRelativoAtual.startsWith(`${PROGRAMA_EMPRESA}/`)) continue;

  if (/platform-admin|admin-web|painel-administracao/i.test(caminhoRelativoAtual)) {
    achados.push({
      gate: 'ADMIN_NOT_IN_ELECTRON',
      file: caminhoRelativoAtual,
      line: 0,
      message: 'arquivo do Admin Web dentro do aplicativo Electron',
    });
  }

  if (!/\.(mjs|js|json|html)$/.test(arquivo)) continue;
  const conteudo = lerArquivoSincrono(arquivo, 'utf8');

  const expressaoImportacao =
    /(?:from|import|require)\s*\(?\s*['"][^'"]*(?:platform-admin-web|admin-web|painel-administracao)[^'"]*['"]/g;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoImportacao.exec(conteudo)) !== null) {
    const linha = conteudo.slice(0, correspondenciaItem.index).split('\n').length;
    achados.push({
      gate: 'ADMIN_NOT_IN_ELECTRON',
      file: caminhoRelativoAtual,
      line: linha,
      message: `Desktop importando do Admin Web: ${correspondenciaItem[0].slice(0, 60)}`,
    });
  }
}

for (const arquivo of arquivos) {
  const caminhoRelativoAtual = normalizado(arquivo);
  if (!caminhoRelativoAtual.startsWith('aplicativos/painel-administracao/')) continue;
  if (!/\.(mjs|js|json)$/.test(arquivo)) continue;
  const conteudo = lerArquivoSincrono(arquivo, 'utf8');
  if (/require\(['"]electron['"]\)|from\s+['"]electron['"]/.test(conteudo)) {
    achados.push({
      gate: 'ADMIN_NOT_IN_ELECTRON',
      file: caminhoRelativoAtual,
      line: 0,
      message: 'Admin Web importando Electron',
    });
  }
}

const VERIFICACOES = ['ZERO_CDN', 'NO_PROTOTYPE_ARTIFACTS', 'ADMIN_NOT_IN_ELECTRON'];

if (achados.length === 0) {
  console.log('verify:boundaries  PASS');
  for (const grupo of VERIFICACOES) console.log(`  ${grupo.padEnd(24)} OK`);
  console.log(`  arquivos varridos: ${arquivos.length}`);
  process.exit(0);
}

console.error(`verify:boundaries  FAIL — ${achados.length} achado(s)\n`);
for (const grupo of VERIFICACOES) {
  const ocorrencias = achados.filter((formulario) => formulario.gate === grupo);
  console.error(
    `  ${grupo.padEnd(24)} ${ocorrencias.length === 0 ? 'OK' : `${ocorrencias.length} achado(s)`}`,
  );
  for (const cabecalhos of ocorrencias)
    console.error(`      ${cabecalhos.file}:${cabecalhos.line}  ${cabecalhos.message}`);
}
process.exit(1);
