#!/usr/bin/env bash
# =============================================================================
# Equivalente local de `supabase db reset` sem Docker.
#   1. recria a base;
#   2. aplica o shim (papéis, schema auth, auth.uid());
#   3. aplica TODAS as migrations em ordem lexicográfica;
#   4. aplica supabase/seed.sql.
# =============================================================================
set -euo pipefail

BANCO="${PGDATABASE:-pegafrota}"
RAIZ_PROJETO="$(cd "$(dirname "$0")/../../.." && pwd)"

echo "==> dropping/creating database ${BANCO}"
psql -q -d postgres -c "drop database if exists ${BANCO} with (force);" >/dev/null
psql -q -d postgres -c "create database ${BANCO};" >/dev/null

echo "==> applying supabase shim"
psql -q -v ON_ERROR_STOP=1 -d "${BANCO}" -f "${RAIZ_PROJETO}/ferramentas/testes/banco-local/preparar-ambiente.sql" >/dev/null

echo "==> applying migrations"
for arquivo_migracao in "${RAIZ_PROJETO}"/supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$arquivo_migracao")"
  psql -q -v ON_ERROR_STOP=1 -d "${BANCO}" -f "$arquivo_migracao" >/dev/null
done

echo "==> applying seed"
psql -q -v ON_ERROR_STOP=1 -d "${BANCO}" -f "${RAIZ_PROJETO}/supabase/seed.sql" >/dev/null

echo "==> done"
