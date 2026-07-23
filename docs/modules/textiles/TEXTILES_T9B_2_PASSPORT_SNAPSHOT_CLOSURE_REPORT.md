# Trazaloop Textil · Sprint T9B.2 — Cierre de fuentes, evidencias y warnings (Reporte)

> **Corrección posterior (T9B.3):** la RPC descrita aquí se redefinió en la
> migración `0091` para corregir un detalle de orden: la evaluación de
> circularidad auto-seleccionada debe resolverse ANTES de armar la sección de
> evidencias, de modo que sus evidencias entren en
> `snapshot_json.sections.evidences.items`. Ver
> `TEXTILES_T9B_3_PASSPORT_CIRCULARITY_EVIDENCE_HOTFIX_REPORT.md`.

> Julio 2026. Corrección de cierre sobre T9B.1: se completan los últimos puntos
> funcionales del snapshot del pasaporte técnico textil antes de construir la UI
> de T9C. **Sin UI, rutas `/textiles/passports`, páginas, navegación, impresión,
> PDF, QR, portal, IA, ACV, huella, certificación ni planes por módulo.** CPR sin
> cambios funcionales.

## 1. Qué se cerró

Migración `0090_textile_technical_passport_snapshot_sources_closure.sql`
(única): **redefine** la RPC `generate_textile_technical_passport_full_snapshot(uuid)`
de T9B.1 con la misma firma y el mismo grant. No crea tablas, columnas,
políticas ni otras funciones. Solo lectura de los módulos existentes + escritura
de la fila del pasaporte bajo el flag interno (respeta el trigger de 0085).

## 2. Los cinco cierres

**1 — Evidencias visibles completas en `snapshot_json.sections.evidences.items`.** T9B.1
solo incluía evidencias hasta `output_lot`. Ahora el CTE de evidencias visibles
cubre **todas** las entidades del pasaporte: reference, fiber_composition,
material, reference_material, component, reference_component, output_lot,
**production_order, order_process_step, circularity_assessment y
technical_passport**. T9C construirá la UI desde `snapshot_json`, por lo que las
evidencias visibles deben estar completas ahí (no solo en `data_sources_json`).
Cada ítem lleva metadata: `evidence_id`, `title`, `evidence_type`, `status`,
`entity_type`, `entity_id`, `link_type`, `document_date`, `valid_until`,
`file_name`, `created_at`, `updated_at`, `support_strength`. **Nunca signed URLs
ni `file_path`.**

**2 — `data_sources_json.source_records.evidence_links`.** Colección explícita de
los vínculos para que el `source_hash` detecte cambios de vínculo (relink, cambio
de `link_type`, desvinculación, mover una evidencia entre entidades). Cada
registro: `table` (`textile_evidence_links`), `id`, `evidence_id`, `entity_type`,
`entity_id`, `link_type`, `created_at`. **Nota de esquema:**
`textile_evidence_links` no tiene columnas `updated_at` ni `status` (solo
`created_at`); se registran las columnas reales y el conjunto de IDs captura
altas/bajas. Cubre las mismas entidades que la sección visible.

**3 — `data_sources_json.source_records.process_steps`.** Colección explícita de
los pasos de proceso de la orden del lote. Cada registro: `table`
(`textile_order_process_steps`), `id`, `order_id`, `step_type`, `process_id`,
`outsourced_process_id`, `status`, `planned_date`, `completed_date`,
`created_at`, `updated_at`. **Nota de esquema:** el modelo usa `step_type` (no
`process_type`) y `planned_date`/`completed_date` (no `started_at`/`finished_at`);
se usan los nombres reales. Si la ruta de proceso cambia, el hash cambia.

**source_hash**: se mantiene como `sha256` sobre snapshot + data_sources + gaps +
warnings + recommendations. Como `source_records` (evidence_links y
process_steps) vive dentro de `data_sources`, y las evidencias ampliadas viven
dentro de `snapshot`, el hash ahora refleja también esos cambios.

**4 — Warning `PAS-TRACE-005`.** Cuando hay `output_lot_id` y orden pero la orden
no tiene pasos de proceso documentados, se emite un warning (no bloquea):
"La orden/corrida asociada al lote producido/final no tiene pasos de proceso
documentados." Aparece en `warnings_json`, en `snapshot.traceability.warnings` y
en el nuevo `snapshot.warnings_summary` (resumen a nivel raíz con `gap_count`,
`warning_count` y la lista de `codes`).

**5 — Normalización de composición no documentada a `PAS-COMP-002`.** T9B.1
usaba `PAS-COMP-003` para "composición no iniciada". Se normaliza: **`PAS-COMP-002`
`info` = referencia sin composición documentada**. Como `PAS-COMP-002` estaba
asignado en el modelo canónico al caso "excede 100%/needs_review", ese caso se
**renumera a `PAS-COMP-003` `warning`** para evitar colisión. `PAS-COMP-001`
`critical` (no suma 100 por alcance) se mantiene. El modelo canónico
(`TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md`) se actualizó en consecuencia.

> **Decisión (colisión de códigos):** el encargo pedía `PAS-COMP-002` = "sin
> composición documentada", pero ese código ya estaba asignado a needs_review en
> la arquitectura. Se priorizó el encargo (que da la definición explícita) y se
> reubicó needs_review a `PAS-COMP-003`, dejando el catálogo coherente y sin
> romper `PAS-COMP-001`. Se documentó en el modelo canónico.

## 3. Verificación

- Sintaxis SQL validada con el parser de Postgres (`pglast.parse_sql`) — OK;
  paréntesis balanceados; sin `component_scope = 'main'`; palabra vetada = 0.
- **entity_type verificados** contra 0075/0078/0084 (no se inventan): las cuatro
  entidades nuevas (`production_order`, `order_process_step`,
  `circularity_assessment`, `technical_passport`) existen en el check de
  `textile_evidence_links`.
- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas). Nueva suite
  `tests/passports/textiles-passports-snapshot-closure.test.ts` **13/13**.
- Regresión: familia pasaporte 16/12/11/8/16/14/**13**, evidencias 21/13,
  circularidad 32, trazabilidad 22, TrazaDocs 20, productos 21, **CPR
  `tests/unit/trazadocs.test.ts` ✅**, `test:platform`/`test:plans`/`test:launch`
  ✅, `test:compliance` ✅ (barre 0090). `test:all`: **31 resultados verdes**
  (+1 respecto de T9B.1). `test:smoke`/`test:rls` requieren `.env.local`
  (ambiental).

## 4. Validación manual (cuando haya entorno)

1. **Evidencias completas**: vincular una evidencia a una `production_order` y
   otra a un `order_process_step` de la orden del lote → ambas aparecen en
   `snapshot_json.sections.evidences.items` con su `entity_type`/`entity_id`. Una evidencia
   sobre el propio `technical_passport` también aparece.
2. **Hash sensible a vínculos**: regenerar tras cambiar el `link_type` de un
   vínculo o desvincular una evidencia → `source_hash` distinto (via
   `source_records.evidence_links`).
3. **Hash sensible a ruta**: regenerar tras añadir/quitar un paso de proceso o
   cambiar su `status`/`completed_date` → `source_hash` distinto (via
   `source_records.process_steps`).
4. **PAS-TRACE-005**: lote cuya orden no tiene pasos → warning en
   `warnings_json`, en `traceability.warnings` y en `warnings_summary.codes`.
5. **PAS-COMP-002**: referencia sin filas de composición → `PAS-COMP-002` (info);
   con un alcance al 110% → `PAS-COMP-003` (warning); con un alcance al 90% →
   `PAS-COMP-001` (critical).

## 5. Confirmaciones

Sin UI/rutas/impresión/PDF/QR/portal/IA/ACV/huella/certificación/planes por
módulo. Sin tablas, columnas ni políticas nuevas (0090 solo redefine la
función). Solo lectura de los módulos existentes; única escritura, la fila del
pasaporte bajo el flag. **CPR no fue modificado funcionalmente.** Textil sigue
privado tras flag + `organization_modules.module_code`. La UI, listado, detalle e
impresión siguen pendientes para **T9C** (`TEXTILES_T9C_READY_PROMPT.md`);
`TEXTILES_PLANNED_SECTIONS` sigue en `["Pasaporte técnico textil"]` hasta T9C.
