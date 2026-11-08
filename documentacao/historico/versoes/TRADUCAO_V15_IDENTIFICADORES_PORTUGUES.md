> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota v15 — identificadores internos em português

A v15 é uma refatoração **sem mudança de comportamento**. O objetivo foi tornar o código interno mais fácil de manter em português sem tocar nos contratos que conectam o sistema ao Supabase, PostgreSQL, Electron, navegador ou serviços externos.

## Escopo

Foram traduzidos milhares de identificadores internos em:

- Electron (processo principal, preload, renderer, telas e camada de dados);
- Painel administrativo web;
- pacotes `contracts` e `validation`;
- Edge Functions `platform-admin` e `admin-users`;
- scripts de build, seed, deploy, diagnóstico e verificação;
- testes automatizados.

Exemplos:

```js
// antes
const result = await loadConfig();
const vehicles = await data.vehicles.list();
function renderDashboard() {}

// v15
const resultado = await carregarConfiguracao();
const veiculos = await dados.vehicles.list();
function telaPainel() {}
```

## O que permaneceu em inglês de propósito

Não foram traduzidos nomes que são **contratos externos** ou identificadores definidos por outra tecnologia. Exemplos:

- `auth.users`, `company_memberships`, `vehicle_id`, `created_at`;
- nomes de RPCs como `yard_snapshot` e `company_members`;
- propriedades JSON como `access_token`, `refresh_token`, `full_name`;
- variáveis de ambiente como `SUPABASE_URL` e `PNF_SUPABASE_ANON_KEY`;
- headers como `Authorization` e `Content-Type`;
- APIs como `fetch`, `addEventListener`, `document`, `localStorage`;
- valores persistidos como `company_admin`, `in_progress`, `available`;
- abreviações/termos universais como `id`, `URL`, `API`, `SQL`, `HTML`, `CSS`, `SVG`, `UUID` e `JWT`.

Essa separação é intencional: o código interno fica em português, mas os contratos externos continuam byte a byte compatíveis.

## Garantia de comportamento

Além dos testes normais, foi feita uma comparação entre v14 e v15 das strings literais do código de produção. Elas permaneceram idênticas, o que protege rotas, RPCs, nomes de campos, códigos de erro, headers e valores persistidos contra tradução acidental.

Também foi confirmado que:

- nenhuma migration SQL foi alterada;
- `supabase/seed.sql` não foi alterado;
- `supabase/config.toml` não foi alterado;
- os contratos Desktop ↔ banco continuam válidos.

## Validação

- testes unitários: **89/89**;
- Edge Function `admin-users`: **55/55**;
- Admin smoke: **31/31**;
- Electron security: **35/35**;
- lint: **PASS**;
- contratos: **PASS**;
- builds Admin e Desktop: **PASS**;
- scanner de segredos: **PASS**.

O smoke real do Electron não pôde ser executado neste ambiente porque o pacote Electron não está instalado, mas o build do Desktop e todas as 35 invariantes de segurança passaram.
