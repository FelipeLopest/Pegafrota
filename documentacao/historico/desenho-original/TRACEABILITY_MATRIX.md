> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Matriz de Rastreabilidade

| Regra/Requisito | Componente | Banco/Função | Teste |
|---|---|---|---|
| CNPJ único | Empresa | unique `companies.cnpj` | duplicidade |
| Isolamento | Todos | RLS por company | empresa A/B |
| Usuário autenticado | Auth | Auth + RLS | sem JWT |
| E-mail | Usuários | Supabase Auth | duplicidade Auth |
| Usuário inativo | Auth/Tenancy | membership/profile ativo | sessão inativa |
| Placa única | Veículos | unique plate normalizada | duplicidade |
| Situação | Veículos | enum/check | status inválido |
| Não apagar histórico | Veículos | archive RPC + restrict | delete negado |
| km final > inicial | Viagens | `complete_trip` | final inválido |
| retorno >= saída | Viagens | constraint/function | data inválida |
| atualizar km | Odometer | ledger RPC | evento criado |
| total abastecimento | Fuelings | generated/validated | cálculo |
| km não regride | Odometer | `register_odometer_event` | regressão |
| valor manutenção > 0 | Maintenance | constraint | zero/negativo |
| histórico manutenção | Maintenance | restrict/archive | delete negado |
| placa identificada | OCR | lookup + event | placa conhecida |
| desconhecida não move | OCR/Movement | movement RPC | desconhecida |
| data automática | Movement | server timestamp | cliente manipulado |
| primeira Entrada | Movement | RPC | sem histórico |
| alternância | Movement | RPC + lock | duas entradas |
| dashboard tenant | Dashboard | secure aggregate | A/B |
| relatório período | Reports | RPC/view | bordas |
| auditoria | Audit | triggers/functions | evento |
