# QUALITY-11 · Cobertura por dominio

## 1 · Los diez dominios, cubiertos

| Dominio | Fuente(s) | Qué se puede observar hoy | Plantilla lista |
|---|---|---|---|
| Documentos | `document_revision` | entrada en vigor próxima · revisión vencida · estado del flujo | `document_revision_effective_soon` |
| Indicadores | `indicator` | fuera de meta · N periodos seguidos · tendencia descendente · medición pendiente · próxima medición | `indicator_out_of_target` · `indicator_consecutive_out_of_target` · `indicator_strictly_decreasing` |
| Objetivos | `objective` | indicadores sin dato · indicadores incumplidos · fin de periodo | `objective_indicators_without_data` |
| Casos | `case` | estado · clasificación · antigüedad · acciones abiertas | — |
| Acciones | `action` | vence pronto · vencida · eficacia pendiente | `action_due_soon` · `action_effectiveness_due` |
| Riesgos | `risk` · `control` · `opportunity` | revisión vencida · tratamiento vencido · nivel · control sin verificar · oportunidad sin decisión | `risk_treatment_overdue` |
| Personas | `competency_evidence` · `performance_evaluation` · `knowledge_item` | evidencia que caduca · evaluación pendiente · conocimiento crítico con un solo titular | `competency_evidence_expiring_window` · `knowledge_single_holder_critical` |
| Proveedores | `supplier_scope` | reevaluación vencida · criticidad · aprobación caducada · incidencias abiertas | `supplier_critical_reevaluation_overdue` |
| Voz del cliente | `customer_feedback` · `customer_metric` | queja sin atender · deterioro de la métrica · muestra pequeña | `customer_metric_deterioration` |
| Auditorías | `audit` · `audit_finding` | programada sin ejecutar · informe sin emitir · hallazgo sin evaluar | `audit_finding_awaiting_assessment_window` |
| Revisión por la dirección | `management_review` · `management_review_input` | entradas pendientes · entrada sin datos · fuente actualizada · próxima revisión | `management_review_source_updated` |

## 2 · La regla que cruza dos dominios

`supplier_critical_reevaluation_overdue` mira la **criticidad** —que sale de la
metodología de riesgos de QUALITY-05, aplicada al proveedor en QUALITY-07— y la
**fecha de reevaluación** —que sale de la última evaluación cerrada y de la
cadencia que impone su nivel de criticidad—. Ninguno de los dos datos es nuevo:
lo nuevo es cruzarlos.

Cruzar dos dominios es lo que convierte dos datos ciertos en una prioridad. Un
proveedor con la reevaluación vencida es una tarea administrativa; un proveedor
**crítico** con la reevaluación vencida es un riesgo operativo.

Y la explicación lo dice entero: «Criticidad está entre los valores buscados
(valor: Crítico)» **y** «Próxima reevaluación (18/02/2026) pasó hace 0 días o
más». Comprobado ejecutándolo contra datos reales, con la aprobación del
proveedor intacta antes y después (escenario 4).

## 3 · Escenarios verificados contra base real

| # | Escenario | Verificado |
|---|---|---|
| 1 | indicador · tres periodos seguidos fuera de meta | señal + aviso + tarea · repetición: 0 nuevos |
| 2 | recuperación | la señal se cierra sola · la tarea sigue abierta · 0 acciones |
| 3 | reaparición | señal **nueva**, contador a 1 |
| 4 | proveedor crítico con reevaluación vencida | señal · aprobación intacta · segundo barrido: 0 duplicados |
| 5 | certificado que caduca mañana | señal · nivel y estado de competencia intactos |
| 6 | queja de 45 días sin atender | señal + tarea · **0 no conformidades** |
| 7 | auditoría programada sin ejecutar | señal · estado de la auditoría intacto |
| 8 | entrada de la revisión sin datos | señal · estado de la revisión intacto |
| 9 | simulación | 4 coincidencias · 0 señales · 0 avisos · 0 tareas |
| 10 | v1 → v2 | la señal vieja sigue apuntando a la v1 y con su título |
| 11 | dos barridos simultáneos | una sola señal abierta |
| 12 | reintento tras fallo a medias | 0 señales nuevas · la tarea que faltaba, una vez |
| 13 | bucle | cinco barridos seguidos: 0 tareas de más |
| 14 | multiempresa | B no ve, no ejecuta y no simula lo de A · y al revés |
| 15 | campaña anónima | señal con la métrica · fuga de identidad = 0 |

## 4 · Lo que NO se observa, y por qué

- **Tareas, avisos, señales y ejecuciones** — para que el bucle sea imposible.
- **Datos personales** — correo, teléfono, documento, salario, nacimiento.
- **Respuestas de encuesta** — solo agregados por campaña.
- **Desempeño de personas** — solo vencimientos de evidencias del SGC.
