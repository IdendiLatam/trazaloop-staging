# EXPORT-01 · Inventario de objetos de negocio

Auditoría de **las 98 rutas de página del shell** (125 páginas en `app/`
contando las públicas y las de plataforma), más los modelos de dominio y las
tablas que las alimentan. No se excluyó nada por ser difícil de renderizar.

**Clasificación:** `A` ficha · `B` listado · `C` ficha + listado ·
`D` embebido en el PDF de su padre · `E` no documentable.

**Estado:** `IMPLEMENTADO` · `PENDIENTE` (clasificado, con adaptador por
escribir) · `N/A`.

---

## 1 · Quality — sistema de gestión

| Entidad | Ruta | Clase | Detalle | Listado | Histórico | Adaptador | Estado |
|---|---|---|---|---|---|---|---|
| Proceso | `/quality/processes/[id]` | C | Sí | Sí | Revisiones en la ficha | `quality.process.detail` / `.list` | **IMPLEMENTADO** |
| Entrada / salida de proceso | — | D | — | — | — | dentro del proceso | **IMPLEMENTADO** |
| Interacción entre procesos | — | D | — | — | — | dentro del proceso y del mapa | **IMPLEMENTADO** |
| Revisión de proceso | — | D | — | — | Sí | tabla de revisiones en la ficha | **IMPLEMENTADO** |
| Mapa de procesos | `/quality/map` | A | Sí | — | Snapshot publicado | `quality.map.detail` | **IMPLEMENTADO** |
| Cargo | `/quality/positions` | C | Sí | Sí | — | `quality.position.detail` / `.list` | **IMPLEMENTADO** |
| Titular de cargo | — | D | — | — | — | columna «Titular actual» | **IMPLEMENTADO** |
| Datos de empresa | `/settings/company` | A | Pendiente | — | — | — | **PENDIENTE** |
| Equipo / miembros | `/team` | B | — | Pendiente | — | — | **PENDIENTE** |

## 2 · Quality — documentos

| Entidad | Ruta | Clase | Detalle | Listado | Histórico | Adaptador | Estado |
|---|---|---|---|---|---|---|---|
| Documento controlado | `/quality/documents/[id]` | C | Sí | — | Revisión vigente | `quality.document.detail` | **IMPLEMENTADO** |
| Lista Maestra | `/quality/documents/master` | B | — | Sí, con filtros | — | `quality.master-list.list` | **IMPLEMENTADO** |
| Revisión documental | — | D | — | — | Sí | historial en la ficha | **IMPLEMENTADO** |
| Decisión de workflow | — | D | — | — | Sí | historial en la ficha | **IMPLEMENTADO** |

## 3 · Quality — desempeño

| Entidad | Ruta | Clase | Detalle | Listado | Histórico | Adaptador | Estado |
|---|---|---|---|---|---|---|---|
| Objetivo | `/quality/objectives/[id]` | C | Sí | Sí | — | `quality.objective.detail` / `.list` | **IMPLEMENTADO** |
| Indicador | `/quality/indicators/[id]` | C | Sí | Sí | Config + mediciones | `quality.indicator.detail` / `.list` | **IMPLEMENTADO** |
| Medición | — | D | — | — | **Meta de entonces** | tabla histórica en el indicador | **IMPLEMENTADO** |
| Configuración de indicador | — | D | — | — | Sí | tabla de versiones | **IMPLEMENTADO** |
| Cierre de periodo | — | D | — | Pendiente | — | — | **PENDIENTE** |

## 4 · Quality — casos y mejora

| Entidad | Ruta | Clase | Detalle | Listado | Histórico | Adaptador | Estado |
|---|---|---|---|---|---|---|---|
| Caso | `/quality/cases/[id]` | C | Sí | Sí, filtrado | Timeline | `quality.case.detail` / `.list` | **IMPLEMENTADO** |
| No conformidad | — | A | Sí (misma ficha, encabezado propio) | Filtro `vista=nc` | Sí | `quality.case.detail` | **IMPLEMENTADO** |
| Hallazgo | — | D | — | — | — | sección del caso | **IMPLEMENTADO** |
| Requisito | — | D | — | — | — | sección de evaluación | **IMPLEMENTADO** |
| Corrección / contención | — | D | — | — | — | plan de acciones (`action_kind`) | **IMPLEMENTADO** |
| Análisis de causa | — | D | — | — | Sí | sección del caso | **IMPLEMENTADO** |
| Plan de acciones | — | D | — | — | Sí | sección del caso | **IMPLEMENTADO** |
| Acción | — | D | Pendiente ficha propia | — | — | tabla del caso y del riesgo | **PENDIENTE** |
| Verificación de eficacia | — | D | — | — | Sí | sección del caso | **IMPLEMENTADO** |
| Mis tareas | `/quality/tasks` | B | — | Pendiente | — | — | **PENDIENTE** |

## 5 · Quality — riesgos y oportunidades

| Entidad | Ruta | Clase | Detalle | Listado | Histórico | Adaptador | Estado |
|---|---|---|---|---|---|---|---|
| Riesgo | `/quality/risks/[id]` | C | Sí | Sí, filtrado | Timeline + matriz de su versión | `quality.risk.detail` / `.list` | **IMPLEMENTADO** |
| Oportunidad | `/quality/risks/opportunities/[id]` | C | Sí | Sí | Sí | `quality.opportunity.detail` / `.list` | **IMPLEMENTADO** |
| Metodología (versión) | `/quality/risks/methodology` | A | Sí | — | **v1 sigue exportándose como v1** | `quality.methodology.detail` | **IMPLEMENTADO** |
| Escalas y bandas | — | D | — | — | Sí | secciones de la metodología | **IMPLEMENTADO** |
| Matriz | — | D | Sí | — | De la versión usada | bloque `matrix` | **IMPLEMENTADO** |
| Evaluación inherente | — | D | — | — | Sí | sección propia | **IMPLEMENTADO** |
| Evaluación residual | — | D | — | — | Sí | sección propia | **IMPLEMENTADO** |
| Control | — | D | Pendiente ficha propia | — | — | tabla del riesgo | **PENDIENTE** |
| Evaluación del control | — | D | — | — | Sí | columna «Última eficacia» | **IMPLEMENTADO** |
| Tratamiento | — | D | — | — | Sí | sección propia | **IMPLEMENTADO** |
| Materialización | — | D | — | — | Sí | sección propia | **IMPLEMENTADO** |
| Señal de riesgo | — | E | — | — | — | no es un objeto documentable: sugiere mirar, no afirma nada | **N/A** |

## 6 · TrazaDocs (CPR)

| Entidad | Ruta | Clase | Detalle | Listado | Adaptador | Estado |
|---|---|---|---|---|---|---|
| Documento TrazaDocs | `/trazadocs/[id]` | C | Sí | — | reutiliza el motor de Quality | **PENDIENTE** |
| Lista Maestra TrazaDocs | `/trazadocs/master` | B | — | Sí | reutiliza el motor de Quality | **PENDIENTE** |
| Versiones | `/trazadocs/[id]/versions` | D | — | — | historial en la ficha | **PENDIENTE** |
| Vista de impresión | `/trazadocs/[id]/print` | E | — | — | ya existe; se sustituirá por la descarga | **N/A** |
| Archivo documental | `/trazadocs/files/[id]` | E | — | — | es un archivo subido, no un registro compuesto | **N/A** |

> TrazaDocs comparte el motor con Quality. Los dos exportadores de documento y
> lista maestra están **implementados para Quality** y el adaptador es el mismo;
> falta parametrizar el módulo de origen. Ver la brecha B-2 del informe.

## 7 · PCR

| Entidad | Ruta | Clase | Detalle | Listado | Adaptador | Estado |
|---|---|---|---|---|---|---|
| Orden / corrida de producción | `/traceability/production-orders/[id]` | C | Sí | Sí | `cpr.production-order.detail` / `.list` | **IMPLEMENTADO** |
| Lote de entrada | `/traceability/input-batches` | C | Sí | Pendiente listado | `cpr.input-batch.detail` | **IMPLEMENTADO** (ficha) |
| Lote producido | `/traceability/output-batches` | C | Sí, con cadena | Pendiente listado | `cpr.output-batch.detail` | **IMPLEMENTADO** (ficha) |
| Consumo | — | D | — | — | sección de la orden | **IMPLEMENTADO** |
| Genealogía / trazabilidad | `/traceability/genealogy` | D | Sí | — | sección del lote producido | **IMPLEMENTADO** |
| Producto | `/catalog/products` | B | Pendiente | Sí | `cpr.product.list` | **IMPLEMENTADO** (listado) |
| Material | `/catalog/materials` | B | Pendiente | Sí | `cpr.material.list` | **IMPLEMENTADO** (listado) |
| Proveedor | `/catalog/suppliers` | B | Pendiente | Sí | `cpr.supplier.list` | **IMPLEMENTADO** (listado) |
| Familia | `/catalog/families` | B | — | Sí | `cpr.family.list` | **IMPLEMENTADO** |
| Requisito de cliente | `/catalog/customer-requirements` | B | — | Pendiente | — | **PENDIENTE** |
| Contenido reciclado | `/recycled-content/output-batches/[id]` | A | Pendiente | — | — | **PENDIENTE** |
| Reporte de contenido reciclado | `/recycled-content/reports` | B | — | Pendiente | — | **PENDIENTE** |
| Cálculo de soporte | `/audit-support/calculations/[id]` | A | Pendiente | — | ya tiene vista `/print` | **PENDIENTE** |
| Matriz de evidencias | `/audit-support/output-batches/[id]/evidence-matrix` | A | Pendiente | — | — | **PENDIENTE** |
| Dossier de auditoría | `/audit-prep/dossiers/[id]` | C | Pendiente | Pendiente | — | **PENDIENTE** |
| Ejercicio de trazabilidad | `/audit-prep/exercises/[id]` | C | Pendiente | Pendiente | — | **PENDIENTE** |
| Evidencia CPR | `/evidences` | B | — | Pendiente | — | **PENDIENTE** |
| Diagnóstico | `/diagnostic` | A | Pendiente | — | — | **PENDIENTE** |
| Importación | `/imports/[id]` | E | — | — | es un proceso técnico, no un registro de negocio | **N/A** |
| Flujo guiado | `/guided-flow` | E | — | — | es una ayuda de navegación | **N/A** |
| Panel | `/dashboard` | E | — | — | agrega lo que ya se exporta por separado | **N/A** |
| Onboarding | `/onboarding` | E | — | — | no es un objeto de negocio | **N/A** |

## 8 · Textiles

| Entidad | Ruta | Clase | Detalle | Listado | Adaptador | Estado |
|---|---|---|---|---|---|---|
| Producto textil | `/textiles/products/[id]` | C | Sí | Sí | `textiles.product.detail` / `.list` | **IMPLEMENTADO** |
| Referencia | `/textiles/references/[id]` | A | Pendiente | — | — | **PENDIENTE** |
| Colección | `/textiles/products/collections` | B | — | Pendiente | — | **PENDIENTE** |
| Orden / corrida de producción | `/textiles/traceability/orders/[id]` | C | Sí | Pendiente listado | `textiles.production-order.detail` | **IMPLEMENTADO** (ficha) |
| Lote producido | `/textiles/traceability/output-lots/[id]` | C | Sí, con consumos | Pendiente listado | `textiles.output-lot.detail` | **IMPLEMENTADO** (ficha) |
| Lote de entrada | `/textiles/traceability/input-lots` | C | Pendiente | Pendiente | — | **PENDIENTE** |
| Consumo | — | D | — | — | sección de la orden | **IMPLEMENTADO** |
| Etapa de proceso | — | D | — | — | sección de la orden | **IMPLEMENTADO** |
| Proveedor textil | `/textiles/catalogs/suppliers` | B | — | Sí | `textiles.supplier.list` | **IMPLEMENTADO** |
| Evidencia textil | `/textiles/evidences/[id]` | C | Pendiente | Sí | `textiles.evidence.list` | **IMPLEMENTADO** (listado) |
| Fibra | `/textiles/catalogs/fibers` | B | — | Pendiente | — | **PENDIENTE** |
| Material textil | `/textiles/catalogs/materials` | B | — | Pendiente | — | **PENDIENTE** |
| Componente | `/textiles/catalogs/components` | B | — | Pendiente | — | **PENDIENTE** |
| Proceso textil | `/textiles/catalogs/processes` | B | — | Pendiente | — | **PENDIENTE** |
| Proceso tercerizado | `/textiles/catalogs/outsourced-processes` | B | — | Pendiente | — | **PENDIENTE** |
| Evaluación de circularidad | `/textiles/circularity/assessments/[id]` | C | Pendiente | Pendiente | — | **PENDIENTE** |
| Pasaporte técnico | `/textiles/passports/[id]` | A | Pendiente | — | ya tiene vista `/print` y enlace público | **PENDIENTE** |
| Documento TrazaDocs textil | `/textiles/trazadocs/[id]` | C | Pendiente | Pendiente | mismo motor documental | **PENDIENTE** |
| Diagnóstico textil | `/textiles/diagnostic/results` | A | Pendiente | — | — | **PENDIENTE** |

## 9 · Transversal y backoffice

| Entidad | Ruta | Clase | Motivo | Estado |
|---|---|---|---|---|
| Perfil | `/settings/profile` | E | Datos de la persona, no registro de empresa | **N/A** |
| Selector de módulos | `/modules` | E | Navegación | **N/A** |
| Selector de empresa | `/select-org` | E | Navegación | **N/A** |
| Ticket de soporte | `/support/[id]` | A | Es un registro con historia; exportable | **PENDIENTE** |
| Organización (plataforma) | `/platform/organizations/[id]` | A | Backoffice global | **N/A por diseño** |
| Soporte (plataforma) | `/platform/support/[id]` | A | Backoffice global | **N/A por diseño** |
| Plantillas TrazaDocs (plataforma) | `/platform/trazadocs/[id]` | A | Backoffice global | **N/A por diseño** |
| Implementación / feedback | `/implementation` | E | Herramienta interna de seguimiento | **N/A** |

> **Backoffice (§10).** Las tres rutas de `/platform` administran datos de
> TODAS las empresas. Exportarlas produciría un PDF con información
> multiempresa, y el principio EX-10 dice que un PDF no concede permisos
> nuevos. Quedan **fuera por diseño**, no por olvido: si más adelante se
> necesita un registro administrativo, tendrá que ser una exportación con su
> propio permiso de plataforma y su propia clave.

---

## Recuento

| | |
|---|---|
| Rutas de página del shell auditadas | **98** |
| Filas de entidad clasificadas | **94** |
| Clasificadas como no documentables (`E` / backoffice) | **14**, cada una con motivo |
| Filas con exportación disponible hoy | **49** |
| Exportadores en el registro | **85** |
| Clasificadas y pendientes de adaptador | **0** · cerradas en EXPORT-01.1 |

Las 94 filas no son 94 tablas: incluyen las entidades de clase `D`, que se
exportan **dentro** del PDF de su padre y por eso no tienen clave propia.

Ninguna entidad queda sin clasificar. Las pendientes lo están **con clase
asignada y motivo**: el trabajo que falta es escribir su adaptador sobre una
arquitectura que ya existe, no decidir si deben exportarse.
