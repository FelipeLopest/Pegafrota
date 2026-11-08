> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Contexto para IA e novos desenvolvedores

Documento de orientação para quem — pessoa ou agente — vai **modificar** este
projeto. Responde a uma pergunta: *o que preciso entender antes de mexer, e onde
encontro cada informação?*

Este arquivo não duplica a documentação técnica. Ele aponta para ela.

---

## 1. Contexto em 60 segundos

PegaNaFrota é um sistema de gestão de frota **multiempresa**. Um único projeto
Supabase serve dois produtos com públicos e privilégios diferentes:

```
┌──────────────────────┐        ┌──────────────────────────┐
│ Desktop (Electron)   │        │ Admin Web (site estático)│
│ empresas clientes    │        │ operadores da plataforma │
│ frota, pátio, custos │        │ empresas, provisionamento│
└──────────┬───────────┘        └────────────┬─────────────┘
           │ anon key + JWT do usuário       │ anon key + JWT
           │                                 │
     ┌─────▼─────────────┐          ┌────────▼──────────────┐
     │ PostgREST         │          │ Edge Function         │
     │ /rest/v1/rpc/*    │          │ platform-admin        │
     │ schema public     │          │ service_role → schema │
     │ sob RLS           │          │ platform              │
     └─────┬─────────────┘          └────────┬──────────────┘
           └──────────────┬──────────────────┘
                    ┌─────▼──────┐
                    │ PostgreSQL │
                    └────────────┘
```

**A regra estrutural mais importante:** o Admin Web nunca alcança dados
operacionais de uma empresa. Isso é imposto por grants e schemas, não por
código de interface. Ver [ADR-011](DECISOES_ATUAIS.md#decisao-011--camada-de-plataforma-e-dois-eixos-de-identidade).

**A segunda regra:** o cliente **nunca** envia `company_id`. A empresa é sempre
resolvida no servidor por `private.current_user_company_id()`. Qualquer código
novo que aceite empresa como parâmetro de cliente está errado.

---

## 2. Objetivo do sistema

Ver [`ESPECIFICACAO.md`](ESPECIFICACAO.md). Em resumo: manter quilometragem, custo e presença no
pátio **confiáveis por construção**, e não por disciplina do operador.

---

## 3. Stack

| Item | Valor | Onde confirmar |
|---|---|---|
| Node | ≥ 22 | `package.json:engines` |
| Monorepo | npm workspaces | `package.json:workspaces` |
| Desktop | Electron `^43.2.0` | `aplicativos/programa-empresa/package.json` |
| Admin Web | zero dependências de runtime | `aplicativos/painel-administracao/package.json` |
| Frontend | JavaScript ESM puro, sem framework, sem bundler | [ADR-008](../adr/ADR-008-vanilla-web-components.md), [ADR-013](DECISOES_ATUAIS.md#decisao-013--build-proprio-sem-bundler-e-sem-cdn) |
| Banco | PostgreSQL 15 | `supabase/config.toml:[db].major_version` |
| Edge Functions | Deno + `@supabase/supabase-js` | `supabase/functions/*/deno.json` |
| Empacotamento | `electron-builder` declarado, **não usado** nos scripts | ver §11, lacuna 4 |

---

## 4. Estrutura de diretórios

```
apps/
  company-desktop/          Electron — produto das empresas
    src/main/               processo principal + preload (CommonJS, .cjs)
    src/renderer/           interface (ESM, .mjs) — não acessa Node
    build.mjs               compilador próprio → dist/
    test/                   12 arquivos de teste/smoke/smoke
  platform-admin-web/       painel da plataforma
    src/                    ESM puro, roteador por hash
    build.mjs               compilador próprio → dist/
    preview.mjs             servidor local estático
    test/                   12 arquivos de teste/smoke
packages/
  contracts/                permissões, papéis, códigos de erro, rótulos pt-BR
  validation/               validadores + motor de importação XLSX/CSV
supabase/
  migrations/               49 arquivos — fonte única do schema
  functions/                platform-admin/ e admin-users/
  tests/database/           17 arquivos pgTAP
  tests/edge|integration/   testes das Edge Functions
  seed.sql                  demonstração determinística
  config.toml               configuração do Supabase local
scripts/                    build, gate, verificações, bootstrap e seed
docs/                       esta documentação
```

Detalhe de camadas em [`ARQUITETURA.md`](ARQUITETURA.md). Para a responsabilidade de cada pasta e arquivo-chave, consulte [`MAPA_DE_PASTAS_E_ARQUIVOS.md`](MAPA_DE_PASTAS_E_ARQUIVOS.md).

---

## 5. Módulos e responsabilidades

### 5.1 Banco de dados — onde vive a regra de negócio

| Schema | Papel | Exposto na API? |
|---|---|---|
| `public` | tabelas de negócio, views e RPCs do tenant | sim, sempre sob RLS |
| `private` | helpers, catálogo de permissões, triggers | **não** |
| `audit` | trilha append-only de negócio | **não** (lida pela view `public.audit_events`) |
| `platform` | camada global: admins, operações, auditoria global | endereçável, mas só `service_role` tem grants |

**Esta é a camada onde a maior parte da lógica realmente está.** Uma regra que
você procurar no JavaScript provavelmente está em SQL. Ver
[`BANCO_DE_DADOS.md`](BANCO_DE_DADOS.md) e [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md).

### 5.2 `packages/contracts`

Vocabulário compartilhado: códigos de permissão, papéis, códigos de erro,
status e rótulos em português. **Espelha** o banco — não é a fonte de verdade.
A fonte é `private.permissions` / `private.role_permissions`.

Alterar uma permissão exige mudar **os dois**: migration + este pacote.

### 5.3 `packages/validation`

Validação de entrada compartilhada pelos dois produtos (CNPJ por módulo 11,
placa antiga e Mercosul, senha, intervalos). Também contém `importacao.mjs`, o
motor de leitura local de XLSX/CSV e normalização de importações.

Validação aqui é **conveniência de interface**. Ela nunca é a garantia: toda
regra é revalidada no banco.

### 5.4 `apps/company-desktop`

- `src/sistema/abrir-janela.cjs` — janela, CSP, hardening de sessão, IPC, sessão cifrada
  com `safeStorage`, exportação de arquivos.
- `src/main/preload.cjs` — ponte `window.pnf`, lista fechada de 11 canais.
- `src/renderer/lib/session.mjs` — configuração, sessão, `requisitar()`, `rpc()`,
  contexto de permissões, sondagem de conectividade.
- `src/renderer/lib/data.mjs` — **camada de acesso a dados**: cache curto,
  invalidação por prefixo, paginação, todas as chamadas de RPC.
- `src/renderer/screens/` — telas. `index.mjs` (864 linhas) concentra a maioria;
  `analise.mjs` tem dashboard, odômetro e relatórios; `importacao.mjs` a
  importação em massa.

### 5.5 `apps/platform-admin-web`

- `src/lib/api.mjs` — sessão em `sessionStorage`, `chamar(acao, payload)` contra
  a Edge Function, objeto `api` com todas as ações, `acompanharOperacao()`.
- `src/router.mjs` — roteador por hash **e** shell da aplicação (navegação,
  atalhos, banner de conectividade).
- `src/screens/index.mjs` — 1.223 linhas, todas as telas do painel.

---

## 6. Componentes críticos

Cinco pontos concentram as garantias do sistema. Alterar qualquer um deles sem
ler o contexto quebra invariantes que testes cobrem.

| Componente | Arquivo | Por que é crítico |
|---|---|---|
| `private.record_odometer_event` | `migrations/20260729001300_rpc_odometer.sql` | única porta de escrita do ledger e do cache `current_odometer_km` |
| `public.register_vehicle_movement` | `migrations/20260729001700_rpc_movements.sql` | alternância entrada/saída, dedup e concorrência |
| `private.current_membership()` | `migrations/20260729000450_identity_helpers.sql` | resolve empresa + papel; base de **toda** policy RLS |
| `preload.cjs` | `apps/company-desktop/src/main/` | única superfície entre renderer e Node |
| `platform-admin/index.ts` | `supabase/functions/` | único ponto com `service_role` |

---

## 7. Fluxos principais

### 7.1 Abertura do Desktop

```
main.cjs → CSP + permission handlers + IPC
  → renderer/main.mjs: inicializar()
    → tema → carregarConfiguracao() (IPC pnf:get-config)
    → sessao.restore() (safeStorage)
    → contexto.load() → rpc('my_context')
       ├─ sem token          → tela de login
       ├─ sem vínculo ativo  → tela "Sem empresa vinculada"
       └─ ok                 → monta shell + roteador
```

`my_context()` devolve `sessionState: ACTIVE | NO_ACTIVE_MEMBERSHIP | ANONYMOUS |
NO_PROFILE`. A ausência de vínculo é **dado de retorno**, não exceção — é o que
permite a tela específica em vez de um erro genérico.

### 7.2 Conclusão de viagem (representativo de toda escrita transacional)

```
UI → dados.trips.complete(id, km)
   → rpc('complete_trip')
      1. assert_permission('trips.write')
      2. lock do VEÍCULO, depois do documento   ← ordem fixa, anti-deadlock
      3. valida estado, cronologia, km final > km inicial
      4. record_odometer_event(...)             ← ledger primeiro
      5. atualiza trips e libera o veículo
      6. log_audit_event
   → invalidarCache('trips','vehicles','dashboard','yard')
```

### 7.3 Provisionamento de empresa

```
Admin Web → chamar('company.provision', {company, firstAdmin, idempotencyKey})
  → platform.open_operation(...)        operação durável com 4 etapas
  → platform.provision_company_record   etapa 1 — transacional
  → auth.admin.createUser               etapa 2 — FORA do PostgreSQL
  → platform.provision_first_admin_password   etapas 3 e 4 — transacional
  ↳ falha após criar a conta Auth → deleteUser (compensação) + fail_provisioning
```

A etapa 2 é o único ponto que não pode participar da transação do banco — daí
todo o modelo de operação durável. Ver
[ADR-012](DECISOES_ATUAIS.md#decisao-012--primeiro-administrador-com-senha-direta).

### 7.4 Movimentação de pátio

Detalhado em [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md#movimentações-de-pátio).
Três camadas independentes garantem a alternância: lock, índice único e check de
paridade.

---

## 8. Como os módulos se comunicam

| De → Para | Mecanismo | Observação |
|---|---|---|
| renderer → main (Electron) | `window.pnf.*` → IPC | 11 canais, lista fechada em `ipc-channels.cjs` |
| Desktop → banco | HTTPS `/rest/v1/rpc/*` com anon key + JWT | `lib/session.mjs` |
| Desktop → gestão de equipe | HTTPS `/functions/v1/admin-users` | `lib/data.mjs` → `funcaoEdge()` |
| Admin Web → plataforma | HTTPS `/functions/v1/platform-admin` | `lib/api.mjs` → `chamar()` |
| Edge Function → banco | `supabase-js` com `service_role` | schema `platform` |
| RPC → RPC | chamada SQL direta | `record_odometer_event` é chamada por 4 RPCs |

Contratos completos em [`API.md`](API.md).

---

## 9. Onde encontrar cada coisa

| Procurando… | Vá para |
|---|---|
| uma permissão | `migrations/20260729000300_private_helpers.sql` §2 + `packages/contracts` |
| uma policy RLS | `migrations/20260729001000_rls_policies.sql` |
| um cálculo de custo | `migrations/20260729002000_views_dashboard.sql` e `..._002100_rpc_dashboard_reports.sql` |
| validação de formulário | `compartilhado/validacoes/exportar-validacoes.mjs` |
| chamada de rede do Desktop | `aplicativos/programa-empresa/dados/dados-do-programa.mjs` |
| chamada de rede do Admin | `aplicativos/painel-administracao/comunicacao/comunicacao-com-servidor.mjs` |
| uma tela do Desktop | `screens/index.mjs`, `screens/analise.mjs`, `screens/importacao.mjs` |
| uma tela do Admin | `src/screens/index.mjs` |
| rota / item de menu | `renderer/main.mjs` (`NAV`, `registrarRotas`) ou `admin/router.mjs` (`NAV`) |
| regra de entrada/saída | `migrations/20260729001700_rpc_movements.sql` |
| definição de erro | `compartilhado/permissoes-e-regras/exportar-regras.mjs` + `HINT_TO_HTTP` na Edge Function |
| variável de ambiente | `.env.example` e [`IMPLANTACAO.md`](IMPLANTACAO.md) |

---

## 10. Arquivos que exigem atenção especial

| Arquivo | Cuidado |
|---|---|
| `aplicativos/programa-empresa/sistema/ponte-segura.cjs` | roda com `sandbox: true`. **Não é possível usar `require()` de módulo local aqui** — os nomes de canal são duplicados de propósito e verificados por `verify-electron-security.mjs`. Já quebrou uma vez ([troubleshooting](SOLUCAO_DE_PROBLEMAS.md#windowpnf-é-undefined--cannot-read-properties-of-undefined-reading-getconfigstatus)). |
| `supabase/migrations/*` | migrations publicadas **não são reescritas**. Correção entra em migration nova. |
| `supabase/config.toml` | `schemas` não inclui `private` nem `audit`. Adicionar qualquer um deles expõe o modelo de segurança inteiro. |
| `apps/*/build.mjs` | os builds contêm as verificações de CDN, `service_role` e imports não resolvidos. Não são scripts descartáveis. |
| `compartilhado/permissoes-e-regras/exportar-regras.mjs` | consumido pelos dois produtos; qualquer remoção quebra ambos silenciosamente até o build. |
| `supabase/seed.sql` | determinístico e idempotente. `random()` real ou `gen_random_uuid()` fora de default quebram a reprodutibilidade. |

---

## 11. O que uma IA **não** deve fazer sem entender o contexto

1. **Não escreva em `vehicles.current_odometer_km`.** É cache derivado, protegido
   por trigger. Use `private.record_odometer_event`.
2. **Não insira em `vehicle_movements`, `vehicle_odometer_events`,
   `plate_read_events` nem em `fuelings` diretamente.** O grant não existe para
   `authenticated` — não há policy a contornar, é a RPC ou nada.
3. **Não altere a ordem de locks.** É sempre *veículo → documento*. Inverter
   reintroduz um deadlock já corrigido ([ADR-014](DECISOES_ATUAIS.md#decisao-014--ordem-de-locks-padronizada)).
4. **Não edite uma migration já publicada.** Crie uma nova.
5. **Não adicione `private` ou `audit` a `db.schemas`.**
6. **Não introduza framework, bundler ou dependência de CDN** sem novo ADR — três
   verificadores do gate falham (`verify-no-cdn`, `verify-boundaries`, `build:*`).
7. **Não compartilhe componentes de UI entre os dois produtos.** São sistemas de
   design distintos; `ferramentas/verificacoes/verificar-fronteiras.mjs` garante essa fronteira.
8. **Não mova `service_role` para fora das Edge Functions.** Os builds falham ao
   encontrar a string no código do cliente.
9. **Não troque `actor_user_id` histórico** para "destravar" uma exclusão. Isso
   adultera autoria. O caminho correto está em
   [`IMPLANTACAO.md`](IMPLANTACAO.md#substituir-o-administrador-global).
10. **Não confie em `navigator.onLine`.** Foi removido de propósito: gerava falso
    positivo de offline no Windows/Electron. A conectividade é medida por
    sondagem de `/auth/v1/health` ([ADR-015](DECISOES_ATUAIS.md#decisao-015--conectividade-por-sondagem-de-saude)).
11. **Não assuma que compilar equivale a funcionar.** Dois defeitos recentes
    (`telaImportacao is not defined`, export inexistente em `ui.mjs`) passaram
    pelo build e só apareceram com o Electron aberto.

---

## 12. Convenções

- **Idioma:** identificadores de código em **português** (`telaVeiculos`,
  `carregarConfiguracao`, `dadosEnvio`). Identificadores de **banco em inglês**
  (`vehicles`, `register_fueling`). Alguns nomes em inglês sobrevivem no
  JavaScript por compatibilidade — `screenDashboard` é um alias exportado de
  `telaPainel`.
- **RPCs devolvem `jsonb` em `camelCase`**; as colunas são `snake_case`.
- **Parâmetros de RPC usam prefixo `p_`.**
- **Erros são pares `SQLSTATE` + `HINT`.** O cliente decide a mensagem pelo
  `HINT`, nunca pelo texto.
- **Arquivos:** `.cjs` no main do Electron, `.mjs` em todo o resto,
  `.ts` nas Edge Functions.
- **Migrations:** `AAAAMMDDHHMMSS_assunto.sql`, com cabeçalho explicando o *porquê*.
- **Comentários explicam decisão, não sintaxe.** O código existente segue isso —
  mantenha.
- Indentação de 2 espaços, LF, UTF-8 (`.editorconfig`).

---

## 13. Executar, testar e validar alterações

```bash
npm ci
cp .env.example .env      # preencher PNF_SUPABASE_URL e PNF_SUPABASE_ANON_KEY

npm run desktop           # Desktop (compila + abre Electron)
npm run build:admin && npm run preview:admin

npm run lint
npm run test:unit
npm run gate              # tudo que o ambiente permitir
```

**Antes de considerar uma alteração pronta:**

| Mudou… | Rode no mínimo |
|---|---|
| qualquer JavaScript | `npm run lint && npm run test:unit` |
| tela ou componente | `npm run build:desktop` / `build:admin` — os builds validam imports nomeados |
| migration | `npm run db:test` e `npm run test:contracts` |
| Edge Function | `npm run test:edge:unit` |
| contrato entre cliente e banco | `npm run test:contracts` |
| configuração / `.env` / `config.toml` | `npm run test:config` |
| qualquer coisa antes de entregar | `npm run gate` |

O gate **nunca** marca como aprovado o que não conseguiu executar. Uma etapa
`N/E` é informação, não sucesso.

---

## 14. Lacunas conhecidas

1. **Câmera/ESP32:** o banco e as RPCs existem, mas ainda falta a porta de entrada por credencial de dispositivo, armazenamento da imagem e telas de gestão. Veja [`documentacao/funcionamento/CAMERA_ESP32_PRONTIDAO.md`](../produto/CAMERA_ESP32_PRONTIDAO.md).
2. **Empacotamento Windows:** `electron-builder` está declarado como dependência de desenvolvimento, porém o repositório ainda não possui script oficial de instalador/assinatura. A execução suportada para desenvolvimento continua sendo `npm run desktop`.
3. **E2E, banco e visual:** dependem de serviços/recursos externos. Um resultado `N/E` no gate significa **não executado**, nunca aprovado.
4. **Documentação original em `docs/architecture/`:** parte dela é blueprint/planejamento histórico. Para o estado implementado atual, use primeiro esta pasta `docs/ia/` e confirme no código/migrations.

---

## 15. Referências

- [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — o que o sistema faz e por quê
- [`ARQUITETURA.md`](ARQUITETURA.md) — arquitetura implementada
- [`BANCO_DE_DADOS.md`](BANCO_DE_DADOS.md) — modelo de dados e segurança
- [`API.md`](API.md) — contratos de RPC e Edge Functions
- [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md) — regras e onde são impostas
- [`INTEGRACOES.md`](INTEGRACOES.md) — serviços externos
- [`IMPLANTACAO.md`](IMPLANTACAO.md) — ambientes e publicação
- [`DESENVOLVIMENTO.md`](DESENVOLVIMENTO.md) — fluxo de trabalho
- [`SOLUCAO_DE_PROBLEMAS.md`](SOLUCAO_DE_PROBLEMAS.md) — problemas conhecidos
- [`DECISOES_ATUAIS.md`](DECISOES_ATUAIS.md) e [`docs/adr/`](../adr/) — decisões arquiteturais


## Automação de cadastros

Veja [`AUTOMACOES_IMPORTACAO.md`](AUTOMACOES_IMPORTACAO.md) para as invariantes da importação XLSX/CSV.
