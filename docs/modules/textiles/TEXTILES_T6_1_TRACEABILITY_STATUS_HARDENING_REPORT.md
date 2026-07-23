# Trazaloop Textil — Sprint T6.1 · Hardening de estado de trazabilidad y recálculo operativo

**Fecha:** Julio 2026 · **Base:** Sprint T6 (órdenes/lotes/trazabilidad, 0078)

---

## 1. Problema identificado

`textile_output_lots.traceability_status` (0078) era editable por UPDATE
directo vía API por cualquier rol con permiso de escritura: se podía fijar
`complete` con brechas reales. Además, el recálculo persistido vivía en las
server actions (TypeScript): cualquier cambio hecho por API directa —o por
rutas no cubiertas— dejaba el estado desactualizado (p. ej. bajar
`quantity_received` de un lote ya consumido no tocaba el `complete`
persistido).

## 2. Qué se endureció — migración `0079_textile_traceability_status_hardening.sql` (única)

**Protección**: `protect_textile_output_lot_traceability_status` (BEFORE
UPDATE, `IS DISTINCT FROM`) bloquea todo cambio directo del campo salvo
bajo el flag transaccional interno
`trazaloop.textile_traceability_recalculate = 'on'`, que SOLO fija la
función de refresco (con `set_config(..., true)` — **local a la
transacción**, desaparece al terminar). Mensaje del encargo: *"El estado de
trazabilidad de un lote producido no puede modificarse directamente. Debe
recalcularse desde sus datos operativos."*

**Cálculo en BD**: `calculate_textile_output_lot_traceability_status(uuid)`
replica exactamente el dominio T6: `not_started` (orden sin consumos NI
procesos), `needs_review` (≥1 brecha), `complete` (≥1 consumo sin brechas;
referencia y cantidad > 0 garantizadas por FKs/checks), `incomplete`
(resto). Brechas evaluadas: sobreconsumo por unidad del lote (sin
conversión), lote consumido sin proveedor, consumo con unidad no
comparable, brechas de evidencia de la referencia (recicladas/orgánicas sin
soporte y composición sin `composition_support`, vinculado a la referencia
o sus fibras — espejo de T5) y tercerizados sin soporte de ejecución. Los
criterios adicionales sugeridos en §6 (evidencias rechazadas como soporte
principal, relaciones archivadas/inactivas) quedan documentados para un
sprint futuro: añadirlos solo en SQL divergiría del estado vivo del
dominio TS.

**Refresco controlado**:
`refresh_textile_output_lot_traceability_status(uuid)` (única vía de
escritura: calcula → flag on → update si cambió → flag off) y
`refresh_textile_order_output_lots_traceability(uuid)` (todos los lotes de
una orden). Ambas `security definer` con `search_path = public` y execute
**revocado** (solo triggers internos y la RPC).

**RPC manual**: `recalculate_textile_output_lot_traceability(uuid)` —
única función concedida a `authenticated`; valida `auth.uid()`, membresía
(`is_org_member`) y **módulo habilitado**
(`organization_modules.module_code = 'textiles' and enabled`); retorna el
estado recalculado. El cliente jamás envía el estado.

**Triggers de recálculo operativo (AFTER, sin recursión)**:

| Tabla | Dispara | Recalcula |
|---|---|---|
| `textile_order_consumptions` | insert/update/delete | lotes finales de la orden (y de la orden anterior si el consumo cambió de orden) |
| `textile_order_process_steps` | insert/update/delete | ídem |
| `textile_output_lots` | insert; update de order_id/quantity_produced/status/is_active | el propio lote (el INSERT también pisa cualquier estado enviado por el cliente); ignora los updates cuyo cambio es solo `traceability_status` → **sin recursión** |
| `textile_production_orders` | update de reference_id/status/produced_quantity/is_active | lotes finales de la orden |
| `textile_input_lots` | update de quantity_received/unit/supplier_id/material_id/component_id/lot_type/status/is_active | lotes finales de TODAS las órdenes que consumen el lote — cubre el **sobreconsumo posterior** |
| `textile_evidence_links` | insert/delete | según entidad: output_lot directo; production_order; order_consumption y order_process_step (vía su orden); input_lot (órdenes que lo consumen); reference y fiber_composition (órdenes de la referencia) |

**Casos sin recálculo automático (documentados en la migración)**: vínculos
a material/component/reference_material/reference_component y a entidades
de catálogo no afectan las brechas calculadas y no disparan; ediciones de
la composición de fibras (T4) tampoco disparan por sí mismas — el botón
manual y cualquier mutación operativa posterior los cubren.

## 3. Cambios de código

| Archivo | Cambio |
|---|---|
| `server/actions/textiles-traceability.ts` | Se **retiró** `recalcOrderTraceability` y sus llamadas (su UPDATE directo del campo quedaría bloqueado; la BD recalcula ahora) + nueva `recalculateTextileOutputLotTraceabilityAction` (gate + pertenencia + RPC) |
| `lib/db/textiles-traceability.ts` | El evaluador vivo pasa SOLO los vínculos de referencia/fibras a `computeReferenceEvidenceGaps` — espejo exacto del SQL (antes un `composition_support` colgado de la orden "cubría" la composición en vivo pero no en BD); `getTextileOutputLot` expone `updatedAt` |
| `components/domain/textiles/recalculate-traceability-button.tsx` | Botón discreto "Recalcular estado" (solo dispara la RPC; jamás elige estado) |
| `…/output-lots/[id]/page.tsx` | Botón + nota prudente ("El estado de trazabilidad se calcula a partir de la orden, consumos, procesos, evidencias y relaciones registradas. No equivale a certificación ni validación externa.") + fecha de última actualización |
| Tests | Suite T6 check 1 → rango propio (misma deriva de pins, sexta corrección, comentada); test de módulo → lista 0070–0079 |

## 4. Validación manual (casos del encargo §15)

1. **Bloqueo directo**: `update textile_output_lots set traceability_status
   = 'complete' where id = '<id>';` → falla con el mensaje del trigger (en
   cualquier estado del lote y también con service key: los triggers no se
   saltan con service_role).
2. **Recálculo por consumo**: crear orden + lote + consumo + lote final →
   estado calculado por el trigger de INSERT; editar el consumo → el estado
   persistido se refresca sin intervención de la app.
3. **Sobreconsumo posterior**: lote con 100 m, consumo de 80, lote final
   `complete` → bajar `quantity_received` a 50 → el trigger de lotes de
   entrada recalcula → `needs_review` con brecha de sobreconsumo.
4. **Procesos**: añadir/completar/eliminar un paso recalcula (un
   tercerizado sin soporte añade brecha).
5. **Evidencias**: vincular una evidencia al lote final, la orden, el lote
   de entrada, un paso o la referencia recalcula; eliminar el vínculo
   también.
6. **Botón manual**: en el detalle del lote final, "Recalcular estado"
   refresca sin permitir elegir el valor.

## 5. Verificación

| Comando | Resultado |
|---|---|
| `typecheck` / `lint` / `build` | ✅ |
| `test:platform` · `test:plans` · `test:launch` · `test:compliance` | ✅ |
| Suites textiles previas (module, scoring, hardening T2.1, catálogos, productos 21, evidencias 21, hardening T5.1 13, inmutabilidad 11, trazabilidad 22) | ✅ |
| **Nueva** `tests/traceability/textiles-traceability-hardening.test.ts` | ✅ 14 checks (los 24 puntos del §14) |
| `test:smoke` | ⚠️ requiere `.env.local` (ambiental, igual que siempre) |

## 6. Riesgos restantes y limitaciones

- Cada mutación operativa dispara un recálculo completo por orden (varias
  subconsultas); a la escala actual es despreciable, pero con miles de
  consumos por orden convendría un recálculo diferido.
- Ediciones de composición de fibras (T4) no disparan recálculo automático
  (documentado); el estado vivo de las páginas sí las refleja y el botón
  manual sincroniza el persistido.
- La vista de resumen muestra el campo persistido; tras 0079 se mantiene
  sincronizado por triggers, y el detalle sigue calculando en vivo (ambos
  con las mismas reglas tras la alineación del evaluador).
- Los criterios ampliados del §6 (rechazadas como soporte, relaciones
  archivadas) quedan para un sprint futuro, en TS y SQL a la vez.

## 7. Qué quedó fuera (confirmaciones)

Sin circularidad ✔ · sin TrazaDocs Textil ✔ · sin pasaporte técnico ✔ · sin
QR/blockchain/IA/ACV/huella ✔ · sin planes por módulo ✔ · sin imports/PDF ✔ ·
**CPR sin cambios funcionales** (0079 solo crea funciones/triggers sobre
tablas `textile_*`; verificado por test) ✔ · **Textil sigue privado** tras
flag + `organization_modules.module_code='textiles'` (sin `module_key` ni
`enabled_by`) ✔.
