> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ESPECIFICACAO.md — especificação do sistema

O que o PegaNaFrota deve fazer e quais regras precisam ser respeitadas.
Detalhes de implementação ficam em [`docs/`](../); as regras estão aqui e, com
o ponto exato onde são impostas, em [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md).

---

## 1. Visão do produto

Um SaaS de gestão de frota vendido a empresas. A plataforma é operada por uma
equipe própria; cada empresa cliente opera sua própria frota, isolada das demais.

Dois produtos, um backend:

- **Desktop** — usado pelas empresas para operar a frota.
- **Admin Web** — usado pela operação da plataforma para administrar empresas.

## 2. Objetivos

1. **Quilometragem confiável.** O odômetro de um veículo deve ser reconstruível
   evento a evento, com origem identificada, e nunca pode regredir.
2. **Presença no pátio correta.** Entrada e saída alternam obrigatoriamente,
   mesmo sob clique duplo, leitura repetida de câmera ou concorrência.
3. **Custo fechado.** Combustível e manutenção somam por veículo e por mês sem
   erro de arredondamento.
4. **Isolamento entre empresas garantido pelo banco**, não pela interface.
5. **Rastreabilidade.** Toda ação relevante deixa trilha, e a trilha não pode ser
   reescrita.
6. **Operação administrativa segura.** Provisionar, suspender e excluir empresas
   exige confirmação explícita, é idempotente e fica registrado.

## 3. Atores

| Ator | Onde atua | O que é |
|---|---|---|
| **Administrador da plataforma** (`platform_admin`) | Admin Web | conta global; não pertence a nenhuma empresa |
| **Administrador da empresa** (`company_admin`) | Desktop | administra a empresa e sua equipe |
| **Gestor de frota** (`fleet_manager`) | Desktop | opera a frota inteira, exceto empresa e usuários |
| **Operador** (`operator`) | Desktop | rotina de pátio, viagens, abastecimentos, manutenções |
| **Visualizador** (`viewer`) | Desktop | somente consulta |
| **Motorista** | — | **registro operacional, sem login.** Fora do escopo do MVP |
| **Câmera / OCR** | — | origem de leitura de placa. Ver §12, restrição 3 |

Os dois eixos de identidade são **independentes**: `platform_admin` é um estado
global; `company_*` é vínculo com uma empresa. Um não implica o outro, e um
administrador de empresa jamais pode criar um administrador de plataforma.

## 4. Permissões

Autorização é por **permissão atômica**, não por papel. O papel é apenas um
agrupamento de permissões, definido no banco e consultável por
`public.my_permissions()`.

| Permissão | admin | gestor | operador | visualizador |
|---|:--:|:--:|:--:|:--:|
| `company.read` | ✅ | ✅ | ✅ | ✅ |
| `company.update` | ✅ | ❌ | ❌ | ❌ |
| `users.read` | ✅ | ✅ | ❌ | ❌ |
| `users.manage` | ✅ | ❌ | ❌ | ❌ |
| `drivers.read` | ✅ | ✅ | ✅ | ✅ |
| `drivers.write` / `drivers.archive` | ✅ | ✅ | ❌ | ❌ |
| `vehicles.read` | ✅ | ✅ | ✅ | ✅ |
| `vehicles.write` / `vehicles.archive` | ✅ | ✅ | ❌ | ❌ |
| `odometer.read` | ✅ | ✅ | ✅ | ✅ |
| `odometer.adjust` | ✅ | ✅ | ❌ | ❌ |
| `trips.read` | ✅ | ✅ | ✅ | ✅ |
| `trips.write` | ✅ | ✅ | ✅ | ❌ |
| `trips.cancel` | ✅ | ✅ | ❌ | ❌ |
| `fuelings.read` | ✅ | ✅ | ✅ | ✅ |
| `fuelings.write` | ✅ | ✅ | ✅ | ❌ |
| `maintenance.read` | ✅ | ✅ | ✅ | ✅ |
| `maintenance.write` | ✅ | ✅ | ✅ | ❌ |
| `maintenance.schedule` | ✅ | ✅ | ❌ | ❌ |
| `locations.read` | ✅ | ✅ | ✅ | ✅ |
| `locations.write` | ✅ | ✅ | ❌ | ❌ |
| `cameras.read` | ✅ | ✅ | ✅ | ✅ |
| `cameras.write` | ✅ | ✅ | ❌ | ❌ |
| `movements.read` | ✅ | ✅ | ✅ | ✅ |
| `movements.write` | ✅ | ✅ | ✅ | ❌ |
| `ocr.read` | ✅ | ✅ | ✅ | ✅ |
| `ocr.operate` | ✅ | ✅ | ✅ | ❌ |
| `dashboard.read` / `reports.read` | ✅ | ✅ | ✅ | ✅ |
| `reports.export` | ✅ | ✅ | ❌ | ❌ |
| `audit.read` | ✅ | ✅ | ❌ | ❌ |

Fonte: `private.role_permissions` (`migrations/20260729000300`). `fleet_manager`
recebe tudo exceto `company.update` e `users.manage`.

**Comportamento exigido da interface:** uma ação sem permissão aparece
**desabilitada com o motivo**, não oculta. Ocultar esconde do usuário que a
função existe e que ele poderia solicitá-la.

## 5. Conceitos do domínio

| Conceito | Definição |
|---|---|
| **Empresa** | o tenant. Identificada por CNPJ globalmente único e válido. |
| **Vínculo** (*membership*) | associação usuário↔empresa com papel e estado. Um usuário tem **no máximo um vínculo ativo**. |
| **Perfil** | espelho de aplicação de uma conta de autenticação. Nunca guarda senha. |
| **Veículo** | identificado por placa **globalmente única**. Possui quilometragem corrente derivada. |
| **Motorista** | registro operacional sem login. |
| **Local** | pátio, filial ou ponto de acesso controlado. |
| **Evento de odômetro** | linha imutável do livro-razão de quilometragem. |
| **Viagem** | deslocamento planejado→em andamento→concluído, com km inicial e final. |
| **Abastecimento** | litros × preço, com quilometragem obrigatória. |
| **Manutenção** | agendamento e histórico no mesmo registro, separados por estado. |
| **Movimentação** | entrada ou saída de um veículo em um local, numerada por sequência. |
| **Leitura de placa** | entrada não confiável vinda de câmera, com grau de confiança. |
| **Operação** (plataforma) | processo administrativo durável, com etapas, idempotência e retentativa. |

## 6. Funcionalidades

### 6.1 Desktop (empresa)

| Área | O que faz |
|---|---|
| Visão geral | frota por estado, dentro/fora do pátio, operação e custos do período, alertas |
| Pátio | estado atual de cada veículo e registro de movimentação |
| Viagens | criar, iniciar, concluir e cancelar |
| Abastecimentos | registrar com cálculo de total e efeito no odômetro |
| Manutenções | agendar, iniciar, concluir, cancelar e arquivar |
| Veículos / Motoristas / Locais | cadastro, edição, ativação e arquivamento |
| Importar planilha | Excel/CSV/células copiadas para veículos, motoristas, locais, abastecimentos, manutenções, viagens e equipe, com prévia |
| Empresa | dados cadastrais operacionais (CNPJ e situação são da plataforma) |
| Equipe | criar, convidar, desativar, reativar e trocar papel de usuários |
| Relatórios | custos mensais, custo por veículo, manutenções a vencer, movimentações recentes; exportação CSV |
| Histórico de movimentações | trilha completa de entradas e saídas |
| Livro de odômetro | ledger por veículo, com ajuste manual justificado |
| Meu perfil | nome, telefone e tema da aplicação |

### 6.2 Admin Web (plataforma)

| Área | O que faz |
|---|---|
| Visão geral | indicadores globais |
| Empresas | listar, detalhar, editar, suspender, restaurar, arquivar e excluir definitivamente |
| Provisionamento | criar empresa + primeiro administrador com senha, acompanhando as etapas |
| Admins das empresas | suspender/restaurar acesso, bloquear/desbloquear conta, redefinir senha, desvincular |
| Operações | acompanhar, retentar e compensar provisionamentos |
| Auditoria global | eventos da plataforma, inclusive tentativas negadas |

## 7. Estados e transições

### 7.1 Veículo

```
available ⇄ inactive          set_vehicle_status
available → in_use            start_trip
in_use    → available         complete_trip / cancel_trip
available → in_maintenance    start_maintenance
in_maintenance → available    complete_maintenance / cancel_maintenance
qualquer  → archived          archive_vehicle
archived  → available         unarchive_vehicle
```

Um veículo nasce `available` ou `inactive` — **nunca** em uso, em manutenção ou
arquivado.

### 7.2 Viagem

```
planned → in_progress → completed
   └──────────┴─────────→ cancelled   (exige motivo)
```

`completed` e `cancelled` são terminais. Cancelar limpa datas reais e
quilometragens — o registro não pode parecer executado.

### 7.3 Manutenção

```
scheduled → in_progress → completed
    └────────────┴────────→ cancelled  (exige motivo)
completed | cancelled → arquivada
```

Data futura só é aceita em `scheduled`.

### 7.4 Empresa

```
active ⇄ suspended        (exige motivo do vocabulário fechado)
active | suspended → archived
archived → excluída definitivamente   (exige confirmação pelo nome)
```

Suspender ou arquivar **remove o acesso de todos os usuários daquela empresa**,
sem alterar vínculo algum: `private.current_membership()` exige
`companies.status = 'active'`.

### 7.5 Operação administrativa

```
pending → running → succeeded
                 ↘ failed → (retry) → running
                          ↘ compensating → compensated
                 ↘ needs_manual                      (terminal, sem retentativa)
```

`retryable` é decidido pelo **backend**. A interface apenas habilita ou não o
botão.

### 7.6 Movimentação

Não há estado: há **sequência**. A primeira movimentação de um veículo é sempre
`entry`; a partir daí, sequência ímpar = entrada, par = saída.

## 8. Regras de negócio essenciais

As invariantes que o sistema **deve** preservar. Cada uma, com o ponto exato de
imposição, em [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md).

**Quilometragem**
1. Quilometragem nunca regride.
2. Todo evento de odômetro registra a origem (`cadastro`, `viagem`,
   `abastecimento`, `manutenção`, `ajuste manual`).
3. O ledger é imutável: sem `UPDATE`, sem `DELETE`.
4. Ajuste manual exige justificativa e permissão própria.
5. Retrodatar só é possível como **correção explícita** vinculada ao evento
   corrigido.
6. Concluir viagem, abastecer e concluir manutenção **sempre** geram um evento.

**Pátio**
7. A primeira movimentação de um veículo é entrada.
8. Entrada e saída alternam obrigatoriamente.
9. Movimentações repetidas do mesmo veículo, no mesmo local e origem, dentro de
   uma janela de tempo, contam como uma só.
10. O horário da movimentação é **sempre** do servidor — o cliente não retrodata.
11. Leitura de placa desconhecida ou com confiança abaixo do limiar da câmera
    **não** gera movimentação: fica pendente de confirmação.

**Operação**
12. Total do abastecimento é exatamente `round(litros × preço, 2)`.
13. Veículo elétrico não aceita abastecimento; flex aceita gasolina, etanol e GNV.
14. Um veículo tem no máximo uma viagem em andamento e uma manutenção em
    andamento.
15. Quilometragem final da viagem é maior que a inicial.
16. Retorno não antecede a saída; nenhuma data de execução fica no futuro.
17. Manutenção concluída exige custo maior que zero.

**Identidade e acesso**
18. Um usuário tem no máximo um vínculo ativo.
19. Perfil e vínculo precisam **ambos** estar ativos, e a empresa precisa estar
    ativa, para haver qualquer acesso.
20. Uma empresa nunca fica sem administrador ativo.
21. A plataforma nunca fica sem administrador ativo.
22. Ninguém desativa a si mesmo.
23. CNPJ é globalmente único e validado por módulo 11.
24. Placa é globalmente única.

**Rastreabilidade**
25. A auditoria é append-only para todos os papéis de aplicação.
26. Autoria histórica é preservada mesmo após a exclusão da identidade.
27. Segredos nunca entram em auditoria, log ou payload de operação.

## 9. Casos de erro conhecidos

Erros são identificados por um `HINT` estável. A interface escolhe a mensagem
pelo código, nunca pelo texto.

| HINT | Situação |
|---|---|
| `PERMISSION_DENIED` | papel sem a permissão exigida |
| `AUTH_NO_ACTIVE_MEMBERSHIP` | perfil, vínculo ou empresa inativos |
| `TENANT_MISMATCH` | recurso pertence a outra empresa |
| `USE_RPC` | escrita direta em recurso transacional |
| `ODOMETER_REGRESSION` | quilometragem menor que a registrada |
| `IMMUTABLE_RECORD` / `APPEND_ONLY_TABLE` | tentativa de alterar ledger, movimentação ou auditoria |
| `CONFLICT_STATE` | transição de estado inválida |
| `CONFLICT_ARCHIVED` | operação sobre recurso arquivado |
| `CONFLICT_RETRY` | corrida perdida em movimentação simultânea |
| `CONFLICT_DUPLICATE` | placa, CNPJ ou sequência duplicada |
| `VEHICLE_HAS_OPEN_TRIPS` | arquivamento bloqueado por viagem aberta |
| `LAST_ADMIN_PROTECTED` | a empresa ficaria sem administrador |
| `LAST_PLATFORM_ADMIN_PROTECTED` | a plataforma ficaria sem administrador |
| `CANNOT_DEACTIVATE_SELF` / `CANNOT_BLOCK_SELF` | ação sobre a própria conta |
| `PROFILE_GLOBALLY_INACTIVE` | conta suspensa na plataforma; empresa não reativa |
| `USER_ALREADY_LINKED` | e-mail já vinculado a outra empresa |
| `NOT_PLATFORM_ADMIN` | conta sem acesso ao painel global |
| `IDEMPOTENCY_REUSE` | mesma chave com payload diferente |
| `CONFLICT_STALE` | edição concorrente detectada |
| `CONFIRMATION_MISMATCH` | nome digitado não confere na ação destrutiva |
| `REASON_REQUIRED` | motivo obrigatório ausente |
| `RESEND_TOO_SOON` | reenvio antes do intervalo mínimo (`429` + `Retry-After`) |
| `NOT_RETRYABLE` | operação em estado que não permite retentativa |
| `auth_email_conflict` | e-mail já possui conta no provedor de autenticação |
| `cnpj_already_exists` / `invalid_cnpj` | CNPJ duplicado ou inválido |
| `BACKEND_SCHEMA_OUTDATED` | cliente mais novo que o banco (RPC ausente) |
| `NETWORK_ERROR` | falha de transporte |

Catálogo completo em `compartilhado/permissoes-e-regras/exportar-regras.mjs`.

## 10. Requisitos funcionais

| # | Requisito |
|---|---|
| RF-01 | Autenticação por e-mail e senha, mínimo de 12 caracteres. Sem cadastro público. |
| RF-02 | A interface reflete as permissões do papel a cada carregamento de contexto. |
| RF-03 | Usuário sem vínculo ativo recebe tela específica, não erro genérico. |
| RF-04 | Toda escrita de negócio é transacional. |
| RF-05 | Toda ação destrutiva exige confirmação explícita; as críticas exigem digitar o nome do alvo. |
| RF-06 | Toda operação administrativa da plataforma é idempotente por chave. |
| RF-07 | Relatórios aceitam período e exportam CSV em português. |
| RF-08 | Importação em massa exibe prévia com contagem e número da linha de cada erro. |
| RF-09 | A movimentação exibe a próxima movimentação prevista antes de registrar. |
| RF-10 | Indisponibilidade do servidor é informada sem bloquear a interface preventivamente. |
| RF-11 | Provisionamento exibe o progresso etapa a etapa. |
| RF-12 | A auditoria global registra também as tentativas **negadas**. |

## 11. Requisitos não funcionais

| # | Requisito | Evidência |
|---|---|---|
| RNF-01 | Isolamento entre empresas imposto no banco | RLS em todas as tabelas + `security_selftest()` |
| RNF-02 | Nenhum segredo no cliente | `verify-no-secrets`, `verify-boundaries`, checagem nos builds |
| RNF-03 | Produção sem CDN | `verify-no-cdn` + CSP `default-src 'self'` |
| RNF-04 | Electron com `contextIsolation`, `sandbox`, sem `nodeIntegration` | `main.cjs` + `verify-electron-security` |
| RNF-05 | Banco recriável do zero por migrations | `db push` / harness pgTAP |
| RNF-06 | Nenhum cálculo financeiro em ponto flutuante | domains `numeric` + constraint de total exato |
| RNF-07 | Concorrência sem deadlock | ordem de lock única + teste de concorrência |
| RNF-08 | Auditoria não reescrevível | triggers `tg_forbid_mutation` |
| RNF-09 | Sessão local cifrada pelo chaveiro do sistema | `safeStorage` |
| RNF-10 | Consultas paginadas e com intervalo explícito | `assert_report_range`, `max_rows = 1000` |
| RNF-11 | Idioma pt-BR em toda a interface e exportações | rótulos em `packages/contracts` |
| RNF-12 | Acessibilidade: foco visível, `aria-*`, atalhos de teclado | telas e componentes base |

## 12. Restrições conhecidas

1. **Online-first.** Sem conexão não há criação de registro de negócio. Não
   existe banco local sincronizável ([ADR-001](../adr/ADR-001-online-first-supabase.md)).
2. **Um usuário, uma empresa** ([ADR-004](../adr/ADR-004-single-company-membership.md)).
3. **Câmera/OCR incompleto.** Banco, RPCs e permissões existem; falta o caminho
   de rede autenticado por dispositivo. Nenhuma câmera está integrada hoje.
4. **E-mail é identidade global** do provedor de autenticação — mais restritivo
   que "único dentro da empresa".
5. **Importação em massa é local e assistida:** aceita `.xlsx`, CSV e células copiadas; limita tamanho/linhas, valida antes de gravar e respeita permissões
   ([Decisão 016](DECISOES_ATUAIS.md#decisao-016--importacao-em-massa-assistida-por-excelcsv)).
6. **Sem instalador assinado.** A execução oficial é `npm run desktop`.
7. **Sem MFA/TOTP.** Decisão de produto vigente: e-mail e senha, com autorização
   server-side, confirmação explícita e auditoria.
8. **Recuperação de senha do usuário final não é automática** — depende do
   administrador da empresa ou da plataforma.
9. **Realtime e Storage desabilitados** (`supabase/config.toml`).

## 13. Comportamentos que precisam ser preservados

Se uma alteração quebrar qualquer item desta lista, ela está errada — mesmo que
todos os testes passem.

1. O cliente **nunca** envia `company_id`.
2. `vehicles.current_odometer_km` só muda por `private.record_odometer_event`.
3. `vehicle_movements`, `vehicle_odometer_events`, `plate_read_events` e o
   `INSERT` de `fuelings` não têm grant para `authenticated`.
4. `private` e `audit` ficam fora de `db.schemas`.
5. `service_role` não existe no bundle do Desktop nem do Admin Web.
6. A ordem de lock é sempre *veículo → documento*.
7. A auditoria não recebe `UPDATE` nem `DELETE` de nenhum papel de aplicação.
8. A senha do primeiro administrador não entra em `platform.operations`,
   auditoria ou qualquer payload persistido.
9. Migrations publicadas não são reescritas.
10. Uma etapa de verificação que não pôde ser executada é reportada como
    **N/E**, nunca como aprovada.

---

Para as decisões que levaram a cada uma dessas regras, ver
[`DECISOES_ATUAIS.md`](DECISOES_ATUAIS.md) e [`docs/adr/`](../adr/).
