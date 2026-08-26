# EXPORT-01.1 · Matriz de cobertura

> **Generado** desde `lib/export/inventory.ts` con
> `npx tsx scripts/export/build-coverage-docs.ts`. No se edita a mano:
> un documento de cobertura desactualizado es peor que no tenerlo, porque
> se consulta creyendo que dice la verdad.

**Estados finales.** `AVAILABLE` se descarga · `EMBEDDED` se imprime dentro
del PDF de su padre · `NOT_APPLICABLE` no es documentable, con motivo ·
`HISTORICAL_NOT_SUPPORTED` el dominio no conserva versión temporal suficiente
para reconstruir el pasado con verdad — y **nunca** significa que falte el PDF
actual.

No existe `PENDING`.

## Recuento

| | |
|---|---|
| Entidades clasificadas | **178** |
| Ejes clasificados (ficha · listado · histórico) | **534** |
| `AVAILABLE` | **203** |
| `EMBEDDED` | **221** |
| `NOT_APPLICABLE` | **63** |
| `HISTORICAL_NOT_SUPPORTED` | **47** |
| **`PENDING`** | **0** |
| Claves distintas en el registro | **150** |

## Quality

| Entidad | Ruta | Clase | Ficha | Listado | Histórico |
|---|---|---|---|---|---|
| Proceso | `/quality/processes/[id]` | C | **AVAILABLE** · `quality.process.detail` | **AVAILABLE** · `quality.process.list` | **AVAILABLE** · `quality.process-revision.detail` |
| Entrada / salida de proceso | — | D | EMBEDDED · dentro de *Proceso* | EMBEDDED · dentro de *Proceso* | EMBEDDED · dentro de *Revisión de proceso* |
| Interacción entre procesos | — | D | EMBEDDED · dentro de *Proceso* | EMBEDDED · dentro de *Mapa de procesos* | EMBEDDED · dentro de *Versión del mapa* |
| Revisión de proceso | — | A | **AVAILABLE** · `quality.process-revision.detail` | EMBEDDED · dentro de *Proceso* | **AVAILABLE** · `quality.process-revision.detail` |
| Mapa de procesos | `/quality/map` | A | **AVAILABLE** · `quality.map.detail` | N/A | **AVAILABLE** · `quality.map-version.detail` |
| Versión del mapa | `/quality/map` | A | **AVAILABLE** · `quality.map-version.detail` | EMBEDDED · dentro de *Mapa de procesos* | **AVAILABLE** · `quality.map-version.detail` |
| Cargo | `/quality/positions` | C | **AVAILABLE** · `quality.position.detail` | **AVAILABLE** · `quality.position.list` | **AVAILABLE** · `quality.position-profile.detail` |
| Titular de cargo | — | D | EMBEDDED · dentro de *Cargo* | EMBEDDED · dentro de *Cargo* | **AVAILABLE** · `quality.position-holders.historical` |
| Documento controlado | `/quality/documents/[id]` | C | **AVAILABLE** · `quality.document.detail` | **AVAILABLE** · `quality.master-list.list` | **AVAILABLE** · `quality.document-revision.detail` |
| Lista Maestra | `/quality/documents/master` | B | N/A | **AVAILABLE** · `quality.master-list.list` | **HISTORICAL_NOT_SUPPORTED** |
| Revisión documental | — | A | **AVAILABLE** · `quality.document-revision.detail` | EMBEDDED · dentro de *Documento controlado* | **AVAILABLE** · `quality.document-revision.detail` |
| Decisión de workflow | — | D | EMBEDDED · dentro de *Revisión documental* | EMBEDDED · dentro de *Revisión documental* | EMBEDDED · dentro de *Revisión documental* |
| Objetivo | `/quality/objectives/[id]` | C | **AVAILABLE** · `quality.objective.detail` | **AVAILABLE** · `quality.objective.list` | EMBEDDED · dentro de *Objetivo* |
| Indicador | `/quality/indicators/[id]` | C | **AVAILABLE** · `quality.indicator.detail` | **AVAILABLE** · `quality.indicator.list` | **AVAILABLE** · `quality.measurement.detail` |
| Medición | — | A | **AVAILABLE** · `quality.measurement.detail` | EMBEDDED · dentro de *Indicador* | **AVAILABLE** · `quality.measurement.detail` |
| Configuración de indicador | — | D | EMBEDDED · dentro de *Indicador* | EMBEDDED · dentro de *Indicador* | EMBEDDED · dentro de *Medición* |
| Cierre de periodo | `/quality/objectives` | B | EMBEDDED · dentro de *Cierres de periodo* | **AVAILABLE** · `quality.period-closure.list` | **AVAILABLE** · `quality.period-closure.list` |
| Caso | `/quality/cases/[id]` | C | **AVAILABLE** · `quality.case.detail` | **AVAILABLE** · `quality.case.list` | EMBEDDED · dentro de *Caso* |
| No conformidad | `/quality/cases/[id]` | C | **AVAILABLE** · `quality.case.detail` | **AVAILABLE** · `quality.case.list` | EMBEDDED · dentro de *Caso* |
| Hallazgo | — | D | EMBEDDED · dentro de *Caso* | EMBEDDED · dentro de *Caso* | EMBEDDED · dentro de *Caso* |
| Requisito evaluado | — | D | EMBEDDED · dentro de *Caso* | EMBEDDED · dentro de *Caso* | EMBEDDED · dentro de *Caso* |
| Corrección / contención | — | A | **AVAILABLE** · `quality.action.detail` | **AVAILABLE** · `quality.action.list` | **AVAILABLE** · `quality.action.detail` |
| Análisis de causa | — | D | EMBEDDED · dentro de *Caso* | EMBEDDED · dentro de *Caso* | EMBEDDED · dentro de *Caso* |
| Plan de acciones | — | D | EMBEDDED · dentro de *Caso* | **AVAILABLE** · `quality.action.list` | EMBEDDED · dentro de *Caso* |
| Acción | — | C | **AVAILABLE** · `quality.action.detail` | **AVAILABLE** · `quality.action.list` | **AVAILABLE** · `quality.action.detail` |
| Verificación de eficacia | — | D | EMBEDDED · dentro de *Acción* | EMBEDDED · dentro de *Acción* | EMBEDDED · dentro de *Acción* |
| Mis tareas | `/quality/tasks` | B | N/A | **AVAILABLE** · `quality.task.list` | **HISTORICAL_NOT_SUPPORTED** |
| Riesgo | `/quality/risks/[id]` | C | **AVAILABLE** · `quality.risk.detail` | **AVAILABLE** · `quality.risk.list` | **AVAILABLE** · `quality.risk-assessment.detail` |
| Oportunidad | `/quality/risks/opportunities/[id]` | C | **AVAILABLE** · `quality.opportunity.detail` | **AVAILABLE** · `quality.opportunity.list` | EMBEDDED · dentro de *Oportunidad* |
| Metodología | `/quality/risks/methodology` | A | **AVAILABLE** · `quality.methodology.detail` | N/A | **AVAILABLE** · `quality.methodology-version.detail` |
| Versión de metodología | `/quality/risks/methodology` | A | **AVAILABLE** · `quality.methodology-version.detail` | EMBEDDED · dentro de *Metodología* | **AVAILABLE** · `quality.methodology-version.detail` |
| Escalas y bandas | — | D | EMBEDDED · dentro de *Versión de metodología* | EMBEDDED · dentro de *Versión de metodología* | EMBEDDED · dentro de *Versión de metodología* |
| Matriz de riesgo | — | D | EMBEDDED · dentro de *Riesgo* | EMBEDDED · dentro de *Versión de metodología* | EMBEDDED · dentro de *Evaluación residual* |
| Evaluación inherente | — | A | **AVAILABLE** · `quality.risk-assessment.detail` | EMBEDDED · dentro de *Riesgo* | **AVAILABLE** · `quality.risk-assessment.detail` |
| Evaluación residual | — | A | **AVAILABLE** · `quality.risk-assessment.detail` | EMBEDDED · dentro de *Riesgo* | **AVAILABLE** · `quality.risk-assessment.detail` |
| Control | — | C | **AVAILABLE** · `quality.control.detail` | **AVAILABLE** · `quality.control.list` | EMBEDDED · dentro de *Control* |
| Revisión de eficacia del control | — | D | EMBEDDED · dentro de *Control* | EMBEDDED · dentro de *Control* | EMBEDDED · dentro de *Control* |
| Plan de tratamiento | — | D | EMBEDDED · dentro de *Riesgo* | EMBEDDED · dentro de *Riesgo* | EMBEDDED · dentro de *Riesgo* |
| Materialización | — | D | EMBEDDED · dentro de *Riesgo* | EMBEDDED · dentro de *Riesgo* | EMBEDDED · dentro de *Riesgo* |
| Señal de riesgo | — | E | N/A | N/A | N/A |
| Unidad de la empresa | `/quality/people/structure` | B | N/A | **AVAILABLE** · `quality.org-unit.list` | **HISTORICAL_NOT_SUPPORTED** |
| Organigrama | `/quality/people/structure` | A | **AVAILABLE** · `quality.orgchart.detail` | N/A | **HISTORICAL_NOT_SUPPORTED** |
| Perfil de cargo | `/quality/people/positions/[id]` | A | **AVAILABLE** · `quality.position-profile.detail` | EMBEDDED · dentro de *Cargo* | **AVAILABLE** · `quality.position-profile.detail` |
| Función del cargo | — | D | EMBEDDED · dentro de *Perfil de cargo* | EMBEDDED · dentro de *Perfil de cargo* | EMBEDDED · dentro de *Perfil de cargo* |
| Persona | `/quality/people/[id]` | C | **AVAILABLE** · `quality.person.detail` | **AVAILABLE** · `quality.person.list` | EMBEDDED · dentro de *Persona* |
| Asignación persona–cargo | — | D | EMBEDDED · dentro de *Persona* | EMBEDDED · dentro de *Persona* | **AVAILABLE** · `quality.position-holders.historical` |
| Competencia | `/quality/people/competencies` | C | **AVAILABLE** · `quality.competency.detail` | **AVAILABLE** · `quality.competency.list` | EMBEDDED · dentro de *Perfil de cargo* |
| Nivel de competencia | `/quality/people/competencies` | D | EMBEDDED · dentro de *Competencia* | EMBEDDED · dentro de *Competencia* | EMBEDDED · dentro de *Competencia* |
| Requisito de competencia | — | D | EMBEDDED · dentro de *Perfil de cargo* | EMBEDDED · dentro de *Perfil de cargo* | EMBEDDED · dentro de *Perfil de cargo* |
| Matriz de competencias | `/quality/people/competencies/matrix` | A | **AVAILABLE** · `quality.competence-matrix.detail` | N/A | **AVAILABLE** · `quality.competence-matrix.historical` |
| Competencia demostrada | `/quality/people/[id]` | A | **AVAILABLE** · `quality.person-competence.detail` | EMBEDDED · dentro de *Persona* | **AVAILABLE** · `quality.person-competence.detail` |
| Evidencia de competencia | — | D | EMBEDDED · dentro de *Competencia demostrada* | EMBEDDED · dentro de *Persona* | EMBEDDED · dentro de *Competencia demostrada* |
| Necesidad de desarrollo | `/quality/people/development` | B | N/A | **AVAILABLE** · `quality.development-need.list` | **HISTORICAL_NOT_SUPPORTED** |
| Plan de desarrollo | `/quality/people/development` | C | **AVAILABLE** · `quality.development-plan.detail` | **AVAILABLE** · `quality.development-plan.list` | EMBEDDED · dentro de *Plan de desarrollo* |
| Item del plan de desarrollo | — | D | EMBEDDED · dentro de *Plan de desarrollo* | EMBEDDED · dentro de *Plan de desarrollo* | EMBEDDED · dentro de *Plan de desarrollo* |
| Actividad de aprendizaje | `/quality/people/development` | C | **AVAILABLE** · `quality.learning-activity.detail` | **AVAILABLE** · `quality.learning-activity.list` | EMBEDDED · dentro de *Actividad de aprendizaje* |
| Participante de actividad | — | D | EMBEDDED · dentro de *Actividad de aprendizaje* | EMBEDDED · dentro de *Actividad de aprendizaje* | EMBEDDED · dentro de *Actividad de aprendizaje* |
| Evaluación de eficacia | `/quality/people/development` | A | **AVAILABLE** · `quality.effectiveness.detail` | EMBEDDED · dentro de *Actividad de aprendizaje* | **AVAILABLE** · `quality.effectiveness.detail` |
| Ciclo de evaluación de desempeño | `/quality/people/performance` | A | **AVAILABLE** · `quality.performance-cycle.detail` | EMBEDDED · dentro de *Ciclo de evaluación de desempeño* | EMBEDDED · dentro de *Evaluación de desempeño* |
| Población del ciclo | — | D | EMBEDDED · dentro de *Ciclo de evaluación de desempeño* | EMBEDDED · dentro de *Ciclo de evaluación de desempeño* | EMBEDDED · dentro de *Ciclo de evaluación de desempeño* |
| Evaluación de desempeño | `/quality/people/performance` | A | **AVAILABLE** · `quality.performance-evaluation.detail` | EMBEDDED · dentro de *Persona* | **AVAILABLE** · `quality.performance-evaluation.detail` |
| Línea de evaluación | — | D | EMBEDDED · dentro de *Evaluación de desempeño* | EMBEDDED · dentro de *Evaluación de desempeño* | EMBEDDED · dentro de *Evaluación de desempeño* |
| Elemento de conocimiento | `/quality/people/knowledge` | C | **AVAILABLE** · `quality.knowledge.detail` | **AVAILABLE** · `quality.knowledge.list` | EMBEDDED · dentro de *Elemento de conocimiento* |
| Holder de conocimiento | — | D | EMBEDDED · dentro de *Elemento de conocimiento* | EMBEDDED · dentro de *Elemento de conocimiento* | EMBEDDED · dentro de *Elemento de conocimiento* |
| Señal de continuidad | `/quality/people/knowledge` | D | EMBEDDED · dentro de *Elemento de conocimiento* | EMBEDDED · dentro de *Elemento de conocimiento* | EMBEDDED · dentro de *Elemento de conocimiento* |
| Plan de transferencia | `/quality/people/knowledge` | A | **AVAILABLE** · `quality.transfer-plan.detail` | EMBEDDED · dentro de *Elemento de conocimiento* | **AVAILABLE** · `quality.transfer-plan.detail` |
| Actividad de transferencia | — | D | EMBEDDED · dentro de *Plan de transferencia* | EMBEDDED · dentro de *Plan de transferencia* | EMBEDDED · dentro de *Plan de transferencia* |
| Lección aprendida | `/quality/people/lessons` | C | **AVAILABLE** · `quality.lesson.detail` | **AVAILABLE** · `quality.lesson.list` | **AVAILABLE** · `quality.lesson.detail` |
| Propuesta de lección | — | D | EMBEDDED · dentro de *Lección aprendida* | EMBEDDED · dentro de *Lección aprendida* | EMBEDDED · dentro de *Lección aprendida* |
| Onboarding del sistema de gestión | `/quality/people/[id]/onboarding/[assignmentId]` | A | **AVAILABLE** · `quality.onboarding.detail` | N/A | **HISTORICAL_NOT_SUPPORTED** |
| Proveedor evaluado | `/quality/suppliers/[profileId]` | C | **AVAILABLE** · `quality.supplier.detail` | **AVAILABLE** · `quality.supplier.list` | **AVAILABLE** · `quality.supplier-approval.historical` |
| Empresa externa | — | D | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Decisión de aprobación de proveedor* |
| Sede de proveedor | `/quality/suppliers/[profileId]/sites/[siteId]` | A | **AVAILABLE** · `quality.supplier-site.detail` | EMBEDDED · dentro de *Proveedor evaluado* | **HISTORICAL_NOT_SUPPORTED** |
| Contacto de proveedor | — | D | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Proveedor evaluado* |
| Categoría de proveedor | `/quality/suppliers/categories` | B | N/A | **AVAILABLE** · `quality.supplier-category.list` | **HISTORICAL_NOT_SUPPORTED** |
| Alcance de suministro | — | D | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Proveedor evaluado* | **AVAILABLE** · `quality.supplier-approval.historical` |
| Criticidad de proveedor | — | A | **AVAILABLE** · `quality.supplier-criticality.detail` | EMBEDDED · dentro de *Proveedor evaluado* | **AVAILABLE** · `quality.supplier-criticality.detail` |
| Requisito a proveedores | `/quality/suppliers/categories` | B | N/A | **AVAILABLE** · `quality.supplier-requirement.list` | **HISTORICAL_NOT_SUPPORTED** |
| Documento de proveedor | — | D | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Evaluación de proveedor* |
| Plantilla de evaluación de proveedor | `/quality/suppliers/templates` | D | EMBEDDED · dentro de *Evaluación de proveedor* | EMBEDDED · dentro de *Evaluación de proveedor* | EMBEDDED · dentro de *Evaluación de proveedor* |
| Evaluación de proveedor | `/quality/suppliers/evaluations/[evaluationId]` | C | **AVAILABLE** · `quality.supplier-evaluation.detail` | **AVAILABLE** · `quality.supplier-evaluation.list` | **AVAILABLE** · `quality.supplier-evaluation.detail` |
| Decisión de aprobación de proveedor | — | A | **AVAILABLE** · `quality.supplier-approval.detail` | **AVAILABLE** · `quality.approved-supplier.list` | **AVAILABLE** · `quality.supplier-approval.historical` |
| Incidente de proveedor | — | D | EMBEDDED · dentro de *Proveedor evaluado* | EMBEDDED · dentro de *Desempeño de proveedor* | EMBEDDED · dentro de *Desempeño de proveedor* |
| Desempeño de proveedor | — | A | **AVAILABLE** · `quality.supplier-performance.detail` | N/A | **HISTORICAL_NOT_SUPPORTED** |
| Reevaluación pendiente de proveedor | `/quality/suppliers/reevaluations` | B | N/A | **AVAILABLE** · `quality.supplier-reevaluation.list` | **HISTORICAL_NOT_SUPPORTED** |
| Cliente del sistema de gestión | `/quality/customer-voice/customers/[profileId]` | C | **AVAILABLE** · `quality.customer.detail` | **AVAILABLE** · `quality.customer.list` | **HISTORICAL_NOT_SUPPORTED** |
| Contacto de cliente | — | D | EMBEDDED · dentro de *Cliente del sistema de gestión* | EMBEDDED · dentro de *Cliente del sistema de gestión* | EMBEDDED · dentro de *Cliente del sistema de gestión* |
| Encuesta de satisfacción | `/quality/customer-voice/surveys` | C | **AVAILABLE** · `quality.survey.detail` | **AVAILABLE** · `quality.survey.list` | **AVAILABLE** · `quality.survey-version.detail` |
| Versión de encuesta | — | A | **AVAILABLE** · `quality.survey-version.detail` | EMBEDDED · dentro de *Encuesta de satisfacción* | **AVAILABLE** · `quality.survey-version.detail` |
| Pregunta de encuesta | — | D | EMBEDDED · dentro de *Versión de encuesta* | EMBEDDED · dentro de *Versión de encuesta* | EMBEDDED · dentro de *Versión de encuesta* |
| Campaña de satisfacción | `/quality/customer-voice/campaigns/[campaignId]` | C | **AVAILABLE** · `quality.survey-campaign.detail` | **AVAILABLE** · `quality.survey-campaign.list` | **AVAILABLE** · `quality.survey-campaign.detail` |
| Invitación a encuesta | — | D | EMBEDDED · dentro de *Campaña de satisfacción* | EMBEDDED · dentro de *Campaña de satisfacción* | EMBEDDED · dentro de *Campaña de satisfacción* |
| Respuesta identificada de encuesta | — | A | **AVAILABLE** · `quality.survey-response.detail` | EMBEDDED · dentro de *Campaña de satisfacción* | **AVAILABLE** · `quality.survey-response.detail` |
| Respuesta anónima de encuesta | — | E | N/A | EMBEDDED · dentro de *Campaña de satisfacción* | N/A |
| Manifestación de cliente | `/quality/customer-voice/feedback` | C | **AVAILABLE** · `quality.customer-feedback.detail` | **AVAILABLE** · `quality.customer-feedback.list` | **HISTORICAL_NOT_SUPPORTED** |
| Queja o reclamo de cliente | `/quality/customer-voice/feedback` | C | **AVAILABLE** · `quality.customer-complaint.detail` | **AVAILABLE** · `quality.customer-complaint.list` | **HISTORICAL_NOT_SUPPORTED** |
| Tema de la voz del cliente | `/quality/customer-voice/feedback` | D | EMBEDDED · dentro de *Manifestación de cliente* | EMBEDDED · dentro de *Manifestación de cliente* | EMBEDDED · dentro de *Manifestación de cliente* |
| Métrica de satisfacción | `/quality/customer-voice` | D | EMBEDDED · dentro de *Informe de satisfacción del cliente* | EMBEDDED · dentro de *Informe de satisfacción del cliente* | EMBEDDED · dentro de *Tendencia de la voz del cliente* |
| Informe de satisfacción del cliente | `/quality/customer-voice` | B | N/A | **AVAILABLE** · `quality.customer-satisfaction.list` | **HISTORICAL_NOT_SUPPORTED** |
| Tendencia de la voz del cliente | `/quality/customer-voice` | B | N/A | **AVAILABLE** · `quality.customer-voice-trend.list` | **HISTORICAL_NOT_SUPPORTED** |
| Señal de la voz del cliente | — | D | EMBEDDED · dentro de *Informe de satisfacción del cliente* | EMBEDDED · dentro de *Informe de satisfacción del cliente* | EMBEDDED · dentro de *Cierre del periodo de satisfacción* |
| Cierre del periodo de satisfacción | `/quality/customer-voice` | A | **AVAILABLE** · `quality.customer-voice-review.detail` | EMBEDDED · dentro de *Informe de satisfacción del cliente* | **AVAILABLE** · `quality.customer-voice-review.detail` |
| Programa de auditorías | `/quality/audits/programs/[programId]` | C | **AVAILABLE** · `quality.audit-program.detail` | **AVAILABLE** · `quality.audit-program.list` | **HISTORICAL_NOT_SUPPORTED** |
| Revisión del programa de auditorías | — | D | EMBEDDED · dentro de *Programa de auditorías* | EMBEDDED · dentro de *Programa de auditorías* | EMBEDDED · dentro de *Programa de auditorías* |
| Auditoría | `/quality/audits/[auditId]` | C | **AVAILABLE** · `quality.audit.detail` | **AVAILABLE** · `quality.audit.list` | **AVAILABLE** · `quality.audit-report.detail` |
| Reprogramación de auditoría | — | D | EMBEDDED · dentro de *Auditoría* | EMBEDDED · dentro de *Auditoría* | EMBEDDED · dentro de *Auditoría* |
| Plan de auditoría | `/quality/audits/[auditId]` | A | **AVAILABLE** · `quality.audit-plan.detail` | EMBEDDED · dentro de *Auditoría* | **HISTORICAL_NOT_SUPPORTED** |
| Elemento del alcance de auditoría | — | D | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Informe de auditoría* |
| Criterio de auditoría | — | D | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Informe de auditoría* |
| Agenda de auditoría | `/quality/audits/[auditId]` | A | **AVAILABLE** · `quality.audit-agenda.detail` | EMBEDDED · dentro de *Agenda de auditoría* | **HISTORICAL_NOT_SUPPORTED** |
| Equipo auditor | — | D | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Informe de auditoría* |
| Comprobación de independencia | — | D | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Plan de auditoría* | EMBEDDED · dentro de *Plan de auditoría* |
| Checklist de auditoría | `/quality/audits/checklists` | A | **AVAILABLE** · `quality.audit-checklist.detail` | EMBEDDED · dentro de *Checklist de auditoría* | **AVAILABLE** · `quality.audit-checklist.detail` |
| Pregunta de checklist de auditoría | — | D | EMBEDDED · dentro de *Checklist de auditoría* | EMBEDDED · dentro de *Checklist de auditoría* | EMBEDDED · dentro de *Checklist de auditoría* |
| Registro de ejecución de auditoría | `/quality/audits/[auditId]` | A | **AVAILABLE** · `quality.audit-execution.detail` | EMBEDDED · dentro de *Auditoría* | **HISTORICAL_NOT_SUPPORTED** |
| Nota de auditoría | — | D | EMBEDDED · dentro de *Registro de ejecución de auditoría* | EMBEDDED · dentro de *Registro de ejecución de auditoría* | EMBEDDED · dentro de *Registro de ejecución de auditoría* |
| Muestra de auditoría | — | D | EMBEDDED · dentro de *Registro de ejecución de auditoría* | EMBEDDED · dentro de *Registro de ejecución de auditoría* | EMBEDDED · dentro de *Informe de auditoría* |
| Evidencia de auditoría | — | D | EMBEDDED · dentro de *Registro de ejecución de auditoría* | EMBEDDED · dentro de *Registro de ejecución de auditoría* | EMBEDDED · dentro de *Registro de ejecución de auditoría* |
| Hallazgo de auditoría | `/quality/audits/findings` | C | **AVAILABLE** · `quality.audit-finding.detail` | **AVAILABLE** · `quality.audit-finding.list` | EMBEDDED · dentro de *Informe de auditoría* |
| Informe de auditoría | `/quality/audits/[auditId]` | A | **AVAILABLE** · `quality.audit-report.detail` | EMBEDDED · dentro de *Auditoría* | **AVAILABLE** · `quality.audit-report.detail` |
| Seguimiento de auditorías | `/quality/audits` | B | EMBEDDED · dentro de *Seguimiento de auditorías* | **AVAILABLE** · `quality.audit-followup.list` | **HISTORICAL_NOT_SUPPORTED** |

## TrazaDocs

| Entidad | Ruta | Clase | Ficha | Listado | Histórico |
|---|---|---|---|---|---|
| Documento TrazaDocs | `/trazadocs/[id]` | C | **AVAILABLE** · `trazadocs.document.detail` | **AVAILABLE** · `trazadocs.master-list.list` | EMBEDDED · dentro de *Documento TrazaDocs* |
| Maestro de documentos TrazaDocs | `/trazadocs/master` | B | N/A | **AVAILABLE** · `trazadocs.master-list.list` | **HISTORICAL_NOT_SUPPORTED** |
| Versión de documento TrazaDocs | `/trazadocs/[id]/versions` | D | EMBEDDED · dentro de *Documento TrazaDocs* | EMBEDDED · dentro de *Documento TrazaDocs* | EMBEDDED · dentro de *Documento TrazaDocs* |
| Vista de impresión | `/trazadocs/[id]/print` | E | N/A | N/A | N/A |
| Archivo documental | `/trazadocs/files/[id]` | E | N/A | EMBEDDED · dentro de *Maestro de documentos TrazaDocs* | N/A |

## PCR

| Entidad | Ruta | Clase | Ficha | Listado | Histórico |
|---|---|---|---|---|---|
| Orden / corrida de producción | `/traceability/production-orders/[id]` | C | **AVAILABLE** · `cpr.production-order.detail` | **AVAILABLE** · `cpr.production-order.list` | EMBEDDED · dentro de *Orden / corrida de producción* |
| Lote de entrada | `/traceability/input-batches` | C | **AVAILABLE** · `cpr.input-batch.detail` | **AVAILABLE** · `cpr.input-batch.list` | EMBEDDED · dentro de *Lote de entrada* |
| Lote producido / lote final | `/traceability/output-batches` | C | **AVAILABLE** · `cpr.output-batch.detail` | **AVAILABLE** · `cpr.output-batch.list` | **AVAILABLE** · `cpr.dossier.detail` |
| Consumo | — | D | EMBEDDED · dentro de *Orden / corrida de producción* | EMBEDDED · dentro de *Orden / corrida de producción* | EMBEDDED · dentro de *Expediente de auditoría* |
| Composición del lote | — | D | EMBEDDED · dentro de *Contenido reciclado* | EMBEDDED · dentro de *Contenido reciclado* | EMBEDDED · dentro de *Expediente de auditoría* |
| Genealogía | `/traceability/genealogy` | D | EMBEDDED · dentro de *Lote producido / lote final* | EMBEDDED · dentro de *Lote producido / lote final* | **AVAILABLE** · `cpr.exercise.detail` |
| Producto | `/catalog/products` | C | **AVAILABLE** · `cpr.product.detail` | **AVAILABLE** · `cpr.product.list` | **HISTORICAL_NOT_SUPPORTED** |
| Material | `/catalog/materials` | C | **AVAILABLE** · `cpr.material.detail` | **AVAILABLE** · `cpr.material.list` | **HISTORICAL_NOT_SUPPORTED** |
| Proveedor | `/catalog/suppliers` | C | **AVAILABLE** · `cpr.supplier.detail` | **AVAILABLE** · `cpr.supplier.list` | **HISTORICAL_NOT_SUPPORTED** |
| Familia de producto | `/catalog/families` | B | EMBEDDED · dentro de *Producto* | **AVAILABLE** · `cpr.family.list` | **HISTORICAL_NOT_SUPPORTED** |
| Requisito de cliente | `/catalog/customer-requirements` | B | EMBEDDED · dentro de *Requisitos de cliente* | **AVAILABLE** · `cpr.customer-requirement.list` | **HISTORICAL_NOT_SUPPORTED** |
| Contenido reciclado | `/recycled-content/output-batches/[id]` | C | **AVAILABLE** · `cpr.recycled-content.detail` | **AVAILABLE** · `cpr.recycled-content.list` | **HISTORICAL_NOT_SUPPORTED** |
| Reporte de contenido reciclado | `/recycled-content/reports` | B | EMBEDDED · dentro de *Contenido reciclado* | **AVAILABLE** · `cpr.recycled-content.list` | **HISTORICAL_NOT_SUPPORTED** |
| Cálculo de soporte | `/audit-support/calculations/[id]` | A | **AVAILABLE** · `cpr.support-calculation.detail` | EMBEDDED · dentro de *Reporte de contenido reciclado* | **HISTORICAL_NOT_SUPPORTED** |
| Matriz de evidencias | `/audit-support/output-batches/[id]/evidence-matrix` | A | **AVAILABLE** · `cpr.evidence-matrix.detail` | EMBEDDED · dentro de *Evidencias* | **HISTORICAL_NOT_SUPPORTED** |
| Expediente de auditoría | `/audit-prep/dossiers/[id]` | C | **AVAILABLE** · `cpr.dossier.detail` | **AVAILABLE** · `cpr.dossier.list` | **AVAILABLE** · `cpr.dossier.detail` |
| Ejercicio de trazabilidad | `/audit-prep/exercises/[id]` | C | **AVAILABLE** · `cpr.exercise.detail` | **AVAILABLE** · `cpr.exercise.list` | **AVAILABLE** · `cpr.exercise.detail` |
| Evidencia | `/evidences` | B | EMBEDDED · dentro de *Evidencias* | **AVAILABLE** · `cpr.evidence.list` | **HISTORICAL_NOT_SUPPORTED** |
| Diagnóstico | `/diagnostic` | A | **AVAILABLE** · `cpr.diagnostic.detail` | N/A | **HISTORICAL_NOT_SUPPORTED** |
| Importación | `/imports/[id]` | E | N/A | N/A | N/A |
| Flujo guiado | `/guided-flow` | E | N/A | N/A | N/A |
| Panel PCR | `/dashboard` | E | N/A | N/A | N/A |
| Onboarding | `/onboarding` | E | N/A | N/A | N/A |
| Implementación / feedback | `/implementation` | E | N/A | N/A | N/A |

## Textiles

| Entidad | Ruta | Clase | Ficha | Listado | Histórico |
|---|---|---|---|---|---|
| Producto textil | `/textiles/products/[id]` | C | **AVAILABLE** · `textiles.product.detail` | **AVAILABLE** · `textiles.product.list` | **HISTORICAL_NOT_SUPPORTED** |
| Referencia | `/textiles/references/[id]` | C | **AVAILABLE** · `textiles.reference.detail` | EMBEDDED · dentro de *Producto textil* | **AVAILABLE** · `textiles.passport.detail` |
| Colección | `/textiles/products/collections` | B | EMBEDDED · dentro de *Colecciones* | **AVAILABLE** · `textiles.collection.list` | **HISTORICAL_NOT_SUPPORTED** |
| Orden / corrida de producción textil | `/textiles/traceability/orders/[id]` | C | **AVAILABLE** · `textiles.production-order.detail` | **AVAILABLE** · `textiles.production-order.list` | EMBEDDED · dentro de *Orden / corrida de producción textil* |
| Lote producido textil | `/textiles/traceability/output-lots/[id]` | C | **AVAILABLE** · `textiles.output-lot.detail` | **AVAILABLE** · `textiles.output-lot.list` | **AVAILABLE** · `textiles.passport.detail` |
| Lote de entrada textil | `/textiles/traceability/input-lots` | C | **AVAILABLE** · `textiles.input-lot.detail` | **AVAILABLE** · `textiles.input-lot.list` | **HISTORICAL_NOT_SUPPORTED** |
| Consumo textil | — | D | EMBEDDED · dentro de *Orden / corrida de producción textil* | EMBEDDED · dentro de *Orden / corrida de producción textil* | EMBEDDED · dentro de *Pasaporte técnico* |
| Etapa de proceso | — | D | EMBEDDED · dentro de *Orden / corrida de producción textil* | EMBEDDED · dentro de *Orden / corrida de producción textil* | EMBEDDED · dentro de *Pasaporte técnico* |
| Proveedor textil | `/textiles/catalogs/suppliers` | B | EMBEDDED · dentro de *Proveedores textiles* | **AVAILABLE** · `textiles.supplier.list` | **HISTORICAL_NOT_SUPPORTED** |
| Evidencia textil | `/textiles/evidences/[id]` | C | **AVAILABLE** · `textiles.evidence.detail` | **AVAILABLE** · `textiles.evidence.list` | **HISTORICAL_NOT_SUPPORTED** |
| Fibra | `/textiles/catalogs/fibers` | B | EMBEDDED · dentro de *Fibras* | **AVAILABLE** · `textiles.fiber.list` | **HISTORICAL_NOT_SUPPORTED** |
| Material textil | `/textiles/catalogs/materials` | B | EMBEDDED · dentro de *Materiales textiles* | **AVAILABLE** · `textiles.material.list` | **HISTORICAL_NOT_SUPPORTED** |
| Componente | `/textiles/catalogs/components` | B | EMBEDDED · dentro de *Componentes* | **AVAILABLE** · `textiles.component.list` | **HISTORICAL_NOT_SUPPORTED** |
| Proceso textil | `/textiles/catalogs/processes` | B | EMBEDDED · dentro de *Procesos textiles* | **AVAILABLE** · `textiles.process.list` | **HISTORICAL_NOT_SUPPORTED** |
| Proceso tercerizado | `/textiles/catalogs/outsourced-processes` | B | EMBEDDED · dentro de *Procesos tercerizados* | **AVAILABLE** · `textiles.outsourced-process.list` | **HISTORICAL_NOT_SUPPORTED** |
| Evaluación de circularidad | `/textiles/circularity/assessments/[id]` | C | **AVAILABLE** · `textiles.circularity.detail` | **AVAILABLE** · `textiles.circularity.list` | **HISTORICAL_NOT_SUPPORTED** |
| Pasaporte técnico | `/textiles/passports/[id]` | C | **AVAILABLE** · `textiles.passport.detail` | **AVAILABLE** · `textiles.passport.list` | **AVAILABLE** · `textiles.passport.detail` |
| Documento TrazaDocs textil | `/textiles/trazadocs/[id]` | C | **AVAILABLE** · `textiles.document.detail` | **AVAILABLE** · `textiles.master-list.list` | EMBEDDED · dentro de *Documento TrazaDocs textil* |
| Diagnóstico textil | `/textiles/diagnostic/results` | A | **AVAILABLE** · `textiles.diagnostic.detail` | N/A | **HISTORICAL_NOT_SUPPORTED** |

## Transversal (cuenta y soporte)

| Entidad | Ruta | Clase | Ficha | Listado | Histórico |
|---|---|---|---|---|---|
| Datos de la empresa | `/settings/company` | A | **AVAILABLE** · `core.company.detail` | N/A | **HISTORICAL_NOT_SUPPORTED** |
| Equipo / miembros | `/team` | B | N/A | **AVAILABLE** · `core.team.list` | **HISTORICAL_NOT_SUPPORTED** |
| Perfil de la persona | `/settings/profile` | E | N/A | N/A | N/A |
| Selector de módulos | `/modules` | E | N/A | N/A | N/A |
| Selector de empresa | `/select-org` | E | N/A | N/A | N/A |
| Ticket de soporte | `/support/[id]` | C | **AVAILABLE** · `core.support-ticket.detail` | **AVAILABLE** · `core.support-ticket.list` | **AVAILABLE** · `core.support-ticket.detail` |
| Empresa (backoffice de plataforma) | `/platform/organizations/[id]` | E | N/A | N/A | N/A |
| Soporte (plataforma) | `/platform/support/[id]` | E | N/A | N/A | N/A |
| Plantillas TrazaDocs (plataforma) | `/platform/trazadocs/[id]` | E | N/A | N/A | N/A |

## Motivos declarados

Cada `NOT_APPLICABLE`, cada `EMBEDDED` y cada `HISTORICAL_NOT_SUPPORTED`
lleva su motivo. Las pruebas exigen que el motivo exista, que tenga
sustancia y que no sea «no alcanzó el tiempo».

| Entidad | Eje | Estado | Motivo |
|---|---|---|---|
| Entrada / salida de proceso | Ficha | EMBEDDED | Dentro de *Proceso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Entrada / salida de proceso | Listado | EMBEDDED | Dentro de *Proceso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Entrada / salida de proceso | Histórico | EMBEDDED | Dentro de *Revisión de proceso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Interacción entre procesos | Ficha | EMBEDDED | Dentro de *Proceso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Interacción entre procesos | Listado | EMBEDDED | Dentro de *Mapa de procesos*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Interacción entre procesos | Histórico | EMBEDDED | Dentro de *Versión del mapa*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Revisión de proceso | Listado | EMBEDDED | Dentro de *Proceso*. El historial de revisiones se imprime en la ficha del proceso. |
| Mapa de procesos | Listado | NOT_APPLICABLE | Es único por empresa: no existe una colección que listar. |
| Versión del mapa | Listado | EMBEDDED | Dentro de *Mapa de procesos*. Las versiones se enumeran en la pantalla del mapa. |
| Titular de cargo | Ficha | EMBEDDED | Dentro de *Cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Titular de cargo | Listado | EMBEDDED | Dentro de *Cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Datos de la empresa | Listado | NOT_APPLICABLE | Es único por empresa: no existe una colección que listar. |
| Datos de la empresa | Histórico | HISTORICAL_NOT_SUPPORTED | La ficha de empresa guarda el valor VIGENTE de cada campo: el dominio no conserva la serie de valores anteriores, así que no se puede reconstruir cómo se llamaba o dónde estaba en una fecha pasada. |
| Equipo / miembros | Ficha | NOT_APPLICABLE | Una persona no es un registro de la empresa: sus datos son del perfil, no del sistema de gestión. |
| Equipo / miembros | Histórico | HISTORICAL_NOT_SUPPORTED | La membresía guarda estado y fecha de alta: el dominio no conserva la serie completa de cambios de rol, así que no se puede reconstruir quién tenía qué permiso en una fecha pasada. |
| Lista Maestra | Ficha | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Lista Maestra | Histórico | HISTORICAL_NOT_SUPPORTED | La Lista Maestra es una proyección del estado de HOY: no se guarda una versión de la lista por fecha. La historia de cada documento vive en sus revisiones, que sí se descargan una por una. |
| Revisión documental | Listado | EMBEDDED | Dentro de *Documento controlado*. El historial de revisiones se imprime en la ficha del documento. |
| Decisión de workflow | Ficha | EMBEDDED | Dentro de *Revisión documental*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Decisión de workflow | Listado | EMBEDDED | Dentro de *Revisión documental*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Decisión de workflow | Histórico | EMBEDDED | Dentro de *Revisión documental*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Objetivo | Histórico | EMBEDDED | Dentro de *Objetivo*. El desempeño por periodo se imprime dentro de la ficha. |
| Medición | Listado | EMBEDDED | Dentro de *Indicador*. El historial por periodos se imprime en la ficha del indicador. |
| Configuración de indicador | Ficha | EMBEDDED | Dentro de *Indicador*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Configuración de indicador | Listado | EMBEDDED | Dentro de *Indicador*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Configuración de indicador | Histórico | EMBEDDED | Dentro de *Medición*. Cada medición imprime la configuración que regía en su periodo: es ahí donde la versión importa. |
| Cierre de periodo | Ficha | EMBEDDED | Dentro de *Cierres de periodo*. Un cierre es una fila con fecha, autor y motivo: cabe entera en el listado. |
| Caso | Histórico | EMBEDDED | Dentro de *Caso*. El timeline de decisiones se imprime dentro de la ficha. |
| No conformidad | Histórico | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Hallazgo | Ficha | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Hallazgo | Listado | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Hallazgo | Histórico | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Requisito evaluado | Ficha | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Requisito evaluado | Listado | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Requisito evaluado | Histórico | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Análisis de causa | Ficha | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Análisis de causa | Listado | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Análisis de causa | Histórico | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plan de acciones | Ficha | EMBEDDED | Dentro de *Caso*. El plan es el conjunto de acciones del caso; cada acción tiene hoja propia. |
| Plan de acciones | Histórico | EMBEDDED | Dentro de *Caso*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Verificación de eficacia | Ficha | EMBEDDED | Dentro de *Acción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Verificación de eficacia | Listado | EMBEDDED | Dentro de *Acción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Verificación de eficacia | Histórico | EMBEDDED | Dentro de *Acción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Mis tareas | Ficha | NOT_APPLICABLE | Una tarea es un puntero al registro que hay que atender; el registro es el documentable. |
| Mis tareas | Histórico | HISTORICAL_NOT_SUPPORTED | La bandeja es una vista del trabajo pendiente HOY para quien la mira: no es un registro versionado. Cada tarea remite al documento o al registro que la originó, y ese sí conserva su historia. |
| Oportunidad | Histórico | EMBEDDED | Dentro de *Oportunidad*. Las evaluaciones y decisiones se imprimen dentro de la ficha. |
| Metodología | Listado | NOT_APPLICABLE | Es único por empresa: no existe una colección que listar. |
| Versión de metodología | Listado | EMBEDDED | Dentro de *Metodología*. Las versiones se enumeran en la pantalla de metodología. |
| Escalas y bandas | Ficha | EMBEDDED | Dentro de *Versión de metodología*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Escalas y bandas | Listado | EMBEDDED | Dentro de *Versión de metodología*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Escalas y bandas | Histórico | EMBEDDED | Dentro de *Versión de metodología*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Matriz de riesgo | Ficha | EMBEDDED | Dentro de *Riesgo*. La matriz se dibuja con la versión de metodología que usó la evaluación: no es un objeto aparte. |
| Matriz de riesgo | Listado | EMBEDDED | Dentro de *Versión de metodología*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Matriz de riesgo | Histórico | EMBEDDED | Dentro de *Evaluación residual*. La matriz que acompaña a una evaluación se dibuja con la versión de metodología que esa evaluación usó. |
| Evaluación inherente | Listado | EMBEDDED | Dentro de *Riesgo*. Las evaluaciones se imprimen dentro de la ficha del riesgo. |
| Evaluación residual | Listado | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Control | Histórico | EMBEDDED | Dentro de *Control*. Las revisiones de eficacia se imprimen fechadas en la ficha del control; la eficacia usada en una evaluación concreta vive en el PDF de esa evaluación, con su snapshot. |
| Revisión de eficacia del control | Ficha | EMBEDDED | Dentro de *Control*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Revisión de eficacia del control | Listado | EMBEDDED | Dentro de *Control*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Revisión de eficacia del control | Histórico | EMBEDDED | Dentro de *Control*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plan de tratamiento | Ficha | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plan de tratamiento | Listado | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plan de tratamiento | Histórico | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Materialización | Ficha | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Materialización | Listado | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Materialización | Histórico | EMBEDDED | Dentro de *Riesgo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Señal de riesgo | Ficha | NOT_APPLICABLE | Sugiere mirar; no afirma nada. No es un objeto documentable. |
| Señal de riesgo | Listado | NOT_APPLICABLE | Sugiere mirar; no afirma nada. |
| Señal de riesgo | Histórico | NOT_APPLICABLE | Sugiere mirar; no afirma nada. |
| Documento TrazaDocs | Histórico | EMBEDDED | Dentro de *Documento TrazaDocs*. El historial de revisiones se imprime dentro de la ficha del documento. |
| Maestro de documentos TrazaDocs | Ficha | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Maestro de documentos TrazaDocs | Histórico | HISTORICAL_NOT_SUPPORTED | El maestro retrata qué documentos existen hoy y en qué estado están. La historia de cada documento vive en sus revisiones, que sí se descargan una por una. |
| Versión de documento TrazaDocs | Ficha | EMBEDDED | Dentro de *Documento TrazaDocs*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Versión de documento TrazaDocs | Listado | EMBEDDED | Dentro de *Documento TrazaDocs*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Versión de documento TrazaDocs | Histórico | EMBEDDED | Dentro de *Documento TrazaDocs*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Vista de impresión | Ficha | NOT_APPLICABLE | Es una vista del navegador, no un registro. La descarga real la da la ficha del documento. |
| Vista de impresión | Listado | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Vista de impresión | Histórico | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Archivo documental | Ficha | NOT_APPLICABLE | Es un archivo subido, no un registro compuesto: el original ES la prueba y aparece en el maestro. |
| Archivo documental | Listado | EMBEDDED | Dentro de *Maestro de documentos TrazaDocs*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Archivo documental | Histórico | NOT_APPLICABLE | El archivo no se versiona como contenido: se reemplaza y queda registrado en el maestro. |
| Orden / corrida de producción | Histórico | EMBEDDED | Dentro de *Orden / corrida de producción*. La orden congela su estructura al cerrarse; su PDF imprime consumos y salidas tal como quedaron. |
| Lote de entrada | Histórico | EMBEDDED | Dentro de *Lote de entrada*. El lote conserva su fecha de recepción y su consumo acumulado. |
| Consumo | Ficha | EMBEDDED | Dentro de *Orden / corrida de producción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Consumo | Listado | EMBEDDED | Dentro de *Orden / corrida de producción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Consumo | Histórico | EMBEDDED | Dentro de *Expediente de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Composición del lote | Ficha | EMBEDDED | Dentro de *Contenido reciclado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Composición del lote | Listado | EMBEDDED | Dentro de *Contenido reciclado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Composición del lote | Histórico | EMBEDDED | Dentro de *Expediente de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Genealogía | Ficha | EMBEDDED | Dentro de *Lote producido / lote final*. La cadena se imprime dentro del lote, con la misma consulta que alimenta la pantalla. |
| Genealogía | Listado | EMBEDDED | Dentro de *Lote producido / lote final*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Producto | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda el producto vigente: no conserva la serie de cambios de su porcentaje declarado ni de su familia. Cada cálculo sobre sus lotes sí queda fechado. |
| Material | Histórico | HISTORICAL_NOT_SUPPORTED | El material guarda su clasificación VIGENTE y el soporte que la sostiene hoy: no conserva la serie de reclasificaciones anteriores. Qué clasificación se usó en un cálculo se lee en ese cálculo. |
| Proveedor | Histórico | HISTORICAL_NOT_SUPPORTED | El proveedor guarda sus datos VIGENTES: no conserva versiones anteriores de su identificación ni de su contacto. Cada lote recibido de él sí queda fechado. |
| Familia de producto | Ficha | EMBEDDED | Dentro de *Producto*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Familia de producto | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda la familia vigente: no conserva versiones anteriores de su nombre ni de los productos que agrupaba en una fecha pasada. |
| Requisito de cliente | Ficha | EMBEDDED | Dentro de *Requisitos de cliente*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Requisito de cliente | Histórico | HISTORICAL_NOT_SUPPORTED | El requisito guarda su vigencia declarada (desde y hasta): no conserva un historial de redacciones anteriores del texto acordado con el cliente. |
| Contenido reciclado | Histórico | HISTORICAL_NOT_SUPPORTED | El cálculo guarda su fecha, su resultado y sus componentes, pero el dominio no conserva una versión temporal de la metodología con la que se hizo. El expediente de auditoría sí congela ese contexto. |
| Reporte de contenido reciclado | Ficha | EMBEDDED | Dentro de *Contenido reciclado*. Es una proyección de otros registros, no una entidad con identidad propia. |
| Reporte de contenido reciclado | Histórico | HISTORICAL_NOT_SUPPORTED | Cada fila trae el ÚLTIMO cálculo de su lote: el reporte no conserva la serie de cálculos anteriores ni los supuestos que regían en cada uno. |
| Cálculo de soporte | Listado | EMBEDDED | Dentro de *Reporte de contenido reciclado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Cálculo de soporte | Histórico | HISTORICAL_NOT_SUPPORTED | El dossier de soporte se arma leyendo el estado actual de las evidencias y de la cadena. Congelarlo es exactamente lo que hace el expediente de auditoría. |
| Matriz de evidencias | Listado | EMBEDDED | Dentro de *Evidencias*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Matriz de evidencias | Histórico | HISTORICAL_NOT_SUPPORTED | La matriz se calcula con el estado de gobernanza vigente de cada evidencia. |
| Evidencia | Ficha | EMBEDDED | Dentro de *Evidencias*. El archivo original ES la prueba; la ficha de gobernanza cabe en la fila del listado y en la matriz. |
| Evidencia | Histórico | HISTORICAL_NOT_SUPPORTED | La evidencia guarda su estado de gobernanza VIGENTE con sus fechas de revisión y archivado: no conserva la serie de estados por los que pasó antes. |
| Diagnóstico | Listado | NOT_APPLICABLE | Es único por empresa: no existe una colección que listar. |
| Diagnóstico | Histórico | HISTORICAL_NOT_SUPPORTED | El diagnóstico guarda una fila por empresa con su avance: no conserva las respuestas de una autoevaluación anterior ni el cuestionario que regía entonces. |
| Importación | Ficha | NOT_APPLICABLE | Es un proceso técnico de carga, no un registro de negocio. |
| Importación | Listado | NOT_APPLICABLE | Es un proceso técnico de carga. |
| Importación | Histórico | NOT_APPLICABLE | Es un proceso técnico de carga. |
| Flujo guiado | Ficha | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Flujo guiado | Listado | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Flujo guiado | Histórico | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Panel PCR | Ficha | NOT_APPLICABLE | Agrega lo que ya se exporta por separado. |
| Panel PCR | Listado | NOT_APPLICABLE | Agrega lo que ya se exporta por separado. |
| Panel PCR | Histórico | NOT_APPLICABLE | Agrega lo que ya se exporta por separado. |
| Onboarding | Ficha | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Onboarding | Listado | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Onboarding | Histórico | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Producto textil | Histórico | HISTORICAL_NOT_SUPPORTED | El producto guarda su ficha vigente: no conserva versiones anteriores de su categoría ni de sus referencias. El pasaporte técnico sí congela un snapshot de la referencia. |
| Referencia | Listado | EMBEDDED | Dentro de *Producto textil*. Las referencias se enumeran dentro de la ficha del producto. |
| Colección | Ficha | EMBEDDED | Dentro de *Colecciones*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Colección | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda la colección vigente: no conserva versiones anteriores de su temporada, su estado ni las referencias que agrupaba antes. |
| Orden / corrida de producción textil | Histórico | EMBEDDED | Dentro de *Orden / corrida de producción textil*. La orden conserva sus fechas reales y sus etapas. |
| Lote de entrada textil | Histórico | HISTORICAL_NOT_SUPPORTED | El lote guarda su fecha de recepción y su balance ACUMULADO: el dominio no conserva una serie temporal de saldos que permita reconstruir cuánto quedaba en una fecha pasada. |
| Consumo textil | Ficha | EMBEDDED | Dentro de *Orden / corrida de producción textil*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Consumo textil | Listado | EMBEDDED | Dentro de *Orden / corrida de producción textil*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Consumo textil | Histórico | EMBEDDED | Dentro de *Pasaporte técnico*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Etapa de proceso | Ficha | EMBEDDED | Dentro de *Orden / corrida de producción textil*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Etapa de proceso | Listado | EMBEDDED | Dentro de *Orden / corrida de producción textil*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Etapa de proceso | Histórico | EMBEDDED | Dentro de *Pasaporte técnico*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Proveedor textil | Ficha | EMBEDDED | Dentro de *Proveedores textiles*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Proveedor textil | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda el proveedor vigente: no conserva versiones anteriores de sus datos de contacto ni de su alcance declarado. |
| Evidencia textil | Histórico | HISTORICAL_NOT_SUPPORTED | La evidencia guarda su estado de gobernanza VIGENTE: no conserva la serie de estados por los que pasó. El archivo original sigue siendo la prueba y no se reproduce en el PDF. |
| Fibra | Ficha | EMBEDDED | Dentro de *Fibras*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Fibra | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo base es global y guarda la fibra vigente: no conserva versiones anteriores de su familia ni de sus atributos declarados. |
| Material textil | Ficha | EMBEDDED | Dentro de *Materiales textiles*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Material textil | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda el material vigente: no conserva versiones anteriores de su composición declarada ni de su proveedor. |
| Componente | Ficha | EMBEDDED | Dentro de *Componentes*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Componente | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda el componente vigente: no conserva versiones anteriores de su separabilidad ni de su proveedor. |
| Proceso textil | Ficha | EMBEDDED | Dentro de *Procesos textiles*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Proceso textil | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda el proceso vigente: no conserva versiones anteriores de su riesgo de trazabilidad ni de los registros que se esperaban antes. |
| Proceso tercerizado | Ficha | EMBEDDED | Dentro de *Procesos tercerizados*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Proceso tercerizado | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo guarda el proceso tercerizado vigente: no conserva versiones anteriores de su proveedor ni de su riesgo declarado. |
| Evaluación de circularidad | Histórico | HISTORICAL_NOT_SUPPORTED | La evaluación guarda su fecha, su puntaje y sus respuestas, pero apunta a la metodología ACTIVA, no a una copia congelada de sus criterios. |
| Documento TrazaDocs textil | Histórico | EMBEDDED | Dentro de *Documento TrazaDocs textil*. El historial de revisiones se imprime dentro de la ficha del documento. |
| Diagnóstico textil | Listado | NOT_APPLICABLE | Es único por empresa: no existe una colección que listar. |
| Diagnóstico textil | Histórico | HISTORICAL_NOT_SUPPORTED | El diagnóstico textil guarda una fila por empresa con su avance: no conserva las respuestas de una autoevaluación anterior. |
| Perfil de la persona | Ficha | NOT_APPLICABLE | Son datos de la persona que usa Trazaloop, no un registro del sistema de gestión de la empresa. |
| Perfil de la persona | Listado | NOT_APPLICABLE | Son datos de la persona que usa Trazaloop, no un registro de la empresa. |
| Perfil de la persona | Histórico | NOT_APPLICABLE | Son datos de la persona que usa Trazaloop, no un registro de la empresa. |
| Selector de módulos | Ficha | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Selector de módulos | Listado | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Selector de módulos | Histórico | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Selector de empresa | Ficha | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Selector de empresa | Listado | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Selector de empresa | Histórico | NOT_APPLICABLE | Ayuda de navegación, no un objeto de negocio. |
| Empresa (backoffice de plataforma) | Ficha | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Empresa (backoffice de plataforma) | Listado | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Empresa (backoffice de plataforma) | Histórico | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Soporte (plataforma) | Ficha | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Soporte (plataforma) | Listado | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Soporte (plataforma) | Histórico | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Plantillas TrazaDocs (plataforma) | Ficha | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Plantillas TrazaDocs (plataforma) | Listado | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Plantillas TrazaDocs (plataforma) | Histórico | NOT_APPLICABLE | Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia. |
| Implementación / feedback | Ficha | NOT_APPLICABLE | Herramienta interna de seguimiento del acompañamiento, no un objeto del sistema de gestión. |
| Implementación / feedback | Listado | NOT_APPLICABLE | Herramienta interna de seguimiento. |
| Implementación / feedback | Histórico | NOT_APPLICABLE | Herramienta interna de seguimiento. |
| Unidad de la empresa | Ficha | NOT_APPLICABLE | Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Unidad de la empresa | Histórico | HISTORICAL_NOT_SUPPORTED | Las unidades no conservan versión temporal: se puede decir cómo está organizada la empresa hoy, no cómo lo estaba en una fecha pasada. |
| Organigrama | Listado | NOT_APPLICABLE | Es único por empresa: no existe una colección que listar. |
| Organigrama | Histórico | HISTORICAL_NOT_SUPPORTED | El organigrama se deriva de unidades, jerarquía de cargos y asignaciones. Las asignaciones sí llevan fechas —y por eso existe «Titulares de cargos en una fecha»— pero las unidades y la jerarquía no se versionan, así que la ESTRUCTURA de un día pasado no se puede reconstruir con verdad. |
| Perfil de cargo | Listado | EMBEDDED | Dentro de *Cargo*. Las versiones del perfil se enumeran dentro del propio documento del cargo. |
| Función del cargo | Ficha | EMBEDDED | Dentro de *Perfil de cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Función del cargo | Listado | EMBEDDED | Dentro de *Perfil de cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Función del cargo | Histórico | EMBEDDED | Dentro de *Perfil de cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Persona | Histórico | EMBEDDED | Dentro de *Persona*. La ficha imprime cargos ocupados, competencia declarada y evaluaciones CON sus fechas: la historia de una persona vive dentro de su ficha, no en un documento aparte. |
| Asignación persona–cargo | Ficha | EMBEDDED | Dentro de *Persona*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Asignación persona–cargo | Listado | EMBEDDED | Dentro de *Persona*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Competencia | Histórico | EMBEDDED | Dentro de *Perfil de cargo*. Lo que conserva historia no es la competencia sino el REQUISITO, y el requisito vive en la versión del perfil de cargo que lo exigía. |
| Nivel de competencia | Ficha | EMBEDDED | Dentro de *Competencia*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Nivel de competencia | Listado | EMBEDDED | Dentro de *Competencia*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Nivel de competencia | Histórico | EMBEDDED | Dentro de *Competencia*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Requisito de competencia | Ficha | EMBEDDED | Dentro de *Perfil de cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Requisito de competencia | Listado | EMBEDDED | Dentro de *Perfil de cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Requisito de competencia | Histórico | EMBEDDED | Dentro de *Perfil de cargo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Matriz de competencias | Listado | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Competencia demostrada | Listado | EMBEDDED | Dentro de *Persona*. Las decisiones de competencia de cada persona se enumeran en su ficha. |
| Evidencia de competencia | Ficha | EMBEDDED | Dentro de *Competencia demostrada*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Evidencia de competencia | Listado | EMBEDDED | Dentro de *Persona*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Evidencia de competencia | Histórico | EMBEDDED | Dentro de *Competencia demostrada*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Necesidad de desarrollo | Ficha | NOT_APPLICABLE | Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Necesidad de desarrollo | Histórico | HISTORICAL_NOT_SUPPORTED | La necesidad conserva su origen y su fecha, pero no versiones de sí misma: no hay un estado anterior que reconstruir. |
| Plan de desarrollo | Histórico | EMBEDDED | Dentro de *Plan de desarrollo*. Cada item lleva la fecha en que entró y por qué, así que la ficha del plan ya distingue lo previsto de lo incorporado durante el año. |
| Item del plan de desarrollo | Ficha | EMBEDDED | Dentro de *Plan de desarrollo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Item del plan de desarrollo | Listado | EMBEDDED | Dentro de *Plan de desarrollo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Item del plan de desarrollo | Histórico | EMBEDDED | Dentro de *Plan de desarrollo*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Actividad de aprendizaje | Histórico | EMBEDDED | Dentro de *Actividad de aprendizaje*. La actividad se registra con sus fechas reales de ejecución: lo que se imprime YA es el hecho ocurrido. |
| Participante de actividad | Ficha | EMBEDDED | Dentro de *Actividad de aprendizaje*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Participante de actividad | Listado | EMBEDDED | Dentro de *Actividad de aprendizaje*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Participante de actividad | Histórico | EMBEDDED | Dentro de *Actividad de aprendizaje*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Evaluación de eficacia | Listado | EMBEDDED | Dentro de *Actividad de aprendizaje*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Ciclo de evaluación de desempeño | Listado | EMBEDDED | Dentro de *Ciclo de evaluación de desempeño*. Los ciclos se enumeran en la pantalla de desempeño; cada uno tiene su propio documento. |
| Ciclo de evaluación de desempeño | Histórico | EMBEDDED | Dentro de *Evaluación de desempeño*. El documento del pasado es cada evaluación cerrada, que conserva lo que se firmó. |
| Población del ciclo | Ficha | EMBEDDED | Dentro de *Ciclo de evaluación de desempeño*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Población del ciclo | Listado | EMBEDDED | Dentro de *Ciclo de evaluación de desempeño*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Población del ciclo | Histórico | EMBEDDED | Dentro de *Ciclo de evaluación de desempeño*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Evaluación de desempeño | Listado | EMBEDDED | Dentro de *Persona*. Las evaluaciones de una persona se enumeran en su ficha, sujetas al permiso de desempeño. |
| Línea de evaluación | Ficha | EMBEDDED | Dentro de *Evaluación de desempeño*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Línea de evaluación | Listado | EMBEDDED | Dentro de *Evaluación de desempeño*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Línea de evaluación | Histórico | EMBEDDED | Dentro de *Evaluación de desempeño*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Elemento de conocimiento | Histórico | EMBEDDED | Dentro de *Elemento de conocimiento*. Los registros de holders llevan fecha de inicio y fin dentro de la ficha; el elemento en sí no tiene versiones. |
| Holder de conocimiento | Ficha | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Holder de conocimiento | Listado | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Holder de conocimiento | Histórico | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Señal de continuidad | Ficha | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Señal de continuidad | Listado | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Señal de continuidad | Histórico | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plan de transferencia | Listado | EMBEDDED | Dentro de *Elemento de conocimiento*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Actividad de transferencia | Ficha | EMBEDDED | Dentro de *Plan de transferencia*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Actividad de transferencia | Listado | EMBEDDED | Dentro de *Plan de transferencia*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Actividad de transferencia | Histórico | EMBEDDED | Dentro de *Plan de transferencia*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Propuesta de lección | Ficha | EMBEDDED | Dentro de *Lección aprendida*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Propuesta de lección | Listado | EMBEDDED | Dentro de *Lección aprendida*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Propuesta de lección | Histórico | EMBEDDED | Dentro de *Lección aprendida*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Onboarding del sistema de gestión | Listado | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Onboarding del sistema de gestión | Histórico | HISTORICAL_NOT_SUPPORTED | El onboarding se compone en el momento de la descarga: el perfil del cargo SÍ se lee por la fecha de la asignación, pero el desarrollo abierto, el conocimiento por recibir y las tareas pendientes solo existen en su estado de hoy. Imprimir esas tres como si fueran del pasado sería fabricarlo. |
| Empresa externa | Ficha | EMBEDDED | Dentro de *Proveedor evaluado*. La identidad empresarial se comparte con PCR y con Textiles; se imprime dentro de la ficha del papel que la usa, porque «empresa externa» sin decir en qué papel no responde ninguna pregunta. |
| Empresa externa | Listado | EMBEDDED | Dentro de *Proveedor evaluado*. La identidad empresarial se comparte con PCR y con Textiles; se imprime dentro de la ficha del papel que la usa. |
| Empresa externa | Histórico | EMBEDDED | Dentro de *Decisión de aprobación de proveedor*. Lo que cambia con el tiempo no es la empresa: son las decisiones que se tomaron sobre ella. |
| Sede de proveedor | Listado | EMBEDDED | Dentro de *Proveedor evaluado*. Las sedes de un proveedor se listan dentro de su ficha: un listado global de sedes sin decir de quién no se consulta nunca. |
| Sede de proveedor | Histórico | HISTORICAL_NOT_SUPPORTED | La sede no versiona. Lo que cambia con el tiempo son los alcances que la incluyen, y eso se lee en la decisión de aprobación del alcance, que sí conserva su versión. |
| Contacto de proveedor | Ficha | EMBEDDED | Dentro de *Proveedor evaluado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Contacto de proveedor | Listado | EMBEDDED | Dentro de *Proveedor evaluado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Contacto de proveedor | Histórico | EMBEDDED | Dentro de *Proveedor evaluado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Categoría de proveedor | Ficha | NOT_APPLICABLE | Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Categoría de proveedor | Histórico | HISTORICAL_NOT_SUPPORTED | El catálogo de categorías no versiona. Lo fechado es la ASIGNACIÓN de una categoría a un proveedor, que lleva su propio periodo y se imprime en la ficha. |
| Alcance de suministro | Ficha | EMBEDDED | Dentro de *Proveedor evaluado*. El alcance es la unidad sobre la que se clasifica, se evalúa y se decide; su ficha propia sería la del proveedor con una sola fila. Sus dos documentos con identidad —la criticidad y la decisión— sí existen aparte. |
| Alcance de suministro | Listado | EMBEDDED | Dentro de *Proveedor evaluado*. Los alcances se listan dentro de la ficha del proveedor al que pertenecen. |
| Criticidad de proveedor | Listado | EMBEDDED | Dentro de *Proveedor evaluado*. La criticidad de cada alcance se lee en la tabla de alcances de la ficha del proveedor. |
| Requisito a proveedores | Ficha | NOT_APPLICABLE | Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Requisito a proveedores | Histórico | HISTORICAL_NOT_SUPPORTED | El requisito no versiona; su asignación sí lleva periodo, y el listado la imprime con sus fechas de entrada y de retirada. |
| Documento de proveedor | Ficha | EMBEDDED | Dentro de *Proveedor evaluado*. Un certificado del proveedor es evidencia dentro de su ficha; el archivo original vive donde lo emitieron. |
| Documento de proveedor | Listado | EMBEDDED | Dentro de *Proveedor evaluado*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Documento de proveedor | Histórico | EMBEDDED | Dentro de *Evaluación de proveedor*. Qué evidencia sostuvo cada criterio queda escrito en la evaluación que la usó. |
| Plantilla de evaluación de proveedor | Ficha | EMBEDDED | Dentro de *Evaluación de proveedor*. Los criterios y los pesos se imprimen DENTRO de la evaluación que los usó: es la única forma de que el papel diga con qué se midió realmente. |
| Plantilla de evaluación de proveedor | Listado | EMBEDDED | Dentro de *Evaluación de proveedor*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plantilla de evaluación de proveedor | Histórico | EMBEDDED | Dentro de *Evaluación de proveedor*. La evaluación guarda la versión con la que se hizo, así que su PDF ya es el documento de esa versión. |
| Incidente de proveedor | Ficha | EMBEDDED | Dentro de *Proveedor evaluado*. Un incidente es un hecho anotado, no una no conformidad. Cuando merece tratamiento se abre un CASO, y el caso sí tiene su propio documento. |
| Incidente de proveedor | Listado | EMBEDDED | Dentro de *Desempeño de proveedor*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Incidente de proveedor | Histórico | EMBEDDED | Dentro de *Desempeño de proveedor*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Desempeño de proveedor | Listado | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Desempeño de proveedor | Histórico | HISTORICAL_NOT_SUPPORTED | El informe reúne las evaluaciones cerradas y los incidentes hasta hoy. Cada evaluación, por separado, sí es un documento del pasado con su propia versión de plantilla. |
| Reevaluación pendiente de proveedor | Ficha | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Reevaluación pendiente de proveedor | Histórico | HISTORICAL_NOT_SUPPORTED | Reconstruir qué estaba pendiente en una fecha pasada exigiría guardar cada fecha de revisión calculada, y el dominio no la guarda: la deriva de la última evaluación y de la cadencia vigentes. |
| Cliente del sistema de gestión | Histórico | HISTORICAL_NOT_SUPPORTED | La ficha reúne lo que el cliente ha dicho hasta hoy. Lo fechado son sus manifestaciones y sus respuestas, y cada una lleva su propio documento con su versión. |
| Contacto de cliente | Ficha | EMBEDDED | Dentro de *Cliente del sistema de gestión*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Contacto de cliente | Listado | EMBEDDED | Dentro de *Cliente del sistema de gestión*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Contacto de cliente | Histórico | EMBEDDED | Dentro de *Cliente del sistema de gestión*. El contacto puede cambiar sin que cambie nada de lo que la empresa dijo: la voz queda contra el cliente, no contra la persona. |
| Versión de encuesta | Listado | EMBEDDED | Dentro de *Encuesta de satisfacción*. Las versiones de una encuesta se listan dentro de su ficha: un listado global de versiones sin decir de qué encuesta no se consulta nunca. |
| Pregunta de encuesta | Ficha | EMBEDDED | Dentro de *Versión de encuesta*. La pregunta pertenece a la versión que la congela; fuera de ella no significa nada. |
| Pregunta de encuesta | Listado | EMBEDDED | Dentro de *Versión de encuesta*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Pregunta de encuesta | Histórico | EMBEDDED | Dentro de *Versión de encuesta*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Invitación a encuesta | Ficha | EMBEDDED | Dentro de *Campaña de satisfacción*. La invitación dice a quién se preguntó y si el enlace se usó. NO se imprime junto a las respuestas: cruzar las dos listas es exactamente lo que rompería el anonimato. |
| Invitación a encuesta | Listado | EMBEDDED | Dentro de *Campaña de satisfacción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Invitación a encuesta | Histórico | EMBEDDED | Dentro de *Campaña de satisfacción*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Respuesta identificada de encuesta | Listado | EMBEDDED | Dentro de *Campaña de satisfacción*. Las respuestas se leen dentro del informe de su campaña, agregadas. |
| Respuesta anónima de encuesta | Ficha | NOT_APPLICABLE | NO es documentable individualmente, y es deliberado: un papel con la fecha exacta y el contenido completo de una respuesta anónima es el primer paso para cruzarlo con la lista de invitaciones. Se publica agregada, dentro del informe de campaña. |
| Respuesta anónima de encuesta | Listado | EMBEDDED | Dentro de *Campaña de satisfacción*. Se publican agregadas y sin atribución, y solo cuando hay respuestas suficientes para que el desglose no reidentifique a nadie. |
| Respuesta anónima de encuesta | Histórico | NOT_APPLICABLE | Reconstruir una respuesta anónima como documento del pasado tendría el mismo problema que reconstruirla hoy. |
| Manifestación de cliente | Histórico | HISTORICAL_NOT_SUPPORTED | La manifestación conserva su fecha de recepción, pero su estado y su nota de resolución reflejan cómo está hoy la atención. Lo que sí es del pasado es el caso al que dio lugar. |
| Queja o reclamo de cliente | Histórico | HISTORICAL_NOT_SUPPORTED | Igual que cualquier manifestación: la fecha se conserva, el tratamiento es el de hoy. Y ninguno de estos documentos es un registro de no conformidad. |
| Tema de la voz del cliente | Ficha | EMBEDDED | Dentro de *Manifestación de cliente*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Tema de la voz del cliente | Listado | EMBEDDED | Dentro de *Manifestación de cliente*. El catálogo temático se lee dentro de la pantalla donde se usa. |
| Tema de la voz del cliente | Histórico | EMBEDDED | Dentro de *Manifestación de cliente*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Métrica de satisfacción | Ficha | EMBEDDED | Dentro de *Informe de satisfacción del cliente*. Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga. |
| Métrica de satisfacción | Listado | EMBEDDED | Dentro de *Informe de satisfacción del cliente*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Métrica de satisfacción | Histórico | EMBEDDED | Dentro de *Tendencia de la voz del cliente*. Lo fechado es cada RESULTADO, con su método congelado y su clave de comparabilidad. |
| Informe de satisfacción del cliente | Ficha | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Informe de satisfacción del cliente | Histórico | HISTORICAL_NOT_SUPPORTED | El informe consolida lo medido hasta hoy. El cierre formal de un periodo sí congela su retrato, y tiene su propio documento. |
| Tendencia de la voz del cliente | Ficha | NOT_APPLICABLE | Es una proyección de otros registros, no una entidad con identidad propia. |
| Tendencia de la voz del cliente | Histórico | HISTORICAL_NOT_SUPPORTED | La tendencia se compone con las mediciones que existen hoy. Cada medición, por separado, sí lleva su método y su periodo congelados. |
| Señal de la voz del cliente | Ficha | EMBEDDED | Dentro de *Informe de satisfacción del cliente*. Una señal invita a mirar; su valor está en el conjunto, no en una hoja por señal. |
| Señal de la voz del cliente | Listado | EMBEDDED | Dentro de *Informe de satisfacción del cliente*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Señal de la voz del cliente | Histórico | EMBEDDED | Dentro de *Cierre del periodo de satisfacción*. Cuántas señales había al cerrar el periodo queda congelado en el retrato del cierre. |
| Cierre del periodo de satisfacción | Listado | EMBEDDED | Dentro de *Informe de satisfacción del cliente*. Los cierres se listan dentro del resumen del dominio. |
| Programa de auditorías | Histórico | HISTORICAL_NOT_SUPPORTED | El programa se imprime como está hoy con sus revisiones listadas. Cada revisión guarda su propia foto, y es ahí donde se lee qué decía el programa antes. |
| Revisión del programa de auditorías | Ficha | EMBEDDED | Dentro de *Programa de auditorías*. Una revisión sola no se consulta: lo que se mira es cómo cambió el programa, y eso solo se ve en la lista completa. |
| Revisión del programa de auditorías | Listado | EMBEDDED | Dentro de *Programa de auditorías*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Revisión del programa de auditorías | Histórico | EMBEDDED | Dentro de *Programa de auditorías*. Cada revisión ES el documento del pasado del programa, y se imprime dentro de él. |
| Reprogramación de auditoría | Ficha | EMBEDDED | Dentro de *Auditoría*. Una reprogramación fuera de su auditoría no dice nada: su valor es que la fecha original se conserva al lado de la vigente. |
| Reprogramación de auditoría | Listado | EMBEDDED | Dentro de *Auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Reprogramación de auditoría | Histórico | EMBEDDED | Dentro de *Auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Plan de auditoría | Listado | EMBEDDED | Dentro de *Auditoría*. Un listado de planes sin decir de qué auditorías no se consulta nunca: el listado que la gente pide es el de auditorías, y desde ahí se abre el plan de cada una. |
| Plan de auditoría | Histórico | HISTORICAL_NOT_SUPPORTED | El plan se imprime como está hoy. Lo que se planificó originalmente se lee en la fecha original y en las reprogramaciones, que sí se conservan. |
| Elemento del alcance de auditoría | Ficha | EMBEDDED | Dentro de *Plan de auditoría*. El alcance es una lista: cada elemento suelto no es un documento. |
| Elemento del alcance de auditoría | Listado | EMBEDDED | Dentro de *Plan de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Elemento del alcance de auditoría | Histórico | EMBEDDED | Dentro de *Informe de auditoría*. El alcance auditado queda congelado en la instantánea del informe. |
| Criterio de auditoría | Ficha | EMBEDDED | Dentro de *Plan de auditoría*. El criterio dice contra qué se audita; fuera del plan no significa nada. |
| Criterio de auditoría | Listado | EMBEDDED | Dentro de *Plan de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Criterio de auditoría | Histórico | EMBEDDED | Dentro de *Informe de auditoría*. El informe guarda la REVISIÓN del documento que se auditó, no la de hoy. |
| Agenda de auditoría | Listado | EMBEDDED | Dentro de *Agenda de auditoría*. Las actividades se listan dentro de la agenda de su auditoría. |
| Agenda de auditoría | Histórico | HISTORICAL_NOT_SUPPORTED | La agenda es la intención. Lo que ocurrió de verdad está en el registro de ejecución, que es otra capa y se conserva aparte. |
| Equipo auditor | Ficha | EMBEDDED | Dentro de *Plan de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Equipo auditor | Listado | EMBEDDED | Dentro de *Plan de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Equipo auditor | Histórico | EMBEDDED | Dentro de *Informe de auditoría*. El informe congela el equipo de ENTONCES. Si alguien cambia de puesto después, el informe sigue diciendo quién auditó. |
| Comprobación de independencia | Ficha | EMBEDDED | Dentro de *Plan de auditoría*. Lo que importa no es cada conflicto por separado, sino el conjunto y qué se decidió sobre cada uno. |
| Comprobación de independencia | Listado | EMBEDDED | Dentro de *Plan de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Comprobación de independencia | Histórico | EMBEDDED | Dentro de *Plan de auditoría*. La comprobación ya se resuelve con los cargos de la FECHA de la auditoría: es histórica por construcción. |
| Checklist de auditoría | Listado | EMBEDDED | Dentro de *Checklist de auditoría*. El documento del checklist imprime TODAS sus versiones: un listado aparte diría menos y se desactualizaría igual. |
| Pregunta de checklist de auditoría | Ficha | EMBEDDED | Dentro de *Checklist de auditoría*. La pregunta pertenece a la versión que la congela; fuera de ella no significa nada. |
| Pregunta de checklist de auditoría | Listado | EMBEDDED | Dentro de *Checklist de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Pregunta de checklist de auditoría | Histórico | EMBEDDED | Dentro de *Checklist de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Registro de ejecución de auditoría | Listado | EMBEDDED | Dentro de *Auditoría*. Lo que la gente lista son auditorías; el registro se abre por auditoría. |
| Registro de ejecución de auditoría | Histórico | HISTORICAL_NOT_SUPPORTED | El registro se imprime como está hoy. El documento congelado de la auditoría es su informe, que sí guarda su instantánea. |
| Nota de auditoría | Ficha | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. Una nota de trabajo suelta no es un documento, y sacarla del registro invitaría a tratarla como si fuera evidencia. |
| Nota de auditoría | Listado | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Nota de auditoría | Histórico | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Muestra de auditoría | Ficha | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. La muestra dice qué se revisó y de cuánto; su sentido está junto a lo que se encontró. |
| Muestra de auditoría | Listado | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Muestra de auditoría | Histórico | EMBEDDED | Dentro de *Informe de auditoría*. Las muestras quedan congeladas en la instantánea del informe. |
| Evidencia de auditoría | Ficha | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. La evidencia de auditoría es una REFERENCIA a algo que ya existe y ya tiene su propio documento. Un PDF por referencia sería una copia de una copia. |
| Evidencia de auditoría | Listado | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Evidencia de auditoría | Histórico | EMBEDDED | Dentro de *Registro de ejecución de auditoría*. Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre. |
| Hallazgo de auditoría | Histórico | EMBEDDED | Dentro de *Informe de auditoría*. El informe congela los hallazgos tal como estaban al emitirlo, con la clasificación que se les había propuesto entonces. |
| Informe de auditoría | Listado | EMBEDDED | Dentro de *Auditoría*. Los informes de una auditoría se listan dentro de ella: un listado global de informes sin decir de qué auditoría no se consulta. |
| Seguimiento de auditorías | Ficha | EMBEDDED | Dentro de *Seguimiento de auditorías*. El seguimiento es, por naturaleza, un listado: qué quedó abierto en TODAS las auditorías. |
| Seguimiento de auditorías | Histórico | HISTORICAL_NOT_SUPPORTED | El seguimiento es la situación de hoy. Lo que quedaba abierto en un momento dado se lee en el informe de esa fecha, que lo guarda. |
