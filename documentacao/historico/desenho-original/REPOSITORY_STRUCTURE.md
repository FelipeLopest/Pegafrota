> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Estrutura do Repositório

Estrutura atual do monorepo PegaNaFrota.

```text
PegaNaFrota/
├─ apps/
│  ├─ company-desktop/          # Electron das empresas
│  └─ platform-admin-web/       # painel global web
├─ packages/
│  ├─ contracts/                # vocabulários, permissões e erros
│  └─ validation/               # validação de entrada
├─ supabase/
│  ├─ migrations/               # histórico versionado do PostgreSQL
│  ├─ functions/
│  │  ├─ admin-users/           # administração tenant
│  │  └─ platform-admin/        # administração global
│  ├─ tests/
│  │  ├─ database/              # pgTAP
│  │  └─ smoke.sql              # smoke pós-deploy
│  ├─ seed.sql                  # dados demo determinísticos
│  └─ config.toml
├─ scripts/
│  ├─ lib/supabase-admin.mjs    # helper de rotinas privilegiadas
│  ├─ bootstrap-platform-admin.mjs
│  ├─ replace-platform-admin.mjs
│  ├─ seed-demo-remote.mjs
│  ├─ verify-seed.mjs
│  ├─ pg-harness/
│  └─ verificações/builds/testes
├─ docs/
├─ package.json
├─ package-lock.json
├─ .env.example
├─ COMO_SUBIR_O_SISTEMA.md
└─ README.md
```

## Regras

- `company-desktop` e `platform-admin-web` são produtos separados.
- o navegador nunca recebe `service_role`;
- `public` contém a API tenant; `platform` contém a camada global privilegiada;
- `private` e `audit` não são schemas de API;
- migrations publicadas não devem ter comportamento reescrito: correções
  funcionais entram em nova migration;
- scripts administrativos não entram no bundle final;
- seed de demonstração não cria `platform_admin`;
- o primeiro admin global é provisionado por `npm run platform:bootstrap`;
- rotação de admin global usa `npm run platform:replace`, sem editar FKs ou
  autoria histórica manualmente.
