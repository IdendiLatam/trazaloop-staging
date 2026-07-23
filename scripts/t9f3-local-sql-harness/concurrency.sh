#!/usr/bin/env bash
# Trazaloop · T9F.3 · CONCURRENCIA REAL (sesiones psql simultáneas, PG local).
# Carrera 1 — último recurso permitido: dos INSERT directos como authenticated
#   compiten por el único hueco (demo suppliers=1). Esperado: UNO entra y el
#   otro recibe RESOURCE_LIMIT_EXCEEDED; una sola fila final.
# Carrera 2 — dos begins simultáneos con límite de evidencias 1: UNO reserva,
#   el otro EVIDENCE_LIMIT_EXCEEDED; un solo intent pendiente.
# Carrera 3 — dos finalizes simultáneos del MISMO intent: UNA evidencia;
#   respuestas already_finalized false/true (en cualquier orden).
set -euo pipefail
DB=t9f3local
ORG='11111111-0000-4000-8000-000000000001'
UID1='aaaaaaaa-0000-0000-0000-0000000000a1'

pgq() { su postgres -c "psql -qAt -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }

echo "── Carrera 1: INSERT directo del último proveedor permitido"
pgq "delete from suppliers where organization_id='$ORG'"
pgq "update organization_modules set enabled=true, access_mode='demo', access_expires_at=now()+interval '2 days' where organization_id='$ORG'"
CALL="set role authenticated; set app.uid='$UID1'; insert into suppliers (organization_id, name) values ('$ORG', 'carrera');"
set +e
su postgres -c "psql -qAt -d $DB -c \"$CALL\"" >/tmp/c1a 2>&1 & P1=$!
su postgres -c "psql -qAt -d $DB -c \"$CALL\"" >/tmp/c1b 2>&1 & P2=$!
wait $P1; E1=$?; wait $P2; E2=$?
set -e
N=$(pgq "select count(*) from suppliers where organization_id='$ORG'")
ERRS=$(grep -hc "RESOURCE_LIMIT_EXCEEDED" /tmp/c1a /tmp/c1b | paste -sd+ | bc)
echo "exits: $E1/$E2 · filas: $N · rechazos por límite: $ERRS"
[ "$N" = "1" ] && [ "$ERRS" = "1" ] && [ $((E1+E2)) -eq 1 ] || { echo 'CARRERA 1 FALLIDA'; exit 1; }

echo "── Carrera 2: dos begins simultáneos (límite de evidencias 1)"
pgq "delete from textile_evidences where organization_id='$ORG'"
pgq "update textile_evidence_upload_intents set status='failed' where organization_id='$ORG' and status='pending'"
BEGINCALL="set app.uid='$UID1'; select begin_textile_evidence_upload_v2('$ORG', 'r.pdf', 1048576, 'application/pdf', jsonb_build_object('title','R','evidence_type','other'))->>'intent_id';"
set +e
su postgres -c "psql -qAt -d $DB -c \"$BEGINCALL\"" >/tmp/c2a 2>&1 & P1=$!
su postgres -c "psql -qAt -d $DB -c \"$BEGINCALL\"" >/tmp/c2b 2>&1 & P2=$!
wait $P1; E1=$?; wait $P2; E2=$?
set -e
NP=$(pgq "select count(*) from textile_evidence_upload_intents where organization_id='$ORG' and status='pending' and expires_at>now()")
ERRS=$(grep -hc "EVIDENCE_LIMIT_EXCEEDED" /tmp/c2a /tmp/c2b | paste -sd+ | bc)
echo "exits: $E1/$E2 · intents pendientes: $NP · rechazos por límite: $ERRS"
[ "$NP" = "1" ] && [ "$ERRS" = "1" ] && [ $((E1+E2)) -eq 1 ] || { echo 'CARRERA 2 FALLIDA'; exit 1; }

echo "── Carrera 3: dos finalizes simultáneos del MISMO intent"
IID=$(pgq "select id from textile_evidence_upload_intents where organization_id='$ORG' and status='pending' and expires_at>now() limit 1")
FIN="select finalize_textile_evidence_upload_server('$UID1', '$IID', 1048576, 'application/pdf')->>'already_finalized';"
set +e
su postgres -c "psql -qAt -d $DB -c \"$FIN\"" >/tmp/c3a 2>&1 & P1=$!
su postgres -c "psql -qAt -d $DB -c \"$FIN\"" >/tmp/c3b 2>&1 & P2=$!
wait $P1; wait $P2
set -e
NEV=$(pgq "select count(*) from textile_evidences where organization_id='$ORG'")
R1=$(cat /tmp/c3a); R2=$(cat /tmp/c3b)
echo "respuestas: [$R1] [$R2] · evidencias: $NEV"
{ [ "$R1$R2" = "falsetrue" ] || [ "$R1$R2" = "truefalse" ]; } && [ "$NEV" = "1" ] || { echo 'CARRERA 3 FALLIDA'; exit 1; }

echo "CONCURRENCIA T9F.3 · TODO EN VERDE"
