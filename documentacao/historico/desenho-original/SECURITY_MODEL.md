> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Modelo de Segurança

## 1. Objetivos

1. Uma empresa nunca acessa dados de outra.
2. Um usuário só executa ações permitidas pelo seu papel.
3. O Electron não expõe privilégios do sistema operacional ao renderer.
4. Chaves administrativas não são distribuídas.
5. Regras críticas são validadas no banco.
6. Toda ação relevante pode ser auditada.

## 2. Ameaças principais

| Ameaça | Exemplo | Controle |
|---|---|---|
| Quebra de tenant | alterar `company_id` no request | RLS + constraints + funções |
| Escalada de privilégio | gestor se torna admin | Edge Function + checagem de papel |
| Roubo de segredo | service role no pacote | segredo apenas em ambiente servidor |
| XSS no renderer | conteúdo malicioso executa JS | CSP, sem HTML inseguro, isolamento |
| Abuso de IPC | renderer solicita arquivo arbitrário | canais mínimos, validação e sender |
| Sessão roubada | token em arquivo simples | `safeStorage` e limpeza de sessão |
| Concorrência | duas leituras criam duas entradas | transação e lock |
| Injeção | filtros usados em SQL dinâmico | SDK parametrizado e funções seguras |
| Vazamento por logs | token ou imagem gravada | redaction e política de logs |
| Dependência comprometida | pacote malicioso | lockfile, auditoria e atualização |

## 3. Confiança por componente

### Renderer

Tratado como ambiente não confiável para autorização.

Pode:

- apresentar UI;
- coletar entrada;
- chamar Supabase com JWT;
- solicitar operações limitadas ao preload.

Não pode:

- decidir autorização;
- escolher livremente a empresa de destino;
- acessar sistema de arquivos;
- iniciar processos;
- obter chaves secretas.

### Preload

Camada de capacidade mínima.

Cada método deve:

- possuir nome específico;
- validar argumentos;
- limitar tamanho;
- usar allowlist;
- retornar dados serializáveis;
- não expor APIs genéricas.

### Main

Confiável para capacidades locais, mas não é autoridade empresarial.

Deve:

- validar origem/sender de IPC;
- bloquear navegação;
- bloquear novas janelas;
- controlar permissões;
- não manter service role;
- limitar caminhos de exportação;
- supervisionar worker.

### Supabase

Autoridade de autenticação e autorização de dados.

- Auth identifica o usuário.
- RLS autoriza linhas.
- RPCs protegem transações.
- Edge Functions protegem segredos.
- Audit log registra ações.

## 4. Sessão

A sessão do Supabase será armazenada por adapter customizado.

Fluxo:

1. Supabase client pede `getItem/setItem/removeItem`.
2. Renderer chama API mínima do preload.
3. Main criptografa com `safeStorage`.
4. Dados criptografados ficam em arquivo no diretório da aplicação.
5. Logout remove a sessão.
6. Erro de descriptografia força novo login.

Nunca registrar tokens em logs.

## 5. RLS

### 5.1 Princípio

Toda tabela exposta ao cliente terá RLS habilitada e policies explícitas.

Nenhuma policy confiará apenas em `company_id` enviado.

### 5.2 Funções internas

Funções no schema privado poderão resolver:

- usuário atual;
- membership ativa;
- empresa atual;
- papel;
- permissão.

Requisitos para funções privilegiadas:

- `search_path` fixo;
- execução revogada de `public`;
- grants mínimos;
- parâmetros validados;
- testes;
- documentação.

### 5.3 Operações

Policies separadas para:

- SELECT;
- INSERT;
- UPDATE;
- DELETE.

Arquivamento substituirá DELETE em entidades históricas.

## 6. Papéis

Papéis iniciais:

| Papel | Escopo |
|---|---|
| `company_admin` | empresa, usuários, toda a frota e relatórios |
| `fleet_manager` | frota e operação; sem gestão crítica da empresa |
| `operator` | registros operacionais e OCR; leitura limitada |
| `viewer` | consulta e relatórios autorizados |

Permissões específicas serão verificadas por ação.

## 7. Usuário inativo

Haverá dois estados:

- perfil ativo;
- membership ativa.

Toda policy de negócio exigirá ambos ativos.

Ao desativar:

1. membership fica inativa;
2. RLS bloqueia novas operações imediatamente;
3. Edge Function pode bloquear/revogar acesso no Auth;
4. aplicativo encerra a sessão na próxima verificação;
5. auditoria registra a ação.

## 8. Segurança do Electron

Configuração obrigatória:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- sandbox habilitado;
- `webSecurity: true`;
- CSP restritiva;
- protocolo local seguro;
- navegação externa bloqueada;
- `window.open` bloqueado ou permitido por allowlist;
- `shell.openExternal` somente para URL HTTPS validada;
- sender de IPC validado;
- permissões negadas por padrão;
- câmera permitida apenas para a origem local da aplicação;
- sem `<webview>` no MVP.

## 9. Câmera e OCR

- autorização explícita;
- nenhuma captura silenciosa;
- indicação visual de câmera ativa;
- frames mantidos em memória sempre que possível;
- persistência de imagem desabilitada por padrão;
- retenção configurável quando realmente necessária;
- hash/evento em vez de imagem completa para auditoria padrão;
- dados do OCR tratados como entrada não confiável;
- limite de taxa;
- timeout do worker;
- reinício controlado;
- contrato versionado.

## 10. Edge Functions

Usadas somente quando necessário.

Cada função deve:

- validar JWT;
- validar membership e papel;
- validar payload;
- usar segredo por variável de ambiente;
- nunca devolver segredo;
- ter rate limit ou proteção equivalente;
- emitir audit event;
- ser idempotente quando possível.

## 11. Arquivos e exportações

- usuário escolhe destino por diálogo nativo;
- aplicação não aceita caminho arbitrário do renderer;
- nome é sanitizado;
- extensão é allowlisted;
- dados já devem estar autorizados via RLS;
- arquivos temporários são removidos;
- exportação registra auditoria quando contiver dados sensíveis.

## 12. Cadeia de fornecimento

- versões fixadas por lockfile;
- dependências mínimas;
- análise de vulnerabilidades;
- Electron atualizado regularmente;
- revisão de pacotes nativos;
- build reproduzível;
- assinatura de código;
- verificação de segredos antes do release.

## 13. Testes de segurança

Obrigatórios:

- usuário A tenta ler B;
- usuário A tenta inserir em B;
- alteração de `company_id`;
- usuário inativo;
- papel insuficiente;
- bypass por RPC;
- bypass por view;
- função privilegiada;
- payload IPC inválido;
- sender IPC inválido;
- URL externa inválida;
- sessão corrompida;
- leitura OCR repetida;
- concorrência de movimentação;
- busca de segredos no pacote.
