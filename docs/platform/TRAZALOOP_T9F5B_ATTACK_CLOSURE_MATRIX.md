# TRAZALOOP · T9F.5B · MATRIZ DE CIERRE DE ATAQUES

- **Rama:** `feature/t9f5b-minimal-security-remediation`
- **Commit de entrada:** `b922e1cac90f8b31c266bccba86b63966dda2cc3`
- **Migración corregida:** `supabase/migrations/0101_t9f1_module_access_hardening.sql` (**no aplicada**)
- **Actualizada por T9F.5B.1** (corrección previa a QA): acceso por actor explícito bajo `service_role`, carga directa de archivos y política canónica de tamaño físico. Ver `TRAZALOOP_T9F5B1_PRE_QA_CORRECTION_REPORT.md`.
- **Estados permitidos en esta fase:** `CORREGIDO EN CÓDIGO` · `QA PENDIENTE`
- **`PROTEGIDO` no se usa:** esa clasificación pertenece a T9F.5C, tras la ejecución adversarial contra un proyecto Supabase QA real.

---

## Ataques corregidos (A01–A08, A13, A14)

| ID | Hallazgo T9F.5A | Causa raíz | Corrección aplicada | Archivo o función | Prueba local | Prueba QA | Estado |
|---|---|---|---|---|---|---|---|
| **A01** | Upload CPR directo sin intent — VULNERABLE | `evidences_insert_legacy` (0099) autoriza por rol + prefijo de organización; no exige `storage_upload_intents` | Se elimina la política permisiva y se instala `evidences_insert_cpr`, ligada a un intent EXACTO (ruta, bucket, usuario, organización, módulo, propósito, estado, vigencia, tamaño). Textiles conservado sin cambios | `0101 §12`; `storage_object_matches_upload_intent` | `t9f5b…test.ts` §A ×4 | `t9f5-adversarial` A01: upload real sin intent → rechazo; upload legítimo → permitido | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A02** | Upload TrazaDocs directo sin intent — VULNERABLE | `trazadocs_documents_insert` (0058) autoriza solo por `has_org_role` | Se elimina y se instala `trazadocs_documents_insert_intent`, con `resource_type in ('trazadoc_initial','trazadoc_replace')` y coincidencia exacta de ruta | `0101 §12` | `t9f5b…test.ts` §A | `t9f5-adversarial` A02: upload real sin intent → rechazo; con intent → permitido | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A03** | UPDATE directo de `storage.objects` — VULNERABLE | `trazadocs_documents_update` (0058) permite `upsert` por rol; el guard de campos físicos actúa sobre la tabla, no sobre Storage | `drop policy` sin reemplazo ⇒ deny-by-default. El reemplazo legítimo es objeto NUEVO (nuevo intent → ruta `vN+1` → verificación → finalize server-only → versión histórica) | `0101 §12` | `t9f5b…test.ts` §B ×2 | `t9f5-adversarial` A03: `upsert:true` real sobre objeto vivo → rechazo y tamaño físico intacto | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A04** | DELETE directo de `storage.objects` — VULNERABLE | `trazadocs_documents_delete` (0058) permite borrado físico por rol, eludiendo `pending_delete` | `drop policy` sin reemplazo. El retiro físico queda en el flujo server-only `pending_delete → retiro verificado → deleted` | `0101 §12`; `queue_and_delete_*`, `resolve_*` intactas | `t9f5b…test.ts` §B ×2 | `t9f5-adversarial` A04: `remove()` real → rechazo/0 objetos y el objeto sigue existiendo | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A05** | Finalize sin objeto físico — VULNERABLE | Los tres finalizers estaban concedidos a `authenticated` y no consultaban `storage.objects` | Finalizers `*_server` server-only que exigen metadata física (`OBJECT_NOT_VERIFIED`); firmas históricas revocadas y con `SERVER_ONLY_FINALIZER`; la Server Action lee el objeto antes de finalizar | `finalize_evidence_attachment_server`, `assert_trazadoc_finalize_preconditions`, `lib/db/cpr-storage-objects.ts` | `t9f5b…test.ts` §C ×4 | `t9f5-adversarial` A05: firma histórica, invocación por `authenticated` y finalize sin objeto → los tres rechazados; sin referencia final | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A06** | Tamaño físico mayor que el declarado — VULNERABLE | El contrato comparaba dos valores de origen cliente; el snapshot sumaba el tamaño declarado | **Política canónica (T9F.5B.1): RECHAZO ESTRICTO.** El tamaño procede de `storage.objects` leído por el servidor y debe ser EXACTAMENTE el reservado (`OBJECT_SIZE_MISMATCH`); sin ampliación. Se comprueban además tope del plan y cuota bajo el mismo lock; `size_bytes = p_real_size_bytes` | `finalize_*_server`; `assert_trazadoc_finalize_preconditions`; `validateCprUploadedObject` | `t9f5b…test.ts` §C ×2 · `t9f5b1…test.ts` §B3 | `t9f5-adversarial` A06: reserva 1 MB + objeto real 5 MB → `OBJECT_SIZE_MISMATCH` | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A06b** | *(nuevo, T9F.5B.1)* Objeto mayor que la reserva **sin** finalize | El snapshot contabilizaba el tamaño DECLARADO de los intents: 1 MB reservado + 5 MB físicos = 4 MB de capacidad ficticia | `module_storage_snapshot` cuenta los intents CPR por el MAYOR entre declarado y FÍSICO real (`left join storage.objects`), en reservas activas y en no resueltos | `module_storage_snapshot` (`0101 §6`) | `t9f5b1…test.ts` §B3 | `t9f5-adversarial` A06b: 1 MB reservado + 5 MB físicos, sin finalize → contabilidad por 5 MB o rechazo del upload; nunca capacidad ficticia | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A07** | MIME físico diferente — VULNERABLE | El MIME se fijaba en `begin` desde el cliente y no se revalidaba con firma | `OBJECT_MIME_MISMATCH` en SQL + `validateCprBinarySignature` en servidor (extensión ↔ MIME declarado ↔ Content-Type ↔ firma). Reutiliza el validador T9E sin alterarlo; no amplía la lista de MIME | `lib/domain/cpr-file-verification.ts`; acciones CPR y TrazaDocs | `t9f5b…test.ts` §C ×2 (PDF declarado + contenido no-PDF) | `t9f5-adversarial` A07: MIME físico incompatible → rechazo; bytes disponibles para la firma | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A08** | Cuota no revalidada en finalize — NO DEMOSTRADO (tratado como vulnerable) | Los finalizers TrazaDocs revalidaban `allowed` pero no invocaban `module_storage_snapshot` ni `plan_definitions`. **T9F.5B.1 añadió la causa raíz real**: bajo `service_role` el resolver de acceso devolvía `not_member` (auth.uid() NULL), lo que habría hecho pasar A08 por la razón equivocada | `assert_trazadoc_finalize_preconditions` recalcula, bajo advisory lock: acceso actual, tope del plan actual, cuota actual, uso confirmado y reservas activas, contra el tamaño físico. Aplicado a los tres consumidores de reserva. Idempotencia conservada | `assert_trazadoc_finalize_preconditions`; `finalize_evidence_attachment_server`; `resolve_module_access_for_actor` | `t9f5b…test.ts` §D ×3 · `t9f5b1…test.ts` §B1/§B4 | `t9f5-adversarial` A08: begin Extra (22 MB) → degradar a Demo → finalize → rechazo por `STORAGE_QUOTA_EXCEEDED` o `FILE_SIZE_INVALID`; **falla si el rechazo es `not_member`** | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A13** | `module_key` manipulado — VULNERABLE | Orden alfabético de triggers: `t_trazadoc_documents_limit` corre antes de `t_trazadoc_documents_module_key`, así que el límite leía el valor del cliente | El límite deriva el módulo del **blueprint** (fuente autoritativa) cuando hay `blueprint_id`; `BLUEPRINT_NOT_FOUND` falla cerrado. No se renombra ningún trigger: la corrección no depende del orden | `enforce_module_resource_limit` (`0101 §5`) | `t9f5b…test.ts` §E ×2 | `t9f5-adversarial` A13: blueprint CPR + `module_key='textiles'`, CPR al límite y Textiles con cupo → `RESOURCE_LIMIT_EXCEEDED` | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |
| **A14** | TrazaDocs Full de 22 MB rechazado — NO DEMOSTRADO (tratado como vulnerable) | Tope fijo de 20 MB común a todos los tipos y planes, más restrictivo que el catálogo real (Demo 10 MB, Full/Extra 25 MB) | `cpr_upload_max_file_bytes(resource_type, access_mode)`: CPR 20 MB, Demo 10 MB, Full 25 MB, Extra 25 MB. CHECK estructural al máximo técnico superior (25 MB); el límite específico lo aplica la RPC y lo re-verifican los finalizers. Textiles conserva su tope propio | `cpr_upload_max_file_bytes` (`0101 §6b.0`); `begin_cpr_storage_upload`; `lib/domain/cpr-file-verification.ts` | `t9f5b…test.ts` §F ×3 | `t9f5-adversarial` A14: 22 MB Demo rechazado; 22 MB Full permitido con archivo físico real; 22 MB Extra permitido; 26 MB Full rechazado; CPR con su tope propio | **CORREGIDO EN CÓDIGO · QA PENDIENTE** |

---

## Protecciones conservadas (regresión, sin reapertura de arquitectura)

Estos ocho ataques fueron clasificados PROTEGIDOS por T9F.5A. **T9F.5B no los reclasifica**: solo verifica que la corrección de los otros diez no los debilitó. Su estado sigue siendo el que T9F.5A estableció, y su confirmación end-to-end también corresponde a T9F.5C.

| ID | Hallazgo T9F.5A | Qué se conserva | Prueba local | Prueba QA |
|---|---|---|---|---|
| A09 | Concurrencia por el último espacio — PROTEGIDO | Advisory locks por (org, módulo, recurso) y conteo posterior | `t9f5b…test.ts` §G | `t9f5-adversarial` A09 |
| A10 | INSERT directo en tablas de dominio — PROTEGIDO | 16 triggers `BEFORE INSERT` INVOKER; `RESOURCE_LIMIT_EXCEEDED` | `t9f5b…test.ts` §G | `t9f5-adversarial` A10 |
| A11 | UPDATE de campos físicos — PROTEGIDO | `forbid_physical_field_mutation` + 3 guards; `PHYSICAL_FIELD_IMMUTABLE` | `t9f5b…test.ts` §G | `t9f5-adversarial` A11 |
| A12 | DELETE de filas de dominio — PROTEGIDO | Sin políticas DELETE; única vía `queue_and_delete_*` | `t9f5b…test.ts` §G | `t9f5-adversarial` A12 |
| A15 | Conteo de otra organización — PROTEGIDO | Guard de aislamiento en `count_module_resource` (NULL) | `t9f5b…test.ts` §G | `t9f5-adversarial` A15 |
| A16 | Tamaños desconocidos — PROTEGIDO | `unknown_size_count` bloquea cargas (`STORAGE_UNVERIFIABLE`) | `t9f5b…test.ts` §G | `t9f5-adversarial` A16 |
| A17 | Intent failed/expired con objeto — PROTEGIDO | Sus bytes siguen contando hasta resolución server-only | `t9f5b…test.ts` §G | `t9f5-adversarial` A17 |
| A18 | Idempotency key vencida — PROTEGIDO | Índice único parcial; expiración atómica en `begin` | `t9f5b…test.ts` §G | `t9f5-adversarial` A18 |

---

## Resumen

| Categoría | Cantidad |
|---|---|
| CORREGIDO EN CÓDIGO · QA PENDIENTE | **11** (A01–A08, A06b, A13, A14) |
| Protecciones conservadas con regresión preparada | **8** (A09–A12, A15–A18) |
| Declarados PROTEGIDOS en esta fase | **0** |

**Bloqueadores previos a QA (T9F.5B.1).** Tres defectos habrían impedido que esta matriz se validara: (1) los finalizers server-only resolvían el acceso con `auth.uid()`, NULL bajo `service_role`, produciendo un falso `not_member` en toda finalización legítima; (2) los archivos seguían viajando en `FormData`, con el límite de 1 MB de Server Actions, lo que hacía **imposible** A14; (3) la política ante "tamaño físico > reserva" era contradictoria entre SQL, TypeScript y la suite. Los tres están corregidos; el detalle está en `TRAZALOOP_T9F5B1_PRE_QA_CORRECTION_REPORT.md`.

**Nota obligatoria.** Ninguna celda de esta matriz afirma que un ataque esté protegido. Las pruebas locales son puras y estructurales: no ejercen RLS, ni Storage físico, ni grants reales, y por tanto no pueden demostrar A01–A08, A13 ni A14. La única evidencia admisible es la ejecución de `tests/rls/t9f5-adversarial-attacks.test.ts` contra un proyecto Supabase QA real con Auth, RLS y Storage reales, en la fase T9F.5C.
