# TRAZALOOP · T9F.5A · INFORME DE EQUIPO ROJO INDEPENDIENTE

> Auditoría adversarial del candidato **T9F.4**. Postura: intentar **romper**, no defender.
> Este informe **no** es un acta de cierre y **no** aprueba T9F.4.

## 0. Identidad de la auditoría

| Campo | Valor |
|---|---|
| Repositorio | `IdendiLatam/trazaloop-staging` |
| Rama | `feature/t9f5a-red-team-audit` |
| Commit esperado | `fa07e5a` |
| Commit auditado (HEAD) | `fa07e5aa58cc88e1e06f63da91435ae2f6bdd053` |
| Coincidencia rama/commit | **SÍ** — mensaje "chore: import T9F.4 security candidate" |
| Migraciones analizadas | `0001 → 0101` (estado ACUMULADO, 93 archivos) |
| Ejecución contra Supabase | **Ninguna** (staging/producción no tocados; sin aplicar migraciones) |
| Naturaleza de la evidencia | Análisis estático SQL/TS + reconstrucción de orden de triggers y políticas |

## 1. Veredicto

- **PROTEGIDOS: 8** — A09, A10, A11, A12, A15, A16, A17, A18
- **VULNERABLES: 8** — A01, A02, A03, A04, A05, A06, A07, A13
- **NO DEMOSTRADOS: 2** — A08, A14

La aprobación exige **18 / 0 / 0**. **T9F.4 NO se aprueba.**

Hallazgo estructural: T9F.4 construyó una arquitectura sólida de *reserva → finalize → contabilidad* (advisory locks, `pending_delete`, snapshots con desconocidos y reservas) y endureció Textiles hasta un finalizer **server-only** con verificación física y firma binaria. Pero dejó **dos superficies abiertas** que la eluden por completo:

1. **Políticas de `storage.objects` por rol (sin intent)** para CPR (`evidences_insert_legacy`) y para los tres verbos de `trazadocs-documents` (INSERT/UPDATE/DELETE).
2. **Finalizers CPR/TrazaDocs concedidos a `authenticated`** que confían en el tamaño/MIME declarados por el cliente y nunca consultan el objeto físico.

---

## 2. Evidencia por ataque (§5: 14 puntos)

Estructura por ataque: (1) Estado · (2) Rol · (3) Entrada exacta · (4) Pasos · (5) Control que debería impedirlo · (6) Archivo:línea · (7) Suficiencia · (8) Vías heredadas · (9) Políticas permisivas supervivientes · (10) Grants · (11) Prueba · (12) Resultado esperado · (13) Evidencia para declararlo protegido · (14) Corrección mínima.

### A01 — Upload CPR directo sin intent — **VULNERABLE**
1. VULNERABLE. 2. `authenticated` con rol admin/quality/consultant. 3. Storage API `upload('evidences','{org}/{uuid}/f.pdf')`. 4. Autenticarse como miembro con rol → subir directo, **sin** `begin_cpr_storage_upload`. 5. Debería existir una política INSERT ligada a un intent CPR válido. 6. `supabase/migrations/0099_…:` política `evidences_insert_legacy` (rol+prefijo, `foldername[2] is distinct from 'textiles'`). 7. **Insuficiente**: la condición es idéntica a 0016 (solo rol); no exige intent; 0099 declara CPR *"fuera de alcance"*. 8. Heredada de 0016 (`evidences_insert`), renombrada a `_legacy` en 0099 conservando el predicado permisivo. 9. Supervivientes: `evidences_insert_legacy`. 10. `to authenticated`. 11. `A01_cpr_upload_without_intent`. 12. Storage debe rechazar (`new row violates row-level security policy`). 13. Reproducir contra Supabase QA: upload directo → debe fallar. 14. INSERT CPR ligado a `storage_upload_intents` (ruta EXACTA, `created_by`, pending, no vencido), replicando `evidences_insert_textiles`.

### A02 — Upload TrazaDocs directo sin intent — **VULNERABLE**
1. VULNERABLE. 2. `authenticated` admin/quality/consultant. 3. Storage API a `trazadocs-documents` en `{org}/document_files/{uuid}/vN/f`. 4. Subir directo sin begin. 5. INSERT ligado a intent `trazadoc_initial|trazadoc_replace`. 6. `0058_trazadocs_documents_storage.sql:` `trazadocs_documents_insert` (solo `has_org_role`). 7. **Insuficiente**: sin vínculo a intent; 0058 intacto tras 0099/0100/0101. 8. Ninguna migración posterior lo endurece. 9. `trazadocs_documents_insert`. 10. `to authenticated`. 11. `A02_trazadocs_upload_without_intent`. 12. Rechazo. 13. Upload directo a QA debe fallar. 14. INSERT ligado a `storage_upload_intents` con `resource_type in ('trazadoc_initial','trazadoc_replace')` + coincidencia EXACTA de ruta.

### A03 — UPDATE directo de `storage.objects` — **VULNERABLE** (TrazaDocs)
1. VULNERABLE. 2. `authenticated` admin/quality. 3. Storage `upload(path, bytes, {upsert:true})` sobre objeto TrazaDocs existente. 4. upsert reemplaza el contenido físico; la fila `trazadoc_file_documents` (ruta/tamaño) no cambia. 5. Deny-by-default (sin política UPDATE). 6. `0058_…:` `trazadocs_documents_update` (`has_org_role([admin,quality])`). 7. **Insuficiente**: la política ABRE UPDATE. En `evidences` NO existe UPDATE (correcto); en `trazadocs-documents` sí. 8. Heredada de 0058. 9. `trazadocs_documents_update`. 10. `to authenticated`. 11. `A03_direct_update_storage_object`. 12. Rechazo. 13. upsert a QA debe fallar. 14. `drop policy trazadocs_documents_update` (nueva versión = objeto nuevo, no upsert).

### A04 — DELETE directo de `storage.objects` — **VULNERABLE** (TrazaDocs)
1. VULNERABLE. 2. `authenticated` admin/quality. 3. Storage `remove([path])` de objeto TrazaDocs con fila viva. 4. Borrado físico ⇒ referencia colgante; elude `pending_delete`. 5. Deny-by-default o encolado autoritativo previo. 6. `0058_…:` `trazadocs_documents_delete` (`has_org_role([admin,quality])`). 7. **Insuficiente**: ABRE DELETE directo (contraste: `evidences` cerró DELETE en 0099). 8. Heredada de 0058; no revocada. 9. `trazadocs_documents_delete`. 10. `to authenticated`. 11. `A04_direct_delete_storage_object`. 12. Rechazo. 13. remove a QA debe fallar. 14. `drop policy trazadocs_documents_delete`; borrado físico solo server-only tras `queue_and_delete_*`.

### A05 — Finalize sin objeto físico — **VULNERABLE** (CPR/TrazaDocs)
1. VULNERABLE. 2. `authenticated`. 3. RPC `finalize_evidence_attachment(intent, size)` / `finalize_trazadoc_file_document_initial_version_v2(intent, size, nota)`. 4. `begin_cpr_storage_upload` → **no subir** → finalize. 5. El finalize debería verificar la existencia física del objeto y rechazar sin crear referencia. 6. `0101_…:1793–1885` (`finalize_evidence_attachment`) y `0101_…:1891–1948`: **ninguna consulta a `storage.objects`**. 7. **Insuficiente**: fija `storage_path`/`size_bytes` en la fila sin comprobar que el objeto exista. 8. — 9. (Storage) las mismas de A01/A02. 10. `finalize_evidence_attachment`/`finalize_trazadoc…v2` **grant a `authenticated`** (0101:1883, 1948). 11. `A05_finalize_without_object`. 12. Rechazo sin fila final consistente. 13. QA: finalize sin objeto debe fallar. 14. Volver server-only y verificar existencia real del objeto antes de fijar campos (patrón Textiles `getTextileEvidenceObjectInfo`, `textiles-evidences.ts:405`).
   - **Contraste Textiles (protegido):** `finalizeTextileEvidenceUploadAction` lee `objectInfo` y si es `null` marca `failed` sin finalizar (`server/actions/textiles-evidences.ts:405–418`).

### A06 — Tamaño físico mayor que el declarado — **VULNERABLE** (CPR/TrazaDocs)
1. VULNERABLE. 2. `authenticated`. 3. `begin(1MB)` → subir objeto de 50 MB (vía A01) → `finalize(1MB)`. 4. La reserva y el finalize usan el mismo valor de cliente (1 MB); el objeto físico es mayor. 5. El servidor debe consultar metadata física y rechazar/ampliar la reserva atómicamente. 6. `0101_…:1856–1860` (`p_file_size_bytes <> v_intent.expected_size_bytes`) — ambos de origen cliente; `module_storage_snapshot` (0101:1070) suma el `size_bytes` **declarado**, no el físico. 7. **Insuficiente**: no hay lectura de `storage.objects.metadata`. 8. — 9. A01 (para colocar el objeto grande en la ruta). 10. finalizer `authenticated`. 11. `A06_physical_larger_than_declared`. 12. Rechazo o reserva ampliada. 13. QA con objeto real mayor que lo declarado. 14. Finalizer server-only que lea tamaño físico real y lo compare/expanda la reserva.
   - **Contraste Textiles (protegido):** `textiles-evidences.ts:409–466` obtiene `objectInfo.sizeBytes` y lo pasa al finalizer server-only (0101:1490–1497 valida `real == expected`).

### A07 — MIME físico diferente — **VULNERABLE** (CPR/TrazaDocs)
1. VULNERABLE. 2. `authenticated`. 3. Declarar `application/pdf` en begin, subir otro tipo. 4. `expected_mime_type` se fija en begin desde el cliente; el finalizer no re-verifica firma. 5. Rechazo por firma/Content-Type real. 6. `0101_…:1611–1789` (begin fija MIME del cliente); finalizers CPR/TrazaDocs no validan firma. 7. **Insuficiente**: sin inspección física ni de firma. 8. — 9. A01/A02. 10. finalizer `authenticated`. 11. `A07_physical_mime_mismatch`. 12. Rechazo. 13. QA con contenido incompatible al MIME. 14. Verificación server-only de firma binaria + Content-Type almacenado (patrón `validateTextileEvidenceBinarySignature`, `textiles-evidences.ts:432`).

### A08 — Cambio de plan entre begin y finalize — **NO DEMOSTRADO**
1. NO DEMOSTRADO. 2. `authenticated` (con superadmin cambiando el plan). 3. `begin` TrazaDocs bajo Extra → superadmin pone el módulo en Demo → `finalize_trazadoc_file_document_initial_version_v2` / `replace_trazadoc_file_document_v2`. 4. La reserva se creó con cuota Extra; al finalizar bajo Demo, la cuota nueva es menor. 5. Finalize debe revalidar plan **y cuota** actuales y rechazar el exceso. 6. `0101_…:1922–1947` y `0101_…:1994–2005`: solo `resolve_organization_module_access(...)->>'allowed'`; **no** invocan `module_storage_snapshot` ni `plan_definitions`. 7. **Insuficiente para TrazaDocs**: revalida acceso pero **no** cuota; un intent reservado bajo Extra se finaliza por encima de la cuota Demo. (CPR-evidencia y Textiles **sí** revalidan cuota: 0101:1868–1876 y 1547–1560.) 8. — 9. — 10. finalizers `authenticated`. 11. `A08_plan_change_between_begin_and_finalize`. 12. Rechazo si el total comprometido excede la cuota nueva. 13. QA: degradar plan entre begin y finalize TrazaDocs → finalize debe rechazar. 14. Añadir a finalize/replace TrazaDocs la misma revalidación de cuota (snapshot + `storage_limit_bytes`) que ya usa `finalize_evidence_attachment`.

### A09 — Concurrencia por el último espacio — **PROTEGIDO**
1. PROTEGIDO (vía autoritativa DB). 2. `authenticated` ×2. 3. Dos INSERT/begin/finalize simultáneos del último recurso. 4. — 5. Serialización por advisory lock transaccional. 6. `enforce_module_resource_limit` `pg_advisory_xact_lock('module_resource:…')` (0101:938–941) + conteo posterior (0101:944–948); begin/finalize toman el mismo lock (0101:1438–1447, 1666–1669). 7. Suficiente para la vía por trigger/reserva: la 2.ª transacción ve el conteo incrementado y se rechaza; en INSERT multi-fila el exceso aborta todo. 8. — 9. — 10. internas/authenticated. 11. `A09_concurrent_last_slot`. 12. Solo una tiene éxito. 13. Carrera real en QA (dos sesiones). 14. — · **Nota:** solo protege la vía por intent/tabla; A01/A02 permiten crear objetos físicos sin pasar por la reserva.

### A10 — INSERT directo en tabla de dominio — **PROTEGIDO**
1. PROTEGIDO. 2. `authenticated`. 3. PostgREST `insert` en `suppliers/materials/products/evidences/production_orders/input_batches/output_batches/trazadoc_documents/trazadoc_file_documents/textile_*`. 4. Saltar Server Actions e insertar directo. 5. Límite atómico en BD. 6. `enforce_module_resource_limit` (0101:869–948) + 16 triggers BEFORE INSERT (0101:955–988); catálogo `plan_limits` completo (0050:68–146). 7. Suficiente: trigger INVOKER que dispara para `authenticated` (incluye INSERT directo), lock + conteo real, rechaza el exceso. 8. — 9. — 10. `enforce_module_resource_limit` revocada a clientes (ejecuta como trigger). 11. `A10_direct_domain_insert_over_limit`. 12. Rechazo `RESOURCE_LIMIT_EXCEEDED`. 13. Insertar por encima del límite en QA. 14. —

### A11 — UPDATE directo de campos físicos — **PROTEGIDO**
1. PROTEGIDO. 2. `authenticated`. 3. PostgREST `update` de `storage_path/size_bytes/file_name/mime_type` (y equivalentes textiles). 4. — 5. Rechazo. 6. `forbid_physical_field_mutation` (0101:556–582) con triggers en las 3 tablas (0101:584–588); `protect_textile_evidence_file_metadata` (0077, **sin gate de rol**). 7. Suficiente: cada trigger cubre exactamente las columnas físicas **que existen**; `bucket_id`/`checksum` **no son columnas** (evidences: `0019` solo `storage_path` + `size_bytes` de 0051; trazadoc_file_documents: `storage_path/file_name/mime_type/size_bytes`, 0057:61–64; textile_evidences: 4 campos, cubiertos por 0077 para todos los roles). 8. — 9. — 10. guards revocados a clientes; corren como trigger. 11. `A11_direct_physical_field_update`. 12. Rechazo `PHYSICAL_FIELD_IMMUTABLE`. 13. UPDATE directo en QA debe fallar. 14. —

### A12 — DELETE directo de fila de dominio — **PROTEGIDO**
1. PROTEGIDO. 2. `authenticated`. 3. PostgREST `delete` de `evidences/textile_evidences/trazadoc_file_documents`. 4. — 5. Rechazo o encolado autoritativo previo. 6. `drop policy` de las tres DELETE en 0101:547–549; sin superviviente ⇒ deny-by-default. Vía única: `queue_and_delete_evidence/textile_evidence/trazadoc_draft` (0101:365/431/261) que encolan `pending_delete` en la misma transacción. 7. Suficiente: sin política DELETE, `authenticated` no puede borrar; las RPCs definer encolan antes de borrar. 8. — 9. — 10. RPCs `queue_and_delete_*` grant a `authenticated`; borrado físico/resolución server-only. 11. `A12_direct_domain_row_delete`. 12. Rechazo del DELETE directo. 13. DELETE directo en QA debe fallar. 14. —

### A13 — Blueprint CPR con `module_key` manipulado — **VULNERABLE**
1. VULNERABLE. 2. `authenticated`. 3. PostgREST `insert` en `trazadoc_documents` con `module_key='textiles'` sobre un blueprint CPR. 4. El límite comercial se evalúa contra el plan **Textiles** (con cupo) aunque el documento sea CPR; luego el `module_key` se reescribe a `cpr` desde el blueprint. 5. El módulo debe derivarse del blueprint **antes** de evaluar el límite. 6. `enforce_module_resource_limit('BY_MODULE_KEY',…)` usa `new.module_key` (0101:874–884); `set_trazadoc_document_module_key` deriva del blueprint (0082:58–82). 7. **Insuficiente por ORDEN DE TRIGGERS**: PostgreSQL ejecuta triggers del mismo evento por **orden alfabético de nombre**; `t_trazadoc_documents_limit` < `t_trazadoc_documents_module_key`, así que el límite corre **antes** de la normalización → lee el valor del cliente. El comentario "module_key lo fija un trigger de 0082… jamás el cliente" (0101:872) está **invertido por el orden real**. 8. — 9. — 10. triggers internos. 11. `A13_module_key_spoof_trigger_order`. 12. El límite debe evaluar el plan CPR (derivado del blueprint). 13. En QA, con CPR al límite y Textiles con cupo, insertar CPR con `module_key='textiles'` → debe rechazarse por límite CPR. 14. Renombrar la normalización para que ordene ANTES (p. ej. `t_trazadoc_documents_00_module_key`) **o** derivar el módulo del blueprint dentro del propio trigger de límite (no confiar en `new.module_key`).

### A14 — Archivo TrazaDocs Full de 22 MB — **NO DEMOSTRADO**
1. NO DEMOSTRADO. 2. `authenticated`. 3. `begin_cpr_storage_upload(...,22 MB)` bajo plan Full. 4. — 5. Permitido (el encargo declara máx Full/Extra = 25 MB con cuota disponible). 6. `begin_cpr_storage_upload` rechaza `p_file_size_bytes > 20 * 1024 * 1024` (0101:1649); mismo tope fijo en 0094:61, 0097, 0098, 0101:1029/1209/1496. 7. **No se cumple el resultado seguro**: el tope es un **20 MB fijo, igual para todos los planes**; no existe `25*1024`/`26214400` en ninguna migración; un archivo Full de 22 MB se rechaza con `FILE_SIZE_INVALID`. No es demostrable que "22 MB esté permitido". 8. — 9. — 10. — 11. `A14_full_22mb_should_be_allowed`. 12. begin(22 MB) bajo Full debe tener éxito. 13. Definir el máximo por plan y probar 22 MB Full = éxito, y > máx = rechazo. 14. Sustituir el 20 MB hardcodeado por un máximo por plan (catálogo, p. ej. `plan_limits.max_file_bytes`) leído en begin/finalize.

### A15 — Consulta de conteo de otra organización — **PROTEGIDO**
1. PROTEGIDO. 2. `authenticated` de org A. 3. RPC `count_module_resource(org_B,…)`. 4. — 5. Rechazo o respuesta no reveladora. 6. Guard de aislamiento: con `auth.uid()` no nulo y `not (is_org_member OR is_platform_staff)` ⇒ `return null` (0101:800–806); revoke de anon (0101:863). 7. Suficiente: un sondeo cruzado recibe NULL (nada que revelar). 8. — 9. — 10. grant solo `authenticated` (para el trigger); guard interno. 11. `A15_cross_org_count_probe`. 12. NULL / sin revelar. 13. Llamada cruzada en QA. 14. —

### A16 — Tamaño físico desconocido — **PROTEGIDO** (filas de dominio)
1. PROTEGIDO. 2. `authenticated`. 3. Fila con `storage_path` no vacío y `size_bytes NULL`. 4. — 5. `unknown_size_count > 0` y nuevas cargas bloqueadas. 6. `module_storage_snapshot` marca `size_unknown` (0101:1131–1146); begin/finalize hacen fail-closed (`STORAGE_UNVERIFIABLE`, 0101:1697, 1553). 7. Suficiente para filas de dominio/intents. 8. — 9. — 10. snapshot revocada a clientes. 11. `A16_unknown_physical_size_blocks_uploads`. 12. Cargas bloqueadas mientras haya desconocidos. 13. Insertar desconocido y probar que begin falla. 14. — · **Nota:** objetos físicos **sin fila de dominio** (huérfanos por A01/A02) no aparecen en el snapshot ⇒ ni siquiera cuentan como "desconocidos"; ese hueco es A01/A02, no A16.

### A17 — Intent failed/expired con objeto existente — **PROTEGIDO**
1. PROTEGIDO. 2. `authenticated`. 3. Intent `failed`/pending-vencido con objeto subido. 4. — 5. Sus bytes siguen contando hasta confirmar el retiro físico. 6. `module_storage_snapshot` suma `expected_size_bytes` de intents textiles `failed`/pending-vencidos y de `storage_upload_intents` no finalizados/no resueltos (0101:1113–1130); solo `resolve_storage_deletion`/`resolve_cpr_upload_intent_object` server-only liberan (0101:212, 2049). 7. Suficiente. 8. — 9. — 10. resolución server-only. 11. `A17_failed_intent_object_still_counted`. 12. Bytes siguen contabilizados. 13. QA: intent failed con objeto → snapshot lo cuenta. 14. —

### A18 — Reutilización de idempotency key vencida — **PROTEGIDO**
1. PROTEGIDO. 2. `authenticated`. 3. `begin` con la misma `idempotency_key` tras vencer. 4. — 5. No bloquea; sin `unique_violation`; sin duplicar reservas. 6. Índice único **parcial** `where idempotency_key is not null and status='pending'` (0101:1037–1039 CPR; 0101:~1065 textil); begin marca `expired` la key vencida atómicamente antes de reinsertar (CPR 0101:1682–1694; textil 0101:~1274). 7. Suficiente: la key vencida sale del índice parcial; el nuevo begin procede; revive-por-ruta evita doble reserva. 8. — 9. — 10. begins grant a `authenticated`. 11. `A18_expired_idempotency_key_reuse`. 12. Nuevo begin exitoso, sin violación ni duplicado. 13. QA: vencer y reusar key. 14. —

---

## 3. §7 · Auditoría de finalizers

| Finalizer | Ejecuta | Grant | DEFINER | Identidad | ¿Lee objeto físico? | Tamaño real | MIME real | ¿Acepta tamaño del cliente? | ¿Verifica existencia? | Revalida plan | Revalida cuota | Bloquea concurrencia | Idempotente | Fallo tras upload | **Clasificación** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `finalize_textile_evidence_upload_server` (0101:1405) | service_role | service_role (0101:1592) | sí | `p_actor_id` revalidado contra memberships | **Sí** (el servidor lo lee antes: `textiles-evidences.ts:405`) | `objectInfo.sizeBytes` == expected | Content-Type + **firma binaria** (`:432`) | compara real vs expected | sí (server marca failed si no existe) | sí | sí (snapshot+plan) | advisory locks | sí | marca `failed`, retiro inspeccionado | **SERVER-VERIFIED** |
| `finalize_evidence_attachment` (CPR, 0101:1793) | authenticated | **authenticated** (0101:1883) | sí | `auth.uid()` | **No** | confía `p_file_size_bytes==expected` (cliente) | no verifica | **sí** | **no** | sí (`allowed`) | sí (snapshot) | advisory lock | sí | intent durable, resolución server-only | **CLIENT-TRUSTING** |
| `finalize_trazadoc_file_document_initial_version_v2` (0101:1891) | authenticated | **authenticated** (0101:1948) | sí | `auth.uid()` | **No** | confía cliente | MIME del intent (cliente) | **sí** | **no** | sí (`allowed`) | **no** (sin snapshot) | advisory lock | sí | intent durable | **CLIENT-TRUSTING** |
| `replace_trazadoc_file_document_v2` (0101:1950) | authenticated | **authenticated** (0101:2006) | sí | `auth.uid()` | **No** | confía cliente | MIME del intent (cliente) | **sí** | **no** | sí (`allowed`) | **no** | advisory lock | sí | versión histórica conserva referencia | **CLIENT-TRUSTING** |

**Conclusión §7:** solo el finalizer **Textiles** es SERVER-VERIFIED. Los tres finalizers **CPR/TrazaDocs** son **CLIENT-TRUSTING** (→ vulnerables por definición del encargo). Ninguno de los tres verifica existencia física ni tamaño/MIME reales; los tres son ejecutables directamente por `authenticated`, de modo que una Server Action correcta no los protege.

---

## 4. §8 · Auditoría del orden de triggers

Regla PostgreSQL: para el mismo evento (p. ej. BEFORE INSERT ROW), los triggers se ejecutan en **orden alfabético ascendente de nombre**.

### `trazadoc_documents` — BEFORE INSERT (crítico)

| Orden | Trigger | Origen | Función | Efecto |
|---|---|---|---|---|
| 1 | `t_trazadoc_documents_limit` | 0101:969 | `enforce_module_resource_limit('BY_MODULE_KEY',…)` | Deriva el módulo de **`new.module_key`** (aún sin normalizar) |
| 2 | `t_trazadoc_documents_module_key` | 0082:80 | `set_trazadoc_document_module_key` | Sobrescribe `module_key` desde el **blueprint** |

`'t_trazadoc_documents_limit'` < `'t_trazadoc_documents_module_key'` (comparación en la posición `l` vs `m`). **El límite corre primero** ⇒ **A13 VULNERABLE**. El dato comercial usado por el trigger de límites (`module_key`) **sí** es manipulable por el cliente en el instante de la evaluación. El comentario de 0101:872 es incorrecto respecto al orden real.

### `trazadoc_documents` — BEFORE UPDATE
`t_trazadoc_documents_module_key` (0082) reafirma `module_key` desde el blueprint en UPDATE (bloquea cambio posterior). No afecta al INSERT ya evaluado.

### `evidences` — BEFORE UPDATE (orden y cobertura)

| Orden | Trigger | Origen | Rol de la comprobación |
|---|---|---|---|
| 1 | `t_evidences_guard_integrity` | 0023:78 | Inmutabilidad de evidencias `valid`; storage_path de validadas solo admin/quality |
| 2 | `t_evidences_org_immutable` | 0024:57 | `organization_id` inmutable |
| 3 | `t_evidences_physical_guard` | 0101:584 | `storage_path`, `size_bytes` inmutables para `authenticated` |
| 4 | `t_evidences_updated` | 0019:27 | `set_updated_at` |

Cobertura física completa para las columnas existentes (no hay `mime_type`/`bucket_id`/`checksum` en `evidences`). **A11 protegido.**

### `trazadoc_file_documents` — BEFORE INSERT / UPDATE
- INSERT: `t_trazadoc_file_documents_limit` (0101:974) — límite `documents_trazadocs` (lock compartido con vivos). **A10 ok.**
- UPDATE: `t_trazadoc_file_documents_physical_guard` (0101:586) cubre `storage_path,size_bytes,file_name,mime_type` (= 4 columnas físicas de 0057:61–64). **A11 ok.**

### `textile_evidences` — BEFORE UPDATE
- `t_textile_evidences_file_immutable` (0077) — **sin gate de rol**, bloquea los 4 metadatos para todos los roles.
- `t_textile_evidences_physical_guard` (0101:588) — redundante (defensa en profundidad).
- **A11 ok** (Textiles es el más fuerte).

### Recursos limitados — BEFORE INSERT
16 triggers `t_<tabla>_limit` (0101:955–988) sobre todas las tablas con `plan_limits`. Ninguna tabla limitada carece de trigger. **A10 protegido.**

**Conclusión §8:** el único problema de orden es `trazadoc_documents` (límite antes de normalización de `module_key`) → A13. El resto de órdenes son correctos.

---

## 5. §9 · No confíes en los shims — límites del arnés local

Arneses presentes: `scripts/t9f2-local-sql-harness/`, `scripts/t9f3-local-sql-harness/` (`shims-extra.sql`, `smoke.sql`, `run.sh`, `concurrency.sh`).

El propio `README` del arnés T9F.3 lo declara: *"aquí no hay RLS ni Storage físico — se valida la BARRERA de límites y el ciclo contable, no el aislamiento."*

- **Qué simulan:** triggers atómicos de límite, reservas Textiles (begin/finalize/cancel/vencimiento), tamaños desconocidos, ciclo `pending_delete → deleted/failed`, funciones server-only, concurrencia real con sesiones psql. `shims-extra.sql` recrea `auth.users`, `plan_definitions` (cuotas reales), intents textiles, `has_org_role`, columnas de dominio.
- **Qué NO reproducen:**
  - **RLS** (row-level security): las políticas de `public.*` y de `storage.objects` **no se ejercen**. → A01–A04, A15 (aislamiento), A12 (deny por ausencia de política) **no** se validan localmente.
  - **Storage físico** (`storage.objects`, buckets, signed URLs): la verificación de tamaño/MIME/firma reales y la existencia del objeto **no** se prueban. → A05–A07 (parte física) fuera del arnés.
  - **Grants reales de Supabase**: el arnés usa `set role authenticated` con privilegios de tabla simplificados; los `grant execute` reales a `authenticated`/`service_role` no se auditan por ejecución.
  - **Orden de triggers en el esquema real** frente al simulado (A13 se deriva por análisis, no por el smoke).
- **Conclusión:** un resultado local "TODO EN VERDE" (40/40, 1092/1092, 32 checks, etc.) **no** es evidencia de A01–A07, A13 ni del aislamiento. La verificación real requiere `tests/rls/t9f5-adversarial-attacks.test.ts` contra Supabase QA con Storage.

---

## 6. Estado de validaciones (§13)

| Validación | Estado |
|---|---|
| Búsqueda estática / análisis de árbol / inspección SQL | **Ejecutado** |
| Reconstrucción de políticas `storage.objects` acumuladas | **Ejecutado** |
| Reconstrucción de orden de triggers | **Ejecutado** |
| Lectura de acciones de servidor TS (finalize/begin) | **Ejecutado** |
| Suite adversarial `t9f5-adversarial-attacks.test.ts` | **Preparada, NO ejecutada** |
| Ejecución contra Supabase staging/producción | **No ejecutado** (prohibido) |
| Prueba de Storage físico real | **No demostrable en este entorno** |
| Aplicación de migraciones | **No ejecutado** (prohibido) |

## 7. Limitaciones de la auditoría

1. **Estática, no dinámica.** No se conectó a Supabase; las conclusiones sobre `storage.objects` y grants se derivan del código, no de `pg_policies`/`pg_proc` en vivo. Una divergencia repo↔esquema desplegado no sería visible.
2. **Sin Storage real.** A01–A07 en su componente físico requieren un proyecto QA con Storage para confirmarse; aquí se demuestran por lectura de políticas/funciones, que es condición **suficiente** para clasificar como vulnerable (una política permisiva existe), pero la reproducción end-to-end queda para QA.
3. **A08/A14 = NO DEMOSTRADO** por diseño del código (falta de revalidación de cuota en finalize TrazaDocs; tope de archivo fijo sin dimensión por plan); se tratan como vulnerables para aprobación.
4. **Alcance.** No se auditó la superficie no relacionada con CPR/Textiles/TrazaDocs/almacenamiento (p. ej. pasaportes, circularidad, invitaciones) salvo donde intersecta con límites/almacenamiento.
5. **No es un acta de cierre.** Este informe refuta afirmaciones de seguridad de T9F.4 y produce evidencia utilizable por un implementador; no aprueba ni corrige.
