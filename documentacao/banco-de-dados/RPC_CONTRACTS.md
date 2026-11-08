> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

> **REFERÊNCIA:** documento de referência detalhada de banco. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# RPC_CONTRACTS — PegaNaFrota

Contrato das funções de negócio expostas em `public`. As RPCs consumidas pelo cliente devolvem `jsonb` com chaves
em `camelCase` (o Electron consome direto) e todas resolvem empresa, papel e
permissões **no servidor**.

---

## 1. Regras gerais

- **O cliente nunca envia `company_id`.** É sempre resolvido por
  `private.current_user_company_id()`. Um parâmetro de empresa seria
  falsificável e tornaria a RLS decorativa.
- **Toda RPC de escrita é uma transação.** Ou tudo é gravado, ou nada é.
- **Erros são estáveis.** `SQLSTATE` + `HINT` com um código legível. O
  aplicativo decide a mensagem pelo `HINT`, nunca pelo texto.

### Códigos de erro

| SQLSTATE | HINT | Significado |
|---|---|---|
| `42501` | `PERMISSION_DENIED` | papel sem a permissão exigida |
| `42501` | `NO_ACTIVE_MEMBERSHIP` | perfil ou vínculo inativo |
| `42501` | `USE_RPC` | tentativa de escrita direta em recurso transacional |
| `42501` | `CROSS_COMPANY` | recurso pertence a outra empresa |
| `22023` | `INVALID_INPUT` | parâmetro ausente ou fora de faixa |
| `23514` | `ODOMETER_REGRESSION` | quilometragem menor que a registrada |
| `23514` | `IMMUTABLE_RECORD` | alteração em ledger, movimentação ou auditoria |
| `23505` | `DUPLICATE` | violação de unicidade (placa, CNPJ, sequência) |
| `P0002` | `NOT_FOUND` | recurso inexistente no tenant |
| `55006` | `VEHICLE_HAS_OPEN_TRIPS` | arquivamento com pendência |

---

## 2. Identidade

### `my_context() → jsonb`
Chamada de abertura de sessão. Devolve empresa, vínculo, papel e a lista de
permissões — o Electron monta o menu a partir dela, sem inferir nada.

```jsonc
{
  "sessionState": "ACTIVE",          // ou "NO_ACTIVE_MEMBERSHIP"
  "user": { "id": "...", "fullName": "Ana R.", "active": true },
  "company": { "id": "...", "tradeName": "Aurora Verde", "status": "active" },
  "membership": { "role": "company_admin", "active": true },
  "permissions": ["company.read", "vehicles.write", "..."]
}
```

Usuário sem vínculo ativo recebe `sessionState: "NO_ACTIVE_MEMBERSHIP"` **sem
erro** — a tela de bloqueio é decisão de interface, não exceção.

### `my_permissions() → jsonb` · `touch_last_seen() → jsonb`

---

## 3. Odômetro

### `register_odometer_reading(p_vehicle_id, p_odometer_km, p_reason, p_occurred_at = now(), p_correction_of_id = null) → jsonb`

Ajuste manual auditado. Exige `odometer.adjust` (admin e gestor).

- `p_reason` é **obrigatório** e não pode ser vazio.
- Valor menor que o topo do ledger é recusado (`ODOMETER_REGRESSION`).
- Veículo arquivado não aceita evento.
- `p_correction_of_id` vincula o evento ao que está sendo corrigido.

### `vehicle_odometer_history(p_vehicle_id, p_page = 1, p_page_size = 25) → jsonb`
`{ items: [...], page, pageSize, total }`. Veículo de outra empresa devolve
lista vazia — não erro, para não revelar existência.

---

## 4. Viagens

### `start_trip(p_trip_id, p_actual_departure_at = now(), p_start_odometer_km = null) → jsonb`
`planned → in_progress`. Registra a Saída do pátio e marca o veículo `in_use`.

### `complete_trip(p_trip_id, p_end_odometer_km, p_actual_return_at = now(), p_notes = null) → jsonb`

**A operação transacional central.** Em uma única transação:

1. trava a viagem e o veículo (`FOR UPDATE`);
2. valida que está `in_progress`;
3. valida `end_odometer_km > start_odometer_km` e sem regressão no ledger;
4. valida `actual_return_at >= actual_departure_at`;
5. grava a viagem como `completed`;
6. insere o evento no ledger com origem `trip_completion`;
7. atualiza `vehicles.current_odometer_km`;
8. devolve o veículo para `available`;
9. registra a movimentação de Entrada;
10. grava o evento `execute` na auditoria.

Qualquer falha reverte **todos** os dez passos. Não existe estado intermediário.

### `cancel_trip(p_trip_id, p_reason) → jsonb`
Exige `trips.cancel`. **Não gera evento de odômetro** — viagem cancelada não
percorreu distância.

---

## 5. Abastecimento

### `register_fueling(p_vehicle_id, p_liters, p_price_per_liter, p_odometer_km, p_fuel_type = null, p_fueled_at = now(), p_driver_id = null, p_trip_id = null, p_station_name = null, p_full_tank = false, p_notes = null, p_total_amount = null) → jsonb`

Único caminho de criação — `authenticated` não tem `INSERT` na tabela.

- `total_amount` é **calculado** como `round(liters × price_per_liter, 2)`. Se
  `p_total_amount` for informado e divergir, a chamada é recusada: o cliente
  não “corrige” o total.
- `p_fuel_type` omitido usa o combustível do veículo; incompatível é recusado
  (veículo elétrico não abastece; flex não aceita diesel).
- Grava o abastecimento **e** o evento de ledger na mesma transação.

Depois de gravado, litros, preço, total e quilometragem são imutáveis; só campos
descritivos podem ser corrigidos.

---

## 6. Manutenção

### `start_maintenance(p_maintenance_id, p_started_at = now()) → jsonb`
`scheduled → in_progress`, veículo vai para `in_maintenance`.

### `complete_maintenance(p_maintenance_id, p_total_cost, p_completed_at = now(), p_completion_odometer_km = null, p_supplier_name = null, p_invoice_number = null, p_notes = null) → jsonb`
`p_total_cost > 0` obrigatório. Com `p_completion_odometer_km`, grava também o
evento de ledger. Libera o veículo.

### `cancel_maintenance(p_maintenance_id, p_reason) → jsonb`

Agendada e concluída **nunca se confundem**: são status distintos com check
constraints próprias. Agendada exige `scheduled_for` e proíbe `total_cost`;
concluída exige `completed_at` e `total_cost > 0`.

---

## 7. Movimentação de pátio

### `register_vehicle_movement(p_vehicle_id, p_location_id, p_source = 'manual', p_plate_read_event_id = null, p_notes = null, p_dedup_window_seconds = 90) → jsonb`

**Único** caminho para criar Entrada/Saída.

1. valida veículo e local do tenant;
2. `SELECT … FOR UPDATE` na linha do veículo — serializa concorrentes;
3. lê a última movimentação;
4. aplica a janela de deduplicação;
5. calcula `sequence_no = último + 1` e o tipo pela paridade;
6. insere.

```jsonc
{
  "movementId": "...", "vehicleId": "...", "plate": "AVD0007",
  "movementType": "exit", "sequenceNo": 42,
  "occurredAt": "2026-07-30T12:00:00Z",
  "deduplicated": false, "vehicleIsInside": false
}
```

`p_dedup_window_seconds = 0` desliga a deduplicação. `occurred_at` é **sempre**
carimbo do servidor.

Três camadas independentes garantem a alternância: o `FOR UPDATE`, o índice
único `(vehicle_id, sequence_no)` e a check constraint de paridade. Mesmo que
duas conexões passem pela primeira, a segunda barra; mesmo que a segunda seja
removida, a terceira barra.

### `vehicle_presence(p_vehicle_id) → jsonb`
`{ isInside, lastMovementType, lastMovementAt, locationName, nextMovementType }`

---

## 8. OCR

### `register_plate_read(p_camera_id, p_raw_text, p_confidence, p_engine_version, p_contract_version = '1.0.0', p_captured_at = now(), p_frame_hash = null, p_client_event_id = null, p_min_confidence = null, p_dedup_window_seconds = 90, p_auto_register_movement = true) → jsonb`

A saída do worker OCR é **entrada não confiável**. Esta RPC é o único ponto de
entrada e aplica, nesta ordem:

| Etapa | Resultado quando falha |
|---|---|
| idempotência por `client_event_id` | devolve o registro existente, `idempotent: true` |
| normalização da placa | — |
| confiança abaixo de `p_min_confidence` | `low_confidence` |
| placa não existe na frota **da empresa da câmera** | `unknown_plate` |
| **trava a linha do veículo** | — |
| leitura igual na janela | `duplicate` |
| tudo certo | `confirmed` |

**Só `confirmed` gera movimentação.** `unknown_plate`, `low_confidence`,
`duplicate` e `error` são gravados para revisão e não tocam o pátio.

O lock do veículo antes da deduplicação não é detalhe: sem ele há **deadlock
real** sob rajada da mesma placa. O `INSERT` em `plate_read_events` dispara a
FK de `matched_vehicle_id`, que pega `KEY SHARE` na linha do veículo; logo
depois a movimentação pede `FOR UPDATE` na mesma linha. Duas transações
simultâneas seguram `KEY SHARE` (compatível entre si) e ambas tentam subir para
`FOR UPDATE`, cada uma esperando a outra. Adquirir o lock mais forte primeiro
impõe uma ordem única. Reproduzido em `tests/integration/concurrency.test.mjs`.

### `confirm_plate_read(p_plate_read_event_id, p_vehicle_id, p_override_reason = null) → jsonb`

> **Mudou (DB-AUD-007).** Quando a placa lida difere da placa do veículo
> informado, `p_override_reason` é obrigatório. O override fica gravado em
> `plate_read_events.manual_override_reason/by/at` e é o que autoriza a
> movimentação.
Revisão manual de uma leitura recusada. Exige `ocr.review`.

---

## 9. Arquivamento

### `archive_vehicle(p_vehicle_id, p_reason = null) → jsonb`
Recusa com `VEHICLE_HAS_OPEN_TRIPS` se houver viagem `planned`/`in_progress` ou
manutenção `scheduled`/`in_progress`. Idempotente: repetir devolve
`alreadyArchived: true`. **O histórico permanece integralmente consultável.**

### `unarchive_vehicle(p_vehicle_id) → jsonb` · `archive_driver(p_driver_id, p_reason = null) → jsonb`

---

## 10. Dashboard e relatórios

### `dashboard_summary(p_from = now() - 30d, p_to = now()) → jsonb`

Uma chamada, todos os agregados. Intervalo invertido é recusado.

```jsonc
{
  "companyId": "...", "generatedAt": "...",
  "period": { "from": "...", "to": "..." },
  "fleet": { "total": 18, "available": 12, "inUse": 3,
             "inMaintenance": 1, "inactive": 1, "archived": 1 },
  "presence": { "inside": 14, "outside": 3, "neverMoved": 0 },
  "operations": { "tripsCompleted": 36, "tripsInProgress": 3, "distanceKm": 9298.1,
                  "fuelings": 32, "liters": 1858.549, "maintenanceCompleted": 3,
                  "movements": 75, "plateReads": 20 },
  "costs": { "fuelCost": 11715.72, "maintenanceCost": 3268.03, "totalCost": 14983.75 },
  "alerts": { "maintenanceOverdue": 2, "maintenanceNext30Days": 6,
              "licenseExpiring": 1, "unknownPlateReads": 3, "lowConfidenceReads": 3 }
}
```

### `report_monthly_costs(p_from, p_to) → setof`
Uma linha por mês, sem buracos: meses sem lançamento aparecem com zero.

### `report_vehicle_costs(p_from, p_to, p_page = 1, p_page_size = 25) → jsonb`
### `report_maintenance_due(p_horizon_days = 30) → jsonb`
### `report_recent_movements(p_from, p_to, p_vehicle_id, p_location_id, p_page, p_page_size) → jsonb`

---

## 11. Administração

### `log_admin_action(p_company_id, p_actor_user_id, p_action, p_entity_id, p_metadata) → bigint`

**Exclusiva de `service_role`.** Usada pela Edge Function `admin-users` para
deixar rastro de operações feitas com service role — que, por ignorarem RLS,
precisam de trilha explícita. Recusa autor que não pertença à empresa informada.


---

## Alterações da rodada pós-auditoria

Ver `documentacao/banco-de-dados/AUDIT_FIXES.md` para a rastreabilidade completa.

### RPCs novas

| RPC | Permissão | Para quê |
|-----|-----------|----------|
| `company_members()` | `users.read` | Lista de membros da empresa sem SELECT amplo em `profiles` |
| `set_vehicle_status(p_vehicle_id, p_status)` | `vehicles.write` | Alterna `available` ↔ `inactive`. Estados operacionais continuam exclusivos das RPCs de viagem/manutenção/arquivamento |
| `set_driver_active(p_driver_id, p_active)` | `drivers.write` | Ativa/desativa motorista; recusa desativação com viagem aberta |
| `unarchive_driver(p_driver_id)` | `drivers.archive` | Contrapartida de `archive_driver` |
| `archive_maintenance(p_maintenance_id, p_archived = true)` | `maintenance.write` | Arquiva registro finalizado alterando **somente** `archived_at`/`archived_by` |
| `admin_set_profile_active(p_user_id, p_active, p_company_id)` | service_role | Estado global do profile; submetido ao piso de administradores |
| `admin_find_action(p_company_id, p_idempotency_key)` | service_role | Idempotência da Edge Function |

### `p_min_confidence` deixou de ser autoridade

O limiar efetivo é `greatest(cameras.min_confidence, p_min_confidence)`. Um
cliente que envie `0` continua submetido ao piso configurado na câmera; enviar
`0.95` continua funcionando, porque endurecer é permitido.

`p_captured_at` é aceito apenas na janela `[now() - 24h, now() + 2min]`.

### Escritas diretas removidas

Estas colunas saíram do `GRANT UPDATE` de `authenticated` e agora só mudam por
RPC:

- `trips`: `status`, `actual_departure_at`, `actual_return_at`, `start_odometer_km`, `end_odometer_km`, `cancelled_*`, `archived_*`, `created_by`
- `maintenance_records`: `status`, `started_at`, `completed_at`, `completion_odometer_km`, `total_cost`, `cancelled_*`, `archived_*`, `created_by`
- `vehicles`: `status`, `current_odometer_km`, `archived_at`, `archived_by`
- `drivers`: `active`, `archived_at`, `archived_by`
- `companies`: `status`, `archived_at`, `archived_by`
- `profiles`: tudo exceto `full_name` e `phone`
- `fuelings`: tudo exceto `station_name`, `notes`, `full_tank`


---

## Complementos funcionais v8

A revisão funcional do produto passou a usar também estas RPCs:

| RPC | Permissão | Uso no produto |
|---|---|---|
| `update_driver(p_driver_id, p_patch)` | `drivers.write` | edição de cadastro do motorista sem alterar histórico |
| `create_location(...)` | `locations.write` | cadastro de pátios, garagens e pontos de acesso |
| `update_location(p_location_id, p_patch)` | `locations.write` | edição cadastral do local |
| `set_location_active(p_location_id, p_active)` | `locations.write` | retirar/recolocar local das novas operações |
| `archive_location(p_location_id, p_reason)` | `locations.write` | arquivamento com motivo, preservando movimentações antigas |
| `unarchive_location(p_location_id)` | `locations.write` | restauração do local |
| `yard_snapshot()` | `movements.read` | presença atual calculada no servidor, sem corte de 200 linhas e no fuso da empresa |

`company_members()` também passa a devolver o e-mail da conta Auth, exclusivamente
para membros do tenant do chamador e somente após `users.read`.
