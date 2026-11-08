#!/usr/bin/env node
import { spawn as iniciarProcesso, execFileSync as executarArquivoSincrono } from 'node:child_process';
import {
  existsSync as arquivoExiste,
  mkdirSync as criarPastaSincrona,
  writeFileSync as gravarArquivoSincrono,
  readFileSync as lerArquivoSincrono,
} from 'node:fs';
import { join as juntarCaminhos, dirname as obterPastaPai, resolve as resolverCaminho } from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import { createServer as criarServidor } from 'node:http';
import { tmpdir as pastaTemporariaSistema } from 'node:os';
import { emitirToken } from '../desenvolvimento/token-local.mjs';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const RAIZ = resolverCaminho(AQUI, '../..');
const CAPTURAS = juntarCaminhos(RAIZ, 'artifacts/screenshots');
const PASTA_IMAGENS_REFERENCIA = juntarCaminhos(CAPTURAS, 'design');
const PASTA_IMAGENS_IMPLEMENTACAO = juntarCaminhos(CAPTURAS, 'implementation');

const PASTA_REFERENCIAS_VISUAIS = process.env.PNF_DESIGN_ROOT || '/home/claude/handoff/extracted';
const RECURSOS_PROTOTIPO = process.env.PNF_PROTO_RUNTIME || '/home/claude/protoruntime/node_modules';
const SERVIDOR = process.env.PNF_DEV_URL || 'http://127.0.0.1:54321';

const ignorar = (correspondenciaItem) => {
  console.log(`visual:routes  NÃO EXECUTADO — ${correspondenciaItem}`);
  process.exit(2);
};
const falhar = (correspondenciaItem) => {
  console.error(`visual:routes  FAIL — ${correspondenciaItem}`);
  process.exit(1);
};

const ROTAS_PROGRAMA_EMPRESA = [
  { id: 'login', proto: null, rota: null, nota: 'capturada antes de entrar' },
  { id: 'dashboard', proto: 'Dashboard', rota: '/' },
  { id: 'patio', proto: 'Pátio', rota: '/patio' },
  { id: 'viagens', proto: 'Viagens', rota: '/viagens' },
  { id: 'veiculos', proto: 'Veículos', rota: '/veiculos' },
  { id: 'motoristas', proto: 'Motoristas', rota: '/motoristas' },
  { id: 'locais', proto: 'Locais', rota: '/locais' },
  { id: 'abastecimentos', proto: 'Abastecimentos', rota: '/abastecimentos' },
  { id: 'manutencoes', proto: 'Manutenções', rota: '/manutencoes' },
  { id: 'relatorios', proto: 'Relatórios', rota: '/relatorios' },
  { id: 'empresa', proto: 'Empresa', rota: '/empresa' },
  { id: 'usuarios', proto: 'Usuários', rota: '/usuarios' },
  { id: 'auditoria', proto: 'Auditoria', rota: '/auditoria' },
  { id: 'perfil', proto: 'Perfil e aparência', rota: '/perfil' },
  { id: 'movimentacoes', proto: null, rota: '/movimentacoes', nota: 'no protótipo vive dentro do Pátio' },
  { id: 'odometro', proto: null, rota: '/odometro', nota: 'no protótipo vive dentro do Veículo' },
  { id: 'veiculo-detalhe', proto: null, rota: '/veiculos/__ID__', nota: 'rota parametrizada da mesma tela' },
];

const ROTAS_ADMINISTRADOR = [
  { id: 'login', proto: null, rota: null, nota: 'capturada antes de entrar' },
  { id: 'dashboard', proto: 'Dashboard', rota: '/' },
  { id: 'empresas', proto: 'Empresas', rota: '/empresas' },
  { id: 'administradores', proto: 'Administradores', rota: '/administradores' },
  { id: 'provisionamentos', proto: 'Provisionamentos', rota: '/provisionamentos', prefixo: true },
  { id: 'auditoria', proto: 'Auditoria global', rota: '/auditoria' },
  { id: 'perfil', proto: 'Perfil e aparência', rota: '/perfil' },
  { id: 'empresa-detalhe', proto: null, rota: '/empresas/__ID__', nota: 'aberta a partir da lista' },
  { id: 'nova-empresa', proto: null, rota: '/empresas/nova', nota: 'aberta pelo botão Nova empresa' },
];

const LARGURAS = (process.env.PNF_VISUAL_WIDTHS || '1280,1440,1920').split(',').map(Number);
const TEMAS = (process.env.PNF_VISUAL_THEMES || 'light,dark').split(',');

const PRODUTOS = [
  {
    id: 'desktop',
    proto: juntarCaminhos(
      PASTA_REFERENCIAS_VISUAIS,
      '01_DESIGN_EMPRESAS_APROVADO/entrega-empresas/PegaNaFrota - Design Final.dc.html',
    ),
    impl: juntarCaminhos(RAIZ, 'aplicativos/programa-empresa/dist/index.html'),
    preload: juntarCaminhos(RAIZ, 'aplicativos/programa-empresa/dist/sistema/ponte-segura.cjs'),
    entrar: ['Entrar'],
    rotas: ROTAS_PROGRAMA_EMPRESA,
  },
  {
    id: 'admin',
    proto: juntarCaminhos(
      PASTA_REFERENCIAS_VISUAIS,
      '02_ADMIN_WEB_APROVADO/entrega-admin/PegaNaFrota Admin Web - Design Final.dc.html',
    ),
    impl: juntarCaminhos(RAIZ, 'aplicativos/painel-administracao/dist/index.html'),
    preload: null,
    entrar: ['Continuar', 'Verificar e entrar', 'Concluir carregamento'],
    rotas: ROTAS_ADMINISTRADOR,
  },
];

for (const parametroItem of PRODUTOS) {
  if (!arquivoExiste(parametroItem.proto)) ignorar(`protótipo ausente: ${parametroItem.proto}`);
  if (!arquivoExiste(parametroItem.impl))
    ignorar(`build ausente: ${parametroItem.impl} — rode npm run build`);
}
if (!arquivoExiste(juntarCaminhos(RECURSOS_PROTOTIPO, 'react/umd/react.production.min.js'))) {
  ignorar('runtime do protótipo ausente (react/react-dom/babel)');
}

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
  const resultadoItem = await fetch(SERVIDOR, { signal: AbortSignal.timeout(4000) });
  if (!resultadoItem.ok) throw new Error();
} catch {
  ignorar('stack local fora do ar — `bash ferramentas/desenvolvimento/pilha-local.sh up`');
}

criarPastaSincrona(PASTA_IMAGENS_REFERENCIA, { recursive: true });
criarPastaSincrona(PASTA_IMAGENS_IMPLEMENTACAO, { recursive: true });

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

const administradorEmpresaIdentificador = codigoSql(`select m.user_id from public.company_memberships m
  join public.profiles p on p.id = m.user_id
  where m.role='company_admin' and m.active and p.active limit 1`);

let administradorPlataformaIdentificador = codigoSql(`select a.user_id from platform.admins a
  join public.profiles p on p.id = a.user_id
  where a.status='active' and p.active limit 1`);

if (!administradorPlataformaIdentificador) {
  administradorPlataformaIdentificador = codigoSql(`select p.id from public.profiles p where p.active
    order by p.created_at limit 1`);
  codigoSql(`insert into platform.admins (user_id, status) values ('${administradorPlataformaIdentificador}'::uuid,'active')
       on conflict (user_id) do update set status='active'`);
}
if (!administradorPlataformaIdentificador)
  falhar('nenhum profile ativo no banco local para atuar como platform_admin');

const sessaoProgramaEmpresa = {
  access_token: emitirToken(administradorEmpresaIdentificador, 'authenticated', 'aal1'),
  refresh_token: `dev-refresh-${administradorEmpresaIdentificador}`,
  token_type: 'bearer',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};
const sessaoAdministrador = {
  access_token: emitirToken(administradorPlataformaIdentificador, 'authenticated', 'aal1'),
  refresh_token: `dev-refresh-${administradorPlataformaIdentificador}`,
  token_type: 'bearer',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

const primeiraEmpresa = codigoSql(`select id from public.companies where status='active' limit 1`);
const primeiroVeiculo = codigoSql(`select id from public.vehicles where archived_at is null limit 1`);

const TIPOS_CONTEUDO = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
};
const PORTA = 5199;

const servidor = criarServidor((requisicao, resposta) => {
  const endereco = decodeURIComponent(requisicao.url.split('?')[0]);
  let arquivo = null;
  if (endereco.startsWith('/__runtime/react-dom.js'))
    arquivo = juntarCaminhos(RECURSOS_PROTOTIPO, 'react-dom/umd/react-dom.production.min.js');
  else if (endereco.startsWith('/__runtime/react.js'))
    arquivo = juntarCaminhos(RECURSOS_PROTOTIPO, 'react/umd/react.production.min.js');
  else if (endereco.startsWith('/__runtime/babel.js'))
    arquivo = juntarCaminhos(RECURSOS_PROTOTIPO, '@babel/standalone/babel.min.js');
  else if (endereco.startsWith('/proto/')) {
    const qual = endereco.split('/')[2];
    const parametroItem2 = PRODUTOS.find((itemComparado) => itemComparado.id === qual);
    if (!parametroItem2) {
      resposta.writeHead(404).end();
      return;
    }
    const restante = endereco.split('/').slice(3).join('/');
    arquivo = restante ? juntarCaminhos(obterPastaPai(parametroItem2.proto), restante) : parametroItem2.proto;
  }
  if (!arquivo || !arquivoExiste(arquivo)) {
    resposta.writeHead(404).end();
    return;
  }

  let corpo = lerArquivoSincrono(arquivo);
  if (arquivo.endsWith('support.js')) {
    corpo = Buffer.from(
      String(corpo)
        .replace(/https:\/\/unpkg\.com\/react-dom@[^"']+/g, '/__runtime/react-dom.js')
        .replace(/https:\/\/unpkg\.com\/react@[^"']+/g, '/__runtime/react.js')
        .replace(/https:\/\/unpkg\.com\/@babel\/standalone@[^"']+/g, '/__runtime/babel.js'),
    );
  }
  resposta.writeHead(200, {
    'Content-Type': TIPOS_CONTEUDO[arquivo.slice(arquivo.lastIndexOf('.'))] || 'application/octet-stream',
  });
  resposta.end(corpo);
});
await new Promise((resultadoItem) => servidor.listen(PORTA, '127.0.0.1', resultadoItem));

const verificacao = juntarCaminhos(pastaTemporariaSistema(), `pnf-visual-routes-${process.pid}.cjs`);

const CONFIGURACAO = {
  PORT: PORTA,
  DIR_DESIGN: PASTA_IMAGENS_REFERENCIA,
  DIR_IMPL: PASTA_IMAGENS_IMPLEMENTACAO,
  WIDTHS: LARGURAS,
  THEMES: TEMAS,
  BACKEND: SERVIDOR,
  sessaoDesktop: sessaoProgramaEmpresa,
  sessaoAdmin: sessaoAdministrador,
  primeiraEmpresa,
  primeiroVeiculo,
  produtos: PRODUTOS.map((parametroItem2) => ({
    id: parametroItem2.id,
    impl: parametroItem2.impl,
    preload: parametroItem2.preload,
    entrar: parametroItem2.entrar,
    rotas: parametroItem2.rotas,
  })),
};
gravarArquivoSincrono(
  juntarCaminhos(pastaTemporariaSistema(), `pnf-visual-cfg-${process.pid}.json`),
  JSON.stringify(CONFIGURACAO),
);

gravarArquivoSincrono(
  verificacao,
  `
const { app, BrowserWindow, session, ipcMain, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const CFG = JSON.parse(fs.readFileSync(process.env.PNF_VISUAL_CFG, 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const registros = [];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
    if (d.url.includes('unpkg.com')) return cb({ cancel: true });
    if (d.url.includes('fonts.googleapis.com') || d.url.includes('fonts.gstatic.com')) {
      return cb({ cancel: true });
    }
    cb({});
  });

  // O preload do Desktop conversa por IPC com o processo principal; aqui a
  // sonda responde. A sessão devolvida é real: um JWT do banco local, para o
  // renderer montar o shell com dados verdadeiros.
  let sessaoAtual = CFG.sessaoDesktop;

  // O renderer do Desktop pede o tema ao processo principal e REAPLICA no
  // boot, sobrescrevendo qualquer data-theme injetado. Sem espelhar aqui o
  // tema que está sendo capturado, as capturas "escuras" saíam claras — e a
  // medida comparava temas diferentes.
  let temaAtual = 'light';
  const stub = {
    'pnf:get-config': () => ({ supabaseUrl: CFG.BACKEND, anonKey: 'dev-anon-key-local-harness' }),
    'pnf:get-app-info': () => ({ version: '1.0.0', platform: process.platform, isDev: false }),
    'pnf:get-theme': () => ({ choice: temaAtual, effective: temaAtual }),
    'pnf:set-theme': () => ({ choice: temaAtual, effective: temaAtual }),
    'pnf:window-state': () => ({ maximized: false, bounds: null }),
    'pnf:session-load': () => sessaoAtual,
    'pnf:session-save': () => ({ persisted: true }),
    'pnf:session-clear': () => { sessaoAtual = null; return { cleared: true }; },
    'pnf:config-status': () => ({ hasUrl: true, hasAnonKey: true, urlValid: true,
      source: 'harness visual', searchedPaths: [], encryptionAvailable: true }),
    'pnf:export-save': () => ({ saved: false }),
    'pnf:open-external': () => false,
  };
  for (const [ch, fn] of Object.entries(stub)) ipcMain.handle(ch, () => fn());

  const janelas = {};
  const janela = (produto) => {
    if (janelas[produto.id]) return janelas[produto.id];
    const w = new BrowserWindow({
      width: 1280, height: 900, show: false,
      webPreferences: Object.assign(
        { contextIsolation: true, nodeIntegration: false, sandbox: true },
        produto.preload ? { preload: produto.preload } : {},
      ),
    });
    janelas[produto.id] = w;
    return w;
  };

  const protoWin = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  async function shot(win, dir, nome) {
    await wait(500);
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(dir, nome + '.png'), img.toPNG());
      return true;
    } catch (e) { return false; }
  }

  /** Aciona o seletor do harness do protótipo pelo texto da opção. */
  const escolher = (win, opcao) => win.webContents.executeJavaScript(
    '(() => { const alvo = ' + JSON.stringify(opcao.toLowerCase()) + ';'
    + ' for (const s of document.querySelectorAll("select")) {'
    + '   const o = [...s.options].find(x => x.textContent.trim().toLowerCase() === alvo);'
    + '   if (!o) continue;'
    + '   Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s), "value").set.call(s, o.value);'
    + '   s.dispatchEvent(new Event("change", { bubbles: true })); return true; }'
    + ' return false; })()'
  ).catch(() => false);

  // O escape de \s se perdia em dois níveis (template da sonda + literal de
  // string), virando a letra "s" literal: o normalizador apagava o "s" dos
  // rótulos, e só os itens SEM essa letra casavam. Definir a classe por código
  // de caractere elimina a barra invertida do caminho.
  const NORM = '((t) => String(t||"").replace('
    + 'new RegExp("["+String.fromCharCode(32,9,10,13)+"]+","g")," ").trim().toLowerCase())';

  /**
   * Clica um botão do protótipo pelo texto.
   *
   * O modo prefixo existe porque alguns itens de menu carregam um contador no
   * mesmo nó ("Provisionamentos 2"); exigir texto exato erraria o alvo.
   */
  const clicar = (win, texto, prefixo) => win.webContents.executeJavaScript(
    '(() => { const alvo = ' + JSON.stringify(texto.trim().toLowerCase()) + ';'
    + ' const prefixo = ' + JSON.stringify(!!prefixo) + ';'
    + ' const norm = ' + NORM + ';'
    + ' const b = [...document.querySelectorAll("button,a")].find(x => {'
    + '   const t = norm(x.textContent);'
    + '   return prefixo ? t.startsWith(alvo) : t === alvo; });'
    + ' if (!b) return false; b.click(); return true; })()'
  ).catch(() => false);

  for (const produto of CFG.produtos) {
    const implWin = janela(produto);

    for (const width of CFG.WIDTHS) {
      protoWin.setContentSize(width, 900);
      implWin.setContentSize(width, 900);
      await wait(250);

      for (const tema of CFG.THEMES) {
        temaAtual = tema;

        // ================= PROTÓTIPO =================
        await protoWin.loadURL('http://127.0.0.1:' + CFG.PORT + '/proto/' + produto.id + '/');
        await wait(4200);
        await escolher(protoWin, tema === 'dark' ? 'escuro' : 'claro');
        await wait(700);

        // O protótipo simula a JANELA do aplicativo por conta própria, e o
        // padrão é 1440×900. Sem acionar esse seletor, a captura a 1920 mostra
        // um app de 1440 centralizado com faixas escuras nas laterais — e a
        // medida comparava moldura, não composição.
        const JANELAS = { 1280: '1280×720', 1440: '1440×900', 1920: '1920×1080' };
        if (JANELAS[width]) {
          await escolher(protoWin, JANELAS[width]);
          await wait(900);
        }

        // Login antes de entrar
        await shot(protoWin, CFG.DIR_DESIGN, produto.id + '__login__' + width + '__' + tema);

        for (const passo of produto.entrar) {
          await clicar(protoWin, passo);
          await wait(2200);
        }

        // Espera a navegação existir. Clicar antes disso falhava em silêncio
        // nos primeiros itens e só acertava os últimos — o que produzia uma
        // cobertura parcial sem nenhum erro visível.
        const primeiroItem = (produto.rotas.find((x) => x.proto) || {}).proto;
        for (let i = 0; i < 25; i += 1) {
          const pronto = await protoWin.webContents.executeJavaScript(
            '(() => { const t = ' + JSON.stringify((primeiroItem || '').toLowerCase()) + ';'
            + ' const norm = ' + NORM + ';'
            + ' return [...document.querySelectorAll("button,a")].some(x =>'
            + '   norm(x.textContent).startsWith(t)); })()'
          ).catch(() => false);
          if (pronto) break;
          await wait(500);
        }

        const dump0 = await protoWin.webContents.executeJavaScript(
          '(() => { const norm = ' + NORM + ';'
          + ' return [...document.querySelectorAll("button,a")].map(x=>norm(x.textContent))'
          + '   .filter(Boolean).slice(0,30); })()'
        ).catch(() => []);
        console.log('__NAV0__' + produto.id + '__' + JSON.stringify(dump0));

        for (const r of produto.rotas) {
          if (!r.proto) continue;
          const achou = await clicar(protoWin, r.proto, r.prefixo);
          if (!achou) {
            const dumpX = await protoWin.webContents.executeJavaScript(
              '(() => { const norm = ' + NORM + ';'
              + ' return [...document.querySelectorAll("button,a")].map(x=>norm(x.textContent))'
              + '   .filter(Boolean).slice(0,12); })()'
            ).catch(() => []);
            console.log('__MISS__' + r.id + '__' + JSON.stringify(dumpX));
          }
          await wait(1400);
          if (achou) {
            await shot(protoWin, CFG.DIR_DESIGN, produto.id + '__' + r.id + '__' + width + '__' + tema);
          }
          registros.push({ produto: produto.id, rota: r.id, width, tema, lado: 'design', ok: !!achou });
        }

        // ================= IMPLEMENTAÇÃO =================
        sessaoAtual = produto.id === 'desktop' ? CFG.sessaoDesktop : CFG.sessaoAdmin;

        // Login: sem sessão
        sessaoAtual = null;
        await implWin.loadFile(produto.impl);
        await implWin.webContents.executeJavaScript(
          'try { sessionStorage.clear(); localStorage.setItem("pnf.admin.theme", ' + JSON.stringify(tema) + ');'
          + ' localStorage.setItem("pnf.desktop.theme", ' + JSON.stringify(tema) + '); } catch(e) {}'
          + ' document.documentElement.setAttribute("data-theme", ' + JSON.stringify(tema) + '); true'
        ).catch(() => {});
        await wait(1500);
        await shot(implWin, CFG.DIR_IMPL, produto.id + '__login__' + width + '__' + tema);

        // Sessão ativa
        sessaoAtual = produto.id === 'desktop' ? CFG.sessaoDesktop : CFG.sessaoAdmin;
        const sessaoJson = JSON.stringify(JSON.stringify(
          produto.id === 'desktop' ? CFG.sessaoDesktop : CFG.sessaoAdmin));

        await implWin.loadFile(produto.impl);
        await implWin.webContents.executeJavaScript(
          'try { sessionStorage.setItem("pnf.admin.session", ' + sessaoJson + ');'
          + ' localStorage.setItem("pnf.admin.theme", ' + JSON.stringify(tema) + ');'
          + ' localStorage.setItem("pnf.desktop.theme", ' + JSON.stringify(tema) + '); } catch(e) {}'
          + ' true'
        ).catch(() => {});
        implWin.reload();
        await wait(3200);


        for (const r of produto.rotas) {
          if (!r.rota) continue;
          let destino = r.rota;
          if (destino.includes('__ID__')) {
            destino = destino.replace('__ID__',
              produto.id === 'admin' ? CFG.primeiraEmpresa : CFG.primeiroVeiculo);
          }
          await implWin.webContents.executeJavaScript(
            'location.hash = ' + JSON.stringify('#' + destino) + '; true'
          ).catch(() => {});
          await wait(1600);
          await implWin.webContents.executeJavaScript(
            '(() => { for (const m of document.querySelectorAll(".modal-backdrop")) m.remove();'
            + ' document.body.style.removeProperty("overflow");'
            + ' document.documentElement.setAttribute("data-theme", ' + JSON.stringify(tema) + ');'
            + ' return true; })()'
          ).catch(() => {});
          await wait(400);
          const ok = await shot(implWin, CFG.DIR_IMPL, produto.id + '__' + r.id + '__' + width + '__' + tema);
          registros.push({ produto: produto.id, rota: r.id, width, tema, lado: 'impl', ok });
        }
      }
    }
  }

  console.log('__ROUTES__' + JSON.stringify(registros));
  app.exit(0);
});
`,
  'utf8',
);

const filho = iniciarProcesso(
  'xvfb-run',
  ['-a', '--server-args=-screen 0 1920x1080x24', caminhoElectron, verificacao, '--no-sandbox'],
  {
    cwd: RAIZ,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      PNF_VISUAL_CFG: juntarCaminhos(pastaTemporariaSistema(), `pnf-visual-cfg-${process.pid}.json`),
    },
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
const temporizador = setTimeout(() => filho.kill('SIGKILL'), 1500000);

filho.on('close', (codigo) => {
  clearTimeout(temporizador);
  servidor.close();

  const instante = saida.indexOf('__ROUTES__');
  if (instante < 0) {
    if (/cannot open display/i.test(erro)) ignorar('sem servidor gráfico');
    console.error(erro.slice(0, 900));
    falhar(`sem saída da sonda (código ${codigo})`);
  }
  const registros = JSON.parse(saida.slice(instante + 10).split('\n')[0]);

  for (const linha of saida.split('\n')) {
    if (linha.startsWith('__NAV0__') || linha.startsWith('__MISS__')) {
      console.log('  ' + linha.replace(/__/g, ' ').slice(0, 190));
    }
  }

  const porRota = {};
  for (const resultadoItem of registros) {
    const chaveItem = `${resultadoItem.produto}/${resultadoItem.rota}`;
    porRota[chaveItem] = porRota[chaveItem] || { design: 0, impl: 0 };
    if (resultadoItem.ok) porRota[chaveItem][resultadoItem.lado === 'design' ? 'design' : 'impl'] += 1;
  }

  console.log('visual:routes — capturas rota a rota\n');
  console.log(`  ${'rota'.padEnd(28)}${'design'.padEnd(9)}impl`);
  for (const [chaveItem, veiculoItem] of Object.entries(porRota)) {
    console.log(`  ${chaveItem.padEnd(28)}${String(veiculoItem.design).padEnd(9)}${veiculoItem.impl}`);
  }

  gravarArquivoSincrono(
    juntarCaminhos(CAPTURAS, 'routes.json'),
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        larguras: LARGURAS,
        temas: TEMAS,
        registros,
        porRota,
      },
      null,
      2,
    ),
  );

  console.log(`\n  design/        ${PASTA_IMAGENS_REFERENCIA}`);
  console.log(`  implementation ${PASTA_IMAGENS_IMPLEMENTACAO}`);
  console.log('\nvisual:routes  OK — capturas geradas. A medida está em visual:similarity.');
});
