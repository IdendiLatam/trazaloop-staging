#!/usr/bin/env bash
#
# Trazaloop · PE-05B2W · Despliega el Preview y REAPUNTA el alias estable.
#
# POR QUÉ EXISTE
#
# Cada despliegue de Vercel tiene su propia URL inmutable. Si la URL del
# webhook registrada en Wompi apunta a una de ellas, cada commit deja al
# proveedor hablando con código viejo —y obliga a una persona a editar el panel
# de Wompi cada vez—.
#
# El alias resuelve eso: Wompi apunta SIEMPRE al mismo sitio y el alias apunta
# al último despliegue. Pero hay que reapuntarlo, y olvidarlo es justo el fallo
# que nadie nota hasta que un evento se procesa con código de ayer.
#
# Los despliegues desde la CLI no crean el alias de rama automáticamente: eso
# solo lo hace la integración de Git. Por eso se hace aquí, a mano y explícito.
#
# Correr: bash scripts/pe05b2w/desplegar-preview.sh
set -euo pipefail

ALIAS="trazaloop-pe05-sandbox.vercel.app"
SCOPE="idendi-latam-s-projects"

echo "· desplegando Preview…"
URL="$(npx vercel deploy --target=preview --yes --scope "$SCOPE" 2>&1 \
  | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)"
[ -n "$URL" ] || { echo "BLOCKED: el despliegue no devolvió URL." >&2; exit 1; }
echo "  despliegue: $URL"

echo "· reapuntando el alias estable…"
npx vercel alias set "$URL" "$ALIAS" --scope "$SCOPE" >/dev/null
echo "  https://$ALIAS → $URL"

# Y se comprueba que sigue protegido: un alias que dejara de estarlo sería un
# Preview público, que es exactamente lo que no queremos.
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "https://$ALIAS/api/billing/webhooks/wompi")"
if [ "$CODE" != "401" ]; then
  echo "BLOCKED: sin bypass el webhook respondió $CODE, se esperaba 401." >&2
  exit 2
fi
echo "  protección verificada (401 sin bypass)"
