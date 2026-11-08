import { createHash as criarResumo } from 'node:crypto';
import { existsSync as existe, readFileSync as lerArquivo } from 'node:fs';
import { dirname as pastaPai, join as juntar, resolve as resolver } from 'node:path';
import { listarArquivos } from '../apoio/arquivos.mjs';
import { validarImportsLocais } from '../apoio/compilar-aplicativo.mjs';

const raiz = process.cwd();
const problemas = [];
const pacote = JSON.parse(lerArquivo(juntar(raiz, 'package.json'), 'utf8'));
const dependencias = JSON.parse(lerArquivo(juntar(raiz, 'package-lock.json'), 'utf8'));
for (const pasta of pacote.workspaces) {
  if (!existe(juntar(raiz, pasta, 'package.json'))) problemas.push('Pacote ausente: ' + pasta);
  if (!dependencias.packages[pasta]) problemas.push('Pacote ausente do lockfile: ' + pasta);
}
for (const [nome, comando] of Object.entries(pacote.scripts)) {
  for (const trecho of comando.matchAll(/(?:node\s+|--test\s+)([\w/.-]+\.mjs)/g))
    if (!existe(juntar(raiz, trecho[1])))
      problemas.push(`Comando ${nome} aponta para arquivo ausente: ${trecho[1]}`);
}
for (const pasta of ['aplicativos', 'compartilhado', 'ferramentas', 'supabase/functions', 'supabase/tests']) {
  for (const arquivo of listarArquivos(juntar(raiz, pasta), {
    ignorar: new Set(['dist', 'node_modules', 'artifacts']),
  }).filter((arquivo) => /\.(mjs|cjs|js|ts)$/.test(arquivo))) {
    const codigo = lerArquivo(arquivo, 'utf8');
    for (const trecho of codigo.matchAll(/(?:from\s*|import\s*|require\s*\()(['"])(\.[^'"]+)\1/g)) {
      const destino = resolver(pastaPai(arquivo), trecho[2]);
      // Strings de programas de teste gerados são verificadas pelo respectivo executor.
      if (trecho[2] === './abrir-janela.cjs' && !arquivo.endsWith('abrir-janela.cjs')) continue;
      if (!existe(destino)) problemas.push(`Import ausente em ${arquivo}: ${trecho[2]}`);
    }
  }
}
const assinaturas = JSON.parse(
  lerArquivo(juntar(raiz, 'documentacao/organizacao/assinaturas-migracoes.json'), 'utf8'),
);
for (const [nome, esperado] of Object.entries(assinaturas)) {
  const arquivo = juntar(raiz, 'supabase/migrations', nome);
  if (!existe(arquivo) || criarResumo('sha256').update(lerArquivo(arquivo)).digest('hex') !== esperado)
    problemas.push('Migration original alterada: ' + nome);
}
for (const aplicativo of ['programa-empresa', 'painel-administracao']) {
  const pasta = juntar(raiz, 'aplicativos', aplicativo, 'dist');
  if (existe(pasta)) {
    try {
      validarImportsLocais(pasta);
    } catch (erro) {
      problemas.push(erro.message);
    }
  }
}
if (problemas.length) {
  console.error(problemas.join('\n'));
  process.exit(1);
}
console.log(
  `Organização, comandos, workspaces, imports e ${Object.keys(assinaturas).length} migrations originais: PASS`,
);
