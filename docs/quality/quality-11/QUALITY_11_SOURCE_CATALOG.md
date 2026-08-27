# QUALITY-11 · El catálogo observable

**18 fuentes · 70 campos.** Es lo único que una regla puede mirar, y está
escrito en la base. El navegador elige un **código** de esta lista; nunca manda
una tabla, una columna, un `where` ni una expresión.

## Por qué es un catálogo y no un constructor de consultas

Un constructor de consultas con formulario es un motor de SQL arbitrario con
otra cara. Bastaría con que un día alguien concatenara el nombre de una columna
recibida del cliente para que el sistema entero pasara a depender de la
sanitización. Un catálogo tipado no tiene ese día: el campo o está en la lista o
no existe, y el operador o está permitido para ese campo o se rechaza antes de
publicar.

## Las 18 fuentes

| Fuente | Dominio | Sujeto | Campos |
|---|---|---|---|
| `document_revision` | documents | revisión de documento | `effective_from` · `review_due_on` · `workflow_state` |
| `indicator` | indicators | indicador | `last_evaluation` · `last_value` · `target_value` · `measurement_pending` · `next_measurement_due_on` · `evaluation_series_out_of_target` · `value_series` |
| `objective` | objectives | objetivo | `indicators_without_data` · `indicators_not_met` · `admin_state` · `period_end` |
| `case` | cases | caso | `status` · `classification` · `detected_on` · `open_action_count` |
| `action` | actions | acción | `due_on` · `status` · `effectiveness_result` · `completed_on` · `action_kind` |
| `risk` | risks | riesgo | `next_review_on` · `current_level` · `current_is_acceptable` · `treatment_status` · `treatment_review_on` · `overdue_action_count` |
| `control` | risks | control | `status` · `last_verified_on` |
| `opportunity` | risks | oportunidad | `status` · `treatment_decision` · `identified_on` |
| `competency_evidence` | people | evidencia de competencia | `valid_until` · `status` |
| `performance_evaluation` | people | evaluación de desempeño | `status` · `cycle_period_end` |
| `knowledge_item` | people | conocimiento | `criticality` · `holder_count` · `continuity_attention` |
| `supplier_scope` | suppliers | alcance de proveedor | `next_review_on` · `criticality_label` · `approval_status` · `approval_valid_until` · `open_incident_count` |
| `customer_feedback` | customer | retroalimentación | `received_on` · `status` · `feedback_kind` · `severity` |
| `customer_metric` | customer | campaña (métrica) | `value` · `previous_value` · `delta` · `sample_size` · `breaks_comparability` |
| `audit` | audits | auditoría | `scheduled_from` · `scheduled_to` · `status` · `executed_to` · `report_issued` |
| `audit_finding` | audits | hallazgo | `evaluation_status` · `raised_on` · `proposed_classification` |
| `management_review` | management_review | revisión | `next_review_planned_on` · `period_end` · `status` · `inputs_pending` |
| `management_review_input` | management_review | entrada de la revisión | `state` · `source_updated` · `input_mode` |

## Los seis tipos de campo

| Tipo | Operadores que admite |
|---|---|
| `text` | `equals` · `not_equals` · `in` · `not_in` · `is_empty` · `is_not_empty` |
| `number` | `greater_than` · `less_than` · `gte` · `lte` · `equals` · `is_empty` · `is_not_empty` |
| `date` | `days_before` · `days_after` · `is_empty` · `is_not_empty` |
| `boolean` | `equals` |
| `bool_series` | `consecutive_count` |
| `number_series` | `strictly_decreasing` |

Cada campo declara **su** lista, que puede ser más estrecha que la del tipo: la
fecha de ejecución de una auditoría admite `days_after` pero no `days_before`,
porque «se ejecutará dentro de N días» no significa nada sobre algo que ya
ocurrió.

## La ausencia deliberada

**Ninguna fuente observa `work_tasks`, `work_alerts`, `quality_signals` ni
`quality_automation_runs`.** No es un olvido: es lo que hace estructuralmente
imposible que una regla reaccione a lo que otra regla produjo.

## Lo que el catálogo NO deja observar

Ni un correo, ni un teléfono, ni un documento de identidad, ni un salario, ni
una fecha de nacimiento, ni una respuesta de encuesta, ni una invitación. La
prueba N4 lo comprueba campo a campo sobre la siembra del catálogo.
