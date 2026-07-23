# Sprint T7 — Evaluación de circularidad textil · Reporte de implementación

Fecha: 2026-07-18 · Módulo: Trazaloop Textil (privado/en preparación) · Estado: implementado.

## 1. Qué se implementó

Evaluación **técnica interna** de preparación circular para referencias/SKU textiles, opcionalmente asociada a un lote producido/final. Cada evaluación produce: puntaje de circularidad técnica 0–100, nivel de preparación (inicial/basico/intermedio/avanzado/preparado), puntaje por dimensión, brechas automáticas, recomendaciones internas, estado (draft/completed/archived) y snapshot histórico inmutable al completarse.

**Lo que la evaluación NO es (aplicado en textos, dominio y SQL):** certificación, cumplimiento regulatorio, ACV, huella de carbono ni pasaporte digital oficial. "Preparado" significa únicamente mayor preparación técnica según la metodología interna. El aviso vive en `TEXTILE_CIRCULARITY_DISCLAIMER` y se muestra en el hub, listado, creación y detalle.

## 2. Migración creada — `supabase/migrations/0080_textile_circularity_assessments.sql`

Aditiva, sin drops destructivos, sin tocar migraciones anteriores ni objetos CPR.

### Tablas
| Tabla | Alcance | Notas |
|---|---|---|
| `textile_circularity_methodologies` | Global | Versionado de metodología; RLS de solo lectura para authenticated (patrón `textile_fiber_types`); seed `TEXTILE_CIRCULARITY_PREP v1` activa. |
| `textile_circularity_criteria` | Global | 30 criterios seed; CHECKs de dimensión, response_type y peso > 0; solo lectura para la app. |
| `textile_circularity_assessments` | Org | `unique(org, assessment_code)`, `unique(org, id)`, FKs compuestas `(org, reference_id)` → referencias y `(org, output_lot_id)` → lotes finales; CHECKs de status, nivel y score 0–100. |
| `textile_circularity_answers` | Org | `unique(org, assessment, criterion)`, FK compuesta a la evaluación (cascade), CHECK `answer_value` 0–1. |

### Dimensiones, criterios y pesos (suman 100)
- composition_transparency (20): CT01–CT05 (4 c/u).
- traceability_evidence (20): TE01 (4), TE02–TE05 (3), TE06–TE07 (2).
- material_strategy (15): MS01–MS05 (3 c/u).
- durability_care_repair (15): DR01–DR03 (4), DR04 (3).
- recyclability_separability (20): RS01–RS05 (4 c/u).
- reuse_end_of_life (10): RE01–RE02 (3), RE03–RE04 (2).

`response_type` distingue **derivados** (calculados por la BD desde datos reales: CT01–CT03, CT05, TE01–TE07, MS01–MS03, RS02) de **manuales** (escala 1 / 0,5 / 0 / N/A: CT04, MS04–MS05, DR01–DR04, RS01, RS03–RS05, RE01–RE04). CT03 deriva a 1 cuando hay composición porque el modelo T4 exige tipo de fibra normalizado por diseño (fiber_type_id NOT NULL).

### Guardas
- `validate_textile_circularity_assessment_target`: el lote evaluado debe pertenecer a una orden **de la misma referencia**.
- `protect_textile_circularity_calculated_fields` (lecciones T2.1/T5.2/T6.1): los 8 campos calculados (`circularity_score`, `readiness_level`, `dimension_scores`, `gaps`, `recommendations`, `calculated_at`, `completed_at`, `completed_by`) solo cambian bajo el flag transaccional `trazaloop.textile_circularity_calculate = 'on'`; una evaluación **completed es snapshot**: sin flag, el único cambio permitido es `status → archived`; pasar a completed exige el flujo controlado. Sin reapertura: para actualizar se crea una nueva evaluación (decisión documentada).
- `guard_textile_circularity_answer`: N/A solo si `allows_na`; respuestas congeladas cuando la evaluación no es draft (efecto colateral aceptado: una evaluación completed tampoco puede borrarse físicamente por el cascade, coherente con "no borrar; archivar").
- Triggers comunes: `set_updated_at`, `force_created_by`, `prevent_organization_id_change`, `audit_row_change` en ambas tablas org.

### Función de cálculo y RPCs
- `calculate_textile_circularity_assessment(uuid)` (revocada; interna, security definer): deriva los criterios automáticos de **datos reales** — composición y suma por alcance (100 ± 0,5), nº de fibras, materiales/proveedores, mejor soporte de evidencia por material, componentes/separabilidad del catálogo T3, declaraciones recicladas/orgánicas y sus soportes, consumos de la orden, **sobreconsumo consultado directamente** (misma unidad, consumido > recibido) y procesos tercerizados sin soporte —; toma las respuestas manuales; aplica la fórmula del encargo §8 (N/A fuera del denominador, normalización por dimensión, renormalización del total si una dimensión entera queda N/A — documentado); genera brechas y recomendaciones; y persiste todo bajo el flag. Criterios manuales sin respuesta cuentan como 0 (documentado en la UI).
- `recalculate_textile_circularity_assessment(uuid)` y `finalize_textile_circularity_assessment(uuid)` (concedidas a authenticated): validan sesión, membresía, **`organization_modules.module_code = 'textiles'` habilitado** y rol. Recalcular: admin/quality/consultant, solo draft. **Finalizar: solo admin/quality** (el consultant prepara el borrador y propone — decisión documentada); recalcula y sella `completed`.

### Evidencias por estado (encargo §17, decisión documentada)
`accepted` = 1 (soporte fuerte) · `pending_review` = 0,5 (parcial/en revisión) · `expired` = 0,5 + **advertencia** `expired_support` (no es soporte fuerte) · `rejected` = 0 + **brecha** `rejected_as_support` · `archived` = 0 (no activa). Se toma el mejor soporte disponible por objetivo.

### Vínculos de evidencias ampliados (superconjuntos; nada anterior se rompe)
- `entity_type` + `circularity_assessment` (17 en total).
- `link_type` + `circularity_support`, `recyclability_support`, `repairability_support`, `separation_support`, `reuse_support`, `end_of_life_support` (24 en total; `care_support` existía desde T5).
- `validate_textile_evidence_link_org` recreado con la rama 17 y el mismo bloqueo cross-tenant.

### RLS
Select: miembros. Insert/update: admin/quality/consultant. Delete: admin/quality (evaluaciones) y admin/quality/consultant (respuestas). Nada para anon. Sin políticas más débiles que T3–T6.

## 3. Reglas de brechas (no bloquean finalizar)
Composición: `no_composition`, `composition_not_100`. Evidencia: `composition_without_support`, `recycled_without_support`, `organic_without_support`, `rejected_as_support`, `expired_support`, `material_without_supplier`, `material_without_datasheet`. Trazabilidad (con lote): `lot_without_consumptions`, `overconsumption` (datos reales), `outsourced_without_support`, `traceability_needs_review` (**indicador auxiliar** — encargo §2: el cálculo consulta además consumos, saldos y evidencias directamente y jamás usa `traceability_status` como única fuente). Separabilidad: `components_without_separability`, `complex_fiber_mix`. Cada brecha mapea a una recomendación interna fija.

## 4. Archivos creados
- `supabase/migrations/0080_textile_circularity_assessments.sql`
- `lib/domain/textiles-circularity.ts` (dimensiones, pesos, niveles, disclaimer, `computeCircularityScore`, `readinessLevelFor`, `evidenceSupportValue`, `computeCircularityGaps`, `parseAnswerValue` — espejo puro y testeable del SQL)
- `lib/db/textiles-circularity.ts` (metodología, criterios, evaluaciones, respuestas, contexto por referencia, vínculos de evidencia de la evaluación)
- `server/actions/textiles-circularity.ts` (crear/editar draft/archivar; upsert/eliminar respuesta; recalcular/finalizar vía RPC)
- `components/domain/textiles/circularity-criteria-form.tsx`
- `app/(app)/(shell)/textiles/circularity/page.tsx` (+ `assessments/`, `assessments/new/`, `assessments/[id]/`)
- `tests/circularity/textiles-circularity.test.ts` (32 checks → puntos 1–46 del encargo §19)
- Este reporte.

## 5. Archivos modificados (enlaces menores y extensión de vínculos; nada funcional de CPR)
- `lib/domain/textiles-evidences.ts`, `lib/db/textiles-evidences.ts`: entidad y tipos nuevos + selector/etiquetas.
- `lib/modules/textiles.ts`: "Circularidad" sale de secciones futuras (quedan 2).
- `app/(app)/(shell)/textiles/page.tsx`: sexta tarjeta "Evaluación de circularidad textil".
- `app/(app)/(shell)/textiles/references/[id]/page.tsx`: tarjeta con última evaluación, puntaje/nivel y links (sin rediseño).
- `app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx`: tarjeta de evaluación asociada + link para crear (sin rediseño).
- Tests: `tests/unit/textiles-module.test.ts` (0080, 2 futuras, shell con circularity), `tests/traceability/textiles-traceability-hardening.test.ts` (pin: tras 0079 existen 0079+0080), `tests/evidences/textiles-evidences.test.ts` (check 11 pasó de longitudes exactas a **superconjunto** de los 11/12 originales de 0075 — justificación: los catálogos crecen por encargo en cada sprint (T6 §10, T7 §12) y el pin exacto rompía con cada ampliación legítima; el CHECK vigente lo verifica la suite del sprint que lo recreó).
- `docs/modules/textiles/TEXTILES_IMPLEMENTATION_ROADMAP.md`, `TEXTILES_DATA_MODEL_PROPOSAL.md`.

## 6. UI
- **/textiles/circularity**: título y subtítulo del encargo §14, aviso de no certificación, 4 cards (Evaluaciones, Nueva evaluación, Metodología activa, Brechas frecuentes — top 3 agregado real).
- **/assessments**: listado con referencia/SKU, producto, lote, puntaje, nivel, estado, fecha y brechas.
- **/assessments/new**: contexto por referencia (fibras, materiales, componentes, evidencias, lotes) + creación de borrador; el lote es opcional y se valida en servidor + trigger que pertenezca a la misma referencia.
- **/assessments/[id]**: cabecera con referencia/producto/lote/metodología/estado, puntaje total y nivel, puntajes por dimensión, brechas, recomendaciones, criterios agrupados por dimensión (manuales con selector 1/0,5/0/N-A y guardado por fila; derivados listados como automáticos), evidencias vinculadas (se vinculan desde el detalle de la evidencia eligiendo la entidad "Evaluación de circularidad", patrón T5), botones Calcular/Recalcular y Finalizar (con confirmación de snapshot), y nota de no certificación. Sin PDF, sin QR, sin pasaporte.

## 7. Cómo activar y probar
1. `TEXTILES_MODULE_ENABLED=true` en `.env.local`; aplicar migraciones hasta **0080**.
2. Habilitar la organización: `insert into organization_modules (organization_id, module_code, enabled) values ('<org>', 'textiles', true) on conflict (organization_id, module_code) do update set enabled = true;`
3. Validación manual (encargo §20): **(1)** referencia + composición → evaluación → responder → calcular → nivel y brechas; **(2)** referencia sin composición → brecha `no_composition`, finalizar no se bloquea; **(3)** fibra reciclada declarada sin evidencia → `recycled_without_support`; **(4)** evidencia rechazada vinculada → no cuenta y genera `rejected_as_support`; **(5)** lote final: el cálculo lee orden, consumos, procesos y evidencias reales, no solo `traceability_status`; **(6)** finalizar y luego `update textile_circularity_assessments set circularity_score = 99 …` → falla por trigger; crear nueva evaluación para actualizar; **(7)** usuario de otra organización → RLS + FKs compuestas + RPCs bloquean lectura, evaluación y vínculos ajenos.

## 8. Resultados de tests
`npm run typecheck` ✓ · `npm run lint` ✓ (0 errores; 1 warning preexistente de T5.2 en `tests/evidences/textiles-evidences-hardening.test.ts`, no tocado) · `npm run build` ✓ (compila las 4 rutas nuevas) · `test:platform` / `test:plans` / `test:launch` ✓ · `test:smoke` y `tests/rls` requieren entorno vivo (comportamiento esperado) · 12 suites textiles ✓, incluida la nueva: **32/32**. Nota: las suites de catálogos viven en `tests/unit/textiles-catalogs.test.ts` (T3), no en `tests/catalogs/`.

## 9. Riesgos y limitaciones conocidas
- La paridad dominio TS ↔ SQL es por diseño y tests de inspección, no ejecución conjunta; cambios futuros de fórmula deben tocar ambos.
- Los criterios derivados por fracción (TE02/TE03/RS02) promedian sin ponderar por rol del material/componente.
- "Brechas frecuentes" agrega en memoria sobre las evaluaciones listadas (suficiente a esta escala).
- El selector de lote en "nueva evaluación" no filtra dinámicamente por referencia (server-rendered); el servidor y el trigger validan la coincidencia.
- Eliminar físicamente una evaluación completed falla (respuestas congeladas + cascade); es coherente con el modelo de snapshot/archivado.

## 10. Qué quedó fuera y confirmaciones
Fuera por encargo: TrazaDocs Textil ✗ · pasaporte técnico ✗ · QR ✗ · blockchain ✗ · IA ✗ · ACV/huella de carbono ✗ · certificación/declaración oficial ✗ · imports CSV ✗ · export PDF ✗ · planes por módulo / `organization_module_access` / `organization_module_subscriptions` ✗ · consola modular, costos, facturación, MRP, inventario ✗. **CPR no fue modificado funcionalmente** (cero objetos CPR en 0080 y cero cambios de código CPR). **Textil sigue privado** (feature flag + organización activa + `organization_modules.module_code`; sin `module_key` ni `enabled_by`).


## 11. Hardening posterior (T7.1)

Ver `TEXTILES_T7_1_CIRCULARITY_CREATION_HARDENING_REPORT.md` (migración
0081): la protección de campos calculados se extendió al **INSERT** — toda
evaluación debe nacer como borrador limpio (status `draft`, campos
calculados vacíos), bajo el mismo flag transaccional de 0080. Queda cerrado
el riesgo de crear vía API directa una evaluación ya finalizada con
puntaje fabricado.
