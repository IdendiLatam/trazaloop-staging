# Trazaloop · PCR-02.3 — Plan de rollback (compensatorio)

Principio: **el rollback jamás borra historia**. Una vez aplicada la 0104,
habrá órdenes con `history_locked_at` asignado (por backfill o por cierres
posteriores); eliminar la columna o los triggers sin análisis destruiría esa
información y reabriría el bypass.

## App (seguro, primero)

Revert del deploy en Vercel a v1.0.1 (o al release previo). La 0104 es
compatible hacia atrás (columna nullable, triggers transparentes): la app
vieja funciona; el candado sigue protegiendo en BD (las finalizadas y
reabiertas no podrán borrarse — comportamiento deseado incluso durante un
rollback).

## Base de datos

* **Preferido — no revertir**: los triggers de la 0104 solo restringen
  borrados/estados ilegales y gestionan una columna aditiva; no bloquean la
  operación normal de v1.0.1.
* **Compensatorio, solo con incidente real y tras backup**:
  1. Desactivar temporalmente la barrera de DELETE:
     `alter table production_orders disable trigger t_production_orders_protect_history;`
     (revierte el bloqueo sin perder el candado ni los datos).
  2. Si hiciera falta congelar también la gestión del candado:
     `alter table production_orders disable trigger t_production_orders_history_lock;`
     — la columna y sus valores permanecen para reactivar después.
  3. **No** ejecutar `drop column history_locked_at` salvo decisión
     explícita de negocio documentada: perdería la evidencia de qué órdenes
     entraron al historial y no es recuperable sin repetir el backfill
     (cuya parte de audit_log podría ya no reflejar el mismo estado).
* Reactivación: `enable trigger` de ambos; verificar con la consulta de la
  guía de deploy que ninguna finalizada quede sin candado (y re-ejecutar el
  backfill de la 0104 si aplica — es idempotente).

## Qué NO hacer

`drop` de columna/triggers como primera reacción, ediciones manuales de
`history_locked_at` (la BD las descarta por diseño), o borrar filas de
`audit_log`.
