'use strict';

const { contextBridge: ponteDeContexto, ipcRenderer: comunicacaoDaInterface } = require('electron');

/*
 * IMPORTANTE:
 * este preload roda com `sandbox: true`. Nesse modo, o `require` do Electron
 * não pode carregar módulos CommonJS locais como `./canais-de-comunicacao.cjs`.
 * Os nomes dos canais ficam repetidos aqui de propósito; o verificador de
 * segurança confere que eles continuam sincronizados com o processo principal.
 */
const CANAIS = Object.freeze({
  GET_CONFIG: 'pnf:get-config',
  GET_APP_INFO: 'pnf:get-app-info',
  SET_THEME: 'pnf:set-theme',
  GET_THEME: 'pnf:get-theme',
  WINDOW_STATE: 'pnf:window-state',
  EXPORT_SAVE: 'pnf:export-save',
  IMPORT_TEMPLATE_SAVE: 'pnf:import-template-save',
  OPEN_EXTERNAL: 'pnf:open-external',
  SESSION_SAVE: 'pnf:session-save',
  SESSION_LOAD: 'pnf:session-load',
  SESSION_CLEAR: 'pnf:session-clear',
  CONFIG_STATUS: 'pnf:config-status',
});

const servicos = Object.freeze({
  getConfig: () => comunicacaoDaInterface.invoke(CANAIS.GET_CONFIG),

  getAppInfo: () => comunicacaoDaInterface.invoke(CANAIS.GET_APP_INFO),

  getTheme: () => comunicacaoDaInterface.invoke(CANAIS.GET_THEME),
  setTheme: (escolha) => comunicacaoDaInterface.invoke(CANAIS.SET_THEME, escolha),

  getWindowState: () => comunicacaoDaInterface.invoke(CANAIS.WINDOW_STATE),

  exportFile: ({ suggestedName: sugeridoNome, content: conteudo, format: formatarValor }) =>
    comunicacaoDaInterface.invoke(CANAIS.EXPORT_SAVE, {
      suggestedName: sugeridoNome,
      content: conteudo,
      format: formatarValor,
    }),

  saveImportTemplate: (modeloIdentificador) =>
    comunicacaoDaInterface.invoke(CANAIS.IMPORT_TEMPLATE_SAVE, modeloIdentificador),

  openExternal: (endereco) => comunicacaoDaInterface.invoke(CANAIS.OPEN_EXTERNAL, endereco),

  session: Object.freeze({
    save: (dadosEnvio) => comunicacaoDaInterface.invoke(CANAIS.SESSION_SAVE, dadosEnvio),
    load: () => comunicacaoDaInterface.invoke(CANAIS.SESSION_LOAD),
    clear: () => comunicacaoDaInterface.invoke(CANAIS.SESSION_CLEAR),
  }),

  getConfigStatus: () => comunicacaoDaInterface.invoke(CANAIS.CONFIG_STATUS),
});

ponteDeContexto.exposeInMainWorld('pnf', servicos);
