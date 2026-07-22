# Trazaloop Textil · Sprint T9B.1 — Corrección funcional del snapshot completo (Reporte)

> **Corrección posterior (T9B.2):** la RPC descrita aquí se redefinió en la
> migración `0090` para cerrar cinco puntos (evidencias visibles de todas las
> entidades en `snapshot_json.sections.evidences`, `source_records.evidence_links` y
> `source_records.process_steps` en `data_sources_json`, warning `PAS-TRACE-005`,
> y normalización de la composición no documentada a `PAS-COMP-002`). Además, el
> caso needs_review de composición se renumeró de `PAS-COMP-002` a `PAS-COMP-003`.
> Ver `TEXTILES_T9B_2_PASSPORT_SNAPSHOT_CLOSURE_REPORT.md`.

> Julio 2026. Corrección funcional sobre T9B: la RPC de generación del snapshot
> del pasaporte técnico textil tenía seis problemas —uno grave— que se corrigen
> antes de construir la UI de T9C. **Sin UI, rutas `/textiles/passports`,
> páginas, navegación, impresión, PDF, QR, portal, IA, ACV, huella,
> certificación ni planes por módulo.** CPR sin cambios funcionales.

## 1. Qué se corrigió

Migración `0089_textile_technical_passport_snapshot_fixes.sql` (única): **redefine**
la RPC `generate_textile_technical_passport_full_snapshot(uuid)` de T9B con la
misma firma y el mismo grant. No crea tablas, columnas, políticas ni otras
funciones. Sigue siendo solo lectura de los módulos existentes + escritura de la
fila del pasaporte bajo el flag interno (respeta el trigger de 0085) y pasa a
`generated`.

## 2. Los seis problemas y su corrección

**Problema 1 — Composición por alcance incorrecto (grave).** T9B sumaba
`filter (where component_scope = 'main')`, pero `'main'` **no es un
component_scope válido** (los reales son `whole_product`, `main_fabric`,
`secondary_fabric`, `lining`, `thread`, `trim`, `other`). El total daba 0 y el
estado quedaba `incomplete` **siempre**, con brechas falsas. Corrección: la
completitud se evalúa **por alcance** con la misma regla del dominio
(`computeReferenceComposition`) y de la circularidad (0080): se agrupa por
`component_scope` y todos los alcances con datos deben sumar 100 ± 0,5
(`bool_and(total between 99.5 and 100.5)`); si alguno excede 100,5 →
`needs_review`; sin filas → `not_started`. Brechas coherentes
(`PAS-COMP-001/002/003`).

**Problema 2 — Circularidad no auto-seleccionaba la última completed.** T9B, sin
`circularity_assessment_id`, generaba directamente `PAS-CIRC-001`. Corrección: si
el pasaporte fijó una evaluación se usa esa; si no, se busca la `completed` más
reciente de la referencia (`order by completed_at desc nulls last`); si no hay
completed pero sí `draft`/`in_review` → warning `PAS-CIRC-002`; si no hay ninguna
→ gap `PAS-CIRC-001`. El snapshot refleja la evaluación efectivamente usada y un
flag `circularity_assessment_auto_selected`.

**Problema 3 — Trazabilidad sin pasos de proceso.** T9B incluía lote, orden,
consumos y lotes de entrada, pero no la ruta/procesos. Corrección: la sección de
trazabilidad incluye `process_steps` desde `textile_order_process_steps` con
`left join` a `textile_processes` y `textile_outsourced_processes`
(step_order/step_type/name/status/is_outsourced). Nueva advertencia
`PAS-TRACE-004` para procesos tercerizados sin soporte de ejecución vinculado.

**Problema 4 — Evidencias y `data_sources_json` incompletos.** La sección de
evidencias leía algunas, pero `data_sources.source_records.evidences` (base del
hash) solo cubría la referencia. Corrección: `data_sources.evidences` incluye
evidencias vinculadas a reference, fiber_composition, material, component,
output_lot, production_order, order_process_step, circularity_assessment y
technical_passport. **Solo metadata** (id, status, updated_at); nunca signed
URLs. Además, la lista de proveedores se materializa **distinta antes de
agregar** (se elimina el frágil `jsonb_agg(distinct jsonb_build_object(...))`).

**Problema 5 — `source_hash` insuficiente.** T9B derivaba el hash solo de
`data_sources_json`. Corrección: el `source_hash` es `sha256` sobre un objeto que
combina **snapshot + data_sources + gaps + warnings + recommendations**, de modo
que cambia si cambia cualquier parte relevante del pasaporte generado.

**Problema 6 — `recommendations_json` no estructurado.** T9B empujaba al menos
una recomendación como texto plano. Corrección: todas las recomendaciones son
objetos con forma estable **obligatoria**:
`{ recommendation_code, section_key, message, priority, related_gap_code }`
(prioridad `high`/`medium`/`low`). Se emiten `PAS-REC-001..004` ligadas a su
`related_gap_code`.

## 3. Correcciones de apoyo (estados reales)

- **Evidencias**: `documented` solo si hay aceptada y ninguna vinculada
  `rejected`/`expired`; desglose con los cinco estados reales
  (`accepted`/`pending_review`/`rejected`/`expired`/`archived`) y
  `support_strength` por evidencia. Brechas `PAS-EVID-002/003`.
- **Cuidado/fin de vida**: refleja separabilidad con los valores reales
  (`separable_components` filtra `easy`/`moderate`), reemplazables y evaluados.
- **Resumen**: `gaps_and_warnings` incluye `total` y `by_severity`
  (critical/warning/improvement/info); el resumen ejecutivo **deriva**
  `preparation_level` (needs_review si hay críticas; documented si no hay
  brechas ni advertencias; partially en el resto) + conteos.

## 4. Verificación

- Sintaxis SQL validada con el parser de Postgres (`pglast.parse_sql`) — OK;
  paréntesis balanceados; `component_scope = 'main'` = 0; palabra vetada = 0.
- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas). Nueva suite
  `tests/passports/textiles-passports-snapshot-fixes.test.ts` **14/14**.
- Regresión: familia pasaporte 16/12/11/8/16/**14**, evidencias 21/13,
  circularidad 32/12, trazabilidad 22/14, TrazaDocs 20, productos 21, **CPR
  `tests/unit/trazadocs.test.ts` ✅**, `test:platform`/`test:plans`/`test:launch`
  ✅, `test:compliance` ✅ (barre 0089, incluidos los disclaimers obligatorios
  con negaciones como "…ni pasaporte oficial"). `test:all`: **30 resultados
  verdes** (+1 respecto de T9B). `test:smoke`/`test:rls` requieren `.env.local`
  (ambiental).

## 5. Validación manual (cuando haya entorno)

1. **Composición por alcance**: referencia con `main_fabric` al 100% y `lining`
   al 100% → composición `complete` (no 200% ni falso `incomplete`); un alcance
   al 90% → `incomplete` con `PAS-COMP-001`; un alcance al 110% → `needs_review`
   con `PAS-COMP-002`.
2. **Circularidad auto**: referencia sin `circularity_assessment_id` fijado pero
   con una evaluación `completed` → el snapshot la usa y marca
   `circularity_assessment_auto_selected: true`; solo con `draft` → `PAS-CIRC-002`.
3. **Procesos**: lote cuya orden tiene pasos internos y tercerizados → aparecen
   en `traceability.process_steps`; tercerizado sin soporte → `PAS-TRACE-004`.
4. **Hash sensible**: regenerar tras cambiar una recomendación/brecha (p. ej.
   completar composición) produce un `source_hash` distinto.
5. **Recomendaciones**: `recommendations_json` es una lista de objetos con
   `recommendation_code`/`section_key`/`message`/`priority`/`related_gap_code`.

## 6. Confirmaciones

Sin UI/rutas/impresión/PDF/QR/portal/IA/ACV/huella/certificación/planes por
módulo. Sin tablas, columnas ni políticas nuevas (0089 solo redefine la función).
Solo lectura de los módulos existentes; única escritura, la fila del pasaporte
bajo el flag. **CPR no fue modificado funcionalmente.** Textil sigue privado tras
flag + `organization_modules.module_code`. La UI, listado, detalle e impresión
siguen pendientes para **T9C** (`TEXTILES_T9C_READY_PROMPT.md`);
`TEXTILES_PLANNED_SECTIONS` sigue en `["Pasaporte técnico textil"]` hasta T9C.
