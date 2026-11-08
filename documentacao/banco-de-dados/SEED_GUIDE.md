> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

> **REFERÊNCIA:** documento de referência detalhada de banco. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# SEED_GUIDE — PegaNaFrota

Guia dos dados de demonstração: o que existe, como reproduzir e como conferir.

---

## 1. Como rodar

Antes de qualquer script Node, instale as dependências do lockfile:

```bash
npm ci
```

### Ambiente local

```bash
npx supabase db reset          # migrations + supabase/seed.sql
npm run seed:verify
```

### Projeto Supabase remoto

No remoto, os usuários do Auth precisam ser criados pela Admin API e o SQL
precisa usar os UUIDs reais dessas contas. O script `seed:remote` faz o fluxo
completo:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY='<sua-service-role-key>' \
DATABASE_URL='postgresql://...' \
SEED_DEMO_PASSWORD='SENHA_DEMO_FORTE' \
npm run seed:remote
```

O comando cria/localiza as contas, aplica `supabase/seed.sql` e executa as
verificações. A `service_role` deve existir apenas no ambiente temporário do
operador, nunca em `.env` versionado.

Para reconstruir somente os dados de demonstração, preservando `auth.users`:

```bash
npm run seed:remote -- --reset
```

Nesse modo `public.profiles` também pode permanecer. O seed usa `ON CONFLICT`
para atualizar os profiles e recria memberships/dados de negócio sem colisão de
PK.

Para apenas conferir uma base já semeada:

```bash
DATABASE_URL='postgresql://...' npm run seed:verify
```

O seed é determinístico. Em base já populada, a execução normal não duplica os
dados de negócio.

---

## 2. Contas de demonstração

**Senha de todas as contas:** `PegaNaFrota#2026`

Padrão de e-mail: `{papel}@{empresa}.example.com`

### Aurora Verde — 18 veículos
| E-mail | Nome | Papel | Situação |
|---|---|---|---|
| `admin@auroraverde.example.com` | Ana R. | company_admin | ativo |
| `gestor@auroraverde.example.com` | Bruno M. | fleet_manager | ativo |
| `operador@auroraverde.example.com` | Camila S. | operator | ativo |
| `consulta@auroraverde.example.com` | Diego L. | viewer | ativo |
| `desligado@auroraverde.example.com` | Eduarda P. | operator | **vínculo inativo** |

### Pedra Alta — 24 veículos
| E-mail | Nome | Papel | Situação |
|---|---|---|---|
| `admin@pedraalta.example.com` | Fabio T. | company_admin | ativo |
| `gestor@pedraalta.example.com` | Gisele A. | fleet_manager | ativo |
| `operador@pedraalta.example.com` | Henrique B. | operator | ativo |
| `operador2@pedraalta.example.com` | Isabela C. | operator | ativo |
| `consulta@pedraalta.example.com` | Joao V. | viewer | ativo |
| `suspenso@pedraalta.example.com` | Karina D. | operator | **perfil inativo** |

### Rio Sereno — 31 veículos
| E-mail | Nome | Papel |
|---|---|---|
| `admin@riosereno.example.com` | Lucas E. | company_admin |
| `gestor@riosereno.example.com` | Marina F. | fleet_manager |
| `gestor2@riosereno.example.com` | Nelson G. | fleet_manager |
| `operador@riosereno.example.com` | Olivia H. | operator |
| `operador2@riosereno.example.com` | Paulo I. | operator |
| `consulta@riosereno.example.com` | Renata J. | viewer |

### Campo Novo — 16 veículos
| E-mail | Nome | Papel |
|---|---|---|
| `admin@camponovo.example.com` | Sergio K. | company_admin |
| `admin2@camponovo.example.com` | Tatiana L. | company_admin |
| `gestor@camponovo.example.com` | Ulisses M. | fleet_manager |
| `gestor2@camponovo.example.com` | Vanessa N. | fleet_manager |
| `operador@camponovo.example.com` | Wagner O. | operator |
| `operador2@camponovo.example.com` | Xenia P. | operator |
| `operador3@camponovo.example.com` | Yuri Q. | operator |
| `consulta@camponovo.example.com` | Zilda R. | viewer |

As duas contas “problemáticas” são deliberadas: `desligado` tem vínculo inativo
e `suspenso` tem perfil inativo. Servem para demonstrar — e testar — que as duas
formas de desativação bloqueiam o acesso por caminhos independentes.

Campo Novo tem **dois administradores** de propósito: é a única empresa onde é
possível desativar um admin sem esbarrar na proteção da última conta
administrativa.

**Todos os nomes, empresas e CNPJs são fictícios.** Os CNPJs passam no módulo 11
porque a constraint exige, mas não correspondem a nenhuma empresa real.

---

## 3. Volumes

| Entidade | Total |
|---|---|
| Empresas | 4 |
| Usuários | 25 |
| Veículos | 89 (18 / 24 / 31 / 16) |
| Motoristas | 29 |
| Locais / Câmeras | 9 / 13 |
| Viagens | ~4 300 |
| Abastecimentos | ~3 900 |
| Manutenções | ~410 |
| Eventos de odômetro | ~8 600 |
| Movimentações | ~8 650 |
| Leituras de placa | 90 |
| Eventos de auditoria | ~26 000 |

Distribuições:

- **Veículos:** 60 disponíveis · 14 em uso · 6 em manutenção · 5 inativos · 4 arquivados
- **Presença:** 75 dentro do pátio · 14 fora
- **Viagens:** ~4 270 concluídas · 19 planejadas · 14 em andamento · 9 canceladas
- **Manutenções:** ~356 concluídas · 40 agendadas (parte vencida) · 6 em execução · 6 canceladas
- **Leituras:** 58 confirmadas · 12 desconhecidas · 12 de baixa confiança · 4 duplicadas · 4 com erro

---

## 4. Como o histórico é construído

24 meses por veículo, terminando **no mês corrente** — é o que mantém dashboard
e alertas populados em qualquer data de execução.

Quatro eventos por mês, nos dias 1, 7, 13 e 19: viagem, abastecimento, viagem,
abastecimento. A cada seis meses, uma manutenção no dia 24. Os slots são
espaçados o suficiente para que nenhum evento caia dentro da janela de uma
viagem.

A quilometragem é acumulada por veículo com função de janela:

```sql
initial_km + sum(delta_km) over (partition by vehicle_id order by occurred_at)
```

Só viagens têm `delta_km > 0`. Abastecimento e manutenção registram a
quilometragem do momento. Resultado: o ledger é monotônico por construção, e a
inserção em massa **ordenada por `(vehicle_id, occurred_at)`** passa pelo
trigger de não regressão — o que, por si só, prova que a cronologia gerada é
coerente.

As movimentações vêm da mesma linha do tempo: entrada no cadastro, saída e
entrada por viagem concluída, saída sem retorno para viagem em andamento. O
`sequence_no` é o `row_number()` cronológico, e o tipo vem da paridade. O seed
**verifica a si mesmo** antes de gravar: se a paridade calculada divergir da
semântica, ele aborta com `SEED_INCONSISTENT`.

### Operações reais no fim do seed

O bloco final não é enfeite: ele chama `register_odometer_reading()` e
`register_fueling()` de verdade, uma vez por empresa, com o claim JWT do
administrador. Isso faz três coisas:

1. exercita as RPCs transacionais a cada `supabase db reset` — se uma garantia
   quebrar, o reset falha na hora, em vez de a falha aparecer só nos testes;
2. produz eventos de auditoria com ação `execute` e **autor real**;
3. prova que o caminho oficial de escrita funciona sobre os dados semeados.

---

## 5. Determinismo

Nada usa `random()`. Todo identificador vem de `private.stable_uuid(semente)` e
toda variação de `private.stable_random(semente)`, ambos derivados de hash.
Duas execuções produzem exatamente os mesmos UUIDs.

Sementes úteis para escrever testes:

```sql
private.stable_uuid('company:auroraverde')      -- empresa
private.stable_uuid('user:auroraverde:admin')   -- usuário
private.stable_uuid('vehicle:auroraverde:7')    -- veículo (placa AVD0007)
private.stable_uuid('driver:auroraverde:1')     -- motorista
private.stable_uuid('location:auroraverde:1')   -- local
private.stable_uuid('camera:1:1:1')             -- câmera (índice da empresa)
private.stable_uuid('trip:open:'  || <uuid do veículo>::text)  -- viagem em andamento
private.stable_uuid('maint:running:' || <uuid do veículo>::text)
```

### Estados por índice do veículo

Dentro de cada empresa, o índice `seq` (1 … n) determina o estado:

| Condição | Estado |
|---|---|
| `seq % 7 = 3` | viagem em andamento → veículo **fora** do pátio |
| `seq % 13 = 6` | manutenção em execução → `in_maintenance` |
| `seq % 19 = 9` | `inactive` |
| `seq = 14` | **arquivado** |
| `seq % 5 = 1` | viagem planejada |
| `seq % 8 = 5` | manutenção vencida (alerta) |
| `seq % 3 = 0` | manutenção agendada nos próximos 30 dias |
| `seq % 11 = 4` | viagem cancelada |
| `seq % 17 = 7` | manutenção cancelada |
| `seq = 2` | **sem nenhuma pendência** — bom para testar arquivamento |
| `seq % 3 = 0` | entradas recentes com leitura OCR confirmada |

Combustível: `array['flex','flex','diesel_s10','diesel_s10','gasoline','diesel_s500','flex','cng','electric','flex'][1 + seq % 10]`.
O veículo `seq = 8` é **elétrico** e por isso não tem abastecimento algum.

Placas: até `seq 25`, padrão nacional antigo (`AVD0007`); acima, padrão Mercosul
(`AVD6A02`). Prefixos: `AVD`, `PDA`, `RSN`, `CPN`.

---

## 6. Conferência

```bash
node ferramentas/administracao/verificar-demonstracao.mjs
```

37 verificações: volumes por empresa, faixas exigidas (3–8 usuários, 15–40
veículos), presença dos quatro papéis, existência das contas inativas, cobertura
de 24 meses, movimentação recente, todos os status de cada enum, veículos dentro
e fora, dashboard populado para cada administrador, e as duas funções de
autoteste (`data_integrity_selftest` e `security_selftest`) sem apontamentos.

Dentro do banco, a qualquer momento:

```sql
select * from private.data_integrity_selftest();  -- vazio = base coerente
select * from private.security_selftest();        -- vazio = sem desvio
```
