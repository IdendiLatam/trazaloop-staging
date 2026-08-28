# PCR / Textiles · Pre-integración · Fase 0 · Discovery y análisis funcional de brechas

> **Naturaleza de este documento.** Es una inspección, no una propuesta. Todo lo
> que se afirma aquí se comprobó contra el esquema real de la base local
> (alineada con Staging en 0141) y contra el código del repositorio en el commit
> `3fbe111`. Donde no pude comprobar algo, lo digo. Donde el sistema hace algo
> distinto de lo que su documentación sugiere, lo señalo sin suavizarlo.
>
> **No se implementó nada.** No hay migraciones nuevas, no se tocó Production,
> no se desplegó, no se llamó a ningún proveedor de IA.
>
> Fecha: 2026-08-28 · Commit inspeccionado: `3fbe111` · Última migración: `0141`

---

## 1 · Resumen ejecutivo

PCR y Textiles no son dos vistas de un mismo modelo. Son **dos sistemas
paralelos y completos** que comparten la plataforma, el inquilino y la sesión, y
casi nada más. Cada uno tiene su propio catálogo de proveedores, su propio
almacén de evidencias con su propio vocabulario, su propia cadena
lote→orden→lote, y su propia idea de qué significa que algo esté soportado.

Esa duplicación no es un accidente que haya que revertir: en varios sitios
Textiles resolvió problemas que PCR no tiene (unidades distintas de kg) y PCR
resolvió problemas que Textiles no tiene (una cuenta defendible del porcentaje
reciclado). El trabajo de pre-integración no es fusionarlos. Es **decidir dónde
la divergencia es deliberada y dónde es simple deuda**, y cerrar las brechas
donde la deuda ya produce resultados incorrectos.

Los tres hallazgos que más pesan:

1. **`evidences.valid_until` no lo lee nadie en PCR.** Ni una función, ni una
   vista, ni el cálculo del reciclado. Una evidencia de origen vencida hace tres
   años sigue aportando masa al porcentaje. (§5, §7)
2. **Textiles no tiene paginación en ninguna parte, y PostgREST corta en 1000
   filas sin avisar.** A partir de mil proveedores, la lista deja de mostrarlos y
   nada lo indica. Es la misma clase de fallo que el incidente de la consola de
   plataforma en QUALITY-12.2F: una lectura truncada disfrazada de dato. (§6)
3. **El inventario de producto terminado no tiene salida.** No hay despacho, ni
   venta, ni merma, ni ajuste. Un lote vendido entero sigue figurando disponible
   para siempre. (§8)

Veredicto de inventario, que era una de las preguntas explícitas del encargo:

| Ámbito | Veredicto |
|---|---|
| Materia prima (lote de entrada) | **`READY_WITH_EXISTING_TRUTH`** — con una salvedad de alcance (§8.2) |
| Producto terminado (lote de salida) | **`NOT_READY_MISSING_MOVEMENTS`** (§8.3) |

---

## 2 · Qué se inspeccionó y cómo

| Fuente | Método |
|---|---|
| Esquema (tablas, columnas, restricciones, enums, índices, disparadores) | `psql` contra la base local en 0141 |
| Lógica en base (funciones, vistas) | `pg_get_functiondef` / `pg_get_viewdef` |
| Código de aplicación | lectura directa de `lib/`, `app/`, `components/`, `server/` |
| Cotas y paginación | recuento de `.range(`, `.limit(`, `ilike`, `count:` por fichero |

No se ejecutó ninguna escritura de negocio. No se consultó Production. No se
buscaron ni se manipularon credenciales.

---

## 3 · Los dos modelos de evidencia, uno al lado del otro

Existen **dos almacenes de evidencia sin relación entre sí**:

| | PCR | Textiles |
|---|---|---|
| Tabla | `evidences` (24 columnas) | `textile_evidences` (22 columnas) |
| Enlaces | `evidence_links` | `textile_evidence_links` |
| Tipo | `evidence_type` **texto libre, sin restricción** | `evidence_type` con `CHECK` de **13 valores** |
| Estado | enum `evidence_status`: `pending·valid·rejected·expired` | `CHECK` de 5: `pending_review·accepted·rejected·expired·archived` |
| Archivado | columna `archived_at`, **ortogonal** al estado | valor `archived` **dentro** del estado |
| Vigencia | `valid_until` — **nadie la lee** (§5) | `valid_until` — se evalúa en lectura |
| Soporte físico | sí: `medium`, `physical_reference`, `physical_location`, `physical_custodian` | no |
| Vigencia desde | no | `valid_from` (+ `CHECK` de coherencia con `valid_until`) |
| Tipos de destino enlazables | 9 efectivos (§3.3) | 18 |
| Roles de enlace | `link_role` texto libre | `link_type` con `CHECK` de **31 valores** |

Ninguna de las dos es "la buena". PCR sabe de custodia física y de archivado
ortogonal; Textiles sabe de vocabulario cerrado y de vigencia efectiva.

### 3.1 · El mismo campo, dos vocabularios, en el mismo módulo

Esto no es una divergencia entre módulos: ocurre **dentro de PCR**.

`evidences.evidence_type` se alimenta desde dos formularios distintos:

- `components/domain/evidences/forms.tsx:99-103` — evidencia digital. Campo de
  **texto libre**, con una pista que sugiere ejemplos en prosa castellana
  («declaración de proveedor, registro de recepción, ficha del material»).
- `components/domain/evidences/physical-forms.tsx:48-56` — evidencia física.
  `<select>` cerrado sobre `EVIDENCE_CATEGORIES`, ocho valores en inglés con
  guiones bajos (`origin_supplier`, `traceability`, `quality_control`, …).

Y el filtro de la lista (`app/(app)/(shell)/(cpr)/evidences/page.tsx:211-215`)
usa **la lista cerrada**. Consecuencia directa y comprobable: toda evidencia
digital creada por el camino normal es **invisible al filtro por tipo**, salvo
que la persona haya escrito a mano exactamente `origin_supplier`.

`EVIDENCE_CATEGORIES` vive solo en código (`lib/domain/evidence-governance.ts:36`).
No hay catálogo en base, no hay `CHECK`, no hay índice sobre `evidence_type` en
`evidences` — sí lo hay en `textile_evidences`.

### 3.2 · Aprobación

Ambos modelos separan *registrar* de *decidir*, y ambos lo restringen a
`admin`/`quality`. PCR guarda `reviewed_at`, `reviewed_by`, `review_comment`, y
exige motivo al rechazar (`EVIDENCE_REJECT_COMMENT_REQUIRED`). Textiles guarda
`reviewed_at`, `reviewed_by`, `review_notes`.

El lenguaje es deliberadamente prudente en los dos: `valid` se presenta como
**«Aceptada internamente»**, nunca como «aprobada» ni «cumple». Eso está bien y
no hay que tocarlo.

### 3.3 · Un enum que promete más de lo que el disparador acepta

`evidence_target_type` declara **11** valores:

```
supplier · input_batch · production_order · output_batch · material ·
product · product_family · document · requirement · site · customer_requirement
```

Pero `validate_evidence_link_org()` solo resuelve **9**. `document` y
`requirement` caen en el `else` y provocan:

> `El tipo de destino % aún no está disponible para enlaces de evidencia`

Es decir: el esquema anuncia una capacidad que la escritura rechaza. Esto ya se
encontró durante QUALITY-12.2D, cuando un adaptador que intentaba enlazar
evidencias a documentos devolvía siempre cero filas. La conclusión entonces fue
la correcta —no inventar la relación— y sigue siéndolo. Lo que queda pendiente
es **decidir**: o se implementa el destino, o se retira del enum.

### 3.4 · Evidencia ↔ lote: dos mecanismos, y solo uno cuenta

En PCR hay **dos formas** de que una evidencia toque un lote, y no son
equivalentes:

**Vía A · `evidence_links`.** Asociación genérica a `output_batch`,
`input_batch`, `production_order`, `supplier`, `material`, `product`,
`product_family`. Es lo que la persona usa desde el panel de evidencias.

**Vía B · dos claves ajenas en `materials`.** `origin_support_evidence_id` y
`reclassification_evidence_id`.

**Solo la vía B entra en el cálculo.** `calculate_recycled_content` hace
exactamente dos `left join` contra `evidences`, ambos por esas dos columnas.
`evidence_links` no aparece en la función.

La vista `v_output_batch_evidence_matrix` lo dice con todas las letras: marca
`is_required_for_defensibility = true` **únicamente** en las dos ramas que salen
de esas claves ajenas, y `false` en las siete ramas que salen de
`evidence_links`.

De ahí se sigue algo que conviene decir en voz alta: **una persona puede
enlazar diez evidencias a un lote de salida y el porcentaje no se mueve un
decimal.** El comportamiento es correcto —la matriz lo distingue honestamente—
pero la interfaz no transmite que hay un carril que cuenta y otro que acompaña.

Y hay una consecuencia de granularidad: la evidencia que cuenta está en el
**material**, no en el lote. Todos los lotes que compartan un material comparten
su soporte de origen. Si mañana se quisiera soportar «este lote sí, aquel no»,
haría falta un modelo distinto, no un campo más.

---

## 4 · Las dos cadenas de trazabilidad

| | PCR | Textiles |
|---|---|---|
| Entrada | `input_batches` | `textile_input_lots` |
| Orden | `production_orders` | `textile_production_orders` |
| Consumo | `batch_consumption` | `textile_order_consumptions` |
| Salida | `output_batches` | `textile_output_lots` |
| Composición del lote de salida | `batch_composition` (masa en kg, **manual**) | — |
| Reconsumo interno de salida | `output_batch_consumption` | — |
| Unidad | **kg fijo** | `unit` **texto libre** por lote y por consumo |

### 4.1 · La unidad libre y la guarda condicional

En Textiles la unidad es un campo de texto. El formulario lo dice sin rodeos:

> `{ key: "unit", label: "Unidad", type: "text", placeholder: "m, kg, units, rollos…" }`
> `help: "Sin conversión automática: mantén consistencia manual"`

`guard_textile_lot_overconsumption()` compara consumo contra recibido **solo si
las cadenas de unidad coinciden** tras `lower(trim(…))`. Si no coinciden, la
guarda deja pasar la fila sin comprobar nada. Un consumo en `"kilogramos"`
contra un lote en `"kg"` no se valida.

El sistema es honesto al respecto: `v_textile_input_lot_balance` expone
`other_unit_consumptions_count` y el dominio emite un aviso `unit_mismatch`
diciendo que esos consumos «no son comparables». Pero **avisar no es impedir**,
y el saldo que se enseña ignora esa masa.

### 4.2 · Una guarda bloquea de verdad y la otra tiene una carrera

PCR: `batch_consumption_total_balance_guard()` **bloquea la fila** del lote
(`for update`) antes de sumar. Dos consumos simultáneos se serializan y el
segundo ve el saldo real. Además hay tres capas: validación en la interfaz,
relectura en la acción de servidor (`server/actions/traceability.ts:590`), y la
guarda transaccional con el candado, que tiene la última palabra.

Textiles: `guard_textile_lot_overconsumption()` **no bloquea nada**. Lee, suma,
compara. Dos consumos concurrentes sobre el mismo lote pueden leer ambos el
mismo total previo y pasar los dos.

No he reproducido esa carrera —hacerlo exige escrituras de negocio concurrentes,
y este sprint es de inspección—, pero la ausencia de `for update` frente a su
presencia deliberada en el gemelo de PCR es un hecho del código, no una
sospecha.

---

## 5 · El grafo de verdad del porcentaje reciclado

### 5.1 · Dónde vive

En **una sola función SQL**: `calculate_recycled_content(output_batch_id,
methodology_id)`, `security definer`, `search_path = public`. No hay una segunda
implementación en TypeScript. Eso es una virtud del diseño actual y conviene
preservarla.

### 5.2 · La fórmula, exactamente

```
denominador = Σ batch_composition.mass_kg   del lote de salida
numerador   = Σ mass_kg de los componentes que superan las reglas 1..7
porcentaje  = round(numerador / denominador * 100, 4)
```

`produced_quantity_kg` **no es denominador**. Solo alimenta una advertencia si
se aparta de la composición más allá de la tolerancia. Los consumos de la orden
tampoco son denominador: solo generan `mass_balance_out_of_tolerance`.

`batch_composition.mass_kg` se **teclea a mano** por lote de salida. No se
deriva de `batch_consumption`. Por eso el descuadre entre lo consumido y lo
compuesto es un aviso y no un error: el sistema no puede saber cuál de los dos
números es el bueno.

### 5.3 · Las puertas de evidencia

Un componente cuenta si —y solo si:

- **reclasificado**: destino `preconsumer_valid` + justificación + evidencia +
  `status = 'valid'` + `archived_at IS NULL` + `reclassified_by` no nulo;
- **no reclasificado y la metodología exige origen**:
  `origin_support_evidence_id` no nulo + `status = 'valid'` +
  `archived_at IS NULL`.

### 5.4 · El hallazgo: la vigencia no entra en el cálculo

Comprobado, no supuesto:

```
¿aparece valid_until en calculate_recycled_content?  → NO
¿qué funciones del esquema leen evidences.valid_until? → ninguna de PCR
¿qué vistas leen valid_until? → v_quality_supplier_scope_status,
                                v_quality_approved_supplier_list  (Quality)
```

`evidences.valid_until` se **escribe** (formulario), se **muestra** (`vigente
hasta …` en la lista) y **no se lee nunca** para decidir nada. No hay
`pg_cron` instalado. No hay disparador ni trabajo programado que pase una
evidencia a `expired`. Ese estado existe en el enum y solo lo puede fijar una
persona a mano.

Consecuencia: **una evidencia de origen caducada sigue aportando masa al
porcentaje reciclado indefinidamente**, y la matriz de evidencias la marca
`is_valid_for_defensibility = true`, porque esa columna se calcula como
`status = 'valid' AND archived_at IS NULL` — sin mirar la fecha.

Textiles sí evalúa la vigencia, en lectura:
`isTextileEvidenceExpired(validUntil, today)` en
`lib/domain/textiles-evidences.ts:243`.

Esto es una brecha real y demostrable, y a mi juicio la de mayor consecuencia de
todo el discovery: afecta al número que el producto existe para defender.

### 5.5 · Lo que se congela

El resultado se inserta en `recycled_content_calculations` con
`methodology_rules_snapshot` (las reglas congeladas), el desglose por componente
con su `exclusion_reason`, los `warning_codes` y el `calculated_by` real. El
nivel de defendibilidad se deriva:

- `preliminary` — sin consumos, o algún lote de entrada sin proveedor, o
  reciclado cero, o toda la masa elegible excluida;
- `with_warnings` — hay avisos;
- `defensible` — ninguno de los anteriores.

Este diseño —una foto inmutable con las reglas dentro— es sólido y no debería
tocarse en la integración.

### 5.6 · Textiles no calcula nada

Búsqueda exhaustiva de columnas con `recycl` en el esquema. En el lado textil
solo hay **declaraciones booleanas**:

- `textile_materials.recycled_claim`
- `textile_reference_fiber_composition.is_recycled_declared`
- `textile_fiber_types.is_recycled_option`

Ni masa, ni porcentaje calculado, ni foto, ni defendibilidad. Lo único
cuantitativo es `textile_reference_fiber_composition.percentage`, que es
composición de fibras declarada por referencia, validada solo por sumar
100 ± 0,5 (`lib/domain/textiles-products.ts:112-114`).

**PCR calcula; Textiles declara.** No hay un grafo de verdad común que unificar,
porque en Textiles todavía no existe. Cualquier plan que hable de «unificar el
cálculo» tiene que empezar por reconocer que en un lado hay que construirlo.

---

## 6 · Búsqueda y escala

### 6.1 · El hecho que ordena todo lo demás

`supabase/config.toml:16` → `max_rows = 1000`.

PostgREST devuelve como máximo mil filas. **No es un error: es una respuesta
correcta y truncada.** Una lista sin `.range()` que consulte 1 200 proveedores
recibe 1 000 y muestra 1 000, sin ninguna señal.

Es exactamente la forma de fallar que se corrigió en QUALITY-12.2F, cuando la
consola de plataforma convirtió una lectura denegada en «todavía no hay
consumo». Aquí la lectura no está denegada, está cortada; el efecto en pantalla
es el mismo: un dato incompleto con aspecto de dato completo.

### 6.2 · Quién pagina y quién no

Recuento por fichero de la capa de datos:

| Fichero | `.range(` | `.limit(` | `ilike` | `count:` |
|---|---|---|---|---|
| `lib/db/catalog.ts` (PCR) | 4 | 0 | 4 | 4 |
| `lib/db/traceability.ts` (PCR) | 3 | 3 | 7 | 9 |
| `lib/db/inventory.ts` (PCR) | 2 | 0 | 2 | 3 |
| `lib/db/evidences.ts` (PCR) | 1 | 0 | 1 | 1 |
| `lib/db/textiles-catalogs.ts` | **0** | **0** | **0** | 2 |
| `lib/db/textiles-products.ts` | **0** | **0** | **0** | **0** |
| `lib/db/textiles-traceability.ts` | **0** | **0** | **0** | **0** |
| `lib/db/textiles-evidences.ts` | **0** | 5 ¹ | **0** | 1 |

¹ Los cinco `.limit()` de `textiles-evidences.ts` (líneas 586, 605, 626, 643,
723) son de limpieza de intenciones de subida, no de listados.

### 6.3 · Por tipo de entidad

| # | Entidad | Módulo | Filtrado | Paginación | Búsqueda |
|---|---|---|---|---|---|
| 1 | Proveedores | PCR | servidor | sí (20/pág) | `ilike` en servidor |
| 2 | Materiales | PCR | servidor | sí | `ilike` en servidor |
| 3 | Productos / familias | PCR | servidor | sí | `ilike` en servidor |
| 4 | Evidencias | PCR | servidor | sí | `ilike` en servidor |
| 5 | Lotes / órdenes | PCR | servidor | sí | `ilike` en servidor |
| 6 | Proveedores | Textiles | **ninguno** | **ninguna** | **ninguna** |
| 7 | Materiales / componentes / procesos / fibras | Textiles | **ninguno** | **ninguna** | **ninguna** |
| 8 | Referencias / productos / colecciones | Textiles | **ninguno** | **ninguna** | **ninguna** |
| 9 | Lotes de entrada / órdenes / lotes de salida | Textiles | **ninguno** | **ninguna** | **ninguna** |
| 10 | Evidencias | Textiles | servidor (`eq` tipo/estado) | **ninguna** | **ninguna** |

`components/domain/textiles/catalog-manager.tsx` (356 líneas) no contiene ni
`search`, ni `filter`, ni `slice`, ni paginación de cliente. No es que el
filtrado se haya movido al navegador: **no existe**.

### 6.4 · Riesgo estimado por volumen

| Filas por empresa | PCR | Textiles |
|---|---|---|
| ~100 | correcto | correcto, aunque sin forma de encontrar nada |
| ~1 000 | correcto | **límite exacto de PostgREST**; la lista deja de crecer |
| ~10 000 | correcto | **muestra 1 000 y calla**; el resto es invisible en la interfaz |

Los exportadores (`lib/export/adapters/textiles.ts`,
`textiles-extended.ts`) tampoco tienen `.limit(` ni `.range(` ni tope de filas.
Heredan el mismo corte.

`listAdoptableSuppliers` (`lib/db/quality-suppliers.ts:982`), que alimenta la
adopción de proveedores hacia Quality, también consulta sin cota las dos tablas
de proveedores.

### 6.5 · Índices

Los índices únicos `(organization_id, name)` de `textile_suppliers`,
`textile_materials`, `textile_components` y `textile_processes` sirven bien el
`order by name` dentro de la empresa. La ordenación no es el problema.

Lo que **no** existe en ninguna parte del esquema es un índice de texto
(`pg_trgm`, `gin`). Si se añade búsqueda por `ilike '%…%'` habrá recorrido
secuencial. A las escalas de esta tabla eso probablemente no importe todavía,
pero conviene decidirlo, no descubrirlo.

Dos asimetrías menores y ciertas: `textile_evidences` tiene
`(organization_id, evidence_type)`; `evidences` **no** tiene índice por
`evidence_type` aunque su lista filtra por él.

---

## 7 · Temporalidad de las evidencias

| Pregunta | PCR | Textiles |
|---|---|---|
| ¿Se registra desde cuándo vale? | no | `valid_from` |
| ¿Se registra hasta cuándo vale? | `valid_until` | `valid_until` |
| ¿Se comprueba la coherencia de fechas? | no | `CHECK (valid_from <= valid_until)` |
| ¿Alguien evalúa el vencimiento? | **nadie** | sí, en lectura |
| ¿Hay caducidad automática? | no (no hay `pg_cron`) | no |
| ¿La vigencia afecta a algún cálculo? | **no** | no hay cálculo que afectar |
| ¿Se conserva la fecha de revisión? | `reviewed_at` | `reviewed_at` |
| ¿El archivado es reversible? | `archived_at` nulable, ortogonal | `archived` es un estado; entrar pierde el estado anterior |

El archivado ortogonal de PCR es el mejor de los dos diseños: saber que una
evidencia estaba *aceptada* y luego se archivó es información que el modelo
textil pierde al sobrescribir el estado.

---

## 8 · Veredicto de inventario

### 8.1 · Lo que hay

**No existe ninguna tabla de movimientos, existencias o ajustes.** Búsqueda en
todo el esquema por `ship|dispatch|sale|deliver|scrap|waste|merma|adjust`:
ningún resultado pertinente.

Todo el inventario son **tres vistas derivadas** (migración 0105) más una
cuarta del lado textil:

- `v_input_batch_inventory` — `recibido − consumido_en_producción`
- `v_material_inventory` — agregación de la anterior por material
- `v_output_batch_inventory` — `producido − reconsumido_internamente`
- `v_textile_input_lot_balance` — `recibido − consumido` (misma unidad)

### 8.2 · Materia prima → `READY_WITH_EXISTING_TRUTH`

Ambos términos son hechos registrados por una persona, no estimaciones:
`input_batches.quantity_kg` (lo que entró) y `batch_consumption.mass_kg` (lo que
salió a producción). Y no es solo aritmética de presentación: la guarda
transaccional con `for update` **impide** consumir más de lo que hay, con
validación en tres capas.

La salvedad, que hay que decir porque cambia el significado de la palabra
«disponible»: el **único** flujo de salida modelado es el consumo en producción.
No hay devolución a proveedor, ni merma, ni ajuste por recuento físico. Lo que
la vista llama `available_kg` es, con precisión, *«lo que aún no se ha consumido
en producción»*. Dentro del alcance de PCR eso es suficiente y correcto; como
inventario general, no lo es.

En Textiles el mismo veredicto se sostiene **solo dentro de una unidad**. Los
consumos en otra unidad ni se restan ni bloquean (§4.1), y la propia vista los
cuenta aparte en `other_unit_consumptions_count`.

### 8.3 · Producto terminado → `NOT_READY_MISSING_MOVEMENTS`

`v_output_batch_inventory` resta únicamente `output_batch_consumption`, que es
el reproceso interno de un lote de salida dentro de otro lote.

**No hay despacho, no hay venta, no hay entrega, no hay salida comercial de
ningún tipo.** Un lote producido y vendido íntegramente sigue apareciendo con su
`available_kg` completo, indefinidamente.

En Textiles es peor todavía: `textile_output_lots` tiene `quantity_produced` y
**ninguna vista de saldo**. No hay reconsumo interno, no hay balance, no hay
resta de ningún tipo. Solo existe
`v_textile_output_lot_traceability_summary`, que no es un saldo.

El veredicto no es opinable: falta la mitad de salida del movimiento. No se
puede llamar inventario a un registro que solo sabe sumar.

---

## 9 · Acoplamiento entre módulos

### 9.1 · Lo que está bien separado

- **Cero enlaces cruzados.** Ninguna vista de `/textiles/**` enlaza a una ruta
  de PCR.
- **Cero importaciones cruzadas.** Ningún fichero de Textiles importa
  `@/lib/db/traceability`, `catalog`, `evidences`, `recycled`, `inventory`,
  `genealogy` ni `audit-support`.
- **`traceability_6632` aparece en solo 9 sitios** fuera de migraciones, y todos
  son legítimos: el catálogo canónico de módulos, las guardas de acceso, y
  discriminadores explícitos de módulo. No hay una sola cadena hardcodeada
  suelta.

Esto es mejor de lo que el encargo anticipaba. La separación lógica ya se hizo,
y se hizo bien.

### 9.2 · El acoplamiento que sí queda: el espacio de URLs

`(cpr)` es un **grupo de rutas** de Next.js: los paréntesis no aparecen en la
URL. Por tanto PCR ocupa **trece espacios de nombres en la raíz**:

```
/audit-prep  /audit-support  /catalog     /dashboard   /diagnostic
/evidences   /guided-flow    /implementation  /imports  /onboarding
/recycled-content  /traceability  /trazadocs
```

Mientras Textiles vive en `/textiles/**` y Quality en `/quality/**`.

En `lib/modules/catalog.ts` esto queda a la vista:

| Módulo | `homePath` | `killSwitchEnv` |
|---|---|---|
| PCR | `/dashboard` | **`null`** |
| Textiles | `/textiles` | `TEXTILES_MODULE_ENABLED` |
| Quality | `/quality` | `QUALITY_MODULE_ENABLED` |

PCR es el único módulo funcional sin espacio de nombres propio y el único sin
interruptor global.

Funcionalmente no está roto: `app/(app)/(shell)/(cpr)/layout.tsx` llama a
`requireCprModule()` y una empresa sin PCR es redirigida a `/modules`. Pero la
asimetría tiene coste real: un módulo futuro que quiera llamar «catálogo» a su
catálogo se encuentra la raíz ocupada, y una empresa que solo tenga Textiles
navega por una aplicación cuya raíz pertenece a otro producto.

**Migrar las URLs de PCR a `/pcr/**` es un cambio grande y con consecuencias**
(marcadores, enlaces guardados, capturas de la documentación, pruebas). No es
una decisión de esta fase. Lo que sí es de esta fase es dejar registrado que la
deuda existe y cuánto mide: trece raíces.

### 9.3 · El puente que ya existe y casi nadie usa

Hallazgo no anticipado, y el más aprovechable de la sección.

`quality_external_parties` es un **registro de terceros común**, y **las dos**
tablas de proveedores lo referencian:

```
suppliers.external_party_id          → quality_external_parties
textile_suppliers.external_party_id  → quality_external_parties
    FK compuesta (organization_id, external_party_id), ON DELETE SET NULL
```

`listAdoptableSuppliers()` (`lib/db/quality-suppliers.ts:982`) ya lista los
proveedores de PCR y Textiles que **todavía no** se han incorporado a Quality, y
`suggestDuplicateParties()` sugiere duplicados por identificación fiscal o
nombre, deliberadamente **sin fusionar nada** — la nota del código lo justifica
bien: unir dos empresas tiene consecuencias en tres módulos y adivinarlo sería
peor que dejar el duplicado.

Dos observaciones honestas sobre ese puente:

1. **Es de un solo sentido.** PCR/Textiles → Quality. No hay camino de vuelta:
   una parte externa creada en Quality no aparece como proveedor en los otros
   dos.
2. **Solo se usa en dos líneas de todo el repositorio.** El mecanismo está
   construido y prácticamente sin explotar.

Cualquier plan de «proveedor único» debería partir de aquí en lugar de diseñar
un modelo nuevo. La tabla ya existe, la clave ajena ya existe, la detección de
duplicados ya existe.

---

## 10 · RLS y planes

- **Todas** las tablas de PCR y de Textiles tienen RLS habilitada y al menos una
  política.
- Sin RLS hay siete tablas, **todas de catálogo de referencia de Quality**
  (`quality_ai_sources`, `quality_automation_*`,
  `quality_management_review_input_catalog`). Ninguna es de PCR ni de Textiles.
  Queda anotado como informativo, fuera del alcance de este sprint.
- Con RLS pero sin políticas: `storage_orphan_candidates` y
  `storage_upload_intents`, que es el patrón deliberado de «solo accesible por
  `security definer`».
- El acceso por módulo se resuelve en `resolve_organization_module_access`
  (0100) con el espejo en código de `lib/modules/catalog.ts`, verificado por una
  prueba unitaria. No encontré brechas aquí.

---

## 11 · Impacto en migraciones

- Última migración aplicada: **`0141`**. Total en el repositorio: **133**
  ficheros.
- La siguiente sería **`0142`**. **Este sprint no crea ninguna.**
- Recordatorio operativo vigente: cada migración nueva debe autorizarse en las
  listas blancas de aproximadamente 21 ficheros de prueba, o `test:all` falla.
- Las migraciones `0132`–`0141` son de solo-añadir y no se tocan.

---

## 12 · Brechas, ordenadas por consecuencia

| # | Brecha | Dónde | Consecuencia | Gravedad |
|---|---|---|---|---|
| G-01 | `valid_until` no entra en el cálculo del reciclado | `calculate_recycled_content` | evidencia caducada aporta masa | **alta** |
| G-02 | Sin paginación en Textiles + corte de 1 000 filas | toda la capa `textiles-*` | datos invisibles sin aviso | **alta** |
| G-03 | Inventario de producto terminado sin salidas | `v_output_batch_inventory` | disponible siempre sobreestimado | **alta** |
| G-04 | Textiles: lotes de salida sin saldo alguno | `textile_output_lots` | no hay balance que enseñar | **alta** |
| G-05 | Guarda de sobreconsumo textil sin `for update` | `guard_textile_lot_overconsumption` | carrera entre consumos concurrentes | media-alta |
| G-06 | Unidad de texto libre desactiva la guarda | Textiles | consumo no validado ni restado | media-alta |
| G-07 | Un campo, dos vocabularios, filtro roto | `evidences.evidence_type` | evidencia digital invisible al filtro | media |
| G-08 | `document` / `requirement` en el enum, rechazados al escribir | `validate_evidence_link_org` | capacidad anunciada e inexistente | media |
| G-09 | Vía A / vía B de evidencia indistinguibles en la interfaz | panel de evidencias | expectativa de que enlazar «cuente» | media |
| G-10 | Exportadores sin tope de filas | `lib/export/adapters/textiles*.ts` | exportación truncada en silencio | media |
| G-11 | Sin índice por `evidence_type` en `evidences` | esquema PCR | filtro sin índice | baja |
| G-12 | El puente de terceros es de un solo sentido y casi sin uso | `external_party_id` | duplicación de proveedores | baja-media |
| G-13 | PCR ocupa 13 raíces de URL; sin interruptor global | `(cpr)`, `lib/modules/catalog.ts` | asimetría estructural entre módulos | baja (estructural) |

---

## 13 · Líneas de trabajo propuestas

Las tres líneas del encargo se sostienen contra los hechos encontrados. El
reparto queda así:

### PT-01 · Integridad y escala de la evidencia
G-01, G-02, G-07, G-08, G-09, G-10, G-11.

La pieza de mayor rendimiento y menor riesgo es **G-02**, porque la solución ya
existe en el repositorio: `lib/domain/pagination.ts` (`DEFAULT_PAGE_SIZE = 20`,
`MAX_PAGE_SIZE = 100`, `normalizePageQuery`, `pageRange`) es una primitiva pura y
probada que PCR usa en cuatro ficheros y Textiles nunca adoptó. No hay que
diseñar nada: hay que aplicarlo.

**G-01** es la de mayor consecuencia y **necesita una decisión de producto antes
que código**: si una evidencia vencida deja de contar, los porcentajes ya
calculados no cambian —las fotos son inmutables, y eso está bien— pero el
próximo recálculo del mismo lote puede bajar sin que nadie haya tocado nada. Eso
hay que decidirlo y comunicarlo, no deducirlo.

### PT-02 · Cálculos de trazabilidad e inventario
G-03, G-04, G-05, G-06.

Aquí hay que separar dos cosas que suenan iguales:

- **Cerrar el movimiento** (G-03, G-04) es diseño de modelo nuevo: qué es una
  salida, quién la registra, si es reversible. Es el trabajo grande.
- **Cerrar la guarda** (G-05, G-06) es acotado: añadir el candado que el gemelo
  de PCR ya tiene, y decidir si la unidad sigue siendo texto libre.

### PT-03 · Independencia de módulos
G-12, G-13.

Menos urgente y más estructural. La buena noticia es que la separación lógica ya
está hecha (§9.1) y el puente de terceros ya está construido (§9.3).

---

## 14 · Lo que este discovery NO estableció

Por rigor, y para que nadie lo dé por comprobado:

- **No reproduje la carrera de G-05.** Exige escrituras de negocio concurrentes.
  El hecho comprobado es la ausencia de `for update`, no el fallo.
- **No medí el rendimiento real.** El límite de 1 000 filas es una configuración
  verificada; el punto exacto en que las páginas se vuelven lentas no se midió.
- **No inspeccioné Production.** Por restricción explícita del encargo.
- **No cuantifiqué el volumen real de datos por empresa.** La base local no es
  representativa y no lo pretendo.
- **No verifiqué si `valid_until` se rellena en la práctica.** El hallazgo G-01
  es que *no se lee*; cuánto se escribe es otra pregunta, y no la respondí.
- **No decidí nada.** Las brechas se describen; qué se arregla, en qué orden y
  con qué alcance es del sprint siguiente.

---

## 15 · Restricciones respetadas

- No se implementó código productivo.
- No se creó ninguna migración; `0141` sigue siendo la última.
- No se tocó Production.
- No se desplegó.
- No se llamó a ningún proveedor de IA.
- No se buscaron ni manipularon credenciales.
- El único commit de este sprint es este documento.

---

## 16 · Referencias comprobadas

| Afirmación | Dónde se comprueba |
|---|---|
| `max_rows = 1000` | `supabase/config.toml:16` |
| PCR: tipo libre / lista cerrada | `components/domain/evidences/forms.tsx:99`, `physical-forms.tsx:48` |
| Filtro por lista cerrada | `app/(app)/(shell)/(cpr)/evidences/page.tsx:211` |
| El cálculo ignora `evidence_links` | `pg_get_functiondef('calculate_recycled_content')` |
| Solo dos ramas son requeridas | `pg_get_viewdef('v_output_batch_evidence_matrix')` |
| `valid_until` sin lectores | consulta sobre `pg_proc` y `pg_views` |
| Enum de 11, disparador de 9 | `pg_type`/`pg_enum` vs `validate_evidence_link_org` |
| Candado en PCR, no en Textiles | `batch_consumption_total_balance_guard` vs `guard_textile_lot_overconsumption` |
| Unidad libre | `app/(app)/(shell)/textiles/traceability/input-lots/page.tsx:80` |
| Sin tablas de movimiento | consulta sobre `information_schema.tables` |
| Sin importaciones ni enlaces cruzados | `grep` sobre `app/`, `components/`, `lib/`, `server/` |
| Puente de terceros | `pg_constraint` sobre `textile_suppliers`; `lib/db/quality-suppliers.ts:982` |
| Primitiva de paginación sin adoptar | `lib/domain/pagination.ts` |
| Trece raíces de PCR | estructura de `app/(app)/(shell)/(cpr)/` |

---

## 17 · Estado

**Fase 0 · DISCOVERY: COMPLETA.**

Brechas identificadas: 13 · Alta gravedad: 4 · Veredictos de inventario: 2 ·
Migraciones creadas: 0 · Código productivo modificado: ninguno.

Siguiente paso, y no antes de que haya decisión sobre el alcance: definir el
sprint PCR/TEXTILES PRE-INTEGRATION sobre las tres líneas de §13.
