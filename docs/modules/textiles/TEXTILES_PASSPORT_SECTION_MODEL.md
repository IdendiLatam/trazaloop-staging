# TEXTILES_PASSPORT_SECTION_MODEL — Las 14 secciones del pasaporte técnico textil

> Estructura fija del `snapshot_json`. Cada sección tiene una `section_key`
> estable, un `completeness_status` calculado y textos obligatorios donde
> aplica. Estados de completitud permitidos (nunca "cumple/no cumple"):
> **documented · partially_documented · pending · needs_review · not_applicable**
> (etiquetas visibles: documentado · parcialmente documentado · pendiente ·
> requiere revisión · no aplica).

## 5.1 `passport_identification` — Identificación del pasaporte

Campos: `passport_code`, `passport_version`, `generated_at`, `status`
(draft/generated/in_review/approved_internal/obsolete), `organization_name`,
`generated_by_name`, `reference_sku`, `output_lot_code?`, `scope`
(`reference_only` | `reference_and_lot`), `usage_warning`.

**Texto obligatorio** (siempre visible): *"Este pasaporte técnico textil es una
herramienta interna de preparación documental y trazabilidad. No equivale a
certificación, sello, declaración regulatoria oficial ni pasaporte digital de
producto oficial."*

## 5.2 `product_identification` — Identificación del producto

Producto, referencia/SKU, colección/línea, categoría, descripción, color, rango
de tallas, uso previsto, mercado objetivo (si existe). `completeness_status`:
`documented` si están los campos núcleo (producto + SKU + categoría);
`partially_documented` si faltan opcionales; `pending` si no hay producto
asociado.

## 5.3 `fiber_composition` — Composición de fibras

Por fibra: nombre (de `textile_fiber_types`), porcentaje, `component_scope`,
material fuente asociado (si existe), `is_recycled_declared`/
`is_organic_declared`. Agregado: suma total por scope. Estado de composición:
`complete` (suma 100 ±0.5 en el scope principal), `incomplete`, `needs_review`
(inconsistencias), `not_started`. Lista de brechas de composición.

## 5.4 `materials` — Materiales e insumos

Por material asociado a la referencia: nombre, rol, proveedor, composición
declarada, origen (si existe), si tiene ficha técnica, si tiene soporte de
composición, evidencias vinculadas. `completeness_status` por presencia de
proveedor + soporte.

## 5.5 `components` — Avíos/componentes

Por componente: nombre, rol, descripción de material, proveedor, separabilidad,
reemplazabilidad. Brechas de separabilidad o reparación. `completeness_status`
según separabilidad evaluada.

## 5.6 `suppliers_processes` — Proveedores y procesos

Proveedores principales, procesos internos relevantes, procesos tercerizados
relevantes, soportes asociados. Brechas de proveedor/proceso (p. ej.
tercerizado sin soporte de ejecución).

## 5.7 `evidences` — Evidencias documentales

Evidencias vinculadas a la referencia, a materiales/componentes, a composición,
a claims reciclado/orgánico, y a lote/orden (si aplica). Estado por evidencia
(valores reales de `textile_evidences.status`): `accepted`, `pending_review`,
`rejected`, `expired`, `archived`.

Criterio de interpretación (visible): accepted = soporte interno fuerte;
pending_review = soporte en revisión; rejected = no cuenta como soporte fuerte;
expired = genera advertencia; archived = no cuenta como soporte activo.

**Texto obligatorio**: *"La aceptación interna de una evidencia no equivale a
certificación externa ni validación por una autoridad."*

## 5.8 `traceability` — Trazabilidad operativa (solo con lote)

**Con** `output_lot_id`: orden/corrida, lote producido/final,
`quantity_produced`, `produced_date`, lotes de entrada consumidos, balance
básico (`v_textile_input_lot_balance`), procesos ejecutados, evidencias de
trazabilidad, `traceability_status` (`not_started`/`incomplete`/`complete`/
`needs_review`), brechas de trazabilidad.

**Sin** lote: la sección declara `scope = reference_only`, marca
`not_applicable` y advierte: *"Este pasaporte se basa únicamente en la
referencia/SKU; no incluye trazabilidad de un lote producido."*

## 5.9 `circularity` — Evaluación de circularidad

Evaluación vinculada, metodología, versión de metodología, puntaje (0–100),
nivel (`inicial`/`basico`/`intermedio`/`avanzado`/`preparado`), puntajes por
dimensión, brechas, recomendaciones internas, fecha de evaluación, estado. Si no
hay evaluación: `pending` + brecha `PAS-CIRC-001`.

**Texto obligatorio**: *"La evaluación de circularidad es una herramienta
técnica interna. No equivale a certificación, cumplimiento regulatorio ni
pasaporte oficial."*

## 5.10 `care_repair_eol` — Cuidado, reparación, separabilidad y fin de vida

Información de cuidado disponible (ISO 3758 como referencia), soportes
asociados, componentes reemplazables, separabilidad, recomendaciones internas de
fin de vida, brechas de información. **No inventar datos**: si no existen,
`pending` / "no documentado".

## 5.11 `claims` — Declaraciones ambientales y claims

Declaraciones recicladas, orgánicas, de reciclabilidad/reutilización/
separabilidad (si existen), evidencia de soporte, estado de soporte,
advertencias si hay claim sin evidencia suficiente. Lenguaje de ISO 14021 como
referencia de preparación, sin afirmar cumplimiento.

## 5.12 `trazadocs` — Documentos TrazaDocs relacionados

Manual técnico (TXT-MAN-001), procedimiento de composición (TXT-PRO-002), de
evidencias (TXT-PRO-004), de trazabilidad (TXT-PRO-005), de claims
(TXT-PRO-006), de circularidad (TXT-PRO-007), matriz (TXT-MAT-012). Por
documento: estado documental (borrador/en revisión/aprobado internamente/
obsoleto) y versión. **No** se copia el contenido; solo se referencia. Un
documento `approved_internal` **no** se presenta como aprobación externa.

## 5.13 `gaps_and_warnings` — Brechas y advertencias

Consolida brechas de composición, evidencias, claims, trazabilidad,
circularidad, separabilidad, documentación y datos faltantes. Clasificación:
`critical` · `warning` · `improvement` · `missing_data` · `not_applicable`.
Catálogo completo de `gap_code` en el documento 8.

## 5.14 `executive_summary` — Resumen ejecutivo

Nivel general de preparación técnica (documented / partially_documented /
pending / needs_review, **nunca** cumple/no cumple), principales fortalezas,
principales brechas, próximos pasos sugeridos, limitaciones. Se deriva de los
`completeness_status` de las secciones y del consolidado de brechas; no
introduce datos nuevos.

## Orden y presentación

`display_order` = el orden de esta lista (5.1 → 5.14). En la impresión, 5.1 y su
advertencia encabezan siempre; 5.13 y 5.14 cierran. Cada sección muestra su
`completeness_status` como etiqueta neutra.
