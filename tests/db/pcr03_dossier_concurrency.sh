#!/usr/bin/env bash
# ============================================================================
# tests/db/pcr03_dossier_concurrency.sh · PCR-03.3 · rev. 03.1–03.3.1
# Hallazgo 9 / ataque 40: carrera de versionado de expedientes.
#
# Dos sesiones psql REALES y SIMULTÁNEAS (authenticated, mismo admin) llaman
# a generate_audit_dossier sobre el MISMO lote. Con el candado advisory por
# (org, lote) una sesión espera a la otra: ambas deben terminar con éxito y
# obtener VERSIONES CONSECUTIVAS y CÓDIGOS DISTINTOS — nunca un choque por
# (org, output_batch_id, version) ni una sobreescritura.
#
# Requiere la DB del arnés ya montada (0001–0108 + fixtures de S13/S14).
# Uso: PGHOST=/tmp PGPORT=5433 PGDATABASE=trazaloop_pcr02_1 bash …sh
# ============================================================================
set -euo pipefail
PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGDATABASE="${PGDATABASE:-trazaloop_pcr02_1}"
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -qAt)

OB='ffffffff-6666-0000-0000-000000000012'      # lote OUT-EJERCICIO (S13)
ADMIN='ffffffff-1111-0000-0000-000000000010'   # admin de la org titular

BASE=$("${PSQL[@]}" -c "select coalesce(max(version),0) from audit_dossiers where output_batch_id='$OB';")

run_session() {
  "${PSQL[@]}" <<SQL
begin;
select set_config('request.jwt.claim.sub', '$ADMIN', true);
set local role authenticated;
-- pg_sleep tras tomar el candado NO es posible desde fuera; el solape se
-- garantiza lanzando ambas transacciones a la vez: la 2.ª queda esperando
-- el advisory lock de la 1.ª y continúa al confirmar aquella.
-- (rev. 03.1–03.3.2) La RPC ya no acepta contenido: construye el expediente
-- desde el último ejercicio COMPLETADO del lote (verdad-servidor).
select dossier_version || '|' || dossier_code
  from public.generate_audit_dossier('$OB'::uuid);
commit;
SQL
}

OUT_A=$(mktemp); OUT_B=$(mktemp)
run_session > "$OUT_A" 2>&1 & PID_A=$!
run_session > "$OUT_B" 2>&1 & PID_B=$!
FAIL=0
wait "$PID_A" || FAIL=1
wait "$PID_B" || FAIL=1
if [ "$FAIL" -ne 0 ]; then
  echo "✘ C2: una de las sesiones concurrentes FALLÓ:"
  cat "$OUT_A" "$OUT_B"
  exit 1
fi

# -qAt imprime también el resultado de set_config: la línea útil es la última.
RA=$(tail -n1 "$OUT_A"); RB=$(tail -n1 "$OUT_B")
VA=${RA%%|*}; CA=${RA##*|}
VB=${RB%%|*}; CB=${RB##*|}
rm -f "$OUT_A" "$OUT_B"

LO=$((VA < VB ? VA : VB)); HI=$((VA > VB ? VA : VB))
if [ "$LO" -ne $((BASE + 1)) ] || [ "$HI" -ne $((BASE + 2)) ]; then
  echo "✘ C2: versiones no consecutivas desde v$BASE (obtenidas v$VA y v$VB)"
  exit 1
fi
if [ "$CA" = "$CB" ]; then
  echo "✘ C2: las dos sesiones obtuvieron el MISMO código ($CA)"
  exit 1
fi

TOTAL=$("${PSQL[@]}" -c "select count(*) from audit_dossiers where output_batch_id='$OB' and version in ($LO,$HI);")
DUPS=$("${PSQL[@]}" -c "select count(*) from (select version from audit_dossiers where output_batch_id='$OB' group by version having count(*)>1) d;")
if [ "$TOTAL" -ne 2 ] || [ "$DUPS" -ne 0 ]; then
  echo "✘ C2: persistencia inconsistente (filas nuevas=$TOTAL, versiones duplicadas=$DUPS)"
  exit 1
fi

echo "✔ C2 concurrencia de expedientes: dos sesiones simultáneas → v$LO y v$HI consecutivas, códigos $CA / $CB distintos, sin duplicados"
