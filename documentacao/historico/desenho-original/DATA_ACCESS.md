> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Estratégia de Acesso a Dados

## 1. Princípio

Acesso normal usa o cliente Supabase no renderer com JWT do usuário. O banco aplica RLS.

A aplicação nunca envia uma chave secreta ou service role.

## 2. Camadas

```text
Page/Component
    ↓
Feature service
    ↓
Repository/API module
    ↓
Supabase client ou IPC permitido
```

## 3. Tipos de operação

### Query simples

Exemplo: listar veículos.

- renderer;
- `.select`;
- filtros;
- paginação;
- RLS;
- mapeamento para view model.

### Mutação simples

Exemplo: atualizar cor do veículo.

- validação de schema;
- update sob RLS;
- audit trigger;
- invalidação da lista.

### Mutação transacional

Exemplo: registrar abastecimento.

- renderer chama RPC;
- função valida permissão;
- lock no veículo;
- valida odômetro;
- cria abastecimento;
- cria evento de odômetro;
- atualiza cache;
- auditoria;
- commit.

### Operação privilegiada

Exemplo: criar usuário.

- renderer chama Edge Function com JWT;
- Edge Function verifica empresa e papel;
- usa secret key no servidor;
- cria Auth user;
- cria profile/membership;
- compensa em caso de falha;
- registra auditoria.

### Operação local

Exemplo: salvar CSV.

- renderer obtém dados autorizados;
- renderer monta conteúdo controlado;
- preload chama diálogo nativo;
- main valida extensão e escreve.

## 4. Cliente Supabase

O cliente terá:

- URL e chave publicável por ambiente;
- adapter de sessão protegido;
- refresh automático;
- interceptação de erro;
- correlação por request ID;
- nenhum log de token.

## 5. Paginação

Padrão:

- 25 itens;
- opções 25, 50 e 100;
- ordenar por campo indexado;
- filtros no servidor;
- busca normalizada;
- total somente quando necessário.

Relatórios grandes devem usar paginação por cursor ou RPC específica.

## 6. Realtime

Não será usado globalmente.

Possíveis usos:

- últimas movimentações;
- atualização do dashboard operacional;
- status de OCR.

Somente ativar após:

- policies de Realtime testadas;
- tratamento de reconexão;
- invalidação de cache;
- limite de canais.

## 7. Caching

- cache curto por módulo;
- nunca cachear autorização como verdade permanente;
- limpar no logout;
- limpar ao trocar sessão;
- invalidar após mutações;
- dados sensíveis não persistidos em texto simples.

## 8. Erros

Mapeamento:

| Origem | Código |
|---|---|
| Auth | `AUTH_*` |
| RLS/permission | `FORBIDDEN` |
| Constraint | `CONFLICT_*` |
| Validação | `VALIDATION_ERROR` |
| Rede | `NETWORK_UNAVAILABLE` |
| RPC | código de domínio |
| IPC | `LOCAL_CAPABILITY_ERROR` |
| OCR | `OCR_*` |

## 9. Idempotência

Obrigatória para:

- criação de usuário;
- seed;
- confirmação de leitura OCR;
- exportação iniciada por job;
- operações sujeitas a clique repetido.

## 10. Datas e timezone

- banco armazena `timestamptz`;
- empresa/local pode definir timezone;
- filtros de dia/mês são convertidos para intervalo UTC;
- UI mostra timezone da operação;
- seed usa timezone explícito.
