#!/usr/bin/env node
import { execSync as executarComandoSincrono } from 'node:child_process';
import { mkdirSync as criarPastaSincrona, writeFileSync as gravarArquivoSincrono } from 'node:fs';
import { join as juntarCaminhos } from 'node:path';

const PASTA_RESULTADOS = juntarCaminhos(process.cwd(), 'artifacts', 'test-results');
criarPastaSincrona(PASTA_RESULTADOS, { recursive: true });

const ETAPAS = [
  { id: 'lint', cmd: 'node ferramentas/verificacoes/analisar-codigo.mjs', label: 'Lint do monorepo' },
  {
    id: 'secrets',
    cmd: 'node ferramentas/verificacoes/verificar-segredos.mjs .',
    label: 'Scanner de segredos',
  },
  { id: 'no-cdn', cmd: 'node ferramentas/verificacoes/verificar-recursos-locais.mjs', label: 'Zero CDN' },
  {
    id: 'prototype',
    cmd: 'node ferramentas/verificacoes/verificar-prototipos.mjs',
    label: 'Sem artefatos de protótipo',
  },
  {
    id: 'boundaries',
    cmd: 'node ferramentas/verificacoes/verificar-fronteiras.mjs',
    label: 'Fronteiras entre produtos',
  },
  {
    id: 'electron-sec',
    cmd: 'node ferramentas/verificacoes/verificar-electron.mjs',
    label: 'Segurança do Electron',
  },
  { id: 'unit', cmd: 'node ferramentas/testes/testar-unidades.mjs', label: 'Testes unitários' },
  {
    id: 'edge-unit',
    cmd: 'node --experimental-strip-types --test supabase/tests/edge/admin-users.test.mjs',
    label: 'Edge admin-users (unitário)',
  },
  {
    id: 'contracts',
    cmd: 'node ferramentas/verificacoes/verificar-contratos.mjs',
    label: 'Contratos Desktop ↔ banco',
  },
  {
    id: 'config',
    cmd: 'node ferramentas/verificacoes/verificar-configuracao.mjs',
    label: 'Consistência de configuração',
  },
  {
    id: 'build-admin',
    cmd: 'node aplicativos/painel-administracao/compilar-aplicativo.mjs',
    label: 'Build do Admin Web',
  },
  {
    id: 'build-desktop',
    cmd: 'node aplicativos/programa-empresa/compilar-aplicativo.mjs',
    label: 'Build do Desktop',
  },
  {
    id: 'smoke-admin',
    cmd: 'node aplicativos/painel-administracao/testes/teste-inicializacao-basica.mjs',
    label: 'Smoke do Admin Web',
  },
  {
    id: 'smoke-desktop',
    cmd: 'node aplicativos/programa-empresa/testes/teste-inicializacao-basica.mjs',
    label: 'Smoke do Desktop (Electron real)',
    skipCode: 2,
  },
  { id: 'db', cmd: 'bash ferramentas/testes/banco-local/testar-banco.sh', label: 'pgTAP', skipCode: 2 },
  {
    id: 'integration',
    cmd: 'node ferramentas/testes/testar-integracao.mjs',
    label: 'Integração real (PostgREST + RLS)',
    skipCode: 2,
  },
  {
    id: 'auth-real',
    cmd: 'node ferramentas/testes/testar-autenticacao.mjs',
    label: 'Identidade e convite (8 cenários)',
    skipCode: 2,
  },
  {
    id: 'edge',
    cmd: 'node ferramentas/testes/testar-funcoes-servidor.mjs',
    label: 'Edge Function (runtime Deno real)',
    skipCode: 2,
  },
  {
    id: 'e2e-desktop',
    cmd: 'node ferramentas/testes/testar-programa-empresa.mjs',
    label: 'E2E do Desktop (Electron + backend)',
    skipCode: 2,
  },
  {
    id: 'e2e-admin',
    cmd: 'node ferramentas/testes/testar-painel-administracao.mjs',
    label: 'E2E do Admin Web (Chromium real)',
    skipCode: 2,
  },
  {
    id: 'visual-routes',
    cmd: 'node ferramentas/testes/capturar-telas.mjs',
    label: 'Capturas A/B rota a rota',
    skipCode: 2,
  },
  {
    id: 'visual-similarity',
    cmd: 'node ferramentas/testes/comparar-telas.mjs',
    label: 'Semelhança medida com o Design',
    skipCode: 2,
  },
];

const resultados = [];
let falhou = 0;
let naoExecutados = 0;

console.log('\n=== GATE PEGANAFROTA ===\n');

for (const etapa of ETAPAS) {
  let situacao = 'PASS';
  let saidaTexto = '';
  try {
    saidaTexto = executarComandoSincrono(etapa.cmd, { stdio: 'pipe', encoding: 'utf8' });
  } catch (erro) {
    saidaTexto = String(erro.stdout || '') + String(erro.stderr || '');
    if (etapa.skipCode && erro.status === etapa.skipCode) {
      situacao = 'N/E';
      naoExecutados += 1;
    } else {
      situacao = 'FAIL';
      falhou += 1;
    }
  }

  gravarArquivoSincrono(
    juntarCaminhos(PASTA_RESULTADOS, `${etapa.id}.log`),
    saidaTexto || '(sem saída)',
    'utf8',
  );
  resultados.push({ ...etapa, status: situacao });

  const marcar = situacao === 'PASS' ? 'PASS ' : situacao === 'N/E' ? 'N/E  ' : 'FAIL ';
  console.log(`  ${marcar} ${etapa.id.padEnd(16)} ${etapa.label}`);
  if (situacao === 'FAIL') {
    for (const linhaItem of saidaTexto.split('\n').filter(Boolean).slice(-10))
      console.log(`         ${linhaItem}`);
  }
  if (situacao === 'N/E') {
    const motivo = saidaTexto.split('\n').find((linhaItem) => linhaItem.includes('NÃO EXECUTADO')) || '';
    console.log(`         ${motivo.trim() || 'ambiente não permite executar'}`);
  }
}

const ETAPAS_OPCIONAIS = [];

const ETAPAS_INDISPONIVEIS = [
  {
    id: 'supabase-hosted',
    label: 'Supabase hospedado, SMTP e convites reais',
    why: 'FORA DO ESCOPO DO GATE LOCAL — depende de serviços hospedados e entrega real de e-mail',
  },
  {
    id: 'estados-internos',
    label: 'Comparação visual dos estados internos',
    why: 'carregando, vazio, erro, offline e conflito têm cobertura funcional no E2E, mas não foram comparados lado a lado com o protótipo',
  },
  {
    id: 'installer',
    label: 'Instalador Windows e assinatura',
    why: 'fora do escopo desta rodada por decisão do usuário — a execução oficial é npm run desktop',
  },
];

const resultadosOpcionais = [];
if (ETAPAS_OPCIONAIS.length) {
  console.log('\n=== OPCIONAIS (não decidem o veredito) ===\n');
  for (const etapa of ETAPAS_OPCIONAIS) {
    let situacao = 'PASS';
    let saidaTexto = '';
    try {
      saidaTexto = executarComandoSincrono(etapa.cmd, { stdio: 'pipe', encoding: 'utf8' });
    } catch (erro) {
      saidaTexto = String(erro.stdout || '') + String(erro.stderr || '');
      situacao = etapa.skipCode && erro.status === etapa.skipCode ? 'N/E' : 'FAIL';
    }
    gravarArquivoSincrono(
      juntarCaminhos(PASTA_RESULTADOS, `${etapa.id}.log`),
      saidaTexto || '(sem saída)',
      'utf8',
    );
    resultadosOpcionais.push({ id: etapa.id, status: situacao });
    const marcar = situacao === 'PASS' ? 'PASS ' : situacao === 'N/E' ? 'N/E  ' : 'FAIL ';
    console.log(`  ${marcar} ${etapa.id.padEnd(16)} ${etapa.label}`);
  }
}

console.log('\n=== NÃO EXECUTÁVEIS NESTE AMBIENTE ===\n');
for (const usuarioItem of ETAPAS_INDISPONIVEIS) {
  console.log(`  N/E   ${usuarioItem.id.padEnd(16)} ${usuarioItem.label}`);
  console.log(`         ${usuarioItem.why}`);
}

const resumo = {
  generatedAt: new Date().toISOString(),
  executed: resultados.map((resultadoItem) => ({ id: resultadoItem.id, status: resultadoItem.status })),
  notExecutable: ETAPAS_INDISPONIVEIS.map((usuarioItem2) => ({
    id: usuarioItem2.id,
    reason: usuarioItem2.why,
  })),
  totals: {
    pass: resultados.filter((resultadoItem) => resultadoItem.status === 'PASS').length,
    fail: falhou,
    notExecuted: naoExecutados + ETAPAS_INDISPONIVEIS.length,
    notExecutedInEnvironment: naoExecutados,
    notExecutableHere: ETAPAS_INDISPONIVEIS.length,
  },
  optional: resultadosOpcionais,
};
gravarArquivoSincrono(
  juntarCaminhos(PASTA_RESULTADOS, 'summary.json'),
  JSON.stringify(resumo, null, 2),
  'utf8',
);

try {
  executarComandoSincrono('node ferramentas/verificacoes/contar-arquivos.mjs', { stdio: 'pipe' });
} catch {
  console.error('  aviso: não foi possível gerar as contagens');
}

console.log(
  `\n  aprovados: ${resumo.totals.pass}   falhas: ${resumo.totals.fail}` +
    `   não executados: ${resumo.totals.notExecuted}` +
    ` (${resumo.totals.notExecutedInEnvironment} tentados + ${resumo.totals.notExecutableHere} impossíveis aqui)`,
);
console.log(`  evidências: artifacts/test-results/\n`);

process.exit(falhou === 0 ? 0 : 1);
