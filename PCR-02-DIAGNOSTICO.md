# PCR-02 — DIAGNÓSTICO (Fase 1)

> **⚠ ACTUALIZADO POR PCR-02.1 (sprint correctivo de hardening).** PCR-02
> recibió NO-GO en revisión independiente; este repositorio ya incorpora las
> correcciones. Documentos vigentes: `docs/PCR-02.1-REVIEW-FIXES.md`,
> `docs/PCR-02.1-IMPLEMENTATION-REPORT.md`, `docs/PCR-02.1-TEST-MATRIX.md`,
> `docs/PCR-02.1-PRODUCTION-DEPLOY.md` y `docs/PCR-02.1-ROLLBACK.md`. Este
> documento se conserva como registro del sprint PCR-02 original.

Base: **Trazaloop v1.0.1** (`git archive` del tag `v1.0.1`, commit
`da36ddf7b5ac7c859a1d191dd9cf0698887cf611`, SHA-256 del paquete verificado:
`51192caffdfd358f0253615f393f43b139530d512333caed612a248051afa4a4`).
Producción corre v1.0.1 con la migración 0103 ya aplicada. Diagnóstico
realizado leyendo el repositorio real (nombres REALES de tablas/columnas).

---

## 1. Tablas implicadas (0025, nombres reales)

- `input_batches` — lotes de entrada externos (proveedor, material, `quantity_kg`
  obligatoria en filas nuevas por 0103).
- `production_orders` — órdenes/corridas (`order_code`, `order_date date`,
  `status text` check `draft|in_progress|closed|cancelled`, `pretreatment`,
  `process_variables jsonb`, `notes`, `created_at timestamptz`).
- `batch_consumption` — consumos **solo de lotes de entrada** por orden
  (`production_order_id`, `input_batch_id`, `mass_kg > 0`,
  `unique(production_order_id, input_batch_id)`, FK compuestas, cascade al
  borrar la orden, restrict al borrar el lote).
- `output_batches` — lotes producidos (`production_order_id NOT NULL` FK
  compuesta → órdenes con `on delete restrict`, `product_id` nullable,
  `produced_quantity_kg` check `null or > 0`, `unique(organization_id,
  batch_code)`).
- `batch_composition` — composición **por MATERIAL** del lote producido
  (`output_batch_id`, `material_id`, `mass_kg`) — es el eje del cálculo de
  contenido reciclado (Sprint 4), NO una relación de genealogía entre lotes.

Todas cumplen la regla 0024: RLS deny-by-default, `unique(organization_id,
id)`, FK compuestas `(organization_id, id)`, triggers `set_updated_at`,
`prevent_organization_id_change`, `force_created_by`, `audit_row_change`.

## 2. Relaciones actuales

`suppliers → input_batches → batch_consumption → production_orders →
output_batches → batch_composition → materials`. La evidencia se vincula por
`evidence_links` polimórfica (incluye `input_batch`, `production_order`,
`output_batch`) con trigger anti-cross-tenant `validate_evidence_link_org`.

## 3. Enlace output batch ↔ production order

`output_batches.production_order_id NOT NULL` con FK compuesta. **No existe
UNIQUE sobre `production_order_id`** → la BD ya soporta **1 orden → N lotes
producidos** (Bloque C: la cardinalidad no exige migración; era la UX la que
lo escondía). El índice `output_batches_order_idx` ya existe.

## 4. Cómo se registran consumos hoy

`addBatchConsumptionAction` (server/actions/traceability.ts) inserta en
`batch_consumption` validando organización con `assertSameOrg` sobre orden y
lote; la UI vive en la sección expandible `?order=<id>` de la página de
órdenes (PCR-01.1: llega ahí tras crear la orden, con confirmación y guía).
`listConsumption` muestra código de lote, proveedor, material, kg y la
advertencia de sobre-consumo (consumido > recibido, solo advertencia).

## 5. Cómo se representa hoy una salida intermedia

**No se puede.** Un `output_batch` no puede ser consumido por ninguna orden:
`batch_consumption.input_batch_id` solo referencia `input_batches`. La única
forma sería duplicar el lote como `input_batch` (rompe identidad y
genealogía) — exactamente lo que PCR-02 prohíbe. Es la carencia central.

## 6. Limitaciones reales detectadas

1. Sin relación orden→consume→lote producido (Bloque D/E).
2. Genealogía plana de **1 salto**: vistas `v_traceability_backward` /
   `v_traceability_forward` (0026, `security_invoker = true`) solo cubren
   `output → orden → inputs` y `input → orden → outputs`; no hay multi-salto
   ni encadenamiento entre órdenes.
3. `v_output_batch_completeness` agrega consumos SOLO desde
   `batch_consumption`: si una orden consumiera solo intermedios, sus lotes
   quedarían "incomplete: consumos de lotes de entrada" (falso negativo que
   hay que evitar al introducir consumo interno).
4. UX: orden y lote producido son dos procesos administrativos separados
   (formulario general de lote con select de orden en
   `/traceability/output-batches`); no existe detalle de orden — solo una
   expansión inline en el listado.
5. Sin noción de "orden abierta demasiado tiempo" (Bloque I) ni validaciones
   de mutación sobre órdenes cerradas/canceladas (Bloque H): hoy se pueden
   registrar consumos y salidas en una orden `closed`.
6. `ORDER_SELECT` de la app no lee `created_at` (necesario para la alerta).

## 7. Rutas UI implicadas

`/traceability` (índice), `/traceability/input-batches`,
`/traceability/production-orders` (lista + expansión `?order=` + edición
`?edit=`), `/traceability/output-batches` (lista + formulario general de
creación + composición `?batch=`), `/traceability/genealogy` (1 salto),
`/guided-flow` y `/guided-flow/output-batches/[id]` (recorrido guiado),
`/dashboard` (métricas via `getTraceabilityMetrics`), `/audit-support`
(dossier con `listTraceabilityChain` por orden), `/recycled-content`
(cálculo por composición — NO usa consumos). Enlaces entrantes a
`?order=<id>`: la propia lista y `targetHref` de evidencias («Ir al
registro»).

## 8. Server actions implicadas

`server/actions/traceability.ts`: create/update/delete de lotes de entrada,
órdenes y lotes producidos; `addBatchConsumptionAction` /
`updateBatchConsumptionAction` / `deleteBatchConsumptionAction`;
`addBatchCompositionAction` / delete; todas con `requireActiveOrg` +
`checkCprCanMutate` + `assertSameOrg` + redirects de confirmación PCR-01.1.

## 9. Funciones DB / RPC

No hay RPC de trazabilidad: la app consulta tablas y vistas
`security_invoker` (0026 completitud/backward/forward; 0029/0030 contenido
reciclado — **basado exclusivamente en `batch_composition` + clasificaciones
+ evidencias, NO en consumos**: el consumo interno no afecta el cálculo
reciclado). Triggers relevantes: los estándar 0024/0025 +
`t_input_batches_require_quantity` (0103, INSERT/UPDATE con IS DISTINCT
FROM) + `validate_evidence_link_org`.

## 10. RLS

Las 5 tablas: select = `is_org_member`; insert/update =
`admin|quality|consultant`; delete = `admin|quality`. Vistas con
`security_invoker = true` (la RLS de las bases aplica). Cross-tenant
imposible además por FK compuestas `(organization_id, id)`.

## 11. Genealogía actual

`getBackward(outputBatchId)` / `getForward(inputBatchId)` sobre las vistas de
1 salto; página `/traceability/genealogy` con tarjetas
Proveedor→Lote→Orden→Salida. Sin recorrido multi-orden, sin dirección
lote producido→orden posterior (no existe la relación).

## 12. Migraciones relevantes

0025 (modelo), 0026 (vistas trazabilidad), 0028/0029/0030 (reciclado por
composición), 0031 (dossier), 0032 (flujo guiado), 0034/0041/0050/0052
(vistas plataforma/uso que cuentan `output_batches` — solo conteos, no
estructura), 0103 (cantidad obligatoria + plan efectivo — **INTOCABLE**, ya
aplicada en producción). Suites con candado de integridad que hoy prohíben
`0104+` y deberán avanzar su baseline igual que se hizo en PCR-01
(v1-release, passports-share, t9f2, t9f5b, t9f5b1, hint-demo-access).

## 13. Riesgos de compatibilidad

- `v_output_batch_completeness` se REEMPLAZA (create or replace) para sumar
  el consumo interno: hay que conservar EXACTAMENTE nombres/orden de
  columnas para que la app v1.0.1 siga funcionando entre migración y deploy
  (§24). El literal de `missing_items` «consumos de lotes de entrada» solo
  se usa en esa vista (el literal parecido de Textiles es una cadena propia
  de `lib/domain/textiles-circularity.ts`, no de la vista).
- Redirigir el flujo de órdenes a un detalle nuevo obliga a actualizar las
  aserciones PCR-01.1 (`pcr01-ux-flow`) conservando el COMPORTAMIENTO
  (confirmación + guía + aterrizar en consumos): las expectativas avanzan
  con el producto, como en PCR-01.1.
- Datos históricos: no hay backfill necesario — la relación orden↔salida ya
  existe (`production_order_id NOT NULL`); el consumo interno nace vacío; no
  se infiere ni inventa ninguna asociación.
- Ciclos: con consumo interno es posible construir A→X→B→Y→A. La BD bloquea
  el caso claramente inválido (una orden consumiendo un lote producido por
  ella misma) con trigger; el recorrido de genealogía debe ser a prueba de
  ciclos (conjunto de visitados + tope de profundidad) — nunca cargar el
  universo.

## 14. Propuesta mínima de arquitectura PCR-02 (elegida)

**Una sola migración `0104_pcr02_internal_consumption_and_completeness.sql`:**
tabla nueva `output_batch_consumption` (orden consumidora ↔ lote producido
consumido, `mass_kg > 0`, `unique(production_order_id, output_batch_id)`,
FK compuestas: cascade al borrar la orden consumidora, restrict al borrar el
lote; triggers estándar 0024 + trigger anti-autoconsumo; RLS idéntica a
`batch_consumption`) + `create or replace` de `v_output_batch_completeness`
(consumo = unión externo+interno; mismas columnas). Nada más: la
cardinalidad 1→N ya existe; el resto es aplicación.

**Aplicación:** detalle de orden nuevo
`/traceability/production-orders/[id]` como eje (identificación + entradas
con DOS orígenes distinguidos + proceso + salidas con «Registrar lote
producido» contextualizado + evidencias + alerta 72 h + genealogía);
listado de órdenes simplificado que enlaza al detalle (compat: `?order=`
redirige al detalle); listado de lotes producidos conservado como consulta
(Bloque G: se RETIRA el formulario general de creación y se guía a crear
desde la orden — decisión documentada); genealogía multi-salto en capa de
aplicación (recolección BFS acotada + ensamblado puro testeable);
constante de dominio `PRODUCTION_ORDER_OPEN_ALERT_HOURS = 72`; validaciones
de orden cerrada/cancelada en server actions (sin triggers sobre datos
históricos). Sin cambios en Textiles, reciclado, importadores ni plan.
