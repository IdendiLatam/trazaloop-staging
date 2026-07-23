# Trazaloop Textil · Propuesta de modelo de datos

> **Adenda T4 (implementado)**: el bloque de productos/composición se materializó
> en `supabase/migrations/0074_textile_products_and_composition.sql` con estas
> decisiones reales frente a la propuesta original:
>
> 1. **Sin polimorfismo `owner_type`**: la composición de fibras ancla ÚNICAMENTE
>    a `textile_references` (FK compuesta). Producto y colección quedan como
>    agrupadores; la unidad trazable es la referencia/SKU. Elimina de raíz el
>    riesgo org-safety del polimorfismo señalado en el roadmap.
> 2. **Nombres reales**: `textile_collections`, `textile_products`,
>    `textile_references`, `textile_reference_fiber_composition`,
>    `textile_reference_materials`, `textile_reference_components` (los
>    `textile_components` del catálogo se crearon ya en T3/0073; T4 solo agrega
>    la tabla puente referencia↔componente con overrides de separabilidad y
>    reemplazabilidad).
> 3. **Variantes talla/color**: NO se crea tabla de variantes; `color` y
>    `size_range` son campos simples de la referencia (decisión explícita del
>    encargo T4; una tabla de variantes queda como opción futura).
> 4. **Composición por alcance**: `component_scope`
>    (whole_product/main_fabric/secondary_fabric/lining/thread/trim/other) con
>    unicidad `(org, reference, fibra, alcance)`; la suma se evalúa POR alcance
>    con tolerancia 100 ± 0.5 → not_started/incomplete/complete/needs_review
>    (campo informativo `composition_status`, recalculado por el servidor; jamás
>    describe cumplimiento). El guardado parcial NO se bloquea.
> 5. **Declaraciones, no certificaciones**: `is_recycled_declared` /
>    `is_organic_declared` (ISO 14021 como referencia conceptual); la evidencia
>    llega en T5.
> 6. **RLS**: plantilla T3 (select/insert/update miembros; delete de maestros
>    admin/quality). En las tres tablas de asociación el delete se amplía a
>    consultant — mismos roles de escritura de composición que CPR 0025 —
>    porque quitar filas hace parte de la edición normal.


> Sprint T0 — Solo documentación. **No se crean migraciones ni código.** Toda tabla
> aquí descrita es una propuesta para sprints T1+.

## 1. Objetivo

Proponer tablas, campos, claves, relaciones, RLS e índices del dominio Textil, y la
estrategia de evolución de TrazaDocs a multi-módulo, protegiendo CPR.

## 2. Alcance y convenciones obligatorias

Toda tabla textil sigue el patrón ya vigente en CPR (0024 + helpers 0003):

- `id uuid pk default gen_random_uuid()`.
- `organization_id uuid not null references organizations(id) on delete restrict` en
  toda tabla org-scoped, con `unique(organization_id, id)` para FKs compuestas.
- FKs entre tablas org-scoped **compuestas** `(organization_id, x_id)` para impedir
  cruces entre empresas.
- Triggers: `set_updated_at`, `force_created_by`, `prevent_organization_id_change`,
  `audit_row_change`.
- RLS deny-by-default con `is_org_member` / `has_org_role`; catálogos globales solo
  escribibles por `is_platform_superadmin`.
- Prefijo **`textile_`** en esquema `public` (decisión §6.1). Naming en inglés
  snake_case, como todo el esquema actual.

## 3. Catálogos globales (sembrables, sin organization_id)

### 3.1 `textile_fiber_types`
- **Propósito**: catálogo de fibras (naturales, artificiales, sintéticas) con nombre
  genérico estandarizado. Base normativa: N-08 (ISO 2076) para manufacturadas +
  fibras naturales de uso común.
- **Campos**: `code` (unique), `name`, `generic_name_standard` (texto de referencia,
  p. ej. "ISO 2076"), `fiber_class` check in ('natural','artificial','synthetic',
  'other'), `is_elastomeric boolean`, `recyclability_notes text`, `is_active`.
- **RLS**: select para miembros activos; escritura solo superadmin. Índice por
  `fiber_class`.
- **Riesgo**: nombres locales ("licra") vs genéricos ("elastano"): campo `aliases
  text[]` opcional.

### 3.2 `textile_diagnostic_sections` / `textile_diagnostic_questions`
- **Propósito**: catálogo global del diagnóstico textil (dimensiones D1–D12 y 58
  preguntas). Espejo del patrón CPR (`diagnostic_sections`/`diagnostic_questions`)
  pero **tablas nuevas**: no se insertan filas textiles en las tablas CPR porque su
  seed, pesos y wizard están acoplados al dominio CPR.
- **Campos questions**: `section_id`, `code` unique, `question_text`, `help_text`,
  `standard_refs text[]`, `weight numeric`, `is_critical boolean`,
  `is_context boolean` (pregunta 49), `depends_on_question_id uuid null` (condición
  NA), `order_index`, `recommended_action`, `is_active`.
- **Riesgo**: lógica condicional en SQL; se decide mantenerla en `lib/domain`
  (solo datos declarativos en tablas).

## 4. Tablas de dominio (org-scoped)

Para abreviar, "patrón base" = campos/triggers/RLS del §2 + `created_by`,
`created_at`, `updated_at`, `notes text` cuando aplique.

### 4.1 `textile_collections`
- **Propósito**: colecciones/líneas/temporadas.
- **Campos**: patrón base + `code`, `name`, `season`, `launch_date date`,
  `status` check in ('active','archived').
- **Claves**: `unique(organization_id, code)`.
- **Relaciones**: 1:N con products/references.

### 4.2 `textile_products`
- **Propósito**: producto textil terminado.
- **Campos**: patrón base + `code`, `name`, `category` (texto o catálogo org),
  `collection_id uuid null` (FK compuesta), `season`, `made_in_country text`,
  `status` check in ('draft','active','archived'), `owner_id uuid` (responsable).
- **Claves**: `unique(organization_id, code)`; índices `(organization_id, status)`,
  `(organization_id, collection_id)`.
- **Riesgo**: relación con referencias pendiente de Q-01; el modelo soporta ambas
  lecturas (producto padre + referencias hijas).

### 4.3 `textile_references`
- **Propósito**: referencia/SKU con versión de ficha.
- **Campos**: patrón base + `product_id` (FK compuesta, not null), `code`, `name`,
  `size_range text`, `color text`, `sheet_version text default 'v1'`, `status`.
- **Claves**: `unique(organization_id, code)`; índice `(organization_id, product_id)`.
- **Riesgo**: matriz talla×color completa fuera de MVP; atributos simples.

### 4.4 `textile_suppliers`
- **Propósito**: proveedores de telas, avíos, servicios (terceros) y empaques.
- **Campos**: patrón base + `name`, `tax_id`, `country`, `supplier_type` check in
  ('fabric','trims','services','packaging','other'), `contact_name`,
  `contact_email`, `status`.
- **Claves**: `unique(organization_id, tax_id)` parcial (cuando tax_id no nulo);
  índice `(organization_id, supplier_type)`.
- **No reutiliza** `public.suppliers` de CPR (§7).

### 4.5 `textile_materials`
- **Propósito**: catálogo de insumos: telas, hilos, forros, entretelas, avíos,
  empaques.
- **Campos**: patrón base + `name`, `material_type` check in ('fabric','lining',
  'thread','interlining','trim','label','packaging','other'), `supplier_id null`
  (FK compuesta), `composition_summary text`, `status`.
- **Relaciones**: composición detallada vive en `textile_fiber_compositions`
  (owner_type='material').

### 4.6 `textile_fiber_compositions`
- **Propósito**: desglose porcentual de fibras por dueño polimórfico.
- **Campos**: patrón base + `owner_type` check in ('product','reference','material',
  'component'), `owner_id uuid not null`, `fiber_type_id` (FK a catálogo global),
  `fiber_label_override text null`, `percentage numeric(6,3) check (percentage > 0
  and percentage <= 100)`, `evidence_id uuid null` (FK compuesta a
  `textile_evidences`), `is_declared_only boolean default true`.
- **Claves**: `unique(organization_id, owner_type, owner_id, fiber_type_id)`.
- **RLS extra**: la integridad del par (owner_type, owner_id) dentro de la misma
  organización se valida en server action + trigger de verificación (documentado como
  riesgo de polimorfismo; alternativa con FKs por tipo descartada por proliferación
  de columnas nulas).
- **Regla de dominio**: suma por (owner) ≤ 100 con alerta si ≠ 100 (en `lib/domain`,
  no constraint, para permitir capturas parciales con brecha visible).

### 4.7 `textile_components`
- **Propósito**: componentes físicos del producto: tela principal, forro, hilo,
  botón, cierre, etiqueta, empaque.
- **Campos**: patrón base + `product_id` o `reference_id` (uno de los dos, según
  Q-01; propuesta: `reference_id` not null), `material_id null`, `component_role`
  check in ('main_fabric','secondary_fabric','lining','thread','button','zipper',
  'label','hardware','packaging','other'), `quantity_or_mass text`,
  `is_separable boolean null`, `separation_instructions text`.
- **Relaciones**: base de separabilidad para circularidad y pasaporte.

### 4.8 `textile_processes`
- **Propósito**: catálogo org de procesos (corte, confección, lavado, estampación,
  bordado, acabado, empaque).
- **Campos**: patrón base + `code`, `name`, `is_outsourced_default boolean`,
  `status`. `unique(organization_id, code)`.

### 4.9 `textile_process_orders`
- **Propósito**: órdenes de confección.
- **Campos**: patrón base + `order_code`, `reference_id` (o product_id según Q-01),
  `planned_quantity numeric`, `status` check in ('draft','in_progress','closed',
  'cancelled'), `started_at date`, `closed_at date`.
- **Claves**: `unique(organization_id, order_code)`.

### 4.10 `textile_order_processes`
- **Propósito**: ruta de procesos de una orden, con tercerización.
- **Campos**: patrón base + `process_order_id` (FK compuesta), `process_id`,
  `sequence integer`, `is_outsourced boolean`, `supplier_id null` (tercero),
  `sent_at date`, `returned_at date`, `evidence_id null`.
- **Claves**: `unique(organization_id, process_order_id, sequence)`.
- Nota: cubre el módulo funcional "Procesos tercerizados" sin tabla adicional.

### 4.11 `textile_input_batches`
- **Propósito**: lotes/entregas de material que ingresan.
- **Campos**: patrón base + `material_id` not null, `supplier_id` not null,
  `supplier_batch_code text`, `received_date date`, `quantity numeric`,
  `quantity_unit` check in ('m','kg','units','rolls','other'), `evidence_id null`,
  `status`.
- **Claves**: `unique(organization_id, material_id, supplier_batch_code)` parcial.
- Diferencia deliberada vs CPR: unidades textiles (metros/rollos/unidades), sin
  `residue_type` ni kg obligatorios.

### 4.12 `textile_output_batches`
- **Propósito**: lotes confeccionados / producto terminado.
- **Campos**: patrón base + `process_order_id` (FK compuesta), `reference_id`,
  `batch_code`, `quantity integer`, `status` check in ('draft','completed',
  'archived').
- **Claves**: `unique(organization_id, batch_code)`.

### 4.13 `textile_traceability_links`
- **Propósito**: grafo de trazabilidad genérico entre entidades: input_batch →
  process_order, process_order → output_batch, material → reference, etc.
- **Campos**: patrón base + `source_type`/`source_id`, `target_type`/`target_id`
  (checks de tipos permitidos), `link_type` check in ('consumed_in','produced_by',
  'used_in','derived_from','other'), `quantity numeric null`.
- **Claves**: `unique(organization_id, source_type, source_id, target_type,
  target_id, link_type)`; índices por source y por target.
- **Riesgo**: polimorfismo (mismo tratamiento que 4.6). Las consultas de cadena se
  exponen vía **vistas** (patrón `0026_traceability_views.sql`), p. ej.
  `textile_v_batch_traceability`.

### 4.14 `textile_evidences` y `textile_evidence_links`
- **Propósito**: evidencias del módulo (fichas técnicas, certificados de esquemas
  externos, declaraciones, facturas, ensayos, fotos) y su asociación polimórfica.
- **`textile_evidences`**: patrón base + `name`, `evidence_type` check in
  ('datasheet','certificate','declaration','invoice','lab_test','photo','other'),
  `scheme_code text null` (p. ej. 'GRS','RCS','OCS','GOTS','OEKO_TEX_MIG'; solo
  etiqueta descriptiva de la evidencia archivada), `status` (pending/valid/rejected/
  expired, reutilizando el patrón de `evidence_status`), `evidence_date`,
  `valid_until`, `storage_path`, `responsible`, `observations`.
- **`textile_evidence_links`**: patrón base + `evidence_id` (FK compuesta),
  `target_type` check in ('supplier','material','input_batch','process_order',
  'output_batch','product','reference','component','composition','claim',
  'circularity_assessment','passport'), `target_id`, `evidence_role text`.
  `unique(organization_id, evidence_id, target_type, target_id)`.
- **Decisión**: tablas propias, no `public.evidences` de CPR, porque el enum
  `evidence_target_type` CPR es cerrado y de dominio plástico, y los conteos de plan
  por módulo se simplifican (§7). Bucket de storage propio o prefijo
  `textiles/{organization_id}/...` (decisión D-07).

### 4.15 `textile_claims` y `textile_claim_evidences`
- **Propósito**: claims ambientales declarados por la empresa sobre producto/
  referencia/material, gobernados por N-05 (ISO 14021).
- **`textile_claims`**: patrón base + `owner_type` ('product','reference',
  'material'), `owner_id`, `claim_type` check in ('recycled_content','organic',
  'recyclable','reusable','repairable','other'), `claim_text`, `scope_text`,
  `limitations_text`, `status` check in ('draft','supported','unsupported',
  'withdrawn'). Estado `supported` exige ≥1 evidencia válida vinculada (regla en
  server action).
- **`textile_claim_evidences`**: puente claim↔evidencia con `evidence_role`
  (alternativa: usar `textile_evidence_links` con target_type='claim'; se recomienda
  el puente dedicado para exigir roles y facilitar la regla de soporte — decisión
  final en T5).

### 4.16 `textile_circularity_assessments`
- **Propósito**: evaluación versionada de circularidad por referencia (o producto).
- **Campos**: patrón base + `reference_id`, `assessment_version integer`,
  `answers jsonb` (respuestas de la matriz, esquema en
  `TEXTILES_CIRCULARITY_ASSESSMENT_MODEL.md`), `repairability_level`,
  `reuse_level`, `recyclability_level`, `material_complexity`,
  `recycling_difficulty`, cada uno con check in ('high','medium','low',
  'not_evaluable'), `mono_material boolean null`, `circular_readiness_score
  numeric(5,2) null`, `readiness_level` check in ('low','medium','good','high',
  'not_evaluable'), `status` check in ('draft','in_review','approved','obsolete'),
  `assessed_by`, `approved_by`, `approved_at`.
- **Claves**: `unique(organization_id, reference_id, assessment_version)`.
- Niveles calculados en `lib/domain/textiles-circularity.ts` (puro y testeable);
  la BD solo persiste.

### 4.17 `textile_material_passports`
- **Propósito**: snapshot inmutable versionado del pasaporte técnico.
- **Campos**: patrón base + `reference_id` (y `output_batch_id null` para pasaporte
  por lote), `version integer`, `status` check in ('draft','in_review',
  'approved_internal','obsolete'), `snapshot jsonb not null` (estructura en
  `TEXTILES_MATERIAL_PASSPORT_MODEL.md`), `generated_at`, `approved_by`,
  `approved_at`, `obsolete_at`.
- **Claves**: `unique(organization_id, reference_id, output_batch_id, version)`.
- **Regla**: aprobado ⇒ snapshot inmutable (RLS de update solo en draft/in_review;
  nueva versión desde aprobado, patrón TrazaDocs 0047).

### 4.18 `textile_diagnostics` y `textile_diagnostic_answers`
- **Propósito**: instancia del diagnóstico por organización y sus respuestas.
- **`textile_diagnostics`**: patrón base + `status` ('in_progress','completed'),
  `completed_at`, `score numeric`, `level` check in ('inicial','basico',
  'intermedio','avanzado','preparado') — nombres finales de nivel en T2.
- **`textile_diagnostic_answers`**: patrón base + `diagnostic_id` (FK compuesta),
  `question_id` (FK a catálogo global), `answer` check in ('yes','partial','no',
  'not_applicable'), `observations text`. `unique(organization_id, diagnostic_id,
  question_id)`.
- Diferencia vs CPR: `answer` textual de 4 valores en lugar de boolean.

## 5. TrazaDocs: análisis de opciones multi-módulo

| Opción | Descripción | Ventajas | Riesgos |
|---|---|---|---|
| **A** — `module_key` en tablas existentes | Agregar `module_key text not null default 'cpr'` a `trazadoc_blueprints`, `trazadoc_documents`, `trazadoc_file_documents` (y propagar a vistas/filtros); check in ('cpr','textiles') | Un solo motor, cero duplicación de UI/acciones/estados; el default `'cpr'` preserva todo dato existente; separación garantizable por constraint + filtros | Tocar tablas productivas CPR (migración aditiva de bajo riesgo, pero requiere regresión completa); vistas y conteos de plan deben incorporar el filtro |
| **B** — Tablas `textile_trazadoc_*` | Duplicar las 8 tablas para Textil | CPR intocado al 100 % | Duplicación de motor, acciones, componentes, RLS y bugs; divergencia inevitable; maestro documental doble |
| **C** — Motor genérico multi-módulo nuevo | Rediseñar TrazaDocs como servicio genérico y migrar CPR | Arquitectura "ideal" a largo plazo | Reescritura + migración de datos productivos CPR: máximo riesgo, contradice "no modificar lógica funcional de CPR" |

**Recomendación: Opción A** (evolución multi-módulo con `module_key`), con
salvaguardas:

1. Columna aditiva con `default 'cpr'` y backfill implícito — ningún dato CPR cambia
   de significado.
2. `textile_document_blueprints` **no** se crea como tabla: los blueprints textiles
   son filas en `trazadoc_blueprints` con `module_key='textiles'` (el nombre de la
   lista del enunciado queda cubierto por esta decisión, "si aplica" → no aplica como
   tabla separada).
3. Todas las consultas CPR existentes se ajustan solo para filtrar
   `module_key='cpr'`; tests de regresión TrazaDocs CPR obligatorios antes de merge.
4. Los límites de plan (`documents_trazadocs`) se evalúan por módulo (decisión D-09).
5. Categorías documentales: se reutiliza `category_code` actual; si Textil necesita
   categorías nuevas se amplía el check (aditivo).

Detalle funcional en `TEXTILES_TRAZADOCS_MODEL.md`.

## 6. Decisiones transversales de esquema

### 6.1 Prefijo vs esquema separado
**Recomendación: prefijo `textile_` en `public`.** Un esquema `textiles` separado
complica RLS helpers, tipos generados, migraciones y el cliente Supabase actual, sin
beneficio de aislamiento real (RLS ya aísla por organización). El prefijo mantiene
grep-abilidad y evita colisiones con CPR.

### 6.2 Tablas CPR que NO deben reutilizarse para datos textiles
`products`, `product_families`, `suppliers`, `materials`,
`material_classifications`, `input_batches`, `production_orders`,
`batch_consumption`, `output_batches`, `batch_composition`,
`recycled_content_calculations`, `calculation_methodologies`,
`diagnostic_sections/questions/answers`, `diagnostics`, `evidences`,
`evidence_links`. Motivo: semántica plástica (residue_type, kg, contenido reciclado
NTC 6632/UNE-EN 15343), enums cerrados y conteos de plan acoplados a CPR.

### 6.3 Tablas transversales que SÍ se reutilizan tal cual
`organizations`, `memberships`, `profiles`, `roles`, `platform_staff`, `modules`,
`organization_modules`, `plan_definitions`, `plan_limits`,
`organization_subscriptions`, `subscription_plan_history`, `legal_documents`,
`user_legal_acceptances`, `support_tickets*`, `team_invitations`, `audit_log`,
`import_jobs`/`import_job_rows` (si T10 habilita importaciones textiles, con
`job_type` nuevo), y el motor TrazaDocs según §5.

### 6.4 Datos en Sprint T1 (regla cerrada en T0.1)

**En T1 no se crea ninguna tabla textil funcional.** T1 es shell privado y
preparación de activación:

| Permitido en T1 | Prohibido en T1 |
|---|---|
| Fila nueva en el catálogo `modules` (`code='textiles'`) | Cualquier tabla `textile_*` de este documento |
| Filas en `organization_modules` para organizaciones internas de prueba | Cambios a `trazadoc_*` (eso es T8) |
| — | Seeds de fibras o de diagnóstico (T2/T3) |
| — | Cambios a `plan_limits` (fase comercial) |

Las tablas de este documento se crean en su sprint: diagnóstico (T2), catálogos
(T3), composición/componentes (T4), evidencias/claims (T5), trazabilidad (T6),
circularidad (T7), pasaportes (T9). TrazaDocs recibe cambios aditivos solo en T8.

### 6.5 Acceso por módulo (futuro, documentado en T0.2 — NO crear ahora)

El plan hoy es **global** (`organization_subscriptions`, `unique(organization_id)`)
y la activación por módulo es booleana (`organization_modules.enabled`). La
evolución decidida como dirección (DL-18/DL-20) es la tabla
`organization_module_access` (organización × `module_key` × `plan_key demo/full/extra`
× `status pending/active/suspended/cancelled/no_access`, con `activated_by/at`,
`expires_at`, sobrescrituras y notas), especificada en
`TRAZALOOP_MODULE_ACCESS_MODEL.md`. **No pertenece a este modelo de datos textil ni
a ningún sprint T1–T11**: se diseña en detalle y se implementa en el sprint de
plataforma **Plataforma-M1** (DL-22), con backfill del plan global como plan del
módulo CPR y regresión CPR completa. Las tablas textiles de este documento no
dependen de ella: los guards de T1–T11 usan `organization_modules` tal como existe.

## 7. Base normativa y referencias internacionales

| Funcionalidad (grupo de tablas) | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| `textile_fiber_types`, `textile_fiber_compositions` | N-08 (ISO 2076), N-09 (ISO 1833), N-05 | Nomenclatura estandarizada y evidencia por composición. | Validez analítica o de etiquetado legal. |
| `textile_suppliers`, lotes, órdenes, links | N-03 (ISO 22095), N-15 futuro | Cadena de custodia documental con actores y transferencias. | Certificación de cadena de custodia. |
| `textile_evidences`, `textile_claims*` | N-05; N-12/N-13/N-14 como `scheme_code` | Claims soportados por evidencia con limitaciones. | Emisión o validación de certificados. |
| `textile_circularity_assessments` | N-10, N-11, N-04 | Índice interno y niveles con "not_evaluable". | Certificación de reciclabilidad/circularidad. |
| `textile_material_passports` | N-01 contexto, N-03, N-05 | Snapshot versionado preparatorio. | DPP oficial UE. |
| Diagnóstico textil | N-03/N-04/N-05/N-10 | Catálogo global con `standard_refs`. | Acreditación de madurez. |

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Polimorfismo (compositions, links, evidence_links) sin FK real | Checks de tipo + validación en server action + trigger de existencia; vistas para lectura; tests RLS específicos. |
| Migración `module_key` sobre TrazaDocs productivo | Migración aditiva con default, regresión completa CPR, plan de rollback (columna ignorable). |
| Ambigüedad producto/referencia (Q-01) | 4.2/4.3 soportan ambas lecturas; congelar decisión antes de T3. |
| Conteos de plan textiles ausentes | Nuevos `resource_code` textiles en `plan_limits` (sprint de planes, ver D-09); mientras tanto el módulo es privado. |

## 9. Criterios de aceptación

- [ ] Toda tabla propuesta cumple el patrón 0024 (org, unique compuesto, triggers,
  RLS).
- [ ] Ninguna tabla CPR de dominio se reutiliza para datos textiles (§6.2).
- [ ] La opción A de TrazaDocs está justificada con salvaguardas verificables.
- [ ] No existe migración ni SQL ejecutable derivado de este documento en T0.

## 10. Próximos pasos

1. Congelar Q-01 y Q-05 (avíos) → ajustar 4.2/4.3/4.7.
2. Redactar las migraciones propuestas (sin aplicar) al inicio de T3, en orden:
   catálogos globales → catálogos org → trazabilidad → evaluaciones → pasaporte.
3. Diseñar tests RLS (`tests/rls`) por tabla nueva desde su sprint de creación.


---

## Adenda T5 (Julio 2026): evidencias implementadas (0075)

Decisiones reales frente a la propuesta: **Opción B** (tablas propias
`textile_evidences`/`textile_evidence_links`; el motor CPR no se toca).
`entity_type` cubre 11 entidades (incluye `fiber_composition`,
`reference_material` y `reference_component`) validadas por CHECK + trigger
polimórfico mismo-tenant con FK compuesta hacia la evidencia. `status` en
CHECK de texto (sin enum nuevo) con insert forzado a `pending_review` por
política RLS y transición reservada a admin/quality por guard security
definer. Storage sin migración: mismo bucket privado `evidences` con
prefijo `{organization_id}/textiles/…` (el primer segmento sigue siendo la
organización → políticas 0015 aplican sin cambios). `accepted` = aceptación
interna documental, nunca certificación externa.


## Adenda T5.2 (Julio 2026): archivo de evidencia inmutable (0077)

Los cuatro metadatos de archivo de `textile_evidences` quedan inmutables
tras la creación por trigger (sin excepción de roles ni de service_role) y
`file_path` se valida en el INSERT contra el patrón estricto
`{organization_id}/textiles/{evidence_id}/{filename_saneado}`. Reemplazar
un archivo exigirá en el futuro nueva evidencia, versionado o RPC
controlada — nunca update directo.


## Adenda T6 (Julio 2026): órdenes, lotes y trazabilidad (0078)

Decisiones reales frente a la propuesta: (1) `textile_input_lots` unifica
materiales y avíos con `lot_type` + XOR material/componente, en lugar de
dos tablas; (2) el sobreconsumo se **bloquea** por trigger solo cuando es
comparable (misma unidad y cantidad declarada) y se marca como brecha en
caso contrario — sin conversión de unidades; (3) `traceability_status` se
persiste en `textile_output_lots` como caché informativa — desde T6.1
(0079) protegida contra UPDATE directo y recalculada POR LA BASE DE DATOS
mediante triggers en cada mutación operativa relevante, con RPC de
recálculo manual; el cálculo en vivo del dominio y el SQL comparten las
mismas reglas; (4) los vínculos de
evidencias se ampliaron por superconjunto de CHECKs + trigger polimórfico
de 16 ramas; (5) el estado derivado del lote de entrada
(available/partially_consumed/consumed) lo recalcula el servidor y nunca
pisa blocked/archived.

## Adenda T7 (julio 2026) — Circularidad implementada (0080)

El bloque de circularidad quedó materializado con decisiones reales:
`textile_circularity_methodologies` y `textile_circularity_criteria` son
GLOBALES (patrón `textile_fiber_types`: lectura authenticated, sin
escrituras de app) para versionar metodología; la evaluación vive en
`textile_circularity_assessments` (FKs compuestas a referencia y lote
final; el lote debe ser de una orden de la misma referencia) con
respuestas en `textile_circularity_answers` (0–1, N/A condicionado).
Los campos calculados están protegidos por trigger + flag en UPDATE
(0080) **y en INSERT (0081, T7.1: toda evaluación nace como borrador
limpio)**, y solo los escribe `calculate_textile_circularity_assessment` (deriva criterios
automáticos de datos reales y aplica la fórmula normalizada por
dimensión); `completed` es snapshot inmutable. Los vínculos de evidencia
se ampliaron a `circularity_assessment` con soportes de circularidad,
reciclabilidad, reparabilidad, separación, reutilización y fin de vida.
Pasaporte y TrazaDocs Textil siguen SIN crear.

## Adenda T8 (implementado) — TrazaDocs Textil sobre el motor TrazaDocs

`0082_textile_trazadocs.sql` NO creó tablas del módulo: extendió el motor
TrazaDocs de la plataforma de forma aditiva y sembró estructuras.

- `trazadoc_blueprints.module_key` y `trazadoc_documents.module_key`
  (`text not null default 'cpr'`, check `('cpr','textiles')`): todo lo
  existente quedó backfilled como CPR por el default.
- Trigger `t_trazadoc_documents_module_key` (BEFORE INSERT/UPDATE):
  el documento HEREDA `module_key` de su estructura al crearse (el valor del
  cliente se ignora) y el módulo es INMUTABLE después.
- Vistas `v_trazadoc_document_summary`, `v_trazadoc_blueprint_summary` y
  `v_trazadoc_document_master` recreadas con `module_key` como última columna
  (create or replace válido); el maestro además enruta documentos textiles a
  `/textiles/trazadocs/[id]` y marca los descargables como CPR.
- Seed idempotente: 12 estructuras `TXT-*` (`module_key='textiles'`, ids fijos
  `d0000000-…-0001…0012`) con 140 secciones y tips; referencias técnicas
  presentadas siempre como preparación documental.
- Separación en código: `listDocuments/getDocument/listAvailableBlueprints/
  getBlueprintByIdForCompany/findDocumentByNormalizedTitle` reciben
  `moduleKey` con default `'cpr'` (CPR intacto); las envolturas de
  `lib/db/textiles-trazadocs.ts` fijan `'textiles'` en servidor.


## Adenda T9.0 (propuesta, sin implementar) — Pasaporte técnico textil

Diseño en `TEXTILES_PASSPORT_DATA_MODEL_PROPOSAL.md`. Propone **una** tabla
nueva `textile_technical_passports` (un registro por versión: `passport_code`
estable + `passport_version` incremental; `snapshot_json`, `source_hash`,
`gaps_json`, `data_sources_json`, sellos de generación/revisión/aprobación
interna/obsolescencia). FKs compuestas por `(organization_id, id)` a
`textile_references`, `textile_output_lots` y `textile_circularity_assessments`
(las tres ya exponen `unique(organization_id, id)`). Sin tablas de secciones ni
de versiones (las secciones viven en `snapshot_json`; el versionado es por
registros). Evidencias: ampliación **aditiva** de `textile_evidence_links`
(`entity_type += 'technical_passport'`, `link_type += 'passport_support'`).
Snapshot protegido por trigger + flag transaccional (patrón T7.1). Se implementa
en T9A.