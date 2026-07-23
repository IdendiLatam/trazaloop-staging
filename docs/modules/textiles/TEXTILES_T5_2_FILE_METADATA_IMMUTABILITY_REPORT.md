# Trazaloop Textil — Sprint T5.2 · Inmutabilidad de metadatos de archivo en evidencias textiles

**Fecha:** Julio 2026 · **Base:** Sprint T5.1 (hardening de evidencias, 0076)

---

## 1. Problema identificado

La política de UPDATE de `textile_evidences` (0076: admin/quality/consultant)
no distingue columnas: un usuario con acceso legítimo al módulo podía, vía
la API de Supabase (saltándose la UI), editar directamente `file_path`,
`file_name`, `file_mime_type` o `file_size_bytes`. Consecuencias posibles:
signed URLs apuntando a otro objeto, inconsistencia BD↔Storage, pérdida de
trazabilidad documental y **manipulación del uso de almacenamiento** (0076
suma `file_size_bytes` en la cuota — bajarlo a 0 falsearía el consumo). Las
server actions nunca tocan esos campos, pero la UI y las actions no deben
ser la única barrera.

## 2. Qué se endureció — migración `0077_textile_evidence_file_metadata_immutability.sql` (única)

**Trigger 1 — `protect_textile_evidence_file_metadata` (BEFORE UPDATE):**
si cualquiera de los 4 campos cambia (`IS DISTINCT FROM`, seguro frente a
nulls de datos históricos), aborta con:
*"Los metadatos de archivo de una evidencia textil no pueden modificarse
después de su creación"*. Sin `security definer` y sin evaluación de roles
**a propósito**: la regla aplica a TODOS — incluido `service_role`, porque
los triggers no se saltan con la service key (solo la RLS). Aplica en los
5 estados (`pending_review` incluido): el archivo define el objeto
almacenado y su consumo.

**Trigger 2 — `validate_textile_evidence_file_path` (BEFORE INSERT):**
validación **estricta** del patrón (opción fuerte del encargo §6, posible
porque el flujo real de T5 genera el `id` con `randomUUID()` ANTES de
construir la ruta e inserta con id explícito):

```
file_path ~ '^{organization_id}/textiles/{id}/[A-Za-z0-9._-]+$'
```

Esto garantiza en BD que la ruta: (1) no es nula; (2) inicia con la
organización de la fila; (3) contiene `/textiles/`; (4) contiene el
`evidence_id` de la fila; (5) no puede salir del prefijo (el alfabeto del
nombre excluye `/`, `..`, espacios y cualquier traversal); (6) no puede
apuntar a rutas CPR (`{org}/{uuid}/…` carece del segmento `textiles`) ni a
otras rutas del bucket. El alfabeto coincide con el saneo de
`buildTextileEvidencePath` (`[^a-zA-Z0-9._-] → _`), así que el flujo normal
pasa siempre. Solo en INSERT: en UPDATE los campos ya son inmutables por el
Trigger 1, de modo que el patrón no puede degradarse después.

Ambas funciones con `revoke execute` (patrón del proyecto). **Nada más**:
sin tablas, sin políticas nuevas ni recreadas, sin tocar la vista de uso
(el criterio T5.1 sigue: los bytes cuentan mientras el archivo exista, en
cualquier estado documental — este sprint asegura que ese número ya no
puede manipularse por update), sin cambios CPR.

## 3. Decisión: sin reemplazo de archivo

El archivo de una evidencia es **inmutable**. Si en el futuro se necesita
reemplazarlo, será mediante nueva evidencia, versionado o una RPC
controlada específica — nunca un update directo. Documentado también en la
migración y en la adenda del modelo de datos.

## 4. Cambios en server actions y UI

Las actions **ya cumplían** (verificado): `updateTextileEvidenceAction`
solo envía los campos de `parseMetadata` (título, tipo, descripción, fecha,
emisor, código, vigencia) + `updated_by`; el cambio de estado solo envía
`status`/`review_*`; `createTextileEvidenceAction` es la única escritura de
campos de archivo; la signed URL usa el `file_path` **persistido** con la
verificación de prefijo de T5.1. Único cambio de código: un comentario en
la action de edición documentando la inmutabilidad en BD (limpieza mínima
permitida por el encargo). **Sin cambios de UI.** También se corrigió el
pin del check 1 de la suite T5.1 (misma deriva de pins ya corregida en
T2.1/T4/T5: fijaba "todo lo posterior a 0075" y rompía con la 0077
legítima; ahora fija solo su rango, comentado en el código) y la lista de
migraciones del test de módulo (0070–0077).

## 5. Validación manual (casos del encargo §13)

1. **Edición normal**: crear evidencia → editar título/emisor/notas → OK
   según rol/estado (el trigger no interfiere: esos campos no son de
   archivo).
2. **Manipulación de archivo**: `update textile_evidences set file_path =
   '<otra-cosa>' where id = '<id>';` (o vía API con la sesión) → falla con
   el mensaje del trigger. Igual con `file_name`, `file_mime_type` y
   `file_size_bytes`, en cualquiera de los 5 estados.
3. **Storage usage**: crear evidencia con archivo → `file_size_bytes`
   registrado y sumando en `v_organization_plan_usage` → `update … set
   file_size_bytes = 0` → falla → la cuota no puede falsearse.
4. **Signed URL**: generar el enlace → apunta al archivo original;
   cualquier intento de redirigirlo cambiando `file_path` falla en BD, y
   la action además re-verifica el prefijo `{org}/textiles/` (T5.1).

## 6. Resultados de verificación

| Comando | Resultado |
|---|---|
| `typecheck` / `lint` / `build` | ✅ |
| `test:platform` · `test:plans` · `test:launch` · `test:compliance` | ✅ |
| Suites textiles previas (module, scoring, hardening T2.1, catálogos, productos 21/21, evidencias 21/21, hardening T5.1 13/13) | ✅ |
| **Nueva** `tests/evidences/textiles-evidence-file-metadata-immutability.test.ts` | ✅ (los 21 puntos del encargo §12) |
| `test:smoke` | ⚠️ requiere `.env.local` (ambiental, igual que siempre) |

## 7. Riesgos restantes y limitaciones

- La consistencia BD↔Storage sigue dependiendo de que el objeto exista en
  el bucket (un borrado manual del objeto por consola dejaría el registro
  sin archivo; la política de delete de storage está acotada y la UI no lo
  expone).
- Filas creadas ANTES de 0077 no se re-validan retroactivamente (todas
  fueron creadas por la action, que siempre construyó el patrón correcto).
- Sin flujo de reemplazo de archivo (decisión explícita, ver §3).

## 8. Qué quedó fuera (confirmaciones)

Sin órdenes/lotes ni trazabilidad por lote ✔ · sin circularidad ✔ · sin
TrazaDocs Textil ✔ · sin pasaporte técnico ✔ · sin QR/IA/ACV ✔ · sin planes
por módulo ✔ · **CPR sin cambios funcionales** (0077 actúa solo sobre
`textile_evidences`; verificado por test) ✔ · **Textil sigue privado** tras
flag + organización habilitada (`organization_modules.module_code =
'textiles'`; sin `module_key` ni `enabled_by`) ✔.
