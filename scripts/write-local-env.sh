#!/usr/bin/env bash
# Gera apps/web/.env.local a partir da stack LOCAL (supabase start).
# Somente URL e chave publicável — nunca a chave secreta.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
case "$API_URL" in http://127.0.0.1*|http://localhost*) ;; *) echo "Não é a stack local" >&2; exit 1;; esac
printf 'VITE_SUPABASE_URL=%s\nVITE_SUPABASE_PUBLISHABLE_KEY=%s\n' "$API_URL" "$PUBLISHABLE_KEY" > "$ROOT/apps/web/.env.local"
echo "apps/web/.env.local gerado para a stack local."
