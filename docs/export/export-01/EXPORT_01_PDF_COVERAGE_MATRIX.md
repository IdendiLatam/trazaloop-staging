# EXPORT-01 · Matriz de cobertura

32 exportaciones. Cada una tiene clave, adaptador, permiso, orientación **y un
sitio donde el usuario la pulsa**. La prueba H1 falla si alguna se queda sin
botón: una exportación que nadie puede pulsar no existe.

Leyenda de composición: **PM** = Print Model común · **§27** = artefacto
heredado, mismo escritor y misma puerta, composición propia.

## Quality · sistema de gestión

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `quality.process.detail` | ficha | vertical | ficha del proceso | PM |
| `quality.process.list` | listado | vertical | `/quality/processes` | PM |
| `quality.position.detail` | ficha | vertical | cada cargo en `/quality/positions` | PM |
| `quality.position.list` | listado | vertical | `/quality/positions` | PM |
| `quality.map.detail` | ficha | **apaisado** | `/quality/map` | PM |

## Quality · documentos

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `quality.document.detail` | ficha | vertical | ficha del documento | §27 |
| `quality.master-list.list` | listado | **apaisado** | Lista Maestra (con sus 9 filtros) | §27 |

## Quality · desempeño

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `quality.objective.detail` | ficha | vertical | ficha del objetivo | PM |
| `quality.objective.list` | listado | vertical | `/quality/objectives` | PM |
| `quality.indicator.detail` | ficha | vertical | ficha del indicador | PM |
| `quality.indicator.list` | listado | vertical | `/quality/indicators` | PM |

## Quality · casos y acciones

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `quality.case.detail` | ficha | vertical | ficha del caso | PM |
| `quality.case.list` | listado | vertical | `/quality/cases` | PM |

## Quality · riesgos y oportunidades

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `quality.risk.detail` | ficha | vertical | ficha del riesgo | PM |
| `quality.risk.list` | listado | vertical | `/quality/risks` (filtro *vista*) | PM |
| `quality.opportunity.detail` | ficha | vertical | ficha de la oportunidad | PM |
| `quality.opportunity.list` | listado | vertical | `/quality/risks` (filtro *estado*) | PM |
| `quality.methodology.detail` | histórica | **apaisado** | `/quality/risks/methodology` | PM |

## PCR

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `cpr.production-order.detail` | ficha | vertical | ficha de la orden / corrida | PM |
| `cpr.production-order.list` | listado | vertical | listado de órdenes / corridas | PM |
| `cpr.output-batch.detail` | ficha | vertical | cada lote producido del listado | PM |
| `cpr.input-batch.detail` | ficha | vertical | cada lote de entrada del listado | PM |
| `cpr.product.list` | listado | vertical | `/catalog/products` | PM |
| `cpr.material.list` | listado | vertical | `/catalog/materials` | PM |
| `cpr.supplier.list` | listado | vertical | `/catalog/suppliers` | PM |
| `cpr.family.list` | listado | vertical | `/catalog/families` | PM |

## Textiles

| Clave | Tipo | Orient. | Dónde se pulsa | Comp. |
|---|---|---|---|---|
| `textiles.product.detail` | ficha | vertical | ficha del producto | PM |
| `textiles.product.list` | listado | vertical | `/textiles/products` | PM |
| `textiles.production-order.detail` | ficha | vertical | ficha de la orden | PM |
| `textiles.output-lot.detail` | ficha | vertical | ficha del lote producido | PM |
| `textiles.supplier.list` | listado | vertical | `/textiles/catalogs/suppliers` | PM |
| `textiles.evidence.list` | listado | vertical | `/textiles/evidences` | PM |

---

## Lo que queda pendiente, con clase y motivo

**31 filas**, todas clasificadas y enumeradas una por una en
`EXPORT_01_INVENTORY.md`. Agrupadas por el motivo real:

| Grupo | Filas | Por qué no en este sprint |
|---|---|---|
| TrazaDocs (PCR y textil): documento, Lista Maestra, versiones, documento textil | 4 | Comparten el motor documental de Quality. Su adaptador es el de `quality-documents.ts` con otro `module`; se dejó fuera para no multiplicar el escape de §27 antes de decidir si esos dos PDF se migran al Print Model |
| Trazabilidad y catálogos textiles: referencia, colección, lote de entrada, fibra, material, componente, proceso, proceso tercerizado | 8 | Mismo patrón que la fábrica `catalogList()`. Sin novedad arquitectónica: es escribir filas de tabla |
| Cálculos con supuestos versionados: contenido reciclado (ficha y reporte), cálculo de soporte, diagnóstico PCR, evaluación de circularidad, diagnóstico textil | 6 | Imprimir un resultado sin resolver antes **qué versión de supuestos regía** es exactamente lo que §24 prohíbe. Necesitan la decisión de verdad histórica primero |
| Paquetes de auditoría PCR: dossier, ejercicio de trazabilidad, matriz de evidencias | 3 | Ya componen paquetes de evidencia con su propia lógica de armado; un PDF es una salida más de esa composición, no un adaptador nuevo |
| Pasaporte técnico textil | 1 | Tiene ya un artefacto público compartible con su propia política de exposición. Mezclar «descarga interna» y «publicación externa» en la misma puerta es una decisión de producto |
| PCR restantes: requisito de cliente, evidencia CPR | 2 | Listados de referencia; el adaptador es mecánico |
| Quality de clase `D` con ficha propia pendiente: acción, control, cierre de periodo | 3 | **Hoy ya se exportan**, dentro del PDF de su caso, su riesgo o su periodo. Lo pendiente es una ficha *propia*, que solo tiene sentido si alguien necesita el papel suelto |
| Administrativos: datos de empresa, equipo, mis tareas, ticket de soporte | 4 | Clase `D`/administrativos: no son objetos del sistema de gestión |

Ninguno espera una decisión de arquitectura: cada uno se resuelve escribiendo un
adaptador y una entrada en el registro, salvo los seis de cálculo, que esperan
una decisión de **verdad histórica** que este sprint dejó planteada y no
resolvió.
