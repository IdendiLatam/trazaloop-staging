# PCR / Textiles · Pre-integración · Fase 1 · Design Freeze

> **Qué es este documento.** Las decisiones de diseño cerradas para poder
> ejecutar después **un único sprint** sin improvisar. No es una propuesta
> abierta: donde hay decisión, está tomada y justificada contra el esquema
> real. Donde la decisión es genuinamente humana, está aislada en §14 y
> marcada como tal, en lugar de disimularla eligiendo yo.
>
> **No se implementó nada.** Sin migraciones (`0141` sigue siendo la última),
> sin código productivo, sin tocar Production, sin deploy, sin proveedor de IA,
> sin conectar proyectos remotos.
>
> Base: [Discovery Fase 0](./PCR_TEXTILES_PREINTEGRATION_DISCOVERY.md) ·
> commit `8db918b` · Fecha: 2026-08-28

---

## 1 · Principio rector

Casi todo lo que hace falta **ya existe en este repositorio**, resolviendo otro
problema. La paginación existe. El patrón de corrección no destructiva existe.
El versionado de metodologías existe. El candado transaccional existe. El
registro de terceros compartido existe. El vocabulario de unidades con
código+etiqueta existe.

Por eso este Design Freeze reutiliza en vez de inventar, y cada vez que
propone algo nuevo dice **por qué lo que había no servía**. Un motor de
evidencias nuevo, un motor de unidades universal o una tabla mutable de stock
serían tres formas distintas del mismo error.

---

## 2 · Decisiones congeladas · PT-F01…PT-F18

Se mantienen PT-01…PT-25. Se añaden las que siguen, con la resolución técnica
que este documento congela.

| Id | Decisión | Resolución congelada | §
|---|---|---|---|
| PT-F01 | Vigente/Obsoleta = estado ACTUAL | El catálogo enseña el presente; el cálculo no lo consulta | §4 |
| PT-F02 | Aplicabilidad contra fecha del lote, no `now()` | **`input_batches.received_date`** | §3 |
| PT-F03 | No caduca retroactivamente | Consecuencia automática de PT-F02 | §3.4 |
| PT-F04 | Un recálculo no cambia por el calendario | Consecuencia automática de PT-F02 | §3.5 |
| PT-F05 | Asociación requiere 4 condiciones | Guarda `security definer` + confirmación humana | §4.3 |
| PT-F06 | Preservar Historical Truth | **Snapshot mínimo en `evidence_links`** | §4 |
| PT-F07 | Quitar «Archivar» de la UX | Solo UX; `archived_at` intacto | §4.6 |
| PT-F08 | Búsqueda sobre todo el dataset | Filtro en servidor, siempre antes de `range` | §10 |
| PT-F09 | Exports sin corte silencioso | Recorrido paginado + declaración de completitud | §10.4 |
| PT-F10 | % reciclado desde lo consumido | Nueva metodología **v2**, no edición de la v1 | §5 |
| PT-F11 | Dato insuficiente → `CALCULATION_INCOMPLETE` | Reutiliza el patrón `data_state` de `quality_measurements` | §5.5 |
| PT-F12 | Inventario de materia prima con la verdad actual | En PCR **ya existe**; falta declarar alcance y construirlo en Textiles | §7 |
| PT-F13 | No presentar producción como inventario | Retirar/renombrar la lectura actual de salida | §8.1 |
| PT-F14 | Modelar el hecho mínimo de salida | `output_batch_movements`, patrón de `quality_measurements` | §8 |
| PT-F15 | Paridad transaccional en Textiles | Añadir `for update`, espejo de PCR | §9 |
| PT-F16 | Nada de unidades en texto libre | Catálogo `measurement_unit` mínimo, **sin conversión** | §6 |
| PT-F17 | No refactorizar raíces PCR por especulación | **Reproducido**: el fallo no está en las raíces | §11 |
| PT-F18 | PCR nunca es fallback implícito | Corregir los 6 enlaces que pierden el módulo | §11 |

---

# PARTE I · EVIDENCIA Y VERDAD HISTÓRICA

## 3 · La fecha canónica de aplicabilidad

### 3.1 · Las doce preguntas, respondidas contra el esquema

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Fecha empresarial canónica del lote de entrada | **`input_batches.received_date`** (`date`) |
| 2 | ¿Recepción, creación, aceptación u otra? | **Recepción**. No hay campo de aceptación. `created_at` es técnico |
| 3 | ¿Puede modificarse? | **Sí.** No hay guarda que la proteja |
| 4 | ¿Tiene histórico? | Sí, en `audit_log` (fila completa `old`/`new`), no en la propia tabla |
| 5 | Cómo evaluar `valid_until` vs `reference_date` | §3.3 |
| 6 | ¿Existe `valid_from`? | **No en PCR.** Sí en Textiles (`textile_evidences.valid_from`) |
| 7 | Representación de la aprobación interna | `evidences.status = 'valid'` + `reviewed_at` + `reviewed_by` + `review_comment` |
| 8 | ¿La aprobación tiene histórico? | **Solo estado actual, y es destructivo.** §3.2 |
| 9 | ¿`evidences` es mutable? | **Sí**, con restricciones de rol |
| 10 | Qué puede cambiar tras asociarse | `status`, `valid_until`, `archived_at`, `name`, `evidence_type`, `storage_path` |
| 11 | ¿Existe revision/snapshot/audit reutilizable? | **Tres**: `audit_log`, el snapshot de `recycled_content_calculations`, y el patrón de corrección de `quality_measurements` |
| 12 | Dato mínimo a persistir en la asociación | §4.2 |

### 3.2 · El hecho que obliga al snapshot

`guard_evidence_review()` hace esto al reabrir una evidencia rechazada:

```sql
new.reviewed_at    := null;
new.reviewed_by    := null;
new.review_comment := null;
```

La fila **borra su propia historia de aprobación**. `reviewed_at` no es «cuándo
se aprobó»: es «cuándo se revisó por última vez, si es que la última revisión
no fue anulada». No sirve para responder *«¿estaba aceptada el 15 de marzo de
2026?»*.

`audit_log` sí lo sabe —`audit_row_change` guarda la fila entera, no solo el
campo cambiado— pero reconstruir un estado a fecha exige recorrer todas las
versiones de la fila, y **un cálculo de negocio no puede depender de una
bitácora de auditoría**. Por eso el snapshot de §4 no es opcional: es lo que
hace que PT-F06 sea cierto y no un deseo.

### 3.3 · La regla de aplicabilidad temporal (congelada)

```
aplicable(evidencia, lote) ⇔
      evidencia.organization_id = lote.organization_id
  AND estado_aceptado_en(evidencia, lote.received_date)
  AND (evidencia.valid_from  IS NULL OR evidencia.valid_from  <= lote.received_date)
  AND (evidencia.valid_until IS NULL OR evidencia.valid_until >= lote.received_date)
  AND evidencia.archived_at  IS NULL   -- solo al CONFIRMAR, nunca al recalcular
```

Tres precisiones que evitan interpretaciones:

- **`valid_until IS NULL` significa «sin vencimiento declarado», no «vencida».**
  Es el caso mayoritario hoy y debe seguir contando.
- **El archivado se comprueba al confirmar la asociación, no al recalcular.**
  Archivar es una acción de escritorio sobre el presente; que alguien ordene
  su archivador en 2027 no cambia lo que se demostró en 2026.
- **`valid_from` no existe en PCR.** La regla se escribe ya contemplándolo para
  que el día que se añada no haya que reescribirla, y hoy la condición es
  trivialmente cierta.

### 3.4 · PT-F03 sale gratis

Si la comparación es contra `received_date` y no contra `now()`, una evidencia
que vencía el 2026-06-30 y amparaba un lote recibido el 2026-03-12 sigue
amparándolo en 2028. No hace falta ninguna regla adicional: **la regla es la
ausencia de `now()`**.

### 3.5 · PT-F04 sale gratis, y conviene decir qué NO cubre

Con `received_date` congelado en la asociación (§4.2), recalcular el mismo lote
en 2028 usa la misma fecha de referencia que en 2026 y da el mismo resultado.

Lo que PT-F04 **no** prohíbe, y hay que decirlo en voz alta: si en 2027 alguien
**rechaza** esa evidencia porque descubrió que era falsa, un recálculo posterior
sí puede cambiar. Eso no es «el calendario avanzó»: es información nueva sobre
el mundo. Cambiar por eso es correcto; cambiar por el paso del tiempo, no.

La distinción se implementa sola con el snapshot: la fecha viene congelada, el
estado se relee.

> **Decisión humana pendiente (H-1, §14).** Cabe la postura contraria —congelar
> también el estado, de modo que ni un rechazo posterior mueva un cálculo
> histórico. Es defendible y no la tomo yo.

---

## 4 · Mecanismo de Historical Truth

### 4.1 · Por qué se extiende `evidence_links` y no se crea nada

Cuatro candidatos, evaluados contra el esquema real:

| Candidato | Veredicto |
|---|---|
| Tabla nueva de asociación | **No.** Duplicaría `evidence_links`, que ya enlaza a `input_batch` y ya valida el tenant en `validate_evidence_link_org()` |
| Revisiones de evidencia (`*_revisions`) | **No.** Versionaría el documento; el problema no es el documento sino la aplicabilidad |
| `audit_log` como fuente | **No.** §3.2 |
| Snapshot en la fila de asociación | **Sí.** Seis columnas sobre una tabla existente |

El precedente es de esta misma casa: `recycled_content_calculations` ya congela
`methodology_rules_snapshot` y el desglose por componente con su
`origin_support_status`. Congelar la razón junto al hecho es el patrón del
repositorio, no una invención.

### 4.2 · El dato mínimo (respuesta a §2 q12)

Columnas nuevas sobre `evidence_links`:

| Columna | Tipo | Para qué |
|---|---|---|
| `confirmed_at` | `timestamptz` | PT-F05 · hubo confirmación humana |
| `confirmed_by` | `uuid → profiles` | quién la hizo |
| `reference_date` | `date` | **la fecha del lote usada**; congela PT-F02/F04 |
| `evidence_status_at_confirmation` | `text` | qué estado se aceptó |
| `evidence_valid_until_at_confirmation` | `date` | la vigencia que se comprobó |
| `applicability_basis` | `text` | por qué era aplicable, en un código estable |

Con esas seis, un recálculo en 2028 reconstruye *«esta evidencia se aceptó el
2026-04-02, estaba en `valid`, vencía el 2026-12-31, y el lote se recibió el
2026-03-12 — por eso contaba»* **sin leer la fila mutable de `evidences`**.

No se copia el archivo. No se copia el nombre. No se copia nada que no
participe en la decisión: un snapshot que copia de más es un segundo documento
disfrazado, y PT-F06 lo prohíbe explícitamente.

### 4.3 · La guarda de asociación (PT-F05)

Las cuatro condiciones se comprueban **en la base**, en una función
`security definer` —`evidence_link_confirm(...)`— por la misma razón que en
QUALITY-12.2D se sustituyó un `update` silencioso por una RPC: `evidence_links`
no tiene política de `insert` para el rol de usuario, y una escritura denegada
por RLS **no falla, afecta a cero filas**.

```
1 · misma organización      → ya lo hace validate_evidence_link_org()
2 · aprobación interna      → evidences.status = 'valid'
3 · aplicabilidad temporal  → la regla de §3.3
4 · confirmación humana     → parámetro explícito; sin él, no se escribe
```

Si alguna falla, la función **rechaza con motivo**. No escribe una fila
«pendiente»: una asociación a medias es una afirmación a medias.

### 4.4 · Lo que NO se toca

- `evidences` sigue siendo mutable. Congelarla rompería la revisión.
- `guard_evidence_review` sigue borrando `reviewed_at` al reabrir. Es su
  contrato; la historia se preserva ahora en la asociación y en `audit_log`.
- No se migran filas legacy. Un `evidence_links` anterior a esta migración
  tendrá `confirmed_at IS NULL`, y eso **se lee y se muestra** como «asociación
  histórica sin confirmación registrada». Rellenarlo con valores inventados
  sería falsificar el registro.

### 4.5 · Impacto en el enum incompleto (G-08)

`evidence_target_type` declara `document` y `requirement`; el disparador los
rechaza. Decisión congelada: **retirarlos del enum no es posible sin reescribir
el tipo**, y no vale la pena. Se hace lo barato y honesto: el disparador pasa a
nombrarlos explícitamente como *no soportados todavía*, y una prueba fija la
lista de los 9 soportados para que la divergencia no crezca en silencio.

### 4.6 · PT-F07 · Quitar «Archivar» de la interfaz

Solo UX. Se retira el control y su acción de servidor.

- `archived_at` / `archived_by`: **se conservan**, columnas y datos.
- Las filas ya archivadas **siguen archivadas** y se siguen mostrando como tal.
- El cálculo sigue leyendo `archived_at` donde ya lo lee.

No hay `DELETE`, no hay `UPDATE ... SET archived_at = NULL` masivo, no hay
backfill. Se quita un botón, no un hecho.

---

# PARTE II · CÁLCULO

## 5 · Fórmula objetivo del contenido reciclado

### 5.1 · Se publica como metodología v2, no se edita la v1

`calculation_methodologies` ya tiene `code`, `version`, `is_active`, y cada
cálculo congela `methodology_rules_snapshot`. Editar `RC-6632-15343` v1 haría
irreproducibles todos los cálculos existentes.

**Congelado:** la fórmula objetivo entra como fila nueva —`RC-6632-15343` v2—
con `is_active`; la v1 pasa a `is_active = false` y **sigue existiendo**. Los
cálculos viejos se reproducen con su snapshot. Es el mecanismo que el esquema
ya provee; no hace falta nada más.

### 5.2 · La fórmula, término a término

```
DENOMINADOR = Σ  bc.mass_kg × α(ob)
              sobre bc ∈ batch_consumption  con bc.production_order_id = ob.production_order_id

NUMERADOR   = Σ  bc.mass_kg × α(ob) × φ(ib)
              sobre las mismas filas, con φ definido abajo

%           = round(NUMERADOR / DENOMINADOR × 100, 4)
```

| Término | Tabla · campo | Unidad | Temporalidad | Elegibilidad |
|---|---|---|---|---|
| `bc.mass_kg` | `batch_consumption.mass_kg` | kg (`mass_unit` de las reglas) | hecho registrado; inmutable de facto por el candado de saldo | siempre entra en el denominador |
| `α(ob)` | reparto del lote de salida dentro de la orden | adimensional | fijado al calcular | §5.3 |
| `φ(ib)` | fracción reciclada del lote de entrada | fracción 0…1 | evaluada a `ib.received_date` | §5.4 |
| `ib.received_date` | `input_batches.received_date` | fecha | **fecha de referencia** (PT-F02) | — |
| `m.classification_code` / `reclassified_to_code` | `materials` | — | estado actual del material | debe estar en `eligible_classifications` |
| evidencia | `evidence_links` confirmado + snapshot | — | congelada (§4.2) | regla de §3.3 |

**Lo que desaparece del denominador:** `batch_composition.mass_kg` tecleado a
mano. Es literalmente PT-F10 — «no volver a pedir composición ya conocida».

**Lo que se conserva:** `produced_quantity_kg` sigue **sin ser denominador**.
Sigue alimentando la advertencia de descuadre, que ahora compara producido
contra consumido en vez de producido contra compuesto.

### 5.3 · El reparto α, que es el problema nuevo

Una orden puede producir varios lotes de salida: `output_batches_order_idx`
**no** es único. Con el denominador manual daba igual —cada lote traía su
composición—; derivándolo del consumo hay que repartir.

```
α(ob) = ob.produced_quantity_kg / Σ produced_quantity_kg de la orden
```

Y **si algún lote de salida de la orden no declara `produced_quantity_kg`,
α no es calculable → `CALCULATION_INCOMPLETE`.** No se reparte a partes
iguales: eso sería inventar la proporción.

Caso trivial y mayoritario: un lote por orden ⇒ α = 1.

### 5.4 · La fracción φ, que hoy no existe

Hoy la clasificación es del **material** y es todo-o-nada: `virgin`,
`postconsumer_valid`, … Un material «60 % reciclado» **no tiene representación
en el esquema**. Comprobado en `material_classifications`: diez códigos, ningún
campo de fracción.

Congelado: la fracción es propiedad **del lote de entrada**, no del material.
Un mismo proveedor entrega en marzo un lote al 60 % y en julio otro al 45 %, y
la evidencia que lo demuestra es la del lote, no la del catálogo.

```
φ(ib) =
  0                                si la clasificación efectiva no es elegible
  1                                si es elegible y ib.recycled_fraction IS NULL
                                   y la evidencia aplicable dice «totalidad»
  ib.recycled_fraction / 100       si está declarada y evidenciada
  INCOMPLETE                       si es elegible pero no hay evidencia aplicable
                                   o la fracción está declarada sin evidencia
```

Requiere dos columnas nuevas en `input_batches`:
`recycled_fraction numeric` (0…100) y `recycled_fraction_basis text`.

> **Decisión humana pendiente (H-2, §14).** Que un lote elegible **sin**
> fracción declarada cuente como 100 % es la interpretación conservadora del
> modelo actual (hoy cuenta entero). La alternativa —exigir siempre fracción
> explícita— es más estricta y **rompería todos los cálculos existentes**. No
> la tomo yo.

### 5.5 · `CALCULATION_INCOMPLETE` (PT-F11)

El patrón ya existe: `quality_measurements` separa
`data_state ∈ reported | no_data | not_applicable` de `value`, con un `CHECK`
que **obliga a `value IS NULL` cuando no hay dato**. Es exactamente la garantía
que PT-F11 pide: imposible confundir «cero» con «no sé».

Congelado: `recycled_content_calculations` gana
`result_state ∈ calculated | incomplete` + `incomplete_reasons text[]`, con
`CHECK (result_state = 'calculated') = (recycled_percent IS NOT NULL)`.

**Un `incomplete` no escribe porcentaje.** Ni cero, ni el del cálculo anterior,
ni una estimación.

### 5.6 · Los doce casos, resueltos

| | Caso | Resultado | Por qué |
|---|---|---|---|
| **A** | Material 100 % virgen | `CALCULATED` · φ = 0 | Clasificación no elegible; entra al denominador, no al numerador |
| **B** | Material 100 % reciclado | `CALCULATED` · φ = 1 | Elegible + evidencia aplicable |
| **C** | Fracción parcial | `CALCULATED` · φ = fracción | Requiere `input_batches.recycled_fraction` (§5.4) |
| **D** | Declarado reciclado, fracción no demostrable | **`INCOMPLETE`** | Ni 0 ni 1. Es el corazón de PT-F11 |
| **E** | Evidencia vencida hoy, válida en `received_date` | `CALCULATED` · cuenta | PT-F02/F03. **Corrige G-01 en el sentido contrario al ingenuo**: no es que deje de contar, es que se juzga en su fecha |
| **F** | Evidencia no aprobada al asociar | Asociación **rechazada** | PT-F05 condición 2. No llega a haber cálculo |
| **G** | Asociada y aplicable en su momento | `CALCULATED` · cuenta | El snapshot de §4.2 lo sostiene sin releer `evidences` |
| **H** | Lote consumido parcialmente | `CALCULATED` | Entra la masa **consumida**, no la recibida. El saldo no participa |
| **I** | Varios lotes del mismo material | `CALCULATED` | Cada lote aporta su masa con **su propia** φ y su propia fecha. Es la ganancia principal del cambio |
| **J** | Mezcla virgen + reciclado | `CALCULATED` | Suma ponderada; no hay caso especial |
| **K** | Reproceso interno | `CALCULATED` · φ según regla | Hoy `internal_same_process.never_counts = true` y `same_process_counts = false`. **La v2 no lo cambia** |
| **L** | Unidades incompatibles | **`INCOMPLETE`** | §6. Jamás conversión silenciosa |

En PCR el caso L no puede darse hoy: no hay campo de unidad, todo es kg por
nombre de columna y `mass_unit: "kg"` está en las reglas congeladas. Se
contempla porque la fórmula debe servir también a Textiles.

---

## 6 · Unidades

### 6.1 · Lo que hay

**PCR no tiene campo de unidad.** La unidad está en el nombre de la columna
—`quantity_kg`, `mass_kg`, `produced_quantity_kg`— y declarada en las reglas de
la metodología (`"mass_unit": "kg"`). Es inequívoco y no hay nada que arreglar.

**Textiles tiene cuatro columnas `text` libres**: `textile_input_lots.unit`,
`textile_order_consumptions.unit`, `textile_output_lots.unit`,
`textile_production_orders.unit`. Sin `CHECK`, sin catálogo, y la propia
interfaz pide *«mantén consistencia manual»*.

**Ya existe un vocabulario canónico**, en `lib/domain/quality-indicators.ts`:
`UNIT_CODES` (15), `UNIT_LABEL` en castellano, `UNIT_SUFFIX`, `isUnitCode()`, y
una nota explícita: *«presentación y semántica, jamás transformación del
valor»*. Es exactamente la postura de PT-F16.

### 6.2 · Lo congelado

**No se reutiliza esa lista tal cual.** Contiene `cop`, `usd`, `celsius`,
`percent` — sin sentido para un lote— y le faltan `m` y `unit`. Reutilizar la
lista para no crear una segunda sería peor que tener dos: pondría «Pesos (COP)»
en el selector de unidad de un rollo de tela.

Se reutiliza el **patrón**, y los **códigos coincidentes se escriben igual**:

```
MEASUREMENT_UNITS = kg · g · ton · m · cm · m2 · unit · roll · other
```

- Código estable en inglés, etiqueta en castellano, misma forma que `UNIT_LABEL`.
- **Cero conversión.** Ni entre kg y g. Comparar dos cantidades de distinta
  unidad devuelve *no comparable*, nunca un número.
- `other` existe a propósito, y una cantidad en `other` **nunca** participa en
  un cálculo: se registra y se muestra.

### 6.3 · Migración de los datos que ya hay

`unit` es texto libre; en Staging y Production puede haber `kg`, `Kg`,
`kilogramos`, `KG`, vacío. **La normalización se hace en dos pasos separados y
en este orden**:

1. Añadir `unit_code` **nullable**, sin tocar `unit`. Toda escritura nueva
   rellena `unit_code`. Sin `NOT NULL`, sin `CHECK` que rompa filas legacy.
2. Informe de normalización —cuántas filas por variante— y backfill **solo de
   las coincidencias inequívocas** tras `lower(trim(…))`. Lo ambiguo se queda
   en `NULL` y se muestra como *unidad sin normalizar*.

`unit` se conserva como texto original. No se borra: es lo que la persona
escribió.

> El volumen real de variantes **no se puede medir desde aquí** —en local hay
> cero filas y no voy a consultar Staging ni Production—. El informe del paso 2
> es parte del sprint, no de este documento.

---

# PARTE III · INVENTARIO

## 7 · Materia prima (PT-F12)

### 7.1 · En PCR ya está construido

`v_material_inventory` + `lib/db/inventory.ts` + `lib/domain/inventory.ts` ya
entregan por material: recibido, consumido, disponible, lotes con saldo, lotes
totales, **con búsqueda `ilike` en servidor y paginación de 20**. Y el detalle
por lote. Y `inventoryState` sin umbral «bajo» inventado.

La consulta objetivo **es la que hay**. No se rehace.

### 7.2 · Lo que falta en PCR

1. **Declarar el alcance en pantalla.** Hoy dice «recibido menos consumido por
   las órdenes». Debe decir además, explícitamente, lo que **no** incluye:
   *«No contempla mermas, devoluciones a proveedor ni ajustes por recuento
   físico: no existen como hecho registrable.»* PT-F12 lo pide y es lo que
   separa un saldo honesto de un inventario falso.
2. **Mostrar la unidad** (kg) en vez de darla por sabida.

### 7.3 · Lo que hay que construir en Textiles

Existe `v_textile_input_lot_balance` (por lote). **No existe** la agregación por
material, ni búsqueda, ni paginación.

Congelado — vista `v_textile_material_inventory`, espejo de la de PCR, con dos
diferencias obligadas:

- **Agrupa por `(material, unit_code)`**, nunca por material solo. Sumar 300 kg
  y 40 m daría 340 de nada.
- Arrastra `other_unit_consumptions_count` para que la pantalla pueda decir
  *«hay N consumos en otra unidad que no se han restado»* en vez de callarlo.

### 7.4 · Los seis casos

| Caso | Tratamiento |
|---|---|
| Lote consumido totalmente | saldo 0 → `exhausted`. Se muestra, no se oculta |
| Lote parcialmente consumido | saldo > 0 → `available` |
| Lote sin consumo | saldo = recibido |
| Cantidad negativa | **Imposible por construcción**: el candado de saldo lo impide. Si aparece, es corrupción — se muestra tal cual y se marca. Nunca `greatest(x, 0)`: enmascarar la anomalía es perderla |
| Concurrencia | Resuelta en la escritura (§9), no en la lectura. La vista solo lee |
| Unidad incompatible | Fila aparte por `unit_code` + contador de no comparables |

### 7.5 · Nada de tabla mutable de stock

PT-F12 y `lib/domain/inventory.ts` coinciden: *«El inventario NO es una tabla:
se deriva siempre de los movimientos reales»*. Se mantiene. Una tabla de stock
introduce el problema de mantenerla sincronizada, que es peor que el que
resuelve.

---

## 8 · Producto terminado (PT-F13, PT-F14)

### 8.1 · Primero, dejar de mentir

`v_output_batch_inventory` resta solo el reproceso interno, así que su
`available_kg` es producción acumulada disfrazada de disponible. **PT-F13
manda retirarlo como «inventario»** antes de construir nada: pasa a llamarse
producción y reproceso, que es lo que mide.

Ese cambio es de lectura y presentación y **puede ir el primero**, sin esperar
al modelo de salidas.

### 8.2 · El hecho mínimo

Una tabla, `output_batch_movements`:

| Columna | Tipo | Por qué |
|---|---|---|
| `id`, `organization_id` | `uuid` | tenant, como todo aquí |
| `output_batch_id` | `uuid` | el lote que sale |
| `movement_kind` | `text` | `dispatch` · `internal_use` · `loss` · `adjustment` |
| `quantity` | `numeric` | siempre **positiva**; el signo lo pone `movement_kind` |
| `unit_code` | `text` | §6 |
| `occurred_at` | `timestamptz` | **cuándo pasó**, no cuándo se tecleó |
| `reason` | `text` | obligatorio en `loss` y `adjustment` |
| `reference` | `text` | referencia libre del cliente (remisión, pedido…) |
| `corrects_movement_id` | `uuid` | patrón `quality_measurements` |
| `superseded_by_movement_id` | `uuid` | idem |
| `correction_reason` | `text` | obligatorio si corrige |
| `is_current` | `boolean` | idem |
| `created_by`, `created_at` | | autoría real |

Con los mismos dos `CHECK` que `quality_measurements` ya tiene: motivo no vacío
cuando se corrige, y `superseded ⇒ NOT is_current`.

### 8.3 · Corrección sin destrucción (PT-F14)

Corregir **inserta** un movimiento que apunta al anterior; el anterior queda
`is_current = false` y **no se borra ni se edita**. Es literalmente el mecanismo
de `quality_measurements`, ya probado en este repositorio.

`DELETE` se bloquea con disparador, igual que `production_orders_protect_history`
bloquea borrar una orden que ya es historial.

### 8.4 · Lo que NO se modela

Ni pedidos, ni clientes, ni facturas, ni almacenes, ni ubicaciones, ni
logística, ni precios. `reference` es un texto libre: quien quiera anotar el
número de remisión lo anota. **Si mañana hace falta un cliente de verdad,
`quality_external_parties` ya existe** (§9.3 del discovery) y sería el sitio
—no una tabla nueva de clientes.

### 8.5 · La fórmula

```
stock(lote) =  produced_quantity_kg
             − Σ movimientos vigentes de salida física      (dispatch, internal_use, loss)
             − Σ output_batch_consumption                    (reproceso interno, ya existe)
             ± Σ movimientos vigentes de tipo adjustment

  con «vigentes» = is_current, y todos los términos en la MISMA unit_code.
  Cualquier término en otra unidad ⇒ el stock se declara no comparable, nunca
  se convierte.
```

Refleja el modelo real: cada término existe o va a existir como hecho
registrado. No hay ninguna estimación.

---

# PARTE IV · CORRECCIÓN Y ESCALA

## 9 · Concurrencia en Textiles (PT-F15)

### 9.1 · Lado a lado

| | PCR · `batch_consumption_total_balance_guard` | Textiles · `guard_textile_lot_overconsumption` |
|---|---|---|
| Momento | `BEFORE INSERT OR UPDATE ... FOR EACH ROW` | idéntico |
| Lee el lote | `SELECT ... **FOR UPDATE**` | `SELECT ...` sin candado |
| Excluye la propia fila al editar | `bc.id <> new.id` | `tg_op = 'INSERT' or id <> new.id` |
| Condición de aplicar | siempre que haya cantidad | **solo si las cadenas de unidad coinciden** |
| `errcode` | `23514` | por defecto |
| Capas por encima | UI + acción de servidor + BD | acción de servidor + BD |

### 9.2 · La corrección mínima

Tres cambios, ninguno estructural:

1. **`for update` en el `select` del lote.** Es la línea que falta y la que
   crea la paridad.
2. **`errcode = '23514'`**, para que la acción de servidor distinga esta
   negativa de un fallo genérico, como ya hace en PCR.
3. **Que la unidad deje de ser la condición de aplicar la guarda.** Con
   `unit_code` (§6): unidades iguales ⇒ se compara; distintas ⇒ **se rechaza**
   el consumo, no se deja pasar sin comprobar. Hoy la desigualdad **abre** la
   puerta; debe cerrarla.

El punto 3 es un cambio de comportamiento visible y hay que decirlo: consumos
que hoy se aceptan sin validar pasarán a rechazarse hasta que la unidad esté
normalizada. Es correcto —un consumo que nadie puede comparar no debería
comprometer un saldo— pero no es transparente y va con el paso 2 de §6.3, no
antes.

### 9.3 · La prueba que hay que escribir

No basta con leer el `for update`. La prueba debe abrir **dos transacciones
reales y simultáneas** contra la base local, cada una insertando un consumo que
por separado cabe y juntos no, y demostrar que **como mucho una** compromete el
saldo. Sin eso, la carrera sigue sin estar probada.

**Este documento no afirma que la carrera se produzca.** Afirma que falta el
candado que en PCR se puso a propósito. La prueba es del sprint.

---

## 10 · Paginación, búsqueda y exportación

### 10.1 · Se adopta `lib/domain/pagination.ts`

`DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`, `normalizePageQuery`,
`pageRange`. Puro, probado, ya usado por PCR en cuatro ficheros. **No hay razón
técnica documentada para no usarlo**, así que se usa.

Excepción única: el inventario mantiene `INVENTORY_PAGE_SIZE` y sus parámetros
propios (`inv_q`, `inv_page`, `inv_lot_page`), que existen precisamente para no
chocar con la paginación de la lista que los rodea.

### 10.2 · El orden obligatorio (PT-F08)

```
tenant  →  filtros  →  búsqueda  →  count exacto  →  order  →  range
```

**Filtrar después de paginar es el fallo que PT-F08 prohíbe**: devolvería «los
resultados de la página 1», no «los resultados». El `count` va antes del
`range` y es el total del conjunto filtrado, no de la página.

### 10.3 · Alcance

| Módulo | Listas |
|---|---|
| PCR | evidencias · familias · materiales · productos · proveedores · órdenes · lotes de entrada · lotes de salida |
| Textiles | catálogos (proveedores, materiales, componentes, procesos, procesos externalizados, fibras) · productos, referencias, colecciones · trazabilidad (lotes de entrada, órdenes, lotes de salida) · evidencias · pasaportes |

PCR ya cumple en la mayoría; el trabajo grueso es Textiles.

### 10.4 · Exportación (PT-F09)

Los exportadores leen sin cota y heredan el corte de 1 000. Congelado:

1. **Recorrido paginado** hasta agotar, con `pageSize` explícito.
2. **Declaración de completitud** en la propia exportación: filas exportadas de
   filas existentes. Si por cualquier motivo no se recorrió todo, **lo dice el
   documento**, no el que lo lee.
3. **Tope duro y visible.** Si se decide poner un máximo, la exportación lo
   declara. Un corte silencioso deja de ser aceptable en cualquier forma.

### 10.5 · La regla que resume PT-F08 y PT-F09

> Ninguna pantalla ni exportación puede aparentar un conjunto completo cuando
> solo recibió una página.

Se implementa mostrando siempre el total junto a lo mostrado —«20 de 1 347»— y
tratando un `count` ausente como **error visible**, nunca como cero. Es la
lección de QUALITY-12.2F: una lectura que falla no puede presentarse como
ausencia de datos.

---

## 11 · Independencia de módulos (PT-F17, PT-F18)

### 11.1 · Reproducido. No hace falta especular

PT-F17 pedía reproducir antes de refactorizar. **Se reprodujo**, y el resultado
exonera a las raíces: el problema no es que PCR ocupe `/catalog`.

`resolveShellModuleForPath()` es pura y termina en `return CPR_SHELL_MODULE`.
Es deliberado, está documentado y `textiles-navigation` ya lo comprueba. El
módulo activo viaja por las pantallas transversales en `?m=`, y hay pantallas
que lo dejan caer en sus propios enlaces.

**La cadena, en dos clics:**

```
barra lateral   →  /support?m=textiles      shell Textil ✓
«Crear ticket»  →  /support/new             shell PCR    ✗   href literal
```

La persona no pidió cambiar de módulo y se encuentra el menú de PCR
—Catálogos, Evidencias, Trazabilidad, Contenido reciclado— que su empresa no
tiene: cada opción la devolverá a `/modules` por `requireCprModule()`.

Está fijado en `tests/unit/pcr-textiles-preintegration-nav.test.ts`
(9 comprobaciones, verdes, sin tocar código productivo).

**Estado: `HUMAN_REPORTED_AND_REPRODUCED`.**

### 11.2 · Las seis pantallas

| Pantalla | Enlaces literales |
|---|---|
| `(shell)/support/page.tsx` | 2 |
| `(shell)/support/new/page.tsx` | 1 |
| `(shell)/support/[id]/page.tsx` | 1 |
| `(shell)/settings/company/page.tsx` | 3 |
| `settings/profile/page.tsx` | 1 |
| `modules/page.tsx` | 1 |
| `(shell)/team/page.tsx` | **0 — ya corregida en QUALITY-01.2; es el patrón** |

### 11.3 · La corrección

Aplicar `moduleAwareHref` a esos nueve enlaces, leyendo el módulo con
`SHELL_MODULE_PARAM`, exactamente como hace `/team`. **Cambio de código, sin
esquema, sin migración, sin tocar el resolutor ni las raíces.**

`redirect("/onboarding")` en `createOrganizationAction` es PCR-céntrico, pero
**no lo incluyo como fallo**: una empresa recién creada recibe demo de todos los
módulos funcionales vía `provision_new_organization_modules`, así que no llega a
chocar con el guard. Queda anotado, no corregido.

### 11.4 · Lo que NO se hace

No se migran las trece raíces de PCR a `/pcr/**`. PT-F17 lo prohíbe sin fallo
reproducido, y el fallo reproducido no está ahí. La deuda queda registrada en
el discovery.

---

## 12 · Catálogo canónico de tipos de evidencia

### 12.1 · Las fuentes duplicadas de hoy

| Fuente | Forma | Dónde |
|---|---|---|
| Formulario digital PCR | **texto libre** | `components/domain/evidences/forms.tsx:99` |
| Formulario físico PCR | lista cerrada de 8 | `physical-forms.tsx:48` |
| Filtro de la lista PCR | la misma lista de 8 | `(cpr)/evidences/page.tsx:211` |
| `EVIDENCE_CATEGORIES` | 8 códigos, solo en código | `lib/domain/evidence-governance.ts:36` |
| Textiles | `CHECK` de 13 en la base | `textile_evidences_type_check` |

### 12.2 · La fuente canónica elegida

**`lib/domain/evidence-governance.ts`**, extendido. Motivos concretos:

- Ya es la fuente del filtro y del formulario físico: elegirlo deja **dos**
  sitios por cambiar en lugar de tres.
- Es lógica pura, usable desde servidor, cliente y pruebas — el patrón del
  repositorio.
- Textiles ya tiene su `CHECK` en base y **no se toca**: son vocabularios de
  dominios distintos y forzar uno solo empobrecería los dos. Lo que se unifica
  es **la forma** —código estable + etiqueta— no la lista.

Se descarta llevarlo a una tabla de catálogo: nadie lo edita en caliente, y una
tabla obligaría a migración, RLS y semilla para ganar nada.

### 12.3 · La forma congelada

```
código estable      en inglés, snake_case, INMUTABLE una vez publicado
etiqueta            en castellano, en el mapa de etiquetas
traducción futura   cambiando el mapa, jamás el código
```

### 12.4 · Datos existentes

- **Ningún `UPDATE` sobre `evidences.evidence_type`.** Cero backfill.
- Un valor legacy que no esté en el catálogo **se muestra tal cual**. Ya lo hace
  `evidenceCategoryLabel()`: `?? value`. Inventarle una etiqueta bonita
  escondería que apareció uno nuevo.
- Se añade `unknown_legacy` como **estado de presentación**, no como valor
  almacenable: la lista lo agrupa bajo «Tipo no catalogado» para que sea
  visible cuántos hay.

### 12.5 · Lo que arregla

El formulario digital pasa al mismo selector que el físico ⇒ el filtro deja de
tener resultados invisibles (G-07). Más un índice
`(organization_id, evidence_type)` en `evidences`, que Textiles ya tiene y PCR
no (G-11).

---

# PARTE V · EJECUCIÓN

## 13 · Impacto en esquema y migraciones

Siguiente número disponible: **`0142`**. **No se crea en esta fase.**

| Cambio | Por qué | ¿Solo código? | ¿Esquema? | ¿Migración? | ¿Backfill? | ¿RLS? | ¿Histórico? | Reversión |
|---|---|---|---|---|---|---|---|---|
| Selector de tipo unificado + índice | G-07, G-11 | no | índice | **0142** | **no** | no | ninguno | `drop index` |
| Snapshot en `evidence_links` (6 col.) | PT-F06 | no | columnas nullable | **0142** | **no** | política de `insert` vía RPC | crea historia, no la altera | columnas quedan nulas |
| `evidence_link_confirm()` | PT-F05 | no | función | **0142** | no | `security definer` | — | `drop function` |
| Disparador nombra los 9 destinos | G-08 | no | función | **0142** | no | no | ninguno | versión anterior |
| Quitar «Archivar» de la UX | PT-F07 | **sí** | — | — | — | — | **ninguno**: `archived_at` intacto | revertir UI |
| Paginación en Textiles | PT-F08, G-02 | **sí** | — | — | — | — | ninguno | revertir código |
| Exportación paginada + completitud | PT-F09, G-10 | **sí** | — | — | — | — | ninguno | revertir código |
| Enlaces transversales con módulo | PT-F18 | **sí** | — | — | — | — | ninguno | revertir código |
| `unit_code` en las 4 tablas textiles | PT-F16 | no | columnas nullable | **0143** | **sí, paso 2** | no | conserva `unit` original | columnas quedan nulas |
| Candado + errcode en la guarda textil | PT-F15 | no | función | **0143** | no | no | ninguno | versión anterior |
| `input_batches.recycled_fraction` (+basis) | PT-F10 §5.4 | no | columnas nullable | **0144** | **no** | no | ninguno | columnas quedan nulas |
| Metodología v2 + `result_state` | PT-F10, PT-F11 | no | fila + columnas + CHECK | **0144** | **no** | no | v1 sigue activa para lo viejo | reactivar v1 |
| Alcance del saldo en pantalla | PT-F12 | **sí** | — | — | — | — | ninguno | revertir UI |
| `v_textile_material_inventory` | PT-F12 | no | vista | **0145** | no | `security_invoker` | ninguno | `drop view` |
| Renombrar la lectura de salida | PT-F13 | **sí** | — | — | — | — | ninguno | revertir UI |
| `output_batch_movements` | PT-F14 | no | tabla + RLS + disparadores | **0146** | no | políticas nuevas | append-only por diseño | `drop table` (vacía) |

**Cinco migraciones agrupadas por coherencia**, no una por detalle:

```
0142  evidencia: catálogo, snapshot y confirmación
0143  unidades y paridad transaccional en Textiles
0144  cálculo: fracción, metodología v2 y estado incompleto
0145  inventario de materia prima en Textiles
0146  movimientos de producto terminado
```

Recordatorio operativo: **cada una hay que autorizarla en las listas blancas de
~21 ficheros de prueba**, o `test:all` falla.

---

## 14 · Decisiones que siguen siendo humanas

Cuatro. No las tomo yo porque cambian lo que el producto afirma, no cómo lo
implementa.

**H-1 · ¿Un rechazo posterior debe mover un cálculo histórico?**
§3.5. Releer el estado (mi propuesta) trata el rechazo como información nueva.
Congelarlo también hace el histórico absolutamente inmutable. Ambas son
defendibles ante un auditor; dicen cosas distintas.

**H-2 · ¿Un lote elegible sin fracción declarada cuenta como 100 %?**
§5.4. Mantenerlo conserva los cálculos existentes. Exigir fracción explícita es
más estricto y **volvería `INCOMPLETE` a cálculos hoy publicados**.

**H-3 · ¿Qué se hace con los cálculos v1 cuando exista la v2?**
Se conservan y se reproducen con su snapshot — eso está congelado. Lo que no
está decidido es si se **invita** a recalcular, y qué se le dice a quien ya
entregó un porcentaje v1 a su cliente.

**H-4 · ¿El rechazo por unidad no normalizada entra con la migración o después?**
§9.2 punto 3. Entra un bloqueo que hoy no existe. La fecha de activación es
comercial, no técnica.

---

## 15 · Plan de implementación

### PT-01 · Evidence Integrity & Scale

- **Alcance** · Catálogo canónico de tipos · snapshot y confirmación de
  asociación · retirada de «Archivar» de la UX · paginación y búsqueda en
  servidor en las listas de Textiles · exportación paginada con declaración de
  completitud · índice por tipo.
- **Esquema** · `0142`. Seis columnas nullable en `evidence_links`, una función
  `security definer`, un índice, un disparador reescrito.
- **Código** · `evidence-governance.ts` extendido · formulario digital al
  selector · adopción de `lib/domain/pagination.ts` en toda la capa
  `textiles-*` · exportadores con recorrido paginado.
- **RLS** · La escritura de la asociación pasa por la RPC. Ninguna política se
  relaja. Ninguna vista cambia de `security_invoker`.
- **UX** · Selector en lugar de campo libre · sin botón de archivar · siempre
  «N de M» · error visible cuando el `count` falla.
- **Pruebas** · El filtro encuentra lo creado por el formulario digital · el
  `INSERT` directo sin confirmación se rechaza · la asociación sobrevive a que
  se modifique `evidences` después · una lista de 1 200 filas muestra 1 200,
  no 1 000 · la exportación declara su completitud.
- **Dependencias** · ninguna. **Empieza aquí.**
- **Aceptación** · Cero listas sin cota en `textiles-*` · cero exportadores sin
  recorrido · el snapshot reconstruye la aplicabilidad sin leer `evidences` ·
  ninguna fila legacy modificada.
- **Riesgo** · **Bajo.** Aditivo. La paginación usa una primitiva ya probada.

### PT-02A · Recycled Content & Raw Material Inventory

- **Alcance** · Metodología v2 desde consumos · fracción por lote · reparto α ·
  `CALCULATION_INCOMPLETE` · alcance del saldo declarado · inventario de
  materia prima en Textiles.
- **Esquema** · `0144` (fracción, v2, `result_state`) · `0145` (vista textil).
- **Código** · Nueva función de cálculo junto a la actual —**no encima**— para
  poder comparar ambas sobre los mismos datos antes de cambiar el defecto.
- **RLS** · Sin cambios. La función nueva conserva las comprobaciones de
  membresía y rol de la actual.
- **UX** · `INCOMPLETE` se muestra con sus motivos, **jamás con un porcentaje**.
- **Pruebas** · Los doce casos A…L · v1 sigue reproduciendo sus cálculos
  antiguos · una evidencia vencida hoy pero válida en `received_date` **cuenta**
  · un lote sin `produced_quantity_kg` en una orden multi-lote da `INCOMPLETE`.
- **Dependencias** · **PT-01** (el snapshot es de donde sale la aplicabilidad) y
  la primera mitad de PT-03 (`unit_code`, para el inventario textil).
- **Aceptación** · Ningún `INCOMPLETE` escribe porcentaje · el saldo declara en
  pantalla lo que no incluye · el inventario textil nunca suma unidades
  distintas.
- **Riesgo** · **Alto.** Cambia el número que el producto defiende. Mitigación:
  v2 convive con v1, y se comparan antes de cambiar el defecto.

### PT-02B · Finished Product Movements & Inventory

- **Alcance** · Retirar la lectura falsa de inventario de salida · tabla de
  movimientos · corrección no destructiva · stock real.
- **Esquema** · `0146`.
- **Código** · Registro de movimiento, corrección, y la fórmula de §8.5.
- **RLS** · Políticas nuevas: registra quien ya puede registrar producción;
  `DELETE` bloqueado por disparador para todos.
- **UX** · Retirar «disponible» del lote de salida **antes** de construir lo
  demás. Mentir menos no requiere esperar.
- **Pruebas** · Una corrección conserva el movimiento original · `DELETE`
  rechazado · el stock nunca mezcla unidades · sin movimientos, el stock es la
  producción y **lo dice**.
- **Dependencias** · `unit_code` de PT-03.
- **Riesgo** · **Medio.** Modelo nuevo, pero aditivo y sin backfill.

### PT-03 · Textiles Correctness & Module Independence

- **Alcance** · `unit_code` en las cuatro tablas · candado y `errcode` en la
  guarda · los nueve enlaces transversales.
- **Esquema** · `0143`.
- **Código** · `moduleAwareHref` en seis pantallas · selector de unidad.
- **UX** · Unidad por selector, nunca por teclado.
- **Pruebas** · **La concurrencia real de §9.3** · invertir el acta de
  `pcr-textiles-preintegration-nav.test.ts` · una unidad no normalizada no
  participa en ningún cálculo.
- **Dependencias** · ninguna para la parte de navegación; el paso 2 de §6.3
  necesita el informe de variantes de Staging.
- **Aceptación** · Dos consumos simultáneos que juntos exceden el lote: **como
  mucho uno** compromete el saldo · ninguna transversal pierde el módulo.
- **Riesgo** · **Medio.** El bloqueo por unidad es un cambio visible (H-4).

### Orden exacto de ejecución

```
1 · PT-03  (solo navegación)     sin esquema · sin dependencias · corrige un fallo reproducido
2 · PT-01                        aditivo · desbloquea PT-02A
3 · PT-03  (unidades + candado)  0143 · desbloquea PT-02A/B en Textiles
4 · PT-02A                       0144 + 0145 · el bloque de mayor riesgo, con todo lo demás en su sitio
5 · PT-02B                       0146 · el único modelo verdaderamente nuevo, al final
```

El orden no es el de importancia: es el de **dependencia y riesgo creciente**.
Se empieza por lo que está reproducido y no toca el esquema, y se termina por
lo que introduce un modelo nuevo. Cuando llega el bloque que cambia el número
que el producto defiende, la evidencia, las unidades y la escala ya son firmes.

---

## 16 · Lo que este Design Freeze NO establece

- **No mide el volumen de variantes de unidad** en Staging ni Production. Es
  el paso 2 de §6.3 y pertenece al sprint.
- **No prueba la carrera de concurrencia.** §9.3. Afirma la ausencia del
  candado, no el fallo.
- **No decide H-1…H-4.**
- **No crea ninguna migración.** `0141` sigue siendo la última.
- **No modifica comportamiento productivo.** Lo único añadido al repositorio es
  documentación y una prueba de caracterización que pasa en verde.

---

## 17 · Estado

**Fase 1 · DESIGN FREEZE: COMPLETA.**

Decisiones congeladas: 18 (PT-F01…PT-F18) · Decisiones humanas abiertas: 4 ·
Migraciones diseñadas: 5 (`0142`…`0146`), **creadas: 0** · Bloques de
implementación: 4 · Fallo de navegación: **reproducido y fijado en prueba** ·
`test:all`: **EXIT 0**.
