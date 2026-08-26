# EXPORT-01.1 · Reversión

## Sigue sin haber esquema que revertir

**Ninguna migración.** Staging y Producción siguen en **0122**. Este sprint
escribió adaptadores, definiciones de registro, botones y pruebas: todo es
código.

Se comprobó, además, que no hacía falta: las cinco consultas nuevas de la capa
de datos (`getAction`, `listActionContexts`, `listActionHistory`,
`listAllActions`, `getControl`, `getRiskAssessment`) leen tablas que 0121 y 0122
ya habían creado. Ninguna necesitó una columna nueva.

## Qué se revierte, y a qué precio

| Nivel | Acción | Consecuencia |
|---|---|---|
| Rama completa | `git revert` del merge, o no fusionar | La plataforma vuelve a las 32 exportaciones de EXPORT-01. Nada más cambia |
| Una exportación | Quitar su entrada del registro **y** su clasificación del inventario | Su clave responde 404. Las pruebas `A2`–`A5` obligan a hacer las dos cosas: quitar una sin la otra falla |
| Un botón | Quitarlo de la pantalla | `H1` falla nombrando la clave huérfana: la suite obliga a retirar también la definición o a devolver el botón |

Esa obligación es deliberada. Media reversión —una clave sin botón, o un
inventario que promete una ficha que ya no existe— es peor que ninguna.

## Los cuatro cambios que tocan código existente

Son los únicos puntos donde una reversión parcial exige mirar dos veces.

**1 · `listDocumentMaster` recibe el módulo.** Antes filtraba por `"cpr"`
literal; ahora es un parámetro con ese mismo valor por defecto. El maestro de la
aplicación CPR lo llama sin argumento, así que su comportamiento es idéntico.
Revertirlo obliga a escribir una segunda consulta para el maestro textil.

**2 · El filtrado del maestro se movió al dominio.** `applyFilters` en la server
action delega en `filterDocumentMaster`. Revertir el movimiento sin revertir el
maestro textil dejaría dos filtrados que pueden divergir — que es exactamente el
defecto que EXPORT-01 encontró.

**3 · `documentDetail` es una fábrica.** La definición de Quality ahora se
construye con un parámetro de módulo, igual que las de PCR y Textiles. El PDF
que produce es byte a byte el mismo: usa el mismo `renderDocumentPdf`.

**4 · Dos botones de «Imprimir» se sustituyeron por descargas reales** —el
cálculo de soporte de PCR y el pasaporte textil—. Las vistas `/print` **no se
borraron**: siguen existiendo y siguen funcionando por URL. Revertir el botón
deja al usuario con la vista de impresión de antes.

**5 · `TextileCatalogManager` acepta `rowExportKey`.** Es opcional; sin él, el
gestor se comporta exactamente como antes.

## Tres pruebas ajenas se ajustaron

No se debilitaron: se hicieron más precisas. Si alguien revierte este sprint, hay
que revertirlas también.

| Prueba | Antes | Ahora |
|---|---|---|
| T8 · TrazaDocs Textil #12 | Exigía el literal `.eq("module_key", "cpr")` | Exige el parámetro con defecto `"cpr"` **y** que la acción CPR lo llame sin módulo |
| T9C.1 · Pasaportes #10 | Prohibía la cadena `pdf` en la ficha del pasaporte | La prohíbe salvo el botón común, **y exige** que sea la única superficie de PDF ahí |
| EXPORT-01 · A/H/I | Analizaba las claves por bloque `export const` | Las reconoce por su forma `modulo.entidad.tipo`, que es lo que la prueba A3 ya exigía |

La de T9C.1 es la que más merece explicación: T9C.1 congeló **su propio
alcance**, no la existencia futura de un PDF. Un sprint posterior autorizado lo
añadió; la comprobación sigue impidiendo que el pasaporte se fabrique su propia
maquinaria de PDF.

## Lo que NO hay que hacer

- **No hay migración que revertir.** Si alguien propone una 0123, no hay nada
  que deshacer en la base.
- **No hay PDF que borrar.** Ninguno se guarda: se generan bajo demanda.
- **No hay dato que restaurar.** El sprint no escribió una sola fila de negocio.
