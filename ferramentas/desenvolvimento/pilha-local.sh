#!/usr/bin/env bash
# =============================================================================
# Stack de desenvolvimento: PostgreSQL + PostgREST reais
# =============================================================================
# Por que este script existe:
#   O Supabase hospedado é PostgreSQL + PostgREST + GoTrue + Kong. Sem Docker,
#   os dois primeiros — que são onde vivem TODOS os achados bloqueantes de
#   contrato — rodam nativamente. É a diferença entre "o SQL funciona no psql" e
#   "o cliente HTTP consegue chamar", que foi exatamente o que faltou na
#   Rodada 2.
#
# O que é real aqui:
#   - PostgreSQL 16 com as 43 migrations e o seed;
#   - PostgREST 12 resolvendo assinaturas de RPC por NOME de argumento;
#   - JWT HS256 verificado pelo PostgREST;
#   - RLS aplicada com o papel `authenticated`.
#
# O que NÃO é real, e está registrado como tal:
#   - GoTrue. Os binários de release não estão publicados para download direto.
#     Os JWTs de teste são emitidos por `ferramentas/desenvolvimento/token-local.mjs` com o MESMO
#     segredo e as MESMAS claims que a GoTrue emitiria (`sub`, `role`, `aal`).
#     Para o PostgREST e para a RLS o token é indistinguível; o que não se
#     exercita é o cadastro de senha e os fluxos próprios da GoTrue.
#
# Uso:
#   bash ferramentas/desenvolvimento/pilha-local.sh up      # sobe banco + PostgREST
#   bash ferramentas/desenvolvimento/pilha-local.sh down
#   bash ferramentas/desenvolvimento/pilha-local.sh status
# =============================================================================
set -uo pipefail

export PATH="$PATH:/usr/lib/postgresql/16/bin"
PGDATA=/var/lib/pgclaude/data
PGRUN=/var/lib/pgclaude/run
export PGHOST=127.0.0.1 PGPORT=5433 PGUSER=postgres
BANCO="${PNF_DEV_DB:-pnf_dev}"
PGRST_PORT="${PGRST_PORT:-3001}"
PORTA_GATEWAY="${PNF_GATEWAY_PORT:-54321}"
ARQUIVO_CONFIGURACAO_POSTGREST=/tmp/pnf-postgrest.conf
ARQUIVO_LOG_POSTGREST=/tmp/pnf-postgrest.log

# Segredo de DESENVOLVIMENTO. Precisa de 32+ caracteres para HS256 no PostgREST.
# Em produção vem do projeto Supabase e nunca é versionado.
SEGREDO_JWT="${PNF_DEV_JWT_SECRET:-pnf-desenvolvimento-segredo-local-0123456789}"

iniciar_postgres() {
  if ! pg_isready -q -h "$PGHOST" -p "$PGPORT" 2>/dev/null; then
    su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA \
      -o \"-k $PGRUN -p $PGPORT -c listen_addresses=127.0.0.1\" \
      -l /var/lib/pgclaude/pg.log start" >/dev/null 2>&1
    for tentativa in $(seq 1 30); do pg_isready -q -h "$PGHOST" -p "$PGPORT" && break; sleep 0.5; done
  fi
  pg_isready -h "$PGHOST" -p "$PGPORT" || return 1
}

preparar_banco() {
  psql -q -d postgres -c "drop database if exists $BANCO with (force);" -c "create database $BANCO;" >/dev/null
  psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f ferramentas/testes/banco-local/preparar-ambiente.sql >/dev/null || return 1
  for arquivo_migracao in supabase/migrations/*.sql; do
    psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f "$arquivo_migracao" >/dev/null || { echo "falha em $arquivo_migracao"; return 1; }
  done
  psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f supabase/seed.sql >/dev/null || return 1

  # `authenticator` é o papel de login do PostgREST; ele assume anon ou
  # authenticated conforme o claim `role` do JWT. O shim já cria os papéis.
  psql -q -d "$BANCO" <<SQL >/dev/null
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end \$\$;
grant anon, authenticated, service_role to authenticator;
SQL

  # ---------------------------------------------------------------------------
  # Administrador da plataforma de DESENVOLVIMENTO
  # ---------------------------------------------------------------------------
  # Criado pelo caminho oficial de bootstrap — token de uso único — e não por
  # INSERT direto. Assim o próprio procedimento documentado é exercitado a cada
  # subida da pilha, em vez de existir só no papel.
  psql -q -d "$BANCO" <<SQL >/dev/null
do \$\$
declare
  v_uid uuid := gen_random_uuid();
  v_token text := 'TOKEN-BOOTSTRAP-DESENVOLVIMENTO-LOCAL-0001';
begin
  if exists (select 1 from platform.admins where status = 'active') then
    return;
  end if;

  insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at)
  values (v_uid, 'plataforma@peganafrota.test', 'authenticated', 'authenticated',
          extensions.crypt('PegaNaFrota#2026', extensions.gen_salt('bf')), now());

  insert into public.profiles (id, full_name, active)
  values (v_uid, 'Administradora da Plataforma', true);

  perform platform.issue_bootstrap_token(v_token, 'stack de desenvolvimento', 600);
  perform platform.consume_bootstrap_token(v_token, v_uid);
end \$\$;
SQL
  echo "   platform_admin de desenvolvimento: plataforma@peganafrota.test"
}

gravar_configuracao() {
  cat > "$ARQUIVO_CONFIGURACAO_POSTGREST" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:${PGPORT}/${BANCO}"
db-schemas = "public, platform"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "${SEGREDO_JWT}"
server-port = ${PGRST_PORT}
server-host = "127.0.0.1"
db-max-rows = 1000
log-level = "info"
CONF
}

case "${1:-up}" in
  up)
    echo "== PostgreSQL =="
    iniciar_postgres || { echo "FALHA ao subir PostgreSQL"; exit 1; }
    echo "== migrations + seed =="
    preparar_banco || { echo "FALHA ao preparar o banco"; exit 1; }
    echo "   banco $BANCO pronto"
    echo "== PostgREST =="
    pkill -f "postgrest $ARQUIVO_CONFIGURACAO_POSTGREST" 2>/dev/null
    gravar_configuracao
    nohup postgrest "$ARQUIVO_CONFIGURACAO_POSTGREST" > "$ARQUIVO_LOG_POSTGREST" 2>&1 &
    for tentativa in $(seq 1 40); do
      curl -sf "http://127.0.0.1:${PGRST_PORT}/" -o /dev/null && break
      sleep 0.5
    done
    if curl -sf "http://127.0.0.1:${PGRST_PORT}/" -o /dev/null; then
      echo "   PostgREST em http://127.0.0.1:${PGRST_PORT}"
    else
      echo "FALHA ao subir PostgREST"; tail -20 "$ARQUIVO_LOG_POSTGREST"; exit 1
    fi

    echo "== Edge Function (Deno real) =="
    pkill -f "deno.*platform-admin" 2>/dev/null
    ANON_KEY_DEV="dev-anon-key-local-harness"
    (cd supabase/functions && \
      DENO_CERT=/etc/ssl/certs/ca-certificates.crt \
      SUPABASE_URL="http://127.0.0.1:${PORTA_GATEWAY}" \
      SUPABASE_ANON_KEY="$ANON_KEY_DEV" \
      SUPABASE_SERVICE_ROLE_KEY="$(node ../../ferramentas/desenvolvimento/token-local.mjs 00000000-0000-0000-0000-000000000000 service_role aal1)" \
      ADMIN_WEB_ORIGINS="http://127.0.0.1:5174,http://localhost:5174" \
      INVITE_DELIVERY="${INVITE_DELIVERY:-log}" \
      INVITE_BASE_URL="http://127.0.0.1:5174" \
      PNF_FN_PORT=3002 nohup deno run --allow-net --allow-env platform-admin/index.ts \
        > /tmp/pnf-edge.log 2>&1 &)
    for tentativa in $(seq 1 30); do
      curl -s -o /dev/null -m 2 "http://127.0.0.1:3002/" 2>/dev/null && break
      sleep 0.5
    done
    if curl -s -o /dev/null -m 3 "http://127.0.0.1:3002/" 2>/dev/null; then
      echo "   Edge Function em http://127.0.0.1:3002 (Deno $(deno --version | head -1 | cut -d\  -f2))"
    else
      echo "   AVISO: Edge Function nao subiu"; tail -8 /tmp/pnf-edge.log
    fi

    echo "== gateway (Kong + GoTrue mínimos) =="
    pkill -f "dev-gateway.mjs" 2>/dev/null
    PNF_PGRST_URL="http://127.0.0.1:${PGRST_PORT}" PNF_GATEWAY_PORT="${PORTA_GATEWAY}" \
      nohup node ferramentas/desenvolvimento/servidor-local.mjs > /tmp/pnf-gateway.log 2>&1 &
    for tentativa in $(seq 1 30); do
      curl -sf "http://127.0.0.1:${PORTA_GATEWAY}/" -o /dev/null && break
      sleep 0.4
    done
    if curl -sf "http://127.0.0.1:${PORTA_GATEWAY}/" -o /dev/null; then
      echo "   gateway em http://127.0.0.1:${PORTA_GATEWAY}"
      echo "   (Desktop e Admin Web apontam para cá, sem alteração de código)"
    else
      echo "FALHA ao subir o gateway"; tail -20 /tmp/pnf-gateway.log; exit 1
    fi
    ;;
  down)
    pkill -f "deno.*platform-admin" 2>/dev/null && echo "Edge Function parada"
    pkill -f "dev-gateway.mjs" 2>/dev/null && echo "gateway parado"
    pkill -f "postgrest $ARQUIVO_CONFIGURACAO_POSTGREST" 2>/dev/null && echo "PostgREST parado"
    ;;
  status)
    pg_isready -h "$PGHOST" -p "$PGPORT" || true
    curl -sf "http://127.0.0.1:${PGRST_PORT}/" -o /dev/null \
      && echo "PostgREST: no ar" || echo "PostgREST: fora do ar"
    curl -sf "http://127.0.0.1:${PORTA_GATEWAY}/" -o /dev/null \
      && echo "gateway:   no ar" || echo "gateway:   fora do ar"
    ;;
  *)
    echo "uso: pilha-local.sh [up|down|status]"; exit 1;;
esac
