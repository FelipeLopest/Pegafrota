> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota — correções para instalação limpa

Este pacote foi preparado para subir em um projeto Supabase novo sem depender do banco anterior.
As migrations históricas foram preservadas; as correções de comportamento entram em uma migration nova, para manter a evolução do schema auditável.

## Principais correções

- **Seed remoto reproduzível:** `pg` passou a ser dependência declarada e `supabase/seed.sql` faz UPSERT de `public.profiles`, permitindo reaplicar o seed quando as contas Auth já existem.
- **Bootstrap do primeiro administrador:** novo `npm run platform:bootstrap` cria/garante a conta Auth, sincroniza o profile e consome um token efêmero sem credencial fixa em migration ou seed.
- **Substituição segura de administrador global:** nova RPC `platform.replace_platform_admin(...)`, exposta pela ação crítica `admin.replace`, ativa o substituto antes de remover o papel anterior.
- **CLI de substituição:** `npm run platform:replace` automatiza criação/sincronização da nova conta e a troca transacional; a exclusão da identidade antiga é opcional.
- **Histórico sem bloquear a identidade:** `platform.operations.actor_user_id` aceita `NULL` e usa `ON DELETE SET NULL`.
- **Auditoria imutável preservada:** `platform.audit_events.actor_user_id` guarda o UUID histórico sem FK, evitando que uma exclusão tente reescrever uma trilha append-only.
- **Papel global acompanha a conta:** `platform.admins.user_id` usa `ON DELETE CASCADE`; a proteção do último administrador ativo continua sendo aplicada pelo trigger existente.
- **Smoke test real incluído:** `supabase/tests/smoke.sql` agora existe e valida invariantes essenciais do banco.
- **pgTAP adicional:** `supabase/tests/database/15_clean_install_fixes.sql` cobre troca de administrador, exclusão da identidade anterior e proteção do último administrador.
- **Edge unit test no gate:** a suíte unitária de `admin-users` agora pode ser executada por `npm run test:edge:unit` e faz parte do gate principal.
- **Documentação sincronizada:** instalação, deploy, MFA/recovery, schema, seed e estrutura do repositório foram atualizados para refletir o código atual.

## Fluxo recomendado em projeto Supabase novo

1. Instale dependências com `npm ci`.
2. Faça `npx supabase link --project-ref <novo-ref>`.
3. Aplique migrations com `npx supabase db push`.
4. Rode os self-tests e `supabase/tests/smoke.sql` conforme `COMO_SUBIR_O_SISTEMA.md`.
5. Configure e faça deploy das Edge Functions.
6. Crie o primeiro administrador com `npm run platform:bootstrap`.
7. Se desejar dados de demonstração, use `npm run seed:remote` e valide com `npm run seed:verify`.
8. Gere os builds somente depois de preencher as variáveis do novo projeto.

## Política de exclusão de administradores

A conta que executou operações históricas agora pode ser excluída sem apagar ou atribuir falsamente suas ações a outra pessoa. O histórico é preservado. Ao mesmo tempo, o banco continua impedindo a remoção do **último** `platform_admin` ativo e do **último** `company_admin` ativo de uma empresa.

## Validações executadas neste pacote

- lint: PASS
- scanner de segredos: PASS
- zero CDN: PASS
- fronteiras entre produtos: PASS
- segurança Electron: 35/35 PASS
- contratos Desktop ↔ banco: PASS
- consistência de configuração: 7/7 PASS
- Edge `admin-users`: 50/50 PASS
- testes unitários do monorepo: 57/57 PASS
- build Admin Web: PASS
- build Desktop: PASS (sem `config.json`, porque o pacote não inclui credenciais do novo Supabase)
- consistência `package.json`/`package-lock.json` em modo offline: PASS

Os testes pgTAP não puderam ser executados neste ambiente porque `psql` não está instalado. Eles permanecem no repositório para execução local/CI contra PostgreSQL/Supabase.

## Segurança

Não grave `SUPABASE_SERVICE_ROLE_KEY`, senhas de administrador nem tokens de bootstrap no `.env` usado pelos aplicativos, no Git ou no seed. Os scripts operacionais usam essas credenciais apenas no terminal do operador.

## Correção adicional — Auth identities em GoTrue atual

O schema hospedado atual do Supabase define `auth.identities.email` como coluna
`GENERATED ALWAYS`, derivada de `identity_data`. O seed anterior tentava informar
`email` explicitamente ao criar identities no fallback local, o que provocava:

`cannot insert a non-DEFAULT value into column "email"`

`supabase/seed.sql` agora omite essa coluna e deixa o PostgreSQL calculá-la.
Em projetos remotos, as identities criadas pela Admin API continuam sendo
reaproveitadas normalmente.
