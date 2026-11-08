#!/usr/bin/env node
import {
  readFileSync as lerArquivoSincrono,
  existsSync as arquivoExiste,
  readdirSync as listarPastaSincrona,
  statSync as consultarArquivoSincrono,
} from 'node:fs';

const PRINCIPAL = 'aplicativos/programa-empresa/sistema/abrir-janela.cjs';
const PONTE_SEGURA = 'aplicativos/programa-empresa/sistema/ponte-segura.cjs';
const ARQUIVO_CANAIS_COMUNICACAO = 'aplicativos/programa-empresa/sistema/canais-de-comunicacao.cjs';

const resultados = [];

function verificar(identificador, condicao, descricao, solucao) {
  resultados.push({ id: identificador, ok: Boolean(condicao), description: descricao, remedy: solucao });
}

if (!arquivoExiste(PRINCIPAL) || !arquivoExiste(PONTE_SEGURA)) {
  console.error('verify:electron  FAIL — arquivos do processo principal ausentes');
  process.exit(1);
}

const principal = lerArquivoSincrono(PRINCIPAL, 'utf8');
const preCarregamento = lerArquivoSincrono(PONTE_SEGURA, 'utf8');
const canaisIpcFonte = arquivoExiste(ARQUIVO_CANAIS_COMUNICACAO)
  ? lerArquivoSincrono(ARQUIVO_CANAIS_COMUNICACAO, 'utf8')
  : '';

function removerComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const principalCodigo = removerComentarios(principal);
const codigoPreCarregamento = removerComentarios(preCarregamento);

verificar(
  'CONTEXT_ISOLATION',
  /contextIsolation\s*:\s*true/.test(principalCodigo) &&
    !/contextIsolation\s*:\s*false/.test(principalCodigo),
  'contextIsolation habilitado',
  'sem isolamento, a página pode sequestrar a ponte do preload',
);

verificar(
  'NO_NODE_INTEGRATION',
  /nodeIntegration\s*:\s*false/.test(principalCodigo) && !/nodeIntegration\s*:\s*true/.test(principalCodigo),
  'nodeIntegration desabilitado',
  'com Node no renderer, um XSS vira acesso ao sistema de arquivos',
);

verificar(
  'NO_NODE_IN_WORKER',
  /nodeIntegrationInWorker\s*:\s*false/.test(principalCodigo),
  'nodeIntegrationInWorker desabilitado',
  'um Worker com Node contorna o isolamento do renderer',
);

verificar(
  'NO_NODE_IN_SUBFRAMES',
  /nodeIntegrationInSubFrames\s*:\s*false/.test(principalCodigo),
  'nodeIntegrationInSubFrames desabilitado',
  'subframe com Node é a mesma brecha por outra porta',
);

verificar(
  'SANDBOX',
  /sandbox\s*:\s*true/.test(principalCodigo) && !/sandbox\s*:\s*false/.test(principalCodigo),
  'sandbox habilitado',
  'o renderer precisa rodar no sandbox do Chromium',
);

verificar(
  'WEB_SECURITY',
  /webSecurity\s*:\s*true/.test(principalCodigo) && !/webSecurity\s*:\s*false/.test(principalCodigo),
  'webSecurity habilitado',
  'desligar same-origin para "resolver o CORS" abre o aplicativo inteiro',
);

verificar(
  'NO_INSECURE_CONTENT',
  /allowRunningInsecureContent\s*:\s*false/.test(principalCodigo),
  'conteúdo inseguro bloqueado',
  'conteúdo http dentro de contexto seguro anula o TLS',
);

verificar(
  'NO_EXPERIMENTAL',
  /experimentalFeatures\s*:\s*false/.test(principalCodigo),
  'recursos experimentais desligados',
  'superfície extra sem revisão de segurança',
);

verificar(
  'CSP_PRESENT',
  /Content-Security-Policy/.test(principalCodigo),
  'CSP aplicada por cabeçalho',
  'sem CSP, injeção de script executa',
);

verificar(
  'CSP_NO_UNSAFE_INLINE_SCRIPT',
  !/script-src[^;'"]*'unsafe-inline'/.test(principalCodigo),
  "script-src sem 'unsafe-inline'",
  "'unsafe-inline' em script-src anula a proteção contra XSS",
);

verificar(
  'CSP_NO_UNSAFE_EVAL',
  !/'unsafe-eval'/.test(principalCodigo),
  "nenhum 'unsafe-eval'",
  'eval reabre execução de string arbitrária',
);

verificar(
  'CSP_SCRIPT_SELF_ONLY',
  /script-src\s+'self'/.test(principalCodigo) && !/script-src[^;]*https?:\/\//.test(principalCodigo),
  "script-src 'self' sem origem remota",
  'origem remota em script-src é exatamente o que "zero CDN" proíbe',
);

verificar(
  'CSP_OBJECT_NONE',
  /object-src\s+'none'/.test(principalCodigo),
  "object-src 'none'",
  'plugins são superfície morta e perigosa',
);

verificar(
  'CSP_FRAME_ANCESTORS_NONE',
  /frame-ancestors\s+'none'/.test(principalCodigo),
  "frame-ancestors 'none'",
  'impede clickjacking se o conteúdo for embutido',
);

verificar(
  'CSP_BASE_URI_NONE',
  /base-uri\s+'none'/.test(principalCodigo),
  "base-uri 'none'",
  '<base> injetada redireciona todo caminho relativo',
);

verificar(
  'BLOCK_NAVIGATION',
  /will-navigate/.test(principalCodigo) && /preventDefault/.test(principalCodigo),
  'navegação externa bloqueada',
  'navegar para conteúdo remoto o faria rodar com o preload carregado',
);

verificar(
  'WINDOW_OPEN_DENIED',
  /setWindowOpenHandler/.test(principalCodigo) && /action:\s*'deny'/.test(principalCodigo),
  'abertura de janela negada',
  'janela nova herdaria privilégios',
);

verificar(
  'BLOCK_WEBVIEW',
  /will-attach-webview/.test(principalCodigo),
  'webview bloqueada',
  'webview embutida herda privilégios do host',
);

verificar(
  'HARDEN_ALL_CONTENTS',
  /web-contents-created/.test(principalCodigo),
  'travas aplicadas a todo webContents',
  'proteger só a janela principal deixa brecha para as demais',
);

verificar(
  'EXTERNAL_SCHEME_ALLOWLIST',
  /protocol\s*!==\s*'https:'/.test(principalCodigo) && /mailto:/.test(principalCodigo),
  'openExternal restrito a https e mailto',
  'esquemas do sistema podem iniciar processos',
);

verificar(
  'CERT_ERROR_REJECTED',
  /certificate-error/.test(principalCodigo) && /(?:callback|funcaoRetorno)\(false\)/.test(principalCodigo),
  'certificado inválido recusado',
  'aceitar certificado inválido anula o TLS',
);

verificar(
  'PERMISSIONS_DENIED',
  /setPermissionRequestHandler/.test(principalCodigo) &&
    /(?:callback|funcaoRetorno)\(false\)/.test(principalCodigo),
  'permissões de dispositivo negadas por padrão',
  'câmera e afins estão fora do escopo desta entrega',
);

verificar(
  'DEVICE_PERMISSION_DENIED',
  /setDevicePermissionHandler/.test(principalCodigo),
  'USB, serial e HID negados',
  'fecha a porta para ESP32 e periféricos nesta entrega',
);

verificar(
  'SANDBOX_PRELOAD_NO_LOCAL_REQUIRE',
  !/require\(\s*['"]\.{1,2}\//.test(codigoPreCarregamento),
  'preload sandboxed não importa módulos locais por require',
  'com sandbox:true, o require do preload só aceita o subconjunto documentado pelo Electron; módulo local impede a ponte window.pnf de carregar',
);

function extrairCanaisIpc(fonte) {
  return [...fonte.matchAll(/\b([A-Z][A-Z0-9_]*)\s*:\s*['"](pnf:[^'"]+)['"]/g)]
    .map((correspondenciaItem) => `${correspondenciaItem[1]}=${correspondenciaItem[2]}`)
    .sort();
}

verificar(
  'IPC_CHANNELS_SYNC',
  JSON.stringify(extrairCanaisIpc(canaisIpcFonte)) === JSON.stringify(extrairCanaisIpc(preCarregamento)),
  'canais IPC do preload estão sincronizados com o processo principal',
  'o preload precisa repetir os nomes por causa do sandbox, mas a lista deve ser idêntica ao arquivo canônico',
);

verificar(
  'CONTEXT_BRIDGE',
  /ponteDeContexto\.exposeInMainWorld/.test(codigoPreCarregamento),
  'ponte exposta por contextBridge',
  'atribuir em window direto ignora o isolamento',
);

verificar(
  'NO_RAW_IPC_EXPOSED',
  !/exposeInMainWorld\([^)]*ipcRenderer\s*\)/.test(codigoPreCarregamento) &&
    !/ipcRenderer\s*[,:]\s*ipcRenderer/.test(codigoPreCarregamento) &&
    !/\.\.\.ipcRenderer/.test(codigoPreCarregamento),
  'ipcRenderer cru não é exposto',
  'expor o objeto daria acesso a todo canal, inclusive os futuros',
);

verificar(
  'FROZEN_API',
  /Object\.freeze\(\{/.test(codigoPreCarregamento) ||
    /const api = Object\.freeze/.test(codigoPreCarregamento),
  'objeto exposto congelado',
  'sem freeze, a página troca um método e intercepta o que o app envia',
);

verificar(
  'NO_ARBITRARY_INVOKE',
  !/invoke:\s*\(/.test(codigoPreCarregamento) && !/invoke\s*=\s*\(channel/.test(codigoPreCarregamento),
  'nenhum invoke genérico com canal parametrizado',
  'invoke(canal) reintroduz acesso a todos os canais',
);

const INTERFACE = 'aplicativos/programa-empresa';
function interfaceArquivos() {
  const saida = [];
  const percorrer = (dadosRegistro) => {
    for (const evento of listarPastaSincrona(dadosRegistro)) {
      const completo = `${dadosRegistro}/${evento}`;
      if (consultarArquivoSincrono(completo).isDirectory()) percorrer(completo);
      else saida.push(completo);
    }
  };
  if (arquivoExiste(INTERFACE)) percorrer(INTERFACE);
  return saida.filter((formulario) => /\.(mjs|js)$/.test(formulario));
}

const interfaceCodigo = interfaceArquivos()
  .map((formulario) => removerComentarios(lerArquivoSincrono(formulario, 'utf8')))
  .join('\n');

verificar(
  'SESSION_NOT_IN_WEB_STORAGE',
  !/localStorage\.(set|get)Item\(\s*['"`][^'"`]*(session|token)/i.test(interfaceCodigo) &&
    !/sessionStorage\.(set|get)Item\(\s*['"`][^'"`]*(session|token)/i.test(interfaceCodigo),
  'sessão não usa localStorage/sessionStorage',
  'um XSS leria access_token e refresh_token do armazenamento do navegador',
);

verificar(
  'NO_TOKEN_IN_WEB_STORAGE',
  !/(access_token|refresh_token)[^\n]{0,60}(localStorage|sessionStorage)/i.test(interfaceCodigo) &&
    !/(localStorage|sessionStorage)[^\n]{0,60}(access_token|refresh_token)/i.test(interfaceCodigo),
  'nenhum token trafega para armazenamento do navegador',
  'o refresh token é o pior a vazar: renova sozinho e sobrevive ao logout',
);

verificar(
  'SAFE_STORAGE_USED',
  /armazenamentoSeguro\.encryptString/.test(principalCodigo) &&
    /armazenamentoSeguro\.decryptString/.test(principalCodigo),
  'sessão cifrada por safeStorage no processo principal',
  'persistir em texto puro trocaria um risco conhecido por outro pior',
);

verificar(
  'SAFE_STORAGE_AVAILABILITY_CHECKED',
  /isEncryptionAvailable/.test(principalCodigo),
  'disponibilidade do chaveiro é verificada antes de gravar',
  'sem chaveiro, gravar em texto puro seria pior que não persistir',
);

verificar(
  'SESSION_IPC_NARROW',
  /session:\s*Object\.freeze\(\{/.test(codigoPreCarregamento) &&
    !/session:\s*\{[^}]*invoke\s*:/.test(codigoPreCarregamento),
  'ponte de sessão expõe apenas save/load/clear',
  'um invoke genérico devolveria acesso a todos os canais',
);

verificar(
  'NO_SERVICE_ROLE',
  !/service[_-]?role/i.test(principalCodigo) && !/service[_-]?role/i.test(codigoPreCarregamento),
  'nenhuma menção a service_role em código',
  'a chave de serviço nunca pode existir no aplicativo',
);

const FORA_DO_ESCOPO = /\b(ocr|tesseract|esp32|servo|cancela|gate-?controller)\b/i;
verificar(
  'NO_OUT_OF_SCOPE_HARDWARE',
  !FORA_DO_ESCOPO.test(principalCodigo) && !FORA_DO_ESCOPO.test(codigoPreCarregamento),
  'sem OCR, ESP32, servo ou cancela',
  'fora do escopo desta entrega',
);

verificar(
  'NO_ADMIN_WEB',
  !/platform-admin|admin-web/i.test(principalCodigo) &&
    !/platform-admin|admin-web/i.test(codigoPreCarregamento),
  'Admin Web ausente do Electron',
  'o painel da plataforma é outro produto',
);

const falhou = resultados.filter((resultadoItem) => !resultadoItem.ok);

for (const resultadoItem of resultados) {
  console.log(
    `  ${resultadoItem.ok ? 'OK  ' : 'FAIL'}  ${resultadoItem.id.padEnd(30)} ${resultadoItem.description}`,
  );
  if (!resultadoItem.ok) console.log(`        motivo: ${resultadoItem.remedy}`);
}

console.log('');
if (falhou.length === 0) {
  console.log(`verify:electron  PASS  — ${resultados.length}/${resultados.length} invariantes`);
  process.exit(0);
}

console.error(`verify:electron  FAIL  — ${falhou.length}/${resultados.length} invariante(s) violada(s)`);
process.exit(1);
