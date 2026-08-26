# EXPORT-01.1 · Informe de implementación

## Qué se hizo

EXPORT-01 construyó el motor y lo dejó funcionando con 32 exportaciones. Este
sprint no rediseñó nada: terminó la promesa.

```
32 exportaciones  →  85
31 pendientes     →  0
```

**97 entidades clasificadas**, cada una en sus tres ejes —ficha, listado,
histórico— y ninguno en estado provisional.

## Lo primero fue contar bien

El informe de EXPORT-01 declaraba 31 pendientes. Al releer su inventario contra
el repo aparecieron **ocho más, escondidos dentro de filas marcadas
IMPLEMENTADO**: el estado de la fila decía «implementado» y una de sus columnas
decía «pendiente». Producto con ficha y sin listado. Lote con listado y sin
ficha.

Y aparecieron **seis entidades sin fila propia** que sí tienen identidad: la
revisión de proceso, la versión del mapa, la versión de metodología, la
medición, la evaluación de riesgo y la revisión documental vivían dentro de la
fila de su padre.

**45 resoluciones**, no 31. Están enumeradas una por una en
`EXPORT_01_1_PENDING_RESOLUTION.md`.

## Las decisiones que sostienen el resultado

### El inventario dejó de ser prosa

EXPORT-01 dejó el inventario en un markdown. Un markdown **no falla**: se queda
atrás en silencio mientras el registro crece, y quien lo consulte creerá que
dice la verdad.

Ahora vive en `lib/export/inventory.ts` como estructura tipada, y las pruebas lo
recorren. Una ficha prometida sin definición, una definición sin clasificar, un
motivo vacío o un padre inexistente **hacen fallar la suite**. El markdown se
sigue publicando —es lo que la gente lee— pero se **genera** desde el dato.

Tres de esas pruebas fallaron la primera vez que se ejecutaron, contra el
inventario que yo mismo acababa de escribir. Se corrigieron los textos, no las
pruebas.

### Cuatro estados finales, y ninguno es «pendiente»

`AVAILABLE`, `EMBEDDED`, `NOT_APPLICABLE`, `HISTORICAL_NOT_SUPPORTED`.

Cada uno es **una afirmación que alguien puede discutir**. «Pendiente» es una
deuda que nadie discute porque no dice nada.

### Identidad de negocio, no ubicación en la pantalla

Una acción, un control y una evaluación de riesgo se imprimían **dentro** del
PDF de su padre. Eso basta para leerlos y no basta para lo que la gente hace de
verdad con ellos: llevar UNA acción a una reunión, entregar UN control a un
auditor, adjuntar UNA evaluación a un expediente.

«Aparece dentro de X» no es razón para negar hoja propia. Sí lo es **no tener
identidad**: una fila de relación, un estado técnico.

La acción, además, es transversal de verdad: **una sola definición** sirve a la
que nació de un caso y a la que nació de un riesgo. Dos exportadores habrían
convertido una diferencia de *contexto* en una diferencia de *motor*.

### No se fabrica pasado

EXPORT-01 dejó fuera seis entidades con una razón buena —§24 prohíbe imprimir un
resultado sin saber qué supuestos regían— y una conclusión demasiado amplia: de
«no puedo afirmar que esto es histórico» se pasó a «no exporto nada», y el
usuario se quedó sin poder descargar su diagnóstico.

Son dos afirmaciones distintas. «Esto es lo que había el 3 de marzo» exige que
la base guarde esa versión. «Esto es lo que hay hoy, y lo digo» no exige nada
más que honestidad.

Cada exportación declara ahora `temporality`, y una `current` está **obligada a
explicar qué no guarda el dominio**. Su PDF lleva el aviso «Representación del
estado actual» con la fecha de generación. **28 declaraciones**, en
`EXPORT_01_1_HISTORICAL_LIMITS.md`.

Y una prueba impide la trampa evidente: clasificar algo como «sin histórico» y
no implementar nada. `HISTORICAL_NOT_SUPPORTED` **nunca** significa que falte el
PDF actual.

### Un motor, tres módulos, por parámetro

Quality tenía su documento controlado y su Lista Maestra descargables; PCR y
Textiles no. La asimetría no venía de una decisión: venía de que nadie la había
cerrado.

La definición pasa a recibir el módulo. Escribir `pcrDocumentPdf()` y
`textileDocumentPdf()` habría triplicado el mismo archivo y garantizado que
dentro de seis meses los tres dijeran cosas distintas. Una prueba comprueba que
no existen.

El maestro documental fue más delicado: sus filtros tenían que llevar **los
nombres de la pantalla**, y para eso el filtrado se movió al dominio, donde la
pantalla, el CSV y el PDF lo comparten. Es la lección directa del defecto que
EXPORT-01 encontró en la Lista Maestra de Quality.

## El defecto que solo aparece contra una base real

La validación en Staging devolvió **404** al pedir el PDF de una acción, y **200
con la tabla vacía** al pedir el listado.

`work_actions.owner_position_id` forma parte de una clave foránea **compuesta**
(MDR-42). PostgREST no la resuelve por el nombre de la columna: responde «Could
not find a relationship», el error viaja en `error` y no en `data`, y
`(data ?? [])` lo convierte en **una lista vacía**.

**No era un defecto de este sprint.** `listCaseActions` ya usaba esa forma desde
QUALITY-04, y `listCaseRequirements` la usaba para otra clave compuesta. En
producción eso significaba que la **tabla de acciones de un caso y sus requisitos
documentales aparecían vacíos** —en pantalla y en el PDF— como si el caso no
tuviera ninguna.

Nadie lo había reportado porque un fallo que se manifiesta como «no hay datos»
no se reporta. Una prueba que solo comprueba que la respuesta es 200 lo da por
bueno.

Corregido en los cuatro sitios. Dos pruebas impiden que vuelva.

## Otros arreglos que salieron por el camino

- **El botón de «Imprimir» del cálculo de soporte de PCR** abría la vista de
  impresión del navegador. Ahora descarga un PDF generado en servidor. La vista
  `/print` sigue existiendo.
- **El pasaporte textil** igual, y se conservó su vista de impresión con un
  nombre que ya no compite: «Vista de impresión».
- **`TextileCatalogManager`** acepta una clave de exportación por fila, así que
  «tiene ficha exportable» es una propiedad del catálogo y no un detalle que
  alguien recuerde repetir.
- **La ficha de empresa en el glosario**: la entidad de backoffice se llamaba
  «Organización», y el glosario de la plataforma dice **empresa**. Lo cazó la
  prueba de español.

## Lo que deliberadamente NO se hizo

**No se versionó la metodología de circularidad textil.** Sería la respuesta
correcta al límite histórico de esa evaluación —Quality ya lo resolvió así con
RO-14— pero es un cambio de dominio, no de exportación. Queda declarado.

**No se creó ninguna migración.** Exportar sigue siendo lectura.

**No se guarda ningún PDF.** Se generan bajo demanda.

**No se tocó el Preview de QUALITY-05**, aunque EXPORT-01 dejó advertido que su
clave secreta podría estar inválida. Está fuera del alcance de este sprint.

## Números

| | |
|---|---|
| Exportaciones en el registro | 32 → **85** |
| Entidades clasificadas | **97**, en tres ejes cada una |
| `AVAILABLE` · `EMBEDDED` · `NOT_APPLICABLE` · sin histórico | 118 · 95 · 50 · 28 |
| **`PENDING`** | **0** |
| Pruebas propias | **31** |
| Pruebas de EXPORT-01 (motor intacto) | **54** |
| Validación en Staging | **43**, 0 fallos |
| Regresión completa | `npm run test:all` → **exit code 0** |
| Migraciones añadidas | **0** |
