# EXPORT-01.1 · Resolución de pendientes, una por una

> Una fila por cada pendiente que existía al empezar. No una conclusión
> general: trazabilidad.

## Cuántos eran, de verdad

El informe de EXPORT-01 declaraba **31 pendientes**, y son 31 filas marcadas
`PENDIENTE` en su inventario. Pero al releer el documento contra el repo
aparecieron **8 pendientes más, escondidos dentro de filas marcadas
IMPLEMENTADO**: entidades con la ficha hecha y el listado sin hacer, o al revés.
El estado de la fila decía «implementado» y una de sus columnas decía
«pendiente».

Ese es exactamente el fallo que §32 anticipa: *no dejar Detail YES / List
PENDING*. Así que el trabajo real fueron **39 resoluciones**, no 31.

No se fuerza el número. La fuente de verdad es el repo.

Y aparecieron **tres entidades que EXPORT-01 no había separado como filas
propias** y que sí tienen identidad: la *versión del mapa*, la *versión de
metodología* y la *revisión de proceso* vivían dentro de la fila de su padre.
Hoy son filas con su propio histórico descargable.

---

## Los 31 declarados

| # | Entidad | Ruta | Por qué estaba pendiente | Resolución | Estado final |
|---|---|---|---|---|---|
| 1 | Datos de la empresa | `/settings/company` | Sin adaptador | Ficha propia; solo campos que el usuario ya ve; sin billing, tokens ni hashes | `core.company.detail` |
| 2 | Equipo / miembros | `/team` | Sin adaptador | Listado con miembros e invitaciones; **el token nunca se imprime** | `core.team.list` |
| 3 | Cierre de periodo | `/quality/objectives` | Sin adaptador | Listado histórico de cierres y reaperturas | `quality.period-closure.list` |
| 4 | Acción | — | Solo se imprimía dentro del caso | Ficha propia y **transversal**: la misma clave sirve a la acción de un caso y a la de un riesgo | `quality.action.detail` + `.list` |
| 5 | Mis tareas | `/quality/tasks` | Sin adaptador | Bandeja personal, leída con el usuario de la sesión | `quality.task.list` |
| 6 | Control | — | Solo se imprimía dentro del riesgo | Ficha propia que **dice en qué se diferencia de una acción** | `quality.control.detail` + `.list` |
| 7 | Documento TrazaDocs | `/trazadocs/[id]` | Motor no parametrizado | El adaptador de Quality pasa a recibir el módulo | `trazadocs.document.detail` |
| 8 | Maestro TrazaDocs | `/trazadocs/master` | Sin adaptador | Mismo motor; filtros con los nombres de la pantalla | `trazadocs.master-list.list` |
| 9 | Versiones TrazaDocs | `/trazadocs/[id]/versions` | Sin decisión | Clasificada: se imprime dentro de la ficha del documento | `EMBEDDED` |
| 10 | Requisito de cliente | `/catalog/customer-requirements` | Sin adaptador | Listado con vigencias | `cpr.customer-requirement.list` |
| 11 | Contenido reciclado | `/recycled-content/output-batches/[id]` | «Falta verdad histórica» | Ficha ACTUAL con componentes y exclusiones, y el límite histórico declarado | `cpr.recycled-content.detail` |
| 12 | Reporte de contenido reciclado | `/recycled-content/reports` | Sin adaptador | Listado del último cálculo por lote | `cpr.recycled-content.list` |
| 13 | Cálculo de soporte | `/audit-support/calculations/[id]` | Vista `/print` del navegador | PDF real en servidor; **sustituye al botón de imprimir** | `cpr.support-calculation.detail` |
| 14 | Matriz de evidencias | `/audit-support/output-batches/[id]/evidence-matrix` | Sin adaptador | Matriz con papel, vigencia y brechas | `cpr.evidence-matrix.detail` |
| 15 | Expediente de auditoría | `/audit-prep/dossiers/[id]` | Sin adaptador | **Histórico de verdad**: se imprime su snapshot con su huella | `cpr.dossier.detail` + `.list` |
| 16 | Ejercicio de trazabilidad | `/audit-prep/exercises/[id]` | Sin adaptador | **Histórico de verdad**: snapshot y hallazgos congelados | `cpr.exercise.detail` + `.list` |
| 17 | Evidencia CPR | `/evidences` | Sin adaptador | Listado de gobernanza; **no se convierte el adjunto** | `cpr.evidence.list` |
| 18 | Diagnóstico PCR | `/diagnostic` | «Falta verdad histórica» | Ficha de **estado actual**, con respuestas y avance; límite declarado | `cpr.diagnostic.detail` |
| 19 | Referencia textil | `/textiles/references/[id]` | Sin adaptador | Ficha con composición por fibra, materiales y componentes | `textiles.reference.detail` |
| 20 | Colección | `/textiles/products/collections` | Sin adaptador | Listado de catálogo | `textiles.collection.list` |
| 21 | Lote de entrada textil | `/textiles/traceability/input-lots` | Sin adaptador | Ficha con balance y listado | `textiles.input-lot.detail` + `.list` |
| 22 | Fibra | `/textiles/catalogs/fibers` | Sin adaptador | Listado de catálogo | `textiles.fiber.list` |
| 23 | Material textil | `/textiles/catalogs/materials` | Sin adaptador | Listado de catálogo | `textiles.material.list` |
| 24 | Componente | `/textiles/catalogs/components` | Sin adaptador | Listado de catálogo | `textiles.component.list` |
| 25 | Proceso textil | `/textiles/catalogs/processes` | Sin adaptador | Listado de catálogo | `textiles.process.list` |
| 26 | Proceso tercerizado | `/textiles/catalogs/outsourced-processes` | Sin adaptador | Listado de catálogo | `textiles.outsourced-process.list` |
| 27 | Evaluación de circularidad | `/textiles/circularity/assessments/[id]` | «Falta verdad histórica» | Ficha ACTUAL con respuestas, dimensiones y brechas; límite declarado | `textiles.circularity.detail` + `.list` |
| 28 | Pasaporte técnico | `/textiles/passports/[id]` | Decisión de producto pendiente | **Histórico de verdad**; sin lenguaje de certificación | `textiles.passport.detail` + `.list` |
| 29 | Documento TrazaDocs textil | `/textiles/trazadocs/[id]` | Motor no parametrizado | Mismo motor documental | `textiles.document.detail` + `textiles.master-list.list` |
| 30 | Diagnóstico textil | `/textiles/diagnostic/results` | «Falta verdad histórica» | Ficha de **estado actual**; límite declarado | `textiles.diagnostic.detail` |
| 31 | Ticket de soporte | `/support/[id]` | Sin adaptador | Ficha con conversación e historial de estado; **sin notas internas** | `core.support-ticket.detail` + `.list` |

---

## Los 8 escondidos dentro de filas «IMPLEMENTADO»

| # | Entidad | Qué faltaba | Resolución |
|---|---|---|---|
| 32 | Lote de entrada PCR | Listado | `cpr.input-batch.list` |
| 33 | Lote producido PCR | Listado | `cpr.output-batch.list` |
| 34 | Producto PCR | Ficha | `cpr.product.detail` |
| 35 | Material PCR | Ficha | `cpr.material.detail` |
| 36 | Proveedor PCR | Ficha | `cpr.supplier.detail` |
| 37 | Orden de producción textil | Listado | `textiles.production-order.list` |
| 38 | Lote producido textil | Listado | `textiles.output-lot.list` |
| 39 | Evidencia textil | Ficha | `textiles.evidence.detail` |

---

## Las 3 entidades que no estaban separadas

| Entidad | Antes | Ahora |
|---|---|---|
| Revisión de proceso | Fila del proceso, sin clave | `quality.process-revision.detail` — histórico real |
| Versión del mapa | Fila del mapa, sin clave | `quality.map-version.detail` — histórico real |
| Versión de metodología | Fila de la metodología, sin clave | `quality.methodology-version.detail` — **v1 se descarga como v1** |

Y dos más que el brief pedía expresamente comprobar y que tampoco tenían clave
propia:

| Entidad | Antes | Ahora |
|---|---|---|
| Medición | Tabla del indicador | `quality.measurement.detail` — con **la meta que regía** |
| Evaluación de riesgo | Bloque del riesgo | `quality.risk-assessment.detail` — con su metodología y sus controles de entonces |
| Revisión documental | Tabla del documento | `quality.document-revision.detail` |

---

## Recuento final

| | |
|---|---|
| Pendientes al empezar (declarados) | 31 |
| Pendientes ocultos encontrados | 8 |
| Entidades sin fila propia que la necesitaban | 6 |
| **Resoluciones** | **45** |
| Exportaciones al empezar | 32 |
| Exportaciones al terminar | **85** |
| **EXPORTABLE_PENDING** | **0** |
