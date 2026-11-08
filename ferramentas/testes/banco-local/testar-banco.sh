#!/usr/bin/env bash
# Executa a suíte pgTAP contra o harness local.
# Sai com 2 (não 1) quando o ambiente não tem PostgreSQL: o gate distingue
# "não executado" de "reprovado".
set -uo pipefail

export PATH="$PATH:/usr/lib/postgresql/16/bin"
PGHOST="${PGHOST:-127.0.0.1}"; PGPORT="${PGPORT:-5433}"; PGUSER="${PGUSER:-postgres}"
export PGHOST PGPORT PGUSER
BANCO="${PNF_TEST_DB:-pnf_gate}"

command -v psql >/dev/null 2>&1 || { echo "NÃO EXECUTADO — psql ausente"; exit 2; }
command -v pg_prove >/dev/null 2>&1 || { echo "NÃO EXECUTADO — pg_prove ausente"; exit 2; }
pg_isready -q -h "$PGHOST" -p "$PGPORT" || { echo "NÃO EXECUTADO — servidor PostgreSQL indisponível em $PGHOST:$PGPORT"; exit 2; }

psql -q -d postgres -c "drop database if exists $BANCO with (force);" -c "create database $BANCO;" >/dev/null 2>&1
psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f ferramentas/testes/banco-local/preparar-ambiente.sql >/dev/null || exit 1

for arquivo_migracao in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f "$arquivo_migracao" >/dev/null || { echo "FALHA na migration $arquivo_migracao"; exit 1; }
done
psql -q -v ON_ERROR_STOP=1 -d "$BANCO" -f supabase/seed.sql >/dev/null || exit 1

pg_prove --ext .sql -d "$BANCO" supabase/tests/database/*.sql
