# TRAZALOOP · T9F.5B.1 · INFORME DE CORRECCIÓN PREVIA A QA

> Corrección de los tres bloqueadores que la revisión independiente encontró en el paquete T9F.5B.
> **No aprueba nada.** No hubo ejecución contra Supabase real: la clasificación de A01–A18 sigue
> dependiendo de T9F.5C.

---

## 1. Resumen ejecutivo

La revisión del ZIP T9F.5B encontró tres defectos que habrían hecho fracasar la validación QA antes incluso de empezar a medir seguridad:

1. **B1 · Los finalizers server-only habrían rechazado toda finalización legítima.** Se invocan con `service_role`, donde `auth.uid()` es NULL, pero resolvían el acceso comercial con `resolve_organization_module_access`, que decide con `is_org_member()` / `is_platform_superadmin()`. El usuario real estaba en `p_actor_id` y nadie lo miraba. Resultado esperable: `MODULE_ACCESS_BLOCKED` con `reason = not_member` en cada carga válida. Peor aún, ese falso negativo habría hecho **pasar** A08 por la razón equivocada.

2. **B2 · Los archivos seguían viajando dentro de Server Actions.** `createEvidenceAction`, `uploadFileDocumentAction` y `replaceFileDocumentFileAction` recibían el `File` en `FormData` mientras `next.config.ts` mantenía el límite por defecto (1 MB) y afirmaba que ningún formulario envía cuerpos grandes. La afirmación era falsa para CPR/TrazaDocs, y hacía **imposible** A14: un TrazaDocs Full de 22 MB nunca llegaba a `begin`.

3. **B3 · La política ante "tamaño físico > reserva" era contradictoria.** SQL permitía ampliar la reserva; TypeScript exigía igualdad estricta; la suite adversarial solo aceptaba rechazo. Además faltaba el caso peligroso: reservar 1 MB, subir 5 MB y **no** finalizar, dejando 4 MB de capacidad ficticia.

Los tres están corregidos. Ninguna corrección amplía el alcance ni reabre A09–A12 ni A15–A18.

---

## 2. B1 · `auth.uid()` frente a `p_actor_id` bajo `service_role`

### Cómo se resolvió

Se añadió a la 0101 un helper server-only, `resolve_module_access_for_actor(p_organization_id, p_module_code, p_actor_id)`, que:

1. exige que el actor exista en `auth.users` (`actor_required`, `actor_not_found`);
2. comprueba **membresía ACTIVA del actor** en esa organización — el equivalente explícito de `is_org_member()`, evaluado sobre `p_actor_id` y nunca sobre `auth.uid()`;
3. replica después, campo por campo, la semántica de 0100: módulo funcional (`coming_soon`), asignado (`not_assigned`), `enabled`, `access_mode`, y vencimiento Demo por la hora de la base (`demo_expired`), devolviendo el mismo JSON.

Los cuatro puntos de decisión pasan a usarlo:

| Función | Antes | Ahora |
|---|---|---|
| `finalize_evidence_attachment_server` | `resolve_organization_module_access(org, módulo)` | `resolve_module_access_for_actor(org, módulo, p_actor_id)` |
| `assert_trazadoc_finalize_preconditions` | ídem | ídem |
| `finalize_trazadoc_file_document_initial_version_server` | — | delega en las precondiciones con el actor |
| `replace_trazadoc_file_document_server` | — | ídem |

### Requisitos del encargo, uno a uno

| Requisito | Cumplimiento |
|---|---|
| No modificar 0100 | 0101 no redefine `resolve_organization_module_access`; una prueba verifica que 0100 conserva su guard original |
| No debilitar el resolver para llamadas normales | Intacto: sigue siendo el único camino de `authenticated`, con su mismo predicado |
| No simular `auth.uid()` | El **cuerpo** del helper no contiene `auth.uid()` en ninguna forma (comprobado por prueba). Solo el `COMMENT ON` lo menciona, para explicar por qué existe |
| Validar primero actor, membresía y rol | El helper valida actor y membresía activa; el **rol** (`admin`/`quality`/`consultant`) ya lo validaba cada finalizer contra `memberships` antes de llegar aquí |
| Consultar directamente `organization_modules` | Sí, tras validar la membresía |
| Verificar módulo asignado, `enabled`, `access_mode`, Demo no vencido, módulo funcional y plan actual | Los seis, con la misma semántica de 0100 |
| Comportarse como el finalizer Textiles | Mismo patrón de 0098: actor explícito, membresía revalidada, lectura directa de `organization_modules` |

`revoke … from public, anon, authenticated` + `grant … to service_role`: el helper no amplía la superficie de clientes.

### Pruebas añadidas

`tests/unit/t9f5b1-pre-qa-correction.test.ts` §B1 (4 comprobaciones estructurales) y, en la suite adversarial, los escenarios que **detectan específicamente el falso `not_member`**: A08 y A06 fallan si el mensaje de rechazo contiene `not_member`, `actor_required` o `actor_not_found`, porque eso delataría el defecto de `auth.uid()` bajo `service_role` en lugar de la causa real.

Los seis casos exigidos (actor válido + Full; actor válido + Demo vigente; Demo vencido; módulo deshabilitado; actor sin membresía; actor de otra organización) están cubiertos por la lógica del helper y **preparados para ejecución real** en la guía T9F.5C §2.1. Localmente solo puede verificarse su estructura: no hay PostgreSQL.

---

## 3. B2 · Transporte directo de archivos CPR y TrazaDocs

### Cómo se migró

Se replicó el patrón que Textiles ya usaba desde T9E.1, con una diferencia deliberada que se explica abajo.

```
(A) Server Action de BEGIN — solo metadata
      datos funcionales + { name, sizeBytes, mimeType } + idempotencyKey
      → autentica, valida acceso comercial y límites
      → crea la fila de dominio (o el borrador)
      → crea el storage_upload_intent
      → devuelve { intentId, bucketId, objectPath }

(B) Client Component — PUT DIRECTO
      supabase.storage.from(bucketId).upload(objectPath, File)
      con la SESIÓN AUTENTICADA del usuario, a la ruta EXACTA del intent
      El archivo NO atraviesa ninguna Server Action ni Route Handler.

(C) Server Action de FINALIZE — solo intentId
      → autentica al usuario
      → lee el intent (server-only, exigiendo dueño y organización)
      → consulta la metadata FÍSICA del objeto
      → descarga los bytes y valida la FIRMA BINARIA
      → invoca la RPC server-only, que revalida plan y cuota
```

### Por qué sesión autenticada y no URL firmada

Textiles usa una *signed upload URL*. Aquí no, y es intencional: **una URL firmada autoriza por sí misma y no pasa por la política INSERT de `authenticated`** (hallazgo documentado en 0099). Si CPR/TrazaDocs subieran con URL firmada, la política ligada a intent que cierra A01 y A02 **no se ejercería nunca**. Subir con la sesión del usuario hace que cada PUT quede sujeto a `evidences_insert_cpr` / `trazadocs_documents_insert_intent`. Textiles conserva su transporte sin cambios.

### Superficie migrada

| Flujo | Begin | Finalize | Cancelación |
|---|---|---|---|
| Adjunto de evidencia CPR | `beginEvidenceUploadAction` | `finalizeEvidenceUploadAction` | `cancelEvidenceUploadAction` |
| Creación inicial TrazaDocs | `beginFileDocumentUploadAction` | `finalizeFileDocumentUploadAction` | `cancelFileDocumentUploadAction` |
| Reemplazo TrazaDocs | `beginFileDocumentReplaceAction` | `finalizeFileDocumentReplaceAction` | `cancelFileDocumentUploadAction` |

Componentes migrados: `components/domain/evidences/forms.tsx`, `components/domain/trazadocs/upload-file-document-form.tsx`, `components/domain/trazadocs/file-document-edit-forms.tsx`. Ninguno usa ya `useActionState` para el envío del archivo; los tres llaman a `uploadFileToIntentPath` (`lib/storage/direct-upload.ts`, `"use client"`, `upsert: false`).

### Error y compensación

| Situación | Comportamiento |
|---|---|
| Fallo del PUT | El cliente llama a la acción de cancelación → `compensateFailedCprUpload` → cancela la reserva e intenta el retiro **confirmado** |
| Fallo de verificación (objeto ausente, tamaño o MIME incoherentes, firma inválida) | No se finaliza; misma compensación; la fila temporal TrazaDocs solo se borra si el retiro se confirmó |
| Fallo de finalize | Ídem, con mensaje honesto: si el retiro no se confirma, el usuario sabe que los bytes **siguen contando** |
| Abandono | El intent vence por TTL; sus bytes siguen contabilizados hasta la resolución server-only |
| Reintento / idempotencia | `begin` admite `idempotencyKey` en los tres flujos; el índice único parcial (A18) sigue intacto |

**El objeto permanece contabilizado hasta confirmar su eliminación física.** Ninguna ruta libera capacidad sin confirmación.

### `next.config.ts`

**No se elevó `serverActions.bodySizeLimit`.** Sigue sin aparecer la clave, y una prueba falla si reaparece. Ahora la afirmación del comentario —"ningún formulario envía cuerpos grandes"— es cierta también para CPR y TrazaDocs.

### Pruebas estructurales anti-regresión

`t9f5b1-pre-qa-correction.test.ts` §B2 falla si alguna de las seis acciones vuelve a contener `as File`, `formData.get("file")`, `.arrayBuffer()` o `.upload(`; si `finalize` acepta tamaño, MIME, bucket o ruta en su firma; o si `bodySizeLimit` reaparece.

### Secuencia lógica de tamaños (comprobada localmente, regla pura)

| Caso | Resultado |
|---|---|
| TrazaDocs 2 MB (Demo) | permitido |
| TrazaDocs 10 MB (Demo) | permitido (límite exacto) |
| TrazaDocs 22 MB (Demo) | **rechazado** |
| TrazaDocs 22 MB (Full) | permitido |
| TrazaDocs 22 MB (Extra) | permitido |
| TrazaDocs 26 MB (Full) | **rechazado** |
| Evidencia CPR 20 MB | permitido |
| Evidencia CPR 21 MB | **rechazado** (máximo propio, distinto del de TrazaDocs) |

---

## 4. B3 · Tamaño físico mayor que la reserva

### Política elegida: **A · RECHAZO ESTRICTO**

`realSizeBytes` debe ser **exactamente** `expectedSizeBytes`. No hay ampliación de reserva en finalize.

Motivo: es el contrato que Textiles ya aplica desde 0098, es el más simple de auditar y no abre la puerta a que un cliente use la reserva como una estimación optimista. Se descartó la ampliación segura por coherencia con el resto de la plataforma.

Se hizo consistente en las cuatro superficies:

| Superficie | Antes | Ahora |
|---|---|---|
| SQL `finalize_evidence_attachment_server` | sin comparación real↔reserva | `OBJECT_SIZE_MISMATCH` si difieren |
| SQL `assert_trazadoc_finalize_preconditions` | sin comparación | `OBJECT_SIZE_MISMATCH` si difieren |
| TypeScript `validateCprUploadedObject` | igualdad estricta | igualdad estricta (sin cambios) |
| Suite adversarial A06 | aceptaba cualquier rechazo | exige `OBJECT_SIZE_MISMATCH` |
| Informe T9F.5B | describía ampliación | corregido a rechazo estricto |

### Cómo se contabiliza un objeto mayor cuando **no** se ejecuta finalize

Este era el hueco real. Con rechazo estricto, un atacante que reserva 1 MB, sube 5 MB y **nunca** finaliza dejaba un objeto físico de 5 MB contabilizado como 1 MB: 4 MB de capacidad ficticia.

Corrección en `module_storage_snapshot`: los intents CPR ahora cuentan por el **mayor entre el tamaño declarado y el tamaño FÍSICO real** del objeto, leído de `storage.objects.metadata->>'size'` mediante `left join`. Se aplica a los dos lugares donde participan:

- **reservas activas** (`status = 'pending'`, no vencidas);
- **intents no finalizados ni resueltos** (failed, expired o vencidos).

Consecuencia: en cuanto el objeto existe, la contabilidad refleja su tamaño real, aunque nadie finalice. La capacidad restante se calcula sobre 5 MB, no sobre 1 MB. El desenlace prohibido —*objeto 5 MB + contabilidad 1 MB + cuota disponible como si ocupara 1 MB*— deja de ser alcanzable.

`module_storage_snapshot` es `SECURITY DEFINER`; QA debe confirmar que su propietario puede leer `storage.objects` (verificación §2 de la guía T9F.5C).

### Escenario adversarial añadido

`A06b` en `tests/rls/t9f5-adversarial-attacks.test.ts`: intent de 1 MB → objeto físico de 5 MB → **sin finalize** → lectura de uso y capacidad. Acepta como seguro que el upload se rechace, o que el objeto se contabilice por 5 MB. Falla si la capacidad se calcula como si ocupara lo declarado.

**No se declara aprobado localmente:** requiere Storage real. Queda preparado para T9F.5C.

---

## 5. Pruebas adversariales corregidas

| Punto | Corrección |
|---|---|
| A08 no puede aprobarse por un `MODULE_ACCESS_BLOCKED` genérico | Ahora exige `STORAGE_QUOTA_EXCEEDED` o `FILE_SIZE_INVALID` y **falla explícitamente** si el mensaje contiene `not_member`, `actor_required`, `actor_not_found`, `SERVER_ONLY` o `permission denied` |
| A06 debe corresponder a la política elegida | Exige `OBJECT_SIZE_MISMATCH`; falla ante un `not_member` |
| A14 debe probar también finalize | Añadido: lee la metadata física del objeto de 22 MB, invoca el finalizer server-only real y comprueba que la fila queda con el tamaño físico y su ruta |
| A14 debe probar el flujo real de aplicación | El archivo no atraviesa Server Action (verificado estructuralmente); el PUT es directo; la verificación física y la finalización se ejercen en la suite |
| A07 debe ejercer realmente la firma binaria | Ahora comprueba que el objeto sembrado **no** es un PDF real (si lo fuera, la prueba no demostraría nada) y deja instrucción explícita para que QA ejecute la Server Action de finalize y exija rechazo por firma |

---

## 6. Limpieza del paquete

- Eliminado `tsconfig.tsbuildinfo` del árbol y del ZIP (ya estaba en `.gitignore`; se excluye además en el empaquetado, porque cualquier `tsc` local lo regenera).
- Eliminado el archivo accidental `-name .env.local -o -name *.pem -o -name *.key )` — un volcado de `git diff --stat` de un sprint anterior, sin secretos.
- `.gitignore` ampliado con el patrón `-name*` para que un `find` mal citado no vuelva a dejar residuos.
- Ningún archivo legítimo fue eliminado.

---

## 7. Archivos

**Creados**
```
lib/storage/direct-upload.ts
server/actions/cpr-upload-verification.ts
tests/unit/t9f5b1-pre-qa-correction.test.ts
docs/platform/TRAZALOOP_T9F5B1_PRE_QA_CORRECTION_REPORT.md
```

**Modificados**
```
supabase/migrations/0101_t9f1_module_access_hardening.sql
server/actions/evidences.ts · server/actions/trazadocs-master.ts
lib/db/storage-intents.ts
components/domain/evidences/forms.tsx
components/domain/trazadocs/upload-file-document-form.tsx
components/domain/trazadocs/file-document-edit-forms.tsx
package.json · .gitignore
tests/rls/t9f5-adversarial-attacks.test.ts
tests/unit/t9f5b-minimal-security-remediation.test.ts
tests/unit/t9f1-…  · t9f2-…  · t9f3-…  · t9f4-…  · document-master.test.ts · plans.test.ts
docs/platform/TRAZALOOP_T9F5B_MINIMAL_SECURITY_REMEDIATION_REPORT.md
docs/platform/TRAZALOOP_T9F5B_ATTACK_CLOSURE_MATRIX.md
docs/platform/TRAZALOOP_T9F5C_QA_EXECUTION_GUIDE.md
```

**Eliminados**
```
tsconfig.tsbuildinfo
-name .env.local -o -name *.pem -o -name *.key ) 
```

Las suites T9F.1–T9F.4, `document-master` y `plans` se actualizaron porque auditaban los nombres y el orden de las acciones antiguas (`createEvidenceAction`, `uploadFileDocumentAction`, `replaceFileDocumentFileAction`) y el hecho de que el upload ocurriera **dentro** de la Server Action. Con carga directa ese invariante cambia de forma: ahora se exige que `begin` cree el intent y devuelva la ruta, que ninguna acción contenga `.upload(`, y que la compensación cuelgue del error real. Ninguna aserción se debilitó.

---

## 8. Validaciones (resultados reales)

| Comando | Resultado |
|---|---|
| `npm ci` | ejecutado y aprobado (T9F.5B; dependencias sin cambios) |
| `npm run typecheck` | **ejecutado y aprobado** |
| `npm run lint` | **ejecutado y aprobado** (0 errores; 1 warning preexistente ajeno) |
| `npm run build` | **ejecutado y aprobado** (exit 0) |
| `npm run test:all` | **ejecutado y aprobado** (exit 0, 0 fallos) |
| `npm run test:t9f5b1` | **ejecutado y aprobado** — 21 ✔ / 0 ✘ |
| `npm run test:t9f5b` | **ejecutado y aprobado** — 32 ✔ / 0 ✘ |
| `npm run test:t9f1 / t9f2 / t9f3 / t9f4` | **ejecutados y aprobados** — 35 / 28 / 26 / 26 ✔, 0 ✘ |
| `npm run test:t9f5-adversarial` | **no ejecutado** — preparado para T9F.5C |

**No se declara que RLS o Storage reales hayan pasado. No se declara el sistema cerrado.**

---

## 9. Riesgos residuales nuevos o modificados

1. **`module_storage_snapshot` ahora lee `storage.objects`.** Es `SECURITY DEFINER`; si su propietario careciera de privilegios sobre el esquema `storage`, la función fallaría al aplicarse. QA debe verificarlo explícitamente (guía §2).
2. **Carga directa con sesión.** La barrera pasa a ser íntegramente la política INSERT ligada a intent. Si esa política presentara un defecto, ya no hay una Server Action que actúe de segunda puerta. Es el diseño correcto —y el que hace verificable A01/A02—, pero concentra la responsabilidad.
3. **Rechazo estricto y archivos que cambian de tamaño.** Si algún navegador o proxy alterase los bytes en tránsito (recodificación, compresión), el tamaño físico dejaría de coincidir y la carga se rechazaría. Es el desenlace seguro, pero conviene observarlo en QA con archivos reales.
4. **`greatest(declarado, físico)`** protege contra el objeto mayor que su reserva; no protege contra un objeto colocado en una ruta **sin** intent, que es exactamente lo que cierran A01/A02.
5. **Los seis casos de acceso por actor (B1) no se ejecutaron**: su verificación local es estructural.
6. Los riesgos residuales de T9F.5B (§31 de su informe) siguen vigentes salvo el de latencia por descarga de 25 MB, que ahora convive además con el PUT directo del navegador.

---

## 10. Confirmaciones

- **0101 no fue aplicada.** Ninguna migración se ejecutó.
- **No se creó 0102.** Verificado por prueba automática.
- **No se conectó a staging ni a producción.** Ninguna conexión a Supabase en toda la fase.
- **No hubo commit, push, PR, merge ni deploy.**
- **0100 no se modificó**, ni las migraciones 0093–0099.
- **No se cambiaron planes, cuotas ni catálogo comercial.**
- **Textiles no se modificó**: conserva su transporte con URL firmada y su tope propio de 20 MB.

---

**T9F.5B.1 corrige los bloqueadores previos a QA. La clasificación definitiva de A01–A18 depende todavía de T9F.5C sobre Supabase QA real.**
