> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Mapa de pastas e arquivos do repositório

Este documento descreve a organização **atual** do PegaNaFrota depois da unificação dos arquivos 6 e 7. A intenção é impedir que um desenvolvedor ou uma IA trate um arquivo histórico como fonte de verdade ou crie arquivos soltos sem uma responsabilidade clara.

## Regra de organização

- A raiz contém apenas arquivos de entrada/configuração do repositório.
- Código de produto fica em `apps/`.
- Código compartilhado fica em `packages/`.
- Ferramentas de desenvolvimento ficam em `scripts/`.
- Backend versionado fica em `supabase/`.
- Toda documentação fica em `docs/`, exceto `README.md`, `COMO_SUBIR_O_SISTEMA.md` e `AGENTS.md`, que precisam estar na raiz por serem pontos de entrada.
- Artefatos gerados (`dist/`, `node_modules/`, `.env`, relatórios de execução) não pertencem ao Git.

## Raiz

| Arquivo | Responsabilidade |
|---|---|
| `README.md` | visão curta do produto e orientação inicial |
| `AGENTS.md` | instruções para IA/agentes que forem editar o projeto |
| `COMO_SUBIR_O_SISTEMA.md` | instalação e execução prática do projeto |
| `package.json` | workspaces e comandos oficiais |
| `package-lock.json` | versões reproduzíveis das dependências; deve ser versionado |
| `.env.example` | modelo seguro das variáveis locais; `.env` real não vai para o Git |
| `.gitignore` | impede segredos, builds, dependências e pacotes de release no Git |
| `.editorconfig` | convenções básicas de edição |

Não devem reaparecer na raiz ZIPs de release, screenshots, relatórios de versão, cópias de configuração ou documentos `CORRECAO_*`. Esses itens, quando tiverem valor histórico, pertencem a `docs/historico/`.

## `apps/company-desktop/`

Aplicação Electron utilizada pelas empresas clientes.

### Arquivos de entrada

| Caminho | Responsabilidade |
|---|---|
| `package.json` | metadados do workspace Electron; `main` aponta para `src/sistema/abrir-janela.cjs` |
| `build.mjs` | gera `dist/` e injeta a configuração pública do Supabase |
| `src/sistema/abrir-janela.cjs` | processo principal: janela, CSP, permissões, IPC, armazenamento seguro |
| `src/main/preload.cjs` | ponte mínima e congelada entre renderer e processo principal |
| `src/main/ipc-channels.cjs` | catálogo dos canais IPC usados pelo processo principal |
| `src/renderer/main.mjs` | bootstrap do renderer, sessão, shell e rotas |
| `src/renderer/index.html` | documento HTML inicial |
| `src/renderer/theme-boot.js` | aplica tema antes do primeiro paint |

### `src/renderer/lib/`

Camada reutilizável do Desktop.

- `session.mjs`: autenticação, contexto, chamadas HTTP/RPC e conectividade.
- `data.mjs`: acesso a dados, cache, paginação e invalidação.
- `ui.mjs`: primitivas de interface e roteador.
- `icons.mjs`: sprite local de ícones; sem CDN.
- demais módulos: utilidades focadas no renderer; não devem acessar APIs Node diretamente.

### `src/renderer/screens/`

Telas efetivamente usadas. Não deve existir cópia paralela/versionada de tela (`v8.mjs`, `old`, `backup`, etc.).

- `index.mjs`: cadastros e fluxos operacionais principais.
- `analise.mjs`: visão geral, odômetro e relatórios.
- `importacao.mjs`: modelos, transformação e validação de importação XLSX/CSV.
- `planilha.mjs`: leitor local e limitado da primeira aba de arquivos `.xlsx`.

### `test/`

Testes agora têm nomes pela responsabilidade (`connectivity`, `performance`, `dashboard-ui`, etc.), e não pelo número da versão em que surgiram. Isso evita carregar a história do produto para o nome do teste.

## `apps/platform-admin-web/`

Painel web dos administradores da plataforma.

| Caminho | Responsabilidade |
|---|---|
| `build.mjs` | build estático e validação dos imports/configuração |
| `preview.mjs` | servidor local do build |
| `src/main.mjs` | autenticação e bootstrap do painel |
| `src/router.mjs` | shell, navegação, atalhos e roteamento |
| `src/lib/api.mjs` | cliente da Edge Function `platform-admin` |
| `src/screens/index.mjs` | telas administrativas da plataforma |
| `src/screens/invite.mjs` | fluxo público de convite de integrante/equipe |
| `src/components/` | primitivas visuais, escopo e ícones |
| `src/styles/` | tokens e estilos do Admin Web |
| `test/` | smoke e regressões com nomes funcionais |

Não existe tela MFA/TOTP no produto atual.

## `packages/`

Somente pacotes realmente consumidos pelos workspaces.

### `contracts/`

Vocabulário compartilhado do produto: permissões, papéis, estados, rótulos e erros. Deve espelhar o catálogo do banco. Inclui também as permissões de câmeras/OCR já existentes no backend, embora a interface física ainda não esteja implementada.

### `validation/`

Validadores e normalizadores compartilhados, inclusive importação XLSX/CSV. Validação de frontend melhora a UX; as garantias finais continuam no banco.

Não existe mais `packages/shared-types`, pois era órfão e não fazia parte dos workspaces.

## `scripts/`

Ferramentas executáveis do monorepo. A quantidade de arquivos aqui é intencional: cada script é um comando operacional verificável e muitos são chamados diretamente pelo `package.json`.

### Execução/build

- `desktop.mjs`: valida `.env`, compila e abre o Electron.
- `dev-stack.sh`: sobe/desce a pilha local de integração.
- `dev-gateway.mjs`, `dev-token.mjs`: harness local de autenticação/testes; compatibilidade de teste, não fluxo de produto.

### Qualidade

- `lint.mjs`
- `run-gate.mjs`
- `test-contracts.mjs`
- `test-config-consistency.mjs`
- `verify-*.mjs`
- `visual-*.mjs`
- `report-counts.mjs`

### Integração/E2E

- `test-integration.mjs`
- `test-auth-real.mjs`
- `test-edge-integration.mjs`
- `test-e2e.mjs`
- `test-e2e-admin.mjs`
- `deadlock-probe.mjs`

### Administração/seed

- `bootstrap-platform-admin.mjs`
- `replace-platform-admin.mjs`
- `seed-demo-remote.mjs`
- `verify-seed.mjs`
- `verify-remote-contracts.mjs`

O antigo `seed-auth-users.mjs` foi removido porque estava substituído pelo seed remoto atual.

## `supabase/`

Backend versionado. É a área mais sensível do repositório.

### `migrations/`

49 migrations, em ordem cronológica. **Não editar migrations já aplicadas em produção**; qualquer alteração de schema deve nascer em migration nova.

### `functions/`

- `platform-admin/`: operações privilegiadas da plataforma, incluindo provisionamento, gestão de usuários e exclusão definitiva.
- `admin-users/`: gestão de equipe por administradores da empresa.

São as únicas áreas que podem usar credenciais privilegiadas de servidor. Nunca copiar `service_role` para Electron/Admin Web.

### `tests/`

- `database/`: pgTAP para schema, RLS, RPCs, auditoria e concorrência.
- `edge/` e `integration/`: testes das funções e integrações.

### Arquivos de topo

- `config.toml`: configuração do Supabase local e Edge Functions.
- `seed.sql`: dados determinísticos de demonstração.

## `docs/`

### `ia/`

Documentação consolidada do estado atual para IA e novos desenvolvedores. É o primeiro lugar a consultar depois do código/migrations.

### `produto/`

Descrição funcional do produto e prontidão da futura integração ESP32/câmera.

### `operacao/`

Deploy e cenários E2E atuais.

### `adr/`

ADRs 001–010 originais. Decisões atuais posteriores e consolidadas estão em `ia/DECISOES_ATUAIS.md`.

### `architecture/` e `database/`

Referência detalhada/original. Os arquivos possuem aviso porque partes refletem o desenho inicial e podem não acompanhar cada refatoração posterior.

### `historico/`

Relatórios e notas de versões passadas. Não é fonte de verdade para implementar funcionalidade atual.

### `assets/`

Imagens úteis à documentação; não devem ficar soltas na raiz.

## Onde colocar um arquivo novo

| Tipo | Local |
|---|---|
| tela do Desktop | `apps/company-desktop/src/renderer/screens/` |
| biblioteca do Desktop | `apps/company-desktop/src/renderer/lib/` |
| tela do Admin | `apps/platform-admin-web/src/screens/` |
| componente do Admin | `apps/platform-admin-web/src/components/` |
| contrato compartilhado | `packages/contracts/` |
| validação compartilhada | `packages/validation/` |
| regra de banco | nova migration em `supabase/migrations/` |
| Edge Function | `supabase/functions/<nome>/` |
| teste | junto da camada correspondente em `test/` ou `supabase/tests/` |
| documento atual para IA | `docs/ia/` |
| documento funcional | `docs/produto/` |
| procedimento de operação | `docs/operacao/` |
| relatório antigo/de versão | `docs/historico/` |
| screenshot documental | `docs/assets/` |

## Arquivos que nunca devem ser adicionados ao repositório

- `.env`
- `node_modules/`
- `**/dist/`
- `supabase/.temp/`
- `artifacts/`
- ZIP/TAR de release dentro do próprio projeto
- senhas, tokens ou `service_role`
- cópias `arquivo-old`, `backup`, `v8`, `final-final` de código ativo

