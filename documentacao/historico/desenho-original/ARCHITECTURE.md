> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Arquitetura do PegaNaFrota

## 1. Objetivo

O PegaNaFrota será uma aplicação desktop para gestão multiempresa de frotas. A aplicação centralizará veículos, motoristas operacionais, viagens, abastecimentos, manutenções, entradas e saídas, reconhecimento de placas, dashboard, relatórios e auditoria.

A arquitetura prioriza:

- isolamento forte entre empresas;
- rastreabilidade;
- consistência de quilometragem;
- segurança no Electron;
- banco recriável por migrations;
- dados de demonstração completos;
- evolução modular;
- implementação viável por fases.

## 2. Estilo arquitetural

A solução será dividida em quatro limites principais:

```text
┌─────────────────────────────────────────────────────────────┐
│                    Aplicativo Electron                      │
│                                                             │
│  ┌─────────────────┐   bridge mínimo   ┌─────────────────┐ │
│  │ Renderer        │◄─────────────────►│ Preload         │ │
│  │ HTML/CSS/JS     │                   │ API permitida   │ │
│  │ UI + domínio    │                   └────────┬────────┘ │
│  │ Supabase client │                            │ IPC       │
│  └────────┬────────┘                   ┌────────▼────────┐ │
│           │ HTTPS/JWT                  │ Main process    │ │
│           │                            │ SO, arquivos,   │ │
│           │                            │ câmera/worker   │ │
│           │                            └────────┬────────┘ │
└───────────┼─────────────────────────────────────┼───────────┘
            │                                     │
            ▼                                     ▼
┌──────────────────────────┐          ┌───────────────────────┐
│ Supabase                 │          │ Worker OCR local      │
│ Auth + Postgres + RLS    │          │ processo isolado      │
│ Edge Functions           │          │ contrato JSON         │
└──────────────────────────┘          └───────────────────────┘
```

## 3. Decisões principais

### 3.1 Aplicação online-first

O MVP depende de conexão com o Supabase para autenticação e operações de negócio.

Não haverá banco local sincronizável no MVP. O aplicativo poderá manter apenas:

- sessão protegida;
- preferências de interface;
- filtros recentes;
- fila transitória de telemetria/OCR quando houver interrupção curta, sem permitir criação silenciosa de registros de negócio offline.

A ausência de internet será tratada explicitamente na interface.

### 3.2 Electron

O Electron terá três áreas:

#### Main process

Responsável por:

- ciclo de vida da aplicação;
- criação das janelas;
- protocolo local seguro;
- permissões de câmera;
- escrita de arquivos exportados;
- impressão/PDF;
- armazenamento protegido de sessão;
- inicialização e supervisão do worker OCR;
- logs técnicos locais;
- atualização futura.

O main process não terá uma chave administrativa do Supabase.

#### Preload

Responsável por expor funções pequenas e específicas:

- sessão protegida: `get`, `set`, `remove`;
- seleção de arquivos ou diretórios;
- salvar exportação;
- impressão;
- informações seguras da aplicação;
- iniciar/parar OCR;
- receber eventos normalizados do OCR.

É proibido expor `ipcRenderer`, `fs`, `shell`, `child_process` ou objetos Electron inteiros.

#### Renderer

Responsável por:

- autenticação;
- navegação;
- componentes;
- validação de formulários;
- acesso normal ao Supabase com token do usuário;
- regras de apresentação;
- módulos de domínio;
- feedback de loading, erro e sucesso.

O renderer não acessará Node.js diretamente.

## 4. Frontend

### 4.1 Tecnologias

- HTML semântico;
- CSS com tokens;
- JavaScript em módulos;
- Web Components para componentes reutilizáveis;
- biblioteca de validação de schemas;
- biblioteca de gráficos compatível com JavaScript puro;
- cliente oficial do Supabase.

Não será adotado React, Vue ou outro framework no MVP sem novo ADR.

### 4.2 Organização

Cada funcionalidade será um módulo vertical:

```text
src/renderer/features/vehicles/
├─ api/
├─ components/
├─ pages/
├─ schemas/
├─ services/
├─ state/
└─ vehicles.routes.js
```

Código compartilhado ficará em:

- `src/renderer/components`;
- `src/renderer/services`;
- `src/renderer/styles`;
- `src/shared`.

### 4.3 Estado

Não haverá store global genérica no início.

O estado será dividido em:

- sessão e empresa atual;
- rota;
- filtros da página;
- estado local de componentes;
- cache de consulta pequeno e invalidado por módulo.

O Supabase permanece a fonte de verdade.

## 5. Backend e Supabase

O sistema não terá um servidor Node.js tradicional separado no MVP.

Serão usados:

- Supabase Auth;
- Postgres;
- RLS;
- funções SQL/RPC para operações transacionais;
- Edge Functions para operações administrativas ou secretas;
- Storage apenas quando houver necessidade aprovada de anexos ou imagens;
- Realtime apenas onde trouxer benefício claro.

### 5.1 Acesso direto sob RLS

CRUD normal poderá ser feito pelo renderer usando a chave publicável e a sessão do usuário.

Exemplos:

- listar veículos;
- consultar viagens;
- cadastrar abastecimento por RPC;
- consultar dashboard;
- listar movimentações.

### 5.2 Operações por RPC

Regras que precisam de atomicidade ficarão no banco.

Exemplos:

- concluir viagem e registrar quilometragem;
- registrar abastecimento e odômetro;
- concluir manutenção;
- registrar movimentação alternada;
- arquivar veículo;
- calcular indicadores por período.

### 5.3 Operações por Edge Function

Operações que exigem segredo ou privilégio administrativo:

- criar ou convidar usuário do Auth;
- bloquear ou remover acesso no Auth;
- tarefas administrativas;
- integração futura com serviços externos;
- ações que usem chaves secretas.

## 6. Banco e domínio

A estrutura definitiva será produzida por migrations.

Entidades principais:

- empresas;
- perfis;
- associação usuário-empresa;
- motoristas;
- veículos;
- eventos de odômetro;
- viagens;
- abastecimentos;
- manutenções;
- locais;
- câmeras;
- eventos de leitura de placa;
- movimentações;
- auditoria.

O modelo detalhado está em `DATABASE_BLUEPRINT.md`.

## 7. Multiempresa

No MVP, cada usuário pertence a exatamente uma empresa ativa.

Será usada uma tabela de associação, mesmo com cardinalidade 1:1 no MVP, para:

- separar identidade de autenticação e vínculo empresarial;
- permitir evolução futura;
- centralizar papel, status e empresa;
- simplificar policies.

Toda tabela de negócio terá `company_id`, mesmo quando ele puder ser derivado pelo veículo. Essa redundância controlada existe para:

- tornar RLS direta;
- melhorar índices;
- evitar joins ambíguos;
- validar que todos os relacionamentos pertencem à mesma empresa.

Constraints e triggers verificarão consistência.

## 8. Quilometragem

A quilometragem será controlada por um ledger imutável chamado `vehicle_odometer_events`.

Fontes possíveis:

- cadastro inicial;
- fim de viagem;
- abastecimento;
- manutenção;
- ajuste manual autorizado.

O veículo poderá armazenar `current_odometer_km` como valor derivado/cache, atualizado somente pela função transacional de odômetro.

Benefícios:

- histórico completo;
- prevenção de regressão;
- auditoria;
- correção controlada;
- rastreabilidade da origem.

Não será permitido atualizar a quilometragem diretamente por CRUD comum.

## 9. Movimentações

A movimentação de entrada e saída será registrada exclusivamente por função transacional.

Fluxo:

1. localizar o veículo na empresa;
2. bloquear o estado necessário para concorrência;
3. consultar a última movimentação;
4. determinar Entrada ou Saída;
5. aplicar janela de deduplicação;
6. registrar o evento;
7. devolver o novo estado do veículo;
8. emitir resultado para UI.

A primeira movimentação será Entrada. Depois haverá alternância obrigatória.

## 10. Reconhecimento de placas

O OCR será desacoplado do domínio.

### 10.1 Pipeline

```text
Câmera → Frame → Detecção da placa → OCR → Normalização
→ confiança → deduplicação → correspondência → RPC de movimentação
```

### 10.2 Componentes

- captura de câmera no renderer com permissão controlada;
- worker local isolado;
- contrato JSON versionado;
- adaptador do motor OCR;
- serviço de deduplicação;
- gravação de evento de leitura;
- RPC de movimentação.

### 10.3 Decisão do motor

A escolha final do motor OCR será confirmada por uma prova de conceito com imagens próprias e autorizadas.

A arquitetura aceita trocar o motor sem alterar veículos ou movimentações.

## 11. Dashboard e relatórios

Consultas agregadas usarão:

- views com segurança de invocador quando apropriado;
- funções SQL com filtros;
- índices por `company_id`, data e entidade;
- paginação;
- intervalos de tempo explícitos.

Cálculos financeiros não usarão ponto flutuante.

## 12. Logs e auditoria

### Logs técnicos

- ficam no dispositivo;
- possuem níveis;
- não registram tokens, senhas ou chaves;
- não registram imagens;
- usam correlação por `request_id`.

### Auditoria de negócio

- fica no Postgres;
- registra empresa, ator, entidade, ação, data e campos alterados;
- é append-only para usuários normais;
- não copia segredos.

## 13. Erros

Cada erro terá:

- código estável;
- mensagem segura para o usuário;
- detalhes técnicos somente nos logs;
- `request_id`;
- contexto mínimo.

Categorias:

- autenticação;
- autorização;
- validação;
- conflito;
- indisponibilidade;
- integração;
- desconhecido.

## 14. Build e distribuição

- Electron Forge;
- instalador Windows;
- pacote ASAR;
- fuses de segurança avaliados;
- assinatura de código antes de distribuição comercial;
- ambientes local, homologação e produção;
- variáveis públicas separadas por ambiente;
- nenhum segredo no pacote.

## 15. Fora do MVP

- funcionamento offline completo;
- rastreamento GPS;
- acesso de motoristas;
- aplicativo mobile;
- manutenção de estoque de peças;
- roteirização;
- telemetria veicular;
- faturamento e cobrança SaaS;
- múltiplas empresas por usuário;
- reconhecimento em nuvem obrigatório.
