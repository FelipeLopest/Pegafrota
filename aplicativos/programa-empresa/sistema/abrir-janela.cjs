'use strict';

const {
  app: aplicativo,
  BrowserWindow: JanelaElectron,
  ipcMain: comunicacaoPrincipal,
  shell: estrutura,
  session: sessao,
  nativeTheme: temaNativo,
  dialog: dialogo,
  safeStorage: armazenamentoSeguro,
} = require('electron');
const caminho = require('node:path');
const arquivosSistema = require('node:fs');

const ehDesenvolvimento = process.env.PNF_DEV === '1';

if (!aplicativo.requestSingleInstanceLock()) {
  aplicativo.quit();
  process.exit(0);
}

function interpretarArquivoAmbiente(arquivo) {
  const saida = {};
  for (const linha of arquivosSistema.readFileSync(arquivo, 'utf8').split('\n')) {
    const correspondenciaItem = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (correspondenciaItem)
      saida[correspondenciaItem[1]] = correspondenciaItem[2].trim().replace(/^["']|["']$/g, '');
  }
  return saida;
}

function carregarConfiguracao() {
  const consultados = [];

  const doAmbiente = {
    supabaseUrl: process.env.PNF_SUPABASE_URL || '',
    anonKey: process.env.PNF_SUPABASE_ANON_KEY || '',
  };
  if (doAmbiente.supabaseUrl && doAmbiente.anonKey) {
    return { ...doAmbiente, __source: 'variáveis de ambiente', __searched: consultados };
  }

  const candidatosJson = [
    process.resourcesPath ? caminho.join(process.resourcesPath, 'config.json') : null,
    caminho.join(aplicativo.getPath('userData'), 'config.json'),
    caminho.join(__dirname, '..', 'config.json'),
    caminho.join(__dirname, '..', '..', 'config.json'),
  ].filter(Boolean);

  for (const arquivo of candidatosJson) {
    consultados.push(arquivo);
    try {
      if (arquivosSistema.existsSync(arquivo)) {
        const configuracao = JSON.parse(arquivosSistema.readFileSync(arquivo, 'utf8'));
        if (configuracao.supabaseUrl && configuracao.anonKey) {
          return { ...configuracao, __source: arquivo, __searched: consultados };
        }
      }
    } catch {}
  }

  const candidatosAmbiente = [
    caminho.join(__dirname, '..', '..', '.env'),
    caminho.join(__dirname, '..', '..', '..', '..', '.env'),
    caminho.join(process.cwd(), '.env'),
  ];
  for (const arquivo of candidatosAmbiente) {
    consultados.push(arquivo);
    try {
      if (arquivosSistema.existsSync(arquivo)) {
        const ambiente = interpretarArquivoAmbiente(arquivo);
        if (ambiente.PNF_SUPABASE_URL && ambiente.PNF_SUPABASE_ANON_KEY) {
          return {
            supabaseUrl: ambiente.PNF_SUPABASE_URL,
            anonKey: ambiente.PNF_SUPABASE_ANON_KEY,
            __source: arquivo,
            __searched: consultados,
          };
        }
      }
    } catch {}
  }

  return { supabaseUrl: '', anonKey: '', __source: null, __searched: consultados };
}

const configuracao = carregarConfiguracao();

function origemBackend() {
  try {
    return new URL(configuracao.supabaseUrl).origin;
  } catch {
    return null;
  }
}

function montarCsp() {
  const origem = origemBackend();
  const conectar = ["'self'", origem, origem ? origem.replace(/^http/, 'ws') : null]
    .filter(Boolean)
    .join(' ');

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${conectar}`,
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
}

const CANAIS_COMUNICACAO = require('./canais-de-comunicacao.cjs');

const ARQUIVO_SESSAO = () => caminho.join(aplicativo.getPath('userData'), 'session.enc');

function criptografiaSessaoDisponivel() {
  try {
    return armazenamentoSeguro.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function salvarSessao(dadosEnvio) {
  if (!criptografiaSessaoDisponivel()) {
    return { persisted: false, reason: 'encryption_unavailable' };
  }
  try {
    const trechoAcumulado = armazenamentoSeguro.encryptString(JSON.stringify(dadosEnvio));
    arquivosSistema.writeFileSync(ARQUIVO_SESSAO(), trechoAcumulado, { mode: 0o600 });
    return { persisted: true };
  } catch (erro) {
    return { persisted: false, reason: 'write_failed' };
  }
}

function carregarSessao() {
  if (!criptografiaSessaoDisponivel()) return null;
  try {
    const arquivo = ARQUIVO_SESSAO();
    if (!arquivosSistema.existsSync(arquivo)) return null;
    const textoSimples = armazenamentoSeguro.decryptString(arquivosSistema.readFileSync(arquivo));
    return JSON.parse(textoSimples);
  } catch {
    try {
      arquivosSistema.unlinkSync(ARQUIVO_SESSAO());
    } catch {
      /* já não existe */
    }
    return null;
  }
}

function limparSessao() {
  try {
    if (arquivosSistema.existsSync(ARQUIVO_SESSAO())) arquivosSistema.unlinkSync(ARQUIVO_SESSAO());
  } catch {
    /* nada a fazer se já sumiu */
  }
  return { cleared: true };
}

let janelaPrincipal = null;

const ARQUIVO_ESTADO_JANELA = () => caminho.join(aplicativo.getPath('userData'), 'window-state.json');

function lerEstadoJanela() {
  try {
    const bruto = arquivosSistema.readFileSync(ARQUIVO_ESTADO_JANELA(), 'utf8');
    const textoItem = JSON.parse(bruto);
    if (Number.isFinite(textoItem.width) && Number.isFinite(textoItem.height)) return textoItem;
  } catch {}
  return null;
}

function salvarEstadoJanela() {
  if (!janelaPrincipal || janelaPrincipal.isDestroyed()) return;
  try {
    const limites = janelaPrincipal.getNormalBounds();
    arquivosSistema.writeFileSync(
      ARQUIVO_ESTADO_JANELA(),
      JSON.stringify({ ...limites, maximized: janelaPrincipal.isMaximized() }),
      'utf8',
    );
  } catch {}
}

function criarJanela() {
  const salvo = lerEstadoJanela();

  janelaPrincipal = new JanelaElectron({
    width: salvo?.width ?? 1280,
    height: salvo?.height ?? 800,
    x: salvo?.x,
    y: salvo?.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: temaNativo.shouldUseDarkColors ? '#0A0A0A' : '#FFFFFF',
    title: 'PegaNaFrota',
    webPreferences: {
      preload: caminho.join(__dirname, 'ponte-segura.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: ehDesenvolvimento,
      spellcheck: false,
      backgroundThrottling: true,
    },
  });

  if (salvo?.maximized) janelaPrincipal.maximize();

  janelaPrincipal.once('ready-to-show', () => janelaPrincipal.show());

  let janelaEstadoTemporizador = null;
  const agendarSalvamentoEstadoJanela = () => {
    clearTimeout(janelaEstadoTemporizador);
    janelaEstadoTemporizador = setTimeout(salvarEstadoJanela, 180);
  };
  janelaPrincipal.on('resize', agendarSalvamentoEstadoJanela);
  janelaPrincipal.on('move', agendarSalvamentoEstadoJanela);
  janelaPrincipal.on('close', salvarEstadoJanela);
  janelaPrincipal.on('closed', () => {
    janelaPrincipal = null;
  });

  janelaPrincipal.loadFile(caminho.join(__dirname, '..', 'index.html'));

  return janelaPrincipal;
}

function fortalecerNavegacao(conteudos) {
  conteudos.on('will-navigate', (evento, endereco) => {
    const alvo = new URL(endereco);
    const atual = new URL(conteudos.getURL() || 'file:///');
    if (alvo.protocol === 'file:' && atual.protocol === 'file:') return;
    evento.preventDefault();
  });

  conteudos.setWindowOpenHandler(({ url: endereco }) => {
    abrirExternoComSeguranca(endereco);
    return { action: 'deny' };
  });

  conteudos.on('will-attach-webview', (evento) => evento.preventDefault());

  conteudos.on('did-create-window', (janela) => janela.destroy());
}

function abrirExternoComSeguranca(brutoEndereco) {
  let endereco;
  try {
    endereco = new URL(brutoEndereco);
  } catch {
    return false;
  }
  if (endereco.protocol !== 'https:' && endereco.protocol !== 'mailto:') return false;
  estrutura.openExternal(endereco.toString());
  return true;
}

function fortalecerSessao() {
  const sessao2 = sessao.defaultSession;

  sessao2.webRequest.onHeadersReceived((detalhes, funcaoRetorno) => {
    funcaoRetorno({
      responseHeaders: {
        ...detalhes.responseHeaders,
        'Content-Security-Policy': [montarCsp()],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  sessao2.setPermissionRequestHandler((_conteudoJanela, _permissaoIgnorada, funcaoRetorno) =>
    funcaoRetorno(false),
  );
  sessao2.setPermissionCheckHandler(() => false);

  sessao2.setDevicePermissionHandler(() => false);

  const origem = origemBackend();
  sessao2.webRequest.onBeforeRequest((detalhes, funcaoRetorno) => {
    const endereco = detalhes.url;
    if (
      endereco.startsWith('file://') ||
      endereco.startsWith('devtools://') ||
      endereco.startsWith('blob:') ||
      endereco.startsWith('data:')
    ) {
      return funcaoRetorno({ cancel: false });
    }
    if (origem && endereco.startsWith(origem)) return funcaoRetorno({ cancel: false });
    return funcaoRetorno({ cancel: true });
  });
}

function registrarComunicacao() {
  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.GET_CONFIG, () => ({
    supabaseUrl: configuracao.supabaseUrl,
    anonKey: configuracao.anonKey,
  }));

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.GET_APP_INFO, () => ({
    version: aplicativo.getVersion(),
    platform: process.platform,
    isDev: ehDesenvolvimento,
  }));

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.GET_THEME, () => ({
    choice: temaNativo.themeSource,
    effective: temaNativo.shouldUseDarkColors ? 'dark' : 'light',
  }));

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.SET_THEME, (_eventoIgnorado, escolha) => {
    if (!['light', 'dark', 'system'].includes(escolha)) {
      throw new Error('Tema inválido.');
    }
    temaNativo.themeSource = escolha;
    return {
      choice: temaNativo.themeSource,
      effective: temaNativo.shouldUseDarkColors ? 'dark' : 'light',
    };
  });

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.WINDOW_STATE, () => ({
    maximized: janelaPrincipal?.isMaximized() ?? false,
    bounds: janelaPrincipal?.getNormalBounds() ?? null,
  }));

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.EXPORT_SAVE, async (_eventoIgnorado, dadosEnvio) => {
    const { suggestedName: sugeridoNome, content: conteudo, format: formatarValor } = dadosEnvio ?? {};

    if (typeof conteudo !== 'string' || conteudo.length > 50 * 1024 * 1024) {
      throw new Error('Conteúdo inválido para exportação.');
    }
    if (!['csv', 'json'].includes(formatarValor)) {
      throw new Error('Formato não suportado.');
    }

    const seguroNome = String(sugeridoNome ?? 'relatorio')
      .replace(/[^\w\-. ]+/g, '_')
      .slice(0, 120);

    const { canceled: cancelado, filePath: arquivoCaminho } = await dialogo.showSaveDialog(janelaPrincipal, {
      defaultPath: `${seguroNome}.${formatarValor}`,
      filters: [{ name: formatarValor.toUpperCase(), extensions: [formatarValor] }],
    });

    if (cancelado || !arquivoCaminho) return { saved: false };

    await arquivosSistema.promises.writeFile(arquivoCaminho, conteudo, 'utf8');
    return { saved: true, filePath: arquivoCaminho };
  });

  comunicacaoPrincipal.handle(
    CANAIS_COMUNICACAO.IMPORT_TEMPLATE_SAVE,
    async (_eventoIgnorado, modeloIdentificador) => {
      const permitidos = new Set([
        'veiculos',
        'motoristas',
        'locais',
        'abastecimentos',
        'manutencoes',
        'viagens',
        'equipe',
      ]);
      const identificador = String(modeloIdentificador || '');
      if (!permitidos.has(identificador)) throw new Error('Modelo de importação inválido.');

      const origem = caminho.join(
        __dirname,
        '..',
        'importacao',
        'modelos-de-planilha',
        `modelo-${identificador}.xlsx`,
      );
      if (!arquivosSistema.existsSync(origem))
        throw new Error('Modelo de importação não encontrado no aplicativo.');

      const { canceled: cancelado, filePath: arquivoCaminho } = await dialogo.showSaveDialog(
        janelaPrincipal,
        {
          defaultPath: `modelo-${identificador}.xlsx`,
          filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }],
        },
      );
      if (cancelado || !arquivoCaminho) return { saved: false };
      await arquivosSistema.promises.copyFile(origem, arquivoCaminho);
      return { saved: true, filePath: arquivoCaminho };
    },
  );

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.OPEN_EXTERNAL, (_eventoIgnorado, endereco) =>
    abrirExternoComSeguranca(endereco),
  );

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.SESSION_SAVE, (_eventoIgnorado, dadosEnvio) => {
    if (!dadosEnvio || typeof dadosEnvio !== 'object') throw new Error('Sessão inválida.');
    const limpo = {
      access_token: String(dadosEnvio.access_token ?? ''),
      refresh_token: String(dadosEnvio.refresh_token ?? ''),
      expires_at: Number(dadosEnvio.expires_at ?? 0) || null,
      token_type: String(dadosEnvio.token_type ?? 'bearer'),
    };
    if (!limpo.access_token || !limpo.refresh_token) throw new Error('Sessão incompleta.');
    return salvarSessao(limpo);
  });

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.SESSION_LOAD, () => carregarSessao());
  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.SESSION_CLEAR, () => limparSessao());

  comunicacaoPrincipal.handle(CANAIS_COMUNICACAO.CONFIG_STATUS, () => ({
    hasUrl: Boolean(configuracao.supabaseUrl),
    hasAnonKey: Boolean(configuracao.anonKey),
    urlValid: Boolean(origemBackend()),
    source: configuracao.__source ?? 'desconhecida',
    searchedPaths: configuracao.__searched ?? [],
    encryptionAvailable: criptografiaSessaoDisponivel(),
  }));
}

aplicativo.on('second-instance', () => {
  if (!janelaPrincipal) return;
  if (janelaPrincipal.isMinimized()) janelaPrincipal.restore();
  janelaPrincipal.focus();
});

aplicativo.on('web-contents-created', (_evento, conteudos) => fortalecerNavegacao(conteudos));

aplicativo.whenReady().then(() => {
  fortalecerSessao();
  registrarComunicacao();
  criarJanela();

  aplicativo.on('activate', () => {
    if (JanelaElectron.getAllWindows().length === 0) criarJanela();
  });
});

aplicativo.on('window-all-closed', () => {
  if (process.platform !== 'darwin') aplicativo.quit();
});

aplicativo.on(
  'certificate-error',
  (evento, _conteudoJanela, _endereco, _erro, _certificado, funcaoRetorno) => {
    evento.preventDefault();
    funcaoRetorno(false);
  },
);

module.exports = {
  IPC_CHANNELS: CANAIS_COMUNICACAO,
  buildCsp: montarCsp,
  openExternalSafely: abrirExternoComSeguranca,
  loadConfig: carregarConfiguracao,
};
