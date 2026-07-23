#!/usr/bin/env bash
# Trazaloop · T9F.2 · Concurrencia REAL de primera asignación (PG local).
# Dos sesiones psql SIMULTÁNEAS llaman set_organization_module_access sobre
# una asignación INEXISTENTE. Esperado: cero unique_violation, UNA fila final,
# exactamente UNA transición auditada (un changed=true y un changed=false).
set -euo pipefail
DB=t9f2local
ORG='11111111-1111-1111-1111-111111111111'

run_as_postgres() { su postgres -c "psql -qAt -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }

SUPER=$(run_as_postgres "select user_id from platform_staff where role_code='superadmin' limit 1")

# Estado limpio: sin fila CPR y auditoría contada.
run_as_postgres "delete from organization_modules where organization_id='$ORG' and module_code='traceability_6632'"
BEFORE=$(run_as_postgres "select count(*) from audit_log where organization_id='$ORG' and event_type='organization_module_access_changed'")

CALL="set app.uid='$SUPER'; select (set_organization_module_access('$ORG','traceability_6632','full'))->>'changed';"

# Dos sesiones en paralelo (procesos psql independientes = transacciones reales).
su postgres -c "psql -qAt -d $DB -c \"$CALL\"" > /tmp/c1.out 2>/tmp/c1.err &
P1=$!
su postgres -c "psql -qAt -d $DB -c \"$CALL\"" > /tmp/c2.out 2>/tmp/c2.err &
P2=$!
wait $P1; E1=$?
wait $P2; E2=$?

R1=$(cat /tmp/c1.out); R2=$(cat /tmp/c2.out)
ROWS=$(run_as_postgres "select count(*) from organization_modules where organization_id='$ORG' and module_code='traceability_6632'")
MODE=$(run_as_postgres "select access_mode from organization_modules where organization_id='$ORG' and module_code='traceability_6632'")
AFTER=$(run_as_postgres "select count(*) from audit_log where organization_id='$ORG' and event_type='organization_module_access_changed'")
DELTA=$((AFTER - BEFORE))

echo "salidas: [$R1] [$R2] · exits: $E1/$E2 · filas: $ROWS · modo: $MODE · auditoría Δ: $DELTA"
grep -qi "duplicate key\|unique" /tmp/c1.err /tmp/c2.err && { echo "✘ unique_violation detectada"; exit 1; }
[ "$E1" = "0" ] && [ "$E2" = "0" ] || { echo "✘ una sesión falló"; cat /tmp/c1.err /tmp/c2.err; exit 1; }
[ "$ROWS" = "1" ] || { echo "✘ debía existir exactamente 1 fila"; exit 1; }
[ "$MODE" = "full" ] || { echo "✘ el modo final debía ser full"; exit 1; }
[ "$DELTA" = "1" ] || { echo "✘ debía auditarse exactamente 1 transición (Δ=$DELTA)"; exit 1; }
SORTED=$(printf '%s\n%s\n' "$R1" "$R2" | sort | tr '\n' ',')
[ "$SORTED" = "false,true," ] || { echo "✘ debía haber exactamente un changed=true y un changed=false"; exit 1; }

# Segundo escenario: dos objetivos DISTINTOS simultáneos (full y extra) sobre
# fila inexistente → serializable: 1 fila, 2 transiciones auditadas, estado
# final = uno de los dos, ambos changed=true.
run_as_postgres "delete from organization_modules where organization_id='$ORG' and module_code='traceability_6632'"
BEFORE2=$AFTER
su postgres -c "psql -qAt -d $DB -c \"set app.uid='$SUPER'; select (set_organization_module_access('$ORG','traceability_6632','full'))->>'changed';\"" > /tmp/d1.out 2>/tmp/d1.err &
Q1=$!
su postgres -c "psql -qAt -d $DB -c \"set app.uid='$SUPER'; select (set_organization_module_access('$ORG','traceability_6632','extra'))->>'changed';\"" > /tmp/d2.out 2>/tmp/d2.err &
Q2=$!
wait $Q1; wait $Q2
ROWS2=$(run_as_postgres "select count(*) from organization_modules where organization_id='$ORG' and module_code='traceability_6632'")
MODE2=$(run_as_postgres "select access_mode from organization_modules where organization_id='$ORG' and module_code='traceability_6632'")
AFTER2=$(run_as_postgres "select count(*) from audit_log where organization_id='$ORG' and event_type='organization_module_access_changed'")
DELTA2=$((AFTER2 - BEFORE2))
echo "distintos: [$(cat /tmp/d1.out)] [$(cat /tmp/d2.out)] · filas: $ROWS2 · modo final: $MODE2 · auditoría Δ: $DELTA2"
grep -qi "duplicate key\|unique" /tmp/d1.err /tmp/d2.err && { echo "✘ unique_violation"; exit 1; }
[ "$ROWS2" = "1" ] || { echo "✘ 1 fila esperada"; exit 1; }
{ [ "$MODE2" = "full" ] || [ "$MODE2" = "extra" ]; } || { echo "✘ modo final inválido"; exit 1; }
[ "$DELTA2" = "2" ] || { echo "✘ 2 transiciones auditadas esperadas (Δ=$DELTA2)"; exit 1; }

echo "CONCURRENCIA T9F.2 · TODO EN VERDE"
