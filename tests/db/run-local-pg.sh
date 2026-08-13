#!/usr/bin/env bash
# ============================================================================
# tests/db/run-local-pg.sh · PCR-02.1
# Valida la migración REAL 0104 (y su base 0025) contra un PostgreSQL LOCAL
# DESECHABLE: constraints, triggers, RLS y semántica de vistas.
#
#   PGHOST/PGPORT configurables; por defecto socket /tmp puerto 5433.
#   NO toca Supabase remoto, NO usa credenciales, NO forma parte de test:all
#   (requiere PostgreSQL local); correr con: npm run test:pcr02-1-db
# ============================================================================
set -euo pipefail

HOST="${PGHOST:-/tmp}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"
DB="trazaloop_pcr02_1"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if ! command -v psql > /dev/null 2>&1; then
  echo "BLOCKED: psql no está disponible. Instala PostgreSQL local (16) y reintenta." >&2
  exit 2
fi
if ! psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -Atc "select 1" > /dev/null 2>&1; then
  echo "BLOCKED: no hay servidor PostgreSQL en $HOST:$PORT (usuario $USER)." >&2
  echo "         p. ej.: initdb -D ./pgdata && pg_ctl -D ./pgdata -o '-p 5433 -k /tmp' start" >&2
  exit 2
fi

echo "== PCR-02.1 · validación en PostgreSQL local ($HOST:$PORT) =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -q -v ON_ERROR_STOP=1 \
  -c "drop database if exists $DB;" -c "create database $DB;"

run() { psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -q -v ON_ERROR_STOP=1 "$@"; }

echo "-- 1/6 arnés (superficie Supabase mínima)"
run -f "$ROOT/tests/db/harness-prelude.sql"

echo "-- 2/6 migración REAL 0025 (modelo de trazabilidad)"
run -f "$ROOT/supabase/migrations/0025_traceability.sql"

# El dashboard emulado ahora puede contar sobre las tablas reales de 0025.
run -c "
create or replace view public.v_implementation_dashboard as
select
  o.id as organization_id,
  (select count(*) from public.suppliers s where s.organization_id = o.id)  as suppliers_count,
  (select count(*) from public.materials m where m.organization_id = o.id)  as materials_count,
  (select count(*) from public.input_batches b where b.organization_id = o.id) as input_batches_count,
  (select count(*) from public.production_orders p where p.organization_id = o.id) as production_orders_count
from public.organizations o;"

echo "-- 3/6 migración REAL 0104 (PCR-02.1 + PCR-02.2 + PCR-02.3, tal como se envía)"
run -f "$ROOT/supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql"

# Grants equivalentes a los por defecto de Supabase: la RLS es la barrera.
run -c "grant all on all tables in schema public to authenticated;" \
    -c "grant usage, select on all sequences in schema public to authenticated;"

echo "-- 4/6 aserciones conductuales PCR-02.1"
run -f "$ROOT/tests/db/pcr02_1_assertions.sql"

echo "-- 5/6 aserciones conductuales PCR-02.2 (historial + fail-closed)"
run -f "$ROOT/tests/db/pcr02_2_assertions.sql"

echo "-- 6/7 aserciones conductuales PCR-02.3 (candado histórico + reapertura)"
run -f "$ROOT/tests/db/pcr02_3_assertions.sql"

echo "-- 7/7 aserciones conductuales PCR-02.4 (structural guard de órdenes cerradas)"
run -f "$ROOT/tests/db/pcr02_4_assertions.sql"

echo "== PCR-02.1/PCR-02.2/PCR-02.3/PCR-02.4 · PostgreSQL local: TODAS las aserciones pasaron =="
