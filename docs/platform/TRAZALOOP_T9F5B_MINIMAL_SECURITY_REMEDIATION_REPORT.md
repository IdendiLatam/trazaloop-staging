# TRAZALOOP · T9F.5B · INFORME DE REMEDIACIÓN MÍNIMA DE SEGURIDAD

> Corrección de los diez ataques que T9F.5A clasificó como VULNERABLES o NO DEMOSTRADOS.
> **Corregido por T9F.5B.1** (ver `TRAZALOOP_T9F5B1_PRE_QA_CORRECTION_REPORT.md`): acceso comercial resuelto por actor explícito bajo `service_role`, carga directa de archivos y política canónica de tamaño físico.
> **Este informe no aprueba nada.** No hubo ejecución contra Supabase real: la clasificación
> final de los ataques depende de la validación adversarial T9F.5C en un proyecto QA real.

---

## 1. Resumen ejecutivo

La auditoría independiente T9F.5A encontró que la arquitectura de *reserva → verificación → finalización* construida por T9F.4 era **sólida pero eludible**: dos superficies abiertas permitían saltársela por completo.

1. **`storage.objects` autorizaba por rol, no por intent.** Cuatro políticas permisivas (`evidences_insert_legacy`, `trazadocs_documents_insert`, `trazadocs_documents_update`, `trazadocs_documents_delete`) dejaban que cualquier miembro con rol subiera, sobrescribiera o borrara objetos sin pasar por una sola reserva.
2. **Los finalizers CPR/TrazaDocs eran CLIENT-TRUSTING.** Ejecutables por `authenticated`, aceptaban el tamaño y el MIME que declarara el navegador y nunca consultaban el objeto físico.

T9F.5B cierra ambas superficies con la corrección **mínima**: se ligan las escrituras de Storage a un intent exacto, se retiran los verbos directos de modificación y borrado, y los tres finalizers pasan a ser **server-only con verificación física real**. Se añaden además la revalidación de cuota en el instante del finalize (A08), la derivación autoritativa del módulo desde el blueprint (A13) y los topes por archivo diferenciados por tipo de recurso y plan (A14).

**Lo que este sprint SÍ establece:** la corrección está implementada en código, las pruebas locales pasan y la suite adversarial queda preparada para ejecutarse contra QA real.

**Lo que este sprint NO establece:** que los ataques estén protegidos. Las pruebas locales son puras y estructurales; no ejercen RLS, ni Storage físico, ni grants reales. La única evidencia admisible para reclasificar un ataque es la ejecución T9F.5C.

| Métrica | Valor |
|---|---|
| Ataques corregidos en código | 10 (A01–A08, A13, A14) |
| Protecciones conservadas con regresión | 8 (A09–A12, A15–A18) |
| Migraciones nuevas creadas | **0** (la corrección viaja en la 0101 pendiente) |
| Migraciones aplicadas | **0** |
| Conexiones a Supabase | **0** |
| Ataques declarados PROTEGIDOS | **0** — la clasificación es de T9F.5C |

---

## 2. Rama y commit de entrada

| Campo | Valor |
|---|---|
| Repositorio | `IdendiLatam/trazaloop-staging` |
| Rama | `feature/t9f5b-minimal-security-remediation` |
| Commit de entrada esperado | `b922e1cac90f8b31c266bccba86b63966dda2cc3` |
| Commit de entrada verificado (HEAD) | `b922e1cac90f8b31c266bccba86b63966dda2cc3` — *"test: add T9F.5A adversarial security audit"* |
| Coincidencia rama/commit | **SÍ** |
| Migración pendiente | `supabase/migrations/0101_t9f1_module_access_hardening.sql` (nunca aplicada) |
| Commit/push/PR/merge/deploy | **Ninguno** |

---

## 3. Artefactos T9F.5A utilizados

Los cinco existen y fueron leídos íntegramente antes de tocar una sola línea:

| Artefacto | Uso en T9F.5B |
|---|---|
| `docs/platform/TRAZALOOP_T9F5A_RED_TEAM_REPORT.md` | Causa raíz, archivo:línea y corrección mínima de cada ataque |
| `docs/platform/TRAZALOOP_T9F5A_ATTACK_MATRIX.md` | Clasificación de partida y pruebas esperadas |
| `docs/platform/TRAZALOOP_T9F5A_STORAGE_POLICY_INVENTORY.md` | Estado acumulado de `storage.objects` y políticas supervivientes |
| `docs/platform/TRAZALOOP_T9F5A_MINIMAL_REMEDIATION_PLAN.md` | Diseño de la corrección y riesgos de regresión |
| `tests/rls/t9f5-adversarial-attacks.test.ts` | Base de la suite adversarial, actualizada en esta fase |

**Discrepancia deliberada con el plan T9F.5A.** El plan sugería entregar la corrección en una migración nueva (`0102`). No se hizo, y el motivo está en §24: la 0101 **nunca se aplicó** y todas las funciones afectadas nacen en ella. Crear una 0102 que reemplazara funciones que aún no existen en ninguna base sería ruido arqueológico. El encargo T9F.5B lo indica explícitamente: corregir 0101 directamente, no crear 0102.

---

## 4. Alcance limitado

**Dentro de alcance:** A01, A02, A03, A04, A05, A06, A07, A08, A13, A14, más las regresiones de A09–A12 y A15–A18.

**Fuera de alcance, y no se tocó:** auditoría general nueva, rediseño del sistema, planes o cuotas comerciales, creación de planes, funciones exclusivas de Extra, pasaportes, QR, circularidad, hints, traducciones, limpieza de staging, migraciones 0093–0100, creación de 0102, aplicación de migraciones.

Las áreas ya clasificadas como PROTEGIDAS solo se tocaron donde una dependencia técnica lo exigía, y siempre en sentido endurecedor:

- `enforce_module_resource_limit` (A10) se modificó **únicamente** para derivar el módulo del blueprint (A13). El resto de su lógica —advisory lock, conteo, rechazo del exceso— quedó intacta.
- `module_storage_snapshot` (A16/A17) **no se modificó**: los finalizers la invocan tal cual.

---

## 5. Archivos inspeccionados

**SQL:** `0101` (completa), `0100`, `0099`, `0094`, `0082`, `0058`, `0059`, `0057`, `0050`.

**TypeScript:** `server/actions/evidences.ts`, `server/actions/trazadocs-master.ts`, `server/actions/textiles-evidences.ts` (patrón de referencia), `lib/db/storage-intents.ts`, `lib/db/trazadocs-master.ts`, `lib/db/textiles-evidences.ts`, `lib/db/storage-deletion.ts`, `lib/domain/trazadocs-master.ts`, `lib/domain/textiles-evidence-signatures.ts`, `lib/supabase/admin.ts`, `lib/auth/require-session.ts`, `lib/auth/require-active-org.ts`.

**Pruebas:** `tests/unit/t9f1…`, `t9f2…`, `t9f3…`, `t9f4…`, `tests/unit/document-master.test.ts`, `tests/evidences/textiles-storage-policies-static.test.ts`, `tests/rls/t9f5-adversarial-attacks.test.ts`.

---

## 6. Políticas de Storage acumuladas

Reconstrucción del estado acumulado tras `0015 → 0016 → 0049 → 0058 → 0076 → 0099 → 0100 → 0101` **con** la corrección T9F.5B (§12 de la 0101).

### Bucket `evidences`

| Política | Op | Origen | ¿0101 la elimina? | Estado final |
|---|---|---|---|---|
| `evidences_select` | SELECT | 0016 | no | **ACTIVA** (sin cambios) |
| `evidences_insert` (genérica) | INSERT | 0016 | ya eliminada en 0099 | eliminada |
| `evidences_insert_legacy` | INSERT | 0099 | **SÍ (A01)** | **ELIMINADA** |
| `evidences_insert_cpr` | INSERT | **0101 §12** | — | **ACTIVA — exige intent exacto** |
| `evidences_insert_textiles` | INSERT | 0099 | no | **ACTIVA — intacta** |
| `evidences_delete_textiles` | DELETE | 0076 | ya eliminada en 0099 | eliminada |
| *(ninguna)* | UPDATE | — | — | **DENY por defecto** |
| *(ninguna)* | DELETE | — | — | **DENY por defecto** |

### Bucket `trazadocs-documents`

| Política | Op | Origen | ¿0101 la elimina? | Estado final |
|---|---|---|---|---|
| `trazadocs_documents_select` | SELECT | 0058 | no | **ACTIVA** (sin cambios) |
| `trazadocs_documents_insert` | INSERT | 0058 | **SÍ (A02)** | **ELIMINADA** |
| `trazadocs_documents_insert_intent` | INSERT | **0101 §12** | — | **ACTIVA — exige intent exacto** |
| `trazadocs_documents_update` | UPDATE | 0058 | **SÍ (A03)** | **ELIMINADA — deny por defecto** |
| `trazadocs_documents_delete` | DELETE | 0058 | **SÍ (A04)** | **ELIMINADA — deny por defecto** |

### Bucket `organization-assets`

Sin cambios (0049). Fuera del alcance A01–A18: logos y branding, sin reserva ni cuota por objeto. Se documenta por completitud: sigue siendo una superficie donde `authenticated` escribe por rol.

### Por qué se elimina en lugar de solo añadir

En PostgreSQL las políticas **PERMISSIVE se combinan con OR**. Añadir una política restrictiva no cierra nada mientras sobreviva una permisiva que conceda lo mismo. Por eso cada política identificada por T9F.5A se retira con `drop policy if exists` **antes** de instalar su sustituta. Tras §12 no queda ninguna política alternativa que autorice INSERT sin intent, ni ningún UPDATE o DELETE de cliente sobre los dos buckets controlados.

---

## 7. A01 — Upload CPR directo sin intent

**Antes.** `evidences_insert_legacy` (0099) autorizaba el INSERT con la condición heredada de 0016: bucket correcto, segundo segmento distinto de `textiles` y `has_org_role(safe_uuid(foldername[1]), [admin, quality, consultant])`. Ni una palabra sobre intents. Cualquier miembro con rol podía subir a `{org}/{uuid-inventado}/archivo.pdf` sin haber llamado nunca a `begin_cpr_storage_upload`, dejando un objeto físico fuera de toda reserva y de toda contabilidad.

**Después.** La política se elimina y se sustituye por `evidences_insert_cpr`, cuyo `with check` delega en `storage_object_matches_upload_intent('evidences', name, array['evidence'])`. Se conserva la disyunción por el segundo segmento de 0099, de modo que una ruta textil jamás se ampara en la política CPR ni viceversa.

**Flujo Textiles conservado.** `evidences_insert_textiles` no se redefine, ni se elimina, ni se toca su predicado. Textiles autoriza su PUT contra su propia tabla de intents (`textile_evidence_upload_intents`) y sigue haciéndolo exactamente igual. Una prueba local lo verifica explícitamente.

---

## 8. A02 — Upload TrazaDocs directo sin intent

**Antes.** `trazadocs_documents_insert` (0058) autorizaba por `has_org_role(...)`. Ninguna migración posterior la endureció: 0099 tocó solo el bucket `evidences`, y 0100/0101 no tocaban Storage.

**Después.** Se elimina y se sustituye por `trazadocs_documents_insert_intent`, ligada a un intent con `resource_type in ('trazadoc_initial', 'trazadoc_replace')`.

**Riesgo de regresión atendido.** El reemplazo genera la ruta `v(n+1)`, que fija `begin_cpr_storage_upload` desde la fila de dominio. Como el predicado compara `i.object_path = p_object_name` con igualdad exacta, la ruta que el servidor reservó es la única que la política acepta.

---

## 9. A03 — UPDATE directo de `storage.objects`

**Antes.** `trazadocs_documents_update` (0058) concedía UPDATE a `admin`/`quality`. Su propio comentario admitía que se añadía «por si algún flujo necesita ajustar metadatos». Consecuencia real: `upload(path, bytes, { upsert: true })` reemplazaba el contenido físico de un objeto vivo sin tocar la fila `trazadoc_file_documents`, invalidando `size_bytes`, el versionado, la cuota y el historial. El guard de campos físicos no ayuda: actúa sobre la tabla, no sobre `storage.objects`.

**Después.** Se elimina sin reemplazo: deny-by-default, igual que `evidences` desde 0099. El reemplazo legítimo es siempre un objeto nuevo: nuevo intent → nueva ruta `vN+1` → upload autorizado → verificación física → finalización server-only → el objeto anterior pasa a versión histórica y sigue contabilizado.

**Verificación previa.** Ninguna Server Action usa `upsert: true` sobre `trazadocs-documents`; `uploadFileDocumentFile` sube siempre a la ruta reservada sin upsert.

---

## 10. A04 — DELETE directo de `storage.objects`

**Antes.** `trazadocs_documents_delete` (0058) permitía a `admin`/`quality` borrar físicamente un objeto mientras `trazadoc_file_documents` seguía apuntándolo: referencia colgante y elusión completa del ciclo `pending_delete`.

**Después.** Se elimina sin reemplazo. La eliminación física queda reservada al flujo server-only ya existente:

```
fila de dominio o versión → pending_delete → retiro server-only verificado → deleted confirmado
```

`queue_and_delete_trazadoc_draft`, `resolve_storage_deletion` y `resolve_cpr_upload_intent_object` siguen intactas y server-only. Como `service_role` no pasa por RLS, retirar la política de clientes no deja ningún flujo legítimo sin vía.

**Lectura no debilitada.** Ninguna política SELECT se elimina ni se modifica; la descarga autorizada y las URLs firmadas siguen funcionando igual.

---

## 11. A05 — Finalize sin objeto físico

**Antes.** `finalize_evidence_attachment` y las dos `_v2` de TrazaDocs estaban concedidas a `authenticated` y no consultaban `storage.objects` en ningún punto. Un `begin` seguido de un `finalize`, sin subir un solo byte, fijaba `storage_path` y `size_bytes` en la fila de dominio.

**Después.** Patrón obligatorio implementado:

```
Cliente autenticado
  → Server Action (autentica al usuario y valida membresía)
  → código server-only lee la metadata FÍSICA (existencia, bucket, ruta, tamaño, MIME)
  → código server-only valida la FIRMA BINARIA de los bytes reales
  → RPC server-only finaliza con los valores VERIFICADOS
```

Tres funciones nuevas: `finalize_evidence_attachment_server`, `finalize_trazadoc_file_document_initial_version_server` y `replace_trazadoc_file_document_server`, todas `revoke … from public, anon, authenticated` y `grant … to service_role`. Las tres firmas históricas quedan revocadas y lanzan `SERVER_ONLY_FINALIZER`.

Cada función rechaza en cascada: `SERVER_ONLY` si los claims no son de servicio, `ACTOR_REQUIRED`/`ACTOR_NOT_FOUND` sin actor real, `OBJECT_NOT_VERIFIED`/`OBJECT_MIME_UNVERIFIED` sin metadata física, `INTENT_NOT_OWNED` si el intent es de otro y `ROLE_NOT_ALLOWED` si el rol se perdió.

`SECURITY DEFINER` no sustituye a la verificación física: es solo el mecanismo que permite escribir; la comprobación del objeto ocurre antes y es independiente.

---

## 12. A06 — Tamaño físico mayor que el declarado

**Antes.** El finalizer exigía `p_file_size_bytes = expected_size_bytes`, pero **ambos** valores venían del cliente. Reservar 1 MB, subir 50 MB y finalizar 1 MB era coherente para la base.

**Después.** El tamaño final procede exclusivamente de `getCprStorageObjectInfo`, que lee `storage.objects` en servidor. El cliente no decide *actual size*, *stored size*, `size_bytes` final ni bytes consumidos.

El finalizer obtiene el tamaño físico y aplica la **política canónica fijada en T9F.5B.1: rechazo estricto**. El tamaño real debe ser EXACTAMENTE el reservado (`OBJECT_SIZE_MISMATCH` en caso contrario); no existe ampliación de reserva en finalize. Además se compara con el tope por archivo del plan vigente y con la cuota actual —`committed + (reserved − esta reserva) + tamaño_real ≤ cuota`, bajo el advisory lock del módulo— y se registra `size_bytes = p_real_size_bytes`. Ante fallo no se crea la referencia final y el objeto conserva su referencia durable, de modo que sus bytes siguen contabilizados hasta un retiro confirmado.

**Objeto mayor que su reserva sin finalize (cerrado en T9F.5B.1).** `module_storage_snapshot` contabiliza los intents CPR por el MAYOR entre el tamaño declarado y el FÍSICO real leído de `storage.objects`, tanto en las reservas activas como en los intents no resueltos. Reservar 1 MB, subir 5 MB y no finalizar ya no concede capacidad ficticia.

---

## 13. A07 — MIME físico diferente

**Antes.** El MIME se fijaba en `begin` desde el cliente y jamás se revalidaba. Declarar `application/pdf` y subir otra cosa pasaba sin obstáculo.

**Después.** Dos barreras. En SQL, `OBJECT_MIME_MISMATCH` si el MIME físico no coincide con el reservado. En servidor, `validateCprBinarySignature` exige que **extensión, MIME declarado, Content-Type almacenado y firma detectada** correspondan al mismo tipo.

**Sin ampliar la lista de MIME.** Se reutiliza `validateTextileEvidenceBinarySignature` (T9E.2/T9E.3) tal cual, con su parser ZIP real para OOXML y su UTF-8 estricto para CSV. T9E no se modifica; una prueba local verifica que su archivo no contiene rastro de T9F.5B. La única adición es la comprobación de la magia OLE2 para `.doc`/`.xls`, tipos que TrazaDocs **ya** permitía y que sin ella habrían fallado cerrado, rompiendo un flujo legítimo.

Cuando la metadata no permite asegurar el MIME, se falla cerrado: no se finaliza y no se registra un MIME del cliente como si hubiera sido verificado.

---

## 14. A08 — Revalidación de plan y cuota en finalize

**Antes.** Los finalizers TrazaDocs comprobaban `resolve_organization_module_access(...)->>'allowed'` pero nunca recalculaban cuota. Una reserva creada bajo Extra se consumía tal cual aunque el módulo hubiera pasado a Demo.

**Después.** `assert_trazadoc_finalize_preconditions` centraliza, bajo el advisory lock del módulo: `access_mode` actual → tope por archivo del plan actual → cuota actual desde `plan_definitions` → `module_storage_snapshot` (uso confirmado + reservas activas) → comparación contra el **tamaño físico real** → rechazo si no hay capacidad. Fail-closed ante desconocidos o conflictos.

Se aplica a los tres finalizers. `finalize_evidence_attachment_server` ejecuta la misma secuencia en línea.

**Escenario obligatorio cubierto:** begin bajo Extra → reserva → módulo a Demo → finalize ⇒ rechazo por cuota o por tope de archivo. Escenario A08 de la suite adversarial.

**Idempotencia conservada.** CPR devuelve `already_finalized: true` sin duplicar; TrazaDocs rechaza con `INTENT_ALREADY_FINALIZED`.

---

## 15. A13 — `module_key` manipulado

**Antes.** PostgreSQL ejecuta los triggers `BEFORE INSERT` en orden alfabético de nombre. Como `t_trazadoc_documents_limit` < `t_trazadoc_documents_module_key`, el trigger de límite leía `new.module_key` **antes** de que 0082 lo normalizara desde el blueprint. Un documento con blueprint CPR y `module_key='textiles'` se evaluaba contra el plan Textiles y luego se guardaba como CPR.

**Después.** Se aplicó la **estrategia preferida**: la función de límite consulta directamente `trazadoc_blueprints` y deriva el `module_key` real cuando hay `blueprint_id`. Solo un documento libre (sin blueprint) usa `new.module_key`. Un `blueprint_id` inexistente falla cerrado con `BLUEPRINT_NOT_FOUND`.

No se renombró ningún trigger: la corrección **no depende del orden de ejecución**, que era precisamente la fragilidad del hallazgo. Renombrar habría funcionado hasta el día en que alguien añadiera otro trigger.

---

## 16. A14 — Archivo TrazaDocs Full de 22 MB

**Antes.** Un tope fijo de 20 MB, idéntico para todos los tipos y planes, en `begin_cpr_storage_upload`, en el CHECK de `storage_upload_intents` y en varios puntos más. La base era **más restrictiva que el producto**: la capa TypeScript ya definía Demo 10 MB y Full/Extra 25 MB. Un TrazaDocs Full de 22 MB se rechazaba con `FILE_SIZE_INVALID`.

**Después.** `cpr_upload_max_file_bytes(resource_type, access_mode)` es la única fuente del tope en SQL:

| Tipo de recurso | Plan | Máximo por archivo |
|---|---|---|
| Evidencia CPR | cualquiera | **20 MB** (máximo técnico propio, sin asumir el de TrazaDocs) |
| TrazaDocs | demo | **10 MB** |
| TrazaDocs | full | **25 MB** |
| TrazaDocs | extra | **25 MB** (mismo tope por archivo que Full; Extra difiere solo en la cuota total) |

Un modo no resoluble devuelve NULL y el llamador falla cerrado con `FILE_SIZE_LIMIT_UNVERIFIABLE`.

El CHECK estructural de `storage_upload_intents` sube a 25 MB —el máximo técnico superior permitido—, y el límite específico lo aplica la RPC, tal como exige el encargo. `begin` lo evalúa una vez conocido el `access_mode` vigente; los finalizers lo re-verifican con el plan del momento.

**Textiles no se toca:** conserva su propio tope de 20 MB en `begin_textile_evidence_upload_v2` y `finalize_textile_evidence_upload_server`.

**No se cambiaron planes ni cuotas comerciales:** `plan_definitions` y `plan_limits` quedan exactamente como estaban.

---

## 17. Finalizers server-only

| Función | Ejecuta | Grant | Verifica objeto físico | Tamaño | MIME | Revalida plan | Revalida cuota | Idempotente |
|---|---|---|---|---|---|---|---|---|
| `finalize_evidence_attachment_server` | service_role | service_role | **sí** (el servidor lo lee antes) | físico real | físico real | sí | **sí** | sí |
| `finalize_trazadoc_file_document_initial_version_server` | service_role | service_role | **sí** | físico real | físico real | sí | **sí** | sí |
| `replace_trazadoc_file_document_server` | service_role | service_role | **sí** | físico real | físico real | sí | **sí** | sí |
| `assert_trazadoc_finalize_preconditions` | service_role | service_role | exige valores físicos | — | — | sí | sí | — |
| `finalize_evidence_attachment` (histórica) | — | **ninguno** | — | — | — | — | — | — |
| `finalize_trazadoc_file_document_initial_version_v2` (histórica) | — | **ninguno** | — | — | — | — | — | — |
| `replace_trazadoc_file_document_v2` (histórica) | — | **ninguno** | — | — | — | — | — | — |

Superficie por rol:

- **`authenticated`:** `begin_cpr_storage_upload`, `cancel_cpr_storage_upload`, `queue_and_delete_*`, `count_module_resource`, `check_module_resource_allowance`, `storage_object_matches_upload_intent` (predicado de política, no expone filas).
- **Solo servidor:** los cuatro finalizers, `register_storage_orphan`, `resolve_storage_deletion`, `resolve_cpr_upload_intent_object`, `module_storage_snapshot`.

`lib/db/cpr-storage-objects.ts` lleva `import "server-only"`, que hace fallar el build si un componente de cliente lo importa. `createAdminClient` ya tenía ese guard. Ninguna clave se expone. Las Server Actions autentican con `requireSession()` antes de usar privilegios de servidor y pasan el `user.id` real como actor; la RPC revalida que el intent pertenezca a ese actor y que su rol siga vigente. Un cliente no puede llamar al finalizer con intent ajeno, tamaño inventado, MIME inventado ni ruta inventada.

---

## 18. Verificación física

`getCprStorageObjectInfo(bucket, path)` devuelve `null` —y el llamador falla cerrado— si el objeto no existe, si el bucket o la ruta no coinciden, si la metadata no puede consultarse o si el tamaño no es positivo. `downloadCprStorageObjectBytes` obtiene los bytes reales para la firma binaria; el archivo nunca viaja desde el navegador hacia la verificación.

La lectura usa la **sesión del usuario**, no `service_role`: el servidor no necesita privilegios para leer lo que el propio usuario acaba de subir, y así la lectura sigue sujeta a RLS.

---

## 19. Revalidación de cuota

Ver §14. Se aplica a finalize inicial TrazaDocs, replace TrazaDocs y finalize de evidencia CPR: los tres consumidores de una reserva CPR/TrazaDocs.

---

## 20. Derivación desde blueprint

Ver §15. La derivación ocurre antes de resolver el acceso y antes de consultar `plan_limits`, de modo que el módulo usado para el límite es siempre el real.

---

## 21. Límites por archivo

Ver §16. La capa TypeScript (`lib/domain/cpr-file-verification.ts` y `lib/domain/trazadocs-master.ts`) es espejo exacto de la función SQL, y una prueba local compara ambos: si uno cambiara sin el otro, la prueba se pone en rojo.

---

## 22. Regresiones A09–A12 y A15–A18

No se reabrió la arquitectura de ninguno. Pruebas locales de regresión añadidas en `tests/unit/t9f5b-minimal-security-remediation.test.ts` §G, y escenarios reales preparados en la suite adversarial.

| Ataque | Qué se conserva | Verificación local |
|---|---|---|
| A09 | Advisory locks por (org, módulo, recurso); serialización | 16 triggers de límite presentes; lock en la función |
| A10 | Trigger `BEFORE INSERT` INVOKER en las 16 tablas | conteo de triggers y `RESOURCE_LIMIT_EXCEEDED` |
| A11 | `forbid_physical_field_mutation` + 3 guards | `PHYSICAL_FIELD_IMMUTABLE` y conteo de guards |
| A12 | Sin políticas DELETE de dominio; solo `queue_and_delete_*` | los tres `drop policy` siguen presentes |
| A15 | Guard de aislamiento en `count_module_resource` | `is_org_member` en la función |
| A16 | `unknown_size_count` bloquea cargas | `STORAGE_UNVERIFIABLE` presente |
| A17 | Intents no resueltos siguen contando | filtro del snapshot intacto |
| A18 | Índice único parcial de idempotencia | índice presente |

No se rebajó ningún trigger atómico, ni `pending_delete`, ni `unknown_size_count`, ni el aislamiento por `auth.uid()`, ni la idempotencia, ni la contabilidad conservadora.

---

## 23. Cambios en 0101

| Sección | Cambio |
|---|---|
| Cabecera | Documenta el alcance T9F.5B y el motivo de no crear 0102 |
| §5 | `enforce_module_resource_limit` deriva el módulo del blueprint (A13) |
| §6 | CHECK de `storage_upload_intents` a 25 MB (A14) |
| §6b.0 | **Nueva** `cpr_upload_max_file_bytes` (A14) |
| §6b | Tope por plan en `begin_cpr_storage_upload` (A14) |
| §6b | **Nueva** `assert_trazadoc_finalize_preconditions` (A05–A08) |
| §6b | **Nuevas** tres funciones `*_server`; tres firmas históricas cerradas (A05–A07) |
| §11 | Cuatro verificaciones posteriores añadidas |
| §12 | **Nueva sección**: predicado de intent y las cuatro políticas de Storage (A01–A04) |

No se introdujo `TRUNCATE`, limpieza de staging, cambios de planes o cuotas, backfills comerciales, desactivación de RLS ni DROP destructivos sin reemplazo. Los únicos `drop policy` son las tres de DELETE de dominio de T9F.4 y las cuatro de Storage de T9F.5B.

---

## 24. Motivo para no crear 0102

1. **0101 nunca se aplicó.** No hay base donde exista el estado que una 0102 corregiría.
2. **Las cinco funciones afectadas nacen en 0101.** Una 0102 haría `create or replace` de funciones inexistentes en cualquier entorno real.
3. **Debe llegar como una unidad.** La propia 0101 lo declara para T9F.3; T9F.5B mantiene el criterio.
4. **El encargo lo exige:** «puedes corregir directamente 0101; no debes crear 0102».

Verificado por prueba local: no existe ningún archivo `0102*` en `supabase/migrations/`.

---

## 25. Archivos creados

```
lib/db/cpr-storage-objects.ts
lib/domain/cpr-file-verification.ts
tests/unit/t9f5b-minimal-security-remediation.test.ts
docs/platform/TRAZALOOP_T9F5B_MINIMAL_SECURITY_REMEDIATION_REPORT.md
docs/platform/TRAZALOOP_T9F5B_ATTACK_CLOSURE_MATRIX.md
docs/platform/TRAZALOOP_T9F5C_QA_EXECUTION_GUIDE.md
```

## 26. Archivos modificados

```
supabase/migrations/0101_t9f1_module_access_hardening.sql
lib/db/storage-intents.ts
lib/db/trazadocs-master.ts
server/actions/evidences.ts
server/actions/trazadocs-master.ts
package.json
tests/rls/t9f5-adversarial-attacks.test.ts
tests/unit/t9f1-module-operational-enforcement.test.ts
tests/unit/t9f2-limits-storage-concurrency.test.ts
tests/unit/t9f4-file-accounting-and-reservations.test.ts
tests/unit/document-master.test.ts
```

Las cuatro pruebas modificadas contenían aserciones que **codificaban el comportamiento vulnerable** (por ejemplo «0101 no toca `storage.objects`», o el `grant` de `finalize_evidence_attachment` a `authenticated`). Se actualizaron al invariante corregido, nunca se debilitaron: cada una exige ahora más de lo que exigía.

## 27. Archivos eliminados

Ninguno.

---

## 28. Pruebas locales

`tests/unit/t9f5b-minimal-security-remediation.test.ts` — **32 comprobaciones, 32 en verde**.

| Ataque | Prueba |
|---|---|
| A01 | La migración elimina la política CPR legacy y exige intent exacto; Textiles conservado |
| A02 | TrazaDocs INSERT exige intent inicial o de reemplazo |
| A03 | No existe UPDATE directo de `authenticated` sobre objetos controlados |
| A04 | No existe DELETE directo; el retiro sigue siendo server-only |
| A05 | El finalizer falla sin metadata física verificada; grants server-only |
| A06 | El tamaño registrado procede del servidor (regla pura: 1 MB reservado / 5 MB real ⇒ rechazo) |
| A07 | MIME del servidor y validado (regla pura: PDF declarado + contenido no-PDF ⇒ rechazo) |
| A08 | Finalize recalcula acceso, plan y cuota actual |
| A13 | El módulo se deriva del blueprint antes del límite |
| A14 | 22 MB Full permitido, 22 MB Demo rechazado, 26 MB Full rechazado, CPR con su tope propio |

**Estas pruebas no sustituyen a las pruebas RLS ni de Storage reales.** Son puras y estructurales: leen el SQL y el TypeScript del repositorio y evalúan las reglas de dominio que sí son puras. No ejecutan PostgreSQL, no ejercen RLS y no tocan Storage. La propia suite lo declara en su cabecera, y una de sus comprobaciones verifica que esa declaración siga presente.

---

## 29. Suite QA preparada

`tests/rls/t9f5-adversarial-attacks.test.ts`, ejecutable como `npm run test:t9f5-adversarial`. Cubre A01–A18. Para A01–A08, A13 y A14 realiza **operaciones reales**: `upload`, `upload` con `upsert: true`, `remove`, RPC de finalización, degradación de plan entre begin y finalize, y archivos físicos deterministas de 22 MB.

Guardarraíles: aborta sin variables de entorno, aborta si la URL contiene `prod`, `production` o `staging`, y exige `T9F5_QA_CONFIRM=yes`.

Limpieza al terminar (incluso ante error): objetos de Storage, intents, reservas, documentos, versiones, evidencias, organizaciones, membresías y usuarios QA. **`audit_log` nunca se elimina.**

**No fue ejecutada.**

---

## 30. Validación QA pendiente

Ningún ataque puede clasificarse como PROTEGIDO en esta fase. El estado correcto de A01–A08, A13 y A14 es **CORREGIDO EN CÓDIGO · QA PENDIENTE**. La reclasificación exige T9F.5C: proyecto Supabase desechable, migraciones reales aplicadas, Auth real, RLS real, Storage real, roles reales, objetos físicos, concurrencia y limpieza completa. Ver la guía T9F.5C.

---

## 31. Riesgos residuales

1. **Nada se ejecutó contra PostgreSQL.** La 0101 no se aplicó ni se validó sintácticamente contra un motor real. Un error de sintaxis o de dependencia solo aparecerá al aplicarla. Es la limitación estructural de esta fase.
2. **Divergencia repositorio ↔ esquema desplegado.** Todo el análisis de políticas es estático. Si staging tiene políticas que el repositorio desconoce, no serían visibles aquí.
3. **El predicado de intent depende de `SECURITY DEFINER`.** `storage_object_matches_upload_intent` se concede a `authenticated` porque las políticas de Storage deben poder evaluarlo. Devuelve solo un booleano y no expone filas, pero es superficie nueva y merece revisión en QA.
4. **Content-Type almacenado.** Lo fija el navegador en el PUT. Por eso no basta y se exige firma binaria; aun así, la verificación estructural no es un antivirus: un PDF u OOXML válido puede contener contenido hostil para el visor.
5. **OLE2 no distingue `.doc` de `.xls`.** La magia OLE2 es común a ambos. Un `.doc` renombrado a `.xls` con MIME de Excel pasaría la firma. Riesgo aceptado para no romper tipos ya permitidos ni ampliar la lista de MIME.
6. **Coste de la verificación física.** El finalize descarga los bytes del objeto. Con 25 MB en Full/Extra, la latencia y la memoria del servidor suben respecto al tope anterior de 20 MB. Debe observarse en QA.
7. **Objetos huérfanos previos.** Los objetos que ya existieran en staging por A01/A02 no desaparecen al aplicar la corrección; no aparecen en el snapshot porque no tienen fila de dominio. Requieren un barrido server-only aparte, fuera del alcance de T9F.5B.
8. **`organization-assets`** sigue con CRUD por rol. Fuera del alcance de la matriz A01–A18, pero es otra superficie donde `authenticated` escribe directamente en Storage.
9. **A03 en QA.** Sin política UPDATE, un `upsert` sobre objeto existente puede fallar con un error de RLS o con «ya existe». La prueba admite ambos y comprueba además que el tamaño físico no cambió, que es el invariante real.

---

## 32. Aplicación posterior

1. Ejecutar T9F.5C en un proyecto Supabase QA desechable y exigir **18/18 en verde**.
2. Solo entonces: revisión de la 0101 y decisión de aplicarla en staging.
3. Antes de aplicar en staging, inventariar objetos huérfanos preexistentes (riesgo 7).
4. Tras aplicar, ejecutar las verificaciones §11 de la 0101 (ampliadas con las cuatro de T9F.5B).
5. Verificar el flujo legítimo end-to-end: crear evidencia con adjunto, crear documento descargable, reemplazar archivo, y una evidencia Textil (regresión de T9E).

No aplicar la 0101 sin haber pasado T9F.5C: la corrección cambia políticas de Storage y grants de funciones, y un fallo bloquearía las cargas de todos los usuarios.

---

## 33. Rollback

El rollback documentado de la 0101 (cabecera del archivo) sigue vigente. Añadidos de T9F.5B:

- **Políticas de Storage:** restaurar `evidences_insert_legacy`, `trazadocs_documents_insert`, `trazadocs_documents_update` y `trazadocs_documents_delete` con los predicados de 0099/0058, y eliminar `evidences_insert_cpr` y `trazadocs_documents_insert_intent`. **ADVERTENCIA: esto reabre A01, A02, A03 y A04.**
- **Finalizers:** restaurar los cuerpos previos de las tres firmas históricas y su `grant … to authenticated`, y eliminar las funciones `*_server` y el helper de precondiciones. **ADVERTENCIA: esto reabre A05, A06, A07 y A08.**
- **A13:** restaurar `v_module := case new.module_key …`. **ADVERTENCIA: reabre A13.**
- **A14:** volver al tope fijo de 20 MB y bajar el CHECK a 20 MB. Solo posible si no existen intents con `expected_size_bytes > 20 MB`.

Como la 0101 no se ha aplicado, el rollback real de esta fase es `git checkout` del archivo. Ningún cambio de T9F.5B borra datos, objetos de Storage ni auditoría, ni desactiva RLS.

---

## 34. Checklist

| # | Requisito | Estado |
|---|---|---|
| 1 | Rama verificada | ✅ |
| 2 | Commit de entrada verificado | ✅ |
| 3 | Cinco artefactos T9F.5A confirmados y leídos | ✅ |
| 4 | Políticas de Storage acumuladas reconstruidas | ✅ |
| 5 | A01 corregido en código | ✅ |
| 6 | A02 corregido en código | ✅ |
| 7 | A03 corregido en código | ✅ |
| 8 | A04 corregido en código | ✅ |
| 9 | A05 corregido en código | ✅ |
| 10 | A06 corregido en código | ✅ |
| 11 | A07 corregido en código | ✅ |
| 12 | A08 corregido en código | ✅ |
| 13 | A13 corregido en código | ✅ |
| 14 | A14 corregido en código | ✅ |
| 15 | Finalizers server-only | ✅ |
| 16 | Verificación física implementada | ✅ |
| 17 | Regresiones A09–A12 y A15–A18 conservadas | ✅ |
| 18 | Prueba local por cada ataque corregido | ✅ 32/32 |
| 19 | Suite adversarial preparada para A01–A18 | ✅ |
| 20 | `npm ci` | ✅ ejecutado y aprobado |
| 21 | `typecheck` | ✅ ejecutado y aprobado |
| 22 | `lint` | ✅ ejecutado y aprobado |
| 23 | `build` | ✅ ejecutado y aprobado |
| 24 | `test:all` | ✅ ejecutado y aprobado |
| 25 | 0101 **no** aplicada | ✅ |
| 26 | 0102 **no** creada | ✅ |
| 27 | 0100 y 0093–0100 **no** modificadas | ✅ |
| 28 | Sin commit, push, PR, merge ni deploy | ✅ |
| 29 | Sin conexión a staging ni producción | ✅ |
| 30 | Sin cambios de planes ni cuotas comerciales | ✅ |
| 31 | Suite adversarial **no** ejecutada | ✅ (por diseño) |
| 32 | Ningún ataque declarado PROTEGIDO | ✅ |

---

**Las correcciones de A01–A08, A13 y A14 fueron implementadas en código. Su clasificación final como PROTEGIDAS depende de la ejecución adversarial T9F.5C en un proyecto Supabase QA real.**
