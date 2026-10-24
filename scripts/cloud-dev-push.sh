#!/usr/bin/env bash
# Aplica as migrações do repositório SOMENTE no Supabase de desenvolvimento
# (ref biaezsatrxqpopeifkot). Rodar na raiz do repositório, na máquina do
# responsável. Senha e token são digitados só no terminal (ou já exportados no
# seu shell) — nunca enviados por chat nem gravados no repositório.
#
# Etapas: login → link no ref esperado → conferir vínculo → histórico remoto →
# db push --dry-run → comparar com supabase/migrations → confirmação → db push →
# histórico final. Nunca executa db reset, restore ou drop.
set -euo pipefail

EXPECTED_REF="biaezsatrxqpopeifkot"
SUPABASE="${SUPABASE_BIN:-npx --yes supabase@2.122.0}"
LOG_DIR="${TMPDIR:-/tmp}/rc-beauty-cloud-push"
mkdir -p "$LOG_DIR"

cd "$(dirname "$0")/.."
[ -d supabase/migrations ] || { echo "Rode na raiz do repositório RC Beauty."; exit 1; }

echo "==> Supabase CLI: $($SUPABASE --version)"
echo "==> Alvo esperado: $EXPECTED_REF (RC Beauty — desenvolvimento)"

if ! $SUPABASE projects list >/dev/null 2>&1; then
  echo "==> Faça login (abre o navegador ou pede o token no terminal):"
  $SUPABASE login
fi

echo "==> Projetos visíveis para esta conta:"
$SUPABASE projects list

echo "==> Vinculando ao ref $EXPECTED_REF (a senha do banco é pedida aqui, no terminal)"
$SUPABASE link --project-ref "$EXPECTED_REF"

LINKED="$(cat supabase/.temp/project-ref 2>/dev/null || true)"
if [ "$LINKED" != "$EXPECTED_REF" ]; then
  echo "PARE: projeto vinculado é '$LINKED', não '$EXPECTED_REF'."; exit 1
fi
echo "==> Projeto vinculado confirmado: $LINKED"

echo "==> Histórico de migrações (local × remoto) ANTES:"
$SUPABASE migration list --linked | tee "$LOG_DIR/migration-list-antes.txt"

echo "==> Prévia: supabase db push --dry-run"
$SUPABASE db push --dry-run --linked 2>&1 | tee "$LOG_DIR/dry-run.txt"

EXPECTED_LIST="$(ls supabase/migrations | grep -E '^[0-9]{14}_.+\.sql$' | sort)"
PLANNED_LIST="$(grep -oE '[0-9]{14}_[A-Za-z0-9_]+\.sql' "$LOG_DIR/dry-run.txt" | sort -u || true)"
if [ "$PLANNED_LIST" != "$EXPECTED_LIST" ]; then
  echo
  echo "PARE: a prévia não corresponde às migrações do repositório."
  echo "--- esperado (supabase/migrations):"; echo "$EXPECTED_LIST"
  echo "--- na prévia:"; echo "${PLANNED_LIST:-(nenhuma)}"
  echo "Envie esta saída (sem senhas) para revisão. Nada foi aplicado."
  exit 1
fi
echo "==> A prévia lista exatamente as $(echo "$EXPECTED_LIST" | wc -l | tr -d ' ') migrações do repositório."

echo
read -r -p "Aplicar estas migrações em $EXPECTED_REF? Digite APLICAR para continuar: " ANSWER
[ "$ANSWER" = "APLICAR" ] || { echo "Cancelado. Nada foi aplicado."; exit 1; }

$SUPABASE db push --linked 2>&1 | tee "$LOG_DIR/push.txt"

echo "==> Histórico de migrações DEPOIS:"
$SUPABASE migration list --linked | tee "$LOG_DIR/migration-list-depois.txt"
echo
echo "Concluído. Saídas salvas em $LOG_DIR (não contêm senha)."
echo "Próximo passo: avisar o Claude Code para conferir tabelas, RLS, permissões e advisors (somente leitura)."
