# Trazaloop · Sprint T8.1 — Hardening de edición de secciones TrazaDocs y separación por módulo

Fecha: 2026-07-19 · Base: Sprint T8 (TrazaDocs Textil sobre el motor con `module_key`).

## 1. Problema

Las actions textiles validaban primero el documento (`getTextileTrazadocDetail`), pero guardaban secciones con `updateSectionContent(orgId, sectionId, content)`, que actualizaba por `organization_id + section_id` **sin amarrar `document_id` ni `module_key`**. Un usuario legítimo que manipulara el formulario (o llamara la action con un `sectionId` de otro documento de su misma organización) podía **editar desde la ruta Textil una sección de otro documento — incluso un documento CPR en borrador/revisión** — y a la inversa. La RLS de secciones (0047) no lo impedía: solo exige misma organización, rol y documento padre editable, no *cuál* documento. Se detectaron dos huecos hermanos que solo la BD puede cerrar: insertar secciones en un documento **aprobado/obsoleto** vía API directa (la política de insert de 0043 nunca miró el estado del padre) y **"mudar" una sección** de documento actualizando `document_id` (el `with check` de 0047 solo re-verifica que el *nuevo* padre sea editable).

## 2. Regla obligatoria implementada

Toda edición de sección valida ahora **simultáneamente**: organización correcta · documento correcto · sección correcta (pertenece a ese documento) · módulo correcto · documento en estado editable · rol autorizado. Se aplica en tres capas: la **action** (rol + módulo + estado, antes de tocar nada), el **helper de datos** (re-verifica documento del módulo y amarra `document_id` en el `UPDATE`) y la **BD** (trigger de integridad + RLS de 0047).

## 3. Migración `0083_trazadocs_section_module_hardening.sql` (única)

Una función + un trigger `BEFORE INSERT OR UPDATE` sobre `trazadoc_document_sections`:

- **INSERT**: el documento padre debe existir y estar en `draft`/`in_review` — cierra la inserción de secciones en documentos aprobados/obsoletos vía API directa.
- **UPDATE**: `document_id` y `section_key` **inmutables** ("Una sección no puede moverse a otro documento." / "La clave de una sección no puede cambiarse.") y el padre sigue editable (defensa en profundidad sobre la RLS de 0047, cubre también vías privilegiadas futuras).
- **Sin guard en DELETE**: la RLS ya lo cubre (solo padre en borrador, admin/quality) y un guard de fila rompería el borrado en **cascada** legítimo de un documento en borrador (0043/0048).
- `security definer`, `search_path` fijo, `execute` revocado. Sin tablas, políticas, vistas ni cambios de filas — CPR y las estructuras/documentos de T8 intactos. El comportamiento funcional de la app no cambia: ninguna ruta legítima inserta secciones fuera de borrador/revisión ni altera `document_id`/`section_key` (las RPCs de 0046/0047 solo **leen** secciones para el snapshot de versión).

## 4. Cambios de código

**`lib/db/trazadocs.ts`**
- **`getDocumentFacts(orgId, documentId, moduleKey)`**: hechos mínimos del documento (`id`, `status`) amarrados a organización **y** módulo — base de todos los amarres.
- **`updateSectionContentForDocument({ organizationId, documentId, sectionId, moduleKey, content })`** *reemplaza* al inseguro `updateSectionContent(orgId, sectionId, content)`: verifica documento del módulo + estado editable y filtra el `UPDATE` por `organization_id + document_id + id`.
- `deleteSection` y `reorderSections` ahora exigen `documentId` y filtran por `document_id`.
- `updateDocumentMetadata` y `deleteDocument` reciben `moduleKey` con **default `'cpr'`** y filtran por módulo (CPR intacto; un documento Textil no se edita/borra desde flujos CPR).

**`server/actions/trazadocs.ts` (CPR)** — refactor mínimo probado, comportamiento intacto: `updateDocumentSectionsAction`, `addCustomSectionAction`, `deleteDocumentSectionAction` y `moveSectionAction` validan el documento del módulo `'cpr'` (+ `canEditDocument` donde aplica) antes de tocar secciones y fijan `moduleKey: "cpr"`; el helper de `transition` verifica el documento CPR (separación por módulo también en transiciones).

**`server/actions/textiles-trazadocs.ts`** — `updateTextileTrazadocSectionsAction` usa el helper seguro con `moduleKey: "textiles"` fijado en servidor; el módulo jamás llega del cliente.

## 5. Verificación

`npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de T5.2) · `npm run build` ✅ (13 rutas ƒ TrazaDocs CPR+Textil).

- Nueva suite `tests/trazadocs/trazadocs-section-hardening.test.ts` → **15/15** (única migración; solo función+trigger; 0082/0047 intactos; BEFORE INSERT OR UPDATE sin guard de DELETE; padre editable; inmutabilidad de `document_id`/`section_key`; seguridad de la función; helper inseguro reemplazado y su firma completa; amarre org+módulo+estado+sección; `deleteSection`/`reorderSections` con `documentId`; metadata/delete con módulo default `'cpr'`; actions CPR y Textil fijan módulo en servidor; **ningún caller del helper inseguro en el árbol**; sin service_role, RLS intacta, lenguaje prudente).
- Regresión: **CPR TrazaDocs `tests/unit/trazadocs.test.ts` ✅**, maestro ✅, settings ✅; T8 `textiles-trazadocs` 20/20; las 12 suites textiles restantes verdes; `test:platform`/`test:plans`/`test:launch`/`test:compliance` ✅ (compliance barre 0083 y este reporte). `test:all`: 24 resultados verdes.
- `test:smoke`/`test:rls` requieren `.env.local` con Supabase real (limitación ambiental).

## 6. Validación manual

1. **Edición cruzada Textil→CPR**: en `/textiles/trazadocs/[id]`, sustituir en el formulario un `section:<uuid>` por el id de una sección de un documento CPR en borrador de la misma organización → la action responde "La sección no pertenece a este documento." (el documento validado es Textil; el CPR no aparece bajo `module_key='textiles'`). Espejo CPR→Textil: idéntico.
2. **Sección de otro documento Textil**: mismo intento con una sección de otro documento textil → mismo rechazo (amarre `document_id`).
3. **API directa · insertar en aprobado**: `insert into trazadoc_document_sections(... document_id=<aprobado> ...)` → trigger: "Las secciones solo pueden agregarse o editarse mientras el documento está en borrador o en revisión."
4. **API directa · mudar sección**: `update trazadoc_document_sections set document_id=<otro> where id=<x>` → "Una sección no puede moverse a otro documento."
5. **Flujo legítimo**: crear/editar/guardar secciones en un borrador Textil o CPR sigue funcionando igual; aprobar y versionar intactos.

## 7. Alcance / confirmaciones

Sin pasaporte, QR, IA, ACV/huella, sellos, certificación, planes por módulo ni consola modular. No se agregaron documentos base textiles ni se cambiaron textos normativos de T8. **CPR no cambió funcionalmente**: sus actions solo ganaron el amarre de seguridad (mismo comportamiento, cubierto por la suite CPR en verde) y la capa de datos, parámetros con default `'cpr'`. Textil sigue privado tras flag + `organization_modules.module_code`.
