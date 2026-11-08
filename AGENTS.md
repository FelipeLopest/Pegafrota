# PegaNaFrota — orientação de manutenção

Leia `GUIA_DO_PROJETO.md` e `RELATORIO_DA_REVISAO.md` antes de editar. A fonte de verdade é o código atual e as migrations; documentos antigos estão identificados como referências.

- Identificadores internos e arquivos próprios devem usar português sem acentos, com nomes que expliquem o conteúdo.
- Uma tela por arquivo em `telas/tela-assunto.mjs`. Formulários em `formularios/`, consultas em `dados/`, aparência em `estilos/`.
- Programa da empresa e painel da administração são produtos separados. Não misturar seus componentes visuais.
- Não traduzir nomes de APIs, banco, payloads, permissões, canais IPC ou variáveis de ambiente. Os aliases públicos preservados garantem compatibilidade.
- Não reescrever migrations já existentes. As assinaturas originais são conferidas por `npm run verificar:organizacao`.
- Isolamento de empresas e garantias transacionais permanecem no banco. Não substituir RPCs por escritas diretas.
- Históricos de odômetro e auditoria são append-only na operação normal. A exceção existente de exclusão definitiva da empresa é administrativa e controlada pelo servidor.
- Chaves privilegiadas ficam apenas no servidor e nas rotinas administrativas. Nenhum frontend recebe `service_role`.
- Preservar `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. O preload não pode fazer `require()` de módulo local.
- MFA/TOTP não integra o produto atual. O primeiro administrador da empresa usa senha direta; convites da equipe são outro fluxo.
- Não adicionar CDN ao runtime.
- Importação exige prévia, validação e ordem de abastecimentos por veículo. Pátio/odômetro não entram no importador genérico.
- Cache precisa respeitar a geração da sessão; requisições pendentes antigas não podem repovoá-lo. Renovação de autenticação tem limite de uma repetição por operação.

Verificação mínima: `npm run lint`, `npm run testar`, `npm run test:edge:unit`, `npm run test:contracts`, `npm run test:config`, `npm run verify:secrets`, `npm run verify:no-cdn`, `npm run verify:boundaries`, `npm run verify:electron`, `npm run compilar` e `npm run verificar:organizacao`. Testes reais de banco e integrações usam ambiente descartável; não trate etapas não executadas como aprovadas.
