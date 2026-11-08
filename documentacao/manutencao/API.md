> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# API

Três superfícies: **PostgREST** (RPCs e leitura de tabelas do tenant) e duas
**Edge Functions**. Não há REST próprio nem GraphQL.

---

## 1. Regras gerais

1. **O cliente nunca envia `company_id`.** Sempre resolvido no servidor por
   `private.current_user_company_id()`. Um parâmetro de empresa seria
   falsificável e tornaria a RLS decorativa.
2. **Toda RPC de escrita é uma transação.** Ou tudo é gravado, ou nada.
3. **Erros são estáveis.** `SQLSTATE` + `HINT`. O cliente escolhe a mensagem pelo
   `HINT`, nunca pelo texto.
4. **RPCs devolvem `jsonb` em `camelCase`**; as colunas são `snake_case`.
5. **Parâmetros usam prefixo `p_`.**
6. Toda RPC é `SECURITY DEFINER` com `search_path = ''` e objetos qualificados.

### Autenticação

| Superfície | Cabeçalhos |
|---|---|
| PostgREST | `apikey: <anon>` + `Authorization: Bearer <JWT>` |
| `admin-users` | idem + `Idempotency-Key` |
| `platform-admin` | idem + `x-request-id` |

A chave anônima é pública por natureza: identifica o projeto e **não autoriza
nada**. Quem autoriza é a RLS a partir do JWT.

### Códigos de erro → HTTP

Mapeamento aplicado pelas Edge Functions (`HINT_TO_HTTP`):

| HTTP | HINTs |
|---|---|
| 401 | `UNAUTHENTICATED` |
| 403 | `NOT_PLATFORM_ADMIN`, `PERMISSION_DENIED`, `BOOTSTRAP_INVALID_TOKEN`, `INVITE_INVALID`, `PROFILE_GLOBALLY_INACTIVE` |
| 404 | `NOT_FOUND` |
| 409 | `IDEMPOTENCY_REUSE`, `cnpj_already_exists`, `auth_email_conflict`, `USER_ALREADY_LINKED`, `LAST_ADMIN_PROTECTED`, `LAST_PLATFORM_ADMIN_PROTECTED`, `CANNOT_BLOCK_SELF`, `CONFLICT_*`, `INVITE_*`, `NOT_RETRYABLE` |
| 422 | `INVALID_INPUT`, `invalid_cnpj`, `invalid_email`, `REASON_REQUIRED`, `CONFIRMATION_MISMATCH` |
| 429 | `RESEND_TOO_SOON` (com `Retry-After`) |
| 502 | `AUTH_UPDATE_FAILED`, `AUTH_DELETE_FAILED`, `invite_delivery_failed` |
| 500 | qualquer erro sem `HINT` — a mensagem devolvida é genérica |

Um erro sem `HINT` vira 500 com mensagem genérica **de propósito**: detalhe
técnico não sai para o cliente.

---

## 2. PostgREST — leitura direta

```
GET /rest/v1/<tabela>?select=<colunas>&<filtro>&order=<col>.<dir>&limit=&offset=
```

Tabelas legíveis: `vehicles`, `drivers`, `locations`, `trips`, `fuelings`,
`maintenance_records`, `vehicle_movements`, `vehicle_odometer_events`,
`plate_read_events`, `cameras`, `audit_events`, e as views `v_*`.

`Prefer: count=exact` devolve o total em `Content-Range` — usado por
`contar()` em `lib/data.mjs`. Teto de `max_rows = 1000` por página; a camada de
dados pagina em lotes concorrentes.

**Escrita direta existe apenas onde há grant e policy:** `trips` (só `planned`),
`maintenance_records`, `locations`, `cameras`, `company_memberships`, e as duas
colunas do próprio perfil. Todo o resto é RPC.

---

## 3. RPCs do tenant

`POST /rest/v1/rpc/<nome>` com corpo JSON dos parâmetros.

### 3.1 Identidade

| RPC | Devolve |
|---|---|
| `my_context()` | contexto completo da sessão |
| `my_permissions()` | `text[]` de permissões |
| `my_company()` | dados cadastrais da empresa |
| `company_members()` | integrantes com papel e estado |
| `touch_last_seen()` | registra presença sem permitir outra escrita |
| `update_company(p_patch)` | exige `company.update` |

**`my_context()`** é a chamada mais importante do sistema. Devolve:

```json
{
  "authenticated": true,
  "sessionState": "ACTIVE",
  "userId": "uuid",
  "companyId": "uuid",
  "role": "company_admin",
  "permissions": ["company.read", "..."],
  "profile": { "fullName": "…", "active": true, "lastSeenAt": "…" },
  "company": { "id": "…", "tradeName": "…", "legalName": "…",
               "cnpj": "…", "timezone": "…", "status": "active" }
}
```

`sessionState` ∈ `ANONYMOUS` | `NO_PROFILE` | `NO_ACTIVE_MEMBERSHIP` | `ACTIVE`.

> **Contrato importante:** ausência de vínculo é **dado de retorno**, não
> exceção. É o que permite ao Desktop mostrar "Sem empresa vinculada" em vez de
> uma falha genérica.

### 3.2 Cadastro

| RPC | Permissão | Nota |
|---|---|---|
| `create_vehicle(...)` | `vehicles.write` | semeia o ledger com a quilometragem inicial |
| `update_vehicle(p_vehicle_id, p_patch)` | `vehicles.write` | |
| `set_vehicle_status(p_vehicle_id, p_status)` | `vehicles.write` | só `available` ⇄ `inactive` |
| `archive_vehicle` / `unarchive_vehicle` | `vehicles.archive` | recusa com `VEHICLE_HAS_OPEN_TRIPS` |
| `create_driver` / `update_driver` | `drivers.write` | |
| `set_driver_active` | `drivers.write` | |
| `archive_driver` / `unarchive_driver` | `drivers.archive` | |
| `create_location` / `update_location` | `locations.write` | |
| `set_location_active` | `locations.write` | |
| `archive_location` / `unarchive_location` | `locations.write` | |

### 3.3 Operação

**`start_trip(p_trip_id, p_actual_departure_at?, p_start_odometer_km?)`**
`trips.write`. Exige `planned`; veículo não pode estar arquivado, inativo ou em
manutenção; data não pode estar mais de 5 minutos no futuro. Move o veículo para
`in_use`.

**`complete_trip(p_trip_id, p_end_odometer_km, p_actual_return_at?, p_notes?)`**
`trips.write`. Exige `in_progress`; km final **maior** que o inicial; retorno não
antecede a saída. Grava o evento de odômetro **antes** de tudo — se a
quilometragem for inválida, nada é gravado. Libera o veículo.

```json
{ "tripId":"…","status":"completed","vehicleId":"…","actualReturnAt":"…",
  "startOdometerKm":1000,"endOdometerKm":1250,"distanceKm":250,
  "odometerEventId":"…" }
```

**`cancel_trip(p_trip_id, p_reason)`** — `trips.cancel`. Motivo obrigatório.
Limpa datas reais e quilometragens.

**`register_fueling(p_vehicle_id, p_liters, p_price_per_liter, p_odometer_km,
p_fuel_type?, p_fueled_at?, p_driver_id?, p_trip_id?, p_station_name?,
p_full_tank?, p_notes?, p_total_amount?)`** — `fuelings.write`.

Total sempre `round(litros × preço, 2)`. Se o cliente enviar `p_total_amount`, ele
precisa bater — divergência devolve `FUELING_TOTAL_MISMATCH`. Cria o evento de
odômetro na mesma transação.

**`schedule_maintenance` / `start_maintenance` / `complete_maintenance` /
`cancel_maintenance` / `archive_maintenance`** — `maintenance.schedule` para
agendar, `maintenance.write` para as demais. `start_maintenance` exige veículo
efetivamente disponível; `complete_maintenance` exige custo maior que zero e não
libera o veículo se houver outra manutenção aberta.

### 3.4 Odômetro

**`register_odometer_reading(p_vehicle_id, p_odometer_km, p_reason,
p_occurred_at?, p_correction_of_id?)`** — `odometer.adjust`. Justificativa
obrigatória. Sempre auditado.

**`vehicle_odometer_history(p_vehicle_id, p_page?, p_page_size?)`** —
`odometer.read`. Página máxima de 100.

```json
{ "items":[…], "page":1, "pageSize":25, "total":142, "hasNext":true }
```

### 3.5 Pátio

**`register_vehicle_movement(p_vehicle_id, p_location_id, p_source?,
p_plate_read_event_id?, p_notes?, p_dedup_window_seconds?)`**

`movements.write`, ou `ocr.operate` quando `p_source = 'ocr'`. Janela de
deduplicação limitada a 3600 s.

```json
{ "movementId":"…","vehicleId":"…","plate":"ABC1D23","movementType":"entry",
  "occurredAt":"…","locationId":"…","sequenceNo":7,
  "deduplicated":false,"vehicleIsInside":true }
```

Corrida perdida devolve `CONFLICT_RETRY` (`40001`) — a interface deve repetir.

**`vehicle_presence(p_vehicle_id)`** — devolve também `nextMovementType`, para
que a tela mostre a próxima movimentação **antes** de registrar.

**`yard_snapshot()`** — estado completo do pátio.

### 3.6 OCR

**`register_plate_read(p_camera_id, p_raw_text, p_confidence, ...,
p_min_confidence?, p_dedup_window_seconds?)`** — `ocr.operate`.

O limiar efetivo é `greatest(camera.min_confidence, p_min_confidence)`: o cliente
pode ser **mais** rigoroso que a câmera, nunca menos. Confiança abaixo do limiar
→ `low_confidence`; placa não encontrada → `unknown_plate`. Nenhum dos dois gera
movimentação.

**`confirm_plate_read(...)`** — resolve manualmente uma leitura pendente.

### 3.7 Dashboard e relatórios

| RPC | Parâmetros | Nota |
|---|---|---|
| `dashboard_summary(p_from?, p_to?)` | período | frota, presença, operação, custos, alertas |
| `report_monthly_costs(p_from?, p_to?)` | período | |
| `report_vehicle_costs(p_from?, p_to?, p_page?, p_page_size?)` | paginado | |
| `report_maintenance_due(p_horizon_days?)` | default 30 | |
| `report_recent_movements(p_from?, p_to?, p_vehicle_id?, p_location_id?, p_page?, p_page_size?)` | paginado | |

Intervalos invertidos são recusados por `private.assert_report_range`.

### 3.8 Administrativas do tenant

`admin_list_company_members`, `admin_provision_member`,
`admin_set_membership_active`, `admin_set_profile_active`,
`admin_change_member_role`, `admin_find_action`, `log_admin_action`.

Chamadas **pela Edge Function `admin-users`**, não pelo cliente. São
transacionais: perfil, vínculo e auditoria acontecem juntos. Se a auditoria
falhar, o PostgreSQL desfaz tudo — não existe estado parcial a compensar.

---

## 4. Edge Function `admin-users`

```
POST /functions/v1/admin-users
{ "action": "...", ...campos }
```

Usada pelo **Desktop** para gerir a equipe da empresa.

| Ação | Permissão | Campos |
|---|---|---|
| `list` | `users.read` | — |
| `create` | `users.manage` | `email`, `fullName`, `role`, `phone?`, `password` (≥12) |
| `invite` | `users.manage` | `email`, `fullName`, `role`, `phone?` |
| `deactivate` | `users.manage` | `userId` |
| `reactivate` | `users.manage` | `userId` |
| `change_role` | `users.manage` | `userId`, `role` |

**Fluxo:** valida origem → exige `Bearer` → `getUser()` → `my_context()` →
verifica `sessionState = ACTIVE` e a permissão → executa.

**Idempotência:** `impressaoDigitalAcao()` calcula SHA-256 do payload canônico
(ação, empresa, usuário, e-mail, papel, nome, telefone). Mesma
`idempotencyKey` com payload diferente devolve `IDEMPOTENCY_KEY_REUSED`.

**CORS:** `ADMIN_USERS_ALLOWED_ORIGINS` precisa incluir `null` — o renderer
`file://` do Electron envia `Origin: null`.

Respostas: `{ "data": … }` ou `{ "error": { "code", "message" } }`.

---

## 5. Edge Function `platform-admin`

```
POST /functions/v1/platform-admin
{ "action": "...", "payload": { … } }
```

Usada pelo **Admin Web**. Única porta com `service_role`.

**Autorização:** `verify_jwt = true` no gateway rejeita requisição sem token
antes de invocar a função. Dentro, o papel global é **revalidado no banco a cada
chamada** — um JWT válido de usuário comum também chega até aqui. Toda negativa
é registrada em `platform.log_denial`.

`invite.accept` é a **única ação** que dispensa `platform_admin`: quem aceita um
convite ainda não é ninguém no sistema.

### Ações

| Ação | Payload | Efeito |
|---|---|---|
| `dashboard.get` | `from?`, `to?` | indicadores globais |
| `companies.list` | `search?`, `status?`, `state?`, `page?`, `pageSize?` | listagem paginada |
| `company.get` | `companyId` | dados + `updatedAt` para controle de concorrência |
| `company.update` | `companyId`, `patch`, `expectedUpdatedAt?` | `CONFLICT_STALE` se houver edição concorrente |
| `company.setStatus` | `companyId`, `status`, `reasonCode?`, `confirmedName?`, `idempotencyKey?` | suspender/restaurar/arquivar |
| `company.delete` | `companyId`, `confirmedName` | exclusão definitiva + limpeza de contas Auth |
| `company.provision` | `company`, `firstAdmin`, `idempotencyKey` | ver §5.1 |
| `members.list` | `companyId` | integrantes da empresa |
| `member.passwordReset` | `companyId`, `userId`, `password` | senha permanece só no Auth |
| `member.delete` | `companyId`, `userId`, `confirmedIdentity` | desvincula com proteção do último admin |
| `operations.list` / `operation.get` | filtros / `operationId` | acompanhamento |
| `operation.retry` | `operationId` | só se `retryable = true` |
| `operation.compensate` | `operationId`, `reason` | |
| `admins.list` | filtros | administradores das empresas |
| `companyAccess.suspend` / `.restore` | `companyId`, `userId` | mexe **só** em `company_memberships.active` |
| `admin.blockAccount` / `.unblockAccount` | `userId`, `reason?` | mexe **só** em `profiles.active` |
| `admin.replace` | `email`, `reason` | troca transacional do papel global |
| `invite.resend` | `companyId`, `userId`, `email` | `429` + `Retry-After` antes da janela |
| `audit.list` / `audit.get` | filtros / `eventId` | auditoria global |
| `invite.accept` | `token` | **sem exigir `platform_admin`** |

> `companyAccess.*` e `admin.*` operam em **eixos diferentes**: suspender acesso
> a uma empresa não bloqueia a conta, e bloquear a conta não desfaz vínculos.
> Fundir os dois foi explicitamente rejeitado
> ([ADR-011](DECISOES_ATUAIS.md#decisao-011--camada-de-plataforma-e-dois-eixos-de-identidade)).

### 5.1 `company.provision`

```json
{ "company": { "legalName","tradeName","cnpj","email?","phone?","address*","timezone" },
  "firstAdmin": { "fullName","email","phone?","password" },
  "idempotencyKey": "prov-…" }
```

Senha entre 12 e 72 caracteres, recusando espaços apenas ou caractere repetido.

**A senha nunca entra em `request_payload`, auditoria ou qualquer registro
persistido.** O payload auditável guarda apenas `accessMode: "password"`.

Sequência:

1. `platform.open_operation` — 4 etapas; replay de chave existente devolve o
   resultado anterior;
2. `platform.provision_company_record` — cria a empresa (transacional);
3. `auth.admin.createUser` com `email_confirm: true` — **fora do PostgreSQL**;
   e-mail já existente é recusado com `auth_email_conflict`, para não redefinir
   silenciosamente a senha de outra pessoa;
4. `platform.provision_first_admin_password` — cria perfil, vincula
   `company_admin` **ativo**, marca `send_invite` como `skipped` e conclui a
   operação, tudo na mesma transação.

**Compensação:** se a conta Auth nasceu nesta tentativa mas o passo 4 falhou, a
conta é apagada. `retryable` é `false` para `invalid_cnpj`,
`cnpj_already_exists`, `INVALID_INPUT` e `auth_email_conflict`; `true` no resto.

---

## 6. Endpoints GoTrue usados

| Endpoint | Uso |
|---|---|
| `POST /auth/v1/token?grant_type=password` | login |
| `POST /auth/v1/token?grant_type=refresh_token` | renovação |
| `POST /auth/v1/logout` | encerramento |
| `GET /auth/v1/user` | validação de sessão (Admin Web) |
| `PUT /auth/v1/user` | definir senha no aceite de convite |
| `GET /auth/v1/health` | sondagem de conectividade |

---

## 7. Webhooks

**Não existem.** O sistema não recebe nem emite webhooks. A entrega de convite é
uma chamada HTTP de saída para um relay SMTP — ver
[`INTEGRACOES.md`](INTEGRACOES.md).

---

## 8. Referências

- Onde cada regra é imposta → [`REGRAS_DE_NEGOCIO.md`](REGRAS_DE_NEGOCIO.md)
- Permissões e RLS → [`BANCO_DE_DADOS.md`](BANCO_DE_DADOS.md)
- Vocabulário compartilhado → `compartilhado/permissoes-e-regras/exportar-regras.mjs`
- Códigos de erro → `compartilhado/permissoes-e-regras/exportar-regras.mjs`
- Documento original preservado: `documentacao/banco-de-dados/RPC_CONTRACTS.md`
