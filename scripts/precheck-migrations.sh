#!/usr/bin/env bash
# Pré-checagem rápida: aplica as migrações em um PostgreSQL puro e descartável,
# com um simulador mínimo do Auth do Supabase, e roda os testes de RLS.
#
# Não substitui `supabase start` + `supabase db reset` nem o teste no projeto
# de desenvolvimento. Ver docs/BUILD_AND_VALIDATION.md.
#
# Requisitos: binários do PostgreSQL 15+ (initdb, pg_ctl, psql) no PATH ou em
# PG_BIN, e a extensão btree_gist (pacote contrib).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
WORK="$(mktemp -d)"
PORT="${PRECHECK_PORT:-55432}"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

run_pg() {
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres "$WORK"
    su postgres -s /bin/bash -c "$*"
  else
    bash -c "$*"
  fi
}

run_pg "'$PG_BIN/initdb' -D '$WORK/data' -U postgres -A trust >/dev/null"
run_pg "'$PG_BIN/pg_ctl' -D '$WORK/data' -o '-p $PORT -k $WORK -c listen_addresses=' -l '$WORK/pg.log' -w start >/dev/null"

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "==> Simulador do Auth (somente pré-checagem)"
"${PSQL[@]}" -f "$ROOT/supabase/tests/shim/supabase_auth_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> Migração $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

for f in "$ROOT"/supabase/tests/*_test.sql; do
  echo "==> Teste $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "==> Pré-checagem concluída sem falhas"
