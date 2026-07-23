#!/usr/bin/env bash
# Trazaloop · T9F.4 · CONCURRENCIA REAL (sesiones psql simultáneas, PG local).
# Requiere run.sh ejecutado antes (deja t9f3local con 0101 + smokes aplicados).
# Carrera 4 — último documento permitido, UNA CREACIÓN EN CADA TABLA: un
#   INSERT en trazadoc_documents (vivo) compite contra un INSERT en
#   trazadoc_file_documents (descargable) por el único hueco (demo docs=2 con
#   1 ocupado). El recurso comparte advisory lock (documents_trazadocs), así
#   que el resultado esperado es UNO entra y el otro RESOURCE_LIMIT_EXCEEDED
#   — jamás dos. (§8 / §26.6)
# Carrera 5 — dos begin_cpr_storage_upload simultáneos cuya suma supera la
#   cuota restante: UNO reserva y el otro STORAGE_QUOTA_EXCEEDED; un solo
#   intent pending. (§13 / §26.20)
set -euo pipefail
DB=t9f3local
ORGC='33333333-0000-4000-8000-000000000003'
ORGD='44444444-0000-4000-8000-000000000004'
UID1='aaaaaaaa-0000-0000-0000-0000000000a1'

pgq() { su postgres -c "psql -qAt -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }

echo "── Carrera 4: hueco documental final, VIVO vs DESCARGABLE (mismo lock)"
pgq "update organization_modules set access_expires_at=now()+interval '2 days' where organization_id='$ORGC' and module_code='traceability_6632'"
pgq "delete from trazadoc_file_document_versions where organization_id='$ORGC'"
pgq "delete from trazadoc_file_documents where organization_id='$ORGC'"
pgq "delete from trazadoc_documents where organization_id='$ORGC' and module_key='cpr'"
pgq "insert into trazadoc_documents (organization_id, module_key) values ('$ORGC','cpr')"
CALL_TD="set role authenticated; set app.uid='$UID1'; insert into trazadoc_documents (organization_id, module_key) values ('$ORGC','cpr');"
CALL_FD="set role authenticated; set app.uid='$UID1'; insert into trazadoc_file_documents (organization_id, created_by, title) values ('$ORGC','$UID1','Carrera');"
set +e
su postgres -c "psql -qAt -d $DB -c \"$CALL_TD\"" >/tmp/c4a 2>&1 & P1=$!
su postgres -c "psql -qAt -d $DB -c \"$CALL_FD\"" >/tmp/c4b 2>&1 & P2=$!
wait $P1; E1=$?; wait $P2; E2=$?
set -e
N=$(pgq "select (select count(*) from trazadoc_documents where organization_id='$ORGC' and module_key='cpr') + (select count(*) from trazadoc_file_documents where organization_id='$ORGC')")
ERRS=$(grep -hc "RESOURCE_LIMIT_EXCEEDED" /tmp/c4a /tmp/c4b | paste -sd+ | bc)
echo "exits: $E1/$E2 · documentos lógicos: $N · rechazos por límite: $ERRS"
[ "$N" = "2" ] && [ "$ERRS" = "1" ] && [ $((E1+E2)) -eq 1 ] || { echo 'CARRERA 4 FALLIDA'; cat /tmp/c4a /tmp/c4b; exit 1; }

echo "── Carrera 5: dos begins CPR que en conjunto superan la cuota"
# Estado tras el smoke T9F.4: Org D FULL con 497 MB comprometidos → quedan
# 3 MB. Dos reservas de 2 MB compiten: solo cabe UNA.
pgq "delete from storage_upload_intents where organization_id='$ORGD' and status='pending'"
EV=$(pgq "insert into evidences (organization_id, name) values ('$ORGD','Carrera 5a') returning id")
EV2=$(pgq "insert into evidences (organization_id, name) values ('$ORGD','Carrera 5b') returning id")
CALL_B1="set role authenticated; set app.uid='$UID1'; select begin_cpr_storage_upload('evidence','$EV','r1.pdf', 2*1024*1024, 'application/pdf');"
CALL_B2="set role authenticated; set app.uid='$UID1'; select begin_cpr_storage_upload('evidence','$EV2','r2.pdf', 2*1024*1024, 'application/pdf');"
set +e
su postgres -c "psql -qAt -d $DB -c \"$CALL_B1\"" >/tmp/c5a 2>&1 & P1=$!
su postgres -c "psql -qAt -d $DB -c \"$CALL_B2\"" >/tmp/c5b 2>&1 & P2=$!
wait $P1; E1=$?; wait $P2; E2=$?
set -e
N=$(pgq "select count(*) from storage_upload_intents where organization_id='$ORGD' and status='pending' and expires_at>now()")
ERRS=$(grep -hc "STORAGE_QUOTA_EXCEEDED" /tmp/c5a /tmp/c5b | paste -sd+ | bc)
echo "exits: $E1/$E2 · intents pendientes: $N · rechazos por cuota: $ERRS"
[ "$N" = "1" ] && [ "$ERRS" = "1" ] && [ $((E1+E2)) -eq 1 ] || { echo 'CARRERA 5 FALLIDA'; cat /tmp/c5a /tmp/c5b; exit 1; }

echo "CONCURRENCIA T9F.4 · TODO EN VERDE (carreras 4-5)"
