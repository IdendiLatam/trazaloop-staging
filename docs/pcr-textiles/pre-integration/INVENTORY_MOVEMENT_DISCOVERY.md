# Inventory Movement Discovery · movimientos e inventario de producto terminado

**Fecha:** 2026-08-29 · **Alcance:** inspección. Sin implementación, sin esquema, sin 0148.
**Base de la inspección:** código en `HEAD` (`c813d9a`), esquema Local tras reejecución
limpia 0001→0147, y sondas ejecutadas contra Local dentro de transacciones deshechas.

---

## A · La fórmula real del saldo

Está en `v_output_batch_stock` (0146 §6). Literal, no reconstruida:

```
available_kg =   output_batches.produced_quantity_kg
               − Σ output_batch_consumption.mass_kg                        (reproceso interno)
               − Σ movements.quantity  where kind='dispatch'     ∧ dir='out' ∧ is_current
               − Σ movements.quantity  where kind='loss'         ∧ dir='out' ∧ is_current
               − Σ movements.quantity  where kind='internal_use' ∧ dir='out' ∧ is_current
               + Σ (dir='in' ? +quantity : −quantity) where kind='adjustment' ∧ is_current
```

Detalles que la fórmula esconde y hay que decir:

| Cuestión | Respuesta real |
|---|---|
| Término producido | `output_batches.produced_quantity_kg` (NOT NULL desde 0105) |
| Reproceso interno | `output_batch_consumption`, tabla propia, **no** es un movimiento |
| Movimientos corregidos | Excluidos: **todos** los `left join lateral` filtran `is_current` |
| `is_current` | Un movimiento superado no ocupa saldo. También en el guardián: `if not new.is_current then return new;` — sin esa línea, la corrección se rechazaba a sí misma |
| Saldo negativo | **Se calcula, no se recorta.** La vista no tiene `greatest(…, 0)`. Pero la pantalla lo dice «Agotado» (`stockStatement`: `n > 0 ? … : "Agotado"`), así que un saldo negativo **no se ve** |
| Concurrencia | `output_batch_movement_guard` hace `select … from output_batches … for update`: el candado sobre el lote padre serializa sus movimientos. Probado en `C1` de `test:pcr-textiles-02b-rls` |
| Unidades | El guardián **rechaza** cualquier `unit_code <> 'kg'`. PCR mide en kg y no convierte |
| Vista derivada | No hay tabla de existencias. Nada que mantener al día |

## B · Mapa de objetos

| Objeto | Dónde | Escribe | Lee | ¿Inventario? |
|---|---|---|---|---|
| `output_batch_movements` | 0146 §1 | `registerOutputMovementAction`, `correct_output_batch_movement` | `listOutputBatchMovements`, `v_output_batch_stock` | **Sí** |
| `output_batch_movements_no_delete()` + trigger | 0146 §2 | — | — | protege historial |
| `output_batch_movement_guard()` + trigger | 0146 §3 | — | — | **barrera** de sobre-salida |
| `correct_output_batch_movement(uuid,numeric,text,timestamptz)` | 0146 §5 | inserta + supersede | `correctOutputMovementAction` | sí |
| `v_output_batch_stock` | 0146 §6, `security_invoker` | — | `getOutputBatchStock`, `getOutputBatchStockByIds` | **fuente única del saldo real** |
| `v_output_batch_inventory` | 0105, `security_invoker` | — | `getOutputBatchBalance`, `listConsumableOutputs`, `traceability-exercise` | **sí, y en contradicción — ver M-1** |
| `lib/domain/output-movements.ts` | dominio puro | — | acción + componente + pruebas | espejo de la fórmula |
| `components/domain/traceability/output-movements.tsx` | UI | formulario | tabla + plegado de corregidos | sí |
| Exportaciones / PDF | — | — | — | **ninguna**: ni un solo adaptador lee stock ni movimientos |

**RLS.** `select` a miembros; `insert`/`update` a `admin`/`quality`/`consultant`; `delete` **sin política** *y* bloqueado por disparador — dos capas a propósito. Aislamiento entre empresas probado en `C2`.

## C · Cada tipo de movimiento

| Tipo | ¿Siempre resta? | ¿Puede sumar hoy? | Qué representa | Motivo obligatorio |
|---|---|---|---|---|
| **Despacho / entrega** | Sí | **No** — lo impide `output_batch_movements_direction_kind` | Salida física de la empresa. **Inventario físico**, no trazabilidad comercial: no hay cliente, pedido ni factura; `reference` es texto libre | No |
| **Uso interno** | Sí | No | Consumo dentro de la empresa que **no** es reproceso de producción (muestras, ensayos, exhibición). No hay camino de retorno modelado | No |
| **Merma / descarte** | Sí | No | Pérdida física. **Matemáticamente idéntica al despacho**: resta lo mismo. La diferencia es enteramente causal — y es la que permite responder «¿cuánto se perdió?» sin confundirlo con «¿cuánto se vendió?» | **Sí** |
| **Ajuste por recuento** | No | **Sí**, el único | Ver D | **Sí** |

## D · Qué significa hoy «Ajuste por recuento»

**Semántica A: sumar o restar una cantidad de ajuste.** No es un conteo físico.

El usuario teclea la **diferencia**, no lo que encontró. El sistema no conoce el
conteo real, no lo guarda y no lo deriva.

Sondas ejecutadas (produced 100, despacho 40, uso interno 10, merma 5):

| Paso | Movimiento | Saldo resultante |
|---|---|---|
| base | — | 45 |
| Caso D | `adjustment / out / 3` | **42** |
| Caso E | `adjustment / in / 3` | **45** |

Para el caso D del brief —«el sistema dice 100, el conteo encuentra 97»— el usuario
debe calcular 100 − 97 = 3 **de cabeza** y registrar `out 3`. Si el saldo teórico no
era 100 sino 97,4 porque hubo una merma que no recordaba, el ajuste queda mal y nada
lo detecta.

## E · El campo «Sentido»

**No aporta información en tres de los cuatro tipos.** El sentido está determinado
por la naturaleza del movimiento y la base ya lo sabe:

```sql
constraint output_batch_movements_direction_kind check (
  direction = 'out' or movement_kind = 'adjustment')
```

Respondiendo una a una:

1. ¿Despacho puede sumar? **No.** Rechazado por CHECK.
2. ¿Uso interno? **No.**
3. ¿Merma? **No.**
4. ¿Solo el ajuste necesita ambas? **Sí**, es el único.
5. ¿La base permite combinaciones absurdas? **No.** Están prohibidas en el esquema.
6. ¿Hay CHECK? **Sí**, el citado. Y triple defensa: CHECK + `kindAllowsIncoming()` en el dominio + validación en la acción de servidor.
7. ¿Hay pruebas? **Sí**: `A6` en `test:pcr-textiles-02b-rls` (despacho `in` rechazado con el nombre del CHECK) y `A3` en la unitaria.

**Veredicto:** no hay MODEL GAP — el modelo es correcto. Hay **UX GAP**: la pantalla
muestra un selector de tres opciones efectivas (uno deshabilitado) para un dato que
solo tiene sentido en 1 de 4 casos. El `<select disabled>` ni siquiera se envía; el
servidor cae en `"out"` por defecto. Es un campo que la persona lee, evalúa y no usa.

## F · Corrección

`correct_output_batch_movement` en **una** transacción: marca el original
`is_current = false`, **inserta** uno nuevo con `corrects_movement_id` y
`correction_reason`, y apunta el viejo a su corrección con `superseded_by_movement_id`.
Nada se edita, nada se borra. Es el patrón ya probado de `quality_measurements`.

Sonda (despacho de 40 tecleado por error, corregido a 4): saldo 60 → **96**. ✔

El usuario ve: la fila corregida en la tabla vigente con la etiqueta «corrección», y
las originales plegadas en un `<details>` que dice «N movimiento(s) corregido(s) — se
conservan».

**Pero un despacho que nunca ocurrió no se puede anular.** `quantity > 0` es un CHECK,
y la RPC no acepta 0. Sonda: rechazado por `output_batch_movements_quantity_positive`.
Lo máximo es corregirlo a 0,0001 kg, que es una mentira pequeña en lugar de una
corrección. **GAP.**

## G · Sobre-salida

Sonda: despachar 110 de 100 → rechazado, con el desglose entero en el mensaje:

> El movimiento supera lo disponible del lote. Disponible: 100 kg (producido 100 − reproceso interno 0 − salidas 0).

La acción de servidor además avisa antes de llegar a la base. La barrera real es el
disparador, con `FOR UPDATE`.

**Con una excepción: el ajuste `in` no tiene techo.** El guardián retorna antes:

```sql
if new.direction = 'in' then return new; end if;
```

Sonda: `adjustment / in / 10000` sobre un lote de 100 kg → **aceptado**, saldo 10 045 kg.
Sin límite, sin evidencia, solo un motivo de texto libre. **GAP.**

## H · Nombre de la sección

Hoy: **«Salidas físicas del lote»**. Es insuficiente y ya lo es *hoy*, no en un futuro
hipotético: un ajuste puede sumar, y una corrección puede revertir. Llamar «salida» a
un movimiento que suma es incorrecto en el propio modelo.

| Candidato | Veredicto |
|---|---|
| A · Salidas físicas del lote | Falso para `adjustment in`. Descartado |
| B · **Movimientos del lote** | **Recomendado.** Correcto para los cinco casos (cuatro tipos + corrección), corto, y «del lote» ancla el alcance: esto no es el inventario de la planta, es lo que le pasó a *este* lote |
| C · Movimientos de inventario | Promete un módulo de inventario que no existe |
| D · Movimientos de producto | «Producto» es una entidad del catálogo; esto es del **lote** |
| E · Existencias del lote | Nombra el resultado, no el registro. Sirve para el encabezado del saldo, no para la sección donde se registra |

## I · UX objetivo

La propuesta del brief es correcta: **ocultar «Sentido»** en despacho, uso interno y
merma, donde no aporta nada.

Para el ajuste, comparación de las dos alternativas:

| Criterio | ALT 1 · Ajustar `+X / −X` | ALT 2 · Conteo físico «encontré X kg» |
|---|---|---|
| Claridad | El usuario calcula la diferencia de cabeza | Teclea lo que **midió**. No calcula |
| Errores humanos | Alto: exige conocer el saldo teórico exacto, con decimales | Bajo: el sistema deriva `ajuste = conteo − saldo_teórico` |
| Auditabilidad | Se guarda la diferencia; el conteo real **se pierde** | Se guarda el conteo, el saldo teórico del momento y la diferencia derivada |
| Historical Truth | Débil: si mañana se corrige un despacho anterior, el ajuste viejo queda huérfano de su base | **Fuerte**, si se congela `saldo_teórico` como instantánea, igual que 0142 congeló el snapshot de aplicabilidad de la evidencia |
| Inventario | Igual | Igual |
| Coste | Ninguno | Dos columnas nuevas (`counted_quantity`, `theoretical_quantity_at_count`) → **migración** |

**Recomendación: ALT 2**, y es la única razón que justificaría tocar el esquema. Un
conteo físico es un hecho medido; la diferencia es una derivada. Guardar la derivada y
tirar el hecho es exactamente el error que este repositorio ya corrigió dos veces —
`data_state`/`value` en las mediciones de calidad, y `recycled_fraction` frente a la
etiqueta binaria.

## J · Inventario por lote

Cubierto. La lista de lotes producidos muestra producido, reproceso interno, salidas
agregadas y disponible, y distingue «sin salidas registradas» de «disponible».

**Salvo dos defectos de presentación:**
- La línea muestra `Producido · Reproceso · Salidas · Disponible`, pero **`Salidas` no incluye los ajustes**. Con un ajuste registrado, la aritmética visible **no cuadra**.
- Un saldo **negativo** se presenta como «Agotado». La anomalía se esconde justo donde habría que verla — y el módulo Textiles hace lo contrario: cuenta y enseña los saldos negativos (`lots_negative`).

## K · Inventario de producto terminado por producto / organización

**No existe.** Ni vista agregada, ni pantalla, ni entrada de menú, ni exportación.

`v_output_batch_stock` **ya trae** `product_id`, `product_code` y `product_name`: la
agregación por producto es una vista de una sola sentencia sobre ella. Lo que falta es
la vista, la pantalla y el enlace.

## L · Inventario de materia prima

| Módulo | Vista | Pantalla | Menú |
|---|---|---|---|
| PCR | `v_material_inventory` sobre `v_input_batch_inventory` (recibido − consumido) | `MaterialInventorySection` **embebida** en `/traceability/input-batches` | **No** tiene entrada propia |
| Textiles | `v_textile_material_inventory`, agrupada por `(item, unidad)` | `/textiles/traceability/inventory` | **Sí**: «Saldo de materia prima» |

Es decir: **MP está cubierta** en los dos módulos, con una asimetría de
descubribilidad (en PCR hay que saber que está dentro de otra pantalla).

## M · Gaps

| # | Gap | Gravedad | Prueba |
|---|---|---|---|
| **M-1** | **Doble salida.** El reproceso interno se valida contra `v_output_batch_inventory` (0105), que **ignora** los movimientos. Sonda: despachar 100 de 100 y después reprocesar 100 → **aceptado**, saldo **−100 kg**. El selector `listConsumableOutputs` ofrece además ese lote con «Disponible: 100 kg» | **Alta** | Sonda directa. Ninguna prueba lo cubre: `A3` prueba la dirección contraria |
| **M-2** | **Ajuste `in` sin techo.** 10 000 kg sobre un lote de 100. Solo motivo de texto libre | **Alta** | Sonda directa |
| **M-3** | **No se puede anular** un movimiento erróneo: `quantity > 0` | Media | Sonda directa |
| **M-4** | Saldo negativo presentado como «Agotado» | Media | Lectura de `stockStatement` |
| **M-5** | La línea de saldo del listado omite los ajustes: la aritmética visible no cuadra | Baja | Lectura de la página |
| **M-6** | «Sentido» visible en 4 de 4 tipos siendo útil en 1 | Baja (UX) | Lectura del componente |
| **M-7** | «Salidas físicas» es un nombre falso para `adjustment in` y para las correcciones | Baja (UX) | — |
| **M-8** | Sin inventario de producto terminado por producto ni por organización | Media (funcional) | Ausencia de vista y pantalla |
| **M-9** | La sección de movimientos vive dentro del bloque anclado en `#composicion-<id>`, junto al histórico de composición | Baja (UX) | Lectura de la página |
| **M-10** | Ni una sola exportación incluye el saldo o los movimientos | Baja | Ausencia en `lib/export` |

## N · ¿Migración?

**Depende de hasta dónde se quiera llegar. Tres escalones:**

1. **Sin migración.** M-4 a M-7 y M-9 son código y presentación. El nombre, ocultar el sentido, mostrar el saldo negativo, cuadrar la aritmética y sacar los movimientos del bloque de composición: todo eso es UI.
2. **Sin migración, pero con cambio de lectura.** M-1 se cierra apuntando la guarda y el selector de reproceso a `v_output_batch_stock`… **salvo la mitad de la base**: `output_batch_consumption_total_balance_guard` es un disparador y compara contra `produced − otros consumos internos`. Cerrarlo de verdad **sí exige migración**.
3. **Con migración.** M-1 (guarda de la base), M-2 (techo del ajuste), M-3 (anulación) y la ALT 2 del conteo físico.

**Respuesta corta: sí, pero no todavía.** M-1 y M-2 son defectos de integridad y
justifican una 0148 por sí solos. Si además se adopta la ALT 2, cabe todo en la misma
migración en vez de en dos.

## O · Recomendación

**OPTION C · ajuste pequeño de esquema para hacer imposible lo que hoy es posible**, y
en dos entregas separadas para no mezclar corrección con rediseño:

**Entrega 1 — solo código, sin esquema.** Renombrar la sección a «Movimientos del
lote»; retirar «Sentido» de los tres tipos donde no aplica y sustituirlo, en el ajuste,
por dos botones explícitos («Sobra material» / «Falta material»); incluir los ajustes en
la línea de saldo; enseñar el saldo negativo como anomalía en lugar de «Agotado»; y
separar los movimientos del bloque de composición, con ancla propia.

**Entrega 2 — 0148, con tres cosas y ninguna más:**
1. `output_batch_consumption_total_balance_guard` pasa a comparar contra el saldo real, movimientos incluidos (**M-1**), y `listConsumableOutputs` pasa a `v_output_batch_stock`.
2. Techo al ajuste `in`: un ajuste no puede dejar el saldo por encima de lo producido sin una razón registrada — o, con la ALT 2, no puede haber conteo mayor que lo producido menos lo ya salido (**M-2**).
3. `counted_quantity` y `theoretical_quantity_at_count` para el ajuste por conteo físico (**ALT 2**), con la diferencia derivada.

**Lo que NO recomiendo:** OPTION D. El modelo es correcto — cuatro tipos, cantidad
siempre positiva, sentido restringido por CHECK, corrección sin destrucción, candado de
concurrencia, unidades sin conversión. Lo que falla es una guarda que mira la vista
equivocada, un techo que falta y una pantalla que enseña un campo que casi nunca aplica.

**M-8** (inventario por producto) es una funcionalidad ausente, no un defecto, y merece
su propio encargo: una vista agregada sobre `v_output_batch_stock`, una pantalla y una
entrada de menú simétrica a «Saldo de materia prima» de Textiles.

## P · Interacción con P4

Ninguna, y conviene dejarlo escrito. El cálculo de contenido reciclado sale de
`batch_consumption` (los consumos de la **orden**) y de `input_batches.recycled_fraction`.
`calculate_recycled_content_v2` **no lee** `output_batch_movements` ni
`v_output_batch_stock`: despachar, perder o ajustar un lote no cambia ni un decimal de
su porcentaje, y así debe ser — el contenido reciclado es una propiedad de lo que entró
a fabricarlo, no de lo que quedó en el almacén.

Que ambas cosas compartan hoy el mismo bloque desplegable (**M-9**) es un accidente de
implantación, no una dependencia. P4 es correcto con independencia de lo que se decida
aquí.

## Q · Condición de «sin usuarios reales»

Confirmada por producto y coherente con lo verificado en la consolidación de 0147: las
190 organizaciones de Staging son fixtures de QA y Production sigue en 0111 sin haber
recibido 0142–0146. `output_batch_movements` **nació vacía** y sigue vacía en ambos
entornos.

Clasificación pedida:

- **LEGACY DATA NECESSARY:** nada. No hay un solo movimiento registrado por nadie.
- **PRE-RELEASE IMPLEMENTATION ACCIDENT:** el campo «Sentido» visible en los cuatro
  tipos, el nombre «Salidas físicas», la guarda de reproceso mirando la vista de 0105 y
  el ajuste `in` sin techo.

Las migraciones históricas siguen siendo append-only, y Production sigue protegida.
Corregir esto ahora no cuesta compatibilidad con nadie.

---

## CIERRE · 2026-08-29

**Validación humana P1–P8: PASS.** Blockers 0 · product gaps 0.
Cabecera 0148 · Local 0148 · Staging 0148 · Production 0111 (sin tocar).

El resumen final, las nueve decisiones congeladas y lo diferido están en
[PCR_TEXTILES_PREINTEGRATION_CLOSURE.md](./PCR_TEXTILES_PREINTEGRATION_CLOSURE.md).
