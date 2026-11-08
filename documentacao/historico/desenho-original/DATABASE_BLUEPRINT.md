> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Blueprint do Banco PostgreSQL/Supabase

Este documento orienta a implementação. O Claude Opus pode ajustar detalhes quando houver justificativa, mas não pode remover garantias.

## 1. Schemas

```text
public   — tabelas e funções acessíveis pela API sob RLS
private  — helpers internos e funções auxiliares não expostas
audit    — auditoria append-only
```

## 2. Convenções

- IDs: UUID.
- Datas: `timestamptz`.
- Dinheiro: `numeric(14,2)`.
- Litros: `numeric(12,3)`.
- Quilometragem: `numeric(12,1)`.
- Placa: texto normalizado sem hífen/espaço, uppercase.
- CNPJ: somente dígitos.
- `created_at` e `updated_at` em registros mutáveis.
- `archived_at` e `archived_by` quando houver arquivamento.
- `company_id` em toda entidade de negócio.
- Foreign keys explícitas.
- `on delete restrict` para históricos.
- Valores de status por enum ou check constraint.
- Nenhum cálculo financeiro em `double precision`.

## 3. Tabelas

### 3.1 `companies`

Campos principais:

- `id`;
- `legal_name`;
- `trade_name`;
- `cnpj`;
- `email`;
- `phone`;
- endereço estruturado ou JSONB validado;
- `status`;
- timestamps.

Garantias:

- CNPJ globalmente único;
- CNPJ normalizado;
- empresa não é apagada fisicamente no MVP.

### 3.2 `profiles`

PK/FK para `auth.users.id`.

Campos:

- `id`;
- `full_name`;
- `active`;
- `last_seen_at`;
- timestamps.

Não duplicar senha ou token.

### 3.3 `company_memberships`

Campos:

- `id`;
- `company_id`;
- `user_id`;
- `role`;
- `active`;
- timestamps.

Garantias do MVP:

- um usuário possui uma membership ativa;
- combinação empresa/usuário única;
- último admin ativo não pode ser removido sem substituto;
- papel controlado.

### 3.4 `drivers`

Registro operacional, sem login.

Campos:

- `id`;
- `company_id`;
- nome;
- documento interno opcional;
- telefone opcional;
- categoria de habilitação opcional;
- validade opcional;
- `active`;
- timestamps;
- arquivamento.

Dados pessoais devem ser mínimos.

### 3.5 `vehicles`

Campos:

- `id`;
- `company_id`;
- `plate`;
- marca;
- modelo;
- ano;
- cor;
- combustível;
- categoria opcional;
- `status`;
- `current_odometer_km`;
- timestamps;
- arquivamento.

Garantias:

- placa globalmente única conforme regra atual;
- placa normalizada;
- odômetro alterado apenas por função;
- veículo com histórico é arquivado.

### 3.6 `vehicle_odometer_events`

Ledger imutável.

Campos:

- `id`;
- `company_id`;
- `vehicle_id`;
- `occurred_at`;
- `odometer_km`;
- `source_type`;
- `source_id`;
- `reason`;
- `created_by`;
- `created_at`;
- `correction_of_id` opcional.

Garantias:

- sem regressão;
- único evento por fonte;
- atualização transacional do veículo;
- correções por evento compensatório, nunca edição comum.

### 3.7 `trips`

Campos:

- `id`;
- `company_id`;
- `vehicle_id`;
- `driver_id` opcional;
- status;
- saída planejada/real;
- retorno planejado/real;
- origem;
- destino;
- `start_odometer_km`;
- `end_odometer_km`;
- observações;
- timestamps;
- cancelamento/arquivamento.

Garantias:

- retorno não antecede saída;
- final maior que inicial ao concluir;
- conclusão cria evento de odômetro;
- relacionamentos pertencem à empresa.

### 3.8 `fuelings`

Campos:

- `id`;
- `company_id`;
- `vehicle_id`;
- `driver_id` opcional;
- data;
- tipo de combustível;
- litros;
- valor por litro;
- valor total gerado/validado;
- odômetro;
- posto opcional;
- observações;
- timestamps.

Garantias:

- números positivos;
- total exato;
- registro cria evento de odômetro;
- combustível coerente conforme política aprovada.

### 3.9 `maintenance_records`

Um modelo unificado para agendamento e histórico.

Campos:

- `id`;
- `company_id`;
- `vehicle_id`;
- tipo preventiva/corretiva;
- status agendada/em_execução/concluída/cancelada;
- descrição;
- data prevista;
- data de início;
- data de conclusão;
- odômetro previsto;
- odômetro de conclusão;
- valor;
- fornecedor/oficina opcional;
- timestamps;
- arquivamento.

Garantias:

- valor de manutenção concluída maior que zero;
- conclusão cria evento de odômetro quando informado;
- histórico concluído não é apagado;
- data futura é permitida somente para agendamento, resolvendo a diferença entre manutenção realizada e planejada.

### 3.10 `locations`

Pátios, garagens ou acessos.

Campos:

- `id`;
- `company_id`;
- nome;
- endereço;
- timezone;
- ativo;
- timestamps.

### 3.11 `cameras`

Campos:

- `id`;
- `company_id`;
- `location_id`;
- nome;
- identificador local;
- direção opcional;
- ativo;
- configuração não secreta;
- timestamps.

Credenciais de câmera não ficam na tabela exposta.

### 3.12 `plate_read_events`

Campos:

- `id`;
- `company_id`;
- `camera_id`;
- `captured_at`;
- texto bruto;
- placa normalizada;
- confiança;
- hash do frame opcional;
- referência segura de imagem opcional;
- status;
- `matched_vehicle_id`;
- motivo de rejeição;
- versão do motor OCR;
- timestamps.

Status sugeridos:

- capturado;
- baixa_confiança;
- desconhecido;
- duplicado;
- confirmado;
- erro.

### 3.13 `vehicle_movements`

Campos:

- `id`;
- `company_id`;
- `vehicle_id`;
- `location_id`;
- tipo Entrada/Saída;
- `occurred_at`;
- origem manual/OCR;
- `plate_read_event_id` opcional;
- operador;
- timestamps.

Garantias:

- primeira é Entrada;
- alternância;
- um evento OCR confirmado gera no máximo uma movimentação;
- função transacional única.

### 3.14 `audit.events`

Campos:

- `id`;
- `company_id`;
- `actor_user_id`;
- ação;
- entidade;
- entidade_id;
- campos alterados;
- `request_id`;
- `occurred_at`;
- metadados seguros.

Usuários normais não atualizam nem apagam.

## 4. Funções/RPC obrigatórias

### Identidade e autorização

- `private.current_user_company_id()`;
- `private.current_user_role()`;
- `private.has_permission(permission_code)`;
- `private.assert_company_access(company_id)`.

### Negócio

- `public.register_odometer_event(...)`;
- `public.complete_trip(...)`;
- `public.register_fueling(...)`;
- `public.complete_maintenance(...)`;
- `public.register_vehicle_movement(...)`;
- `public.archive_vehicle(...)`;
- `public.dashboard_summary(...)`;
- funções de relatório paginadas conforme necessário.

## 5. RLS

### Regra padrão

SELECT:

```text
company_id = empresa ativa do auth.uid()
e usuário/membership ativos
```

INSERT:

```text
empresa do registro = empresa ativa
e usuário possui permissão
```

UPDATE:

```text
registro pertence à empresa ativa
e usuário possui permissão
e company_id não pode ser trocado
```

DELETE:

- negado para tabelas históricas;
- quando aplicável, somente admin e sem referências;
- preferir RPC de arquivamento.

## 6. Índices iniciais

Todos sujeitos a confirmação por consultas.

- `(company_id, created_at desc)`;
- veículos `(company_id, status)`;
- placa única;
- viagens `(company_id, actual_departure_at desc)`;
- abastecimentos `(company_id, fueled_at desc)`;
- manutenções `(company_id, status, scheduled_at)`;
- movimentos `(company_id, vehicle_id, occurred_at desc)`;
- leituras `(company_id, camera_id, captured_at desc)`;
- eventos de odômetro `(vehicle_id, occurred_at desc, created_at desc)`;
- memberships `(user_id)`, `(company_id, role, active)`.

## 7. Views e relatórios

Usar `security_invoker` quando views forem expostas.

Agregados principais:

- frota por status;
- veículo dentro/fora;
- custos mensais;
- custo por veículo;
- consumo por veículo;
- manutenções próximas/vencidas;
- últimas entradas/saídas.

Não criar materialized view no MVP sem evidência de necessidade.

## 8. Seed

Mínimo obrigatório:

- 4 empresas fictícias;
- 3–8 usuários por empresa;
- 15–40 veículos por empresa;
- motoristas;
- locais e câmeras;
- 24 meses;
- viagens;
- abastecimentos;
- manutenções;
- odômetros coerentes;
- movimentações alternadas;
- leituras reconhecidas, desconhecidas, duplicadas e de baixa confiança;
- casos de alerta;
- credenciais de demonstração documentadas fora do código de produção.

O seed deve ser determinístico e recriável por `supabase db reset`.

Usuários Auth podem ser criados por script local administrativo separado.

## 9. Testes

Usar pgTAP/SQL e testes via cliente.

Testar:

- estrutura;
- constraints;
- functions;
- RLS;
- roles;
- isolamento;
- concorrência;
- cronologia;
- seed;
- dashboard.

## 10. Pontos que o implementador pode ajustar

- nomes finais;
- divisão de maintenance;
- endereço normalizado versus JSONB;
- tabela de permissões versus matriz em código;
- retenção de imagens;
- granularidade da auditoria.

Toda alteração deve preservar as garantias e ser registrada em ADR ou documentação.
