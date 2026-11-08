> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

> **REFERÊNCIA:** documento de referência detalhada de banco. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# DATABASE_SCHEMA — PegaNaFrota

Referência do banco definitivo do MVP. Gerada a partir do banco real depois de
aplicar todas as migrations.

- **Schemas:** `public` (API tenant), `platform` (API apenas para service role), `private` (interno), `audit` (interno)
- Contagens exatas de tabelas/funções/policies evoluem por migration; use o catálogo do banco como fonte para inventário.

---

## 1. Convenções

| Regra | Decisão |
|---|---|
| Chaves | `uuid` com `gen_random_uuid()` |
| Tempo | `timestamptz` sempre; nunca `timestamp` |
| Dinheiro | `numeric(14,2)` — nunca ponto flutuante |
| Litros | `numeric(12,3)` |
| Quilometragem | `numeric(12,1)` |
| Nomes | `snake_case`, tabelas no plural |
| Exclusão | entidades de negócio usam arquivamento/status; identidades Auth podem ser removidas sob as proteções administrativas |
| Multiempresa | `company_id` obrigatório em toda entidade de negócio |

Os `domain` numéricos (`money_brl`, `liters`, `odometer_km`, `confidence_score`)
são usados normalmente. **CNPJ, placa e UF não usam `domain`** — um `domain` é
validado na coerção do valor de entrada, ou seja **antes** de qualquer
`BEFORE` trigger, o que impediria a normalização de rodar. Essas três colunas
usam `text` com `CHECK` de tabela, que é avaliado **depois** dos triggers. Na
prática: o cliente pode enviar `11.222.333/0001-81` e o banco grava
`11222333000181`, continuando a garantir formato e dígito verificador.

---

## 2. Mapa dos schemas

```
public   → API tenant usada pelo Desktop, sob RLS e grants
platform → controle global e RPCs administrativas; PostgREST só com grants de service_role
private  → helpers de identidade, matriz de permissões e triggers
audit    → trilha tenant imutável; leitura controlada pela view public.audit_events
```

`private` e `audit` não são schemas de API. `platform` é exposto ao PostgREST
apenas para permitir RPCs chamadas pelo backend privilegiado; `anon` e
`authenticated` não recebem acesso direto às suas tabelas/funções administrativas.

---

## 3. Diagrama de relacionamentos

```
companies ─┬─< company_memberships >─ profiles ─ auth.users
           ├─< drivers
           ├─< locations ──< cameras
           ├─< vehicles ─┬─< vehicle_odometer_events   (ledger imutável)
           │             ├─< trips
           │             ├─< fuelings
           │             ├─< maintenance_records
           │             └─< vehicle_movements >── locations
           └─< plate_read_events ──> vehicles (matched_vehicle_id)
                     └──< vehicle_movements (1:0..1)
```

Todo relacionamento entre tabelas com `company_id` usa **chave estrangeira
composta** `(id, company_id)`, sustentada por `unique (id, company_id)` na
tabela referenciada. É o que torna um relacionamento entre empresas diferentes
impossível **mesmo para o superusuário** — a RLS deixa de ser a única linha de
defesa.

---

## 4. Enums

| Enum | Valores |
|---|---|
| `company_status` | `active`, `suspended`, `archived` |
| `membership_role` | `company_admin`, `fleet_manager`, `operator`, `viewer` |
| `vehicle_status` | `available`, `in_use`, `in_maintenance`, `inactive`, `archived` |
| `fuel_type` | `gasoline`, `ethanol`, `diesel_s10`, `diesel_s500`, `cng`, `electric`, `flex` |
| `odometer_source_type` | `vehicle_registration`, `trip_completion`, `fueling`, `maintenance_completion`, `manual_adjustment`, `correction` |
| `trip_status` | `planned`, `in_progress`, `completed`, `cancelled` |
| `maintenance_type` | `preventive`, `corrective` |
| `maintenance_status` | `scheduled`, `in_progress`, `completed`, `cancelled` |
| `camera_direction` | `entry`, `exit`, `both` |
| `plate_read_status` | `captured`, `low_confidence`, `unknown_plate`, `duplicate`, `confirmed`, `error` |
| `movement_type` | `entry`, `exit` |
| `movement_source` | `manual`, `ocr` |
| `audit.event_action` | `insert`, `update`, `delete`, `archive`, `unarchive`, `execute` |

---

## 5. Garantias estruturais

Cada garantia do MVP e **onde ela vive**. O ponto de todas: a garantia é do
banco, não do aplicativo.

| Garantia | Mecanismo |
|---|---|
| CNPJ único e válido | `companies_cnpj_unique` + `companies_cnpj_format` + `companies_cnpj_valid` (módulo 11 em `private.is_valid_cnpj`) |
| Placa única e normalizada | `vehicles_plate_unique` (global) + `vehicles_plate_format` + trigger de normalização |
| Um usuário, uma empresa | índice único parcial em `company_memberships (user_id) where active` |
| Empresa sempre com admin | trigger `memberships_protect_last_admin` |
| Ledger imutável | trigger `odometer_events_immutable` recusa `UPDATE`/`DELETE`; sem grant de escrita para `authenticated` |
| Km sem regressão | trigger `odometer_ledger_insert` compara com o máximo do veículo |
| Cache de km confiável | `current_odometer_km` só muda por trigger; escrita direta bloqueada por `a_guard_vehicles_odometer` |
| Viagem transacional | `public.complete_trip()`: uma transação grava viagem + ledger + status do veículo |
| Total do abastecimento exato | `CHECK (total_amount = round(liters * price_per_liter, 2))` |
| Manutenção agendada ≠ concluída | `maintenance_status_scheduled` e `maintenance_status_completed` |
| Primeira movimentação é Entrada | `movements_first_is_entry` |
| Alternância | `movements_alternation_parity` (ímpar = `entry`, par = `exit`) |
| Sequência sem buraco/corrida | `movements_vehicle_sequence_idx` único + `SELECT … FOR UPDATE` no veículo |
| OCR desconhecido não movimenta | `register_plate_read()` só chama movimentação com status `confirmed` |
| Uma leitura, uma movimentação | `movements_plate_read_unique_idx` |
| Auditoria | triggers `AFTER` em todas as tabelas de negócio → `audit.events` |
| Dados de negócio não são apagados pela aplicação | sem grant de `DELETE`; arquivamento/status. Identidades têm ciclo de vida separado e histórico preservado |

---

## 6. Índices

| Índice | Papel |
|---|---|
| `vehicles_plate_unique` | placa única globalmente |
| `vehicles_company_status_idx` | listagem de frota filtrada por status |
| `trips_company_departure_idx` | timeline de viagens |
| `trips_one_in_progress_per_vehicle_idx` | um veículo, no máximo uma viagem em andamento |
| `fuelings_company_time_idx` | relatórios de custo por período |
| `maintenance_company_status_scheduled_idx` | alertas de manutenção |
| `movements_vehicle_sequence_idx` | **serializa a alternância** |
| `movements_plate_read_unique_idx` | uma leitura gera no máximo uma movimentação |
| `movements_company_vehicle_time_idx` | histórico de pátio |
| `odometer_events_vehicle_time_idx` | leitura do ledger |
| `odometer_events_source_unique_idx` | idempotência por fonte |
| `plate_read_company_camera_time_idx` | fila de revisão de OCR |
| `plate_read_client_event_unique` | idempotência do worker OCR |
| `company_memberships_user_idx` | resolução de identidade em toda requisição |

---

## 7. Referência de colunas


### `cameras`\n\nCâmera lógica. A coluna settings é validada para nunca conter credenciais.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `location_id` | `uuid` | não | — |
| `name` | `text` | não | — |
| `local_identifier` | `text` | não | — |
| `direction` | `camera_direction` | não | `'both'::camera_direction` |
| `active` | `boolean` | não | `true` |
| `settings` | `jsonb` | não | `'{}'::jsonb` |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |

### `companies`\n\nEmpresa (tenant). CNPJ é globalmente único e validado por módulo 11. Nunca apagada fisicamente.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `legal_name` | `text` | não | — |
| `trade_name` | `text` | não | — |
| `cnpj` | `text` | não | — |
| `email` | `text` | sim | — |
| `phone` | `text` | sim | — |
| `address_street` | `text` | sim | — |
| `address_number` | `text` | sim | — |
| `address_complement` | `text` | sim | — |
| `address_district` | `text` | sim | — |
| `address_city` | `text` | sim | — |
| `address_state` | `text` | sim | — |
| `address_postal_code` | `text` | sim | — |
| `timezone` | `text` | não | `'America/Sao_Paulo'::text` |
| `status` | `company_status` | não | `'active'::company_status` |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |
| `archived_at` | `timestamp with time zone` | sim | — |
| `archived_by` | `uuid` | sim | — |

### `company_memberships`\n\nVínculo usuário x empresa. ADR-004: no MVP cada usuário possui no máximo uma membership ativa.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `user_id` | `uuid` | não | — |
| `role` | `membership_role` | não | — |
| `active` | `boolean` | não | `true` |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |

### `drivers`\n\nMotorista operacional. Não possui login (fora do MVP). Arquivamento em vez de exclusão.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `full_name` | `text` | não | — |
| `internal_document` | `text` | sim | — |
| `phone` | `text` | sim | — |
| `license_category` | `text` | sim | — |
| `license_expires_on` | `date` | sim | — |
| `active` | `boolean` | não | `true` |
| `notes` | `text` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |
| `archived_at` | `timestamp with time zone` | sim | — |
| `archived_by` | `uuid` | sim | — |

### `fuelings`\n\nAbastecimento. total_amount é validado por constraint contra litros x preço, com 2 casas.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `vehicle_id` | `uuid` | não | — |
| `driver_id` | `uuid` | sim | — |
| `trip_id` | `uuid` | sim | — |
| `fueled_at` | `timestamp with time zone` | não | — |
| `fuel_type` | `fuel_type` | não | — |
| `liters` | `liters` | não | — |
| `price_per_liter` | `numeric(10,3)` | não | — |
| `total_amount` | `money_brl` | não | — |
| `odometer_km` | `odometer_km` | não | — |
| `station_name` | `text` | sim | — |
| `full_tank` | `boolean` | não | `false` |
| `notes` | `text` | sim | — |
| `created_by` | `uuid` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |

### `locations`\n\nPátio, garagem ou ponto de acesso controlado.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `name` | `text` | não | — |
| `address_street` | `text` | sim | — |
| `address_number` | `text` | sim | — |
| `address_district` | `text` | sim | — |
| `address_city` | `text` | sim | — |
| `address_state` | `text` | sim | — |
| `address_postal_code` | `text` | sim | — |
| `timezone` | `text` | não | `'America/Sao_Paulo'::text` |
| `active` | `boolean` | não | `true` |
| `notes` | `text` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |
| `archived_at` | `timestamp with time zone` | sim | — |
| `archived_by` | `uuid` | sim | — |

### `maintenance_records`\n\nAgendamento e histórico de manutenção no mesmo modelo, separados por status. Data futura só é aceita em status=scheduled (trigger de cronologia).

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `vehicle_id` | `uuid` | não | — |
| `maintenance_type` | `maintenance_type` | não | — |
| `status` | `maintenance_status` | não | `'scheduled'::maintenance_status` |
| `description` | `text` | não | — |
| `scheduled_for` | `timestamp with time zone` | sim | — |
| `scheduled_odometer_km` | `odometer_km` | sim | — |
| `started_at` | `timestamp with time zone` | sim | — |
| `completed_at` | `timestamp with time zone` | sim | — |
| `completion_odometer_km` | `odometer_km` | sim | — |
| `total_cost` | `money_brl` | sim | — |
| `supplier_name` | `text` | sim | — |
| `invoice_number` | `text` | sim | — |
| `notes` | `text` | sim | — |
| `cancel_reason` | `text` | sim | — |
| `created_by` | `uuid` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |
| `cancelled_at` | `timestamp with time zone` | sim | — |
| `cancelled_by` | `uuid` | sim | — |
| `archived_at` | `timestamp with time zone` | sim | — |
| `archived_by` | `uuid` | sim | — |

### `plate_read_events`\n\nLeitura de placa. Somente status=confirmed pode originar movimentação (ADR-007/ADR-009).

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `camera_id` | `uuid` | não | — |
| `captured_at` | `timestamp with time zone` | não | — |
| `raw_text` | `text` | não | — |
| `normalized_plate` | `text` | sim | — |
| `confidence` | `confidence_score` | não | — |
| `frame_hash` | `text` | sim | — |
| `image_reference` | `text` | sim | — |
| `status` | `plate_read_status` | não | `'captured'::plate_read_status` |
| `matched_vehicle_id` | `uuid` | sim | — |
| `duplicate_of_id` | `uuid` | sim | — |
| `rejection_reason` | `text` | sim | — |
| `engine_version` | `text` | não | — |
| `contract_version` | `text` | não | — |
| `client_event_id` | `text` | sim | — |
| `created_by` | `uuid` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |

### `profiles`\n\nPerfil de aplicação vinculado 1:1 a auth.users. active=false bloqueia RLS imediatamente.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | — |
| `full_name` | `text` | não | — |
| `phone` | `text` | sim | — |
| `active` | `boolean` | não | `true` |
| `last_seen_at` | `timestamp with time zone` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |

### `trips`\n\nViagem. A conclusão só acontece por public.complete_trip, que cria o evento de odômetro.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `vehicle_id` | `uuid` | não | — |
| `driver_id` | `uuid` | sim | — |
| `status` | `trip_status` | não | `'planned'::trip_status` |
| `origin_label` | `text` | não | — |
| `destination_label` | `text` | não | — |
| `planned_departure_at` | `timestamp with time zone` | sim | — |
| `actual_departure_at` | `timestamp with time zone` | sim | — |
| `planned_return_at` | `timestamp with time zone` | sim | — |
| `actual_return_at` | `timestamp with time zone` | sim | — |
| `start_odometer_km` | `odometer_km` | sim | — |
| `end_odometer_km` | `odometer_km` | sim | — |
| `purpose` | `text` | sim | — |
| `notes` | `text` | sim | — |
| `cancel_reason` | `text` | sim | — |
| `created_by` | `uuid` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |
| `cancelled_at` | `timestamp with time zone` | sim | — |
| `cancelled_by` | `uuid` | sim | — |
| `archived_at` | `timestamp with time zone` | sim | — |
| `archived_by` | `uuid` | sim | — |

### `vehicle_movements`\n\nEntrada/Saída. Criada exclusivamente por public.register_vehicle_movement (ADR-007). occurred_at é sempre carimbo do servidor.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `vehicle_id` | `uuid` | não | — |
| `location_id` | `uuid` | não | — |
| `movement_type` | `movement_type` | não | — |
| `sequence_no` | `integer` | não | — |
| `occurred_at` | `timestamp with time zone` | não | `now()` |
| `source` | `movement_source` | não | — |
| `plate_read_event_id` | `uuid` | sim | — |
| `operator_user_id` | `uuid` | sim | — |
| `notes` | `text` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |

### `vehicle_odometer_events`\n\nLedger imutável de quilometragem. UPDATE e DELETE bloqueados por trigger. ADR-006.

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `vehicle_id` | `uuid` | não | — |
| `occurred_at` | `timestamp with time zone` | não | — |
| `odometer_km` | `odometer_km` | não | — |
| `previous_km` | `odometer_km` | sim | — |
| `source_type` | `odometer_source_type` | não | — |
| `source_id` | `uuid` | sim | — |
| `reason` | `text` | sim | — |
| `correction_of_id` | `uuid` | sim | — |
| `created_by` | `uuid` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |

### `vehicles`\n\nVeículo da frota. current_odometer_km é cache derivado do ledger e só muda por RPC (ADR-006).

| Coluna | Tipo | Nulo | Padrão |
|---|---|---|---|
| `id` | `uuid` | não | `gen_random_uuid()` |
| `company_id` | `uuid` | não | — |
| `plate` | `text` | não | — |
| `brand` | `text` | não | — |
| `model` | `text` | não | — |
| `model_year` | `smallint` | sim | — |
| `manufacture_year` | `smallint` | sim | — |
| `color` | `text` | sim | — |
| `fuel_type` | `fuel_type` | não | — |
| `category` | `text` | sim | — |
| `tank_capacity_l` | `numeric(8,2)` | sim | — |
| `status` | `vehicle_status` | não | `'available'::vehicle_status` |
| `current_odometer_km` | `odometer_km` | não | `0` |
| `notes` | `text` | sim | — |
| `created_at` | `timestamp with time zone` | não | `now()` |
| `updated_at` | `timestamp with time zone` | não | `now()` |
| `archived_at` | `timestamp with time zone` | sim | — |
| `archived_by` | `uuid` | sim | — |

---

## 8. Views

Todas com `security_invoker = true`: a RLS do usuário que consulta é aplicada,
e não a do dono da view.

| View | Conteúdo |
|---|---|
| `v_vehicle_presence` | veículo dentro/fora, última movimentação, próximo tipo previsto |
| `v_fleet_status_summary` | uma linha por empresa com a contagem por status |
| `v_vehicle_monthly_costs` | custo mensal por veículo (combustível + manutenção) |
| `v_vehicle_fuel_consumption` | km/l por veículo a partir do ledger |
| `v_maintenance_due` | manutenções vencidas e previstas |
| `v_recent_movements` | timeline de pátio com veículo, local e origem |
| `audit_events` | leitura de `audit.events`; exige a permissão `audit.read` |
