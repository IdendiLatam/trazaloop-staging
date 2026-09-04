#!/usr/bin/env bash
# Trazaloop · PE-05B5C · Dispara UNA pasada EN SECO contra el Preview estable.
#
# En seco de verdad: la ruta desplegada no puede cobrar —le pasa el doble y
# llama siempre con `dryRun`—, así que esto descubre y decide, y no mueve un
# peso.
#
# El secreto no se imprime, no se guarda y no se pide por pantalla: sale del
# entorno de quien ejecuta, igual que el resto de la automatización.
set -euo pipefail
ALIAS="https://trazaloop-pe05-sandbox.vercel.app"
: "${BILLING_RENEWAL_RUNNER_SECRET:?falta el secreto en el entorno de quien ejecuta}"

echo "· pasada EN SECO contra ${ALIAS}"
curl -sS -X POST "${ALIAS}/api/billing/renewals/run" \
  -H "Content-Type: application/json" \
  -H "x-billing-runner-secret: ${BILLING_RENEWAL_RUNNER_SECRET}" \
  ${VERCEL_AUTOMATION_BYPASS_SECRET:+-H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}"} \
  -d '{"limit":50}' | python3 -m json.tool
