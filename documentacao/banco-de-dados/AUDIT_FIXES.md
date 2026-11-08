> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

> **REFERÊNCIA:** documento de referência detalhada de banco. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Correções da auditoria de 30/07/2026

Rastreabilidade de `AUDIT_REPORT.md`. Cada achado aponta a correção, o arquivo e
o teste que prova a correção.

## Tabela de rastreabilidade

| ID | Correção | Arquivo | Teste |
|----|----------|---------|-------|
| DB-AUD-001 | `context.role` no nível principal; schema de request e de resposta; envelope `{data}`/`{error}` | `supabase/functions/admin-users/gerenciar-equipe.ts`, `index.ts` | `tests/edge/admin-users.test.mjs` 1–13 |
| DB-AUD-002 | UPDATE de `profiles` reduzido a `full_name`/`phone` por grant de coluna; `profiles_update_managed` removida; piso de administradores considera profile + membership + papel + empresa | `20260731000100_fix_profile_tenancy.sql` | `08_audit_fixes.sql` "DB-AUD-002 …" (10 testes) |
| DB-AUD-003 | `user_belongs_to_current_company()` exige ausência de vínculo ativo em outra empresa; lista de membros por RPC `company_members()` | `20260731000100_fix_profile_tenancy.sql` | `08_audit_fixes.sql` "DB-AUD-003 …" (7 testes) |
| DB-AUD-004 | Grant por coluna em `trips`; trigger bloqueia toda transição de status, campos operacionais e edição após início | `20260731000200_lock_state_transitions.sql` | `08_audit_fixes.sql` "DB-AUD-004 …" (5 testes) |
| DB-AUD-005 | INSERT direto só `scheduled`; registro finalizado imutável **inclusive durante arquivamento**; `archive_maintenance()` toca apenas `archived_at`/`archived_by` | `20260731000200_lock_state_transitions.sql` | `08_audit_fixes.sql` "DB-AUD-005 …" (7 testes) |
| DB-AUD-006 | Grant por coluna em `vehicles`/`drivers`; triggers bloqueiam status, `active`, `archived_at`, `archived_by`; RPCs `set_vehicle_status`, `set_driver_active`, `unarchive_driver` | `20260731000200_lock_state_transitions.sql` | `08_audit_fixes.sql` "DB-AUD-006 …" (7 testes) |
| DB-AUD-007 | `register_vehicle_movement()` valida existência, lock, empresa, `status='confirmed'`, veículo, câmera/local, placa (ou override auditado) e não reutilização; `manual` exige `plate_read_event_id is null` | `20260731000300_harden_ocr_movements.sql` | `08_audit_fixes.sql` "DB-AUD-007 …" (8 testes) |
| DB-AUD-008 | `cancel_trip` e `cancel_maintenance` passam a bloquear veículo → documento, como start/complete | `20260731000400_fix_lock_order.sql` | `concurrency.test.mjs` 19–24 + `ferramentas/testes/verificar-concorrencia.mjs` |
| DB-AUD-009 | `start_maintenance` exige veículo `available`; índice parcial único de manutenção `in_progress` por veículo; concluir/cancelar não libera o veículo se houver outra ativa | `20260731000200_lock_state_transitions.sql` | `08_audit_fixes.sql` "DB-AUD-009 …" (5 testes) |
| DB-AUD-010 | `pg_advisory_xact_lock` determinístico por empresa, com recontagem depois do lock | `20260731000100_fix_profile_tenancy.sql` | `concurrency.test.mjs` 15–18 |
| DB-AUD-011 | Compensação do usuário Auth criado na requisição; auditoria verificada e obrigatória; chave de idempotência | `gerenciar-equipe.ts`, `20260731000800_admin_channel.sql` | `tests/edge/admin-users.test.mjs` 17–24 |
| DB-AUD-012 | `ferramentas/administracao/preparar-demonstracao.mjs`: um comando idempotente que cria contas, usa os UUIDs reais, popula tudo e valida | `ferramentas/administracao/preparar-demonstracao.mjs`, `supabase/seed.sql` | `tests/integration/remote-seed.test.mjs` (15 verificações) |
| DB-AUD-013 | `created_by` carimbado pelo servidor; todo campo de ator validado contra a empresa da linha; FK em `companies.archived_by` | `20260731000500_actor_integrity.sql` | `08_audit_fixes.sql` "DB-AUD-013 …" (5 testes) |
| DB-AUD-014 | Ledger recusa `occurred_at` anterior ao último evento; retrodatação só como correção justificada; monotonicidade no autoteste | `20260731000600_odometer_chronology.sql` | `08_audit_fixes.sql` "DB-AUD-014 …" (4 testes) |
| DB-AUD-015 | Edge Function reconhece `LAST_ADMIN_PROTECTED` (e o antigo `LAST_COMPANY_ADMIN`) e devolve 409 | `gerenciar-equipe.ts` | `tests/edge/admin-users.test.mjs` 25–26 |
| DB-AUD-016 | `findAuthUserByEmail()` percorre a paginação da Admin API | `gerenciar-equipe.ts` | `tests/edge/admin-users.test.mjs` 14–16 |
| DB-AUD-017 | CORS por allowlist configurável; sem curinga; `Vary: Origin`; preflight validado | `gerenciar-equipe.ts`, `index.ts` | `tests/edge/admin-users.test.mjs` 28–32 |
| DB-AUD-018 | Limiar de confiança vem de `cameras.min_confidence` (cliente só endurece); `captured_at` limitado a `[-24h, +2min]` | `20260731000300_harden_ocr_movements.sql` | `08_audit_fixes.sql` "DB-AUD-018 …" (4 testes) |
| DB-AUD-019 | `fuelings.fuel_type` não aceita `flex`/`electric`; `fuel_is_compatible()` ajustada; veículo flex exige produto explícito | `20260731000700_reporting_fixes.sql` | `08_audit_fixes.sql` "DB-AUD-019 …" (5 testes) |
| DB-AUD-020 | `v_vehicle_fuel_consumption` mede somente entre ciclos de tanque cheio | `20260731000700_reporting_fixes.sql` | `08_audit_fixes.sql` "DB-AUD-020 …" (4 testes) |
| DB-AUD-021 | `private.assert_report_range()` aplicada em todas as RPCs de relatório | `20260731000700_reporting_fixes.sql` | `08_audit_fixes.sql` "DB-AUD-021 …" (5 testes) |

## Decisões que valem registro

**Grant de coluna como camada primária.** O padrão do projeto já era "o verbo não
existe para o papel". Estendemos isso às colunas: `status`, `archived_at`,
`archived_by`, `current_odometer_km`, campos de conclusão e de ator saíram do
`GRANT UPDATE`. Os triggers continuam existindo como segunda camada
independente, não como única defesa.

**`is_client_role()` ao lado de `is_api_role()`.** A Edge Function usa service
role e precisa de um canal administrativo legítimo. `is_api_role()` (que inclui
service_role) continua fechando escrita direta via PostgREST; `is_client_role()`
(apenas anon/authenticated) é o recorte usado onde a operação privilegiada deve
passar — por exemplo `profiles.active`.

**Triggers de guarda são SECURITY INVOKER, sempre.** Uma função que consulta
`is_api_role()` precisa enxergar o `current_user` do chamador. Sob
`SECURITY DEFINER` o `current_user` vira o dono da função e a guarda nunca
dispara. Isso foi encontrado durante a própria correção: os triggers tinham sido
escritos como DEFINER e passavam nos testes apenas porque o grant de coluna
recusava antes. O teste "DB-AUD-004 veículo de viagem em andamento é imutável"
usa de propósito uma coluna que ESTÁ no grant, para provar que a segunda camada
está viva.

**Empresa não administra estado global de profile.** Seguindo a recomendação do
achado DB-AUD-003, o estado de acesso empresarial vive em
`company_memberships.active`. `profiles.active` é operação privilegiada
(`admin_set_profile_active`, exclusiva de service_role) e continua submetida ao
piso de administradores.

**Um enum de combustível, dois significados por coluna.** Criar um segundo enum
obrigaria a reescrever FKs, views e contratos de RPC sem ganho real.
`vehicles.fuel_type` é motorização; `fuelings.fuel_type` é produto, e a
constraint `fuelings_product_is_sellable` recusa `flex` e `electric`.

**Manutenção simultânea: proibida.** Decisão explícita pedida pelo achado
DB-AUD-009, materializada em índice parcial único.

## Migrations criadas

```
20260731000100_fix_profile_tenancy.sql       DB-AUD-002, 003, 010
20260731000200_lock_state_transitions.sql    DB-AUD-004, 005, 006, 009
20260731000300_harden_ocr_movements.sql      DB-AUD-007, 018
20260731000400_fix_lock_order.sql            DB-AUD-008
20260731000500_actor_integrity.sql           DB-AUD-013
20260731000600_odometer_chronology.sql       DB-AUD-014
20260731000700_reporting_fixes.sql           DB-AUD-019, 020, 021
20260731000800_admin_channel.sql             apoio a DB-AUD-011
```

Nenhuma das 25 migrations originais foi editada. A única alteração fora de
migration foi em `supabase/seed.sql`, descrita abaixo.

## Alteração em `supabase/seed.sql`

O seed passou a resolver o UUID de cada usuário por e-mail em `auth.users`,
caindo em `private.stable_uuid()` apenas quando a conta não existe. Foi o que
permitiu que o mesmo arquivo rode em projeto remoto, onde o GoTrue gera o UUID
(DB-AUD-012). Em ambiente local nada muda: `supabase db reset` continua
produzindo exatamente a mesma base determinística.

Os dois `INSERT` em `auth.users` e `auth.identities` ganharam `where not exists`,
o que torna o seed idempotente também nessa parte.

## Contratos que mudaram

| Objeto | Antes | Agora |
|--------|-------|-------|
| `confirm_plate_read` | `(uuid, uuid)` | `(uuid, uuid, text)` — justificativa obrigatória quando a placa lida difere da placa do veículo |
| `log_admin_action` | `(uuid, uuid, text, uuid, jsonb)` | `(uuid, uuid, text, uuid, jsonb, text, jsonb)` — chave de idempotência e resultado |
| `register_plate_read` | `p_min_confidence` default `0.80` | default `null`; o piso vem de `cameras.min_confidence` |
| `admin-users` resposta | `{...}` ou `{error}` | `{data: ...}` ou `{error: ...}` |
| `admin-users` ação `list` | SELECT em `company_memberships` + join `profiles` | RPC `company_members()` |

RPCs novas: `company_members`, `admin_set_profile_active`, `set_vehicle_status`,
`set_driver_active`, `unarchive_driver`, `archive_maintenance`,
`admin_find_action`.

---

# Segunda auditoria (AUDITORIA_2.md)

## Tabela de rastreabilidade

| ID | Correção | Arquivo | Teste |
|----|----------|---------|-------|
| DB-AUD2-001 | `list` passou a usar o **cliente do usuário**; `company_members()` deixou de ser chamada com service role. Permissão passou a ser por ação: `list` exige `users.read`, mutações exigem `users.manage` | `gerenciar-equipe.ts` | `admin-users.integration.test.mjs` 1–9 (real, contra o banco); unitário 3–9 |
| DB-AUD2-002 | Provisionamento distingue conta nova de existente. Profile só nasce ativo quando é novo; profile existente **nunca** tem `active`, `full_name` ou `phone` tocados; suspenso globalmente devolve `PROFILE_GLOBALLY_INACTIVE` | `20260731000900_audit2_fixes.sql`, `gerenciar-equipe.ts` | integração 10–15; `09_audit2_fixes.sql` (7 testes) |
| DB-AUD2-003 | As três mutações viraram **RPC transacional**. Profile, membership e auditoria na mesma transação: falha desfaz tudo, então não há estado anterior a inferir. Sobra uma compensação, a da conta do GoTrue | `20260731000900_audit2_fixes.sql`, `gerenciar-equipe.ts` | integração 16–26; unitário 21–25 |
| DB-AUD2-004 | Correção de odômetro é append-only no presente: `occurred_at` carimbado pelo servidor, `correction_of_id` aponta o evento histórico, `corrected_from_km` guarda o valor errado. Retrodatação recusada sem exceção | `20260731000900_audit2_fixes.sql` | `09_audit2_fixes.sql` (13 testes) |
| DB-AUD2-005 | Chave de idempotência carrega impressão digital SHA-256 de ação + empresa + alvo + payload. Reuso em operação diferente vira 409 `IDEMPOTENCY_KEY_REUSED` | `20260731000900_audit2_fixes.sql`, `gerenciar-equipe.ts` | integração 27–31; unitário 36–43 |
| DB-AUD2-006 | `company_members()` revogada de `service_role`; criada `admin_list_company_members(uuid)` como contrapartida administrativa | `20260731000900_audit2_fixes.sql` | `09_audit2_fixes.sql` (4 testes) |

## Decisões desta rodada

**Transação no lugar de compensação.** O achado DB-AUD2-003 descrevia compensações
que restauravam estado inferido em vez de estado lido. A correção não foi
escrever compensações melhores: foi eliminar a necessidade delas. Profile,
membership e auditoria agora acontecem dentro de `admin_provision_member`,
`admin_set_membership_active` e `admin_change_member_role`. Se a auditoria falha,
o PostgreSQL desfaz — a membership histórica continua exatamente com o `role` e o
`active` que tinha, porque nunca chegou a mudar. Sobrou uma única compensação, a
da conta criada no GoTrue, que é o único passo fora do banco.

**A empresa administra membership; a plataforma administra profile.** Um usuário
existente entra na empresa sem que `profiles.active`, `full_name` ou `phone`
sejam tocados. São dados globais dele, não da empresa que está convidando.
Reativação global continua exclusiva de `admin_set_profile_active`.

**Correção de odômetro não reescreve o passado.** O ledger é append-only e
monotônico. Uma correção é um evento novo, no instante atual, que aponta o evento
histórico. Consequência aceita e documentada: **correção para baixo é impossível
por API**. Reduzir a quilometragem exigiria recalcular todos os eventos
posteriores, o que contraria ADR-006. Erro de digitação para mais é incidente de
dados e se resolve por procedimento administrativo com trilha.

**A invariante do ledger virou independente de ordem.** A versão anterior usava
`lag()` sobre `(occurred_at, created_at, id)`. Dentro de uma mesma transação
`now()` é constante, dois eventos empatam nas duas primeiras colunas e o
desempate cai no `id` aleatório — o autoteste acusava inversão onde não havia.
Agora a checagem compara cada evento com o maior km entre os **estritamente
anteriores** (`RANGE ... EXCLUDE GROUP`), o que expressa a invariante real: se
ocorreu antes, não pode ter quilometragem maior.

**O mock não bastava, e isso ficou explícito.** O achado DB-AUD2-001 passou na
primeira rodada porque o duplo de teste devolvia sucesso artificial para
`company_members()`. A suíte agora tem duas camadas com papéis declarados:
`tests/edge/` cobre contrato, autorização e CORS sem banco;
`tests/integration/admin-users.integration.test.mjs` executa o handler com
conexões PostgreSQL reais, cada uma com o papel e o JWT corretos. O primeiro
teste dessa suíte é a prova de regressão: chama `company_members()` com service
role e exige que falhe.

## Contratos que mudaram nesta rodada

| Objeto | Antes | Agora |
|--------|-------|-------|
| `admin_find_action` | `(uuid, text)` | `(uuid, text, text)` — impressão digital |
| `log_admin_action` | `(…, jsonb)` 7 args | 8 args, com `p_fingerprint` |
| `register_odometer_reading` | correção podia ser retrodatada | correção sempre no instante atual; resposta traz `correctedFromKm` e `occurredAtStampedByServer` |
| `company_members()` | `authenticated` + `service_role` | somente `authenticated` |
| `admin-users` `list` | service role | cliente autenticado |
| `admin-users` permissão | `users.manage` para tudo | `users.read` para `list`, `users.manage` para mutações |

RPCs novas: `admin_provision_member`, `admin_set_membership_active`,
`admin_change_member_role`, `admin_list_company_members`.

Coluna nova: `vehicle_odometer_events.corrected_from_km`.
