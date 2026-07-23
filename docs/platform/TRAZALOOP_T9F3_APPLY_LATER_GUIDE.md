# Guía de aplicación posterior · Sprint T9F.3 — SUSTITUIDA

**Esta guía quedó obsoleta en el Sprint T9F.4 y NO debe seguirse.**

La migración `0101_t9f1_module_access_hardening.sql` fue ACUMULADA de nuevo
en T9F.4 (mismo archivo, nunca aplicado hasta entonces): incluye además el
límite documental combinado, el bloqueo de DELETE/UPDATE físicos directos,
las reservas atómicas CPR/TrazaDocs y la contabilidad de intents no
resueltos. Aplicar 0101 siguiendo esta guía dejaría sin probar exactamente
esas superficies.

**Usar en su lugar:** `TRAZALOOP_T9F4_APPLY_LATER_GUIDE.md` (33 pasos).

---

_Texto original T9F.3 (solo referencia histórica):_

# Guía de aplicación posterior · Sprint T9F.3

**Para ejecutar desde una máquina AUTORIZADA** (con acceso a Supabase staging
y `.env.local` válido). Sustituye a las guías T9F.1 y T9F.2: la migración
`0101` es ahora **ACUMULADA (T9F.1 + T9F.2 + T9F.3)** y se aplica **una sola
vez**. Orden crítico: **base de datos primero, código después** — el código
T9F.3 invoca RPCs que solo existen con 0101 (`begin_…_v2`,
`queue_and_delete_*`, `resolve_storage_deletion`): sin ella falla CERRADO
(borrados de documentos/evidencias y cargas textiles bloqueados: seguro, pero
disruptivo).

## A. Verificación previa (pasos 1–6)

1. Confirmar que 0101 NO fue aplicada antes:
   `select 1 from pg_views where viewname = 'v_organization_module_usage';`
   debe devolver **cero filas** (si devuelve una, detenerse: comparar la
   definición desplegada con el archivo del repositorio antes de continuar).
2. Confirmar que NO existe `0102` en `supabase/migrations/` y que la lista de
   migraciones del repositorio termina en `0101` (`supabase migration list`
   debe mostrar 0100 como la última aplicada en remoto).
3. Verificar la integridad de 0100 aplicada:
   `select proname from pg_proc where proname in ('set_organization_module_access','resolve_organization_module_access','provision_new_organization_modules');`
   → 3 filas. SHA-256 local del archivo 0100 = `0bfe8167…8eea41`.
4. Ejecutar `supabase db push --dry-run` y confirmar que la ÚNICA migración
   pendiente es `0101_t9f1_module_access_hardening.sql`.
5. Respaldar (snapshot/branch de Supabase) — la migración es aditiva y no
   destructiva, pero el respaldo es política estándar.
6. Congelar despliegues de la aplicación hasta el paso 15.

## B. Aplicar la migración (pasos 7–12)

7. Fuente única: `supabase/migrations/0101_t9f1_module_access_hardening.sql`
   del ZIP de ESTA entrega (jamás versiones anteriores del archivo).
8. Aplicar (`supabase db push`, o el archivo completo en el SQL editor). Debe
   terminar sin errores.
9. Verificar triggers: `select count(*) from pg_trigger where tgname like
   't\_%\_limit' escape '\';` → **15**.
10. Verificar funciones nuevas: `select proname from pg_proc where proname in
    ('enforce_module_resource_limit','count_module_resource','module_storage_snapshot','begin_textile_evidence_upload_v2','queue_and_delete_trazadoc_draft','queue_and_delete_evidence','resolve_storage_deletion');`
    → 7 filas; y la vista expone `storage_reserved_bytes` y
    `storage_unknown_size_count`.
11. Verificar server-only:
    `select has_function_privilege('authenticated','public.register_storage_orphan(uuid,text,text,text,bigint)','execute');` → **false**;
    ídem para `resolve_storage_deletion(text,text,text,text)` y
    `finalize_textile_evidence_upload_server(uuid,uuid,bigint,text)`.
12. Prueba mínima de barrera con un usuario de prueba miembro de una
    organización Demo: dos INSERT directos de proveedor por la API → el
    segundo debe fallar con `RESOURCE_LIMIT_EXCEEDED`; borrar la fila creada.

## C. Desplegar el código (pasos 13–16)

13. Desplegar la aplicación de esta entrega (mismo commit del ZIP).
14. Humo funcional: crear un proveedor desde la interfaz (Demo al límite debe
    mostrar el mensaje contractual), iniciar una carga de evidencia textil
    (debe crear intent) y cancelarla.
15. Reactivar los despliegues.
16. Verificar en logs que no aparecen errores `RPC_FAILED`/`42883` (función
    inexistente): indicarían orden invertido (código sin 0101).

## D. Suites RLS (pasos 17–22)

17. `npm run test:t9f3-rls` — las 25 áreas en verde, INCLUIDA la limpieza
    total (área 25) con cero residuos; la suite termina con exit 0.
18. `npm run test:t9f1-rls` y `npm run test:t9f2-rls` — regresión; ambas
    deben eliminar sus organizaciones POR COMPLETO (tras 0101 la
    neutralización cuenta como residuo y pondría la suite en rojo).
19. Suites T9E (`test:t9e1-rls` … `test:t9e4-rls` según scripts del
    repositorio) — sus fixtures elevan ahora los módulos a Extra; deben
    seguir en verde.
20. `tests/rls/isolation.test.ts` — el aislamiento intacto bajo los triggers.
21. Verificar que no quedaron organizaciones `t9f3_*`, `[QA` ni usuarios
    `@test.trazaloop.dev` del run (consultas por prefijo).
22. Registrar los resultados (fecha, commit, salidas) en el canal del equipo.

## E. Reconciliación de tamaños desconocidos (pasos 23–26)

23. `npx tsx scripts/t9f3-size-reconciliation/reconcile.ts` (DRY-RUN) —
    inventario de registros con tamaño desconocido en staging.
24. Revisar el reporte: los objetos SIN metadata o inexistentes exigen
    decisión manual (¿referencia inválida? ¿objeto perdido?). Jamás inventar
    tamaños.
25. Si el dry-run es correcto: repetir con `--apply` y volver a ejecutar el
    dry-run → cero desconocidos reconciliables restantes.
26. Confirmar en la vista: `storage_unknown_size_count = 0` en las
    organizaciones afectadas (las cargas del módulo quedan desbloqueadas).

## F. Operación del ciclo de eliminación (pasos 27–28)

27. Monitorear `storage_orphan_candidates` con `status='delete_failed'`: cada
    fila conserva `error_code` y sigue CONTANDO en la cuota. El reintento es
    server-only e idempotente: volver a ejecutar el retiro
    (`storage.remove` + `resolve_storage_deletion`) desde una tarea de
    servidor o manualmente con service role.
28. `pending_delete` envejecidos (creados y nunca resueltos) indican una
    acción interrumpida: mismo reintento server-only.

## G. Rollback (pasos 29–31) — solo con decisión explícita

29. **Precondición dura**: verificar CERO reservas activas
    (`select count(*) from textile_evidence_upload_intents where status='pending' and expires_at > now();` → 0)
    y CERO `pending_delete`/`delete_failed` sin resolver en
    `storage_orphan_candidates`. Mientras existan, revertir regalaría
    almacenamiento fantasma: resolverlos primero (sección F) o abortar.
30. Revertir el código de la aplicación al despliegue anterior a esta
    entrega (el código T9F.2 no invoca las RPCs nuevas).
31. En base de datos, SOLO después del paso 30 y sin `db reset`/TRUNCATE:
    restaurar `begin_textile_evidence_upload` y
    `finalize_textile_evidence_upload_server` con sus definiciones de
    0097/0098 (archivos del repositorio como fuente); restaurar vista,
    allowance y `register_storage_orphan` con la versión T9F.2 del archivo
    0101 (historial del repositorio); retirar los 15 triggers y las funciones
    nuevas. La FK de `audit_log` NO se recrea (exigiría que no existan
    eventos de organizaciones ya eliminadas; el histórico manda). Nada de
    esto borra datos de negocio, objetos de Storage ni auditoría.
