#!/usr/bin/env node

import {
  readdirSync as listarPastaSincrona,
  readFileSync as lerArquivoSincrono,
  statSync as consultarArquivoSincrono,
} from 'node:fs';
import { join as juntarCaminhos, relative as caminhoRelativo, extname as obterExtensao } from 'node:path';

const RAIZ = process.argv[2] || process.cwd();

const PASTAS_IGNORADAS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
]);
const EXTENSOES_IGNORADAS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.woff',
  '.woff2',
]);

const REGRAS = [
  {
    id: 'service-role-jwt',
    description: 'JWT com papel service_role',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  },
  {
    id: 'service-role-name',
    description: 'atribuição direta de SUPABASE_SERVICE_ROLE_KEY',
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*['"][^'"\s$]{12,}['"]/g,
  },
  {
    id: 'private-key',
    description: 'chave privada PEM',
    pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    id: 'rtsp-credentials',
    description: 'URL RTSP com usuário e senha',
    pattern: /rtsp:\/\/[^\s:'"]+:[^\s@'"]+@/g,
  },
  {
    id: 'aws-key',
    description: 'access key da AWS',
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    id: 'hardcoded-password',
    description: 'senha em texto claro atribuída a variável',
    pattern: /(?<!DEMO_)(?<!demo_)password\s*[=:]\s*['"](?!\$\{)(?![A-Z_]{3,}\b)[^'"\s]{8,}['"]/gi,
  },
];

const LISTA_PERMITIDA = [
  /PegaNaFrota#2026/, // senha de demonstração, documentada
  /<sua-service-role-key>/,
  /your-service-role-key/,
  /postgresql:\/\/postgres:postgres@/, // credencial padrão do Postgres local
];

const achados = [];

function percorrer(diretorio) {
  for (const entrada of listarPastaSincrona(diretorio)) {
    if (PASTAS_IGNORADAS.has(entrada)) continue;
    const completo = juntarCaminhos(diretorio, entrada);
    const estatistica = consultarArquivoSincrono(completo);
    if (estatistica.isDirectory()) {
      percorrer(completo);
    } else if (!EXTENSOES_IGNORADAS.has(obterExtensao(entrada)) && estatistica.size < 2_000_000) {
      examinarArquivo(completo);
    }
  }
}

function examinarArquivo(arquivo) {
  let conteudo;
  try {
    conteudo = lerArquivoSincrono(arquivo, 'utf8');
  } catch {
    return;
  }
  const linhas = conteudo.split('\n');

  for (const regra of REGRAS) {
    linhas.forEach((linha, indice) => {
      regra.pattern.lastIndex = 0;
      const correspondencia = regra.pattern.exec(linha);
      if (!correspondencia) return;
      if (LISTA_PERMITIDA.some((permitido) => permitido.test(linha))) return;
      achados.push({
        file: caminhoRelativo(RAIZ, arquivo),
        line: indice + 1,
        rule: regra.id,
        description: regra.description,
        excerpt: `${correspondencia[0].slice(0, 24)}…`,
      });
    });
  }
}

percorrer(RAIZ);

if (achados.length === 0) {
  console.log(`Nenhum segredo encontrado em ${caminhoRelativo(process.cwd(), RAIZ) || '.'}`);
  process.exit(0);
}

console.error(`${achados.length} possível(is) segredo(s) encontrado(s):\n`);
for (const achado of achados) {
  console.error(`  ${achado.file}:${achado.line}`);
  console.error(`    ${achado.description} [${achado.rule}]  ${achado.excerpt}\n`);
}
process.exit(1);
