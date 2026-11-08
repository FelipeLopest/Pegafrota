> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Mapa de Módulos

| Módulo | Responsabilidade | Dependências | Fase |
|---|---|---|---|
| Foundation | Electron, config, logs, IPC, rotas | nenhuma | 2 |
| Auth | login, sessão, logout, guards | Foundation, Supabase | 3 |
| Tenancy | empresa, membership, papel | Auth | 3 |
| Users | usuários e permissões | Auth, Tenancy, Edge Function | 4 |
| Drivers | registros operacionais | Tenancy | 5 |
| Vehicles | frota e status | Tenancy | 5 |
| Odometer | ledger e consistência | Vehicles | 5 |
| Trips | ciclo de viagens | Vehicles, Drivers, Odometer | 6 |
| Fuelings | abastecimentos | Vehicles, Odometer | 6 |
| Maintenance | agendamento e histórico | Vehicles, Odometer | 6 |
| Locations | pátios e acessos | Tenancy | 7 |
| Movements | Entrada/Saída | Vehicles, Locations | 7 |
| OCR | câmera e leitura | Movements, Vehicles | 9 |
| Dashboard | KPIs e alertas | módulos operacionais | 8 |
| Reports | filtros e exportação | módulos operacionais | 8 |
| Audit | trilha de negócio | todos | transversal |
| Settings | empresa, perfil, preferências | Auth, Tenancy | 4 |

## Dependências proibidas

- Renderer não importa módulo Node/Electron.
- Preload não contém regra de negócio.
- Main não executa SQL administrativo.
- UI não escreve diretamente `current_odometer_km`.
- OCR não insere diretamente em `vehicle_movements`.
- Dashboard não replica cálculo financeiro em JavaScript.
- Um módulo não altera tabela de outro sem função/contrato aprovado.

## Contratos centrais

### AuthContext

```text
userId
companyId
role
permissions
profile
sessionState
```

### AppError

```text
code
message
requestId
fieldErrors?
retryable
```

### PaginatedResult

```text
items
page
pageSize
total
hasNext
```

### OCRResult

```text
contractVersion
capturedAt
rawText
normalizedPlate
confidence
engineVersion
frameHash?
cameraLocalId
```

### MovementResult

```text
movementId
vehicleId
plate
movementType
occurredAt
locationId
deduplicated
```
