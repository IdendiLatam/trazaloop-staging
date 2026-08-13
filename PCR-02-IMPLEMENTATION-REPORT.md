# PCR-02 — IMPLEMENTATION REPORT

> **⚠ ACTUALIZADO POR PCR-02.1 (sprint correctivo de hardening).** PCR-02
> recibió NO-GO en revisión independiente; este repositorio ya incorpora las
> correcciones. Documentos vigentes: `docs/PCR-02.1-REVIEW-FIXES.md`,
> `docs/PCR-02.1-IMPLEMENTATION-REPORT.md`, `docs/PCR-02.1-TEST-MATRIX.md`,
> `docs/PCR-02.1-PRODUCTION-DEPLOY.md` y `docs/PCR-02.1-ROLLBACK.md`. Este
> documento se conserva como registro del sprint PCR-02 original.

Base: Trazaloop **v1.0.1** (tag `v1.0.1`, commit `da36ddf`, SHA-256 del ZIP
verificado `51192caf…afa4a4`). `package.json` conserva `"version": "1.0.0"`
por instrucción expresa del cliente. Nada de este sprint se ejecutó contra
producción, Vercel ni Git.

---

## 1. Resumen ejecutivo

PCR-02 convierte la **Orden / corrida de producción en el eje real del
proceso**: detalle propio con entradas (dos orígenes), proceso, salidas y
evidencias; registro del lote producido DESDE la orden con asociación
automática; **consumo interno de lotes producidos** (producto intermedio
reutilizable sin duplicar el lote); **genealogía multi-salto bidireccional**
a prueba de ciclos; alerta in-app de órdenes abiertas > 72 h; y validaciones
de estado coherentes. Una sola migración nueva (**0104**, aditiva,
compatible en caliente con v1.0.1). Validación en este entorno: `typecheck`
✅ · `lint` ✅ (1 advertencia preexistente) · `next build --webpack` ✅ ·
**`test:all` EXIT 0 con 1460 verificaciones en verde** (incluye ~60 suites
Textiles sin regresión y 4 suites PCR-02 nuevas con 33 verificaciones).

## 2. Modelo final: entrada → orden → salida → siguiente orden

```
Proveedor
  └─ input_batches (lote de entrada externo)
       └─ batch_consumption ──────────────┐   (origen A: externo)
                                          ▼
                            production_orders (Orden / corrida A)
                                          │ production_order_id
                                          ▼
                            output_batches (lote producido — final O intermedio)
                                          │
       ┌─ output_batch_consumption ◄──────┘   (origen B: interno, NUEVO 0104)
       ▼
production_orders (Orden / corrida B)  →  output_batches (lote final)
```

- La relación orden→salida ya existía (`production_order_id NOT NULL`, sin
  unique → **1 orden → N lotes soportado desde 0025**; Bloque C = UX, no BD).
- La relación NUEVA es `output_batch_consumption`: la orden B consume el
  MISMO `output_batch` intermedio (identidad conservada; jamás se duplica
  como `input_batch`). `batch_composition` (materiales) sigue intacta como
  eje del cálculo de contenido reciclado — que **no usa consumos** (0029/
  0030), por lo que el consumo interno no altera el reciclado.

## 3. Migración 0104 (única)

`0104_pcr02_internal_consumption_and_completeness.sql`:
- §1 Tabla `output_batch_consumption` cumpliendo la regla 0024 completa:
  `unique(organization_id, id)`, `unique(production_order_id,
  output_batch_id)`, `mass_kg > 0`, **FK compuestas** (orden consumidora →
  cascade; lote producido → restrict, mismo criterio que batch_consumption),
  triggers `set_updated_at` / `prevent_organization_id_change` /
  `force_created_by` / `audit_row_change`, índices por orden y por lote.
- §2 Trigger `output_batch_consumption_no_self` (INSERT y UPDATE): «Una
  orden no puede consumir un lote producido por ella misma.» Los ciclos
  largos (A→X→B→Y→A) no se bloquean en BD: el recorrido de genealogía es a
  prueba de ciclos y el caso queda como advertencia operativa documentada.
- §3 RLS idéntica a `batch_consumption` (select miembro; insert/update
  admin|quality|consultant; delete admin|quality).
- §4 `create or replace` de `v_output_batch_completeness`: el agregado de
  consumos es la **unión** externo+interno (mismas columnas y orden →
  compatible §24 con la app v1.0.1 en caliente); una orden que consume solo
  intermedios ya no aparece falsamente «incompleta»; el literal de
  `missing_items` pasa a «consumos de la orden». Para filas internas,
  proveedor/material cuentan como información completa (la procedencia es la
  orden productora, plenamente trazable).
- Sin backfill: no existe dato del que inferir consumos internos históricos
  y está prohibido inventarlos. Reversibilidad documentada en cabecera y en
  PCR-02-ROLLBACK.md (política anti-drift de PCR-01.1).

## 4. Bloques implementados

**A — Detalle de la orden (eje)**: nueva ruta
`/traceability/production-orders/[id]` con: identificación y proceso (fecha,
sede, pretratamiento, variables en resumen legible, notas, `created_at`),
evidencias vinculadas + asociación inline, sección `#consumos-<id>`
«Materiales / lotes consumidos», sección `#salidas` «Lotes producidos /
salidas de la orden», alerta 72 h, aviso «orden cerrada sin lotes
producidos», editar/eliminar, y 404 para ids ajenos o inexistentes. El
listado queda como puerta al detalle («Abrir orden»), conservando búsqueda,
paginación, creación/edición y el fijado por `focus` de PCR-01.1; los
enlaces históricos `?order=<id>` **redirigen al detalle** (compatibilidad).

**B — Crear lote desde la orden**: `OutputBatchForm` con `fixedOrder`
(hidden `production_order_id` + `return_to=order`; el select de orden
desaparece: «la asociación es automática»). `createOutputBatchAction`
redirige de vuelta al detalle (`?output_created=<id>#salida-<id>`): el
usuario ve el lote creado resaltado, con confirmación y guía hacia la
composición, sin salir del contexto.

**C — 1 orden → N lotes**: sin migración (ya soportado); el detalle lista
todas las salidas con contador y kg; el listado de órdenes muestra el chip
«N lotes producidos / sin lotes producidos».

**D/E — Consumo interno con orígenes distinguidos**: en el detalle, la
sección de consumos separa «Lotes de entrada (externos)» y «Lotes producidos
internos (producto intermedio)», cada fila con su chip de origen; el
formulario interno (`OutputConsumptionForm`) ofrece solo lotes de OTRAS
órdenes (`listConsumableOutputs`, `.neq` + trigger BD); advertencia de
sobre-consumo contra `produced_quantity_kg` (advertir, no bloquear — mismo
criterio que 0025); acciones `addOutputConsumptionAction` /
`deleteOutputConsumptionAction` con `requireActiveOrg` + `checkCprCanMutate`
+ `assertSameOrg` + guarda de estado + manejo de duplicado 23505.

**F — Genealogía multi-salto**: `lib/domain/genealogy.ts` (PURO:
`traceBackward`, `traceForwardFromInput`, `traceForwardFromOutput`, BFS con
visitados y `GENEALOGY_MAX_DEPTH = 10`, marca `truncated`) +
`lib/db/genealogy.ts` (recolector server-only por niveles con `.in()`
acotado a la organización — jamás el universo). La página de genealogía
reconstruye `Proveedor → Lote entrada → Orden A → Lote intermedio → Orden B
→ Lote final` hacia atrás desde un lote producido (con «y después: este lote
se reutilizó…») y hacia adelante desde un lote de entrada. Las vistas 1-salto
de 0026 permanecen intactas (compatibilidad y dossier). Cada salida enlaza
su genealogía desde el detalle de la orden y desde el listado de lotes.

**G — Listado de lotes producidos (decisión documentada)**: se CONSERVA como
consulta, edición, composición y evidencias; se **retira el formulario
general de creación** y en su lugar una tarjeta guía: «Los lotes producidos
se registran desde su Orden / corrida…». Razón: el lote es una SALIDA de la
orden; crearlo desde el eje elimina el paso de reasociar, evita huérfanos
conceptuales y reduce errores — sin perder ninguna capacidad (la edición
sigue permitiendo corregir la orden asociada). Cada fila enlaza su orden
productora y muestra «Consumido después en: OP-x (kg)».

**H — Estados**: sin estados nuevos (draft/in_progress/closed/cancelled de
0025). Guarda server-side `assertOrderAcceptsMutations` en consumo externo,
consumo interno y creación de salida: cerrada → «La orden está cerrada.
Cámbiala a “En proceso”…»; cancelada → «…no admite nuevos consumos ni
salidas.» Los datos históricos no se tocan (sin triggers de BD sobre
estados); reabrir = editar el estado. Cerrada sin salidas → aviso en el
detalle (no bloqueo).

**I — Alerta 72 h**: `lib/domain/production-alerts.ts` con
`PRODUCTION_ORDER_OPEN_ALERT_HOURS = 72` (constante de dominio, sin env
var), edad desde `created_at` (añadido al select de la app; campo ya existía
en BD). Detalle: banner con el mensaje pactado «Esta orden lleva abierta X
días…»; listado: chip ámbar «Abierta hace N días»; dashboard: una línea con
enlace si hay órdenes estancadas (`countStaleOpenOrders`, consulta
head/count). Sin correos, sin cron, sin saturar.

**J — Trazabilidad de proceso**: el detalle expone los datos reales
existentes (variables, pretratamiento, fechas, evidencias); el dossier de
auditoría (`listTraceabilityChain`) incluye ahora los consumos internos de la
orden, etiquetados «Producción interna (OP-x)» con el producto y la fecha de
producción — sin cambios de esquema del dossier.

## 5. Seguridad multiempresa (§16)

Estructural: FK compuestas `(organization_id, id)` en la tabla nueva hacen
imposible el consumo cross-tenant aunque fallara todo lo demás. RLS espejo
de `batch_consumption`. Server actions: `requireActiveOrg` +
`checkCprCanMutate` + `assertSameOrg` sobre cada id recibido + guarda de
estado; borrados acotados por `organization_id`. Genealogía y detalle: toda
consulta lleva `.eq("organization_id", orgId)` con la sesión real
(security_invoker); el detalle responde 404 ante ids ajenos. El anti-
autoconsumo se valida en servidor (mejor mensaje) y en BD (barrera final).

## 6. Suites existentes actualizadas (comportamiento → expectativa)

- `pcr01-ux-flow`: el flujo del punto 14 y las confirmaciones de la orden
  viven ahora en el DETALLE (mismos textos y semántica; nuevas rutas de
  redirect verificadas); `targetHref` de evidencias para la orden apunta al
  detalle; el listado conserva el fijado por `focus`.
- Candados de migración (v1-release ×6, passports-share, t9f2, t9f5b,
  t9f5b1, hint-demo-access): baseline avanzado — autorizan exactamente 0104
  y prohíben 0105+ (misma mecánica documentada de PCR-01/PCR-01.1).

## 7. Archivos

**Nuevos**: `supabase/migrations/0104_…sql`,
`lib/domain/production-alerts.ts`, `lib/domain/genealogy.ts`,
`lib/db/genealogy.ts`,
`app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx`,
`tests/unit/pcr02-{alerts,genealogy,internal-consumption,order-hub}.test.ts`,
y los 5 documentos PCR-02.
**Modificados**: `lib/db/traceability.ts` (created_at + 6 funciones
aditivas), `lib/db/evidences.ts` (href de orden), `lib/db/audit-support.ts`
(dossier), `server/actions/traceability.ts` (guarda + 2 acciones + 3
redirects), `components/domain/traceability/forms.tsx` (fixedOrder +
OutputConsumptionForm), páginas de órdenes (lista), lotes producidos,
genealogía y dashboard, `package.json` (4 scripts + test:all) y las suites
del §6.

## 8. Deuda técnica y recomendaciones

- Selects de opciones (lotes de entrada, lotes consumibles, evidencias)
  cargan el conjunto completo de la empresa: aceptable hoy; candidato a
  búsqueda asíncrona si el volumen crece.
- Ciclos largos entre órdenes no se bloquean en BD (solo autoconsumo
  directo): la genealogía los corta y podría añadirse una advertencia
  visual específica en un sprint futuro.
- La edición del lote producido permanece en el listado; moverla al detalle
  de la orden sería una mejora menor de coherencia.
- El flujo guiado (Sprint 5B) sigue mostrando la cadena de 1 salto: correcto
  y compatible, pero podría enriquecerse con el eslabón interno.
