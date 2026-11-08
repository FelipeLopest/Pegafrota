#!/usr/bin/env node
import { spawn as iniciarProcesso, execFileSync as executarArquivoSincrono } from 'node:child_process';
import {
  existsSync as arquivoExiste,
  writeFileSync as gravarArquivoSincrono,
  mkdirSync as criarPastaSincrona,
  rmSync as removerArquivoSincrono,
} from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { join as juntarCaminhos, dirname as obterPastaPai, resolve as resolverCaminho } from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const PASTA_APLICATIVO = resolverCaminho(AQUI, '..');
const PASTA_COMPILADA = juntarCaminhos(PASTA_APLICATIVO, 'dist');

function falhar(mensagem) {
  console.error(`smoke:desktop  FAIL — ${mensagem}`);
  process.exit(1);
}
function ignorar(mensagem) {
  console.log(`smoke:desktop  NÃO EXECUTADO — ${mensagem}`);
  process.exit(2);
}

if (!arquivoExiste(PASTA_COMPILADA)) falhar('dist ausente: rode `npm run build:desktop` antes');

let caminhoElectron;
try {
  caminhoElectron = (await import('electron')).default;
} catch {
  ignorar('pacote electron não instalado');
}
if (!caminhoElectron || !arquivoExiste(caminhoElectron)) ignorar('binário do Electron ausente');

let temXvfb = true;
try {
  executarArquivoSincrono('which', ['xvfb-run'], { stdio: 'pipe' });
} catch {
  temXvfb = false;
}

criarPastaSincrona(juntarCaminhos(PASTA_COMPILADA, '..'), { recursive: true });
const configuracaoTemporaria = juntarCaminhos(PASTA_APLICATIVO, 'config.json');
gravarArquivoSincrono(
  configuracaoTemporaria,
  JSON.stringify({
    supabaseUrl: 'http://127.0.0.1:54321',
    anonKey: 'smoke-anon-key',
  }),
  'utf8',
);

const verificacao = juntarCaminhos(PASTA_COMPILADA, 'sistema', '__smoke_probe.cjs');
const limparTemporarios = () => {
  removerArquivoSincrono(verificacao, { force: true });
  removerArquivoSincrono(configuracaoTemporaria, { force: true });
};
gravarArquivoSincrono(
  verificacao,
  `
// Carrega o processo principal REAL primeiro. Sem isto, o Electron trataria
// este arquivo como o app inteiro e nenhuma janela seria criada — o teste
// mediria a si mesmo em vez de medir o produto.
require('./abrir-janela.cjs');

const { app, BrowserWindow } = require('electron');
const checks = [];
function check(id, ok, detail) { checks.push({ id, ok: !!ok, detail: detail || '' }); }

app.whenReady().then(async () => {
  // Dá tempo de a janela do main.cjs ser criada e carregar o renderer.
  await new Promise((r) => setTimeout(r, 2500));

  const wins = BrowserWindow.getAllWindows();
  check('window_created', wins.length > 0, \`janelas: \${wins.length}\`);

  const win = wins[0];
  if (win) {
    const wc = win.webContents;
    check('renderer_loaded', !wc.isLoading() || wc.getURL().includes('index.html'), wc.getURL());

    const prefs = wc.getLastWebPreferences ? wc.getLastWebPreferences() : {};
    check('context_isolation', prefs.contextIsolation !== false);
    check('node_integration_off', !prefs.nodeIntegration);
    check('sandbox_on', prefs.sandbox !== false);

    try {
      const bridge = await wc.executeJavaScript('typeof window.pnf === "object" && typeof window.pnf.getConfig === "function"');
      check('preload_bridge', bridge === true);
      const rawIpc = await wc.executeJavaScript('typeof window.require === "undefined" && typeof window.ipcRenderer === "undefined"');
      check('no_raw_node_in_renderer', rawIpc === true);
      const appMounted = await wc.executeJavaScript('!!document.getElementById("app")');
      check('app_root_mounted', appMounted === true);
      const themed = await wc.executeJavaScript('!!document.documentElement.getAttribute("data-theme")');
      check('theme_applied_before_paint', themed === true);
    } catch (e) {
      check('renderer_probe', false, String(e && e.message));
    }
  }

  console.log('__SMOKE__' + JSON.stringify(checks));
  app.exit(0);
});
`,
  'utf8',
);

const argumentos = [juntarCaminhos(PASTA_COMPILADA, 'sistema', '__smoke_probe.cjs'), '--no-sandbox'];
const comando = temXvfb ? 'xvfb-run' : caminhoElectron;
const argumentosComando = temXvfb
  ? ['-a', '--server-args=-screen 0 1280x800x24', caminhoElectron, ...argumentos]
  : argumentos;

const filho = iniciarProcesso(comando, argumentosComando, {
  cwd: PASTA_COMPILADA,
  env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let saida = '';
let erro = '';
filho.stdout.on('data', (dadosRegistro) => {
  saida += dadosRegistro;
});
filho.stderr.on('data', (dadosRegistro) => {
  erro += dadosRegistro;
});

const limiteEspera = setTimeout(() => {
  filho.kill('SIGKILL');
}, 45000);

filho.on('close', (codigo) => {
  clearTimeout(limiteEspera);
  limparTemporarios();

  const marcador = saida.indexOf('__SMOKE__');
  if (marcador < 0) {
    if (/require is not defined|ERR_REQUIRE_ESM|Cannot find module/i.test(erro)) {
      falhar(
        `o processo principal não iniciou: ${erro.split('\n').find((linhaItem) => linhaItem.trim()) || ''}`,
      );
    }
    if (/cannot open display|Missing X server/i.test(erro)) ignorar('sem servidor gráfico disponível');
    falhar(`sem saída do probe (código ${codigo})\n${erro.slice(0, 600)}`);
  }

  const verificacoes = JSON.parse(saida.slice(marcador + 9).split('\n')[0]);
  const falhou = verificacoes.filter((registro) => !registro.ok);

  for (const registro of verificacoes) {
    console.log(
      `  ${registro.ok ? 'OK  ' : 'FAIL'}  ${registro.id}${registro.detail ? `  (${registro.detail})` : ''}`,
    );
  }
  console.log('');

  if (falhou.length) {
    console.error(`smoke:desktop  FAIL — ${falhou.length}/${verificacoes.length}`);
    process.exit(1);
  }
  console.log(`smoke:desktop  PASS — ${verificacoes.length}/${verificacoes.length}`);
  process.exit(0);
});
