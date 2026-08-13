# PCR-02.4 · Production Deploy (guía — NO ejecutada en este sprint)

Reemplaza a las guías PCR-02/02.1/02.2/02.3. Production está en v1.0.1 con
migraciones hasta 0103; PCR-02 completo (con este hardening) se despliega
como una unidad.

## 1 · Pre-checks
- `npm run test:all` y `npm run test:pcr02-4-db` en local: EXIT 0.
- Backup/branch de la base de Production.
- Confirmar que `supabase/migrations/` remoto termina en 0103.

## 2 · Migración (única)
Aplicar `0104_pcr02_internal_consumption_and_completeness.sql` con el flujo
aprobado del equipo (dashboard SQL o `supabase db push` desde CI autorizado).
Idempotente (`create or replace` / `drop trigger if exists`); incluye §2a–§2e
y el backfill del candado histórico. Verificaciones inmediatas (§5 de la
propia migración): con una orden CERRADA, cualquier INSERT/UPDATE/DELETE de
`batch_consumption`, `output_batch_consumption` o `batch_composition`, el
alta/baja de `output_batches` y los cambios de orden/producto/cantidad/
código deben fallar con «La orden está cerrada o cancelada. Reábrela antes
de modificar su trazabilidad.»; la reapertura pura debe pasar y conservar
`history_locked_at`.

## 3 · Ventana de compatibilidad (§56)
La app v1.0.1 no ofrece mutaciones sobre órdenes cerradas en sus flujos
normales; el riesgo residual (clientes con pantallas desactualizadas o API
directa) recibe el error de dominio — endurecimiento deliberado. Desplegar
la app inmediatamente después de la migración.

## 4 · Deploy de la app
`vercel deploy` + promote del artefacto que contiene PCR-02.4 (este ZIP).

## 5 · Smoke posterior
Cerrar una orden de prueba → verificar que en su detalle y en
`/traceability/output-batches` solo hay consulta + «Reabrir orden» →
reabrirla → corregir un consumo y la composición → cerrarla de nuevo →
confirmar congelación y que el DELETE de la orden sigue vetado.
