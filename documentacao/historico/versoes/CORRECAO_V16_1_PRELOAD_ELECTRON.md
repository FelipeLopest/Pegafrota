> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Correção v16.1 — inicialização do Electron

## Sintoma

Ao abrir o Desktop aparecia:

`Cannot read properties of undefined (reading 'getConfigStatus')`

## Causa

O preload do Electron roda com `sandbox: true`. A otimização anterior passou a
carregar `./ipc-channels.cjs` com `require()` dentro do preload. Em preload
sandboxed, o Electron só permite um subconjunto de módulos e não permite usar
CommonJS local dessa forma. O preload falhava antes de executar
`contextBridge.exposeInMainWorld('pnf', ...)`, deixando `window.pnf` indefinido.

## Correção

- mantido `sandbox: true`;
- removido o `require('./ipc-channels.cjs')` do preload;
- canais IPC foram declarados diretamente no preload;
- adicionada verificação automática de sincronismo dos canais;
- o build agora falha se um `require` local voltar ao preload sandboxed;
- mensagem de inicialização ficou explícita caso a ponte Electron não carregue.

Não há alteração de banco, migrations, Edge Functions ou regras de negócio.
