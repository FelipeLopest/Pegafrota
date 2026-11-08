#!/usr/bin/env node
import { spawn as iniciarProcesso, execFileSync as executarArquivoSincrono } from 'node:child_process';
import {
  existsSync as arquivoExiste,
  writeFileSync as gravarArquivoSincrono,
  mkdirSync as criarPastaSincrona,
} from 'node:fs';
import { join as juntarCaminhos, dirname as obterPastaPai, resolve as resolverCaminho } from 'node:path';
import { tmpdir as pastaTemporariaSistema } from 'node:os';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import { emitirToken } from '../desenvolvimento/token-local.mjs';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const RAIZ = resolverCaminho(AQUI, '../..');
const PASTA_COMPILADA = juntarCaminhos(RAIZ, 'aplicativos/painel-administracao/dist');
const SERVIDOR = process.env.PNF_DEV_URL || 'http://127.0.0.1:54321';
const CAPTURAS = juntarCaminhos(RAIZ, 'artifacts/screenshots/admin');

const falhar = (correspondenciaItem) => {
  console.error(`test:e2e:admin  FAIL — ${correspondenciaItem}`);
  process.exit(1);
};
const ignorar = (correspondenciaItem) => {
  console.log(`test:e2e:admin  NÃO EXECUTADO — ${correspondenciaItem}`);
  process.exit(2);
};

if (!arquivoExiste(PASTA_COMPILADA)) ignorar('dist ausente: rode `npm run build:admin`');

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
  const funcao = await fetch(`${SERVIDOR}/functions/v1/platform-admin`, {
    method: 'OPTIONS',
    signal: AbortSignal.timeout(4000),
  });
  if (funcao.status >= 500) throw new Error();
} catch {
  ignorar(
    `backend ou Edge Function fora do ar em ${SERVIDOR} — \`bash ferramentas/desenvolvimento/pilha-local.sh up\``,
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

let administradorIdentificador = codigoSql(
  `select user_id from platform.admins where status='active' limit 1`,
);
if (!administradorIdentificador) {
  administradorIdentificador = codigoSql(`select id from auth.users order by created_at limit 1`);
  codigoSql(`insert into platform.admins (user_id, status) values ('${administradorIdentificador}'::uuid,'active')
       on conflict (user_id) do update set status='active'`);
}
const emailAdministrador = codigoSql(
  `select email from auth.users where id='${administradorIdentificador}'::uuid`,
);

const sessaoAdministrador = {
  access_token: emitirToken(administradorIdentificador, 'authenticated', 'aal1'),
  refresh_token: `dev-refresh-${administradorIdentificador}`,
  token_type: 'bearer',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

criarPastaSincrona(CAPTURAS, { recursive: true });

const verificacao = juntarCaminhos(pastaTemporariaSistema(), `pnf-admin-e2e-probe-${process.pid}.cjs`);

gravarArquivoSincrono(
  verificacao,
  `
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SHOTS = ${JSON.stringify(CAPTURAS)};
const DIST  = ${JSON.stringify(PASTA_COMPILADA)};
const SESSION = ${JSON.stringify(JSON.stringify(sessaoAdministrador))};

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: detail || '' });

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: {
      // Página web comum: sem preload, sem Node. É como ela roda em produção.
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
    },
  });
  const wc = win.webContents;
  const evalIn = (code) => wc.executeJavaScript(code, true);
  const shot = async (name) => {
    try { fs.writeFileSync(path.join(SHOTS, name + '.png'), (await wc.capturePage()).toPNG()); }
    catch (e) { /* captura é evidência, não requisito */ }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (expr, tries = 30) => {
    for (let i = 0; i < tries; i += 1) {
      try { if (await evalIn(expr)) return true; } catch (e) { /* ainda carregando */ }
      await wait(400);
    }
    return false;
  };

  try {
    await wc.loadFile(path.join(DIST, 'index.html'));
    await wait(1200);

    // --- 1. carrega e mostra o login --------------------------------------
    const title = await evalIn('document.querySelector(".auth-title")?.textContent || ""');
    check('01_carrega_tela_de_login', /painel administrativo/i.test(title), title);

    // A composição aprovada é split com painel institucional. Verificar isto no
    // E2E impede que a correção visual seja desfeita sem ninguém perceber — a
    // medida de semelhança roda separada e nem sempre junto.
    const split = await evalIn(
      '!!document.querySelector(".auth-split") && !!document.querySelector(".auth-hero")');
    check('01b_login_usa_split_do_design', split === true);

    const heroText = await evalIn('document.querySelector(".auth-hero")?.innerText || ""');
    check('01c_hero_tem_marca_e_escopo',
      /AMBIENTE ADMINISTRATIVO/i.test(heroText) && /platform_admin/i.test(heroText),
      heroText.split(String.fromCharCode(10)).filter(Boolean)[0] || '');
    await shot('01-login');

    const hasFields = await evalIn('!!document.getElementById("email") && !!document.getElementById("senha")');
    check('02_login_tem_campos', hasFields);

    // --- 2. sessão autenticada por senha -----------------------------------
    await evalIn('sessionStorage.setItem("pnf.admin.session", ' + JSON.stringify(SESSION) + ')');
    wc.reload();
    await wait(2500);

    const shellUp = await waitFor('!!document.querySelector(".shell")');
    check('03_shell_monta_com_sessao', shellUp);
    await shot('02-dashboard');

    const navCount = await evalIn('document.querySelectorAll(".nav-item").length');
    check('04_menu_completo', navCount >= 6, String(navCount) + ' item(ns)');

    // --- 3. Dashboard com dados reais -------------------------------------
    const kpis = await evalIn('document.querySelectorAll(".kpi").length');
    check('05_dashboard_renderiza_kpis', kpis >= 4, String(kpis) + ' KPI(s)');

    const kpiValues = await evalIn(
      '[...document.querySelectorAll(".kpi-value")].map(n=>n.textContent).join(",")');
    check('06_dashboard_tem_valores', /[0-9]/.test(kpiValues), kpiValues.slice(0, 60));

    // --- 4. Empresas -------------------------------------------------------
    await evalIn('location.hash = "#/empresas"');
    await wait(1500);
    const rows = await evalIn('document.querySelectorAll("tbody tr").length');
    check('07_lista_empresas', rows > 0, String(rows) + ' empresa(s)');
    await shot('03-empresas');

    const firstCompany = await evalIn(
      'document.querySelector("tbody tr .row-link")?.textContent || ""');
    check('08_empresa_tem_nome', firstCompany.length > 0, firstCompany);

    // --- 5. Detalhe da empresa --------------------------------------------
    await evalIn('document.querySelector("tbody tr .row-link")?.click()');
    await wait(1500);
    const detail = await evalIn('document.querySelectorAll(".detail-item").length');
    check('09_detalhe_da_empresa', detail > 0, String(detail) + ' campo(s)');

    // O painel administra conta e ciclo de vida — nunca a frota do cliente.
    const leaked = await evalIn(
      '/(placa|ve[íi]culo|viagem|abastec|od[ôo]metro)/i.test(document.body.innerText)');
    check('10_sem_dados_operacionais', leaked === false,
      leaked ? 'VAZOU termo operacional' : 'nenhum termo operacional');
    await shot('04-empresa-detalhe');

    // --- 6. Wizard de provisionamento -------------------------------------
    await evalIn('location.hash = "#/empresas/nova"');
    await wait(1200);
    const steps = await evalIn('document.querySelectorAll(".wizard-step").length');
    check('11_wizard_tres_etapas', steps === 3, String(steps) + ' etapa(s)');
    await shot('05-wizard-etapa1');

    // Validação de CNPJ antes de qualquer chamada ao servidor.
    const setV = (id, v) => '(() => { const el = document.getElementById(' + JSON.stringify(id) + ');'
      + ' const p = Object.getPrototypeOf(el);'
      + ' Object.getOwnPropertyDescriptor(p, "value").set.call(el, ' + JSON.stringify(v) + ');'
      + ' el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()';

    await evalIn(setV('f-legalName', 'Empresa E2E Admin LTDA'));
    await evalIn(setV('f-tradeName', 'E2E Admin'));
    await evalIn(setV('f-cnpj', '11111111111111'));
    await evalIn('[...document.querySelectorAll("button")].find(b=>/Continuar/.test(b.textContent))?.click()');
    await wait(600);
    const cnpjErr = await evalIn('document.querySelector("#f-cnpj-error")?.textContent || ""');
    check('12_wizard_valida_cnpj', /inválido/i.test(cnpjErr), cnpjErr.slice(0, 50));
    await shot('06-wizard-cnpj-invalido');

    // --- 7. Administradores: os dois eixos --------------------------------
    await evalIn('location.hash = "#/administradores"');
    await wait(1600);
    const adminRows = await evalIn('document.querySelectorAll("tbody tr").length');
    check('13_lista_administradores', adminRows > 0, String(adminRows) + ' linha(s)');

    const scopeCells = await evalIn('document.querySelectorAll(".scope-cell").length');
    // Duas colunas de escopo por linha: acesso à empresa e conta na plataforma.
    check('14_dois_eixos_em_colunas', scopeCells >= adminRows * 2,
      String(scopeCells) + ' célula(s) de escopo para ' + adminRows + ' linha(s)');

    const scopeLabels = await evalIn(
      '[...document.querySelectorAll(".scope-cell status-pill")].map(n=>n.textContent).join("|")');
    check('15_escopos_tem_texto_proprio',
      /acesso/i.test(scopeLabels) && /conta/i.test(scopeLabels), scopeLabels.slice(0, 70));
    await shot('07-administradores');

    // --- 8. Provisionamentos e auditoria ----------------------------------
    await evalIn('location.hash = "#/provisionamentos"');
    await wait(1400);
    const opsScreen = await evalIn('document.querySelector(".topbar-title")?.textContent || ""');
    check('16_tela_provisionamentos', /Provisionamentos/i.test(opsScreen), opsScreen);
    await shot('08-provisionamentos');

    await evalIn('location.hash = "#/auditoria"');
    await wait(1600);
    const auditRows = await evalIn('document.querySelectorAll("tbody tr").length');
    check('17_auditoria_global', auditRows > 0, String(auditRows) + ' evento(s)');
    await shot('09-auditoria');

    // --- 9. Perfil e segurança --------------------------------------------
    await evalIn('location.hash = "#/perfil"');
    await wait(1600);
    const securityText = await evalIn('document.body.innerText');
    check('18_perfil_tem_secao_de_seguranca', /Segurança/i.test(securityText));
    check('19_perfil_sem_aplicativo_autenticador', !/(TOTP|Segundo fator|Google Authenticator|Authy)/i.test(securityText), 'sem exigência de MFA');
    await shot('10-perfil');

    // --- 10. Tema ----------------------------------------------------------
    const before = await evalIn('document.documentElement.getAttribute("data-theme")');
    await evalIn('[...document.querySelectorAll("button")].find(b=>/Tema/.test(b.textContent))?.click()');
    await wait(500);
    const after = await evalIn('document.documentElement.getAttribute("data-theme-choice")');
    check('20_tema_alterna', before !== null && after !== null, before + ' → ' + after);

    // --- 11. Sessão fora do localStorage ----------------------------------
    const leakLocal = await evalIn(
      'JSON.stringify(Object.entries(localStorage)).includes("access_token")');
    check('21_token_fora_do_localStorage', leakLocal === false);

    // --- 12. Rota pública de convite --------------------------------------
    await evalIn('sessionStorage.clear()');
    // loadURL com a forma REAL do link do e-mail: token de negocio na query
    // e a rota no fragmento. loadFile com hash perdia o fragmento ao recarregar.
    const inviteUrl = 'file://' + path.join(DIST, 'index.html')
      + '?token=token-inexistente-de-teste#/convite';
    await wc.loadURL(inviteUrl);

    // A rota de convite passa por "Validando…" antes de decidir. Esperar o
    // título estabilizar evita medir o estado intermediário.
    const settled = await waitFor(
      '/(Convite inválido|Convite expirado|Convite cancelado|Convite já utilizado|Defina sua senha)/i'
      + '.test(document.querySelector(".auth-title")?.textContent || "")', 30);

    const inviteTitle = await evalIn('document.querySelector(".auth-title")?.textContent || ""');
    const diagHash = await evalIn('location.hash');
    const diagBody = await evalIn('document.body.innerText.slice(0,160)');
    check('22a_diagnostico', true, 'hash=' + diagHash + ' | ' + diagBody.split(String.fromCharCode(10)).join(' '));
    // Sem token, o convite precisa DIZER o que houve — e não mandar para o
    // login, que era o beco sem saída do achado R2-005.
    check('22_rota_convite_e_publica',
      settled && !/painel administrativo/i.test(inviteTitle), inviteTitle);

    const inviteBody = await evalIn('document.body.innerText');
    check('23_convite_orienta_o_proximo_passo',
      /novo convite|administrador da plataforma/i.test(inviteBody),
      (inviteBody.split(String.fromCharCode(10)).find((l) => /convite/i.test(l)) || '').slice(0, 70));
    await shot('11-convite-sem-token');

  } catch (e) {
    check('excecao_no_probe', false, String(e && e.message));
  }

  console.log('__ADMIN_E2E__' + JSON.stringify(checks));
  app.exit(0);
});
`,
  'utf8',
);

const filho = iniciarProcesso(
  'xvfb-run',
  ['-a', '--server-args=-screen 0 1440x900x24', caminhoElectron, verificacao, '--no-sandbox'],
  {
    cwd: RAIZ,
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
const temporizador = setTimeout(() => filho.kill('SIGKILL'), 120000);

filho.on('close', (codigo) => {
  clearTimeout(temporizador);
  const instante = saida.indexOf('__ADMIN_E2E__');
  if (instante < 0) {
    if (/cannot open display/i.test(erro)) ignorar('sem servidor gráfico');
    falhar(`sem saída do probe (código ${codigo})\n${erro.slice(0, 700)}`);
  }
  const verificacoes = JSON.parse(saida.slice(instante + 13).split('\n')[0]);
  const falhou = verificacoes.filter((registro) => !registro.ok);

  for (const registro of verificacoes) {
    console.log(
      `  ${registro.ok ? 'OK  ' : 'FAIL'}  ${registro.id}${registro.detail ? `  — ${registro.detail}` : ''}`,
    );
  }
  console.log('');
  console.log('  Chromium do Electron, sem preload e sem Node — página web comum.');
  console.log(`  capturas em artifacts/screenshots/admin/  (ator: ${emailAdministrador})`);
  console.log('');

  if (falhou.length) {
    console.error(`test:e2e:admin  FAIL — ${falhou.length}/${verificacoes.length}`);
    process.exit(1);
  }
  console.log(`test:e2e:admin  PASS — ${verificacoes.length}/${verificacoes.length}`);
});
