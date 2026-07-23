# Trazaloop Textil — Sprint T6 · Órdenes, lotes y trazabilidad

**Fecha:** Julio 2026 · **Base:** Sprint T5.2 (inmutabilidad de archivos, 0077)

---

## 1. Qué se implementó

La capa de trazabilidad TÉCNICA operativa del módulo Textil: una empresa de
confección registra órdenes/corridas asociadas a una referencia/SKU, lotes
de entrada de materiales y avíos (con proveedor y saldo), consumos de esos
lotes por orden (con bloqueo de sobreconsumo cuando es comparable),
procesos internos/tercerizados por orden, lotes producidos/finales y
evidencias vinculadas a toda la cadena — con estado de trazabilidad y
brechas simples. Responde: qué referencia se produjo, en qué orden, qué
materiales/avíos se consumieron, de qué proveedores, con qué soportes, qué
lote final se generó y qué brechas quedan. NO es un ERP: sin costos,
compras, facturación, MRP, bodegas ni kardex.

## 2. Migración — `0078_textile_orders_lots_traceability.sql` (única)

**Tablas (5)**, todas con `unique(org, código)` donde aplica,
`unique(org, id)` para FKs compuestas, triggers `set_updated_at` /
`force_created_by` / `prevent_organization_id_change` / `audit_row_change`,
y RLS:

| Tabla | Clave | Restricciones principales |
|---|---|---|
| `textile_production_orders` | `order_code` | FK compuesta a `textile_references` (NOT NULL); planeado > 0 y producido ≥ 0 si existen; estados draft/in_progress/completed/cancelled/archived |
| `textile_input_lots` | `lot_code` | **XOR** material/componente según `lot_type`; FKs compuestas a materiales/componentes/proveedores; recibido > 0 si existe; estados available/partially_consumed/consumed/blocked/archived |
| `textile_order_consumptions` | — | FKs compuestas a orden (cascade) y lote; consumido > 0 NOT NULL; unidad NOT NULL; 9 roles de consumo |
| `textile_order_process_steps` | — | **XOR** proceso interno/tercerizado contra los catálogos T3; FK a proveedor opcional; estados pending/in_progress/completed/skipped/blocked |
| `textile_output_lots` | `output_lot_code` | FK compuesta a orden (NOT NULL — no hay lote final sin orden); producido > 0; `traceability_status` con CHECK de 4 valores |

**RLS** (patrón CPR 0025 + endurecimiento T5.1): select miembros; insert y
update **admin/quality/consultant**; delete de maestros admin/quality;
delete de consumos/procesos admin/quality/consultant (precedente T4).

**Sobreconsumo — decisión D-T6-01**: el trigger
`guard_textile_lot_overconsumption` (security definer, BEFORE INSERT OR
UPDATE) **bloquea** el consumo cuando es comparable: el lote declaró
`quantity_received` y la unidad coincide (case-insensitive); solo suman los
consumos de la misma unidad y el UPDATE excluye la propia fila. También
re-verifica que el lote sea de la misma organización. Si las unidades
difieren o el lote no declaró cantidad, **no hay conversión automática**
(fuera de alcance): se permite y el dominio lo marca como brecha
(`needs_review`). La action traduce el error del trigger a un mensaje claro.

**Vistas** (patrón 0026, `security_invoker`):
`v_textile_input_lot_balance` (recibido, consumido en la misma unidad,
saldo, y conteo de consumos en otra unidad) y
`v_textile_output_lot_traceability_summary` (lote final + orden +
referencia + producto + conteos de lotes/materiales/componentes
consumidos, pasos completados y vínculos de evidencia directos al lote y a
su orden).

**Extensión de vínculos de evidencias (encargo §10)**: los CHECK de
`textile_evidence_links` se reemplazan por **superconjuntos** (16
entity_type: +production_order, input_lot, order_consumption,
order_process_step, output_lot; 17 link_type: +production_order_support,
input_lot_support, consumption_support, process_execution_support,
output_lot_support — traceability_support ya existía). El trigger
polimórfico `validate_textile_evidence_link_org` se amplió a 16 ramas; la
validación cross-tenant sigue idéntica y ningún vínculo anterior pierde
validez.

## 3. Archivos creados / modificados

**Creados**: la migración; `lib/domain/textiles-traceability.ts` (enums +
labels, disclaimer, `parseQuantity`, `computeInputLotBalance`,
`computeTraceabilityStatus`); `lib/db/textiles-traceability.ts` (listados
con joins, balance desde la vista, `getOrderTraceabilityEvaluation`);
`server/actions/textiles-traceability.ts` (18 actions);
`tests/traceability/textiles-traceability.test.ts`; y 6 páginas:
`/textiles/traceability` (hub con 4 tarjetas y conteos), `…/orders`
(listado + filtro por estado + creación), `…/orders/[id]` (detalle
completo), `…/input-lots` (gestor con saldo), `…/output-lots` (listado) y
`…/output-lots/[id]` (vista de trazabilidad técnica).

**Modificados**: `lib/domain/textiles-evidences.ts` y
`lib/db/textiles-evidences.ts` (+5 entidades con etiquetas, resolución y
selector — `order_consumption` es vinculable por BD/actions pero sin
selector propio, como `reference_material`); `/textiles/references/[id]`
(tarjeta de órdenes y lotes finales asociados); shell `/textiles` (quinta
tarjeta "Trazabilidad textil" Disponible); `lib/modules/textiles.ts`
(secciones futuras → 3); `package.json` (script encadenado); y checks
puntuales de suites anteriores (ver §7).

## 4. Cómo funciona

**Trazabilidad**: la orden ancla la cadena (referencia obligatoria por FK
compuesta). Consumos y procesos se registran en su detalle con los gestores
de asociación de T4; los lotes finales nacen desde la orden. El estado se
calcula con dominio puro (`computeTraceabilityStatus`): `not_started` (sin
orden o sin consumos NI procesos), `needs_review` (cualquier brecha:
sobreconsumo, lote sin proveedor, unidades no comparables, brechas de
evidencia de la referencia (T5), tercerizados sin soporte de ejecución),
`complete` (orden + referencia + ≥1 consumo + lote final, sin brechas) e
`incomplete` (resto). El servidor lo **persiste** en los lotes finales tras
cada mutación relevante y las páginas lo recalculan **en vivo**; nunca
bloquea — lista brechas con mensajes.

**Balance de lote**: `computeInputLotBalance` y la vista suman SOLO los
consumos en la unidad del lote (los de otra unidad se cuentan aparte, sin
conversión); el estado derivado available/partially_consumed/consumed se
actualiza en servidor y **nunca pisa** blocked/archived.

**Evidencias**: desde `/textiles/evidences/[id]` se vinculan a órdenes,
lotes de entrada, procesos y lotes finales (selector) — el trigger valida
que la entidad exista y sea de la misma organización; el detalle de orden y
de lote final muestran todas las evidencias de la cadena (orden, referencia
y fibras, consumos, lotes de entrada, pasos y lotes finales).

## 5. Activación (sin cambios)

`TEXTILES_MODULE_ENABLED=true` + migraciones 0070–0078 + habilitar la
organización usando **`organization_modules.module_code`** (la tabla real
no tiene `module_key` ni `enabled_by`):

```sql
insert into organization_modules (organization_id, module_code, enabled)
values ('<org>', 'textiles', true)
on conflict (organization_id, module_code) do update set enabled = true;
```

Toda ruta y action sigue tras la triple guarda (flag + organización activa
+ módulo habilitado). El módulo NO se activó públicamente.

## 6. Validación manual (casos del encargo §17)

1. **Orden**: crear referencia (T4) → crear orden en `…/orders` asociándola
   → aparece en el listado con SKU y estado.
2. **Lote de entrada**: crear material (T3) → crear lote en `…/input-lots`
   → el saldo inicial = cantidad recibida.
3. **Consumo**: en el detalle de la orden, añadir consumo del lote → el
   saldo baja (y el estado del lote pasa a parcialmente consumido);
   intentar consumir más que el saldo **en la misma unidad** → error
   "Sobreconsumo bloqueado…" (decisión: bloqueo si comparable; unidades
   distintas → brecha needs_review, documentado en §2).
4. **Lote final**: crearlo desde la orden → su detalle muestra referencia,
   producto, materiales, componentes, procesos y estado de trazabilidad.
5. **Evidencia**: crear evidencia (T5) → vincularla a la orden o al lote →
   aparece en la trazabilidad; un vínculo con `entity_id` de otra
   organización falla en el trigger ("entre empresas bloqueado").
6. **Acceso**: usuarios de otra organización no ven órdenes/lotes (RLS) y
   sin módulo habilitado no llegan a la ruta (guard).

## 7. Resultados de tests

| Comando | Resultado |
|---|---|
| `typecheck` / `lint` / `build` (6 rutas ƒ nuevas) | ✅ |
| `test:platform` · `test:plans` · `test:launch` · `test:compliance` | ✅ |
| Suites textiles previas (module, scoring, hardening T2.1, catálogos, productos 21, evidencias 21, hardening T5.1 13, inmutabilidad 11) | ✅ |
| **Nueva** `tests/traceability/textiles-traceability.test.ts` | ✅ 22 checks (los 30 puntos del §16) |
| `test:smoke` | ⚠️ requiere `.env.local` (ambiental, igual que siempre) |

Ajustes justificados a suites existentes: el check 11 de la suite T5 fijaba
las longitudes 11/12 de los catálogos de vínculos — T6 §10 los amplía; ahora
fija los 11/12 originales en 0075 y los totales exactos 16/17. El check 1
de la suite T5.2 tenía la misma deriva de pins ya corregida en
T2.1/T4/T5/T5.1 (fijaba "todo lo posterior a 0076") y se ajustó a su rango
propio. El test de módulo agrega 0078 a la lista exacta, quita trazabilidad
de las secciones futuras y suma `traceability` al shell. Todo comentado en
el código.

## 8. Riesgos y limitaciones conocidas

- `v_textile_output_lot_traceability_summary` puede repetir filas por el
  join de evidencias (lote + orden); `listTextileOutputLots` deduplica por
  id sumando conteos — documentado en el código.
- Sin conversión de unidades (decisión): la consistencia m/kg/units/rollos
  es responsabilidad del usuario; las brechas la señalan.
- El recálculo de estado (lote de entrada + trazabilidad) ocurre tras la
  mutación, no en la misma transacción; el detalle recalcula en vivo, así
  que un fallo intermedio solo dejaría el campo persistido desactualizado
  hasta la siguiente mutación o carga.
- El contador de evidencias de la vista suma solo vínculos directos al lote
  final y a su orden; la evidencia de consumos/pasos/lotes de entrada se ve
  en el detalle (documentado en la vista).
- `produced_quantity` de la orden es declarativa; no se reconcilia contra
  los lotes finales (kardex fuera de alcance).

## 9. Qué quedó fuera (confirmaciones)

Sin circularidad completa ✔ · sin TrazaDocs Textil ✔ · sin pasaporte
técnico ✔ · sin QR/blockchain/IA/ACV/huella ✔ · sin planes por módulo ni
`organization_module_access`/`_subscriptions` ✔ · sin imports CSV ni PDF ✔ ·
sin costos/compras/facturación/MRP/bodegas/kardex ✔ · **CPR sin cambios
funcionales** (las tablas CPR de trazabilidad, sus vistas y actions siguen
intactas — verificado por test; 0078 solo toca objetos `textile_*`) ✔ ·
**Textil sigue privado** ✔.

Listo para T7 — Evaluación de circularidad.


---

## 10. Hardening posterior (T6.1)

Ver `TEXTILES_T6_1_TRACEABILITY_STATUS_HARDENING_REPORT.md` (migración
0079): `traceability_status` quedó protegido contra UPDATE directo (trigger
con flag transaccional interno) y el recálculo se movió a la base de datos
— triggers AFTER sobre consumos, procesos, lotes finales, órdenes, lotes de
entrada y vínculos de evidencias, más RPC y botón de recálculo manual. El
riesgo de recálculo no transaccional señalado en §8 quedó resuelto: el
refresco ocurre en la misma transacción de la mutación.
