#!/usr/bin/env bash
# ============================================================================
# tests/db/pcr02_5_concurrency.sh · PCR-02.5 §25 C1 — concurrencia REAL
# ============================================================================
# Dos SESIONES PostgreSQL simultáneas intentan consumir 60 kg cada una de un
# lote de 100 kg. Sin serialización, ambas leerían «disponible 100» e
# insertarían 60 + 60 = 120 (inventario negativo). Con la guarda 0105, el
# trigger BEFORE toma el candado de fila del lote (SELECT … FOR UPDATE):
#   · la sesión A abre transacción, inserta 60 y RETIENE el candado 2 s;
#   · la sesión B intenta insertar 60, queda BLOQUEADA esperando el candado;
#   · A confirma; B despierta, su SUM ve los 60 confirmados y es RECHAZADA.
# El test falla si B llega a insertar o si el total supera 100 kg.
# No es un test estático: son dos procesos psql reales contra el clúster.
# ============================================================================
set -euo pipefail

HOST="${PGHOST:-/tmp}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"
DB="trazaloop_pcr02_1"
PSQL=(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -qAt)

ORG="ffffffff-0000-0000-0000-000000000009"
IB="ffffffff-5555-0000-0000-000000000021"
OP_A="ffffffff-4444-0000-0000-0000000000a9"

# --- Fixture aislado (organización propia del test de concurrencia) --------
"${PSQL[@]}" > /dev/null << SQL
insert into organizations (id, name) values ('$ORG', 'Org Concurrencia')
  on conflict (id) do nothing;
insert into suppliers (id, organization_id, name)
  values ('ffffffff-2222-0000-0000-000000000009', '$ORG', 'Prov C1')
  on conflict (id) do nothing;
insert into materials (id, organization_id, name, classification_code)
  values ('ffffffff-3333-0000-0000-000000000009', '$ORG', 'Mat C1', 'PET')
  on conflict (id) do nothing;
insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values ('$IB', '$ORG', 'ffffffff-2222-0000-0000-000000000009',
          'ffffffff-3333-0000-0000-000000000009', 'LE-C1-100', current_date, 100)
  on conflict (id) do nothing;
insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a9', '$ORG', 'OP-C1-A', current_date, 'in_progress'),
          ('ffffffff-4444-0000-0000-0000000000b9', '$ORG', 'OP-C1-B', current_date, 'in_progress')
  on conflict (id) do nothing;
delete from batch_consumption where organization_id = '$ORG';
SQL

# --- Sesión A: inserta 60 y retiene el candado 2 s antes de confirmar ------
"${PSQL[@]}" > /tmp/pcr025_c1_a.out 2> /tmp/pcr025_c1_a.err << SQL &
begin;
insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
values ('$ORG', 'ffffffff-4444-0000-0000-0000000000a9', '$IB', 60);
select pg_sleep(2);
commit;
select 'SESION_A_OK';
SQL
PID_A=$!

sleep 0.6  # garantizar que A ya tomó el candado del lote

# --- Sesión B: intenta 60 en paralelo — debe ESPERAR y ser RECHAZADA -------
set +e
B_ERR=$("${PSQL[@]}" 2>&1 > /tmp/pcr025_c1_b.out << SQL
insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
values ('$ORG', 'ffffffff-4444-0000-0000-0000000000b9', '$IB', 60);
SQL
)
B_EXIT=$?
set -e
wait "$PID_A"

if [ "$B_EXIT" -eq 0 ]; then
  echo "FALLO C1: la sesión concurrente B insertó 60 kg adicionales (sobreconsumo por carrera)" >&2
  exit 1
fi
case "$B_ERR" in
  *"La cantidad a consumir supera el saldo disponible del lote. Disponible: 40 kg."*) ;;
  *)
    echo "FALLO C1: la sesión B falló con un error distinto al de saldo: $B_ERR" >&2
    exit 1
    ;;
esac
grep -q "SESION_A_OK" /tmp/pcr025_c1_a.out || { echo "FALLO C1: la sesión A no confirmó" >&2; exit 1; }

TOTAL=$("${PSQL[@]}" -c "select coalesce(sum(mass_kg),0) from batch_consumption where organization_id = '$ORG' and input_batch_id = '$IB';")
ROWS=$("${PSQL[@]}" -c "select count(*) from batch_consumption where organization_id = '$ORG' and input_batch_id = '$IB';")
if [ "$TOTAL" != "60.0000" ] || [ "$ROWS" != "1" ]; then
  echo "FALLO C1: estado final inesperado (total=$TOTAL filas=$ROWS; esperado 60.0000 en 1 fila)" >&2
  exit 1
fi

echo "✔ C1 concurrencia real: la sesión B esperó el candado del lote y fue rechazada ('Disponible: 40 kg.'); total final 60/100 kg en 1 fila"
