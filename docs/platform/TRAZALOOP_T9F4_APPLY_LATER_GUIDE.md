# Guía de aplicación posterior · Sprint T9F.4 — Contabilidad final, mutaciones directas y reservas CPR/TrazaDocs

Aplicar la migración `0101` (acumulada T9F.1+T9F.2+T9F.3+T9F.4) sobre **staging** desde una máquina autorizada con Supabase CLI vinculada y `.env.local` de staging. Esta guía NO fue ejecutada durante el sprint (prohibido conectar a Supabase desde ese entorno). Sustituye a las guías T9F.1/T9F.2/T9F.3 (la 0101 es un único archivo acumulado que se aplica UNA sola vez).

**Jamás:** `db reset` · `TRUNCATE` (con o sin CASCADE) · `migration repair` sin inconsistencia real demostrada · editar/renombrar `0100` · crear `0102` · limpiar datos de staging · aplicar contra producción.

## A. Verificación previa (pasos 1–6)

1. **Respaldar staging**: snapshot/backup completo desde el panel de Supabase (base + Storage) y confirmar que el punto de restauración existe antes de continuar.
2. Confirmar `0100` aplicada: `supabase migration list` debe mostrar `0100_organization_module_access_modes_and_demo_trial` como aplicada, y su archivo local con hash `sha256 = 0bfe816794287b2b5fcbcebc0cbca7fa3db677cdd20e289cb81bc5f8008eea41`.
3. Confirmar `0101` NO aplicada: ausente de la lista de aplicadas y presente una sola vez en `supabase/migrations/`.
4. Confirmar que NO existe `0102*` en `supabase/migrations/` (`ls supabase/migrations | grep 0102` vacío).
5. Ejecutar `supabase migration list` completo y archivar la salida (evidencia del estado previo).
6. Congelar despliegues de la aplicación hasta el paso 28 (el código T9F.4 es fail-closed sin 0101, pero las cargas CPR quedarían bloqueadas: aplicar BD primero minimiza la ventana).

## B. Aplicar la migración (pasos 7–13)

7. Revisar en el archivo 0101 la **tabla de reservas** `storage_upload_intents` (§6b): columnas, checks de bucket/ruta/tamaño, índice único parcial de idempotencia y revoke a clientes.
8. Revisar los **16 triggers de límite** `t_*_limit` (incluido `t_trazadoc_file_documents_limit` con recurso `documents_trazadocs`) y los 3 triggers físicos `t_*_physical_guard`.
9. Revisar los tres `drop policy` de §3b (`trazadoc_file_documents_delete`, `evidences_delete`, `textile_evidences_delete`) y confirmar en staging que esas políticas EXISTEN hoy (si alguna falta, detenerse e investigar — el historial diverge).
10. Revisar las políticas de **UPDATE** vigentes de las tres tablas (0019/0057/0075): 0101 NO las toca; la inmutabilidad física la aplican los triggers.
11. Revisar los grants de `count_module_resource` (execute a `authenticated` con guard por `auth.uid()`) y el `revoke … from authenticated` de `record_textile_upload_intent_cleanup`.
12. Revisar `begin_cpr_storage_upload`, `finalize_evidence_attachment`, `finalize_trazadoc_file_document_initial_version_v2`, `replace_trazadoc_file_document_v2`, `cancel_cpr_storage_upload` y `resolve_cpr_upload_intent_object` (service-only).
13. `supabase db push --dry-run`, verificar que SOLO aparece 0101, y entonces `supabase db push`. Archivar la salida completa. Ante cualquier error: NO reintentar a ciegas; el archivo es re-aplicable solo desde cero (restaurar el respaldo si quedó a medias — 0101 no usa transacción explícita por los `create index`).

## C. Pruebas dirigidas post-aplicación (pasos 14–25)

Con un usuario QA y una organización QA Demo recién creada (borrarlas al final; la suite RLS del paso 26 ya automatiza todo esto — estos pasos son la verificación HUMANA mínima):

14. **Límite combinado**: crear 1 documento vivo + 1 descargable (Demo=2) y verificar que el tercero — en cualquiera de las dos tablas — recibe `RESOURCE_LIMIT_EXCEEDED`.
15. **INSERT directo**: repetir el tercero por la API REST con el token del usuario: mismo rechazo (la barrera es la BD).
16. **DELETE directo**: `delete` por la API sobre la evidencia/el descargable → 0 filas afectadas; la fila persiste.
17. **UPDATE físico directo**: `update storage_path` por la API → `PHYSICAL_FIELD_IMMUTABLE`; `update title/name` → permitido.
18. **Reserva CPR**: `rpc begin_cpr_storage_upload('evidence', …)` con un tamaño que exceda la cuota Demo → `STORAGE_QUOTA_EXCEEDED`; con uno válido → intent con ruta `org/<evidencia>/<archivo>` visible SOLO vía service (la tabla está vetada a clientes).
19. **Reserva TrazaDocs**: alta real de un descargable desde la UI (Preview del paso 28) o vía `begin('trazadoc_initial')` + upload + `finalize_…_v2`: documento en v1 con la ruta del intent y una única fila de versión.
20. **Dos cargas concurrentes**: dos `begin` simultáneos cuya suma exceda la cuota → exactamente un `STORAGE_QUOTA_EXCEEDED` y un solo intent pendiente.
21. **Failed con objeto**: begin + upload + `cancel` → la vista sigue contando esos bytes; `resolve_cpr_upload_intent_object` (service) tras retirar el objeto → libera.
22. **Expired con objeto**: envejecer un intent (service) → deja de reservar pero sigue contando; resolverlo como en 21.
23. **Idempotency key vencida**: begin con clave, envejecer, repetir el begin con la MISMA clave → sin `unique_violation`; el intent se revive `pending` vigente.
24. **Conteo ajeno**: `rpc count_module_resource` con un usuario de OTRA organización → `null`; con el miembro → el número real.
25. **Tamaño desconocido**: sembrar (service) un candidato con `size_bytes null` → `storage_unknown_size_count ≥ 1` en la vista y `begin` bloqueado con `STORAGE_UNVERIFIABLE`; retirar el sembrado.

## D. Suites, despliegue y observación (pasos 26–30)

26. Ejecutar la suite RLS T9F.4: `npm run test:t9f4-rls` (23 áreas; requiere `.env.local` de staging). Ejecutar también `npm run test:t9f3-rls` y las suites RLS previas (`test:rls`, T9E.1–T9E.4, t9f, t9f1, t9f2). Resultado esperado: todo en verde; cualquier rojo detiene el proceso ANTES de desplegar.
27. Verificar la **limpieza completa** que reporta cada suite: cero organizaciones/usuarios/objetos/intents/reservas/candidatos del run (las suites fallan solas si queda un residuo; confirmar además con un vistazo a `storage_upload_intents` y `storage_orphan_candidates` filtrando por los nombres `t9f3_*`/`t9f4_*`).
28. Desplegar el código del sprint en un **Preview** de Vercel apuntando a staging (jamás producción).
29. **Smoke humano** en el Preview: crear evidencia CON archivo (flujo intent→upload→finalize transparente), subir y reemplazar un descargable, editar títulos, intentar borrar con la RPC desde la UI, vencer el Demo de una organización QA y confirmar que nada muta (tampoco borrar), y revisar la página de uso (reservas y conteo documental combinado visibles).
30. Revisar logs (Vercel + Supabase) durante al menos un ciclo de uso real: sin errores de `PHYSICAL_FIELD_IMMUTABLE`/`MODULE_ACCESS_BLOCKED` inesperados en flujos legítimos, sin `STORAGE_UNVERIFIABLE` persistente (indicaría desconocidos reales que reconciliar con `scripts/t9f3-size-reconciliation/`, dry-run primero).

## E. Rollback y líneas rojas (pasos 31–33)

31. **Rollback de código**: revertir el despliegue del Preview / volver al build anterior. El código T9F.3 anterior sigue funcionando contra la BD con 0101 (las RPCs v1 permanecen); el código T9F.4 SIN 0101 falla cerrado.
32. **Rollback SQL seguro** (solo si es imprescindible): ANTES de tocar nada verificar `select count(*) from storage_upload_intents where status='pending'` = 0, cero textiles pendientes, cero `delete_failed` sin resolver y `unknown_size_count=0` en todas las organizaciones — con pendientes, NO se revierte (se regalaría almacenamiento fantasma). Orden: retirar triggers (`drop trigger t_*_physical_guard`, `t_trazadoc_file_documents_limit`) → restaurar funciones desde sus archivos fuente (0057/0059/0097/0098 están intactos en el repositorio; las versiones T9F.2/T9F.3 de vista/snapshot, en el historial del archivo 0101) → recrear las tres políticas de DELETE con su texto literal de 0019/0057/0075 SOLO si se decide reabrir el DELETE directo → `storage_upload_intents` se conserva (tabla vacía no estorba; con filas, JAMÁS se elimina). Sin `db reset`, sin TRUNCATE, sin borrar datos/auditoría, sin desactivar RLS; la FK de `audit_log` no se recrea.
33. **Qué nunca debe hacerse**: aplicar contra producción sin pasar TODO lo anterior en staging; `migration repair` para "cuadrar" la lista sin inconsistencia demostrada; editar 0100 o el 0101 YA aplicado (cambios posteriores van en 0102+ SOLO a partir de entonces); borrar intents/candidatos pendientes "para limpiar"; conceder `resolve_*`/`record_*` a `authenticated`; debilitar Storage RLS 0099; usar `organization_subscriptions` como autoridad.
