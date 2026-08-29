# PCR / Textiles · Pre-integración · Migraciones

Cinco migraciones, `0142`–`0146`. Todas **aditivas**: ninguna modifica una fila
existente, ninguna borra nada, ninguna toca una migración histórica.

| # | Qué hace | Escribe datos | Backfill | RLS | Reversible sin pérdida |
|---|---|---|---|---|---|
| `0142` | Catálogo de evidencia, instantánea de aplicabilidad, confirmación | no | **no** | retira la política de `insert` de `evidence_links` | sí |
| `0143` | `unit_code` en las cuatro tablas textiles, candado en la guarda | no | **sí, solo alias inequívocos** | sin cambios | sí |
| `0144` | Contenido reciclado v2, fracción por lote, estado incompleto | fila de metodología v2 | **no** | sin cambios | sí ¹ |
| `0145` | Saldo de materia prima textil | no | no | `security_invoker` heredada | sí |
| `0146` | Movimientos de producto terminado | no | no | políticas nuevas + `DELETE` bloqueado | sí ² |

¹ Mientras no existan cálculos v2. Después, revertir el `NOT NULL` de las
columnas de masa exigiría decidir qué hacer con las filas `incomplete`.
² Mientras nadie haya registrado movimientos. Después, `drop table` los pierde.

---

## 0142 · La evidencia guarda por qué valía

**Por qué.** `guard_evidence_review` borra `reviewed_at`, `reviewed_by` y
`review_comment` al reabrir una evidencia rechazada. La fila no sabe su propia
historia de aprobación, así que no puede responder *«¿estaba aceptada el 15 de
marzo?»*. `audit_log` sí lo sabe —guarda la fila entera— pero un cálculo de
negocio no puede depender de una bitácora de auditoría.

**Qué añade.**

- Índice `evidences_org_type_idx` — la lista filtraba por tipo sin índice.
- Seis columnas nullable en `evidence_links`: `confirmed_at`, `confirmed_by`,
  `reference_date`, `evidence_status_at_confirmation`,
  `evidence_valid_until_at_confirmation`, `applicability_basis`.
- `evidence_target_reference_date(target_type, target_id)` — la fecha
  empresarial del destino; `NULL` para destinos de catálogo.
- `evidence_link_confirm(...)` — la **única** vía de escritura.
- `validate_evidence_link_org()` reescrita: nombra los nueve destinos
  soportados en el mensaje de error.

**Lo que retira.** La política `evidence_links_insert`. Sin eso, la RPC sería
una recomendación: cualquiera con sesión insertaría la fila a mano, sin
confirmar, sin comprobar vigencia y sin instantánea.

**Filas legacy.** Se quedan con `confirmed_at IS NULL` y se leen como
«asociación histórica sin confirmación registrada». Rellenarlas con valores
plausibles sería falsificar el registro.

**Reversión.**
```sql
drop policy if exists evidence_links_insert on public.evidence_links;
create policy evidence_links_insert on public.evidence_links
  for insert to authenticated with check (public.is_org_member(organization_id));
drop function if exists public.evidence_link_confirm(uuid, text, uuid, text, boolean);
drop function if exists public.evidence_target_reference_date(text, uuid);
alter table public.evidence_links
  drop column if exists confirmed_at, drop column if exists confirmed_by,
  drop column if exists reference_date,
  drop column if exists evidence_status_at_confirmation,
  drop column if exists evidence_valid_until_at_confirmation,
  drop column if exists applicability_basis;
drop index if exists public.evidences_org_type_idx;
-- y restaurar validate_evidence_link_org() de 0019.
```

---

## 0143 · La unidad deja de ser una cadena

**Por qué.** `guard_textile_lot_overconsumption` comparaba consumo contra
recibido **solo si las dos cadenas coincidían**; si no, pasaba sin comprobar
nada. La desigualdad de unidades abría la puerta. Y faltaba el `for update` que
su gemela de PCR tiene desde 0105.

**Qué añade.**

- `unit_code text` nullable en `textile_input_lots`,
  `textile_order_consumptions`, `textile_output_lots`,
  `textile_production_orders`, con `CHECK` de nueve códigos.
- `textile_canonical_unit(text)` — espejo SQL del mapa de alias de
  `lib/domain/measurement-units.ts`.
- Guarda reescrita: candado, `errcode = '23514'`, y **rechazo** cuando las
  unidades no son comparables.
- `v_textile_input_lot_balance` agrupa por código canónico.

**Backfill.** Solo alias inequívocos, e idempotente (`where unit_code is null`).
`pares` no entra: un par podrían ser dos unidades o una. El texto original en
`unit` **se conserva siempre**.

**Cambio de comportamiento visible.** Consumos que hoy se aceptan sin validar
pasan a rechazarse mientras la unidad no esté normalizada. Es correcto —un
consumo que nadie puede comparar no debería comprometer un saldo— y no es
transparente. Es la decisión **PT-H04**.

**Reversión.** Restaurar la guarda de 0072 y la vista anterior; luego
`alter table … drop column if exists unit_code` en las cuatro tablas y
`drop function public.textile_canonical_unit(text)`. El backfill no se revierte
porque no destruyó nada.

---

## 0144 · Contenido reciclado v2

**Por qué.** v1 divide entre una composición **tecleada a mano**. El sistema ya
sabe qué se consumió (PT-F10). Y cuenta un material elegible como 100 %
reciclado a partir de una etiqueta binaria (PT-H02).

**Qué añade.**

- `input_batches.recycled_fraction` (0–100) + `recycled_fraction_basis`, con
  `CHECK` que exige la procedencia cuando hay fracción.
- `recycled_content_calculations`: `result_state`, `incomplete_reasons`,
  `methodology_version`; las tres columnas de masa pasan a admitir `NULL`.
- `recycled_calc_state_consistent` — **la garantía**: un `incomplete` no puede
  llevar porcentaje y un `calculated` no puede venir sin él.
- Fila de metodología `RC-6632-15343` **v2**; la v1 pasa a `is_active = false`
  y **sigue existiendo**.
- `calculate_recycled_content_v2(...)`. **v1 no se toca.**
- `v_latest_batch_recycled` gana tres columnas **al final**.

**PT-H05 · La determinación.** Se inspeccionó el esquema antes de escribir:
`batch_consumption` no tiene columna que ate un consumo a un lote de salida;
`batch_composition` es por lote y nada obliga a que dos lotes de la misma orden
declaren lo mismo; `v_traceability_backward` ya atribuye todos los consumos a
cada lote de salida. **Caso B**: la invariancia no está garantizada. Una orden
con varias salidas sale `incomplete`, y el dato que faltaría queda nombrado.

**Un error propio.** La primera versión usaba `drop view … cascade` y se llevó
seis vistas dependientes. Se recuperaron con reejecución limpia y la causa se
eliminó: ahora es `create or replace`, que obliga a conservar el orden de las
columnas y solo permite añadir al final.

**Reversión.** Está escrita en la propia migración, §7. El orden importa: la
metodología v2 solo se puede borrar si no hay cálculos que la referencien.

---

## 0145 · Saldo de materia prima textil

`v_textile_material_inventory`, gemela de `v_material_inventory` (0105) con una
diferencia obligada: **agrupa por (material, unidad)**. Sumar 300 kg con 40 m
daría 340 de nada. Las filas sin unidad normalizada salen aparte y con su texto
original. El saldo negativo se cuenta, no se recorta.

Sin tabla mutable de stock. **Reversión:** `drop view`.

---

## 0146 · Movimientos de producto terminado

**Por qué.** `v_output_batch_inventory` restaba solo el reproceso interno. Un
lote vendido entero figuraba disponible para siempre.

**Qué añade.**

- Tabla `output_batch_movements`: cuatro clases, cantidad siempre positiva,
  `direction`, `occurred_at`, `reason`, `reference`, y el linaje de corrección
  del patrón `quality_measurements`.
- `output_batch_movements_no_delete()` — disparador que bloquea el borrado.
- `output_batch_movement_guard()` — candado `for update`, rechazo por unidad,
  y salida temprana cuando el movimiento no es vigente.
- `correct_output_batch_movement(...)` — corregir en una sola operación.
- `v_output_batch_stock` — el saldo real, `security_invoker`.

**Dos capas contra el borrado**, a propósito: sin política de `DELETE` y con
disparador. Una política se relaja de un `alter`; el disparador obliga a
pensarlo.

**Reversión.** §7 de la migración. La tabla nace vacía: revertir antes de que
nadie registre nada no pierde nada. Después, sí.

---

## Reejecución limpia

`supabase db reset` **no puede** aplicar la 0105: usa `LOCK TABLE`, que exige
estar dentro de una transacción, y el runner del CLI ejecuta sentencia a
sentencia fuera de una. La propia 0105 lo explica y describe el remedio.

```bash
bash scripts/replay-local.sh
```

Dos tramos: el CLI vacía la base y aplica 0001–0104; el script aplica el resto
con `psql --single-transaction`, un fichero por transacción, registrando cada
uno en `supabase_migrations.schema_migrations`.

**Resultado verificado:** cabecera `0146`, 138 migraciones, **0 fallos**, y
`test:all` en verde después.

## El post-check se ejecuta antes

La validación post-migración de este sprint se corrió primero contra la base
local ya en `0146`, y ahí encontró que tres vistas habían perdido su
`security_invoker` al recrearse. `db push` habría dado verde igual.

La regla que salió de eso está en
[POST_CHECK_AS_PREFLIGHT](../../releases/POST_CHECK_AS_PREFLIGHT.md), y el
guion en [qa/POST_MIGRATION_CHECKS.sql](./qa/POST_MIGRATION_CHECKS.sql).

## Listas blancas

Cada migración nueva debe autorizarse en 17 suites que comprueban que no ha
aparecido un fichero que nadie revisó.

```bash
node scripts/authorize-migration.mjs 0147_lo_que_sea
```

El script solo inserta en **entradas puras de lista**. Su primera versión usó
búsqueda de subcadena y metió el nombre dentro de un `assert(...)` que
mencionaba la 0141, convirtiéndolo en una llamada de tres argumentos que
compilaba y no comprobaba nada.

---

## CIERRE · 2026-08-29

**Validación humana P1–P8: PASS.** Blockers 0 · product gaps 0.
Cabecera 0148 · Local 0148 · Staging 0148 · Production 0111 (sin tocar).

El resumen final, las nueve decisiones congeladas y lo diferido están en
[PCR_TEXTILES_PREINTEGRATION_CLOSURE.md](./PCR_TEXTILES_PREINTEGRATION_CLOSURE.md).
