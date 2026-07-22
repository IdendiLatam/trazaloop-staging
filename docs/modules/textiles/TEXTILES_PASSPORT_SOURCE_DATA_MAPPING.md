# TEXTILES_PASSPORT_SOURCE_DATA_MAPPING — Mapeo sección → fuentes de datos reales

> Cada sección del pasaporte se llena desde tablas/vistas **ya existentes**
> (migraciones 0070–0083, nombres verificados). Este documento distingue lo que
> se usa directamente de lo que falta. El pasaporte **no crea datos nuevos**;
> solo los reúne. Todas las lecturas van bajo RLS con la sesión real
> (`security_invoker`), amarradas a `organization_id`.

## Convenciones

- **Directo**: la columna existe y se copia al snapshot tal cual.
- **Derivado**: se calcula desde columnas existentes (suma, estado, join).
- **Falta**: no existe hoy; se marca `pending`/"no documentado" (nunca se
  inventa). No se implementa nada nuevo para cubrirlo en T9A/B/C salvo lo dicho.

## 5.2 Identificación del producto

| Campo | Fuente | Tipo |
|---|---|---|
| producto | `textile_products` (nombre, categoría, descripción) | Directo |
| referencia/SKU | `textile_references` (código/SKU, color, tallas, uso) | Directo |
| colección/línea | `textile_collections` vía `textile_products` | Directo |
| mercado objetivo | — | Falta (opcional) → `pending` |

## 5.3 Composición de fibras

| Campo | Fuente | Tipo |
|---|---|---|
| fibras y % | `textile_reference_fiber_composition` (`fiber_type_id`, `percentage`, `component_scope`, `is_recycled_declared`, `is_organic_declared`) | Directo |
| nombre de fibra | `textile_fiber_types` | Directo |
| material fuente | `textile_reference_materials` (asociación) | Directo |
| suma / estado | agregación de `percentage` por `component_scope` (100 ±0.5) | Derivado |
| brechas | reglas del documento 8 (PAS-COMP-*) | Derivado |

## 5.4 Materiales e insumos

| Campo | Fuente | Tipo |
|---|---|---|
| materiales, rol | `textile_reference_materials` + `textile_materials` | Directo |
| proveedor | `textile_suppliers` vía material | Directo |
| composición declarada / origen | `textile_materials` (campos existentes) | Directo/parcial |
| ficha técnica / soporte de composición | `textile_evidence_links` con `link_type='composition_support'` sobre `entity_type='material'`/`'reference_material'` | Derivado |
| evidencias vinculadas | `textile_evidence_links` (`entity_type='material'`) | Directo |

## 5.5 Avíos/componentes

| Campo | Fuente | Tipo |
|---|---|---|
| componentes, rol, material | `textile_reference_components` + `textile_components` | Directo |
| proveedor | `textile_suppliers` vía componente | Directo |
| separabilidad / reemplazabilidad | `textile_components` (campos de separabilidad) | Directo |
| brechas | PAS-SEP-* (documento 8) | Derivado |

## 5.6 Proveedores y procesos

| Campo | Fuente | Tipo |
|---|---|---|
| proveedores | `textile_suppliers` (de materiales/componentes de la referencia) | Directo |
| procesos internos | `textile_processes` + `textile_order_process_steps` (con lote) | Directo |
| procesos tercerizados | `textile_outsourced_processes` + pasos de orden | Directo |
| soportes | `textile_evidence_links` (`process_support`/`outsourced_process_support`) | Derivado |

## 5.7 Evidencias documentales

| Campo | Fuente | Tipo |
|---|---|---|
| evidencias y estado | `textile_evidences` (`status` ∈ accepted/pending_review/rejected/expired/archived) | Directo |
| vínculos | `textile_evidence_links` (`entity_type`, `link_type`, `entity_id`) | Directo |
| interpretación | reglas del documento 3 §5.7 | Derivado |

`entity_type` reales disponibles (0075 + 0080): supplier, material, component,
process, outsourced_process, collection, product, reference, fiber_composition,
reference_material, reference_component, production_order, input_lot,
order_consumption, order_process_step, output_lot, circularity_assessment. En
T9A se **añade** `technical_passport` de forma aditiva (documento 6).

## 5.8 Trazabilidad operativa (con lote)

| Campo | Fuente | Tipo |
|---|---|---|
| orden/corrida | `textile_production_orders` | Directo |
| lote final | `textile_output_lots` (`quantity_produced`, `produced_date`, `status`, `traceability_status`) | Directo |
| lotes de entrada / consumos | `textile_input_lots`, `textile_order_consumptions` | Directo |
| balance | `v_textile_input_lot_balance` | Directo (vista) |
| resumen de trazabilidad | `v_textile_output_lot_traceability_summary` | Directo (vista) |
| procesos ejecutados | `textile_order_process_steps` | Directo |
| `traceability_status` | columna de `textile_output_lots` (calculada por 0079) | Directo |
| brechas | PAS-TRACE-* (documento 8), derivadas del status/balance | Derivado |

Ambas vistas existen (verificado). El pasaporte **lee** `traceability_status`;
no lo recalcula (esa es responsabilidad exclusiva de la RPC de 0079).

## 5.9 Circularidad

| Campo | Fuente | Tipo |
|---|---|---|
| evaluación | `textile_circularity_assessments` (score, readiness_level, dimension_scores, gaps, recommendations, completed_at, status) | Directo |
| metodología + versión | `textile_circularity_methodologies` vía `methodology_id` | Directo |
| criterios/respuestas | `textile_circularity_criteria`, `textile_circularity_answers` (para detalle opcional) | Directo |

Regla de vínculo (documento 12 del encargo, §12): la evaluación debe ser de la
misma `reference_id`; `completed` preferible, `draft` permitido con advertencia,
`archived` no recomendado. Se muestra score + nivel + dimensiones + brechas +
recomendaciones + metodología + fecha (nunca solo el número).

## 5.10 Cuidado, reparación, separabilidad y fin de vida

| Campo | Fuente | Tipo |
|---|---|---|
| separabilidad / reemplazables | `textile_components` | Directo |
| información de cuidado | — mayormente | Falta → `pending`/"no documentado" |
| soportes de cuidado | `textile_evidence_links` (`care_support`) | Derivado |
| fin de vida | — | Falta → `pending` |

`care_support` y `end_of_life_support` ya existen como `link_type` (0080). El
contenido textual de cuidado no tiene tabla propia hoy; se referencia vía
evidencias o se marca pendiente. **No** se crea tabla de cuidado en T9.

## 5.11 Declaraciones ambientales y claims

| Campo | Fuente | Tipo |
|---|---|---|
| claim reciclado/orgánico | `textile_reference_fiber_composition` (`is_recycled_declared`, `is_organic_declared`) | Directo |
| soporte del claim | `textile_evidence_links` (`recycled_claim_support`/`organic_claim_support`) + estado de la evidencia | Derivado |
| claims de reciclabilidad/reutilización/separabilidad | `textile_evidence_links` (`recyclability_support`/`reuse_support`/`separation_support`) | Derivado |
| advertencias | claim declarado sin evidencia accepted/pending → PAS-CLAIM-* | Derivado |

## 5.12 Documentos TrazaDocs

| Campo | Fuente | Tipo |
|---|---|---|
| documentos textiles | `trazadoc_documents` con `module_key='textiles'` (T8) | Directo |
| estado/versión | `status`, `current_version` | Directo |
| estructura/tips | `trazadoc_blueprints`/`trazadoc_blueprint_sections` (module textiles) | Directo |

Se listan por código TXT y estado; contenido **no** se copia. La lectura usa las
mismas envolturas de `lib/db/textiles-trazadocs.ts` (módulo fijado en servidor).

## Organización

| Campo | Fuente | Tipo |
|---|---|---|
| nombre / legal / NIT / logo | `organizations` + settings de empresa (`getCompanySettingsAction`) | Directo |
| usuario generador | `profiles` (sesión) | Directo |

## Resumen de brechas de datos (lo que falta hoy)

- Mercado objetivo del producto: opcional, no bloqueante.
- Contenido textual de instrucciones de cuidado y de fin de vida: sin tabla
  propia; se cubre por evidencias vinculadas o se marca `pending`.
- Nada más falta: composición, materiales, componentes, proveedores, procesos,
  evidencias, trazabilidad, circularidad y TrazaDocs están todos disponibles.

Ninguna de estas brechas justifica crear tablas nuevas en el alcance T9A/B/C
más allá de la tabla del pasaporte; se representan como estado del snapshot.
