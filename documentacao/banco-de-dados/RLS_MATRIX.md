> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

> **REFERÊNCIA:** documento de referência detalhada de banco. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# RLS_MATRIX — PegaNaFrota

Quem enxerga o quê, quem escreve o quê, e **onde exatamente** cada regra é
aplicada. Este documento é o contrato de segurança do banco.

---

## 1. Princípio

Três camadas independentes, nesta ordem:

1. **GRANT** — decide se o verbo SQL sequer existe para `authenticated`.
2. **RLS policy** — decide quais linhas o verbo alcança.
3. **Trigger / RPC** — decide se a transição de estado é legítima.

A fronteira mais importante é a primeira. Para as tabelas transacionais
(`vehicle_odometer_events`, `vehicle_movements`, `plate_read_events` e o
`INSERT` de `fuelings`) **o privilégio simplesmente não é concedido**. Não
existe policy a contornar: o caminho é a RPC `SECURITY DEFINER` ou nada.

---

## 2. Papéis

| Papel | Descrição |
|---|---|
| `company_admin` | administra a empresa e os usuários |
| `fleet_manager` | opera a frota inteira, menos empresa e usuários |
| `operator` | registra a operação do dia a dia |
| `viewer` | somente leitura |

O papel vem de `company_memberships.role`, **resolvido no servidor** a cada
requisição por `private.current_user_role()`. O cliente nunca informa papel.

### Usuário inativo

O acesso exige **perfil ativo E vínculo ativo**:

```sql
private.current_user_company_id()  -- null se profiles.active = false
                                   -- null se company_memberships.active = false
```

Com `null`, toda policy falha e o usuário não enxerga nem escreve nada. Não há
caminho alternativo — é a mesma função usada por todas as policies.

---

## 3. Matriz por tabela

Legenda: **L** leitura · **C** criação · **A** alteração · **—** nenhum acesso ·
**RPC** só pela função transacional

| Tabela | company_admin | fleet_manager | operator | viewer |
|---|---|---|---|---|
| `companies` | L A | L | L | L |
| `profiles` | L A (da empresa) | L (da empresa) | L (próprio) | L (próprio) |
| `company_memberships` | L A | L | L (próprio) | L (próprio) |
| `drivers` | L C A | L C A | L | L |
| `vehicles` | L C A | L C A | L | L |
| `locations` | L C A | L C A | L | L |
| `cameras` | L C A | L C A | L | L |
| `trips` | L C A | L C A | L C A | L |
| `fuelings` | L RPC A¹ | L RPC A¹ | L RPC A¹ | L |
| `maintenance_records` | L C A | L C A | L RPC² | L |
| `vehicle_odometer_events` | L RPC | L RPC | L RPC | L |
| `vehicle_movements` | L RPC | L RPC | L RPC | L |
| `plate_read_events` | L RPC | L RPC | L RPC | — ³ |
| `audit.events` (view `audit_events`) | L | L | — | — |

¹ `INSERT` só por `register_fueling()`. Depois de gravado, litros, preço, total
e quilometragem são **imutáveis** (trigger `a_guard_fuelings_core`); só campos
descritivos podem ser corrigidos.

² O operador registra manutenção corretiva em andamento, mas **não agenda**
(`maintenance.schedule` é do gestor) e não conclui fora da RPC.

³ O visualizador não tem `ocr.operate` nem enxerga a fila de revisão.

---

## 4. Matriz de permissões

Materializada em `private.permissions` (32 códigos) e `private.role_permissions`.
Consultada por `private.has_permission(code)`; as RPCs usam
`private.assert_permission(code)`, que lança `42501` com hint
`PERMISSION_DENIED`.

| Código | admin | gestor | operador | visualizador |
|---|:---:|:---:|:---:|:---:|
| `company.read` | ✅ | ✅ | ✅ | ✅ |
| `company.update` | ✅ | ❌ | ❌ | ❌ |
| `users.read` | ✅ | ✅ | ❌ | ❌ |
| `users.manage` | ✅ | ❌ | ❌ | ❌ |
| `vehicles.read` | ✅ | ✅ | ✅ | ✅ |
| `vehicles.write` | ✅ | ✅ | ❌ | ❌ |
| `vehicles.archive` | ✅ | ✅ | ❌ | ❌ |
| `drivers.read` | ✅ | ✅ | ✅ | ✅ |
| `drivers.write` | ✅ | ✅ | ❌ | ❌ |
| `trips.read` | ✅ | ✅ | ✅ | ✅ |
| `trips.write` | ✅ | ✅ | ✅ | ❌ |
| `trips.cancel` | ✅ | ✅ | ❌ | ❌ |
| `fuelings.read` | ✅ | ✅ | ✅ | ✅ |
| `fuelings.write` | ✅ | ✅ | ✅ | ❌ |
| `maintenance.read` | ✅ | ✅ | ✅ | ✅ |
| `maintenance.write` | ✅ | ✅ | ✅ | ❌ |
| `maintenance.schedule` | ✅ | ✅ | ❌ | ❌ |
| `odometer.read` | ✅ | ✅ | ✅ | ✅ |
| `odometer.adjust` | ✅ | ✅ | ❌ | ❌ |
| `locations.read` | ✅ | ✅ | ✅ | ✅ |
| `locations.write` | ✅ | ✅ | ❌ | ❌ |
| `cameras.read` | ✅ | ✅ | ✅ | ✅ |
| `cameras.write` | ✅ | ✅ | ❌ | ❌ |
| `movements.read` | ✅ | ✅ | ✅ | ✅ |
| `movements.write` | ✅ | ✅ | ✅ | ❌ |
| `ocr.read` | ✅ | ✅ | ✅ | ❌ |
| `ocr.operate` | ✅ | ✅ | ✅ | ❌ |
| `ocr.review` | ✅ | ✅ | ❌ | ❌ |
| `dashboard.read` | ✅ | ✅ | ✅ | ✅ |
| `reports.read` | ✅ | ✅ | ✅ | ✅ |
| `reports.export` | ✅ | ✅ | ❌ | ❌ |
| `audit.read` | ✅ | ✅ | ❌ | ❌ |

---

## 5. Formato das policies

Toda tabela tem policies **separadas por operação**. Nunca `FOR ALL`: uma
policy única obrigaria a mesma expressão a servir de `USING` e `WITH CHECK`, e
o erro fica invisível.

```sql
-- leitura: só a própria empresa
create policy vehicles_select on public.vehicles
  for select to authenticated
  using (company_id = private.current_user_company_id());

-- criação: a própria empresa E a permissão
create policy vehicles_insert on public.vehicles
  for insert to authenticated
  with check (
    company_id = private.current_user_company_id()
    and private.has_permission('vehicles.write')
  );

-- alteração: a linha precisa ser da empresa ANTES e DEPOIS
create policy vehicles_update on public.vehicles
  for update to authenticated
  using (company_id = private.current_user_company_id()
         and private.has_permission('vehicles.write'))
  with check (company_id = private.current_user_company_id()
              and private.has_permission('vehicles.write'));
```

O `WITH CHECK` do `UPDATE` é o que impede **transferir uma linha para outra
empresa**. Sem ele, um `update … set company_id = <outra>` passaria pelo
`USING` e a linha sairia do tenant.

---

## 6. Helpers

Todos em `private`, todos `SECURITY DEFINER` com `search_path` fixo e **sem
`EXECUTE` para `anon`**.

| Função | Papel |
|---|---|
| `private.current_user_id()` | `auth.uid()` com fallback seguro |
| `private.current_user_company_id()` | empresa do vínculo ativo, ou `null` |
| `private.current_user_role()` | papel do vínculo ativo, ou `null` |
| `private.has_permission(text)` | consulta a matriz |
| `private.assert_permission(text)` | lança `42501` |
| `private.assert_company_access(uuid)` | confere que o recurso é do tenant |
| `private.is_api_role()` | distingue chamada via API de chamada interna |

### `private.is_api_role()` — por que existe

Os triggers de guarda precisam distinguir **“o cliente está tentando escrever
direto”** de **“a RPC oficial está escrevendo”**. A tentação é usar uma variável
de sessão (`set_config`) como sinalizador, mas o cliente PostgREST consegue
definir variáveis de sessão: o sinalizador seria falsificável.

A função compara `current_user` com os papéis da API:

```sql
current_user in ('anon', 'authenticated', 'service_role')
```

Dentro de uma função `SECURITY DEFINER`, `current_user` é o **dono** da função,
então a guarda deixa passar. Numa escrita direta do PostgREST, `current_user` é
`authenticated` e a guarda bloqueia. Não há nada para o cliente forjar.

Por isso `private.is_api_role()` é obrigatoriamente `SECURITY INVOKER`.

---

## 7. Papéis do PostgREST

| Papel | Acesso |
|---|---|
| `anon` | **nenhum**. Sem `USAGE` em `private`/`audit`, sem grant em `public`. |
| `authenticated` | conforme a matriz acima |
| `service_role` | só a Edge Function `admin-users` e scripts administrativos locais |

A `service_role` **nunca** é empacotada no Electron (ADR-003). Ela ignora RLS —
se vazasse com o instalador, daria controle total sobre todas as empresas.

---

## 8. Verificação automática

`private.security_selftest()` devolve **uma linha por desvio**; resultado vazio
significa nenhum desvio. Verifica:

1. tabela em `public` sem RLS habilitada
2. tabela com RLS e sem nenhuma policy (nega tudo por acidente)
3. função `SECURITY DEFINER` sem `search_path` fixo
4. qualquer privilégio concedido a `anon`
5. tabela de `private` concedida a `authenticated`
6. escrita direta concedida em tabela transacional
7. view sem `security_invoker`
8. tabela de negócio sem `company_id`

Executada pelo teste `00_structure.sql` e por `ferramentas/administracao/verificar-demonstracao.mjs`.
