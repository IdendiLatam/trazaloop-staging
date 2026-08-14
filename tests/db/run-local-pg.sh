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

echo "-- 1/10 arnés (superficie Supabase mínima)"
run -f "$ROOT/tests/db/harness-prelude.sql"

echo "-- 2/10 migración REAL 0025 (modelo de trazabilidad)"
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

echo "-- 3/10 migración REAL 0104 (inmutable: ya aplicada en Production)"
run -f "$ROOT/supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql"

# ── PCR-02.5.1 (hallazgo 3) · preflight del sobreconsumo HISTÓRICO ─────────
# Se siembra data legacy INVÁLIDA antes de la 0105 (posible: aún no hay
# guardas) y la migración debe FALLAR listando los lotes, sin dejar nada a
# medias (begin/commit atómico) y sin tocar los datos.
echo "-- 4a/10 LEGACY-EXT-INVALID: consumido 101 > recibido 100 → la 0105 debe FALLAR"
run << 'SQL'
insert into organizations (id, name) values ('99999999-0000-0000-0000-00000000000a', 'Org Legacy');
insert into suppliers (id, organization_id, name)
values ('99999999-2222-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a', 'Prov L');
-- clasificación NULL: los códigos ('PET', …) se siembran después, en 5/10
insert into materials (id, organization_id, name)
values ('99999999-3333-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a', 'Mat L');
insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
values ('99999999-5555-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a',
        '99999999-2222-0000-0000-00000000000a', '99999999-3333-0000-0000-00000000000a',
        'LE-LEGACY-MALO', current_date, 100);
insert into production_orders (id, organization_id, order_code, order_date, status)
values ('99999999-4444-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a', 'OP-L1', current_date, 'in_progress');
insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
values ('99999999-0000-0000-0000-00000000000a', '99999999-4444-0000-0000-00000000000a',
        '99999999-5555-0000-0000-00000000000a', 101);
SQL
# PCR-02.5.2: la 0105 no trae transaction control propio — la atomicidad
# la pone el CLIENTE (--single-transaction), igual que hará el runner de
# Supabase CLI con su propia gestión transaccional.
if psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 --single-transaction \
     -f "$ROOT/supabase/migrations/0105_pcr025_inventory_and_quantity_guards.sql" > /tmp/pcr025_legacy_ext.out 2>&1; then
  echo "FALLO LEGACY-EXT-INVALID: la 0105 se aplicó sobre sobreconsumo externo histórico" >&2
  exit 1
fi
grep -q "consumo acumulado superior a la cantidad recibida" /tmp/pcr025_legacy_ext.out || {
  echo "FALLO LEGACY-EXT-INVALID: la 0105 falló por un motivo distinto:" >&2
  tail -3 /tmp/pcr025_legacy_ext.out >&2
  exit 1
}
grep -q "LE-LEGACY-MALO" /tmp/pcr025_legacy_ext.out || {
  echo "FALLO LEGACY-EXT-INVALID: el mensaje no lista el batch_code afectado" >&2; exit 1; }
run << 'SQL'
-- Fail-closed sin estado a medias: nada de la 0105 quedó instalado y el
-- dato legacy sigue intacto (ni corregido ni borrado).
do $$
begin
  if exists (select 1 from information_schema.views where table_name = 'v_input_batch_inventory') then
    raise exception 'FALLO LEGACY-EXT-INVALID: la vista quedó creada pese al abort';
  end if;
  if exists (select 1 from pg_trigger where tgname = 't_batch_consumption_total_balance_guard') then
    raise exception 'FALLO LEGACY-EXT-INVALID: el trigger quedó instalado pese al abort';
  end if;
  if (select mass_kg from batch_consumption
       where production_order_id = '99999999-4444-0000-0000-00000000000a') <> 101 then
    raise exception 'FALLO LEGACY-EXT-INVALID: el consumo legacy fue alterado';
  end if;
  raise notice '✔ LEGACY-EXT-INVALID: la 0105 abortó listando el lote, atómica y sin tocar datos';
end $$;
-- limpiar el caso inválido (decisión de negocio simulada: se corrige fuera)
delete from batch_consumption where organization_id = '99999999-0000-0000-0000-00000000000a';
SQL

echo "-- 4b/10 LEGACY-INT-INVALID: consumo interno 51 > producido 50 → la 0105 debe FALLAR"
run << 'SQL'
insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
values ('99999999-6666-0000-0000-00000000000a', '99999999-0000-0000-0000-00000000000a',
        '99999999-4444-0000-0000-00000000000a', 'OUT-LEGACY-MALO', 50);
insert into production_orders (id, organization_id, order_code, order_date, status)
values ('99999999-4444-0000-0000-00000000000b', '99999999-0000-0000-0000-00000000000a', 'OP-L2', current_date, 'in_progress');
insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
values ('99999999-0000-0000-0000-00000000000a', '99999999-4444-0000-0000-00000000000b',
        '99999999-6666-0000-0000-00000000000a', 51);
SQL
if psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 --single-transaction \
     -f "$ROOT/supabase/migrations/0105_pcr025_inventory_and_quantity_guards.sql" > /tmp/pcr025_legacy_int.out 2>&1; then
  echo "FALLO LEGACY-INT-INVALID: la 0105 se aplicó sobre sobreconsumo interno histórico" >&2
  exit 1
fi
grep -q "consumo interno acumulado superior a la cantidad producida" /tmp/pcr025_legacy_int.out || {
  echo "FALLO LEGACY-INT-INVALID: la 0105 falló por un motivo distinto:" >&2
  tail -3 /tmp/pcr025_legacy_int.out >&2
  exit 1
}
grep -q "OUT-LEGACY-MALO" /tmp/pcr025_legacy_int.out || {
  echo "FALLO LEGACY-INT-INVALID: el mensaje no lista el batch_code afectado" >&2; exit 1; }
run << 'SQL'
do $$
begin
  raise notice '✔ LEGACY-INT-INVALID: la 0105 abortó por el sobreconsumo interno listando el lote';
end $$;
-- corregir a saldo EXACTO (100/100 externo y 50/50 interno) para 4c
update output_batch_consumption set mass_kg = 50
 where organization_id = '99999999-0000-0000-0000-00000000000a';
insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
values ('99999999-0000-0000-0000-00000000000a', '99999999-4444-0000-0000-00000000000a',
        '99999999-5555-0000-0000-00000000000a', 100);
SQL

echo "-- 4c/10 LEGACY-VALID (saldo exacto 100/100 y 50/50) + migración REAL 0105"
run --single-transaction -f "$ROOT/supabase/migrations/0105_pcr025_inventory_and_quantity_guards.sql"
run << 'SQL'
do $$
declare v_n numeric;
begin
  select available_kg into v_n from v_input_batch_inventory
   where input_batch_id = '99999999-5555-0000-0000-00000000000a';
  if v_n <> 0 then raise exception 'FALLO LEGACY-VALID: saldo externo esperado 0, es %', v_n; end if;
  select available_kg into v_n from v_output_batch_inventory
   where output_batch_id = '99999999-6666-0000-0000-00000000000a';
  if v_n <> 0 then raise exception 'FALLO LEGACY-VALID: saldo interno esperado 0, es %', v_n; end if;
  raise notice '✔ LEGACY-VALID: con saldo exacto la 0105 aplica y las vistas arrancan sin negativos';
end $$;
SQL

# Grants equivalentes a los por defecto de Supabase: la RLS es la barrera.
run -c "grant all on all tables in schema public to authenticated;" \
    -c "grant usage, select on all sequences in schema public to authenticated;"

echo "-- 5/10 aserciones conductuales PCR-02.1"
run -f "$ROOT/tests/db/pcr02_1_assertions.sql"

echo "-- 6/10 aserciones conductuales PCR-02.2 (historial + fail-closed)"
run -f "$ROOT/tests/db/pcr02_2_assertions.sql"

echo "-- 7/10 aserciones conductuales PCR-02.3 (candado histórico + reapertura)"
run -f "$ROOT/tests/db/pcr02_3_assertions.sql"

echo "-- 8/10 aserciones conductuales PCR-02.4 (structural guard de órdenes cerradas)"
run -f "$ROOT/tests/db/pcr02_4_assertions.sql"

echo "-- 9/10 aserciones conductuales PCR-02.5 (inventario + saldos + cantidad obligatoria)"
run -f "$ROOT/tests/db/pcr02_5_assertions.sql"

echo "-- 10/10 concurrencia REAL PCR-02.5 (dos sesiones simultáneas)"
bash "$ROOT/tests/db/pcr02_5_concurrency.sh"

echo "== PCR-02.1…PCR-02.5 · PostgreSQL local: TODAS las aserciones pasaron =="
