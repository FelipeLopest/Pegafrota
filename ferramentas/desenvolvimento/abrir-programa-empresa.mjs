#!/usr/bin/env node
import { execSync as executarComandoSincrono } from 'node:child_process';
import { existsSync as arquivoExiste, readFileSync as lerArquivoSincrono } from 'node:fs';
import { join as juntarCaminhos, dirname as obterPastaPai, resolve as resolverCaminho } from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';

const RAIZ = resolverCaminho(obterPastaPai(converterEnderecoEmCaminho(import.meta.url)), '../..');
const PASTA_COMPILADA = juntarCaminhos(RAIZ, 'aplicativos/programa-empresa/dist');

const encerrarComErro = (titulo, linhas) => {
  console.error(`\n  ${titulo}\n`);
  for (const linhaItem of linhas) console.error(`    ${linhaItem}`);
  console.error('');
  process.exit(1);
};

const caminhoAmbiente = juntarCaminhos(RAIZ, '.env');
if (!arquivoExiste(caminhoAmbiente)) {
  encerrarComErro('Configuração ausente: o arquivo .env não existe.', [
    'O Desktop precisa saber a qual Supabase se conectar.',
    '',
    'Linux e macOS:',
    '  cp .env.example .env',
    '',
    'Windows (PowerShell):',
    '  Copy-Item .env.example .env',
    '',
    'Depois preencha PNF_SUPABASE_URL e PNF_SUPABASE_ANON_KEY.',
  ]);
}

const ambiente = {};
for (const linha of lerArquivoSincrono(caminhoAmbiente, 'utf8').split('\n')) {
  const correspondenciaItem = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
  if (correspondenciaItem)
    ambiente[correspondenciaItem[1]] = correspondenciaItem[2].trim().replace(/^["']|["']$/g, '');
}

const faltando = ['PNF_SUPABASE_URL', 'PNF_SUPABASE_ANON_KEY'].filter(
  (chaveItem) => !ambiente[chaveItem] || /^cole-aqui/i.test(ambiente[chaveItem]),
);

if (faltando.length) {
  encerrarComErro(`Configuração incompleta: ${faltando.join(' e ')} sem valor.`, [
    'Pegue os dois no painel do Supabase, em Project Settings → API:',
    '  PNF_SUPABASE_URL       → Project URL',
    '  PNF_SUPABASE_ANON_KEY  → anon public',
    '',
    'A chave anon é pública por natureza: identifica o projeto e não',
    'autoriza nada. Quem autoriza é a RLS, a partir do JWT do usuário.',
    'NUNCA use a service_role aqui.',
  ]);
}

try {
  const usuarioItem = new URL(ambiente.PNF_SUPABASE_URL);
  if (!/^https?:$/.test(usuarioItem.protocol)) throw new Error('protocolo');
} catch {
  encerrarComErro(`PNF_SUPABASE_URL não é uma URL válida: ${ambiente.PNF_SUPABASE_URL}`, [
    'Use a forma completa, com esquema:',
    '  https://<ref>.supabase.co',
  ]);
}

console.log('  compilando o Desktop…');
try {
  executarComandoSincrono('node aplicativos/programa-empresa/compilar-aplicativo.mjs', {
    cwd: RAIZ,
    stdio: 'inherit',
  });
} catch {
  encerrarComErro('A compilação falhou.', ['Veja a saída acima.']);
}

const principal = juntarCaminhos(PASTA_COMPILADA, 'sistema/abrir-janela.cjs');
if (!arquivoExiste(principal)) {
  encerrarComErro('Build concluído, mas dist/sistema/abrir-janela.cjs não existe.', [
    'O Electron não tem o que abrir. Rode novamente:',
    '  npm run build:desktop',
  ]);
}

const configuracao = juntarCaminhos(PASTA_COMPILADA, 'config.json');
if (!arquivoExiste(configuracao)) {
  encerrarComErro('Build concluído, mas dist/config.json não foi gerado.', [
    'O .env existe mas o build não produziu a configuração.',
    'Confira PNF_SUPABASE_URL e PNF_SUPABASE_ANON_KEY em .env.',
  ]);
}

let interpretado;
try {
  interpretado = JSON.parse(lerArquivoSincrono(configuracao, 'utf8'));
} catch {
  encerrarComErro('dist/config.json está ilegível.', ['Apague dist/ e rode novamente.']);
}
if (!interpretado.supabaseUrl || !interpretado.anonKey) {
  encerrarComErro('dist/config.json está incompleto.', ['Faltam supabaseUrl e/ou anonKey.']);
}

let caminhoElectron;
try {
  caminhoElectron = (await import('electron')).default;
} catch {
  encerrarComErro('O pacote electron não está instalado.', ['  npm ci']);
}
if (!caminhoElectron || !arquivoExiste(caminhoElectron)) {
  encerrarComErro('O binário do Electron não foi baixado.', [
    '  npm rebuild electron',
    '  (ou apague node_modules e rode npm ci)',
  ]);
}

console.log(`  configuração: ${interpretado.supabaseUrl}`);
console.log('  abrindo o Electron…\n');

const { spawn: iniciarProcesso } = await import('node:child_process');

const extras = process.argv.slice(2);

const filho = iniciarProcesso(caminhoElectron, [principal, ...extras], {
  cwd: PASTA_COMPILADA,
  stdio: 'inherit',
});

filho.on('close', (codigo) => {
  if (codigo !== 0) {
    console.error('\n  O Electron encerrou com código ' + codigo + '.');
    console.error('  Se a mensagem acima cita "Running as root without --no-sandbox",');
    console.error('  você está num contêiner: use  npm run desktop -- --no-sandbox\n');
  }
  process.exit(codigo ?? 0);
});
