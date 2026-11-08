> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Solução de problemas

Problemas com evidência no repositório — código, testes ou registros de
correção. Cada entrada traz sintoma, causa e correção.

---

## 1. Como diagnosticar

Antes de investigar, colete três coisas:

1. **A dica do erro (`hint`).** Toda falha de backend carrega um código estável.
   O texto pode mudar; o código não.
2. **Onde acontece.** Desktop, Admin Web, banco ou Edge Function.
3. **Se já funcionou.** Regressão aponta para build, deploy ou configuração;
   nunca funcionou aponta para configuração ou permissão.

### Ferramentas por camada

| Camada | Comando |
|---|---|
| Banco | `select * from private.security_selftest();` e `private.data_integrity_selftest();` |
| Banco (completo) | `psql "$DATABASE_URL" -f supabase/tests/smoke.sql` |
| Contratos | `npm run test:contracts` |
| Configuração | `npm run test:config` |
| Segredos e fronteiras | `npm run verify:secrets`, `verify:boundaries` |
| Electron | `npm run verify:electron` |
| Desktop | tela "Configuração ausente" lista os caminhos consultados |
| Edge Function | logs no painel do Supabase, correlacionados por `x-request-id` |
| Tudo | `npm run gate` + `artifacts/test-results/<etapa>.log` |

---

## 2. Desktop não abre ou não conecta

### `window.pnf` é `undefined` — *"Cannot read properties of undefined (reading 'getConfigStatus')"*

**Causa:** o preload roda com `sandbox: true`. Nesse modo o Electron **não
permite** carregar módulos CommonJS locais com `require()`. Uma otimização passou
a carregar `./ipc-channels.cjs` no preload; ele falhava antes de executar
`contextBridge.exposeInMainWorld('pnf', …)`.

**Correção:** `sandbox: true` foi mantido, o `require()` local removido e os
canais declarados diretamente no preload. Os nomes ficam **duplicados de
propósito** entre `preload.cjs` e `ipc-channels.cjs`.

```bash
npm run verify:electron   # confere o sincronismo dos canais
npm run build:desktop && npm run desktop
```

**Nunca** reintroduza `require()` local no preload — o build falha, por regra
própria.

### Tela "Configuração ausente"

O Desktop não encontrou `PNF_SUPABASE_URL` e/ou `PNF_SUPABASE_ANON_KEY`.

A tela lista **exatamente quais faltam** e **todos os caminhos consultados**.

| Ambiente | Correção |
|---|---|
| Desenvolvimento | copie `.env.example` para `.env`, preencha e rode `npm run build:desktop` |
| Produção | edite `config.json` na pasta de dados do aplicativo |

Se a URL existe mas é inválida, a tela diz isso separadamente. Use a forma
completa com esquema: `https://<ref>.supabase.co`.

### "A ponte segura do Electron não foi carregada"

`dist/` está desatualizado ou incompleto.

```bash
npm run build:desktop && npm run desktop
```

### Electron encerra com erro de sandbox em contêiner

```bash
npm run desktop -- --no-sandbox
```

### "O binário do Electron não foi baixado"

```bash
npm rebuild electron
# ou: apague node_modules e rode npm ci
```

---

## 3. Admin Web

### Preso em "Carregando…"

**Causa:** import nomeado que não existe no módulo. Módulos ES validam exports
**antes** de executar — o bootstrap nem chega ao tratamento de erro.

Aconteceu de verdade quando a tradução de identificadores deixou três imports com
nomes antigos: `newIdempotencyKey`, `formatCnpj`, `passwordStrength`.

**Correções aplicadas:** `boot-guard.js` transforma falha de carregamento em
mensagem útil, e `build:admin` passou a **validar imports nomeados** contra os
exports reais.

```bash
npm run build:admin   # falha listando o import quebrado
```

Depois de republicar, force `Ctrl+Shift+R` no navegador.

### "Sem acesso ao painel" / `NOT_PLATFORM_ADMIN`

A conta autenticou, mas não é administrador **ativo** da plataforma. Verifique
os dois eixos:

```sql
select p.active, a.status
from public.profiles p
left join platform.admins a on a.user_id = p.id
where p.id = '<uuid>';
```

Ambos precisam estar ativos. Se não houver nenhum administrador global, use
`npm run platform:bootstrap`; se houver outro, use `npm run platform:replace`.

### Ação administrativa não conclui

Verifique, nesta ordem: mensagem da Edge Function → papel global ativo →
confirmação do modal (nome digitado precisa conferir) → registro na auditoria
global, que grava **inclusive as negativas**.

---

## 4. Conectividade

### Banner "Conexão com o servidor indisponível" com internet funcionando

**Causa histórica:** `navigator.onLine`. Esse sinal gera falso positivo em VPN,
DNS corporativo, adaptadores virtuais e após *wake* do Windows.

**Correção:** `navigator.onLine` foi abandonado. O estado agora vem de uma
sondagem de `/auth/v1/health`:

- qualquer resposta HTTP — **inclusive 401, 403 ou 500** — prova conectividade;
- só falha de transporte conta;
- **duas** falhas consecutivas são necessárias para exibir o aviso;
- `AbortError` não conta;
- o estado é revalidado ao montar a interface, para não deixar banner antigo
  preso.

Se o banner ainda aparecer, o servidor está de fato inalcançável. Confirme:

```bash
curl -s -o /dev/null -w "%{http_code}" "$PNF_SUPABASE_URL/auth/v1/health"
```

O aviso é **informativo** e não bloqueia ações.

---

## 5. Banco de dados

### `supabase link` falha antes de pedir senha

CLI desatualizado.

```bash
npx supabase --version
npx supabase@latest link --project-ref <REF>
```

Use `--debug` se necessário — **sem compartilhar tokens**.

### Autotestes retornam linhas

`security_selftest()` e `data_integrity_selftest()` devolvem **uma linha por
problema**. Resultado não vazio significa desvio real: cada linha identifica o
objeto e a natureza do problema. Migrations não aplicadas ou alteração manual
pelo painel são as causas mais comuns.

Nunca corrija editando pelo painel. A correção é uma migration nova.

### `PGRST202` / "O aplicativo está mais novo que o banco"

O cliente chama uma RPC que ainda não existe. O erro é traduzido para
`BACKEND_SCHEMA_OUTDATED` com mensagem específica em vez de um erro genérico.

```bash
npx supabase db push
npm run test:contracts
```

A migration `20260808000300` força o PostgREST a recarregar as assinaturas.

### `ODOMETER_REGRESSION`

A quilometragem informada é menor que a registrada. **Não é bug.**

Caminhos legítimos: corrigir o valor informado, ou registrar um **ajuste manual**
(`odometer.adjust`) com justificativa. Erro em evento já gravado se corrige com
**evento de correção** (`correction_of_id`), nunca com `UPDATE`.

### `CONFLICT_RETRY` em movimentação

Duas transações tentaram movimentar o mesmo veículo simultaneamente. Uma perdeu a
corrida no índice único. **Comportamento correto** — a alternância foi
preservada. A interface deve repetir a operação.

### `USE_RPC` / `IMMUTABLE_RECORD` / `APPEND_ONLY_TABLE`

Tentativa de escrita direta em recurso transacional. Use a RPC correspondente.
Se não existe RPC para o que você precisa, isso é uma lacuna de produto — não um
caso de conceder grant.

### Seed remoto não conecta

Verifique `DATABASE_URL`, SSL e se `pg` foi instalado por `npm ci` (é dependência
declarada).

### Seed não faz nada

O seed é **idempotente**: se já existem empresas, ele não faz nada e emite um
aviso. Para recriar só os dados demo, preservando contas Auth:

```bash
npm run seed:remote -- --reset
```

---

## 6. Identidade e acesso

### `AUTH_NO_ACTIVE_MEMBERSHIP` — tela "Sem empresa vinculada"

A conta está ativa, mas não há vínculo ativo. **Três** estados precisam estar
ativos:

```sql
select p.active as perfil, m.active as vinculo, c.status as empresa
from public.profiles p
left join public.company_memberships m on m.user_id = p.id
left join public.companies c on c.id = m.company_id
where p.id = '<uuid>';
```

Se a **empresa** estiver suspensa ou arquivada, **todos** os usuários perdem
acesso — sem que nenhum vínculo tenha sido alterado. É o comportamento
projetado.

### `LAST_ADMIN_PROTECTED` / `LAST_PLATFORM_ADMIN_PROTECTED`

A operação deixaria a empresa ou a plataforma sem administrador ativo. Promova
outro usuário antes.

### `USER_ALREADY_LINKED`

O e-mail já tem vínculo ativo com uma empresa. Um usuário, uma empresa.

### `PROFILE_GLOBALLY_INACTIVE`

A conta foi suspensa **na plataforma**. A empresa não pode reativá-la — os dois
eixos são independentes. Só o Admin Web desbloqueia.

### `auth_email_conflict` no provisionamento

O e-mail já tem conta no Supabase Auth. A recusa é **deliberada**: sobrescrever
redefiniria silenciosamente a senha de alguém. Use outro e-mail ou trate a conta
existente separadamente.

### Exclusão de administrador antigo falha

A conta ainda é o último `company_admin` de alguma empresa. Transfira o vínculo
primeiro. O script **não** falsifica o histórico trocando autores antigos pelo
novo usuário.

---

## 7. Convites

### O convite não chega

Verifique nesta ordem:

1. `INVITE_DELIVERY` — se for `log`, **nada é enviado**; o link fica no log da
   função;
2. `SMTP_RELAY_URL` e `SMTP_RELAY_TOKEN` configurados;
3. logs da Edge Function — falha de entrega devolve `invite_delivery_failed`
   (502), não sucesso silencioso.

### O convite abre na origem errada, sem token

**Causa:** o GoTrue **recusa silenciosamente** um `redirectTo` fora de
`additional_redirect_urls` e manda a pessoa para `site_url` — sem o token na
query. A tela abre sem saber o que fazer, e o erro parece ser do link.

**Correção:** `INVITE_BASE_URL` precisa estar nas Redirect URLs do Auth, junto
com `<origem>/**`.

```bash
npm run test:config    # falha o build quando não está
```

### `RESEND_TOO_SOON` (429)

Reenvio antes de `RESEND_COOLDOWN_SECONDS` (default 300). O cabeçalho
`Retry-After` traz o tempo restante.

---

## 8. CORS

### `ORIGIN_NOT_ALLOWED` no Desktop, ao gerir a equipe

**`ADMIN_USERS_ALLOWED_ORIGINS` precisa incluir `null`.** O renderer `file://`
do Electron envia `Origin: null`.

```bash
npx supabase secrets set ADMIN_USERS_ALLOWED_ORIGINS="null,app://peganafrota,http://localhost:5173,http://127.0.0.1:5173"
```

### CORS no Admin Web

A origem publicada precisa estar em `ADMIN_WEB_ORIGINS`. A função responde com a
primeira origem da lista quando a recebida não está autorizada — o que aparece
como bloqueio de CORS no navegador.

---

## 9. Build

### `build FAIL — defina PNF_SUPABASE_URL e PNF_SUPABASE_ANON_KEY`

`.env` ausente ou com valores de exemplo (`cole-aqui-a-anon-key`).

### `script remoto` / `link remoto` / `@import remoto`

Foi introduzida uma referência a CDN. Traga a dependência para o repositório —
[ADR-013](DECISOES_ATUAIS.md#decisao-013--build-proprio-sem-bundler-e-sem-cdn).

### `menção a service_role em código`

A string apareceu em código do cliente. **Isso é intencionalmente fatal.**
Verifique se não é apenas um comentário mal posicionado — a checagem remove
comentários antes de testar.

### `import de pacote não resolvido`

Um `@peganafrota/*` sobreviveu à reescrita. Normalmente é um subcaminho novo que
o build não conhece — ver `build.mjs`, seção de reescrita.

### `X não é exportado por Y`

Import nomeado inexistente. É a verificação que evita o Admin Web preso em
"Carregando…".

### `require local incompatível com sandbox:true`

Ver §2.

### `marcador de build não substituído`

`__CSP__` ou `__CONFIG__` sobreviveu. O HTML foi alterado de forma que o build
não reconhece.

---

## 10. Testes

### Etapa do gate marcada como `N/E`

**Não é falha.** Significa que o ambiente não permite executar — sem PostgreSQL,
sem `pg_prove`, sem Chromium. A distinção é deliberada: uma etapa não executada
nunca é reportada como aprovada.

O motivo aparece na linha seguinte e no log em `artifacts/test-results/`.

### `db:test` não roda

```bash
psql --version
pg_prove --version
pg_isready -h 127.0.0.1 -p 5433
```

Faltando qualquer um, o script sai com código 2 (N/E).

### `test:contracts` falha

O cliente chama uma RPC que não existe ou tem assinatura diferente. Aplique as
migrations pendentes ou corrija a chamada.

---

## 11. Comportamentos que **não** são defeitos

| Sintoma | Explicação |
|---|---|
| Botão desabilitado com tooltip de permissão | projetado. Ocultar esconderia que a função existe |
| Movimentação repetida devolve `deduplicated: true` | janela de deduplicação funcionando |
| Cancelar viagem apaga km e datas reais | o registro não pode parecer executado |
| Arquivar veículo não apaga nada | arquivamento, não exclusão |
| Log de histórico não existe no Desktop | a **tela** foi removida; a auditoria continua sendo gravada |
| Admin Web não mostra veículos | por construção: sem acesso a dados operacionais |
| Sessão perdida ao reabrir o Desktop | chaveiro indisponível; o aviso explica |
| Aviso "Suas permissões foram atualizadas" | revalidação no `focus` detectou mudança |
| Seed não recria dados | idempotente por construção |

---

## 12. Registros de correção preservados

Documentos originais mantidos em `docs/` e na raiz, com o histórico detalhado:

| Assunto | Arquivo |
|---|---|
| Preload e `sandbox` | `../historico/versoes/CORRECAO_V16_1_PRELOAD_ELECTRON.md` |
| Admin preso em "Carregando…" | `../historico/versoes/CORRECAO_V16_2_ADMIN_CARREGANDO.md` |
| Conectividade (Admin) | `../historico/versoes/CORRECAO_V16_3_CONECTIVIDADE_ADMIN.md` |
| Senha direta no provisionamento | `../historico/versoes/CORRECAO_V16_4_ADMIN_SENHA_DIRETA.md` |
| Conectividade sem falso positivo | `../historico/versoes/CORRECAO_CONECTIVIDADE_V16_5.md` |
| Performance e conectividade | `../historico/versoes/CORRECAO_V16_6_PERFORMANCE_CONECTIVIDADE.md` |
| Instalação limpa | `CORRECOES_INSTALACAO_LIMPA.md` |
| Remoção de MFA | `../historico/versoes/CORRECAO_V6_SEM_MFA.md`, `../historico/versoes/MFA_RECOVERY.md` |
| Correções de banco por auditoria | cabeçalhos das migrations `20260731*` |
| Última rodada de mudanças | `MUDANCAS.md` |
