#!/usr/bin/env bash
# ============================================================================
# scripts/replay-local.sh · Reejecución LIMPIA de todas las migraciones
# ----------------------------------------------------------------------------
# POR QUÉ EXISTE
#
# `supabase db reset` no puede aplicar la 0105: esa migración usa
# `LOCK TABLE`, que exige estar dentro de una transacción, y el runner del CLI
# ejecuta sentencia a sentencia fuera de una. La propia 0105 lo explica y
# describe el remedio: aplicarla con `psql --single-transaction`, dejando el
# control transaccional al cliente.
#
# Así que la reejecución limpia son dos tramos:
#   1 · el CLI deja la base vacía y aplica lo que sabe aplicar (0001–0104);
#   2 · este script aplica el resto, cada fichero en UNA transacción.
#
# Cada migración se registra en supabase_migrations.schema_migrations para que
# la cabecera diga la verdad.
#
# SOLO LOCAL. Aborta si la URL no es local: una reejecución limpia contra un
# entorno remoto sería un borrado.
#
#   Uso: bash scripts/replay-local.sh
# ============================================================================
set -euo pipefail

PG="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$PG" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "ABORTADO: replay-local solo corre contra la base LOCAL. URL: $PG" >&2; exit 2 ;;
esac

command -v psql >/dev/null 2>&1 || { echo "BLOCKED: falta psql." >&2; exit 2; }

echo "== 1 · el CLI vacía la base y aplica lo que puede =="
# Falla al llegar a 0105 y es lo esperado: se continúa a mano desde ahí.
npx supabase db reset --local >/dev/null 2>&1 || true

aplicadas="$(psql "$PG" -X -q -A -t -c \
  "select coalesce(max(version),'0000') from supabase_migrations.schema_migrations")"
echo "   el CLI dejó la base en $aplicadas"

echo "== 2 · el resto, cada fichero en una sola transacción =="
fallos=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f")"
  ver="${base:0:4}"
  [ "$ver" \> "$aplicadas" ] || continue
  printf '   %-62s ' "$base"
  if psql "$PG" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$f" >/dev/null 2>"$ROOT/.replay.err"; then
    psql "$PG" -X -q -c \
      "insert into supabase_migrations.schema_migrations(version,name) values ('$ver','${base%.sql}') on conflict do nothing" >/dev/null
    echo "ok"
  else
    echo "FALLÓ"
    sed -n '1,6p' "$ROOT/.replay.err" | sed 's/^/        /'
    fallos=$((fallos + 1))
  fi
done
rm -f "$ROOT/.replay.err"

cabecera="$(psql "$PG" -X -q -A -t -c "select max(version) from supabase_migrations.schema_migrations")"
total="$(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')"
registradas="$(psql "$PG" -X -q -A -t -c "select count(*) from supabase_migrations.schema_migrations")"

echo
echo "== resultado =="
echo "   cabecera: $cabecera · migraciones en disco: $total · registradas: $registradas · fallos: $fallos"
[ "$fallos" -eq 0 ] || exit 1
