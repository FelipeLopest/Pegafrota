#!/usr/bin/env node
import {
  readFileSync as lerArquivoSincrono,
  readdirSync as listarPastaSincrona,
  existsSync as arquivoExiste,
  writeFileSync as gravarArquivoSincrono,
  mkdirSync as criarPastaSincrona,
} from 'node:fs';
import { join as juntarCaminhos } from 'node:path';

const RAIZ = process.cwd();
const PASTA_RESULTADOS = juntarCaminhos(RAIZ, 'artifacts/test-results');
criarPastaSincrona(PASTA_RESULTADOS, { recursive: true });

const quantidade = (diretorio, expressaoRegular) =>
  arquivoExiste(juntarCaminhos(RAIZ, diretorio))
    ? listarPastaSincrona(juntarCaminhos(RAIZ, diretorio)).filter((formulario) =>
        expressaoRegular.test(formulario),
      ).length
    : 0;

function doRegistro(arquivo, padroes) {
  const parametroItem = juntarCaminhos(PASTA_RESULTADOS, arquivo);
  if (!arquivoExiste(parametroItem)) return null;
  const texto = lerArquivoSincrono(parametroItem, 'utf8');
  for (const expressaoRegular of padroes) {
    const correspondenciaItem = expressaoRegular.exec(texto);
    if (correspondenciaItem) return correspondenciaItem.slice(1).filter(Boolean).join('/');
  }
  return null;
}

const contagens = {
  geradoEm: new Date().toISOString(),

  migrations: quantidade('supabase/migrations', /\.sql$/),
  testesPgtapArquivos: quantidade('supabase/tests/database', /\.sql$/),

  pgtap: doRegistro('db.log', [/Files=\d+,\s*Tests=(\d+)/]),
  unitarios: doRegistro('unit.log', [/^# pass (\d+)/m]),
  unitariosFalhas: doRegistro('unit.log', [/^# fail (\d+)/m]),

  contratos: doRegistro('contracts.log', [
    /funções públicas nas migrations:\s*(\d+)[\s\S]*?chamadas rpc\(\) no cliente:\s*(\d+)/,
  ]),

  integracao: doRegistro('integration.log', [/PASS — (\d+)\/(\d+)/]),
  authReal: doRegistro('auth-real.log', [/PASS — (\d+)\/(\d+)/]),
  edge: doRegistro('edge.log', [/PASS — (\d+)\/(\d+)(?:\s*\((\d+) não exercitado\))?/]),
  e2eDesktop: doRegistro('e2e-desktop.log', [/PASS — (\d+)\/(\d+)/]),
  e2eAdmin: doRegistro('e2e-admin.log', [/PASS — (\d+)\/(\d+)/]),
  smokeAdmin: doRegistro('smoke-admin.log', [/PASS — (\d+)\/(\d+)/]),
  smokeDesktop: doRegistro('smoke-desktop.log', [/PASS — (\d+)\/(\d+)/]),
  eletronSeguranca: doRegistro('electron-sec.log', [/PASS\s+—\s+(\d+)\/(\d+) invariantes/]),

  capturasDesktop: quantidade('artifacts/screenshots/desktop', /\.png$/),
  capturasAdmin: quantidade('artifacts/screenshots/admin', /\.png$/),
  capturasComparacao: quantidade('artifacts/screenshots/design-comparison', /\.png$/),

  telasDesktop: (() => {
    const formulario = juntarCaminhos(RAIZ, 'aplicativos/programa-empresa/navegacao/enderecos-das-telas.mjs');
    if (!arquivoExiste(formulario)) return 0;
    return (lerArquivoSincrono(formulario, 'utf8').match(/^\s*rota\(/gm) || []).length;
  })(),
  telasAdmin: (() => {
    const formulario = juntarCaminhos(RAIZ, 'aplicativos/painel-administracao/iniciar-aplicativo.mjs');
    if (!arquivoExiste(formulario)) return 0;
    return (lerArquivoSincrono(formulario, 'utf8').match(/^\s*rota\(/gm) || []).length;
  })(),
};

const visual = juntarCaminhos(RAIZ, 'artifacts/screenshots/design-comparison/resultado.json');
if (arquivoExiste(visual)) {
  const veiculoItem = JSON.parse(lerArquivoSincrono(visual, 'utf8'));
  contagens.tokensConferidos = (veiculoItem.tokens || []).reduce(
    (primeiroItem, itemAtual) => primeiroItem + (itemAtual.total || 0),
    0,
  );
  contagens.tokensDivergentes = (veiculoItem.tokens || []).reduce(
    (primeiroItem, itemAtual) => primeiroItem + (itemAtual.different?.length || 0),
    0,
  );
  contagens.paresVisuais = (veiculoItem.pares || []).filter(
    (itemComparado) => itemComparado.prototipo && itemComparado.implementacao,
  ).length;
}

gravarArquivoSincrono(juntarCaminhos(PASTA_RESULTADOS, 'counts.json'), JSON.stringify(contagens, null, 2));

const rotulo = (chaveItem) => chaveItem.replace(/([A-Z])/g, ' $1').toLowerCase();
console.log('Contagens geradas do repositório\n');
for (const [chaveItem, veiculoItem] of Object.entries(contagens)) {
  if (chaveItem === 'geradoEm') continue;
  console.log(`  ${rotulo(chaveItem).padEnd(28)} ${veiculoItem ?? '(sem log)'}`);
}
console.log(`\n  gravado em artifacts/test-results/counts.json`);
