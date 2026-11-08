#!/usr/bin/env node
import { spawn as iniciarProcesso, execFileSync as executarArquivoSincrono } from 'node:child_process';
import {
  existsSync as arquivoExiste,
  writeFileSync as gravarArquivoSincrono,
  mkdirSync as criarPastaSincrona,
} from 'node:fs';
import { join as juntarCaminhos, dirname as obterPastaPai, resolve as resolverCaminho } from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const RAIZ = resolverCaminho(AQUI, '../..');
const PASTA_APLICATIVO = juntarCaminhos(RAIZ, 'aplicativos/programa-empresa');
const PASTA_COMPILADA = juntarCaminhos(PASTA_APLICATIVO, 'dist');
const SERVIDOR = process.env.PNF_DEV_URL || 'http://127.0.0.1:54321';

const falhar = (correspondenciaItem) => {
  console.error(`test:e2e  FAIL — ${correspondenciaItem}`);
  process.exit(1);
};
const ignorar = (correspondenciaItem) => {
  console.log(`test:e2e  NÃO EXECUTADO — ${correspondenciaItem}`);
  process.exit(2);
};

if (!arquivoExiste(PASTA_COMPILADA)) ignorar('dist ausente: rode `npm run build:desktop`');

let caminhoElectron;
try {
  caminhoElectron = (await import('electron')).default;
} catch {
  ignorar('electron não instalado');
}
if (!caminhoElectron || !arquivoExiste(caminhoElectron)) ignorar('binário do Electron ausente');

try {
  executarArquivoSincrono('which', ['xvfb-run'], { stdio: 'pipe' });
} catch {
  ignorar('xvfb-run ausente');
}

try {
  const resposta = await fetch(SERVIDOR, { signal: AbortSignal.timeout(4000) });
  if (!resposta.ok) throw new Error();
} catch {
  ignorar(
    `backend fora do ar em ${SERVIDOR} — suba com \`bash ferramentas/desenvolvimento/pilha-local.sh up\``,
  );
}

const codigoSql = (buscaAtual) =>
  executarArquivoSincrono(
    'psql',
    [
      '-h',
      '127.0.0.1',
      '-p',
      '5433',
      '-U',
      'postgres',
      '-d',
      process.env.PNF_DEV_DB || 'pnf_dev',
      '-t',
      '-A',
      '-c',
      buscaAtual,
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${process.env.PATH}:/usr/lib/postgresql/16/bin` } },
  ).trim();

const email = codigoSql(`select u.email from auth.users u
  join public.company_memberships m on m.user_id = u.id
  join public.profiles p on p.id = u.id
  where m.role = 'company_admin' and m.active and p.active limit 1`);

if (!email) falhar('seed sem company_admin com e-mail');

const SENHA = process.env.PNF_SEED_PASSWORD || 'PegaNaFrota#2026';

gravarArquivoSincrono(
  juntarCaminhos(PASTA_COMPILADA, 'config.json'),
  JSON.stringify({ supabaseUrl: SERVIDOR, anonKey: 'dev-anon-key-local-harness' }, null, 2),
);

criarPastaSincrona(juntarCaminhos(RAIZ, 'artifacts/screenshots/desktop'), { recursive: true });

const verificacao = juntarCaminhos(PASTA_COMPILADA, 'sistema', '__e2e_probe.cjs');
gravarArquivoSincrono(
  verificacao,
  `
require('./abrir-janela.cjs');
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: detail || '' });

app.whenReady().then(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('__E2E__' + JSON.stringify([{ id: 'window', ok: false }])); app.exit(0); return; }
  const wc = win.webContents;

  const evalIn = (code) => wc.executeJavaScript(code, true);
  const shot = async (name) => {
    try {
      const img = await wc.capturePage();
      fs.writeFileSync(path.join(${JSON.stringify(juntarCaminhos(RAIZ, 'artifacts/screenshots/desktop'))}, name + '.png'),
        img.toPNG());
    } catch (e) { /* screenshot é evidência, não requisito */ }
  };

  try {
    // A tela inicial precisa ser o login, não o diagnóstico de configuração.
    const initial = await evalIn('document.querySelector(".auth-title")?.textContent || ""');
    check('tela_inicial_e_login', /Entrar/i.test(initial), initial);
    await shot('01-login');

    // Login PELA INTERFACE: preencher os campos e clicar, como a pessoa faz.
    //
    // Chamar signIn() direto criaria a sessao mas nao faria boot() seguir para
    // o shell — e o teste passaria sem provar que a tela de entrada leva a
    // algum lugar, que e justamente o que interessa verificar.
    const filled = await evalIn(\`(() => {
      const setValue = (el, v) => {
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const email = document.getElementById('email');
      const senha = document.getElementById('senha');
      if (!email || !senha) return false;
      setValue(email, ${JSON.stringify(email)});
      setValue(senha, ${JSON.stringify(SENHA)});
      const btn = [...document.querySelectorAll('button')]
        .find((b) => /Entrar/i.test(b.textContent));
      if (!btn) return false;
      btn.click();
      return true;
    })()\`);
    check('formulario_de_login_preenchido', filled === true);

    // Espera o shell aparecer — é a prova de que o login levou adiante.
    let shellUp = false;
    for (let i = 0; i < 25; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      shellUp = await evalIn('!!document.querySelector(".shell")');
      if (shellUp) break;
    }
    if (!shellUp) {
      const shown = await evalIn(
        '[...document.querySelectorAll(".field-error")].map(n=>n.textContent).join(" | ")');
      check('login_pela_interface_monta_o_shell', false, 'erro na tela: ' + shown);
    } else {
      check('login_pela_interface_monta_o_shell', true);
    }
    await shot('02-shell');

    const login = await evalIn(\`(async () => {
      const m = await import('./lib/session.mjs');
      return { ok: true, token: !!m.session.accessToken };
    })()\`);
    check('sessao_ativa_apos_login', login.token === true);

    const companyLabel = await evalIn(
      'document.querySelector(".sidebar-company")?.textContent || ""');
    check('barra_lateral_mostra_a_empresa', companyLabel.trim().length > 0, companyLabel.trim());

    const navCount = await evalIn('document.querySelectorAll(".nav-item").length');
    check('menu_reflete_permissoes', navCount > 5, String(navCount) + ' item(ns)');

    // Token NÃO pode aparecer no armazenamento do navegador (R2-007).
    const leak = await evalIn(\`(() => {
      const dump = JSON.stringify(Object.entries(localStorage))
        + JSON.stringify(Object.entries(sessionStorage));
      return /access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}/.test(dump);
    })()\`);
    check('token_fora_do_localStorage', leak === false, leak ? 'VAZOU' : 'nenhum token em web storage');

    // Contexto e permissões pelo mesmo código que a interface usa.
    const ctx = await evalIn(\`(async () => {
      const m = await import('./lib/session.mjs');
      await m.context.load();
      return {
        company: m.context.companyName,
        role: m.context.role,
        perms: m.context.permissions.length,
        membership: m.context.hasActiveMembership,
      };
    })()\`);
    check('contexto_carrega_nome_da_empresa', !!ctx.company, ctx.company || 'vazio');
    check('contexto_tem_permissoes', ctx.perms > 0, String(ctx.perms) + ' permissões');
    check('contexto_tem_vinculo_ativo', ctx.membership === true);

    // Operações reais pela camada de dados de produção.
    const ops = await evalIn(\`(async () => {
      const { data } = await import('./lib/data.mjs');
      const out = {};
      const run = async (k, fn) => { try { out[k] = { ok: true, n: await fn() }; }
                                     catch (e) { out[k] = { ok: false, e: String(e && e.message) }; } };
      await run('veiculos', async () => (await data.vehicles.list()).length);
      await run('motoristas', async () => (await data.drivers.list()).length);
      await run('locais', async () => (await data.locations.list()).length);
      await run('viagens', async () => (await data.trips.list()).length);
      await run('abastecimentos', async () => (await data.fuelings.list()).length);
      await run('manutencoes', async () => (await data.maintenance.list()).length);
      await run('movimentacoes', async () => (await data.movements.list()).length);
      await run('empresa', async () => (await data.company.get()).tradeName);
      await run('usuarios', async () => ((await data.company.members()).members || []).length);
      await run('auditoria', async () => (await data.audit.list()).length);
      await run('dashboard', async () => { await data.dashboard(); return 'ok'; });
      await run('rel_custos_mensais', async () => (await data.reports.monthlyCosts()).length ?? 'ok');
      await run('rel_custos_veiculo', async () => (await data.reports.vehicleCosts()).length ?? 'ok');
      await run('rel_manutencao', async () => (await data.reports.maintenanceDue()).length ?? 'ok');
      await run('rel_movimentacoes', async () => (await data.reports.recentMovements()).length ?? 'ok');
      return out;
    })()\`);

    for (const [k, v] of Object.entries(ops)) {
      check('operacao_' + k, v.ok, v.ok ? String(v.n) : v.e);
    }

    // Escrita real: cadastrar um veículo e arquivá-lo.
    const write = await evalIn(\`(async () => {
      const { data } = await import('./lib/data.mjs');
      try {
        // Placa precisa casar AAA0000 ou AAA0A00 — a constraint do banco é a
        // mesma que a validação do cliente aplica.
        const plate = 'EEA' + Math.floor(Math.random()*9000+1000);
        const v = await data.vehicles.create({
          plate, brand: 'Iveco', model: 'Daily', fuelType: 'diesel_s10',
          modelYear: 2025, initialOdometerKm: 100,
        });
        await data.vehicles.update(v.vehicleId, { color: 'Prata' });
        await data.vehicles.archive(v.vehicleId, 'fim do E2E');
        return { ok: true, plate: v.plate };
      } catch (e) { return { ok: false, e: String(e && e.message) }; }
    })()\`);
    check('escrita_cadastrar_editar_arquivar', write.ok, write.ok ? write.plate : write.e);

    // Navegação: a barra lateral reflete as permissões e as rotas abrem.
    await evalIn('location.hash = "#/patio"');
    await new Promise((r) => setTimeout(r, 900));
    const yard = await evalIn('document.querySelector(".topbar-title")?.textContent || ""');
    check('navegacao_patio', /Pátio/i.test(yard), yard);
    await shot('02-patio');

    await evalIn('location.hash = "#/veiculos"');
    await new Promise((r) => setTimeout(r, 900));
    const veh = await evalIn('document.querySelectorAll("tbody tr").length');
    check('tela_veiculos_renderiza_linhas', veh > 0, String(veh) + ' linha(s)');
    await shot('03-veiculos');

    await evalIn('location.hash = "#/relatorios"');
    await new Promise((r) => setTimeout(r, 700));
    const rep = await evalIn('document.querySelectorAll("#r-kind option").length');
    check('relatorios_oferece_os_quatro', rep === 4, String(rep) + ' opção(ões)');
    await shot('04-relatorios');

    await evalIn('location.hash = "#/movimentacoes"');
    await new Promise((r) => setTimeout(r, 800));
    const mv = await evalIn('document.querySelector(".topbar-title")?.textContent || ""');
    check('navegacao_movimentacoes', /Movimenta/i.test(mv), mv);
    await shot('05-movimentacoes');

    // Sessão persistida cifrada pelo processo principal.
    const persistence = await evalIn(\`(async () => {
      const status = await window.pnf.getConfigStatus();
      const s = await window.pnf.session.load();
      return { encryption: status.encryptionAvailable, stored: !!(s && s.access_token) };
    })()\`);
    // Sem chaveiro do sistema — comum em contêiner Linux — a sessão
    // deliberadamente NÃO é gravada. Exigir persistência aqui seria exigir que
    // o app gravasse token em texto puro.
    check('sessao_persistida_quando_ha_chaveiro',
      persistence.encryption ? persistence.stored : persistence.stored === false,
      persistence.encryption ? 'cifrada em disco' : 'chaveiro ausente: nada gravado, como previsto');

    // E o arquivo em disco não pode conter o token em texto.
    const encPath = path.join(app.getPath('userData'), 'session.enc');
    if (fs.existsSync(encPath)) {
      const raw = fs.readFileSync(encPath).toString('utf8');
      check('arquivo_de_sessao_nao_tem_token_em_texto',
        !/eyJ[A-Za-z0-9_-]{10,}/.test(raw), 'conteúdo cifrado');
    } else {
      check('arquivo_de_sessao_nao_tem_token_em_texto', true, 'chaveiro indisponível: nada gravado');
    }

    // Logout limpa tudo.
    const out = await evalIn(\`(async () => {
      const m = await import('./lib/session.mjs');
      await m.signOut();
      const s = await window.pnf.session.load().catch(() => null);
      return { token: m.session.accessToken, stored: !!s };
    })()\`);
    check('logout_limpa_sessao', !out.token && !out.stored);

  } catch (e) {
    check('excecao_no_probe', false, String(e && e.message));
  }

  console.log('__E2E__' + JSON.stringify(checks));
  app.exit(0);
});
`,
  'utf8',
);

const filho = iniciarProcesso(
  'xvfb-run',
  [
    '-a',
    '--server-args=-screen 0 1440x900x24',
    caminhoElectron,
    juntarCaminhos(PASTA_COMPILADA, 'sistema', '__e2e_probe.cjs'),
    '--no-sandbox',
  ],
  {
    cwd: PASTA_COMPILADA,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let saida = '';
let erro = '';
filho.stdout.on('data', (dadosRegistro) => {
  saida += dadosRegistro;
});
filho.stderr.on('data', (dadosRegistro) => {
  erro += dadosRegistro;
});
const temporizador = setTimeout(() => filho.kill('SIGKILL'), 90000);

filho.on('close', (codigo) => {
  clearTimeout(temporizador);
  const instante = saida.indexOf('__E2E__');
  if (instante < 0) {
    if (/cannot open display/i.test(erro)) ignorar('sem servidor gráfico');
    falhar(`sem saída do probe (código ${codigo})\n${erro.slice(0, 800)}`);
  }
  const verificacoes = JSON.parse(saida.slice(instante + 7).split('\n')[0]);
  const falhou = verificacoes.filter((registro) => !registro.ok);

  for (const registro of verificacoes) {
    console.log(
      `  ${registro.ok ? 'OK  ' : 'FAIL'}  ${registro.id}${registro.detail ? `  — ${registro.detail}` : ''}`,
    );
  }
  console.log('');
  console.log('  capturas em artifacts/screenshots/');
  console.log('');

  if (falhou.length) {
    console.error(`test:e2e  FAIL — ${falhou.length}/${verificacoes.length}`);
    process.exit(1);
  }
  console.log(`test:e2e  PASS — ${verificacoes.length}/${verificacoes.length}`);
});
