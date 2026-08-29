# PT-02B.1 · Semántica e integridad del inventario

**Migración:** `0148_inventory_movement_hardening.sql`
**Origen:** `INVENTORY_MOVEMENT_DISCOVERY.md` → OPTION C.
**Estado:** Local (reejecución limpia 0001→0148) y Staging. Production sigue en 0111.

---

## A · Fórmula final del saldo

Una sola función en la base, `output_batch_available_kg`, y todo lo demás
pregunta ahí:

```
disponible =   produced_quantity_kg
             − Σ output_batch_consumption.mass_kg              (reproceso interno)
             − Σ movimientos vigentes con dirección 'out'
             + Σ movimientos vigentes con dirección 'in'        (solo ajustes)
```

La usan el guardián de movimientos, el guardián de reproceso, la vista
`v_output_batch_stock` y —a través de ella— el selector, las pantallas y el
agregado por producto. Antes había **dos** fórmulas, y ese era el agujero.

## B · Máximo físico

```
physical_max = produced_quantity_kg
             − reproceso interno
             − despachos − mermas − uso interno       (SIN los ajustes)
```

Es el saldo *sin* contar los ajustes, y la diferencia con el saldo teórico es
exactamente la suma de los ajustes anteriores. De ahí sale el razonamiento
entero:

- **Sin ajustes previos**, techo = teórico, y un conteo mayor es imposible. Si
  alguien cuenta 62 donde la teoría dice 60, no han aparecido 2 kg: está mal
  declarada la producción o mal registrado un despacho.
- **Con un ajuste negativo previo**, techo > teórico, y un conteo mayor **sí**
  es legítimo: es el recuento que deshace el anterior. Ese es el único caso en
  que un ajuste puede sumar.

El encargo lo formulaba como `producido − reproceso`. Es la misma idea llevada
al día de hoy: lo despachado ya no está en la estantería y no se puede contar.

Mensaje al rechazar, literal:

> El conteo supera la cantidad físicamente posible para este lote: 60 kg.
> Corrige primero la cantidad producida o el movimiento que corresponda.

## C · Ajuste por recuento

Cambia de **semántica A** (teclear la diferencia) a **conteo físico**.

Se pide **«Cantidad contada físicamente»**. La pantalla enseña, antes de
confirmar:

```
Saldo teórico: 45 kg · Cantidad contada: 42 kg · Ajuste derivado: −3 kg
                                                  Faltan 3 kg respecto al sistema
```

Se persisten **dos hechos y una derivada**: `counted_quantity` (lo que se
contó), `theoretical_quantity_at_count` (lo que decía el sistema, **congelado**
—si mañana se corrige un despacho anterior, esto no cambia—) y
`quantity`/`direction`, que siguen siendo lo que mueve el saldo.

Y un CHECK obliga a que el trío cuadre:

```sql
(case when direction='in' then quantity else -quantity end)
  = counted_quantity - theoretical_quantity_at_count
```

Sin él se podría guardar «conté 42 donde había 45» y mover el saldo 10 kg, con
las tres columnas contradiciéndose sin que nada lo notara.

La pantalla y el servidor usan la **misma** función `resolveCount()`: si la
persona ve un número al escribir y otro al confirmar, deja de creerse los dos.

## D · Anulación

Un movimiento que nunca ocurrió se anula **corrigiendo a cero**. No hay sistema
paralelo: la misma RPC `correct_output_batch_movement`, el mismo linaje.

- El CHECK `quantity > 0` pasa a `quantity > 0 or (quantity = 0 and corrects_movement_id is not null)`.
- La RPC rechaza explícitamente cantidades negativas, ahora que el cero pasa.
- El original queda `is_current = false` apuntando a su corrección; la
  anulación queda vigente con cantidad cero.
- La pantalla ofrece **Corregir** y **Anular**, nunca «Eliminar», y al anular
  dice antes: *«El movimiento original se conservará en el historial del lote.»*

## E · Doble salida — cerrada

`output_batch_consumption_total_balance_guard` comparaba contra
`producido − otros consumos internos`: no sabía de despachos, mermas, uso
interno ni ajustes. Ahora pregunta a la función única.

Y con ella cambian los **tres** sitios que prometían disponibilidad, para que
prometan lo mismo:

| Superficie | Antes | Ahora |
|---|---|---|
| Guardián de reproceso (BD) | `producido − consumos internos` | saldo consolidado |
| `listConsumableOutputs` (selector) | `v_output_batch_inventory` | `v_output_batch_stock` |
| Guarda previa de la acción | `getOutputBatchBalance` | `getOutputBatchStock` |

Comprobado: despachar 100 de 100 y después reprocesar 100 se **rechaza**, y el
saldo se queda en 0 en vez de en −100.

## F · Concurrencia

Los **dos** guardianes toman `for update` sobre la fila del lote producido
antes de preguntar. El candado es sobre el lote, no sobre cada tabla, así que
la cola es la misma para un despacho y para un reproceso.

Probado con dos conexiones reales: despacho 80 y reproceso 80 sobre un lote de
100 → uno pasa, el otro falla, saldo 20 y nunca negativo.

## G · Inventario por lote

`v_output_batch_stock` gana dos columnas: `physical_max_kg` y
`is_inconsistent`. El saldo negativo **no se recorta** —no hay
`greatest(…, 0)`— y se presenta como **«Saldo inconsistente»**, no como
«Agotado».

El bloque del lote se llama ahora **«Movimientos del lote»** y su resumen
reconcilia exactamente con la vista:

```
Producido 100 kg · Reproceso − 0 kg · Despachos − 40 kg
Uso interno − 0 kg · Merma − 0 kg · Ajustes − 3 kg · Disponible 57 kg
```

La línea del listado también incluye ya los ajustes: antes los omitía y la
resta visible no salía.

## H · Inventario por producto

`v_product_stock`, derivada de `v_output_batch_stock`. Sin tabla de existencias
que mantener al día.

Agrupa por `(organization_id, product_id, unit_code)`. **La unidad se agrupa
aunque hoy solo haya una**: los lotes producidos de PCR se miden en kilogramos
y el guardián rechaza cualquier otra, pero ponerla cuesta una columna y evita
que el día que entre otra alguien sume 300 kg con 40 m y obtenga 340 de nada.
Es la misma decisión que 0145 tomó para el saldo textil.

Los lotes **sin producto asociado** se agregan con `product_id` nulo en vez de
descartarse: si se cayeran, la suma de los agregados dejaría de coincidir con la
de los lotes y el total de planta mentiría por defecto. Probado: el agregado es
exactamente la suma de sus lotes.

## I · Navegación del inventario

Nueva pantalla **`/traceability/inventory`**, con entrada propia en el menú
—«Inventario»— simétrica de «Saldo de materia prima» de Textiles, y dos
superficies:

- **Materias primas** — la sección que ya existía dentro de `/traceability/input-batches`,
  montada aquí con otra ruta base. **No se rehizo la aritmética**, y sigue
  declarando lo que es y lo que no: *saldo trazado = recibido − consumido en
  producción; no contempla mermas, devoluciones ni ajustes por recuento.*
- **Productos terminados** — producto, unidad, lotes, producido, salidas,
  disponible, con «Ver lotes» por fila.

Búsqueda, filtro y paginación en servidor en las dos, con parámetros propios
(`inv_*`, `prod_*`) que no colisionan entre sí ni con ninguna lista.

## J · Textiles — **diferido, documentado**

Las primitivas de producto terminado de PCR **no** aplican tal cual, y
copiarlas sería construir un segundo motor de inventario:

| | PCR | Textiles |
|---|---|---|
| Unidad del lote de salida | kg y solo kg (el guardián rechaza otras) | `unit_code` variable |
| Reproceso interno de lotes de salida | `output_batch_consumption` | **no existe**: `textile_order_consumptions` solo referencia `textile_input_lots` |
| Movimientos | `output_batch_movements` | no hay tabla |

La consecuencia de la segunda fila es que **la doble salida no puede ocurrir en
Textiles**: no hay un segundo camino de salida que desincronizar. Y la primera
obliga a una decisión que no está tomada —qué significa despachar 3 unidades de
un lote medido en metros—, que es exactamente la clase de decisión que 0143
resolvió para materias primas negándose a convertir y agrupando por unidad.

Textiles ya tiene su saldo de materia prima (0145) y no se toca. El inventario
de producto terminado textil queda **diferido** hasta que se decida la
semántica de unidad, y cuando se decida se reutilizan estas primitivas, no se
duplican.

## K · Migración

`0148_inventory_movement_hardening.sql`, append-only, sin `drop … cascade`, sin
tocar 0146 ni 0147, y sin limpieza no relacionada. Contiene exactamente lo
autorizado: saldo consolidado y guarda de reproceso (A), invariantes de ajuste
y techo físico (B), `counted_quantity` (C), `theoretical_quantity_at_count` (D),
soporte de anulación a cero (E) y la vista agregada por producto (F).

Una base nueva —así nacerá Production cuando migre 0111→0148— llega al
comportamiento final sin ninguna acción manual.

## L · Lo que NO cambia

El contenido reciclado. `calculate_recycled_content_v2` no lee
`output_batch_movements` ni `v_output_batch_stock`, y 0148 no toca la fórmula,
φ, la evidencia ni la defendibilidad. Despachar, perder o ajustar un lote no
mueve ni un decimal de su porcentaje — es una propiedad de lo que entró a
fabricarlo, no de lo que queda en el almacén. Probado en los dos sentidos: el
snapshot emitido no cambia, y recalcular después de las salidas da lo mismo.

Y la sección «Composición» desaparece de la experiencia normal. La pantalla del
lote tiene ahora tres cosas separadas: **contenido reciclado**, **genealogía** y
**movimientos del lote**.

Con ella se retira la «advertencia de balance» de la vista de 0104, que
comparaba el consumo contra la masa de composición: sin filas de composición
ese término es nulo y la advertencia era siempre falsa. Se retira en vez de
dejar un aviso que no puede sonar; la reconciliación que sí importa está en el
bloque de movimientos.
