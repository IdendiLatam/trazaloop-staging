# Trazaloop Textil · Sprint T9B — Generación completa del pasaporte técnico textil (Reporte)

> **Corrección posterior (T9B.1):** la RPC descrita aquí se redefinió en la
> migración `0089` para corregir seis problemas funcionales (composición por
> alcance real en vez de `component_scope='main'`, auto-selección de la última
> evaluación de circularidad `completed`, pasos de proceso en trazabilidad,
> evidencias/`data_sources` completos por entidad, `source_hash` sobre todo el
> resultado y recomendaciones estructuradas). Ver
> `TEXTILES_T9B_1_PASSPORT_SNAPSHOT_FIXES_REPORT.md`. Lo que sigue describe el
> diseño base de T9B; los detalles corregidos rigen desde T9B.1.

> Julio 2026. El pasaporte deja de tener un snapshot base/esqueleto y pasa a
> generar un **snapshot completo desde los datos reales** ya existentes en
> Trazaloop Textil. **Sin UI, páginas, rutas `/textiles/passports`, navegación,
> impresión, PDF, QR, portal, IA, ACV, huella ni certificación.** CPR sin
> cambios funcionales. La UI/listado/detalle/impresión quedan para T9C.

## 1. Qué se implementó

Migración `0088_textile_technical_passport_full_snapshot.sql` (única) con la RPC
**`generate_textile_technical_passport_full_snapshot(uuid)`** que lee las fuentes
reales y construye el snapshot completo, todo bajo el flag transaccional interno
(patrón T7.1) que respeta el trigger de protección de 0085. Pasa el pasaporte a
`generated`.

La RPC consolida en `snapshot_json` las **14 secciones** desde: organización,
producto + referencia/SKU, composición de fibras, materiales, componentes/avíos,
proveedores, evidencias, orden/lote/consumos/procesos (si hay lote), evaluación
de circularidad (si existe), TrazaDocs Textil, más brechas, advertencias,
recomendaciones, fuentes y hash. Guarda `snapshot_json`, `data_sources_json`,
`gaps_json`, `warnings_json`, `recommendations_json` y `source_hash`.

## 2. Fuentes leídas (solo lectura, verificado por test)

`organizations`, `textile_products`, `textile_references`,
`textile_reference_fiber_composition`, `textile_fiber_types`,
`textile_reference_materials`, `textile_materials`,
`textile_reference_components`, `textile_components`, `textile_suppliers`,
`textile_evidences`, `textile_evidence_links`, `textile_production_orders`,
`textile_output_lots` (+ `v_textile_output_lot_traceability_summary`),
`textile_input_lots`, `textile_order_consumptions`,
`textile_circularity_assessments`, `textile_circularity_methodologies`,
`trazadoc_documents` (**solo `module_key='textiles'`**). La única escritura es la
fila del pasaporte (verificado: ningún INSERT/UPDATE/DELETE a otras tablas).

## 3. Snapshot: estados por sección y brechas

Cada sección lleva un `completeness_status` neutro
(`documented`/`partially_documented`/`pending`/`needs_review`/`not_applicable` —
nunca "cumple/no cumple"). Sin lote, `traceability` es `not_applicable` con nota.
La RPC calcula y persiste un subconjunto del catálogo `PAS-*` (documento
`TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md`): composición ≠100 (PAS-COMP-001)
o no iniciada (PAS-COMP-003), evidencia vencida (PAS-EVID-002), claim sin soporte
(PAS-CLAIM-001), lote en revisión/incompleto (PAS-TRACE-001/002), sin evaluación
de circularidad (PAS-CIRC-001) o en borrador (PAS-CIRC-002), separabilidad sin
evaluar (PAS-SEP-001), procedimiento de evidencias no aprobado (PAS-DOC-001).
**Las brechas no bloquean**: el pasaporte se genera igual.

Interpretación de estados de evidencia embebida (accepted = soporte fuerte;
pending_review = en revisión; rejected = no cuenta; expired = advertencia;
archived = no activo). Circularidad muestra score + nivel + dimensiones + brechas
+ recomendaciones + metodología + fecha (nunca solo el número).

## 4. Snapshot histórico y `source_hash`

`data_sources_json` (con `schema_version = 'textile_technical_passport_sources_v1'`)
captura los IDs y `updated_at`/estados de cada fuente; `source_hash` es
`sha256(data_sources_json)`. Así, si luego cambian composición, evidencias,
trazabilidad, circularidad o TrazaDocs, el snapshot generado se conserva y el
hash desactualizado lo delatará en T9C ("los datos fuente cambiaron…").

## 5. Seguridad

`security definer`; verifica sesión (`auth.uid()`), organización
(`is_org_member`), **módulo Textil habilitado**
(`organization_modules.module_code='textiles'`), rol
(admin/quality/consultant) y estado (`draft`/`generated`). **No acepta
snapshot/gaps/hash desde cliente**: la RPC no tiene parámetros de datos, todo se
calcula en servidor. Escritura bajo el flag interno; el trigger de 0085 sigue
protegiendo contra manipulación directa. Lectura acotada a la organización del
pasaporte. `revoke` de public/anon, `grant` a authenticated.

## 6. Cambios de código

`lib/domain/textiles-passport.ts`: catálogo `TEXTILE_PASSPORT_GAP_CODES` (24
códigos). `lib/db/textiles-passport.ts`:
`generateTechnicalPassportFullSnapshot()`. `server/actions/textiles-passport.ts`
(nuevo, **sin UI ni rutas**): `generateTextilePassportSnapshotAction` y
`changeTextilePassportStatusAction` con guarda del módulo, verificación de
pertenencia y delegación a las RPCs — el punto de entrada que T9C consumirá. Pin
de inventario a 0088. Nueva suite `tests/passports/textiles-passports-generation.test.ts`
(16 checks). Pin de la suite T9A.3 fijado a su slot propio (deriva de pins).

## 7. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas). Suite nueva **16/16**.
- Regresión: familia pasaporte 16/12/11/8, **evidencias 21**, circularidad 32,
  trazabilidad 22, TrazaDocs 20, productos 21, **CPR `tests/unit/trazadocs.test.ts`
  ✅**, `test:platform`/`test:plans`/`test:launch`/`test:compliance` ✅
  (compliance barre 0088, incluidos los disclaimers obligatorios con negaciones
  como "…ni pasaporte oficial"). `test:all`: 29 resultados verdes.
- `test:smoke`/`test:rls` requieren `.env.local` (ambiental).

## 8. Validación manual (cuando haya entorno)

1. **Generación**: crear un pasaporte `draft` para una referencia con
   composición, materiales, evidencias y (opcional) lote/evaluación; `select
   generate_textile_technical_passport_full_snapshot('<id>')` → `snapshot_json`
   con las 14 secciones pobladas, `gaps_json`/`warnings_json` según los datos,
   `source_hash` no nulo, `status='generated'`.
2. **Snapshot histórico**: cambiar una evidencia o la composición tras generar;
   `snapshot_json` del pasaporte **no cambia**; recomputar el hash de las
   fuentes daría distinto (base de la alerta de T9C).
3. **Brechas**: referencia con composición ≠100 → `PAS-COMP-001`; claim sin
   evidencia aceptada → `PAS-CLAIM-001`; sin evaluación de circularidad →
   `PAS-CIRC-001`; TXT-PRO-004 no aprobado → `PAS-DOC-001`.
4. **Seguridad**: un no-miembro o un pasaporte de otra organización → error; el
   snapshot generado no se puede editar por UPDATE directo (regresión 0085).
5. **Cross-tenant**: la RPC solo lee fuentes de la organización del pasaporte.

## 9. Qué queda para T9C y confirmaciones

**T9C** (siguiente): rutas `/textiles/passports*`, listado, creación con
pre-chequeo, detalle por secciones, alerta de `source_hash`, transiciones,
impresión por navegador; card en `/textiles`; `TEXTILES_PLANNED_SECTIONS` a
vacío. Ver `TEXTILES_T9C_READY_PROMPT.md`. **T9D** (QR/enlace público) sigue
como futuro documentado.

Sin UI/rutas/impresión/PDF/QR/portal/IA/ACV/huella/certificación. Sin tablas,
columnas ni políticas nuevas (0088 solo crea la función de generación). **CPR no
fue modificado funcionalmente**; todas las fuentes se leen sin escribirse. Textil
sigue privado tras flag + `organization_modules.module_code`.
