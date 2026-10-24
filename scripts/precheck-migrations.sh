#!/usr/bin/env bash
# Pré-checagem PRELIMINAR (nível 0): aplica as migrações em um PostgreSQL puro e
# descartável, com um simulador mínimo do Auth do Supabase. Se a extensão pgTAP
# estiver instalada nesse PostgreSQL, roda também os testes de
# supabase/tests/database; caso contrário, apenas as migrações são verificadas.
#
# NÃO é validação oficial do Supabase. A validação oficial é
# `supabase start` + `supabase db reset` + `supabase test db` + testes de
# integração (ver docs/BUILD_AND_VALIDATION.md).
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
"${PSQL[@]}" -f "$ROOT/scripts/precheck/supabase_auth_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> Migração $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

if "${PSQL[@]}" -Atc "select 1 from pg_available_extensions where name = 'pgtap'" | grep -q 1; then
  "${PSQL[@]}" -c "create extension if not exists pgtap with schema extensions"
  for f in "$ROOT"/supabase/tests/database/*.sql; do
    echo "==> Teste $(basename "$f")"
    "${PSQL[@]}" -At -f "$f" | tee "$WORK/out.tap" | grep -E '^not ok' && { echo "Falhas em $f"; exit 1; }
  done
else
  echo "==> pgTAP não instalado neste PostgreSQL: testes não executados (somente migrações)."
fi

echo "==> Pré-checagem concluída (preliminar; não substitui a validação no Supabase)"
