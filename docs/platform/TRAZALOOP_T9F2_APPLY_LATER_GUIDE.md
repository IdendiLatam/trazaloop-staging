# Guía de aplicación posterior · Sprint T9F.2 — SUSTITUIDA

**Esta guía quedó obsoleta en el Sprint T9F.3 y NO debe seguirse.**

La migración `0101_t9f1_module_access_hardening.sql` fue ACUMULADA de nuevo
en T9F.3 (mismo archivo, nunca aplicado hasta entonces): incluye además los
triggers atómicos de límites por recurso, las reservas de evidencias
Textiles (begin v2 idempotente + finalize revalidado), el ciclo seguro de
eliminación física (pending_delete → deleted/delete_failed), el registro de
objetos endurecido (server-only), los tamaños desconocidos que bloquean
cargas y el retiro de la FK de `audit_log` hacia `organizations`. Aplicar la
versión T9F.2 de aquel archivo dejaría el sistema en un estado intermedio
que el código de la aplicación ya no espera (las acciones de borrado y el
begin textil invocan RPCs que solo existen en la versión T9F.3: fallarían
cerrado).

**Usar en su lugar:** `docs/platform/TRAZALOOP_T9F3_APPLY_LATER_GUIDE.md`
(31 pasos: verificación previa con `db push --dry-run`, aplicación única de
0101, despliegue del código, suites RLS T9F.3 + regresiones, reconciliación
de tamaños desconocidos en dry-run, operación del ciclo de eliminación y
rollback con precondiciones duras).
