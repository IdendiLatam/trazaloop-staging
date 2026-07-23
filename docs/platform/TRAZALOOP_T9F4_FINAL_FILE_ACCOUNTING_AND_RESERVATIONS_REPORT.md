# Trazaloop · Sprint T9F.4 — Cierre final de contabilidad física, operaciones directas y reservas atómicas CPR/TrazaDocs

**Informe técnico de entrega.** Estado: implementado y validado localmente (arnés SQL con smoke T9F.3 **32/32**, smoke T9F.4 **40/40** y **5 carreras de concurrencia REALES** en verde; `test:all` **1092 ✔ / 0 ✘** y `build` en verde); migración `0101` **acumulada T9F.1+T9F.2+T9F.3+T9F.4 y NO aplicada**; suites RLS **preparadas, no ejecutadas** desde este entorno. Ningún resultado no ejecutado se declara aprobado.

## 1. Resumen ejecutivo

T9F.4 cierra los últimos bloqueadores del sistema comercial por módulo antes de aplicar 0101. Tras este sprint es imposible, **desde la base de datos** (no solo desde la interfaz): superar el límite documental mediante descargables; eliminar filas físicas evitando el ciclo `pending_delete`; mutar directamente rutas o tamaños; superar la cuota CPR/TrazaDocs con cargas concurrentes; dejar objetos de intents failed/vencidos fuera de la contabilidad; sondear conteos ajenos vía `count_module_resource`; convertir tamaños desconocidos en cero; bloquear una operación idempotente con un intent vencido; subir un objeto sin referencia durable previa; o borrar mediante RPC con el módulo vencido/deshabilitado. La limpieza defectuosa de las pruebas RLS quedó corregida y blindada estructuralmente.

## 2. Rama de entrada

Estado completo entregado como `trazaloop2-sprint-T9F3.zip` (verificado byte a byte contra el árbol de trabajo antes de tocar nada: `diff -rq` limpio con las exclusiones estándar). La integración de GitHub solo como fuente de lectura; sin commits, push, PRs ni despliegues.

## 3. Estado recibido de T9F.3

0101 acumulada (T9F.1+2+3) con: 15 triggers atómicos de límite, reservas de evidencias Textiles (begin/finalize v2), ciclo `pending_delete → deleted/delete_failed`, registro server-only de huérfanos, vista de uso v3 con reservas y desconocidos, FK de `audit_log` retirada. `test:all` 694 ✔. Los 11 bloqueadores de la revisión independiente permanecían abiertos.

## 4. Auditoría inicial

Se inspeccionaron: `package.json`, `app/`, `lib/`, `server/`, `supabase/` (0019, 0043, 0047, 0050, 0057, 0059, 0075, 0082, 0084, 0093–0101), `tests/`, `docs/`, `scripts/`, los cuatro informes y guías previos, y todas las superficies enumeradas en §6 del plan. Hallazgos clave: (1) 0059 fija la **semántica de producto** — `documents_trazadocs_count = trazadoc_documents + trazadoc_file_documents` — que la vista modular T9F.2/T9F.3 no replicaba; (2) `trazadoc_file_documents` es CPR-only (sin `module_key`; Textiles usa solo documentos vivos sin archivos); (3) las políticas de DELETE directo de 0019/0057/0075 seguían activas; (4) ninguna tabla impedía el UPDATE de campos físicos; (5) CPR/TrazaDocs subían tras un pre-chequeo no transaccional; (6) `count_module_resource` usaba `current_user` dentro de una DEFINER (el guard quedaba SIEMPRE en bypass) y estaba concedida a `authenticated`; (7) `register_storage_orphan` y los upserts de la cola usaban `greatest(coalesce(…,0))`; (8) el índice parcial de idempotencia (`status='pending'`) bloqueaba con intents vencidos; (9) `record_textile_upload_intent_cleanup` (0097) estaba concedida a `authenticated` — un cliente podía "confirmar" retiros falsos; (10) `deleteFileDocumentRow` hacía DELETE directo de la fila vacía; (11) la limpieza RLS usaba desestructuración posicional de `Promise.all`.

## 5. Bloqueadores confirmados

Los 11 de la revisión, todos reproducidos sobre el código real (sección 4) y todos cerrados en este sprint — más el hallazgo adicional (9 de la lista anterior) de la RPC de limpieza textil concedida a clientes, cerrado también.

## 6. Límite TrazaDocs anterior

`count_module_resource` y la vista contaban SOLO `trazadoc_documents` (module_key). Un usuario podía crear descargables ilimitados en Demo: el trigger de `trazadoc_documents` no veía la otra tabla y `trazadoc_file_documents` no tenía trigger.

## 7. Límite TrazaDocs final

`documents_trazadocs` (fila CPR) = `count(trazadoc_documents where module_key='cpr') + count(trazadoc_file_documents)`, en el conteo autoritativo, en la vista y en la allowance. Nuevo trigger `t_trazadoc_file_documents_limit` con recurso `documents_trazadocs` del módulo `traceability_6632`: **mismo advisory lock** (`module_resource:org/traceability_6632/documents_trazadocs`) que los vivos, así que dos INSERT simultáneos, uno en cada tabla, se serializan entre sí (carrera 4 real en verde: 1 creación + 1 `RESOURCE_LIMIT_EXCEEDED`).

## 8. Conteo lógico de documentos

`documents_trazadocs_count` = documentos LÓGICOS, no objetos físicos. Las versiones históricas (`trazadoc_file_document_versions`) **no consumen unidades** (el conteo jamás las lee — aserción estructural) pero **sí cuentan almacenamiento** cada una con SU tamaño (vista/snapshot). Demostrado en local (F5).

## 9. Protección de trazadoc_file_documents

Cubre INSERT directo por la API (trigger INVOKER), creación desde Server Action (misma vía), concurrencia (lock compartido), y el descarte controlado del borrador vacío (`discard_empty_trazadoc_file_document`). No existe importación ni duplicación/reactivación de descargables en el producto; si se añaden, heredan el trigger.

## 10. DELETE directo anterior

`evidences_delete` (0019: admin/quality y status≠valid), `trazadoc_file_documents_delete` (0057: draft; admin/quality o consultant creador) y `textile_evidences_delete` (0075: admin/quality y status≠accepted) permitían borrar la última referencia de un objeto sin encolar nada: el objeto quedaba en Storage y desaparecía de la contabilidad.

## 11. DELETE directo final

Las tres políticas se **eliminan** en 0101 §3b (retirar una política permisiva ENDURECE la RLS). Únicas vías: `queue_and_delete_trazadoc_draft`, `queue_and_delete_evidence` y la nueva `queue_and_delete_textile_evidence` — DEFINER, espejan EXACTAMENTE el predicado retirado, encolan `pending_delete` (cada objeto con su tamaño, upsert con combinación segura) y borran la fila en UNA transacción, ahora con gate comercial. El descarte del borrador vacío del maestro (compensaciones de creación) pasa por `discard_empty_trazadoc_file_document` (solo draft, `storage_path=''`, sin versiones, creador o admin/quality). En staging el DELETE directo del miembro afecta 0 filas (área 7 de la suite RLS preparada).

## 12. UPDATE físico anterior

Las políticas de UPDATE de 0019/0057/0075 permitían a un miembro modificar `storage_path`, `size_bytes`, `file_path`, `file_size_bytes`, `file_name` o `mime_type`: reducción artificial del uso o desvinculación de objetos.

## 13. Inmutabilidad de campos físicos

`forbid_physical_field_mutation()` — BEFORE UPDATE, **SECURITY INVOKER** (misma decisión demostrada en T9F.3: en una DEFINER `current_user` es el dueño), columnas por `TG_ARGV`, comparación `is distinct from` sobre `to_jsonb(old/new)`, error `PHYSICAL_FIELD_IMMUTABLE` con la columna en `detail`. Triggers: `t_evidences_physical_guard` (storage_path, size_bytes), `t_trazadoc_file_documents_physical_guard` (storage_path, size_bytes, file_name, mime_type), `t_textile_evidences_physical_guard` (file_path, file_size_bytes, file_name, file_mime_type). Las vías controladas (finalize/replace/reconciliación) son funciones DEFINER y quedan fuera del ámbito del trigger por diseño. `trazadoc_file_document_versions` no tiene política de UPDATE ni de DELETE (0057): ya era inmutable para clientes.

## 14. Campos funcionales editables

Título, nombre, descripción, categoría, observaciones, estado documental permitido y demás metadatos no físicos siguen editables con las políticas existentes (demostrado en local G3/G5/G7 y en la suite RLS área 9). Ninguna fila se volvió inmutable.

## 15. Reserva general

Nueva tabla `storage_upload_intents` — la MISMA arquitectura que los intents Textiles de 0094 (sin tercer sistema): organización, módulo (`check = 'traceability_6632'`), `resource_type` (evidence | trazadoc_initial | trazadoc_replace), `resource_id`, bucket y **ruta EXACTA derivadas de la fila de dominio**, nombre original/seguro, tamaño y MIME declarados, TTL, `idempotency_key` (índice único parcial por organización+creador+clave con `status='pending'`), creador, `finalized_at`/`cancelled_at`, **`storage_resolved_at`** (resolución física confirmada) y contadores de limpieza. RLS habilitada SIN políticas + revoke total a clientes: todo pasa por las RPCs.

## 16. Reserva CPR

`begin_cpr_storage_upload` (DEFINER, authenticated): valida sesión, tipo, archivo (nombre, 0 < tamaño ≤ 20 MB, MIME), deriva organización/bucket/ruta de la fila (evidencia sin archivo → `org/<id>/<safe>`; el navegador jamás aporta rutas), exige membresía y `resolve_organization_module_access` allowed, toma el advisory lock `module_storage:org/traceability_6632`, expira atómicamente la clave vencida, revive el intent no finalizado de la misma ruta (una sola reserva por objeto), y aplica el fail-closed de T9F.3: `unknown=0`, `conflicts=0` y `committed + reservado + entrante ≤ cuota` del catálogo (`plan_definitions` por `access_mode`). `organization_subscriptions` no participa (aserción estructural). Dos begins simultáneos: 1 reserva + 1 `STORAGE_QUOTA_EXCEEDED` (carrera 5 real en verde).

## 17. Reserva TrazaDocs CPR

Mismo `begin` con `trazadoc_initial` (ruta `org/document_files/<doc>/v1/<safe>`, exige `storage_path=''`) y `trazadoc_replace` (ruta `v(current+1)`). El reemplazo reserva el objeto NUEVO **sin liberar el anterior**: al finalizar, el objeto previo pasa a la fila de versión (sigue referenciado y contando) — demostrado en local H9 (497 MB tras reemplazo: seed + adjunto + v1 histórica + v2 vigente).

## 18. Reserva TrazaDocs Textiles

**No existe TrazaDocs descargable en Textiles**: sus documentos son vivos (`trazadoc_documents`, sin archivos) y sus cargas son las evidencias Textiles, que YA reservan con la arquitectura 0094/0101 §6 contra la **cuota Textil** (verificado en la suite RLS área 12: la reserva textil sube en la fila Textiles y jamás aparece en la CPR). No se creó cuota TrazaDocs paralela ni tercera arquitectura; el límite por archivo sigue saliendo del plan del módulo.

## 19. Referencia durable

Flujo obligatorio implementado en las TRES cargas CPR (adjunto de evidencia, alta del maestro, reemplazo): crear intent (referencia + reserva) → subir a la ruta DEL intent → finalizar. Si algo falla tras el upload, el objeto conserva su referencia (el intent) y sus bytes SIGUEN contando: la durabilidad ya no depende de que un `catch` logre registrar un huérfano. Ningún path vive solo en memoria del proceso (la lib ya no construye rutas — aserción estructural §30a).

## 20. Begin

Contrato completo en la sección 16. Falla cerrado: cuota/uso/plan no verificables → `STORAGE_QUOTA_UNVERIFIABLE` / `STORAGE_USAGE_UNVERIFIABLE` / `STORAGE_UNVERIFIABLE`; recurso inexistente/ya con archivo → `EVIDENCE_NOT_FOUND` / `DOCUMENT_NOT_FOUND` / `ALREADY_HAS_FILE`; sin membresía → `ROLE_NOT_ALLOWED`; módulo bloqueado → `MODULE_ACCESS_BLOCKED` con motivo.

## 21. Finalize

`finalize_evidence_attachment`, `finalize_trazadoc_file_document_initial_version_v2` y `replace_trazadoc_file_document_v2`: lock de cuota ANTES del `FOR UPDATE` del intent, propiedad del creador, `pending` vigente, **tamaño real = declarado** (contrato estricto de 0098, sin ampliación silenciosa de reserva), acceso comercial revalidado, cuota revalidada con las OTRAS reservas, y la escritura de campos físicos en la MISMA transacción que consume la reserva (`finalized`). Las v2 del maestro llaman a las RPCs reales de 0057/0059 con la ruta, el nombre y el MIME **del intent** (superficie mínima §24). Idempotencia: doble finalize → `already_finalized`/mismo resultado sin duplicar (local H6/H8; carrera de finalizes de T9F.3 revalidada).

## 22. Cancelación

`cancel_cpr_storage_upload`: solo el creador, jamás un finalizado; marca `failed` + `cancelled_at` y devuelve bucket/ruta. **Cancel NUNCA libera por sí mismo**: sin objeto, la resolución server-only verifica la inexistencia y libera; con objeto, el intent failed es el equivalente de `pending_delete` (candidato contabilizado) hasta el retiro confirmado (local H10-H12; RLS áreas 14 y 10).

## 23. Intents failed

Un intent `failed` sin `storage_resolved_at` (genéricos) o sin marca `expired` (Textiles, donde `expired` SOLO se escribe tras retiro confirmado — invariante 0097) **sigue contando sus bytes** como objeto no resuelto en la vista y el snapshot, deduplicado por ruta (si la evidencia real existe con esa ruta, cuenta una vez). Separación explícita: la reserva de UNIDAD se libera; la contabilidad FÍSICA no, hasta resolución.

## 24. Intents expired

Textiles: `expired` = retiro confirmado (se conserva la invariante T9E.3), así que libera; un `pending` VENCIDO deja de reservar la unidad pero cuenta como objeto no resuelto hasta que el barrido lo resuelva. Genéricos: `expired` puede nacer de la expiración atómica de una clave (sección 33) — por eso la rama de no-resueltos exige `storage_resolved_at is null`, no el string del estado. Ambos casos demostrados en local (I1-I4, H13) y preparados contra staging (áreas 14-15).

## 25. Contabilidad física

Vista v4 y `module_storage_snapshot` v2: objetos = dominio (evidencias, maestro + TODAS las versiones con su tamaño, textiles) ∪ cola con `status <> 'deleted'` ∪ **intents no resueltos** (textiles failed/pending-vencidos; genéricos no finalizados ni resueltos), deduplicados por (bucket, ruta) con el máximo CONOCIDO; `reserved_bytes` = pendientes vigentes (textiles + genéricos, cada uno en SU fila de módulo — la CPR deja de reportar 0); `unknown_size_count` y conflictos intactos de T9F.3.

## 26. Pending delete

Ciclo T9F.3 conservado y extendido: encolar cuenta, `delete_failed` cuenta, SOLO `deleted` (retiro físico confirmado por `resolve_storage_deletion`, service-only) libera. La nueva RPC textil de borrado alimenta la misma cola. Áreas 16-18 de la suite RLS con objeto REAL.

## 27. Delete failed

Sin cambios de semántica (sigue contando con `error_code` seguro) y con un refuerzo: los upserts de la cola marcan `error_code='size_conflict'` cuando dos referencias CONOCIDAS del mismo objeto declaran tamaños distintos (sección 31).

## 28. count_module_resource

Guard reescrito: `auth.uid()` es la identidad (con sesión, solo organizaciones propias vía `is_org_member`/`is_platform_staff`; sin sesión — contextos de servidor y funciones DEFINER internas — se permite); `current_user` eliminado de la función (en una DEFINER es el DUEÑO y el guard anterior quedaba SIEMPRE en bypass: **cualquier autenticado podía sondear conteos ajenos por la API**). Parámetros nulos → NULL. El EXECUTE a `authenticated` se conserva porque el trigger INVOKER la invoca como el rol real del insertante (necesidad real documentada, §18 del plan); con el guard nuevo no revela nada a no-miembros.

## 29. Aislamiento entre organizaciones

Demostrado en local (J1: no-miembro → NULL; J2: miembro → número; J3: servidor → permitido) y preparado contra staging (área 20: usuario de A consulta B → NULL). El lock y todos los conteos siguen incluyendo `organization_id` (aserción conservada de T9F.3).

## 30. Tamaños NULL

NULL = DESCONOCIDO, jamás cero. Se eliminó el último `greatest(coalesce(size,0), coalesce(size,0))` (register + ambos upserts de la cola). Aserción estructural §30b: cero `greatest(coalesce(…size…))` y cero `coalesce(<alias>.size_bytes, 0)` en 0101 (el único `greatest(coalesce)` admitido es el clamp del TTL, que no es un tamaño).

## 31. Combinación de tamaños

`combine_object_sizes(existing, incoming)` (IMMUTABLE): ambos NULL → NULL; uno conocido → el conocido; iguales → ese valor; **contradictorios → máximo conservador** (jamás subestima la cuota) **y el llamador marca `error_code='size_conflict'`** — la estrategia conservadora documentada que exige §20. Usada en los tres upserts. Demostrada pura en local (K1-K3).

## 32. unknown_size_count

Sigue bloqueando TODA autorización de carga (Textiles desde T9F.3; ahora también `begin_cpr_storage_upload` y los tres finalize): `unknown>0` o `conflicts>0` → `STORAGE_UNVERIFIABLE`. Preparado contra staging (área 19).

## 33. Idempotencia vencida

En ambos begins (textil y genérico), ANTES del lookup idempotente y bajo el lock: `update … set status='expired' where … idempotency_key = clave and status='pending' and expires_at <= now()` — libera el índice único parcial de forma atómica; jamás `unique_violation` ni bloqueo permanente. La misma RUTA con intent no finalizado se **revive** (mismo intent, una sola reserva, TTL nuevo, `storage_resolved_at` limpio) en lugar de duplicar; `finalized` sobre la ruta → `PATH_ALREADY_FINALIZED`; el objeto de un vencido no resuelto sigue contando hasta resolución. Demostrado en local (H13) y preparado (área 21).

## 34. RPC de borrado

Las tres `queue_and_delete_*` validan, en este orden: fila bajo `FOR UPDATE` → predicado ESPEJO de la política retirada (membresía + rol + estado; no-miembro recibe el mismo `DELETE_NOT_ALLOWED` sin filtrar existencia) → **gate comercial** `resolve_organization_module_access(org, módulo)` allowed, con `MODULE_ACCESS_BLOCKED` + motivo (`demo_expired`, `module_disabled`, `not_assigned`, `globally_disabled`).

## 35. Acceso comercial

Comportamiento confirmado y respetado: Demo vencido bloquea acceso Y mutaciones — incluido el borrado — y los datos se CONSERVAN (local H16; RLS área 22). El mantenimiento (resolver `pending_delete`, retirar objetos de intents, reconciliación) sigue siendo server-only/service_role y no equivale a mutación funcional del usuario vencido (`resolve_cpr_upload_intent_object`, `resolve_storage_deletion`, `record_textile_upload_intent_cleanup_server`, `removeTextileEvidenceObject`).

## 36. Migración 0101

`supabase/migrations/0101_t9f1_module_access_hardening.sql`, ~2.560 líneas, acumulada T9F.1+2+3+4, **no aplicada**, lista para aplicarse UNA vez sobre una base con 0100. Nuevas superficies T9F.4: `combine_object_sizes`, upserts seguros, gates comerciales, `queue_and_delete_textile_evidence`, `discard_empty_trazadoc_file_document`, §3b (3 `drop policy` + `forbid_physical_field_mutation` + 3 triggers + revoke de la RPC de limpieza 0097), guard `auth.uid` + conteo combinado + trigger nº 16, tabla `storage_upload_intents` + begin/finalize×3/cancel/resolve, expiración atómica en `begin_textile_evidence_upload_v2`, vista v4 y snapshot v2.

## 37. Motivo para no crear 0102

0101 no fue aplicada en ningún entorno: corregirla y completarla en el MISMO archivo produce una única migración coherente y atómica. Un 0102 duplicaría vistas/funciones a mitad de camino y dejaría un estado intermedio sin sentido que nadie ejecutará jamás.

## 38. Motivo para no modificar 0100

0100 YA está aplicada en staging: reescribirla desincronizaría el historial (`migration list`) y obligaría a `repair` sin inconsistencia real. Es inmutable; 0101 la extiende. Hash verificado dentro del ZIP: `0bfe816794287b2b5fcbcebc0cbca7fa3db677cdd20e289cb81bc5f8008eea41`.

## 39. Archivos creados

`lib/db/storage-intents.ts` · `tests/unit/t9f4-file-accounting-and-reservations.test.ts` · `tests/rls/t9f4-file-limits-direct-mutations-reservations.test.ts` · `scripts/t9f3-local-sql-harness/shims-extra-t9f4.sql` · `scripts/t9f3-local-sql-harness/smoke-t9f4.sql` · `scripts/t9f3-local-sql-harness/concurrency-t9f4.sh` · `docs/platform/TRAZALOOP_T9F4_FINAL_FILE_ACCOUNTING_AND_RESERVATIONS_REPORT.md` · `docs/platform/TRAZALOOP_T9F4_APPLY_LATER_GUIDE.md`.

## 40. Archivos modificados

`supabase/migrations/0101_t9f1_module_access_hardening.sql` (consolidación T9F.4) · `lib/db/storage-deletion.ts` (+`resolveCprUploadIntentObject`) · `lib/db/trazadocs-master.ts` (upload a ruta reservada; finalize/replace v2; descarte por RPC) · `lib/db/textiles-evidences.ts` (+`listFailedTextileUploadIntents`) · `server/actions/evidences.ts` (adjunto por intent) · `server/actions/trazadocs-master.ts` (alta y reemplazo por intent) · `server/actions/textiles-evidences.ts` (resolución inspeccionada en los 3 sitios de fallo + barrido de failed) · `tests/unit/{t9f1,t9f2,t9f3,document-master}.test.ts` (invariantes endurecidas T9F.4) · `tests/evidences/{textiles-evidences-hardening,textiles-evidence-upload-limits,textiles-evidence-direct-upload}.test.ts` (orden markFailed→retiro inspeccionado→registro) · `tests/rls/t9f3-…` (limpieza con objeto nombrado + verificación ampliada) · `scripts/t9f3-local-sql-harness/{run.sh,smoke.sql}` · `package.json` · `docs/platform/TRAZALOOP_T9F3_APPLY_LATER_GUIDE.md` (puntero sustituida).

## 41. Archivos eliminados

Ninguno. Comportamiento eliminado: DELETE directo en las tres tablas físicas, UPDATE físico directo, construcción de rutas en la lib del maestro y las llamadas a las RPCs v1 de finalize/replace desde el código (las v1 permanecen en BD como funciones internas invocadas por las v2).

## 42. Pruebas unitarias

`test:t9f4` — **26 ✔ / 0 ✘** — cubre los 46 ítems de §26 agrupados (documental 1-6, DELETE 7-11, UPDATE 12-16, reservas 17-25, textiles 26-31, conteos 32-34, NULL 35-38, idempotencia 39-42, borrado 43-46) apoyados en los resultados REALES del arnés (smoke 40/40 y carreras 4-5). Suites previas actualizadas y en verde: t9f1 35 ✔, t9f2 28 ✔, t9f3 26 ✔, document-master, textiles-hardening y compañía.

## 43. Pruebas estructurales

§30 completo dentro de `test:t9f4`: conteo combinado presente; trigger nº 16 con argumentos exactos; los TRES `drop policy` exactos (y ninguno más — t9f1/t9f2 lo vigilan con lista blanca); guards físicos por tabla; begin ANTES del upload en las tres acciones y ruta SIEMPRE del intent; sin `COALESCE/GREATEST` permisivos sobre tamaños; `count_module_resource` sin `current_user` y con grants mínimos; gates comerciales en las RPC de borrado; limpieza RLS con objeto NOMBRADO (falla ante cualquier desestructuración posicional en cleanup) y verificación ampliada; `organization_subscriptions` sin autoridad; `storage.objects` (0099) intocado.

## 44. Pruebas de integración

Arnés SQL local (BD real PG16 con 0101 aplicada + shims de las superficies 0093–0100/0057/0059): smoke T9F.4 **40/40** (baterías F límite combinado, G campos físicos, H reservas/gates/idempotencia, I intents no resueltos, J aislamiento, K combinación), smoke T9F.3 **32/32** (adaptado a la contabilidad de no-resueltos: los barridos confirmados preceden a las nuevas reservas), smoke T9F.2 revalidado, y **5 carreras reales** (2 nuevas: vivo-vs-descargable y doble begin sobre cuota).

## 45. Pruebas RLS preparadas

`tests/rls/t9f4-file-limits-direct-mutations-reservations.test.ts` — las 23 áreas de §27 con expectativas CONCRETAS (mensajes exactos, conteos exactos, deltas de bytes exactos). NO ejecutada desde este entorno (prohibido conectar a staging); NO se declara aprobada. La t9f3 RLS también quedó actualizada (limpieza §28) y sigue preparada.

## 46. Storage real preparado

La suite sube objetos REALES pequeños y deterministas (8–16 KB, `deterministicBytes`, sin secretos): objeto activo finalizado, versión v1 física del maestro, objeto de intent failed, objeto de intent pending-vencido, objeto encolado `pending_delete`, `delete_failed` simulado y `deleted` confirmado.

## 47. Fixtures

Prefijo `t9f4_<timestamp>_<aleatorio>` en organizaciones, usuarios, títulos y rutas. Organizaciones por el flujo REAL (`create_organization` + aprovisionamiento 0100); estados comerciales solo demo/full/extra vía fixture admin. Tres usuarios (A, B y X sin membresías, para aislamiento).

## 48. Limpieza

§28 cumplido: recolección con **objeto nombrado** (`cleanupData` — el patrón posicional que dejó `storage_orphan_candidates` sin asignar está prohibido y vigilado estructuralmente), retiro de objetos ANTES de borrar filas, borrado por organización (cola, **reservas/intents genéricos**, intents textiles, dominio, plan, membresías), eliminación REAL de organizaciones (neutralizar = FALLO) y usuarios Auth, y verificación final de CERO residuos: organizaciones, usuarios, objetos por bucket/prefijo, filas por tabla, candidatos `pending_delete`/`delete_failed`, reservas e intents. `audit_log` permanece inmutable, sin secretos e identificado por el nombre `t9f4_*` histórico.

## 49. npm ci

**No ejecutado** (limitación del entorno: `node_modules` preexistente, idéntico al validado en T9F.2/T9F.3). Clasificación: no ejecutado por limitación del entorno.

## 50. Typecheck

`npm run typecheck` (`tsc --noEmit`): **EXIT=0**. Ejecutado y aprobado.

## 51. Lint

`npm run lint`: **EXIT=0** — 0 errores, 1 warning PREEXISTENTE (`domainSrc` sin uso, ajeno a T9F.4). Ejecutado y aprobado.

## 52. Build

`npm run build`: **EXIT=0**. Ejecutado y aprobado.

## 53. test:all

**EXIT=0 — 1092 ✔ / 0 ✘** (typecheck + lint + las ~60 suites del proyecto, incluidas T9F 7✔, T9F.1 35✔, T9F.2 28✔, T9F.3 26✔ y **T9F.4 26✔**). Las suites T9E.1–T9E.4 estáticas/unitarias corren dentro de la cadena; las T9E RLS son de staging: preparadas, no ejecutables aquí.

## 54. Riesgos residuales

**Ninguno de los bloqueadores 1-11 queda abierto.** Riesgos honestos restantes: (i) las suites RLS y el Storage de staging están preparados pero **no verificados desde aquí** — la guía los ejecuta tras aplicar 0101; (ii) `service_role` y las funciones DEFINER quedan por diseño fuera del ámbito de los triggers INVOKER (código de servidor confiable con validaciones propias — no es una vía de cliente); (iii) los intents no resueltos cuentan de forma CONSERVADORA (un vencido jamás subido cuenta hasta que el barrido confirme la inexistencia — dirección segura, resolución oportunista en cada begin y por el ciclo server-only); (iv) la ejecución en staging puede revelar diferencias de esquema no visibles localmente (las shims cubren 0093–0100/0057/0059 al contrato, no al byte).

## 55. Aplicación posterior

Guía completa de 33 pasos en `docs/platform/TRAZALOOP_T9F4_APPLY_LATER_GUIDE.md` (respaldo → verificaciones → `migration list` → `db push --dry-run` → aplicar → pruebas dirigidas de cada bloqueador → suite RLS → limpieza verificada → Preview → smoke humano → logs → rollback). La guía T9F.3 quedó marcada SUSTITUIDA con puntero.

## 56. Rollback

Sin `db reset`, sin TRUNCATE, sin borrar datos ni auditoría, sin desactivar RLS. Antes de revertir NADA: verificar cero reservas activas (textiles Y genéricas), cero intents pendientes/finalizaciones en vuelo, cero `delete_failed` sin resolver y `unknown_size_count=0` — mientras existan, retirar tablas o funciones regalaría almacenamiento fantasma. Revertir código primero; restaurar funciones desde sus archivos fuente (0097/0098/0057/0059 intactos en el repositorio); recrear las TRES políticas de DELETE SOLO si se decide reabrir el DELETE directo (texto literal en 0019/0057/0075); los triggers físicos y de límite pueden retirarse con `drop trigger` sin tocar datos; `storage_upload_intents` NO se elimina con filas pendientes. La FK de `audit_log` no se recrea.

## 57. Checklist final

✓ 0100 intacta (hash verificado) · ✓ 0101 completa y NO aplicada · ✓ sin 0102 · ✓ documental combinado + versiones exentas + trigger atómico compartido · ✓ carrera entre tablas 1+1 · ✓ DELETE directo bloqueado (3 tablas) y UPDATE físico bloqueado con funcionales intactos · ✓ reservas CPR/TrazaDocs con referencia durable previa, begin fail-closed, finalize estricto e idempotente, doble carga imposible · ✓ failed/expired contabilizados hasta resolución confirmada; cancel sin objeto libera tras verificación y con objeto queda candidato · ✓ delete_failed cuenta, deleted libera · ✓ count aislado por auth.uid sin grants inseguros · ✓ NULL preservado, combinación segura, conflictos marcados, unknown bloquea · ✓ idempotencia vencida resuelta · ✓ RPC de borrado con acceso comercial y Demo vencido conservador · ✓ limpieza RLS corregida y verificada (cero QA: objetos, reservas, intents, organizaciones, usuarios) · ✓ 0093–0100 y T9E intactos · ✓ nada aplicado/desplegado/commiteado · ✓ resultados honestos · ✓ informe + guía + ZIP limpios.
