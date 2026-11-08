export let configuracao = null;

export function ponteElectron() {
  const ponte = window.pnf;
  if (ponte?.getConfig && ponte?.getConfigStatus && ponte?.session) return ponte;

  const erro = new Error(
    'A ponte segura do Electron não foi carregada. Recompile o Desktop com "npm run build:desktop" ' +
      'e abra novamente com "npm run desktop".',
  );
  erro.hint = 'ELECTRON_PRELOAD_UNAVAILABLE';
  throw erro;
}

export async function carregarConfiguracao() {
  if (configuracao) return configuracao;
  const ponte = ponteElectron();
  configuracao = await ponte.getConfig();
  if (!configuracao?.supabaseUrl || !configuracao?.anonKey) {
    const situacao = await ponte.getConfigStatus().catch(() => null);
    const erro = new Error('Aplicativo sem configuração de servidor.');
    erro.configStatus = situacao;
    throw erro;
  }
  return configuracao;
}

export function estadoConfiguracao() {
  if (!window.pnf?.getConfigStatus) return Promise.resolve(null);
  return window.pnf.getConfigStatus();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { estadoConfiguracao as configStatus };
